// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';
import { getSupabaseService } from '../services';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentName = this.props.componentName || 'Unknown';
    logger.error(`[ErrorBoundary] Error in ${componentName}:`, error, errorInfo);
    
    // Report to Supabase if available (with retry logic)
    this.reportErrorToSupabase(error, errorInfo, componentName).catch((reportError) => {
      logger.debug('[ErrorBoundary] Error reporting failed after retries:', reportError);
    });

    this.setState({
      error,
      errorInfo
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Report error to Supabase with exponential backoff retry
   */
  private async reportErrorToSupabase(
    error: Error,
    errorInfo: ErrorInfo,
    componentName: string,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<void> {
    const supabaseService = getSupabaseService();
    if (!supabaseService.initialized) {
      // Fallback to localStorage if Supabase unavailable
      try {
        const errorData = {
          component: componentName,
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString()
        };
        const stored = localStorage.getItem('djamms_error_logs') || '[]';
        const logs = JSON.parse(stored);
        logs.push(errorData);
        // Keep only last 10 errors
        const recentLogs = logs.slice(-10);
        localStorage.setItem('djamms_error_logs', JSON.stringify(recentLogs));
        logger.debug('[ErrorBoundary] Error logged to localStorage (Supabase unavailable)');
      } catch (storageError) {
        logger.debug('[ErrorBoundary] Failed to log to localStorage:', storageError);
      }
      return;
    }

    const client = supabaseService.getClient();
    if (!client) {
      return;
    }

    let delay = initialDelayMs;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await client.from('system_events').insert({
          event_type: 'error',
          event_data: {
            component: componentName,
            error: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack
          },
          severity: 'error'
        });

        if (result.error) {
          // If it's a table-not-found error, don't retry
          if (result.error.code === '42P01' || result.error.message?.includes('does not exist')) {
            logger.debug('[ErrorBoundary] system_events table does not exist - skipping');
            return;
          }

          // For other errors, retry with exponential backoff
          if (attempt < maxRetries - 1) {
            logger.debug(`[ErrorBoundary] Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, result.error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
            continue;
          } else {
            // Final attempt failed - fallback to localStorage
            logger.debug('[ErrorBoundary] All retry attempts failed, falling back to localStorage');
            try {
              const errorData = {
                component: componentName,
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                timestamp: new Date().toISOString()
              };
              const stored = localStorage.getItem('djamms_error_logs') || '[]';
              const logs = JSON.parse(stored);
              logs.push(errorData);
              const recentLogs = logs.slice(-10);
              localStorage.setItem('djamms_error_logs', JSON.stringify(recentLogs));
            } catch (storageError) {
              logger.debug('[ErrorBoundary] Failed to log to localStorage:', storageError);
            }
          }
        } else {
          // Success
          return;
        }
      } catch (insertError: any) {
        // Network errors, etc. - retry with exponential backoff
        if (attempt < maxRetries - 1) {
          logger.debug(`[ErrorBoundary] Retry ${attempt + 1}/${maxRetries} after ${delay}ms (exception):`, insertError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        } else {
          // Final attempt failed
          throw insertError;
        }
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '24px',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          borderRadius: '8px',
          border: '1px solid var(--error-color)',
          margin: '16px'
        }}>
          <h2 style={{ color: 'var(--error-color)', marginBottom: '12px' }}>
            Something went wrong
          </h2>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            {this.props.componentName && `Error in ${this.props.componentName}: `}
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginBottom: '16px' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
              <pre style={{
                padding: '12px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                maxHeight: '300px'
              }}>
                {this.state.error.stack}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {'\n\nComponent Stack:\n'}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--yt-spec-call-to-action)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

