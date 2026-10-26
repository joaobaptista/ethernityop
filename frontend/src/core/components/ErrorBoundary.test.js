import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';
import { ERROR_VARIANTS } from './SystemErrorScreen.jsx';

describe('ErrorBoundary & Error Models', () => {
  it('defines all system error variants', () => {
    expect(ERROR_VARIANTS.GENERIC).toBe('generic');
    expect(ERROR_VARIANTS.NETWORK).toBe('network');
    expect(ERROR_VARIANTS.SERVER_500).toBe('server_500');
    expect(ERROR_VARIANTS.NOT_FOUND).toBe('not_found');
    expect(ERROR_VARIANTS.SESSION).toBe('session');
  });

  it('updates state via getDerivedStateFromError', () => {
    const fakeError = new Error('Test crash');
    const newState = ErrorBoundary.getDerivedStateFromError(fakeError);

    expect(newState).toEqual({
      hasError: true,
      error: fakeError,
    });
  });

  it('initializes with hasError: false', () => {
    const boundary = new ErrorBoundary({ children: null });
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
  });

  it('invokes onError callback on componentDidCatch', () => {
    const onErrorMock = vi.fn();
    const boundary = new ErrorBoundary({ onError: onErrorMock });
    boundary.setState = vi.fn();
    
    const fakeError = new Error('Runtime error');
    const fakeInfo = { componentStack: '\n at Child' };

    boundary.componentDidCatch(fakeError, fakeInfo);

    expect(boundary.setState).toHaveBeenCalledWith({ errorInfo: fakeInfo });
    expect(onErrorMock).toHaveBeenCalledWith(fakeError, fakeInfo);
  });

  it('invokes onReset callback on handleReset', () => {
    const onResetMock = vi.fn();
    const boundary = new ErrorBoundary({ onReset: onResetMock });
    boundary.setState = vi.fn();

    boundary.handleReset();

    expect(boundary.setState).toHaveBeenCalledWith({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    expect(onResetMock).toHaveBeenCalled();
  });
});
