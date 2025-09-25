import * as vscode from 'vscode';
import { AzureDevOpsApiClient } from '../api/AzureDevOpsApiClient';
import { ConfigurationService } from './ConfigurationService';
import {
  PullRequest,
  PullRequestStatus,
  PullRequestVote,
  GitRepository,
  CommentThread,
  Comment,
  Identity,
  GitPullRequestIteration,
  GitPullRequestChange,
  PolicyEvaluationRecord
} from '../api/models';

/**
 * Pull request filter criteria
 */
export interface PullRequestFilter {
  readonly status?: PullRequestStatus;
  readonly createdBy?: string;
  readonly reviewerId?: string;
  readonly repositoryId?: string;
  readonly searchQuery?: string;
  readonly maxResults?: number;
  readonly skip?: number;
}

/**
 * Pull request sorting options
 */
export interface PullRequestSortOptions {
  readonly sortBy?: 'createdDate' | 'updatedDate' | 'title' | 'voteCount';
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Pull request operations result
 */
export interface PullRequestOperationResult {
  readonly success: boolean;
  readonly pullRequest?: PullRequest;
  readonly error?: string;
  readonly timestamp: Date;
}

/**
 * Pull request creation options
 */
export interface CreatePullRequestOptions {
  readonly title: string;
  readonly description: string;
  readonly sourceRefName: string;
  readonly targetRefName: string;
  readonly repositoryId: string;
  readonly workItemRefs?: string[];
  readonly reviewers?: string[];
  readonly isDraft?: boolean;
}

/**
 * Pull request update options
 */
export interface UpdatePullRequestOptions {
  readonly title?: string;
  readonly description?: string;
  readonly status?: PullRequestStatus;
  readonly targetRefName?: string;
  readonly workItemRefs?: string[];
}

/**
 * Pull request bulk operations result
 */
export interface BulkOperationResult {
  readonly successful: PullRequest[];
  readonly failed: Array<{
    readonly pullRequestId: number;
    readonly error: string;
  }>;
  readonly totalCount: number;
  readonly timestamp: Date;
}

/**
 * Pull Request Service for managing Azure DevOps pull request operations
 *
 * Provides comprehensive CRUD operations, filtering, sorting, and bulk operations
 * with performance optimization through caching and intelligent data management.
 *
 * Features:
 * - Full CRUD operations for pull requests
 * - Advanced filtering and sorting capabilities
 * - Bulk operations for efficiency
 * - Cache-aware data retrieval
 * - Performance optimization for large PRs
 * - Error handling with detailed diagnostics
 */
export class PullRequestService {
  private readonly cacheKeyPrefix = 'pr_service_';
  private readonly refreshIntervals = new Map<string, NodeJS.Timeout>();
  private readonly bulkOperationQueue = new Map<string, Promise<BulkOperationResult>>();

  constructor(
    private readonly apiClient: AzureDevOpsApiClient,
    private readonly configService: ConfigurationService,
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * Get all pull requests matching specified criteria
   *
   * @param filter Filter criteria for pull requests
   * @param sortOptions Sorting options
   * @returns Promise resolving to array of pull requests
   */
  async getPullRequests(
    filter: PullRequestFilter = {},
    sortOptions: PullRequestSortOptions = {}
  ): Promise<PullRequest[]> {
    const cacheKey = this.getCacheKey('list', filter, sortOptions);

    // Use cached data if available and fresh
    const cached = this.getCachedData<PullRequest[]>(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp, 30000)) { // 30 second cache
      return cached.data;
    }

    // Get repositories first if no specific repository filter
    let repositories: GitRepository[] = [];
    if (!filter.repositoryId) {
      repositories = await this.getRepositories();
    } else {
      repositories = [{ id: filter.repositoryId } as GitRepository];
    }

    const allPullRequests: PullRequest[] = [];

    // Fetch PRs from each repository
    for (const repo of repositories) {
      try {
        const repoPrs = await this.apiClient.getPullRequests(
          repo.id,
          filter.status,
          { useCache: true, cacheTtl: 15000 } // 15 second cache for API calls
        );

        // Apply additional filters
        const filteredPrs = this.applyFilters(repoPrs, filter);
        allPullRequests.push(...filteredPrs);
      } catch (error) {
        console.error(`Failed to fetch PRs for repository ${repo.id}:`, error);
        // Continue with other repositories
      }
    }

    // Apply sorting
    const sortedPrs = this.applySorting(allPullRequests, sortOptions);

    // Apply pagination
    const paginatedPrs = this.applyPagination(sortedPrs, filter.skip || 0, filter.maxResults);

    // Cache the result
    this.setCacheData(cacheKey, paginatedPrs);

    return paginatedPrs;
  }

