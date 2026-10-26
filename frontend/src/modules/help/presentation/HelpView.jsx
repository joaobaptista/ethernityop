import React, { useState } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import './HelpView.css';

export default function HelpView({ onNavigateTab }) {
  const { t } = useI18n();
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const faqs = [
    {
      question: 'O que são as Cápsulas do Tempo do Ethernity?',
      answer:
        'Cápsulas do tempo são repositórios criptografados contendo fotos originais, áudios com a sua própria voz, vídeos e cartas que só serão entregues aos seus destinatários em uma data pré-agendada ou através do protocolo póstumo com seus guardiões.',
      category: 'capsules',
    },
    {
      question: 'Como funciona o protocolo de liberação com os Guardiões?',
      answer:
        'Você cadastra pessoas de sua máxima confiança (Guardiões). Caso o protocolo de ausência prolongada (Dead Man\'s Switch) seja ativado ou mediante apresentação de certidão e quórum mínimo de aprovação entre os guardiões, as instruções e cápsulas designadas a cada familiar são liberadas com segurança militar.',
      category: 'guardian',
    },
    {
      question: 'Meus arquivos e fotos estão realmente protegidos?',
      answer:
        'Sim. Todo o cofre utiliza criptografia ponta a ponta AES-256-GCM. Suas fotos e memórias só podem ser decifradas com a sua chave pessoal. O armazenamento local híbrido garante que mídias pesadas fiquem salvas no seu aparelho sem limite de tráfego desnecessário.',
      category: 'security',
    },
    {
      question: 'O que acontece quando eu excluo uma cápsula ou item?',
      answer:
        'Conforme as diretrizes estritas do Ethernity, a exclusão é definitiva (expurgo imediato e irreversível de memórias, rascunhos e do banco de dados). Não mantemos cópias ocultas nem ressuscitamos dados apagados.',
      category: 'privacy',
    },
    {
      question: 'Como conectar minha conta do Google Fotos?',
      answer:
        'Na aba "Comece Aqui" ou no "Meu Cofre", clique no botão Google Fotos. Você será direcionado com segurança via OAuth 2.0 oficial para selecionar apenas as fotos de memórias que deseja importar, com preservação da resolução nativa.',
      category: 'integrations',
    },
  ];

  const filteredFaqs = faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFaq = (idx) => {
    setOpenFaqIndex(openFaqIndex === idx ? null : idx);
  };

  return (
    <div className="help-view-wrapper fade-in">
      {/* Breadcrumb */}
      <div className="help-breadcrumb">
        <span
          className="help-breadcrumb-link"
          onClick={() => onNavigateTab && onNavigateTab('memories')}
          role="button"
          tabIndex={0}
        >
          {t('nav.home') || 'Comece Aqui'}
        </span>
        <span className="help-breadcrumb-sep">&gt;</span>
        <span className="help-breadcrumb-current">Central de Ajuda</span>
      </div>

      {/* Hero Header */}
      <div className="help-hero-section">
        <div className="help-hero-badge">
          <i className="fa-regular fa-circle-question"></i> Suporte & Orientações
        </div>
        <h1 className="help-hero-title">Como podemos ajudar você hoje?</h1>
        <p className="help-hero-subtitle">
          Tire dúvidas sobre suas cápsulas do tempo, protocolo de guardiões, criptografia e preservação do seu legado familiar.
        </p>

        {/* Barra de Busca de Dúvidas */}
        <div className="help-search-box">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            className="help-search-input"
            placeholder="Pesquise por dúvidas, segurança, guardiões ou cápsulas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="help-search-clear-btn"
              onClick={() => setSearchQuery('')}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
      </div>

      {/* Cards de Acesso Rápido */}
      <div className="help-quick-cards-grid">
        <div
          className="help-quick-card"
          onClick={() => onNavigateTab && onNavigateTab('capsules')}
          role="button"
          tabIndex={0}
        >
          <div className="help-card-icon-circle icon-capsule">
            <i className="fa-solid fa-gift"></i>
          </div>
          <h3 className="help-card-title">Cápsulas do Tempo</h3>
          <p className="help-card-desc">
            Aprenda a criar entregas no futuro, gravar depoimentos de voz e organizar fotos originais.
          </p>
        </div>

        <div
          className="help-quick-card"
          onClick={() => onNavigateTab && onNavigateTab('guardian')}
          role="button"
          tabIndex={0}
        >
          <div className="help-card-icon-circle icon-guardian">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <h3 className="help-card-title">Protocolo de Guardiões</h3>
          <p className="help-card-desc">
            Configure o Dead Man's Switch e pessoas de confiança para liberação das suas diretivas.
          </p>
        </div>

        <div
          className="help-quick-card"
          onClick={() => onNavigateTab && onNavigateTab('vault')}
          role="button"
          tabIndex={0}
        >
          <div className="help-card-icon-circle icon-vault">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h3 className="help-card-title">Cofre Criptografado</h3>
          <p className="help-card-desc">
            Entenda como funciona o armazenamento seguro com chave de criptografia militar AES-256.
          </p>
        </div>
      </div>

      {/* FAQ Sanfona */}
      <div className="help-faq-section">
        <h2 className="help-section-title">Perguntas Frequentes (FAQ)</h2>
        <div className="help-faq-list">
          {filteredFaqs.length === 0 ? (
            <div className="help-empty-search">
              <i className="fa-solid fa-file-circle-question"></i>
              <p>Nenhuma dúvida encontrada para "{searchQuery}".</p>
            </div>
          ) : (
            filteredFaqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className={`help-faq-item ${isOpen ? 'is-open' : ''}`}
                  onClick={() => toggleFaq(idx)}
                >
                  <div className="help-faq-question-row">
                    <span className="help-faq-q-text">{faq.question}</span>
                    <i
                      className={`fa-solid ${
                        isOpen ? 'fa-chevron-up' : 'fa-chevron-down'
                      } help-faq-chevron`}
                    ></i>
                  </div>
                  {isOpen && (
                    <div className="help-faq-answer">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Card de Atendimento ao Cliente */}
      <div className="help-support-banner">
        <div className="help-support-content">
          <div className="help-support-icon">
            <i className="fa-solid fa-headset"></i>
          </div>
          <div className="help-support-text">
            <h3>Precisa de suporte personalizado?</h3>
            <p>Nossa equipe de especialistas em legado digital está disponível para orientar sua família.</p>
          </div>
        </div>
        <a
          href="mailto:suporte@ethernity.com"
          className="help-support-contact-btn"
        >
          <i className="fa-solid fa-envelope"></i> Contatar Suporte Ethernity
        </a>
      </div>
    </div>
  );
}
