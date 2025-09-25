# Repository Guidelines

## Project Structure & Module Organization
- `src/` hosts extension modules: `api/` for REST clients, `providers/` for Azure DevOps bindings, `services/` for telemetry, `utils/`, and `webview/` for the PR dashboard.
- `tests/` mirrors runtime code across `unit`, `integration`, and `e2e` suites; keep fixtures beside their suite and match filenames to the module under test.
- `scripts/` supplies packaging/deploy automation (`package.js`, `deploy.js`), while `docs/` and `.github/workflows/` store runbooks and pipelines that must evolve with behavior changes.

## Build, Test, and Development Commands
- `npm ci` installs locked dependencies whenever `package-lock.json` changes.
- `npm run watch` recompiles on save; `npm run compile` performs a single TypeScript emit to `out/`.
- `npm run lint`, `npm run format:check`, and `npm run typecheck` gate pushes—resolve issues locally before committing.
- `npm run test` covers unit + integration suites; run `npm run package` followed by `npm run test:e2e` for UI changes, and `npm run build` to produce deployable artifacts.

## Coding Style & Naming Conventions
- Use 2-space indentation, ES2020 modules, strict typing, and explicit interfaces in TypeScript sources.
- Files use `camelCase.ts`; exported classes and services use `PascalCase`; VS Code command IDs remain in the `azureDevOps.*` namespace.
- Run `npm run lint:fix` and `npm run format` before committing, and document new configuration under `package.json > contributes.configuration` with a matching note in `docs/`.

## Testing Guidelines
- Place unit specs under `tests/unit` with the `.test.ts` suffix to keep coverage mapping predictable.
- Integration suites (`tests/integration`) rely on `ADO_TEST_PAT` and `ADO_TEST_ORG`; use Sinon stubs when secrets are unavailable.
- Playwright specs live in `tests/e2e`; run `npm run test:e2e` on the packaged `.vsix`, and run `npm run coverage` to refresh `coverage/lcov.info` for Codecov.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `docs:`) with present-tense subjects under 72 characters.
- Reference the Azure Boards work item in the footer (e.g. `AB#123`).
- Confirm `npm run lint`, `npm test`, and `npm run build` pass before opening a PR, then describe scope, validation, and new configs or secrets; attach UI evidence when relevant.
- Require every GitHub check in `ci.yml` to finish green (quality, test, security, e2e, package) before merging.

## Security & Configuration Tips
- Store tokens in VS Code settings (`azureDevOps.*`) or GitHub Secrets (`ADO_TEST_*`, `VSCE_PAT`); never commit them.
- Rotate PATs quarterly, run `npm run health-check` after production deploys, and keep monitoring thresholds aligned with `docs/implementation-workflow.md`.
