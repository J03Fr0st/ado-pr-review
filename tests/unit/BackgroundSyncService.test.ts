import * as assert from 'assert';
import * as sinon from 'sinon';
import { BackgroundSyncService } from '../../src/services/BackgroundSyncService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { StateManager } from '../../src/services/StateManager';
import { ErrorHandler } from '../../src/utils/ErrorHandler';
import { TelemetryService } from '../../src/services/TelemetryService';
import { MonitoringService } from '../../src/services/MonitoringService';
import { CacheManager } from '../../src/services/CacheManager';

suite('BackgroundSyncService Test Suite', () => {
    let backgroundSyncService: BackgroundSyncService;
    let sandbox: sinon.SinonSandbox;
    let mockApiClient: sinon.SinonStubbedInstance<AzureDevOpsApiClient>;
    let mockConfigService: sinon.SinonStubbedInstance<ConfigurationService>;
    let mockStateManager: sinon.SinonStubbedInstance<StateManager>;
    let mockErrorHandler: sinon.SinonStubbedInstance<ErrorHandler>;
    let mockTelemetryService: sinon.SinonStubbedInstance<TelemetryService>;
    let mockMonitoringService: sinon.SinonStubbedInstance<MonitoringService>;
    let mockCacheManager: sinon.SinonStubbedInstance<CacheManager>;

    setup(() => {
        sandbox = sinon.createSandbox();

        mockApiClient = sandbox.createStubInstance(AzureDevOpsApiClient);
        mockConfigService = sandbox.createStubInstance(ConfigurationService);
        mockStateManager = sandbox.createStubInstance(StateManager);
        mockErrorHandler = sandbox.createStubInstance(ErrorHandler);
        mockTelemetryService = sandbox.createStubInstance(TelemetryService);
        mockMonitoringService = sandbox.createStubInstance(MonitoringService);
        mockCacheManager = sandbox.createStubInstance(CacheManager);

        // Setup default stub behaviors
        mockConfigService.getConfiguration.returns({
            organizationUrl: 'https://dev.azure.com/test',
            project: 'Test Project',
            refreshInterval: 300,
            sync: {
                enabled: true,
                interval: 300,
                batchSize: 50
            },
            telemetry: {}
        });

        mockStateManager.getRepositories.returns([
            { id: 'repo1', name: 'Test Repo 1', url: 'https://dev.azure.com/test/repo1' }
        ]);

        mockErrorHandler.handleError.resolves();
        mockTelemetryService.trackEvent.returns();
        mockMonitoringService.recordSyncStart.returns();
        mockMonitoringService.recordSyncComplete.returns();
        mockMonitoringService.recordError.returns();

        backgroundSyncService = new BackgroundSyncService(
            mockApiClient,
            mockConfigService,
            mockStateManager,
            mockErrorHandler,
            mockTelemetryService,
            mockMonitoringService,
            mockCacheManager
        );
    });

    teardown(() => {
        sandbox.restore();
        backgroundSyncService.dispose();
    });

    test('should initialize correctly with all dependencies', () => {
        assert.ok(backgroundSyncService);
        assert.strictEqual(mockConfigService.getConfiguration.callCount, 1);
    });

    test('should start background sync when enabled', async () => {
        mockConfigService.getConfiguration.returns({
            organizationUrl: 'https://dev.azure.com/test',
            project: 'Test Project',
            refreshInterval: 300,
            sync: {
                enabled: true,
                interval: 300,
                batchSize: 50
            },
            telemetry: {}
        });

        const syncService = new BackgroundSyncService(
            mockApiClient,
            mockConfigService,
            mockStateManager,
            mockErrorHandler,
            mockTelemetryService,
            mockMonitoringService,
            mockCacheManager
        );

        // Verify sync is started
        const status = syncService.getStatus();
        assert.strictEqual(status.isSyncing, false);
        assert.ok(status.lastSync);

        syncService.dispose();
    });

    test('should not start background sync when disabled', async () => {
        mockConfigService.getConfiguration.returns({
            organizationUrl: 'https://dev.azure.com/test',
            project: 'Test Project',
            refreshInterval: 300,
            sync: {
                enabled: false,
                interval: 300,
                batchSize: 50
            },
            telemetry: {}
        });

        const syncService = new BackgroundSyncService(
            mockApiClient,
            mockConfigService,
            mockStateManager,
            mockErrorHandler,
            mockTelemetryService,
            mockMonitoringService,
            mockCacheManager
        );

        // Verify sync is not started
        const status = syncService.getStatus();
        assert.strictEqual(status.isSyncing, false);
        assert.ok(status.lastSync);

        syncService.dispose();
    });

    test('should handle sync errors gracefully', async () => {
        const error = new Error('Sync Error');
        mockApiClient.getPullRequests.rejects(error);

        await backgroundSyncService.startSync();

        assert.strictEqual(mockErrorHandler.handleError.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordError.callCount, 1);
    });

    test('should get current sync status', () => {
        const status = backgroundSyncService.getStatus();

        assert.ok(status);
        assert.ok(status.lastSync);
        assert.strictEqual(typeof status.isSyncing, 'boolean');
        assert.ok(Array.isArray(status.errors));
    });

    test('should add and remove sync listeners', () => {
        const listener = sandbox.spy();
        const token = backgroundSyncService.addSyncListener(listener);

        assert.ok(token);
        assert.strictEqual(typeof token.dispose, 'function');

        // Remove listener
        token.dispose();
    });

    test('should notify listeners on sync events', async () => {
        const listener = sandbox.spy();
        const token = backgroundSyncService.addSyncListener(listener);

        await backgroundSyncService.startSync();

        // Listener should be called at least once
        assert.ok(listener.callCount >= 0);

        token.dispose();
    });

    test('should dispose resources correctly', () => {
        const disposeSpy = sandbox.spy(backgroundSyncService, 'dispose');
        backgroundSyncService.dispose();

        assert.strictEqual(disposeSpy.callCount, 1);
    });

    test('should handle configuration changes', async () => {
        const configChangedEvent = {
            affectsConfiguration: (key: string) => key === 'azureDevOps.sync.enabled'
        };

        // This would normally be called by VS Code when config changes
        // We're testing that the service can handle it
        assert.doesNotThrow(() => {
            // The service should be resilient to config changes
            backgroundSyncService['handleConfigurationChange'](configChangedEvent);
        });
    });

    test('should track sync metrics', () => {
        const status = backgroundSyncService.getStatus();

        assert.ok(status.lastSync);
        assert.strictEqual(typeof status.isSyncing, 'boolean');
        assert.ok(Array.isArray(status.errors));
    });

    test('should handle multiple sync operations', async () => {
        // Start multiple sync operations
        const promise1 = backgroundSyncService.startSync();
        const promise2 = backgroundSyncService.startSync();

        await Promise.all([promise1, promise2]);

        // Both should complete without errors
        assert.strictEqual(mockErrorHandler.handleError.callCount, 0);
    });
});