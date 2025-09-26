import * as vscode from "vscode";
import { IntegrationService } from "./IntegrationService";
import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
} from "../utils/ErrorHandler";
import { TelemetryService } from "./TelemetryService";
import { MonitoringService } from "./MonitoringService";
import { StateManager } from "./StateManager";
import { PullRequest, CommentThread, GitRepository } from "../api/models";

/**
 * Workflow step interface for tracking progress
 */
export interface WorkflowStep {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  status: "pending" | "in_progress" | "completed" | "failed";
  startTime?: Date;
  endTime?: Date;
  error?: string;
  duration?: number;
}

/**
 * Workflow context for passing data between steps
 */
export interface WorkflowContext {
  readonly workflowId: string;
  readonly workflowType: WorkflowType;
  readonly startTime: Date;
  data: Record<string, any>;
  steps: WorkflowStep[];
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  readonly userId?: string;
  readonly sessionId: string;
}

/**
 * Workflow result
 */
export interface WorkflowResult {
  readonly workflowId: string;
  readonly workflowType: WorkflowType;
  readonly status: "success" | "partial" | "failed" | "cancelled";
  readonly duration: number;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly errors: string[];
  readonly data: Record<string, any>;
  readonly metrics: {
    readonly apiCalls: number;
    readonly cacheHits: number;
    readonly performanceScore: number;
  };
}

/**
 * Workflow types
 */
export type WorkflowType =
  | "pull_request_review"
  | "pull_request_creation"
  | "comment_management"
  | "repository_sync"
  | "authentication_setup"
  | "bulk_operations";

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  readonly timeout: number; // in milliseconds
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly parallelSteps: boolean;
  readonly enableProgress: boolean;
  readonly requireConfirmation: boolean;
}

/**
 * Workflow service for complete end-to-end user journeys
 *
 * Orchestrates complex multi-step workflows with:
 * - Step-by-step progress tracking
 * - Error recovery and retry logic
 * - Performance optimization
 * - User feedback and progress indicators
 * - Telemetry and monitoring
 */
export class WorkflowService implements vscode.Disposable {
  private activeWorkflows = new Map<string, WorkflowContext>();
  private readonly workflowConfigs = new Map<WorkflowType, WorkflowConfig>();
  private progressBars = new Map<
    string,
    vscode.Progress<{ message?: string; increment?: number }>
  >();
  private disposables: vscode.Disposable[] = [];

  // Metrics tracking
  private apiCallCount = 0;
  private cacheHitCount = 0;

  constructor(
    private readonly integrationService: IntegrationService,
    private readonly errorHandler: ErrorHandler,
    private readonly telemetryService: TelemetryService,
    private readonly monitoringService: MonitoringService,
    private readonly stateManager: StateManager
  ) {
    this.initializeWorkflowConfigs();
    this.setupEventListeners();
  }

  /**
   * Execute a complete pull request review workflow
   */
  async executePullRequestReviewWorkflow(
    repositoryId: string,
    pullRequestId: number
  ): Promise<WorkflowResult> {
    return this.executeWorkflow("pull_request_review", async (context) => {
      const steps = [
        {
          id: "load_pr_details",
          name: "Load Pull Request Details",
          description: "Fetching PR information and metadata",
          required: true,
          execute: async () => {
            const details = await this.integrationService.getPullRequestDetails(
              repositoryId,
              pullRequestId
            );
            context.data.pullRequest = details.pullRequest;
            context.data.iterations = details.iterations;
            context.data.commentThreads = details.commentThreads;
            context.data.fileCount = details.fileCount;
            return details;
          },
        },
        {
          id: "load_files",
          name: "Load Pull Request Files",
          description: "Loading changed files with syntax highlighting",
          required: true,
          execute: async () => {
            const iterations = context.data.iterations;
            if (iterations && iterations.length > 0) {
              const latestIteration = iterations[iterations.length - 1];
              const iterationId = latestIteration.id;

              const files = await this.integrationService.getPullRequestFiles(
                repositoryId,
                pullRequestId,
                iterationId,
                0,
                50
              );
              context.data.files = files.files;
              context.data.totalFileCount = files.totalCount;
              return files;
            }
            return { files: [], totalCount: 0 };
          },
        },
        {
          id: "analyze_changes",
          name: "Analyze Code Changes",
          description: "Analyzing code quality and potential issues",
          required: false,
          execute: async () => {
            // Placeholder for code analysis logic
            const analysis = {
              riskLevel: "low",
              suggestions: [],
              automatedReview: true,
            };
            context.data.analysis = analysis;
            return analysis;
          },
        },
        {
          id: "prepare_ui",
          name: "Prepare User Interface",
          description: "Setting up the review interface",
          required: true,
          execute: async () => {
            // Show the PR detail webview
            await vscode.commands.executeCommand(
              "azureDevOps.showPullRequestDetails",
              {
                repositoryId,
                pullRequestId,
              }
            );
            return { uiReady: true };
          },
        },
      ];

      return this.executeSteps(context, steps);
    });
  }

