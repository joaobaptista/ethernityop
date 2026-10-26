import React, { useState, useEffect, useRef } from 'react';
import EncryptedImage from '../../../core/components/EncryptedImage.jsx';
import EncryptedVideoPlayer from '../../../core/components/EncryptedVideoPlayer.jsx';
import EncryptedAudioPlayer from '../../../core/components/EncryptedAudioPlayer.jsx';
import httpClient from '../../../core/api/httpClient.js';
import capsulesService from '../../capsules/application/capsulesService.js';
import './VaultView.css';

export const INITIAL_VAULT_ITEMS = [];

const AUTH_TOKEN_KEY = 'ethernity_auth_token';

export default function VaultView({ onNavigateTab, profile }) {
  const [activeTab, setActiveTab] = useState('capsules'); // 'capsules' | 'encrypted_media'
  const [mediaFilter, setMediaFilter] = useState('all'); // 'all' | 'IMAGE' | 'VIDEO' | 'AUDIO'
  const [isUploading, setIsUploading] = useState(false);
  const [uploadToast, setUploadToast] = useState(null);
  const [vaultMediaList, setVaultMediaList] = useState([]);
  const [capsules, setCapsules] = useState(() => capsulesService.getCapsules());
  const fileInputRef = useRef(null);

  // Sincronização reativa estrita com o capsulesService (zero mocks, ambiente 100% autêntico)
  useEffect(() => {
    // 1. Expurgo definitivo da chave de cache legada de mocks para evitar ressuscitação de dados (AGENTS.md)
    try {
      localStorage.removeItem('ethernity_vault_capsules_list');
    } catch {}

    // 2. Busca inicial do backend e subscrição reativa
    capsulesService
      .fetchCapsulesFromApi()
      .then((data) => {
        if (Array.isArray(data)) setCapsules(data);
      })
      .catch(() => {});

    const unsubscribe = capsulesService.subscribe((updated) => {
      setCapsules(Array.isArray(updated) ? updated : []);
    });

    return () => unsubscribe();
  }, []);

  // Carrega memórias e mídias do backend via httpClient
  const fetchMediaList = async () => {
    try {
      const token =
        typeof window !== 'undefined' && window.localStorage
          ? localStorage.getItem(AUTH_TOKEN_KEY) || ''
          : '';
      const data = await httpClient.get('/memories/', token);
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.memories)
        ? data.memories
        : [];
      setVaultMediaList(list);
    } catch (err) {
      console.warn('Falha ao carregar memórias do cofre:', err);
    }
  };

  useEffect(() => {
    fetchMediaList();
  }, []);

  const rawName = profile?.name
    ? profile.name.split(' ')[0]
    : profile?.email
    ? profile.email.split('@')[0]
    : 'Guardião';

  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const isFemale = profile?.gender === 'female';
  const greeting = isFemale ? 'Bem-vinda' : 'Bem-vindo';

  // Métricas dinâmicas reais baseadas nas cápsulas salvas
  const totalCapsulas = capsules.length;
  const totalMemorias = capsules.reduce((acc, curr) => {
    const photos = Array.isArray(curr.photos) ? curr.photos.length : 0;
    const audios = Array.isArray(curr.audios) ? curr.audios.length : 0;
    const messages = Array.isArray(curr.messages) ? curr.messages.length : 0;
    const sum = photos + audios + messages;
    return acc + (sum > 0 ? sum : curr.memoriesCount || 0);
  }, 0);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('Deseja excluir definitivamente esta cápsula do cofre? Esta ação é irreversível (expurgo estanque).')) {
      await capsulesService.deleteCapsule(id);
      setCapsules(capsulesService.getCapsules());
    }
  };

  const handleOpenCapsule = (cap) => {
    try {
      sessionStorage.setItem('ethernity_selected_capsule', JSON.stringify(cap));
    } catch {}
    if (onNavigateTab) {
      onNavigateTab('capsules');
    }
  };

  const handleNewCapsule = () => {
    if (onNavigateTab) {
      onNavigateTab('capsules');
    }
  };

  // Upload direto para o cofre seguro
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadToast({ text: 'Criptografando e transcodificando mídia...', type: 'info' });

    try {
      const token =
        typeof window !== 'undefined' && window.localStorage
          ? localStorage.getItem(AUTH_TOKEN_KEY) || ''
          : '';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('capsuleId', 'capsule-default');

      await httpClient.post('/vault/media/upload', formData, token);

      setUploadToast({ text: '✨ Arquivo criptografado com sucesso!', type: 'success' });
      setTimeout(() => setUploadToast(null), 4000);
      await fetchMediaList();
    } catch (err) {
      setUploadToast({ text: `Erro: ${err.message}`, type: 'error' });
      setTimeout(() => setUploadToast(null), 5000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredMedia = vaultMediaList.filter((m) => {
    if (mediaFilter === 'all') return true;
    return m.type === mediaFilter;
  });

  return (
    <div className="vault-screen-wrapper">
      <div className="vault-main-content">
        {/* Cabeçalho */}
        <div className="vault-header-row">
          <div className="vault-greeting-block">
            <h1 className="vault-welcome-title">
              {greeting} ao seu Cofre, {userName}!
            </h1>
            <p className="vault-welcome-subtitle">
              Aqui está a visão geral das suas surpresas e mídias protegidas com criptografia de ponta a ponta.
            </p>
          </div>
          <button
            type="button"
            className="btn-nova-capsula"
            onClick={handleNewCapsule}
          >
            <span className="btn-icon">+</span> Nova Cápsula
          </button>
        </div>

        {/* Abas de Navegação do Cofre */}
        <div className="vault-nav-tabs">
          <button
            type="button"
            className={`vault-nav-tab-btn ${activeTab === 'capsules' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('capsules')}
          >
            <i className="fa-solid fa-box-archive"></i>
            Cápsulas da Família ({totalCapsulas})
          </button>

          <button
            type="button"
            className={`vault-nav-tab-btn ${activeTab === 'encrypted_media' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('encrypted_media')}
          >
            <i className="fa-solid fa-shield-halved"></i>
            Cofre Criptografado Multimodal ({vaultMediaList.length})
          </button>
        </div>

        {/* ABA 1: CÁPSULAS DA FAMÍLIA */}
        {activeTab === 'capsules' && (
          <>
            {/* Cards de Métricas */}
            <div className="vault-stats-row">
              <div className="vault-metric-card">
                <div className="metric-icon-box clock-icon-box">
                  <i className="fa-regular fa-clock"></i>
                </div>
                <div className="metric-text-content">
                  <span className="metric-label">NO COFRE</span>
                  <span className="metric-value font-handwritten">
                    {totalCapsulas} {totalCapsulas === 1 ? 'Cápsula' : 'Cápsulas'}
                  </span>
                </div>
              </div>

              <div className="vault-metric-card">
                <div className="metric-icon-box mail-icon-box">
                  <i className="fa-regular fa-envelope"></i>
                </div>
                <div className="metric-text-content">
                  <span className="metric-label">TOTAL DE MEMÓRIAS</span>
                  <span className="metric-value font-handwritten">
                    {totalMemorias} {totalMemorias === 1 ? 'Criada' : 'Criadas'}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista de Cápsulas ou Empty State */}
            <div className="vault-capsules-list">
              {capsules.length === 0 ? (
                <div className="vault-empty-state">
                  <div className="vault-empty-icon-circle">
                    <i className="fa-solid fa-box-archive"></i>
                  </div>
                  <h3 className="vault-empty-title">Nenhuma cápsula guardada no cofre ainda</h3>
                  <p className="vault-empty-desc">
                    Suas cápsulas do tempo e surpresas familiares aparecerão aqui protegidas por criptografia de ponta a ponta.
                  </p>
                  <button
                    type="button"
                    className="btn-nova-capsula"
                    onClick={handleNewCapsule}
                    style={{ marginTop: '16px' }}
                  >
                    + Criar Minha Primeira Cápsula
                  </button>
                </div>
              ) : (
                capsules.map((cap, index) => {
                  const avatarUri = cap.avatar || cap.recipientAvatar;
                  const displayName = cap.recipient || cap.title || 'Cápsula Familiar';
                  const photosCount = Array.isArray(cap.photos)
                    ? cap.photos.length
                    : cap.photosCount || 0;
                  const memoriesCount =
                    (Array.isArray(cap.audios) ? cap.audios.length : 0) +
                    (Array.isArray(cap.messages) ? cap.messages.length : 0) ||
                    cap.memoriesCount ||
                    1;
                  const dateStr = cap.createdAt
                    ? new Date(cap.createdAt).toLocaleDateString('pt-BR')
                    : 'Hoje';

                  return (
                    <div
                      key={cap.id || index}
                      className="vault-capsule-row"
                      onClick={() => handleOpenCapsule(cap)}
                    >
                      <div className="capsule-left-section">
                        {avatarUri ? (
                          <img
                            src={avatarUri}
                            alt={displayName}
                            className="capsule-avatar-img"
                          />
                        ) : (
                          <div className="capsule-avatar-fallback">
                            <span>{displayName.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="capsule-info-block">
                          <h3 className="capsule-person-name">{displayName}</h3>
                          <span className="capsule-meta-counts">
                            {memoriesCount} {memoriesCount === 1 ? 'memória' : 'memórias'} • {photosCount} fotos
                          </span>
                        </div>
                      </div>

                      <div className="capsule-right-section">
                        <div className="capsule-date-block">
                          <span className="capsule-date-label">Criado em</span>
                          <span className="capsule-date-value">{dateStr}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-trash-action"
                          onClick={(e) => handleDelete(cap.id, e)}
                          title="Excluir Definitivamente"
                        >
                          <i className="fa-regular fa-trash-can"></i>
                        </button>
                        <div className="capsule-arrow-action">
                          <i className="fa-solid fa-chevron-right"></i>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ABA 2: COFRE CRIPTOGRAFADO MULTIMODAL */}
        {activeTab === 'encrypted_media' && (
          <div className="vault-multimodal-section">
            {/* Banner de Segurança Criptográfica */}
            <div className="vault-security-banner">
              <div className="vault-security-banner-left">
                <div className="vault-shield-icon">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                  <h2 className="vault-security-banner-title">
                    Cofre Multimodal Zero-Knowledge
                    <span
                      style={{
                        fontSize: '11px',
                        background: 'rgba(74, 222, 128, 0.2)',
                        color: '#4ADE80',
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      AES-256-GCM
                    </span>
                  </h2>
                  <p className="vault-security-banner-desc">
                    Fotos em WebP 300 DPI, Vídeos MP4 com streaming adaptativo HTTP 206 e Áudios com onda sonora interativa. Somente você e seus Guardiões autorizados têm a chave de acesso.
                  </p>
                </div>
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*,video/*,audio/*"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="vault-upload-trigger-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  {isUploading ? 'Processando...' : '+ Guardar Arquivo Seguro'}
                </button>
              </div>
            </div>

            {/* Toast Feedback */}
            {uploadToast && (
              <div
                style={{
                  padding: '12px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor:
                    uploadToast.type === 'error'
                      ? '#FEE2E2'
                      : uploadToast.type === 'success'
                      ? '#DCFCE7'
                      : '#E0F2FE',
                  color:
                    uploadToast.type === 'error'
                      ? '#B91C1C'
                      : uploadToast.type === 'success'
                      ? '#15803D'
                      : '#0369A1',
                }}
              >
                <span>{uploadToast.text}</span>
              </div>
            )}

            {/* Filtros de Mídia */}
            <div className="vault-filters-row">
              <button
                type="button"
                className={`vault-filter-pill ${mediaFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setMediaFilter('all')}
              >
                Todos ({vaultMediaList.length})
              </button>
              <button
                type="button"
                className={`vault-filter-pill ${mediaFilter === 'IMAGE' ? 'is-active' : ''}`}
                onClick={() => setMediaFilter('IMAGE')}
              >
                🖼️ Fotos Originais (300 DPI)
              </button>
              <button
                type="button"
                className={`vault-filter-pill ${mediaFilter === 'VIDEO' ? 'is-active' : ''}`}
                onClick={() => setMediaFilter('VIDEO')}
              >
                🎥 Vídeos (H.264 Range 206)
              </button>
              <button
                type="button"
                className={`vault-filter-pill ${mediaFilter === 'AUDIO' ? 'is-active' : ''}`}
                onClick={() => setMediaFilter('AUDIO')}
              >
                🎙️ Áudios (Waveform)
              </button>
            </div>

            {/* Grid de Mídias Criptografadas */}
            {filteredMedia.length > 0 ? (
              <div className="vault-multimodal-grid">
                {filteredMedia.map((media) => {
                  if (media.type === 'VIDEO') {
                    return (
                      <div key={media.id} className="vault-media-card" style={{ gridColumn: 'span 2' }}>
                        <EncryptedVideoPlayer
                          mediaId={media.id}
                          streamUrl={media.mediaUrl}
                          title={media.title}
                          durationSeconds={media.durationSeconds}
                        />
                        <div className="vault-card-info-block">
                          <h4 className="vault-card-title">{media.title}</h4>
                          <div className="vault-card-meta">
                            <span>Vídeo MP4 Criptografado</span>
                            <span>{media.date}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (media.type === 'AUDIO') {
                    return (
                      <div key={media.id} className="vault-media-card" style={{ gridColumn: 'span 2' }}>
                        <EncryptedAudioPlayer
                          mediaId={media.id}
                          streamUrl={media.mediaUrl}
                          initialPeaks={media.waveformPeaks}
                          title={media.title}
                          durationSeconds={media.durationSeconds}
                        />
                      </div>
                    );
                  }

                  // Default: IMAGE
                  return (
                    <div key={media.id} className="vault-media-card">
                      <div className="vault-card-media-wrapper">
                        <EncryptedImage
                          src={media.displayUrl || media.mediaUrl}
                          alt={media.title}
                          showSecurityBadge={true}
                          allowPrintExport={true}
                          dpi={media.dpi || 300}
                        />
                      </div>
                      <div className="vault-card-info-block">
                        <h4 className="vault-card-title">{media.title}</h4>
                        <div className="vault-card-meta">
                          <span>WebP Multi-Tier (300 DPI)</span>
                          <span>{media.date}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="vault-empty-media-box">
                <i
                  className="fa-solid fa-lock"
                  style={{ fontSize: '32px', color: '#B5ACA9', marginBottom: '12px', display: 'block' }}
                ></i>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: '#1F1B1A' }}>
                  Nenhum arquivo encontrado neste filtro
                </h3>
                <p style={{ fontSize: '13px', margin: 0, color: '#8C827F' }}>
                  Envie sua primeira foto, vídeo ou áudio para guardar no cofre criptografado com padrão militar AES-256-GCM.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
