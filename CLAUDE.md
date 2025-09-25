# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies (use when package-lock.json changes)
npm ci

# Development with live reload
npm run watch

# Build and package
npm run build
npm run package

# Testing
npm run test              # Unit + integration tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e          # End-to-end tests (requires packaged .vsix)
npm run coverage          # Generate coverage report

# Code quality (run before commits)
npm run lint              # ESLint checks
npm run lint:fix          # Auto-fix ESLint issues
npm run format:check      # Prettier formatting check
npm run format            # Auto-format code
npm run typecheck         # TypeScript validation

# Deployment
npm run deploy            # Deploy to marketplace
npm run health-check      # Verify deployment status
```

## Architecture Overview

This is a **VS Code extension** that provides Azure DevOps pull request review capabilities directly within the IDE. The architecture follows VS Code extension patterns with performance and user experience optimization.

### Core Components

- **`src/api/`** - Azure DevOps REST API client implementation (v7.1-preview.1)
- **`src/providers/`** - VS Code tree data providers and webview providers for UI binding
- **`src/services/`** - Business logic including `TelemetryService` and `MonitoringService`
- **`src/utils/`** - Shared utilities and helper functions
- **`src/webview/`** - PR dashboard UI components and webview logic

### Key Design Patterns

- **Performance-First**: Sub-5 second initialization, lazy loading for large PRs, intelligent caching
- **Rate Limit Compliance**: Respectful Azure DevOps API usage with backoff strategies
- **Security-Focused**: Personal Access Token (PAT) stored in VS Code Secret Storage
- **Accessibility**: WCAG 2.1 AA compliant with keyboard navigation support

## Testing Strategy

- **Unit tests** (`tests/unit/`) - Test individual modules with `.test.ts` suffix
- **Integration tests** (`tests/integration/`) - Require `ADO_TEST_PAT` and `ADO_TEST_ORG` environment variables
- **E2E tests** (`tests/e2e/`) - Playwright-based tests that run against packaged `.vsix` file

Run `npm run test:e2e` only after `npm run package` to test the complete extension.

## Configuration

Extension settings are under the `azureDevOps.*` namespace:
- `azureDevOps.organizationUrl` - Azure DevOps organization URL
- `azureDevOps.project` - Project name
- `azureDevOps.refreshInterval` - Auto-refresh interval (default: 300s)
- `azureDevOps.telemetry.*` - Telemetry settings

## Coding Standards

- Use 2-space indentation, ES2020 modules, strict TypeScript typing
- Files use `camelCase.ts`, exported classes use `PascalCase`
- VS Code command IDs must be in `azureDevOps.*` namespace
- Follow Conventional Commits format (`feat:`, `fix:`, `docs:`)
- Reference Azure Boards work items in commit footers (`AB#123`)

## Security Notes

- Never commit Personal Access Tokens or API keys
- Use VS Code Secret Storage for token management
- Test environment variables: `ADO_TEST_PAT`, `ADO_TEST_ORG` (for integration tests)
- GitHub Secrets: `VSCE_PAT` (for deployment)
- Rotate PATs quarterly and run health checks after production deploys