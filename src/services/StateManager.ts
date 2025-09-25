import * as vscode from 'vscode';
import { PullRequest, GitRepository, CommentThread, Identity } from '../api/models';

/**
 * State update event type
 */
export type StateUpdateEventType =
  | 'pullRequestsLoaded'
  | 'pullRequestUpdated'
  | 'pullRequestCreated'
  | 'pullRequestAbandoned'
  | 'commentsLoaded'
  | 'commentAdded'
  | 'commentUpdated'
  | 'repositoriesLoaded'
  | 'configurationChanged'
  | 'userAuthenticated'
  | 'userSignedOut';

/**
 * State update event
 */
export interface StateUpdateEvent {
  readonly type: StateUpdateEventType;
  readonly data?: any;
  readonly timestamp: Date;
}

/**
 * Application state interface
 */
export interface AppState {
  pullRequests: Map<string, PullRequest>; // Key: `${repoId}_${prId}`
  repositories: Map<string, GitRepository>; // Key: repoId
  commentThreads: Map<string, CommentThread[]>; // Key: `${repoId}_${prId}`
  currentUser: Identity | null;
  selectedPullRequest: PullRequest | null;
  selectedRepository: GitRepository | null;
  loading: Map<string, boolean>; // Key: operation type
  errors: Map<string, string>; // Key: operation type
  lastUpdated: Map<string, Date>; // Key: data type
  viewState: ViewState;
}

/**
 * View state for UI components
 */
export interface ViewState {
  readonly activePullRequestFilter: string;
  readonly sortBy: 'createdDate' | 'updatedDate' | 'title' | 'voteCount';
  readonly sortOrder: 'asc' | 'desc';
  readonly showDrafts: boolean;
  readonly showActive: boolean;
  readonly showCompleted: boolean;
  readonly showAbandoned: boolean;
  readonly expandedThreads: Set<string>; // Key: threadId
  readonly selectedCommentThread: string | null; // threadId
  readonly sidebarVisible: boolean;
  readonly detailViewVisible: boolean;
}

/**
 * State mutation options
 */
export interface StateMutationOptions {
  readonly persist?: boolean; // Whether to persist state to storage
  readonly notify?: boolean; // Whether to notify listeners
  readonly source?: string; // Source of the mutation for debugging
}

/**
 * State manager for centralized application state management
 *
 * Provides reactive state management with TypeScript typing, persistence,
 * event notification, and performance optimization.
 *
 * Features:
 * - Centralized state management with type safety
 * - Reactive updates with event notification
 * - State persistence across sessions
 * - Performance optimization with batching
 * - State history and undo functionality
 * - Debugging capabilities with mutation tracking
 * - View state management for UI components
 */
