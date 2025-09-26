# Troubleshooting Guide

## 🚨 Common Issues and Solutions

### Installation Issues

#### Extension Won't Install

**Symptoms:**
- Installation fails with error messages
- Extension appears greyed out in marketplace
- VS Code shows "Installation failed" notification

**Solutions:**
```bash
# 1. Clear VS Code extension cache
rm -rf ~/.vscode/extensions/ado-pr-reviewer*

# 2. Restart VS Code
code --reload-window

# 3. Try manual VSIX installation
# Download VSIX from releases and install manually
```

**VS Code Version Compatibility:**
- Ensure you're using VS Code 1.74.0 or higher
- Check VS Code version: `Help → About`
- Update VS Code if needed: `Help → Check for Updates`

### Authentication Issues

#### PAT Not Working

**Symptoms:**
- "Authentication failed" error messages
- Extension keeps asking for PAT
- No repositories appear in sidebar

**Solutions:**
1. **Verify PAT Scopes:**
   ```
   Required scopes:
   ✓ Code (Read)
   ✓ Pull Request (Read & Write)
   ✓ Work Items (Read)
   ```

2. **Regenerate PAT:**
   - Go to Azure DevOps → Security → Personal access tokens
   - Create new token with correct scopes
   - Use the new token in VS Code

3. **Clear Stored Credentials:**
   ```bash
   Ctrl+Shift+P → "Azure DevOps: Clear Authentication"
   ```

#### Organization URL Issues

**Symptoms:**
- "Invalid organization URL" error
- Connection timeout errors
- "Organization not found" messages

**Solutions:**
1. **Correct URL Format:**
   ```
   Valid formats:
   - https://dev.azure.com/your-organization
   - https://your-organization.visualstudio.com

   Invalid formats:
   - dev.azure.com/your-organization (missing https://)
   - https://dev.azure.com/your-organization/ (trailing slash)
   ```

2. **Test Connectivity:**
   ```bash
   curl -I https://dev.azure.com/your-organization
   ```

3. **VPN/Network Issues:**
   - Ensure you can access Azure DevOps in browser
   - Check if corporate firewall blocks access
   - Try different network if available

### Performance Issues

#### Slow Loading Times

**Symptoms:**
- Initial load takes > 5 seconds
- PR details take > 3 seconds to open
- UI becomes unresponsive

**Solutions:**
1. **Clear Cache:**
   ```bash
   Ctrl+Shift+P → "Azure DevOps: Clear Cache"
   ```

2. **Optimize Settings:**
   ```json
   {
     "azureDevOps.refreshInterval": 600, // Increase to 10 minutes
     "azureDevOps.telemetry.enabled": false // Disable telemetry
   }
   ```

3. **Large Repository Handling:**
   - Use search to filter PRs
   - Close unused PR detail views
   - Refresh manually instead of auto-refresh

#### High Memory Usage

**Symptoms:**
- VS Code becomes sluggish
- Task Manager shows high memory usage
- Extension crashes frequently

**Solutions:**
1. **Reduce Active PR Views:**
   - Close PR detail views when not needed
   - Use the sidebar tree view instead of opening multiple details

2. **VS Code Optimization:**
   - Restart VS Code periodically
   - Disable other extensions to identify conflicts
   - Increase available system memory

3. **Extension-Specific:**
   ```json
   {
     "azureDevOps.cache.maxItems": 50, // Reduce cache size
     "azureDevOps.cache.ttl": 1800 // Reduce cache time to live
   }
   ```

### Display Issues

#### UI Not Rendering Correctly

**Symptoms:**
- Blank white panels in PR view
- Buttons not clickable
- Layout overlapping or broken

**Solutions:**
1. **VS Code Theme Issues:**
   - Try a different VS Code theme
   - Check if issue persists with default theme
   - Update graphics drivers if needed

2. **Extension Reload:**
   ```bash
   Ctrl+Shift+P → "Developer: Reload Window"
   ```

3. **Font/Display Issues:**
   ```json
   {
     "editor.fontSize": 14,
     "editor.fontFamily": "Consolas, 'Courier New', monospace"
   }
   ```

#### Tree View Not Showing

**Symptoms:**
- Azure DevOps icon missing from Activity Bar
- Sidebar shows "No repositories found"
- Tree view appears empty

**Solutions:**
1. **Check Extension Activation:**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Type "Azure DevOps" to verify commands are available
   - Look for errors in Output panel (View → Output)

2. **Manual View Activation:**
   ```bash
   Ctrl+Shift+P → "Azure DevOps: Show PR View"
   ```

3. **Workspace Trust:**
   - Ensure workspace is trusted
   - Click "Manage" in workspace indicator if not trusted

### Functionality Issues

#### PR Actions Not Working

**Symptoms:**
- Approve/Reject buttons don't respond
- Comments fail to submit
- Actions show error messages

