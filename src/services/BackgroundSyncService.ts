import * as vscode from 'vscode';
import { PullRequestService } from './PullRequestService';
import { CommentService } from './CommentService';
import { StateManager } from './StateManager';
import { CacheManager } from './CacheManager';
import { PullRequest, CommentThread, Identity } from '../api/models';

/**
 * Sync configuration options
 */
export interface SyncConfiguration {
  readonly enabled: boolean;
  readonly pullRequestInterval: number; // Interval for PR sync (ms)
  readonly commentInterval: number; // Interval for comment sync (ms)
  readonly userActivityInterval: number; // Interval for user activity sync (ms)
  readonly enableRealtime: boolean; // Enable real-time updates via polling
  readonly enableBatching: boolean; // Enable batch updates
  readonly batchSize: number; // Maximum batch size
  readonly enableOffline: boolean; // Enable offline support
  readonly maxRetryAttempts: number; // Maximum retry attempts for failed syncs
  readonly syncOnStartup: boolean; // Sync on extension startup
  readonly syncOnFocus: boolean; // Sync when window gains focus
}

/**
 * Sync status and statistics
 */
export interface SyncStatus {
  readonly enabled: boolean;
  readonly lastSync?: Date;
  readonly nextSync?: Date;
  readonly isSyncing: boolean;
  readonly syncErrors: string[];
  readonly syncCounters: {
    pullRequests: number;
    comments: number;
    conflicts: number;
    retries: number;
  };
  readonly networkStatus: 'online' | 'offline' | 'unknown';
}

/**
 * Sync event type
 */
export type SyncEventType =
  | 'syncStarted'
  | 'syncCompleted'
  | 'syncFailed'
  | 'pullRequestUpdated'
  | 'commentAdded'
  | 'conflictDetected'
  | 'networkStatusChanged'
  | 'offlineModeActivated'
  | 'offlineModeDeactivated';

/**
 * Sync event
 */
export interface SyncEvent {
  readonly type: SyncEventType;
  readonly data?: any;
  readonly timestamp: Date;
}

/**
 * Sync priority levels
 */
export type SyncPriority = 'high' | 'normal' | 'low';

/**
 * Sync task interface
 */
export interface SyncTask {
  readonly id: string;
  readonly priority: SyncPriority;
  readonly execute: () => Promise<void>;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly lastAttempt?: Date;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolutionStrategy = 'server-wins' | 'client-wins' | 'manual' | 'merge';

/**
 * Conflict information
 */
export interface SyncConflict {
  readonly id: string;
  readonly entityType: 'pullRequest' | 'comment';
  readonly entityId: string;
  readonly localVersion: any;
  readonly serverVersion: any;
  readonly timestamp: Date;
  readonly resolution?: ConflictResolutionStrategy;
}

/**
 * Background sync service for real-time updates and offline support
 *
 * Provides intelligent synchronization with conflict resolution, offline support,
 * performance optimization, and real-time updates.
 *
 * Features:
 * - Automatic background synchronization
 * - Conflict detection and resolution
 * - Offline support with queueing
 * - Performance optimization with batching
 * - Real-time updates via intelligent polling
 * - Network status awareness
 * - Sync statistics and monitoring
 */
export class BackgroundSyncService {
  private syncTasks = new Map<string, SyncTask>();
  private syncIntervals = new Map<string, NodeJS.Timeout>();
  private conflictQueue = new Map<string, SyncConflict>();
  private offlineQueue: SyncTask[] = [];
  private listeners = new Set<(event: SyncEvent) => void>();
  private status: SyncStatus;
  private config: SyncConfiguration;
  private isOnline = true;
  private isInitialized = false;

  constructor(
    private readonly pullRequestService: PullRequestService,
    private readonly commentService: CommentService,
    private readonly stateManager: StateManager,
    private readonly cacheManager: CacheManager,
    private readonly context: vscode.ExtensionContext,
    config?: Partial<SyncConfiguration>
  ) {
    this.config = this.mergeConfig(config);
    this.status = this.initializeStatus();
  }

