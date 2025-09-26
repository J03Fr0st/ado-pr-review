import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

/**
 * Extended Axios request config with metadata for monitoring
 */
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: {
    startTime?: number;
  };
}
import * as vscode from "vscode";
import { AuthenticationService } from "../services/AuthenticationService";
import { ConfigurationService } from "../services/ConfigurationService";
import {
  PullRequest,
  CommentThread,
  Comment,
  GitRepository,
  TeamProject,
  ApiResponse,
  ApiErrorResponse,
  PolicyEvaluationRecord,
  GitPullRequestIteration,
  Identity,
} from "./models";

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly retryAfterMs: number;
  readonly maxRetries: number;
}

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  readonly data: T;
  readonly expiry: number;
  readonly etag?: string;
}

/**
 * Request retry configuration
 */
interface RetryConfig {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly delayMs: number;
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  readonly useCache?: boolean;
  readonly cacheTtl?: number; // Time to live in milliseconds
  readonly timeout?: number;
  readonly retries?: number;
}

/**
 * Azure DevOps REST API client with rate limiting and caching
 *
 * Implements:
 * - Rate limiting (200 requests/minute) with exponential backoff
 * - Multi-layer caching (memory + session)
 * - Request/response models with TypeScript typing
 * - Comprehensive error handling without token exposure
 * - Authentication header management
 *
 * API Version: v7.1-preview.1
 */
export class AzureDevOpsApiClient {
  private static readonly API_VERSION = "7.1-preview.1";
  private static readonly USER_AGENT = "Azure-DevOps-PR-Reviewer-VSCode/1.0.0";

  private static readonly RATE_LIMIT: RateLimitConfig = {
    maxRequests: 200,
    windowMs: 60000, // 1 minute
    retryAfterMs: 60000, // 1 minute
    maxRetries: 3,
  };

  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_CACHE_TTL = 300000; // 5 minutes

  private readonly axiosInstance: AxiosInstance;
  private readonly memoryCache = new Map<string, CacheEntry<any>>();
  private readonly rateLimitTracker: number[] = [];
  private readonly sessionStorage: vscode.Memento;
  private requestCallbacks: Array<(duration: number, endpoint: string, success: boolean) => void> = [];

  constructor(
    private readonly authService: AuthenticationService,
    private readonly configService: ConfigurationService,
    private readonly context: vscode.ExtensionContext
  ) {
    this.sessionStorage = context.workspaceState;
    this.axiosInstance = this.createAxiosInstance();
    this.setupRequestInterceptors();
    this.setupResponseInterceptors();
  }

  /**
   * Get all repositories for the configured project
   *
   * @param options Request options including caching preferences
   * @returns Promise resolving to array of repositories
   */
  async getRepositories(
    options: ApiRequestOptions = {}
  ): Promise<GitRepository[]> {
    const config = this.configService.getConfiguration();
    if (!config.project) {
      throw new Error("Project not configured");
    }

    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories`;
    const response = await this.get<ApiResponse<GitRepository>>(url, options);

    return response.value.map((repo) => ({
      ...repo,
      project: {
        ...repo.project,
        lastUpdateTime: new Date(repo.project.lastUpdateTime),
      },
    }));
  }

  /**
   * Get pull requests for a specific repository
   *
   * @param repositoryId Repository ID
   * @param status Filter by status (optional)
   * @param options Request options including caching preferences
   * @returns Promise resolving to array of pull requests
   */
  async getPullRequests(
    repositoryId: string,
    status?: string,
    options: ApiRequestOptions = {}
  ): Promise<PullRequest[]> {
    const config = this.configService.getConfiguration();
    let url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests`;

    const params: string[] = [];
    if (status) {
      params.push(`searchCriteria.status=${status}`);
    }
    if (params.length > 0) {
      url += `?${params.join("&")}`;
    }

    const response = await this.get<ApiResponse<PullRequest>>(url, options);

    return response.value.map(this.transformPullRequest);
  }

  /**
   * Get specific pull request by ID
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param options Request options including caching preferences
   * @returns Promise resolving to pull request details
   */
  async getPullRequest(
    repositoryId: string,
    pullRequestId: number,
    options: ApiRequestOptions = {}
  ): Promise<PullRequest> {
    const config = this.configService.getConfiguration();
    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`;

    const response = await this.get<PullRequest>(url, options);
    return this.transformPullRequest(response);
  }

  /**
   * Get comment threads for a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param options Request options including caching preferences
   * @returns Promise resolving to array of comment threads
   */
  async getCommentThreads(
    repositoryId: string,
    pullRequestId: number,
    options: ApiRequestOptions = {}
  ): Promise<CommentThread[]> {
    const config = this.configService.getConfiguration();
    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads`;

    const response = await this.get<ApiResponse<CommentThread>>(url, options);

    return response.value.map((thread) => ({
      ...thread,
      publishedDate: thread.publishedDate
        ? new Date(thread.publishedDate)
        : undefined,
      lastUpdatedDate: thread.lastUpdatedDate
        ? new Date(thread.lastUpdatedDate)
        : undefined,
      comments: thread.comments.map((comment) => ({
        ...comment,
        publishedDate: new Date(comment.publishedDate),
        lastUpdatedDate: comment.lastUpdatedDate
          ? new Date(comment.lastUpdatedDate)
          : undefined,
        lastContentUpdatedDate: comment.lastContentUpdatedDate
          ? new Date(comment.lastContentUpdatedDate)
          : undefined,
      })),
    }));
  }