  /**
   * Execute a pull request creation workflow
   */
  async executePullRequestCreationWorkflow(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string,
    repositoryId?: string
  ): Promise<WorkflowResult> {
    return this.executeWorkflow("pull_request_creation", async (context) => {
      const steps = [
        {
          id: "validate_input",
          name: "Validate Input",
          description: "Checking PR creation parameters",
          required: true,
          execute: async () => {
            const validation = {
              isValid: true,
              errors: [] as string[],
            };

            if (!sourceBranch || !targetBranch) {
              validation.isValid = false;
              validation.errors.push("Source and target branches are required");
            }

            if (!title?.trim()) {
              validation.isValid = false;
              validation.errors.push("Title is required");
            }

            if (sourceBranch === targetBranch) {
              validation.isValid = false;
              validation.errors.push(
                "Source and target branches cannot be the same"
              );
            }

            if (!validation.isValid) {
              throw new Error(
                `Validation failed: ${validation.errors.join(", ")}`
              );
            }

            context.data.validation = validation;
            return validation;
          },
        },
        {
          id: "check_conflicts",
          name: "Check for Conflicts",
          description: "Analyzing potential merge conflicts",
          required: true,
          execute: async () => {
            // Placeholder for conflict detection
            const conflictCheck = {
              hasConflicts: false,
              conflictFiles: [],
            };
            context.data.conflictCheck = conflictCheck;
            return conflictCheck;
          },
        },
        {
          id: "create_pr",
          name: "Create Pull Request",
          description: "Creating the pull request in Azure DevOps",
          required: true,
          execute: async () => {
            // This would call the actual PR creation API
            const prData = {
              sourceBranch,
              targetBranch,
              title,
              description,
              repositoryId,
              createdDate: new Date(),
            };
            context.data.createdPR = prData;
            return prData;
          },
        },
        {
          id: "setup_reviewers",
          name: "Set Up Reviewers",
          description: "Configuring reviewers and approval requirements",
          required: false,
          execute: async () => {
            // Placeholder for reviewer configuration
            const reviewerSetup = {
              reviewers: [],
              requiredReviewers: 1,
              autoComplete: false,
            };
            context.data.reviewerSetup = reviewerSetup;
            return reviewerSetup;
          },
        },
      ];

      return this.executeSteps(context, steps);
    });
  }

  /**
   * Execute a comment management workflow
   */
  async executeCommentManagementWorkflow(
    repositoryId: string,
    pullRequestId: number,
    action: "add" | "update" | "delete" | "resolve",
    commentData?: any
  ): Promise<WorkflowResult> {
    return this.executeWorkflow("comment_management", async (context) => {
      const steps = [
        {
          id: "load_context",
          name: "Load Comment Context",
          description: "Loading PR and existing comment data",
          required: true,
          execute: async () => {
            const details = await this.integrationService.getPullRequestDetails(
              repositoryId,
              pullRequestId
            );
            context.data.pullRequest = details.pullRequest;
            context.data.existingComments = details.commentThreads;
            return details;
          },
        },
        {
          id: "validate_action",
          name: "Validate Comment Action",
          description: "Checking comment permissions and validity",
          required: true,
          execute: async () => {
            const validation = {
              isValid: true,
              canExecute: true,
              errors: [] as string[],
            };

            // Validate based on action type
            switch (action) {
              case "add":
                if (!commentData?.content?.trim()) {
                  validation.isValid = false;
                  validation.errors.push("Comment content is required");
                }
                break;
              case "update":
              case "delete":
                if (!commentData?.commentId) {
                  validation.isValid = false;
                  validation.errors.push("Comment ID is required");
                }
                break;
            }

            context.data.action = action;
            context.data.commentData = commentData;
            context.data.validation = validation;
            return validation;
          },
        },
        {
          id: "execute_action",
          name: "Execute Comment Action",
          description: `${
            action.charAt(0).toUpperCase() + action.slice(1)
          } comment`,
          required: true,
          execute: async () => {
            // This would call the actual comment API
            const result = {
              action,
              success: true,
              timestamp: new Date(),
              commentId: commentData?.commentId || `new_${Date.now()}`,
            };
            context.data.actionResult = result;
            return result;
          },
        },
        {
          id: "refresh_ui",
          name: "Refresh User Interface",
          description: "Updating the UI with comment changes",
          required: false,
          execute: async () => {
            // Refresh the PR detail view
            await vscode.commands.executeCommand(
              "azureDevOps.refreshPullRequest",
              {
                repositoryId,
                pullRequestId,
              }
            );
            return { refreshed: true };
          },
        },
      ];

      return this.executeSteps(context, steps);
    });
  }

