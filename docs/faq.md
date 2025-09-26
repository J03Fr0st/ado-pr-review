# Frequently Asked Questions (FAQ)

## 🚀 Getting Started

### Q: What is Azure DevOps PR Reviewer?
**A:** Azure DevOps PR Reviewer is a VS Code extension that enables developers to review, approve, and manage Azure DevOps pull requests without leaving their IDE. It provides a complete PR management experience with <3 clicks for approval workflow.

### Q: What do I need to use this extension?
**A:** You need:
- VS Code 1.74.0 or higher
- An Azure DevOps account with appropriate permissions
- A Personal Access Token (PAT) with the required scopes

### Q: Is this extension free?
**A:** Yes, the extension is completely free and open source. It's published on the VS Code Marketplace at no cost.

## 🔧 Installation and Setup

### Q: How do I install the extension?
**A:** There are several ways:
1. **VS Code Marketplace** (recommended): Search for "Azure DevOps PR Reviewer"
2. **VSIX file**: Download and install manually
3. **Command line**: `code --install-extension company.ado-pr-reviewer`

### Q: What Azure DevOps instances are supported?
**A:** The extension supports:
- Azure DevOps Services (cloud): `https://dev.azure.com/*`
- Azure DevOps Server (on-premises): `https://*.visualstudio.com`
- Self-hosted Azure DevOps Server instances

### Q: What permissions do I need?
**A:** Your PAT needs these scopes:
- **Code (Read)**: View repository code
- **Pull Request (Read & Write)**: View, approve, and comment on PRs
- **Work Items (Read)**: Link PRs to work items (optional)

### Q: Can I use multiple Azure DevOps organizations?
**A:** Yes! You can configure multiple organizations in settings or use the organization switcher in the sidebar.

## 🔐 Authentication and Security

### Q: How is my Personal Access Token stored?
**A:** Your PAT is securely stored using VS Code's Secret Storage API, which encrypts credentials using your operating system's secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service API).

### Q: Is my token shared with anyone?
**A:** No, your token is never shared outside your local VS Code instance. It's only used to authenticate with Azure DevOps APIs.

### Q: Can I use Microsoft Entra ID (Azure AD) instead of PAT?
**A:** Currently, only PAT authentication is supported. Microsoft Entra ID integration is planned for future releases.

### Q: What happens if my PAT expires?
**A:** The extension will show authentication errors. You'll need to generate a new PAT and re-authenticate using "Azure DevOps: Authenticate" command.

## 🎯 Features and Functionality

### Q: What PR operations can I perform?
**A:** You can:
- List and view pull requests
- Approve and reject PRs
- Add and reply to comments
- View file diffs with syntax highlighting
- Open PRs in browser for advanced operations
- Refresh PR status manually or automatically

### Q: Can I create new pull requests?
**A:** Currently, you can only review existing PRs. PR creation functionality is planned for a future release.

### Q: How does the extension handle large PRs?
**A:** The extension uses incremental loading and performance optimizations to handle PRs with 100+ files efficiently.

### Q: Does the extension work offline?
**A:** The extension requires internet connection to access Azure DevOps APIs. However, it caches recently viewed PRs for offline viewing (read-only).

### Q: Can I customize the refresh interval?
**A:** Yes, you can set the refresh interval in settings:
```json
{
  "azureDevOps.refreshInterval": 300 // 5 minutes
}
```
Set to 0 to disable auto-refresh.

## 🎨 User Interface

### Q: How do I navigate the interface?
**A:**
- **Activity Bar**: Click the Azure DevOps icon to open the sidebar
- **Tree View**: Browse organizations → repositories → PRs
- **PR Detail View**: Click any PR to see detailed information
- **Command Palette**: Use `Ctrl+Shift+P` for all commands

### Q: What do the status indicators mean?
**A:**
- ✅ **Active**: PR is open and awaiting action
- ⏳ **Merged**: PR has been merged
- ❌ **Completed**: PR was closed without merging
- 🔄 **Draft**: PR is in draft mode

### Q: Can I customize the UI?
**A:** The extension respects your VS Code theme and settings. You can customize fonts, colors, and layout through VS Code settings.

### Q: How do I switch between organizations?
**A:** Use the organization switcher dropdown in the sidebar header, or use the command "Azure DevOps: Switch Organization".

## ⚡ Performance

### Q: Why is the extension slow to load?
**A:** This could be due to:
- Large number of repositories/PRs
- Network connectivity issues
- VS Code performance issues
- Cache needs clearing

**Solutions:**
- Increase refresh interval in settings
- Clear cache with "Azure DevOps: Clear Cache"
- Check network connectivity
- Close unused PR detail views

### Q: How much memory does the extension use?
**A:** The extension is optimized to use < 100MB for typical usage. Memory usage increases with the number of open PR detail views.

### Q: Can I limit the number of PRs shown?
**A:** Currently, the extension shows all active PRs. Filtering and search functionality is planned for future releases.

## 🔧 Configuration and Settings

### Q: Where are extension settings stored?
**A:** Settings are stored in VS Code settings:
- **User settings**: Apply to all VS Code instances
- **Workspace settings**: Apply to current workspace only
- **Remote settings**: Apply to remote containers/WSL

