import * as vscode from "vscode";
import { PullRequestService } from "../services/PullRequestService";
import { StateManager } from "../services/StateManager";
import { TelemetryService } from "../services/TelemetryService";
import { IntegrationService } from "../services/IntegrationService";
import { PullRequest, GitRepository } from "../api/models";

/**
 * Tree item types
 */
enum TreeItemType {
  REPOSITORY = "repository",
  PULL_REQUEST = "pullRequest",
  LOADING = "loading",
  ERROR = "error",
  NO_PULL_REQUESTS = "noPullRequests",
}

/**
 * Base tree item class
 */
abstract class BaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly type: TreeItemType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
  }

  abstract getContextValue(): string;
}

/**
 * Repository tree item
 */
class RepositoryTreeItem extends BaseTreeItem {
  constructor(
    public readonly repository: GitRepository,
    public readonly pullRequests: PullRequest[]
  ) {
    super(
      `repository-${repository.id}`,
      TreeItemType.REPOSITORY,
      repository.name,
      pullRequests.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.description = `${pullRequests.length} pull request${
      pullRequests.length !== 1 ? "s" : ""
    }`;
    this.iconPath = new vscode.ThemeIcon("repo");
    this.contextValue = "repository";
  }

  getContextValue(): string {
    return "repository";
  }
}

/**
 * Pull request tree item
 */
class PullRequestTreeItem extends BaseTreeItem {
  constructor(
    public readonly repository: GitRepository,
    public readonly pullRequest: PullRequest
  ) {
    super(
      `pr-${pullRequest.pullRequestId}`,
      TreeItemType.PULL_REQUEST,
      `#${pullRequest.pullRequestId}: ${pullRequest.title}`,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = this.getPullRequestDescription();
    this.tooltip = this.getPullRequestTooltip();
    this.iconPath = this.getPullRequestIcon();
    this.contextValue = "pullRequest";
    this.command = {
      command: "azureDevOps.openPullRequest",
      title: "Open Pull Request",
      arguments: [this],
    };
  }

  private getPullRequestDescription(): string {
    const author = this.pullRequest.createdBy.displayName;
    const created = new Date(
      this.pullRequest.creationDate
    ).toLocaleDateString();
    return `${author} • ${created}`;
  }

  private getPullRequestTooltip(): string {
    const status = this.pullRequest.status;
    const mergeStatus = this.pullRequest.mergeStatus;
    const draft = this.pullRequest.isDraft ? " (Draft)" : "";

    return `Status: ${status}${draft}\nMerge Status: ${mergeStatus}\nCreated: ${new Date(
      this.pullRequest.creationDate
    ).toLocaleString()}`;
  }

  private getPullRequestIcon(): vscode.ThemeIcon {
    if (this.pullRequest.isDraft) {
      return new vscode.ThemeIcon("git-pull-request-draft");
    }

    switch (this.pullRequest.status) {
      case "active":
        return new vscode.ThemeIcon("git-pull-request");
      case "completed":
        return new vscode.ThemeIcon("check");
      case "abandoned":
        return new vscode.ThemeIcon("close");
      default:
        return new vscode.ThemeIcon("question");
    }
  }

  getContextValue(): string {
    return "pullRequest";
  }
}

/**
 * Loading tree item
 */
class LoadingTreeItem extends BaseTreeItem {
  constructor() {
    super(
      "loading",
      TreeItemType.LOADING,
      "Loading...",
      vscode.TreeItemCollapsibleState.None
    );
    this.iconPath = new vscode.ThemeIcon("loading~spin");
  }

  getContextValue(): string {
    return "loading";
  }
}

/**
 * Error tree item
 */
class ErrorTreeItem extends BaseTreeItem {
  constructor(private readonly errorMessage: string) {
    super(
      "error",
      TreeItemType.ERROR,
      "Error loading pull requests",
      vscode.TreeItemCollapsibleState.None
    );
    this.iconPath = new vscode.ThemeIcon("error");
  }

  getContextValue(): string {
    return "error";
  }
}

/**
 * No pull requests tree item
 */
class NoPullRequestsTreeItem extends BaseTreeItem {
  constructor() {
    super(
      "no-prs",
      TreeItemType.NO_PULL_REQUESTS,
      "No pull requests found",
      vscode.TreeItemCollapsibleState.None
    );
    this.iconPath = new vscode.ThemeIcon("info");
  }

