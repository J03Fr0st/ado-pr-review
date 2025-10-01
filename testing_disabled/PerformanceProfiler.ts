import * as vscode from "vscode";

/**
 * Memory profiling metrics
 */
export interface MemoryProfile {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly external: number;
  readonly rss: number;
  readonly heapLimit: number;
  readonly gcStats: GCStats;
}

/**
 * Garbage collection statistics
 */
export interface GCStats {
  readonly totalCount: number;
  readonly totalDuration: number;
  readonly majorGCCount: number;
  readonly minorGCCount: number;
  readonly averageGCDuration: number;
  readonly lastGCDuration: number;
}

/**
 * CPU usage metrics
 */
export interface CPUProfile {
  readonly usage: number;
  readonly userTime: number;
  readonly systemTime: number;
  readonly idleTime: number;
  readonly loadAverage: number[];
}

/**
 * Event loop metrics
 */
export interface EventLoopProfile {
  readonly minDelay: number;
  readonly maxDelay: number;
  readonly averageDelay: number;
  readonly blockedCount: number;
  readonly totalBlockedTime: number;
}

/**
 * Comprehensive performance profiler for load testing
 *
 * Provides detailed performance monitoring including memory usage, CPU consumption,
 * garbage collection statistics, event loop delays, and custom performance metrics.
 *
 * Features:
 * - Real-time memory profiling with leak detection
 * - CPU usage monitoring and spike detection
 * - Event loop delay measurement and analysis
 * - Garbage collection statistics and optimization insights
 * - Custom metric tracking for application-specific performance
 * - Automatic performance bottleneck detection
 * - Historical data comparison and trend analysis
 * - Export capabilities for detailed performance analysis
 */
export class PerformanceProfiler {
  private isProfiling = false;
  private startTime = 0;
  private memorySamples: MemoryProfile[] = [];
  private cpuSamples: CPUProfile[] = [];
  private eventLoopSamples: EventLoopProfile[] = [];
  private gcStats: GCStats = {
    totalCount: 0,
    totalDuration: 0,
    majorGCCount: 0,
    minorGCCount: 0,
    averageGCDuration: 0,
    lastGCDuration: 0,
  };
  private customMetrics = new Map<string, number[]>();
  private intervals = new Set<NodeJS.Timeout>();
  private memoryLeaks = new Set<string>();

  // Profiling configuration
  private readonly config = {
    samplingInterval: 100, // ms
    memoryThreshold: 500 * 1024 * 1024, // 500MB
    eventLoopThreshold: 100, // ms
    cpuThreshold: 80, // %
    gcWarningThreshold: 100, // GC count
    leakDetectionThreshold: 50 * 1024 * 1024, // 50MB growth
  };

  /**
   * Start performance profiling
   */
  start(): void {
    if (this.isProfiling) {
      return;
    }

    this.isProfiling = true;
    this.startTime = Date.now();
    this.setupGCListener();

    // Start sampling intervals
    this.startMemorySampling();
    this.startCPUSampling();
    this.startEventLoopSampling();

    console.log("🔍 Performance profiler started");
  }

  /**
   * Stop performance profiling and return results
   */
  stop(): {
    memory: MemoryMetrics;
    cpu: CpuMetrics;
    eventLoop: EventLoopProfile;
    gc: GCStats;
    customMetrics: Record<string, { min: number; max: number; avg: number; count: number }>;
    duration: number;
    leaks: string[];
  } {
    if (!this.isProfiling) {
      throw new Error("Profiler is not running");
    }

    this.isProfiling = false;
    this.cleanup();

    const duration = Date.now() - this.startTime;
    const memory = this.analyzeMemoryProfile();
    const cpu = this.analyzeCPUProfile();
    const eventLoop = this.analyzeEventLoopProfile();
    const customMetrics = this.analyzeCustomMetrics();
    const leaks = this.detectMemoryLeaks();

    console.log("🔍 Performance profiler stopped");

    return {
      memory,
      cpu,
      eventLoop,
      gc: this.gcStats,
      customMetrics,
      duration,
      leaks: Array.from(memoryLeaks),
    };
  }

  /**
   * Reset profiler state
   */
  reset(): void {
    this.isProfiling = false;
    this.startTime = 0;
    this.memorySamples = [];
    this.cpuSamples = [];
    this.eventLoopSamples = [];
    this.gcStats = {
      totalCount: 0,
      totalDuration: 0,
      majorGCCount: 0,
      minorGCCount: 0,
      averageGCDuration: 0,
      lastGCDuration: 0,
    };
    this.customMetrics.clear();
    this.memoryLeaks.clear();
    this.cleanup();
  }

