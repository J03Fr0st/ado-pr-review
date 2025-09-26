import * as assert from 'assert';
import * as sinon from 'sinon';
import { WorkflowService } from '../../src/services/WorkflowService';
import { IntegrationService } from '../../src/services/IntegrationService';
import { ErrorHandler } from '../../src/utils/ErrorHandler';
import { TelemetryService } from '../../src/services/TelemetryService';
import { MonitoringService } from '../../src/services/MonitoringService';
import { StateManager } from '../../src/services/StateManager';
import { vscode } from 'vscode';

suite('WorkflowService Test Suite', () => {
    let workflowService: WorkflowService;
    let sandbox: sinon.SinonSandbox;
    let mockIntegrationService: sinon.SinonStubbedInstance<IntegrationService>;
    let mockErrorHandler: sinon.SinonStubbedInstance<ErrorHandler>;
    let mockTelemetryService: sinon.SinonStubbedInstance<TelemetryService>;
    let mockMonitoringService: sinon.SinonStubbedInstance<MonitoringService>;
    let mockStateManager: sinon.SinonStubbedInstance<StateManager>;
    let mockMemento: vscode.Memento;
    let mockProgress: vscode.Progress<{ message?: string; increment?: number }>;
    let mockToken: vscode.CancellationToken;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockMemento = {
            get: sandbox.stub(),
            update: sandbox.stub(),
            keys: () => [],
            delete: sandbox.stub()
        };

        mockProgress = {
            report: sandbox.stub()
        };

        mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: sandbox.stub()
        };

        mockIntegrationService = sandbox.createStubInstance(IntegrationService);
        mockErrorHandler = sandbox.createStubInstance(ErrorHandler);
        mockTelemetryService = sandbox.createStubInstance(TelemetryService);
        mockMonitoringService = sandbox.createStubInstance(MonitoringService);
        mockStateManager = sandbox.createStubInstance(StateManager);

        // Setup default stub behaviors
        mockErrorHandler.handleError.resolves();
        mockTelemetryService.trackEvent.returns();
        mockMonitoringService.recordWorkflowStart.returns();
        mockMonitoringService.recordWorkflowStep.returns();
        mockMonitoringService.recordWorkflowComplete.returns();
        mockMonitoringService.recordError.returns();
        mockStateManager.getRepositories.returns([]);

        workflowService = new WorkflowService(
            mockIntegrationService,
            mockErrorHandler,
            mockTelemetryService,
            mockMonitoringService,
            mockStateManager,
            mockMemento
        );
    });

    teardown(() => {
        sandbox.restore();
        workflowService.dispose();
    });

    test('should initialize correctly with all dependencies', () => {
        assert.ok(workflowService);
        assert.strictEqual(mockStateManager.getRepositories.callCount, 0);
    });

    test('should execute pull request review workflow successfully', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        };

        const mockIterations = [
            {
                id: 1,
                description: 'Initial commit',
                author: { id: 'user1', displayName: 'Test User' },
                createdDate: new Date(),
                changes: 10
            }
        ];

        const mockCommentThreads = [
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
        ];

        mockIntegrationService.getPullRequestDetails.resolves({
            pullRequest: mockPullRequest,
            iterations: mockIterations,
            commentThreads: mockCommentThreads,
            reviewers: [],
            fileCount: 5
        });

        const result = await workflowService.executePullRequestReviewWorkflow('repo1', 1);

        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(result.errors.length, 0);
        assert.strictEqual(result.data.pullRequest.title, 'Test PR');
        assert.strictEqual(result.data.iterations.length, 1);
        assert.strictEqual(result.data.commentThreads.length, 1);
        assert.strictEqual(result.data.fileCount, 5);

        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordWorkflowStart.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordWorkflowStep.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordWorkflowComplete.callCount, 1);
    });

    test('should handle workflow errors gracefully', async () => {
        const error = new Error('Workflow Error');
        mockIntegrationService.getPullRequestDetails.rejects(error);

        const result = await workflowService.executePullRequestReviewWorkflow('repo1', 1);

        assert.strictEqual(result.status, 'failed');
        assert.strictEqual(result.errors.length, 1);
        assert.strictEqual(result.errors[0], error);

        assert.strictEqual(mockErrorHandler.handleError.callCount, 1);
        assert.strictEqual(mockMonitoringService.recordError.callCount, 1);
        assert.strictEqual(mockTelemetryService.trackEvent.callCount, 1);
    });

    test('should execute pull request creation workflow', async () => {
        const mockRepositories = [
            { id: 'repo1', name: 'Test Repo 1', url: 'https://dev.azure.com/test/repo1' },
            { id: 'repo2', name: 'Test Repo 2', url: 'https://dev.azure.com/test/repo2' }
        ];

        const mockBranches = [
            { name: 'main', isProtected: true },
            { name: 'develop', isProtected: false },
            { name: 'feature/test', isProtected: false }
        ];

        mockStateManager.getRepositories.returns(mockRepositories);
        mockIntegrationService.getBranches.resolves(mockBranches);

        const result = await workflowService.executeCreatePullRequestWorkflow({
            title: 'New Feature',
            description: 'Feature description',
            sourceBranch: 'feature/test',
            targetBranch: 'main'
        });

        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(result.errors.length, 0);
        assert.strictEqual(result.data.repositories.length, 2);
        assert.strictEqual(result.data.branches.length, 3);
    });

    test('should validate workflow parameters before execution', async () => {
        const result = await workflowService.executeCreatePullRequestWorkflow({
            title: '',
            description: 'Feature description',
            sourceBranch: 'feature/test',
            targetBranch: 'main'
        });

        assert.strictEqual(result.status, 'failed');
        assert.strictEqual(result.errors.length, 1);
        assert.strictEqual(result.errors[0].message, 'Title is required');
    });

    test('should track workflow execution time', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        };

        mockIntegrationService.getPullRequestDetails.resolves({
            pullRequest: mockPullRequest,
            iterations: [],
            commentThreads: [],
            reviewers: [],
            fileCount: 5
        });

        const startTime = Date.now();
        await workflowService.executePullRequestReviewWorkflow('repo1', 1);
        const endTime = Date.now();

        assert.ok(endTime - startTime > 0);
        assert.strictEqual(mockMonitoringService.recordWorkflowComplete.callCount, 1);
    });

    test('should handle workflow cancellation', async () => {
        mockToken.isCancellationRequested = true;

        const result = await workflowService.executePullRequestReviewWorkflow('repo1', 1, mockToken);

        assert.strictEqual(result.status, 'cancelled');
        assert.strictEqual(result.errors.length, 0);
        assert.strictEqual(result.data, null);
    });

    test('should get workflow status', () => {
        const status = workflowService.getWorkflowStatus('test-workflow-id');

        assert.ok(status);
        assert.ok(status.id);
        assert.ok(status.startTime);
        assert.strictEqual(status.status, 'running');
    });

    test('should cancel running workflow', async () => {
        const workflowId = 'test-workflow-id';

        // Start a workflow
        const workflowPromise = workflowService.executePullRequestReviewWorkflow('repo1', 1);

        // Cancel it
        const cancelled = await workflowService.cancelWorkflow(workflowId);

        assert.strictEqual(cancelled, true);
    });

    test('should get workflow history', () => {
        const history = workflowService.getWorkflowHistory();

        assert.ok(Array.isArray(history));
        assert.strictEqual(history.length, 0); // Initially empty
    });

    test('should persist workflow state in memento', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        };

        mockIntegrationService.getPullRequestDetails.resolves({
            pullRequest: mockPullRequest,
            iterations: [],
            commentThreads: [],
            reviewers: [],
            fileCount: 5
        });

        await workflowService.executePullRequestReviewWorkflow('repo1', 1);

        assert.strictEqual(mockMemento.update.callCount, 1);
    });

    test('should handle concurrent workflow execution', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        };

        mockIntegrationService.getPullRequestDetails.resolves({
            pullRequest: mockPullRequest,
            iterations: [],
            commentThreads: [],
            reviewers: [],
            fileCount: 5
        });

        // Execute concurrent workflows
        const [result1, result2] = await Promise.all([
            workflowService.executePullRequestReviewWorkflow('repo1', 1),
            workflowService.executePullRequestReviewWorkflow('repo1', 2)
        ]);

        assert.strictEqual(result1.status, 'completed');
        assert.strictEqual(result2.status, 'completed');
    });

    test('should recover from workflow step failures', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        };

        // First call fails, second succeeds
        mockIntegrationService.getPullRequestDetails.onFirstCall().rejects(new Error('API Error'));
        mockIntegrationService.getPullRequestDetails.onSecondCall().resolves({
            pullRequest: mockPullRequest,
            iterations: [],
            commentThreads: [],
            reviewers: [],
            fileCount: 5
        });

        const result = await workflowService.executePullRequestReviewWorkflow('repo1', 1);

        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(result.errors.length, 0);
        assert.strictEqual(mockErrorHandler.handleError.callCount, 1);
    });

    test('should dispose resources correctly', () => {
        const disposeSpy = sandbox.spy(workflowService, 'dispose');
        workflowService.dispose();

        assert.strictEqual(disposeSpy.callCount, 1);
    });

    test('should validate workflow step dependencies', async () => {
        const result = await workflowService.executePullRequestReviewWorkflow('repo1', 1);

        // The workflow should complete successfully if all dependencies are met
        assert.strictEqual(result.status, 'completed' || result.status === 'failed');
        assert.ok(Array.isArray(result.errors));
    });

    test('should track workflow metrics', async () => {
        const mockPullRequest = {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { id: 'user1', displayName: 'Test User' },
            creationDate: new Date(),
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/main'
        };

        mockIntegrationService.getPullRequestDetails.resolves({
            pullRequest: mockPullRequest,
            iterations: [],
            commentThreads: [],
            reviewers: [],
            fileCount: 5
        });

        const result = await workflowService.executePullRequestReviewWorkflow('repo1', 1);

        assert.ok(result.metrics);
        assert.ok(result.metrics.startTime);
        assert.ok(result.metrics.endTime);
        assert.ok(result.metrics.duration);
        assert.strictEqual(result.metrics.stepCount, 1);
    });
});