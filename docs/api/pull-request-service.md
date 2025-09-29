# Pull Request Service

Comprehensive service for managing Azure DevOps pull request operations with advanced filtering, sorting, and performance optimization.

## Overview

The `PullRequestService` provides:
- **Full CRUD operations** for pull requests
- **Advanced filtering and sorting** capabilities
- **Bulk operations** for efficiency
- **Auto-refresh** with configurable intervals
- **Performance optimization** through intelligent caching
- **Pagination support** for large result sets

## Class Definition

```typescript
class PullRequestService {
  constructor(
    apiClient: AzureDevOpsApiClient,
    configService: ConfigurationService,
    context: vscode.ExtensionContext
  )
}
```

## Core Methods

### Query Operations

#### getPullRequests()

Get all pull requests matching specified criteria with optional sorting.

**Signature:**
```typescript
async getPullRequests(
  filter?: PullRequestFilter,
  sortOptions?: PullRequestSortOptions
): Promise<PullRequest[]>
```

**Parameters:**
- `filter` - Optional filter criteria
- `sortOptions` - Optional sorting configuration

**Returns:** Array of filtered and sorted pull requests

**Example:**
```typescript
// Get all active PRs
const activePrs = await service.getPullRequests({
  status: 'active'
});

// Get PRs with advanced filtering and sorting
const myPrs = await service.getPullRequests({
  status: 'active',
  reviewerId: 'user-id',
  searchQuery: 'authentication',
  maxResults: 50,
  skip: 0
}, {
  sortBy: 'updatedDate',
  sortOrder: 'desc'
});

// Get PRs for specific repository
const repoPrs = await service.getPullRequests({
  repositoryId: 'repo-id',
  status: 'active'
});
```

**Cache TTL:** 30 seconds (configurable)

---

#### getPullRequest()

Get specific pull request by ID with caching.

**Signature:**
```typescript
async getPullRequest(
  repositoryId: string,
  pullRequestId: number
): Promise<PullRequest | null>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID

**Returns:** Pull request object or null if not found

**Example:**
```typescript
const pr = await service.getPullRequest('repo-id', 123);

if (pr) {
  console.log(`PR: ${pr.title}`);
  console.log(`Status: ${pr.status}`);
  console.log(`Created by: ${pr.createdBy.displayName}`);
  console.log(`Votes: ${pr.reviewers.length}`);
}
```

**Cache TTL:** 60 seconds

---

### Mutation Operations

#### createPullRequest()

Create a new pull request.

**Signature:**
```typescript
async createPullRequest(
  options: CreatePullRequestOptions
): Promise<PullRequestOperationResult>
```

**Parameters:**
- `options` - Pull request creation options

**Returns:** Operation result with created PR

**Example:**
```typescript
const result = await service.createPullRequest({
  title: 'Add authentication feature',
  description: 'Implements JWT authentication with refresh tokens',
  sourceRefName: 'feature/auth',      // Auto-prefixed with refs/heads/
  targetRefName: 'main',               // Auto-prefixed with refs/heads/
  repositoryId: 'repo-id',
  workItemRefs: ['12345', '12346'],    // Optional linked work items
  reviewers: ['user-id-1', 'user-id-2'], // Optional reviewers
  isDraft: false                        // Optional draft status
});

