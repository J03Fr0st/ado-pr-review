import * as vscode from "vscode";
import { PullRequestService } from "../services/PullRequestService";
import { CommentService } from "../services/CommentService";
import { CacheManager } from "../services/CacheManager";
import { StateManager } from "../services/StateManager";
import { TelemetryService } from "../services/TelemetryService";
import { MonitoringService } from "../services/MonitoringService";
import { ErrorHandler, ErrorCategory } from "../utils/ErrorHandler";
import {
  PullRequest,
  Comment,
  CommentThread,
  GitRepository,
  GitPullRequestIteration,
  PullRequestVote,
} from "../api/models";
import { AzureDevOpsApiClient } from "../api/AzureDevOpsApiClient";

/**
 * Integration service coordinates between UI components and backend services
 * Provides performance optimization, error recovery, and large PR handling
 */
export class IntegrationService implements vscode.Disposable {
  private readonly pullRequestService: PullRequestService;
  private readonly commentService: CommentService;
  private readonly cacheManager: CacheManager;
  private readonly stateManager: StateManager;
  private readonly telemetryService: TelemetryService;
  private readonly monitoringService: MonitoringService;
  private readonly errorHandler: ErrorHandler;
  private readonly apiClient: AzureDevOpsApiClient;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly loadingStates = new Map<string, number>();
  private readonly retryCounts = new Map<string, number>();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(
    pullRequestService: PullRequestService,
    commentService: CommentService,
    cacheManager: CacheManager,
    stateManager: StateManager,
    telemetryService: TelemetryService,
    monitoringService: MonitoringService,
    apiClient: AzureDevOpsApiClient
  ) {
    this.pullRequestService = pullRequestService;
    this.commentService = commentService;
    this.cacheManager = cacheManager;
    this.stateManager = stateManager;
    this.telemetryService = telemetryService;
    this.monitoringService = monitoringService;
    this.apiClient = apiClient;
    this.errorHandler = ErrorHandler.getInstance(telemetryService);

    this.setupPerformanceMonitoring();
  }

  /**
   * Get pull requests with performance optimization and error recovery
   */
  async getPullRequests(
    repositoryId?: string
  ): Promise<{ repository: GitRepository; pullRequests: PullRequest[] }[]> {
    const cacheKey = repositoryId
      ? `pullRequests_${repositoryId}`
      : "allPullRequests";

    // Check cache first
    const cached = await this.cacheManager.get<
      { repository: GitRepository; pullRequests: PullRequest[] }[]
    >(cacheKey);
    if (cached) {
      this.telemetryService.trackEvent("cacheHit", {
        cacheKey,
        type: "pullRequests",
      });
      return cached;
    }

    // Set loading state
    this.setLoadingState(cacheKey, true);

    try {
      const startTime = Date.now();

      // Get repositories and pull requests in parallel
      const repositories = Array.from(
        this.stateManager.getRepositories().values()
      );
      const results: {
        repository: GitRepository;
        pullRequests: PullRequest[];
      }[] = [];

      for (const repository of repositories) {
        if (repositoryId && repository.id !== repositoryId) {
          continue;
        }

        const pullRequests = await this.pullRequestService.getPullRequests();
        results.push({ repository, pullRequests });
      }

      const duration = Date.now() - startTime;
      this.monitoringService.trackPerformance(
        "getPullRequests",
        duration,
        true
      );
      this.telemetryService.trackEvent("pullRequestsLoaded", {
        count: results
          .reduce((sum, r) => sum + r.pullRequests.length, 0)
          .toString(),
        duration: duration.toString(),
        fromCache: "false",
      });

      // Cache results
      await this.cacheManager.set(cacheKey, results, 300000); // 5 minutes

      return results;
    } catch (error) {
      const duration = Date.now() - (this.loadingStates.get(cacheKey) || 0);
      this.monitoringService.trackPerformance(
        "getPullRequests",
        duration,
        false
      );
      await this.errorHandler.handleError(
        error instanceof Error ? error : String(error),
        ErrorCategory.API
      );
      throw error;
    } finally {
      this.setLoadingState(cacheKey, false);
    }
  }

