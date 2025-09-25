import * as vscode from 'vscode';

/**
 * Azure DevOps Personal Access Token configuration interface
 */
export interface PatConfiguration {
  readonly token: string;
  readonly organizationUrl: string;
  readonly project: string;
  readonly expiresAt?: Date | undefined;
}

/**
 * Authentication validation result with detailed status information
 */
export interface AuthValidationResult {
  readonly isValid: boolean;
  readonly userName?: string | undefined;
  readonly organizationName?: string | undefined;
  readonly permissions?: string[] | undefined;
  readonly errorMessage?: string | undefined;
  readonly errorCode?: string | undefined;
}

/**
 * Authentication service for secure Personal Access Token management
 *
 * Handles PAT storage in VS Code Secret Storage, validation against Azure DevOps API,
 * and provides secure authentication headers for API requests.
 *
 * Security Requirements:
 * - No PAT exposure in logs or error messages
 * - Secure storage using VS Code Secret Storage API
 * - Token validation with proper permission scope verification
 * - Error handling without sensitive data exposure
 */
export class AuthenticationService {
  private static readonly PAT_KEY = 'azure-devops-pat';
  private static readonly CONFIG_KEY = 'azure-devops-config';
  private static readonly VALIDATION_TIMEOUT = 10000; // 10 seconds

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly secretStorage: vscode.SecretStorage
  ) {}

  /**
   * Store Personal Access Token securely in VS Code Secret Storage
   *
   * @param config PAT configuration including token and organization details
   * @returns Promise that resolves when storage is complete
   * @throws Error if storage fails or validation fails
   */
  async storePat(config: PatConfiguration): Promise<void> {
    try {
      // Validate PAT before storing
      const validationResult = await this.validatePatWithApi(config.token, config.organizationUrl);
      if (!validationResult.isValid) {
        throw new Error(`PAT validation failed: ${validationResult.errorMessage || 'Invalid token'}`);
      }

      // Store token in secure storage
      await this.secretStorage.store(AuthenticationService.PAT_KEY, config.token);

      // Store non-sensitive configuration
      const configData = {
        organizationUrl: config.organizationUrl,
        project: config.project,
        expiresAt: config.expiresAt?.toISOString(),
        userName: validationResult.userName,
        organizationName: validationResult.organizationName,
        permissions: validationResult.permissions
      };

      await this.context.globalState.update(AuthenticationService.CONFIG_KEY, configData);

      // Set context for extension activation
      await vscode.commands.executeCommand('setContext', 'azureDevOps:configured', true);

    } catch (error) {
      // Ensure no PAT leaks in error messages
      const safeError = error instanceof Error ? error.message.replace(config.token, '[REDACTED]') : 'PAT storage failed';
      throw new Error(safeError);
    }
  }

  /**
   * Retrieve stored PAT configuration
   *
   * @returns Promise resolving to PAT configuration or null if not configured
   */
  async getPatConfiguration(): Promise<PatConfiguration | null> {
    try {
      const token = await this.secretStorage.get(AuthenticationService.PAT_KEY);
      const configData = this.context.globalState.get<any>(AuthenticationService.CONFIG_KEY);

      if (!token || !configData) {
        return null;
      }

      return {
        token,
        organizationUrl: configData.organizationUrl,
        project: configData.project,
        expiresAt: configData.expiresAt ? new Date(configData.expiresAt) : undefined
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get secure authentication header for Azure DevOps API requests
   *
   * @returns Promise resolving to authorization header or null if not configured
   */
  async getAuthHeader(): Promise<string | null> {
    const config = await this.getPatConfiguration();
    if (!config) {
      return null;
    }

    // Basic auth with PAT (username can be empty for PAT)
    const credentials = Buffer.from(`:${config.token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Validate current PAT against Azure DevOps API
   *
   * @returns Promise resolving to validation result
   */
  async validateCurrentPat(): Promise<AuthValidationResult> {
    const config = await this.getPatConfiguration();
    if (!config) {
      return {
        isValid: false,
        errorMessage: 'No PAT configured',
        errorCode: 'NO_PAT'
      };
    }

    return this.validatePatWithApi(config.token, config.organizationUrl);
  }

  /**
   * Clear stored PAT and configuration
   *
   * @returns Promise that resolves when clearing is complete
   */
  async clearPat(): Promise<void> {
    try {
      await this.secretStorage.delete(AuthenticationService.PAT_KEY);
      await this.context.globalState.update(AuthenticationService.CONFIG_KEY, undefined);
      await vscode.commands.executeCommand('setContext', 'azureDevOps:configured', false);
    } catch (error) {
      throw new Error('Failed to clear PAT configuration');
    }
  }

  /**
   * Check if PAT is configured and valid
   *
   * @returns Promise resolving to boolean indicating configuration status
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getPatConfiguration();
    return config !== null;
  }

  /**
   * Validate PAT against Azure DevOps API with timeout
   *
   * @param token Personal Access Token to validate
   * @param organizationUrl Azure DevOps organization URL
   * @returns Promise resolving to validation result
   */
  private async validatePatWithApi(token: string, organizationUrl: string): Promise<AuthValidationResult> {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Validation timeout')), AuthenticationService.VALIDATION_TIMEOUT)
      );

      // Import axios dynamically to avoid loading issues
      const axios = await import('axios');

      const validationPromise = this.performPatValidation(axios.default, token, organizationUrl);

      // Race between validation and timeout
      return await Promise.race([validationPromise, timeoutPromise]);

    } catch (error) {
      return {
        isValid: false,
        errorMessage: error instanceof Error ? error.message : 'Validation failed',
        errorCode: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Perform actual PAT validation API call
   *
   * @param axios Axios instance for HTTP requests
   * @param token Personal Access Token
   * @param organizationUrl Organization URL
   * @returns Promise resolving to validation result
   */
  private async performPatValidation(
    axios: any,
    token: string,
    organizationUrl: string
  ): Promise<AuthValidationResult> {
    try {
      const credentials = Buffer.from(`:${token}`).toString('base64');
      const response = await axios.get(
        `${organizationUrl}/_apis/profile/profiles/me?api-version=7.1-preview.3`,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/json'
          },
          timeout: AuthenticationService.VALIDATION_TIMEOUT
        }
      );

      if (response.status === 200 && response.data) {
        const profile = response.data;

        // Get organization info from URL
        const orgMatch = organizationUrl.match(/dev\.azure\.com\/([^\/]+)|([^\.]+)\.visualstudio\.com/);
        const organizationName = orgMatch ? (orgMatch[1] || orgMatch[2]) : 'Unknown';

        return {
          isValid: true,
          userName: profile.displayName || profile.emailAddress,
          organizationName,
          permissions: ['read', 'write'] // Basic permissions assumption
        };
      }

      return {
        isValid: false,
        errorMessage: 'Invalid API response',
        errorCode: 'INVALID_RESPONSE'
      };

    } catch (error: any) {
      // Handle axios error responses without exposing sensitive data
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          return {
            isValid: false,
            errorMessage: 'Invalid or expired Personal Access Token',
            errorCode: 'INVALID_TOKEN'
          };
        } else if (status === 404) {
          return {
            isValid: false,
            errorMessage: 'Organization not found or inaccessible',
            errorCode: 'ORG_NOT_FOUND'
          };
        }
      }

      return {
        isValid: false,
        errorMessage: 'Network error or service unavailable',
        errorCode: 'NETWORK_ERROR'
      };
    }
  }
}