  /**
   * Initialize the sync service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Setup network status monitoring
    this.setupNetworkMonitoring();

    // Setup window focus monitoring
    this.setupFocusMonitoring();

    // Register for extension lifecycle events
    this.setupLifecycleHooks();

    // Start sync tasks if enabled
    if (this.config.enabled && this.config.syncOnStartup) {
      await this.startSync();
    }

    this.isInitialized = true;

    // Notify initialization complete
    this.notifySyncEvent({
      type: 'syncCompleted',
      data: { initialized: true },
      timestamp: new Date()
    });
  }

  /**
   * Start background synchronization
   */
  async startSync(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.status.enabled = true;

    // Start pull request sync
    if (this.config.pullRequestInterval > 0) {
      this.startPullRequestSync();
    }

    // Start comment sync
    if (this.config.commentInterval > 0) {
      this.startCommentSync();
    }

    // Start user activity sync
    if (this.config.userActivityInterval > 0) {
      this.startUserActivitySync();
    }

    // Process offline queue if coming back online
    if (this.isOnline && this.offlineQueue.length > 0) {
      await this.processOfflineQueue();
    }

    this.notifySyncEvent({
      type: 'syncStarted',
      data: { reason: 'manual_start' },
      timestamp: new Date()
    });
  }

  /**
   * Stop background synchronization
   */
  stopSync(): void {
    this.status.enabled = false;

    // Clear all sync intervals
    for (const interval of this.syncIntervals.values()) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();

    this.notifySyncEvent({
      type: 'syncCompleted',
      data: { reason: 'manual_stop' },
      timestamp: new Date()
    });
  }

