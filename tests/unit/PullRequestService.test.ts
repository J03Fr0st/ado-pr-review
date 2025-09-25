import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { PullRequestService } from '../../src/Services/PullRequestService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { PullRequest, PullRequestStatus, GitRepository, Identity } from '../../src/api/models';

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
  post: sinon.stub(),
  patch: sinon.stub(),
  put: sinon.stub(),
  votePullRequest: sinon.stub(),
  abandonPullRequest: sinon.stub()
} as any;

const mockConfigService = {
  getConfiguration: sinon.stub().returns({
    organizationUrl: 'https://dev.azure.com/test',
    project: 'Test Project'
  })
} as any;

describe('PullRequestService', () => {
  let pullRequestService: PullRequestService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pullRequestService = new PullRequestService(
      mockApiClient,
      mockConfigService,
      mockExtensionContext
    );
  });

  afterEach(() => {
    sandbox.restore();
    pullRequestService.dispose();
  });

  describe('getPullRequests', () => {
    it('should return pull requests with caching', async () => {
      const mockRepositories: GitRepository[] = [
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

      const mockPullRequests: PullRequest[] = [
        {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active' as PullRequestStatus,
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
          repository: mockRepositories[0],
          workItemRefs: [],
          labels: [],
          hasMultipleMergeBases: false,
          supportsIterations: true,
          artifactId: 'artifact1'
        }
      ];

      mockApiClient.getRepositories.resolves(mockRepositories);
      mockApiClient.getPullRequests.resolves(mockPullRequests);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequests();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].title, 'Test PR');
      assert.strictEqual(result[0].status, 'active');

      // Verify cache was set
      assert.ok(mockExtensionContext.workspaceState.update.called);
    });

    it('should apply status filter', async () => {
      const mockPullRequests: PullRequest[] = [
        { ...createMockPullRequest(1), status: 'active' as PullRequestStatus },
        { ...createMockPullRequest(2), status: 'completed' as PullRequestStatus }
      ];

      mockApiClient.getRepositories.resolves([createMockRepository()]);
      mockApiClient.getPullRequests.resolves(mockPullRequests);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequests({
        status: 'active'
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].status, 'active');
    });

    it('should apply search query filter', async () => {
      const mockPullRequests: PullRequest[] = [
        { ...createMockPullRequest(1), title: 'Feature implementation' },
        { ...createMockPullRequest(2), title: 'Bug fix' }
      ];

      mockApiClient.getRepositories.resolves([createMockRepository()]);
      mockApiClient.getPullRequests.resolves(mockPullRequests);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequests({
        searchQuery: 'feature'
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].title, 'Feature implementation');
    });

    it('should return cached data when available', async () => {
      const cachedData = [
        { ...createMockPullRequest(1), title: 'Cached PR' }
      ];

      const cachedWithTimestamp = {
        data: cachedData,
        timestamp: Date.now() - 1000 // 1 second ago
      };

      // Mock cache hit
      (mockExtensionContext.workspaceState.get as any).returns(cachedWithTimestamp);

      const result = await pullRequestService.getPullRequests();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].title, 'Cached PR');

      // API should not be called when cache is valid
      assert.ok(!mockApiClient.getRepositories.called);
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.getRepositories.rejects(new Error('API Error'));

      const result = await pullRequestService.getPullRequests();

      assert.strictEqual(result.length, 0);
    });
  });

  describe('getPullRequest', () => {
    it('should return specific pull request', async () => {
      const mockPullRequest = createMockPullRequest(1);
      mockApiClient.getPullRequest.resolves(mockPullRequest);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequest('repo1', 1);

      assert.strictEqual(result?.pullRequestId, 1);
      assert.strictEqual(result?.title, 'Test PR 1');

      // Verify cache was set
      assert.ok(mockExtensionContext.workspaceState.update.called);
    });

    it('should return null when pull request not found', async () => {
      mockApiClient.getPullRequest.rejects(new Error('Not found'));

      const result = await pullRequestService.getPullRequest('repo1', 999);

      assert.strictEqual(result, null);
    });
  });

  describe('createPullRequest', () => {
    it('should create new pull request successfully', async () => {
      const options = {
        title: 'New Feature',
        description: 'Implement new feature',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        repositoryId: 'repo1'
      };

      const createdPr = { ...createMockPullRequest(1), title: 'New Feature' };
      mockApiClient.post.resolves(createdPr);

      const result = await pullRequestService.createPullRequest(options);

      assert.ok(result.success);
      assert.strictEqual(result.pullRequest?.title, 'New Feature');

      // Verify cache invalidation
      assert.ok(mockExtensionContext.workspaceState.update.called);
    });

    it('should handle creation failure', async () => {
      const options = {
        title: 'New Feature',
        description: 'Implement new feature',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        repositoryId: 'repo1'
      };

      mockApiClient.post.rejects(new Error('Creation failed'));

      const result = await pullRequestService.createPullRequest(options);

      assert.ok(!result.success);
      assert.ok(result.error);
      assert.ok(result.error?.includes('Failed to create pull request'));
    });
  });

  describe('approvePullRequest', () => {
    it('should approve pull request successfully', async () => {
      mockApiClient.votePullRequest.resolves();

      const result = await pullRequestService.approvePullRequest('repo1', 1);

      assert.ok(result.success);

      // Verify cache invalidation
      assert.ok(mockExtensionContext.workspaceState.update.called);
    });

    it('should handle approval failure', async () => {
      mockApiClient.votePullRequest.rejects(new Error('Vote failed'));

      const result = await pullRequestService.approvePullRequest('repo1', 1);

      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  describe('rejectPullRequest', () => {
    it('should reject pull request with comment', async () => {
      mockApiClient.votePullRequest.resolves();
      mockApiClient.addComment.resolves({ id: 1, content: 'Needs work' } as any);

      const result = await pullRequestService.rejectPullRequest('repo1', 1, 'Needs work');

      assert.ok(result.success);

      // Verify both vote and comment were added
      assert.ok(mockApiClient.votePullRequest.calledWith('repo1', 1, -10));
      assert.ok(mockApiClient.addComment.calledWith('repo1', 1, 'Needs work'));
    });
  });

  describe('abandonPullRequest', () => {
    it('should abandon pull request successfully', async () => {
      mockApiClient.abandonPullRequest.resolves();

      const result = await pullRequestService.abandonPullRequest('repo1', 1);

      assert.ok(result.success);

      // Verify cache invalidation
      assert.ok(mockExtensionContext.workspaceState.update.called);
    });
  });

  describe('getPullRequestIterations', () => {
    it('should return pull request iterations', async () => {
      const mockIterations = [
        {
          id: 1,
          description: 'Initial version',
          author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
          createdDate: new Date('2023-01-01'),
          updatedDate: new Date('2023-01-01'),
          sourceRefCommit: createMockCommit(),
          targetRefCommit: createMockCommit(),
          commonRefCommit: createMockCommit(),
          hasMoreCommits: false,
          changeList: []
        }
      ];

      const mockResponse = { value: mockIterations };
      mockApiClient.get.resolves(mockResponse);

      const result = await pullRequestService.getPullRequestIterations('repo1', 1);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 1);
      assert.ok(result[0].createdDate instanceof Date);
    });
  });

  describe('getPullRequestChanges', () => {
    it('should return pull request changes', async () => {
      const mockChanges = [
        {
          changeId: 1,
          changeType: 'edit',
          item: {
            objectId: 'obj1',
            path: '/src/file.js',
            isFolder: false,
            url: '',
            gitObjectType: 'blob'
          }
        }
      ];

      const mockResponse = { value: mockChanges };
      mockApiClient.get.resolves(mockResponse);

      const result = await pullRequestService.getPullRequestChanges('repo1', 1);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].changeId, 1);
      assert.strictEqual(result[0].item.path, '/src/file.js');
    });
  });

  describe('autoRefresh', () => {
    it('should setup auto-refresh with interval', async () => {
      const mockCallback = sinon.stub();
      const intervalMs = 1000;

      pullRequestService.setupAutoRefresh({}, intervalMs, mockCallback);

      // Wait for interval to trigger
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify callback was called
      assert.ok(mockCallback.called);
    });

    it('should clear auto-refresh', () => {
      const mockCallback = sinon.stub();
      const intervalMs = 1000;

      pullRequestService.setupAutoRefresh({}, intervalMs, mockCallback);
      pullRequestService.clearAutoRefresh({});

      // This test mainly ensures the method doesn't throw
      assert.ok(true);
    });
  });

  describe('sorting', () => {
    it('should sort by created date descending by default', async () => {
      const mockPullRequests: PullRequest[] = [
        { ...createMockPullRequest(1), creationDate: new Date('2023-01-02') },
        { ...createMockPullRequest(2), creationDate: new Date('2023-01-01') }
      ];

      mockApiClient.getRepositories.resolves([createMockRepository()]);
      mockApiClient.getPullRequests.resolves(mockPullRequests);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequests({}, { sortBy: 'createdDate' });

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].pullRequestId, 1); // Most recent first
      assert.strictEqual(result[1].pullRequestId, 2);
    });

    it('should sort by title ascending', async () => {
      const mockPullRequests: PullRequest[] = [
        { ...createMockPullRequest(1), title: 'Zebra' },
        { ...createMockPullRequest(2), title: 'Apple' }
      ];

      mockApiClient.getRepositories.resolves([createMockRepository()]);
      mockApiClient.getPullRequests.resolves(mockPullRequests);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequests({}, { sortBy: 'title', sortOrder: 'asc' });

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].title, 'Apple');
      assert.strictEqual(result[1].title, 'Zebra');
    });
  });

  describe('pagination', () => {
    it('should apply pagination correctly', async () => {
      const mockPullRequests: PullRequest[] = Array.from({ length: 25 }, (_, i) => createMockPullRequest(i + 1));

      mockApiClient.getRepositories.resolves([createMockRepository()]);
      mockApiClient.getPullRequests.resolves(mockPullRequests);

      // Mock cache miss
      (mockExtensionContext.workspaceState.get as any).returns(null);

      const result = await pullRequestService.getPullRequests({
        skip: 10,
        maxResults: 5
      });

      assert.strictEqual(result.length, 5);
      assert.strictEqual(result[0].pullRequestId, 11);
      assert.strictEqual(result[4].pullRequestId, 15);
    });
  });
});

