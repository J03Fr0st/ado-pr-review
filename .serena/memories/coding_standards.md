# Coding Standards and Conventions

## TypeScript Style
- **Indentation**: 2 spaces (no tabs)
- **Typing**: Strict TypeScript, no `any` types
- **Target**: ES2020 modules
- **Semicolons**: Required

## File Naming Conventions
- Files: `camelCase.ts` (e.g., `pullRequestService.ts`)
- Classes: `PascalCase` (e.g., `class AuthenticationService`)
- Test files: `*.test.ts` suffix

## VS Code Extension Standards
- Command IDs: `azureDevOps.*` namespace (e.g., `azureDevOps.configure`)
- Configuration: `azureDevOps.*` namespace for settings
- Views: Consistent with VS Code design patterns

## Git Commit Standards
- **Format**: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- **Azure Boards**: Reference work items in footers (`AB#123`)

## Security Requirements
- Never commit PATs or API keys
- Use VS Code Secret Storage for sensitive data
- No sensitive data in logs or error messages

## Code Quality Rules
- Descriptive variable and function names
- Comprehensive JSDoc comments for public APIs
- Error handling without exposing tokens
- Performance-first approach with caching