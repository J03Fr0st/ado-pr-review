# Installation and Setup Guide

## 📦 System Requirements

### Minimum Requirements
- **VS Code**: Version 1.74.0 or higher
- **Operating System**: Windows 10+, macOS 10.14+, Linux (Ubuntu 18.04+, Debian 10+, CentOS 8+)
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 100MB free space for extension and cache

### Network Requirements
- **Internet Connection**: Required for Azure DevOps API access
- **Azure DevOps Access**: Valid account with appropriate permissions
- **Firewall**: Allow connections to `dev.azure.com` and `visualstudio.com`

## 🔧 Installation Methods

### Method 1: VS Code Marketplace (Recommended)

#### For Production Use
1. **Open VS Code Marketplace**:
   - Launch VS Code
   - Press `Ctrl+Shift+X` to open Extensions view
   - Search for "Azure DevOps PR Reviewer"

2. **Install Extension**:
   - Click the **Install** button on the extension card
   - Wait for installation to complete (usually < 30 seconds)
   - VS Code may prompt to restart - allow the restart

3. **Verify Installation**:
   - Look for the Azure DevOps icon in the Activity Bar (left sidebar)
   - Open the Command Palette (`Ctrl+Shift+P`)
   - Type "Azure DevOps" to see available commands

### Method 2: Manual VSIX Installation

#### For Development or Testing
1. **Download VSIX File**:
   - Get the `.vsix` file from:
     - GitHub Releases (latest stable version)
     - Build artifacts (development builds)
     - Direct from development team

2. **Install from VSIX**:
   - Open VS Code
   - Go to Extensions view (`Ctrl+Shift+X`)
   - Click the **"..."** menu in the top-right
   - Select **"Install from VSIX..."**
   - Navigate to and select the downloaded `.vsix` file

3. **Post-Installation**:
   - VS Code will install and enable the extension
   - Restart VS Code if prompted
   - Verify installation using the Command Palette

### Method 3: Command Line Installation

#### For CI/CD or Automated Setups
```bash
# Using VS Code CLI
code --install-extension ado-pr-reviewer-1.0.0.vsix

# Or using the extension identifier (if published)
code --install-extension company.ado-pr-reviewer
```

## ⚙️ Configuration Setup

### Step 1: Initial Configuration

#### Using the Setup Wizard
1. **Launch Setup**:
   - Click the Azure DevOps icon in Activity Bar
   - Or press `Ctrl+Shift+P` and type "Azure DevOps: Configure"

2. **Organization URL**:
   ```
   Enter your Azure DevOps organization URL:

   Examples:
   - https://dev.azure.com/contoso
   - https://contoso.visualstudio.com
   ```

3. **Project Name**:
   ```
   Enter your Azure DevOps project name:

   Example:
   - MyProject
   - Web Application
   - Mobile-App
   ```

4. **Refresh Interval**:
   ```
   Set auto-refresh interval in seconds:
   - 0 = Disabled (manual refresh only)
   - 300 = 5 minutes (recommended)
   - 600 = 10 minutes
   - 1800 = 30 minutes
   ```

#### Manual Configuration via Settings

Open VS Code Settings (`Ctrl+,`) and search for "Azure DevOps":

```json
{
  // Azure DevOps organization URL
  "azureDevOps.organizationUrl": "https://dev.azure.com/your-organization",

  // Azure DevOps project name
  "azureDevOps.project": "your-project-name",

  // Auto-refresh interval in seconds
  "azureDevOps.refreshInterval": 300,

  // Enable telemetry collection
  "azureDevOps.telemetry.enabled": true,

  // Allow sensitive data collection for troubleshooting
  "azureDevOps.telemetry.allowSensitiveData": false
}
```

### Step 2: Authentication Setup

#### Generate Personal Access Token (PAT)

1. **Navigate to Azure DevOps**:
   - Go to your Azure DevOps organization: `https://dev.azure.com/your-organization`
   - Sign in with your account

2. **Access Security Settings**:
   - Click your profile picture in the top-right corner
   - Select **Security** (or **User settings** → **Security**)

3. **Create New PAT**:
   - Under **Personal access tokens**, click **+ New Token**
   - Fill in the token details:
     ```
     Name: VS Code PR Reviewer
     Expiration: 90 days (recommended)
     Scopes:
       ✓ Code (Read)
       ✓ Pull Request (Read & Write)
       ✓ Work Items (Read)
     ```
   - Click **Create**

4. **Copy the Token**:
   - **Important**: Copy the token immediately - you won't see it again
   - Store it securely (password manager recommended)

#### Configure Authentication in VS Code

1. **First-Time Setup**:
   - The extension will automatically prompt for authentication
   - Paste your PAT when prompted
   - The token is securely stored using VS Code's Secret Storage API

2. **Manual Authentication**:
   ```bash
   # Via command palette
   Ctrl+Shift+P → "Azure DevOps: Authenticate"

   # The extension will guide you through the process
   ```

3. **Verify Authentication**:
   - Open the Azure DevOps sidebar
   - You should see your repositories and pull requests
   - If you see authentication errors, re-enter your PAT

