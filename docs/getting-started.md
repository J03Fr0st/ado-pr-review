# Getting Started Guide

## 🚀 Quick Start

Azure DevOps PR Reviewer is a powerful VS Code extension that streamlines pull request reviews for Azure DevOps, enabling you to manage PRs without leaving your IDE.

### Prerequisites

- **VS Code**: Version 1.74.0 or higher
- **Azure DevOps Account**: Access to Azure DevOps repositories
- **Personal Access Token (PAT)**: Generated from your Azure DevOps account

## 🔧 Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Azure DevOps PR Reviewer"
4. Click **Install**
5. Wait for installation to complete

### From VSIX (Development/Testing)

1. Download the latest `.vsix` file
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded file

## ⚙️ Initial Setup

### Step 1: Configure Azure DevOps Connection

1. **Open Configuration**: Press `Ctrl+Shift+P` and type "Azure DevOps: Configure"
2. **Enter Organization URL**:
   ```
   https://dev.azure.com/your-organization
   # OR
   https://your-organization.visualstudio.com
   ```
3. **Enter Project Name**: Your Azure DevOps project name
4. **Set Refresh Interval**: Auto-refresh interval in seconds (default: 300)

### Step 2: Authenticate with Personal Access Token

1. **Generate PAT**:
   - Go to your Azure DevOps organization
   - Click on your profile → Security
   - Click "New Token"
   - Give it a descriptive name (e.g., "VS Code PR Reviewer")
   - Set expiration (recommended: 90 days)
   - Select scopes: `Code (read)`, `Pull Request (read & write)`, `Work Items (read)`
   - Click "Create"

2. **Store PAT in VS Code**:
   - The extension will prompt you for your PAT
   - Paste the generated token
   - The token is securely stored in VS Code's Secret Storage

### Step 3: Verify Setup

1. **Open the PR View**: Click on the Azure DevOps icon in the Activity Bar
2. **Check PR List**: You should see your repositories and pull requests
3. **Test Authentication**: Try opening a PR detail view

## 🎯 First Steps

### Exploring Pull Requests

1. **Navigate the Tree**: Use the sidebar to browse:
   - Organizations → Repositories → Pull Requests
2. **Open PR Details**: Click on any PR to see detailed information
3. **Review Files**: Examine changed files with syntax highlighting
4. **Read Comments**: View threaded conversations

### Performing PR Actions

#### Approving a Pull Request

1. **Select a PR**: Click on the PR in the tree view
2. **Open Details**: The PR detail view will open
3. **Click Approve**: Look for the approve button in the action panel
4. **Add Comment (Optional)**: Include a comment with your approval
5. **Confirm**: Click to confirm the approval

#### Adding Comments

1. **Open a File**: Click on any file in the PR detail view
2. **Select Lines**: Highlight the code you want to comment on
3. **Add Comment**: Right-click and select "Add Comment"
4. **Write Comment**: Type your comment in the comment box
5. **Submit**: Click the comment button to submit

#### Rejecting a Pull Request

1. **Select PR**: Choose the PR you want to reject
2. **Click Reject**: Find the reject option in the action panel
3. **Provide Reason**: Explain why you're rejecting the PR
4. **Confirm**: Submit your rejection with comments

## 🎨 Interface Overview

### Activity Bar
- **Azure DevOps Icon**: Opens the PR sidebar
- **Quick Access**: Right-click for常用 commands

### Sidebar (PR Tree View)
```
📁 Your Organization
  📁 Repository 1
    📁 Pull Requests
      ✅ Active (5)
      ⏳ Merged (12)
      ❌ Completed (8)
  📁 Repository 2
    📁 Pull Requests
      ✅ Active (2)
```

### PR Detail View
- **Header**: PR title, status, author, creation date
- **Tabs**: Files, Comments, Activity
- **Action Panel**: Approve, Reject, Comment buttons
- **File Tree**: Hierarchical view of changed files

## ⚡ Performance Tips

### Large PRs (100+ files)
- The extension uses incremental loading for better performance
- Files load as you scroll through the list
- Search functionality helps find specific files quickly

### Memory Optimization
- Close unused PR detail views
- Use the refresh button instead of auto-refresh for large repositories
- Clear cache periodically if you experience slowdowns

## 🔧 Customization

### Settings Configuration

Access VS Code settings (`Ctrl+,`) and search for "Azure DevOps":

```json
{
  "azureDevOps.organizationUrl": "https://dev.azure.com/your-org",
  "azureDevOps.project": "your-project-name",
  "azureDevOps.refreshInterval": 300,
  "azureDevOps.telemetry.enabled": true
}
```

### Keyboard Shortcuts

The extension includes several keyboard shortcuts:

- `Ctrl+Shift+P` → "Azure DevOps: Refresh Pull Requests"
- `Ctrl+Shift+P` → "Azure DevOps: Open in Browser"
- `Alt+1` → Focus PR tree view
- `Alt+2` → Focus PR detail view

## 📱 Mobile and Remote Access

### Working Remotely
- The extension works with any Azure DevOps instance
- Supports both cloud and on-premises Azure DevOps Server
- VPN access may be required for on-premises instances

### Multiple Organizations
- You can configure multiple organization URLs
- Switch between organizations using the configuration menu
- Each organization maintains separate authentication

## 🆘 Getting Help

### Built-in Help
- Press `F1` in VS Code and search for "Azure DevOps"
- Hover over UI elements for tooltips
- Use the command palette for all available commands

### Documentation
- [User Guide](docs/user-guide.md) - Detailed feature documentation
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [FAQ](docs/faq.md) - Frequently asked questions

### Community Support
- [GitHub Issues](https://github.com/your-org/ado-pr-review/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/your-org/ado-pr-review/discussions) - Community discussions
- [Stack Overflow](https://stackoverflow.com) - Tag your questions with `azure-devops-pr-reviewer`

## 🎯 Next Steps

1. **Explore Features**: Try different actions like commenting and approving
2. **Customize Settings**: Adjust the extension to fit your workflow
3. **Provide Feedback**: Help us improve by reporting issues or suggesting features
4. **Stay Updated**: Enable auto-update to get the latest features and fixes

---

## 📚 Additional Resources

- [VS Code Extension Development](https://code.visualstudio.com/api)
- [Azure DevOps REST API](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- [Personal Access Tokens](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

Happy coding! 🚀