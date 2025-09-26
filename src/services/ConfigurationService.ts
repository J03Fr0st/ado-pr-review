import * as vscode from "vscode";

/**
 * Azure DevOps extension configuration interface
 */
export interface AzureDevOpsConfiguration {
  readonly organizationUrl: string;
  readonly project: string;
  readonly refreshInterval: number;
  readonly telemetry: {
    readonly enabled: boolean;
    readonly allowSensitiveData: boolean;
  };
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

/**
 * Configuration management service for Azure DevOps extension settings
 *
 * Handles VS Code settings, configuration validation, and provides
 * typed access to extension configuration with change notifications.
 *
 * Configuration namespace: azureDevOps.*
 */
export class ConfigurationService {
  private static readonly SECTION = "azureDevOps";
  private readonly changeEmitter =
    new vscode.EventEmitter<AzureDevOpsConfiguration>();

  constructor() {
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(
      this.onConfigurationChanged,
      this
    );
  }

  /**
   * Event fired when configuration changes
   */
  readonly onDidChangeConfiguration = this.changeEmitter.event;

  /**
   * Get current Azure DevOps configuration with defaults
   *
   * @returns Current configuration with all required properties
   */
  getConfiguration(): AzureDevOpsConfiguration {
    const config = vscode.workspace.getConfiguration(
      ConfigurationService.SECTION
    );

    return {
      organizationUrl: this.normalizeOrganizationUrl(
        config.get<string>("organizationUrl") || ""
      ),
      project: config.get<string>("project") || "",
      refreshInterval: config.get<number>("refreshInterval") || 300,
      telemetry: {
        enabled: config.get<boolean>("telemetry.enabled") ?? true,
        allowSensitiveData:
          config.get<boolean>("telemetry.allowSensitiveData") ?? false,
      },
    };
  }

  /**
   * Validate current configuration
   *
   * @returns Validation result with errors and warnings
   */
  validateConfiguration(): ConfigValidationResult {
    const config = this.getConfiguration();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate organization URL
    if (!config.organizationUrl) {
      errors.push("Organization URL is required");
    } else if (!this.isValidOrganizationUrl(config.organizationUrl)) {
      errors.push(
        "Invalid organization URL format. Expected: https://dev.azure.com/myorg or https://myorg.visualstudio.com"
      );
    }

    // Validate project
    if (!config.project) {
      errors.push("Project name is required");
    } else if (!this.isValidProjectName(config.project)) {
      errors.push(
        "Invalid project name. Must be alphanumeric with spaces, hyphens, or underscores"
      );
    }

    // Validate refresh interval
    if (config.refreshInterval < 0) {
      errors.push("Refresh interval cannot be negative");
    } else if (config.refreshInterval > 0 && config.refreshInterval < 30) {
      warnings.push(
        "Refresh interval less than 30 seconds may impact performance"
      );
    }

    // Validate telemetry settings
    if (config.telemetry.allowSensitiveData && !config.telemetry.enabled) {
      warnings.push(
        "Sensitive data collection is enabled but telemetry is disabled"
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Update configuration setting
   *
   * @param key Configuration key (without azureDevOps prefix)
   * @param value New value
   * @param target Configuration target (global or workspace)
   * @returns Promise that resolves when update is complete
   */
  async updateConfiguration<T>(
    key: string,
    value: T,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ConfigurationService.SECTION
    );
    await config.update(key, value, target);
  }

  /**
   * Check if extension is configured and ready to use
   *
   * @returns True if all required configuration is present and valid
   */
  isConfigured(): boolean {
    const validation = this.validateConfiguration();
    return validation.isValid;
  }

  /**
   * Get organization URL with proper formatting
   *
   * @returns Normalized organization URL or empty string if not configured
   */
  getOrganizationUrl(): string {
    return this.getConfiguration().organizationUrl;
  }

  /**
   * Get project name
   *
   * @returns Project name or empty string if not configured
   */
  getProject(): string {
    return this.getConfiguration().project;
  }

  /**
   * Get refresh interval in seconds
   *
   * @returns Refresh interval (0 means disabled)
   */
  getRefreshInterval(): number {
    return this.getConfiguration().refreshInterval;
  }

  /**
   * Check if telemetry is enabled
   *
   * @returns True if telemetry collection is enabled
   */
  isTelemetryEnabled(): boolean {
    return this.getConfiguration().telemetry.enabled;
  }

  /**
   * Check if sensitive data collection is allowed
   *
   * @returns True if sensitive data collection is permitted
   */
  isSensitiveDataAllowed(): boolean {
    const config = this.getConfiguration();
    return config.telemetry.enabled && config.telemetry.allowSensitiveData;
  }

  /**
   * Get configuration for display in UI
   *
   * @returns Configuration summary for user display
   */
  getConfigurationSummary(): string {
    const config = this.getConfiguration();
    const validation = this.validateConfiguration();

    if (!validation.isValid) {
      return `Configuration incomplete: ${validation.errors.join(", ")}`;
    }

    const orgName = this.extractOrganizationName(config.organizationUrl);
    const refreshText =
      config.refreshInterval === 0 ? "disabled" : `${config.refreshInterval}s`;

    return `${orgName}/${config.project} (refresh: ${refreshText})`;
  }

  /**
   * Reset configuration to defaults
   *
   * @returns Promise that resolves when reset is complete
   */
  async resetConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ConfigurationService.SECTION
    );
    const keys = [
      "organizationUrl",
      "project",
      "refreshInterval",
      "telemetry.enabled",
      "telemetry.allowSensitiveData",
    ];

    for (const key of keys) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Handle configuration changes and notify listeners
   *
   * @param event Configuration change event
   */
  private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(ConfigurationService.SECTION)) {
      const newConfig = this.getConfiguration();
      this.changeEmitter.fire(newConfig);
    }
  }