  /**
   * Get pull request details with incremental loading for large PRs
   */
  async getPullRequestDetails(
    repositoryId: string,
    pullRequestId: number
  ): Promise<{
    pullRequest: PullRequest;
    iterations: GitPullRequestIteration[];
    commentThreads: CommentThread[];
    fileCount: number;
  }> {
    const cacheKey = `prDetails_${repositoryId}_${pullRequestId}`;

    // Check cache
    const cached = await this.cacheManager.get<{
      pullRequest: PullRequest;
      iterations: GitPullRequestIteration[];
      commentThreads: CommentThread[];
      fileCount: number;
    }>(cacheKey);
    if (cached) {
      this.telemetryService.trackEvent("cacheHit", {
        cacheKey,
        type: "prDetails",
      });
      return cached;
    }

    this.setLoadingState(cacheKey, true);

    try {
      const startTime = Date.now();

      // Get basic PR info first
      const pullRequest = await this.pullRequestService.getPullRequest(
        repositoryId,
        pullRequestId
      );

      if (!pullRequest) {
        throw new Error(`Pull request ${pullRequestId} not found`);
      }

      // Get iterations and comments in parallel
      const [iterations, commentThreads] = await Promise.all([
        this.pullRequestService.getPullRequestIterations(
          repositoryId,
          pullRequestId
        ),
        this.commentService.getCommentThreads(repositoryId, pullRequestId),
      ]);

      // For large PRs, get file count without loading all files
      let fileCount = 0;
      if (iterations.length > 0) {
        const latestIteration = iterations[iterations.length - 1];
        fileCount = latestIteration.changeList?.length || 0;
      }

      const result = {
        pullRequest,
        iterations,
        commentThreads,
        fileCount,
      };

      const duration = Date.now() - startTime;
      this.monitoringService.trackPerformance(
        "getPullRequestDetails",
        duration,
        true
      );
      this.telemetryService.trackEvent("prDetailsLoaded", {
        pullRequestId: pullRequestId.toString(),
        fileCount: fileCount.toString(),
        duration: duration.toString(),
        commentCount: commentThreads.length.toString(),
      });

      // Cache result
      await this.cacheManager.set(cacheKey, result, 180000); // 3 minutes

      return result;
    } catch (error) {
      const duration = Date.now() - (this.loadingStates.get(cacheKey) || 0);
      this.monitoringService.trackPerformance(
        "getPullRequestDetails",
        duration,
        false
      );
      await this.errorHandler.handleError(
        error instanceof Error ? error : String(error),
        ErrorCategory.API
      );
      throw error;
    } finally {
      this.setLoadingState(cacheKey, false);
    }
  }

