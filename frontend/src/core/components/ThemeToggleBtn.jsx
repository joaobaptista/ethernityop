import React from 'react';
import { useI18n } from '../i18n/presentation/useI18n.js';
import './ThemeToggleBtn.css';

export default function ThemeToggleBtn({ theme = 'light', onToggleTheme }) {
  const { t } = useI18n();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="header-circle-btn theme-toggle-btn"
      onClick={onToggleTheme}
      aria-label={isDark ? t('common.themeLight') : t('common.themeDark')}
      title={isDark ? t('common.themeLight') : t('common.themeDark')}
    >
      <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
    </button>
  );
}
