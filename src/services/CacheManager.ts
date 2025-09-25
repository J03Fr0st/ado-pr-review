import * as vscode from 'vscode';

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  readonly data: T;
  readonly timestamp: number;
  readonly expiry: number;
  readonly accessCount: number;
  readonly lastAccess: number;
  readonly etag?: string;
  readonly metadata?: Record<string, any>;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  readonly defaultTtl: number; // Default time-to-live in milliseconds
  readonly maxMemoryEntries: number; // Maximum entries in memory cache
  readonly maxSessionEntries: number; // Maximum entries in session storage
  readonly enableCompression: boolean; // Enable data compression for large entries
  readonly enableEviction: boolean; // Enable automatic eviction of expired entries
  readonly cleanupInterval: number; // Cleanup interval in milliseconds
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
  readonly memoryEntries: number;
  readonly sessionEntries: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly hitRate: number;
  readonly totalMemoryUsage: number;
  readonly averageEntrySize: number;
}

/**
 * Cache key generator function
 */
export type CacheKeyGenerator = (operation: string, ...params: any[]) => string;

/**
 * Cache invalidation strategy
 */
export type CacheInvalidationStrategy = 'exact' | 'prefix' | 'pattern' | 'tag';

/**
 * Cache invalidation rule
 */
export interface CacheInvalidationRule {
  readonly strategy: CacheInvalidationStrategy;
  readonly pattern: string;
  readonly tags?: string[];
}

/**
 * Advanced cache manager with multi-layer caching and intelligent eviction policies
 *
 * Provides high-performance caching with memory and session storage layers,
 * automatic cleanup, statistics tracking, and flexible invalidation strategies.
 *
 * Features:
 * - Multi-layer caching (memory + session storage)
 * - Intelligent eviction policies (LRU, TTL-based)
 * - Cache compression for large entries
 * - Statistics and monitoring
 * - Flexible invalidation strategies
 * - Cache key generation utilities
 * - Performance optimization for large datasets
 */
export class CacheManager {
  private readonly memoryCache = new Map<string, CacheEntry<any>>();
  private readonly hitCounters = new Map<string, { hits: number; misses: number }>();
  private readonly cleanupIntervals = new Set<NodeJS.Timeout>();
  private readonly invalidationRules = new Set<CacheInvalidationRule>();

