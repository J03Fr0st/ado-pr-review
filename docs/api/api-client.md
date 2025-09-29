# Azure DevOps API Client

REST API client for Azure DevOps with rate limiting, caching, and comprehensive error handling.

## Overview

The `AzureDevOpsApiClient` class provides a robust interface to Azure DevOps REST APIs with:
- **Rate limiting** (200 requests/minute) with exponential backoff
- **Multi-layer caching** (memory + session storage)
- **Request/response type safety** with TypeScript interfaces
- **Comprehensive error handling** without token exposure
- **Performance monitoring** with request/response timing

## API Version

**Azure DevOps API v7.1-preview.1**

## Class Definition

```typescript
class AzureDevOpsApiClient {
  constructor(
    authService: AuthenticationService,
    configService: ConfigurationService,
    context: vscode.ExtensionContext
  )
}
```

## Configuration

### Rate Limiting

```typescript
const RATE_LIMIT: RateLimitConfig = {
  maxRequests: 200,      // Maximum requests per window
  windowMs: 60000,       // 1 minute window
  retryAfterMs: 60000,   // Wait time after rate limit hit
  maxRetries: 3          // Maximum retry attempts
};
```

### Default Settings

```typescript
DEFAULT_TIMEOUT = 30000;        // 30 seconds
DEFAULT_CACHE_TTL = 300000;     // 5 minutes
USER_AGENT = "Azure-DevOps-PR-Reviewer-VSCode/1.0.0";
```

## Core Methods

### Repository Operations

#### getRepositories()

Get all repositories for the configured project.

**Signature:**
```typescript
async getRepositories(
  options?: ApiRequestOptions
): Promise<GitRepository[]>
```

**Parameters:**
- `options` - Optional request options

**Returns:** Array of repository objects

**Example:**
```typescript
const repos = await apiClient.getRepositories({
  useCache: true,
  cacheTtl: 300000  // 5 minute cache
});

console.log(`Found ${repos.length} repositories`);
```

**Throws:**
- `Error` if project not configured
- `Error` on API failure

---

### Pull Request Operations

#### getPullRequests()

Get pull requests for a specific repository.

**Signature:**
```typescript
async getPullRequests(
  repositoryId: string,
  status?: string,
  options?: ApiRequestOptions
): Promise<PullRequest[]>
```

**Parameters:**
- `repositoryId` - Repository ID
- `status` - Optional status filter (`active`, `completed`, `abandoned`, `all`)
- `options` - Optional request options

**Returns:** Array of pull request objects

**Example:**
```typescript
// Get all active PRs
const activePrs = await apiClient.getPullRequests(
  'repo-id',
  'active',
  { useCache: true }
);

// Get all PRs (no status filter)
const allPrs = await apiClient.getPullRequests('repo-id');
```

---

#### getPullRequest()

Get specific pull request by ID.

**Signature:**
```typescript
async getPullRequest(
  repositoryId: string,
  pullRequestId: number,
  options?: ApiRequestOptions
): Promise<PullRequest>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `options` - Optional request options

**Returns:** Pull request object with full details

**Example:**
```typescript
const pr = await apiClient.getPullRequest('repo-id', 123, {
  useCache: true,
  cacheTtl: 60000  // 1 minute cache
});

console.log(`PR Title: ${pr.title}`);
console.log(`Status: ${pr.status}`);
console.log(`Created: ${pr.creationDate.toLocaleString()}`);
```

---

#### getPullRequestFiles()

Get pull request files with pagination support for large PRs.

**Signature:**
```typescript
async getPullRequestFiles(
  repositoryId: string,
  pullRequestId: number,
  iterationId?: number,
  skip?: number,
  top?: number
): Promise<{
  value: any[];
  count: number;
}>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `iterationId` - Optional iteration ID (defaults to latest)
- `skip` - Number of files to skip (default: 0)
- `top` - Maximum files to return (default: 50)

**Returns:** Object with file array and total count

**Example:**
```typescript
// Get first 50 files
const page1 = await apiClient.getPullRequestFiles(
  'repo-id',
  123,
  undefined,
  0,
  50
);

// Get next 50 files
const page2 = await apiClient.getPullRequestFiles(
  'repo-id',
  123,
  undefined,
  50,
  50
);

console.log(`Total files: ${page1.count}`);
console.log(`Loaded: ${page1.value.length + page2.value.length}`);
```

**Performance Note:** File content is NOT included by default (`$includeContent=false`) for optimal performance.

---

### Comment Operations

#### getCommentThreads()

Get comment threads for a pull request.

**Signature:**
```typescript
async getCommentThreads(
  repositoryId: string,
  pullRequestId: number,
  options?: ApiRequestOptions
): Promise<CommentThread[]>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `options` - Optional request options

**Returns:** Array of comment threads with nested comments

**Example:**
```typescript
const threads = await apiClient.getCommentThreads('repo-id', 123);

