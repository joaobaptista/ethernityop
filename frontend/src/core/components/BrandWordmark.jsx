import React from 'react';
import { useI18n } from '../i18n/presentation/useI18n.js';

export default function BrandWordmark({ className = '' }) {
  const { t } = useI18n();

  return (
    <span className={`brand-wordmark ${className}`} aria-label="Ethernity DMs">
      <span className="brand-wordmark-name">ethernity <span>dms</span></span>
      <span className="brand-wordmark-tagline">{t('common.digitalLegacy')}</span>
    </span>
  );
}
