import * as vscode from "vscode";
import { LoadTestRunner, LoadTestConfig, LoadTestScenario } from "./LoadTestRunner";

/**
 * Predefined load test configurations for different scenarios
 */
export const LOAD_TEST_CONFIGS = {
  // API Performance Testing
  API_PERFORMANCE_SMALL: {
    concurrentUsers: 10,
    duration: 60, // 1 minute
    rampUpTime: 10, // 10 seconds
    thinkTime: 500, // 0.5 seconds between operations
    scenario: LoadTestScenario.API_PERFORMANCE,
    metricsCollectionInterval: 1000,
  },
  API_PERFORMANCE_MEDIUM: {
    concurrentUsers: 50,
    duration: 120, // 2 minutes
    rampUpTime: 20, // 20 seconds
    thinkTime: 300, // 0.3 seconds between operations
    scenario: LoadTestScenario.API_PERFORMANCE,
    metricsCollectionInterval: 1000,
  },
  API_PERFORMANCE_LARGE: {
    concurrentUsers: 100,
    duration: 300, // 5 minutes
    rampUpTime: 30, // 30 seconds
    thinkTime: 200, // 0.2 seconds between operations
    scenario: LoadTestScenario.API_PERFORMANCE,
    metricsCollectionInterval: 500,
  },

  // UI Responsiveness Testing
  UI_RESPONSIVENESS_SMALL: {
    concurrentUsers: 5,
    duration: 60,
    rampUpTime: 5,
    thinkTime: 1000,
    scenario: LoadTestScenario.UI_RESPONSIVENESS,
    metricsCollectionInterval: 1000,
  },
  UI_RESPONSIVENESS_MEDIUM: {
    concurrentUsers: 20,
    duration: 120,
    rampUpTime: 10,
    thinkTime: 800,
    scenario: LoadTestScenario.UI_RESPONSIVENESS,
    metricsCollectionInterval: 500,
  },
  UI_RESPONSIVENESS_LARGE: {
    concurrentUsers: 50,
    duration: 180,
    rampUpTime: 15,
    thinkTime: 600,
    scenario: LoadTestScenario.UI_RESPONSIVENESS,
    metricsCollectionInterval: 250,
  },

  // Memory Usage Analysis
  MEMORY_USAGE_SMALL: {
    concurrentUsers: 5,
    duration: 120,
    rampUpTime: 10,
    thinkTime: 100,
    scenario: LoadTestScenario.MEMORY_USAGE,
    metricsCollectionInterval: 500,
  },
  MEMORY_USAGE_MEDIUM: {
    concurrentUsers: 20,
    duration: 300,
    rampUpTime: 30,
    thinkTime: 50,
    scenario: LoadTestScenario.MEMORY_USAGE,
    metricsCollectionInterval: 250,
  },
  MEMORY_USAGE_LARGE: {
    concurrentUsers: 50,
    duration: 600, // 10 minutes
    rampUpTime: 60,
    thinkTime: 25,
    scenario: LoadTestScenario.MEMORY_USAGE,
    metricsCollectionInterval: 100,
  },

  // Concurrency Testing
  CONCURRENCY_LOW: {
    concurrentUsers: 25,
    duration: 120,
    rampUpTime: 15,
    thinkTime: 400,
    scenario: LoadTestScenario.CONCURRENCY,
    metricsCollectionInterval: 500,
  },
  CONCURRENCY_MEDIUM: {
    concurrentUsers: 75,
    duration: 180,
    rampUpTime: 30,
    thinkTime: 300,
    scenario: LoadTestScenario.CONCURRENCY,
    metricsCollectionInterval: 250,
  },
  CONCURRENCY_HIGH: {
    concurrentUsers: 150,
    duration: 300,
    rampUpTime: 45,
    thinkTime: 200,
    scenario: LoadTestScenario.CONCURRENCY,
    metricsCollectionInterval: 100,
  },

  // Scalability Testing
  SCALABILITY_SMALL_DATASET: {
    concurrentUsers: 10,
    duration: 120,
    rampUpTime: 15,
    thinkTime: 500,
    scenario: LoadTestScenario.SCALABILITY,
    metricsCollectionInterval: 1000,
  },
  SCALABILITY_MEDIUM_DATASET: {
    concurrentUsers: 25,
    duration: 180,
    rampUpTime: 20,
    thinkTime: 400,
    scenario: LoadTestScenario.SCALABILITY,
    metricsCollectionInterval: 500,
  },
  SCALABILITY_LARGE_DATASET: {
    concurrentUsers: 50,
    duration: 300,
    rampUpTime: 30,
    thinkTime: 300,
    scenario: LoadTestScenario.SCALABILITY,
    metricsCollectionInterval: 250,
  },

  // Real-world Simulation
  REAL_WORLD_LIGHT: {
    concurrentUsers: 5,
    duration: 300, // 5 minutes
    rampUpTime: 60,
    thinkTime: 2000, // 2 seconds between operations (realistic think time)
    scenario: LoadTestScenario.REAL_WORLD,
    metricsCollectionInterval: 1000,
  },
  REAL_WORLD_MODERATE: {
    concurrentUsers: 15,
    duration: 600, // 10 minutes
    rampUpTime: 120,
    thinkTime: 1500, // 1.5 seconds between operations
    scenario: LoadTestScenario.REAL_WORLD,
    metricsCollectionInterval: 500,
  },
  REAL_WORLD_HEAVY: {
    concurrentUsers: 30,
    duration: 900, // 15 minutes
    rampUpTime: 180,
    thinkTime: 1000, // 1 second between operations
    scenario: LoadTestScenario.REAL_WORLD,
    metricsCollectionInterval: 250,
  },
};