threads.forEach(thread => {
  console.log(`Thread status: ${thread.status}`);
  thread.comments.forEach(comment => {
    console.log(`  ${comment.author.displayName}: ${comment.content}`);
  });
});
```

---

#### addComment()

Add a comment to a pull request (new thread or reply).

**Signature:**
```typescript
async addComment(
  repositoryId: string,
  pullRequestId: number,
  comment: string,
  threadId?: number
): Promise<Comment>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `comment` - Comment content
- `threadId` - Optional thread ID to reply to existing thread

**Returns:** Created comment object

**Example:**
```typescript
// Create new comment thread
const newComment = await apiClient.addComment(
  'repo-id',
  123,
  'This looks good to me!'
);

// Reply to existing thread
const reply = await apiClient.addComment(
  'repo-id',
  123,
  'Thanks for the feedback!',
  threadId
);
```

---

### Voting Operations

#### votePullRequest()

Vote on a pull request.

**Signature:**
```typescript
async votePullRequest(
  repositoryId: string,
  pullRequestId: number,
  vote: number
): Promise<void>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `vote` - Vote value:
  - `10` - Approved
  - `5` - Approved with suggestions
  - `0` - No vote
  - `-5` - Waiting for author
  - `-10` - Rejected

**Returns:** Promise that resolves when vote is recorded

**Example:**
```typescript
// Approve PR
await apiClient.votePullRequest('repo-id', 123, 10);

// Reject PR
await apiClient.votePullRequest('repo-id', 123, -10);

// No vote (reset)
await apiClient.votePullRequest('repo-id', 123, 0);
```

**Side Effects:** Invalidates PR cache

---

#### abandonPullRequest()

Abandon a pull request.

**Signature:**
```typescript
async abandonPullRequest(
  repositoryId: string,
  pullRequestId: number
): Promise<void>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID

**Returns:** Promise that resolves when PR is abandoned

**Example:**
```typescript
await apiClient.abandonPullRequest('repo-id', 123);
```

**Side Effects:** Invalidates PR and repository cache

---

### Generic HTTP Methods

#### get()

Generic GET request with caching support.

**Signature:**
```typescript
async get<T>(
  url: string,
  options?: ApiRequestOptions
): Promise<T>
```

**Example:**
```typescript
const response = await apiClient.get<ApiResponse<PullRequest>>(
  url,
  { useCache: true, cacheTtl: 60000 }
);
```

---

#### post()

Generic POST request.

**Signature:**
```typescript
async post<T>(
  url: string,
  data: any,
  options?: ApiRequestOptions
): Promise<T>
```

---

#### put()

Generic PUT request.

**Signature:**
```typescript
async put<T>(
  url: string,
  data: any,
  options?: ApiRequestOptions
): Promise<T>
```

---

#### patch()

Generic PATCH request.

**Signature:**
```typescript
async patch<T>(
  url: string,
  data: any,
  options?: ApiRequestOptions
): Promise<T>
```

---

#### delete()

Generic DELETE request.

**Signature:**
```typescript
async delete<T>(
  url: string,
  options?: ApiRequestOptions
): Promise<T>
```

---

## Request Options

```typescript
interface ApiRequestOptions {
  readonly useCache?: boolean;  // Enable caching (default: true)
  readonly cacheTtl?: number;   // Time to live in milliseconds
  readonly timeout?: number;    // Request timeout (default: 30000ms)
  readonly retries?: number;    // Retry attempts (default: 3)
}
```

## Cache Management

### clearCache()

Clear all cached data (memory and session storage).

**Signature:**
```typescript
clearCache(): void
```

**Example:**
```typescript
apiClient.clearCache();
```

---

### getCacheStats()

Get cache statistics for monitoring.

**Signature:**
```typescript
getCacheStats(): {
  memoryEntries: number;
  sessionEntries: number;
  hitRate?: number;
}
```

**Example:**
```typescript
const stats = apiClient.getCacheStats();
console.log(`Memory cache: ${stats.memoryEntries} entries`);
console.log(`Session cache: ${stats.sessionEntries} entries`);
```

---

## Performance Monitoring

### onRequestCompleted()

Register callback for request completion notifications.

**Signature:**
```typescript
onRequestCompleted(
  callback: (duration: number, endpoint: string, success: boolean) => void
): void
```

**Example:**
```typescript
apiClient.onRequestCompleted((duration, endpoint, success) => {
  console.log(`${endpoint}: ${duration}ms (${success ? 'success' : 'failed'})`);

  // Record metrics
  monitoringService.recordMetric('api.latency', duration);
  monitoringService.recordMetric('api.success', success ? 1 : 0);
});
```

---

### removeRequestCallback()

Remove registered callback.

**Signature:**
```typescript
removeRequestCallback(
  callback: (duration: number, endpoint: string, success: boolean) => void
): void
```

---

## Error Handling

The API client provides comprehensive error handling:

### Authentication Errors

**Status:** 401, 403

**Error Message:** `"Authentication failed. Please check your Personal Access Token."`

**Resolution:** Update PAT through configuration

---

### Rate Limit Errors

**Status:** 429

**Behavior:** Automatic retry with exponential backoff (up to 3 attempts)

**Wait Time:** Uses `Retry-After` header or defaults to 60 seconds

---

### Network Errors

**Codes:** `ENOTFOUND`, `ECONNREFUSED`

