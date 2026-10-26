import React from 'react';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { useI18n } from '../i18n/presentation/useI18n.js';

export default function NetworkStatusBar() {
  const { isOnline, showReconnected, isDismissed, dismiss, checkConnectivity } = useNetworkStatus();
  const { t } = useI18n();

  if ((isOnline && !showReconnected) || isDismissed) {
    return null;
  }

  return (
    <aside
      className={`network-status-bar ${!isOnline ? 'offline' : 'reconnected'}`}
      role="status"
      aria-live="polite"
    >
      <div className="network-status-content">
        {!isOnline ? (
          <>
            <i className="fa-solid fa-wifi-slash network-status-icon" aria-hidden="true"></i>
            <span className="network-status-text">
              <strong>{t('pwa.offlineMode')}</strong> — {t('pwa.offlineDesc')}
            </span>
            <div className="network-status-actions">
              <button
                type="button"
                className="network-status-btn-retry"
                onClick={() => checkConnectivity()}
                title={t('pwa.retry')}
              >
                <i className="fa-solid fa-rotate-right"></i> {t('pwa.retry')}
              </button>
              <button
                type="button"
                className="network-status-btn-close"
                onClick={dismiss}
                title={t('pwa.dismiss')}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </>
        ) : (
          <>
            <i className="fa-solid fa-circle-check network-status-icon" aria-hidden="true"></i>
            <span className="network-status-text">
              <strong>{t('pwa.reconnected')}</strong> {t('pwa.reconnectedDesc')}
            </span>
            <button
              type="button"
              className="network-status-btn-close"
              onClick={dismiss}
              title={t('pwa.dismiss')}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