  /**
   * Trigger immediate sync for a specific entity
   *
   * @param entityType Type of entity to sync
   * @param entityId Entity ID
   * @param priority Sync priority
   */
  async syncEntity(entityType: 'pullRequest' | 'comment', entityId: string, priority: SyncPriority = 'normal'): Promise<void> {
    if (!this.isOnline) {
      this.queueForOffline({ entityType, entityId, priority });
      return;
    }

    try {
      switch (entityType) {
        case 'pullRequest':
          await this.syncPullRequest(entityId);
          break;
        case 'comment':
          await this.syncComments(entityId);
          break;
      }

      this.notifySyncEvent({
        type: 'syncCompleted',
        data: { entityType, entityId },
        timestamp: new Date()
      });
    } catch (error) {
      this.handleSyncError(error, entityType, entityId);
    }
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Add sync event listener
   */
  addSyncListener(listener: (event: SyncEvent) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove sync event listener
   */
  removeSyncListener(listener: (event: SyncEvent) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Resolve a sync conflict
   *
   * @param conflictId Conflict ID
   * @param resolution Resolution strategy
   */
  async resolveConflict(conflictId: string, resolution: ConflictResolutionStrategy): Promise<void> {
    const conflict = this.conflictQueue.get(conflictId);
    if (!conflict) {
      return;
    }

    conflict.resolution = resolution;

    switch (resolution) {
      case 'server-wins':
        await this.applyServerVersion(conflict);
        break;
      case 'client-wins':
        await this.applyClientVersion(conflict);
        break;
      case 'merge':
        await this.mergeVersions(conflict);
        break;
      case 'manual':
        // Manual resolution requires user interaction
        await this.promptManualResolution(conflict);
        break;
    }

    this.conflictQueue.delete(conflictId);
    this.status.syncCounters.conflicts--;

    this.notifySyncEvent({
      type: 'syncCompleted',
      data: { conflictId, resolution },
      timestamp: new Date()
    });
  }

  /**
   * Force a full sync of all data
   */
  async forceFullSync(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot force sync while offline');
    }

    this.status.isSyncing = true;
    this.notifySyncEvent({
      type: 'syncStarted',
      data: { reason: 'force_full_sync' },
      timestamp: new Date()
    });

    try {
      // Sync pull requests
      await this.syncAllPullRequests();

      // Sync comments for active PRs
      await this.syncAllComments();

      // Update status
      this.status.lastSync = new Date();
      this.status.syncErrors = [];

      this.notifySyncEvent({
        type: 'syncCompleted',
        data: { fullSync: true },
        timestamp: new Date()
      });
    } catch (error) {
      this.handleSyncError(error, 'full', 'sync');
    } finally {
      this.status.isSyncing = false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopSync();
    this.listeners.clear();
    this.conflictQueue.clear();
    this.offlineQueue.length = 0;
  }

  /**
   * Start pull request synchronization
   */
  private startPullRequestSync(): void {
    const interval = setInterval(async () => {
      await this.syncAllPullRequests();
    }, this.config.pullRequestInterval);

    this.syncIntervals.set('pullRequests', interval);
  }

  /**
   * Start comment synchronization
   */
  private startCommentSync(): void {
    const interval = setInterval(async () => {
      await this.syncAllComments();
    }, this.config.commentInterval);

    this.syncIntervals.set('comments', interval);
  }

  /**
   * Start user activity synchronization
   */
  private startUserActivitySync(): void {
    const interval = setInterval(async () => {
      await this.syncUserActivity();
    }, this.config.userActivityInterval);

    this.syncIntervals.set('userActivity', interval);
  }

  /**
   * Sync all pull requests
   */
  private async syncAllPullRequests(): Promise<void> {
    if (!this.isOnline || this.status.isSyncing) {
      return;
    }

    try {
      this.status.isSyncing = true;

      // Get current pull requests from state
      const currentState = this.stateManager.getState();
      const currentPullRequests = Array.from(currentState.pullRequests.values());

      // Fetch latest pull requests
      const latestPullRequests = await this.pullRequestService.getPullRequests();

      // Detect conflicts and updates
      await this.processPullRequestUpdates(currentPullRequests, latestPullRequests);

      // Update status
      this.status.lastSync = new Date();
      this.status.syncCounters.pullRequests++;

    } catch (error) {
      this.handleSyncError(error, 'pullRequests', 'sync');
    } finally {
      this.status.isSyncing = false;
    }
  }

  /**
   * Sync all comments
   */
  private async syncAllComments(): Promise<void> {
    if (!this.isOnline || this.status.isSyncing) {
      return;
    }

    try {
      this.status.isSyncing = true;

      const currentState = this.stateManager.getState();
      const pullRequests = Array.from(currentState.pullRequests.values());

      // Sync comments for each pull request
      for (const pr of pullRequests) {
        await this.syncComments(`${pr.repository.id}_${pr.pullRequestId}`);
      }

      this.status.syncCounters.comments++;

    } catch (error) {
      this.handleSyncError(error, 'comments', 'sync');
    } finally {
      this.status.isSyncing = false;
    }
  }

  /**
   * Sync specific pull request
   */
  private async syncPullRequest(prKey: string): Promise<void> {
    const [repositoryId, pullRequestId] = prKey.split('_');
    const pullRequest = await this.pullRequestService.getPullRequest(repositoryId, parseInt(pullRequestId));

    if (pullRequest) {
      this.stateManager.updatePullRequest(repositoryId, parseInt(pullRequestId), pullRequest);
      this.notifySyncEvent({
        type: 'pullRequestUpdated',
        data: { pullRequest },
        timestamp: new Date()
      });
    }
  }

  /**
   * Sync comments for specific pull request
   */
  private async syncComments(prKey: string): Promise<void> {
    const [repositoryId, pullRequestId] = prKey.split('_');
    const threads = await this.commentService.getCommentThreads(repositoryId, parseInt(pullRequestId));

    this.stateManager.updateCommentThreads(repositoryId, parseInt(pullRequestId), threads);
  }

  /**
   * Sync user activity
   */
  private async syncUserActivity(): Promise<void> {
    // This could include:
    // - User's recent votes
    // - User's recent comments
    // - User's assigned PRs
    // For now, this is a placeholder for future implementation
  }

  /**
   * Process pull request updates and detect conflicts
   */
  private async processPullRequestUpdates(current: PullRequest[], latest: PullRequest[]): Promise<void> {
    for (const latestPr of latest) {
      const currentPr = current.find(pr => pr.pullRequestId === latestPr.pullRequestId);

      if (!currentPr) {
        // New PR
        this.stateManager.addPullRequest(latestPr);
        continue;
      }

      // Check for conflicts
      if (this.hasPullRequestConflict(currentPr, latestPr)) {
        await this.createConflict('pullRequest', `${latestPr.repository.id}_${latestPr.pullRequestId}`, currentPr, latestPr);
        continue;
      }

      // Update PR if changed
      if (this.hasPullRequestChanged(currentPr, latestPr)) {
        this.stateManager.updatePullRequest(latestPr.repository.id, latestPr.pullRequestId, latestPr);
      }
    }
  }

  /**
   * Check if pull request has conflicts
   */
  private hasPullRequestConflict(current: PullRequest, latest: PullRequest): boolean {
    // Simple conflict detection based on status and merge status
    // In a real implementation, you would compare specific fields
    return current.status !== latest.status && current.status !== 'active';
  }

  /**
   * Check if pull request has changed
   */
  private hasPullRequestChanged(current: PullRequest, latest: PullRequest): boolean {
    return (
      current.status !== latest.status ||
      current.title !== latest.title ||
      current.mergeStatus !== latest.mergeStatus ||
      current.reviewers.length !== latest.reviewers.length
    );
  }

  /**
   * Create a sync conflict
   */
  private async createConflict(
    entityType: 'pullRequest' | 'comment',
    entityId: string,
    localVersion: any,
    serverVersion: any
  ): Promise<void> {
    const conflict: SyncConflict = {
      id: `${entityType}_${entityId}_${Date.now()}`,
      entityType,
      entityId,
      localVersion,
      serverVersion,
      timestamp: new Date()
    };

    this.conflictQueue.set(conflict.id, conflict);
    this.status.syncCounters.conflicts++;

    this.notifySyncEvent({
      type: 'conflictDetected',
      data: { conflict },
      timestamp: new Date()
    });
  }

  /**
   * Handle sync errors
   */
  private handleSyncError(error: any, entityType: string, entityId: string): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
    this.status.syncErrors.push(errorMessage);

    // Keep only last 10 errors
    if (this.status.syncErrors.length > 10) {
      this.status.syncErrors.shift();
    }

    this.status.syncCounters.retries++;

    this.notifySyncEvent({
      type: 'syncFailed',
      data: { entityType, entityId, error: errorMessage },
      timestamp: new Date()
    });

    // Queue for offline if network error
    if (this.isNetworkError(error)) {
      this.queueForOffline({ entityType, entityId, priority: 'normal' });
    }
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any): boolean {
    return error?.code === 'ENOTFOUND' ||
           error?.code === 'ECONNREFUSED' ||
           error?.message?.includes('network') ||
           error?.message?.includes('offline');
  }

  /**
   * Queue task for offline processing
   */
  private queueForOffline(task: { entityType: string; entityId: string; priority: SyncPriority }): void {
    if (!this.config.enableOffline) {
      return;
    }

    const syncTask: SyncTask = {
      id: `${task.entityType}_${task.entityId}_${Date.now()}`,
      priority: task.priority,
      retryCount: 0,
      maxRetries: this.config.maxRetryAttempts,
      execute: async () => {
        await this.syncEntity(task.entityType as 'pullRequest' | 'comment', task.entityId, task.priority);
      }
    };

    this.offlineQueue.push(syncTask);

    // Activate offline mode
    if (this.isOnline) {
      this.activateOfflineMode();
    }
  }

  /**
   * Process offline queue
   */
  private async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) {
      return;
    }

    // Sort by priority
    this.offlineQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Process tasks in batches
    const batchSize = this.config.batchSize || 10;
    for (let i = 0; i < this.offlineQueue.length; i += batchSize) {
      const batch = this.offlineQueue.slice(i, i + batchSize);

      if (this.config.enableBatching) {
        await Promise.all(batch.map(task => this.executeSyncTask(task)));
      } else {
        for (const task of batch) {
          await this.executeSyncTask(task);
        }
      }
    }

    // Clear processed tasks
    this.offlineQueue.length = 0;

    // Deactivate offline mode
    this.deactivateOfflineMode();
  }

