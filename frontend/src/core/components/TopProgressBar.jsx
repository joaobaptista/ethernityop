import React, { useState, useEffect } from 'react';
import loadingService from '../services/loadingService.js';
import './TopProgressBar.css';

export default function TopProgressBar() {
  const [loadingState, setLoadingState] = useState({
    isLoading: false,
    progress: 0,
  });

  useEffect(() => {
    const unsubscribe = loadingService.subscribe((state) => {
      setLoadingState(state);
    });
    return unsubscribe;
  }, []);

  if (!loadingState.isLoading && loadingState.progress === 0) {
    return null;
  }

  return (
    <div
      className={`top-progress-bar-container ${loadingState.isLoading ? 'is-loading' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(loadingState.progress)}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Carregando..."
    >
      <div
        className="top-progress-bar-fill"
        style={{ width: `${loadingState.progress}%` }}
      >
        <div className="top-progress-bar-peg" />
      </div>
    </div>
  );
}