  /**
   * Execute a repository synchronization workflow
   */
  async executeRepositorySyncWorkflow(
    repositoryIds?: string[]
  ): Promise<WorkflowResult> {
    return this.executeWorkflow("repository_sync", async (context) => {
      const steps = [
        {
          id: "get_repositories",
          name: "Get Repository List",
          description: "Fetching repositories to synchronize",
          required: true,
          execute: async () => {
            const repos = Array.from(
              this.stateManager.getRepositories().values()
            );
            const targetRepos = repositoryIds
              ? repos.filter((repo: any) => repositoryIds.includes(repo.id))
              : repos;

            context.data.allRepositories = repos;
            context.data.targetRepositories = targetRepos;
            return targetRepos;
          },
        },
        {
          id: "sync_pull_requests",
          name: "Sync Pull Requests",
          description: "Updating pull request data",
          required: true,
          execute: async () => {
            const targetRepos = context.data.targetRepositories;
            const results = [];

            for (const repo of targetRepos) {
              try {
                const prs = await this.integrationService.getPullRequests(
                  repo.id
                );
                results.push({
                  repositoryId: repo.id,
                  success: true,
                  count: prs.length,
                });
              } catch (error) {
                results.push({
                  repositoryId: repo.id,
                  success: false,
                  error: String(error),
                });
              }
            }

            context.data.syncResults = results;
            return results;
          },
        },
        {
          id: "update_ui",
          name: "Update User Interface",
          description: "Refreshing tree views and data displays",
          required: false,
          execute: async () => {
            await vscode.commands.executeCommand(
              "azureDevOps.refreshPullRequests"
            );
            return { updated: true };
          },
        },
      ];

      return this.executeSteps(context, steps);
    });
  }

