# API Documentation

Comprehensive API reference for Azure DevOps PR Reviewer extension components.

## Core APIs

### Extension APIs
- **[Extension Controller](extension-controller.md)** - Main extension entry point and orchestration
- **[Extension Lifecycle](extension-lifecycle.md)** - Activation, initialization, and disposal patterns

### Service Layer APIs
- **[Pull Request Service](pull-request-service.md)** - PR CRUD operations, filtering, and bulk operations
- **[Comment Service](comment-service.md)** - Comment thread management and reply operations
- **[Authentication Service](authentication-service.md)** - PAT management and secure token storage
- **[Configuration Service](configuration-service.md)** - Extension settings and workspace configuration
- **[Telemetry Service](telemetry-service.md)** - Usage analytics and error tracking
- **[Monitoring Service](monitoring-service.md)** - Performance monitoring and health checks
- **[Cache Manager](cache-manager.md)** - Multi-layer caching strategy
- **[Workflow Service](workflow-service.md)** - Multi-step workflow orchestration
- **[Integration Service](integration-service.md)** - Cross-service coordination layer

### Azure DevOps API Integration
- **[API Client](api-client.md)** - REST API client with rate limiting and caching
- **[Data Models](data-models.md)** - TypeScript interfaces for Azure DevOps entities
- **[Error Handling](error-handling.md)** - Comprehensive error management patterns

### UI Components
- **[Tree Provider](tree-provider.md)** - VS Code tree view data provider
- **[Webview Provider](webview-provider.md)** - PR detail dashboard webview
- **[Command Registry](command-registry.md)** - VS Code command registration and handlers

## Quick Reference

### Common Operations

#### Retrieve Pull Requests
```typescript
import { PullRequestService } from './services/PullRequestService';

const pullRequestService = new PullRequestService(apiClient, configService, context);

// Get all active PRs
const prs = await pullRequestService.getPullRequests({
  status: 'active'
});

// Get PRs with advanced filtering
const filteredPrs = await pullRequestService.getPullRequests({
  status: 'active',
  reviewerId: 'user-id',
  searchQuery: 'feature',
  maxResults: 50
}, {
  sortBy: 'updatedDate',
  sortOrder: 'desc'
});
```

#### Approve Pull Request
```typescript
const result = await pullRequestService.approvePullRequest(
  repositoryId,
  pullRequestId
);

if (result.success) {
  console.log('PR approved successfully');
}
```

#### Add Comment
```typescript
import { CommentService } from './services/CommentService';

const commentService = new CommentService(apiClient, configService, context);

// Add new comment thread
const comment = await commentService.addComment(
  repositoryId,
  pullRequestId,
  'Review comment text'
);

// Reply to existing thread
const reply = await commentService.addComment(
  repositoryId,
  pullRequestId,
  'Reply text',
  threadId
);
```

#### Workflow Execution
```typescript
import { WorkflowService } from './services/WorkflowService';

const workflowService = new WorkflowService(
  integrationService,
  errorHandler,
  telemetryService,
  monitoringService,
  stateManager
);

// Execute PR review workflow
const result = await workflowService.executePullRequestReviewWorkflow(
  repositoryId,
  pullRequestId
);

// Check workflow status
const activeWorkflows = workflowService.getActiveWorkflows();

// Cancel workflow
await workflowService.cancelWorkflow(workflowId);
```

## API Conventions

### Response Patterns

#### Operation Results
All service operations return structured result objects:

```typescript
interface PullRequestOperationResult {
  readonly success: boolean;
  readonly pullRequest?: PullRequest;
  readonly error?: string;
  readonly timestamp: Date;
}
```

#### Error Handling
Services use try-catch patterns and return error details in result objects:

```typescript
try {
  const result = await service.operation();
  if (!result.success) {
    // Handle operation failure
    console.error(result.error);
  }
} catch (error) {
  // Handle unexpected errors
  await errorHandler.handleError(error, ErrorCategory.INTERNAL);
}
```

### Caching Strategy

#### Cache Levels
1. **Memory Cache** - Fast in-memory storage (short TTL: 30-60s)
2. **Session Storage** - VS Code workspace state (medium TTL: 5-15min)
3. **API Client Cache** - HTTP response caching with ETags

#### Cache Options
```typescript
interface ApiRequestOptions {
  readonly useCache?: boolean;  // Enable caching (default: true)
  readonly cacheTtl?: number;   // Time to live in milliseconds
  readonly timeout?: number;    // Request timeout
  readonly retries?: number;    // Retry attempts
}
```

### Rate Limiting

The API client enforces Azure DevOps rate limits:
- **200 requests per minute** with sliding window
- **Exponential backoff** on 429 responses
- **Automatic retry** with configurable max attempts

