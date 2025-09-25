# Essential Development Commands

## Daily Development
```bash
# Start development with live reload
npm run watch

# Install dependencies when package-lock.json changes
npm ci
```

## Code Quality (Run Before Commits)
```bash
# Complete quality check pipeline
npm run lint              # ESLint checks
npm run format:check      # Prettier formatting check  
npm run typecheck         # TypeScript validation

# Auto-fix issues
npm run lint:fix          # Auto-fix ESLint issues
npm run format            # Auto-format code
```

## Testing
```bash
# Core test suites
npm run test              # Unit + integration tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests (requires ADO_TEST_PAT, ADO_TEST_ORG)
npm run coverage          # Generate coverage report

# End-to-end testing (requires packaged .vsix)
npm run package           # Create .vsix package first
npm run test:e2e          # Playwright E2E tests
```

## Build and Package
```bash
# Development builds
npm run build             # TypeScript compilation
npm run clean             # Clean output directories

# Production package
npm run package           # Create .vsix for installation
```

## Windows System Commands
```cmd
# File operations
dir                       # List directory contents
type filename.txt         # View file contents
findstr "pattern" *.ts    # Search in files
xcopy /s src dest         # Copy directories
del filename.txt          # Delete files

# Git operations
git status                # Check repository status
git branch                # List branches
git log --oneline         # View commit history
```

## Environment Variables for Testing
```bash
# Required for integration tests
set ADO_TEST_PAT=your_personal_access_token
set ADO_TEST_ORG=your_test_organization
```