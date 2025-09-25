import * as vscode from 'vscode';
import { AzureDevOpsApiClient } from '../api/AzureDevOpsApiClient';
import { ConfigurationService } from './ConfigurationService';
import {
  CommentThread,
  Comment,
  CommentThreadStatus,
  CommentType,
  CommentThreadContext,
  CommentPosition,
  Identity
} from '../api/models';

/**
 * Comment creation options
 */
export interface CreateCommentOptions {
  readonly content: string;
  readonly threadId?: number;
  readonly parentCommentId?: number;
  readonly filePath?: string;
  readonly line?: number;
  readonly iterationId?: number;
  readonly commentType?: CommentType;
}

/**
 * Comment thread creation options
 */
export interface CreateThreadOptions {
  readonly content: string;
  readonly filePath?: string;
  readonly line?: number;
  readonly iterationId?: number;
  readonly status?: CommentThreadStatus;
  readonly commentType?: CommentType;
}

/**
 * Comment thread update options
 */
export interface UpdateThreadOptions {
  readonly status?: CommentThreadStatus;
  readonly filePath?: string;
  readonly line?: number;
}

/**
 * Comment update options
 */
export interface UpdateCommentOptions {
  readonly content?: string;
  readonly commentType?: CommentType;
}

/**
 * Comment filter criteria
 */
export interface CommentFilter {
  readonly threadId?: number;
  readonly authorId?: string;
  readonly status?: CommentThreadStatus;
  readonly filePath?: string;
  readonly commentType?: CommentType;
  readonly searchQuery?: string;
  readonly includeDeleted?: boolean;
}

/**
 * Comment statistics
 */
export interface CommentStatistics {
  totalThreads: number;
  totalComments: number;
  activeThreads: number;
  resolvedThreads: number;
  threadsByUser: Map<string, number>;
  commentsByUser: Map<string, number>;
  readonly threadsByFile: Map<string, number>;
}

/**
 * Comment service for managing pull request comments and threads
 *
 * Provides comprehensive comment management with threading support, file positioning,
 * and advanced filtering capabilities.
 *
 * Features:
 * - Create and manage comment threads with file positioning
 * - Reply to existing comments with proper threading
 * - Update comment and thread status
 * - Advanced filtering and search capabilities
 * - Comment statistics and analytics
 * - Cache-aware data retrieval
 * - Real-time comment updates
 */
export class CommentService {
  private readonly cacheKeyPrefix = 'comment_service_';
  private readonly commentUpdateListeners = new Set<(event: CommentUpdateEvent) => void>();
  private readonly refreshIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly apiClient: AzureDevOpsApiClient,
    private readonly configService: ConfigurationService,
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * Get all comment threads for a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param filter Comment filter criteria
   * @returns Promise resolving to array of comment threads
   */
  async getCommentThreads(
    repositoryId: string,
    pullRequestId: number,
    filter: CommentFilter = {}
  ): Promise<CommentThread[]> {
    const cacheKey = this.getCacheKey('threads', repositoryId, pullRequestId, filter);

    // Check cache first
    const cached = this.getCachedData<CommentThread[]>(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp, 30000)) { // 30 second cache
      return this.applyCommentFilters(cached.data, filter);
    }