  /**
   * Execute a bulk operations workflow
   */
  async executeBulkOperationsWorkflow(
    operations: Array<{
      type: "approve" | "reject" | "abandon" | "comment";
      repositoryId: string;
      pullRequestId: number;
      data?: any;
    }>
  ): Promise<WorkflowResult> {
    return this.executeWorkflow("bulk_operations", async (context) => {
      context.data.operations = operations;

      const steps = operations.map((op, index) => ({
        id: `bulk_op_${index}`,
        name: `${op.type.charAt(0).toUpperCase() + op.type.slice(1)} PR #${
          op.pullRequestId
        }`,
        description: `Processing ${op.type} for repository ${op.repositoryId}`,
        required: true,
        execute: async () => {
          try {
            let result;
            switch (op.type) {
              case "approve":
                result = await this.integrationService.approvePullRequest(
                  op.repositoryId,
                  op.pullRequestId
                );
                break;
              case "reject":
                result = await this.integrationService.rejectPullRequest(
                  op.repositoryId,
                  op.pullRequestId,
                  op.data?.reason
                );
                break;
              case "abandon":
                result = await this.integrationService.rejectPullRequest(
                  op.repositoryId,
                  op.pullRequestId,
                  "Abandoned"
                );
                break;
              case "comment":
                result = await this.executeCommentManagementWorkflow(
                  op.repositoryId,
                  op.pullRequestId,
                  "add",
                  op.data
                );
                break;
            }

            return { success: true, result };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }));

      return this.executeSteps(context, steps);
    });
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows(): WorkflowContext[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }

    workflow.status = "cancelled";
    this.activeWorkflows.delete(workflowId);

    // Clear progress bar if exists
    this.progressBars.get(workflowId)?.report({ increment: 100 });
    this.progressBars.delete(workflowId);

    this.telemetryService.trackEvent("workflowCancelled", {
      workflowId,
      workflowType: workflow.workflowType,
      duration: (Date.now() - workflow.startTime.getTime()).toString(),
    });

    return true;
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): WorkflowContext | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.progressBars.forEach((bar) => bar.report({ increment: 100 }));
  }

  /**
   * Execute a workflow with proper error handling and monitoring
   */
  private async executeWorkflow(
    workflowType: WorkflowType,
    workflowExecutor: (context: WorkflowContext) => Promise<void>
  ): Promise<WorkflowResult> {
    const workflowId = `${workflowType}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const sessionId = this.generateSessionId();
    const config = this.workflowConfigs.get(workflowType)!;

    const context: WorkflowContext = {
      workflowId,
      workflowType,
      startTime: new Date(),
      data: {},
      steps: [],
      status: "in_progress",
      sessionId,
    };

    this.activeWorkflows.set(workflowId, context);

    const startTime = Date.now();
    let result: WorkflowResult;

    try {
      // Show progress if enabled
      if (config.enableProgress) {
        await this.showProgress(
          workflowId,
          `${workflowType.replace(/_/g, " ")}`
        );
      }

      // Require confirmation for sensitive workflows
      if (config.requireConfirmation) {
        const confirmed = await this.requestConfirmation(workflowType);
        if (!confirmed) {
          context.status = "cancelled";
          throw new Error("Workflow cancelled by user");
        }
      }

      // Execute the workflow
      await this.executeWithTimeout(
        workflowExecutor(context),
        config.timeout,
        workflowId
      );

      const duration = Date.now() - startTime;
      const completedSteps = context.steps.filter(
        (s) => s.status === "completed"
      ).length;
      const totalSteps = context.steps.length;
      const errors = context.steps
        .filter((s) => s.status === "failed")
        .map((s) => s.error!);

      // Determine workflow status
      let status: "success" | "partial" | "failed" | "cancelled" = "success";
      if (context.status === "cancelled") {
        status = "cancelled";
      } else if (errors.length > 0) {
        status = completedSteps === 0 ? "failed" : "partial";
      }

      result = {
        workflowId,
        workflowType,
        status,
        duration,
        completedSteps,
        totalSteps,
        errors,
        data: context.data,
        metrics: {
          apiCalls: this.apiCallCount,
          cacheHits: this.cacheHitCount,
          performanceScore: this.calculatePerformanceScore(
            duration,
            completedSteps,
            totalSteps
          ),
        },
      };

      context.status =
        status === "success"
          ? "completed"
          : status === "partial"
          ? "completed"
          : status;

      // Track completion
      this.telemetryService.trackEvent("workflowCompleted", {
        workflowId,
        workflowType,
        status,
        duration: duration.toString(),
        completedSteps: completedSteps.toString(),
        totalSteps: totalSteps.toString(),
        performanceScore: result.metrics.performanceScore.toString(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const completedSteps = context.steps.filter(
        (s) => s.status === "completed"
      ).length;
      const totalSteps = context.steps.length;

      context.status = "failed";
      result = {
        workflowId,
        workflowType,
        status: "failed",
        duration,
        completedSteps,
        totalSteps,
        errors: [error instanceof Error ? error.message : String(error)],
        data: context.data,
        metrics: {
          apiCalls: this.apiCallCount,
          cacheHits: this.cacheHitCount,
          performanceScore: 0,
        },
      };

      await this.errorHandler.handleError(
        error instanceof Error ? error : String(error),
        ErrorCategory.INTERNAL,
        ErrorSeverity.HIGH,
        {
          showToUser: true,
          logToTelemetry: true,
          userActionRequired: false,
        },
        {
          workflowId,
          workflowType,
          duration: duration.toString(),
        }
      );

      this.telemetryService.trackEvent("workflowFailed", {
        workflowId,
        workflowType,
        duration: duration.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Clean up
      this.activeWorkflows.delete(workflowId);
      this.progressBars.get(workflowId)?.report({ increment: 100 });
      this.progressBars.delete(workflowId);
    }

    return result;
  }

  /**
   * Execute workflow steps
   */
  private async executeSteps(
    context: WorkflowContext,
    steps: Array<{
      id: string;
      name: string;
      description: string;
      required: boolean;
      execute: () => Promise<any>;
    }>
  ): Promise<void> {
    const config = this.workflowConfigs.get(context.workflowType)!;

    for (let i = 0; i < steps.length; i++) {
      const stepDef = steps[i];
      const step: WorkflowStep = {
        id: stepDef.id,
        name: stepDef.name,
        description: stepDef.description,
        required: stepDef.required,
        status: "pending",
      };

      context.steps.push(step);

      try {
        step.status = "in_progress";
        step.startTime = new Date();

        // Update progress
        this.updateProgress(
          context.workflowId,
          stepDef.name,
          (i / steps.length) * 100
        );

        // Execute with retries
        const result = await this.executeWithRetry(
          stepDef.execute,
          config.maxRetries,
          config.retryDelay,
          stepDef.id
        );

        step.status = "completed";
        step.endTime = new Date();
        step.duration = step.startTime
          ? step.endTime.getTime() - step.startTime.getTime()
          : 0;

        context.data[stepDef.id] = result;

        this.telemetryService.trackEvent("workflowStepCompleted", {
          workflowId: context.workflowId,
          workflowType: context.workflowType,
          stepId: stepDef.id,
          duration: step.duration.toString(),
          success: "true",
        });
      } catch (error) {
        step.status = "failed";
        step.endTime = new Date();
        step.duration = step.startTime
          ? step.endTime.getTime() - step.startTime.getTime()
          : 0;
        step.error = error instanceof Error ? error.message : String(error);

        this.telemetryService.trackEvent("workflowStepFailed", {
          workflowId: context.workflowId,
          workflowType: context.workflowType,
          stepId: stepDef.id,
          duration: step.duration.toString(),
          error: step.error,
        });

        if (stepDef.required) {
          throw error;
        }
      }
    }
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    retryDelay: number,
    operationId: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= maxRetries) {
          this.telemetryService.trackEvent("workflowRetry", {
            operationId,
            attempt: attempt.toString(),
            error: lastError.message,
          });

          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * attempt)
          );
        }
      }
    }

    throw lastError!;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    operation: Promise<T>,
    timeout: number,
    workflowId: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Workflow ${workflowId} timed out after ${timeout}ms`)
        );
      }, timeout);
    });

    return Promise.race([operation, timeoutPromise]);
  }

  /**
   * Show progress indicator
   */
  private async showProgress(workflowId: string, title: string): Promise<void> {
    const options: vscode.ProgressOptions = {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    };

    await vscode.window.withProgress(options, async (progress, token) => {
      this.progressBars.set(workflowId, progress);

      token.onCancellationRequested(() => {
        this.cancelWorkflow(workflowId);
      });
    });
  }

  /**
   * Update progress
   */
  private updateProgress(
    workflowId: string,
    message: string,
    increment: number
  ): void {
    const progress = this.progressBars.get(workflowId);
    if (progress) {
      progress.report({ message, increment });
    }
  }

  /**
   * Request user confirmation
   */
  private async requestConfirmation(
    workflowType: WorkflowType
  ): Promise<boolean> {
    const message = `Do you want to proceed with the ${workflowType.replace(
      /_/g,
      " "
    )} workflow?`;
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      "Yes",
      "No"
    );
    return result === "Yes";
  }

  /**
   * Calculate performance score
   */
  private calculatePerformanceScore(
    duration: number,
    completedSteps: number,
    totalSteps: number
  ): number {
    const efficiency = completedSteps / totalSteps;
    const speedScore = Math.max(0, 100 - duration / 1000); // Deduct points for slow execution
    return Math.round(((efficiency * speedScore) / 100) * 100);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize workflow configurations
   */
  private initializeWorkflowConfigs(): void {
    this.workflowConfigs.set("pull_request_review", {
      timeout: 30000, // 30 seconds
      maxRetries: 3,
      retryDelay: 1000,
      parallelSteps: true,
      enableProgress: true,
      requireConfirmation: false,
    });

    this.workflowConfigs.set("pull_request_creation", {
      timeout: 60000, // 60 seconds
      maxRetries: 2,
      retryDelay: 2000,
      parallelSteps: false,
      enableProgress: true,
      requireConfirmation: true,
    });

    this.workflowConfigs.set("comment_management", {
      timeout: 15000, // 15 seconds
      maxRetries: 3,
      retryDelay: 500,
      parallelSteps: false,
      enableProgress: false,
      requireConfirmation: false,
    });

    this.workflowConfigs.set("repository_sync", {
      timeout: 120000, // 2 minutes
      maxRetries: 2,
      retryDelay: 3000,
      parallelSteps: true,
      enableProgress: true,
      requireConfirmation: false,
    });

    this.workflowConfigs.set("bulk_operations", {
      timeout: 180000, // 3 minutes
      maxRetries: 1,
      retryDelay: 1000,
      parallelSteps: true,
      enableProgress: true,
      requireConfirmation: true,
    });
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for extension deactivation
    this.disposables.push({
      dispose: () => {
        // Cancel all active workflows
        const activeWorkflowIds = Array.from(this.activeWorkflows.keys());
        for (const workflowId of activeWorkflowIds) {
          this.cancelWorkflow(workflowId);
        }
      },
    });
  }
}