  /**
   * Get specific pull request by ID
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving to pull request details
   */
  async getPullRequest(repositoryId: string, pullRequestId: number): Promise<PullRequest | null> {
    const cacheKey = this.getCacheKey('single', repositoryId, pullRequestId);

    // Check cache first
    const cached = this.getCachedData<PullRequest>(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp, 60000)) { // 1 minute cache
      return cached.data;
    }

    try {
      const pullRequest = await this.apiClient.getPullRequest(
        repositoryId,
        pullRequestId,
        { useCache: true, cacheTtl: 30000 }
      );

      // Cache the result
      this.setCacheData(cacheKey, pullRequest);

      return pullRequest;
    } catch (error) {
      console.error(`Failed to fetch pull request ${pullRequestId}:`, error);
      return null;
    }
  }

  /**
   * Create a new pull request
   *
   * @param options Pull request creation options
   * @returns Promise resolving to operation result
   */
  async createPullRequest(options: CreatePullRequestOptions): Promise<PullRequestOperationResult> {
    try {
      const config = this.configService.getConfiguration();
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${options.repositoryId}/pullrequests`;

      const payload = {
        title: options.title,
        description: options.description,
        sourceRefName: options.sourceRefName.startsWith('refs/') ? options.sourceRefName : `refs/heads/${options.sourceRefName}`,
        targetRefName: options.targetRefName.startsWith('refs/') ? options.targetRefName : `refs/heads/${options.targetRefName}`,
        reviewers: options.reviewers?.map(id => ({ id })) || [],
        workItemRefs: options.workItemRefs?.map(id => ({ id })) || [],
        isDraft: options.isDraft || false
      };

      const pullRequest = await this.apiClient.post<PullRequest>(url, payload);

      // Invalidate relevant cache
      this.invalidateRepositoryPrsCache(options.repositoryId);

      return {
        success: true,
        pullRequest,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create pull request',
        timestamp: new Date()
      };
    }
  }

  /**
   * Update an existing pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param options Update options
   * @returns Promise resolving to operation result
   */
  async updatePullRequest(
    repositoryId: string,
    pullRequestId: number,
    options: UpdatePullRequestOptions
  ): Promise<PullRequestOperationResult> {
    try {
      const config = this.configService.getConfiguration();
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`;

      const payload: any = {};
      if (options.title !== undefined) payload.title = options.title;
      if (options.description !== undefined) payload.description = options.description;
      if (options.status !== undefined) payload.status = options.status;
      if (options.targetRefName !== undefined) {
        payload.targetRefName = options.targetRefName.startsWith('refs/') ? options.targetRefName : `refs/heads/${options.targetRefName}`;
      }
      if (options.workItemRefs !== undefined) {
        payload.workItemRefs = options.workItemRefs.map(id => ({ id }));
      }

      const pullRequest = await this.apiClient.patch<PullRequest>(url, payload);

      // Invalidate cache
      this.invalidatePrCache(repositoryId, pullRequestId);
      this.invalidateRepositoryPrsCache(repositoryId);

      return {
        success: true,
        pullRequest,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update pull request',
        timestamp: new Date()
      };
    }
  }

  /**
   * Approve a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving to operation result
   */
  async approvePullRequest(repositoryId: string, pullRequestId: number): Promise<PullRequestOperationResult> {
    return this.votePullRequest(repositoryId, pullRequestId, 10); // 10 = approve
  }

