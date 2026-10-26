import React from 'react';
import { useI18n } from '../i18n/presentation/useI18n.js';

export default function BottomNav({ activeTab, setActiveTab }) {
  const { t } = useI18n();

  const navItems = [
    { id: 'memories', label: t('nav.home') || 'Início', icon: 'fa-solid fa-compass' },
    { id: 'vault', label: t('nav.vault') || 'Meu Cofre', icon: 'fa-solid fa-lock' },
    { id: 'capsules', label: t('nav.capsules') || 'Cápsulas', icon: 'fa-solid fa-gift' },
    { id: 'guardian', label: t('nav.guardian') || 'Guardião', icon: 'fa-solid fa-shield-halved' },
    { id: 'profile', label: t('nav.profile') || 'Perfil', icon: 'fa-solid fa-user-gear' },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Menu Mobile">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => setActiveTab(item.id)}
        >
          <div className="bottom-nav-icon-wrapper">
            <i className={item.icon}></i>
            {item.badge > 0 && (
              <span className="bottom-nav-badge">
                {item.badge}
              </span>
            )}
          </div>
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

