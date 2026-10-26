import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import googlePhotosService from '../../../core/services/googlePhotosService.js';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import './GooglePhotosPickerModal.css';

const CATEGORIES = [
  { id: 'all', label: 'Todas as Memórias', icon: 'fa-solid fa-layer-group' },
  { id: 'family', label: 'Família & Filhos', icon: 'fa-solid fa-people-roof' },
  { id: 'special', label: 'Momentos Especiais', icon: 'fa-solid fa-wand-magic-sparkles' },
  { id: 'travel', label: 'Viagens & Férias', icon: 'fa-solid fa-plane-departure' },
  { id: 'documents', label: 'Documentos Históricos', icon: 'fa-solid fa-scroll' },
];

export default function GooglePhotosPickerModal({
  isOpen,
  onClose,
  onNavigateTab,
  onImportSuccess,
}) {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [importFeedback, setImportFeedback] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(() => googlePhotosService.getClientId());
  const [connection, setConnection] = useState(() => googlePhotosService.getConnectionStatus());

  // Estados do fluxo oficial do Google Photos Picker API
  const [pickerSession, setPickerSession] = useState(null);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isPollingPicker, setIsPollingPicker] = useState(false);
  const [pickerStatusText, setPickerStatusText] = useState('');

  const isConnected = Boolean(connection.connected || connection.isRealGoogle);

  const displayedPhotos = photos;

  // Capturar status do callback oficial do Google (?google_photos_status=connected)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const gpStatus = params.get('google_photos_status');
      const errorMsg = params.get('message') || params.get('error');

      if (gpStatus === 'connected') {
        setImportFeedback({
          type: 'success',
          text: '✨ Conta Google conectada com sucesso! Você já pode selecionar suas fotos reais.',
        });
        setTimeout(() => setImportFeedback(null), 4500);

        googlePhotosService.checkBackendStatus().then((updated) => {
          setConnection(updated);
          loadPhotos({ reset: true });
        });

        const nextUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, nextUrl);
      } else if (gpStatus === 'error' || errorMsg) {
        setApiError(decodeURIComponent(errorMsg || 'Erro na autorização com o Google.'));
        const nextUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, nextUrl);
      }
    }
  }, []);

  // Listen to connection updates
  useEffect(() => {
    const unsubscribe = googlePhotosService.subscribe((updated) => {
      setConnection(updated);
    });
    return () => unsubscribe();
  }, []);

  // Polling ativo da sessão do Google Photos Picker
  useEffect(() => {
    if (!pickerSession?.id || pickerSession?.mediaItemsSet || !isPollingPicker) return undefined;

    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const nextSession = await googlePhotosService.pollPickerSession(pickerSession.id);
        if (cancelled) return;

        setPickerSession(nextSession);

        if (nextSession.mediaItemsSet) {
          setIsPollingPicker(false);
          setPickerStatusText('✨ Seleção finalizada no Google Fotos! Baixando fotos com alta resolução...');

          try {
            const result = await googlePhotosService.importPickerSession(pickerSession.id);
            const count = result.importedCount || (result.memories || []).length;
            setImportFeedback({
              type: 'success',
              text: `✨ ${count} foto(s) importada(s) do Google Fotos com sucesso para o seu legado!`,
            });
            setTimeout(() => setImportFeedback(null), 4500);

            setPickerSession(null);
            setPickerStatusText('');
            await loadPhotos({ reset: true });

            if (onImportSuccess && result.memories) {
              onImportSuccess(result.memories);
            }
          } catch (impErr) {
            console.error('[GooglePhotosPickerModal] Import error:', impErr);
            setApiError(impErr.message || 'Falha ao importar as fotos selecionadas.');
            setIsPollingPicker(false);
          }
        } else {
          timer = setTimeout(poll, 2500);
        }
      } catch (pollErr) {
        if (!cancelled) {
          console.warn('[GooglePhotosPickerModal] Polling error:', pollErr);
        }
      }
    }

    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerSession, isPollingPicker]);

  // Recarregar fotos quando o modal abre ou os filtros mudam
  useEffect(() => {
    if (isOpen) {
      googlePhotosService.checkBackendStatus().then((status) => {
        setConnection(status);
      });
      setClientIdInput(googlePhotosService.getClientId());
      loadPhotos({ pageToken: '', reset: true });
    }
  }, [isOpen, selectedCategory, searchQuery]);

  const loadPhotos = async ({ pageToken = '', reset = false } = {}) => {
    setIsLoadingPhotos(true);
    setApiError(null);

    try {
      const list = await googlePhotosService.getPhotos({
        category: selectedCategory,
        search: searchQuery,
        pageToken,
        allowMock: false, // 100% fotos reais — sem fotos mockadas
      });

      if (reset || !pageToken) {
        setPhotos(list);
      } else {
        setPhotos((prev) => [...prev, ...list]);
      }

      setNextPageToken(list.nextPageToken || null);
    } catch (err) {
      console.warn('[GooglePhotosPickerModal] Erro ao carregar fotos:', err);
      setApiError(err.message || 'Não foi possível carregar fotos do Google Fotos.');
    } finally {
      setIsLoadingPhotos(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextPageToken || isLoadingPhotos) return;
    await loadPhotos({ pageToken: nextPageToken, reset: false });
  };

  // Conectar conta via Google OAuth 2.0 oficial no Backend
  const handleConnectGoogle = async () => {
    setApiError(null);
    setIsLoadingPhotos(true);
    try {
      await googlePhotosService.loginWithGoogle();
    } catch (err) {
      console.error('[GooglePhotosPickerModal] Login error:', err);
      setApiError(err.message || 'Falha ao autenticar com o Google.');
      setIsLoadingPhotos(false);
    }
  };

  // Iniciar fluxo do Google Photos Picker oficial
  const handleStartGooglePicker = async () => {
    setIsOpeningPicker(true);
    setApiError(null);
    setPickerStatusText('Iniciando o seletor oficial do Google Fotos...');

    try {
      const session = await googlePhotosService.createPickerSession('capsule-default');
      const pickerUri = session.pickerUri || session.picker_uri;

      if (!session?.id || !pickerUri) {
        throw new Error('A API não retornou uma sessão válida do Google Fotos.');
      }

      setPickerSession(session);
      setIsPollingPicker(true);
      setPickerStatusText('Aguardando você selecionar fotos no Google Fotos...');

      const targetUrl = `${pickerUri.replace(/\/$/, '')}/autoclose`;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[GooglePhotosPickerModal] Error starting picker:', err);
      setApiError(err.message || 'Não foi possível abrir o seletor do Google Fotos.');
      setPickerSession(null);
      setIsPollingPicker(false);
    } finally {
      setIsOpeningPicker(false);
    }
  };

  const handleDisconnect = async () => {
    await googlePhotosService.disconnectAccount();
    setSelectedPhotoIds([]);
    setPhotos([]);
    setNextPageToken(null);
    setPickerSession(null);
    setIsPollingPicker(false);
    setImportFeedback({
      type: 'info',
      text: 'Conta do Google Fotos desconectada.',
    });
    setTimeout(() => setImportFeedback(null), 2500);
    await loadPhotos({ reset: true });
  };

  const handleSaveClientId = () => {
    const saved = googlePhotosService.setClientId(clientIdInput.trim());
    setImportFeedback({
      type: 'success',
      text: saved ? 'Google Client ID salvo com sucesso!' : 'Client ID removido.',
    });
    setTimeout(() => setImportFeedback(null), 3000);
    setShowConfigPanel(false);
    setApiError(null);
  };

  const handleToggleSelect = (photoId) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleSelectAll = () => {
    const currentList = displayedPhotos;
    const isAllCurrentSelected =
      currentList.length > 0 && currentList.every((p) => selectedPhotoIds.includes(p.id));
    if (isAllCurrentSelected) {
      setSelectedPhotoIds((prev) => prev.filter((id) => !currentList.some((p) => p.id === id)));
    } else {
      setSelectedPhotoIds((prev) => Array.from(new Set([...prev, ...currentList.map((p) => p.id)])));
    }
  };

  const handleImportToVault = async () => {
    if (selectedPhotoIds.length === 0) return;
    setIsImporting(true);
    setImportFeedback({ type: 'loading', text: 'Criptografando com AES-256 e salvando no Cofre Digital...' });

    try {
      const selectedObjects = photos.filter((p) => selectedPhotoIds.includes(p.id));
      const result = await googlePhotosService.importPhotos(selectedObjects, {
        recipient: 'Para Toda a Família',
      });

      setImportFeedback({
        type: 'success',
        text: `✨ ${result.importedCount} foto(s) protegida(s) no seu Cofre Digital!`,
      });

      if (onImportSuccess) {
        onImportSuccess(result.importedItems);
      }

      setTimeout(() => {
        setIsImporting(false);
        setImportFeedback(null);
        setSelectedPhotoIds([]);
        onClose();
        if (onNavigateTab) {
          onNavigateTab('vault');
        }
      }, 1600);
    } catch (err) {
      console.error('Erro na importação:', err);
      setIsImporting(false);
      setImportFeedback({ type: 'error', text: 'Ocorreu um erro ao importar fotos.' });
    }
  };

  const handleCreateCapsuleWithPhotos = async () => {
    if (selectedPhotoIds.length === 0) return;
    setIsImporting(true);
    setImportFeedback({ type: 'loading', text: 'Preparando memórias para a sua nova Cápsula do Tempo...' });

    try {
      const selectedObjects = photos.filter((p) => selectedPhotoIds.includes(p.id));
      const result = await googlePhotosService.importPhotos(selectedObjects, {
        recipient: 'Destinatário da Cápsula',
      });

      try {
        sessionStorage.setItem(
          'ethernity_capsule_draft_photos',
          JSON.stringify(result.importedItems)
        );
      } catch (e) {
        console.warn('Draft capsule storage note:', e);
      }

      if (onImportSuccess) {
        onImportSuccess(result.importedItems);
      }

      setTimeout(() => {
        setIsImporting(false);
        setImportFeedback(null);
        setSelectedPhotoIds([]);
        onClose();
        if (onNavigateTab) {
          onNavigateTab('capsules');
        }
      }, 1200);
    } catch (err) {
      console.error('Erro ao criar cápsula com fotos:', err);
      setIsImporting(false);
      setImportFeedback({ type: 'error', text: 'Falha ao vincular fotos à cápsula.' });
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="gp-modal-overlay fade-in" onClick={onClose}>
      <div className="gp-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="gp-modal-header">
          <div className="gp-header-brand">
            <div className="gp-logo-icon">
              <i className="fa-solid fa-asterisk"></i>
            </div>
            <div>
              <h2 className="gp-modal-title">Google Fotos — Galeria de Memórias</h2>
              <div className="gp-account-pill">
                {isConnected ? (
                  <>
                    {connection.avatarUrl && (
                      <img
                        src={connection.avatarUrl}
                        alt={connection.name || 'Google'}
                        className="gp-avatar-mini"
                      />
                    )}
                    <span className="gp-status-dot connected"></span>
                    <span>Conectado como: <strong>{connection.email || 'Conta Google Oficial'}</strong></span>
                    <span className="gp-oauth-tag official">Google Oficial</span>
                    <button
                      type="button"
                      className="gp-btn-switch-account"
                      onClick={handleDisconnect}
                      title="Desconectar ou alternar conta Google"
                    >
                      <i className="fa-solid fa-arrow-right-from-bracket"></i> Desconectar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="gp-status-dot demo"></span>
                    <span>Conta não conectada</span>
                    <button
                      type="button"
                      className="gp-btn-connect-header"
                      onClick={handleConnectGoogle}
                    >
                      <i className="fa-brands fa-google"></i> Conectar Minha Conta Google
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="gp-header-actions">
            <button
              type="button"
              className={`gp-btn-settings-toggle ${showConfigPanel ? 'active' : ''}`}
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              title="Configurar Google Client ID"
              aria-label="Configurar Client ID"
            >
              <i className="fa-solid fa-gear"></i>
            </button>
            <button
              type="button"
              className="gp-btn-close"
              onClick={onClose}
              title="Fechar galeria"
              aria-label="Fechar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* Config / Client ID Setup Panel */}
        {showConfigPanel && (
          <div className="gp-config-banner fade-in">
            <div className="gp-config-header">
              <div className="gp-config-title">
                <i className="fa-solid fa-key"></i>
                <strong>Configurações do Google Cloud OAuth & Picker API</strong>
              </div>
              <button
                type="button"
                className="gp-config-close"
                onClick={() => setShowConfigPanel(false)}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <p className="gp-config-desc">
              O backend do Ethernity já gerencia as credenciais criptografadas e a URL de callback oficial (<code>http://localhost:3333/api/integrations/google-photos/callback</code>).
            </p>
            <div className="gp-config-input-row">
              <input
                type="text"
                placeholder="Ex.: 123456789-xxxxxxxxxxxxxx.apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                className="gp-config-input"
              />
              <button
                type="button"
                className="gp-btn-save-config"
                onClick={handleSaveClientId}
              >
                <i className="fa-solid fa-check"></i> Salvar
              </button>
            </div>
          </div>
        )}

        {/* Error Feedback Banner */}
        {apiError && (
          <div className="gp-api-error-banner fade-in">
            <div className="gp-api-error-content">
              <i className="fa-solid fa-circle-exclamation"></i>
              <div>
                <strong>Atenção:</strong> {apiError}
              </div>
            </div>
            <div className="gp-api-error-actions">
              <button
                type="button"
                className="gp-btn-retry-auth"
                onClick={handleConnectGoogle}
              >
                <i className="fa-brands fa-google"></i> Conectar com Google
              </button>
              <button
                type="button"
                className="gp-btn-dismiss-error"
                onClick={() => setApiError(null)}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        )}

        {/* Feedback Banner */}
        {importFeedback && (
          <div className={`gp-import-feedback ${importFeedback.type}`}>
            {importFeedback.type === 'loading' && (
              <div className="gp-spinner-sm"></div>
            )}
            {importFeedback.type === 'success' && (
              <i className="fa-solid fa-circle-check"></i>
            )}
            {importFeedback.type === 'error' && (
              <i className="fa-solid fa-circle-exclamation"></i>
            )}
            {importFeedback.type === 'info' && (
              <i className="fa-solid fa-circle-info"></i>
            )}
            <span>{importFeedback.text}</span>
          </div>
        )}

        {/* =========================================================================
            CASO 1: CONTA NÃO CONECTADA (HERO CARD COM CTA REAL — SEM FOTOS FALSAS)
            ========================================================================= */}
        {!isConnected ? (
          <div className="gp-welcome-hero fade-in">
            <div className="gp-welcome-hero-card">
              <div className="gp-hero-icon-bubble">
                <i className="fa-solid fa-asterisk"></i>
              </div>
              <h3 className="gp-hero-title">Conecte sua Conta do Google Fotos</h3>
              <p className="gp-hero-subtitle">
                Acesse suas recordações diretamente do Google com privacidade absoluta e criptografia de ponta a ponta (AES-256).
                Nenhuma foto falsa ou simulada é exibida — você escolhe diretamente no Google Fotos quais memórias deseja trazer para o Ethernity.
              </p>

              <div className="gp-hero-features-grid">
                <div className="gp-hero-feature-item">
                  <i className="fa-solid fa-shield-halved"></i>
                  <div>
                    <strong>Privacidade Garantida</strong>
                    <span>Apenas as fotos que você selecionar manualmente no Google serão salvas.</span>
                  </div>
                </div>
                <div className="gp-hero-feature-item">
                  <i className="fa-solid fa-lock"></i>
                  <div>
                    <strong>Criptografia AES-256</strong>
                    <span>Cada foto é gravada com segurança de nível militar no seu Cofre Digital.</span>
                  </div>
                </div>
                <div className="gp-hero-feature-item">
                  <i className="fa-solid fa-cloud-arrow-down"></i>
                  <div>
                    <strong>Importação Sob Demanda</strong>
                    <span>Escolha facilmente as fotos que deseja trazer para o seu cofre.</span>
                  </div>
                </div>
                <div className="gp-hero-feature-item">
                  <i className="fa-brands fa-google"></i>
                  <div>
                    <strong>Google Photos Picker API</strong>
                    <span>Integração oficial em alta resolução, direto da nuvem do Google.</span>
                  </div>
                </div>
              </div>

              <div className="gp-hero-cta-wrap">
                <button
                  type="button"
                  className="gp-btn-hero-connect"
                  onClick={handleConnectGoogle}
                  disabled={isLoadingPhotos}
                >
                  <i className="fa-brands fa-google"></i>
                  <span>{isLoadingPhotos ? 'Conectando...' : 'Conectar Minha Conta Google'}</span>
                </button>
                <span className="gp-hero-security-note">
                  <i className="fa-solid fa-lock"></i> Autorização oficial via Google Cloud OAuth 2.0
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
              CASO 2: CONTA CONECTADA (SELETOR REAL GOOGLE PICKER & GALERIA)
              ========================================================================= */
          <>
            {/* Banner de Ação do Google Photos Picker Oficial */}
            <div className="gp-picker-action-banner">
              <div className="gp-picker-action-left">
                <div className="gp-picker-action-icon">
                  <i className="fa-brands fa-google"></i>
                </div>
                <div className="gp-picker-action-text">
                  <strong>Escolha fotos da sua conta no Google Fotos</strong>
                  <p>Abra a biblioteca oficial do Google para selecionar fotos de pessoas, datas ou álbuns com total privacidade.</p>
                </div>
              </div>

              <div className="gp-picker-action-right">
                {isPollingPicker ? (
                  <div className="gp-picker-polling-state">
                    <div className="gp-spinner-sm"></div>
                    <span className="gp-polling-msg">{pickerStatusText || 'Aguardando seleção no Google Fotos...'}</span>
                    {pickerSession?.pickerUri && (
                      <a
                        href={`${pickerSession.pickerUri.replace(/\/$/, '')}/autoclose`}
                        target="_blank"
                        rel="noreferrer"
                        className="gp-btn-reopen-picker"
                      >
                        <i className="fa-solid fa-arrow-up-right-from-square"></i> Abrir Seletor
                      </a>
                    )}
                    <button
                      type="button"
                      className="gp-btn-cancel-picker"
                      onClick={() => {
                        setIsPollingPicker(false);
                        setPickerSession(null);
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="gp-btn-open-picker"
                    onClick={handleStartGooglePicker}
                    disabled={isOpeningPicker}
                  >
                    <i className="fa-solid fa-cloud-arrow-down"></i>
                    <span>{isOpeningPicker ? 'Abrindo Seletor...' : 'Escolher Fotos no Google Fotos'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Toolbar: Search & Category Tabs */}
            <div className="gp-modal-toolbar">
              <div className="gp-search-wrap">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  type="text"
                  placeholder="Buscar por lugar, momento, pessoas ou data..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="gp-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="gp-search-clear"
                    onClick={() => setSearchQuery('')}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>

              <div className="gp-category-tabs">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`gp-cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    <i className={cat.icon}></i>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selection Stats Bar */}
            <div className="gp-selection-bar">
              <div className="gp-selection-stats">
                <span>
                  <i className="fa-solid fa-cloud-check" style={{ color: '#34A853', marginRight: '6px' }}></i>
                  Fotos reais importadas do seu <strong>Google Fotos</strong> ({photos.length} disponíveis)
                </span>
                {selectedPhotoIds.length > 0 && (
                  <span className="gp-selected-badge">
                    <i className="fa-solid fa-check"></i> {selectedPhotoIds.length} selecionada(s)
                  </span>
                )}
              </div>

              <div className="gp-selection-actions">
                <button
                  type="button"
                  className="gp-btn-select-all"
                  onClick={handleSelectAll}
                >
                  {selectedPhotoIds.length === displayedPhotos.length && displayedPhotos.length > 0
                    ? 'Desmarcar Todas'
                    : 'Selecionar Todas'}
                </button>
              </div>
            </div>

            {/* Photos Scroll Area */}
            <div className="gp-photos-scroll-area">
              {isLoadingPhotos && photos.length === 0 ? (
                <div className="gp-loading-state">
                  <div className="gp-spinner-lg"></div>
                  <h3>Carregando suas fotos do Google Fotos...</h3>
                  <p>Consultando sua galeria segura e protegida.</p>
                </div>
              ) : displayedPhotos.length === 0 ? (
                <div className="gp-empty-state">
                  <div className="gp-empty-icon-wrap">
                    <i className="fa-solid fa-images gp-empty-icon"></i>
                  </div>
                  <h3>Nenhuma foto importada ainda</h3>
                  <p>
                    Sua conta está conectada! Clique no botão abaixo para abrir o seletor oficial do Google Fotos e escolher quais recordações trazer para o Ethernity.
                  </p>
                  <button
                    type="button"
                    className="gp-btn-connect-primary"
                    onClick={handleStartGooglePicker}
                    disabled={isOpeningPicker || isPollingPicker}
                  >
                    <i className="fa-solid fa-cloud-arrow-down"></i>
                    <span>{isOpeningPicker ? 'Abrindo...' : 'Escolher Fotos no Google Fotos'}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="gp-photos-grid">
                    {displayedPhotos.map((photo) => {
                      const isSelected = selectedPhotoIds.includes(photo.id);
                      return (
                        <div
                          key={photo.id}
                          className={`gp-photo-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleSelect(photo.id)}
                        >
                          <div className="gp-photo-thumb-wrap">
                            <img
                              src={photo.thumbnailUrl || photo.fullUrl}
                              alt={photo.title}
                              className="gp-photo-img"
                              loading="lazy"
                            />
                            <div className={`gp-photo-check ${isSelected ? 'active' : ''}`}>
                              <i className="fa-solid fa-check"></i>
                            </div>

                            <button
                              type="button"
                              className="gp-btn-lightbox-trigger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxPhoto(photo);
                              }}
                              title="Ampliar visualização"
                            >
                              <i className="fa-solid fa-expand"></i>
                            </button>

                            <div className="gp-photo-overlay-info">
                              <span className="gp-photo-date">
                                <i className="fa-regular fa-calendar"></i> {photo.date}
                              </span>
                              {photo.camera && (
                                <span className="gp-photo-camera">
                                  <i className="fa-solid fa-camera"></i> {photo.camera}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="gp-photo-meta">
                            <h4 className="gp-photo-title">{photo.title}</h4>
                            {photo.description && (
                              <p className="gp-photo-desc">{photo.description}</p>
                            )}
                            <div className="gp-photo-tags">
                              <span className="gp-tag-category">{photo.categoryLabel || 'Google Fotos'}</span>
                              <span className="gp-tag-encrypted">
                                <i className="fa-solid fa-lock"></i> AES-256
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Load More Button */}
                  {nextPageToken && (
                    <div className="gp-load-more-wrap">
                      <button
                        type="button"
                        className="gp-btn-load-more"
                        onClick={handleLoadMore}
                        disabled={isLoadingPhotos}
                      >
                        {isLoadingPhotos ? (
                          <>
                            <div className="gp-spinner-sm"></div>
                            <span>Carregando mais fotos do Google...</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-arrow-down"></i>
                            <span>Carregar Mais Fotos</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Actions */}
            <div className="gp-modal-footer">
              <div className="gp-footer-security">
                <i className="fa-solid fa-shield-halved"></i>
                <span>
                  Privacidade Garantida: Apenas as fotos que você selecionar são importadas e criptografadas.
                </span>
              </div>

              <div className="gp-footer-buttons">
                <button
                  type="button"
                  className="gp-btn-secondary"
                  onClick={handleImportToVault}
                  disabled={selectedPhotoIds.length === 0 || isImporting}
                >
                  <i className="fa-solid fa-box-archive"></i>
                  <span>Importar para o Meu Cofre ({selectedPhotoIds.length})</span>
                </button>

                <button
                  type="button"
                  className="gp-btn-primary"
                  onClick={handleCreateCapsuleWithPhotos}
                  disabled={selectedPhotoIds.length === 0 || isImporting}
                >
                  <i className="fa-solid fa-hourglass-start"></i>
                  <span>Criar Cápsula com estas Fotos ({selectedPhotoIds.length})</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Fullscreen Lightbox Preview */}
        {lightboxPhoto && (
          <div
            className="gp-lightbox-backdrop fade-in"
            onClick={() => setLightboxPhoto(null)}
          >
            <div
              className="gp-lightbox-content"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="gp-lightbox-close"
                onClick={() => setLightboxPhoto(null)}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>

              <div className="gp-lightbox-media-wrap">
                <img
                  src={lightboxPhoto.fullUrl || lightboxPhoto.thumbnailUrl}
                  alt={lightboxPhoto.title}
                  className="gp-lightbox-img"
                />
              </div>

              <div className="gp-lightbox-sidebar">
                <div className="gp-lightbox-badge">
                  <i className="fa-solid fa-asterisk"></i> Google Fotos HD
                </div>
                <h3>{lightboxPhoto.title}</h3>
                {lightboxPhoto.description && (
                  <p className="gp-lb-desc">{lightboxPhoto.description}</p>
                )}

                <div className="gp-lb-details-list">
                  <div className="gp-lb-detail-item">
                    <i className="fa-regular fa-calendar"></i>
                    <div>
                      <label>Data da Memória</label>
                      <span>{lightboxPhoto.date}</span>
                    </div>
                  </div>

                  <div className="gp-lb-detail-item">
                    <i className="fa-solid fa-location-dot"></i>
                    <div>
                      <label>Localização</label>
                      <span>{lightboxPhoto.location || 'Google Fotos'}</span>
                    </div>
                  </div>

                  <div className="gp-lb-detail-item">
                    <i className="fa-solid fa-lock"></i>
                    <div>
                      <label>Segurança de Importação</label>
                      <span>Criptografia Ponta a Ponta (AES-256-GCM)</span>
                    </div>
                  </div>
                </div>

                <div className="gp-lb-actions">
                  <button
                    type="button"
                    className={`gp-lb-select-btn ${
                      selectedPhotoIds.includes(lightboxPhoto.id) ? 'selected' : ''
                    }`}
                    onClick={() => handleToggleSelect(lightboxPhoto.id)}
                  >
                    {selectedPhotoIds.includes(lightboxPhoto.id) ? (
                      <>
                        <i className="fa-solid fa-check"></i> Foto Selecionada
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-plus"></i> Selecionar para Importar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