  /**
   * Execute sync task with retry logic
   */
  private async executeSyncTask(task: SyncTask): Promise<void> {
    try {
      await task.execute();
    } catch (error) {
      task.retryCount++;

      if (task.retryCount < task.maxRetries) {
        // Re-queue for retry
        this.offlineQueue.push(task);
      } else {
        // Max retries exceeded
        this.handleSyncError(error, 'task', task.id);
      }
    }
  }

  /**
   * Apply server version for conflict resolution
   */
  private async applyServerVersion(conflict: SyncConflict): Promise<void> {
    // Implement server-wins logic
    // This would update local state with server version
  }

  /**
   * Apply client version for conflict resolution
   */
  private async applyClientVersion(conflict: SyncConflict): Promise<void> {
    // Implement client-wins logic
    // This would push client version to server
  }

  /**
   * Merge versions for conflict resolution
   */
  private async mergeVersions(conflict: SyncConflict): Promise<void> {
    // Implement merge logic
    // This would intelligently merge local and server versions
  }

  /**
   * Prompt user for manual conflict resolution
   */
  private async promptManualResolution(conflict: SyncConflict): Promise<void> {
    // Show conflict resolution UI to user
    const message = `Conflict detected for ${conflict.entityType} ${conflict.entityId}. Please resolve manually.`;
    const result = await vscode.window.showErrorMessage(message, 'View Conflict', 'Server Wins', 'Client Wins');

    if (result === 'Server Wins') {
      await this.resolveConflict(conflict.id, 'server-wins');
    } else if (result === 'Client Wins') {
      await this.resolveConflict(conflict.id, 'client-wins');
    }
  }

