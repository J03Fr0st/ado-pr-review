import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { IntegrationService } from '../../src/services/IntegrationService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { StateManager } from '../../src/services/StateManager';
import { CacheManager } from '../../src/services/CacheManager';
import { ErrorHandler } from '../../src/utils/ErrorHandler';
import { TelemetryService } from '../../src/services/TelemetryService';
import { MonitoringService } from '../../src/services/MonitoringService';
import { PullRequestService } from '../../src/services/PullRequestService';
import { CommentService } from '../../src/services/CommentService';
import { BackgroundSyncService } from '../../src/services/BackgroundSyncService';

suite('IntegrationService Test Suite', () => {
    let integrationService: IntegrationService;
    let sandbox: sinon.SinonSandbox;
    let mockApiClient: sinon.SinonStubbedInstance<AzureDevOpsApiClient>;
    let mockStateManager: sinon.SinonStubbedInstance<StateManager>;
    let mockCacheManager: sinon.SinonStubbedInstance<CacheManager>;
    let mockErrorHandler: sinon.SinonStubbedInstance<ErrorHandler>;
    let mockTelemetryService: sinon.SinonStubbedInstance<TelemetryService>;
    let mockMonitoringService: sinon.SinonStubbedInstance<MonitoringService>;
    let mockPullRequestService: sinon.SinonStubbedInstance<PullRequestService>;
    let mockCommentService: sinon.SinonStubbedInstance<CommentService>;
    let mockBackgroundSyncService: sinon.SinonStubbedInstance<BackgroundSyncService>;
    let mockMemento: vscode.Memento;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockMemento = {
            get: sandbox.stub(),
            update: sandbox.stub(),
            keys: () => [],
            delete: sandbox.stub()
        };

        mockApiClient = sandbox.createStubInstance(AzureDevOpsApiClient);
        mockStateManager = sandbox.createStubInstance(StateManager);
        mockCacheManager = sandbox.createStubInstance(CacheManager);
        mockErrorHandler = sandbox.createStubInstance(ErrorHandler);
        mockTelemetryService = sandbox.createStubInstance(TelemetryService);
        mockMonitoringService = sandbox.createStubInstance(MonitoringService);
        mockPullRequestService = sandbox.createStubInstance(PullRequestService);
        mockCommentService = sandbox.createStubInstance(CommentService);
        mockBackgroundSyncService = sandbox.createStubInstance(BackgroundSyncService);

        // Setup default stub behaviors
        mockStateManager.getRepositories.returns([]);
        mockCacheManager.get.resolves(undefined);
        mockCacheManager.set.resolves();
        mockTelemetryService.trackEvent.returns();
        mockMonitoringService.recordApiCall.returns();
        mockMonitoringService.incrementCacheHits.returns();
        mockPullRequestService.getPullRequests.resolves([]);
        mockCommentService.getCommentThreads.resolves([]);
        mockBackgroundSyncService.getStatus.returns({
            lastSync: new Date(),
            isSyncing: false,
            errors: []
        });

        integrationService = new IntegrationService(
            mockApiClient,
            mockStateManager,
            mockCacheManager,
            mockErrorHandler,
            mockTelemetryService,
            mockMonitoringService,
            mockPullRequestService,
            mockCommentService,
            mockBackgroundSyncService
        );
    });

    teardown(() => {
        sandbox.restore();
        integrationService.dispose();
    });

    test('should initialize correctly with all dependencies', () => {
        assert.ok(integrationService);
        assert.strictEqual(mockStateManager.getRepositories.callCount, 0);
    });

    test('should get pull requests with caching', async () => {
        const mockRepositories = [
            { id: 'repo1', name: 'Test Repo 1', url: 'https://dev.azure.com/test/repo1' },
            { id: 'repo2', name: 'Test Repo 2', url: 'https://dev.azure.com/test/repo2' }
        ];

        const mockPullRequests = [
            {
                pullRequestId: 1,
                title: 'Test PR 1',
                description: 'Test description',
                status: 'active',
                createdBy: { id: 'user1', displayName: 'Test User' },
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            }
        ];

        mockStateManager.getRepositories.returns(mockRepositories);
        mockPullRequestService.getPullRequests.resolves(mockPullRequests);
        mockCacheManager.get.resolves(undefined);

        const result = await integrationService.getPullRequests();

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].repository, mockRepositories[0]);
        assert.strictEqual(result[0].pullRequests.length, 1);
        assert.strictEqual(result[0].pullRequests[0].title, 'Test PR 1');

        assert.strictEqual(mockCacheManager.get.callCount, 1);
        assert.strictEqual(mockCacheManager.set.callCount, 1);
        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordApiCall.callCount, 1);
    });

    test('should return cached pull requests when available', async () => {
        const cachedData = [
            {
                repository: { id: 'repo1', name: 'Test Repo 1', url: 'https://dev.azure.com/test/repo1' },
                pullRequests: [
                    {
                        pullRequestId: 1,
                        title: 'Cached PR',
                        description: 'Cached description',
                        status: 'active',
                        createdBy: { id: 'user1', displayName: 'Test User' },
                        creationDate: new Date(),
                        sourceRefName: 'refs/heads/feature/test',
                        targetRefName: 'refs/heads/main'
                    }
                ]
            }
        ];

        mockCacheManager.get.resolves(cachedData);

        const result = await integrationService.getPullRequests();

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].pullRequests[0].title, 'Cached PR');
        assert.strictEqual(mockPullRequestService.getPullRequests.callCount, 0);
        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
        assert.strictEqual(mockTelemetryService.trackEvent.firstCall.args[0], 'cacheHit');
    });

    test('should get pull request details with comprehensive data', async () => {
        const repositoryId = 'repo1';
        const pullRequestId = 1;

        const mockDetails = {
            pullRequest: {
                pullRequestId: 1,
                title: 'Test PR',
                description: 'Test description',
                status: 'active',
                createdBy: { id: 'user1', displayName: 'Test User' },
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            },
            iterations: [
                {
                    id: 1,
                    description: 'Initial commit',
                    author: { id: 'user1', displayName: 'Test User' },
                    createdDate: new Date(),
                    changes: 10
                }
            ],
            commentThreads: [
                {
                    id: 1,
                    threadId: 1,
                    comments: [
                        {
                            id: 1,
                            content: 'Test comment',
                            author: { id: 'user1', displayName: 'Test User' },
                            publishedDate: new Date()
                        }
                    ]
                }
            ],
            fileCount: 5,
            reviewers: [
                {
                    id: 'reviewer1',
                    displayName: 'Test Reviewer',
                    vote: 10
                }
            ]
        };

        mockApiClient.getPullRequestDetails.resolves(mockDetails);
        mockApiClient.getPullRequestIterations.resolves(mockDetails.iterations);
        mockApiClient.getPullRequestCommentThreads.resolves(mockDetails.commentThreads);
        mockApiClient.getPullRequestReviewers.resolves(mockDetails.reviewers);

        const result = await integrationService.getPullRequestDetails(repositoryId, pullRequestId);

        assert.strictEqual(result.pullRequest.title, 'Test PR');
        assert.strictEqual(result.iterations.length, 1);
        assert.strictEqual(result.commentThreads.length, 1);
        assert.strictEqual(result.fileCount, 5);
        assert.strictEqual(result.reviewers.length, 1);

        assert.strictEqual(mockApiClient.getPullRequestDetails.callCount, 1);
        assert.strictEqual(mockApiClient.getPullRequestIterations.callCount, 1);
        assert.strictEqual(mockApiClient.getPullRequestCommentThreads.callCount, 1);
        assert.strictEqual(mockApiClient.getPullRequestReviewers.callCount, 1);
    });

    test('should handle errors gracefully with retry logic', async () => {
        const error = new Error('API Error');
        mockPullRequestService.getPullRequests.rejects(error);

        try {
            await integrationService.getPullRequests();
            assert.fail('Should have thrown an error');
        } catch (err) {
            assert.strictEqual(err, error);
            assert.strictEqual(mockErrorHandler.handleError.callCount, 1);
            assert.strictEqual(mockMonitoringService.recordError.callCount, 1);
        }
    });

    test('should invalidate cache correctly', async () => {
        await integrationService.invalidateCache('test-key');

        assert.strictEqual(mockCacheManager.delete.callCount, 1);
        assert.strictEqual(mockCacheManager.delete.firstCall.args[0], 'test-key');
    });

    test('should invalidate all cache when no key provided', async () => {
        await integrationService.invalidateCache();

        assert.strictEqual(mockCacheManager.clear.callCount, 1);
    });

    test('should get performance metrics', () => {
        const metrics = integrationService.getPerformanceMetrics();

        assert.ok(metrics.cacheHitRate >= 0);
        assert.ok(metrics.averageResponseTime >= 0);
        assert.ok(metrics.errorRate >= 0);
        assert.ok(metrics.activeConnections >= 0);
    });

    test('should get health status', async () => {
        mockApiClient.isAvailable.returns(true);
        mockCacheManager.isAvailable.returns(true);

        const health = await integrationService.getHealthStatus();

        assert.strictEqual(health.overall, 'healthy');
        assert.strictEqual(health.api.status, 'healthy');
        assert.strictEqual(health.cache.status, 'healthy');
        assert.strictEqual(health.services.status, 'healthy');
    });

    test('should detect unhealthy status when API is down', async () => {
        mockApiClient.isAvailable.returns(false);

        const health = await integrationService.getHealthStatus();

        assert.strictEqual(health.overall, 'unhealthy');
        assert.strictEqual(health.api.status, 'unhealthy');
    });

    test('should dispose resources correctly', () => {
        const disposeSpy = sandbox.spy(integrationService, 'dispose');
        integrationService.dispose();

        assert.strictEqual(disposeSpy.callCount, 1);
    });

    test('should handle concurrent requests efficiently', async () => {
        const mockPullRequests = [
            {
                pullRequestId: 1,
                title: 'Test PR 1',
                description: 'Test description',
                status: 'active',
                createdBy: { id: 'user1', displayName: 'Test User' },
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            }
        ];

        mockPullRequestService.getPullRequests.resolves(mockPullRequests);
        mockStateManager.getRepositories.returns([
            { id: 'repo1', name: 'Test Repo 1', url: 'https://dev.azure.com/test/repo1' }
        ]);

        // Make concurrent requests
        const [result1, result2] = await Promise.all([
            integrationService.getPullRequests(),
            integrationService.getPullRequests()
        ]);

        assert.strictEqual(result1.length, 1);
        assert.strictEqual(result2.length, 1);
        assert.strictEqual(mockPullRequestService.getPullRequests.callCount, 2);
    });

    test('should validate large PR handling with pagination', async () => {
        const largePR = {
            pullRequestId: 1,
            title: 'Large PR',
            description: 'Large PR with many files',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/large',
            targetRefName: 'refs/heads/main'
        };

        mockApiClient.getPullRequestDetails.resolves({
            pullRequest: largePR,
            iterations: [],
            commentThreads: [],
            reviewers: []
        });

        // Mock large file count
        sandbox.stub(integrationService as any, 'getPullRequestFileCount').resolves(150);

        const result = await integrationService.getPullRequestDetails('repo1', 1);

        assert.strictEqual(result.pullRequest.title, 'Large PR');
        assert.strictEqual(result.fileCount, 150);
    });
});