import * as vscode from 'vscode';
import { PullRequestService } from '../services/PullRequestService';
import { CommentService, CreateCommentOptions } from '../services/CommentService';
import { TelemetryService } from '../services/TelemetryService';
import { PullRequest, CommentThread, Comment, GitPullRequestIteration, PullRequestVote } from '../api/models';
import { ErrorHandler, ErrorCategory } from '../utils/ErrorHandler';

/**
 * WebView panel for pull request details
 */
export class PRDetailWebView implements vscode.Disposable {
    private readonly panel: vscode.WebviewPanel;
    private readonly pullRequestService: PullRequestService;
    private readonly commentService: CommentService;
    private readonly telemetryService: TelemetryService;
    private readonly errorHandler: ErrorHandler;
    private readonly pullRequest: PullRequest;
    private readonly repositoryId: string;

    private disposables: vscode.Disposable[] = [];

    constructor(
        pullRequest: PullRequest,
        repositoryId: string,
        pullRequestService: PullRequestService,
        commentService: CommentService,
        telemetryService: TelemetryService,
        extensionUri: vscode.Uri
    ) {
        this.pullRequest = pullRequest;
        this.repositoryId = repositoryId;
        this.pullRequestService = pullRequestService;
        this.commentService = commentService;
        this.telemetryService = telemetryService;
        this.errorHandler = ErrorHandler.getInstance(telemetryService);

        this.panel = vscode.window.createWebviewPanel(
            'prDetail',
            `PR #${pullRequest.pullRequestId}: ${pullRequest.title}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                enableCommandUris: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'out'),
                    vscode.Uri.joinPath(extensionUri, 'webview')
                ]
            }
        );

        this.panel.webview.html = this.getHtmlContent();
        this.setupEventListeners();
        this.loadPullRequestData();

        this.telemetryService.trackEvent('prDetailOpened', {
            pullRequestId: pullRequest.pullRequestId.toString(),
            repositoryId: repositoryId
        });
    }

    /**
     * Setup webview event listeners
     */
    private setupEventListeners(): void {
        this.panel.onDidDispose(() => {
            this.dispose();
        });

        this.panel.webview.onDidReceiveMessage(async (message) => {
            try {
                await this.handleWebviewMessage(message);
            } catch (error) {
                this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
            }
        });
    }

    /**
     * Handle messages from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'approve':
                await this.approvePullRequest();
                break;
            case 'reject':
                await this.rejectPullRequest(message.comment);
                break;
            case 'abandon':
                await this.abandonPullRequest();
                break;
            case 'addComment':
                await this.addComment(message.content, message.threadId);
                break;
            case 'refresh':
                await this.refreshData();
                break;
            case 'openInBrowser':
                await this.openInBrowser();
                break;
            case 'vote':
                await this.vote(message.vote as PullRequestVote);
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Load pull request data
     */
    private async loadPullRequestData(): Promise<void> {
        try {
            // Load pull request details
            const [comments, iterations] = await Promise.all([
                this.commentService.getCommentThreads(this.repositoryId, this.pullRequest.pullRequestId),
                this.pullRequestService.getPullRequestIterations(this.repositoryId, this.pullRequest.pullRequestId)
            ]);

            this.panel.webview.postMessage({
                type: 'dataLoaded',
                data: {
                    pullRequest: this.pullRequest,
                    comments,
                    iterations
                }
            });
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
            this.panel.webview.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : 'Failed to load data'
            });
        }
    }

    /**
     * Approve pull request
     */
    private async approvePullRequest(): Promise<void> {
        try {
            const result = await this.pullRequestService.approvePullRequest(
                this.repositoryId,
                this.pullRequest.pullRequestId
            );

            if (result.success) {
                this.panel.webview.postMessage({ type: 'approved' });
                this.refreshData();
            } else {
                this.panel.webview.postMessage({
                    type: 'error',
                    error: result.error || 'Failed to approve pull request'
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
        }
    }

    /**
     * Reject pull request
     */
    private async rejectPullRequest(comment: string): Promise<void> {
        try {
            const result = await this.pullRequestService.rejectPullRequest(
                this.repositoryId,
                this.pullRequest.pullRequestId,
                comment
            );

            if (result.success) {
                this.panel.webview.postMessage({ type: 'rejected' });
                this.refreshData();
            } else {
                this.panel.webview.postMessage({
                    type: 'error',
                    error: result.error || 'Failed to reject pull request'
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
        }
    }

    /**
     * Abandon pull request
     */
    private async abandonPullRequest(): Promise<void> {
        try {
            const result = await this.pullRequestService.abandonPullRequest(
                this.repositoryId,
                this.pullRequest.pullRequestId
            );

            if (result.success) {
                this.panel.webview.postMessage({ type: 'abandoned' });
                this.refreshData();
            } else {
                this.panel.webview.postMessage({
                    type: 'error',
                    error: result.error || 'Failed to abandon pull request'
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
        }
    }

    /**
     * Add comment
     */
    private async addComment(content: string, threadId?: number): Promise<void> {
        try {
            const options: CreateCommentOptions = {
                content,
                threadId
            };
            const result = await this.commentService.addComment(
                this.repositoryId,
                this.pullRequest.pullRequestId,
                options
            );

            if (result) {
                this.panel.webview.postMessage({ type: 'commentAdded' });
                this.refreshData();
            } else {
                this.panel.webview.postMessage({
                    type: 'error',
                    error: 'Failed to add comment'
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
        }
    }

    /**
     * Vote on pull request
     */
    private async vote(vote: PullRequestVote): Promise<void> {
        try {
            await this.pullRequestService.votePullRequest(
                this.repositoryId,
                this.pullRequest.pullRequestId,
                vote
            );
            this.refreshData();
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
        }
    }

    /**
     * Refresh pull request data
     */
    private async refreshData(): Promise<void> {
        await this.loadPullRequestData();
    }

    /**
     * Open pull request in browser
     */
    private async openInBrowser(): Promise<void> {
        try {
            if (this.pullRequest.webUrl) {
                vscode.env.openExternal(vscode.Uri.parse(this.pullRequest.webUrl));
            }
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : String(error), ErrorCategory.UI);
        }
    }

    /**
     * Get HTML content for webview
     */
    private getHtmlContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PR #${this.pullRequest.pullRequestId}: ${this.escapeHtml(this.pullRequest.title)}</title>
                <style>
                    ${this.getCss()}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>PR #${this.pullRequest.pullRequestId}: ${this.escapeHtml(this.pullRequest.title)}</h1>
                        <div class="meta">
                            <span class="author">${this.escapeHtml(this.pullRequest.createdBy.displayName)}</span>
                            <span class="date">${new Date(this.pullRequest.creationDate).toLocaleDateString()}</span>
                            <span class="status status-${this.pullRequest.status}">${this.pullRequest.status}</span>
                            ${this.pullRequest.isDraft ? '<span class="draft">Draft</span>' : ''}
                        </div>
                    </div>

                    <div class="actions">
                        <button class="btn btn-approve" onclick="postMessage({type: 'approve'})">
                            Approve
                        </button>
                        <button class="btn btn-reject" onclick="showRejectDialog()">
                            Reject
                        </button>
                        <button class="btn btn-abandon" onclick="showAbandonDialog()">
                            Abandon
                        </button>
                        <button class="btn btn-refresh" onclick="postMessage({type: 'refresh'})">
                            Refresh
                        </button>
                        <button class="btn btn-browser" onclick="postMessage({type: 'openInBrowser'})">
                            Open in Browser
                        </button>
                    </div>

                    <div class="content">
                        <div class="description">
                            <h2>Description</h2>
                            <div class="description-content">
                                ${this.formatDescription(this.pullRequest.description)}
                            </div>
                        </div>

                        <div class="section">
                            <h2>Comments</h2>
                            <div id="comments" class="loading">Loading comments...</div>
                        </div>

                        <div class="section">
                            <h2>Add Comment</h2>
                            <div class="add-comment">
                                <textarea id="commentText" placeholder="Add your comment..." rows="4"></textarea>
                                <button class="btn btn-primary" onclick="addComment()">Add Comment</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="rejectDialog" class="dialog">
                    <div class="dialog-content">
                        <h3>Reject Pull Request</h3>
                        <p>Please provide a reason for rejection:</p>
                        <textarea id="rejectReason" placeholder="Enter rejection reason..." rows="4"></textarea>
                        <div class="dialog-actions">
                            <button class="btn btn-cancel" onclick="closeRejectDialog()">Cancel</button>
                            <button class="btn btn-reject" onclick="rejectPullRequest()">Reject</button>
                        </div>
                    </div>
                </div>

                <div id="abandonDialog" class="dialog">
                    <div class="dialog-content">
                        <h3>Abandon Pull Request</h3>
                        <p>Are you sure you want to abandon this pull request?</p>
                        <div class="dialog-actions">
                            <button class="btn btn-cancel" onclick="closeAbandonDialog()">Cancel</button>
                            <button class="btn btn-abandon" onclick="abandonPullRequest()">Abandon</button>
                        </div>
                    </div>
                </div>

                <script>
                    ${this.getJavaScript()}
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Get CSS content
     */
    private getCss(): string {
        return `
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                line-height: 1.6;
            }

            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }

