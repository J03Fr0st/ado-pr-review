import * as vscode from 'vscode';
import { AdoPrProvider } from '../../src/providers/AdoPrProvider';
import { ConfigurationManager } from '../../src/services/ConfigurationManager';
import { AzureDevOpsApi } from '../../src/services/AzureDevOpsApi';
import { TelemetryService } from '../../src/services/TelemetryService';

describe('Azure DevOps PR Reviewer Extension Tests', () => {
  describe('Extension Activation', () => {
    it('should activate extension successfully', async () => {
      const context = {
        subscriptions: [],
        extensionUri: vscode.Uri.parse('file:///test'),
        globalState: {
          get: jest.fn(),
          update: jest.fn()
        },
        workspaceState: {
          get: jest.fn(),
          update: jest.fn()
        }
      } as any;

      // Mock VS Code APIs
      const registerTreeDataProviderSpy = jest.spyOn(vscode.window, 'registerTreeDataProvider');
      const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');

      // Import and activate extension
      const { activate } = await import('../../src/extension');
      await activate(context);

      expect(registerTreeDataProviderSpy).toHaveBeenCalled();
      expect(registerCommandSpy).toHaveBeenCalled();
      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register all required commands', async () => {
      const context = { subscriptions: [] } as any;
      const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');

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
        expect(registerCommandSpy).toHaveBeenCalledWith(command, expect.any(Function));
      });
    });
  });

  describe('Configuration Manager', () => {
    let configManager: ConfigurationManager;
    let secretStorageMock: any;

    beforeEach(() => {
      secretStorageMock = {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn()
      };
      configManager = new ConfigurationManager(secretStorageMock);
    });

    it('should validate organization URL format', async () => {
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
        expect(result.isValid).toBe(true);
      }

      for (const url of invalidUrls) {
        const result = await configManager.validateOrganizationUrl(url);
        expect(result.isValid).toBe(false);
      }
    });

    it('should store and retrieve PAT securely', async () => {
      const testPat = 'test-personal-access-token';
      secretStorageMock.get.mockResolvedValue(testPat);

      await configManager.storePat(testPat);
      const retrievedPat = await configManager.getPat();

      expect(secretStorageMock.store).toHaveBeenCalledWith('adoPat', testPat);
      expect(retrievedPat).toBe(testPat);
    });

    it('should handle missing configuration gracefully', async () => {
      secretStorageMock.get.mockResolvedValue(undefined);

      const config = await configManager.getConfiguration();

      expect(config.organizationUrl).toBeUndefined();
      expect(config.project).toBeUndefined();
      expect(config.pat).toBeUndefined();
    });
  });

  describe('Azure DevOps API', () => {
    let api: AzureDevOpsApi;
    let httpMock: jest.Mock;

    beforeEach(() => {
      httpMock = jest.fn();
      api = new AzureDevOpsApi('https://dev.azure.com/test', 'TestProject', 'test-pat');
      (api as any).httpClient = { get: httpMock, post: httpMock, patch: httpMock };
    });

    it('should fetch pull requests with correct API call', async () => {
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

      httpMock.mockResolvedValue({ data: mockResponse });

      const pullRequests = await api.getPullRequests();

      expect(httpMock).toHaveBeenCalled();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].title).toBe('Test PR');
    });

    it('should handle API rate limiting', async () => {
      httpMock.mockRejectedValue({
        response: {
          status: 429,
          headers: { 'retry-after': '60' }
        }
      });

      await expect(api.getPullRequests()).rejects.toThrow('Rate limit exceeded. Retry after 60 seconds.');
    });

    it('should handle network errors gracefully', async () => {
      httpMock.mockRejectedValue(new Error('Network error'));

      await expect(api.getPullRequests()).rejects.toThrow('Network error');
    });

    it('should validate PAT permissions', async () => {
      const mockPermissionsResponse = {
        value: [
          { bit: 1, name: 'Read' },
          { bit: 2, name: 'Contribute' }
        ]
      };

      httpMock.mockResolvedValue({ data: mockPermissionsResponse });

      const permissions = await api.validatePermissions();

      expect(permissions.canRead).toBe(true);
      expect(permissions.canContribute).toBe(true);
      expect(permissions.canAdminister).toBe(false);
    });
  });

  describe('ADO PR Provider', () => {
    let provider: AdoPrProvider;
    let apiMock: any;
    let configMock: any;

    beforeEach(() => {
      apiMock = {
        getPullRequests: jest.fn(),
        approvePullRequest: jest.fn(),
        rejectPullRequest: jest.fn(),
        addComment: jest.fn()
      };

      configMock = {
        getConfiguration: jest.fn().mockResolvedValue({
          organizationUrl: 'https://dev.azure.com/test',
          project: 'TestProject',
          pat: 'test-pat'
        }),
        isConfigured: jest.fn().mockReturnValue(true)
      };

      provider = new AdoPrProvider(configMock, apiMock);
    });

    it('should load pull requests and create tree items', async () => {
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

      apiMock.getPullRequests.mockResolvedValue(mockPrs);

      const children = await provider.getChildren();

      expect(children).toHaveLength(2);
      expect(children[0].label).toBe('Test PR 1');
      expect(children[1].label).toBe('Test PR 2');
    });

    it('should handle empty pull request list', async () => {
      apiMock.getPullRequests.mockResolvedValue([]);

      const children = await provider.getChildren();

      expect(children).toHaveLength(0);
    });

    it('should refresh data when requested', async () => {
      apiMock.getPullRequests.mockResolvedValue([]);

      await provider.refresh();

      expect(apiMock.getPullRequests).toHaveBeenCalled();
    });

    it('should handle API errors during refresh', async () => {
      apiMock.getPullRequests.mockRejectedValue(new Error('API Error'));

      await expect(provider.refresh()).rejects.toThrow('API Error');
    });
  });

  describe('Telemetry Service', () => {
    let telemetryService: TelemetryService;
    let telemetryReporter: any;

    beforeEach(() => {
      telemetryReporter = {
        sendTelemetryEvent: jest.fn(),
        sendTelemetryErrorEvent: jest.fn()
      };
      telemetryService = new TelemetryService(telemetryReporter);
    });

    it('should track command execution', () => {
      telemetryService.trackCommand('azureDevOps.approvePullRequest', { prId: '123' });

      expect(telemetryReporter.sendTelemetryEvent).toHaveBeenCalledWith(
        'command.executed',
        { commandId: 'azureDevOps.approvePullRequest', prId: '123' }
      );
    });

    it('should track errors with context', () => {
      const error = new Error('Test error');
      telemetryService.trackError('api.error', error, { operation: 'getPullRequests' });

      expect(telemetryReporter.sendTelemetryErrorEvent).toHaveBeenCalledWith(
        'api.error',
        { operation: 'getPullRequests' },
        { error: 'Test error' }
      );
    });

    it('should respect user opt-out preferences', () => {
      telemetryService = new TelemetryService(telemetryReporter, false);

      telemetryService.trackCommand('test.command');

      expect(telemetryReporter.sendTelemetryEvent).not.toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    it('should initialize extension within 5 seconds', async () => {
      const context = {
        subscriptions: [],
        extensionUri: vscode.Uri.parse('file:///test'),
        globalState: { get: jest.fn(), update: jest.fn() },
        workspaceState: { get: jest.fn(), update: jest.fn() }
      } as any;

      // Mock all VS Code APIs to prevent actual registration
      jest.spyOn(vscode.window, 'registerTreeDataProvider').mockImplementation(() => ({} as any));
      jest.spyOn(vscode.commands, 'registerCommand').mockImplementation(() => ({} as any));

      const start = Date.now();
      const { activate } = await import('../../src/extension');
      await activate(context);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });

    it('should handle large PR lists efficiently', async () => {
      const largePrList = Array.from({ length: 1000 }, (_, i) => ({
        pullRequestId: i + 1,
        title: `PR ${i + 1}`,
        status: 'active',
        createdBy: { displayName: `User ${i + 1}` }
      }));

      const api = {
        getPullRequests: jest.fn().mockResolvedValue(largePrList)
      };

      const config = {
        getConfiguration: jest.fn().mockResolvedValue({
          organizationUrl: 'https://dev.azure.com/test',
          project: 'TestProject',
          pat: 'test-pat'
        }),
        isConfigured: jest.fn().mockReturnValue(true)
      };

      const provider = new AdoPrProvider(config, api);

      const start = Date.now();
      const children = await provider.getChildren();
      const duration = Date.now() - start;

      expect(children).toHaveLength(1000);
      expect(duration).toBeLessThan(1000);
    });
  });
});