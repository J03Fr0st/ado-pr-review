# Quick Reference Guide

## ⚡ Essential Commands

### Getting Started
| Command | Action |
|---------|--------|
| `Ctrl+Shift+P` → "Azure DevOps: Show PR View" | Open PR sidebar |
| `Ctrl+Shift+P` → "Azure DevOps: Authenticate" | Set up authentication |
| `Ctrl+Shift+P` → "Azure DevOps: Configure" | Configure organization/project |

### Daily Workflow
| Command | Action |
|---------|--------|
| `Ctrl+Shift+P` → "Azure DevOps: Refresh" | Refresh PR list |
| `Ctrl+Shift+P` → "Azure DevOps: Open in Browser" | Open PR in web interface |
| `Alt+1` | Focus PR tree view |
| `Alt+2` | Focus PR detail view |

## 🎯 3-Click Approval

1. **Click 1**: Azure DevOps icon in Activity Bar
2. **Click 2**: Select PR to review
3. **Click 3**: Click Approve button

## 🔧 Quick Setup

### 1. Install Extension
```bash
# VS Code Marketplace
Ctrl+Shift+X → Search "Azure DevOps PR Reviewer" → Install

# OR Command Line
code --install-extension company.ado-pr-reviewer
```

### 2. Generate PAT
```
Azure DevOps → Profile → Security → New Token
Name: VS Code PR Reviewer
Scopes: Code (read), Pull Request (read & write), Work Items (read)
Expiration: 90 days
```

### 3. Configure
```json
// VS Code Settings (Ctrl+,)
{
  "azureDevOps.organizationUrl": "https://dev.azure.com/your-org",
  "azureDevOps.project": "your-project",
  "azureDevOps.refreshInterval": 300
}
```

## 📋 Status Icons

| Icon | Status | Action |
|------|--------|--------|
| ✅ | Active PR | Ready for review |
| ⏳ | Awaiting Review | Your attention needed |
| 🔄 | Draft | Work in progress |
| 🏆 | Approved | Done |
| ❌ | Closed | Review complete |
| 🔒 | Merged | Changes integrated |

## 🚨 Common Issues

### Authentication Failed
1. Check PAT scopes: Code (read), PR (read & write), Work Items (read)
2. Clear auth: `Ctrl+Shift+P` → "Azure DevOps: Clear Authentication"
3. Re-authenticate with fresh PAT

### No Repositories
1. Verify organization URL format
2. Check repository permissions
3. Test network connectivity

### Performance Issues
1. Clear cache: `Ctrl+Shift+P` → "Azure DevOps: Clear Cache"
2. Increase refresh interval to 600 seconds
3. Close unused PR detail views

## ⌨️ Power Shortcuts

### Navigation
- `Alt+1` - Focus PR tree
- `Alt+2` - Focus PR details
- `Ctrl+Shift+P` → "Azure DevOps: Switch Organization" - Change context

### Actions
- `Ctrl+Shift+P` → "Azure DevOps: Approve PR" - Approve current PR
- `Ctrl+Shift+P` → "Azure DevOps: Reject PR" - Reject current PR
- `Ctrl+Shift+P` → "Azure DevOps: Add Comment" - Comment on selection

### Management
- `Ctrl+Shift+P` → "Azure DevOps: Clear Cache" - Clear extension cache
- `Ctrl+Shift+P` → "Azure DevOps: Reset Settings" - Reset to defaults

## 📊 Best Practices

### Daily Routine
1. Morning: Review overnight PR activity
2. Mid-day: Approve obvious fixes quickly
3. Afternoon: Deep dive on complex PRs
4. EOD: Clear notifications and refresh

### Large PRs
1. Start with PR description and overview
2. Use search to find key files
3. Review incrementally (files load as you scroll)
4. Add specific, actionable comments

### Multi-Org Setup
```json
{
  "azureDevOps.additionalOrganizations": [
    {
      "name": "Client A",
      "url": "https://dev.azure.com/client-a",
      "project": "web-app"
    },
    {
      "name": "Client B",
      "url": "https://client-b.visualstudio.com",
      "project": "mobile-app"
    }
  ]
}
```

## 🔍 Search & Filter

### In PR Search
- `Ctrl+F` in PR detail view to search files
- Search by file name, extension, or content
- Filter by status, author, or reviewer

### Quick Navigation
- Click file icons to jump to specific changes
- Use "View in Browser" for complex diffs
- Comment on specific lines for feedback

## 💬 Commenting Tips

### Effective Comments
- Be specific about what and why
- Provide actionable suggestions
- Use threaded replies for conversations
- Mark comments as resolved when addressed

### Comment Templates
```
🐛 Bug: [Describe issue]
💡 Suggestion: [Proposed fix]
❓ Question: [Clarification needed]
✅ Good: [Positive feedback]
```

## ⚡ Performance Tips

### Speed Optimizations
- Close unused PR detail views
- Set refresh interval to 600+ seconds for large repos
- Use search instead of browsing large PRs
- Clear cache monthly to maintain performance

### Memory Management
- Maximum 3-4 open PR detail views
- Regular VS Code restarts for memory cleanup
- Monitor extension host process in Task Manager

## 🛠️ Advanced Config

### Performance Settings
```json
{
  "azureDevOps.cache.maxItems": 50,
  "azureDevOps.cache.ttl": 1800,
  "azureDevOps.refreshInterval": 600,
  "azureDevOps.performance.mode": "balanced"
}
```

### Enterprise Settings
```json
{
  "azureDevOps.telemetry.enabled": false,
  "azureDevOps.security.validateCerts": true,
  "azureDevOps.network.timeout": 30000
}
```

## 📱 Remote Work

### VPN Setup
- Test connectivity: `curl -I https://dev.azure.com`
- Configure proxy if needed:
```json
{
  "http.proxy": "http://proxy.company.com:8080",
  "http.proxyStrictSSL": false
}
```

### Multiple Machines
- Use settings sync for consistent configuration
- Re-authenticate on each machine (PATs stored locally)
- Export/import settings for team consistency

## 🆘 Emergency Recovery

### Extension Won't Load
1. Disable/enable extension
2. Restart VS Code
3. Clear extension cache
4. Reinstall if needed

### Data Loss Prevention
- Regular commits provide restore points
- Use browser interface for critical actions
- Export PR data before major operations

### Critical Errors
```
Check VS Code logs: Help → Toggle Developer Tools → Console
Look for "Azure DevOps" error messages
Report issues with error details and reproduction steps
```

---

## 📞 Need Help?

- **Documentation**: [Full Guide](docs/getting-started.md)
- **Troubleshooting**: [FAQ](docs/faq.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/ado-pr-review/issues)
- **Community**: [GitHub Discussions](https://github.com/your-org/ado-pr-review/discussions)

Quick tip: Bookmark this guide for daily reference! 📖