  /**
   * Activate offline mode
   */
  private activateOfflineMode(): void {
    this.isOnline = false;
    this.status.networkStatus = 'offline';

    this.notifySyncEvent({
      type: 'offlineModeActivated',
      timestamp: new Date()
    });
  }

  /**
   * Deactivate offline mode
   */
  private deactivateOfflineMode(): void {
    this.isOnline = true;
    this.status.networkStatus = 'online';

    this.notifySyncEvent({
      type: 'offlineModeDeactivated',
      timestamp: new Date()
    });
  }

  /**
   * Setup network status monitoring
   */
  private setupNetworkMonitoring(): void {
    // In a real implementation, you would use network status APIs
    // For now, we'll use a simple interval check
    const interval = setInterval(async () => {
      try {
        // Simple network check - in real implementation use proper network APIs
        const wasOnline = this.isOnline;
        this.isOnline = await this.checkNetworkStatus();

        if (wasOnline !== this.isOnline) {
          this.status.networkStatus = this.isOnline ? 'online' : 'offline';

          this.notifySyncEvent({
            type: 'networkStatusChanged',
            data: { online: this.isOnline },
            timestamp: new Date()
          });

          if (this.isOnline) {
            await this.processOfflineQueue();
          }
        }
      } catch (error) {
        console.error('Network status check failed:', error);
      }
    }, 30000); // Check every 30 seconds

    this.syncIntervals.set('network', interval);
  }

  /**
   * Setup window focus monitoring
   */
  private setupFocusMonitoring(): void {
    const onDidChangeWindowState = (windowState: vscode.WindowState) => {
      if (windowState.focused && this.config.syncOnFocus) {
        // Trigger sync when window gains focus
        this.syncAllPullRequests().catch(error => {
          console.error('Focus sync failed:', error);
        });
      }
    };

    this.context.subscriptions.push(
      vscode.window.onDidChangeWindowState(onDidChangeWindowState)
    );
  }

  /**
   * Setup extension lifecycle hooks
   */
  private setupLifecycleHooks(): void {
    // Cleanup on deactivation
    this.context.subscriptions.push({
      dispose: () => this.dispose()
    });
  }

  /**
   * Check network status
   */
  private async checkNetworkStatus(): Promise<boolean> {
    // Simple network check - in real implementation use proper network APIs
    try {
      // This is a simplified check
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Notify sync event listeners
   */
  private notifySyncEvent(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in sync event listener:', error);
      }
    }
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(config?: Partial<SyncConfiguration>): SyncConfiguration {
    const defaults: SyncConfiguration = {
      enabled: true,
      pullRequestInterval: 300000, // 5 minutes
      commentInterval: 60000, // 1 minute
      userActivityInterval: 300000, // 5 minutes
      enableRealtime: true,
      enableBatching: true,
      batchSize: 10,
      enableOffline: true,
      maxRetryAttempts: 3,
      syncOnStartup: true,
      syncOnFocus: true
    };

    return { ...defaults, ...config };
  }

  /**
   * Initialize sync status
   */
  private initializeStatus(): SyncStatus {
    return {
      enabled: false,
      isSyncing: false,
      syncErrors: [],
      syncCounters: {
        pullRequests: 0,
        comments: 0,
        conflicts: 0,
        retries: 0
      },
      networkStatus: 'unknown'
    };
  }
}