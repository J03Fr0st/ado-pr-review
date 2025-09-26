import * as vscode from "vscode";

/**
 * Network request metrics
 */
export interface NetworkMetrics {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly cachedRequests: number;
  readonly cacheHitRate: number;
  readonly averageLatency: number;
  readonly minLatency: number;
  readonly maxLatency: number;
  readonly bandwidthUsed: number;
  readonly requestsByEndpoint: Record<string, number>;
  readonly errorsByType: Record<string, number>;
}

/**
 * Cache performance metrics
 */
export interface CacheMetrics {
  readonly totalLookups: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly cacheHitRate: number;
  readonly evictionCount: number;
  readonly averageEntrySize: number;
  readonly memoryUsage: number;
  readonly hitByCacheType: Record<string, number>;
  readonly missByCacheType: Record<string, number>;
}

/**
 * API performance metrics
 */
export interface ApiMetrics {
  readonly totalCalls: number;
  readonly successfulCalls: number;
  readonly failedCalls: number;
  readonly averageResponseTime: number;
  readonly minResponseTime: number;
  readonly maxResponseTime: number;
  readonly rateLimitHits: number;
  readonly retryCount: number;
  readonly callsByEndpoint: Record<string, ApiEndpointMetrics>;
}

/**
 * Individual API endpoint metrics
 */
export interface ApiEndpointMetrics {
  readonly callCount: number;
  readonly averageResponseTime: number;
  readonly successRate: number;
  readonly errorRate: number;
  readonly lastCalled: number;
}

/**
 * UI performance metrics
 */
export interface UiMetrics {
  readonly treeViewRefreshTime: number[];
  readonly webviewLoadTime: number[];
  readonly searchResponseTime: number[];
  readonly filterResponseTime: number[];
  readonly averageTreeRefreshTime: number;
  readonly averageWebviewLoadTime: number;
  renderingMetrics: RenderingMetrics;
}

/**
 * Rendering performance metrics
 */
export interface RenderingMetrics {
  readonly domNodesCreated: number;
  readonly layoutCount: number;
  readonly paintCount: number;
  readonly averageRenderTime: number;
  readonly longestRenderTime: number;
  readonly jankCount: number;
}

/**
 * Synchronization metrics
 */
export interface SyncMetrics {
  readonly syncOperations: number;
  readonly successfulSyncs: number;
  readonly failedSyncs: number;
  readonly averageSyncTime: number;
  readonly conflictsResolved: number;
  readonly bandwidthUsed: number;
  readonly syncByType: Record<string, SyncTypeMetrics>;
}

/**
 * Individual sync type metrics
 */
export interface SyncTypeMetrics {
  readonly operationCount: number;
  readonly averageDuration: number;
  readonly successRate: number;
  readonly dataSize: number;
}

/**
 * Comprehensive metrics collector for load testing
 *
 * Collects and aggregates performance metrics across all aspects of the Azure DevOps
 * PR Reviewer extension. Provides real-time monitoring and detailed performance analysis.
 *
 * Features:
 * - Network request monitoring and latency tracking
 * - Cache performance analysis and hit rate optimization
 * - API call metrics and rate limiting analysis
 * - UI performance measurement (tree view, webview, search)
 * - Synchronization performance and conflict tracking
 * - Real-time metrics aggregation and reporting
 * - Historical data comparison and trend analysis
 * - Automatic performance bottleneck detection
 * - Export capabilities for detailed analysis
 */
export class MetricsCollector {
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;
  private intervalMs = 1000; // Default collection interval

  // Metric collections
  private responseTimes: number[] = [];
  private networkMetrics: NetworkMetrics = this.initializeNetworkMetrics();
  private cacheMetrics: CacheMetrics = this.initializeCacheMetrics();
  private apiMetrics: ApiMetrics = this.initializeApiMetrics();
  private uiMetrics: UiMetrics = this.initializeUiMetrics();
  private syncMetrics: SyncMetrics = this.initializeSyncMetrics();

  // Real-time tracking
  private currentOperations = new Map<string, { startTime: number; type: string }>();
  private activeConnections = new Set<string>();
  private memorySnapshots: number[] = [];

  // Performance thresholds
  private readonly thresholds = {
    responseTime: {
      excellent: 200,
      good: 500,
      acceptable: 1000,
      poor: 2000,
    },
    cacheHitRate: {
      excellent: 0.8,
      good: 0.6,
      acceptable: 0.4,
      poor: 0.2,
    },
    errorRate: {
      excellent: 0.01,
      good: 0.05,
      acceptable: 0.1,
      poor: 0.2,
    },
  };

