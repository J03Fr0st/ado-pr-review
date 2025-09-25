import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { StateManager } from '../../src/Services/StateManager';
import { PullRequest, GitRepository, CommentThread, Identity } from '../../src/api/models';

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

describe('StateManager', () => {
  let stateManager: StateManager;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    stateManager = new StateManager(mockExtensionContext);
  });

  afterEach(() => {
    sandbox.restore();
    stateManager.dispose();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const state = stateManager.getState();

      assert.strictEqual(state.pullRequests.size, 0);
      assert.strictEqual(state.repositories.size, 0);
      assert.strictEqual(state.commentThreads.size, 0);
      assert.strictEqual(state.currentUser, null);
      assert.strictEqual(state.selectedPullRequest, null);
      assert.strictEqual(state.selectedRepository, null);
      assert.strictEqual(state.loading.size, 0);
      assert.strictEqual(state.errors.size, 0);
      assert.strictEqual(state.lastUpdated.size, 0);
      assert.strictEqual(state.viewState.activePullRequestFilter, 'all');
      assert.strictEqual(state.viewState.sortBy, 'updatedDate');
      assert.strictEqual(state.viewState.sortOrder, 'desc');
      assert.strictEqual(state.viewState.showDrafts, true);
      assert.strictEqual(state.viewState.showActive, true);
      assert.strictEqual(state.viewState.showCompleted, true);
      assert.strictEqual(state.viewState.showAbandoned, false);
      assert.strictEqual(state.viewState.expandedThreads.size, 0);
      assert.strictEqual(state.viewState.selectedCommentThread, null);
      assert.strictEqual(state.viewState.sidebarVisible, true);
      assert.strictEqual(state.viewState.detailViewVisible, false);
    });

    it('should load persisted state on initialization', () => {
      const persistedRepositories: [string, GitRepository][] = [
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
      ];

      const persistedViewState = {
        activePullRequestFilter: 'assigned',
        sortBy: 'createdDate' as const,
        sortOrder: 'asc' as const,
        showDrafts: false,
        showActive: true,
        showCompleted: false,
        showAbandoned: true,
        expandedThreads: ['thread1'],
        selectedCommentThread: 'thread2',
        sidebarVisible: false,
        detailViewVisible: true
      };

      mockExtensionContext.workspaceState.get.withArgs('state_repositories').returns(persistedRepositories);
      mockExtensionContext.workspaceState.get.withArgs('state_view_state').returns(persistedViewState);

      const newStateManager = new StateManager(mockExtensionContext);
      const state = newStateManager.getState();

      assert.strictEqual(state.repositories.size, 1);
      assert.strictEqual(state.repositories.get('repo1')?.name, 'Test Repository');
      assert.strictEqual(state.viewState.activePullRequestFilter, 'assigned');
      assert.strictEqual(state.viewState.sortBy, 'createdDate');
      assert.strictEqual(state.viewState.sortOrder, 'asc');
      assert.strictEqual(state.viewState.showDrafts, false);
      assert.strictEqual(state.viewState.sidebarVisible, false);
      assert.strictEqual(state.viewState.detailViewVisible, true);
      assert.ok(state.viewState.expandedThreads.has('thread1'));
      assert.strictEqual(state.viewState.selectedCommentThread, 'thread2');

      newStateManager.dispose();
    });
  });

  describe('pull request management', () => {
    it('should update pull requests in state', () => {
      const pullRequests: PullRequest[] = [
        {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active',
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          creationDate: new Date('2023-01-01'),
          title: 'Test PR 1',
          description: 'Test description',
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

      const eventListener = sinon.stub();
      stateManager.addStateUpdateListener(eventListener);

      stateManager.updatePullRequests(pullRequests);

      const state = stateManager.getState();
      assert.strictEqual(state.pullRequests.size, 1);
      assert.ok(state.pullRequests.has('repo1_1'));
      assert.strictEqual(state.pullRequests.get('repo1_1')?.title, 'Test PR 1');

      // Verify event was emitted
      assert.ok(eventListener.called);
      const event = eventListener.firstCall.args[0];
      assert.strictEqual(event.type, 'pullRequestsLoaded');
      assert.strictEqual(event.data.count, 1);

      // Verify state was persisted
      assert.ok(mockExtensionContext.workspaceState.update.called);
    });

    it('should update single pull request', () => {
      // First add a pull request
      const initialPr: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Test PR',
        description: 'Test description',
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

      stateManager.addPullRequest(initialPr);

      // Update the pull request
      stateManager.updatePullRequest('repo1', 1, { title: 'Updated PR', status: 'completed' as const });

      const state = stateManager.getState();
      const updatedPr = state.pullRequests.get('repo1_1');
      assert.strictEqual(updatedPr?.title, 'Updated PR');
      assert.strictEqual(updatedPr?.status, 'completed');
      assert.strictEqual(updatedPr?.description, 'Test description'); // Other fields preserved
    });

    it('should add new pull request', () => {
      const pullRequest: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'New PR',
        description: 'New description',
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

      stateManager.addPullRequest(pullRequest);

      const state = stateManager.getState();
      assert.strictEqual(state.pullRequests.size, 1);
      assert.ok(state.pullRequests.has('repo1_1'));
      assert.strictEqual(state.pullRequests.get('repo1_1')?.title, 'New PR');
    });

    it('should remove pull request', () => {
      // First add a pull request
      const pullRequest: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Test PR',
        description: 'Test description',
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

      stateManager.addPullRequest(pullRequest);
      assert.strictEqual(stateManager.getState().pullRequests.size, 1);

      // Remove the pull request
      stateManager.removePullRequest('repo1', 1);

      const state = stateManager.getState();
      assert.strictEqual(state.pullRequests.size, 0);
      assert.ok(!state.pullRequests.has('repo1_1'));
    });
  });

  describe('repository management', () => {
    it('should update repositories', () => {
      const repositories: GitRepository[] = [
        {
          id: 'repo1',
          name: 'Test Repository 1',
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
          name: 'Test Repository 2',
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

      stateManager.updateRepositories(repositories);

      const state = stateManager.getState();
      assert.strictEqual(state.repositories.size, 2);
      assert.strictEqual(state.repositories.get('repo1')?.name, 'Test Repository 1');
      assert.strictEqual(state.repositories.get('repo2')?.name, 'Test Repository 2');
      assert.strictEqual(state.repositories.get('repo2')?.size, 2048);
    });
  });

  describe('comment thread management', () => {
    it('should update comment threads', () => {
      const threads: CommentThread[] = [
        {
          id: 1,
          threadContext: {
            filePath: '/src/test.ts',
            rightFileStart: { line: 10, char: 0 },
            rightFileEnd: { line: 15, char: 0 }
          },
          comments: [],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        }
      ];

      stateManager.updateCommentThreads('repo1', 1, threads);

      const state = stateManager.getState();
      assert.strictEqual(state.commentThreads.size, 1);
      assert.ok(state.commentThreads.has('repo1_1'));
      assert.strictEqual(state.commentThreads.get('repo1_1')?.length, 1);
      assert.strictEqual(state.commentThreads.get('repo1_1')?.[0].id, 1);
    });
  });

  describe('selection management', () => {
    it('should set selected pull request', () => {
      const pullRequest: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Selected PR',
        description: 'Test description',
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

      stateManager.setSelectedPullRequest(pullRequest);

      const state = stateManager.getState();
      assert.strictEqual(state.selectedPullRequest?.title, 'Selected PR');
      assert.strictEqual(state.selectedPullRequest?.pullRequestId, 1);
    });

    it('should clear selected pull request', () => {
      const pullRequest: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Selected PR',
        description: 'Test description',
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

      stateManager.setSelectedPullRequest(pullRequest);
      assert.strictEqual(stateManager.getState().selectedPullRequest?.title, 'Selected PR');

      stateManager.setSelectedPullRequest(null);
      assert.strictEqual(stateManager.getState().selectedPullRequest, null);
    });

    it('should set selected repository', () => {
      const repository: GitRepository = {
        id: 'repo1',
        name: 'Selected Repository',
        url: 'https://dev.azure.com/test/test/_git/repo1',
        project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
        defaultBranch: 'refs/heads/main',
        size: 1024,
        remoteUrl: 'https://dev.azure.com/test/test/_git/repo1',
        sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo1',
        webUrl: 'https://dev.azure.com/test/test/_git/repo1',
        isDisabled: false
      };

      stateManager.setSelectedRepository(repository);

      const state = stateManager.getState();
      assert.strictEqual(state.selectedRepository?.name, 'Selected Repository');
      assert.strictEqual(state.selectedRepository?.id, 'repo1');
    });
  });

  describe('loading and error state management', () => {
    it('should set loading state', () => {
      stateManager.setLoadingState('loadingPullRequests', true);

      const state = stateManager.getState();
      assert.strictEqual(state.loading.get('loadingPullRequests'), true);

      stateManager.setLoadingState('loadingPullRequests', false);

      const updatedState = stateManager.getState();
      assert.strictEqual(updatedState.loading.get('loadingPullRequests'), undefined);
    });

    it('should set error state', () => {
      stateManager.setError('apiError', 'Failed to connect to Azure DevOps');

      const state = stateManager.getState();
      assert.strictEqual(state.errors.get('apiError'), 'Failed to connect to Azure DevOps');

      stateManager.setError('apiError', null);

      const updatedState = stateManager.getState();
      assert.strictEqual(updatedState.errors.get('apiError'), undefined);
    });

    it('should check loading state', () => {
      assert.strictEqual(stateManager.isLoading('loadingPullRequests'), false);

      stateManager.setLoadingState('loadingPullRequests', true);
      assert.strictEqual(stateManager.isLoading('loadingPullRequests'), true);

      stateManager.setLoadingState('loadingPullRequests', false);
      assert.strictEqual(stateManager.isLoading('loadingPullRequests'), false);
    });

    it('should get error state', () => {
      assert.strictEqual(stateManager.getError('apiError'), null);

      stateManager.setError('apiError', 'Test error');
      assert.strictEqual(stateManager.getError('apiError'), 'Test error');

      stateManager.setError('apiError', null);
      assert.strictEqual(stateManager.getError('apiError'), null);
    });
  });

  describe('view state management', () => {
    it('should update view state', () => {
      stateManager.updateViewState({
        activePullRequestFilter: 'assigned',
        sortBy: 'createdDate',
        showDrafts: false
      });

      const state = stateManager.getState();
      assert.strictEqual(state.viewState.activePullRequestFilter, 'assigned');
      assert.strictEqual(state.viewState.sortBy, 'createdDate');
      assert.strictEqual(state.viewState.showDrafts, false);
      assert.strictEqual(state.viewState.sortOrder, 'desc'); // Unchanged
    });

    it('should toggle thread expansion', () => {
      stateManager.toggleThreadExpansion('thread1');

      const state = stateManager.getState();
      assert.ok(state.viewState.expandedThreads.has('thread1'));

      stateManager.toggleThreadExpansion('thread1');
      const updatedState = stateManager.getState();
      assert.ok(!updatedState.viewState.expandedThreads.has('thread1'));
    });

    it('should select comment thread', () => {
      stateManager.selectCommentThread('thread1');

      const state = stateManager.getState();
      assert.strictEqual(state.viewState.selectedCommentThread, 'thread1');

      stateManager.selectCommentThread(null);
      const updatedState = stateManager.getState();
      assert.strictEqual(updatedState.viewState.selectedCommentThread, null);
    });

    it('should toggle sidebar visibility', () => {
      const initialState = stateManager.getState();
      const initialVisibility = initialState.viewState.sidebarVisible;

      stateManager.toggleSidebar();

      const updatedState = stateManager.getState();
      assert.strictEqual(updatedState.viewState.sidebarVisible, !initialVisibility);
    });

    it('should toggle detail view visibility', () => {
      const initialState = stateManager.getState();
      const initialVisibility = initialState.viewState.detailViewVisible;

      stateManager.toggleDetailView();

      const updatedState = stateManager.getState();
      assert.strictEqual(updatedState.viewState.detailViewVisible, !initialVisibility);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      // Setup test data
      const pullRequests: PullRequest[] = [
        {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active',
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          creationDate: new Date('2023-01-01'),
          title: 'PR in repo1',
          description: 'Test description',
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
        },
        {
          pullRequestId: 2,
          codeReviewId: 2,
          status: 'active',
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          creationDate: new Date('2023-01-01'),
          title: 'PR in repo2',
          description: 'Test description',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          mergeStatus: 'succeeded',
          isDraft: false,
          mergeId: 'merge2',
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
            id: 'repo2',
            name: 'Test Repository 2',
            url: 'https://dev.azure.com/test/test/_git/repo2',
            project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
            defaultBranch: 'refs/heads/main',
            size: 1024,
            remoteUrl: 'https://dev.azure.com/test/test/_git/repo2',
            sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo2',
            webUrl: 'https://dev.azure.com/test/test/_git/repo2',
            isDisabled: false
          },
          workItemRefs: [],
          labels: [],
          hasMultipleMergeBases: false,
          supportsIterations: true,
          artifactId: 'artifact2'
        }
      ];

      stateManager.updatePullRequests(pullRequests);
    });

    it('should get pull requests for specific repository', () => {
      const repo1PullRequests = stateManager.getPullRequestsForRepository('repo1');
      assert.strictEqual(repo1PullRequests.length, 1);
      assert.strictEqual(repo1PullRequests[0].title, 'PR in repo1');

      const repo2PullRequests = stateManager.getPullRequestsForRepository('repo2');
      assert.strictEqual(repo2PullRequests.length, 1);
      assert.strictEqual(repo2PullRequests[0].title, 'PR in repo2');

      const nonExistentRepoPullRequests = stateManager.getPullRequestsForRepository('repo3');
      assert.strictEqual(nonExistentRepoPullRequests.length, 0);
    });

    it('should get comment threads for specific pull request', () => {
      const threads: CommentThread[] = [
        {
          id: 1,
          threadContext: {
            filePath: '/src/test.ts',
            rightFileStart: { line: 10, char: 0 },
            rightFileEnd: { line: 15, char: 0 }
          },
          comments: [],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        }
      ];

      stateManager.updateCommentThreads('repo1', 1, threads);

      const retrievedThreads = stateManager.getCommentThreadsForPullRequest('repo1', 1);
      assert.strictEqual(retrievedThreads.length, 1);
      assert.strictEqual(retrievedThreads[0].id, 1);

      const nonExistentThreads = stateManager.getCommentThreadsForPullRequest('repo1', 999);
      assert.strictEqual(nonExistentThreads.length, 0);
    });
  });

  describe('batch operations', () => {
    it('should execute batch updates', () => {
      const eventListener = sinon.stub();
      stateManager.addStateUpdateListener(eventListener);

      const repository: GitRepository = {
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
      };

      stateManager.batchUpdate([
        () => stateManager.updateRepositories([repository]),
        () => stateManager.updateViewState({ activePullRequestFilter: 'assigned' })
      ], { persist: true, notify: true });

      const state = stateManager.getState();
      assert.strictEqual(state.repositories.size, 1);
      assert.strictEqual(state.viewState.activePullRequestFilter, 'assigned');

      // Verify event was emitted
      assert.ok(eventListener.called);
    });

    it('should support undo operations', () => {
      // Make initial change
      const repository: GitRepository = {
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
      };

      stateManager.updateRepositories([repository]);
      assert.strictEqual(stateManager.getState().repositories.size, 1);

      // Make another change to create history
      stateManager.updateViewState({ activePullRequestFilter: 'assigned' });
      assert.strictEqual(stateManager.getState().viewState.activePullRequestFilter, 'assigned');

      // Undo should restore previous state
      const undoResult = stateManager.undo();
      assert.strictEqual(undoResult, true);
      assert.strictEqual(stateManager.getState().viewState.activePullRequestFilter, 'all'); // Default value
      assert.strictEqual(stateManager.getState().repositories.size, 1); // Repository should remain
    });

    it('should not undo when no history available', () => {
      const undoResult = stateManager.undo();
      assert.strictEqual(undoResult, false);
    });
  });

  describe('state clearing', () => {
    it('should clear all state', () => {
      // Add some data
      const repository: GitRepository = {
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
      };

      stateManager.updateRepositories([repository]);
      stateManager.setLoadingState('test', true);
      stateManager.setError('test', 'Test error');
      assert.strictEqual(stateManager.getState().repositories.size, 1);

      // Clear state
      stateManager.clearState();

      const state = stateManager.getState();
      assert.strictEqual(state.repositories.size, 0);
      assert.strictEqual(state.loading.size, 0);
      assert.strictEqual(state.errors.size, 0);
      assert.strictEqual(state.viewState.activePullRequestFilter, 'all'); // Reset to default
    });
  });

  describe('statistics', () => {
    it('should return state statistics', () => {
      // Add test data
      const repository: GitRepository = {
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
      };

      const pullRequest: PullRequest = {
        pullRequestId: 1,
        codeReviewId: 1,
        status: 'active',
        createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        creationDate: new Date('2023-01-01'),
        title: 'Test PR',
        description: 'Test description',
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
              content: 'Test comment',
              publishedDate: new Date('2023-01-01'),
              lastUpdatedDate: new Date('2023-01-01'),
              isDeleted: false,
              isEdited: false,
              isLiked: false,
              likeCount: 0
            }
          ],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        }
      ];

      stateManager.updateRepositories([repository]);
      stateManager.addPullRequest(pullRequest);
      stateManager.updateCommentThreads('repo1', 1, threads);

      const stats = stateManager.getStateStatistics();
      assert.strictEqual(stats.pullRequestCount, 1);
      assert.strictEqual(stats.repositoryCount, 1);
      assert.strictEqual(stats.commentThreadCount, 1);
      assert.ok(stats.memoryUsage > 0);
      assert.strictEqual(stats.historySize, 0); // Initially no history
    });
  });

  describe('event listener management', () => {
    it('should add and remove event listeners', () => {
      const listener1 = sinon.stub();
      const listener2 = sinon.stub();

      stateManager.addStateUpdateListener(listener1);
      stateManager.addStateUpdateListener(listener2);

      stateManager.updateRepositories([{
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
      }]);

      assert.ok(listener1.called);
      assert.ok(listener2.called);

      listener1.resetHistory();
      listener2.resetHistory();

      stateManager.removeStateUpdateListener(listener1);

      stateManager.updateRepositories([{
        id: 'repo2',
        name: 'Test Repository 2',
        url: 'https://dev.azure.com/test/test/_git/repo2',
        project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
        defaultBranch: 'refs/heads/main',
        size: 1024,
        remoteUrl: 'https://dev.azure.com/test/test/_git/repo2',
        sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo2',
        webUrl: 'https://dev.azure.com/test/test/_git/repo2',
        isDisabled: false
      }]);

      assert.ok(!listener1.called);
      assert.ok(listener2.called);
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = sinon.stub().throws(new Error('Listener error'));
      const validListener = sinon.stub();

      stateManager.addStateUpdateListener(errorListener);
      stateManager.addStateUpdateListener(validListener);

      // This should not throw despite the error listener throwing
      stateManager.updateRepositories([{
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
      }]);

      assert.ok(validListener.called);
    });
  });

  describe('state immutability', () => {
    it('should return immutable state copies', () => {
      const repository: GitRepository = {
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
      };

      stateManager.updateRepositories([repository]);

      const state1 = stateManager.getState();
      const repositories1 = state1.repositories;

      // Modify the returned state
      repositories1.set('repo2', {
        id: 'repo2',
        name: 'Test Repository 2',
        url: 'https://dev.azure.com/test/test/_git/repo2',
        project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
        defaultBranch: 'refs/heads/main',
        size: 1024,
        remoteUrl: 'https://dev.azure.com/test/test/_git/repo2',
        sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo2',
        webUrl: 'https://dev.azure.com/test/test/_git/repo2',
        isDisabled: false
      });

      // Original state should be unchanged
      const state2 = stateManager.getState();
      assert.strictEqual(state2.repositories.size, 1);
      assert.ok(!state2.repositories.has('repo2'));
    });

    it('should return immutable state parts', () => {
      const repository: GitRepository = {
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
      };

      stateManager.updateRepositories([repository]);

      const repositories = stateManager.getStatePart('repositories');
      repositories.set('repo2', {
        id: 'repo2',
        name: 'Test Repository 2',
        url: 'https://dev.azure.com/test/test/_git/repo2',
        project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
        defaultBranch: 'refs/heads/main',
        size: 1024,
        remoteUrl: 'https://dev.azure.com/test/test/_git/repo2',
        sshUrl: 'git@ssh.dev.azure.com:v3/test/test/repo2',
        webUrl: 'https://dev.azure.com/test/test/_git/repo2',
        isDisabled: false
      });

      // Original state should be unchanged
      const state = stateManager.getState();
      assert.strictEqual(state.repositories.size, 1);
      assert.ok(!state.repositories.has('repo2'));
    });
  });
});