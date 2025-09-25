import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';

/**
 * Telemetry service for collecting usage analytics and error reporting
 * Respects user privacy preferences and consent
 */
export class TelemetryService {
  private static instance: TelemetryService;
  private reporter: TelemetryReporter | undefined;
  private enabled: boolean = false;
  private readonly extensionId: string;
  private readonly extensionVersion: string;
  private sessionId: string;

  // Telemetry configuration
  private readonly config = {
    // Application Insights key for VS Code extensions
    aiKey: process.env.TELEMETRY_AI_KEY || 'your-ai-key-here',

    // Events that require user consent
    sensitiveEvents: [
      'error.api',
      'error.authentication',
      'configuration.changed',
      'pr.details.viewed'
    ],

    // Anonymize certain data
    anonymizeFields: ['organizationUrl', 'project', 'userDisplayName'],

    // Rate limiting to prevent spam
    maxEventsPerMinute: 60,
    maxErrorsPerMinute: 10
  };

  private eventCounts = {
    events: 0,
    errors: 0,
    lastReset: Date.now()
  };

  private constructor(extensionId: string, extensionVersion: string) {
    this.extensionId = extensionId;
    this.extensionVersion = extensionVersion;
    this.sessionId = this.generateSessionId();
    this.initializeTelemetry();
  }

  /**
   * Get singleton instance
   */
  static getInstance(extensionId?: string, extensionVersion?: string): TelemetryService {
    if (!TelemetryService.instance) {
      if (!extensionId || !extensionVersion) {
        throw new Error('TelemetryService requires extensionId and extensionVersion on first initialization');
      }
      TelemetryService.instance = new TelemetryService(extensionId, extensionVersion);
    }
    return TelemetryService.instance;
  }

  /**
   * Initialize telemetry reporter and check user preferences
   */
  private initializeTelemetry(): void {
    try {
      // Check VS Code telemetry settings
      const telemetryConfig = vscode.workspace.getConfiguration('telemetry');
      const vsCodeTelemetryEnabled = telemetryConfig.get<string>('telemetryLevel') !== 'off';

      // Check extension-specific setting
      const extensionConfig = vscode.workspace.getConfiguration('azureDevOps');
      const extensionTelemetryEnabled = extensionConfig.get<boolean>('telemetry.enabled', true);

      // Only enable if both VS Code and extension settings allow it
      this.enabled = vsCodeTelemetryEnabled && extensionTelemetryEnabled;

      if (this.enabled && this.config.aiKey !== 'your-ai-key-here') {
        this.reporter = new TelemetryReporter(
          this.extensionId,
          this.extensionVersion,
          this.config.aiKey
        );

        console.log('📊 Telemetry service initialized');
        this.trackEvent('telemetry.initialized', { sessionId: this.sessionId });
      } else {
        console.log('📊 Telemetry disabled by user or not configured');
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize telemetry:', error);
      this.enabled = false;
    }
  }

  /**
   * Track user action or event
   */
  trackEvent(eventName: string, properties: Record<string, string> = {}, measurements: Record<string, number> = {}): void {
    if (!this.shouldTrack(eventName, 'event')) {
      return;
    }

    try {
      const sanitizedProperties = this.sanitizeProperties({
        ...properties,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        version: this.extensionVersion
      });

      this.reporter?.sendTelemetryEvent(eventName, sanitizedProperties, measurements);

      // Log to output channel in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 Event: ${eventName}`, sanitizedProperties, measurements);
      }

      this.updateRateLimit('events');
    } catch (error) {
      console.warn('⚠️ Failed to track event:', error);
    }
  }

  /**
   * Track error with context
   */
  trackError(errorName: string, error: Error | string, properties: Record<string, string> = {}): void {
    if (!this.shouldTrack(errorName, 'error')) {
      return;
    }

    try {
      const errorMessage = error instanceof Error ? error.message : error;
      const errorStack = error instanceof Error ? error.stack : undefined;

      const sanitizedProperties = this.sanitizeProperties({
        ...properties,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        version: this.extensionVersion,
        errorMessage: errorMessage
      });

      const measurements = {
        errorOccurred: 1
      };

      if (errorStack) {
        // Extract useful information from stack trace without exposing paths
        const stackLines = errorStack.split('\n').slice(0, 5);
        sanitizedProperties.errorStack = stackLines
          .map(line => this.sanitizeStackLine(line))
          .join('\n');
      }

      this.reporter?.sendTelemetryErrorEvent(errorName, sanitizedProperties, measurements);

      // Log errors for debugging
      console.error(`📊 Error tracked: ${errorName}`, sanitizedProperties);

      this.updateRateLimit('errors');
    } catch (trackingError) {
      console.warn('⚠️ Failed to track error:', trackingError);
    }
  }

  /**
   * Track command execution
   */
  trackCommand(commandId: string, properties: Record<string, string> = {}): void {
    this.trackEvent('command.executed', {
      commandId,
      ...properties
    });
  }

  /**
   * Track PR operation
   */
  trackPullRequestOperation(operation: string, properties: Record<string, string> = {}): void {
    this.trackEvent('pr.operation', {
      operation,
      ...properties
    }, {
      operationCount: 1
    });
  }

  /**
   * Track performance metrics
   */
  trackPerformance(operation: string, duration: number, success: boolean = true): void {
    this.trackEvent('performance.metric', {
      operation,
      success: success.toString()
    }, {
      duration,
      performanceMetric: 1
    });
  }