export class StateManager {
  private state: AppState;
  private readonly listeners = new Set<(event: StateUpdateEvent) => void>();
  private readonly stateHistory: AppState[] = [];
  private readonly maxHistorySize = 50;
  private readonly pendingUpdates = new Map<string, any>();
  private readonly batchUpdateTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly persistKeys = {
    pullRequests: 'state_pull_requests',
    repositories: 'state_repositories',
    viewState: 'state_view_state',
    lastUpdated: 'state_last_updated'
  };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.state = this.initializeState();
    this.loadPersistedState();
    this.setupAutoCleanup();
  }

  /**
   * Get current application state (immutable copy)
   */
  getState(): AppState {
    return this.createImmutableCopy(this.state);
  }

  /**
   * Get a specific part of the state
   */
  getStatePart<T extends keyof AppState>(part: T): AppState[T] {
    return this.createImmutableCopy(this.state[part]);
  }

  /**
   * Update pull requests in state
   */
  updatePullRequests(
    pullRequests: PullRequest[],
    options: StateMutationOptions = { persist: true, notify: true }
  ): void {
    const newMap = new Map(this.state.pullRequests);

    for (const pr of pullRequests) {
      const key = `${pr.repository.id}_${pr.pullRequestId}`;
      newMap.set(key, pr);
    }

    this.mutateState('pullRequests', newMap, options);

    this.notifyStateUpdate({
      type: 'pullRequestsLoaded',
      data: { count: pullRequests.length },
      timestamp: new Date()
    });
  }

  /**
   * Update a single pull request
   */
  updatePullRequest(
    repositoryId: string,
    pullRequestId: number,
    updates: Partial<PullRequest>,
    options: StateMutationOptions = { persist: true, notify: true }
  ): void {
    const key = `${repositoryId}_${pullRequestId}`;
    const existingPr = this.state.pullRequests.get(key);

    if (!existingPr) {
      return;
    }

    const updatedPr = { ...existingPr, ...updates };
    const newMap = new Map(this.state.pullRequests);
    newMap.set(key, updatedPr);

    this.mutateState('pullRequests', newMap, options);

    this.notifyStateUpdate({
      type: 'pullRequestUpdated',
      data: { repositoryId, pullRequestId },
      timestamp: new Date()
    });
  }

  /**
   * Add a new pull request to state
   */
  addPullRequest(
    pullRequest: PullRequest,
    options: StateMutationOptions = { persist: true, notify: true }
  ): void {
    const key = `${pullRequest.repository.id}_${pullRequest.pullRequestId}`;
    const newMap = new Map(this.state.pullRequests);
    newMap.set(key, pullRequest);

    this.mutateState('pullRequests', newMap, options);

    this.notifyStateUpdate({
      type: 'pullRequestCreated',
      data: { pullRequest },
      timestamp: new Date()
    });
  }

  /**
   * Remove a pull request from state
   */
  removePullRequest(
    repositoryId: string,
    pullRequestId: number,
    options: StateMutationOptions = { persist: true, notify: true }
  ): void {
    const key = `${repositoryId}_${pullRequestId}`;
    const newMap = new Map(this.state.pullRequests);
    newMap.delete(key);

    this.mutateState('pullRequests', newMap, options);

    this.notifyStateUpdate({
      type: 'pullRequestAbandoned',
      data: { repositoryId, pullRequestId },
      timestamp: new Date()
    });
  }

  /**
   * Update repositories in state
   */
  updateRepositories(
    repositories: GitRepository[],
    options: StateMutationOptions = { persist: true, notify: true }
  ): void {
    const newMap = new Map();

    for (const repo of repositories) {
      newMap.set(repo.id, repo);
    }

    this.mutateState('repositories', newMap, options);

    this.notifyStateUpdate({
      type: 'repositoriesLoaded',
      data: { count: repositories.length },
      timestamp: new Date()
    });
  }

  /**
   * Update comment threads for a pull request
   */
  updateCommentThreads(
    repositoryId: string,
    pullRequestId: number,
    threads: CommentThread[],
    options: StateMutationOptions = { persist: false, notify: true }
  ): void {
    const key = `${repositoryId}_${pullRequestId}`;
    const newMap = new Map(this.state.commentThreads);
    newMap.set(key, threads);

    this.mutateState('commentThreads', newMap, options);

    this.notifyStateUpdate({
      type: 'commentsLoaded',
      data: { repositoryId, pullRequestId, count: threads.length },
      timestamp: new Date()
    });
  }

  /**
   * Set current user
   */
  setCurrentUser(
    user: Identity | null,
    options: StateMutationOptions = { persist: false, notify: true }
  ): void {
    this.mutateState('currentUser', user, options);

    this.notifyStateUpdate({
      type: user ? 'userAuthenticated' : 'userSignedOut',
      data: user ? { userId: user.id } : null,
      timestamp: new Date()
    });
  }

  /**
   * Set selected pull request
   */
  setSelectedPullRequest(
    pullRequest: PullRequest | null,
    options: StateMutationOptions = { persist: false, notify: true }
  ): void {
    this.mutateState('selectedPullRequest', pullRequest, options);
  }

  /**
   * Set selected repository
   */
  setSelectedRepository(
    repository: GitRepository | null,
    options: StateMutationOptions = { persist: false, notify: true }
  ): void {
    this.mutateState('selectedRepository', repository, options);
  }

  /**
   * Update loading state for an operation
   */
  setLoadingState(operation: string, loading: boolean): void {
    const newMap = new Map(this.state.loading);
    if (loading) {
      newMap.set(operation, true);
    } else {
      newMap.delete(operation);
    }

    this.mutateState('loading', newMap);
  }

  /**
   * Set error state for an operation
   */
  setError(operation: string, error: string | null): void {
    const newMap = new Map(this.state.errors);
    if (error) {
      newMap.set(operation, error);
    } else {
      newMap.delete(operation);
    }

    this.mutateState('errors', newMap);
  }

  /**
   * Update view state
   */
  updateViewState(updates: Partial<ViewState>, options: StateMutationOptions = { persist: true, notify: false }): void {
    const newViewState = { ...this.state.viewState, ...updates };
    this.mutateState('viewState', newViewState, options);

    this.notifyStateUpdate({
      type: 'configurationChanged',
      data: { viewState: newViewState },
      timestamp: new Date()
    });
  }

  /**
   * Toggle thread expansion
   */
  toggleThreadExpansion(threadId: string): void {
    const expandedThreads = new Set(this.state.viewState.expandedThreads);
    if (expandedThreads.has(threadId)) {
      expandedThreads.delete(threadId);
    } else {
      expandedThreads.add(threadId);
    }

    this.updateViewState({ expandedThreads });
  }

  /**
   * Select a comment thread
   */
  selectCommentThread(threadId: string | null): void {
    this.updateViewState({ selectedCommentThread: threadId });
  }

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar(): void {
    this.updateViewState({ sidebarVisible: !this.state.viewState.sidebarVisible });
  }

  /**
   * Toggle detail view visibility
   */
  toggleDetailView(): void {
    this.updateViewState({ detailViewVisible: !this.state.viewState.detailViewVisible });
  }

  /**
   * Get pull requests for a specific repository
   */
  getPullRequestsForRepository(repositoryId: string): PullRequest[] {
    const pullRequests: PullRequest[] = [];
    for (const [key, pr] of this.state.pullRequests) {
      if (key.startsWith(`${repositoryId}_`)) {
        pullRequests.push(pr);
      }
    }
    return pullRequests;
  }

  /**
   * Get comment threads for a specific pull request
   */
  getCommentThreadsForPullRequest(repositoryId: string, pullRequestId: number): CommentThread[] {
    const key = `${repositoryId}_${pullRequestId}`;
    return this.state.commentThreads.get(key) || [];
  }

  /**
   * Check if an operation is loading
   */
  isLoading(operation: string): boolean {
    return this.state.loading.get(operation) || false;
  }

  /**
   * Get error for an operation
   */
  getError(operation: string): string | null {
    return this.state.errors.get(operation) || null;
  }

  /**
   * Add state update listener
   */
  addStateUpdateListener(listener: (event: StateUpdateEvent) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove state update listener
   */
  removeStateUpdateListener(listener: (event: StateUpdateEvent) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Batch multiple state updates together
   */
  batchUpdate(updates: Array<() => void>, options: StateMutationOptions = { persist: true, notify: true }): void {
    // Save current state for potential rollback
    if (this.stateHistory.length === 0 || options.persist) {
      this.saveToHistory();
    }

    // Apply all updates
    for (const update of updates) {
      update();
    }

    // Persist if requested
    if (options.persist) {
      this.persistState();
    }

    // Notify listeners if requested
    if (options.notify) {
      this.notifyStateUpdate({
        type: 'configurationChanged',
        data: { batchUpdate: true },
        timestamp: new Date()
      });
    }
  }

  /**
   * Undo last state change
   */
  undo(): boolean {
    if (this.stateHistory.length < 2) {
      return false;
    }

    // Remove current state
    this.stateHistory.pop();

    // Restore previous state
    const previousState = this.stateHistory[this.stateHistory.length - 1];
    this.state = this.createImmutableCopy(previousState);

    // Persist and notify
    this.persistState();
    this.notifyStateUpdate({
      type: 'configurationChanged',
      data: { undo: true },
      timestamp: new Date()
    });

    return true;
  }

  /**
   * Clear all state data
   */
  clearState(): void {
    this.state = this.initializeState();
    this.stateHistory.length = 0;
    this.clearPersistedState();

    this.notifyStateUpdate({
      type: 'configurationChanged',
      data: { clearState: true },
      timestamp: new Date()
    });
  }

  /**
   * Get state statistics for debugging
   */
  getStateStatistics(): {
    pullRequestCount: number;
    repositoryCount: number;
    commentThreadCount: number;
    memoryUsage: number;
    historySize: number;
  } {
    const pullRequestCount = this.state.pullRequests.size;
    const repositoryCount = this.state.repositories.size;
    const commentThreadCount = Array.from(this.state.commentThreads.values())
      .reduce((sum, threads) => sum + threads.length, 0);
    const memoryUsage = JSON.stringify(this.state).length;
    const historySize = this.stateHistory.length;

    return {
      pullRequestCount,
      repositoryCount,
      commentThreadCount,
      memoryUsage,
      historySize
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.listeners.clear();
    this.stateHistory.length = 0;
    this.pendingUpdates.clear();

    // Clear all batch update timeouts
    for (const timeout of this.batchUpdateTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.batchUpdateTimeouts.clear();
  }

  /**
   * Initialize default state
   */
  private initializeState(): AppState {
    return {
      pullRequests: new Map(),
      repositories: new Map(),
      commentThreads: new Map(),
      currentUser: null,
      selectedPullRequest: null,
      selectedRepository: null,
      loading: new Map(),
      errors: new Map(),
      lastUpdated: new Map(),
      viewState: {
        activePullRequestFilter: 'all',
        sortBy: 'updatedDate',
        sortOrder: 'desc',
        showDrafts: true,
        showActive: true,
        showCompleted: true,
        showAbandoned: false,
        expandedThreads: new Set(),
        selectedCommentThread: null,
        sidebarVisible: true,
        detailViewVisible: false
      }
    };
  }

  /**
   * Create immutable copy of state data
   */
  private createImmutableCopy<T>(data: T): T {
    if (data instanceof Map) {
      return new Map(data) as T;
    }
    if (data instanceof Set) {
      return new Set(data) as T;
    }
    if (Array.isArray(data)) {
      return [...data] as T;
    }
    if (typeof data === 'object' && data !== null) {
      return { ...data } as T;
    }
    return data;
  }

  /**
   * Mutate state with options
   */
  private mutateState<K extends keyof AppState>(
    key: K,
    value: AppState[K],
    options: StateMutationOptions = { persist: true, notify: true }
  ): void {
    // Save to history if persisting
    if (options.persist && this.stateHistory.length === 0) {
      this.saveToHistory();
    }

    // Update state
    this.state[key] = this.createImmutableCopy(value);

    // Update last modified timestamp
    this.state.lastUpdated.set(key, new Date());

    // Persist if requested
    if (options.persist) {
      this.persistState();
    }
  }

  /**
   * Notify state update listeners
   */
  private notifyStateUpdate(event: StateUpdateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in state update listener:', error);
      }
    }
  }

  /**
   * Save current state to history
   */
  private saveToHistory(): void {
    this.stateHistory.push(this.createImmutableCopy(this.state));

    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Persist state to storage
   */
  private persistState(): void {
    try {
      // Persist pull requests (minimal data)
      const pullRequestsData = Array.from(this.state.pullRequests.entries())
        .map(([key, pr]) => [key, {
          pullRequestId: pr.pullRequestId,
          repositoryId: pr.repository.id,
          title: pr.title,
          status: pr.status,
          creationDate: pr.creationDate.toISOString()
        }]);

      this.context.workspaceState.update(this.persistKeys.pullRequests, pullRequestsData);

      // Persist repositories
      const repositoriesData = Array.from(this.state.repositories.entries());
      this.context.workspaceState.update(this.persistKeys.repositories, repositoriesData);

      // Persist view state
      this.context.workspaceState.update(this.persistKeys.viewState, this.state.viewState);

      // Persist last updated timestamps
      const lastUpdatedData = Array.from(this.state.lastUpdated.entries())
        .map(([key, date]) => [key, date.toISOString()]);
      this.context.workspaceState.update(this.persistKeys.lastUpdated, lastUpdatedData);

    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Load persisted state from storage
   */
  private loadPersistedState(): void {
    try {
      // Load repositories
      const repositoriesData = this.context.workspaceState.get<[string, GitRepository][]>(this.persistKeys.repositories);
      if (repositoriesData) {
        this.state.repositories = new Map(repositoriesData);
      }

      // Load view state
      const viewStateData = this.context.workspaceState.get<ViewState>(this.persistKeys.viewState);
      if (viewStateData) {
        this.state.viewState = {
          ...this.state.viewState,
          ...viewStateData,
          expandedThreads: new Set(viewStateData.expandedThreads || [])
        };
      }

      // Load last updated timestamps
      const lastUpdatedData = this.context.workspaceState.get<[string, string][]>(this.persistKeys.lastUpdated);
      if (lastUpdatedData) {
        this.state.lastUpdated = new Map(
          lastUpdatedData.map(([key, dateStr]) => [key, new Date(dateStr)])
        );
      }

    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }

  /**
   * Clear persisted state
   */
  private clearPersistedState(): void {
    const keys = [
      this.persistKeys.pullRequests,
      this.persistKeys.repositories,
      this.persistKeys.viewState,
      this.persistKeys.lastUpdated
    ];

    for (const key of keys) {
      this.context.workspaceState.update(key, undefined);
    }
  }

  /**
   * Setup automatic cleanup
   */
  private setupAutoCleanup(): void {
    // Cleanup on extension deactivation
    this.context.subscriptions.push({
      dispose: () => this.dispose()
    });

    // Auto-cleanup old history periodically
    setInterval(() => {
      if (this.stateHistory.length > this.maxHistorySize) {
        const excess = this.stateHistory.length - this.maxHistorySize;
        this.stateHistory.splice(0, excess);
      }
    }, 300000); // Every 5 minutes
  }
}