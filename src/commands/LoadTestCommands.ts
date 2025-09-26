import * as vscode from "vscode";
import { LoadTestRunner, LoadTestConfig, LoadTestScenario } from "../testing/LoadTestRunner";
import { LoadTestScenarios, LOAD_TEST_CONFIGS } from "../testing/LoadTestScenarios";
import { TelemetryService } from "../services/TelemetryService";

/**
 * Load testing commands for Azure DevOps PR Reviewer extension
 *
 * Provides comprehensive load testing capabilities through VS Code commands.
 * Includes predefined test scenarios, custom test configuration, and detailed reporting.
 *
 * Features:
 * - Predefined load test scenarios for all performance aspects
 * - Custom load test configuration
 * - Real-time progress monitoring
 * - Detailed performance reports
 * - Test history and comparison
 * - Integration with telemetry and monitoring
 */
export class LoadTestCommands {
  private loadTestRunner: LoadTestRunner;
  private loadTestScenarios: LoadTestScenarios;
  private telemetryService: TelemetryService;

  constructor(context: vscode.ExtensionContext) {
    this.loadTestRunner = new LoadTestRunner(context);
    this.loadTestScenarios = new LoadTestScenarios(context);
    this.telemetryService = TelemetryService.getInstance();

    this.registerCommands(context);
  }

  /**
   * Register all load testing commands
   */
  private registerCommands(context: vscode.ExtensionContext): void {
    // Main load testing commands
    const commands = [
      {
        command: "azureDevOps.loadTest.runApiPerformance",
        title: "Run API Performance Load Test",
        callback: () => this.runApiPerformanceTest(),
      },
      {
        command: "azureDevOps.loadTest.runUiResponsiveness",
        title: "Run UI Responsiveness Load Test",
        callback: () => this.runUiResponsivenessTest(),
      },
      {
        command: "azureDevOps.loadTest.runMemoryUsage",
        title: "Run Memory Usage Load Test",
        callback: () => this.runMemoryUsageTest(),
      },
      {
        command: "azureDevOps.loadTest.runConcurrency",
        title: "Run Concurrency Load Test",
        callback: () => this.runConcurrencyTest(),
      },
      {
        command: "azureDevOps.loadTest.runScalability",
        title: "Run Scalability Load Test",
        callback: () => this.runScalabilityTest(),
      },
      {
        command: "azureDevOps.loadTest.runRealWorld",
        title: "Run Real-world Simulation Load Test",
        callback: () => this.runRealWorldTest(),
      },
      {
        command: "azureDevOps.loadTest.runAllTests",
        title: "Run Comprehensive Load Test Suite",
        callback: () => this.runAllLoadTests(),
      },
      {
        command: "azureDevOps.loadTest.runCustomTest",
        title: "Run Custom Load Test",
        callback: () => this.runCustomLoadTest(),
      },
      {
        command: "azureDevOps.loadTest.showResults",
        title: "Show Load Test Results",
        callback: () => this.showLoadTestResults(),
      },
      {
        command: "azureDevOps.loadTest.exportResults",
        title: "Export Load Test Results",
        callback: () => this.exportLoadTestResults(),
      },
    ];

    // Register all commands
    for (const { command, title, callback } of commands) {
      const disposable = vscode.commands.registerCommand(command, callback);
      context.subscriptions.push(disposable);
    }

    // Add to command palette
    this.addToCommandPalette(commands);
  }

  /**
   * Run API performance load test
   */
  private async runApiPerformanceTest(): Promise<void> {
    const telemetryProps = {
      command: "runApiPerformanceTest",
      testType: "api_performance",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      // Let user choose test configuration
      const config = await this.selectTestConfiguration("API Performance", [
        { label: "Small (10 users, 1 min)", config: LOAD_TEST_CONFIGS.API_PERFORMANCE_SMALL },
        { label: "Medium (50 users, 2 min)", config: LOAD_TEST_CONFIGS.API_PERFORMANCE_MEDIUM },
        { label: "Large (100 users, 5 min)", config: LOAD_TEST_CONFIGS.API_PERFORMANCE_LARGE },
      ]);

      if (!config) {
        return;
      }

      // Show confirmation
      const confirm = await vscode.window.showWarningMessage(
        `This will run an API performance load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      // Run the test
      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      // Track telemetry
      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
        throughput: results.metrics.throughput.toString(),
        errorRate: results.metrics.errorRate.toString(),
      });

      // Show results
      await this.showTestResults(results, "API Performance Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Load test failed: ${error}`);
    }
  }