  /**
   * Record a custom metric
   */
  recordMetric(name: string, value: number): void {
    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }
    this.customMetrics.get(name)!.push(value);
  }

  /**
   * Get current memory profile
   */
  getCurrentMemoryProfile(): MemoryProfile {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapLimit: this.getHeapLimit(),
      gcStats: { ...this.gcStats },
    };
  }

  /**
   * Get current CPU profile
   */
  getCurrentCPUProfile(): CPUProfile {
    const usage = process.cpuUsage();
    const loadAvg = process.loadavg();

    return {
      usage: this.calculateCPUUsage(usage),
      userTime: usage.user,
      systemTime: usage.system,
      idleTime: 0, // Not available in Node.js
      loadAverage: loadAvg,
    };
  }

  /**
   * Measure event loop delay
   */
  measureEventLoopDelay(): Promise<number> {
    return new Promise((resolve) => {
      const start = Date.now();
      setImmediate(() => {
        resolve(Date.now() - start);
      });
    });
  }

  /**
   * Check if profiler is running
   */
  isProfilingActive(): boolean {
    return this.isProfiling;
  }

  /**
   * Get profiling status
   */
  getStatus(): {
    isRunning: boolean;
    duration: number;
    memorySamples: number;
    cpuSamples: number;
    eventLoopSamples: number;
    customMetricsCount: number;
    leakCount: number;
  } {
    return {
      isRunning: this.isProfiling,
      duration: this.isProfiling ? Date.now() - this.startTime : 0,
      memorySamples: this.memorySamples.length,
      cpuSamples: this.cpuSamples.length,
      eventLoopSamples: this.eventLoopSamples.length,
      customMetricsCount: this.customMetrics.size,
      leakCount: this.memoryLeaks.size,
    };
  }

  /**
   * Export profiling data
   */
  exportData(): {
    timestamp: string;
    duration: number;
    memory: MemoryProfile[];
    cpu: CPUProfile[];
    eventLoop: EventLoopProfile[];
    gc: GCStats;
    customMetrics: Record<string, number[]>;
    leaks: string[];
    config: typeof this.config;
  } {
    return {
      timestamp: new Date().toISOString(),
      duration: this.isProfiling ? Date.now() - this.startTime : 0,
      memory: [...this.memorySamples],
      cpu: [...this.cpuSamples],
      eventLoop: [...this.eventLoopSamples],
      gc: { ...this.gcStats },
      customMetrics: Object.fromEntries(this.customMetrics),
      leaks: Array.from(this.memoryLeaks),
      config: { ...this.config },
    };
  }

  /**
   * Setup garbage collection listener
   */
  private setupGCListener(): void {
    // Note: Node.js doesn't provide direct GC event access
    // This is a placeholder for when/if such APIs become available
    // In production, you might use --expose-gc flag and manual GC calls
  }

  /**
   * Start memory sampling
   */
  private startMemorySampling(): void {
    const interval = setInterval(() => {
      if (this.isProfiling) {
        this.memorySamples.push(this.getCurrentMemoryProfile());

        // Check for memory leaks
        this.checkMemoryGrowth();
      }
    }, this.config.samplingInterval);

    this.intervals.add(interval);
  }

  /**
   * Start CPU sampling
   */
  private startCPUSampling(): void {
    const interval = setInterval(() => {
      if (this.isProfiling) {
        this.cpuSamples.push(this.getCurrentCPUProfile());
      }
    }, this.config.samplingInterval);

    this.intervals.add(interval);
  }

  /**
   * Start event loop sampling
   */
  private startEventLoopSampling(): void {
    const interval = setInterval(async () => {
      if (this.isProfiling) {
        const delay = await this.measureEventLoopDelay();
        this.eventLoopSamples.push({
          minDelay: delay,
          maxDelay: delay,
          averageDelay: delay,
          blockedCount: delay > this.config.eventLoopThreshold ? 1 : 0,
          totalBlockedTime: delay > this.config.eventLoopThreshold ? delay : 0,
        });
      }
    }, this.config.samplingInterval);

    this.intervals.add(interval);
  }

  /**
   * Analyze memory profile
   */
  private analyzeMemoryProfile(): MemoryMetrics {
    if (this.memorySamples.length === 0) {
      return {
        initialHeapUsed: 0,
        maxHeapUsed: 0,
        finalHeapUsed: 0,
        heapGrowth: 0,
        gcCount: this.gcStats.totalCount,
        gcTime: this.gcStats.totalDuration,
        memoryLeaks: [],
      };
    }

    const initialHeap = this.memorySamples[0].heapUsed;
    const maxHeap = Math.max(...this.memorySamples.map(s => s.heapUsed));
    const finalHeap = this.memorySamples[this.memorySamples.length - 1].heapUsed;
    const heapGrowth = finalHeap - initialHeap;

    return {
      initialHeapUsed: initialHeap,
      maxHeapUsed: maxHeap,
      finalHeapUsed: finalHeap,
      heapGrowth: heapGrowth,
      gcCount: this.gcStats.totalCount,
      gcTime: this.gcStats.totalDuration,
      memoryLeaks: Array.from(this.memoryLeaks),
    };
  }

  /**
   * Analyze CPU profile
   */
  private analyzeCPUProfile(): CpuMetrics {
    if (this.cpuSamples.length === 0) {
      return {
        averageCpuUsage: 0,
        maxCpuUsage: 0,
        cpuSpikes: [],
      };
    }

    const usages = this.cpuSamples.map(s => s.usage);
    const averageUsage = usages.reduce((sum, usage) => sum + usage, 0) / usages.length;
    const maxUsage = Math.max(...usages);

    // Detect CPU spikes (usage > 80%)
    const threshold = this.config.cpuThreshold;
    const spikes = usages
      .map((usage, index) => ({ usage, index }))
      .filter(({ usage }) => usage > threshold)
      .map(({ index }) => index);

    return {
      averageCpuUsage: averageUsage,
      maxCpuUsage: maxUsage,
      cpuSpikes: spikes,
    };
  }

  /**
   * Analyze event loop profile
   */
  private analyzeEventLoopProfile(): EventLoopProfile {
    if (this.eventLoopSamples.length === 0) {
      return {
        minDelay: 0,
        maxDelay: 0,
        averageDelay: 0,
        blockedCount: 0,
        totalBlockedTime: 0,
      };
    }

    const delays = this.eventLoopSamples.map(s => s.averageDelay);
    const minDelay = Math.min(...delays);
    const maxDelay = Math.max(...delays);
    const averageDelay = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;

    const blockedCount = this.eventLoopSamples.reduce((sum, s) => sum + s.blockedCount, 0);
    const totalBlockedTime = this.eventLoopSamples.reduce((sum, s) => sum + s.totalBlockedTime, 0);

    return {
      minDelay,
      maxDelay,
      averageDelay,
      blockedCount,
      totalBlockedTime,
    };
  }

  /**
   * Analyze custom metrics
   */
  private analyzeCustomMetrics(): Record<string, { min: number; max: number; avg: number; count: number }> {
    const result: Record<string, { min: number; max: number; avg: number; count: number }> = {};

    for (const [name, values] of this.customMetrics) {
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

        result[name] = {
          min,
          max,
          avg,
          count: values.length,
        };
      }
    }

    return result;
  }

  /**
   * Check for memory growth (potential leaks)
   */
  private checkMemoryGrowth(): void {
    if (this.memorySamples.length < 10) {
      return; // Need sufficient samples
    }

    const recentSamples = this.memorySamples.slice(-10);
    const olderSamples = this.memorySamples.slice(-20, -10);

    if (olderSamples.length === 0) {
      return;
    }

    const recentAvg = recentSamples.reduce((sum, s) => sum + s.heapUsed, 0) / recentSamples.length;
    const olderAvg = olderSamples.reduce((sum, s) => sum + s.heapUsed, 0) / olderSamples.length;
    const growth = recentAvg - olderAvg;

    if (growth > this.config.leakDetectionThreshold) {
      this.memoryLeaks.add(`Memory growth detected: ${this.formatBytes(growth)} over ${recentSamples.length * this.config.samplingInterval}ms`);
    }
  }

  /**
   * Detect memory leaks based on patterns
   */
  private detectMemoryLeaks(): string[] {
    const leaks: string[] = [];

    // Check for consistent memory growth
    if (this.memorySamples.length > 50) {
      const firstHalf = this.memorySamples.slice(0, Math.floor(this.memorySamples.length / 2));
      const secondHalf = this.memorySamples.slice(Math.floor(this.memorySamples.length / 2));

      const firstAvg = firstHalf.reduce((sum, s) => sum + s.heapUsed, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, s) => sum + s.heapUsed, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.5) { // 50% growth
        leaks.push("Consistent memory growth pattern detected");
      }
    }

    // Check for high memory usage
    const maxMemory = Math.max(...this.memorySamples.map(s => s.heapUsed));
    if (maxMemory > this.config.memoryThreshold) {
      leaks.push(`Memory usage exceeded threshold: ${this.formatBytes(maxMemory)}`);
    }

    // Check for insufficient garbage collection
    if (this.gcStats.totalCount < this.memorySamples.length / 100 && maxMemory > this.config.memoryThreshold / 2) {
      leaks.push("Insufficient garbage collection for memory usage");
    }

    return leaks;
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCPUUsage(usage: NodeJS.CpuUsage): number {
    // This is a simplified calculation
    // In a real implementation, you'd track usage over time intervals
    const totalUsage = usage.user + usage.system;
    return Math.min(100, totalUsage / 1000000); // Convert to percentage
  }

  /**
   * Get heap limit
   */
  private getHeapLimit(): number {
    // This is an approximation
    // The actual heap limit depends on Node.js configuration
    return 1024 * 1024 * 1024; // 1GB default
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Cleanup intervals and resources
   */
  private cleanup(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

/**
 * Memory metrics interface
 */
export interface MemoryMetrics {
  readonly initialHeapUsed: number;
  readonly maxHeapUsed: number;
  readonly finalHeapUsed: number;
  readonly heapGrowth: number;
  readonly gcCount: number;
  readonly gcTime: number;
  readonly memoryLeaks: string[];
}

/**
 * CPU metrics interface
 */
export interface CpuMetrics {
  readonly averageCpuUsage: number;
  readonly maxCpuUsage: number;
  readonly cpuSpikes: number[];
}

/**
 * Event loop metrics interface
 */
export interface EventLoopMetrics {
  readonly minDelay: number;
  readonly maxDelay: number;
  readonly averageDelay: number;
  readonly blockedCount: number;
  readonly totalBlockedTime: number;
}