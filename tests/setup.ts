/**
 * Jest setup file for VS Code extension testing
 */

// Mock VS Code API
const mockVscode = {
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
      has: jest.fn(),
      inspect: jest.fn()
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: jest.fn()
  },
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createTreeView: jest.fn(),
    registerTreeDataProvider: jest.fn(),
    createWebviewPanel: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn()
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn()
  },
  Uri: {
    parse: jest.fn((str: string) => ({ path: str, toString: () => str })),
    file: jest.fn((str: string) => ({ path: str, toString: () => str }))
  },
  TreeItem: jest.fn(),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  ThemeIcon: jest.fn(),
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  SecretStorage: jest.fn(),
  EventEmitter: jest.fn(() => ({
    event: jest.fn(),
    fire: jest.fn(),
    dispose: jest.fn()
  }))
};

// Global mock for vscode module
jest.mock('vscode', () => mockVscode, { virtual: true });

// Global test setup
beforeEach(() => {
  jest.clearAllMocks();
});

// Environment variables for integration tests
if (process.env.NODE_ENV === 'test') {
  process.env.ADO_TEST_PAT = process.env.ADO_TEST_PAT || 'test-pat-token';
  process.env.ADO_TEST_ORG = process.env.ADO_TEST_ORG || 'test-org';
}

export { mockVscode };