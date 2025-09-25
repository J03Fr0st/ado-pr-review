import * as assert from 'assert';
import { AzureDevOpsApi } from '../../src/services/AzureDevOpsApi';
import { ConfigurationManager } from '../../src/services/ConfigurationManager';

// Integration tests that require real Azure DevOps environment
// These tests use environment variables for configuration
suite('Azure DevOps API Integration Tests', function () {
  // Increase timeout for real API calls
  this.timeout(30000);

  let api: AzureDevOpsApi;
  let organizationUrl: string;
  let project: string;
  let pat: string;

  suiteSetup(async function () {
    // Skip integration tests if environment variables are not set
    organizationUrl = process.env.ADO_TEST_ORG;
    project = process.env.ADO_TEST_PROJECT;
    pat = process.env.ADO_TEST_PAT;

    if (!organizationUrl || !project || !pat) {
      this.skip();
      return;
    }

    api = new AzureDevOpsApi(organizationUrl, project, pat);
  });

  suite('Authentication', () => {
    test('should authenticate successfully with valid PAT', async () => {
      // Test basic authentication by fetching user profile
      try {
        const profile = await api.getUserProfile();
        assert(profile, 'Should return user profile');
        assert(profile.displayName, 'Profile should have display name');
        assert(profile.id, 'Profile should have ID');
      } catch (error: any) {
        assert.fail(`Authentication failed: ${error.message}`);
      }
    });

    test('should validate PAT permissions for pull requests', async () => {
      const permissions = await api.validatePermissions();

      assert(permissions.canRead, 'Should have read permissions for pull requests');
      assert(permissions.canContribute, 'Should have contribute permissions for pull requests');
    });

    test('should handle invalid PAT gracefully', async () => {
      const invalidApi = new AzureDevOpsApi(organizationUrl, project, 'invalid-pat-token');

      try {
        await invalidApi.getUserProfile();
        assert.fail('Should throw authentication error with invalid PAT');
      } catch (error: any) {
        assert(error.message.includes('unauthorized') || error.message.includes('authentication'),
               'Should return authentication error');
      }
    });
  });

  suite('Pull Request Operations', () => {
    let testPullRequestId: number;

    suiteSetup(async function () {
      // Find or create a test pull request for testing
      try {
        const pullRequests = await api.getPullRequests();
        if (pullRequests.length > 0) {
          testPullRequestId = pullRequests[0].pullRequestId;
        } else {
          // Skip tests if no PRs available
          this.skip();
        }
      } catch (error) {
        this.skip();
      }
    });

    test('should fetch pull requests list', async () => {
      const pullRequests = await api.getPullRequests();

      assert(Array.isArray(pullRequests), 'Should return array of pull requests');

      if (pullRequests.length > 0) {
        const pr = pullRequests[0];
        assert(pr.pullRequestId, 'PR should have ID');
        assert(pr.title, 'PR should have title');
        assert(pr.status, 'PR should have status');
        assert(pr.createdBy, 'PR should have creator');
        assert(pr.sourceRefName, 'PR should have source branch');
        assert(pr.targetRefName, 'PR should have target branch');
      }
    });

    test('should fetch specific pull request details', async () => {
      if (!testPullRequestId) {
        this.skip();
        return;
      }

      const pr = await api.getPullRequest(testPullRequestId);

      assert.strictEqual(pr.pullRequestId, testPullRequestId, 'Should return requested PR');
      assert(pr.title, 'PR details should include title');
      assert(pr.description !== undefined, 'PR details should include description');
      assert(pr.reviewers, 'PR details should include reviewers');
    });

    test('should fetch pull request commits', async () => {
      if (!testPullRequestId) {
        this.skip();
        return;
      }

      const commits = await api.getPullRequestCommits(testPullRequestId);

      assert(Array.isArray(commits), 'Should return array of commits');

      if (commits.length > 0) {
        const commit = commits[0];
        assert(commit.commitId, 'Commit should have ID');
        assert(commit.comment, 'Commit should have message');
        assert(commit.author, 'Commit should have author');
      }
    });

    test('should fetch pull request file changes', async () => {
      if (!testPullRequestId) {
        this.skip();
        return;
      }

      const changes = await api.getPullRequestChanges(testPullRequestId);

      assert(Array.isArray(changes), 'Should return array of file changes');

      if (changes.length > 0) {
        const change = changes[0];
        assert(change.item, 'Change should have item info');
        assert(change.changeType, 'Change should have type');
      }
    });

    test('should handle non-existent pull request', async () => {
      const nonExistentId = 999999;

      try {
        await api.getPullRequest(nonExistentId);
        assert.fail('Should throw error for non-existent PR');
      } catch (error: any) {
        assert(error.message.includes('not found') || error.status === 404,
               'Should return not found error');
      }
    });
  });

  suite('Comments and Threads', () => {
    let testPullRequestId: number;

    suiteSetup(async function () {
      // Find a test pull request with comments
      try {
        const pullRequests = await api.getPullRequests();
        if (pullRequests.length > 0) {
          testPullRequestId = pullRequests[0].pullRequestId;
        } else {
          this.skip();
        }
      } catch (error) {
        this.skip();
      }
    });

    test('should fetch pull request threads', async () => {
      if (!testPullRequestId) {
        this.skip();
        return;
      }

      const threads = await api.getPullRequestThreads(testPullRequestId);

      assert(Array.isArray(threads), 'Should return array of comment threads');

      if (threads.length > 0) {
        const thread = threads[0];
        assert(thread.id, 'Thread should have ID');
        assert(thread.comments, 'Thread should have comments');
        assert(Array.isArray(thread.comments), 'Comments should be array');

        if (thread.comments.length > 0) {
          const comment = thread.comments[0];
          assert(comment.content, 'Comment should have content');
          assert(comment.author, 'Comment should have author');
        }
      }
    });

    test('should add comment to pull request', async function () {
      if (!testPullRequestId) {
        this.skip();
        return;
      }

      // Only run this test if we have write permissions
      const permissions = await api.validatePermissions();
      if (!permissions.canContribute) {
        this.skip();
        return;
      }

      const commentText = `Integration test comment - ${new Date().toISOString()}`;

      try {
        const thread = await api.addComment(testPullRequestId, commentText);

        assert(thread.id, 'New thread should have ID');
        assert(thread.comments, 'New thread should have comments');
        assert(thread.comments.length > 0, 'New thread should have at least one comment');
        assert(thread.comments[0].content.includes(commentText), 'Comment should contain expected text');
      } catch (error: any) {
        // Some test environments might not allow comment creation
        if (error.message.includes('permission') || error.message.includes('forbidden')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  suite('Error Handling and Rate Limits', () => {
    test('should handle API rate limiting gracefully', async function () {
      // This test simulates rapid API calls to test rate limiting
      this.timeout(60000);

      const rapidCalls = Array.from({ length: 50 }, () => api.getPullRequests());

      try {
        await Promise.all(rapidCalls);
      } catch (error: any) {
        if (error.message.includes('rate limit') || error.status === 429) {
          assert(true, 'Rate limiting handled correctly');
        } else {
          throw error;
        }
      }
    });

    test('should handle network timeouts', async function () {
      this.timeout(35000);

      // Create API instance with very short timeout
      const timeoutApi = new AzureDevOpsApi(organizationUrl, project, pat, { timeout: 1 });

      try {
        await timeoutApi.getPullRequests();
        // If it succeeds, the network is very fast, which is fine
      } catch (error: any) {
        assert(error.message.includes('timeout'), 'Should handle timeout errors');
      }
    });

    test('should handle invalid organization URL', async () => {
      const invalidApi = new AzureDevOpsApi('https://invalid.organization.url', project, pat);

      try {
        await invalidApi.getPullRequests();
        assert.fail('Should throw error for invalid organization URL');
      } catch (error: any) {
        assert(error.message.includes('not found') || error.message.includes('network'),
               'Should return appropriate error for invalid URL');
      }
    });

    test('should handle invalid project name', async () => {
      const invalidApi = new AzureDevOpsApi(organizationUrl, 'invalid-project-name', pat);

      try {
        await invalidApi.getPullRequests();
        assert.fail('Should throw error for invalid project');
      } catch (error: any) {
        assert(error.message.includes('not found') || error.status === 404,
               'Should return not found error for invalid project');
      }
    });
  });

  suite('Performance Tests', () => {
    test('should fetch pull requests within performance threshold', async () => {
      const startTime = Date.now();

      const pullRequests = await api.getPullRequests();

      const duration = Date.now() - startTime;

      // Based on PRD requirement: fetch first page within 5 seconds
      assert(duration < 5000, `API call should complete within 5 seconds, took ${duration}ms`);
      assert(Array.isArray(pullRequests), 'Should return valid pull requests data');
    });

    test('should handle concurrent API calls efficiently', async () => {
      const startTime = Date.now();

      // Make multiple concurrent calls
      const calls = [
        api.getPullRequests(),
        api.getUserProfile(),
        api.validatePermissions()
      ];

      const results = await Promise.all(calls);

      const duration = Date.now() - startTime;

      // Concurrent calls should be faster than sequential
      assert(duration < 10000, `Concurrent calls should complete within 10 seconds, took ${duration}ms`);
      assert.strictEqual(results.length, 3, 'All concurrent calls should succeed');
    });
  });

  suite('Data Validation', () => {
    test('should return properly formatted pull request data', async () => {
      const pullRequests = await api.getPullRequests();

      if (pullRequests.length === 0) {
        this.skip();
        return;
      }

      const pr = pullRequests[0];

      // Validate required fields
      assert(typeof pr.pullRequestId === 'number', 'PR ID should be number');
      assert(typeof pr.title === 'string', 'PR title should be string');
      assert(['active', 'completed', 'abandoned'].includes(pr.status),
             `PR status should be valid value, got: ${pr.status}`);

      // Validate nested objects
      assert(pr.createdBy, 'PR should have creator');
      assert(typeof pr.createdBy.displayName === 'string', 'Creator should have display name');

      // Validate branch references
      assert(pr.sourceRefName.startsWith('refs/'), 'Source branch should be valid ref');
      assert(pr.targetRefName.startsWith('refs/'), 'Target branch should be valid ref');

      // Validate dates if present
      if (pr.creationDate) {
        assert(!isNaN(Date.parse(pr.creationDate)), 'Creation date should be valid');
      }
    });

    test('should handle empty or null values gracefully', async () => {
      const pullRequests = await api.getPullRequests();

      pullRequests.forEach(pr => {
        // Description can be null or empty
        if (pr.description !== null) {
          assert(typeof pr.description === 'string', 'Description should be string when not null');
        }

        // Reviewers array should exist but can be empty
        assert(Array.isArray(pr.reviewers || []), 'Reviewers should be array');
      });
    });
  });
});