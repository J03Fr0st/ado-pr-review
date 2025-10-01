import * as vscode from "vscode";
import { ExtensionController } from "./providers/ExtensionController";
import { PRDetailWebView } from "./webview/PRDetailWebView";
import { PullRequestService } from "./services/PullRequestService";
import { CommentService } from "./services/CommentService";
import { ConfigurationService } from "./services/ConfigurationService";
import { AuthenticationService } from "./services/AuthenticationService";
import { TelemetryService } from "./services/TelemetryService";
import { MonitoringService } from "./services/MonitoringService";
import { AzureDevOpsApiClient } from "./api/AzureDevOpsApiClient";
// import { LoadTestCommands } from "./commands/LoadTestCommands";

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

    // Initialize monitoring service with dependencies
    const monitoringService = MonitoringService.getInstance(context, apiClient, configurationService, authenticationService);

    // Initialize extension controller (handles all command registration)
    const extensionController = new ExtensionController(context, apiClient);

    // Initialize load testing commands (temporarily disabled during TS5 migration)
    // const loadTestCommands = new LoadTestCommands(context);

    context.subscriptions.push(extensionController, monitoringService);

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

  try {
    // Dispose monitoring service
    const monitoringService = MonitoringService.getInstance();
    monitoringService.dispose();
  } catch (error) {
    console.error(
      "Error deactivating Azure DevOps PR Reviewer extension:",
      error
    );
  }
}