  getContextValue(): string {
    return "noPullRequests";
  }
}

/**
 * Pull request tree data provider
 */
export class PullRequestTreeProvider
  implements vscode.TreeDataProvider<BaseTreeItem>
{
  private readonly _onDidChangeTreeData: vscode.EventEmitter<
    BaseTreeItem | undefined | null | void
  > = new vscode.EventEmitter<BaseTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    BaseTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private treeItems: BaseTreeItem[] = [];
  private isLoading = false;

  constructor(
    private readonly pullRequestService: PullRequestService,
    private readonly stateManager: StateManager,
    private readonly telemetryService: TelemetryService,
    private readonly integrationService?: IntegrationService
  ) {
    // Don't load pull requests in constructor - will be initialized by ExtensionController
  }

  /**
   * Get tree item for the given element
   */
  getTreeItem(element: BaseTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for the given element
   */
  async getChildren(element?: BaseTreeItem): Promise<BaseTreeItem[]> {
    if (!element) {
      return this.treeItems;
    }

    if (element instanceof RepositoryTreeItem) {
      return element.pullRequests.map(
        (pr) => new PullRequestTreeItem(element.repository, pr)
      );
    }

    return [];
  }

  /**
   * Get parent of the given element
   */
  getParent(element: BaseTreeItem): vscode.ProviderResult<BaseTreeItem> {
    if (element instanceof PullRequestTreeItem) {
      return this.treeItems.find(
        (item) =>
          item instanceof RepositoryTreeItem &&
          item.repository.id === element.repository.id
      );
    }
    return null;
  }

  /**
   * Refresh tree data
   */
  async refresh(): Promise<void> {
    try {
      this.isLoading = true;
      this._onDidChangeTreeData.fire();
      await this.loadPullRequests();
    } catch (error) {
      this.handleError(error, "PullRequestTreeProvider.refresh");
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load pull requests from service
   */
  private async loadPullRequests(): Promise<void> {
    try {
      this.treeItems = [new LoadingTreeItem()];

      const startTime = Date.now();
      let pullRequests: PullRequest[] = [];

      // Use IntegrationService if available for better performance and error recovery
      if (this.integrationService) {
        const repositoryPRs = await this.integrationService.getPullRequests();
        pullRequests = repositoryPRs.flatMap((repo) => repo.pullRequests);
      } else {
        // Fallback to direct service usage
        pullRequests = await this.pullRequestService.getPullRequests();
      }

      const loadTime = Date.now() - startTime;

      this.telemetryService.trackEvent("pullRequestsLoaded", {
        count: pullRequests.length.toString(),
        loadTime: loadTime.toString(),
        usedIntegration: this.integrationService ? "true" : "false",
      });

      if (pullRequests.length === 0) {
        this.treeItems = [new NoPullRequestsTreeItem()];
        return;
      }

      // Group pull requests by repository
      const repositoryMap = new Map<
        string,
        { repository: GitRepository; pullRequests: PullRequest[] }
      >();

      pullRequests.forEach((pr) => {
        if (!pr.repository) {
          return;
        }

        if (!repositoryMap.has(pr.repository.id)) {
          repositoryMap.set(pr.repository.id, {
            repository: pr.repository,
            pullRequests: [],
          });
        }

        repositoryMap.get(pr.repository.id)!.pullRequests.push(pr);
      });

      // Create tree items
      this.treeItems = Array.from(repositoryMap.values()).map(
        ({ repository, pullRequests }) => {
          // Sort pull requests by creation date (newest first)
          pullRequests.sort(
            (a, b) =>
              new Date(b.creationDate).getTime() -
              new Date(a.creationDate).getTime()
          );

          return new RepositoryTreeItem(repository, pullRequests);
        }
      );
    } catch (error) {
      this.handleError(error, "PullRequestTreeProvider.loadPullRequests");
      this.treeItems = [
        new ErrorTreeItem(
          error instanceof Error ? error.message : "Unknown error"
        ),
      ];
    } finally {
      this._onDidChangeTreeData.fire();
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: unknown, operation: string): void {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    this.telemetryService.trackError(operation, error as Error);
    console.error(`Error in ${operation}:`, errorMessage);
  }

  /**
   * Get pull request by ID
   */
  getPullRequestById(pullRequestId: number): PullRequest | undefined {
    for (const item of this.treeItems) {
      if (item instanceof RepositoryTreeItem) {
        const pr = item.pullRequests.find(
          (p) => p.pullRequestId === pullRequestId
        );
        if (pr) {
          return pr;
        }
      }
    }
    return undefined;
  }

  /**
   * Get all active pull requests
   */
  getActivePullRequests(): PullRequest[] {
    const activePRs: PullRequest[] = [];
    for (const item of this.treeItems) {
      if (item instanceof RepositoryTreeItem) {
        activePRs.push(
          ...item.pullRequests.filter((pr) => pr.status === "active")
        );
      }
    }
    return activePRs;
  }

  /**
   * Check if tree is currently loading
   */
  get isTreeLoading(): boolean {
    return this.isLoading;
  }
}