            .header {
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }

            .header h1 {
                font-size: 24px;
                margin-bottom: 10px;
                color: var(--vscode-foreground);
            }

            .meta {
                display: flex;
                gap: 15px;
                align-items: center;
                font-size: 14px;
                color: var(--vscode-descriptionForeground);
            }

            .status {
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }

            .status-active {
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
            }

            .status-completed {
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
            }

            .status-abandoned {
                background-color: var(--vscode-errorForeground);
                color: var(--vscode-errorBackground);
            }

            .draft {
                background-color: var(--vscode-warningBackground);
                color: var(--vscode-warningForeground);
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
            }

            .actions {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }

            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
            }

            .btn:hover {
                opacity: 0.8;
            }

            .btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .btn-primary {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .btn-approve {
                background-color: var(--vscode-debugIcon-startForeground);
                color: white;
            }

            .btn-reject {
                background-color: var(--vscode-errorForeground);
                color: white;
            }

            .btn-abandon {
                background-color: var(--vscode-warningForeground);
                color: white;
            }

            .btn-refresh {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .btn-browser {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }

            .content {
                display: grid;
                gap: 20px;
            }

            .section {
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                padding: 20px;
            }

            .section h2 {
                font-size: 18px;
                margin-bottom: 15px;
                color: var(--vscode-foreground);
            }

            .description-content {
                white-space: pre-wrap;
                line-height: 1.6;
            }

            .loading {
                text-align: center;
                padding: 20px;
                color: var(--vscode-descriptionForeground);
            }

            .add-comment {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .add-comment textarea {
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 10px;
                resize: vertical;
                font-family: inherit;
            }

            .add-comment textarea:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }

            .dialog {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.5);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }

            .dialog.active {
                display: flex;
            }

            .dialog-content {
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                padding: 20px;
                min-width: 400px;
                max-width: 600px;
            }

            .dialog h3 {
                margin-bottom: 15px;
                color: var(--vscode-foreground);
            }

            .dialog p {
                margin-bottom: 15px;
                color: var(--vscode-descriptionForeground);
            }

            .dialog-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 20px;
            }

            .btn-cancel {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }

            @media (max-width: 768px) {
                .container {
                    padding: 10px;
                }

                .actions {
                    flex-direction: column;
                }

                .btn {
                    width: 100%;
                }

                .dialog-content {
                    margin: 20px;
                    min-width: auto;
                }
            }
        `;
    }

    /**
     * Get JavaScript content
     */
    private getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();

            function postMessage(message) {
                vscode.postMessage(message);
            }

            function showRejectDialog() {
                document.getElementById('rejectDialog').classList.add('active');
            }

            function closeRejectDialog() {
                document.getElementById('rejectDialog').classList.remove('active');
            }

            function showAbandonDialog() {
                document.getElementById('abandonDialog').classList.add('active');
            }

            function closeAbandonDialog() {
                document.getElementById('abandonDialog').classList.remove('active');
            }

            function rejectPullRequest() {
                const reason = document.getElementById('rejectReason').value.trim();
                if (!reason) {
                    alert('Please provide a rejection reason');
                    return;
                }
                postMessage({ type: 'reject', comment: reason });
                closeRejectDialog();
            }

            function abandonPullRequest() {
                postMessage({ type: 'abandon' });
                closeAbandonDialog();
            }

            function addComment() {
                const content = document.getElementById('commentText').value.trim();
                if (!content) {
                    return;
                }
                postMessage({ type: 'addComment', content: content });
                document.getElementById('commentText').value = '';
            }

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'dataLoaded':
                        updatePullRequestData(message.data);
                        break;
                    case 'error':
                        showError(message.error);
                        break;
                    case 'approved':
                        showNotification('Pull request approved successfully');
                        break;
                    case 'rejected':
                        showNotification('Pull request rejected successfully');
                        break;
                    case 'abandoned':
                        showNotification('Pull request abandoned successfully');
                        break;
                    case 'commentAdded':
                        showNotification('Comment added successfully');
                        break;
                }
            });

            function updatePullRequestData(data) {
                // Update comments section
                const commentsDiv = document.getElementById('comments');
                if (data.comments && data.comments.length > 0) {
                    commentsDiv.innerHTML = data.comments.map(thread => renderCommentThread(thread)).join('');
                } else {
                    commentsDiv.innerHTML = '<div class="no-comments">No comments yet</div>';
                }
            }

            function renderCommentThread(thread) {
                return \`
                    <div class="comment-thread">
                        <div class="comment">
                            <div class="comment-header">
                                <span class="comment-author">\${escapeHtml(thread.comments[0].author.displayName)}</span>
                                <span class="comment-date">\${new Date(thread.comments[0].publishedDate).toLocaleDateString()}</span>
                            </div>
                            <div class="comment-content">\${escapeHtml(thread.comments[0].content)}</div>
                        </div>
                        \${thread.comments.slice(1).map(comment => \`
                            <div class="comment reply">
                                <div class="comment-header">
                                    <span class="comment-author">\${escapeHtml(comment.author.displayName)}</span>
                                    <span class="comment-date">\${new Date(comment.publishedDate).toLocaleDateString()}</span>
                                </div>
                                <div class="comment-content">\${escapeHtml(comment.content)}</div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }

            function showError(message) {
                alert('Error: ' + message);
            }

            function showNotification(message) {
                // Show temporary notification
                const notification = document.createElement('div');
                notification.className = 'notification';
                notification.textContent = message;
                notification.style.cssText = \`
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background-color: var(--vscode-notificationCenter-border);
                    color: var(--vscode-notificationCenter-foreground);
                    padding: 10px 20px;
                    border-radius: 4px;
                    z-index: 1001;
                \`;
                document.body.appendChild(notification);
                setTimeout(() => {
                    notification.remove();
                }, 3000);
            }

            function escapeHtml(text) {
                const map = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#039;'
                };
                return text.replace(/[&<>"']/g, m => map[m]);
            }

            // Initialize
            document.addEventListener('DOMContentLoaded', () => {
                // Request data load
                postMessage({ type: 'refresh' });
            });
        `;
    }

    /**
     * Format description with markdown-like syntax
     */
    private formatDescription(description: string): string {
        return description
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('<br>');
    }

    /**
     * Escape HTML content
     */
    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}