### Q: Can I share configuration with my team?
**A:** Yes! You can:
- Use workspace settings for team projects
- Share settings files via version control
- Export/import configuration

### Q: How do I reset all settings?
**A:** Use the command "Azure DevOps: Reset Settings" or manually remove Azure DevOps settings in your VS Code settings.

### Q: Can I use environment variables for configuration?
**A:** Currently, configuration is through VS Code settings only. Environment variable support is planned for future releases.

## 📊 Telemetry and Privacy

### Q: What data does the extension collect?
**A:** The extension collects anonymous usage data to improve the product:
- Feature usage statistics
- Performance metrics
- Error reports (no sensitive data)

**Data collected:**
- Commands used
- Performance timings
- Error types (without sensitive information)
- Extension version and VS Code version

**Data NOT collected:**
- Your PAT or authentication tokens
- PR content or code
- Personal information
- Repository names or URLs

### Q: Can I disable telemetry?
**A:** Yes, you can disable telemetry in settings:
```json
{
  "azureDevOps.telemetry.enabled": false
}
```

### Q: Is my data shared with third parties?
**A:** No, all telemetry data is processed privately and used only for improving the extension. No third-party sharing.

## 🐛 Troubleshooting

### Q: The extension shows "Authentication failed"
**A:** Try these steps:
1. Verify your PAT has correct scopes
2. Generate a new PAT
3. Clear authentication: "Azure DevOps: Clear Authentication"
4. Re-authenticate with new PAT

### Q: I see "No repositories found"
**A:** This usually means:
- Incorrect organization URL format
- Insufficient permissions
- Network connectivity issues
- PAT missing required scopes

**Solutions:**
- Verify organization URL format
- Check repository permissions
- Test network connectivity
- Regenerate PAT with correct scopes

### Q: PR details won't load
**A:** Common causes:
- Large PR with many files
- Network timeout
- API rate limiting
- Corrupted cache

**Solutions:**
- Wait and try again
- Clear extension cache
- Check network connection
- Try opening PR in browser

### Q: Comments won't submit
**A:** This could be due to:
- Missing write permissions
- PR is locked or completed
- Network issues
- API rate limiting

**Solutions:**
- Verify your permissions
- Check PR status
- Try again later
- Test in browser

## 🔄 Updates and Versioning

### Q: How do I update the extension?
**A:** VS Code automatically checks for updates. You can also:
- Check manually: "Extensions: Check for Updates"
- Install specific versions from GitHub releases
- Use VSIX files for manual updates

### Q: Will my settings be preserved after updates?
**A:** Yes, your settings and authentication data are preserved across updates.

### Q: How do I roll back to a previous version?
**A:** You can install older versions from GitHub releases:
1. Download the VSIX file for the desired version
2. Uninstall current version
3. Install the older VSIX file

## 🌐 Enterprise and Team Use

### Q: Can we use this extension in our company?
**A:** Yes! The extension is designed for both individual and enterprise use. It's open source and can be self-hosted if needed.

### Q: Do you offer enterprise support?
**A:** Community support is available through GitHub. Enterprise support options are being planned for future releases.

### Q: Can we deploy the extension internally?
**A:** Yes, you can:
- Publish to your internal VS Code marketplace
- Distribute VSIX files internally
- Use package managers for deployment

### Q: Are there any compliance certifications?
**A:** The extension follows VS Code extension guidelines and security best practices. Formal compliance certifications are planned for enterprise releases.

## 🚀 Roadmap and Future Features

### Q: What features are planned for future releases?
**A:** Planned features include:
- PR creation functionality
- Microsoft Entra ID authentication
- Enhanced filtering and search
- Integration with other development tools
- Advanced reporting and analytics
- Mobile companion app

### Q: How can I request new features?
**A:** You can:
- Create a GitHub issue with "enhancement" label
- Participate in GitHub Discussions
- Vote on existing feature requests
- Contact the development team directly

### Q: When is the next release?
**A:** Release schedules are announced through GitHub releases and discussions. Follow the repository for updates.

## 📞 Support and Community

### Q: How do I get help?
**A:** Several options are available:
- **Documentation**: Check the [troubleshooting guide](troubleshooting.md)
- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Community support and discussions
- **Stack Overflow**: Use tag `azure-devops-pr-reviewer`

### Q: How do I report a security vulnerability?
**A:** Please report security vulnerabilities privately through GitHub's private reporting feature. Do not disclose security issues publicly.

### Q: Can I contribute to the project?
**A:** Yes! Contributions are welcome. Please see the [contribution guidelines](../AGENTS.md) and [development documentation](../README.md).

### Q: Where can I find release notes?
**A:** Release notes are available in:
- VS Code marketplace extension page
- GitHub Releases section
- CHANGELOG.md in the repository

---

## 📚 Additional Resources

- [Getting Started Guide](getting-started.md)
- [Installation Guide](installation-setup.md)
- [Troubleshooting Guide](troubleshooting.md)
- [Developer Documentation](../README.md)
- [GitHub Repository](https://github.com/your-org/ado-pr-review)

Still have questions? [Create an issue](https://github.com/your-org/ado-pr-review/issues/new) or [join our community](https://github.com/your-org/ado-pr-review/discussions).