**Solutions:**
1. **Permission Verification:**
   - Check Azure DevOps user permissions
   - Ensure you have PR approval rights
   - Verify repository access level

2. **API Rate Limiting:**
   - Wait a few minutes and try again
   - Reduce refresh frequency in settings
   - Check Azure DevOps service status

3. **Network Issues:**
   - Test internet connectivity
   - Check Azure DevOps service status
   - Try different network connection

#### File Diff Issues

**Symptoms:**
- Diffs don't show syntax highlighting
- Large files fail to load
- Line numbers don't match

**Solutions:**
1. **File Size Limits:**
   - Extension supports files up to 2MB
   - Use "Open in Browser" for very large files
   - Break large PRs into smaller reviews

2. **Syntax Highlighting:**
   - Ensure corresponding language extension is installed
   - Check VS Code language mode for the file
   - Try reloading the diff view

3. **Encoding Issues:**
   - Files must be UTF-8 encoded
   - Check file encoding in VS Code status bar
   - Convert encoding if needed

## 🔧 Advanced Troubleshooting

### Debug Mode

#### Enable Debug Logging
```json
{
  "azureDevOps.debug.enabled": true,
  "azureDevOps.debug.level": "verbose",
  "azureDevOps.debug.logToFile": true
}
```

#### Access Debug Information
1. **Output Panel:** View → Output → Select "Azure DevOps"
2. **Developer Console:** Help → Toggle Developer Tools
3. **Log Files:** Check VS Code logs directory
   - Windows: `%APPDATA%\Code\logs`
   - macOS: `~/Library/Application Support/Code/logs`
   - Linux: `~/.config/Code/logs`

### Network Diagnostics

#### Test API Connectivity
```bash
# Test basic connectivity
curl -I https://dev.azure.com

# Test authentication (replace with your PAT)
curl -H "Authorization: Basic YOUR_BASE64_PAT" \
     https://dev.azure.com/your-organization/_apis/projects?api-version=6.0

# Test specific endpoint
curl -H "Authorization: Basic YOUR_BASE64_PAT" \
     https://dev.azure.com/your-organization/your-project/_apis/git/repositories?api-version=6.0
```

#### Proxy Configuration
```json
{
  "http.proxy": "http://proxy.company.com:8080",
  "http.proxyStrictSSL": false,
  "azureDevOps.organizationUrl": "https://dev.azure.com/company"
}
```

### Extension Diagnostics

#### Check Extension Status
```bash
# List all extensions
Ctrl+Shift+P → "Extensions: Show Installed Extensions"

# Check extension details
# Look for Azure DevOps PR Reviewer in the list
# Verify version and enabled status
```

#### Extension Host Process
- Open Task Manager
- Look for "Extension Host" process
- Check CPU and memory usage
- Restart VS Code if usage is excessive

## 🆘 Getting Additional Help

### Before Contacting Support

1. **Gather Information:**
   - VS Code version: `Help → About`
   - Extension version: Check in Extensions view
   - Operating system and version
   - Error messages (exact text)
   - Steps to reproduce the issue

2. **Try Basic Troubleshooting:**
   - Restart VS Code
   - Update to latest versions
   - Disable other extensions
   - Try on a different machine

3. **Check Known Issues:**
   - GitHub Issues page
   - Release notes for known bugs
   - Documentation for recent changes

### Support Channels

#### GitHub Issues
- **Bug Reports**: https://github.com/your-org/ado-pr-review/issues
- Include: error logs, reproduction steps, environment info
- Use bug report template if available

#### Community Support
- **Discussions**: https://github.com/your-org/ado-pr-review/discussions
- **Stack Overflow**: Tag questions with `azure-devops-pr-reviewer`
- **VS Code Marketplace**: Use Q&A section

#### Enterprise Support
- Contact your internal IT team
- Check if organization has specific policies
- Verify Azure DevOps service availability

### Emergency Contacts

#### Critical Issues
- **Extension completely broken**: File GitHub issue with "critical" label
- **Data loss concerns**: Contact development team directly
- **Security vulnerabilities**: Use private security reporting

#### Service Status
- **Azure DevOps Status**: https://status.dev.azure.com
- **VS Code Status**: https://status.visualstudio.com
- **GitHub Status**: https://www.githubstatus.com

---

## 📚 Additional Resources

### Documentation
- [Getting Started Guide](getting-started.md)
- [Installation Guide](installation-setup.md)
- [FAQ](faq.md)
- [Developer Documentation](../README.md)

### Tools and Utilities
- [VS Code Developer Tools](https://code.visualstudio.com/api)
- [Azure DevOps REST API](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- [VS Code Extension Testing Guide](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

### Community
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines/)
- [Azure DevOps Community](https://azure.microsoft.com/en-us/community/)
- [Open VSX](https://open-vsx.org/) - Alternative marketplace

---

Need more help? [Create an issue](https://github.com/your-org/ado-pr-review/issues/new) or [join our community](https://github.com/your-org/ado-pr-review/discussions).