**Error Message:** `"Unable to connect to Azure DevOps. Please check your network connection."`

---

### Generic Errors

**Error Message:** `"Request failed. Please try again."` or API-specific error message

---

## Interceptors

### Request Interceptor

Automatically adds:
- **Authorization header** from AuthenticationService
- **API version parameter** (`api-version=7.1-preview.1`)
- **Rate limiting checks** before sending request
- **Timing metadata** for performance monitoring

### Response Interceptor

Handles:
- **Request timing** for monitoring callbacks
- **Rate limit responses** (429) with automatic retry
- **Authentication errors** (401, 403) with clear messages
- **Network errors** with user-friendly messages

---

## Data Transformation

### Date Parsing

All date fields are automatically converted from ISO strings to JavaScript `Date` objects:

```typescript
// API returns ISO string
"creationDate": "2025-01-15T10:30:00Z"

// Transformed to Date object
pullRequest.creationDate: Date // JavaScript Date instance
```

---

## Cache Strategy

### Cache Levels

1. **Memory Cache** (L1)
   - Fast in-memory Map
   - First lookup location
   - Volatile (cleared on extension reload)

2. **Session Storage** (L2)
   - VS Code workspace state
   - Persists across view changes
   - Cleared on workspace close

### Cache Keys

```typescript
// Format: METHOD_base64(url)
const cacheKey = `GET_${Buffer.from(url).toString("base64")}`;
```

### Cache Invalidation

Automatic invalidation on mutations:
- `votePullRequest()` → Invalidates specific PR cache
- `abandonPullRequest()` → Invalidates PR and repository cache
- `addComment()` → No automatic invalidation (comment threads cached separately)

---

## Best Practices

### 1. Use Caching Appropriately

```typescript
// Good: Short cache for frequently changing data
const prs = await apiClient.getPullRequests('repo-id', 'active', {
  useCache: true,
  cacheTtl: 15000  // 15 seconds
});

// Good: Longer cache for stable data
const repos = await apiClient.getRepositories({
  useCache: true,
  cacheTtl: 300000  // 5 minutes
});

// Bad: Disable cache unnecessarily
const prs = await apiClient.getPullRequests('repo-id', 'active', {
  useCache: false  // Unnecessary API load
});
```

### 2. Handle Pagination for Large PRs

```typescript
// Good: Load files in chunks
async function loadAllFiles(repositoryId: string, pullRequestId: number) {
  const files: any[] = [];
  let skip = 0;
  const pageSize = 50;

  while (true) {
    const page = await apiClient.getPullRequestFiles(
      repositoryId,
      pullRequestId,
      undefined,
      skip,
      pageSize
    );

    files.push(...page.value);

    if (files.length >= page.count) {
      break;
    }

    skip += pageSize;
  }

  return files;
}
```

### 3. Monitor Performance

```typescript
apiClient.onRequestCompleted((duration, endpoint, success) => {
  if (duration > 5000) {
    console.warn(`Slow request: ${endpoint} took ${duration}ms`);
  }

  if (!success) {
    telemetryService.trackEvent('api.error', { endpoint });
  }
});
```

### 4. Clear Cache When Needed

```typescript
// Clear cache after bulk operations
async function bulkApproveReject(operations: Operation[]) {
  for (const op of operations) {
    await apiClient.votePullRequest(op.repoId, op.prId, op.vote);
  }

  // Clear to force fresh data
  apiClient.clearCache();
}
```

---

## Testing

### Unit Test Example

```typescript
import { AzureDevOpsApiClient } from './api/AzureDevOpsApiClient';

describe('AzureDevOpsApiClient', () => {
  let apiClient: AzureDevOpsApiClient;
  let mockAuthService: AuthenticationService;
  let mockConfigService: ConfigurationService;

  beforeEach(() => {
    mockAuthService = createMockAuthService();
    mockConfigService = createMockConfigService();
    apiClient = new AzureDevOpsApiClient(
      mockAuthService,
      mockConfigService,
      mockContext
    );
  });

  it('should get pull requests with caching', async () => {
    const prs = await apiClient.getPullRequests('repo-id', 'active');
    expect(prs.length).toBeGreaterThan(0);

    // Second call should use cache
    const cachedPrs = await apiClient.getPullRequests('repo-id', 'active');
    expect(cachedPrs).toEqual(prs);
  });
});
```

### Integration Test Example

```typescript
// Requires ADO_TEST_PAT and ADO_TEST_ORG environment variables
describe('AzureDevOpsApiClient Integration', () => {
  it('should retrieve real pull requests', async () => {
    const apiClient = createRealApiClient();
    const repos = await apiClient.getRepositories();

    expect(repos.length).toBeGreaterThan(0);

    const prs = await apiClient.getPullRequests(repos[0].id);
    console.log(`Found ${prs.length} pull requests`);
  });
});
```

---

## Related Documentation

- **[Data Models](data-models.md)** - TypeScript interfaces
- **[Error Handling](error-handling.md)** - Error patterns
- **[Authentication Service](authentication-service.md)** - PAT management
- **[Configuration Service](configuration-service.md)** - Settings management