    try {
      const threads = await this.apiClient.getCommentThreads(
        repositoryId,
        pullRequestId,
        { useCache: true, cacheTtl: 15000 }
      );

      // Cache the result
      this.setCacheData(cacheKey, threads);

      return this.applyCommentFilters(threads, filter);
    } catch (error) {
      console.error(`Failed to fetch comment threads for PR ${pullRequestId}:`, error);
      return [];
    }
  }

  /**
   * Get a specific comment thread by ID
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param threadId Thread ID
   * @returns Promise resolving to comment thread or null if not found
   */
  async getCommentThread(
    repositoryId: string,
    pullRequestId: number,
    threadId: number
  ): Promise<CommentThread | null> {
    const threads = await this.getCommentThreads(repositoryId, pullRequestId);
    return threads.find(thread => thread.id === threadId) || null;
  }

  /**
   * Create a new comment thread
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param options Thread creation options
   * @returns Promise resolving to created comment thread
   */
  async createCommentThread(
    repositoryId: string,
    pullRequestId: number,
    options: CreateThreadOptions
  ): Promise<CommentThread | null> {
    try {
      const config = this.configService.getConfiguration();
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads`;

      const payload: any = {
        comments: [{
          content: options.content,
          commentType: options.commentType || 'text'
        }],
        status: options.status || 'active'
      };

      // Add thread context if file positioning is specified
      if (options.filePath && options.line !== undefined) {
        payload.threadContext = {
          filePath: options.filePath
        };

        // Add pull request specific context
        payload.pullRequestThreadContext = {
          iterationContext: options.iterationId ? {
            firstComparingIteration: 1,
            secondComparingIteration: options.iterationId
          } : undefined
        };

        // Add file positioning
        if (options.line !== undefined) {
          payload.threadContext.rightFileStart = { line: options.line, offset: 0 };
          payload.threadContext.rightFileEnd = { line: options.line, offset: 0 };
        }
      }

      const thread = await this.apiClient.post<CommentThread>(url, payload);

      // Invalidate cache
      this.invalidateCommentCache(repositoryId, pullRequestId);

      // Notify listeners
      this.notifyCommentUpdate({
        type: 'threadCreated',
        repositoryId,
        pullRequestId,
        threadId: thread.id,
        timestamp: new Date()
      });

      return thread;
    } catch (error) {
      console.error('Failed to create comment thread:', error);
      return null;
    }
  }

  /**
   * Add a comment to an existing thread or create new thread
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param options Comment creation options
   * @returns Promise resolving to created comment or null if failed
   */
  async addComment(
    repositoryId: string,
    pullRequestId: number,
    options: CreateCommentOptions
  ): Promise<Comment | null> {
    try {
      let comment: Comment;

      if (options.threadId) {
        // Reply to existing thread
        comment = await this.apiClient.addComment(
          repositoryId,
          pullRequestId,
          options.content,
          options.threadId
        );

        // Notify listeners
        this.notifyCommentUpdate({
          type: 'commentAdded',
          repositoryId,
          pullRequestId,
          threadId: options.threadId,
          commentId: comment.id,
          timestamp: new Date()
        });
      } else {
        // Create new thread
        const thread = await this.createCommentThread(repositoryId, pullRequestId, {
          content: options.content,
          filePath: options.filePath,
          line: options.line,
          iterationId: options.iterationId,
          commentType: options.commentType
        });

        if (!thread || thread.comments.length === 0) {
          return null;
        }

        comment = thread.comments[0];
      }

      // Invalidate cache
      this.invalidateCommentCache(repositoryId, pullRequestId);

      return comment;
    } catch (error) {
      console.error('Failed to add comment:', error);
      return null;
    }
  }

  /**
   * Update an existing comment
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param threadId Thread ID
   * @param commentId Comment ID
   * @param options Update options
   * @returns Promise resolving to updated comment or null if failed
   */
  async updateComment(
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    commentId: number,
    options: UpdateCommentOptions
  ): Promise<Comment | null> {
    try {
      const config = this.configService.getConfiguration();
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}/comments/${commentId}`;

      const payload: any = {};
      if (options.content !== undefined) payload.content = options.content;
      if (options.commentType !== undefined) payload.commentType = options.commentType;

      const comment = await this.apiClient.patch<Comment>(url, payload);

      // Invalidate cache
      this.invalidateCommentCache(repositoryId, pullRequestId);

      // Notify listeners
      this.notifyCommentUpdate({
        type: 'commentUpdated',
        repositoryId,
        pullRequestId,
        threadId,
        commentId,
        timestamp: new Date()
      });

      return comment;
    } catch (error) {
      console.error('Failed to update comment:', error);
      return null;
    }
  }

  /**
   * Update a comment thread
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param threadId Thread ID
   * @param options Update options
   * @returns Promise resolving to updated thread or null if failed
   */
  async updateCommentThread(
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    options: UpdateThreadOptions
  ): Promise<CommentThread | null> {
    try {
      const config = this.configService.getConfiguration();
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}`;

      const payload: any = {};
      if (options.status !== undefined) payload.status = options.status;

      // Update thread context if file positioning changed
      if (options.filePath || options.line !== undefined) {
        payload.threadContext = {
          filePath: options.filePath
        };

        if (options.line !== undefined) {
          payload.threadContext.rightFileStart = { line: options.line, offset: 0 };
          payload.threadContext.rightFileEnd = { line: options.line, offset: 0 };
        }
      }

      const thread = await this.apiClient.patch<CommentThread>(url, payload);

      // Invalidate cache
      this.invalidateCommentCache(repositoryId, pullRequestId);

      // Notify listeners
      this.notifyCommentUpdate({
        type: 'threadUpdated',
        repositoryId,
        pullRequestId,
        threadId,
        timestamp: new Date()
      });

      return thread;
    } catch (error) {
      console.error('Failed to update comment thread:', error);
      return null;
    }
  }

  /**
   * Delete a comment
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param threadId Thread ID
   * @param commentId Comment ID
   * @returns Promise resolving to true if successful
   */
  async deleteComment(
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    commentId: number
  ): Promise<boolean> {
    try {
      const config = this.configService.getConfiguration();
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}/comments/${commentId}`;

      await this.apiClient.delete<any>(url);

      // Invalidate cache
      this.invalidateCommentCache(repositoryId, pullRequestId);

      // Notify listeners
      this.notifyCommentUpdate({
        type: 'commentDeleted',
        repositoryId,
        pullRequestId,
        threadId,
        commentId,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Failed to delete comment:', error);
      return false;
    }
  }

  /**
   * Get comment statistics for a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving to comment statistics
   */
  async getCommentStatistics(
    repositoryId: string,
    pullRequestId: number
  ): Promise<CommentStatistics> {
    const threads = await this.getCommentThreads(repositoryId, pullRequestId, {
      includeDeleted: false
    });

    const stats: CommentStatistics = {
      totalThreads: threads.length,
      totalComments: 0,
      activeThreads: 0,
      resolvedThreads: 0,
      threadsByUser: new Map(),
      commentsByUser: new Map(),
      threadsByFile: new Map()
    };

    for (const thread of threads) {
      stats.totalComments += thread.comments.length;

      // Count threads by status
      if (thread.status === 'active') {
        stats.activeThreads++;
      } else if (thread.status === 'closed' || thread.status === 'fixed') {
        stats.resolvedThreads++;
      }

      // Count by users
      const firstAuthor = thread.comments[0]?.author;
      if (firstAuthor) {
        const threadCount = stats.threadsByUser.get(firstAuthor.id) || 0;
        stats.threadsByUser.set(firstAuthor.id, threadCount + 1);
      }

      // Count comments by users
      for (const comment of thread.comments) {
        const commentCount = stats.commentsByUser.get(comment.author.id) || 0;
        stats.commentsByUser.set(comment.author.id, commentCount + 1);
      }

      // Count by files
      if (thread.threadContext?.filePath) {
        const filePath = thread.threadContext.filePath;
        const fileCount = stats.threadsByFile.get(filePath) || 0;
        stats.threadsByFile.set(filePath, fileCount + 1);
      }
    }

    return stats;
  }

  /**
   * Search comments across all threads
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param query Search query
   * @returns Promise resolving to matching comments with thread context
   */
  async searchComments(
    repositoryId: string,
    pullRequestId: number,
    query: string
  ): Promise<Array<{ comment: Comment; thread: CommentThread }>> {
    const threads = await this.getCommentThreads(repositoryId, pullRequestId, {
      includeDeleted: false
    });

    const results: Array<{ comment: Comment; thread: CommentThread }> = [];
    const searchQuery = query.toLowerCase();

    for (const thread of threads) {
      for (const comment of thread.comments) {
        if (
          comment.content.toLowerCase().includes(searchQuery) ||
          comment.author.displayName.toLowerCase().includes(searchQuery) ||
          comment.author.uniqueName.toLowerCase().includes(searchQuery)
        ) {
          results.push({ comment, thread });
        }
      }
    }

    return results;
  }

  /**
   * Set up auto-refresh for comment updates
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param intervalMs Refresh interval in milliseconds
   * @param callback Callback for comment updates
   */
  setupAutoRefresh(
    repositoryId: string,
    pullRequestId: number,
    intervalMs: number,
    callback: (threads: CommentThread[]) => void
  ): void {
    const cacheKey = this.getCacheKey('autorefresh', repositoryId, pullRequestId);

    // Clear existing interval
    const existingInterval = this.refreshIntervals.get(cacheKey);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up new interval
    const interval = setInterval(async () => {
      try {
        const threads = await this.getCommentThreads(repositoryId, pullRequestId);
        callback(threads);
      } catch (error) {
        console.error('Comment auto-refresh failed:', error);
      }
    }, intervalMs);

    this.refreshIntervals.set(cacheKey, interval);
  }

  /**
   * Clear auto-refresh for comments
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   */
  clearAutoRefresh(repositoryId: string, pullRequestId: number): void {
    const cacheKey = this.getCacheKey('autorefresh', repositoryId, pullRequestId);
    const interval = this.refreshIntervals.get(cacheKey);

    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(cacheKey);
    }
  }

  /**
   * Add listener for comment updates
   *
   * @param listener Update event listener
   */
  addCommentUpdateListener(listener: (event: CommentUpdateEvent) => void): void {
    this.commentUpdateListeners.add(listener);
  }

  /**
   * Remove listener for comment updates
   *
   * @param listener Update event listener
   */
  removeCommentUpdateListener(listener: (event: CommentUpdateEvent) => void): void {
    this.commentUpdateListeners.delete(listener);
  }

  /**
   * Clean up resources and intervals
   */
  dispose(): void {
    // Clear all refresh intervals
    for (const interval of this.refreshIntervals.values()) {
      clearInterval(interval);
    }
    this.refreshIntervals.clear();

    // Clear listeners
    this.commentUpdateListeners.clear();
  }

  /**
   * Apply filters to comment threads
   */
  private applyCommentFilters(threads: CommentThread[], filter: CommentFilter): CommentThread[] {
    let filtered = [...threads];

    if (!filter.includeDeleted) {
      filtered = filtered.filter(thread => !thread.isDeleted);
    }

    if (filter.threadId) {
      filtered = filtered.filter(thread => thread.id === filter.threadId);
    }

    if (filter.authorId) {
      filtered = filtered.filter(thread =>
        thread.comments.some(comment => comment.author.id === filter.authorId)
      );
    }

    if (filter.status) {
      filtered = filtered.filter(thread => thread.status === filter.status);
    }

    if (filter.filePath) {
      filtered = filtered.filter(thread =>
        thread.threadContext?.filePath === filter.filePath
      );
    }

    if (filter.commentType) {
      filtered = filtered.filter(thread =>
        thread.comments.some(comment => comment.commentType === filter.commentType)
      );
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(thread =>
        thread.comments.some(comment =>
          comment.content.toLowerCase().includes(query) ||
          comment.author.displayName.toLowerCase().includes(query)
        )
      );
    }

    return filtered;
  }

  /**
   * Notify listeners of comment updates
   */
  private notifyCommentUpdate(event: CommentUpdateEvent): void {
    for (const listener of this.commentUpdateListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in comment update listener:', error);
      }
    }
  }

  /**
   * Get cache key for data
   */
  private getCacheKey(...parts: any[]): string {
    return `${this.cacheKeyPrefix}${parts.join('_')}`;
  }

  /**
   * Get cached data with metadata
   */
  private getCachedData<T>(key: string): { data: T; timestamp: number } | null {
    const cached = this.context.workspaceState.get<{ data: T; timestamp: number }>(key);
    return cached || null;
  }

  /**
   * Set cached data with timestamp
   */
  private setCacheData<T>(key: string, data: T): void {
    this.context.workspaceState.update(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(timestamp: number, maxAgeMs: number): boolean {
    return Date.now() - timestamp < maxAgeMs;
  }

  /**
   * Invalidate comment cache
   */
  private invalidateCommentCache(repositoryId: string, pullRequestId: number): void {
    const keys = this.context.workspaceState.keys().filter(key =>
      key.includes(`threads_${repositoryId}_${pullRequestId}`)
    );
    keys.forEach(key => this.context.workspaceState.update(key, undefined));
  }
}

/**
 * Comment update event type
 */
export type CommentUpdateEventType =
  | 'threadCreated'
  | 'threadUpdated'
  | 'commentAdded'
  | 'commentUpdated'
  | 'commentDeleted';

/**
 * Comment update event
 */
export interface CommentUpdateEvent {
  readonly type: CommentUpdateEventType;
  readonly repositoryId: string;
  readonly pullRequestId: number;
  readonly threadId: number;
  readonly commentId?: number;
  readonly timestamp: Date;
}