/**
 * Comprehensive load testing scenarios for Azure DevOps PR Reviewer
 *
 * Provides predefined test scenarios covering all critical performance aspects
 * of the extension. Each scenario is designed to simulate realistic usage patterns
 * and identify potential bottlenecks.
 *
 * Scenarios include:
 * - API Performance: Test rate limiting, pagination, concurrent requests
 * - UI Responsiveness: Tree view performance, webview loading, search/filtering
 * - Memory Usage: Leak detection, garbage collection, memory growth
 * - Concurrency: Simultaneous operations, race conditions, performance degradation
 * - Scalability: Varying dataset sizes, performance over time, startup impact
 * - Real-world: Developer workflows, realistic repository sizes, peak usage
 */
export class LoadTestScenarios {
  private runner: LoadTestRunner;

  constructor(context: vscode.ExtensionContext) {
    this.runner = new LoadTestRunner(context);
  }

  /**
   * Run comprehensive API performance tests
   */
  async runApiPerformanceTests(): Promise<TestSuiteResults> {
    console.log("🚀 Starting API Performance Load Tests");

    const results: LoadTestResult[] = [];
    const configs = [
      LOAD_TEST_CONFIGS.API_PERFORMANCE_SMALL,
      LOAD_TEST_CONFIGS.API_PERFORMANCE_MEDIUM,
      LOAD_TEST_CONFIGS.API_PERFORMANCE_LARGE,
    ];

    for (const config of configs) {
      try {
        const result = await this.runner.runLoadTest(config);
        results.push({
          config,
          result,
          testName: `API Performance - ${config.concurrentUsers} users, ${config.duration}s`,
        });
      } catch (error) {
        console.error(`API Performance test failed:`, error);
        results.push({
          config,
          result: null,
          testName: `API Performance - ${config.concurrentUsers} users, ${config.duration}s`,
          error: error as Error,
        });
      }
    }

    return {
      suiteName: "API Performance Testing",
      description: "Test rate limiting, pagination, concurrent requests, and memory usage",
      results,
      summary: this.generateApiPerformanceSummary(results),
    };
  }

  /**
   * Run comprehensive UI responsiveness tests
   */
  async runUiResponsivenessTests(): Promise<TestSuiteResults> {
    console.log("🎨 Starting UI Responsiveness Load Tests");

    const results: LoadTestResult[] = [];
    const configs = [
      LOAD_TEST_CONFIGS.UI_RESPONSIVENESS_SMALL,
      LOAD_TEST_CONFIGS.UI_RESPONSIVENESS_MEDIUM,
      LOAD_TEST_CONFIGS.UI_RESPONSIVENESS_LARGE,
    ];

    for (const config of configs) {
      try {
        const result = await this.runner.runLoadTest(config);
        results.push({
          config,
          result,
          testName: `UI Responsiveness - ${config.concurrentUsers} users, ${config.duration}s`,
        });
      } catch (error) {
        console.error(`UI Responsiveness test failed:`, error);
        results.push({
          config,
          result: null,
          testName: `UI Responsiveness - ${config.concurrentUsers} users, ${config.duration}s`,
          error: error as Error,
        });
      }
    }

    return {
      suiteName: "UI Responsiveness Testing",
      description: "Test tree view performance, webview loading, search and filtering performance",
      results,
      summary: this.generateUiResponsivenessSummary(results),
    };
  }

