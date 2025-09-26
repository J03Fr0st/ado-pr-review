import * as vscode from "vscode";
import { TelemetryService } from "../services/TelemetryService";

/**
 * Error severity levels for categorization and handling
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Error categories for better classification
 */
export enum ErrorCategory {
  AUTHENTICATION = "authentication",
  NETWORK = "network",
  CONFIGURATION = "configuration",
  API = "api",
  UI = "ui",
  INTERNAL = "internal",
}

/**
 * Structured error information for consistent handling
 */
export interface ErrorInfo {
  readonly message: string;
  readonly code: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly context?: Record<string, any> | undefined;
  readonly originalError?: Error | undefined;
  readonly userAction?: string | undefined;
  readonly timestamp: Date;
}

/**
 * Error handling options
 */
export interface ErrorHandlingOptions {
  readonly showToUser?: boolean;
  readonly logToTelemetry?: boolean;
  readonly includeContext?: boolean;
  readonly userActionRequired?: boolean;
}

/**
 * Central error handling service with security-conscious logging
 *
 * Provides consistent error handling across the extension with:
 * - Security-safe error messages (no PAT exposure)
 * - Categorized error levels and types
 * - User-friendly error presentation
 * - Telemetry integration with privacy controls
 * - Context-aware error recovery suggestions
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private readonly errors: ErrorInfo[] = [];
  private readonly maxErrorHistory = 100;

  private constructor(private readonly telemetryService?: TelemetryService) {}

  /**
   * Get singleton instance of ErrorHandler
   *
   * @param telemetryService Optional telemetry service for error reporting
   * @returns ErrorHandler instance
   */
  static getInstance(telemetryService?: TelemetryService): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler(telemetryService);
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle an error with full context and user feedback
   *
   * @param error Error object or message
   * @param category Error category for classification
   * @param severity Error severity level
   * @param options Handling options including user notification
   * @param context Additional context information
   * @returns Promise that resolves when error handling is complete
   */
  async handleError(
    error: Error | string,
    category: ErrorCategory = ErrorCategory.INTERNAL,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    options: ErrorHandlingOptions = {},
    context?: Record<string, any>
  ): Promise<void> {
    const errorInfo = this.createErrorInfo(error, category, severity, context);

    // Add to error history
    this.addToHistory(errorInfo);

    // Log to telemetry if enabled and appropriate
    if (options.logToTelemetry !== false && this.telemetryService) {
      await this.logToTelemetry(errorInfo, options.includeContext);
    }

    // Show to user if requested
    if (options.showToUser !== false) {
      await this.showToUser(errorInfo, options.userActionRequired);
    }

    // Log to VS Code output channel for debugging
    this.logToOutput(errorInfo);
  }

  /**
   * Handle authentication-specific errors with security considerations
   *
   * @param error Authentication error
   * @param context Additional context (will be sanitized)
   * @returns Promise that resolves when handling is complete
   */
  async handleAuthenticationError(
    error: Error | string,
    context?: Record<string, any>
  ): Promise<void> {
    // Sanitize context to remove any potential PAT exposure
    const sanitizedContext = this.sanitizeContext(context);

    await this.handleError(
      error,
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.HIGH,
      {
        showToUser: true,
        logToTelemetry: true,
        includeContext: false, // Never include context for auth errors
        userActionRequired: true,
      },
      sanitizedContext
    );
  }

  /**
   * Handle API errors with proper user messaging
   *
   * @param error API error response
   * @param context Request context (will be sanitized)
   * @returns Promise that resolves when handling is complete
   */
  async handleApiError(
    error: Error | string,
    context?: Record<string, any>
  ): Promise<void> {
    const sanitizedContext = this.sanitizeContext(context);

    await this.handleError(
      error,
      ErrorCategory.API,
      ErrorSeverity.MEDIUM,
      {
        showToUser: true,
        logToTelemetry: true,
        includeContext: true,
        userActionRequired: false,
      },
      sanitizedContext
    );
  }

  /**
   * Handle configuration errors with user guidance
   *
   * @param error Configuration error
   * @param context Configuration context
   * @returns Promise that resolves when handling is complete
   */
  async handleConfigurationError(
    error: Error | string,
    context?: Record<string, any>
  ): Promise<void> {
    await this.handleError(
      error,
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.HIGH,
      {
        showToUser: true,
        logToTelemetry: true,
        includeContext: true,
        userActionRequired: true,
      },
      context
    );
  }

  /**
   * Get recent error history for debugging
   *
   * @param category Optional category filter
   * @param limit Maximum number of errors to return
   * @returns Array of recent error information
   */
  getRecentErrors(category?: ErrorCategory, limit: number = 10): ErrorInfo[] {
    let errors = this.errors;

    if (category) {
      errors = errors.filter((e) => e.category === category);
    }

    return errors.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errors.length = 0;
  }

  /**
   * Get error statistics for monitoring
   *
   * @returns Error statistics by category and severity
   */
  getErrorStats(): Record<string, Record<string, number>> {
    const stats: Record<string, Record<string, number>> = {};

    for (const error of this.errors) {
      if (!stats[error.category]) {
        stats[error.category] = {};
      }
      if (!stats[error.category][error.severity]) {
        stats[error.category][error.severity] = 0;
      }
      stats[error.category][error.severity]++;
    }

    return stats;
  }

  /**
   * Create structured error information from error input
   *
   * @param error Error object or message
   * @param category Error category
   * @param severity Error severity
   * @param context Additional context
   * @returns Structured error information
   */
  private createErrorInfo(
    error: Error | string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context?: Record<string, any>
  ): ErrorInfo {
    const message = typeof error === "string" ? error : error.message;
    const originalError = typeof error === "string" ? undefined : error;

    // Generate error code based on category and message
    const code = this.generateErrorCode(category, message);

    // Generate user action suggestion
    const userAction = this.generateUserAction(category, severity, message);

    return {
      message: this.sanitizeErrorMessage(message),
      code,
      category,
      severity,
      context: this.sanitizeContext(context),
      originalError,
      userAction,
      timestamp: new Date(),
    };
  }

  /**
   * Add error to history with size management
   *
   * @param errorInfo Error information to add
   */
  private addToHistory(errorInfo: ErrorInfo): void {
    this.errors.push(errorInfo);

    // Maintain history size limit
    if (this.errors.length > this.maxErrorHistory) {
      this.errors.splice(0, this.errors.length - this.maxErrorHistory);
    }
  }

  /**
   * Log error to telemetry service with privacy controls
   *
   * @param errorInfo Error information
   * @param includeContext Whether to include context data
   */
  private async logToTelemetry(
    errorInfo: ErrorInfo,
    includeContext = false
  ): Promise<void> {
    if (!this.telemetryService) {
      return;
    }

    const telemetryData: Record<string, any> = {
      errorCode: errorInfo.code,
      category: errorInfo.category,
      severity: errorInfo.severity,
      message: errorInfo.message,
    };

    if (includeContext && errorInfo.context) {
      telemetryData.context = errorInfo.context;
    }

    try {
      this.telemetryService.trackEvent("error", telemetryData);
    } catch (telemetryError) {
      // Don't fail the original error handling if telemetry fails
      console.warn("Failed to log error to telemetry:", telemetryError);
    }
  }

  /**
   * Show error to user with appropriate UI element
   *
   * @param errorInfo Error information
   * @param actionRequired Whether user action is required
   */
  private async showToUser(
    errorInfo: ErrorInfo,
    actionRequired = false
  ): Promise<void> {
    const message = errorInfo.userAction
      ? `${errorInfo.message}\n\n${errorInfo.userAction}`
      : errorInfo.message;

    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        if (actionRequired) {
          const action = await vscode.window.showErrorMessage(
            message,
            "Open Settings",
            "Report Issue"
          );
          await this.handleUserAction(action, errorInfo);
        } else {
          vscode.window.showErrorMessage(message);
        }
        break;

      case ErrorSeverity.MEDIUM:
        vscode.window.showWarningMessage(message);
        break;

      case ErrorSeverity.LOW:
        vscode.window.showInformationMessage(message);
        break;
    }
  }

  /**
   * Handle user action responses from error dialogs
   *
   * @param action User selected action
   * @param errorInfo Error information context
   */
  private async handleUserAction(
    action: string | undefined,
    errorInfo: ErrorInfo
  ): Promise<void> {
    switch (action) {
      case "Open Settings":
        if (errorInfo.category === ErrorCategory.CONFIGURATION) {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "azureDevOps"
          );
        } else {
          vscode.commands.executeCommand("azureDevOps.configure");
        }
        break;

      case "Report Issue":
        const issueUrl = "https://github.com/company/ado-pr-review/issues/new";
        vscode.env.openExternal(vscode.Uri.parse(issueUrl));
        break;
    }
  }

  /**
   * Log error to VS Code output channel
   *
   * @param errorInfo Error information
   */
  private logToOutput(errorInfo: ErrorInfo): void {
    const outputChannel = vscode.window.createOutputChannel(
      "Azure DevOps PR Reviewer"
    );

    const logMessage = [
      `[${errorInfo.timestamp.toISOString()}] ${errorInfo.severity.toUpperCase()}: ${
        errorInfo.category
      }`,
      `Code: ${errorInfo.code}`,
      `Message: ${errorInfo.message}`,
      errorInfo.context
        ? `Context: ${JSON.stringify(errorInfo.context, null, 2)}`
        : "",
      errorInfo.originalError ? `Stack: ${errorInfo.originalError.stack}` : "",
      "---",
    ]
      .filter(Boolean)
      .join("\n");

    outputChannel.appendLine(logMessage);
  }

  /**
   * Sanitize error message to remove sensitive information
   *
   * @param message Original error message
   * @returns Sanitized error message
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove potential PAT tokens (pattern: base64-like strings)
    return message
      .replace(/[A-Za-z0-9+/]{20,}={0,2}/g, "[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
      .replace(/Basic\s+[A-Za-z0-9+/]+=*/gi, "Basic [REDACTED]");
  }

  /**
   * Sanitize context data to remove sensitive information
   *
   * @param context Original context object
   * @returns Sanitized context object
   */
  private sanitizeContext(
    context?: Record<string, any>
  ): Record<string, any> | undefined {
    if (!context) {
      return undefined;
    }

    const sanitized = { ...context };

    // Remove sensitive keys
    const sensitiveKeys = [
      "token",
      "pat",
      "password",
      "secret",
      "key",
      "authorization",
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof sanitized[key] === "string") {
        sanitized[key] = this.sanitizeErrorMessage(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Generate error code based on category and message
   *
   * @param category Error category
   * @param message Error message
   * @returns Generated error code
   */
  private generateErrorCode(category: ErrorCategory, message: string): string {
    const categoryPrefix = category.toUpperCase().substring(0, 3);
    const messageHash = this.simpleHash(message);
    return `${categoryPrefix}_${messageHash}`;
  }

  /**
   * Generate user action suggestion based on error context
   *
   * @param category Error category
   * @param severity Error severity
   * @param message Error message
   * @returns User action suggestion
   */
  private generateUserAction(
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string
  ): string {
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        return "Please check your Personal Access Token in the extension settings.";

      case ErrorCategory.CONFIGURATION:
        return "Please review your Azure DevOps connection settings.";

      case ErrorCategory.NETWORK:
        return "Please check your internet connection and try again.";

      case ErrorCategory.API:
        if (message.toLowerCase().includes("rate limit")) {
          return "API rate limit reached. Please wait a moment before trying again.";
        }
        return "Please try again in a few moments. If the problem persists, check Azure DevOps service status.";

      case ErrorCategory.UI:
        return "Please refresh the view or restart VS Code if the problem persists.";

      default:
        return severity === ErrorSeverity.CRITICAL ||
          severity === ErrorSeverity.HIGH
          ? "Please report this issue if it continues to occur."
          : "Please try the operation again.";
    }
  }

  /**
   * Simple hash function for error code generation
   *
   * @param input Input string to hash
   * @returns Hash value as string
   */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6).toUpperCase();
  }
}