// Helper functions
function createMockPullRequest(id: number): PullRequest {
  return {
    pullRequestId: id,
    codeReviewId: id,
    status: 'active' as PullRequestStatus,
    createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
    creationDate: new Date(`2023-01-${String(id).padStart(2, '0')}`),
    closedDate: undefined,
    title: `Test PR ${id}`,
    description: `Test description ${id}`,
    sourceRefName: 'refs/heads/feature',
    targetRefName: 'refs/heads/main',
    mergeStatus: 'succeeded',
    isDraft: false,
    mergeId: `merge${id}`,
    lastMergeSourceCommit: createMockCommit(),
    lastMergeTargetCommit: createMockCommit(),
    reviewers: [],
    url: '',
    webUrl: '',
    repository: createMockRepository(),
    workItemRefs: [],
    labels: [],
    hasMultipleMergeBases: false,
    supportsIterations: true,
    artifactId: `artifact${id}`
  };
}

function createMockRepository(): GitRepository {
  return {
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
}

function createMockCommit() {
  return {
    commitId: 'commit1',
    author: { name: 'Test User', email: 'test@example.com', date: new Date() },
    committer: { name: 'Test User', email: 'test@example.com', date: new Date() },
    comment: 'Test commit',
    commentTruncated: false,
    url: '',
    remoteUrl: ''
  };
}