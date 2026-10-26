import React, { useState, useEffect } from 'react';
import adminRepository from '../infrastructure/adminRepository.js';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import NotificationBell from '../../../core/components/NotificationBell.jsx';
import './AdminView.css';

export default function AdminDashboardView({
  token,
  profile,
  onNavigateTab,
  onSwitchMode,
}) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState({
    totalUsers: 1,
    totalAdmins: 1,
    totalMemories: 0,
    systemStatus: 'healthy',
  });

  useEffect(() => {
    adminRepository
      .getMetrics(token)
      .then((data) => {
        if (data) setMetrics(data);
      })
      .catch(() => {});
  }, [token]);

  return (
    <div className="admin-screen-wrapper fade-in">
      <div className="admin-screen-container">
        {/* Cabeçalho */}
        <div className="admin-top-bar">
          <div>
            <span className="admin-badge-pill">
              <i className="fa-solid fa-chart-line"></i>
              {t('admin.modeAdminBadge') || 'MODO ADMINISTRADOR'}
            </span>
            <h1 className="admin-main-title">{t('admin.dashboardTitle') || 'Painel Administrativo Ethernity'}</h1>
            <p className="admin-main-subtitle">
              {t('admin.dashboardSubtitle') || 'Visão executiva e métricas do sistema em tempo real.'}
            </p>
          </div>

          <div className="admin-top-actions">
            <button
              type="button"
              className="btn-switch-mode-outline"
              onClick={() => onSwitchMode && onSwitchMode('personal')}
              title={t('admin.switchToUser') || 'Voltar ao Modo Pessoal'}
            >
              <i className="fa-solid fa-arrow-left"></i>
              <span>{t('admin.switchToUser') || 'Voltar ao Modo Pessoal'}</span>
            </button>
            <NotificationBell onNavigateTab={onNavigateTab} />
          </div>
        </div>

        {/* Cards de Métricas Principais */}
        <div className="admin-metrics-grid">
          <div className="admin-metric-card">
            <div className="admin-metric-icon coral">
              <i className="fa-solid fa-users"></i>
            </div>
            <div className="admin-metric-info">
              <span className="admin-metric-value">{metrics.totalUsers || 1}</span>
              <span className="admin-metric-label">{t('admin.cardTotalUsers') || 'Total de Usuários'}</span>
            </div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-icon purple">
              <i className="fa-solid fa-crown"></i>
            </div>
            <div className="admin-metric-info">
              <span className="admin-metric-value">{metrics.totalAdmins || 1}</span>
              <span className="admin-metric-label">{t('admin.cardTotalAdmins') || 'Administradores Ativos'}</span>
            </div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-icon blue">
              <i className="fa-solid fa-box-archive"></i>
            </div>
            <div className="admin-metric-info">
              <span className="admin-metric-value">{metrics.totalMemories || 0}</span>
              <span className="admin-metric-label">{t('admin.cardTotalMemories') || 'Memórias Criptografadas'}</span>
            </div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-icon green">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <div className="admin-metric-info">
              <span className="admin-metric-value">{t('admin.systemOnline') || '100%'}</span>
              <span className="admin-metric-label">{t('admin.cardSystemHealth') || 'Status do Sistema'}</span>
            </div>
          </div>
        </div>

        {/* Placeholder do Dashboard Vazio (Conforme solicitado) */}
        <div className="admin-empty-dash-card">
          <div className="admin-empty-dash-icon">
            <i className="fa-solid fa-chart-pie"></i>
          </div>
          <h2 className="admin-empty-dash-title">
            {t('admin.emptyDashboardTitle') || 'Dashboard Administrativo em Preparação'}
          </h2>
          <p className="admin-empty-dash-desc">
            {t('admin.emptyDashboardDesc') ||
              'Este painel está pronto para receber métricas de uso, telemetria, storage do cofre e logs de auditoria.'}
          </p>
          <button
            type="button"
            className="btn-switch-mode-outline"
            style={{ marginTop: 8 }}
            onClick={() => onNavigateTab && onNavigateTab('admin_users')}
          >
            <i className="fa-solid fa-users-gear"></i>
            <span>{t('admin.adminUsers') || 'Acessar Gestão de Usuários'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
