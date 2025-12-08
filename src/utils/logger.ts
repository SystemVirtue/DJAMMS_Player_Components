/**
 * Unified logging utility for DJAMMS Player
 * 
 * Provides consistent logging across Electron main process, renderer process, and web apps.
 * Supports different log levels and can forward logs to Electron main process when available.
 * Handles EPIPE errors gracefully when streams are closed.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Safe console wrapper that catches EPIPE and other stream errors
 */
const safeConsole = {
  debug: (...args: any[]) => {
    try {
      console.debug(...args);
    } catch (e: any) {
      // Suppress EPIPE and other stream errors (stream closed)
      if (e?.code !== 'EPIPE' && e?.code !== 'ENOTCONN') {
        // Only log if it's not a stream error
        try {
          console.error('[Logger] Failed to log:', e.message);
        } catch {
          // Stream is completely closed, ignore
        }
      }
    }
  },
  log: (...args: any[]) => {
    try {
      console.log(...args);
    } catch (e: any) {
      if (e?.code !== 'EPIPE' && e?.code !== 'ENOTCONN') {
        try {
          console.error('[Logger] Failed to log:', e.message);
        } catch {
          // Ignore
        }
      }
    }
  },
  warn: (...args: any[]) => {
    try {
      console.warn(...args);
    } catch (e: any) {
      if (e?.code !== 'EPIPE' && e?.code !== 'ENOTCONN') {
        try {
          console.error('[Logger] Failed to warn:', e.message);
        } catch {
          // Ignore
        }
      }
    }
  },
  error: (...args: any[]) => {
    try {
      console.error(...args);
    } catch (e: any) {
      // Suppress EPIPE errors (stream closed) - this is expected during shutdown
      if (e?.code !== 'EPIPE' && e?.code !== 'ENOTCONN') {
        // Only try to log if it's not a stream error
        // But don't recurse if console.error itself fails
      }
    }
  }
};

interface LoggerConfig {
  /** Prefix for all log messages */
  prefix?: string;
  /** Minimum log level to output */
  minLevel?: LogLevel;
  /** Whether to forward logs to Electron main process (renderer only) */
  forwardToMain?: boolean;
}

class Logger {
  private prefix: string;
  private minLevel: LogLevel;
  private forwardToMain: boolean;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config: LoggerConfig = {}) {
    this.prefix = config.prefix || '[DJAMMS]';
    this.minLevel = config.minLevel || 'debug';
    this.forwardToMain = config.forwardToMain ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatMessage(level: LogLevel, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `${this.prefix} [${timestamp}] [${level.toUpperCase()}]`;
  }

  private logToElectronMain(level: LogLevel, ...args: any[]): void {
    // Check if we're in Electron renderer process
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        (window as any).electronAPI.send('renderer-log', { level, args });
      } catch (e) {
        // Silently fail if IPC not available
      }
    }
  }

  debug(...args: any[]): void {
    if (!this.shouldLog('debug')) return;
    const message = this.formatMessage('debug', ...args);
    safeConsole.debug(message, ...args);
    if (this.forwardToMain) this.logToElectronMain('debug', ...args);
  }

  info(...args: any[]): void {
    if (!this.shouldLog('info')) return;
    const message = this.formatMessage('info', ...args);
    safeConsole.log(message, ...args);
    if (this.forwardToMain) this.logToElectronMain('log', ...args);
  }

  warn(...args: any[]): void {
    if (!this.shouldLog('warn')) return;
    const message = this.formatMessage('warn', ...args);
    safeConsole.warn(message, ...args);
    if (this.forwardToMain) this.logToElectronMain('warn', ...args);
  }

  error(...args: any[]): void {
    if (!this.shouldLog('error')) return;
    const message = this.formatMessage('error', ...args);
    safeConsole.error(message, ...args);
    if (this.forwardToMain) this.logToElectronMain('error', ...args);
  }

  /**
   * Log with context (useful for debugging specific features)
   */
  withContext(context: string): Logger {
    return new Logger({
      prefix: `${this.prefix} [${context}]`,
      minLevel: this.minLevel,
      forwardToMain: this.forwardToMain
    });
  }
}

// Create default logger instance
export const logger = new Logger({
  prefix: '[DJAMMS]',
  minLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});

// Export Logger class for custom instances
export { Logger };
export type { LogLevel, LoggerConfig };

