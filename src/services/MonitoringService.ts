import * as vscode from "vscode";
import { TelemetryService } from "./TelemetryService";

/**
 * Monitoring service for health checks, performance tracking, and error monitoring
 */
export class MonitoringService {
  private static instance: MonitoringService;
  private telemetry: TelemetryService;
  private healthCheckInterval: NodeJS.Timeout | undefined;
  private performanceMetrics: Map<string, PerformanceMetric> = new Map();
  private errorRates: Map<string, ErrorRate> = new Map();
  private isDisposed = false;

  // Configuration
  private readonly config = {
    healthCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
    performanceThresholds: {
      apiCall: 5000, // 5 seconds
      uiOperation: 1000, // 1 second
      dataLoad: 3000, // 3 seconds
    },
    errorRateThresholds: {
      warning: 0.05, // 5% error rate
      critical: 0.1, // 10% error rate
    },
    metricsRetentionHours: 24,
  };

  private constructor() {
    this.telemetry = TelemetryService.getInstance();
    this.startHealthChecks();
    this.startPerformanceMonitoring();
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      if (!this.isDisposed) {
        this.performHealthCheck();
      }
    }, this.config.healthCheckIntervalMs);

    // Perform initial health check
    setTimeout(() => this.performHealthCheck(), 5000);
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    const healthStatus: HealthCheckResult = {
      timestamp: new Date().toISOString(),
      overall: "healthy",
      checks: {},
    };

    try {
      // Check VS Code API availability
      healthStatus.checks.vscode = await this.checkVSCodeHealth();

      // Check extension memory usage
      healthStatus.checks.memory = this.checkMemoryHealth();

      // Check performance metrics
      healthStatus.checks.performance = this.checkPerformanceHealth();

      // Check error rates
      healthStatus.checks.errorRates = this.checkErrorRateHealth();

      // Check configuration
      healthStatus.checks.configuration = await this.checkConfigurationHealth();

      // Determine overall health
      const failedChecks = Object.values(healthStatus.checks).filter(
        (check) => check.status === "unhealthy"
      );
      const warningChecks = Object.values(healthStatus.checks).filter(
        (check) => check.status === "degraded"
      );

      if (failedChecks.length > 0) {
        healthStatus.overall = "unhealthy";
      } else if (warningChecks.length > 0) {
        healthStatus.overall = "degraded";
      }

      // Report health status
      this.reportHealthStatus(healthStatus);
    } catch (error) {
      console.error("❌ Health check failed:", error);
      this.telemetry.trackError("health.check.failed", error as Error);
    }
  }

  /**
   * Check VS Code API health
   */
  private async checkVSCodeHealth(): Promise<HealthCheck> {
    try {
      // Test basic VS Code operations
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const activeEditor = vscode.window.activeTextEditor;

      // Test command registration
      const commands = await vscode.commands.getCommands();
      const hasOurCommands = commands.some((cmd) =>
        cmd.startsWith("azureDevOps.")
      );

      if (!hasOurCommands) {
        return {
          status: "unhealthy",
          message: "Extension commands not registered",
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: "healthy",
        message: "VS Code API functioning normally",
        timestamp: new Date().toISOString(),
        details: {
          workspaceFolders: workspaceFolders?.length || 0,
          hasActiveEditor: !!activeEditor,
          commandsRegistered: commands.filter((cmd) =>
            cmd.startsWith("azureDevOps.")
          ).length,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `VS Code API error: ${error}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check memory health
   */
  private checkMemoryHealth(): HealthCheck {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      let message = `Memory usage normal: ${heapUsedMB}MB used`;

      if (heapUsedMB > 200) {
        status = "degraded";
        message = `High memory usage: ${heapUsedMB}MB used`;
      }

      if (heapUsedMB > 500) {
        status = "unhealthy";
        message = `Critical memory usage: ${heapUsedMB}MB used`;
      }

      return {
        status,
        message,
        timestamp: new Date().toISOString(),
        details: {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          rss: Math.round(memUsage.rss / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `Memory check failed: ${error}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check performance health
   */
  private checkPerformanceHealth(): HealthCheck {
    const recentMetrics = this.getRecentPerformanceMetrics(60 * 60 * 1000); // Last hour

    if (recentMetrics.length === 0) {
      return {
        status: "healthy",
        message: "No recent performance data",
        timestamp: new Date().toISOString(),
      };
    }

    const slowOperations = recentMetrics.filter(
      (metric) =>
        metric.duration >
        (this.config.performanceThresholds[
          metric.operation as keyof typeof this.config.performanceThresholds
        ] || 5000)
    );

    const avgDuration =
      recentMetrics.reduce((sum, metric) => sum + metric.duration, 0) /
      recentMetrics.length;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    let message = `Performance normal: ${Math.round(avgDuration)}ms avg`;

    if (slowOperations.length > recentMetrics.length * 0.1) {
      status = "degraded";
      message = `Performance degraded: ${slowOperations.length}/${recentMetrics.length} slow operations`;
    }

    if (slowOperations.length > recentMetrics.length * 0.25) {
      status = "unhealthy";
      message = `Performance critical: ${slowOperations.length}/${recentMetrics.length} slow operations`;
    }

    return {
      status,
      message,
      timestamp: new Date().toISOString(),
      details: {
        totalOperations: recentMetrics.length,
        slowOperations: slowOperations.length,
        averageDuration: Math.round(avgDuration),
        maxDuration: Math.max(...recentMetrics.map((m) => m.duration)),
      },
    };
  }

  /**
   * Check error rate health
   */
  private checkErrorRateHealth(): HealthCheck {
    const recentErrors = this.getRecentErrorRates(60 * 60 * 1000); // Last hour

    if (recentErrors.length === 0) {
      return {
        status: "healthy",
        message: "No recent errors",
        timestamp: new Date().toISOString(),
      };
    }

    const totalOperations = recentErrors.reduce(
      (sum, error) => sum + error.total,
      0
    );
    const totalErrors = recentErrors.reduce(
      (sum, error) => sum + error.errors,
      0
    );
    const errorRate = totalOperations > 0 ? totalErrors / totalOperations : 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    let message = `Error rate normal: ${(errorRate * 100).toFixed(2)}%`;

    if (errorRate > this.config.errorRateThresholds.warning) {
      status = "degraded";
      message = `Error rate elevated: ${(errorRate * 100).toFixed(2)}%`;
    }

    if (errorRate > this.config.errorRateThresholds.critical) {
      status = "unhealthy";
      message = `Error rate critical: ${(errorRate * 100).toFixed(2)}%`;
    }

    return {
      status,
      message,
      timestamp: new Date().toISOString(),
      details: {
        errorRate: parseFloat((errorRate * 100).toFixed(2)),
        totalErrors,
        totalOperations,
        uniqueErrorTypes: recentErrors.length,
      },
    };
  }

  /**
   * Check configuration health
   */
  private async checkConfigurationHealth(): Promise<HealthCheck> {
    try {
      const config = vscode.workspace.getConfiguration("azureDevOps");

      // Check if basic configuration exists
      const hasOrganization = !!config.get("organizationUrl");
      const hasProject = !!config.get("project");

      if (!hasOrganization || !hasProject) {
        return {
          status: "degraded",
          message: "Extension not fully configured",
          timestamp: new Date().toISOString(),
          details: {
            hasOrganization,
            hasProject,
            configuredSettings: Object.keys(config).length,
          },
        };
      }

      return {
        status: "healthy",
        message: "Configuration complete",
        timestamp: new Date().toISOString(),
        details: {
          hasOrganization,
          hasProject,
          configuredSettings: Object.keys(config).length,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `Configuration check failed: ${error}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Report health status
   */
  private reportHealthStatus(healthStatus: HealthCheckResult): void {
    // Log health status
    if (healthStatus.overall === "healthy") {
      console.log("💚 Health check passed");
    } else if (healthStatus.overall === "degraded") {
      console.warn("💛 Health check shows degraded performance:", healthStatus);
    } else {
      console.error("❤️ Health check failed:", healthStatus);
    }

    // Send to telemetry
    this.telemetry.trackEvent("health.check", {
      overall: healthStatus.overall,
      checksCount: Object.keys(healthStatus.checks).length.toString(),
      failedChecks: Object.entries(healthStatus.checks)
        .filter(([_, check]) => check.status === "unhealthy")
        .map(([name]) => name)
        .join(","),
      degradedChecks: Object.entries(healthStatus.checks)
        .filter(([_, check]) => check.status === "degraded")
        .map(([name]) => name)
        .join(","),
    });

    // Send alerts for unhealthy status
    if (healthStatus.overall === "unhealthy") {
      this.telemetry.trackError(
        "health.check.unhealthy",
        new Error("Health check failed"),
        {
          healthStatus: JSON.stringify(healthStatus),
        }
      );
    }
  }

  /**
   * Track operation performance
   */
  trackPerformance(
    operation: string,
    duration: number,
    success: boolean = true
  ): void {
    const metric: PerformanceMetric = {
      operation,
      duration,
      success,
      timestamp: Date.now(),
    };

    // Store metric
    const key = `${operation}_${Date.now()}`;
    this.performanceMetrics.set(key, metric);

    // Track in telemetry
    this.telemetry.trackPerformance(operation, duration, success);

    // Clean old metrics
    this.cleanOldMetrics();

    // Check for performance issues
    if (
      duration >
      (this.config.performanceThresholds[
        operation as keyof typeof this.config.performanceThresholds
      ] || 5000)
    ) {
      this.telemetry.trackError(
        "performance.slow",
        new Error(`Slow operation: ${operation}`),
        {
          operation,
          duration: duration.toString(),
          threshold: (
            this.config.performanceThresholds[
              operation as keyof typeof this.config.performanceThresholds
            ] || 5000
          ).toString(),
        }
      );
    }
  }

  /**
   * Track error occurrence
   */
  trackError(operation: string, error: Error | string): void {
    const errorKey = `${operation}_${new Date().getHours()}`;
    const existingRate = this.errorRates.get(errorKey) || {
      operation,
      errors: 0,
      total: 0,
      hour: new Date().getHours(),
    };

    existingRate.errors++;
    existingRate.total++;
    this.errorRates.set(errorKey, existingRate);

    // Track in telemetry
    this.telemetry.trackError(`operation.${operation}`, error);

    // Clean old error rates
    this.cleanOldErrorRates();
  }

  /**
   * Track successful operation
   */
  trackSuccess(operation: string): void {
    const errorKey = `${operation}_${new Date().getHours()}`;
    const existingRate = this.errorRates.get(errorKey) || {
      operation,
      errors: 0,
      total: 0,
      hour: new Date().getHours(),
    };

    existingRate.total++;
    this.errorRates.set(errorKey, existingRate);
  }

  /**
   * Get recent performance metrics
   */
  private getRecentPerformanceMetrics(
    timeWindowMs: number
  ): PerformanceMetric[] {
    const cutoff = Date.now() - timeWindowMs;
    return Array.from(this.performanceMetrics.values()).filter(
      (metric) => metric.timestamp > cutoff
    );
  }

  /**
   * Get recent error rates
   */
  private getRecentErrorRates(timeWindowMs: number): ErrorRate[] {
    const hoursBack = Math.ceil(timeWindowMs / (60 * 60 * 1000));
    const currentHour = new Date().getHours();

    return Array.from(this.errorRates.values()).filter((rate) => {
      const hourDiff =
        currentHour >= rate.hour
          ? currentHour - rate.hour
          : 24 - rate.hour + currentHour;
      return hourDiff <= hoursBack;
    });
  }

  /**
   * Clean old metrics
   */
  private cleanOldMetrics(): void {
    const cutoff =
      Date.now() - this.config.metricsRetentionHours * 60 * 60 * 1000;

    for (const [key, metric] of this.performanceMetrics.entries()) {
      if (metric.timestamp < cutoff) {
        this.performanceMetrics.delete(key);
      }
    }
  }

  /**
   * Clean old error rates
   */
  private cleanOldErrorRates(): void {
    const currentHour = new Date().getHours();

    for (const [key, rate] of this.errorRates.entries()) {
      const hourDiff =
        currentHour >= rate.hour
          ? currentHour - rate.hour
          : 24 - rate.hour + currentHour;
      if (hourDiff > this.config.metricsRetentionHours) {
        this.errorRates.delete(key);
      }
    }
  }

  /**
   * Start performance monitoring for common operations
   */
  private startPerformanceMonitoring(): void {
    // Monitor VS Code API calls
    const originalExecuteCommand = vscode.commands.executeCommand;
    vscode.commands.executeCommand = async <T>(
      command: string,
      ...rest: any[]
    ): Promise<T> => {
      const start = Date.now();
      try {
        const result = await originalExecuteCommand<T>(command, ...rest);
        this.trackPerformance("vscode.command", Date.now() - start, true);
        return result;
      } catch (error) {
        this.trackPerformance("vscode.command", Date.now() - start, false);
        this.trackError("vscode.command", error as Error);
        throw error;
      }
    };
  }

  /**
   * Get performance metrics for external services
   */
  getPerformanceMetrics(): Map<string, PerformanceMetric> {
    return new Map(this.performanceMetrics);
  }

  /**
   * Get monitoring status
   */
  getStatus(): MonitoringStatus {
    return {
      healthCheckRunning: !!this.healthCheckInterval,
      metricsCount: this.performanceMetrics.size,
      errorRatesCount: this.errorRates.size,
      lastHealthCheck: new Date().toISOString(), // This would be stored in practice
      isDisposed: this.isDisposed,
    };
  }

  /**
   * Dispose monitoring service
   */
  dispose(): void {
    this.isDisposed = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.performanceMetrics.clear();
    this.errorRates.clear();

    console.log("📊 Monitoring service disposed");
  }
}

// Type definitions
interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: number;
}

interface ErrorRate {
  operation: string;
  errors: number;
  total: number;
  hour: number;
}

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  timestamp: string;
  details?: Record<string, any>;
}

interface HealthCheckResult {
  timestamp: string;
  overall: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, HealthCheck>;
}

interface MonitoringStatus {
  healthCheckRunning: boolean;
  metricsCount: number;
  errorRatesCount: number;
  lastHealthCheck: string;
  isDisposed: boolean;
}
