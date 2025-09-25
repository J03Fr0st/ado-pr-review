# Backend Architecture Design for Azure DevOps PR Reviewer

## 1. Overall Architecture

### 1.1 System Components
```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                        │
├─────────────────┬───────────────────┬───────────────────────┤
│   Auth Manager  │    API Client     │     Cache Manager     │
├─────────────────┼───────────────────┼───────────────────────┤
│  Rate Limiter   │  Error Handler    │  Performance Monitor  │
├─────────────────┼───────────────────┼───────────────────────┤
│  Data Models    │  Event Emitter    │   Config Manager      │
└─────────────────┴───────────────────┴───────────────────────┘
                          │
                          ▼
           ┌─────────────────────────────────┐
           │        Azure DevOps API         │
           │   (REST API v7.1-preview.1)     │
           └─────────────────────────────────┘
```

### 1.2 Core Design Principles
- **Resilience First**: Robust error handling and graceful degradation
- **Performance Optimized**: Sub-5s initialization with intelligent caching
- **Security Focused**: Secure PAT handling and no sensitive data exposure
- **Rate Limit Compliant**: Respectful API usage with backoff strategies
- **Scalable**: Handle large PRs with incremental loading patterns

## 2. Azure DevOps REST API Client Implementation

### 2.1 Core API Client Architecture

```typescript
interface IAzureDevOpsApiClient {
  // Core operations
  getPullRequests(options: PullRequestListOptions): Promise<PullRequest[]>;
  getPullRequestDetails(id: number): Promise<PullRequestDetail>;
  getPullRequestFiles(id: number): Promise<PullRequestFile[]>;
  getComments(id: number): Promise<Comment[]>;

  // Actions
  approvePullRequest(id: number, comment?: string): Promise<void>;
  rejectPullRequest(id: number, comment: string): Promise<void>;
  addComment(id: number, comment: CommentInput): Promise<Comment>;

  // Utility
  validateConnection(): Promise<boolean>;
  getUserProfile(): Promise<UserProfile>;
}
```

### 2.2 HTTP Client Implementation

```typescript
class AzureDevOpsApiClient implements IAzureDevOpsApiClient {
  private readonly baseUrl: string;
  private readonly authManager: IAuthManager;
  private readonly rateLimiter: IRateLimiter;
  private readonly errorHandler: IErrorHandler;
  private readonly cache: ICacheManager;

  constructor(
    organization: string,
    project: string,
    authManager: IAuthManager,
    rateLimiter: IRateLimiter,
    errorHandler: IErrorHandler,
    cache: ICacheManager
  ) {
    this.baseUrl = `https://dev.azure.com/${organization}/${project}/_apis/git`;
    this.authManager = authManager;
    this.rateLimiter = rateLimiter;
    this.errorHandler = errorHandler;
    this.cache = cache;
  }

  private async makeRequest<T>(
    method: HttpMethod,
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    // Rate limiting check
    await this.rateLimiter.acquire();

    try {
      const token = await this.authManager.getToken();
      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json;api-version=7.1-preview.1',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal
      });

      if (!response.ok) {
        throw new ApiError(response.status, await response.text());
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.errorHandler.handleError(error);
      throw error;
    } finally {
      this.rateLimiter.release();
    }
  }
}
```

### 2.3 Authentication Manager

```typescript
interface IAuthManager {
  getToken(): Promise<string>;
  setToken(token: string): Promise<void>;
  validateToken(): Promise<boolean>;
  clearToken(): Promise<void>;
}

class AuthManager implements IAuthManager {
  private readonly secretStorage: vscode.SecretStorage;
  private readonly secretKey = 'azureDevOps.pat';
  private tokenCache?: string;

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  async getToken(): Promise<string> {
    if (this.tokenCache) {
      return this.tokenCache;
    }

    const token = await this.secretStorage.get(this.secretKey);
    if (!token) {
      throw new AuthenticationError('PAT not configured');
    }

    this.tokenCache = token;
    return token;
  }

  async setToken(token: string): Promise<void> {
    await this.secretStorage.store(this.secretKey, token);
    this.tokenCache = token;
  }