  /**
   * Add a comment to a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param comment Comment content
   * @param threadId Optional thread ID to reply to existing thread
   * @returns Promise resolving to created comment
   */
  async addComment(
    repositoryId: string,
    pullRequestId: number,
    comment: string,
    threadId?: number
  ): Promise<Comment> {
    const config = this.configService.getConfiguration();

    if (threadId) {
      // Reply to existing thread
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}/comments`;
      const payload = {
        content: comment,
        commentType: "text",
      };

      const response = await this.post<Comment>(url, payload);
      return {
        ...response,
        publishedDate: new Date(response.publishedDate),
        lastUpdatedDate: response.lastUpdatedDate
          ? new Date(response.lastUpdatedDate)
          : undefined,
        lastContentUpdatedDate: response.lastContentUpdatedDate
          ? new Date(response.lastContentUpdatedDate)
          : undefined,
      };
    } else {
      // Create new thread
      const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads`;
      const payload = {
        comments: [
          {
            content: comment,
            commentType: "text",
          },
        ],
        status: "active",
      };

      const thread = await this.post<CommentThread>(url, payload);
      if (thread.comments.length > 0) {
        return thread.comments[0];
      }
      throw new Error("No comment created in thread");
    }
  }

  /**
   * Vote on a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param vote Vote value (-10, -5, 0, 5, 10)
   * @returns Promise resolving when vote is recorded
   */
  async votePullRequest(
    repositoryId: string,
    pullRequestId: number,
    vote: number
  ): Promise<void> {
    const config = this.configService.getConfiguration();
    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/reviewers/@me`;

    const payload = {
      vote: vote,
    };

    await this.put<any>(url, payload);

    // Invalidate cache for this PR
    this.invalidateCache(`pr_${repositoryId}_${pullRequestId}`);
  }

  /**
   * Get pull request files with pagination support for large PRs
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @param iterationId Iteration ID (use latest if not specified)
   * @param skip Number of files to skip (pagination)
   * @param top Maximum number of files to return (pagination)
   * @returns Promise resolving to paginated files response
   */
  async getPullRequestFiles(
    repositoryId: string,
    pullRequestId: number,
    iterationId?: number,
    skip = 0,
    top = 50
  ): Promise<{
    value: any[];
    count: number;
  }> {
    const config = this.configService.getConfiguration();
    let url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/files`;

    const params: string[] = [];
    if (iterationId) {
      params.push(`iterationId=${iterationId}`);
    }
    params.push(`$skip=${skip}`);
    params.push(`$top=${top}`);
    params.push("$includeContent=false"); // Don't include file content for performance

    if (params.length > 0) {
      url += `?${params.join("&")}`;
    }

    const response = await this.get<any>(url, { useCache: false }); // Don't cache file listings

    return {
      value: response.value || [],
      count: response.count || 0,
    };
  }

  /**
   * Abandon a pull request
   *
   * @param repositoryId Repository ID
   * @param pullRequestId Pull request ID
   * @returns Promise resolving when PR is abandoned
   */
  async abandonPullRequest(
    repositoryId: string,
    pullRequestId: number
  ): Promise<void> {
    const config = this.configService.getConfiguration();
    const url = `${config.organizationUrl}/${config.project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`;

    const payload = {
      status: "abandoned",
    };

    await this.patch<any>(url, payload);

    // Invalidate cache
    this.invalidateCache(`pr_${repositoryId}_${pullRequestId}`);
    this.invalidateCache(`prs_${repositoryId}`);
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.memoryCache.clear();
    // Clear session storage cache entries
    const keys = this.context.workspaceState
      .keys()
      .filter((key) => key.startsWith("api_cache_"));
    keys.forEach((key) => this.sessionStorage.update(key, undefined));
  }

  /**
   * Get cache statistics for monitoring
   *
   * @returns Cache statistics object
   */
  getCacheStats(): {
    memoryEntries: number;
    sessionEntries: number;
    hitRate?: number;
  } {
    const sessionEntries = this.context.workspaceState
      .keys()
      .filter((key) => key.startsWith("api_cache_")).length;

    return {
      memoryEntries: this.memoryCache.size,
      sessionEntries: sessionEntries,
    };
  }

  /**
   * Create configured axios instance
   *
   * @returns Configured axios instance
   */
  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      timeout: AzureDevOpsApiClient.DEFAULT_TIMEOUT,
      headers: {
        "User-Agent": AzureDevOpsApiClient.USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    return instance;
  }

  /**
   * Setup request interceptors for authentication and rate limiting
   */
  private setupRequestInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      async (config: ExtendedAxiosRequestConfig) => {
        // Add timing metadata for monitoring
        config.metadata = { ...config.metadata, startTime: Date.now() };

        // Add authentication header
        const authHeader = await this.authService.getAuthHeader();
        if (authHeader) {
          config.headers["Authorization"] = authHeader;
        }

        // Add API version
        if (config.url) {
          const separator = config.url.includes("?") ? "&" : "?";
          config.url += `${separator}api-version=${AzureDevOpsApiClient.API_VERSION}`;
        }

        // Rate limiting check
        await this.checkRateLimit();

        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  /**
   * Setup response interceptors for error handling and retry logic
   */
  private setupResponseInterceptors(): void {
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Track successful request timing
        const startTime = (response.config as any).metadata?.startTime;
        if (startTime) {
          const duration = Date.now() - startTime;
          const endpoint = this.extractEndpointFromUrl(response.config.url || '');
          this.notifyRequestCallbacks(duration, endpoint, true);
        }
        return response;
      },
      async (error: AxiosError) => {
        // Track failed request timing
        const startTime = (error.config as any)?.metadata?.startTime;
        if (startTime) {
          const duration = Date.now() - startTime;
          const endpoint = this.extractEndpointFromUrl(error.config?.url || '');
          this.notifyRequestCallbacks(duration, endpoint, false);
        }

        const config = error.config as any;

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers["retry-after"];
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : AzureDevOpsApiClient.RATE_LIMIT.retryAfterMs;

          if (!config._retryCount) {
            config._retryCount = 0;
          }

          if (config._retryCount < AzureDevOpsApiClient.RATE_LIMIT.maxRetries) {
            config._retryCount++;
            await this.delay(delay);
            return this.axiosInstance.request(config);
          }
        }

        // Handle authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new Error(
            "Authentication failed. Please check your Personal Access Token."
          );
        }

        // Handle other HTTP errors without exposing sensitive data
        if (error.response) {
          const apiError = error.response.data as ApiErrorResponse;
          throw new Error(
            apiError.message || `API error: ${error.response.status}`
          );
        }

        // Handle network errors
        if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
          throw new Error(
            "Unable to connect to Azure DevOps. Please check your network connection."
          );
        }

        throw new Error("Request failed. Please try again.");
      }
    );
  }

  /**
   * Generic GET request with caching support
   */
  public async get<T>(
    url: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const cacheKey = this.getCacheKey("GET", url);

    // Check cache if enabled
    if (options.useCache !== false) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const config: AxiosRequestConfig = {
      timeout: options.timeout || AzureDevOpsApiClient.DEFAULT_TIMEOUT,
    };

    const response = await this.axiosInstance.get<T>(url, config);

    // Cache response if enabled
    if (options.useCache !== false) {
      this.setCache(
        cacheKey,
        response.data,
        options.cacheTtl || AzureDevOpsApiClient.DEFAULT_CACHE_TTL
      );
    }

    return response.data;
  }

  /**
   * Generic POST request
   */
  public async post<T>(
    url: string,
    data: any,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      timeout: options.timeout || AzureDevOpsApiClient.DEFAULT_TIMEOUT,
    };

    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Generic PUT request
   */
  public async put<T>(
    url: string,
    data: any,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      timeout: options.timeout || AzureDevOpsApiClient.DEFAULT_TIMEOUT,
    };

    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Generic PATCH request
   */
  public async patch<T>(
    url: string,
    data: any,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      timeout: options.timeout || AzureDevOpsApiClient.DEFAULT_TIMEOUT,
    };

    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Generic DELETE request
   */
  public async delete<T>(
    url: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      timeout: options.timeout || AzureDevOpsApiClient.DEFAULT_TIMEOUT,
    };

    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }

  /**
   * Check and enforce rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - AzureDevOpsApiClient.RATE_LIMIT.windowMs;

    // Remove old entries
    while (
      this.rateLimitTracker.length > 0 &&
      this.rateLimitTracker[0] < windowStart
    ) {
      this.rateLimitTracker.shift();
    }

    // Check if we're at the limit
    if (
      this.rateLimitTracker.length >=
      AzureDevOpsApiClient.RATE_LIMIT.maxRequests
    ) {
      const delay =
        this.rateLimitTracker[0] +
        AzureDevOpsApiClient.RATE_LIMIT.windowMs -
        now;
      if (delay > 0) {
        await this.delay(delay);
      }
    }

    // Record this request
    this.rateLimitTracker.push(now);
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(method: string, url: string): string {
    return `${method}_${Buffer.from(url).toString("base64")}`;
  }

  /**
   * Get data from cache (memory first, then session storage)
   */
  private getFromCache<T>(key: string): T | null {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && memoryEntry.expiry > Date.now()) {
      return memoryEntry.data;
    }

    // Check session storage
    const sessionKey = `api_cache_${key}`;
    const sessionEntry = this.sessionStorage.get<CacheEntry<T>>(sessionKey);
    if (sessionEntry && sessionEntry.expiry > Date.now()) {
      // Promote to memory cache
      this.memoryCache.set(key, sessionEntry);
      return sessionEntry.data;
    }

    return null;
  }

  /**
   * Set data in cache (both memory and session storage)
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + ttl,
    };

    // Set in memory cache
    this.memoryCache.set(key, entry);

    // Set in session storage (async, don't wait)
    const sessionKey = `api_cache_${key}`;
    this.sessionStorage.update(sessionKey, entry);
  }

  /**
   * Invalidate cache entries by key pattern
   */
  private invalidateCache(pattern: string): void {
    // Invalidate memory cache
    for (const key of Array.from(this.memoryCache.keys())) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Invalidate session storage
    const sessionKeys = this.context.workspaceState
      .keys()
      .filter((key) => key.startsWith("api_cache_") && key.includes(pattern));
    sessionKeys.forEach((key) => this.sessionStorage.update(key, undefined));
  }

  /**
   * Transform pull request data with proper date parsing
   */
  private transformPullRequest(pr: any): PullRequest {
    return {
      ...pr,
      creationDate: new Date(pr.creationDate),
      closedDate: pr.closedDate ? new Date(pr.closedDate) : undefined,
      lastMergeSourceCommit: {
        ...pr.lastMergeSourceCommit,
        author: {
          ...pr.lastMergeSourceCommit.author,
          date: new Date(pr.lastMergeSourceCommit.author.date),
        },
        committer: {
          ...pr.lastMergeSourceCommit.committer,
          date: new Date(pr.lastMergeSourceCommit.committer.date),
        },
      },
      lastMergeTargetCommit: {
        ...pr.lastMergeTargetCommit,
        author: {
          ...pr.lastMergeTargetCommit.author,
          date: new Date(pr.lastMergeTargetCommit.author.date),
        },
        committer: {
          ...pr.lastMergeTargetCommit.committer,
          date: new Date(pr.lastMergeTargetCommit.committer.date),
        },
      },
      lastMergeCommit: pr.lastMergeCommit
        ? {
            ...pr.lastMergeCommit,
            author: {
              ...pr.lastMergeCommit.author,
              date: new Date(pr.lastMergeCommit.author.date),
            },
            committer: {
              ...pr.lastMergeCommit.committer,
              date: new Date(pr.lastMergeCommit.committer.date),
            },
          }
        : undefined,
      repository: {
        ...pr.repository,
        project: {
          ...pr.repository.project,
          lastUpdateTime: new Date(pr.repository.project.lastUpdateTime),
        },
      },
    };
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Register callback for request completion notifications
   */
  public onRequestCompleted(callback: (duration: number, endpoint: string, success: boolean) => void): void {
    this.requestCallbacks.push(callback);
  }

  /**
   * Remove callback for request completion notifications
   */
  public removeRequestCallback(callback: (duration: number, endpoint: string, success: boolean) => void): void {
    const index = this.requestCallbacks.indexOf(callback);
    if (index > -1) {
      this.requestCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all registered callbacks about request completion
   */
  private notifyRequestCallbacks(duration: number, endpoint: string, success: boolean): void {
    this.requestCallbacks.forEach(callback => {
      try {
        callback(duration, endpoint, success);
      } catch (error) {
        console.error('Error in request callback:', error);
      }
    });
  }

  /**
   * Extract endpoint name from URL for monitoring
   */
  private extractEndpointFromUrl(url: string): string {
    try {
      // Remove organization URL and API version parameters
      const config = this.configService.getConfiguration();
      if (config.organizationUrl && url.startsWith(config.organizationUrl)) {
        const relativeUrl = url.substring(config.organizationUrl.length);
        // Extract the main endpoint (e.g., _apis/git/repositories, _apis/git/pullrequests)
        const match = relativeUrl.match(/\/(_apis\/[^\/?]+)/);
        return match ? match[1] : 'unknown';
      }
      return 'external';
    } catch {
      return 'unknown';
    }
  }
}
