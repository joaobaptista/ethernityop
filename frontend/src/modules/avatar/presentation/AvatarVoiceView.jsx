import React from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import './AvatarVoiceView.css';

/**
 * AvatarVoiceView
 * 
 * Tela informativa exibida ao clicar no menu "Avatar e Voz".
 * As funcionalidades de avatar 3D e gravação de voz estão em fase
 * de desenvolvimento e serão disponibilizadas em versão futura.
 */
export default function AvatarVoiceView({ onNavigateTab }) {
  const { t } = useI18n();

  return (
    <div className="av-page-container">
      {/* Breadcrumb de Navegação */}
      <div className="av-breadcrumb">
        <span
          className="av-crumb-link"
          onClick={() => onNavigateTab && onNavigateTab('memories')}
          role="button"
          tabIndex={0}
        >
          {t('nav.home') || 'Comece Aqui'}
        </span>
        <span className="av-crumb-sep">&gt;</span>
        <span className="av-crumb-text">
          {t('nav.avatar') || 'Avatar e Voz'}
        </span>
      </div>

      {/* Cabeçalho da Página */}
      <div className="av-header">
        <h1 className="av-title">
          {t('nav.avatar') || 'Avatar e Voz'}
        </h1>
        <p className="av-subtitle">
          Eternização da sua presença digital, expressões faciais e voz para futuras gerações.
        </p>
      </div>

      {/* Card Principal: Funcionalidade em Desenvolvimento */}
      <div className="av-card av-under-dev-card">
        {/* Badge de Status com Pulso */}
        <div className="av-status-badge-wrap">
          <span className="av-dev-badge">
            <span className="av-badge-pulse-dot"></span>
            Em Desenvolvimento
          </span>
        </div>

        {/* Ilustração / Ícone Central de Destaque */}
        <div className="av-dev-hero-icon-container">
          <div className="av-dev-icon-glow"></div>
          <div className="av-dev-hero-icon">
            <i className="fa-solid fa-cube"></i>
          </div>
          <div className="av-dev-orbit-icon orbit-1">
            <i className="fa-solid fa-wand-magic-sparkles"></i>
          </div>
          <div className="av-dev-orbit-icon orbit-2">
            <i className="fa-solid fa-microphone-lines"></i>
          </div>
        </div>

        {/* Mensagem Principal */}
        <div className="av-dev-content">
          <h2 className="av-dev-main-title">
            Esta funcionalidade está sendo desenvolvida e ainda não está pronta
          </h2>
          <p className="av-dev-description">
            Estamos construindo o novo motor de <strong>Avatar 3D</strong> com mapeamento biométrico
            do formato real do rosto e o módulo de <strong>Eternização de Voz</strong>.
            Esta tecnologia inovadora está passando por testes de qualidade e estará disponível
            em breve para que você possa dar vida às suas memórias com realismo absoluto e privacidade total.
          </p>

          <div className="av-dev-notice-banner">
            <div className="av-notice-icon">
              <i className="fa-solid fa-circle-info"></i>
            </div>
            <div className="av-notice-text">
              <strong>Novidades em Breve:</strong> Enquanto finalizamos o desenvolvimento do avatar e da voz,
              você pode continuar gravando vídeos, salvando cartas e organizando suas cápsulas do tempo normalmente.
            </div>
          </div>
        </div>

        {/* Grid de Recursos em Desenvolvimento */}
        <div className="av-pillars-grid">
          <div className="av-pillar-card">
            <div className="av-pillar-icon-box">
              <i className="fa-solid fa-face-smile"></i>
            </div>
            <h3 className="av-pillar-title">Avatar 3D com Formato Real</h3>
            <p className="av-pillar-desc">
              Reconstrução tridimensional avançada baseada na geometria e traços únicos da sua face a partir de fotos.
            </p>
          </div>

          <div className="av-pillar-card">
            <div className="av-pillar-icon-box">
              <i className="fa-solid fa-wave-square"></i>
            </div>
            <h3 className="av-pillar-title">Sincronia Labial & Voz</h3>
            <p className="av-pillar-desc">
              Calibração acústica e articulação labial sincronizada com a voz para narrar cartas e mensagens especiais.
            </p>
          </div>

          <div className="av-pillar-card">
            <div className="av-pillar-icon-box">
              <i className="fa-solid fa-shield-halved"></i>
            </div>
            <h3 className="av-pillar-title">Privacidade 100% On-Device</h3>
            <p className="av-pillar-desc">
              Processamento seguro no seu navegador com criptografia militar, sem compartilhar sua biometria em servidores públicos.
            </p>
          </div>
        </div>

        {/* Rodapé de Ações Rápidas */}
        <div className="av-dev-actions">
          <button
            type="button"
            className="av-btn-action primary"
            onClick={() => onNavigateTab && onNavigateTab('vault')}
          >
            <i className="fa-solid fa-lock"></i>
            <span>Ir para Meu Cofre</span>
          </button>

          <button
            type="button"
            className="av-btn-action secondary"
            onClick={() => onNavigateTab && onNavigateTab('capsules')}
          >
            <i className="fa-solid fa-gift"></i>
            <span>Ver Cápsulas do Tempo</span>
          </button>

          <button
            type="button"
            className="av-btn-action tertiary"
            onClick={() => onNavigateTab && onNavigateTab('memories')}
          >
            <i className="fa-regular fa-compass"></i>
            <span>Comece Aqui</span>
          </button>
        </div>
      </div>
    </div>
  );
}