  async validateToken(): Promise<boolean> {
    try {
      const token = await this.getToken();
      // Test token with minimal API call
      const response = await fetch('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3', {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
          'Accept': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async clearToken(): Promise<void> {
    await this.secretStorage.delete(this.secretKey);
    this.tokenCache = undefined;
  }
}
```

## 3. Data Persistence and Caching Strategies

### 3.1 Multi-Layer Caching Architecture

```typescript
interface ICacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  clear(): Promise<void>;
}

class HybridCacheManager implements ICacheManager {
  private memoryCache = new Map<string, CacheEntry>();
  private persistentCache: Map<string, any>;

  constructor(context: vscode.ExtensionContext) {
    // Use VS Code global state for persistent caching
    this.persistentCache = context.globalState;
  }

  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first (fastest)
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      return memoryEntry.value as T;
    }

    // Check persistent cache
    const persistentValue = this.persistentCache.get(key);
    if (persistentValue && !this.isExpired(persistentValue)) {
      // Promote to memory cache
      this.memoryCache.set(key, persistentValue);
      return persistentValue.value as T;
    }

    return null;
  }

  async set<T>(key: string, value: T, ttl: number = 300000): Promise<void> {
    const entry: CacheEntry = {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    };

    // Store in both caches
    this.memoryCache.set(key, entry);
    await this.persistentCache.update(key, entry);
  }
}
```

### 3.2 Cache Strategy by Data Type

```typescript
enum CacheStrategy {
  Memory = 'memory',      // Fast, session-only
  Persistent = 'persistent', // Slower, cross-session
  Hybrid = 'hybrid'       // Memory + Persistent
}

const CACHE_POLICIES = {
  pullRequests: { strategy: CacheStrategy.Hybrid, ttl: 60000 },      // 1 minute
  prDetails: { strategy: CacheStrategy.Hybrid, ttl: 300000 },        // 5 minutes
  comments: { strategy: CacheStrategy.Memory, ttl: 30000 },          // 30 seconds
  userProfile: { strategy: CacheStrategy.Persistent, ttl: 3600000 }, // 1 hour
  repositories: { strategy: CacheStrategy.Persistent, ttl: 1800000 } // 30 minutes
};
```

### 3.3 Data Models

```typescript
interface PullRequest {
  pullRequestId: number;
  title: string;
  description: string;
  status: PullRequestStatus;
  createdBy: User;
  reviewers: Reviewer[];
  sourceRefName: string;
  targetRefName: string;
  repository: Repository;
  creationDate: Date;
  lastMergeSourceCommit: GitCommitRef;
  isDraft: boolean;
  hasConflicts: boolean;
  voteSummary: VoteSummary;
}

interface PullRequestDetail extends PullRequest {
  files?: PullRequestFile[];
  comments?: Comment[];
  workItems?: WorkItem[];
  commits?: GitCommitRef[];
  mergeStatus: PullRequestMergeStatus;
}

interface Comment {
  id: number;
  content: string;
  author: User;
  publishedDate: Date;
  lastUpdatedDate: Date;
  commentType: CommentType;
  status: CommentStatus;
  parentCommentId?: number;
  threadContext?: CommentThreadContext;
  replies?: Comment[];
}
```

## 4. Rate Limiting and Retry Mechanisms

### 4.1 Token Bucket Rate Limiter

```typescript
interface IRateLimiter {
  acquire(weight?: number): Promise<void>;
  release(): void;
  getRemainingTokens(): number;
  getResetTime(): Date;
}

class TokenBucketRateLimiter implements IRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;

  constructor(
    capacity: number = 200,    // Azure DevOps allows ~200 requests per minute
    refillRate: number = 200,  // Tokens per interval
    refillInterval: number = 60000 // 1 minute
  ) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(weight: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= weight) {
      this.tokens -= weight;
      return;
    }

