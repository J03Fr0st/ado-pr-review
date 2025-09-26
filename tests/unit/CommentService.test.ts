import { CommentService } from '../../src/services/CommentService';
import { AzureDevOpsApiClient } from '../../src/api/AzureDevOpsApiClient';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { StateManager } from '../../src/services/StateManager';

describe('CommentService Tests', () => {
  let commentService: CommentService;
  let mockApiClient: any;
  let mockConfigService: any;
  let mockStateManager: any;
  let mockExtensionContext: any;

  beforeEach(() => {
    mockExtensionContext = {
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn().mockReturnValue([])
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn()
      },
      subscriptions: [],
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn()
      }
    };

    mockApiClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    };

    mockConfigService = {
      getConfiguration: jest.fn().mockReturnValue({
        organizationUrl: 'https://dev.azure.com/test',
        project: 'TestProject'
      })
    };

    mockStateManager = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    };

    commentService = new CommentService(
      mockApiClient,
      mockConfigService,
      mockExtensionContext
    );
  });

  describe('Comment Management', () => {
    it('should initialize comment service correctly', () => {
      expect(commentService).toBeDefined();
    });

    it('should handle adding comments', async () => {
      const mockComment = {
        id: 1,
        content: 'Test comment',
        author: { displayName: 'Test User' },
        publishedDate: new Date()
      };

      mockApiClient.post.mockResolvedValue({ data: mockComment });

      const result = await commentService.addComment('repo1', 123, { content: 'Test comment' });

      expect(mockApiClient.post).toHaveBeenCalled();
      expect(result).toEqual(mockComment);
    });

    it('should handle errors gracefully', async () => {
      mockApiClient.post.mockRejectedValue(new Error('API Error'));

      await expect(commentService.addComment('repo1', 123, { content: 'Test comment' }))
        .rejects.toThrow('API Error');
    });
  });
});