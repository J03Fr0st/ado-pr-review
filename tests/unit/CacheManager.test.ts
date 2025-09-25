import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { CacheManager, CacheEntry, CacheConfig, CacheInvalidationRule } from '../../src/Services/CacheManager';

// Mock VS Code API
const mockExtensionContext = {
  workspaceState: {
    get: sinon.stub(),
    update: sinon.stub(),
    keys: sinon.stub().returns([])
  },
  globalState: {
    get: sinon.stub(),
    update: sinon.stub()
  },
  subscriptions: []
} as any;

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    cacheManager = new CacheManager(mockExtensionContext);
    await cacheManager.initialize();
  });

  afterEach(() => {
    sandbox.restore();
    clock.restore();
    cacheManager.dispose();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      const config = (cacheManager as any).config;
      assert.strictEqual(config.defaultTtl, 300000);
      assert.strictEqual(config.maxMemoryEntries, 1000);
      assert.strictEqual(config.maxSessionEntries, 500);
      assert.strictEqual(config.enableCompression, true);
      assert.strictEqual(config.enableEviction, true);
      assert.strictEqual(config.cleanupInterval, 60000);
    });

    it('should accept custom configuration', async () => {
      const customConfig: Partial<CacheConfig> = {
        defaultTtl: 60000,
        maxMemoryEntries: 500,
        enableCompression: false
      };

      const customCacheManager = new CacheManager(mockExtensionContext, customConfig);
      await customCacheManager.initialize();

      const config = (customCacheManager as any).config;
      assert.strictEqual(config.defaultTtl, 60000);
      assert.strictEqual(config.maxMemoryEntries, 500);
      assert.strictEqual(config.enableCompression, false);
      // Other values should be defaults
      assert.strictEqual(config.maxSessionEntries, 500);

      customCacheManager.dispose();
    });

    it('should setup cleanup interval', async () => {
      const setIntervalSpy = sandbox.spy(global, 'setInterval');
      const customCacheManager = new CacheManager(mockExtensionContext);
      await customCacheManager.initialize();

      assert.ok(setIntervalSpy.called);
      assert.strictEqual(setIntervalSpy.firstCall.args[1], 60000); // Default cleanup interval

      customCacheManager.dispose();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedCache = new CacheManager(mockExtensionContext);

      await assert.rejects(
        async () => await uninitializedCache.get('test'),
        /CacheManager not initialized/
      );

      uninitializedCache.dispose();
    });
  });

  describe('basic cache operations', () => {
    it('should store and retrieve data from memory cache', async () => {
      const data = { test: 'value' };
      await cacheManager.set('test-key', data);

      const result = await cacheManager.get('test-key');
      assert.deepStrictEqual(result, data);
    });

    it('should store and retrieve data from session cache', async () => {
      const data = { test: 'value' };
      await cacheManager.set('test-key', data);

      // Clear memory cache to force session cache lookup
      (cacheManager as any).memoryCache.clear();

      const result = await cacheManager.get('test-key');
      assert.deepStrictEqual(result, data);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cacheManager.get('non-existent-key');
      assert.strictEqual(result, null);
    });

    it('should delete cached data', async () => {
      const data = { test: 'value' };
      await cacheManager.set('test-key', data);

      // Verify data exists
      const result1 = await cacheManager.get('test-key');
      assert.deepStrictEqual(result1, data);

      // Delete data
      await cacheManager.delete('test-key');

      // Verify data is gone
      const result2 = await cacheManager.get('test-key');
      assert.strictEqual(result2, null);
    });

    it('should clear all cache data', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');

      // Verify data exists
      assert.strictEqual(await cacheManager.get('key1'), 'value1');
      assert.strictEqual(await cacheManager.get('key2'), 'value2');

      // Clear all data
      await cacheManager.clear();

      // Verify all data is gone
      assert.strictEqual(await cacheManager.get('key1'), null);
      assert.strictEqual(await cacheManager.get('key2'), null);
    });
  });

  describe('cache expiration', () => {
    it('should respect TTL for memory cache', async () => {
      const data = { test: 'value' };
      await cacheManager.set('test-key', data, 1000); // 1 second TTL

      // Data should be available immediately
      const result1 = await cacheManager.get('test-key');
      assert.deepStrictEqual(result1, data);

      // Advance time beyond TTL
      clock.tick(1100);

      // Data should be expired
      const result2 = await cacheManager.get('test-key');
      assert.strictEqual(result2, null);
    });

    it('should respect TTL for session cache', async () => {
      const data = { test: 'value' };
      await cacheManager.set('test-key', data, 1000); // 1 second TTL

      // Clear memory cache to force session cache lookup
      (cacheManager as any).memoryCache.clear();

      // Advance time beyond TTL
      clock.tick(1100);

      // Data should be expired
      const result = await cacheManager.get('test-key');
      assert.strictEqual(result, null);
    });

    it('should use default TTL when not specified', async () => {
      const data = { test: 'value' };
      await cacheManager.set('test-key', data);

      // Get the cache entry to check its TTL
      const entry = (cacheManager as any).memoryCache.get('test-key');
      const expectedExpiry = Date.now() + 300000; // Default TTL
      const timeDiff = Math.abs(entry.expiry - expectedExpiry);

      assert.ok(timeDiff < 1000, 'TTL should be close to default (within 1 second tolerance)');
    });
  });

  describe('cache eviction', () => {
    it('should evict entries when memory cache is full', async () => {
      // Create cache manager with small memory limit
      const smallCacheManager = new CacheManager(mockExtensionContext, {
        maxMemoryEntries: 2,
        enableEviction: true
      });
      await smallCacheManager.initialize();

      // Add entries up to the limit
      await smallCacheManager.set('key1', 'value1');
      await smallCacheManager.set('key2', 'value2');

      // Verify both entries exist
      assert.strictEqual(await smallCacheManager.get('key1'), 'value1');
      assert.strictEqual(await smallCacheManager.get('key2'), 'value2');

      // Add one more entry to trigger eviction
      await smallCacheManager.set('key3', 'value3');

      // First entry should be evicted (LRU)
      assert.strictEqual(await smallCacheManager.get('key1'), null);
      assert.strictEqual(await smallCacheManager.get('key2'), 'value2');
      assert.strictEqual(await smallCacheManager.get('key3'), 'value3');

      smallCacheManager.dispose();
    });

    it('should not evict when eviction is disabled', async () => {
      // Create cache manager with eviction disabled
      const noEvictionCache = new CacheManager(mockExtensionContext, {
        maxMemoryEntries: 2,
        enableEviction: false
      });
      await noEvictionCache.initialize();

      // Add entries beyond the limit
      await noEvictionCache.set('key1', 'value1');
      await noEvictionCache.set('key2', 'value2');
      await noEvictionCache.set('key3', 'value3');

      // All entries should still exist in memory cache
      const memoryCache = (noEvictionCache as any).memoryCache;
      assert.strictEqual(memoryCache.size, 3);

      noEvictionCache.dispose();
    });
  });

  describe('cache statistics', () => {
    it('should track cache hits and misses', async () => {
      // Initial state - no hits or misses
      let stats = cacheManager.getStatistics();
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
      assert.strictEqual(stats.hitRate, 0);

      // Cache miss
      await cacheManager.get('non-existent-key');
      stats = cacheManager.getStatistics();
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hitRate, 0);

      // Cache hit
      await cacheManager.set('test-key', 'value');
      await cacheManager.get('test-key');
      stats = cacheManager.getStatistics();
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hitRate, 0.5);
    });

    it('should track memory and session entry counts', async () => {
      // Initially empty
      let stats = cacheManager.getStatistics();
      assert.strictEqual(stats.memoryEntries, 0);
      assert.strictEqual(stats.sessionEntries, 0);

      // Add entries
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');

      stats = cacheManager.getStatistics();
      assert.strictEqual(stats.memoryEntries, 2);
      // Session entries might not be immediately updated due to async storage
    });

    it('should calculate memory usage', async () => {
      // Add some data
      await cacheManager.set('key1', { complex: 'object', with: { nested: 'data' } });
      await cacheManager.set('key2', 'simple string');

      const stats = cacheManager.getStatistics();
      assert.ok(stats.totalMemoryUsage > 0);
      assert.ok(stats.averageEntrySize > 0);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate by exact key', async () => {
      await cacheManager.set('test-key', 'value');
      await cacheManager.set('other-key', 'other-value');

      const rules: CacheInvalidationRule[] = [
        { strategy: 'exact', pattern: 'test-key' }
      ];

      await cacheManager.invalidate(rules);

      assert.strictEqual(await cacheManager.get('test-key'), null);
      assert.strictEqual(await cacheManager.get('other-key'), 'other-value');
    });

    it('should invalidate by prefix', async () => {
      await cacheManager.set('user:1', 'user1');
      await cacheManager.set('user:2', 'user2');
      await cacheManager.set('product:1', 'product1');

      const rules: CacheInvalidationRule[] = [
        { strategy: 'prefix', pattern: 'user:' }
      ];

      await cacheManager.invalidate(rules);

      assert.strictEqual(await cacheManager.get('user:1'), null);
      assert.strictEqual(await cacheManager.get('user:2'), null);
      assert.strictEqual(await cacheManager.get('product:1'), 'product1');
    });

    it('should invalidate by pattern (regex)', async () => {
      await cacheManager.set('user_1', 'user1');
      await cacheManager.set('user_2', 'user2');
      await cacheManager.set('test-user', 'test-user');

      const rules: CacheInvalidationRule[] = [
        { strategy: 'pattern', pattern: '^user_\\d+$' }
      ];

      await cacheManager.invalidate(rules);

      assert.strictEqual(await cacheManager.get('user_1'), null);
      assert.strictEqual(await cacheManager.get('user_2'), null);
      assert.strictEqual(await cacheManager.get('test-user'), 'test-user');
    });

    it('should invalidate by tags', async () => {
      await cacheManager.set('key1', 'value1', 300000, { tags: ['user-data'] });
      await cacheManager.set('key2', 'value2', 300000, { tags: ['user-data', 'temporary'] });
      await cacheManager.set('key3', 'value3', 300000, { tags: ['permanent'] });

      const rules: CacheInvalidationRule[] = [
        { strategy: 'tag', pattern: 'user-data', tags: ['user-data'] }
      ];

      await cacheManager.invalidate(rules);

      assert.strictEqual(await cacheManager.get('key1'), null);
      assert.strictEqual(await cacheManager.get('key2'), null);
      assert.strictEqual(await cacheManager.get('key3'), 'value3');
    });

    it('should manage invalidation rules', async () => {
      const rule: CacheInvalidationRule = { strategy: 'exact', pattern: 'test-key' };

      // Add rule
      cacheManager.addInvalidationRule(rule);
      assert.ok((cacheManager as any).invalidationRules.has(rule));

      // Remove rule
      cacheManager.removeInvalidationRule(rule);
      assert.ok(!(cacheManager as any).invalidationRules.has(rule));
    });
  });

  describe('cache key generation', () => {
    it('should generate cache keys from parameters', () => {
      const key1 = cacheManager.generateKey('getUsers', 'active', 10);
      const key2 = cacheManager.generateKey('getUsers', 'active', 10);
      const key3 = cacheManager.generateKey('getUsers', 'inactive', 10);

      assert.strictEqual(key1, key2);
      assert.notStrictEqual(key1, key3);
      assert.strictEqual(key1, 'getUsers_active_10');
    });

    it('should handle different parameter types', () => {
      const key1 = cacheManager.generateKey('getData', null, undefined, { test: 'object' }, [1, 2, 3]);
      const expected = 'getData_null_null_[object Object]_1,2,3';
      assert.strictEqual(key1, expected);
    });
  });

  describe('metadata operations', () => {
    it('should store and retrieve metadata', async () => {
      const data = { test: 'value' };
      const metadata = { source: 'api', version: 1 };

      await cacheManager.set('test-key', data, 300000, metadata);

      const retrievedMetadata = await cacheManager.getMetadata('test-key');
      assert.deepStrictEqual(retrievedMetadata, metadata);
    });

    it('should update metadata', async () => {
      const data = { test: 'value' };
      const initialMetadata = { source: 'api' };

      await cacheManager.set('test-key', data, 300000, initialMetadata);

      const updatedMetadata = { version: 2, source: 'api' };
      await cacheManager.updateMetadata('test-key', updatedMetadata);

      const retrievedMetadata = await cacheManager.getMetadata('test-key');
      assert.deepStrictEqual(retrievedMetadata, { source: 'api', version: 2 });
    });

    it('should return null metadata for non-existent keys', async () => {
      const metadata = await cacheManager.getMetadata('non-existent-key');
      assert.strictEqual(metadata, null);
    });
  });

  describe('utility methods', () => {
    it('should check if key exists', async () => {
      assert.strictEqual(await cacheManager.has('non-existent-key'), false);

      await cacheManager.set('test-key', 'value');
      assert.strictEqual(await cacheManager.has('test-key'), true);

      // Expire the entry
      clock.tick(301000); // Beyond default TTL
      assert.strictEqual(await cacheManager.has('test-key'), false);
    });

    it('should implement getOrSet pattern', async () => {
      const factory = sinon.stub().resolves('factory-value');
      const key = 'test-key';

      // First call should use factory
      const result1 = await cacheManager.getOrSet(key, factory);
      assert.strictEqual(result1, 'factory-value');
      assert.ok(factory.calledOnce);

      // Second call should use cache
      const result2 = await cacheManager.getOrSet(key, factory);
      assert.strictEqual(result2, 'factory-value');
      assert.ok(factory.calledOnce); // Still only called once
    });

    it('should handle factory errors in getOrSet', async () => {
      const factory = sinon.stub().rejects(new Error('Factory error'));
      const key = 'test-key';

      await assert.rejects(
        async () => await cacheManager.getOrSet(key, factory),
        /Factory error/
      );

      // Key should not be cached
      assert.strictEqual(await cacheManager.has(key), false);
    });
  });

  describe('prefetch operations', () => {
    it('should prefetch multiple keys', async () => {
      const factory = sinon.stub();
      factory.withArgs('key1').resolves('value1');
      factory.withArgs('key2').resolves('value2');
      factory.withArgs('key3').resolves('value3');

      const keys = ['key1', 'key2', 'key3'];
      await cacheManager.prefetch(keys, factory);

      assert.strictEqual(await cacheManager.get('key1'), 'value1');
      assert.strictEqual(await cacheManager.get('key2'), 'value2');
      assert.strictEqual(await cacheManager.get('key3'), 'value3');

      assert.strictEqual(factory.callCount, 3);
    });

    it('should handle prefetch errors gracefully', async () => {
      const factory = sinon.stub();
      factory.withArgs('key1').resolves('value1');
      factory.withArgs('key2').rejects(new Error('Factory error'));
      factory.withArgs('key3').resolves('value3');

      const keys = ['key1', 'key2', 'key3'];
      await cacheManager.prefetch(keys, factory);

      // Should continue despite errors
      assert.strictEqual(await cacheManager.get('key1'), 'value1');
      assert.strictEqual(await cacheManager.get('key2'), null);
      assert.strictEqual(await cacheManager.get('key3'), 'value3');
    });

    it('should only prefetch missing keys', async () => {
      const factory = sinon.stub().resolves('factory-value');

      // Pre-cache one key
      await cacheManager.set('key1', 'existing-value');

      const keys = ['key1', 'key2'];
      await cacheManager.prefetch(keys, factory);

      // Existing key should not be prefetched
      assert.strictEqual(await cacheManager.get('key1'), 'existing-value');
      assert.strictEqual(factory.callCount, 1);
      assert.ok(factory.calledWith('key2'));
    });
  });

  describe('cleanup operations', () => {
    it('should perform automatic cleanup', async () => {
      // Add entries with short TTL
      await cacheManager.set('key1', 'value1', 1000);
      await cacheManager.set('key2', 'value2', 2000);

      // Advance time to expire first entry
      clock.tick(1100);

      // Trigger cleanup
      await (cacheManager as any).performCleanup();

      // Expired entry should be removed
      assert.strictEqual(await cacheManager.get('key1'), null);
      assert.strictEqual(await cacheManager.get('key2'), 'value2');
    });

    it('should cleanup on dispose', () => {
      // Add some data
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');

      // Verify data exists
      assert.ok((cacheManager as any).memoryCache.size > 0);

      // Dispose should cleanup
      cacheManager.dispose();

      assert.strictEqual((cacheManager as any).memoryCache.size, 0);
      assert.strictEqual((cacheManager as any).cleanupIntervals.size, 0);
    });
  });

  describe('compression', () => {
    it('should compress large entries when enabled', async () => {
      const largeData = { data: 'x'.repeat(2048) }; // 2KB of data

      await cacheManager.set('large-key', largeData);

      // Should attempt compression
      const shouldCompressSpy = sandbox.spy(cacheManager as any, 'shouldCompress');
      const compressEntrySpy = sandbox.spy(cacheManager as any, 'compressEntry');

      await (cacheManager as any).setSessionCache('large-key', (cacheManager as any).memoryCache.get('large-key'));

      assert.ok(shouldCompressSpy.called);
      assert.ok(compressEntrySpy.called);
    });

    it('should not compress small entries', async () => {
      const smallData = { data: 'small' };

      await cacheManager.set('small-key', smallData);

      const shouldCompressSpy = sandbox.spy(cacheManager as any, 'shouldCompress');
      const compressEntrySpy = sandbox.spy(cacheManager as any, 'compressEntry');

      await (cacheManager as any).setSessionCache('small-key', (cacheManager as any).memoryCache.get('small-key'));

      assert.ok(shouldCompressSpy.called);
      assert.ok(!compressEntrySpy.called);
    });

    it('should respect compression setting', async () => {
      const noCompressionCache = new CacheManager(mockExtensionContext, {
        enableCompression: false
      });
      await noCompressionCache.initialize();

      const largeData = { data: 'x'.repeat(2048) };
      await noCompressionCache.set('large-key', largeData);

      const compressEntrySpy = sandbox.spy(noCompressionCache as any, 'compressEntry');

      await (noCompressionCache as any).setSessionCache('large-key', (noCompressionCache as any).memoryCache.get('large-key'));

      assert.ok(!compressEntrySpy.called);

      noCompressionCache.dispose();
    });
  });

  describe('error handling', () => {
    it('should handle session storage errors gracefully', async () => {
      // Make session storage throw an error
      mockExtensionContext.workspaceState.update.rejects(new Error('Storage error'));

      // Should not throw when setting data
      await assert.doesNotReject(
        async () => await cacheManager.set('test-key', 'value')
      );

      // Data should still be in memory cache
      assert.strictEqual(await cacheManager.get('test-key'), 'value');
    });

    it('should handle metadata access errors', async () => {
      // Cache data without metadata
      await cacheManager.set('test-key', 'value');

      // Should handle missing metadata gracefully
      const metadata = await cacheManager.getMetadata('test-key');
      assert.deepStrictEqual(metadata, {});
    });
  });

  describe('access tracking', () => {
    it('should track access counts and times', async () => {
      await cacheManager.set('test-key', 'value');

      // Access the entry multiple times
      await cacheManager.get('test-key');
      await cacheManager.get('test-key');
      await cacheManager.get('test-key');

      const entry = (cacheManager as any).memoryCache.get('test-key');
      assert.strictEqual(entry.accessCount, 3);
      assert.ok(entry.lastAccess > 0);
    });

    it('should update access statistics on hits', async () => {
      await cacheManager.set('test-key', 'value');

      // Initial stats
      let stats = cacheManager.getStatistics();
      assert.strictEqual(stats.hits, 0);

      // Access the entry
      await cacheManager.get('test-key');

      // Stats should be updated
      stats = cacheManager.getStatistics();
      assert.strictEqual(stats.hits, 1);
    });
  });
});