    // Wait for tokens to be available
    const waitTime = this.calculateWaitTime(weight);
    await this.sleep(waitTime);
    return this.acquire(weight);
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed / this.refillInterval) * this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  private calculateWaitTime(weight: number): number {
    const tokensNeeded = weight - this.tokens;
    return (tokensNeeded / this.refillRate) * this.refillInterval;
  }
}
```

### 4.2 Exponential Backoff Retry Strategy

```typescript
interface IRetryStrategy {
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

class ExponentialBackoffRetry implements IRetryStrategy {
  constructor(
    private maxAttempts: number = 3,
    private baseDelay: number = 1000,
    private maxDelay: number = 30000,
    private backoffMultiplier: number = 2
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.maxAttempts) return false;

    // Retry on network errors, rate limits, and server errors
    return (
      error.code === 'NETWORK_ERROR' ||
      error.status === 429 || // Rate limited
      error.status === 502 || // Bad gateway
      error.status === 503 || // Service unavailable
      error.status === 504    // Gateway timeout
    );
  }

  private calculateDelay(attempt: number): number {
    const delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    const jitter = Math.random() * 0.1 * delay; // ±10% jitter
    return Math.min(delay + jitter, this.maxDelay);
  }
}
```

## 5. Error Handling and Resilience Patterns

### 5.1 Hierarchical Error Handling

```typescript
enum ErrorSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical'
}

interface IErrorHandler {
  handleError(error: Error): void;
  reportError(error: Error, context?: any): void;
}

class ErrorHandler implements IErrorHandler {
  private readonly logger: ILogger;
  private readonly notificationManager: INotificationManager;

  constructor(logger: ILogger, notificationManager: INotificationManager) {
    this.logger = logger;
    this.notificationManager = notificationManager;
  }

  handleError(error: Error): void {
    const errorInfo = this.categorizeError(error);

    // Log error with sanitized context
    this.logger.log(errorInfo.severity, errorInfo.message, {
      type: errorInfo.type,
      timestamp: new Date().toISOString(),
      sanitizedContext: this.sanitizeContext(error)
    });

    // Show user-friendly notification
    this.notificationManager.show(
      errorInfo.severity,
      errorInfo.userMessage,
      errorInfo.actions
    );

    // Report to telemetry (if enabled)
    if (errorInfo.severity === ErrorSeverity.Critical) {
      this.reportError(error);
    }
  }

  private categorizeError(error: Error): ErrorInfo {
    if (error instanceof AuthenticationError) {
      return {
        type: 'authentication',
        severity: ErrorSeverity.Warning,
        message: 'Authentication failed',
        userMessage: 'Please check your Personal Access Token configuration.',
        actions: ['Configure PAT', 'Help']
      };
    }

    if (error instanceof ApiError) {
      if (error.status === 429) {
        return {
          type: 'rate_limit',
          severity: ErrorSeverity.Info,
          message: 'Rate limit exceeded',
          userMessage: 'Too many requests. Waiting before retry...',
          actions: []
        };
      }

      if (error.status >= 500) {
        return {
          type: 'server_error',
          severity: ErrorSeverity.Error,
          message: 'Azure DevOps service error',
          userMessage: 'Azure DevOps is experiencing issues. Please try again later.',
          actions: ['Retry', 'Report Issue']
        };
      }
    }

    if (error instanceof NetworkError) {
      return {
        type: 'network',
        severity: ErrorSeverity.Warning,
        message: 'Network connectivity issue',
        userMessage: 'Unable to connect to Azure DevOps. Check your internet connection.',
        actions: ['Retry', 'Check Settings']
      };
    }

    // Unknown error - treat as critical
    return {
      type: 'unknown',
      severity: ErrorSeverity.Critical,
      message: 'Unexpected error occurred',
      userMessage: 'An unexpected error occurred. Please report this issue.',
      actions: ['Report Issue', 'Restart Extension']
    };
  }

