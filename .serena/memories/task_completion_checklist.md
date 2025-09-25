# Task Completion Checklist

## Before Marking Any Task Complete
1. **Code Quality Pipeline**
   ```bash
   npm run lint              # Must pass ESLint checks
   npm run format:check      # Must pass Prettier formatting
   npm run typecheck         # Must pass TypeScript validation
   ```

2. **Testing Requirements**
   ```bash
   npm run test:unit         # All unit tests must pass
   npm run coverage          # Maintain ≥90% coverage target
   ```

3. **Security Validation**
   - No PATs or sensitive data in code/logs
   - VS Code Secret Storage properly implemented
   - Error messages don't expose tokens

## For New Features/Components
1. **Implementation Standards**
   - Follow VS Code extension patterns
   - Implement proper error handling
   - Add comprehensive JSDoc comments

2. **Testing Standards**
   - Write unit tests with `.test.ts` suffix
   - Test error conditions and edge cases
   - Integration tests for API interactions

3. **Performance Standards**
   - <5 second initialization target
   - <3 second PR detail loading target
   - Memory usage optimization for large PRs

## For API/Service Components
1. **Azure DevOps API Compliance**
   - Rate limiting with exponential backoff (200 req/min)
   - Proper authentication headers
   - API v7.1-preview.1 compatibility

2. **Caching Implementation**
   - Memory + session level caching
   - Cache invalidation strategies
   - Performance benchmark validation

## Final Validation Gates
1. **Security Gate**: No sensitive data exposure
2. **Performance Gate**: Meet timing targets
3. **Quality Gate**: 90% test coverage
4. **Integration Gate**: End-to-end workflow functional

## Documentation Requirements
- Update CLAUDE.md if new commands/patterns added
- Update README.md for user-facing features
- Internal documentation in `claudedocs/` if needed