if (result.success) {
  console.log(`Created PR #${result.pullRequest?.pullRequestId}`);
  console.log(`URL: ${result.pullRequest?.webUrl}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

**Side Effects:** Invalidates repository PR cache

---

#### updatePullRequest()

Update an existing pull request.

**Signature:**
```typescript
async updatePullRequest(
  repositoryId: string,
  pullRequestId: number,
  options: UpdatePullRequestOptions
): Promise<PullRequestOperationResult>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `options` - Update options (all fields optional)

**Returns:** Operation result with updated PR

**Example:**
```typescript
// Update title and description
const result = await service.updatePullRequest('repo-id', 123, {
  title: 'Add authentication feature (updated)',
  description: 'Updated implementation details'
});

// Change target branch
const result = await service.updatePullRequest('repo-id', 123, {
  targetRefName: 'develop'
});

// Mark as completed
const result = await service.updatePullRequest('repo-id', 123, {
  status: 'completed'
});

// Add work item links
const result = await service.updatePullRequest('repo-id', 123, {
  workItemRefs: ['12345', '12346', '12347']
});
```

**Side Effects:** Invalidates PR and repository cache

---

#### approvePullRequest()

Approve a pull request (vote: +10).

**Signature:**
```typescript
async approvePullRequest(
  repositoryId: string,
  pullRequestId: number
): Promise<PullRequestOperationResult>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID

**Returns:** Operation result

**Example:**
```typescript
const result = await service.approvePullRequest('repo-id', 123);

if (result.success) {
  vscode.window.showInformationMessage('PR approved successfully!');
} else {
  vscode.window.showErrorMessage(`Failed to approve: ${result.error}`);
}
```

**Side Effects:** Invalidates PR cache

---

#### rejectPullRequest()

Reject a pull request with optional comment (vote: -10).

**Signature:**
```typescript
async rejectPullRequest(
  repositoryId: string,
  pullRequestId: number,
  comment?: string
): Promise<PullRequestOperationResult>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `comment` - Optional rejection reason comment

**Returns:** Operation result

**Example:**
```typescript
// Reject with comment
const result = await service.rejectPullRequest(
  'repo-id',
  123,
  'Please address the following issues:\n- Add unit tests\n- Fix type errors'
);

// Reject without comment
const result = await service.rejectPullRequest('repo-id', 123);

if (result.success) {
  console.log('PR rejected successfully');
}
```

**Side Effects:**
- Votes -10 on PR
- Adds comment if provided
- Invalidates PR cache

---

#### abandonPullRequest()

Abandon a pull request (mark as abandoned).

**Signature:**
```typescript
async abandonPullRequest(
  repositoryId: string,
  pullRequestId: number
): Promise<PullRequestOperationResult>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID

**Returns:** Operation result

**Example:**
```typescript
const result = await service.abandonPullRequest('repo-id', 123);

if (result.success) {
  console.log('PR abandoned successfully');
}
```

**Side Effects:** Invalidates PR and repository cache

---

#### votePullRequest()

Vote on a pull request with specific vote value.

**Signature:**
```typescript
async votePullRequest(
  repositoryId: string,
  pullRequestId: number,
  vote: PullRequestVote
): Promise<PullRequestOperationResult>
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

**Returns:** Operation result

**Example:**
```typescript
// Approved with suggestions
await service.votePullRequest('repo-id', 123, 5);

// Waiting for author
await service.votePullRequest('repo-id', 123, -5);

// Reset vote
await service.votePullRequest('repo-id', 123, 0);
```

---

### Advanced Queries

#### getPullRequestIterations()

Get pull request iterations (history of updates).

**Signature:**
```typescript
async getPullRequestIterations(
  repositoryId: string,
  pullRequestId: number
): Promise<GitPullRequestIteration[]>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID

**Returns:** Array of iterations

**Example:**
```typescript
const iterations = await service.getPullRequestIterations('repo-id', 123);

iterations.forEach((iteration, index) => {
  console.log(`Iteration ${index + 1}: ${iteration.id}`);
  console.log(`  Created: ${iteration.createdDate.toLocaleString()}`);
  console.log(`  Updated: ${iteration.updatedDate.toLocaleString()}`);
  console.log(`  Commits: ${iteration.changeList?.length || 0}`);
});
```

**Cache TTL:** 30 seconds

---

#### getPullRequestChanges()

Get pull request file changes (diffs).

**Signature:**
```typescript
async getPullRequestChanges(
  repositoryId: string,
  pullRequestId: number,
  iterationId?: number
): Promise<GitPullRequestChange[]>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID
- `iterationId` - Optional specific iteration (defaults to latest)

**Returns:** Array of file changes

**Example:**
```typescript
// Get latest changes
const changes = await service.getPullRequestChanges('repo-id', 123);

// Get changes for specific iteration
const iterationChanges = await service.getPullRequestChanges(
  'repo-id',
  123,
  iterationId
);

changes.forEach(change => {
  console.log(`${change.changeType}: ${change.item.path}`);
});
```

**Cache TTL:** 60 seconds

---

#### getPolicyEvaluations()

Get pull request policy evaluation status.

**Signature:**
```typescript
async getPolicyEvaluations(
  repositoryId: string,
  pullRequestId: number
): Promise<PolicyEvaluationRecord[]>
```

**Parameters:**
- `repositoryId` - Repository ID
- `pullRequestId` - Pull request ID

**Returns:** Array of policy evaluation records

**Example:**
```typescript
const evaluations = await service.getPolicyEvaluations('repo-id', 123);

evaluations.forEach(evaluation => {
  console.log(`Policy: ${evaluation.configuration.displayName}`);
  console.log(`  Status: ${evaluation.status}`);
  console.log(`  Started: ${evaluation.startedDate.toLocaleString()}`);

  if (evaluation.completedDate) {
    console.log(`  Completed: ${evaluation.completedDate.toLocaleString()}`);
  }
});
```

**Cache TTL:** 30 seconds

---

### Auto-Refresh

#### setupAutoRefresh()

Set up automatic refresh with configurable interval.

**Signature:**
```typescript
setupAutoRefresh(
  filter: PullRequestFilter,
  intervalMs: number,
  callback: (pullRequests: PullRequest[]) => void
): void
```

**Parameters:**
- `filter` - Filter criteria for auto-refresh
- `intervalMs` - Refresh interval in milliseconds
- `callback` - Callback function invoked with updated PRs

**Example:**
```typescript
// Refresh active PRs every 5 minutes
service.setupAutoRefresh(
  { status: 'active' },
  300000,  // 5 minutes
  (prs) => {
    console.log(`Refreshed ${prs.length} pull requests`);
    treeProvider.refresh();
  }
);

// Refresh user-specific PRs every 2 minutes
service.setupAutoRefresh(
  {
    status: 'active',
    reviewerId: currentUserId
  },
  120000,  // 2 minutes
  (prs) => {
    updateNotificationBadge(prs.length);
  }
);
```

**Note:** Auto-refresh intervals are automatically managed and disposed

---

#### clearAutoRefresh()

Clear auto-refresh for specific filter criteria.

**Signature:**
```typescript
clearAutoRefresh(filter: PullRequestFilter): void
```

**Parameters:**
- `filter` - Filter criteria matching auto-refresh setup

**Example:**
```typescript
// Clear auto-refresh for active PRs
service.clearAutoRefresh({ status: 'active' });
```

---

## Filter Options

```typescript
interface PullRequestFilter {
  readonly status?: PullRequestStatus;     // 'active' | 'completed' | 'abandoned' | 'all'
  readonly createdBy?: string;             // User ID
  readonly reviewerId?: string;            // User ID
  readonly repositoryId?: string;          // Repository ID
  readonly searchQuery?: string;           // Text search in title/description
  readonly maxResults?: number;            // Pagination limit
  readonly skip?: number;                  // Pagination offset
}
```

### Filter Examples

```typescript
// Active PRs only
{ status: 'active' }

// PRs created by specific user
{ createdBy: 'user-id-123' }

// PRs where you are a reviewer
{ reviewerId: currentUserId }

// PRs in specific repository
{ repositoryId: 'repo-id' }

// Text search across title and description
{ searchQuery: 'authentication' }

// Combined filters
{
  status: 'active',
  reviewerId: currentUserId,
  searchQuery: 'bug fix',
  maxResults: 20
}

// Paginated results
{
  status: 'active',
  maxResults: 50,
  skip: 0  // First page
}
```

---

## Sort Options

```typescript
interface PullRequestSortOptions {
  readonly sortBy?: 'createdDate' | 'updatedDate' | 'title' | 'voteCount';
  readonly sortOrder?: 'asc' | 'desc';
}
```

### Sort Examples

```typescript
// Most recently created first
{ sortBy: 'createdDate', sortOrder: 'desc' }

// Most recently updated first
{ sortBy: 'updatedDate', sortOrder: 'desc' }

// Alphabetical by title
{ sortBy: 'title', sortOrder: 'asc' }

// Highest voted first
{ sortBy: 'voteCount', sortOrder: 'desc' }
```

---

## Operation Results

```typescript
interface PullRequestOperationResult {
  readonly success: boolean;
  readonly pullRequest?: PullRequest;
  readonly error?: string;
  readonly timestamp: Date;
}
```

### Result Handling Pattern

```typescript
async function handleOperation() {
  const result = await service.approvePullRequest('repo-id', 123);

  if (result.success) {
    // Operation succeeded
    console.log('Success!');

    if (result.pullRequest) {
      // Use updated PR data
      console.log(`PR Status: ${result.pullRequest.status}`);
    }
  } else {
    // Operation failed
    console.error(`Failed: ${result.error}`);

    // Show user-friendly error
    vscode.window.showErrorMessage(
      result.error || 'An unexpected error occurred'
    );
  }

  // Log timestamp for debugging
  console.log(`Operation completed at: ${result.timestamp.toISOString()}`);
}
```

---

## Create Options

```typescript
interface CreatePullRequestOptions {
  readonly title: string;
  readonly description: string;
  readonly sourceRefName: string;      // Auto-prefixed with refs/heads/
  readonly targetRefName: string;      // Auto-prefixed with refs/heads/
  readonly repositoryId: string;
  readonly workItemRefs?: string[];    // Optional work item IDs
  readonly reviewers?: string[];       // Optional reviewer IDs
  readonly isDraft?: boolean;          // Optional draft status
}
```

---

## Update Options

```typescript
interface UpdatePullRequestOptions {
  readonly title?: string;
  readonly description?: string;
  readonly status?: PullRequestStatus;
  readonly targetRefName?: string;     // Auto-prefixed with refs/heads/
  readonly workItemRefs?: string[];
}
```

---

## Resource Management

### dispose()

Clean up service resources (intervals, queues).

**Signature:**
```typescript
dispose(): void
```

**Example:**
```typescript
// Called automatically by extension controller
context.subscriptions.push(pullRequestService);

// Or manually
pullRequestService.dispose();
```

**Effects:**
- Clears all auto-refresh intervals
- Clears bulk operation queue
- Releases resources

---

## Best Practices

### 1. Use Filters Efficiently

```typescript
// Good: Specific filter reduces API load
const myActivePrs = await service.getPullRequests({
  status: 'active',
  reviewerId: currentUserId,
  repositoryId: 'repo-id'
});

// Bad: Fetching all PRs then filtering in memory
const allPrs = await service.getPullRequests();
const filtered = allPrs.filter(pr =>
  pr.status === 'active' &&
  pr.reviewers.some(r => r.id === currentUserId)
);
```

### 2. Implement Pagination for Large Datasets

```typescript
async function* paginatePullRequests(
  filter: PullRequestFilter,
  pageSize: number = 50
) {
  let skip = 0;

  while (true) {
    const page = await service.getPullRequests({
      ...filter,
      maxResults: pageSize,
      skip
    });

    if (page.length === 0) break;

    yield page;

    if (page.length < pageSize) break;

    skip += pageSize;
  }
}

// Usage
for await (const page of paginatePullRequests({ status: 'active' })) {
  console.log(`Processing ${page.length} PRs`);
}
```

### 3. Handle Auto-Refresh Lifecycle

```typescript
class PRViewController {
  private service: PullRequestService;

  activate() {
    // Set up auto-refresh
    this.service.setupAutoRefresh(
      { status: 'active' },
      300000,
      (prs) => this.updateView(prs)
    );
  }

  deactivate() {
    // Clear auto-refresh
    this.service.clearAutoRefresh({ status: 'active' });
  }
}
```

### 4. Cache-Aware Operations

```typescript
// Refresh after mutation
async function approveAndRefresh(repoId: string, prId: number) {
  const result = await service.approvePullRequest(repoId, prId);

  if (result.success) {
    // Cache is automatically invalidated
    // Fresh data on next query
    const updatedPr = await service.getPullRequest(repoId, prId);
    console.log(`Vote count: ${updatedPr?.reviewers.length}`);
  }
}
```

### 5. Error Handling with User Feedback

```typescript
async function safeApprove(repoId: string, prId: number) {
  const result = await service.approvePullRequest(repoId, prId);

  if (result.success) {
    vscode.window.showInformationMessage('✓ PR approved successfully');

    // Track success
    telemetryService.trackEvent('pr.approved', {
      repositoryId: repoId,
      pullRequestId: prId.toString()
    });
  } else {
    vscode.window.showErrorMessage(
      `Failed to approve PR: ${result.error}`,
      'Retry'
    ).then(selection => {
      if (selection === 'Retry') {
        safeApprove(repoId, prId);
      }
    });

    // Track failure
    telemetryService.trackEvent('pr.approve.failed', {
      error: result.error
    });
  }
}
```

---

## Testing

### Unit Test Example

```typescript
import { PullRequestService } from './services/PullRequestService';

describe('PullRequestService', () => {
  let service: PullRequestService;
  let mockApiClient: jest.Mocked<AzureDevOpsApiClient>;

  beforeEach(() => {
    mockApiClient = createMockApiClient();
    service = new PullRequestService(
      mockApiClient,
      mockConfigService,
      mockContext
    );
  });

  it('should filter PRs by reviewer', async () => {
    const prs = await service.getPullRequests({
      reviewerId: 'user-123'
    });

    expect(prs.every(pr =>
      pr.reviewers.some(r => r.id === 'user-123')
    )).toBe(true);
  });

  it('should sort PRs by creation date', async () => {
    const prs = await service.getPullRequests({}, {
      sortBy: 'createdDate',
      sortOrder: 'desc'
    });

    for (let i = 1; i < prs.length; i++) {
      expect(prs[i - 1].creationDate.getTime())
        .toBeGreaterThanOrEqual(prs[i].creationDate.getTime());
    }
  });
});
```

---

## Related Documentation

- **[API Client](api-client.md)** - Azure DevOps REST client
- **[Comment Service](comment-service.md)** - Comment operations
- **[Data Models](data-models.md)** - Type definitions
- **[Integration Service](integration-service.md)** - Cross-service coordination