  /**
   * Run UI responsiveness load test
   */
  private async runUiResponsivenessTest(): Promise<void> {
    const telemetryProps = {
      command: "runUiResponsivenessTest",
      testType: "ui_responsiveness",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      const config = await this.selectTestConfiguration("UI Responsiveness", [
        { label: "Small (5 users, 1 min)", config: LOAD_TEST_CONFIGS.UI_RESPONSIVENESS_SMALL },
        { label: "Medium (20 users, 2 min)", config: LOAD_TEST_CONFIGS.UI_RESPONSIVENESS_MEDIUM },
        { label: "Large (50 users, 3 min)", config: LOAD_TEST_CONFIGS.UI_RESPONSIVENESS_LARGE },
      ]);

      if (!config) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will run a UI responsiveness load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
        averageResponseTime: results.metrics.averageResponseTime.toString(),
        memoryUsage: results.metrics.memoryUsage.maxHeapUsed.toString(),
      });

      await this.showTestResults(results, "UI Responsiveness Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Load test failed: ${error}`);
    }
  }

  /**
   * Run memory usage load test
   */
  private async runMemoryUsageTest(): Promise<void> {
    const telemetryProps = {
      command: "runMemoryUsageTest",
      testType: "memory_usage",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      const config = await this.selectTestConfiguration("Memory Usage", [
        { label: "Small (5 users, 2 min)", config: LOAD_TEST_CONFIGS.MEMORY_USAGE_SMALL },
        { label: "Medium (20 users, 5 min)", config: LOAD_TEST_CONFIGS.MEMORY_USAGE_MEDIUM },
        { label: "Large (50 users, 10 min)", config: LOAD_TEST_CONFIGS.MEMORY_USAGE_LARGE },
      ]);

      if (!config) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will run a memory usage load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
        memoryGrowth: results.metrics.memoryUsage.heapGrowth.toString(),
        memoryLeaks: results.metrics.memoryUsage.memoryLeaks.length.toString(),
      });

      await this.showTestResults(results, "Memory Usage Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Load test failed: ${error}`);
    }
  }

  /**
   * Run concurrency load test
   */
  private async runConcurrencyTest(): Promise<void> {
    const telemetryProps = {
      command: "runConcurrencyTest",
      testType: "concurrency",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      const config = await this.selectTestConfiguration("Concurrency", [
        { label: "Low (25 users, 2 min)", config: LOAD_TEST_CONFIGS.CONCURRENCY_LOW },
        { label: "Medium (75 users, 3 min)", config: LOAD_TEST_CONFIGS.CONCURRENCY_MEDIUM },
        { label: "High (150 users, 5 min)", config: LOAD_TEST_CONFIGS.CONCURRENCY_HIGH },
      ]);

      if (!config) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will run a concurrency load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
        errorRate: results.metrics.errorRate.toString(),
        cpuUsage: results.metrics.cpuUsage.maxCpuUsage.toString(),
      });

      await this.showTestResults(results, "Concurrency Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Load test failed: ${error}`);
    }
  }

  /**
   * Run scalability load test
   */
  private async runScalabilityTest(): Promise<void> {
    const telemetryProps = {
      command: "runScalabilityTest",
      testType: "scalability",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      const config = await this.selectTestConfiguration("Scalability", [
        { label: "Small Dataset (10 users, 2 min)", config: LOAD_TEST_CONFIGS.SCALABILITY_SMALL_DATASET },
        { label: "Medium Dataset (25 users, 3 min)", config: LOAD_TEST_CONFIGS.SCALABILITY_MEDIUM_DATASET },
        { label: "Large Dataset (50 users, 5 min)", config: LOAD_TEST_CONFIGS.SCALABILITY_LARGE_DATASET },
      ]);

      if (!config) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will run a scalability load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
        throughput: results.metrics.throughput.toString(),
        scalability: this.calculateScalabilityScore(results).toString(),
      });

      await this.showTestResults(results, "Scalability Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Load test failed: ${error}`);
    }
  }

  /**
   * Run real-world simulation load test
   */
  private async runRealWorldTest(): Promise<void> {
    const telemetryProps = {
      command: "runRealWorldTest",
      testType: "real_world",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      const config = await this.selectTestConfiguration("Real-world Simulation", [
        { label: "Light (5 users, 5 min)", config: LOAD_TEST_CONFIGS.REAL_WORLD_LIGHT },
        { label: "Moderate (15 users, 10 min)", config: LOAD_TEST_CONFIGS.REAL_WORLD_MODERATE },
        { label: "Heavy (30 users, 15 min)", config: LOAD_TEST_CONFIGS.REAL_WORLD_HEAVY },
      ]);

      if (!config) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will run a real-world simulation load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
        userExperience: this.calculateUserExperienceScore(results).toString(),
      });

      await this.showTestResults(results, "Real-world Simulation Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Load test failed: ${error}`);
    }
  }

  /**
   * Run all load tests
   */
  private async runAllLoadTests(): Promise<void> {
    const telemetryProps = {
      command: "runAllLoadTests",
      testType: "comprehensive",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      const confirm = await vscode.window.showWarningMessage(
        "This will run the comprehensive load test suite, which may take a significant amount of time (30+ minutes). Continue?",
        { modal: true },
        "Run All Tests",
        "Cancel"
      );

      if (confirm !== "Run All Tests") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestScenarios.runAllTests();
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        overallScore: results.overallPerformanceScore.toString(),
        testSuites: results.testSuites.length.toString(),
        criticalIssues: results.summary.criticalIssues.length.toString(),
      });

      await this.showComprehensiveResults(results);

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Comprehensive load test failed: ${error}`);
    }
  }

  /**
   * Run custom load test
   */
  private async runCustomLoadTest(): Promise<void> {
    const telemetryProps = {
      command: "runCustomLoadTest",
      testType: "custom",
    };

    try {
      this.telemetryService.trackEvent("loadTest.start", telemetryProps);

      // Get custom configuration from user
      const config = await this.getCustomConfiguration();
      if (!config) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will run a custom load test with ${config.concurrentUsers} concurrent users for ${config.duration} seconds. Continue?`,
        { modal: true },
        "Run Test",
        "Cancel"
      );

      if (confirm !== "Run Test") {
        return;
      }

      const startTime = Date.now();
      const results = await this.loadTestRunner.runLoadTest(config);
      const duration = Date.now() - startTime;

      this.telemetryService.trackEvent("loadTest.complete", {
        ...telemetryProps,
        duration: duration.toString(),
        performanceScore: results.performanceScore.toString(),
      });

      await this.showTestResults(results, "Custom Load Test");

    } catch (error) {
      this.telemetryService.trackError("loadTest.failed", error as Error, telemetryProps);
      vscode.window.showErrorMessage(`Custom load test failed: ${error}`);
    }
  }

  /**
   * Show load test results
   */
  private async showLoadTestResults(): Promise<void> {
    // This would show historical test results
    // Implementation depends on result storage mechanism
    vscode.window.showInformationMessage("Load test results feature coming soon!");
  }

  /**
   * Export load test results
   */
  private async exportLoadTestResults(): Promise<void> {
    // This would export test results to various formats
    // Implementation depends on result storage mechanism
    vscode.window.showInformationMessage("Export results feature coming soon!");
  }

  /**
   * Select test configuration
   */
  private async selectTestConfiguration(testName: string, options: Array<{ label: string; config: LoadTestConfig }>): Promise<LoadTestConfig | undefined> {
    const selected = await vscode.window.showQuickPick(
      options.map(option => ({
        label: option.label,
        detail: `${option.config.concurrentUsers} users, ${option.config.duration}s duration`,
        config: option.config,
      })),
      {
        placeHolder: `Select ${testName} test configuration`,
      }
    );

    return selected?.config;
  }

  /**
   * Get custom configuration from user
   */
  private async getCustomConfiguration(): Promise<LoadTestConfig | undefined> {
    // Get concurrent users
    const concurrentUsers = await vscode.window.showInputBox({
      placeHolder: "Number of concurrent users",
      prompt: "Enter the number of concurrent users for the load test",
      validateInput: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          return "Please enter a valid positive number";
        }
        return null;
      },
    });

    if (!concurrentUsers) {
      return undefined;
    }

    // Get test duration
    const duration = await vscode.window.showInputBox({
      placeHolder: "Test duration in seconds",
      prompt: "Enter the test duration in seconds",
      validateInput: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          return "Please enter a valid positive number";
        }
        return null;
      },
    });

    if (!duration) {
      return undefined;
    }

    // Get ramp up time
    const rampUpTime = await vscode.window.showInputBox({
      placeHolder: "Ramp up time in seconds",
      prompt: "Enter the ramp up time in seconds",
      validateInput: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          return "Please enter a valid non-negative number";
        }
        return null;
      },
    });

    if (!rampUpTime) {
      return undefined;
    }

    // Get think time
    const thinkTime = await vscode.window.showInputBox({
      placeHolder: "Think time in milliseconds",
      prompt: "Enter the think time between operations in milliseconds",
      validateInput: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          return "Please enter a valid non-negative number";
        }
        return null;
      },
    });

    if (!thinkTime) {
      return undefined;
    }

    // Get test scenario
    const scenario = await vscode.window.showQuickPick(
      Object.values(LoadTestScenario).map(scenario => ({
        label: scenario.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        scenario,
      })),
      {
        placeHolder: "Select test scenario",
      }
    );

    if (!scenario) {
      return undefined;
    }

    return {
      concurrentUsers: parseInt(concurrentUsers),
      duration: parseInt(duration),
      rampUpTime: parseInt(rampUpTime),
      thinkTime: parseInt(thinkTime),
      scenario: scenario.scenario,
      metricsCollectionInterval: 1000,
    };
  }

  /**
   * Show test results in a webview
   */
  private async showTestResults(results: any, testName: string): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      "loadTestResults",
      `${testName} Results`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [],
      }
    );

    panel.webview.html = this.generateResultsHtml(results, testName);
  }

  /**
   * Show comprehensive test results
   */
  private async showComprehensiveResults(results: any): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      "comprehensiveLoadTestResults",
      "Comprehensive Load Test Results",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [],
      }
    );

    panel.webview.html = this.generateComprehensiveResultsHtml(results);
  }

  /**
   * Generate HTML for test results
   */
  private generateResultsHtml(results: any, testName: string): string {
    const score = results.performanceScore;
    const scoreColor = score >= 80 ? "#4CAF50" : score >= 60 ? "#FF9800" : "#F44336";
    const scoreText = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Improvement";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${testName} Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .score { font-size: 48px; font-weight: bold; color: ${scoreColor}; text-align: center; }
          .score-text { font-size: 18px; color: #666; text-align: center; margin-bottom: 20px; }
          .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .metric { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          .metric-label { font-weight: bold; color: #333; }
          .metric-value { font-size: 24px; color: #2196F3; margin-top: 5px; }
          .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .recommendations h3 { margin-top: 0; color: #856404; }
          .recommendations ul { margin-bottom: 0; }
          .errors { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; }
          .errors h3 { margin-top: 0; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${testName} Results</h1>
          <div class="score">${score}/100</div>
          <div class="score-text">${scoreText}</div>
        </div>

        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Total Operations</div>
            <div class="metric-value">${results.metrics.totalOperations.toLocaleString()}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Throughput</div>
            <div class="metric-value">${results.metrics.throughput.toFixed(2)} ops/sec</div>
          </div>
          <div class="metric">
            <div class="metric-label">Average Response Time</div>
            <div class="metric-value">${results.metrics.averageResponseTime.toFixed(2)}ms</div>
          </div>
          <div class="metric">
            <div class="metric-label">Error Rate</div>
            <div class="metric-value">${(results.metrics.errorRate * 100).toFixed(2)}%</div>
          </div>
          <div class="metric">
            <div class="metric-label">Peak Memory Usage</div>
            <div class="metric-value">${this.formatBytes(results.metrics.memoryUsage.maxHeapUsed)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Test Duration</div>
            <div class="metric-value">${Math.round(results.metrics.duration / 1000)}s</div>
          </div>
        </div>

        ${results.recommendations.length > 0 ? `
          <div class="recommendations">
            <h3>🔧 Recommendations</h3>
            <ul>
              ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${results.errors.length > 0 ? `
          <div class="errors">
            <h3>⚠️ Errors</h3>
            <ul>
              ${results.errors.map((error: any) => `<li>${error.error} (${error.frequency} occurrences)</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  /**
   * Generate HTML for comprehensive results
   */
  private generateComprehensiveResultsHtml(results: any): string {
    const score = results.overallPerformanceScore;
    const scoreColor = score >= 80 ? "#4CAF50" : score >= 60 ? "#FF9800" : "#F44336";
    const scoreText = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Improvement";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comprehensive Load Test Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .score { font-size: 48px; font-weight: bold; color: ${scoreColor}; text-align: center; }
          .score-text { font-size: 18px; color: #666; text-align: center; margin-bottom: 20px; }
          .summary { background: #e8f5e8; border: 1px solid #c8e6c9; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
          .suite { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 15px; }
          .suite-name { font-weight: bold; color: #333; margin-bottom: 10px; }
          .suite-score { font-size: 20px; color: #2196F3; }
          .critical { background: #ffebee; border: 1px solid #ffcdd2; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .critical h3 { color: #c62828; margin-top: 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Comprehensive Load Test Results</h1>
          <div class="score">${score}/100</div>
          <div class="score-text">${scoreText}</div>
          <p>Generated on ${new Date(results.timestamp).toLocaleString()}</p>
          <p>Total Duration: ${Math.round(results.totalDuration / 1000)}s</p>
        </div>

        <div class="summary">
          <h3>📊 Summary</h3>
          <ul>
            ${results.summary.keyFindings.map((finding: string) => `<li>${finding}</li>`).join('')}
          </ul>
        </div>

        ${results.summary.criticalIssues.length > 0 ? `
          <div class="critical">
            <h3>🚨 Critical Issues</h3>
            <ul>
              ${results.summary.criticalIssues.map((issue: string) => `<li>${issue}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="summary">
          <h3>🔧 Recommendations</h3>
          <ul>
            ${results.summary.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
          </ul>
        </div>

        <h3>📈 Test Suite Results</h3>
        ${results.testSuites.map((suite: any) => `
          <div class="suite">
            <div class="suite-name">${suite.suiteName}</div>
            <div class="suite-score">Score: ${suite.summary.overallScore}/100</div>
            <p>${suite.description}</p>
            <ul>
              ${suite.summary.keyFindings.map((finding: string) => `<li>${finding}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </body>
      </html>
    `;
  }

  /**
   * Add commands to command palette
   */
  private addToCommandPalette(commands: Array<{ command: string; title: string }>): void {
    // Commands are automatically added to the command palette when registered
    // This is just a placeholder for any additional command palette setup
  }

  /**
   * Calculate scalability score
   */
  private calculateScalabilityScore(results: any): number {
    // Simplified scalability calculation
    const throughput = results.metrics.throughput;
    const responseTime = results.metrics.averageResponseTime;
    const memoryUsage = results.metrics.memoryUsage.maxHeapUsed;

    let score = 100;

    if (throughput < 20) score -= 20;
    if (responseTime > 1500) score -= 20;
    if (memoryUsage > 500 * 1024 * 1024) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Calculate user experience score
   */
  private calculateUserExperienceScore(results: any): number {
    // Simplified user experience calculation
    const responseTime = results.metrics.averageResponseTime;
    const errorRate = results.metrics.errorRate;
    const throughput = results.metrics.throughput;

    let score = 100;

    if (responseTime > 1000) score -= 30;
    if (errorRate > 0.05) score -= 20;
    if (throughput < 30) score -= 10;

    return Math.max(0, score);
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