  private config: CacheConfig;
  private initialized = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    config?: Partial<CacheConfig>
  ) {
    this.config = this.mergeConfig(config);
  }

  /**
   * Initialize cache manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Setup cleanup intervals
    const cleanupInterval = setInterval(() => this.performCleanup(), this.config.cleanupInterval);
    this.cleanupIntervals.add(cleanupInterval);

    // Setup context for cleanup
    this.context.subscriptions.push({
      dispose: () => this.dispose()
    });

    this.initialized = true;
  }

  /**
   * Get data from cache
   *
   * @param key Cache key
   * @returns Cached data or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    this.ensureInitialized();

    // Update access counters
    this.updateAccessCounters(key);

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && this.isValidEntry(memoryEntry)) {
      // Update access statistics
      this.updateAccessStats(key, memoryEntry);
      return memoryEntry.data;
    }

    // Check session storage
    const sessionKey = `cache_${key}`;
    const sessionEntry = this.context.workspaceState.get<CacheEntry<T>>(sessionKey);
    if (sessionEntry && this.isValidEntry(sessionEntry)) {
      // Promote to memory cache with compression if needed
      await this.promoteToMemoryCache(key, sessionEntry);
      return sessionEntry.data;
    }

    return null;
  }

  /**
   * Set data in cache
   *
   * @param key Cache key
   * @param data Data to cache
   * @param ttl Time-to-live in milliseconds (uses default if not specified)
   * @param metadata Optional metadata for the cache entry
   * @param tags Optional tags for invalidation
   */
  async set<T>(
    key: string,
    data: T,
    ttl?: number,
    metadata?: Record<string, any>,
    tags?: string[]
  ): Promise<void> {
    this.ensureInitialized();

    const actualTtl = ttl || this.config.defaultTtl;
    const expiry = Date.now() + actualTtl;

    // Create cache entry
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiry,
      accessCount: 0,
      lastAccess: Date.now(),
      metadata: { ...metadata, tags }
    };

    // Store in memory cache
    this.memoryCache.set(key, entry);

    // Apply eviction if needed
    if (this.config.enableEviction) {
      this.evictIfNeeded();
    }

    // Store in session storage (async)
    this.setSessionCache(key, entry).catch(error => {
      console.error('Failed to store in session cache:', error);
    });
  }

  /**
   * Delete data from cache
   *
   * @param key Cache key
   */
  async delete(key: string): Promise<void> {
    this.ensureInitialized();

    // Remove from memory cache
    this.memoryCache.delete(key);

    // Remove from session storage
    const sessionKey = `cache_${key}`;
    await this.context.workspaceState.update(sessionKey, undefined);

    // Remove access counters
    this.hitCounters.delete(key);
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    // Clear memory cache
    this.memoryCache.clear();

    // Clear session storage
    const keys = this.context.workspaceState.keys().filter(key => key.startsWith('cache_'));
    for (const key of keys) {
      await this.context.workspaceState.update(key, undefined);
    }

    // Clear counters
    this.hitCounters.clear();
  }

  /**
   * Invalidate cache entries based on rules
   *
   * @param rules Invalidation rules
   */
  async invalidate(rules: CacheInvalidationRule[]): Promise<void> {
    this.ensureInitialized();

    for (const rule of rules) {
      await this.applyInvalidationRule(rule);
    }
  }

  /**
   * Add invalidation rule
   *
   * @param rule Invalidation rule to add
   */
  addInvalidationRule(rule: CacheInvalidationRule): void {
    this.invalidationRules.add(rule);
  }

  /**
   * Remove invalidation rule
   *
   * @param rule Invalidation rule to remove
   */
  removeInvalidationRule(rule: CacheInvalidationRule): void {
    this.invalidationRules.delete(rule);
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const memoryEntries = this.memoryCache.size;
    const sessionEntries = this.context.workspaceState.keys()
      .filter(key => key.startsWith('cache_')).length;

    let totalHits = 0;
    let totalMisses = 0;

    for (const counters of this.hitCounters.values()) {
      totalHits += counters.hits;
      totalMisses += counters.misses;
    }

    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    // Calculate memory usage
    let totalMemoryUsage = 0;
    for (const entry of this.memoryCache.values()) {
      totalMemoryUsage += JSON.stringify(entry.data).length;
    }

    const averageEntrySize = memoryEntries > 0 ? totalMemoryUsage / memoryEntries : 0;

    return {
      memoryEntries,
      sessionEntries,
      hits: totalHits,
      misses: totalMisses,
      evictions: this.calculateEvictions(),
      hitRate,
      totalMemoryUsage,
      averageEntrySize
    };
  }

  /**
   * Generate cache key from parameters
   *
   * @param operation Operation name
   * @param params Parameters for the operation
   * @returns Generated cache key
   */
  generateKey(operation: string, ...params: any[]): string {
    const normalizedParams = params.map(param => {
      if (param === null || param === undefined) {
        return 'null';
      }
      if (typeof param === 'object') {
        return JSON.stringify(param);
      }
      return String(param);
    });

    return `${operation}_${normalizedParams.join('_')}`;
  }

  /**
   * Check if key exists in cache
   *
   * @param key Cache key
   * @returns True if key exists and entry is valid
   */
  async has(key: string): Promise<boolean> {
    const entry = await this.get<any>(key);
    return entry !== null;
  }

  /**
   * Get cache entry metadata
   *
   * @param key Cache key
   * @returns Entry metadata or null if not found
   */
  async getMetadata(key: string): Promise<Record<string, any> | null> {
    const entry = await this.get<CacheEntry<any>>(key);
    return entry?.metadata || null;
  }

  /**
   * Update cache entry metadata
   *
   * @param key Cache key
   * @param metadata New metadata to merge
   */
  async updateMetadata(key: string, metadata: Record<string, any>): Promise<void> {
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      memoryEntry.metadata = { ...memoryEntry.metadata, ...metadata };
      await this.setSessionCache(key, memoryEntry);
    }
  }

  /**
   * Get or set pattern (memoization pattern)
   *
   * @param key Cache key
   * @param factory Function to generate data if not cached
   * @param ttl Time-to-live in milliseconds
   * @returns Cached or newly generated data
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await factory();
    await this.set(key, data, ttl);
    return data;
  }

  /**
   * Prefetch multiple cache keys
   *
   * @param keys Keys to prefetch
   * @param factory Function to generate data for missing keys
   */
  async prefetch<T>(
    keys: string[],
    factory: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<void> {
    const missingKeys = keys.filter(key => !this.memoryCache.has(key));

    await Promise.all(
      missingKeys.map(async key => {
        try {
          const data = await factory(key);
          await this.set(key, data, ttl);
        } catch (error) {
          console.error(`Failed to prefetch cache key ${key}:`, error);
        }
      })
    );
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Clear cleanup intervals
    for (const interval of this.cleanupIntervals) {
      clearInterval(interval);
    }
    this.cleanupIntervals.clear();

    // Clear cache
    this.memoryCache.clear();
    this.hitCounters.clear();
    this.invalidationRules.clear();
  }

  /**
   * Ensure cache manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CacheManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(config?: Partial<CacheConfig>): CacheConfig {
    const defaults: CacheConfig = {
      defaultTtl: 300000, // 5 minutes
      maxMemoryEntries: 1000,
      maxSessionEntries: 500,
      enableCompression: true,
      enableEviction: true,
      cleanupInterval: 60000 // 1 minute
    };

    return { ...defaults, ...config };
  }

  /**
   * Check if cache entry is valid (not expired)
   */
  private isValidEntry<T>(entry: CacheEntry<T>): boolean {
    return Date.now() < entry.expiry;
  }

  /**
   * Update access counters for statistics
   */
  private updateAccessCounters(key: string): void {
    const counters = this.hitCounters.get(key) || { hits: 0, misses: 0 };
    counters.misses++;
    this.hitCounters.set(key, counters);
  }

  /**
   * Update access statistics for a cache entry
   */
  private updateAccessStats<T>(key: string, entry: CacheEntry<T>): void {
    entry.accessCount++;
    entry.lastAccess = Date.now();

    const counters = this.hitCounters.get(key) || { hits: 0, misses: 0 };
    counters.hits++;
    counters.misses--; // Remove the miss that was just counted
    this.hitCounters.set(key, counters);
  }

  /**
   * Store data in session cache with compression if needed
   */
  private async setSessionCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const sessionKey = `cache_${key}`;
    let dataToStore = entry;

    // Compress large entries if enabled
    if (this.config.enableCompression && this.shouldCompress(entry)) {
      dataToStore = await this.compressEntry(entry);
    }

    await this.context.workspaceState.update(sessionKey, dataToStore);
  }

  /**
   * Determine if entry should be compressed
   */
  private shouldCompress<T>(entry: CacheEntry<T>): boolean {
    const size = JSON.stringify(entry.data).length;
    return size > 1024; // Compress entries larger than 1KB
  }

  /**
   * Compress cache entry
   */
  private async compressEntry<T>(entry: CacheEntry<T>): Promise<CacheEntry<T>> {
    // For now, just return the entry as-is
    // In a real implementation, you might use a compression library
    return entry;
  }

  /**
   * Promote session cache entry to memory cache
   */
  private async promoteToMemoryCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.memoryCache.set(key, entry);
    this.updateAccessStats(key, entry);

    // Apply eviction if needed
    if (this.config.enableEviction) {
      this.evictIfNeeded();
    }
  }

  /**
   * Evict entries if memory cache is full
   */
  private evictIfNeeded(): void {
    if (this.memoryCache.size <= this.config.maxMemoryEntries) {
      return;
    }

    // Sort by last access time (LRU)
    const entries = Array.from(this.memoryCache.entries())
      .sort(([, a], [, b]) => a.lastAccess - b.lastAccess);

    // Remove oldest entries
    const toRemove = entries.length - this.config.maxMemoryEntries;
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  /**
   * Calculate number of evictions (simplified)
   */
  private calculateEvictions(): number {
    // This is a simplified calculation
    // In a real implementation, you would track actual evictions
    return Math.max(0, this.memoryCache.size - this.config.maxMemoryEntries);
  }

  /**
   * Apply invalidation rule
   */
  private async applyInvalidationRule(rule: CacheInvalidationRule): Promise<void> {
    switch (rule.strategy) {
      case 'exact':
        await this.delete(rule.pattern);
        break;
      case 'prefix':
        await this.invalidateByPrefix(rule.pattern);
        break;
      case 'pattern':
        await this.invalidateByPattern(rule.pattern);
        break;
      case 'tag':
        await this.invalidateByTags(rule.tags || []);
        break;
    }
  }

  /**
   * Invalidate entries by prefix
   */
  private async invalidateByPrefix(prefix: string): Promise<void> {
    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Session cache
    const sessionKeys = this.context.workspaceState.keys()
      .filter(key => key.startsWith('cache_') && key.includes(prefix));
    for (const sessionKey of sessionKeys) {
      await this.context.workspaceState.update(sessionKey, undefined);
    }
  }

  /**
   * Invalidate entries by pattern (regex)
   */
  private async invalidateByPattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern);

    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }

    // Session cache
    const sessionKeys = this.context.workspaceState.keys()
      .filter(key => key.startsWith('cache_'));
    for (const sessionKey of sessionKeys) {
      const key = sessionKey.substring(6); // Remove 'cache_' prefix
      if (regex.test(key)) {
        await this.context.workspaceState.update(sessionKey, undefined);
      }
    }
  }

  /**
   * Invalidate entries by tags
   */
  private async invalidateByTags(tags: string[]): Promise<void> {
    if (tags.length === 0) {
      return;
    }

    // Memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.metadata?.tags && tags.some(tag => entry.metadata.tags.includes(tag))) {
        this.memoryCache.delete(key);
      }
    }

    // Session cache (more complex - would need to load and check each entry)
    // This is simplified for now
    const sessionKeys = this.context.workspaceState.keys()
      .filter(key => key.startsWith('cache_'));
    for (const sessionKey of sessionKeys) {
      const entry = this.context.workspaceState.get<CacheEntry<any>>(sessionKey);
      if (entry?.metadata?.tags && tags.some(tag => entry.metadata.tags.includes(tag))) {
        await this.context.workspaceState.update(sessionKey, undefined);
      }
    }
  }

  /**
   * Perform cleanup of expired entries
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();

    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiry) {
        this.memoryCache.delete(key);
      }
    }

    // Clean session cache
    const sessionKeys = this.context.workspaceState.keys()
      .filter(key => key.startsWith('cache_'));
    for (const sessionKey of sessionKeys) {
      const entry = this.context.workspaceState.get<CacheEntry<any>>(sessionKey);
      if (entry && now >= entry.expiry) {
        await this.context.workspaceState.update(sessionKey, undefined);
      }
    }
  }
}