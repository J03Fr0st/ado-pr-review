import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { PullRequest, PullRequestStatus, CommentThread, Identity, GitRepository } from '../../src/api/models';

// Mock VS Code Extension Context
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

// Mock Configuration Service
const mockConfigService = {
  getConfiguration: sinon.stub().returns({
    organizationUrl: 'https://dev.azure.com/test',
    project: 'Test Project',
    apiVersion: '7.1-preview.1'
  })
} as any;

describe('Azure DevOps API Mocking Tests', () => {
  let apiClient: AzureDevOpsApiClient;
  let authService: AuthenticationService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Reset mock behaviors
    mockExtensionContext.workspaceState.get.reset();
    mockExtensionContext.workspaceState.update.reset();
    mockExtensionContext.globalState.get.reset();
    mockExtensionContext.globalState.update.reset();
    mockExtensionContext.secrets.get.reset();
    mockExtensionContext.secrets.store.reset();

    // Create mock authentication service
    authService = {
      authenticate: sandbox.stub(),
      getToken: sandbox.stub().resolves('mock-token'),
      isAuthenticated: sandbox.stub().returns(true),
      logout: sandbox.stub()
    } as any;

    // Create API client
    apiClient = new AzureDevOpsApiClient(authService, mockConfigService, mockExtensionContext);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Rate Limiting Simulation', () => {
    it('should handle rate limiting gracefully', async () => {
      // Mock axios interceptor directly instead of fetch
      const mockAxiosGet = sandbox.stub();
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).response = {
        status: 429,
        headers: {
          'retry-after': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': '100'
        }
      };
      mockAxiosGet.onFirstCall().rejects(rateLimitError);
      mockAxiosGet.onSecondCall().resolves({
        data: { value: [] }
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      // Test rate limiting behavior
      const startTime = Date.now();
      const result = await apiClient.getRepositories();
      const endTime = Date.now();

      assert.ok(result);
      assert.ok(endTime - startTime >= 4000); // Should wait for retry-after
    });

    it('should handle multiple concurrent requests with rate limiting', async () => {
      const mockAxiosGet = sandbox.stub();
      let callCount = 0;

      mockAxiosGet.callsFake(() => {
        callCount++;
        if (callCount <= 3) {
          const error = new Error('Rate limit exceeded');
          (error as any).response = {
            status: 429,
            headers: {
              'retry-after': '1'
            }
          };
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: { value: [] }
        });
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      // Make concurrent requests
      const requests = [
        apiClient.getRepositories(),
        apiClient.getPullRequests('repo1'),
        apiClient.getPullRequest('repo1', 1)
      ];

      const results = await Promise.all(requests);
      assert.strictEqual(results.length, 3);
      assert.ok(callCount > 3); // Should have retries
    });
  });

  describe('Network Error Simulation', () => {
    it('should handle network timeouts', async () => {
      // Mock timeout error
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.rejects(new Error('Network timeout'));

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      // Test timeout handling
      await assert.rejects(
        async () => {
          await apiClient.getRepositories();
        },
        /Network timeout/
      );
    });

    it('should handle connection errors', async () => {
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.rejects(new Error('Connection refused'));

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      await assert.rejects(
        async () => {
          await apiClient.getPullRequests('repo1');
        },
        /Connection refused/
      );
    });

    it('should handle DNS resolution errors', async () => {
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.rejects(new Error('ENOTFOUND dev.azure.com'));

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      await assert.rejects(
        async () => {
          await apiClient.getPullRequest('repo1', 1);
        },
        /ENOTFOUND/
      );
    });
  });

  describe('API Response Simulation', () => {
    it('should handle empty responses', async () => {
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.resolves({
        data: { value: [] }
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      const result = await apiClient.getRepositories();
      assert.deepStrictEqual(result, []);
    });

    it('should handle paginated responses', async () => {
      const mockRepositories: GitRepository[] = [
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
        }
      ];

      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.resolves({
        data: { value: mockRepositories }
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      const result = await apiClient.getRepositories();
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'repo1');
    });

    it('should handle API version errors', async () => {
      const mockAxiosGet = sandbox.stub();
      const apiError = new Error('Unsupported API version');
      (apiError as any).response = {
        status: 400,
        data: {
          typeKey: 'UnsupportedApiVersion',
          message: 'The requested API version is not supported'
        }
      };
      mockAxiosGet.rejects(apiError);

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      await assert.rejects(
        async () => {
          await apiClient.getRepositories();
        },
        /UnsupportedApiVersion/
      );
    });
  });

  describe('Authentication Error Simulation', () => {
    it('should handle authentication failures', async () => {
      const mockAxiosGet = sandbox.stub();
      const authError = new Error('Authentication failed');
      (authError as any).response = {
        status: 401,
        data: {
          typeKey: 'Unauthorized',
          message: 'Access token is missing or invalid'
        }
      };
      mockAxiosGet.rejects(authError);

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      await assert.rejects(
        async () => {
          await apiClient.getRepositories();
        },
        /Unauthorized/
      );
    });

    it('should handle token expiration', async () => {
      const mockAxiosGet = sandbox.stub();
      const tokenError = new Error('Token expired');
      (tokenError as any).response = {
        status: 403,
        data: {
          typeKey: 'AccessTokenExpired',
          message: 'Access token has expired'
        }
      };
      mockAxiosGet.rejects(tokenError);

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      await assert.rejects(
        async () => {
          await apiClient.getPullRequests('repo1');
        },
        /AccessTokenExpired/
      );
    });

    it('should handle insufficient permissions', async () => {
      const mockAxiosGet = sandbox.stub();
      const permError = new Error('Insufficient permissions');
      (permError as any).response = {
        status: 403,
        data: {
          typeKey: 'InsufficientPermissions',
          message: 'User does not have required permissions'
        }
      };
      mockAxiosGet.rejects(permError);

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      await assert.rejects(
        async () => {
          await apiClient.getPullRequests('repo1');
        },
        /InsufficientPermissions/
      );
    });
  });

  describe('Data Validation Simulation', () => {
    it('should handle malformed API responses', async () => {
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.resolves({
        data: {
          value: [
            {
              id: 'repo1',
              name: 'Test Repository',
              project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() } // Minimal valid data
            }
          ]
        }
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      // Should handle data correctly
      const result = await apiClient.getRepositories();
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'repo1');
    });

    it('should handle unexpected data types', async () => {
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.resolves({
        data: {
          value: "Not an array" // Unexpected data type
        }
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      const result = await apiClient.getRepositories();
      assert.deepStrictEqual(result, []);
    });

    it('should handle null/undefined responses', async () => {
      const mockAxiosGet = sandbox.stub();
      mockAxiosGet.resolves({
        data: null
      });

      // Replace axios get method
      (apiClient as any).axiosInstance.get = mockAxiosGet;

      const result = await apiClient.getRepositories();
      assert.deepStrictEqual(result, []);
    });
  });

  describe('Error Recovery Simulation', () => {
    it('should retry failed requests', async () => {
      let callCount = 0;
      const mockFetch = sandbox.stub();

      mockFetch.callsFake(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          status: 200,
          json: sandbox.stub().resolves({ value: [] })
        });
      });

      (global as any).fetch = mockFetch;

      const result = await apiClient.getRepositories();
      assert.ok(result);
      assert.strictEqual(callCount, 3); // Should have retried twice
    });

    it('should handle server errors (5xx)', async () => {
      const mockFetch = sandbox.stub();
      mockFetch.resolves({
        status: 500,
        json: sandbox.stub().resolves({
          typeKey: 'InternalServerError',
          message: 'An unexpected error occurred'
        })
      });

      (global as any).fetch = mockFetch;

      await assert.rejects(
        async () => {
          await apiClient.getRepositories();
        },
        /InternalServerError/
      );
    });

    it('should handle service unavailable', async () => {
      const mockFetch = sandbox.stub();
      mockFetch.resolves({
        status: 503,
        json: sandbox.stub().resolves({
          typeKey: 'ServiceUnavailable',
          message: 'Service is temporarily unavailable'
        })
      });

      (global as any).fetch = mockFetch;

      await assert.rejects(
        async () => {
          await apiClient.getPullRequests('repo1');
        },
        /ServiceUnavailable/
      );
    });
  });

  describe('Performance Simulation', () => {
    it('should handle slow responses', async () => {
      const mockFetch = sandbox.stub();
      mockFetch.callsFake(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              status: 200,
              json: sandbox.stub().resolves({ value: [] })
            });
          }, 1000); // 1 second delay
        });
      });

      (global as any).fetch = mockFetch;

      const startTime = Date.now();
      const result = await apiClient.getRepositories();
      const endTime = Date.now();

      assert.ok(result);
      assert.ok(endTime - startTime >= 900); // Should take at least 1 second
    });

    it('should handle large responses', async () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: `repo${i}`,
        name: `Repository ${i}`,
        url: `https://dev.azure.com/test/test/_git/repo${i}`,
        project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
        defaultBranch: 'refs/heads/main',
        size: 1024,
        remoteUrl: `https://dev.azure.com/test/test/_git/repo${i}`,
        sshUrl: `git@ssh.dev.azure.com:v3/test/test/repo${i}`,
        webUrl: `https://dev.azure.com/test/test/_git/repo${i}`,
        isDisabled: false
      }));

      const mockFetch = sandbox.stub();
      mockFetch.resolves({
        status: 200,
        json: sandbox.stub().resolves({ value: largeData })
      });

      (global as any).fetch = mockFetch;

      const result = await apiClient.getRepositories();
      assert.strictEqual(result.length, 1000);
    });
  });

  describe('Request Validation Simulation', () => {
    it('should validate request parameters', async () => {
      const mockFetch = sandbox.stub();
      mockFetch.resolves({
        status: 400,
        json: sandbox.stub().resolves({
          typeKey: 'InvalidRequest',
          message: 'Invalid request parameters'
        })
      });

      (global as any).fetch = mockFetch;

      await assert.rejects(
        async () => {
          await apiClient.getPullRequest('', 1); // Empty repository ID
        },
        /InvalidRequest/
      );
    });

    it('should handle malformed request URLs', async () => {
      const mockFetch = sandbox.stub();
      mockFetch.rejects(new Error('Invalid URL'));

      (global as any).fetch = mockFetch;

      await assert.rejects(
        async () => {
          await apiClient.getRepositories();
        },
        /Invalid URL/
      );
    });
  });

  describe('Mock Server Integration', () => {
    it('should work with mock server responses', async () => {
      // Test with a mock server that returns consistent responses
      const mockRepositories = [
        {
          id: 'mock-repo-1',
          name: 'Mock Repository 1',
          url: 'https://dev.azure.com/test/test/_git/mock-repo-1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/mock-repo-1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/mock-repo-1',
          webUrl: 'https://dev.azure.com/test/test/_git/mock-repo-1',
          isDisabled: false
        }
      ];

      const mockPullRequests = [
        {
          pullRequestId: 1,
          codeReviewId: 1,
          status: 'active' as PullRequestStatus,
          createdBy: { id: 'user1', displayName: 'Test User', uniqueName: 'user1@example.com' } as Identity,
          creationDate: new Date(),
          title: 'Mock Pull Request',
          description: 'Test pull request from mock server',
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

      const mockFetch = sandbox.stub();
      mockFetch.callsFake((url: string) => {
        if (url.includes('/repositories')) {
          return Promise.resolve({
            status: 200,
            json: sandbox.stub().resolves({ value: mockRepositories })
          });
        } else if (url.includes('/pullrequests')) {
          return Promise.resolve({
            status: 200,
            json: sandbox.stub().resolves({ value: mockPullRequests })
          });
        }
        return Promise.resolve({
          status: 200,
          json: sandbox.stub().resolves({ value: [] })
        });
      });

      (global as any).fetch = mockFetch;

      // Test repositories
      const repos = await apiClient.getRepositories();
      assert.strictEqual(repos.length, 1);
      assert.strictEqual(repos[0].id, 'mock-repo-1');

      // Test pull requests
      const prs = await apiClient.getPullRequests('mock-repo-1');
      assert.strictEqual(prs.length, 1);
      assert.strictEqual(prs[0].title, 'Mock Pull Request');
    });

    it('should handle mock server state changes', async () => {
      const mockData = {
        repositories: [] as GitRepository[],
        pullRequests: [] as PullRequest[]
      };

      const mockFetch = sandbox.stub();
      mockFetch.callsFake((url: string) => {
        if (url.includes('/repositories')) {
          return Promise.resolve({
            status: 200,
            json: sandbox.stub().resolves({ value: mockData.repositories })
          });
        } else if (url.includes('/pullrequests')) {
          return Promise.resolve({
            status: 200,
            json: sandbox.stub().resolves({ value: mockData.pullRequests })
          });
        }
        return Promise.resolve({
          status: 200,
          json: sandbox.stub().resolves({ value: [] })
        });
      });

      (global as any).fetch = mockFetch;

      // Initial state (empty)
      let repos = await apiClient.getRepositories();
      assert.strictEqual(repos.length, 0);

      // Update mock data
      mockData.repositories = [
        {
          id: 'dynamic-repo-1',
          name: 'Dynamic Repository 1',
          url: 'https://dev.azure.com/test/test/_git/dynamic-repo-1',
          project: { id: 'project1', name: 'Test Project', url: '', state: 'wellFormed', revision: 1, visibility: 'private', lastUpdateTime: new Date() },
          defaultBranch: 'refs/heads/main',
          size: 1024,
          remoteUrl: 'https://dev.azure.com/test/test/_git/dynamic-repo-1',
          sshUrl: 'git@ssh.dev.azure.com:v3/test/test/dynamic-repo-1',
          webUrl: 'https://dev.azure.com/test/test/_git/dynamic-repo-1',
          isDisabled: false
        }
      ];

      // Should return updated data
      repos = await apiClient.getRepositories();
      assert.strictEqual(repos.length, 1);
      assert.strictEqual(repos[0].id, 'dynamic-repo-1');
    });
  });
});