import * as vscode from "vscode";
import { ExtensionController } from "./providers/ExtensionController";
import { PRDetailWebView } from "./webview/PRDetailWebView";
import { PullRequestService } from "./services/PullRequestService";
import { CommentService } from "./services/CommentService";
import { ConfigurationService } from "./services/ConfigurationService";
import { AuthenticationService } from "./services/AuthenticationService";
import { TelemetryService } from "./services/TelemetryService";
import { AzureDevOpsApiClient } from "./api/AzureDevOpsApiClient";
import { LoadTestCommands } from "./commands/LoadTestCommands";

/**
 * Extension activation entry point
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    console.log("Azure DevOps PR Reviewer extension is being activated...");

    // Initialize services
    const configurationService = new ConfigurationService();
    const authenticationService = new AuthenticationService(
      context,
      context.secrets
    );
    const telemetryService = TelemetryService.getInstance(
      "azure-devops-pr-reviewer",
      "1.0.0"
    );
    const apiClient = new AzureDevOpsApiClient(
      authenticationService,
      configurationService,
      context
    );
    const pullRequestService = new PullRequestService(
      apiClient,
      configurationService,
      context
    );
    const commentService = new CommentService(
      apiClient,
      configurationService,
      context
    );

    // Set authentication service on pull request service
    (pullRequestService as any).setAuthService(authenticationService);

    // Initialize extension controller
    const extensionController = new ExtensionController(context, apiClient);

    // Initialize load testing commands
    const loadTestCommands = new LoadTestCommands(context);

    // Register webview command
    const disposable = vscode.commands.registerCommand(
      "azureDevOps.openPullRequest",
      async (item) => {
        try {
          if (!item || !item.pullRequest) {
            vscode.window.showErrorMessage("No pull request selected");
            return;
          }

          const webView = new PRDetailWebView(
            item.pullRequest,
            item.repository.id,
            pullRequestService,
            commentService,
            telemetryService,
            context.extensionUri
          );

          context.subscriptions.push(webView);
        } catch (error) {
          vscode.window.showErrorMessage("Failed to open pull request details");
          console.error("Error opening pull request details:", error);
        }
      }
    );

    context.subscriptions.push(extensionController, loadTestCommands, disposable);

    // Track activation event
    telemetryService.trackEvent("extensionActivated");

    console.log("Azure DevOps PR Reviewer extension activated successfully");
  } catch (error) {
    console.error(
      "Error activating Azure DevOps PR Reviewer extension:",
      error
    );
    vscode.window.showErrorMessage(
      "Failed to activate Azure DevOps PR Reviewer extension"
    );
    throw error;
  }
}

/**
 * Extension deactivation entry point
 */
export function deactivate(): void {
  console.log("Azure DevOps PR Reviewer extension is being deactivated...");
}