### Step 3: Multi-Organization Setup

#### Configure Multiple Organizations

1. **Primary Organization** (Default):
   - Set up as described above
   - This becomes your default workspace

2. **Additional Organizations**:
   ```json
   // In VS Code settings
   {
     "azureDevOps.additionalOrganizations": [
       {
         "name": "Client A",
         "url": "https://dev.azure.com/client-a",
         "project": "client-project"
       },
       {
         "name": "Client B",
         "url": "https://client-b.visualstudio.com",
         "project": "web-app"
       }
     ]
   }
   ```

3. **Switching Between Organizations**:
   - Use the organization switcher in the sidebar
   - Or use command palette: "Azure DevOps: Switch Organization"

## 🔍 Verification and Testing

### Post-Installation Checklist

#### ✅ Basic Functionality
- [ ] Extension appears in Activity Bar
- [ ] Command palette shows Azure DevOps commands
- [ ] No error messages on startup
- [ ] Extension loads without crashing

#### ✅ Authentication
- [ ] PAT successfully accepted
- [ ] Repositories appear in sidebar
- [ ] Pull requests load correctly
- [ ] User avatar/name displays properly

#### ✅ Core Features
- [ ] Can open PR detail view
- [ ] File diffs display correctly
- [ ] Comments load and display
- [ ] Actions (approve/reject) work

#### ✅ Performance
- [ ] Initial load < 5 seconds
- [ ] PR details load < 3 seconds
- [ ] No excessive memory usage
- [ ] Smooth scrolling and navigation

### Troubleshooting Installation Issues

#### Extension Won't Install
```bash
# Clear VS Code extension cache
rm -rf ~/.vscode/extensions/ado-pr-reviewer*

# Restart VS Code and retry installation
code --reload-window
```

#### Authentication Errors
```bash
# Clear stored credentials
Ctrl+Shift+P → "Azure DevOps: Clear Authentication"

# Re-authenticate with fresh PAT
Ctrl+Shift+P → "Azure DevOps: Authenticate"
```

#### Network/Connectivity Issues
```bash
# Test Azure DevOps connectivity
curl -I https://dev.azure.com

# Check if VS Code can reach the API
# Look for network errors in VS Code developer console (Help → Toggle Developer Tools)
```

## 🛠️ Advanced Configuration

### Workspace-Specific Settings

Create `.vscode/settings.json` in your project:

```json
{
  "azureDevOps.project": "specific-project-name",
  "azureDevOps.refreshInterval": 180,
  "azureDevOps.telemetry.enabled": false
}
```

### Enterprise/Team Setup

#### Shared Configuration
```json
// In team-wide VS Code settings
{
  "azureDevOps.organizationUrl": "https://dev.azure.com/company",
  "azureDevOps.refreshInterval": 300,
  "azureDevOps.telemetry.enabled": true
}
```

#### User-Specific Overrides
```json
// In user settings
{
  "azureDevOps.project": "personal-project",
  "azureDevOps.telemetry.allowSensitiveData": true
}
```

### Proxy and Network Configuration

#### HTTP Proxy Setup
```json
{
  "http.proxy": "http://proxy.company.com:8080",
  "http.proxyStrictSSL": false,
  "azureDevOps.organizationUrl": "https://dev.azure.com/company"
}
```

#### SSL Certificate Issues
```json
{
  "http.caCertificates": [
    "/path/to/cert.pem"
  ]
}
```

## 🔄 Updates and Maintenance

### Auto-Update Configuration
- VS Code automatically checks for extension updates
- Updates are installed in the background
- You may need to restart VS Code after major updates

### Manual Update
```bash
# Check for updates
Ctrl+Shift+P → "Extensions: Check for Updates"

# Manual update from VSIX
code --uninstall-extension company.ado-pr-reviewer
code --install-extension ado-pr-reviewer-new-version.vsix
```

### Migration and Backup

#### Export Configuration
```json
// Save your settings for backup or sharing
{
  "azureDevOps.organizationUrl": "https://dev.azure.com/org",
  "azureDevOps.project": "project",
  "azureDevOps.refreshInterval": 300
}
```

#### Import Configuration
- Copy settings to new VS Code installation
- Re-authenticate (PATs are stored securely per machine)

---

## 📞 Support and Resources

### Getting Help
- **Built-in Help**: `F1` → "Azure DevOps: Show Help"
- **Command Reference**: `Ctrl+Shift+P` → "Azure DevOps: Show Commands"
- **Settings Help**: Hover over any setting in VS Code settings

### Documentation
- [User Guide](getting-started.md) - Complete user documentation
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
- [FAQ](faq.md) - Frequently asked questions

### Community
- [GitHub Issues](https://github.com/your-org/ado-pr-review/issues) - Bug reports
- [GitHub Discussions](https://github.com/your-org/ado-pr-review/discussions) - Community support
- [Stack Overflow](https://stackoverflow.com) - Use tag `azure-devops-pr-reviewer`

Happy reviewing! 🚀