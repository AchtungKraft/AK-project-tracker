import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Copy, Bug } from "lucide-react";

/**
 * SafeRenderBoundary - Error boundary that catches render crashes
 * and displays a friendly error UI instead of blank screen.
 * 
 * Usage:
 *   <SafeRenderBoundary context="ReceiveTab">
 *     <YourComponent />
 *   </SafeRenderBoundary>
 */
export class SafeRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[SafeRenderBoundary:${this.props.context || 'unknown'}] Caught error:`, error);
    console.error('Component stack:', errorInfo?.componentStack);
    
    this.setState({ errorInfo });
    
    // Store debug info globally for console inspection
    window.__lastRenderError = {
      context: this.props.context,
      error: error?.message || String(error),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopyDebug = () => {
    const debugInfo = {
      context: this.props.context,
      error: this.state.error?.message || String(this.state.error),
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      lastDebug: window.__lastReceiveDebug || null,
    };
    
    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { context = "Component" } = this.props;
      const errorMessage = this.state.error?.message || "An unexpected error occurred";
      
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-900/20 border border-red-700/50 rounded-lg m-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-red-900/50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-300">
                {context} Error
              </h3>
              <p className="text-sm text-red-400/80">
                Something went wrong while rendering this section
              </p>
            </div>
          </div>
          
          <div className="w-full max-w-md mb-4">
            <div className="p-3 bg-gray-900/80 border border-gray-700 rounded-lg">
              <p className="text-sm text-gray-300 font-mono break-all">
                {errorMessage}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 justify-center">
            <Button 
              onClick={this.handleRetry}
              variant="outline"
              className="border-gray-600 gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
            
            <Button 
              onClick={this.handleReload}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </Button>
            
            <Button 
              onClick={this.handleCopyDebug}
              variant="outline"
              className="border-gray-600 gap-2"
            >
              {this.state.copied ? (
                <>✓ Copied</>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Debug Details
                </>
              )}
            </Button>
          </div>
          
          {import.meta.env.DEV && this.state.errorInfo?.componentStack && (
            <details className="mt-4 w-full max-w-2xl">
              <summary className="text-xs text-gray-500 cursor-pointer flex items-center gap-1">
                <Bug className="w-3 h-3" />
                Component Stack (Dev Only)
              </summary>
              <pre className="mt-2 p-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-400 overflow-auto max-h-48">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default SafeRenderBoundary;