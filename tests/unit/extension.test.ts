import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { AdoPrProvider } from '../../src/providers/AdoPrProvider';
import { ConfigurationManager } from '../../src/services/ConfigurationManager';
import { AzureDevOpsApi } from '../../src/services/AzureDevOpsApi';
import { TelemetryService } from '../../src/services/TelemetryService';

suite('Azure DevOps PR Reviewer Extension Tests', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Extension Activation', () => {
    test('should activate extension successfully', async () => {
      const context = {
        subscriptions: [],
        extensionUri: vscode.Uri.parse('file:///test'),
        globalState: {
          get: sandbox.stub(),
          update: sandbox.stub()
        },
        workspaceState: {
          get: sandbox.stub(),
          update: sandbox.stub()
        }
      } as any;

      // Mock VS Code APIs
      const registerTreeDataProviderStub = sandbox.stub(vscode.window, 'registerTreeDataProvider');
      const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');

      // Import and activate extension
      const { activate } = await import('../../src/extension');
      await activate(context);

      assert(registerTreeDataProviderStub.called, 'Tree data provider should be registered');
      assert(registerCommandStub.called, 'Commands should be registered');
      assert(context.subscriptions.length > 0, 'Extension should register disposables');
    });

    test('should register all required commands', async () => {
      const context = { subscriptions: [] } as any;
      const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');

      const { activate } = await import('../../src/extension');
      await activate(context);

      const expectedCommands = [
        'azureDevOps.refreshPullRequests',
        'azureDevOps.approvePullRequest',
        'azureDevOps.rejectPullRequest',
        'azureDevOps.abandonPullRequest',
        'azureDevOps.addComment',
        'azureDevOps.openInBrowser',
        'azureDevOps.configure'
      ];

      expectedCommands.forEach(command => {
        assert(registerCommandStub.calledWith(command), `Command ${command} should be registered`);
      });
    });
  });

  suite('Configuration Manager', () => {
    let configManager: ConfigurationManager;
    let secretStorageMock: any;

    setup(() => {
      secretStorageMock = {
        get: sandbox.stub(),
        store: sandbox.stub(),
        delete: sandbox.stub()
      };
      configManager = new ConfigurationManager(secretStorageMock);
    });

    test('should validate organization URL format', async () => {
      const validUrls = [
        'https://dev.azure.com/organization',
        'https://organization.visualstudio.com'
      ];

      const invalidUrls = [
        'http://dev.azure.com/org',
        'invalid-url',
        'https://github.com/user/repo'
      ];

      for (const url of validUrls) {
        const result = await configManager.validateOrganizationUrl(url);
        assert.strictEqual(result.isValid, true, `URL ${url} should be valid`);
      }

      for (const url of invalidUrls) {
        const result = await configManager.validateOrganizationUrl(url);
        assert.strictEqual(result.isValid, false, `URL ${url} should be invalid`);
      }
    });

    test('should store and retrieve PAT securely', async () => {
      const testPat = 'test-personal-access-token';
      secretStorageMock.get.resolves(testPat);

      await configManager.storePat(testPat);
      const retrievedPat = await configManager.getPat();

      assert(secretStorageMock.store.calledWith('adoPat', testPat), 'PAT should be stored in secret storage');
      assert.strictEqual(retrievedPat, testPat, 'Retrieved PAT should match stored PAT');
    });

    test('should handle missing configuration gracefully', async () => {
      secretStorageMock.get.resolves(undefined);

      const config = await configManager.getConfiguration();

      assert.strictEqual(config.organizationUrl, undefined, 'Organization URL should be undefined when not configured');
      assert.strictEqual(config.project, undefined, 'Project should be undefined when not configured');
      assert.strictEqual(config.pat, undefined, 'PAT should be undefined when not configured');
    });
  });

  suite('Azure DevOps API', () => {
    let api: AzureDevOpsApi;
    let httpStub: sinon.SinonStub;

    setup(() => {
      httpStub = sandbox.stub();
      api = new AzureDevOpsApi('https://dev.azure.com/test', 'TestProject', 'test-pat');
      (api as any).httpClient = { get: httpStub, post: httpStub, patch: httpStub };
    });

    test('should fetch pull requests with correct API call', async () => {
      const mockResponse = {
        value: [
          {
            pullRequestId: 1,
            title: 'Test PR',
            description: 'Test description',
            status: 'active',
            createdBy: { displayName: 'Test User' },
            sourceRefName: 'refs/heads/feature',
            targetRefName: 'refs/heads/main'
          }
        ]
      };

      httpStub.resolves({ data: mockResponse });

      const pullRequests = await api.getPullRequests();

      assert(httpStub.called, 'HTTP GET should be called');
      assert.strictEqual(pullRequests.length, 1, 'Should return one pull request');
      assert.strictEqual(pullRequests[0].title, 'Test PR', 'PR title should match');
    });

    test('should handle API rate limiting', async () => {
      httpStub.rejects({
        response: {
          status: 429,
          headers: { 'retry-after': '60' }
        }
      });

      try {
        await api.getPullRequests();
        assert.fail('Should throw rate limit error');
      } catch (error: any) {
        assert.strictEqual(error.message, 'Rate limit exceeded. Retry after 60 seconds.');
      }
    });

    test('should handle network errors gracefully', async () => {
      httpStub.rejects(new Error('Network error'));

      try {
        await api.getPullRequests();
        assert.fail('Should throw network error');
      } catch (error: any) {
        assert(error.message.includes('Network error'), 'Should propagate network error');
      }
    });

    test('should validate PAT permissions', async () => {
      const mockPermissionsResponse = {
        value: [
          { bit: 1, name: 'Read' },
          { bit: 2, name: 'Contribute' }
        ]
      };

      httpStub.resolves({ data: mockPermissionsResponse });

      const permissions = await api.validatePermissions();

      assert(permissions.canRead, 'Should have read permissions');
      assert(permissions.canContribute, 'Should have contribute permissions');
      assert(!permissions.canAdminister, 'Should not have admin permissions');
    });
  });

  suite('ADO PR Provider', () => {
    let provider: AdoPrProvider;
    let apiMock: any;
    let configMock: any;

    setup(() => {
      apiMock = {
        getPullRequests: sandbox.stub(),
        approvePullRequest: sandbox.stub(),
        rejectPullRequest: sandbox.stub(),
        addComment: sandbox.stub()
      };

      configMock = {
        getConfiguration: sandbox.stub().resolves({
          organizationUrl: 'https://dev.azure.com/test',
          project: 'TestProject',
          pat: 'test-pat'
        }),
        isConfigured: sandbox.stub().returns(true)
      };

      provider = new AdoPrProvider(configMock, apiMock);
    });

    test('should load pull requests and create tree items', async () => {
      const mockPrs = [
        {
          pullRequestId: 1,
          title: 'Test PR 1',
          status: 'active',
          createdBy: { displayName: 'User 1' }
        },
        {
          pullRequestId: 2,
          title: 'Test PR 2',
          status: 'completed',
          createdBy: { displayName: 'User 2' }
        }
      ];

      apiMock.getPullRequests.resolves(mockPrs);

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 2, 'Should return two tree items');
      assert.strictEqual(children[0].label, 'Test PR 1', 'First item should have correct label');
      assert.strictEqual(children[1].label, 'Test PR 2', 'Second item should have correct label');
    });

    test('should handle empty pull request list', async () => {
      apiMock.getPullRequests.resolves([]);

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 0, 'Should return empty array for no PRs');
    });

    test('should refresh data when requested', async () => {
      apiMock.getPullRequests.resolves([]);

      await provider.refresh();

      assert(apiMock.getPullRequests.called, 'Should call API to refresh data');
    });

    test('should handle API errors during refresh', async () => {
      apiMock.getPullRequests.rejects(new Error('API Error'));

      try {
        await provider.refresh();
        assert.fail('Should throw API error');
      } catch (error: any) {
        assert(error.message.includes('API Error'), 'Should propagate API error');
      }
    });
  });

  suite('Telemetry Service', () => {
    let telemetryService: TelemetryService;
    let telemetryReporter: any;

    setup(() => {
      telemetryReporter = {
        sendTelemetryEvent: sandbox.stub(),
        sendTelemetryErrorEvent: sandbox.stub()
      };
      telemetryService = new TelemetryService(telemetryReporter);
    });

    test('should track command execution', () => {
      telemetryService.trackCommand('azureDevOps.approvePullRequest', { prId: '123' });

      assert(telemetryReporter.sendTelemetryEvent.calledWith(
        'command.executed',
        { commandId: 'azureDevOps.approvePullRequest', prId: '123' }
      ), 'Should send telemetry event for command execution');
    });

    test('should track errors with context', () => {
      const error = new Error('Test error');
      telemetryService.trackError('api.error', error, { operation: 'getPullRequests' });

      assert(telemetryReporter.sendTelemetryErrorEvent.calledWith(
        'api.error',
        { operation: 'getPullRequests' },
        { error: 'Test error' }
      ), 'Should send error telemetry with context');
    });

    test('should respect user opt-out preferences', () => {
      telemetryService = new TelemetryService(telemetryReporter, false);

      telemetryService.trackCommand('test.command');

      assert(!telemetryReporter.sendTelemetryEvent.called, 'Should not send telemetry when opted out');
    });
  });

  suite('Performance Tests', () => {
    test('should initialize extension within 5 seconds', async function () {
      this.timeout(5000);

      const context = {
        subscriptions: [],
        extensionUri: vscode.Uri.parse('file:///test'),
        globalState: { get: sandbox.stub(), update: sandbox.stub() },
        workspaceState: { get: sandbox.stub(), update: sandbox.stub() }
      } as any;

      // Mock all VS Code APIs to prevent actual registration
      sandbox.stub(vscode.window, 'registerTreeDataProvider');
      sandbox.stub(vscode.commands, 'registerCommand');

      const start = Date.now();
      const { activate } = await import('../../src/extension');
      await activate(context);
      const duration = Date.now() - start;

      assert(duration < 5000, `Extension should activate in under 5 seconds, took ${duration}ms`);
    });

    test('should handle large PR lists efficiently', async () => {
      const largePrList = Array.from({ length: 1000 }, (_, i) => ({
        pullRequestId: i + 1,
        title: `PR ${i + 1}`,
        status: 'active',
        createdBy: { displayName: `User ${i + 1}` }
      }));

      const api = {
        getPullRequests: sandbox.stub().resolves(largePrList)
      };

      const config = {
        getConfiguration: sandbox.stub().resolves({
          organizationUrl: 'https://dev.azure.com/test',
          project: 'TestProject',
          pat: 'test-pat'
        }),
        isConfigured: sandbox.stub().returns(true)
      };

      const provider = new AdoPrProvider(config, api);

      const start = Date.now();
      const children = await provider.getChildren();
      const duration = Date.now() - start;

      assert.strictEqual(children.length, 1000, 'Should handle 1000 PRs');
      assert(duration < 1000, `Large PR list should render in under 1 second, took ${duration}ms`);
    });
  });
});