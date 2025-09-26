/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Logging utility for the Azure DevOps PR Reviewer extension
 * Provides structured logging with different log levels
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Log debug message
   */
  public debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * Log info message
   */
  public info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  /**
   * Log warning message
   */
  public warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * Log error message
   */
  public error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  /**
   * Internal logging method
   */
  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${this.context}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(formattedMessage, ...args);
        }
        break;
      case 'info':
        console.info(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'error':
        console.error(formattedMessage, ...args);
        break;
      default:
        console.log(formattedMessage, ...args);
    }
  }
}