  /**
   * Track user configuration changes
   */
  trackConfiguration(settingName: string, newValue: string, oldValue?: string | undefined): void {
    // Only track if user has consented to configuration tracking
    if (!this.hasConsentForSensitiveData()) {
      return;
    }

    this.trackEvent('configuration.changed', {
      settingName,
      newValue: this.anonymizeValue(settingName, newValue),
      oldValue: oldValue ? this.anonymizeValue(settingName, oldValue) : '',
      hasValue: (!!newValue).toString()
    });
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(featureName: string, properties: Record<string, string> = {}): void {
    this.trackEvent('feature.used', {
      featureName,
      ...properties
    }, {
      featureUsage: 1
    });
  }

  /**
   * Track API call metrics
   */
  trackApiCall(endpoint: string, method: string, statusCode: number, duration: number): void {
    this.trackEvent('api.call', {
      endpoint: this.sanitizeEndpoint(endpoint),
      method,
      statusCode: statusCode.toString(),
      success: (statusCode >= 200 && statusCode < 300).toString()
    }, {
      duration,
      apiCall: 1
    });
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if event should be tracked based on rate limiting and user preferences
   */
  private shouldTrack(eventName: string, type: 'event' | 'error'): boolean {
    if (!this.enabled || !this.reporter) {
      return false;
    }

    // Check rate limits
    const rateLimitType = type === 'error' ? 'errors' : 'events';
    if (!this.checkRateLimit(rateLimitType)) {
      return false;
    }

    // Check if event requires special consent
    if (this.config.sensitiveEvents.includes(eventName)) {
      return this.hasConsentForSensitiveData();
    }

    return true;
  }

  /**
   * Check if user has consented to sensitive data collection
   */
  private hasConsentForSensitiveData(): boolean {
    const config = vscode.workspace.getConfiguration('azureDevOps.telemetry');
    return config.get<boolean>('allowSensitiveData', false);
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(type: 'events' | 'errors'): boolean {
    const now = Date.now();
    const minute = 60 * 1000;

    // Reset counters if a minute has passed
    if (now - this.eventCounts.lastReset > minute) {
      this.eventCounts.events = 0;
      this.eventCounts.errors = 0;
      this.eventCounts.lastReset = now;
    }

    // Check limits
    if (type === 'events' && this.eventCounts.events >= this.config.maxEventsPerMinute) {
      return false;
    }

    if (type === 'errors' && this.eventCounts.errors >= this.config.maxErrorsPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Update rate limit counters
   */
  private updateRateLimit(type: 'events' | 'errors'): void {
    if (type === 'events') {
      this.eventCounts.events++;
    } else {
      this.eventCounts.errors++;
    }
  }

  /**
   * Sanitize properties to remove sensitive information
   */
  private sanitizeProperties(properties: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined) continue;

      if (this.config.anonymizeFields.includes(key)) {
        sanitized[key] = this.anonymizeValue(key, value);
      } else {
        sanitized[key] = this.sanitizeValue(value);
      }
    }

    return sanitized;
  }

  /**
   * Anonymize sensitive values
   */
  private anonymizeValue(key: string, value: string): string {
    switch (key) {
      case 'organizationUrl':
        // Keep domain type but anonymize organization name
        if (value.includes('dev.azure.com')) {
          return 'https://dev.azure.com/***';
        } else if (value.includes('visualstudio.com')) {
          return 'https://***.visualstudio.com';
        }
        return '***';

      case 'project':
        return `project_${this.hashString(value)}`;

      case 'userDisplayName':
        return 'user_***';

      default:
        return this.hashString(value);
    }
  }

  /**
   * Sanitize general values
   */
  private sanitizeValue(value: string): string {
    // Remove potential tokens or secrets
    const tokenPattern = /[a-zA-Z0-9]{20,}/g;
    return value.replace(tokenPattern, '***TOKEN***');
  }

  /**
   * Sanitize API endpoints
   */
  private sanitizeEndpoint(endpoint: string): string {
    // Remove organization and project specifics, keep general pattern
    return endpoint
      .replace(/\/[^\/]+\/_apis\//, '/***/_apis/')
      .replace(/pullRequestId=\d+/, 'pullRequestId=***');
  }

  /**
   * Sanitize stack trace lines
   */
  private sanitizeStackLine(line: string): string {
    // Remove file paths, keep function names and line numbers
    return line
      .replace(/\s+at\s+.*[\\/]([^\\/:]+:\d+:\d+)/, '    at ***/$1')
      .replace(/\s+at\s+(.+)\s+\(.*[\\/]([^\\/:]+:\d+:\d+)\)/, '    at $1 (***)/$2');
  }

  /**
   * Simple hash function for anonymization
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Dispose telemetry reporter
   */
  dispose(): void {
    if (this.reporter) {
      console.log('📊 Disposing telemetry service');
      this.trackEvent('telemetry.disposed', { sessionDuration: (Date.now() - parseInt(this.sessionId.split('_')[1])).toString() });
      this.reporter.dispose();
      this.reporter = undefined;
    }
  }

  /**
   * Get telemetry status for debugging
   */
  getStatus(): { enabled: boolean; hasReporter: boolean; sessionId: string; eventCount: number; errorCount: number } {
    return {
      enabled: this.enabled,
      hasReporter: !!this.reporter,
      sessionId: this.sessionId,
      eventCount: this.eventCounts.events,
      errorCount: this.eventCounts.errors
    };
  }

  /**
   * Manually enable/disable telemetry (for testing)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.reporter) {
      this.dispose();
    } else if (enabled && !this.reporter) {
      this.initializeTelemetry();
    }
  }
}