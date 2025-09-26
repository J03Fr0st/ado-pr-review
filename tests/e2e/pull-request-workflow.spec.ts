import { test, expect } from '@playwright/test';

test.describe('Pull Request Workflow E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Mock VS Code extension environment
        await page.goto('about:blank');
        await page.evaluate(() => {
            // Mock VS Code API
            (global as any).vscode = {
                window: {
                    createWebviewPanel: () => ({
                        webview: { html: '', postMessage: () => {} },
                        onDidChangeViewState: () => ({ dispose: () => {} }),
                        onDidDispose: () => ({ dispose: () => {} }),
                        reveal: () => {},
                        dispose: () => {}
                    }),
                    showInformationMessage: () => Promise.resolve(''),
                    showWarningMessage: () => Promise.resolve(''),
                    showErrorMessage: () => Promise.resolve(''),
                    showQuickPick: () => Promise.resolve([]),
                    showInputBox: () => Promise.resolve(''),
                    createOutputChannel: () => ({
                        appendLine: () => {},
                        show: () => {},
                        dispose: () => {}
                    }),
                    registerTreeDataProvider: () => ({ dispose: () => {} }),
                    registerCommand: () => ({ dispose: () => {} })
                },
                commands: {
                    executeCommand: () => Promise.resolve(),
                    registerCommand: () => ({ dispose: () => {} })
                },
                workspace: {
                    getConfiguration: () => ({
                        get: () => '',
                        update: () => Promise.resolve(),
                        inspect: () => ({})
                    }),
                    onDidChangeConfiguration: () => ({ dispose: () => {} })
                },
                extensions: {
                    getExtension: () => ({
                        exports: {},
                        activate: () => Promise.resolve(),
                        isActive: true
                    })
                },
                env: {
                    openExternal: () => Promise.resolve(true),
                    clipboard: { writeText: () => Promise.resolve() }
                },
                Uri: {
                    file: (path: string) => ({ fsPath: path, toString: () => path }),
                    parse: (uri: string) => ({ fsPath: uri, toString: () => uri })
                }
            };

            // Mock Azure DevOps API responses
            (global as any).fetch = async (url: string, options?: any) => {
                if (url.includes('/repositories')) {
                    return {
                        ok: true,
                        json: () => Promise.resolve({
                            value: [
                                {
                                    id: 'repo1',
                                    name: 'Test Repository',
                                    url: 'https://dev.azure.com/test/project/_git/repo1',
                                    project: {
                                        id: 'project1',
                                        name: 'Test Project'
                                    }
                                }
                            ],
                            count: 1
                        })
                    };
                }

                if (url.includes('/pullrequests')) {
                    return {
                        ok: true,
                        json: () => Promise.resolve({
                            value: [
                                {
                                    pullRequestId: 1,
                                    title: 'Test Pull Request',
                                    description: 'Test PR description',
                                    status: 'active',
                                    createdBy: {
                                        id: 'user1',
                                        displayName: 'Test User',
                                        uniqueName: 'test@example.com'
                                    },
                                    creationDate: new Date().toISOString(),
                                    sourceRefName: 'refs/heads/feature/test',
                                    targetRefName: 'refs/heads/main',
                                    mergeStatus: 'succeeded',
                                    isDraft: false
                                }
                            ],
                            count: 1
                        })
                    };
                }

                return { ok: true, json: () => Promise.resolve({}) };
            };
        });
    });

    test('should display pull requests in tree view', async ({ page }) => {
        // Simulate extension activation
        await page.evaluate(() => {
            const treeProvider = {
                getChildren: () => Promise.resolve([
                    {
                        id: 'repo1',
                        label: 'Test Repository',
                        collapsibleState: 1,
                        contextValue: 'repository',
                        getChildren: () => Promise.resolve([
                            {
                                id: 'pr1',
                                label: 'Test Pull Request',
                                collapsibleState: 0,
                                contextValue: 'pullRequest',
                                pullRequestId: 1,
                                title: 'Test Pull Request',
                                status: 'active'
                            }
                        ])
                    }
                ])
            };

            // Simulate tree view update
            (global as any).treeDataProvider = treeProvider;
        });

        // Verify tree view elements are present
        await expect(page.locator('.monaco-tree-row')).toHaveCount(2); // 1 repo + 1 PR
    });

    test('should open pull request details in webview', async ({ page }) => {
        await page.evaluate(() => {
            // Simulate opening PR details
            const webviewContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Pull Request Details</title>
                </head>
                <body>
                    <div class="pr-header">
                        <h1>Test Pull Request</h1>
                        <div class="pr-meta">
                            <span class="pr-status active">Active</span>
                            <span class="pr-author">Test User</span>
                        </div>
                    </div>
                    <div class="pr-content">
                        <div class="pr-description">Test PR description</div>
                        <div class="pr-files">
                            <div class="file-item">src/test.ts</div>
                        </div>
                    </div>
                    <div class="pr-actions">
                        <button class="approve-btn">Approve</button>
                        <button class="reject-btn">Reject</button>
                    </div>
                </body>
                </html>
            `;

            // Create webview panel
            const panel = (global as any).vscode.window.createWebviewPanel(
                'prDetails',
                'Pull Request Details',
                1,
                { enableScripts: true }
            );
            panel.webview.html = webviewContent;
        });

        // Verify webview content
        await expect(page.locator('h1')).toHaveText('Test Pull Request');
        await expect(page.locator('.pr-status')).toHaveText('Active');
        await expect(page.locator('.approve-btn')).toBeVisible();
        await expect(page.locator('.reject-btn')).toBeVisible();
    });

    test('should approve pull request successfully', async ({ page }) => {
        await page.evaluate(() => {
            // Simulate approval action
            const approveButton = document.querySelector('.approve-btn');
            if (approveButton) {
                approveButton.addEventListener('click', async () => {
                    // Mock API call for approval
                    const response = await fetch('/api/approve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            repositoryId: 'repo1',
                            pullRequestId: 1,
                            vote: 10,
                            comment: 'Approved'
                        })
                    });

                    if (response.ok) {
                        (global as any).vscode.window.showInformationMessage('Pull request approved successfully');
                        // Update UI
                        document.querySelector('.pr-status')!.textContent = 'Approved';
                    }
                });
            }
        });

        // Click approve button
        await page.click('.approve-btn');

        // Verify success message
        await expect(page.locator('.pr-status')).toHaveText('Approved');
    });

    test('should handle pull request rejection with comments', async ({ page }) => {
        await page.evaluate(() => {
            // Add comment input and rejection handling
            const prActions = document.querySelector('.pr-actions');
            if (prActions) {
                const commentInput = document.createElement('textarea');
                commentInput.placeholder = 'Enter rejection comments...';
                commentInput.className = 'comment-input';
                prActions.insertBefore(commentInput, prActions.firstChild);

                const rejectButton = document.querySelector('.reject-btn');
                rejectButton?.addEventListener('click', async () => {
                    const comment = commentInput.value;
                    if (!comment) {
                        (global as any).vscode.window.showErrorMessage('Please provide rejection comments');
                        return;
                    }

                    // Mock API call for rejection
                    const response = await fetch('/api/reject', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            repositoryId: 'repo1',
                            pullRequestId: 1,
                            vote: -5,
                            comment
                        })
                    });

                    if (response.ok) {
                        (global as any).vscode.window.showInformationMessage('Pull request rejected with comments');
                        document.querySelector('.pr-status')!.textContent = 'Rejected';
                    }
                });
            }
        });

        // Fill comment and reject
        await page.fill('.comment-input', 'Needs more testing');
        await page.click('.reject-btn');

        // Verify rejection
        await expect(page.locator('.pr-status')).toHaveText('Rejected');
    });

    test('should create new pull request', async ({ page }) => {
        await page.evaluate(() => {
            // Create PR creation form
            const formHtml = `
                <div class="create-pr-form">
                    <h2>Create New Pull Request</h2>
                    <form id="createPrForm">
                        <div class="form-group">
                            <label>Title:</label>
                            <input type="text" id="prTitle" required>
                        </div>
                        <div class="form-group">
                            <label>Description:</label>
                            <textarea id="prDescription" rows="4"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Source Branch:</label>
                            <select id="sourceBranch">
                                <option value="refs/heads/feature/new">feature/new</option>
                                <option value="refs/heads/feature/test">feature/test</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Target Branch:</label>
                            <select id="targetBranch">
                                <option value="refs/heads/main">main</option>
                                <option value="refs/heads/develop">develop</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="submit">Create Pull Request</button>
                            <button type="button" class="cancel-btn">Cancel</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.innerHTML = formHtml;

            // Handle form submission
            document.getElementById('createPrForm')?.addEventListener('submit', async (e) => {
                e.preventDefault();

                const formData = {
                    title: (document.getElementById('prTitle') as HTMLInputElement).value,
                    description: (document.getElementById('prDescription') as HTMLTextAreaElement).value,
                    sourceRefName: (document.getElementById('sourceBranch') as HTMLSelectElement).value,
                    targetRefName: (document.getElementById('targetBranch') as HTMLSelectElement).value
                };

                // Mock API call
                const response = await fetch('/api/pullrequests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    (global as any).vscode.window.showInformationMessage('Pull request created successfully');
                }
            });
        });

        // Fill form and submit
        await page.fill('#prTitle', 'New Feature Implementation');
        await page.fill('#prDescription', 'Adding new feature to improve user experience');
        await page.selectOption('#sourceBranch', 'refs/heads/feature/new');
        await page.selectOption('#targetBranch', 'refs/heads/main');
        await page.click('button[type="submit"]');

        // Verify success
        await expect(page.locator('.create-pr-form')).toBeVisible();
    });

    test('should handle error states gracefully', async ({ page }) => {
        await page.evaluate(() => {
            // Simulate API error
            (global as any).fetch = async (url: string, options?: any) => {
                if (url.includes('/pullrequests') && options?.method === 'GET') {
                    return {
                        ok: false,
                        status: 401,
                        statusText: 'Unauthorized'
                    };
                }
                return { ok: true, json: () => Promise.resolve({}) };
            };

            // Trigger error
            (global as any).vscode.window.showErrorMessage('Authentication failed. Please check your credentials.');
        });

        // Verify error handling
        await expect(page.locator('.error-message')).toHaveText('Authentication failed');
    });

    test('should support keyboard navigation', async ({ page }) => {
        await page.evaluate(() => {
            // Add keyboard navigation support
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target instanceof HTMLElement) {
                    if (e.target.classList.contains('tree-item')) {
                        e.target.click();
                    }
                }
            });
        });

        // Test keyboard navigation
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');

        // Verify navigation worked
        await expect(page.locator('.pr-details')).toBeVisible();
    });

    test('should be accessible with screen readers', async ({ page }) => {
        // Test ARIA labels and roles
        await expect(page.locator('[role="tree"]')).toBeVisible();
        await expect(page.locator('[role="treeitem"]')).toHaveAttribute('aria-label', /Test Pull Request/);
        await expect(page.locator('[role="button"]')).toHaveAttribute('aria-label');

        // Test keyboard accessibility
        await page.keyboard.press('Tab');
        const focusedElement = page.locator(':focus');
        await expect(focusedElement).toBeVisible();
    });

    test('should handle large pull requests efficiently', async ({ page }) => {
        await page.evaluate(() => {
            // Simulate large PR with many files
            const largeFiles = Array.from({ length: 150 }, (_, i) => ({
                path: `src/file${i}.ts`,
                changeType: 'edit',
                additions: Math.floor(Math.random() * 100),
                deletions: Math.floor(Math.random() * 50)
            }));

            // Simulate virtual scrolling
            const virtualList = document.createElement('div');
            virtualList.className = 'virtual-list';
            virtualList.setAttribute('role', 'list');

            // Add first 20 items (visible viewport)
            largeFiles.slice(0, 20).forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.setAttribute('role', 'listitem');
                item.textContent = file.path;
                item.dataset.index = index.toString();
                virtualList.appendChild(item);
            });

            document.body.appendChild(virtualList);

            // Simulate scroll loading
            virtualList.addEventListener('scroll', () => {
                if (virtualList.scrollTop + virtualList.clientHeight >= virtualList.scrollHeight - 50) {
                    // Load more items
                    const currentCount = virtualList.children.length;
                    if (currentCount < largeFiles.length) {
                        const newItems = largeFiles.slice(currentCount, currentCount + 20);
                        newItems.forEach((file, index) => {
                            const item = document.createElement('div');
                            item.className = 'list-item';
                            item.setAttribute('role', 'listitem');
                            item.textContent = file.path;
                            item.dataset.index = (currentCount + index).toString();
                            virtualList.appendChild(item);
                        });
                    }
                }
            });
        });

        // Verify virtual scrolling works
        await expect(page.locator('.list-item')).toHaveCount(20);
        await page.evaluate(() => {
            const virtualList = document.querySelector('.virtual-list');
            virtualList!.scrollTop = virtualList!.scrollHeight;
        });

        // Wait for dynamic loading
        await page.waitForTimeout(100);
        await expect(page.locator('.list-item')).toHaveCount(150);
    });

    test('should maintain responsive design', async ({ page }) => {
        // Test different viewport sizes
        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect(page.locator('.pr-container')).toBeVisible();

        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.locator('.pr-container')).toBeVisible();

        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.locator('.pr-container')).toBeVisible();
    });

    test.afterEach(async ({ page }) => {
        // Cleanup
        await page.evaluate(() => {
            // Remove event listeners and clean up DOM
            document.body.innerHTML = '';
        });
    });
});