  /**
   * Reject a pull request with optional comment
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param comment Optional rejection comment
   * @returns Promise resolving to operation result
   */
  async rejectPullRequest(
    repositoryId: string,
    pullRequestId: number,
    comment?: string
  ): Promise<PullRequestOperationResult> {
    try {
      // Vote with -10 (reject)
      await this.apiClient.votePullRequest(repositoryId, pullRequestId, -10);

      // Add rejection comment if provided
      if (comment) {
        await this.apiClient.addComment(repositoryId, pullRequestId, comment);
      }

      // Invalidate cache
      this.invalidatePrCache(repositoryId, pullRequestId);

      return {
        success: true,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reject pull request',
        timestamp: new Date()
      };
    }
  }

  /**
   * Abandon a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving to operation result
   */
  async abandonPullRequest(repositoryId: string, pullRequestId: number): Promise<PullRequestOperationResult> {
    try {
      await this.apiClient.abandonPullRequest(repositoryId, pullRequestId);

      // Invalidate cache
      this.invalidatePrCache(repositoryId, pullRequestId);
      this.invalidateRepositoryPrsCache(repositoryId);

      return {
        success: true,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to abandon pull request',
        timestamp: new Date()
      };
    }
  }

  /**
   * Set up auto-refresh for pull requests
   *
   * @param filter Filter criteria
   * @param intervalMs Refresh interval in milliseconds
   * @param callback Callback function for updates
   */
  setupAutoRefresh(
    filter: PullRequestFilter,
    intervalMs: number,
    callback: (pullRequests: PullRequest[]) => void
  ): void {
    const cacheKey = this.getCacheKey('autorefresh', filter);

    // Clear existing interval if any
    const existingInterval = this.refreshIntervals.get(cacheKey);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up new interval
    const interval = setInterval(async () => {
      try {
        const pullRequests = await this.getPullRequests(filter);
        callback(pullRequests);
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, intervalMs);

    this.refreshIntervals.set(cacheKey, interval);

    // Store for cleanup
    this.context.globalState.update(`${cacheKey}_interval`, intervalMs);
  }

  /**
   * Clear auto-refresh for a specific filter
   *
   * @param filter Filter criteria
   */
  clearAutoRefresh(filter: PullRequestFilter): void {
    const cacheKey = this.getCacheKey('autorefresh', filter);
    const interval = this.refreshIntervals.get(cacheKey);

    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(cacheKey);
      this.context.globalState.update(`${cacheKey}_interval`, undefined);
    }
  }

  /**
   * Get pull request iterations (history)
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving to array of iterations
   */
  async getPullRequestIterations(
    repositoryId: string,
    pullRequestId: number
  ): Promise<GitPullRequestIteration[]> {
    const config = this.configService.getConfiguration();
    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/iterations`;

    try {
      const response = await this.apiClient.get<any>(url, { useCache: true, cacheTtl: 30000 });
      return response.value.map((iteration: any) => ({
        ...iteration,
        createdDate: new Date(iteration.createdDate),
        updatedDate: new Date(iteration.updatedDate)
      }));
    } catch (error) {
      console.error(`Failed to fetch iterations for PR ${pullRequestId}:`, error);
      return [];
    }
  }

  /**
   * Get pull request changes (file differences)
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param iterationId Optional iteration ID
   * @returns Promise resolving to array of file changes
   */
  async getPullRequestChanges(
    repositoryId: string,
    pullRequestId: number,
    iterationId?: number
  ): Promise<GitPullRequestChange[]> {
    const config = this.configService.getConfiguration();
    let url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/changes`;

    if (iterationId) {
      url += `?iterationId=${iterationId}`;
    }

    try {
      const response = await this.apiClient.get<any>(url, { useCache: true, cacheTtl: 60000 });
      return response.value;
    } catch (error) {
      console.error(`Failed to fetch changes for PR ${pullRequestId}:`, error);
      return [];
    }
  }

  /**
   * Get pull request policy evaluations
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving to policy evaluation records
   */
  async getPolicyEvaluations(
    repositoryId: string,
    pullRequestId: number
  ): Promise<PolicyEvaluationRecord[]> {
    const config = this.configService.getConfiguration();
    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/policyevaluations`;

    try {
      const response = await this.apiClient.get<any>(url, { useCache: true, cacheTtl: 30000 });
      return response.value.map((record: any) => ({
        ...record,
        startedDate: new Date(record.startedDate),
        completedDate: record.completedDate ? new Date(record.completedDate) : undefined
      }));
    } catch (error) {
      console.error(`Failed to fetch policy evaluations for PR ${pullRequestId}:`, error);
      return [];
    }
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

    // Clear bulk operation queue
    this.bulkOperationQueue.clear();
  }

  /**
   * Apply filters to pull requests
   */
  private applyFilters(pullRequests: PullRequest[], filter: PullRequestFilter): PullRequest[] {
    let filtered = [...pullRequests];

    if (filter.createdBy) {
      filtered = filtered.filter(pr => pr.createdBy.id === filter.createdBy);
    }

    if (filter.reviewerId) {
      filtered = filtered.filter(pr =>
        pr.reviewers.some(reviewer => reviewer.id === filter.reviewerId)
      );
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(pr =>
        pr.title.toLowerCase().includes(query) ||
        pr.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  /**
   * Apply sorting to pull requests
   */
  private applySorting(pullRequests: PullRequest[], sortOptions: PullRequestSortOptions): PullRequest[] {
    const sorted = [...pullRequests];
    const sortBy = sortOptions.sortBy || 'createdDate';
    const sortOrder = sortOptions.sortOrder || 'desc';

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'createdDate':
          comparison = a.creationDate.getTime() - b.creationDate.getTime();
          break;
        case 'updatedDate':
          comparison = (b.closedDate || b.creationDate).getTime() - (a.closedDate || a.creationDate).getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'voteCount':
          const aVotes = a.reviewers.reduce((sum, r) => sum + r.vote, 0);
          const bVotes = b.reviewers.reduce((sum, r) => sum + r.vote, 0);
          comparison = aVotes - bVotes;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Apply pagination to pull requests
   */
  private applyPagination(pullRequests: PullRequest[], skip: number, maxResults?: number): PullRequest[] {
    if (maxResults) {
      return pullRequests.slice(skip, skip + maxResults);
    }
    return pullRequests.slice(skip);
  }

  /**
   * Get repositories with caching
   */
  private async getRepositories(): Promise<GitRepository[]> {
    const cacheKey = `${this.cacheKeyPrefix}repositories`;
    const cached = this.getCachedData<GitRepository[]>(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 300000)) { // 5 minute cache
      return cached.data;
    }

    try {
      const repositories = await this.apiClient.getRepositories({ useCache: true, cacheTtl: 300000 });
      this.setCacheData(cacheKey, repositories);
      return repositories;
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
      return [];
    }
  }

  /**
   * Vote on a pull request
   */
  public async votePullRequest(
    repositoryId: string,
    pullRequestId: number,
    vote: PullRequestVote
  ): Promise<PullRequestOperationResult> {
    try {
      await this.apiClient.votePullRequest(repositoryId, pullRequestId, vote);

      // Invalidate cache
      this.invalidatePrCache(repositoryId, pullRequestId);

      return {
        success: true,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to vote on pull request',
        timestamp: new Date()
      };
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
   * Invalidate specific PR cache
   */
  private invalidatePrCache(repositoryId: string, pullRequestId: number): void {
    const keys = this.context.workspaceState.keys().filter(key =>
      key.includes(`single_${repositoryId}_${pullRequestId}`)
    );
    keys.forEach(key => this.context.workspaceState.update(key, undefined));
  }

  /**
   * Invalidate repository PRs cache
   */
  private invalidateRepositoryPrsCache(repositoryId: string): void {
    const keys = this.context.workspaceState.keys().filter(key =>
      key.includes(`list_${repositoryId}`) || key.includes('list_all')
    );
    keys.forEach(key => this.context.workspaceState.update(key, undefined));
  }
}