  private sanitizeContext(error: any): any {
    // Remove sensitive information from error context
    const sensitive = ['authorization', 'token', 'password', 'secret', 'key'];

    function sanitize(obj: any): any {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitive.some(s => key.toLowerCase().includes(s))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          sanitized[key] = sanitize(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return sanitize(error);
  }
}
```

### 5.2 Circuit Breaker Pattern

```typescript
enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open'
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttempt: number = 0;

  constructor(
    private threshold: number = 5,      // Failures before opening
    private timeout: number = 60000,    // Reset timeout (1 minute)
    private monitorWindow: number = 30000 // Monitor window (30 seconds)
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.Open) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = CircuitState.HalfOpen;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.Closed;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.Open;
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}
```

## 6. Performance Optimization for Large PRs

### 6.1 Incremental Loading Strategy

```typescript
interface IIncrementalLoader<T> {
  loadPage(page: number, pageSize: number): Promise<PagedResult<T>>;
  loadAll(maxItems?: number): AsyncGenerator<T>;
}

class PullRequestIncrementalLoader implements IIncrementalLoader<PullRequest> {
  constructor(
    private apiClient: IAzureDevOpsApiClient,
    private cache: ICacheManager
  ) {}

  async loadPage(page: number, pageSize: number = 25): Promise<PagedResult<PullRequest>> {
    const cacheKey = `pr-page-${page}-${pageSize}`;
    const cached = await this.cache.get<PagedResult<PullRequest>>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.apiClient.getPullRequests({
      top: pageSize,
      skip: page * pageSize,
      searchCriteria: {
        status: 'active'
      }
    });

    await this.cache.set(cacheKey, result, 60000); // Cache for 1 minute
    return result;
  }

  async* loadAll(maxItems: number = 1000): AsyncGenerator<PullRequest> {
    let page = 0;
    let totalLoaded = 0;
    const pageSize = 25;

    while (totalLoaded < maxItems) {
      const result = await this.loadPage(page, pageSize);

      for (const item of result.value) {
        if (totalLoaded >= maxItems) break;
        yield item;
        totalLoaded++;
      }

      if (result.value.length < pageSize) {
        break; // No more data
      }

      page++;
    }
  }
}
```

### 6.2 Lazy Loading for PR Details

```typescript
class LazyPullRequestDetail {
  private _files?: PullRequestFile[];
  private _comments?: Comment[];
  private _commits?: GitCommitRef[];

  constructor(
    private prId: number,
    private apiClient: IAzureDevOpsApiClient,
    private cache: ICacheManager
  ) {}

  async getFiles(force: boolean = false): Promise<PullRequestFile[]> {
    if (this._files && !force) {
      return this._files;
    }

    const cacheKey = `pr-files-${this.prId}`;
    let files = await this.cache.get<PullRequestFile[]>(cacheKey);

    if (!files || force) {
      files = await this.apiClient.getPullRequestFiles(this.prId);
      await this.cache.set(cacheKey, files, 300000); // 5 minutes
    }

    this._files = files;
    return files;
  }

  async getComments(force: boolean = false): Promise<Comment[]> {
    if (this._comments && !force) {
      return this._comments;
    }

    const cacheKey = `pr-comments-${this.prId}`;
    let comments = await this.cache.get<Comment[]>(cacheKey);

    if (!comments || force) {
      comments = await this.apiClient.getComments(this.prId);
      await this.cache.set(cacheKey, comments, 30000); // 30 seconds
    }

    this._comments = comments;
    return comments;
  }
}
```

### 6.3 Background Preloading

```typescript
class BackgroundPreloader {
  private preloadQueue: Set<number> = new Set();
  private isProcessing: boolean = false;

  constructor(
    private apiClient: IAzureDevOpsApiClient,
    private cache: ICacheManager,
    private rateLimiter: IRateLimiter
  ) {}

