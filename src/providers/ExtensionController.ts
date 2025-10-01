import * as vscode from "vscode";
import { PullRequestTreeProvider } from "./PullRequestTreeProvider";
import { PullRequestService } from "../services/PullRequestService";
import { CommentService } from "../services/CommentService";
import { ConfigurationService } from "../services/ConfigurationService";
import { StateManager } from "../services/StateManager";
import { TelemetryService } from "../services/TelemetryService";
import { MonitoringService } from "../services/MonitoringService";
import { CacheManager } from "../services/CacheManager";
import { ErrorHandler, ErrorCategory } from "../utils/ErrorHandler";
import { AzureDevOpsApiClient } from "../api/AzureDevOpsApiClient";
import { IntegrationService } from "../services/IntegrationService";
import { WorkflowService, WorkflowResult } from "../services/WorkflowService";

/**
 * Main extension entry point and controller
 */
export class ExtensionController implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly treeProvider: PullRequestTreeProvider;
  private readonly pullRequestService: PullRequestService;
  private readonly commentService: CommentService;
  private readonly configurationService: ConfigurationService;
  private readonly stateManager: StateManager;
  private readonly telemetryService: TelemetryService;
  private readonly monitoringService: MonitoringService;
  private readonly cacheManager: CacheManager;
  private readonly errorHandler: ErrorHandler;
  private readonly apiClient: AzureDevOpsApiClient;
  private readonly integrationService: IntegrationService;
  private readonly workflowService: WorkflowService;

  private disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    apiClient: AzureDevOpsApiClient
  ) {
    this.context = context;
    this.apiClient = apiClient;
    this.configurationService = new ConfigurationService();
    this.stateManager = new StateManager(context);
    this.telemetryService = TelemetryService.getInstance(
      "azure-devops-pr-reviewer",
      "1.0.0"
    );
    this.monitoringService = MonitoringService.getInstance();
    this.cacheManager = new CacheManager(context);
    this.errorHandler = ErrorHandler.getInstance(this.telemetryService);

    this.pullRequestService = new PullRequestService(
      this.apiClient,
      this.configurationService,
      context
    );

    this.commentService = new CommentService(
      this.apiClient,
      this.configurationService,
      context
    );

    this.integrationService = new IntegrationService(
      this.pullRequestService,
      this.commentService,
      this.cacheManager,
      this.stateManager,
      this.telemetryService,
      this.monitoringService,
      this.apiClient
    );

    this.workflowService = new WorkflowService(
      this.integrationService,
      this.errorHandler,
      this.telemetryService,
      this.monitoringService,
      this.stateManager
    );

    this.treeProvider = new PullRequestTreeProvider(
      this.pullRequestService,
      this.stateManager,
      this.telemetryService,
      this.integrationService
    );

    this.initialize();
  }

  /**
   * Initialize the extension
   */
  private async initialize(): Promise<void> {
    try {
      // Initialize cache manager
      await this.cacheManager.initialize();

      // Register tree view
      const treeView = vscode.window.createTreeView("azureDevOpsPRs", {
        treeDataProvider: this.treeProvider,
        showCollapseAll: true,
      });

      this.disposables.push(treeView);

      // Load initial pull requests after cache is initialized
      await this.treeProvider.refresh();

      // Register commands
      this.registerCommands();

      // Register event listeners
      this.registerEventListeners();

      // Start background sync if configured
      await this.startBackgroundSync();

      this.telemetryService.trackEvent("extensionActivated");
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Register all VS Code commands
   */
  private registerCommands(): void {
    // Configuration commands
    this.disposables.push(
      vscode.commands.registerCommand("azureDevOps.configure", () => {
        this.configureExtension();
      })
    );

    // Pull request commands
    this.disposables.push(
      vscode.commands.registerCommand("azureDevOps.refreshPullRequests", () => {
        this.refreshPullRequests();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.approvePullRequest",
        (item) => {
          this.approvePullRequest(item);
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.rejectPullRequest",
        (item) => {
          this.rejectPullRequest(item);
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.abandonPullRequest",
        (item) => {
          this.abandonPullRequest(item);
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand("azureDevOps.addComment", (item) => {
        this.addComment(item);
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand("azureDevOps.openInBrowser", (item) => {
        this.openInBrowser(item);
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand("azureDevOps.openPullRequest", (item) => {
        this.openPullRequest(item);
      })
    );

    // Workflow commands
    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.startPullRequestReview",
        async (item) => {
          if (item && item.repositoryId && item.pullRequestId) {
            try {
              const result =
                await this.workflowService.executePullRequestReviewWorkflow(
                  item.repositoryId,
                  item.pullRequestId
                );
              this.showWorkflowResult(result);
            } catch (error) {
              await this.errorHandler.handleError(
                error instanceof Error ? error : String(error),
                ErrorCategory.INTERNAL
              );
            }
          }
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.createPullRequest",
        async () => {
          try {
            // Quick pick for branch selection
            const sourceBranch = await vscode.window.showInputBox({
              prompt: "Enter source branch name",
              placeHolder: "feature/new-feature",
            });
            if (!sourceBranch) return;

            const targetBranch = await vscode.window.showInputBox({
              prompt: "Enter target branch name",
              placeHolder: "main",
            });
            if (!targetBranch) return;

            const title = await vscode.window.showInputBox({
              prompt: "Enter pull request title",
              placeHolder: "Add new feature",
            });
            if (!title) return;

            const description = await vscode.window.showInputBox({
              prompt: "Enter pull request description (optional)",
              placeHolder: "Description of changes",
            });

            const result =
              await this.workflowService.executePullRequestCreationWorkflow(
                sourceBranch,
                targetBranch,
                title,
                description || ""
              );
            this.showWorkflowResult(result);
          } catch (error) {
            await this.errorHandler.handleError(
              error instanceof Error ? error : String(error),
              ErrorCategory.INTERNAL
            );
          }
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.syncRepositories",
        async () => {
          try {
            const result =
              await this.workflowService.executeRepositorySyncWorkflow();
            this.showWorkflowResult(result);
          } catch (error) {
            await this.errorHandler.handleError(
              error instanceof Error ? error : String(error),
              ErrorCategory.INTERNAL
            );
          }
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.showWorkflowStatus",
        async () => {
          const activeWorkflows = this.workflowService.getActiveWorkflows();
          if (activeWorkflows.length === 0) {
            vscode.window.showInformationMessage("No active workflows");
            return;
          }

          const workflowItems = activeWorkflows.map((wf) => ({
            label: `${wf.workflowType.replace(/_/g, " ")} (${wf.status})`,
            description: `Started: ${wf.startTime.toLocaleTimeString()}`,
            detail: `Steps: ${
              wf.steps.filter((s) => s.status === "completed").length
            }/${wf.steps.length}`,
            workflow: wf,
          }));

          const selected = await vscode.window.showQuickPick(workflowItems, {
            placeHolder: "Select a workflow to view details",
          });

          if (selected) {
            const details = [
              `Workflow: ${selected.workflow.workflowType}`,
              `Status: ${selected.workflow.status}`,
              `Duration: ${
                Date.now() - selected.workflow.startTime.getTime()
              }ms`,
              `Steps: ${selected.workflow.steps
                .map((s) => `${s.id}: ${s.status}`)
                .join(", ")}`,
            ].join("\n");

            vscode.window.showInformationMessage(details, { modal: true });
          }
        }
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "azureDevOps.cancelWorkflow",
        async () => {
          const activeWorkflows = this.workflowService.getActiveWorkflows();
          if (activeWorkflows.length === 0) {
            vscode.window.showInformationMessage(
              "No active workflows to cancel"
            );
            return;
          }

          const workflowItems = activeWorkflows.map((wf) => ({
            label: `${wf.workflowType.replace(/_/g, " ")} (${wf.status})`,
            description: `Started: ${wf.startTime.toLocaleTimeString()}`,
            workflowId: wf.workflowId,
          }));

          const selected = await vscode.window.showQuickPick(workflowItems, {
            placeHolder: "Select a workflow to cancel",
          });

          if (selected) {
            const cancelled = await this.workflowService.cancelWorkflow(
              selected.workflowId
            );
            if (cancelled) {
              vscode.window.showInformationMessage(
                "Workflow cancelled successfully"
              );
            } else {
              vscode.window.showErrorMessage("Failed to cancel workflow");
            }
          }
        }
      )
    );
  }

  /**
   * Register event listeners
   */
  private registerEventListeners(): void {
    // Configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("azureDevOps")) {
          this.handleConfigurationChange();
        }
      })
    );

    // Tree view selection changes
    this.disposables.push(
      this.treeProvider.onDidChangeTreeData(() => {
        this.treeProvider.refresh();
      })
    );
  }

  /**
   * Start background synchronization
   */
  private async startBackgroundSync(): Promise<void> {
    const config = this.configurationService.getConfiguration();
    if (config.refreshInterval > 0) {
      // Start background sync timer
      setInterval(() => {
        this.refreshPullRequests();
      }, config.refreshInterval * 1000);
    }
  }

  /**
   * Configure the extension
   */
  private async configureExtension(): Promise<void> {
    try {
      const organizationUrl = await vscode.window.showInputBox({
        prompt: "Enter Azure DevOps organization URL",
        placeHolder: "https://dev.azure.com/myorg",
        validateInput: (value) => {
          if (!value) {
            return "Organization URL is required";
          }
          if (
            !value.match(
              /^https:\/\/(dev\.azure\.com\/[^/]+|[^/]+\.visualstudio\.com)\/?$/
            )
          ) {
            return "Please enter a valid Azure DevOps organization URL";
          }
          return null;
        },
      });

      if (!organizationUrl) {
        return;
      }

      const projectName = await vscode.window.showInputBox({
        prompt: "Enter Azure DevOps project name",
        placeHolder: "My Project",
        validateInput: (value) => {
          if (!value) {
            return "Project name is required";
          }
          return null;
        },
      });

      if (!projectName) {
        return;
      }

      // Save configuration
      const config = vscode.workspace.getConfiguration("azureDevOps");
      await config.update(
        "organizationUrl",
        organizationUrl,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        "project",
        projectName,
        vscode.ConfigurationTarget.Global
      );

      vscode.window.showInformationMessage(
        "Azure DevOps configuration saved successfully!"
      );
      this.refreshPullRequests();
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Refresh pull requests
   */
  private async refreshPullRequests(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Refreshing pull requests...",
          cancellable: false,
        },
        async () => {
          await this.treeProvider.refresh();
        }
      );
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Approve a pull request
   */
  private async approvePullRequest(item: any): Promise<void> {
    try {
      if (!item || !item.pullRequest) {
        vscode.window.showErrorMessage("No pull request selected");
        return;
      }

      const result = await this.integrationService.approvePullRequest(
        item.repository.id,
        item.pullRequest.pullRequestId
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Pull request #${item.pullRequest.pullRequestId} approved successfully!`
        );
        this.treeProvider.refresh();
      } else {
        vscode.window.showErrorMessage(
          `Failed to approve pull request: ${result.error}`
        );
      }
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Reject a pull request
   */
  private async rejectPullRequest(item: any): Promise<void> {
    try {
      if (!item || !item.pullRequest) {
        vscode.window.showErrorMessage("No pull request selected");
        return;
      }

      const comment = await vscode.window.showInputBox({
        prompt: "Enter rejection reason",
        placeHolder: "Please address the following issues...",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Rejection reason is required";
          }
          return null;
        },
      });

      if (!comment) {
        return;
      }

      const result = await this.integrationService.rejectPullRequest(
        item.repository.id,
        item.pullRequest.pullRequestId,
        comment
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Pull request #${item.pullRequest.pullRequestId} rejected with comment`
        );
        this.treeProvider.refresh();
      } else {
        vscode.window.showErrorMessage(
          `Failed to reject pull request: ${result.error}`
        );
      }
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Abandon a pull request
   */
  private async abandonPullRequest(item: any): Promise<void> {
    try {
      if (!item || !item.pullRequest) {
        vscode.window.showErrorMessage("No pull request selected");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to abandon pull request #${item.pullRequest.pullRequestId}?`,
        { modal: true },
        "Abandon",
        "Cancel"
      );

      if (confirm !== "Abandon") {
        return;
      }

      const result = await this.pullRequestService.abandonPullRequest(
        item.repository.id,
        item.pullRequest.pullRequestId
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Pull request #${item.pullRequest.pullRequestId} abandoned successfully!`
        );
        this.treeProvider.refresh();
      } else {
        vscode.window.showErrorMessage(
          `Failed to abandon pull request: ${result.error}`
        );
      }
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Add a comment to a pull request
   */
  private async addComment(item: any): Promise<void> {
    try {
      if (!item || !item.pullRequest) {
        vscode.window.showErrorMessage("No pull request selected");
        return;
      }

      const comment = await vscode.window.showInputBox({
        prompt: "Enter your comment",
        placeHolder: "Add your review comment here...",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Comment cannot be empty";
          }
          return null;
        },
      });

      if (!comment) {
        return;
      }

      const result = await this.integrationService.addComment(
        item.repository.id,
        item.pullRequest.pullRequestId,
        comment
      );

      if (result.success) {
        vscode.window.showInformationMessage("Comment added successfully!");
        this.treeProvider.refresh();
      } else {
        vscode.window.showErrorMessage(
          `Failed to add comment: ${result.error}`
        );
      }
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Open pull request in browser
   */
  private async openInBrowser(item: any): Promise<void> {
    try {
      if (!item || !item.pullRequest) {
        vscode.window.showErrorMessage("No pull request selected");
        return;
      }

      const url = item.pullRequest.webUrl;
      if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Open pull request detail view
   */
  private async openPullRequest(item: any): Promise<void> {
    try {
      if (!item || !item.pullRequest) {
        vscode.window.showErrorMessage("No pull request selected");
        return;
      }

      // Use integration service to get PR details with performance optimization
      const prDetails = await this.integrationService.getPullRequestDetails(
        item.repository.id,
        item.pullRequest.pullRequestId
      );

      // Show progress while opening PR detail view
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Opening pull request #${item.pullRequest.pullRequestId}...`,
          cancellable: false,
        },
        async () => {
          // Create or show PR detail webview panel
          const panel = vscode.window.createWebviewPanel(
            "prDetail",
            `PR #${item.pullRequest.pullRequestId}: ${item.pullRequest.title}`,
            vscode.ViewColumn.Active,
            {
              enableScripts: true,
              localResourceRoots: [],
              retainContextWhenHidden: true,
            }
          );

          // Set webview content with PR details
          panel.webview.html = this.getPRDetailWebviewContent(prDetails);

          // Handle webview messages
          panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleWebviewMessage(message, item);
          });

          panel.onDidDispose(() => {
            // Clean up when webview is closed
          });
        }
      );
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        ErrorCategory.INTERNAL
      );
    }
  }

  /**
   * Generate webview content for PR details
   */
  private getPRDetailWebviewContent(prDetails: any): string {
    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PR Details</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { margin-bottom: 20px; }
                    .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .meta { color: #666; margin-bottom: 5px; }
                    .section { margin-bottom: 20px; }
                    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
                    .comment { border-left: 3px solid #007acc; padding-left: 10px; margin-bottom: 10px; }
                    .actions { margin-top: 20px; }
                    button { margin-right: 10px; padding: 5px 15px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">${prDetails.pullRequest.title}</div>
                    <div class="meta">Created by ${
                      prDetails.pullRequest.createdBy?.displayName || "Unknown"
                    }</div>
                    <div class="meta">Status: ${
                      prDetails.pullRequest.status
                    }</div>
                    <div class="meta">Files changed: ${
                      prDetails.fileCount
                    }</div>
                    <div class="meta">Comments: ${
                      prDetails.commentThreads.length
                    }</div>
                </div>

                <div class="section">
                    <div class="section-title">Description</div>
                    <div>${
                      prDetails.pullRequest.description ||
                      "No description provided"
                    }</div>
                </div>

                <div class="section">
                    <div class="section-title">Comments (${
                      prDetails.commentThreads.length
                    })</div>
                    ${prDetails.commentThreads
                      .map(
                        (thread: any) => `
                        <div class="comment">
                            <div class="meta">${
                              thread.comments?.[0]?.author?.displayName ||
                              "Unknown"
                            } - ${new Date(
                          thread.comments?.[0]?.publishedDate || Date.now()
                        ).toLocaleString()}</div>
                            <div>${thread.comments?.[0]?.content || ""}</div>
                        </div>
                    `
                      )
                      .join("")}
                </div>

                <div class="actions">
                    <button onclick="approvePR()">Approve</button>
                    <button onclick="rejectPR()">Reject</button>
                    <button onclick="addComment()">Add Comment</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function approvePR() {
                        vscode.postMessage({ command: 'approve' });
                    }

                    function rejectPR() {
                        vscode.postMessage({ command: 'reject' });
                    }

                    function addComment() {
                        vscode.postMessage({ command: 'comment' });
                    }
                </script>
            </body>
            </html>
        `;
  }

  /**
   * Handle messages from webview
   */
  private async handleWebviewMessage(message: any, item: any): Promise<void> {
    switch (message.command) {
      case "approve":
        await this.approvePullRequest(item);
        break;
      case "reject":
        await this.rejectPullRequest(item);
        break;
      case "comment":
        await this.addComment(item);
        break;
    }
  }

  /**
   * Handle configuration changes
   */
  private handleConfigurationChange(): void {
    this.refreshPullRequests();
  }

  /**
   * Display workflow execution results to the user
   */
  private async showWorkflowResult(result: WorkflowResult): Promise<void> {
    const isSuccess =
      result.status === "success" || result.status === "partial";

    if (isSuccess) {
      // Show success message with details
      const message = `Workflow ${
        result.status === "success" ? "completed" : "partially completed"
      } successfully`;
      const detail = this.formatWorkflowDetails(result);

      await vscode.window.showInformationMessage(message, {
        modal: true,
        detail: detail.length > 500 ? detail.substring(0, 500) + "..." : detail,
      });

      // If there are any errors from partial completion, show them
      if (result.status === "partial" && result.errors.length > 0) {
        const errorSummary = `Completed with ${
          result.errors.length
        } issue(s):\n${result.errors.slice(0, 3).join("\n")}${
          result.errors.length > 3 ? "\n..." : ""
        }`;
        await vscode.window.showWarningMessage(errorSummary);
      }
    } else {
      // Show error message
      const errorMessage = `Workflow ${result.status}`;
      const errorDetail =
        result.errors.length > 0
          ? result.errors.join("\n")
          : "No details available";

      const selectedAction = await vscode.window.showErrorMessage(
        errorMessage,
        {
          modal: true,
          detail:
            errorDetail.length > 500
              ? errorDetail.substring(0, 500) + "..."
              : errorDetail,
        },
        "View Details",
        "Retry",
        "Cancel"
      );

      if (selectedAction) {
        if (selectedAction === "View Details") {
          // Show detailed error information
          const detailMessage = this.formatWorkflowError(result);
          await vscode.window.showInformationMessage(detailMessage, {
            modal: true,
          });
        } else if (selectedAction === "Retry") {
          // Retry the workflow using the workflow service
          // Note: We'll need to implement retry capability in WorkflowService
          await vscode.window.showInformationMessage(
            "Retry functionality will be implemented in the workflow service."
          );
        }
      }
    }

    // Log workflow completion
    this.telemetryService?.trackEvent("workflow.completed", {
      workflowId: result.workflowId,
      workflowType: result.workflowType,
      status: result.status,
      duration: result.duration.toString(),
      completedSteps: result.completedSteps.toString(),
      totalSteps: result.totalSteps.toString(),
      errorCount: result.errors.length.toString(),
    });
  }

  /**
   * Format workflow details for display
   */
  private formatWorkflowDetails(result: WorkflowResult): string {
    const details: string[] = [];

    details.push(`Duration: ${result.duration}ms`);
    details.push(`Steps: ${result.completedSteps}/${result.totalSteps}`);

    if (result.metrics) {
      const metrics = result.metrics;
      details.push(`API calls: ${metrics.apiCalls}`);
      details.push(`Cache hits: ${metrics.cacheHits}`);
      details.push(`Performance score: ${metrics.performanceScore}`);

      if (metrics.apiCalls > 0) {
        const cacheRate = (
          (metrics.cacheHits / metrics.apiCalls) *
          100
        ).toFixed(1);
        details.push(`Cache hit rate: ${cacheRate}%`);
      }
    }

    if (result.data) {
      const data = result.data;
      if (data.pullRequest) {
        details.push(
          `PR: ${data.pullRequest.title || data.pullRequest.pullRequestId}`
        );
      }
      if (data.fileCount !== undefined) {
        details.push(`Files: ${data.fileCount}`);
      }
      if (data.commentThreads) {
        details.push(`Comments: ${data.commentThreads.length}`);
      }
      if (data.repositoryId) {
        details.push(`Repository: ${data.repositoryId}`);
      }
    }

    return details.join(", ");
  }

  /**
   * Format workflow error for display
   */
  private formatWorkflowError(result: WorkflowResult): string {
    const details: string[] = [];

    details.push(`Workflow ID: ${result.workflowId}`);
    details.push(`Type: ${result.workflowType}`);
    details.push(`Status: ${result.status}`);
    details.push(`Duration: ${result.duration}ms`);
    details.push(
      `Progress: ${result.completedSteps}/${result.totalSteps} steps`
    );

    if (result.errors.length > 0) {
      details.push("Errors:");
      result.errors.forEach((error, index) => {
        details.push(`  ${index + 1}. ${error}`);
      });
    }

    if (result.data) {
      const data = result.data;
      if (data.repositoryId) {
        details.push(`Repository: ${data.repositoryId}`);
      }
      if (data.pullRequestId !== undefined) {
        details.push(`Pull Request: ${data.pullRequestId}`);
      }
    }

    if (result.metrics) {
      const metrics = result.metrics;
      details.push(`API calls made: ${metrics.apiCalls}`);
      details.push(`Cache hits: ${metrics.cacheHits}`);
      details.push(`Performance score: ${metrics.performanceScore}`);
    }

    return details.join("\n");
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];

    // Dispose services
    this.integrationService.dispose();
    this.workflowService?.dispose();
    this.monitoringService.dispose();
    this.cacheManager.dispose();
  }
}
