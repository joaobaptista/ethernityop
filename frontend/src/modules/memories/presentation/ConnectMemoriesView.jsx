import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import googlePhotosService from '../../../core/services/googlePhotosService.js';
import faceRecognitionService from '../../../core/services/faceRecognitionService.js';
import memoriesService from '../application/memoriesService.js';
import { groupPhotosByYear, calculateSelectionStats } from '../domain/memoriesModel.js';
import { SUBSCRIPTION_PLANS, getEffectiveUserPlan } from '../../subscription/domain/subscriptionModel.js';
import GooglePhotosPickerModal from './GooglePhotosPickerModal.jsx';
import UploadProgressModal from './UploadProgressModal.jsx';
import SelectPeopleGrid from '../../../core/components/SelectPeopleGrid.jsx';
import SpecialPersonFormCard from '../../../core/components/SpecialPersonFormCard.jsx';
import EncryptedImage from '../../../core/components/EncryptedImage.jsx';
import capsulesService, { DEFAULT_CAPSULES } from '../../capsules/application/capsulesService.js';
import './ConnectMemoriesView.css';

export default function ConnectMemoriesView({ onNavigateTab, profile }) {
  const { t } = useI18n();

  // Modo de exibição: 'connect' | 'connected_sources' | 'permissions' | 'curation' | 'select_people' | 'configure_person_details'
  const [viewMode, setViewMode] = useState('connect');

  // Estado das fotos gerenciado pelo MemoriesService
  const [photos, setPhotos] = useState(() => memoriesService.getPhotosSync());

  // Estados do Fluxo de Pessoas e Detecção Facial
  const [detectedPeopleList, setDetectedPeopleList] = useState([]);
  const [totalPhotosAnalyzed, setTotalPhotosAnalyzed] = useState(0);
  const [isAnalyzingFaces, setIsAnalyzingFaces] = useState(false);
  const [selectedPeopleIds, setSelectedPeopleIds] = useState([]);
  const [activePersonIndex, setActivePersonIndex] = useState(0);

  // Modais
  const [isAddSourcesModalOpen, setIsAddSourcesModalOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Upload Progress Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFilesState, setUploadFilesState] = useState([]);
  const [overallUploadProgress, setOverallUploadProgress] = useState(0);
  const [isUploadProcessing, setIsUploadProcessing] = useState(false);

  // Status de conexão das fontes
  const [googleConnection, setGoogleConnection] = useState(() =>
    googlePhotosService.getConnectionStatus()
  );
  const [isIcloudConnected, setIsIcloudConnected] = useState(false);

  const fileInputRef = useRef(null);

  // Sincronização e subscrição ao MemoriesService
  useEffect(() => {
    memoriesService.getPhotos().then(setPhotos);

    const unsubscribe = memoriesService.subscribe((updatedPhotos) => {
      setPhotos(updatedPhotos);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    googlePhotosService.checkBackendStatus().then((status) => {
      if (status) setGoogleConnection(status);
    });

    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_photos_status') === 'connected') {
        showToast('✨ Conta Google conectada com sucesso! Abrindo seletor...', 'success');
        setIsPickerOpen(true);
        setViewMode('curation');
        const nextUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, nextUrl);
      }
    }

    const unsubscribe = googlePhotosService.subscribe((status) => {
      setGoogleConnection(status);
    });
    return () => unsubscribe();
  }, []);

  // Anos da Linha do Tempo
  const years = useMemo(() => [2024, 2023], []);

  // Fotos agrupadas por ano com filtro ou destaque da IA
  const photosByYear = useMemo(() => {
    return groupPhotosByYear(photos, years);
  }, [photos, years]);

  // Contagens e estatísticas de seleção
  const { selectedCount: totalSelectedCount, isAllSelected } = useMemo(
    () => calculateSelectionStats(photos),
    [photos]
  );

  // Abertura direta do seletor do Google Fotos
  const handleOpenGooglePhotos = () => {
    setIsAddSourcesModalOpen(false);
    if (!googleConnection.connected && !googleConnection.isRealGoogle) {
      googlePhotosService.loginWithGoogle();
    } else {
      setIsPickerOpen(true);
    }
  };

  // Toast Helper
  const showToast = (text, type = 'success') => {
    setFeedbackToast({ text, type });
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  // Toggle de seleção individual
  const handleTogglePhoto = async (photoId) => {
    await memoriesService.toggleSelection(photoId);
  };

  // Selecionar Todas / Desmarcar Todas
  const handleToggleSelectAll = async () => {
    const nextState = !isAllSelected;
    await memoriesService.setAllSelection(nextState);
    showToast(
      nextState ? t('connectMemories.toastAllSelected') : t('connectMemories.toastAllDeselected'),
      'info'
    );
  };

  // Limite do Plano Dinâmico (Ilimitado para Vagner/Infinity)
  const currentPlan = getEffectiveUserPlan(null, profile);
  const maxAllowedPeople = currentPlan.maxRecipients || 9999;

  // Inicia o fluxo de reconhecimento facial com as fotos alvo
  const startFaceDetectionFlow = async (targetPhotos) => {
    if (!Array.isArray(targetPhotos) || targetPhotos.length === 0) return;
    memoriesService.setActivePhotosForCapsules(targetPhotos);
    setViewMode('select_people');
    setTotalPhotosAnalyzed(targetPhotos.length);
    setIsAnalyzingFaces(true);
    setSelectedPeopleIds([]);
    try {
      const clusters = await faceRecognitionService.detectAndClusterPeople(targetPhotos);
      if (Array.isArray(clusters) && clusters.length > 0) {
        setDetectedPeopleList(clusters);
        if (clusters.length === 1) {
          setSelectedPeopleIds([clusters[0].id]);
        }
        showToast(`✨ ${clusters.length} pessoa(s) identificada(s) nas fotos!`);
      } else {
        setDetectedPeopleList([]);
        showToast('⚠️ Nenhum rosto foi detectado na foto enviada. Envie uma foto com rosto nítido.', 'warning');
      }
    } catch (err) {
      console.warn('[ConnectMemoriesView] Erro na detecção facial:', err);
      setDetectedPeopleList([]);
    } finally {
      setIsAnalyzingFaces(false);
    }
  };

  // Toggle de Seleção de Pessoa no Grid
  const togglePersonSelection = (id) => {
    setSelectedPeopleIds((prev) => {
      if (prev.includes(id)) return prev.filter((pId) => pId !== id);
      if (prev.length >= maxAllowedPeople) {
        showToast(`⚠️ Seu plano (${currentPlan.name}) permite até ${maxAllowedPeople} pessoas.`, 'warning');
        return prev;
      }
      return [...prev, id];
    });
  };

  const selectedPeople = detectedPeopleList.filter((p) => selectedPeopleIds.includes(p.id));
  const currentPerson = selectedPeople[activePersonIndex] || selectedPeople[0];

  // Avança para o formulário de detalhes da pessoa
  const handleProceedToConfigure = () => {
    if (selectedPeopleIds.length === 0) {
      showToast('⚠️ Selecione pelo menos uma pessoa para criar a cápsula.', 'warning');
      return;
    }
    setActivePersonIndex(0);
    setViewMode('configure_person_details');
  };

  // Salva dados da pessoa ativa e avança ou conclui criando as cápsulas
  const handleSavePersonAndNext = (details) => {
    const updated = [...detectedPeopleList];
    const curr = selectedPeople[activePersonIndex];
    if (curr) {
      const pIdx = updated.findIndex((p) => p.id === curr.id);
      if (pIdx !== -1) {
        updated[pIdx] = {
          ...updated[pIdx],
          ...details,
        };
        setDetectedPeopleList(updated);
      }
    }

    if (activePersonIndex < selectedPeople.length - 1) {
      setActivePersonIndex((prev) => prev + 1);
      showToast(`✨ Dados de ${details.name} salvos! Próxima pessoa...`);
    } else {
      // Cria uma cápsula individual para cada pessoa selecionada com suas fotos reais do upload
      const activeUploadPhotos = memoriesService.getActivePhotosForCapsules() || [];
      const newCapsules = selectedPeople.map((p, idx) => {
        const finalName = p.id === curr?.id ? details.name : (p.name || 'Pessoa Especial');
        const finalRel = p.id === curr?.id ? details.relationship : (p.relationship || 'Familiar');
        const originalFallback = capsulesService.findOriginalUploadedPhotos();
        const personPhotos = (Array.isArray(p.photos) && p.photos.length > 0)
          ? p.photos
          : (activeUploadPhotos.length > 0 ? activeUploadPhotos : (originalFallback.length > 0 ? originalFallback : (p.avatar ? [{ id: `photo-${Date.now()}`, img: p.avatar, title: 'Foto de ' + finalName, dateLabel: 'Hoje' }] : [])));
        const photosCount = `${personPhotos.length} ${personPhotos.length === 1 ? 'foto' : 'fotos'}`;
        return {
          id: `cap-auto-${Date.now()}-${idx}`,
          title: `Cápsula: Presente para ${finalName}`,
          recipient: `${finalName} (${finalRel})`,
          avatar: p.avatar,
          triggerLabel: '12 de Outubro de 2032',
          contentsSummary: `${photosCount} • Mensagem de Amor`,
          sealColor: idx % 2 === 0 ? '#F05A47' : '#7E57C2',
          statusText: 'Bloqueada até a data',
          personId: p.id,
          photosCount: photosCount,
          photos: personPhotos,
        };
      });

      // Salva no storage garantindo SEMPRE a permanência dos cards que já existiam e suas fotos reais
      capsulesService.addCapsules(newCapsules);
      memoriesService.setActivePhotosForCapsules([]);

      showToast(`✨ ${selectedPeople.length} cápsula(s) criada(s) com sucesso! Redirecionando para a lista...`);
      sessionStorage.setItem('ethernity_capsules_initial_mode', 'list');
      setTimeout(() => {
        if (onNavigateTab) onNavigateTab('capsules');
      }, 700);
    }
  };

  // Pular pessoa atual
  const handleSkipPerson = () => {
    if (activePersonIndex < selectedPeople.length - 1) {
      setActivePersonIndex((prev) => prev + 1);
    } else {
      // Se era a última pessoa, persiste as cápsulas válidas mantendo as existentes
      const validPeople = selectedPeople.filter((p, i) => i !== activePersonIndex || p.name);
      const activeUploadPhotos = memoriesService.getActivePhotosForCapsules() || [];
      if (validPeople.length > 0) {
        const newCapsules = validPeople.map((p, idx) => {
          const personPhotos = (Array.isArray(p.photos) && p.photos.length > 0)
            ? p.photos
            : (activeUploadPhotos.length > 0 ? activeUploadPhotos : (p.avatar ? [{ id: `photo-${Date.now()}`, img: p.avatar, title: 'Foto de ' + (p.name || 'Pessoa'), dateLabel: 'Hoje' }] : []));
          return {
            id: `cap-auto-${Date.now()}-${idx}`,
            title: `Cápsula: Presente para ${p.name || 'Pessoa Especial'}`,
            recipient: `${p.name || 'Pessoa Especial'} (${p.relationship || 'Familiar'})`,
            avatar: p.avatar,
            triggerLabel: '12 de Outubro de 2032',
            contentsSummary: `${personPhotos.length} fotos • Mensagem de Amor`,
            sealColor: idx % 2 === 0 ? '#F05A47' : '#7E57C2',
            statusText: 'Bloqueada até a data',
            personId: p.id,
            photosCount: `${personPhotos.length} fotos`,
            photos: personPhotos,
          };
        });
        capsulesService.addCapsules(newCapsules);
      }
      memoriesService.setActivePhotosForCapsules([]);
      showToast('✨ Redirecionando para suas Cápsulas...');
      sessionStorage.setItem('ethernity_capsules_initial_mode', 'list');
      setTimeout(() => {
        if (onNavigateTab) onNavigateTab('capsules');
      }, 700);
    }
  };

  // Callback ao importar fotos do Google Fotos
  const handleGoogleImportSuccess = async (importedItems) => {
    if (!importedItems || importedItems.length === 0) return;
    const newPhotos = await memoriesService.importGooglePhotos(importedItems);
    showToast(t('connectMemories.toastGoogleImported', { count: importedItems.length }));
    startFaceDetectionFlow(newPhotos);
  };

  // Upload Manual de Arquivos
  const handleTriggerUpload = () => {
    setIsAddSourcesModalOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    // Reset input value so the same files can be re-selected if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Inicializa estado dos arquivos para o modal
    const initialFiles = rawFiles.map((file, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending', // 'pending' | 'uploading' | 'completed' | 'error'
      preview: null,
      rawFile: file,
    }));

    setUploadFilesState(initialFiles);
    setOverallUploadProgress(0);
    setIsUploadProcessing(true);
    setIsUploadModalOpen(true);

    const newPhotos = [];
    const total = rawFiles.length;

    // Processamento sequencial / controlado com animação suave de progresso
    const processFile = (index) => {
      if (index >= total) {
        // Conclusão de todos os arquivos com criptografia e persistência
        setIsUploadProcessing(false);
        setOverallUploadProgress(100);
        memoriesService.setActivePhotosForCapsules(newPhotos);
        try {
          sessionStorage.setItem('ethernity_capsules_initial_mode', 'select_people');
        } catch {}
        try {
          sessionStorage.setItem('ethernity_active_photos_for_capsules', JSON.stringify(newPhotos));
        } catch (e) {
          console.warn('SessionStorage save active photos note:', e);
        }

        memoriesService.addLocalPhotos(newPhotos).then(() => {
          showToast(t('connectMemories.toastLocalAdded', { count: total }));
          // Abre diretamente a tela onde mostra o rosto identificado para selecionar!
          setTimeout(() => {
            setIsUploadModalOpen(false);
            startFaceDetectionFlow(newPhotos);
          }, 400);
        });
        return;
      }

      const fileObj = rawFiles[index];
      const fileId = initialFiles[index].id;

      // Marca o arquivo atual como 'uploading'
      setUploadFilesState((prev) =>
        prev.map((item) =>
          item.id === fileId ? { ...item, status: 'uploading', progress: 15 } : item
        )
      );

      const reader = new FileReader();

      // Atualiza progresso durante a leitura do arquivo
      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(85, Math.round((event.loaded / event.total) * 75) + 15);
          setUploadFilesState((prev) =>
            prev.map((item) =>
              item.id === fileId ? { ...item, progress: percent } : item
            )
          );
          // Atualiza progresso geral
          const baseDone = (index / total) * 100;
          const currentContribution = (percent / 100) * (100 / total);
          setOverallUploadProgress(Math.min(99, Math.round(baseDone + currentContribution)));
        }
      };

      reader.onload = (event) => {
        const dataUrl = event.target.result;

        // Simulando etapa de criptografia e processamento E2EE
        setTimeout(() => {
          newPhotos.push({
            id: `local-file-${Date.now()}-${index}`,
            img: dataUrl,
            title: fileObj.name,
            dateLabel: 'Hoje',
            year: new Date().getFullYear(),
            selected: true,
            source: 'local',
          });

          setUploadFilesState((prev) =>
            prev.map((item) =>
              item.id === fileId
                ? { ...item, status: 'completed', progress: 100, preview: dataUrl }
                : item
            )
          );

          const overall = Math.round(((index + 1) / total) * 100);
          setOverallUploadProgress(overall);

          // Próximo arquivo na fila
          setTimeout(() => {
            processFile(index + 1);
          }, 180);
        }, 320);
      };

      reader.onerror = () => {
        setUploadFilesState((prev) =>
          prev.map((item) =>
            item.id === fileId ? { ...item, status: 'error', progress: 0 } : item
          )
        );
        setTimeout(() => {
          processFile(index + 1);
        }, 200);
      };

      reader.readAsDataURL(fileObj);
    };

    // Inicia a fila a partir do primeiro arquivo
    processFile(0);
  };

  // Conexão simulada Apple iCloud
  const handleConnectIcloud = () => {
    setIsAddSourcesModalOpen(false);
    showToast(t('connectMemories.toastSyncingIcloud'), 'info');
    setTimeout(() => {
      setIsIcloudConnected(true);
      showToast(t('connectMemories.toastIcloudConnected'));
    }, 1200);
  };

  return (
    <div className="curator-page-container fade-in">
      {/* Input invisível para upload de fotos do dispositivo (incluindo .heic, .heif e Live Photos) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif,.mov,.mp4"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Toast flutuante de feedback */}
      {feedbackToast && (
        <div className={`curator-toast-pill ${feedbackToast.type || 'success'}`}>
          <i
            className={
              feedbackToast.type === 'info'
                ? 'fa-solid fa-circle-info'
                : 'fa-solid fa-circle-check'
            }
          ></i>
          <span>{feedbackToast.text}</span>
        </div>
      )}

      {/* =========================================================================
          MODO 1: CONECTE SUAS MEMÓRIAS (MINIMALISTA, FIEL AO MOCKUP)
          ========================================================================= */}
      {viewMode === 'connect' ? (
        <div className="connect-memories-container">
          {/* Header Centralizado */}
          <header className="connect-memories-header">
            <h1 className="connect-title">{t('memories.title', 'Conecte suas memórias')}</h1>
            <p className="connect-subtitle">
              {t('memories.subtitle', 'O ethernity dms ajuda você a eternizar legados e organizar lembranças com carinho. Conecte sua biblioteca de fotos para descobrirmos juntos os momentos e as pessoas mais especiais.')}
            </p>
          </header>

          {/* GRID DAS FONTES DE MEMÓRIAS (EXATO AO MOCKUP) */}
          <div className="connect-sources-wrapper">
            <div className="connect-sources-top-row">
              {/* Card 1: Google Photos */}
              <div className={`source-card-v2 ${googleConnection.connected ? 'is-connected' : ''}`}>
                <div>
                  <div className="source-card-v2-header">
                    <div className="source-icon-container google-icon-container">
                      <i className="fa-solid fa-asterisk google-symbol"></i>
                    </div>
                    <div className="source-header-titles">
                      <h3 className="source-v2-title">{t('memories.googlePhotosTitle', 'Google Photos')}</h3>
                      <span className="source-v2-subtitle">{t('memories.googlePhotosSubtitle', 'Integração segura')}</span>
                    </div>
                  </div>

                  <p className="source-v2-desc">
                    {t('memories.googlePhotosDesc', 'Sincronize seus álbuns automaticamente. Nossa inteligência seleciona as melhores fotos para as suas cápsulas do tempo.')}
                  </p>

                  {googleConnection.connected && (
                    <div className="source-v2-connected-info">
                      <span className="connected-badge-v2">
                        <i className="fa-solid fa-circle-check"></i> {t('common.statusConnected', 'Conectado')}
                      </span>
                      <span className="connected-email-v2">{googleConnection.email}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-coral-pill"
                  onClick={handleOpenGooglePhotos}
                >
                  {googleConnection.connected
                    ? t('connectMemories.openGooglePicker', 'Abrir Seletor Google Fotos')
                    : t('memories.googlePhotosBtn', 'Conectar Google Photos')}
                </button>
              </div>

              {/* Card 2: iCloud Photos */}
              <div className={`source-card-v2 ${isIcloudConnected ? 'is-connected' : ''}`}>
                <div>
                  <div className="source-card-v2-header">
                    <div className="source-icon-container icloud-icon-container">
                      <i className="fa-solid fa-cloud-arrow-up"></i>
                    </div>
                    <div className="source-header-titles">
                      <h3 className="source-v2-title">{t('memories.icloudTitle', 'iCloud Photos')}</h3>
                      <span className="source-v2-subtitle">{t('memories.icloudSubtitle', 'Conexão nativa Apple')}</span>
                    </div>
                  </div>

                  <p className="source-v2-desc">
                    {t('memories.icloudDesc', 'Sincronize seus álbuns automaticamente. Nossa inteligência seleciona as melhores fotos para as suas cápsulas do tempo.')}
                  </p>

                  {isIcloudConnected && (
                    <div className="source-v2-connected-info">
                      <span className="connected-badge-v2">
                        <i className="fa-solid fa-circle-check"></i> {t('common.statusConnected', 'Conectado')}
                      </span>
                      <span className="connected-email-v2">142 fotos sincronizadas</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-coral-pill"
                  onClick={handleConnectIcloud}
                >
                  {isIcloudConnected
                    ? t('connectMemories.icloudSynced', 'iCloud Sincronizado')
                    : t('memories.icloudBtn', 'Conectar iCloud Photos')}
                </button>
              </div>
            </div>

            {/* Card 3: Outras Fontes (Full Width) */}
            <div className="source-card-v2 full-width-source-card">
              <div>
                <div className="source-card-v2-header">
                  <div className="source-icon-container upload-icon-container">
                    <i className="fa-solid fa-arrow-up-from-bracket"></i>
                  </div>
                  <div className="source-header-titles">
                    <h3 className="source-v2-title">{t('memories.othersTitle', 'Outras Fontes')}</h3>
                    <span className="source-v2-subtitle">{t('memories.othersSubtitle', 'Upload manual')}</span>
                  </div>
                </div>

                <p className="source-v2-desc">
                  {t('memories.othersDesc', 'Envie fotos diretamente do seu computador, celular ou de serviços como Dropbox e OneDrive.')}
                </p>

                <ul className="source-feature-checklist">
                  <li>
                    <i className="fa-solid fa-check"></i>
                    <span>{t('memories.othersItem1', 'Arrastar e soltar arquivos')}</span>
                  </li>
                  <li>
                    <i className="fa-solid fa-check"></i>
                    <span>{t('memories.othersItem2', 'Suporte a álbuns em ZIP')}</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                className="btn-coral-pill full-width-btn"
                onClick={handleTriggerUpload}
              >
                {t('memories.othersBtn', 'Fazer Upload')}
              </button>
            </div>
          </div>

          {/* SEÇÃO DE SEGURANÇA E PRIVACIDADE (EXATO AO MOCKUP) */}
          <section className="connect-security-section">
            <h4 className="security-section-title">{t('memories.securityBadge', 'SUAS FOTOS PERMANECEM SUAS')}</h4>
            <div className="security-items-grid">
              <div className="security-item">
                <i className="fa-solid fa-lock"></i>
                <span>{t('memories.securityE2E', 'Criptografia ponta a ponta')}</span>
              </div>
              <div className="security-item">
                <i className="fa-solid fa-eye-slash"></i>
                <span>{t('memories.securityNoSell', 'Nenhum dado é vendido ou compartilhado')}</span>
              </div>
              <div className="security-item">
                <i className="fa-solid fa-user-shield"></i>
                <span>{t('memories.securityControl', 'Você tem controle total sobre o acesso')}</span>
              </div>
              <div className="security-item">
                <i className="fa-solid fa-user-xmark"></i>
                <span>{t('memories.securityNoStaff', 'Nem os funcionários da Ethernity podem ver as fotos')}</span>
              </div>
            </div>
          </section>

          {/* AÇÕES DE NAVEGAÇÃO INFERIOR */}
          <footer className="connect-footer-actions">
            <button
              type="button"
              className="btn-link-skip"
              onClick={() => setViewMode('curation')}
            >
              {t('memories.skipForNow', 'Pular por agora')}
            </button>
            <button
              type="button"
              className="btn-advance-curation"
              onClick={() => setViewMode('connected_sources')}
            >
              <span>{t('memories.viewCurationBtn', 'Avançar para a Curadoria na Linha do Tempo')}</span>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </footer>
        </div>
      ) : viewMode === 'connected_sources' ? (
        /* =========================================================================
           MODO 2: CONECTE SUAS FONTES DE MÍDIA (EXATO À IMAGEM 1 DO USUÁRIO)
           ========================================================================= */
        <div className="media-sources-container fade-in">
          {/* Header Centralizado */}
          <header className="media-sources-header">
            <h1 className="media-sources-title">
              {t('memories.mediaSourcesTitle', 'Conecte suas fontes de mídia')}
            </h1>
            <p className="media-sources-subtitle">
              {t(
                'memories.mediaSourcesSubtitle',
                'Conecte suas fontes de fotos para continuar no fluxo. Você pode adicionar mais fontes a qualquer momento.'
              )}
            </p>
          </header>

          {/* Seção Fontes Conectadas */}
          <div className="connected-sources-box">
            <span className="connected-sources-label">
              {t('memories.connectedSourcesSection', 'FONTES CONECTADAS')}
            </span>

            <div className="connected-sources-list">
              {/* Item 1: Google Photos */}
              <div
                className="connected-source-row"
                onClick={() => setViewMode('permissions')}
                title="Ver permissões do Google Photos"
              >
                <div className="connected-source-icon-wrap google-icon-wrap">
                  <i className="fa-solid fa-asterisk google-symbol"></i>
                </div>
                <div className="connected-source-info">
                  <h4 className="connected-source-name">Google Photos</h4>
                  <span className="connected-source-status">
                    {googleConnection.email
                      ? `${t('common.statusConnected', 'Conectado')} · ${googleConnection.email}`
                      : t('common.statusConnected', 'Conectado')}
                  </span>
                </div>
              </div>

              {/* Item 2: Apple iCloud */}
              <div className="connected-source-row">
                <div className="connected-source-icon-wrap icloud-icon-wrap">
                  <i className="fa-solid fa-cloud"></i>
                </div>
                <div className="connected-source-info">
                  <h4 className="connected-source-name">Apple iCloud</h4>
                  <span className="connected-source-status">
                    {t('common.statusConnected', 'Conectado')}
                  </span>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="connected-sources-actions">
              <button
                type="button"
                className="btn-outline-add-source"
                onClick={() => setViewMode('connect')}
              >
                {t('memories.connectAnotherSourceBtn', '+ Conectar outra fonte de fotos')}
              </button>
              <button
                type="button"
                className="btn-coral-continue"
                onClick={() => setViewMode('permissions')}
              >
                <span>{t('memories.continueBtn', 'Continuar')}</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>

          {/* Footer de Privacidade */}
          <footer className="privacy-trust-footer">
            <h5 className="privacy-trust-title">
              {t('memories.privacyFirstTitle', 'SUA PRIVACIDADE EM PRIMEIRO LUGAR')}
            </h5>
            <div className="privacy-trust-row">
              <div className="privacy-trust-item">
                <i className="fa-solid fa-lock"></i>
                <span>{t('memories.privacyE2E', 'Criptografia de ponta a ponta')}</span>
              </div>
              <div className="privacy-trust-item">
                <i className="fa-solid fa-eye-slash"></i>
                <span>{t('memories.privacyNoSell', 'Dados nunca são compartilhados')}</span>
              </div>
              <div className="privacy-trust-item">
                <i className="fa-solid fa-user-shield"></i>
                <span>{t('memories.privacyControl', 'Controle total de acessos')}</span>
              </div>
            </div>
            <div className="privacy-trust-single">
              <i className="fa-solid fa-user-xmark"></i>
              <span>{t('memories.privacyNoStaff', 'Nem os funcionários da Ethernity podem ver as fotos')}</span>
            </div>
          </footer>
        </div>
      ) : viewMode === 'permissions' ? (
        /* =========================================================================
           MODO 3: PERMISSÕES DO GOOGLE PHOTOS (EXATO À IMAGEM 2 DO USUÁRIO)
           ========================================================================= */
        <div className="permissions-page-container fade-in">
          {/* Header Centralizado */}
          <header className="permissions-page-header">
            <h1 className="permissions-page-title">
              {t('memories.permissionsTitle', 'Conecte suas memórias')}
            </h1>
            <p className="permissions-page-subtitle">
              {t(
                'memories.permissionsSubtitle',
                'Para organizar seu legado digital com carinho, precisamos de uma ponte segura com sua galeria de fotos. Suas recordações continuam totalmente protegidas.'
              )}
            </p>
          </header>

          {/* Card Central de Permissões */}
          <div className="permissions-card">
            <div className="permissions-card-header">
              <div className="permissions-icon-wrap">
                <i className="fa-solid fa-asterisk google-symbol"></i>
              </div>
              <div className="permissions-header-titles">
                <h3 className="permissions-title-text">
                  {t('memories.googlePermissionsTitle', 'Permissões do Google Photos')}
                </h3>
                <span className="permissions-subtitle-text">
                  {t('memories.secureConnection', 'Conexão criptografada e segura')}
                </span>
              </div>
            </div>

            <p className="permissions-explainer">
              {t(
                'memories.googlePermissionsDesc',
                'O ethernity dms requer acessos específicos do Google Photos exclusivamente para identificar e agrupar momentos especiais para o seu cofre de memórias.'
              )}
            </p>

            <div className="permissions-checklist">
              <div className="permission-check-item">
                <div className="check-icon-circle">
                  <i className="fa-solid fa-check"></i>
                </div>
                <div className="permission-item-text">
                  <strong>
                    {t('memories.permReadTitle', 'Acesso de leitura às fotos e metadados')}
                  </strong>
                  <p>
                    {t(
                      'memories.permReadDesc',
                      'Necessário para visualizar data, localização e rostos para organizar as cápsulas.'
                    )}
                  </p>
                </div>
              </div>

              <div className="permission-check-item">
                <div className="check-icon-circle">
                  <i className="fa-solid fa-check"></i>
                </div>
                <div className="permission-item-text">
                  <strong>
                    {t('memories.permDraftTitle', 'Criação de álbuns de rascunho')}
                  </strong>
                  <p>
                    {t(
                      'memories.permDraftDesc',
                      'Permite organizar suas lembranças pré-selecionadas sem alterar sua galeria original.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="permissions-card-actions">
              <button
                type="button"
                className="btn-permissions-cancel"
                onClick={() => setViewMode('connected_sources')}
              >
                {t('memories.cancelBtn', 'Cancelar')}
              </button>
              <button
                type="button"
                className="btn-permissions-grant"
                onClick={async () => {
                  try {
                    if (!googleConnection.connected && !googleConnection.isRealGoogle) {
                      await googlePhotosService.loginWithGoogle();
                    } else {
                      showToast('✨ Conexão autorizada com Google Photos!', 'success');
                      setViewMode('curation');
                      setIsPickerOpen(true);
                    }
                  } catch (err) {
                    console.error('Error connecting Google Photos:', err);
                    showToast('Erro ao iniciar conexão com o Google.', 'error');
                  }
                }}
              >
                <span>{t('memories.grantGoogleAccessBtn', 'Dar acesso ao Google Photos')}</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>

          {/* Footer de Privacidade */}
          <footer className="privacy-trust-footer">
            <h5 className="privacy-trust-title">
              {t('memories.privacyFirstTitle', 'SUA PRIVACIDADE EM PRIMEIRO LUGAR')}
            </h5>
            <div className="privacy-trust-row">
              <div className="privacy-trust-item">
                <i className="fa-solid fa-lock"></i>
                <span>{t('memories.privacyE2E', 'Criptografia de ponta a ponta')}</span>
              </div>
              <div className="privacy-trust-item">
                <i className="fa-solid fa-eye-slash"></i>
                <span>{t('memories.privacyNoSell', 'Dados nunca são compartilhados')}</span>
              </div>
              <div className="privacy-trust-item">
                <i className="fa-solid fa-user-shield"></i>
                <span>{t('memories.privacyControl', 'Controle total de acessos')}</span>
              </div>
            </div>
            <div className="privacy-trust-single">
              <i className="fa-solid fa-user-xmark"></i>
              <span>{t('memories.privacyNoStaff', 'Nem os funcionários da Ethernity podem ver as fotos')}</span>
            </div>
          </footer>
        </div>
      ) : viewMode === 'select_people' ? (
        /* =========================================================================
           MODO 5: PESSOAS QUE IMPORTAM (GRID DE ROSTOS IDENTIFICADOS)
           ========================================================================= */
        <SelectPeopleGrid
          detectedPeopleList={detectedPeopleList}
          selectedPeopleIds={selectedPeopleIds}
          onToggleSelect={togglePersonSelection}
          totalPhotosAnalyzed={totalPhotosAnalyzed}
          isAnalyzing={isAnalyzingFaces}
          onUploadMore={handleTriggerUpload}
          onSkip={() => setViewMode('curation')}
          onProceed={handleProceedToConfigure}
          maxAllowed={maxAllowedPeople}
          planName={currentPlan.name}
        />
      ) : viewMode === 'configure_person_details' ? (
        /* =========================================================================
           MODO 6: QUEM É ESSA PESSOA ESPECIAL? (MOCKUP DO USUÁRIO)
           ========================================================================= */
        <SpecialPersonFormCard
          person={currentPerson}
          personIndex={activePersonIndex}
          totalPersons={selectedPeople.length}
          onBack={() => setViewMode('select_people')}
          onSaveAndNext={handleSavePersonAndNext}
          onSkip={handleSkipPerson}
        />
      ) : (
        /* =========================================================================
           MODO 4: LINHA DO TEMPO DA CURADORIA
           ========================================================================= */
        <div className="curator-inner-wrap">
          {/* 1. Header com Destinatário / Perfil */}
          <header className="curator-top-profile-bar">
            <div className="curator-profile-left">
              {profile?.avatar || profile?.picture ? (
                <img
                  src={profile.avatar || profile.picture}
                  alt={profile.name || 'Perfil'}
                  className="curator-avatar-img"
                />
              ) : (
                <div className="curator-avatar-img curator-avatar-placeholder">
                  <i className="fa-solid fa-users"></i>
                </div>
              )}
              <div className="curator-profile-details">
                <div className="curator-profile-name-row">
                  <h2 className="curator-profile-name">
                    {profile?.name ? `Memórias de ${profile.name}` : t('connectMemories.defaultCuratedTarget', 'Minha Linha do Tempo')}
                  </h2>
                  <span className="curator-tag-pill">{profile?.relationship || t('connectMemories.familyTag', 'Família')}</span>
                </div>
                <div className="curator-profile-stats-row">
                  <span className="stats-text">
                    {t('connectMemories.statsSummary', { count: totalSelectedCount })}
                  </span>
                  <button
                    type="button"
                    className="btn-add-photos-pill"
                    onClick={() => setIsAddSourcesModalOpen(true)}
                  >
                    <i className="fa-solid fa-plus"></i>
                    <span>{t('connectMemories.addPhotosBtn')}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="curator-profile-right">
              <button
                type="button"
                className="btn-link-back-data"
                onClick={() => setViewMode('connect')}
                title={t('connectMemories.sourcesSubtitle')}
              >
                <i className="fa-solid fa-arrow-left"></i>{' '}
                {t('connectMemories.backToSources', 'Voltar às Fontes')}
              </button>
            </div>
          </header>

          {/* 2. Título Principal da Curadoria */}
          <section className="curator-headline-section">
            <h1 className="curator-main-title">{t('connectMemories.curationTitle')}</h1>
            <p className="curator-main-subtitle">
              {t('connectMemories.curationSubtitle')}
            </p>
          </section>

          {/* 3. Linha do Tempo e Grades de Fotos por Ano */}
          {photos.length === 0 ? (
            <div className="curator-empty-timeline-state">
              <div className="curator-empty-icon-wrap">
                <i className="fa-solid fa-camera-retro"></i>
              </div>
              <h3 className="curator-empty-title">Sua Linha do Tempo Aguarda Suas Lembranças</h3>
              <p className="curator-empty-desc">
                Conecte sua conta do Google Fotos ou importe fotos diretamente do seu dispositivo para iniciar a curadoria afetiva do seu legado familiar.
              </p>
              <button
                type="button"
                className="btn-curator-empty-action"
                onClick={() => setIsAddSourcesModalOpen(true)}
              >
                <i className="fa-solid fa-plus"></i> Conectar & Adicionar Primeiras Fotos
              </button>
            </div>
          ) : (
            <div className="curator-timeline-track">
              {/* ── SEÇÃO 2024 ── */}
              <div className="timeline-year-block">
                <div className="timeline-node-container">
                  <div className="timeline-node-circle">2024</div>
                  <div className="timeline-node-line"></div>
                </div>

                <div className="timeline-year-content">
                  <div className="timeline-year-header">
                    <h3 className="timeline-year-title">2024</h3>
                    <span className="timeline-dot-sep">·</span>
                    <span className="timeline-total-count">
                      {t('connectMemories.photosCount', { count: photosByYear[2024]?.length || 0 })}
                    </span>
                    <span className="timeline-dot-sep">·</span>
                    <span className="timeline-selected-count">
                      {t('connectMemories.selectedCount', { count: photosByYear[2024]?.filter((p) => p.selected).length || 0 })}
                    </span>
                  </div>

                  <div className="timeline-photo-grid">
                    {photosByYear[2024]?.map((photo) => (
                      <div
                        key={photo.id}
                        className={`timeline-photo-card ${photo.selected ? 'is-selected' : ''}`}
                        onClick={() => handleTogglePhoto(photo.id)}
                      >
                        <div className="photo-card-media">
                          <EncryptedImage
                            src={photo.img}
                            alt={photo.title}
                            className="photo-card-img"
                            variant="thumb"
                            enableProgressive={true}
                            allowPrintExport={true}
                          />
                          <button
                            type="button"
                            className={`photo-select-badge ${photo.selected ? 'checked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePhoto(photo.id);
                            }}
                            aria-label={photo.selected ? t('connectMemories.deselectAll') : t('connectMemories.selectAll')}
                          >
                            {photo.selected && <i className="fa-solid fa-check"></i>}
                          </button>
                        </div>
                        <div className="photo-card-caption-block">
                          <span className="photo-card-title-text">{photo.title}</span>
                          <span className="photo-date-label">{photo.dateLabel}</span>
                        </div>
                      </div>
                    ))}

                    {/* Cartão tracejado: Adicionar Foto no ano 2024 */}
                    <div
                      className="timeline-add-photo-card"
                      onClick={() => setIsAddSourcesModalOpen(true)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="add-photo-circle">
                        <i className="fa-solid fa-plus"></i>
                      </div>
                      <span className="add-photo-text">{t('connectMemories.addPhotoCard')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SEÇÃO 2023 ── */}
              <div className="timeline-year-block">
                <div className="timeline-node-container">
                  <div className="timeline-node-circle">2023</div>
                  <div className="timeline-node-line"></div>
                </div>

                <div className="timeline-year-content">
                  <div className="timeline-year-header">
                    <h3 className="timeline-year-title">2023</h3>
                    <span className="timeline-dot-sep">·</span>
                    <span className="timeline-total-count">
                      {t('connectMemories.photosCount', { count: photosByYear[2023]?.length || 0 })}
                    </span>
                    <span className="timeline-dot-sep">·</span>
                    <span className="timeline-selected-count">
                      {t('connectMemories.selectedCount', { count: photosByYear[2023]?.filter((p) => p.selected).length || 0 })}
                    </span>
                  </div>

                  <div className="timeline-photo-grid">
                    {photosByYear[2023]?.map((photo) => (
                      <div
                        key={photo.id}
                        className={`timeline-photo-card ${photo.selected ? 'is-selected' : ''}`}
                        onClick={() => handleTogglePhoto(photo.id)}
                      >
                        <div className="photo-card-media">
                          <EncryptedImage
                            src={photo.img}
                            alt={photo.title}
                            className="photo-card-img"
                            variant="thumb"
                            enableProgressive={true}
                            allowPrintExport={true}
                          />
                          <button
                            type="button"
                            className={`photo-select-badge ${photo.selected ? 'checked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePhoto(photo.id);
                            }}
                            aria-label={photo.selected ? t('connectMemories.deselectAll') : t('connectMemories.selectAll')}
                          >
                            {photo.selected && <i className="fa-solid fa-check"></i>}
                          </button>
                        </div>
                        <div className="photo-card-caption-block">
                          <span className="photo-card-title-text">{photo.title}</span>
                          <span className="photo-date-label">{photo.dateLabel}</span>
                        </div>
                      </div>
                    ))}

                    {/* Cartão tracejado: Adicionar Foto no ano 2023 */}
                    <div
                      className="timeline-add-photo-card"
                      onClick={() => setIsAddSourcesModalOpen(true)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="add-photo-circle">
                        <i className="fa-solid fa-plus"></i>
                      </div>
                      <span className="add-photo-text">{t('connectMemories.addPhotoCard')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Barra Fixa Inferior de Ação */}
          <div className="curator-floating-action-bar">
            <div className="curator-bar-left">
              <span className="curator-bar-counter">
                <strong>{t('connectMemories.barSelectedCount', { count: totalSelectedCount })}</strong>
              </span>
              <button
                type="button"
                className="curator-bar-select-all-btn"
                onClick={handleToggleSelectAll}
              >
                {isAllSelected ? t('connectMemories.deselectAll') : t('connectMemories.selectAll')}
              </button>
            </div>

            <div className="curator-bar-right">
              <button
                type="button"
                className="btn-curator-confirm"
                onClick={() => setIsConfirmModalOpen(true)}
              >
                {t('connectMemories.confirmSelection')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADICIONAR FOTOS & OPÇÕES DE FONTES (INCLUSIVE GOOGLE FOTOS)
          ========================================================================= */}
      {isAddSourcesModalOpen && (
        <div className="curator-modal-overlay" onClick={() => setIsAddSourcesModalOpen(false)}>
          <div className="curator-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="curator-modal-header">
              <div className="curator-modal-title-group">
                <h3 className="curator-modal-title">{t('connectMemories.modalAddTitle')}</h3>
                <p className="curator-modal-subtitle">
                  {t('connectMemories.modalAddSubtitle', { name: profile?.name || 'sua linha do tempo' })}
                </p>
              </div>
              <button
                type="button"
                className="curator-modal-close-btn"
                onClick={() => setIsAddSourcesModalOpen(false)}
                aria-label={t('common.close')}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="curator-modal-options-grid">
              {/* Opção 1: Google Photos */}
              <div className="curator-source-option-box" onClick={handleOpenGooglePhotos}>
                <div className="source-option-icon google-opt">
                  <i className="fa-brands fa-google"></i>
                </div>
                <div className="source-option-info">
                  <div className="source-option-title-row">
                    <span className="source-option-title">Google Photos</span>
                    <span className="source-option-tag highlight">{t('connectMemories.recommended')}</span>
                  </div>
                  <p className="source-option-desc">
                    {t('connectMemories.modalGoogleDesc')}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right source-option-arrow"></i>
              </div>

              {/* Opção 2: Apple iCloud */}
              <div className="curator-source-option-box" onClick={handleConnectIcloud}>
                <div className="source-option-icon icloud-opt">
                  <i className="fa-brands fa-apple"></i>
                </div>
                <div className="source-option-info">
                  <div className="source-option-title-row">
                    <span className="source-option-title">Apple iCloud</span>
                    <span className="source-option-tag">iOS / Mac</span>
                  </div>
                  <p className="source-option-desc">
                    {t('connectMemories.modalIcloudDesc')}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right source-option-arrow"></i>
              </div>

              {/* Opção 3: Upload Local do Computador / Celular */}
              <div className="curator-source-option-box" onClick={handleTriggerUpload}>
                <div className="source-option-icon local-opt">
                  <i className="fa-solid fa-folder-open"></i>
                </div>
                <div className="source-option-info">
                  <div className="source-option-title-row">
                    <span className="source-option-title">{t('connectMemories.uploadName')}</span>
                    <span className="source-option-tag">{t('connectMemories.uploadTag')}</span>
                  </div>
                  <p className="source-option-desc">
                    {t('connectMemories.modalLocalDesc')}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right source-option-arrow"></i>
              </div>

              {/* Opção 4: Gravar Mensagem de Voz ou Vídeo */}
              <div
                className="curator-source-option-box"
                onClick={() => {
                  setIsAddSourcesModalOpen(false);
                  if (onNavigateTab) onNavigateTab('capsules');
                }}
              >
                <div className="source-option-icon record-opt">
                  <i className="fa-solid fa-microphone-lines"></i>
                </div>
                <div className="source-option-info">
                  <div className="source-option-title-row">
                    <span className="source-option-title">{t('connectMemories.recordAudioVideo')}</span>
                    <span className="source-option-tag">{t('connectMemories.narrationTag')}</span>
                  </div>
                  <p className="source-option-desc">
                    {t('connectMemories.recordPromptDesc')}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right source-option-arrow"></i>
              </div>
            </div>

            <div className="curator-modal-footer">
              <button
                type="button"
                className="btn-curator-modal-cancel"
                onClick={() => setIsAddSourcesModalOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CONFIRMAR SELEÇÃO DAS FOTOS
          ========================================================================= */}
      {isConfirmModalOpen && (
        <div className="curator-modal-overlay" onClick={() => setIsConfirmModalOpen(false)}>
          <div className="curator-confirm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon-circle">
              <i className="fa-solid fa-heart"></i>
            </div>
            <h3 className="confirm-modal-title">{t('connectMemories.modalConfirmTitle')}</h3>
            <p className="confirm-modal-desc">
              {t('connectMemories.modalConfirmDesc', { count: totalSelectedCount })}
            </p>

            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-confirm-secondary"
                onClick={() => setIsConfirmModalOpen(false)}
              >
                {t('connectMemories.continueCuration')}
              </button>
              <button
                type="button"
                className="btn-confirm-primary"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  const activeSelected = photos.filter((p) => p.selected);
                  const chosenPhotos = activeSelected.length > 0 ? activeSelected : photos;
                  memoriesService.setActivePhotosForCapsules(chosenPhotos);
                  showToast(t('connectMemories.toastCapsuleUpdated'));
                  startFaceDetectionFlow(chosenPhotos);
                }}
              >
                <i className="fa-solid fa-users-viewfinder"></i>
                <span>Identificar Pessoas nas Fotos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE PROGRESSO E CRIPTOGRAFIA DE UPLOAD INDIVIDUAL & GLOBAL
          ========================================================================= */}
      <UploadProgressModal
        isOpen={isUploadModalOpen}
        files={uploadFilesState}
        overallProgress={overallUploadProgress}
        isProcessing={isUploadProcessing}
        onClose={() => {
          setIsUploadModalOpen(false);
          const activePhotos = memoriesService.getActivePhotosForCapsules();
          if (activePhotos && activePhotos.length > 0) {
            startFaceDetectionFlow(activePhotos);
          } else {
            setViewMode('curation');
          }
        }}
      />

      {/* =========================================================================
          SELETOR OFICIAL DO GOOGLE PHOTOS (PICKER MODAL)
          ========================================================================= */}
      <GooglePhotosPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onNavigateTab={onNavigateTab}
        onImportSuccess={handleGoogleImportSuccess}
      />
    </div>
  );
}
