import React, { useState } from 'react';
import logoIconSvg from '../../assets/logo-icon.svg';
import logoTextSvg from '../../assets/logo-text.svg';
import { useI18n } from '../i18n/presentation/useI18n.js';
import './SystemErrorScreen.css';

export const ERROR_VARIANTS = {
  GENERIC: 'generic',
  NETWORK: 'network',
  SERVER_500: 'server_500',
  NOT_FOUND: 'not_found',
  SESSION: 'session',
};

export default function SystemErrorScreen({
  variant = ERROR_VARIANTS.GENERIC,
  title,
  description,
  error,
  errorInfo,
  onRetry,
  onNavigateHome,
  isEmbedded = false,
}) {
  const { t } = useI18n();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);

  // Determinar ícone e estilo baseado na variante
  let iconClass = 'fa-solid fa-triangle-exclamation';
  let iconTheme = 'warning';
  let defaultTitle = t('errors.titleGeneric');
  let defaultDesc = t('errors.descGeneric');

  if (variant === ERROR_VARIANTS.NETWORK) {
    iconClass = 'fa-solid fa-wifi-slash';
    iconTheme = 'warning';
    defaultTitle = t('errors.titleNetwork');
    defaultDesc = t('errors.descNetwork');
  } else if (variant === ERROR_VARIANTS.SERVER_500) {
    iconClass = 'fa-solid fa-server';
    iconTheme = 'danger';
    defaultTitle = t('errors.title500');
    defaultDesc = t('errors.desc500');
  } else if (variant === ERROR_VARIANTS.NOT_FOUND) {
    iconClass = 'fa-solid fa-compass-drafting';
    iconTheme = 'info';
    defaultTitle = t('errors.title404');
    defaultDesc = t('errors.desc404');
  } else if (variant === ERROR_VARIANTS.SESSION) {
    iconClass = 'fa-solid fa-shield-halved';
    iconTheme = 'warning';
    defaultTitle = t('errors.titleSession');
    defaultDesc = t('errors.descSession');
  }

  const finalTitle = title || defaultTitle;
  const finalDesc = description || defaultDesc;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        window.location.reload();
      }
    } catch {
      // Ignorar
    } finally {
      setTimeout(() => setIsRetrying(false), 600);
    }
  };

  const handleCopyDiagnostics = () => {
    const errorDetails = [
      `[Ethernity DMs Diagnostics - ${new Date().toISOString()}]`,
      `Variant: ${variant}`,
      `Error: ${error?.message || error || 'N/A'}`,
      `Stack: ${error?.stack || 'N/A'}`,
      `ComponentStack: ${errorInfo?.componentStack || 'N/A'}`,
      `URL: ${window.location.href}`,
      `UserAgent: ${navigator.userAgent}`,
    ].join('\n');

    navigator.clipboard.writeText(errorDetails).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className={`system-error-container ${isEmbedded ? 'is-embedded' : ''}`}>
      <div className="system-error-card">
        
        {/* Brand Header */}
        <div className="error-brand-badge">
          <img src={logoIconSvg} alt="Ethernity DMs" className="error-logo-icon" />
          <img src={logoTextSvg} alt="Ethernity DMs" className="error-logo-text" />
        </div>

        {/* Animated Icon with Glowing Halo */}
        <div className={`error-icon-wrapper ${iconTheme}`}>
          <i className={`${iconClass} error-icon-pulse`}></i>
        </div>

        {/* Textos Informativos e Amigáveis */}
        <h2 className="error-title">{finalTitle}</h2>
        <p className="error-description">{finalDesc}</p>

        {/* Aviso de Segurança de Dados */}
        <div className="error-security-banner">
          <i className="fa-solid fa-lock"></i>
          <span>{t('errors.securityNotice')}</span>
        </div>

        {/* Botões de Ação */}
        <div className="error-actions-group">
          <button
            type="button"
            className="btn-error-action primary"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <i className={`fa-solid ${isRetrying ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
            <span>{isRetrying ? t('errors.retrying') : t('errors.retryButton')}</span>
          </button>

          <button
            type="button"
            className="btn-error-action secondary"
            onClick={() => {
              if (onNavigateHome) {
                onNavigateHome();
              } else {
                window.location.href = '/';
              }
            }}
          >
            <i className="fa-solid fa-house"></i>
            <span>{t('errors.dashboardButton')}</span>
          </button>
        </div>

        {/* Diagnóstico Técnico Expansível (caso haja erro de stack) */}
        {(error || errorInfo) && (
          <div className="error-diagnostics-section">
            <button
              type="button"
              className="btn-toggle-diagnostics"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
            >
              <i className={`fa-solid ${showDiagnostics ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
              <span>{showDiagnostics ? t('errors.hideDetails') : t('errors.showDetails')}</span>
            </button>

            {showDiagnostics && (
              <div className="diagnostics-drawer">
                <pre className="diagnostics-content">
                  {error?.toString() || 'Erro não especificado'}
                  {error?.stack && `\n\n${error.stack}`}
                  {errorInfo?.componentStack && `\n\nComponent Stack:${errorInfo.componentStack}`}
                </pre>
                <button
                  type="button"
                  className="btn-copy-diagnostics"
                  onClick={handleCopyDiagnostics}
                >
                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                  <span>{copied ? t('errors.copied') : t('errors.copyDiagnostics')}</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
