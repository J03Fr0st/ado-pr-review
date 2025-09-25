import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { CommentService } from '../../src/Services/CommentService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { StateManager } from '../../src/Services/StateManager';
import { CommentThread, Comment, Identity, GitRepository, PullRequest } from '../../src/api/models';

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
  get: sinon.stub(),
  post: sinon.stub(),
  patch: sinon.stub(),
  delete: sinon.stub(),
  getCommentThreads: sinon.stub(),
  createCommentThread: sinon.stub(),
  addComment: sinon.stub(),
  updateComment: sinon.stub(),
  deleteComment: sinon.stub()
} as any;

const mockConfigService = {
  getConfiguration: sinon.stub().returns({
    organizationUrl: 'https://dev.azure.com/test',
    project: 'Test Project'
  })
} as any;

const mockStateManager = {
  updateCommentThreads: sinon.stub(),
  getCommentThreadsForPullRequest: sinon.stub(),
  addStateUpdateListener: sinon.stub()
} as any;

describe('CommentService', () => {
  let commentService: CommentService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    commentService = new CommentService(
      mockApiClient,
      mockConfigService,
      mockStateManager,
      mockExtensionContext
    );
  });

  afterEach(() => {
    sandbox.restore();
    commentService.dispose();
  });

  describe('getCommentThreads', () => {
    it('should return comment threads with caching', async () => {
      const mockThreads: CommentThread[] = [
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
              content: 'Initial comment',
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

      mockApiClient.getCommentThreads.resolves({ value: mockThreads });
      mockStateManager.getCommentThreadsForPullRequest.returns([]);

      const result = await commentService.getCommentThreads('repo1', 1);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 1);
      assert.strictEqual(result[0].comments.length, 1);
      assert.strictEqual(result[0].comments[0].content, 'Initial comment');

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });

    it('should return cached comment threads when available', async () => {
      const cachedThreads: CommentThread[] = [
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

      mockStateManager.getCommentThreadsForPullRequest.returns(cachedThreads);

      const result = await commentService.getCommentThreads('repo1', 1);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 1);

      // API should not be called when cache is valid
      assert.ok(!mockApiClient.getCommentThreads.called);
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.getCommentThreads.rejects(new Error('API Error'));
      mockStateManager.getCommentThreadsForPullRequest.returns([]);

      const result = await commentService.getCommentThreads('repo1', 1);

      assert.strictEqual(result.length, 0);
    });

    it('should apply file filter', async () => {
      const mockThreads: CommentThread[] = [
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
        },
        {
          id: 2,
          threadContext: {
            filePath: '/src/other.ts',
            rightFileStart: { line: 5, char: 0 },
            rightFileEnd: { line: 10, char: 0 }
          },
          comments: [],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        }
      ];

      mockApiClient.getCommentThreads.resolves({ value: mockThreads });
      mockStateManager.getCommentThreadsForPullRequest.returns([]);

      const result = await commentService.getCommentThreads('repo1', 1, {
        filePath: '/src/test.ts'
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].threadContext?.filePath, '/src/test.ts');
    });
  });

  describe('createCommentThread', () => {
    it('should create new comment thread successfully', async () => {
      const threadData = {
        content: 'New comment',
        filePath: '/src/test.ts',
        lineNumber: 10
      };

      const createdThread: CommentThread = {
        id: 1,
        threadContext: {
          filePath: '/src/test.ts',
          rightFileStart: { line: 10, char: 0 },
          rightFileEnd: { line: 10, char: 5 }
        },
        comments: [
          {
            id: 1,
            author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
            content: 'New comment',
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
      };

      mockApiClient.createCommentThread.resolves(createdThread);

      const result = await commentService.createCommentThread('repo1', 1, threadData);

      assert.ok(result.success);
      assert.strictEqual(result.thread?.id, 1);
      assert.strictEqual(result.thread?.comments[0].content, 'New comment');

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });

    it('should handle creation failure', async () => {
      const threadData = {
        content: 'New comment',
        filePath: '/src/test.ts',
        lineNumber: 10
      };

      mockApiClient.createCommentThread.rejects(new Error('Creation failed'));

      const result = await commentService.createCommentThread('repo1', 1, threadData);

      assert.ok(!result.success);
      assert.ok(result.error);
      assert.ok(result.error?.includes('Failed to create comment thread'));
    });

    it('should validate required fields', async () => {
      const threadData = {
        content: '',
        filePath: '',
        lineNumber: -1
      };

      const result = await commentService.createCommentThread('repo1', 1, threadData);

      assert.ok(!result.success);
      assert.ok(result.error?.includes('Content is required'));
    });
  });

  describe('addComment', () => {
    it('should add comment to existing thread successfully', async () => {
      const commentData = {
        content: 'Reply to thread',
        parentCommentId: 1
      };

      const addedComment: Comment = {
        id: 2,
        author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        content: 'Reply to thread',
        publishedDate: new Date('2023-01-01'),
        lastUpdatedDate: new Date('2023-01-01'),
        isDeleted: false,
        isEdited: false,
        isLiked: false,
        likeCount: 0,
        parentCommentId: 1
      };

      mockApiClient.addComment.resolves(addedComment);

      const result = await commentService.addComment('repo1', 1, 1, commentData);

      assert.ok(result.success);
      assert.strictEqual(result.comment?.id, 2);
      assert.strictEqual(result.comment?.content, 'Reply to thread');
      assert.strictEqual(result.comment?.parentCommentId, 1);

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });

    it('should handle comment addition failure', async () => {
      const commentData = {
        content: 'Reply to thread',
        parentCommentId: 1
      };

      mockApiClient.addComment.rejects(new Error('Add comment failed'));

      const result = await commentService.addComment('repo1', 1, 1, commentData);

      assert.ok(!result.success);
      assert.ok(result.error);
    });

    it('should validate comment content', async () => {
      const commentData = {
        content: '',
        parentCommentId: 1
      };

      const result = await commentService.addComment('repo1', 1, 1, commentData);

      assert.ok(!result.success);
      assert.ok(result.error?.includes('Content is required'));
    });
  });

  describe('updateComment', () => {
    it('should update comment successfully', async () => {
      const updateData = {
        content: 'Updated comment'
      };

      const updatedComment: Comment = {
        id: 1,
        author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        content: 'Updated comment',
        publishedDate: new Date('2023-01-01'),
        lastUpdatedDate: new Date('2023-01-02'),
        isDeleted: false,
        isEdited: true,
        isLiked: false,
        likeCount: 0
      };

      mockApiClient.updateComment.resolves(updatedComment);

      const result = await commentService.updateComment('repo1', 1, 1, updateData);

      assert.ok(result.success);
      assert.strictEqual(result.comment?.content, 'Updated comment');
      assert.strictEqual(result.comment?.isEdited, true);

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });

    it('should handle update failure', async () => {
      const updateData = {
        content: 'Updated comment'
      };

      mockApiClient.updateComment.rejects(new Error('Update failed'));

      const result = await commentService.updateComment('repo1', 1, 1, updateData);

      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  describe('deleteComment', () => {
    it('should delete comment successfully', async () => {
      mockApiClient.deleteComment.resolves();

      const result = await commentService.deleteComment('repo1', 1, 1);

      assert.ok(result.success);

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });

    it('should handle delete failure', async () => {
      mockApiClient.deleteComment.rejects(new Error('Delete failed'));

      const result = await commentService.deleteComment('repo1', 1, 1);

      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  describe('resolveCommentThread', () => {
    it('should resolve thread successfully', async () => {
      const resolvedThread: CommentThread = {
        id: 1,
        status: 'resolved',
        threadContext: {
          filePath: '/src/test.ts',
          rightFileStart: { line: 10, char: 0 },
          rightFileEnd: { line: 15, char: 0 }
        },
        comments: [],
        publishedDate: new Date('2023-01-01'),
        lastUpdatedDate: new Date('2023-01-01'),
        isDeleted: false,
        properties: {}
      };

      mockApiClient.patch.resolves(resolvedThread);

      const result = await commentService.resolveCommentThread('repo1', 1, 1);

      assert.ok(result.success);
      assert.strictEqual(result.thread?.status, 'resolved');

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });

    it('should handle resolve failure', async () => {
      mockApiClient.patch.rejects(new Error('Resolve failed'));

      const result = await commentService.resolveCommentThread('repo1', 1, 1);

      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  describe('reactivateCommentThread', () => {
    it('should reactivate thread successfully', async () => {
      const reactivatedThread: CommentThread = {
        id: 1,
        status: 'active',
        threadContext: {
          filePath: '/src/test.ts',
          rightFileStart: { line: 10, char: 0 },
          rightFileEnd: { line: 15, char: 0 }
        },
        comments: [],
        publishedDate: new Date('2023-01-01'),
        lastUpdatedDate: new Date('2023-01-01'),
        isDeleted: false,
        properties: {}
      };

      mockApiClient.patch.resolves(reactivatedThread);

      const result = await commentService.reactivateCommentThread('repo1', 1, 1);

      assert.ok(result.success);
      assert.strictEqual(result.thread?.status, 'active');

      // Verify state manager was updated
      assert.ok(mockStateManager.updateCommentThreads.called);
    });
  });

  describe('searchComments', () => {
    it('should search comments across pull requests', async () => {
      const mockThreads: CommentThread[] = [
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
              content: 'This is a bug fix',
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
        },
        {
          id: 2,
          threadContext: {
            filePath: '/src/other.ts',
            rightFileStart: { line: 5, char: 0 },
            rightFileEnd: { line: 10, char: 0 }
          },
          comments: [
            {
              id: 2,
              author: { id: 'user2', displayName: 'Other User', uniqueName: 'other@example.com' } as Identity,
              content: 'Feature implementation',
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

      // Mock the internal getCommentThreadsForRepository method
      sandbox.stub(commentService, 'getCommentThreadsForRepository').resolves(mockThreads);

      const result = await commentService.searchComments('repo1', {
        query: 'bug',
        authorId: 'user1'
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].threadId, 1);
      assert.strictEqual(result[0].comment.content, 'This is a bug fix');
    });

    it('should return empty array when no matches found', async () => {
      const mockThreads: CommentThread[] = [
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
              content: 'Feature implementation',
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

      sandbox.stub(commentService, 'getCommentThreadsForRepository').resolves(mockThreads);

      const result = await commentService.searchComments('repo1', {
        query: 'bug'
      });

      assert.strictEqual(result.length, 0);
    });
  });

  describe('getCommentStatistics', () => {
    it('should return comment statistics for repository', async () => {
      const mockThreads: CommentThread[] = [
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
              content: 'Comment 1',
              publishedDate: new Date('2023-01-01'),
              lastUpdatedDate: new Date('2023-01-01'),
              isDeleted: false,
              isEdited: false,
              isLiked: true,
              likeCount: 2
            }
          ],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        },
        {
          id: 2,
          threadContext: {
            filePath: '/src/other.ts',
            rightFileStart: { line: 5, char: 0 },
            rightFileEnd: { line: 10, char: 0 }
          },
          comments: [
            {
              id: 2,
              author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
              content: 'Comment 2',
              publishedDate: new Date('2023-01-01'),
              lastUpdatedDate: new Date('2023-01-01'),
              isDeleted: false,
              isEdited: true,
              isLiked: false,
              likeCount: 0
            }
          ],
          status: 'resolved',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        }
      ];

      sandbox.stub(commentService, 'getCommentThreadsForRepository').resolves(mockThreads);

      const result = await commentService.getCommentStatistics('repo1');

      assert.strictEqual(result.totalThreads, 2);
      assert.strictEqual(result.totalComments, 2);
      assert.strictEqual(result.activeThreads, 1);
      assert.strictEqual(result.resolvedThreads, 1);
      assert.strictEqual(result.totalLikes, 2);
      assert.strictEqual(result.uniqueAuthors, 1);
    });

    it('should return empty statistics when no threads exist', async () => {
      sandbox.stub(commentService, 'getCommentThreadsForRepository').resolves([]);

      const result = await commentService.getCommentStatistics('repo1');

      assert.strictEqual(result.totalThreads, 0);
      assert.strictEqual(result.totalComments, 0);
      assert.strictEqual(result.activeThreads, 0);
      assert.strictEqual(result.resolvedThreads, 0);
      assert.strictEqual(result.totalLikes, 0);
      assert.strictEqual(result.uniqueAuthors, 0);
    });
  });

  describe('event handling', () => {
    it('should emit events on comment operations', async () => {
      const eventListener = sinon.stub();
      commentService.addCommentUpdateListener(eventListener);

      const addedComment: Comment = {
        id: 1,
        author: { id: 'user1', displayName: 'Test User', uniqueName: 'test@example.com' } as Identity,
        content: 'New comment',
        publishedDate: new Date('2023-01-01'),
        lastUpdatedDate: new Date('2023-01-01'),
        isDeleted: false,
        isEdited: false,
        isLiked: false,
        likeCount: 0
      };

      mockApiClient.addComment.resolves(addedComment);

      await commentService.addComment('repo1', 1, 1, { content: 'New comment' });

      assert.ok(eventListener.called);
      const event = eventListener.firstCall.args[0];
      assert.strictEqual(event.type, 'commentAdded');
      assert.strictEqual(event.data.commentId, 1);
    });
  });

  describe('utility methods', () => {
    it('should filter threads by file path', () => {
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
        },
        {
          id: 2,
          threadContext: {
            filePath: '/src/other.ts',
            rightFileStart: { line: 5, char: 0 },
            rightFileEnd: { line: 10, char: 0 }
          },
          comments: [],
          status: 'active',
          publishedDate: new Date('2023-01-01'),
          lastUpdatedDate: new Date('2023-01-01'),
          isDeleted: false,
          properties: {}
        }
      ];

      const filtered = commentService['filterThreadsByFile'](threads, '/src/test.ts');

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].threadContext?.filePath, '/src/test.ts');
    });

    it('should search within thread comments', () => {
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
              content: 'This is a bug fix',
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

      const results = commentService['searchInThreads'](threads, 'bug');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].threadId, 1);
      assert.strictEqual(results[0].comment.content, 'This is a bug fix');
    });

    it('should handle empty search results', () => {
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
              content: 'Feature implementation',
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

      const results = commentService['searchInThreads'](threads, 'nonexistent');

      assert.strictEqual(results.length, 0);
    });
  });
});