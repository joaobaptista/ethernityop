import React, { Component } from 'react';
import SystemErrorScreen, { ERROR_VARIANTS } from './SystemErrorScreen.jsx';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Capturado erro de renderização:', error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, resetError: this.handleReset })
          : this.props.fallback;
      }

      return (
        <SystemErrorScreen
          variant={ERROR_VARIANTS.GENERIC}
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleReset}
          isEmbedded={this.props.isEmbedded || false}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
