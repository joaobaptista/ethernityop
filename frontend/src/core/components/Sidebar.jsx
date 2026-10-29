import React, { useState, useEffect } from 'react';
import logoIconSvg from '../../assets/logo-icon.svg';
import { useI18n } from '../i18n/presentation/useI18n.js';
import { getAbsolutePhotoUrl, getUserInitials, isUserAdmin as checkUserAdmin } from '../../modules/profile/domain/profileModel.js';
import './Sidebar.css';
import { APP_VERSION, APP_VERSION_LABEL } from '../appVersion.js';


export default function Sidebar({
  activeTab,
  setActiveTab,
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
  theme = 'light',
  onToggleTheme,
  profile,
  operatingMode = 'personal',
  onToggleOperatingMode,
}) {
  const { t, language, changeLanguage, supportedLanguages } = useI18n();

  // Verifica se o usuário é Vagner ou possui perfil Admin
  const isUserAdmin = checkUserAdmin(profile);

  const isCurrentAdminMode = operatingMode === 'admin';

  // Menu Pessoal Clássico
  const personalNavItems = [
    {
      id: 'memories',
      label: t('nav.memories') || 'Comece Aqui',
      icon: 'fa-regular fa-compass',
    },
    {
      id: 'guardian',
      label: t('nav.guardian') || 'Guardião',
      icon: 'fa-solid fa-shield-halved',
    },
    {
      id: 'vault',
      label: t('nav.vault') || 'Meu Cofre',
      icon: 'fa-regular fa-square-plus',
    },
    {
      id: 'capsules',
      label: t('nav.capsules') || 'Cápsulas',
      icon: 'fa-solid fa-gift',
    },
    {
      id: 'avatar',
      label: t('nav.avatar') || 'Avatar e Voz',
      icon: 'fa-regular fa-circle-dot',
    },
    {
      id: 'calendar',
      label: t('nav.calendar') || 'Calendário',
      icon: 'fa-regular fa-calendar',
    },
    {
      id: 'messages_new',
      label: t('nav.messagesNew') || 'Mensagens',
      icon: 'fa-regular fa-envelope',
      hasDot: true,
    },
    {
      id: 'help',
      label: t('nav.help') || 'Central de Ajuda',
      icon: 'fa-regular fa-circle-question',
    },
  ];

  // Menu Administrativo
  const adminNavItems = [
    {
      id: 'admin_dashboard',
      label: t('admin.adminDashboard') || 'Dashboard Admin',
      icon: 'fa-solid fa-chart-line',
    },
    {
      id: 'admin_users',
      label: t('admin.adminUsers') || 'Gestão de Usuários',
      icon: 'fa-solid fa-users-gear',
      hasDot: true,
    },
  ];

  const navItems = isCurrentAdminMode ? adminNavItems : personalNavItems;

  const userName = profile?.name || profile?.email?.split('@')[0] || '';
  const userPlan = profile?.plan || '';
  const [avatarError, setAvatarError] = useState(false);

  const rawAvatar = profile?.avatar_url || profile?.photo_url || profile?.avatar || null;
  const userAvatar = getAbsolutePhotoUrl(rawAvatar);

  useEffect(() => {
    setAvatarError(false);
  }, [rawAvatar]);

  const handleItemClick = (item) => {
    setActiveTab(item.id);
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isCurrentAdminMode ? 'admin-mode-active' : ''}`}>
      {/* Brand no topo da Sidebar com Logo e Botão de Abrir / Fechar */}
      <div className="sidebar-brand-wrapper">
        <div className="sidebar-brand">
          <div
            className="brand-logo-area"
            onClick={() => setActiveTab(isCurrentAdminMode ? 'admin_dashboard' : 'memories')}
            style={{ cursor: 'pointer' }}
          >
            <img src={logoIconSvg} alt="Eternity DMs" className="sidebar-logo-icon" />
            {!isCollapsed && (
              <div className="brand-text-block">
                <span className="brand-title">Eternity DMs</span>
                <span className="brand-subtitle">
                  {isCurrentAdminMode ? (t('admin.modeAdminBadge') || 'MODO ADMINISTRADOR') : (t('common.digitalLegacy') || 'LEGADO DIGITAL')}
                </span>
              </div>
            )}
          </div>

          {/* Botão para Alternar Abrir / Fechar */}
          <button
            type="button"
            className="btn-toggle-sidebar"
            onClick={onToggleCollapse}
            title={isCollapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={isCollapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <i className={`fa-solid ${isCollapsed ? 'fa-bars' : 'fa-angles-left'}`}></i>
          </button>
        </div>

        {/* Switcher Fixo e Estável — Exclusivo para Vagner / Administradores */}
        {isUserAdmin && (
          <button
            type="button"
            className={`sidebar-admin-switch-btn ${isCurrentAdminMode ? 'active-mode' : ''}`}
            onClick={() => {
              const nextMode = isCurrentAdminMode ? 'personal' : 'admin';
              if (onToggleOperatingMode) onToggleOperatingMode(nextMode);
              if (nextMode === 'admin') {
                setActiveTab('admin_users');
              } else {
                setActiveTab('memories');
              }
            }}
            title={
              isCurrentAdminMode
                ? (t('admin.switchToUser') || 'Modo Pessoal')
                : (t('admin.switchToAdmin') || 'Modo Admin')
            }
          >
            <div className="admin-switch-inner">
              <i className="fa-solid fa-arrow-right-arrow-left switch-icon"></i>
              {!isCollapsed && (
                <span className="admin-switch-label">
                  {t('admin.switchToAdmin') || 'Modo Admin'}
                </span>
              )}
              {!isCollapsed && (
                <span className={`admin-mode-pill-tag ${isCurrentAdminMode ? 'pill-admin' : 'pill-personal'}`}>
                  {isCurrentAdminMode ? (t('admin.modeAdminBadge') || 'ADMIN') : (t('admin.modePersonalBadge') || 'PESSOAL')}
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Navegação Principal com Ícones e Atalhos */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleItemClick(item)}
              title={item.label}
            >
              <div className="nav-item-icon-wrapper">
                <i className={item.icon}></i>
              </div>

              {!isCollapsed && <span className="nav-item-label">{item.label}</span>}
              {!isCollapsed && item.hasDot && (
                <span className="nav-coral-dot"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Rodapé da Sidebar com Card de Usuário (Pílula Coral Suave) + Engrenagem & Idiomas */}
      <div className="sidebar-footer">
        {!isCollapsed ? (
          <>
            {/* Card Pílula de Usuário (Acessa Perfil Diretamente) */}
            <div
              className={`sidebar-user-card-pill ${activeTab === 'profile' ? 'active-profile' : ''}`}
              onClick={() => setActiveTab('profile')}
              title={t('nav.settings') || 'Configurações e Perfil'}
            >
              {userAvatar && !avatarError ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="user-card-avatar-pill"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="user-card-avatar-pill user-card-initials-pill">
                  {getUserInitials(userName)}
                </div>
              )}

              <div className="user-card-meta-pill">
                <span className="user-card-name-pill">{userName}</span>
                {userPlan && <span className="user-card-plan-pill">{userPlan}</span>}
              </div>

              <button
                type="button"
                className="btn-user-gear"
                title={t('nav.settings') || 'Configurações e Perfil'}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('profile');
                }}
              >
                <i className="fa-solid fa-gear"></i>
              </button>
            </div>

            {/* Seletor de Idiomas + Versão */}
            <div className="sidebar-bottom-row">
              <div className="sidebar-lang-switcher">
                {(supportedLanguages || ['pt', 'en', 'es']).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={`sidebar-lang-btn ${language === lang ? 'active' : ''}`}
                    onClick={() => changeLanguage(lang)}
                    title={lang.toUpperCase()}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="sidebar-version" aria-label={`Versão ${APP_VERSION}`}>
                Ethernity {APP_VERSION_LABEL}
              </span>
            </div>
          </>
        ) : (
          <div
            className="sidebar-user-card-collapsed"
            onClick={() => setActiveTab('profile')}
            title={`${userName} - Acessar Perfil`}
          >
            {userAvatar && !avatarError ? (
              <img
                src={userAvatar}
                alt={userName}
                className="user-card-avatar-pill"
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="user-card-avatar-pill user-card-initials-pill" title={userName}>
                {getUserInitials(userName)}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