  queueForPreload(prId: number): void {
    this.preloadQueue.add(prId);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.preloadQueue.size === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = Array.from(this.preloadQueue).slice(0, 3); // Process 3 at a time
      batch.forEach(id => this.preloadQueue.delete(id));

      await Promise.allSettled(
        batch.map(prId => this.preloadPullRequest(prId))
      );
    } finally {
      this.isProcessing = false;

      // Continue processing if more items were added
      if (this.preloadQueue.size > 0) {
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  private async preloadPullRequest(prId: number): Promise<void> {
    try {
      await this.rateLimiter.acquire();

      const [files, comments] = await Promise.allSettled([
        this.apiClient.getPullRequestFiles(prId),
        this.apiClient.getComments(prId)
      ]);

      if (files.status === 'fulfilled') {
        await this.cache.set(`pr-files-${prId}`, files.value, 300000);
      }

      if (comments.status === 'fulfilled') {
        await this.cache.set(`pr-comments-${prId}`, comments.value, 30000);
      }
    } catch (error) {
      // Silent preload failures - don't interrupt user workflow
      console.debug(`Preload failed for PR ${prId}:`, error);
    }
  }
}
```

## 7. Configuration Management

```typescript
interface ExtensionConfig {
  organization: string;
  project: string;
  repositories: string[];
  defaultBranch: string;
  maxPRsToLoad: number;
  preloadEnabled: boolean;
  cacheTTL: {
    pullRequests: number;
    prDetails: number;
    comments: number;
    userProfile: number;
  };
  rateLimiting: {
    requestsPerMinute: number;
    burstCapacity: number;
  };
}

class ConfigurationManager {
  private config: ExtensionConfig;

  constructor(private context: vscode.ExtensionContext) {
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    const workspaceConfig = vscode.workspace.getConfiguration('azureDevOpsPR');

    this.config = {
      organization: workspaceConfig.get('organization', ''),
      project: workspaceConfig.get('project', ''),
      repositories: workspaceConfig.get('repositories', []),
      defaultBranch: workspaceConfig.get('defaultBranch', 'main'),
      maxPRsToLoad: workspaceConfig.get('maxPRsToLoad', 100),
      preloadEnabled: workspaceConfig.get('preloadEnabled', true),
      cacheTTL: {
        pullRequests: workspaceConfig.get('cacheTTL.pullRequests', 60000),
        prDetails: workspaceConfig.get('cacheTTL.prDetails', 300000),
        comments: workspaceConfig.get('cacheTTL.comments', 30000),
        userProfile: workspaceConfig.get('cacheTTL.userProfile', 3600000)
      },
      rateLimiting: {
        requestsPerMinute: workspaceConfig.get('rateLimiting.requestsPerMinute', 150),
        burstCapacity: workspaceConfig.get('rateLimiting.burstCapacity', 200)
      }
    };
  }

  getConfig(): ExtensionConfig {
    return this.config;
  }

  async updateConfig(updates: Partial<ExtensionConfig>): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration('azureDevOpsPR');

    for (const [key, value] of Object.entries(updates)) {
      await workspaceConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
    }

    this.loadConfiguration();
  }
}
```

## 8. Implementation Timeline and Priorities

### Phase 1: Foundation (Week 1-2)
- Core API client with authentication
- Basic rate limiting and error handling
- Simple in-memory caching
- Basic data models

### Phase 2: Resilience (Week 3-4)
- Advanced error handling patterns
- Circuit breaker implementation
- Retry mechanisms with exponential backoff
- Persistent caching layer

### Phase 3: Performance (Week 5-6)
- Incremental loading for large PRs
- Background preloading
- Advanced caching strategies
- Performance monitoring

### Phase 4: Polish (Week 7-8)
- Configuration management
- Comprehensive logging
- Error reporting and telemetry
- Performance optimization

## 9. Key Performance Metrics

### Initialization Performance
- **Target**: <5s for first PR list load
- **Measurement**: Time from extension activation to PR list display
- **Optimization**: Parallel requests, aggressive caching, preloading

### API Efficiency
- **Target**: 95%+ cache hit rate for repeated operations
- **Measurement**: Cache hits vs API calls ratio
- **Optimization**: Smart cache invalidation, background refresh

### Error Resilience
- **Target**: <1% unhandled errors reaching user
- **Measurement**: Error categorization and handling coverage
- **Optimization**: Comprehensive error taxonomy, graceful degradation

### Memory Usage
- **Target**: <50MB additional memory usage
- **Measurement**: VS Code memory profiling
- **Optimization**: Cache size limits, garbage collection optimization

This architecture provides a robust, scalable foundation for the Azure DevOps PR Reviewer extension, prioritizing security, performance, and reliability while maintaining clean separation of concerns and extensibility for future enhancements.