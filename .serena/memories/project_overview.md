# Azure DevOps PR Reviewer - Project Overview

## Purpose
VS Code extension that streamlines pull request reviews for Azure DevOps, enabling developers to triage, review, and manage pull requests without leaving their IDE.

## Key Goals
- <5 second initialization time
- <3 click approval workflow
- Performance optimized for large PRs (100+ files)
- WCAG 2.1 AA accessible with keyboard navigation
- Secure PAT handling via VS Code Secret Storage

## Tech Stack
- **Runtime**: Node.js with VS Code Extension API (v1.74.0+)
- **Language**: TypeScript with strict typing
- **HTTP Client**: Axios for Azure DevOps REST API (v7.1-preview.1)
- **Testing**: Mocha (unit/integration), Playwright (E2E)
- **Build**: TypeScript compiler with Webpack
- **Telemetry**: vscode-extension-telemetry

## Architecture Components
- `src/api/` - Azure DevOps REST API client
- `src/providers/` - VS Code tree data providers and webview providers
- `src/services/` - Business logic (TelemetryService, MonitoringService)
- `src/utils/` - Shared utilities
- `src/webview/` - PR dashboard UI components

## Project Status
Currently in Foundation phase implementation (Weeks 1-2) focusing on authentication infrastructure and API client development.