  /**
   * Get pull request files with pagination for large PRs
   */
  async getPullRequestFiles(
    repositoryId: string,
    pullRequestId: number,
    iterationId: number,
    skip = 0,
    top = 50
  ): Promise<{
    files: any[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const cacheKey = `prFiles_${repositoryId}_${pullRequestId}_${iterationId}_${skip}_${top}`;

    const cached = await this.cacheManager.get<{
      files: any[];
      totalCount: number;
      hasMore: boolean;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    this.setLoadingState(cacheKey, true);

    try {
      const startTime = Date.now();

      // Use API client directly for pagination support
      const files = await this.apiClient.getPullRequestFiles(
        repositoryId,
        pullRequestId,
        iterationId,
        skip,
        top
      );

      const result = {
        files: files.value || [],
        totalCount: files.count || 0,
        hasMore: (files.count || 0) > skip + top,
      };

      const duration = Date.now() - startTime;
      this.monitoringService.trackPerformance(
        "getPullRequestFiles",
        duration,
        true
      );

      // Cache paginated results for shorter time
      await this.cacheManager.set(cacheKey, result, 60000); // 1 minute

      return result;
    } catch (error) {
      const duration = Date.now() - (this.loadingStates.get(cacheKey) || 0);
      this.monitoringService.trackPerformance(
        "getPullRequestFiles",
        duration,
        false
      );
      await this.errorHandler.handleError(
        error instanceof Error ? error : String(error),
        ErrorCategory.API
      );
      throw error;
    } finally {
      this.setLoadingState(cacheKey, false);
    }
  }

  /**
   * Approve pull request with error recovery and validation
   */
  async approvePullRequest(
    repositoryId: string,
    pullRequestId: number
  ): Promise<{
    success: boolean;
    error?: string;
    vote?: PullRequestVote;
  }> {
    const operationKey = `approve_${repositoryId}_${pullRequestId}`;

    return this.executeWithRetry(operationKey, async () => {
      const startTime = Date.now();

      // Validate PR state first
      const prDetails = await this.getPullRequestDetails(
        repositoryId,
        pullRequestId
      );
      if (prDetails.pullRequest.status !== "active") {
        throw new Error(
          `Cannot approve PR in '${prDetails.pullRequest.status}' state`
        );
      }

      const result = await this.pullRequestService.approvePullRequest(
        repositoryId,
        pullRequestId
      );

      const duration = Date.now() - startTime;
      this.monitoringService.trackPerformance(
        "approvePullRequest",
        duration,
        result.success
      );
      this.telemetryService.trackPullRequestOperation("approve", {
        repositoryId,
        pullRequestId: pullRequestId.toString(),
        success: result.success.toString(),
      });

      // Clear related cache
      await this.clearPullRequestCache(repositoryId, pullRequestId);

      return result;
    });
  }

  /**
   * Reject pull request with comment validation
   */
  async rejectPullRequest(
    repositoryId: string,
    pullRequestId: number,
    comment: string
  ): Promise<{
    success: boolean;
    error?: string;
    vote?: PullRequestVote;
  }> {
    const operationKey = `reject_${repositoryId}_${pullRequestId}`;

    return this.executeWithRetry(operationKey, async () => {
      const startTime = Date.now();

      // Validate comment
      if (!comment || comment.trim().length === 0) {
        throw new Error("Rejection comment is required");
      }

      const result = await this.pullRequestService.rejectPullRequest(
        repositoryId,
        pullRequestId,
        comment
      );

      const duration = Date.now() - startTime;
      this.monitoringService.trackPerformance(
        "rejectPullRequest",
        duration,
        result.success
      );
      this.telemetryService.trackPullRequestOperation("reject", {
        repositoryId,
        pullRequestId: pullRequestId.toString(),
        success: result.success.toString(),
      });

      // Clear related cache
      await this.clearPullRequestCache(repositoryId, pullRequestId);

      return result;
    });
  }

  /**
   * Add comment to pull request with validation
   */
  async addComment(
    repositoryId: string,
    pullRequestId: number,
    content: string,
    threadId?: number,
    filePath?: string,
    line?: number
  ): Promise<{
    success: boolean;
    error?: string;
    comment?: Comment;
  }> {
    const operationKey = `comment_${repositoryId}_${pullRequestId}_${Date.now()}`;

    return this.executeWithRetry(operationKey, async () => {
      const startTime = Date.now();

      // Validate comment content
      if (!content || content.trim().length === 0) {
        throw new Error("Comment content is required");
      }

      const options = {
        content,
        threadId,
        filePath,
        line,
      };

      const result = await this.commentService.addComment(
        repositoryId,
        pullRequestId,
        options
      );

      const duration = Date.now() - startTime;
      const success = result !== null;
      this.monitoringService.trackPerformance("addComment", duration, success);
      this.telemetryService.trackPullRequestOperation("comment", {
        repositoryId,
        pullRequestId: pullRequestId.toString(),
        success: success.toString(),
      });

      // Clear PR details cache
      await this.cacheManager.delete(
        `prDetails_${repositoryId}_${pullRequestId}`
      );

      return {
        success,
        comment: result || undefined,
      };
    });
  }

  /**
   * Execute operation with retry logic and error recovery
   */
  private async executeWithRetry<T>(
    operationKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const retryCount = this.retryCounts.get(operationKey) || 0;

    try {
      const result = await operation();
      this.retryCounts.delete(operationKey);
      return result;
    } catch (error) {
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        this.retryCounts.set(operationKey, retryCount + 1);
        const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff

        this.telemetryService.trackEvent("retryAttempt", {
          operationKey,
          attempt: (retryCount + 1).toString(),
          delay: delay.toString(),
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operationKey, operation);
      }

      this.retryCounts.delete(operationKey);
      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors, timeout errors, and rate limiting are retryable
    return (
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ENOTFOUND" ||
      error.statusCode === 429 || // Too Many Requests
      error.statusCode === 503 || // Service Unavailable
      error.statusCode === 504 // Gateway Timeout
    );
  }

  /**
   * Set loading state for UI feedback
   */
  private setLoadingState(key: string, loading: boolean): void {
    if (loading) {
      this.loadingStates.set(key, Date.now());
    } else {
      this.loadingStates.delete(key);
    }
  }

  /**
   * Clear pull request related cache
   */
  private async clearPullRequestCache(
    repositoryId: string,
    pullRequestId: number
  ): Promise<void> {
    const cacheKeys = [
      `prDetails_${repositoryId}_${pullRequestId}`,
      `prFiles_${repositoryId}_${pullRequestId}`,
      `pullRequests_${repositoryId}`,
      "allPullRequests",
    ];

    await Promise.all(cacheKeys.map((key) => this.cacheManager.delete(key)));
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    // Monitor cache performance
    setInterval(() => {
      const cacheStats = this.cacheManager.getStatistics();
      this.monitoringService.trackPerformance(
        "cacheHitRate",
        cacheStats.hitRate * 100,
        true
      );
    }, 60000); // Every minute

    // Monitor loading states
    setInterval(() => {
      const now = Date.now();
      const staleLoadingStates = Array.from(
        this.loadingStates.entries()
      ).filter(([_, timestamp]) => now - timestamp > 30000); // 30 seconds

      if (staleLoadingStates.length > 0) {
        this.telemetryService.trackEvent("staleLoadingStates", {
          count: staleLoadingStates.length.toString(),
        });

        // Clear stale loading states
        staleLoadingStates.forEach(([key]) => this.loadingStates.delete(key));
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Get integration status for debugging
   */
  getStatus(): {
    loadingStates: number;
    retryCounts: number;
    cacheStatistics: any;
    performanceMetrics: any;
  } {
    return {
      loadingStates: this.loadingStates.size,
      retryCounts: this.retryCounts.size,
      cacheStatistics: this.cacheManager.getStatistics(),
      performanceMetrics: this.monitoringService.getPerformanceMetrics(),
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.loadingStates.clear();
    this.retryCounts.clear();
  }
}
