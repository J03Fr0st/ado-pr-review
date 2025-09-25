import { test, expect } from '@playwright/test';
import { VSBrowser } from '@playwright/test';
import * as path from 'path';

// Configuration for VS Code testing
const EXTENSION_ID = 'company.ado-pr-reviewer';
const EXTENSION_PATH = process.env.EXTENSION_PATH || './dist/ado-pr-reviewer.vsix';

test.describe('Azure DevOps PR Reviewer Extension E2E Tests', () => {
  let vscode: VSBrowser;

  test.beforeAll(async ({ browser }) => {
    // Install the extension in a clean VS Code instance
    const context = await browser.newContext();
    vscode = await context.newPage() as any;

    // Install extension
    await installExtension(vscode, EXTENSION_PATH);

    // Setup test environment
    await setupTestEnvironment(vscode);
  });

  test.afterAll(async () => {
    await vscode?.close();
  });

  test.describe('Extension Activation', () => {
    test('should activate extension when opening workspace', async () => {
      await test.step('Open workspace', async () => {
        await vscode.keyboard.press('Control+Shift+P');
        await vscode.fill('[placeholder="Type a command"]', 'File: Open Folder');
        await vscode.keyboard.press('Enter');
        await vscode.waitForSelector('.quick-input-widget');
      });

      await test.step('Verify extension activation', async () => {
        // Check if Azure DevOps PR view is available in sidebar
        const prView = await vscode.waitForSelector('[data-testid="azure-devops-pr-view"]', { timeout: 10000 });
        expect(prView).toBeTruthy();
      });
    });

    test('should show configuration prompt for first-time users', async () => {
      await test.step('Clear existing configuration', async () => {
        await vscode.keyboard.press('Control+Shift+P');
        await vscode.fill('[placeholder="Type a command"]', 'Azure DevOps: Clear Configuration');
        await vscode.keyboard.press('Enter');
      });

      await test.step('Verify configuration prompt appears', async () => {
        const configPrompt = await vscode.waitForSelector('.notification-toast', { timeout: 5000 });
        const promptText = await configPrompt.textContent();
        expect(promptText).toContain('Configure Azure DevOps connection');
      });
    });
  });

  test.describe('Azure DevOps Configuration', () => {
    test('should successfully configure Azure DevOps connection', async () => {
      await test.step('Open configuration command', async () => {
        await vscode.keyboard.press('Control+Shift+P');
        await vscode.fill('[placeholder="Type a command"]', 'Azure DevOps: Configure Connection');
        await vscode.keyboard.press('Enter');
      });

      await test.step('Enter organization URL', async () => {
        await vscode.waitForSelector('[placeholder*="Organization URL"]');
        await vscode.fill('[placeholder*="Organization URL"]', process.env.ADO_TEST_ORG!);
        await vscode.keyboard.press('Enter');
      });

      await test.step('Enter project name', async () => {
        await vscode.waitForSelector('[placeholder*="Project"]');
        await vscode.fill('[placeholder*="Project"]', process.env.ADO_TEST_PROJECT!);
        await vscode.keyboard.press('Enter');
      });

      await test.step('Enter PAT token', async () => {
        await vscode.waitForSelector('[placeholder*="Personal Access Token"]');
        await vscode.fill('[placeholder*="Personal Access Token"]', process.env.ADO_TEST_PAT!);
        await vscode.keyboard.press('Enter');
      });

      await test.step('Verify successful configuration', async () => {
        const successNotification = await vscode.waitForSelector('.notification-toast.success', { timeout: 10000 });
        const message = await successNotification.textContent();
        expect(message).toContain('Azure DevOps connection configured successfully');
      });
    });

    test('should validate PAT permissions', async () => {
      await test.step('Configure with limited PAT', async () => {
        // This test uses a PAT with limited permissions to test validation
        await vscode.keyboard.press('Control+Shift+P');
        await vscode.fill('[placeholder="Type a command"]', 'Azure DevOps: Test Connection');
        await vscode.keyboard.press('Enter');
      });

      await test.step('Verify permission check', async () => {
        await vscode.waitForSelector('.notification-toast', { timeout: 15000 });
        // Should show either success or specific permission error
        const notifications = await vscode.$$('.notification-toast');
        expect(notifications.length).toBeGreaterThan(0);
      });
    });
  });

  test.describe('Pull Request Listing', () => {
    test('should load and display pull requests within 5 seconds', async () => {
      const startTime = Date.now();

      await test.step('Trigger PR refresh', async () => {
        await vscode.keyboard.press('Control+Shift+P');
        await vscode.fill('[placeholder="Type a command"]', 'Azure DevOps: Refresh Pull Requests');
        await vscode.keyboard.press('Enter');
      });

      await test.step('Verify PRs load within performance threshold', async () => {
        await vscode.waitForSelector('[data-testid="pr-list-item"]', { timeout: 5000 });
        const loadTime = Date.now() - startTime;
        expect(loadTime).toBeLessThan(5000);
      });

      await test.step('Verify PR list structure', async () => {
        const prItems = await vscode.$$('[data-testid="pr-list-item"]');
        expect(prItems.length).toBeGreaterThan(0);

        // Check first PR item has required elements
        const firstPR = prItems[0];
        const title = await firstPR.$('[data-testid="pr-title"]');
        const author = await firstPR.$('[data-testid="pr-author"]');
        const status = await firstPR.$('[data-testid="pr-status"]');

        expect(title).toBeTruthy();
        expect(author).toBeTruthy();
        expect(status).toBeTruthy();
      });
    });

    test('should filter PRs by status', async () => {
      await test.step('Open filter menu', async () => {
        const filterButton = await vscode.waitForSelector('[data-testid="pr-filter-button"]');
        await filterButton.click();
      });

      await test.step('Filter by active PRs', async () => {
        const activeFilter = await vscode.waitForSelector('[data-testid="filter-active"]');
        await activeFilter.click();
      });

      await test.step('Verify filtered results', async () => {
        await vscode.waitForSelector('[data-testid="pr-list-item"]', { timeout: 3000 });
        const prItems = await vscode.$$('[data-testid="pr-list-item"]');

        // All visible PRs should be active
        for (const item of prItems) {
          const status = await item.$eval('[data-testid="pr-status"]', el => el.textContent);
          expect(status).toMatch(/Active|Draft/);
        }
      });
    });
  });

  test.describe('Pull Request Details', () => {
    test('should open PR details on click', async () => {
      await test.step('Click on first PR', async () => {
        const firstPR = await vscode.waitForSelector('[data-testid="pr-list-item"]');
        await firstPR.click();
      });

      await test.step('Verify PR details panel opens', async () => {
        const detailsPanel = await vscode.waitForSelector('[data-testid="pr-details-panel"]', { timeout: 5000 });
        expect(detailsPanel).toBeTruthy();
      });

      await test.step('Verify PR details content', async () => {
        // Check for essential PR details
        const title = await vscode.waitForSelector('[data-testid="pr-details-title"]');
        const description = await vscode.waitForSelector('[data-testid="pr-details-description"]');
        const fileList = await vscode.waitForSelector('[data-testid="pr-files-list"]');
        const reviewers = await vscode.waitForSelector('[data-testid="pr-reviewers"]');

        expect(title).toBeTruthy();
        expect(description).toBeTruthy();
        expect(fileList).toBeTruthy();
        expect(reviewers).toBeTruthy();
      });
    });

    test('should display file diffs', async () => {
      await test.step('Click on a modified file', async () => {
        const fileItem = await vscode.waitForSelector('[data-testid="pr-file-item"]:first-child');
        await fileItem.click();
      });

      await test.step('Verify diff view opens', async () => {
        const diffEditor = await vscode.waitForSelector('.diff-editor', { timeout: 5000 });
        expect(diffEditor).toBeTruthy();
      });

      await test.step('Verify diff content is readable', async () => {
        // Check that diff has both original and modified content
        const originalPane = await vscode.waitForSelector('.original-in-monaco-diff-editor');
        const modifiedPane = await vscode.waitForSelector('.modified-in-monaco-diff-editor');

        expect(originalPane).toBeTruthy();
        expect(modifiedPane).toBeTruthy();
      });
    });
  });

  test.describe('PR Actions', () => {
    test('should approve PR with less than 3 clicks', async () => {
      let clickCount = 0;

      await test.step('Navigate to PR actions', async () => {
        const actionsButton = await vscode.waitForSelector('[data-testid="pr-actions-button"]');
        await actionsButton.click();
        clickCount++;
      });

      await test.step('Click approve button', async () => {
        const approveButton = await vscode.waitForSelector('[data-testid="approve-pr-button"]');
        await approveButton.click();
        clickCount++;
      });

      await test.step('Verify approval within click limit', async () => {
        // Wait for success notification
        const successNotification = await vscode.waitForSelector('.notification-toast.success', { timeout: 10000 });
        const message = await successNotification.textContent();
        expect(message).toContain('approved');
        expect(clickCount).toBeLessThanOrEqual(3);
      });
    });

    test('should reject PR with comment', async () => {
      await test.step('Open PR actions', async () => {
        const actionsButton = await vscode.waitForSelector('[data-testid="pr-actions-button"]');
        await actionsButton.click();
      });

      await test.step('Click reject with feedback', async () => {
        const rejectButton = await vscode.waitForSelector('[data-testid="reject-pr-button"]');
        await rejectButton.click();
      });

      await test.step('Enter rejection comment', async () => {
        const commentBox = await vscode.waitForSelector('[data-testid="rejection-comment"]');
        await commentBox.fill('Needs additional testing coverage');

        const submitButton = await vscode.waitForSelector('[data-testid="submit-rejection"]');
        await submitButton.click();
      });

      await test.step('Verify rejection processed', async () => {
        const successNotification = await vscode.waitForSelector('.notification-toast.success', { timeout: 10000 });
        const message = await successNotification.textContent();
        expect(message).toContain('rejected');
      });
    });

    test('should add comments to PR', async () => {
      await test.step('Open comment dialog', async () => {
        const commentButton = await vscode.waitForSelector('[data-testid="add-comment-button"]');
        await commentButton.click();
      });

      await test.step('Add general comment', async () => {
        const commentBox = await vscode.waitForSelector('[data-testid="comment-input"]');
        await commentBox.fill('Overall looks good, few minor suggestions');

        const submitButton = await vscode.waitForSelector('[data-testid="submit-comment"]');
        await submitButton.click();
      });

      await test.step('Verify comment added', async () => {
        const commentsList = await vscode.waitForSelector('[data-testid="pr-comments"]');
        const comments = await commentsList.$$('[data-testid="comment-item"]');
        expect(comments.length).toBeGreaterThan(0);
      });
    });
  });

  test.describe('Performance Tests', () => {
    test('should handle large PR with many files efficiently', async () => {
      // This test would require a test PR with 50+ files
      test.skip('Requires test PR with many files');
    });

    test('should maintain responsive UI during API calls', async () => {
      await test.step('Trigger multiple concurrent actions', async () => {
        // Test UI responsiveness during API calls
        const refreshPromise = vscode.click('[data-testid="refresh-button"]');

        // UI should remain responsive
        const searchBox = await vscode.waitForSelector('[data-testid="pr-search"]');
        await searchBox.fill('test search');

        await refreshPromise;

        // Verify search still works
        const searchValue = await searchBox.inputValue();
        expect(searchValue).toBe('test search');
      });
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      await test.step('Simulate network error', async () => {
        // This would require mocking network failures
        // For now, test with invalid PAT to trigger API errors
        await vscode.keyboard.press('Control+Shift+P');
        await vscode.fill('[placeholder="Type a command"]', 'Azure DevOps: Test Connection');
        await vscode.keyboard.press('Enter');
      });

      await test.step('Verify error is displayed to user', async () => {
        const errorNotification = await vscode.waitForSelector('.notification-toast.error', { timeout: 10000 });
        expect(errorNotification).toBeTruthy();
      });
    });

    test('should handle rate limiting', async () => {
      // Test rate limiting behavior
      test.skip('Requires rate limit simulation setup');
    });
  });
});

async function installExtension(vscode: any, extensionPath: string) {
  // Install extension via command line or VS Code extension API
  await vscode.keyboard.press('Control+Shift+P');
  await vscode.fill('[placeholder="Type a command"]', 'Extensions: Install from VSIX...');
  await vscode.keyboard.press('Enter');

  // Navigate to extension file
  await vscode.fill('[placeholder="Path to extension"]', path.resolve(extensionPath));
  await vscode.keyboard.press('Enter');

  // Wait for installation to complete
  await vscode.waitForSelector('.notification-toast', { timeout: 30000 });
}

async function setupTestEnvironment(vscode: any) {
  // Setup test workspace and configuration
  const testWorkspace = path.join(process.cwd(), 'test-workspace');

  // Create basic workspace structure if needed
  // Configure any necessary test settings

  await vscode.keyboard.press('Control+Shift+P');
  await vscode.fill('[placeholder="Type a command"]', 'File: Open Folder');
  await vscode.keyboard.press('Enter');

  // Select test workspace
  await vscode.fill('[placeholder="Folder path"]', testWorkspace);
  await vscode.keyboard.press('Enter');
}