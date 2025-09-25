# Azure DevOps PR Reviewer

A powerful VS Code extension that streamlines pull request reviews for Azure DevOps, enabling developers to triage, review, and manage pull requests without leaving their IDE.

## 🚀 Quick Start

This extension provides a complete PR management experience inside VS Code with <3 clicks for approval workflow and <5 second initialization times.

## 📚 Documentation

### 📋 Project Planning & Requirements
- **[Product Requirements Document](docs/azure-devops-pr-reviewer-prd.md)** - Complete product specification including goals, scope, functional requirements, and success metrics
- **[Implementation Workflow](docs/implementation-workflow.md)** - Comprehensive 8-week development plan with phases, validation gates, and parallel execution strategy
- **[Repository Guidelines](AGENTS.md)** - Development standards, coding conventions, and project structure guidelines

### 🏗️ Architecture & Design  
- **[Backend Architecture](docs/backend-architecture-design.md)** - Technical architecture covering Azure DevOps API integration, authentication, caching strategies, and performance optimization
- **[UI/UX Architecture](docs/ui-ux-architecture.md)** - User interface design patterns, VS Code integration, component hierarchy, and accessibility compliance

### 🧪 Quality Assurance
- **[Testing Strategy](docs/testing-strategy.md)** - Comprehensive testing approach including unit tests, integration tests, E2E automation, performance benchmarks, security validation, and accessibility testing

### 🚀 Operations & Deployment
- **[DevOps Overview](docs/devops/README.md)** - Complete DevOps documentation including CI/CD pipeline, monitoring, incident response, and operational procedures  
- **[Deployment Guide](docs/devops/deployment.md)** - Step-by-step deployment procedures for internal preview, public preview, and production environments
- **[Incident Response Runbook](docs/devops/runbooks/incident-response.md)** - Emergency response procedures, escalation paths, and troubleshooting guides for production issues

## 🔧 Development Commands

```bash
# Install dependencies
npm ci

# Development with live reload  
npm run watch

# Build and package
npm run build
npm run package

# Testing
npm run test              # Unit + integration tests
npm run test:e2e          # End-to-end tests
npm run coverage          # Generate coverage report

# Code quality
npm run lint              # ESLint checks
npm run format:check      # Prettier formatting check
npm run typecheck         # TypeScript validation
```

## 🏢 Repository Structure

```
├── src/                  # Extension source code
│   ├── api/             # Azure DevOps REST client
│   ├── providers/       # VS Code tree/webview providers  
│   ├── services/        # Business logic and telemetry
│   ├── utils/           # Shared utilities
│   └── webview/         # PR dashboard UI
├── tests/               # Test suites
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/            # End-to-end tests
├── scripts/            # Build and deployment automation
├── docs/               # Documentation
└── .github/workflows/  # CI/CD pipelines
```

## 📊 Key Features

- **🔍 PR Discovery**: Hierarchical tree view of organizations, repositories, and pull requests
- **⚡ Quick Actions**: Approve, reject, or comment on PRs with minimal clicks
- **📄 Rich Diff Viewer**: Syntax-highlighted file diffs with inline commenting
- **💬 Comment Threading**: Full conversation threads with replies and resolution
- **🔒 Secure Authentication**: Personal Access Token (PAT) stored in VS Code Secret Storage
- **⚡ Performance Optimized**: Handles large PRs (100+ files) with incremental loading
- **♿ Accessibility**: WCAG 2.1 AA compliant with full keyboard navigation support

## 🤝 Contributing

Please refer to our [Repository Guidelines](AGENTS.md) for coding standards, testing requirements, and contribution workflows.

## 📞 Support

For issues and feature requests, please check the [Incident Response Runbook](docs/devops/runbooks/incident-response.md) or create a GitHub issue.

---

**Note**: This extension is currently in development. See the [Implementation Workflow](docs/implementation-workflow.md) for current development status and planned releases.