  /**
   * Run comprehensive memory usage tests
   */
  async runMemoryUsageTests(): Promise<TestSuiteResults> {
    console.log("🧠 Starting Memory Usage Load Tests");

    const results: LoadTestResult[] = [];
    const configs = [
      LOAD_TEST_CONFIGS.MEMORY_USAGE_SMALL,
      LOAD_TEST_CONFIGS.MEMORY_USAGE_MEDIUM,
      LOAD_TEST_CONFIGS.MEMORY_USAGE_LARGE,
    ];

    for (const config of configs) {
      try {
        const result = await this.runner.runLoadTest(config);
        results.push({
          config,
          result,
          testName: `Memory Usage - ${config.concurrentUsers} users, ${config.duration}s`,
        });
      } catch (error) {
        console.error(`Memory Usage test failed:`, error);
        results.push({
          config,
          result: null,
          testName: `Memory Usage - ${config.concurrentUsers} users, ${config.duration}s`,
          error: error as Error,
        });
      }
    }

    return {
      suiteName: "Memory Usage Analysis",
      description: "Test memory profiling, leak detection, and garbage collection efficiency",
      results,
      summary: this.generateMemoryUsageSummary(results),
    };
  }

  /**
   * Run comprehensive concurrency tests
   */
  async runConcurrencyTests(): Promise<TestSuiteResults> {
    console.log("⚡ Starting Concurrency Load Tests");

    const results: LoadTestResult[] = [];
    const configs = [
      LOAD_TEST_CONFIGS.CONCURRENCY_LOW,
      LOAD_TEST_CONFIGS.CONCURRENCY_MEDIUM,
      LOAD_TEST_CONFIGS.CONCURRENCY_HIGH,
    ];

    for (const config of configs) {
      try {
        const result = await this.runner.runLoadTest(config);
        results.push({
          config,
          result,
          testName: `Concurrency - ${config.concurrentUsers} users, ${config.duration}s`,
        });
      } catch (error) {
        console.error(`Concurrency test failed:`, error);
        results.push({
          config,
          result: null,
          testName: `Concurrency - ${config.concurrentUsers} users, ${config.duration}s`,
          error: error as Error,
        });
      }
    }

    return {
      suiteName: "Concurrency Testing",
      description: "Test simultaneous operations, race conditions, and performance degradation",
      results,
      summary: this.generateConcurrencySummary(results),
    };
  }

  /**
   * Run comprehensive scalability tests
   */
  async runScalabilityTests(): Promise<TestSuiteResults> {
    console.log("📈 Starting Scalability Load Tests");

    const results: LoadTestResult[] = [];
    const configs = [
      LOAD_TEST_CONFIGS.SCALABILITY_SMALL_DATASET,
      LOAD_TEST_CONFIGS.SCALABILITY_MEDIUM_DATASET,
      LOAD_TEST_CONFIGS.SCALABILITY_LARGE_DATASET,
    ];

    for (const config of configs) {
      try {
        const result = await this.runner.runLoadTest(config);
        results.push({
          config,
          result,
          testName: `Scalability - ${config.concurrentUsers} users, ${config.duration}s`,
        });
      } catch (error) {
        console.error(`Scalability test failed:`, error);
        results.push({
          config,
          result: null,
          testName: `Scalability - ${config.concurrentUsers} users, ${config.duration}s`,
          error: error as Error,
        });
      }
    }

    return {
      suiteName: "Scalability Testing",
      description: "Test varying dataset sizes, performance over time, and startup impact",
      results,
      summary: this.generateScalabilitySummary(results),
    };
  }