  /**
   * Normalize organization URL to standard format
   *
   * @param url Raw organization URL
   * @returns Normalized URL or empty string if invalid
   */
  private normalizeOrganizationUrl(url: string): string {
    if (!url) {
      return "";
    }

    // Remove trailing slash
    url = url.replace(/\/$/, "");

    // Convert visualstudio.com format to dev.azure.com
    const vsMatch = url.match(/^https:\/\/([^\.]+)\.visualstudio\.com$/);
    if (vsMatch) {
      return `https://dev.azure.com/${vsMatch[1]}`;
    }

    // Validate dev.azure.com format
    if (url.match(/^https:\/\/dev\.azure\.com\/[^\/]+$/)) {
      return url;
    }

    // Return original if it might be valid but not standard format
    return url;
  }

  /**
   * Validate organization URL format
   *
   * @param url Organization URL to validate
   * @returns True if URL format is valid
   */
  private isValidOrganizationUrl(url: string): boolean {
    if (!url) {
      return false;
    }

    // Check for dev.azure.com or visualstudio.com formats
    return /^https:\/\/(dev\.azure\.com\/[^\/]+|[^\.\/]+\.visualstudio\.com)$/.test(
      url
    );
  }

  /**
   * Validate project name format
   *
   * @param projectName Project name to validate
   * @returns True if project name is valid
   */
  private isValidProjectName(projectName: string): boolean {
    if (!projectName) {
      return false;
    }

    // Azure DevOps project names can contain letters, numbers, spaces, hyphens, underscores
    // Length between 1-64 characters
    return /^[a-zA-Z0-9\s\-_]{1,64}$/.test(projectName);
  }

  /**
   * Extract organization name from URL for display
   *
   * @param url Organization URL
   * @returns Organization name or full URL if extraction fails
   */
  private extractOrganizationName(url: string): string {
    const match = url.match(
      /dev\.azure\.com\/([^\/]+)|([^\.]+)\.visualstudio\.com/
    );
    return match ? match[1] || match[2] : url;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.changeEmitter.dispose();
  }
}
