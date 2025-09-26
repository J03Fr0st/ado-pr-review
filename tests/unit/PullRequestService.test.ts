import * as assert from 'assert';
import * as sinon from 'sinon';
import { PullRequestService } from '../../src/services/PullRequestService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { PullRequest, PullRequestStatus, GitRepository, Identity } from '../../src/api/models';
import { ErrorHandler } from '../../src/utils/ErrorHandler';
import { TelemetryService } from '../../src/services/TelemetryService';
import { MonitoringService } from '../../src/services/MonitoringService';
import { CacheManager } from '../../src/services/CacheManager';
import { StateManager } from '../../src/services/StateManager';

suite('PullRequestService Test Suite', () => {
    let pullRequestService: PullRequestService;
    let sandbox: sinon.SinonSandbox;
    let mockApiClient: sinon.SinonStubbedInstance<AzureDevOpsApiClient>;
    let mockConfigService: sinon.SinonStubbedInstance<ConfigurationService>;
    let mockErrorHandler: sinon.SinonStubbedInstance<ErrorHandler>;
    let mockTelemetryService: sinon.SinonStubbedInstance<TelemetryService>;
    let mockMonitoringService: sinon.SinonStubbedInstance<MonitoringService>;
    let mockCacheManager: sinon.SinonStubbedInstance<CacheManager>;
    let mockStateManager: sinon.SinonStubbedInstance<StateManager>;

    setup(() => {
        sandbox = sinon.createSandbox();

        mockApiClient = sandbox.createStubInstance(AzureDevOpsApiClient);
        mockConfigService = sandbox.createStubInstance(ConfigurationService);
        mockErrorHandler = sandbox.createStubInstance(ErrorHandler);
        mockTelemetryService = sandbox.createStubInstance(TelemetryService);
        mockMonitoringService = sandbox.createStubInstance(MonitoringService);
        mockCacheManager = sandbox.createStubInstance(CacheManager);
        mockStateManager = sandbox.createStubInstance(StateManager);

        // Setup default stub behaviors
        mockConfigService.getConfiguration.returns({
            organizationUrl: 'https://dev.azure.com/test',
            project: 'Test Project',
            refreshInterval: 300,
            telemetry: {}
        });

        pullRequestService = new PullRequestService(
            mockApiClient,
            mockConfigService,
            mockErrorHandler,
            mockTelemetryService,
            mockMonitoringService,
            mockCacheManager,
            mockStateManager
        );
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should initialize correctly with all dependencies', () => {
        assert.ok(pullRequestService);
        assert.strictEqual(mockConfigService.getConfiguration.callCount, 1);
    });

    test('should get pull requests from API', async () => {
        const mockRepositories = [
            { id: 'repo1', name: 'Test Repo 1', project: { id: 'project1', name: 'Test Project' } },
            { id: 'repo2', name: 'Test Repo 2', project: { id: 'project1', name: 'Test Project' } }
        ] as GitRepository[];

        const mockPullRequests = [
            {
                pullRequestId: 1,
                title: 'Test PR 1',
                description: 'Test description',
                status: PullRequestStatus.Active,
                createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            },
            {
                pullRequestId: 2,
                title: 'Test PR 2',
                description: 'Test description 2',
                status: PullRequestStatus.Completed,
                createdBy: { id: 'user2', displayName: 'Test User 2' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test2',
                targetRefName: 'refs/heads/main'
            }
        ] as PullRequest[];

        mockStateManager.getRepositories.returns(mockRepositories);
        mockApiClient.getPullRequests.resolves({ value: mockPullRequests, count: 2 });

        const result = await pullRequestService.getPullRequests();

        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].pullRequestId, 1);
        assert.strictEqual(result[1].pullRequestId, 2);
        assert.strictEqual(result[0].status, PullRequestStatus.Active);
        assert.strictEqual(result[1].status, PullRequestStatus.Completed);

        assert.strictEqual(mockStateManager.getRepositories.callCount, 1);
        assert.strictEqual(mockApiClient.getPullRequests.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordApiCall.callCount, 1);
    });

    test('should get pull request by ID', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: PullRequestStatus.Active,
            createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        } as PullRequest;

        mockApiClient.getPullRequest.resolves(mockPullRequest);

        const result = await pullRequestService.getPullRequest('repo1', 1);

        assert.strictEqual(result, mockPullRequest);
        assert.strictEqual(mockApiClient.getPullRequest.callCount, 1);
        assert.strictEqual(mockApiClient.getPullRequest.firstCall.args[0], 'repo1');
        assert.strictEqual(mockApiClient.getPullRequest.firstCall.args[1], 1);
    });

    test('should create pull request', async () => {
        const mockPullRequest = {
            pullRequestId: 3,
            title: 'New PR',
            description: 'New description',
            status: PullRequestStatus.Active,
            createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/new',
            targetRefName: 'refs/heads/main'
        } as PullRequest;

        mockApiClient.createPullRequest.resolves(mockPullRequest);

        const result = await pullRequestService.createPullRequest({
            title: 'New PR',
            description: 'New description',
            sourceRefName: 'refs/heads/feature/new',
            targetRefName: 'refs/heads/main',
            repositoryId: 'repo1'
        });

        assert.strictEqual(result, mockPullRequest);
        assert.strictEqual(mockApiClient.createPullRequest.callCount, 1);
        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
    });

    test('should update pull request', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Updated PR',
            description: 'Updated description',
            status: PullRequestStatus.Active,
            createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        } as PullRequest;

        mockApiClient.updatePullRequest.resolves(mockPullRequest);

        const result = await pullRequestService.updatePullRequest('repo1', 1, {
            title: 'Updated PR',
            description: 'Updated description'
        });

        assert.strictEqual(result, mockPullRequest);
        assert.strictEqual(mockApiClient.updatePullRequest.callCount, 1);
    });

    test('should approve pull request', async () => {
        mockApiClient.votePullRequest.resolves({
            id: 'vote1',
            voter: { id: 'user1', displayName: 'Test User' },
            vote: 10, // Approved
            commentedDate: new Date()
        });

        const result = await pullRequestService.approvePullRequest('repo1', 1, 'Looks good!');

        assert.strictEqual(result.vote, 10);
        assert.strictEqual(mockApiClient.votePullRequest.callCount, 1);
        assert.strictEqual(mockApiClient.votePullRequest.firstCall.args[1], 10);
        assert.strictEqual(mockApiClient.votePullRequest.firstCall.args[2], 'Looks good!');
    });

    test('should reject pull request', async () => {
        mockApiClient.votePullRequest.resolves({
            id: 'vote2',
            voter: { id: 'user1', displayName: 'Test User' },
            vote: -5, // Rejected
            commentedDate: new Date()
        });

        const result = await pullRequestService.rejectPullRequest('repo1', 1, 'Needs changes');

        assert.strictEqual(result.vote, -5);
        assert.strictEqual(mockApiClient.votePullRequest.callCount, 1);
        assert.strictEqual(mockApiClient.votePullRequest.firstCall.args[1], -5);
        assert.strictEqual(mockApiClient.votePullRequest.firstCall.args[2], 'Needs changes');
    });

    test('should abandon pull request', async () => {
        mockApiClient.abandonPullRequest.resolves({
            pullRequestId: 1,
            status: PullRequestStatus.Abandoned,
            closedDate: new Date()
        });

        const result = await pullRequestService.abandonPullRequest('repo1', 1, 'No longer needed');

        assert.strictEqual(result.status, PullRequestStatus.Abandoned);
        assert.strictEqual(mockApiClient.abandonPullRequest.callCount, 1);
        assert.strictEqual(mockApiClient.abandonPullRequest.firstCall.args[2], 'No longer needed');
    });

    test('should handle API errors gracefully', async () => {
        const error = new Error('API Error');
        mockApiClient.getPullRequests.rejects(error);

        try {
            await pullRequestService.getPullRequests();
            assert.fail('Should have thrown an error');
        } catch (err) {
            assert.strictEqual(err, error);
            assert.strictEqual(mockErrorHandler.handleError.callCount, 1);
            assert.strictEqual(mockMonitoringService.recordError.callCount, 1);
        }
    });

    test('should use caching for pull requests', async () => {
        const mockRepositories = [
            { id: 'repo1', name: 'Test Repo 1', project: { id: 'project1', name: 'Test Project' } }
        ] as GitRepository[];

        const mockPullRequests = [
            {
                pullRequestId: 1,
                title: 'Test PR 1',
                description: 'Test description',
                status: PullRequestStatus.Active,
                createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            }
        ] as PullRequest[];

        mockStateManager.getRepositories.returns(mockRepositories);
        mockApiClient.getPullRequests.resolves({ value: mockPullRequests, count: 1 });
        mockCacheManager.get.resolves(undefined);
        mockCacheManager.set.resolves();

        await pullRequestService.getPullRequests();

        assert.strictEqual(mockCacheManager.get.callCount, 1);
        assert.strictEqual(mockCacheManager.set.callCount, 1);
    });

    test('should get cached pull requests when available', async () => {
        const cachedPullRequests = [
            {
                pullRequestId: 1,
                title: 'Cached PR',
                description: 'Cached description',
                status: PullRequestStatus.Active,
                createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            }
        ] as PullRequest[];

        mockCacheManager.get.resolves(cachedPullRequests);

        const result = await pullRequestService.getPullRequests();

        assert.strictEqual(result, cachedPullRequests);
        assert.strictEqual(mockApiClient.getPullRequests.callCount, 0);
        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
        assert.strictEqual(mockTelemetryService.trackEvent.firstCall.args[0], 'cacheHit');
    });

    test('should filter pull requests by status', async () => {
        const mockRepositories = [
            { id: 'repo1', name: 'Test Repo 1', project: { id: 'project1', name: 'Test Project' } }
        ] as GitRepository[];

        const mockPullRequests = [
            {
                pullRequestId: 1,
                title: 'Active PR',
                description: 'Test description',
                status: PullRequestStatus.Active,
                createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            },
            {
                pullRequestId: 2,
                title: 'Completed PR',
                description: 'Test description 2',
                status: PullRequestStatus.Completed,
                createdBy: { id: 'user2', displayName: 'Test User 2' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test2',
                targetRefName: 'refs/heads/main'
            }
        ] as PullRequest[];

        mockStateManager.getRepositories.returns(mockRepositories);
        mockApiClient.getPullRequests.resolves({ value: mockPullRequests, count: 2 });

        const result = await pullRequestService.getPullRequests({ status: PullRequestStatus.Active });

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].status, PullRequestStatus.Active);
    });

    test('should track performance metrics', async () => {
        const mockRepositories = [
            { id: 'repo1', name: 'Test Repo 1', project: { id: 'project1', name: 'Test Project' } }
        ] as GitRepository[];

        const mockPullRequests = [
            {
                pullRequestId: 1,
                title: 'Test PR',
                description: 'Test description',
                status: PullRequestStatus.Active,
                createdBy: { id: 'user1', displayName: 'Test User' } as Identity,
                creationDate: new Date(),
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main'
            }
        ] as PullRequest[];

        mockStateManager.getRepositories.returns(mockRepositories);
        mockApiClient.getPullRequests.resolves({ value: mockPullRequests, count: 1 });

        await pullRequestService.getPullRequests();

        assert.strictEqual(mockMonitoringService.recordApiCall.callCount, 1);
        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
    });

    test('should validate pull request parameters', async () => {
        try {
            await pullRequestService.createPullRequest({
                title: '', // Invalid: empty title
                description: 'Test description',
                sourceRefName: 'refs/heads/feature/test',
                targetRefName: 'refs/heads/main',
                repositoryId: 'repo1'
            });
            assert.fail('Should have thrown validation error');
        } catch (error) {
            assert.strictEqual(error.message, 'Title is required');
        }
    });

    test('should handle repository not found', async () => {
        mockStateManager.getRepositories.returns([]);

        const result = await pullRequestService.getPullRequests();

        assert.strictEqual(result.length, 0);
        assert.strictEqual(mockApiClient.getPullRequests.callCount, 0);
    });
});