  /**
   * Run comprehensive real-world simulation tests
   */
  async runRealWorldTests(): Promise<TestSuiteResults> {
    console.log("🌍 Starting Real-world Simulation Load Tests");

    const results: LoadTestResult[] = [];
    const configs = [
      LOAD_TEST_CONFIGS.REAL_WORLD_LIGHT,
      LOAD_TEST_CONFIGS.REAL_WORLD_MODERATE,
      LOAD_TEST_CONFIGS.REAL_WORLD_HEAVY,
    ];

    for (const config of configs) {
      try {
        const result = await this.runner.runLoadTest(config);
        results.push({
          config,
          result,
          testName: `Real-world - ${config.concurrentUsers} users, ${config.duration}s`,
        });
      } catch (error) {
        console.error(`Real-world test failed:`, error);
        results.push({
          config,
          result: null,
          testName: `Real-world - ${config.concurrentUsers} users, ${config.duration}s`,
          error: error as Error,
        });
      }
    }

    return {
      suiteName: "Real-world Simulation",
      description: "Test developer workflows, realistic repository sizes, and peak usage patterns",
      results,
      summary: this.generateRealWorldSummary(results),
    };
  }

  /**
   * Run all load test suites
   */
  async runAllTests(): Promise<ComprehensiveLoadTestResults> {
    console.log("🎯 Starting Comprehensive Load Testing Suite");

    const suites: TestSuiteResults[] = [];

    // Run all test suites
    const suitePromises = [
      this.runApiPerformanceTests(),
      this.runUiResponsivenessTests(),
      this.runMemoryUsageTests(),
      this.runConcurrencyTests(),
      this.runScalabilityTests(),
      this.runRealWorldTests(),
    ];

    const suiteResults = await Promise.allSettled(suitePromises);

    for (const suiteResult of suiteResults) {
      if (suiteResult.status === "fulfilled") {
        suites.push(suiteResult.value);
      } else {
        console.error("Test suite failed:", suiteResult.reason);
        suites.push({
          suiteName: "Failed Suite",
          description: "Test suite execution failed",
          results: [],
          summary: { overallScore: 0, keyFindings: ["Test suite execution failed"], recommendations: ["Check test configuration and environment"] },
        });
      }
    }

    // Generate comprehensive summary
    const comprehensiveSummary = this.generateComprehensiveSummary(suites);

    return {
      timestamp: new Date().toISOString(),
      totalDuration: this.calculateTotalDuration(suites),
      testSuites: suites,
      summary: comprehensiveSummary,
      overallPerformanceScore: this.calculateOverallScore(suites),
    };
  }

  /**
   * Generate API performance test summary
   */
  private generateApiPerformanceSummary(results: LoadTestResult[]): TestSummary {
    const successfulResults = results.filter(r => r.result !== null);
    const avgThroughput = successfulResults.reduce((sum, r) => sum + r.result!.metrics.throughput, 0) / successfulResults.length || 0;
    const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.result!.metrics.averageResponseTime, 0) / successfulResults.length || 0;
    const avgErrorRate = successfulResults.reduce((sum, r) => sum + r.result!.metrics.errorRate, 0) / successfulResults.length || 0;

