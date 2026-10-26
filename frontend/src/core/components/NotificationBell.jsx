import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/presentation/useI18n.js';
import './NotificationBell.css';

export default function NotificationBell({
  onNavigateTab,
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [readState, setReadState] = useState({
    'notif-1': false,
    'notif-2': false,
    'notif-3': true,
  });

  const rawNotifications = [
    {
      id: 'notif-1',
      type: 'guardian',
      title: t('notifications.itemGuardianTitle') || 'Protocolo de Guardião Ativo',
      desc: t('notifications.itemGuardianDesc') || 'Guardião configurado e pronto para monitorar a liberação de suas memórias.',
      time: t('notifications.itemGuardianTime') || 'há 2 min',
      tab: 'guardian',
      icon: 'fa-solid fa-shield-halved',
      iconColor: 'var(--color-primary, #F05A47)',
    },
    {
      id: 'notif-2',
      type: 'capsule',
      title: t('notifications.itemCapsuleTitle') || 'Cápsula Programada',
      desc: t('notifications.itemCapsuleDesc') || 'Sua cápsula do tempo para o aniversário de 18 anos foi criptografada e salva.',
      time: t('notifications.itemCapsuleTime') || 'há 18 min',
      tab: 'capsules',
      icon: 'fa-solid fa-gift',
      iconColor: '#10b981',
    },
    {
      id: 'notif-3',
      type: 'vault',
      title: t('notifications.itemVaultTitle') || 'Memórias Conectadas ao Cofre',
      desc: t('notifications.itemVaultDesc') || 'Fotos e vídeos do Google Photos sincronizados com sucesso.',
      time: t('notifications.itemVaultTime') || 'há 2h',
      tab: 'vault',
      icon: 'fa-solid fa-lock',
      iconColor: '#3b82f6',
    },
  ];

  const notifications = rawNotifications.map((n) => ({
    ...n,
    unread: !readState[n.id],
  }));

  const popoverRef = useRef(null);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllRead = () => {
    setReadState({
      'notif-1': true,
      'notif-2': true,
      'notif-3': true,
    });
  };

  const handleItemClick = (notif) => {
    setReadState((prev) => ({
      ...prev,
      [notif.id]: true,
    }));
    if (notif.tab && onNavigateTab) {
      onNavigateTab(notif.tab);
    }
    setIsOpen(false);
  };

  return (
    <div className="notification-bell-container" ref={popoverRef}>
      {/* Botão de Sino estilo Facebook / Redes Sociais */}
      <button
        type="button"
        className="header-circle-btn notification-bell-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={t('notifications.title') || 'Notificações'}
        title={t('notifications.title') || 'Notificações'}
      >
        <i className="fa-solid fa-bell"></i>
        {unreadCount > 0 && (
          <span className="notification-badge-fb animate-badge-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Popover Flutuante de Notificações */}
      {isOpen && (
        <div className="notification-popover animate-pop">
          {/* Cabeçalho do Popover */}
          <div className="notif-popover-header">
            <div className="notif-header-title">
              <h4>{t('notifications.title') || 'Notificações'}</h4>
              {unreadCount > 0 && (
                <span className="notif-unread-count-pill">
                  {t('notifications.newCount', { count: unreadCount }) || `${unreadCount} novas`}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn-mark-all-read"
                onClick={handleMarkAllRead}
              >
                {t('notifications.markAllRead') || 'Marcar como lidas'}
              </button>
            )}
          </div>

          {/* Lista de Notificações */}
          <div className="notif-popover-list">
            {notifications.length === 0 ? (
              <div className="notif-empty-state">
                <i className="fa-solid fa-bell-slash"></i>
                <p>{t('notifications.empty') || 'Nenhuma notificação no momento.'}</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-popover-item ${notif.unread ? 'unread' : ''}`}
                  onClick={() => handleItemClick(notif)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="notif-item-icon-wrapper" style={{ color: notif.iconColor }}>
                    <i className={notif.icon}></i>
                  </div>
                  <div className="notif-item-content">
                    <div className="notif-item-title-row">
                      <strong className="notif-item-title">{notif.title}</strong>
                      {notif.unread && <span className="notif-unread-dot"></span>}
                    </div>
                    <p className="notif-item-desc">{notif.desc}</p>
                    <span className="notif-item-time">{notif.time}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