```typescript
// Rate limit configuration
const RATE_LIMIT = {
  maxRequests: 200,
  windowMs: 60000,        // 1 minute
  retryAfterMs: 60000,    // Wait 1 minute
  maxRetries: 3
};
```

## Authentication

### PAT Storage
Personal Access Tokens are stored securely using VS Code Secret Storage API:

```typescript
import { AuthenticationService } from './services/AuthenticationService';

const authService = new AuthenticationService(context, context.secrets);

// Store PAT securely
await authService.storeToken('your-pat-token');

// Retrieve auth header
const authHeader = await authService.getAuthHeader();
// Returns: "Basic base64(user:pat)"
```

### Token Permissions Required
- **Code (Read)** - Read pull requests and repository information
- **Code (Write)** - Create comments, vote on pull requests
- **Work Items (Read)** - Link work items to pull requests

## Performance Optimization

### Pagination
Large result sets support pagination:

```typescript
const prs = await pullRequestService.getPullRequests({
  maxResults: 50,
  skip: 0  // Start from first result
});
```

### Lazy Loading
PR file lists use incremental loading:

```typescript
const files = await apiClient.getPullRequestFiles(
  repositoryId,
  pullRequestId,
  iterationId,
  skip: 0,
  top: 50  // Load 50 files at a time
);
```

### Background Sync
Auto-refresh with configurable intervals:

```typescript
pullRequestService.setupAutoRefresh(
  { status: 'active' },  // Filter criteria
  300000,                 // 5 minute interval
  (prs) => {
    // Callback with updated PRs
    console.log(`Refreshed ${prs.length} pull requests`);
  }
);
```

## Telemetry

### Event Tracking
```typescript
telemetryService.trackEvent('extensionActivated');
telemetryService.trackEvent('prApproved', {
  repositoryId: 'repo-id',
  pullRequestId: '123'
});
```

### Error Tracking
```typescript
await errorHandler.handleError(
  error,
  ErrorCategory.API,
  { repositoryId, pullRequestId }
);
```

### Performance Metrics
```typescript
monitoringService.recordMetric('api.latency', duration);
monitoringService.recordMetric('cache.hitRate', hitRate);
```

## VS Code Integration

### Commands
Register extension commands:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('azureDevOps.approvePullRequest',
    async (item) => {
      // Command handler
    }
  )
);
```

### Tree View
Implement tree data provider:

```typescript
import { PullRequestTreeProvider } from './providers/PullRequestTreeProvider';

const treeProvider = new PullRequestTreeProvider(
  pullRequestService,
  stateManager,
  telemetryService,
  integrationService
);

const treeView = vscode.window.createTreeView('azureDevOpsPRs', {
  treeDataProvider: treeProvider,
  showCollapseAll: true
});
```

### Webview
Create webview panels:

```typescript
const panel = vscode.window.createWebviewPanel(
  'prDetail',
  `PR #${pullRequestId}`,
  vscode.ViewColumn.Active,
  {
    enableScripts: true,
    retainContextWhenHidden: true
  }
);

panel.webview.html = generateWebviewContent(prData);
```

## Testing APIs

### Unit Testing
```typescript
import { PullRequestService } from './services/PullRequestService';

describe('PullRequestService', () => {
  it('should approve pull request', async () => {
    const result = await service.approvePullRequest('repo-id', 123);
    expect(result.success).toBe(true);
  });
});
```

### Integration Testing
```typescript
// Set environment variables for integration tests
// ADO_TEST_PAT=your-test-pat
// ADO_TEST_ORG=https://dev.azure.com/your-org

const apiClient = new AzureDevOpsApiClient(
  authService,
  configService,
  context
);

const prs = await apiClient.getPullRequests('repo-id');
expect(prs.length).toBeGreaterThan(0);
```

## Migration Guide

### From v0.x to v1.0

**Breaking Changes:**
1. Service constructors now require `ExtensionContext`
2. Result objects use `readonly` properties
3. Cache options moved to `ApiRequestOptions` interface
4. Error handling standardized through `ErrorHandler` class

**Migration Example:**
```typescript
// Before (v0.x)
const service = new PullRequestService(apiClient, config);
const prs = await service.getPullRequests();

// After (v1.0)
const service = new PullRequestService(apiClient, config, context);
const prs = await service.getPullRequests({
  status: 'active'
}, {
  sortBy: 'createdDate',
  sortOrder: 'desc'
});
```

## Additional Resources

- **[Architecture Documentation](../backend-architecture-design.md)**
- **[Testing Strategy](../testing-strategy.md)**
- **[DevOps Guide](../devops/README.md)**
- **[Repository Guidelines](../../AGENTS.md)**

## Support

For API-related questions or issues:
1. Check [API Examples](examples/) directory
2. Review [Testing Documentation](../testing-strategy.md)
3. File issue on [GitHub](https://github.com/company/ado-pr-review/issues)