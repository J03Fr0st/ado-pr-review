import * as vscode from 'vscode';
import { PullRequestTreeProvider } from './PullRequestTreeProvider';
import { PullRequestService } from '../services/PullRequestService';
import { ConfigurationService } from '../services/ConfigurationService';
import { StateManager } from '../services/StateManager';
import { TelemetryService } from '../services/TelemetryService';
import { ErrorHandler, ErrorCategory } from '../utils/ErrorHandler';
import { AzureDevOpsApiClient } from '../api/AzureDevOpsApiClient';

/**
 * Main extension entry point and controller
 */
export class ExtensionController implements vscode.Disposable {
    private readonly context: vscode.ExtensionContext;
    private readonly treeProvider: PullRequestTreeProvider;
    private readonly pullRequestService: PullRequestService;
    private readonly configurationService: ConfigurationService;
    private readonly stateManager: StateManager;
    private readonly telemetryService: TelemetryService;
    private readonly errorHandler: ErrorHandler;
    private readonly apiClient: AzureDevOpsApiClient;

    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, apiClient: AzureDevOpsApiClient) {
        this.context = context;
        this.apiClient = apiClient;
        this.configurationService = new ConfigurationService();
        this.stateManager = new StateManager(context);
        this.telemetryService = TelemetryService.getInstance('azure-devops-pr-reviewer', '1.0.0');
        this.errorHandler = ErrorHandler.getInstance(this.telemetryService);

        this.pullRequestService = new PullRequestService(
            this.apiClient,
            this.configurationService,
            context
        );

        this.treeProvider = new PullRequestTreeProvider(
            this.pullRequestService,
            this.stateManager,
            this.telemetryService
        );

        this.initialize();
    }

    /**
     * Initialize the extension
     */
    private async initialize(): Promise<void> {
        try {
            // Register tree view
            const treeView = vscode.window.createTreeView('azureDevOpsPRs', {
                treeDataProvider: this.treeProvider,
                showCollapseAll: true
            });

            this.disposables.push(treeView);

            // Register commands
            this.registerCommands();

            // Register event listeners
            this.registerEventListeners();

            // Start background sync if configured
            await this.startBackgroundSync();

            this.telemetryService.trackEvent('extensionActivated');
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Register all VS Code commands
     */
    private registerCommands(): void {
        // Configuration commands
        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.configure', () => {
                this.configureExtension();
            })
        );

        // Pull request commands
        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.refreshPullRequests', () => {
                this.refreshPullRequests();
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.approvePullRequest', (item) => {
                this.approvePullRequest(item);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.rejectPullRequest', (item) => {
                this.rejectPullRequest(item);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.abandonPullRequest', (item) => {
                this.abandonPullRequest(item);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.addComment', (item) => {
                this.addComment(item);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.openInBrowser', (item) => {
                this.openInBrowser(item);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('azureDevOps.openPullRequest', (item) => {
                this.openPullRequest(item);
            })
        );
    }

    /**
     * Register event listeners
     */
    private registerEventListeners(): void {
        // Configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('azureDevOps')) {
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
                prompt: 'Enter Azure DevOps organization URL',
                placeHolder: 'https://dev.azure.com/myorg',
                validateInput: (value) => {
                    if (!value) {
                        return 'Organization URL is required';
                    }
                    if (!value.match(/^https:\/\/(dev\.azure\.com\/[^/]+|[^/]+\.visualstudio\.com)\/?$/)) {
                        return 'Please enter a valid Azure DevOps organization URL';
                    }
                    return null;
                }
            });

            if (!organizationUrl) {
                return;
            }

            const projectName = await vscode.window.showInputBox({
                prompt: 'Enter Azure DevOps project name',
                placeHolder: 'My Project',
                validateInput: (value) => {
                    if (!value) {
                        return 'Project name is required';
                    }
                    return null;
                }
            });

            if (!projectName) {
                return;
            }

            // Save configuration
            const config = vscode.workspace.getConfiguration('azureDevOps');
            await config.update('organizationUrl', organizationUrl, vscode.ConfigurationTarget.Global);
            await config.update('project', projectName, vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage('Azure DevOps configuration saved successfully!');
            this.refreshPullRequests();
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Refresh pull requests
     */
    private async refreshPullRequests(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Refreshing pull requests...',
                cancellable: false
            }, async () => {
                await this.treeProvider.refresh();
            });
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Approve a pull request
     */
    private async approvePullRequest(item: any): Promise<void> {
        try {
            if (!item || !item.pullRequest) {
                vscode.window.showErrorMessage('No pull request selected');
                return;
            }

            const result = await this.pullRequestService.approvePullRequest(
                item.repository.id,
                item.pullRequest.pullRequestId
            );

            if (result.success) {
                vscode.window.showInformationMessage(`Pull request #${item.pullRequest.pullRequestId} approved successfully!`);
                this.treeProvider.refresh();
            } else {
                vscode.window.showErrorMessage(`Failed to approve pull request: ${result.error}`);
            }
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Reject a pull request
     */
    private async rejectPullRequest(item: any): Promise<void> {
        try {
            if (!item || !item.pullRequest) {
                vscode.window.showErrorMessage('No pull request selected');
                return;
            }

            const comment = await vscode.window.showInputBox({
                prompt: 'Enter rejection reason',
                placeHolder: 'Please address the following issues...',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Rejection reason is required';
                    }
                    return null;
                }
            });

            if (!comment) {
                return;
            }

            const result = await this.pullRequestService.rejectPullRequest(
                item.repository.id,
                item.pullRequest.pullRequestId,
                comment
            );

            if (result.success) {
                vscode.window.showInformationMessage(`Pull request #${item.pullRequest.pullRequestId} rejected with comment`);
                this.treeProvider.refresh();
            } else {
                vscode.window.showErrorMessage(`Failed to reject pull request: ${result.error}`);
            }
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Abandon a pull request
     */
    private async abandonPullRequest(item: any): Promise<void> {
        try {
            if (!item || !item.pullRequest) {
                vscode.window.showErrorMessage('No pull request selected');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to abandon pull request #${item.pullRequest.pullRequestId}?`,
                { modal: true },
                'Abandon', 'Cancel'
            );

            if (confirm !== 'Abandon') {
                return;
            }

            const result = await this.pullRequestService.abandonPullRequest(
                item.repository.id,
                item.pullRequest.pullRequestId
            );

            if (result.success) {
                vscode.window.showInformationMessage(`Pull request #${item.pullRequest.pullRequestId} abandoned successfully!`);
                this.treeProvider.refresh();
            } else {
                vscode.window.showErrorMessage(`Failed to abandon pull request: ${result.error}`);
            }
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Add a comment to a pull request
     */
    private async addComment(item: any): Promise<void> {
        try {
            if (!item || !item.pullRequest) {
                vscode.window.showErrorMessage('No pull request selected');
                return;
            }

            const comment = await vscode.window.showInputBox({
                prompt: 'Enter your comment',
                placeHolder: 'Add your review comment here...',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Comment cannot be empty';
                    }
                    return null;
                }
            });

            if (!comment) {
                return;
            }

            // This would open a webview for detailed comment handling
            vscode.commands.executeCommand('azureDevOps.openPullRequest', item);
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Open pull request in browser
     */
    private async openInBrowser(item: any): Promise<void> {
        try {
            if (!item || !item.pullRequest) {
                vscode.window.showErrorMessage('No pull request selected');
                return;
            }

            const url = item.pullRequest.webUrl;
            if (url) {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Open pull request detail view
     */
    private async openPullRequest(item: any): Promise<void> {
        try {
            if (!item || !item.pullRequest) {
                vscode.window.showErrorMessage('No pull request selected');
                return;
            }

            // This would open the PR detail webview
            vscode.window.showInformationMessage(`Opening pull request #${item.pullRequest.pullRequestId} detail view...`);
            // TODO: Implement PR detail webview
        } catch (error) {
            await this.errorHandler.handleError(error as Error, ErrorCategory.INTERNAL);
        }
    }

    /**
     * Handle configuration changes
     */
    private handleConfigurationChange(): void {
        this.refreshPullRequests();
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}