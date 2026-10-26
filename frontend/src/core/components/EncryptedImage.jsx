/**
 * EncryptedImage.jsx
 * Componente de alta performance para exibição de imagens WebP multi-tier
 * protegidas pelo Cofre Criptografado (Zero-Knowledge AES-256-GCM).
 *
 * Funcionalidades:
 *  - Transição progressiva com blur-up (Thumb 400px -> Display 1080p).
 *  - Injeção transparente de autorização JWT via query parameter (?token=).
 *  - Badge de segurança "Cofre Protegido".
 *  - Suporte a download Fine-Art 300 DPI (TIFF/WebP Master).
 */
import React, { useState, useEffect, useMemo } from 'react';
import './EncryptedImage.css';

const AUTH_TOKEN_KEY = 'ethernity_auth_token';

export default function EncryptedImage({
  src,
  alt = 'Imagem do Cofre',
  className = '',
  variant = 'display', // 'thumb' | 'display' | 'master'
  enableProgressive = true,
  showSecurityBadge = false,
  allowPrintExport = false,
  dpi = 300,
  token: explicitToken,
  style = {},
  onClick,
}) {
  const [currentSrc, setCurrentSrc] = useState('');
  const [isDisplayLoaded, setIsDisplayLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const token = useMemo(() => {
    if (explicitToken) return explicitToken;
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }, [explicitToken]);

  // Monta URLs com variante e token de autenticação
  const { thumbUrl, displayUrl, exportUrl, isVaultMedia } = useMemo(() => {
    if (!src) return { thumbUrl: '', displayUrl: '', exportUrl: '', isVaultMedia: false };

    const isVault = src.includes('/vault/media/');
    if (!isVault) {
      return { thumbUrl: src, displayUrl: src, exportUrl: src, isVaultMedia: false };
    }

    const cleanBase = src.split('?')[0];
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

    return {
      thumbUrl: `${cleanBase}?variant=thumb${tokenParam}`,
      displayUrl: `${cleanBase}?variant=${variant}${tokenParam}`,
      exportUrl: `${cleanBase}/export?format=tiff${tokenParam}`,
      isVaultMedia: true,
    };
  }, [src, variant, token]);

  useEffect(() => {
    if (!src) return;
    setHasError(false);
    setIsDisplayLoaded(false);

    if (enableProgressive && isVaultMedia && variant !== 'thumb') {
      // Começa com a thumbnail de carregamento rápido
      setCurrentSrc(thumbUrl);

      // Pré-carrega a versão de alta resolução (display ou master)
      const highResImg = new Image();
      highResImg.src = displayUrl;
      highResImg.onload = () => {
        setCurrentSrc(displayUrl);
        setIsDisplayLoaded(true);
      };
      highResImg.onerror = () => {
        // Fallback mantém a thumb ou dispara erro
        setIsDisplayLoaded(true);
      };
    } else {
      setCurrentSrc(displayUrl || src);
      setIsDisplayLoaded(true);
    }
  }, [src, variant, thumbUrl, displayUrl, enableProgressive, isVaultMedia]);

  if (hasError) {
    return (
      <div className={`encrypted-image-container ${className}`} style={style}>
        <div className="encrypted-image-fallback">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Arquivo protegido indisponível</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`encrypted-image-container ${className}`}
      style={style}
      onClick={onClick}
    >
      {showSecurityBadge && isVaultMedia && (
        <div className="encrypted-image-badge-shield" title="Arquivo criptografado com AES-256-GCM Zero-Knowledge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Cofre Criptografado</span>
        </div>
      )}

      {currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          className={`encrypted-image ${!isDisplayLoaded && enableProgressive ? 'is-loading-display' : 'is-loaded'}`}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      )}

      {allowPrintExport && isVaultMedia && exportUrl && (
        <a
          href={exportUrl}
          download="memoria-ethernity-300dpi.tiff"
          className="encrypted-image-print-btn"
          title={`Exportar em resolução máxima para impressão (${dpi} DPI)`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span>Imprimir (300 DPI)</span>
        </a>
      )}
    </div>
  );
}