    return {
      overallScore: avgThroughput > 50 ? 85 : avgThroughput > 20 ? 70 : 55,
      keyFindings: [
        `Average throughput: ${avgThroughput.toFixed(2)} ops/sec`,
        `Average response time: ${avgResponseTime.toFixed(2)}ms`,
        `Average error rate: ${(avgErrorRate * 100).toFixed(2)}%`,
      ],
      recommendations: [
        "Monitor API rate limiting effectiveness",
        "Optimize pagination for large datasets",
        "Implement intelligent caching strategies",
      ],
    };
  }

  /**
   * Generate UI responsiveness test summary
   */
  private generateUiResponsivenessSummary(results: LoadTestResult[]): TestSummary {
    const successfulResults = results.filter(r => r.result !== null);
    const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.result!.metrics.averageResponseTime, 0) / successfulResults.length || 0;
    const maxMemory = Math.max(...successfulResults.map(r => r.result!.metrics.memoryUsage.maxHeapUsed));

    return {
      overallScore: avgResponseTime < 500 ? 90 : avgResponseTime < 1000 ? 75 : 60,
      keyFindings: [
        `Average UI response time: ${avgResponseTime.toFixed(2)}ms`,
        `Peak memory usage: ${this.formatBytes(maxMemory)}`,
      ],
      recommendations: [
        "Implement virtualization for large tree views",
        "Add progressive loading for webview content",
        "Optimize search and filtering algorithms",
      ],
    };
  }

  /**
   * Generate memory usage test summary
   */
  private generateMemoryUsageSummary(results: LoadTestResult[]): TestSummary {
    const successfulResults = results.filter(r => r.result !== null);
    const avgMemoryGrowth = successfulResults.reduce((sum, r) => sum + r.result!.metrics.memoryUsage.heapGrowth, 0) / successfulResults.length || 0;
    const totalLeaks = successfulResults.reduce((sum, r) => sum + r.result!.metrics.memoryUsage.memoryLeaks.length, 0);

    return {
      overallScore: avgMemoryGrowth < 50 * 1024 * 1024 && totalLeaks === 0 ? 90 : 65,
      keyFindings: [
        `Average memory growth: ${this.formatBytes(avgMemoryGrowth)}`,
        `Memory leaks detected: ${totalLeaks}`,
      ],
      recommendations: [
        "Implement proper cleanup in event handlers",
        "Use object pooling for frequently created objects",
        "Optimize cache eviction policies",
      ],
    };
  }

  /**
   * Generate concurrency test summary
   */
  private generateConcurrencySummary(results: LoadTestResult[]): TestSummary {
    const successfulResults = results.filter(r => r.result !== null);
    const avgErrorRate = successfulResults.reduce((sum, r) => sum + r.result!.metrics.errorRate, 0) / successfulResults.length || 0;
    const maxCpuUsage = Math.max(...successfulResults.map(r => r.result!.metrics.cpuUsage.maxCpuUsage));

    return {
      overallScore: avgErrorRate < 0.05 && maxCpuUsage < 80 ? 85 : 65,
      keyFindings: [
        `Average error rate under concurrency: ${(avgErrorRate * 100).toFixed(2)}%`,
        `Peak CPU usage: ${maxCpuUsage.toFixed(2)}%`,
      ],
      recommendations: [
        "Implement proper error handling and retry logic",
        "Add request queuing and throttling",
        "Optimize locking mechanisms",
      ],
    };
  }

  /**
   * Generate scalability test summary
   */
  private generateScalabilitySummary(results: LoadTestResult[]): TestSummary {
    const successfulResults = results.filter(r => r.result !== null);
    const throughputTrend = this.calculateThroughputTrend(successfulResults);
    const responseTimeTrend = this.calculateResponseTimeTrend(successfulResults);

    return {
      overallScore: throughputTrend > 0.9 && responseTimeTrend < 1.2 ? 85 : 70,
      keyFindings: [
        `Throughput scalability: ${throughputTrend.toFixed(2)}x`,
        `Response time scalability: ${responseTimeTrend.toFixed(2)}x`,
      ],
      recommendations: [
        "Implement data pagination and lazy loading",
        "Optimize data structures for large datasets",
        "Add horizontal scaling support",
      ],
    };
  }

  /**
   * Generate real-world test summary
   */
  private generateRealWorldSummary(results: LoadTestResult[]): TestSummary {
    const successfulResults = results.filter(r => r.result !== null);
    const avgThroughput = successfulResults.reduce((sum, r) => sum + r.result!.metrics.throughput, 0) / successfulResults.length || 0;
    const avgUserExperience = this.calculateUserExperienceScore(successfulResults);

    return {
      overallScore: avgUserExperience,
      keyFindings: [
        `Realistic throughput: ${avgThroughput.toFixed(2)} ops/sec`,
        `User experience score: ${avgUserExperience.toFixed(0)}/100`,
      ],
      recommendations: [
        "Optimize for common developer workflows",
        "Improve error recovery and user feedback",
        "Add loading indicators for long operations",
      ],
    };
  }

  /**
   * Generate comprehensive summary for all test suites
   */
  private generateComprehensiveSummary(suites: TestSuiteResults[]): ComprehensiveSummary {
    const allResults = suites.flatMap(suite => suite.results.filter(r => r.result !== null));
    const overallScore = this.calculateOverallScore(suites);

    const keyFindings: string[] = [];
    const recommendations: string[] = [];

    // Analyze patterns across all tests
    const avgResponseTime = allResults.reduce((sum, r) => sum + r.result!.metrics.averageResponseTime, 0) / allResults.length || 0;
    const avgErrorRate = allResults.reduce((sum, r) => sum + r.result!.metrics.errorRate, 0) / allResults.length || 0;
    const maxMemoryUsage = Math.max(...allResults.map(r => r.result!.metrics.memoryUsage.maxHeapUsed));

    keyFindings.push(
      `Overall average response time: ${avgResponseTime.toFixed(2)}ms`,
      `Overall average error rate: ${(avgErrorRate * 100).toFixed(2)}%`,
      `Peak memory usage across all tests: ${this.formatBytes(maxMemoryUsage)}`
    );

    // Generate recommendations based on patterns
    if (avgResponseTime > 1000) {
      recommendations.push("Focus on performance optimization across all components");
    }
    if (avgErrorRate > 0.05) {
      recommendations.push("Improve error handling and resilience throughout the application");
    }
    if (maxMemoryUsage > 500 * 1024 * 1024) {
      recommendations.push("Implement memory optimization and leak prevention");
    }

    recommendations.push(
      "Establish performance monitoring in production",
      "Set up automated performance regression testing",
      "Document performance characteristics and limitations"
    );

    return {
      overallScore,
      keyFindings,
      recommendations,
      criticalIssues: this.identifyCriticalIssues(suites),
      performanceTrends: this.analyzePerformanceTrends(suites),
    };
  }

  /**
   * Calculate overall performance score
   */
  private calculateOverallScore(suites: TestSuiteResults[]): number {
    const validSuites = suites.filter(s => s.results.length > 0);
    if (validSuites.length === 0) return 0;

    const totalScore = validSuites.reduce((sum, suite) => sum + suite.summary.overallScore, 0);
    return Math.round(totalScore / validSuites.length);
  }

  /**
   * Calculate total test duration
   */
  private calculateTotalDuration(suites: TestSuiteResults[]): number {
    return suites.reduce((total, suite) => {
      return total + suite.results.reduce((suiteTotal, result) => suiteTotal + result.config.duration, 0);
    }, 0);
  }

  /**
   * Calculate throughput trend
   */
  private calculateThroughputTrend(results: LoadTestResult[]): number {
    if (results.length < 2) return 1;

    const sortedResults = results.sort((a, b) => a.config.concurrentUsers - b.config.concurrentUsers);
    const firstThroughput = sortedResults[0].result?.metrics.throughput || 0;
    const lastThroughput = sortedResults[sortedResults.length - 1].result?.metrics.throughput || 0;

    return firstThroughput > 0 ? lastThroughput / firstThroughput : 1;
  }

  /**
   * Calculate response time trend
   */
  private calculateResponseTimeTrend(results: LoadTestResult[]): number {
    if (results.length < 2) return 1;

    const sortedResults = results.sort((a, b) => a.config.concurrentUsers - b.config.concurrentUsers);
    const firstResponseTime = sortedResults[0].result?.metrics.averageResponseTime || 0;
    const lastResponseTime = sortedResults[sortedResults.length - 1].result?.metrics.averageResponseTime || 0;

    return firstResponseTime > 0 ? lastResponseTime / firstResponseTime : 1;
  }

  /**
   * Calculate user experience score
   */
  private calculateUserExperienceScore(results: LoadTestResult[]): number {
    if (results.length === 0) return 0;

    const avgResponseTime = results.reduce((sum, r) => sum + r.result!.metrics.averageResponseTime, 0) / results.length;
    const avgErrorRate = results.reduce((sum, r) => sum + r.result!.metrics.errorRate, 0) / results.length;
    const avgThroughput = results.reduce((sum, r) => sum + r.result!.metrics.throughput, 0) / results.length;

    // Calculate user experience score based on multiple factors
    let score = 100;

    // Response time impact
    if (avgResponseTime > 2000) score -= 40;
    else if (avgResponseTime > 1000) score -= 20;
    else if (avgResponseTime > 500) score -= 10;

    // Error rate impact
    if (avgErrorRate > 0.1) score -= 30;
    else if (avgErrorRate > 0.05) score -= 15;
    else if (avgErrorRate > 0.01) score -= 5;

    // Throughput impact
    if (avgThroughput < 10) score -= 20;
    else if (avgThroughput < 20) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Identify critical issues across all test suites
   */
  private identifyCriticalIssues(suites: TestSuiteResults[]): string[] {
    const issues: string[] = [];

    for (const suite of suites) {
      for (const result of suite.results) {
        if (result.result) {
          // Check for critical response times
          if (result.result.metrics.averageResponseTime > 5000) {
            issues.push(`Critical response time in ${result.testName}: ${result.result.metrics.averageResponseTime.toFixed(2)}ms`);
          }

          // Check for high error rates
          if (result.result.metrics.errorRate > 0.2) {
            issues.push(`High error rate in ${result.testName}: ${(result.result.metrics.errorRate * 100).toFixed(2)}%`);
          }

          // Check for memory leaks
          if (result.result.metrics.memoryUsage.memoryLeaks.length > 0) {
            issues.push(`Memory leaks detected in ${result.testName}: ${result.result.metrics.memoryUsage.memoryLeaks.length} issues`);
          }

          // Check for low performance scores
          if (result.result.performanceScore < 50) {
            issues.push(`Poor performance score in ${result.testName}: ${result.result.performanceScore}/100`);
          }
        }
      }
    }

    return [...new Set(issues)]; // Remove duplicates
  }

  /**
   * Analyze performance trends across test suites
   */
  private analyzePerformanceTrends(suites: TestSuiteResults[]): PerformanceTrend[] {
    const trends: PerformanceTrend[] = [];

    for (const suite of suites) {
      const suiteTrends: PerformanceTrend = {
        suiteName: suite.suiteName,
        metrics: {},
      };

      const successfulResults = suite.results.filter(r => r.result !== null);

      if (successfulResults.length > 0) {
        suiteTrends.metrics.responseTime = {
          min: Math.min(...successfulResults.map(r => r.result!.metrics.averageResponseTime)),
          max: Math.max(...successfulResults.map(r => r.result!.metrics.averageResponseTime)),
          average: successfulResults.reduce((sum, r) => sum + r.result!.metrics.averageResponseTime, 0) / successfulResults.length,
        };

        suiteTrends.metrics.throughput = {
          min: Math.min(...successfulResults.map(r => r.result!.metrics.throughput)),
          max: Math.max(...successfulResults.map(r => r.result!.metrics.throughput)),
          average: successfulResults.reduce((sum, r) => sum + r.result!.metrics.throughput, 0) / successfulResults.length,
        };

        suiteTrends.metrics.memoryUsage = {
          min: Math.min(...successfulResults.map(r => r.result!.metrics.memoryUsage.maxHeapUsed)),
          max: Math.max(...successfulResults.map(r => r.result!.metrics.memoryUsage.maxHeapUsed)),
          average: successfulResults.reduce((sum, r) => sum + r.result!.metrics.memoryUsage.maxHeapUsed, 0) / successfulResults.length,
        };

        trends.push(suiteTrends);
      }
    }

    return trends;
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
}

// Type definitions
interface LoadTestResult {
  readonly config: LoadTestConfig;
  readonly result: any; // LoadTestResults - avoid circular reference
  readonly testName: string;
  readonly error?: Error;
}

interface TestSuiteResults {
  readonly suiteName: string;
  readonly description: string;
  readonly results: LoadTestResult[];
  readonly summary: TestSummary;
}

interface TestSummary {
  readonly overallScore: number;
  readonly keyFindings: string[];
  readonly recommendations: string[];
}

interface ComprehensiveLoadTestResults {
  readonly timestamp: string;
  readonly totalDuration: number;
  readonly testSuites: TestSuiteResults[];
  readonly summary: ComprehensiveSummary;
  readonly overallPerformanceScore: number;
}

interface ComprehensiveSummary {
  readonly overallScore: number;
  readonly keyFindings: string[];
  readonly recommendations: string[];
  readonly criticalIssues: string[];
  readonly performanceTrends: PerformanceTrend[];
}

interface PerformanceTrend {
  readonly suiteName: string;
  readonly metrics: {
    responseTime?: { min: number; max: number; average: number };
    throughput?: { min: number; max: number; average: number };
    memoryUsage?: { min: number; max: number; average: number };
  };
}