import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { BackgroundSyncService } from '../../src/Services/BackgroundSyncService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { StateManager } from '../../src/Services/StateManager';
import { PullRequest, CommentThread, Identity, GitRepository } from '../../src/api/models';

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
  subscriptions: [],
  secrets: {
    get: sinon.stub(),
    store: sinon.stub(),
    delete: sinon.stub()
  }
} as any;

const mockApiClient = {
  getRepositories: sinon.stub(),
  getPullRequests: sinon.stub(),
  getPullRequest: sinon.stub(),
  getCommentThreads: sinon.stub(),
  patch: sinon.stub(),
  post: sinon.stub()
} as any;

const mockConfigService = {
  getConfiguration: sinon.stub().returns({
    organizationUrl: 'https://dev.azure.com/test',
    project: 'Test Project',
    refreshInterval: 300
  })
} as any;

const mockStateManager = {
  getState: sinon.stub(),
  updatePullRequests: sinon.stub(),
  addPullRequest: sinon.stub(),
  updateRepositories: sinon.stub(),
  addStateUpdateListener: sinon.stub(),
  removeStateUpdateListener: sinon.stub()
} as any;

describe('BackgroundSyncService', () => {
  let syncService: BackgroundSyncService;
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    syncService = new BackgroundSyncService(
      mockApiClient,
      mockConfigService,
      mockStateManager,
      mockExtensionContext
    );
  });

  afterEach(() => {
    sandbox.restore();
    clock.restore();
    syncService.dispose();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = (syncService as any).config;
      assert.strictEqual(config.enabled, true);
      assert.strictEqual(config.syncInterval, 300000); // 5 minutes
      assert.strictEqual(config.offlineMode, false);
      assert.strictEqual(conflictStrategy: 'latest-wins');
      assert.strictEqual(config.batchSize, 50);
      assert.strictEqual(config.maxRetries, 3);
      assert.strictEqual(config.retryDelay, 5000);
    });

    it('should load persisted offline queue on initialization', () => {
      const offlineQueue = [
        { operation: 'createPullRequest', data: { title: 'Test PR' }, timestamp: Date.now() }
      ];

      mockExtensionContext.workspaceState.get.withArgs('offlineQueue').returns(offlineQueue);

      const newSyncService = new BackgroundSyncService(
        mockApiClient,
        mockConfigService,
        mockStateManager,
        mockExtensionContext
      );

      const queue = (newSyncService as any).offlineQueue;
      assert.strictEqual(queue.length, 1);
      assert.strictEqual(queue[0].operation, 'createPullRequest');

      newSyncService.dispose();
    });
  });

  describe('sync control', () => {
    it('should start sync process', async () => {
      const setIntervalSpy = sandbox.spy(global, 'setInterval');

      await syncService.startSync();

      assert.ok((syncService as any).isSyncing);
      assert.ok(setIntervalSpy.called);
      assert.strictEqual(setIntervalSpy.firstCall.args[1], 300000); // Default sync interval
    });

    it('should stop sync process', async () => {
      const clearIntervalSpy = sandbox.spy(global, 'clearInterval');

      await syncService.startSync();
      await syncService.stopSync();

      assert.ok(!(syncService as any).isSyncing);
      assert.ok(clearIntervalSpy.called);
    });

    it('should not start sync if already running', async () => {
      const setIntervalSpy = sandbox.spy(global, 'setInterval');

      await syncService.startSync();
      const initialCallCount = setIntervalSpy.callCount;

      await syncService.startSync();

      assert.strictEqual(setIntervalSpy.callCount, initialCallCount);
    });

    it('should handle start sync errors gracefully', async () => {
      const setIntervalSpy = sandbox.stub(global, 'setInterval').throws(new Error('Timer error'));

      // Should not throw error
      await assert.doesNotReject(async () => await syncService.startSync());

      // Sync should remain false
      assert.ok(!(syncService as any).isSyncing);
    });
  });

  describe('sync operations', () => {
    beforeEach(async () => {
      // Setup mock state data
      mockStateManager.getState.returns({
        pullRequests: new Map(),
        repositories: new Map([
          ['repo1', {
            id: 'repo1',
            name: 'Test Repository',
            url: 'https://dev.azure.com/test/test/_git/repo1',
            project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
            defaultBranch: 'refs/heads/main',
            size: 1024,
            remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
            sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
            webUrl: 'https://dev.azure.com/test/test/_git/repo1',
            isDisabled: false
          }]
        ])
      });
    });

    it('should sync repositories', async () => {
      const repositories: GitRepository[] = [
        {
          id: 'repo1',
          name: 'Test Repository',
          url: 'https://dev.azure.com/test/test/_git/repo1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
          webUrl: 'https://dev.azure.com/test/test/_git/repo1',
          isDisabled: false
        },
        {
          id: 'repo2',
          name: 'New Repository',
          url: 'https://dev.azure.com/test/test/_git/repo2',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 2048,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo2',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo2',
          webUrl: 'https://dev.azure.com/test/test/_git/repo2',
          isDisabled: false
        }
      ];

      mockApiClient.getRepositories.resolves(repositories);

      await syncService.syncRepositories();

      assert.ok(mockApiClient.getRepositories.called);
      assert.ok(mockStateManager.updateRepositories.calledWith(repositories));
    });

    it('should sync pull requests', async () => {
      const pullRequests: PullRequest[] = [
        {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active',
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          creationDate: new Date('2023-01-01'),
          title: 'Updated PR',
          description: 'Updated description',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          mergeStatus: 'succeeded',
          isDraft: false,
          mergeId: 'merge1',
          lastMergeSourceCommit: {
            commitId: 'commit1',
            author: { name: 'Test User', email: 'test@example.com', date: new Date() },
            committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
            comment: 'Test commit',
            commentTruncated: false,
            url: '',
            remoteUrl: ''
          },
          lastMergeTargetCommit: {
            commitId: 'commit2',
            author: { name: 'Test User', email: 'test@example.com', date: new Date() },
            committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
            comment: 'Test commit',
            commentTruncated: false,
            url: '',
            remoteUrl: ''
          },
          reviewers: [],
          url: '',
          webUrl: '',
          repository: {
            id: 'repo1',
            name: 'Test Repository',
            url: 'https://dev.azure.com/test/test/_git/repo1',
            project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
            defaultBranch: 'refs/heads/main',
            size: 1024,
            remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
            sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
            webUrl: 'https://dev.azure.com/test/test/_git/repo1',
            isDisabled: false
          },
          workItemRefs: [],
          labels: [],
          hasMultipleMergeBases: false,
          supportsIterations: true,
          artifactId: 'artifact1'
        }
      ];

      mockApiClient.getPullRequests.resolves(pullRequests);

      // Simulate existing pull request in state
      const existingPrs = new Map([
        ['repo1_1', {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active',
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          creationDate: new Date('2023-01-01'),
          title: 'Original PR',
          description: 'Original description',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          mergeStatus: 'succeeded',
          isDraft: false,
          mergeId: 'merge1',
          lastMergeSourceCommit: {
            commitId: 'commit1',
            author: { name: 'Test User', email: 'test@example.com', date: new Date() },
            committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
            comment: 'Test commit',
            commentTruncated: false,
            url: '',
            remoteUrl: ''
          },
          lastMergeTargetCommit: {
            commitId: 'commit2',
            author: { name: 'Test User', email: 'test@example.com', date: new Date() },
            committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
            comment: 'Test commit',
            commentTruncated: false,
            url: '',
            remoteUrl: ''
          },
          reviewers: [],
          url: '',
          webUrl: '',
          repository: {
            id: 'repo1',
            name: 'Test Repository',
            url: 'https://dev.azure.com/test/test/_git/repo1',
            project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
            defaultBranch: 'refs/heads/main',
            size: 1024,
            remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
            sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
            webUrl: 'https://dev.azure.com/test/test/_git/repo1',
            isDisabled: false
          },
          workItemRefs: [],
          labels: [],
          hasMultipleMergeBases: false,
          supportsIterations: true,
          artifactId: 'artifact1'
        }]
      ]);

      mockStateManager.getState.returns({
        pullRequests: existingPrs,
        repositories: new Map([
          ['repo1', {
            id: 'repo1',
            name: 'Test Repository',
            url: 'https://dev.azure.com/test/test/_git/repo1',
            project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
            defaultBranch: 'refs/heads/main',
            size: 1024,
            remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
            sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
            webUrl: 'https://dev.azure.com/test/test/_git/repo1',
            isDisabled: false
          }]
        ])
      });

      await syncService.syncPullRequests();

      assert.ok(mockApiClient.getPullRequests.called);
      assert.ok(mockStateManager.updatePullRequests.called);
    });

    it('should sync comment threads', async () => {
      const threads: CommentThread[] = [
        {
          id: 1,
          threadContext: {
            filePath: '/src/test.ts',
            rightFileStart: { line: 10, char: 0 },
            rightFileEnd: { line: 15, char: 0 }
          },
          comments: [
            {
              id: 1,
              author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
              content: 'Updated comment',
              publishedDate: new Date('2023-01-01'),
              lastUpdatedDate: new Date('2023-01-02'),
              isDeleted: false,
              isEdited: true,
              isLiked: false,
              likeCount: 0
            }
          ],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-02'),
          isDeleted: false,
          properties: {}
        }
      ];

      mockApiClient.getCommentThreads.resolves({ value: threads });

      await syncService.syncCommentThreads('repo1', 1);

      assert.ok(mockApiClient.getCommentThreads.calledWith('repo1', 1));
    });

    it('should handle sync errors gracefully', async () => {
      mockApiClient.getRepositories.rejects(new Error('API Error'));

      await syncService.syncRepositories();

      // Should not throw error
      // Error should be logged (can't verify console.log in test environment)
    });
  });

  describe('conflict detection and resolution', () => {
    it('should detect pull request conflicts', () => {
      const currentPr: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Local PR',
        description: 'Local description',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        mergeStatus: 'succeeded',
        isDraft: false,
        mergeId: 'merge1',
        lastMergeSourceCommit: {
          commitId: 'commit1',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        lastMergeTargetCommit: {
          commitId: 'commit2',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        reviewers: [],
        url: '',
        webUrl: '',
        repository: {
          id: 'repo1',
          name: 'Test Repository',
          url: 'https://dev.azure.com/test/test/_git/repo1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
          webUrl: 'https://dev.azure.com/test/test/_git/repo1',
          isDisabled: false
        },
        workItemRefs: [],
        labels: [],
        hasMultipleMergeBases: false,
        supportsIterations: true,
        artifactId: 'artifact1'
      };

      const latestPr: PullRequest = {
        ...currentPr,
        title: 'Remote PR',
        description: 'Remote description'
      };

      const hasConflict = (syncService as any).hasPullRequestConflict(currentPr, latestPr);
      assert.ok(hasConflict);
    });

    it('should not detect conflicts for identical pull requests', () => {
      const pr: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Same PR',
        description: 'Same description',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        mergeStatus: 'succeeded',
        isDraft: false,
        mergeId: 'merge1',
        lastMergeSourceCommit: {
          commitId: 'commit1',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        lastMergeTargetCommit: {
          commitId: 'commit2',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        reviewers: [],
        url: '',
        webUrl: '',
        repository: {
          id: 'repo1',
          name: 'Test Repository',
          url: 'https://dev.azure.com/test/test/_git/repo1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
          webUrl: 'https://dev.azure.com/test/test/_git/repo1',
          isDisabled: false
        },
        workItemRefs: [],
        labels: [],
        hasMultipleMergeBases: false,
        supportsIterations: true,
        artifactId: 'artifact1'
      };

      const hasConflict = (syncService as any).hasPullRequestConflict(pr, pr);
      assert.ok(!hasConflict);
    });

    it('should resolve conflicts using latest-wins strategy', async () => {
      const currentPr: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Local PR',
        description: 'Local description',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        mergeStatus: 'succeeded',
        isDraft: false,
        mergeId: 'merge1',
        lastMergeSourceCommit: {
          commitId: 'commit1',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        lastMergeTargetCommit: {
          commitId: 'commit2',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        reviewers: [],
        url: '',
        webUrl: '',
        repository: {
          id: 'repo1',
          name: 'Test Repository',
          url: 'https://dev.azure.com/test/test/_git/repo1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
          webUrl: 'https://dev.azure.com/test/test/_git/repo1',
          isDisabled: false
        },
        workItemRefs: [],
        labels: [],
        hasMultipleMergeBases: false,
        supportsIterations: true,
        artifactId: 'artifact1'
      };

      const latestPr: PullRequest = {
        ...currentPr,
        title: 'Remote PR',
        description: 'Remote description'
      };

      const resolved = await (syncService as any).resolveConflict('pullRequest', 'repo1_1', currentPr, latestPr);

      assert.deepStrictEqual(resolved, latestPr);
    });

    it('should create conflict records for manual resolution', async () => {
      const currentPr: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Local PR',
        description: 'Local description',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        mergeStatus: 'succeeded',
        isDraft: false,
        mergeId: 'merge1',
        lastMergeSourceCommit: {
          commitId: 'commit1',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        lastMergeTargetCommit: {
          commitId: 'commit2',
          author: { name: 'Test User', email: 'test@example.com', date: new Date() },
          committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
          comment: 'Test commit',
          commentTruncated: false,
          url: '',
          remoteUrl: ''
        },
        reviewers: [],
        url: '',
        webUrl: '',
        repository: {
          id: 'repo1',
          name: 'Test Repository',
          url: 'https://dev.azure.com/test/test/_git/repo1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
          webUrl: 'https://dev.azure.com/test/test/_git/repo1',
          isDisabled: false
        },
        workItemRefs: [],
        labels: [],
        hasMultipleMergeBases: false,
        supportsIterations: true,
        artifactId: 'artifact1'
      };

      const latestPr: PullRequest = {
        ...currentPr,
        title: 'Remote PR',
        description: 'Remote description'
      };

      await (syncService as any).createConflict('pullRequest', 'repo1_1', currentPr, latestPr);

      const conflicts = (syncService as any).conflicts;
      assert.strictEqual(conflicts.size, 1);
      assert.ok(conflicts.has('repo1_1'));
    });
  });

  describe('offline support', () => {
    it('should queue operations when offline', async () => {
      // Set offline mode
      (syncService as any).config.offlineMode = true;

      const operation = {
        type: 'createPullRequest',
        data: { title: 'Offline PR', description: 'Created offline' },
        timestamp: Date.now()
      };

      await (syncService as any).queueOfflineOperation(operation);

      const queue = (syncService as any).offlineQueue;
      assert.strictEqual(queue.length, 1);
      assert.strictEqual(queue[0].type, 'createPullRequest');
      assert.strictEqual(queue[0].data.title, 'Offline PR');

      // Should persist offline queue
      assert.ok(mockExtensionContext.workspaceState.update.calledWith('offlineQueue', queue));
    });

    it('should not queue operations when online', async () => {
      // Ensure online mode
      (syncService as any).config.offlineMode = false;

      const operation = {
        type: 'createPullRequest',
        data: { title: 'Online PR' },
        timestamp: Date.now()
      };

      await (syncService as any).queueOfflineOperation(operation);

      const queue = (syncService as any).offlineQueue;
      assert.strictEqual(queue.length, 0);
    });

    it('should process offline queue when coming online', async () => {
      // Setup offline queue
      const offlineQueue = [
        {
          type: 'createPullRequest',
          data: { title: 'Queued PR 1' },
          timestamp: Date.now() - 1000
        },
        {
          type: 'updatePullRequest',
          data: { pullRequestId: 1, title: 'Updated PR' },
          timestamp: Date.now()
        }
      ];

      mockExtensionContext.workspaceState.get.withArgs('offlineQueue').returns(offlineQueue);

      const newSyncService = new BackgroundSyncService(
        mockApiClient,
        mockConfigService,
        mockStateManager,
        mockExtensionContext
      );

      // Mock successful API call
      mockApiClient.post.resolves({ success: true });

      // Process offline queue
      await (newSyncService as any).processOfflineQueue();

      // Queue should be empty
      assert.strictEqual((newSyncService as any).offlineQueue.length, 0);

      // API should have been called
      assert.ok(mockApiClient.post.called);

      newSyncService.dispose();
    });

    it('should handle offline queue processing errors gracefully', async () => {
      const offlineQueue = [
        {
          type: 'createPullRequest',
          data: { title: 'Failed PR' },
          timestamp: Date.now()
        }
      ];

      mockExtensionContext.workspaceState.get.withArgs('offlineQueue').returns(offlineQueue);

      const newSyncService = new BackgroundSyncService(
        mockApiClient,
        mockConfigService,
        mockStateManager,
        mockExtensionContext
      );

      // Mock failed API call
      mockApiClient.post.rejects(new Error('API Error'));

      // Process offline queue
      await (newSyncService as any).processOfflineQueue();

      // Failed operation should remain in queue with retry count
      assert.strictEqual((newSyncService as any).offlineQueue.length, 1);
      assert.strictEqual((newSyncService as any).offlineQueue[0].retryCount, 1);

      newSyncService.dispose();
    });
  });

  describe('batch processing', () => {
    it('should process operations in batches', async () => {
      const operations = Array.from({ length: 75 }, (_, i) => ({
        type: 'syncPullRequest',
        data: { pullRequestId: i + 1 },
        timestamp: Date.now()
      }));

      let processedCount = 0;
      sandbox.stub(syncService as any, 'processBatch').callsFake(async (batch) => {
        processedCount += batch.length;
      });

      await (syncService as any).processBatches(operations, 50);

      assert.strictEqual(processedCount, 75);
      assert.strictEqual((syncService as any).processBatch.callCount, 2); // 50 + 25
    });

    it('should handle batch processing errors gracefully', async () => {
      const operations = [
        { type: 'syncPullRequest', data: { pullRequestId: 1 }, timestamp: Date.now() },
        { type: 'syncPullRequest', data: { pullRequestId: 2 }, timestamp: Date.now() }
      ];

      sandbox.stub(syncService as any, 'processBatch')
        .onFirstCall().resolves()
        .onSecondCall().rejects(new Error('Batch error'));

      // Should not throw error
      await assert.doesNotReject(async () => await (syncService as any).processBatches(operations, 1));
    });
  });

  describe('retry logic', () => {
    it('should retry failed operations', async () => {
      const operation = {
        type: 'createPullRequest',
        data: { title: 'Retry PR' },
        timestamp: Date.now(),
        retryCount: 0
      };

      // Mock API failure on first call, success on second
      mockApiClient.post
        .onFirstCall().rejects(new Error('Network error'))
        .onSecondCall().resolves({ success: true });

      const result = await (syncService as any).executeWithRetry(operation);

      assert.ok(result.success);
      assert.strictEqual(mockApiClient.post.callCount, 2);
    });

    it('should give up after max retries', async () => {
      const operation = {
        type: 'createPullRequest',
        data: { title: 'Failed PR' },
        timestamp: Date.now(),
        retryCount: 3 // Already at max retries
      };

      mockApiClient.post.rejects(new Error('Persistent error'));

      const result = await (syncService as any).executeWithRetry(operation);

      assert.ok(!result.success);
      assert.ok(result.error);
      assert.strictEqual(mockApiClient.post.callCount, 1); // No retry
    });

    it('should respect retry delay', async () => {
      const operation = {
        type: 'createPullRequest',
        data: { title: 'Delay PR' },
        timestamp: Date.now(),
        retryCount: 0
      };

      mockApiClient.post
        .onFirstCall().rejects(new Error('Network error'))
        .onSecondCall().resolves({ success: true });

      const clockSpy = sandbox.spy(clock, 'setTimeout');
      await (syncService as any).executeWithRetry(operation);

      assert.ok(clockSpy.called);
      assert.strictEqual(clockSpy.firstCall.args[1], 5000); // Default retry delay
    });
  });

  describe('network monitoring', () => {
    it('should detect network status changes', async () => {
      // Mock online status
      (navigator as any).onLine = true;

      const statusListener = sandbox.stub();
      syncService.addNetworkStatusListener(statusListener);

      // Simulate going offline
      (navigator as any).onLine = false;
      window.dispatchEvent(new Event('offline'));

      assert.ok(statusListener.called);
      const event = statusListener.firstCall.args[0];
      assert.strictEqual(event.online, false);

      // Simulate coming back online
      (navigator as any).onLine = true;
      window.dispatchEvent(new Event('online'));

      assert.strictEqual(statusListener.callCount, 2);
      const onlineEvent = statusListener.secondCall.args[0];
      assert.strictEqual(onlineEvent.online, true);
    });

    it('should handle missing navigator API gracefully', () => {
      const originalNavigator = global.navigator;
      delete (global as any).navigator;

      // Should not throw error
      assert.doesNotThrow(() => {
        syncService.addNetworkStatusListener(sandbox.stub());
      });

      // Restore navigator
      global.navigator = originalNavigator;
    });
  });

  describe('event handling', () => {
    it('should emit sync events', async () => {
      const eventListener = sandbox.stub();
      syncService.addSyncStatusListener(eventListener);

      // Trigger sync completed event
      (syncService as any).emitSyncEvent('syncCompleted', {
        repositories: 5,
        pullRequests: 20,
        duration: 1500
      });

      assert.ok(eventListener.called);
      const event = eventListener.firstCall.args[0];
      assert.strictEqual(event.type, 'syncCompleted');
      assert.strictEqual(event.data.repositories, 5);
    });

    it('should remove event listeners', () => {
      const listener1 = sandbox.stub();
      const listener2 = sandbox.stub();

      syncService.addSyncStatusListener(listener1);
      syncService.addSyncStatusListener(listener2);

      (syncService as any).emitSyncEvent('testEvent', {});

      assert.ok(listener1.called);
      assert.ok(listener2.called);

      listener1.resetHistory();
      listener2.resetHistory();

      syncService.removeSyncStatusListener(listener1);

      (syncService as any).emitSyncEvent('testEvent', {});

      assert.ok(!listener1.called);
      assert.ok(listener2.called);
    });
  });

  describe('full sync', () => {
    it('should perform full sync when requested', async () => {
      const repositories: GitRepository[] = [
        {
          id: 'repo1',
          name: 'Test Repository',
          url: 'https://dev.azure.com/test/test/_git/repo1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
          webUrl: 'https://dev.azure.com/test/test/_git/repo1',
          isDisabled: false
        }
      ];

      const pullRequests: PullRequest[] = [
        {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active',
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          creationDate: new Date('2023-01-01'),
          title: 'Sync PR',
          description: 'Sync description',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          mergeStatus: 'succeeded',
          isDraft: false,
          mergeId: 'merge1',
          lastMergeSourceCommit: {
            commitId: 'commit1',
            author: { name: 'Test User', email: 'test@example.com', date: new Date() },
            committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
            comment: 'Test commit',
            commentTruncated: false,
            url: '',
            remoteUrl: ''
          },
          lastMergeTargetCommit: {
            commitId: 'commit2',
            author: { name: 'Test User', email: 'test@example.com', date: new Date() },
            committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
            comment: 'Test commit',
            commentTruncated: false,
            url: '',
            remoteUrl: ''
          },
          reviewers: [],
          url: '',
          webUrl: '',
          repository: {
            id: 'repo1',
            name: 'Test Repository',
            url: 'https://dev.azure.com/test/test/_git/repo1',
            project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
            defaultBranch: 'refs/heads/main',
            size: 1024,
            remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
            sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
            webUrl: 'https://dev.azure.com/test/test/_git/repo1',
            isDisabled: false
          },
          workItemRefs: [],
          labels: [],
          hasMultipleMergeBases: false,
          supportsIterations: true,
          artifactId: 'artifact1'
        }
      ];

      mockApiClient.getRepositories.resolves(repositories);
      mockApiClient.getPullRequests.resolves(pullRequests);

      await syncService.forceFullSync();

      assert.ok(mockApiClient.getRepositories.called);
      assert.ok(mockApiClient.getPullRequests.called);
    });

    it('should handle full sync errors gracefully', async () => {
      mockApiClient.getRepositories.rejects(new Error('Sync error'));

      await syncService.forceFullSync();

      // Should not throw error
      // Error should be logged
    });
  });

  describe('statistics and monitoring', () => {
    it('should track sync statistics', async () => {
      // Perform some sync operations
      mockApiClient.getRepositories.resolves([]);
      mockApiClient.getPullRequests.resolves([]);

      await syncService.syncRepositories();
      await syncService.syncPullRequests();

      const stats = syncService.getSyncStatistics();
      assert.ok(stats.lastSyncTime > 0);
      assert.strictEqual(stats.syncCount, 2);
      assert.strictEqual(stats.errorCount, 0);
    });

    it('should track error statistics', async () => {
      // Perform sync operations that fail
      mockApiClient.getRepositories.rejects(new Error('API Error'));

      await syncService.syncRepositories();

      const stats = syncService.getSyncStatistics();
      assert.strictEqual(stats.errorCount, 1);
      assert.ok(stats.lastErrorTime > 0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on dispose', () => {
      // Start sync to create intervals
      syncService.startSync();

      // Add some data
      (syncService as any).offlineQueue.push({ type: 'test', data: {} });
      (syncService as any).conflicts.set('test', {});

      syncService.dispose();

      assert.strictEqual((syncService as any).cleanupIntervals.size, 0);
      assert.strictEqual((syncService as any).syncInterval, null);
      assert.strictEqual((syncService as any).offlineQueue.length, 0);
      assert.strictEqual((syncService as any).conflicts.size, 0);
    });

    it('should handle cleanup when not initialized', () => {
      const uninitializedSync = new BackgroundSyncService(
        mockApiClient,
        mockConfigService,
        mockStateManager,
        mockExtensionContext
      );

      // Should not throw error
      assert.doesNotThrow(() => {
        uninitializedSync.dispose();
      });
    });
  });
});