  /**
   * Start metrics collection
   */
  start(intervalMs: number = 1000): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.intervalMs = intervalMs;

    // Setup collection interval
    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    console.log("📊 Metrics collector started");
  }

  /**
   * Stop metrics collection and return results
   */
  stop(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    responseTimes: number[];
    network: NetworkMetrics;
    cache: CacheMetrics;
    api: ApiMetrics;
    ui: UiMetrics;
    sync: SyncMetrics;
  } {
    if (!this.isCollecting) {
      throw new Error("Metrics collector is not running");
    }

    this.isCollecting = false;

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    // Calculate final metrics
    const totalOps = this.responseTimes.length;
    const successfulOps = totalOps - (this.networkMetrics.failedRequests + this.apiMetrics.failedCalls);
    const failedOps = totalOps - successfulOps;

    const avgResponseTime = totalOps > 0 ? this.responseTimes.reduce((sum, time) => sum + time, 0) / totalOps : 0;
    const minResponseTime = totalOps > 0 ? Math.min(...this.responseTimes) : 0;
    const maxResponseTime = totalOps > 0 ? Math.max(...this.responseTimes) : 0;

    console.log("📊 Metrics collector stopped");

    return {
      totalOperations: totalOps,
      successfulOperations: successfulOps,
      failedOperations: failedOps,
      averageResponseTime: avgResponseTime,
      minResponseTime,
      maxResponseTime,
      responseTimes: [...this.responseTimes],
      network: { ...this.networkMetrics },
      cache: { ...this.cacheMetrics },
      api: { ...this.apiMetrics },
      ui: { ...this.uiMetrics },
      sync: { ...this.syncMetrics },
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.isCollecting = false;

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    this.responseTimes = [];
    this.networkMetrics = this.initializeNetworkMetrics();
    this.cacheMetrics = this.initializeCacheMetrics();
    this.apiMetrics = this.initializeApiMetrics();
    this.uiMetrics = this.initializeUiMetrics();
    this.syncMetrics = this.initializeSyncMetrics();
    this.currentOperations.clear();
    this.activeConnections.clear();
    this.memorySnapshots = [];
  }

  /**
   * Record an API call
   */
  recordApiCall(endpoint: string, duration: number, success: boolean): void {
    this.responseTimes.push(duration);
    this.apiMetrics.totalCalls++;

    if (success) {
      this.apiMetrics.successfulCalls++;
    } else {
      this.apiMetrics.failedCalls++;
    }

    // Update endpoint-specific metrics
    if (!this.apiMetrics.callsByEndpoint[endpoint]) {
      this.apiMetrics.callsByEndpoint[endpoint] = {
        callCount: 0,
        averageResponseTime: 0,
        successRate: 0,
        errorRate: 0,
        lastCalled: Date.now(),
      };
    }

    const endpointMetrics = this.apiMetrics.callsByEndpoint[endpoint];
    endpointMetrics.callCount++;
    endpointMetrics.lastCalled = Date.now();

    // Update average response time
    const totalDuration = endpointMetrics.averageResponseTime * (endpointMetrics.callCount - 1) + duration;
    endpointMetrics.averageResponseTime = totalDuration / endpointMetrics.callCount;

    // Update success rate
    endpointMetrics.successRate = (this.apiMetrics.successfulCalls / this.apiMetrics.totalCalls) * 100;
    endpointMetrics.errorRate = (this.apiMetrics.failedCalls / this.apiMetrics.totalCalls) * 100;

    // Update network metrics
    this.networkMetrics.totalRequests++;
    if (success) {
      this.networkMetrics.successfulRequests++;
    } else {
      this.networkMetrics.failedRequests++;
      this.networkMetrics.errorsByType[endpoint] = (this.networkMetrics.errorsByType[endpoint] || 0) + 1;
    }

    // Update latency
    this.networkMetrics.averageLatency = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    this.networkMetrics.minLatency = Math.min(...this.responseTimes);
    this.networkMetrics.maxLatency = Math.max(...this.responseTimes);
  }

  /**
   * Record a cache operation
   */
  recordCacheOperation(cacheType: string, hit: boolean, dataSize: number = 0): void {
    this.cacheMetrics.totalLookups++;

    if (hit) {
      this.cacheMetrics.cacheHits++;
      this.cacheMetrics.hitByCacheType[cacheType] = (this.cacheMetrics.hitByCacheType[cacheType] || 0) + 1;
      this.networkMetrics.cachedRequests++;
    } else {
      this.cacheMetrics.cacheMisses++;
      this.cacheMetrics.missByCacheType[cacheType] = (this.cacheMetrics.missByCacheType[cacheType] || 0) + 1;
    }

    // Update hit rate
    this.cacheMetrics.cacheHitRate = this.cacheMetrics.cacheHits / this.cacheMetrics.totalLookups;
    this.networkMetrics.cacheHitRate = this.networkMetrics.cachedRequests / this.networkMetrics.totalRequests;

    // Update average entry size
    if (dataSize > 0) {
      const totalSize = this.cacheMetrics.averageEntrySize * (this.cacheMetrics.totalLookups - 1) + dataSize;
      this.cacheMetrics.averageEntrySize = totalSize / this.cacheMetrics.totalLookups;
    }
  }

  /**
   * Record UI operation
   */
  recordUiOperation(operationType: string, duration: number): void {
    switch (operationType) {
      case "treeRefresh":
        this.uiMetrics.treeViewRefreshTime.push(duration);
        break;
      case "webviewLoad":
        this.uiMetrics.webviewLoadTime.push(duration);
        break;
      case "search":
        this.uiMetrics.searchResponseTime.push(duration);
        break;
      case "filter":
        this.uiMetrics.filterResponseTime.push(duration);
        break;
    }

    // Update averages
    this.updateUiAverages();
  }

  /**
   * Record sync operation
   */
  recordSyncOperation(syncType: string, duration: number, success: boolean, dataSize: number = 0): void {
    this.syncMetrics.syncOperations++;

    if (success) {
      this.syncMetrics.successfulSyncs++;
    } else {
      this.syncMetrics.failedSyncs++;
    }

    // Update type-specific metrics
    if (!this.syncMetrics.syncByType[syncType]) {
      this.syncMetrics.syncByType[syncType] = {
        operationCount: 0,
        averageDuration: 0,
        successRate: 0,
        dataSize: 0,
      };
    }

    const typeMetrics = this.syncMetrics.syncByType[syncType];
    typeMetrics.operationCount++;
    typeMetrics.dataSize += dataSize;

    // Update average duration
    const totalDuration = typeMetrics.averageDuration * (typeMetrics.operationCount - 1) + duration;
    typeMetrics.averageDuration = totalDuration / typeMetrics.operationCount;

    // Update success rate
    typeMetrics.successRate = (typeMetrics.operationCount - (this.syncMetrics.failedSyncs / Object.keys(this.syncMetrics.syncByType).length)) / typeMetrics.operationCount * 100;

    // Update overall average sync time
    const totalSyncTime = this.syncMetrics.averageSyncTime * (this.syncMetrics.syncOperations - 1) + duration;
    this.syncMetrics.averageSyncTime = totalSyncTime / this.syncMetrics.syncOperations;

    // Update bandwidth
    this.syncMetrics.bandwidthUsed += dataSize;
    this.networkMetrics.bandwidthUsed += dataSize;
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(endpoint: string): void {
    this.apiMetrics.rateLimitHits++;
    this.networkMetrics.errorsByType["RATE_LIMIT"] = (this.networkMetrics.errorsByType["RATE_LIMIT"] || 0) + 1;
  }

  /**
   * Record retry operation
   */
  recordRetry(endpoint: string): void {
    this.apiMetrics.retryCount++;
  }

  /**
   * Record cache eviction
   */
  recordCacheEviction(cacheType: string): void {
    this.cacheMetrics.evictionCount++;
  }

  /**
   * Start tracking an operation
   */
  startOperation(operationId: string, type: string): void {
    this.currentOperations.set(operationId, {
      startTime: Date.now(),
      type,
    });
  }

  /**
   * Finish tracking an operation
   */
  finishOperation(operationId: string, success: boolean = true): void {
    const operation = this.currentOperations.get(operationId);
    if (operation) {
      const duration = Date.now() - operation.startTime;
      this.recordApiCall(operation.type, duration, success);
      this.currentOperations.delete(operationId);
    }
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): {
    network: NetworkMetrics;
    cache: CacheMetrics;
    api: ApiMetrics;
    ui: UiMetrics;
    sync: SyncMetrics;
    activeOperations: number;
    activeConnections: number;
  } {
    return {
      network: { ...this.networkMetrics },
      cache: { ...this.cacheMetrics },
      api: { ...this.apiMetrics },
      ui: { ...this.uiMetrics },
      sync: { ...this.syncMetrics },
      activeOperations: this.currentOperations.size,
      activeConnections: this.activeConnections.size,
    };
  }

  /**
   * Get performance score
   */
  getPerformanceScore(): number {
    let score = 100;

    // Response time score
    const avgResponseTime = this.networkMetrics.averageLatency;
    if (avgResponseTime > this.thresholds.responseTime.poor) score -= 40;
    else if (avgResponseTime > this.thresholds.responseTime.acceptable) score -= 20;
    else if (avgResponseTime > this.thresholds.responseTime.good) score -= 10;

    // Cache hit rate score
    const cacheHitRate = this.cacheMetrics.cacheHitRate;
    if (cacheHitRate < this.thresholds.cacheHitRate.poor) score -= 30;
    else if (cacheHitRate < this.thresholds.cacheHitRate.acceptable) score -= 15;
    else if (cacheHitRate < this.thresholds.cacheHitRate.good) score -= 5;

    // Error rate score
    const errorRate = this.networkMetrics.failedRequests / this.networkMetrics.totalRequests;
    if (errorRate > this.thresholds.errorRate.poor) score -= 30;
    else if (errorRate > this.thresholds.errorRate.acceptable) score -= 15;
    else if (errorRate > this.thresholds.errorRate.good) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Export metrics data
   */
  exportData(): {
    timestamp: string;
    duration: number;
    responseTimes: number[];
    network: NetworkMetrics;
    cache: CacheMetrics;
    api: ApiMetrics;
    ui: UiMetrics;
    sync: SyncMetrics;
    performanceScore: number;
    thresholds: typeof this.thresholds;
  } {
    return {
      timestamp: new Date().toISOString(),
      duration: this.intervalMs,
      responseTimes: [...this.responseTimes],
      network: { ...this.networkMetrics },
      cache: { ...this.cacheMetrics },
      api: { ...this.apiMetrics },
      ui: { ...this.uiMetrics },
      sync: { ...this.syncMetrics },
      performanceScore: this.getPerformanceScore(),
      thresholds: { ...this.thresholds },
    };
  }

  /**
   * Initialize network metrics
   */
  private initializeNetworkMetrics(): NetworkMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedRequests: 0,
      cacheHitRate: 0,
      averageLatency: 0,
      minLatency: 0,
      maxLatency: 0,
      bandwidthUsed: 0,
      requestsByEndpoint: {},
      errorsByType: {},
    };
  }

  /**
   * Initialize cache metrics
   */
  private initializeCacheMetrics(): CacheMetrics {
    return {
      totalLookups: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      evictionCount: 0,
      averageEntrySize: 0,
      memoryUsage: 0,
      hitByCacheType: {},
      missByCacheType: {},
    };
  }

  /**
   * Initialize API metrics
   */
  private initializeApiMetrics(): ApiMetrics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      rateLimitHits: 0,
      retryCount: 0,
      callsByEndpoint: {},
    };
  }

  /**
   * Initialize UI metrics
   */
  private initializeUiMetrics(): UiMetrics {
    return {
      treeViewRefreshTime: [],
      webviewLoadTime: [],
      searchResponseTime: [],
      filterResponseTime: [],
      averageTreeRefreshTime: 0,
      averageWebviewLoadTime: 0,
      renderingMetrics: {
        domNodesCreated: 0,
        layoutCount: 0,
        paintCount: 0,
        averageRenderTime: 0,
        longestRenderTime: 0,
        jankCount: 0,
      },
    };
  }

  /**
   * Initialize sync metrics
   */
  private initializeSyncMetrics(): SyncMetrics {
    return {
      syncOperations: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncTime: 0,
      conflictsResolved: 0,
      bandwidthUsed: 0,
      syncByType: {},
    };
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    // Collect memory snapshot
    const memUsage = process.memoryUsage();
    this.memorySnapshots.push(memUsage.heapUsed);

    // Keep only recent snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots = this.memorySnapshots.slice(-100);
    }

    // Update cache memory usage
    this.cacheMetrics.memoryUsage = this.memorySnapshots[this.memorySnapshots.length - 1];
  }

  /**
   * Update UI averages
   */
  private updateUiAverages(): void {
    // Tree refresh average
    if (this.uiMetrics.treeViewRefreshTime.length > 0) {
      this.uiMetrics.averageTreeRefreshTime = this.uiMetrics.treeViewRefreshTime.reduce((sum, time) => sum + time, 0) / this.uiMetrics.treeViewRefreshTime.length;
    }

    // Webview load average
    if (this.uiMetrics.webviewLoadTime.length > 0) {
      this.uiMetrics.averageWebviewLoadTime = this.uiMetrics.webviewLoadTime.reduce((sum, time) => sum + time, 0) / this.uiMetrics.webviewLoadTime.length;
    }
  }
}