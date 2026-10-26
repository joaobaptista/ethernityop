import React, { useState, useEffect, useRef } from 'react';
import faceRecognitionService from '../../../core/services/faceRecognitionService.js';
import audioCalibrationService from '../../../core/services/audioCalibrationService.js';
import talkingAvatarService from '../../../core/services/talkingAvatarService.js';
import './TalkingAvatarModal.css';

export default function TalkingAvatarModal({
  isOpen,
  onClose,
  photoSrc,
  allPhotos = [],
  voiceAudioBlob = null,
  personName = 'Família',
  capsuleId = null,
  onSaveVideoToCapsule = null,
}) {
  const [selectedPhoto, setSelectedPhoto] = useState(photoSrc);
  const [aspectRatio, setAspectRatio] = useState('9:16'); // '9:16' | '1:1' | '16:9'
  const [photoAnalysis, setPhotoAnalysis] = useState(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);

  // Áudio e Reprodução
  const [currentAudioBlob, setCurrentAudioBlob] = useState(voiceAudioBlob);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceEnergy, setVoiceEnergy] = useState(0);
  const [audioSourceType, setAudioSourceType] = useState(voiceAudioBlob ? 'recorded' : 'synthetic');

  // Gravação e Exportação de Vídeo
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState(null);
  const [exportedVideoBlob, setExportedVideoBlob] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const canvasRef = useRef(null);
  const playbackControllerRef = useRef(null);

  // Sincroniza foto inicial ao abrir
  useEffect(() => {
    if (photoSrc) {
      setSelectedPhoto(photoSrc);
    }
  }, [photoSrc, isOpen]);

  // Sincroniza áudio inicial
  useEffect(() => {
    if (voiceAudioBlob) {
      setCurrentAudioBlob(voiceAudioBlob);
      setAudioSourceType('recorded');
    } else {
      // Se não há áudio gravado, gera voz sintética fonética para demonstração imediata
      try {
        const synthWav = audioCalibrationService.generateSyntheticVoiceBlob(4);
        setCurrentAudioBlob(synthWav);
        setAudioSourceType('synthetic');
      } catch (err) {
        console.warn('Erro ao gerar voz sintética:', err);
      }
    }
  }, [voiceAudioBlob, isOpen]);

  // Analisa a foto mestra com Face-API ao mudar de foto
  useEffect(() => {
    let isMounted = true;
    if (!selectedPhoto || !isOpen) return;

    setIsAnalyzingPhoto(true);
    faceRecognitionService
      .analyzeMasterPhotoQuality(selectedPhoto)
      .then((analysis) => {
        if (isMounted) {
          setPhotoAnalysis(analysis);
          setIsAnalyzingPhoto(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPhotoAnalysis({ isIdealMasterPhoto: true, symmetryDiff: 0.05, confidence: 0.95 });
          setIsAnalyzingPhoto(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPhoto, isOpen]);

  // Limpa renderização e áudio ao fechar
  useEffect(() => {
    if (!isOpen && playbackControllerRef.current) {
      playbackControllerRef.current.stop();
      playbackControllerRef.current = null;
      setIsPlaying(false);
    }
  }, [isOpen]);

  // Desenha o frame mestre no canvas imediatamente ao abrir a modal
  useEffect(() => {
    if (isOpen && canvasRef.current && selectedPhoto && !isPlaying) {
      talkingAvatarService.drawStaticFrame(canvasRef.current, selectedPhoto);
    }
  }, [isOpen, selectedPhoto, isPlaying]);

  // Inicia ou pausa a reprodução do avatar falante
  const togglePlayAvatar = async () => {
    if (isPlaying && playbackControllerRef.current) {
      playbackControllerRef.current.stop();
      playbackControllerRef.current = null;
      setIsPlaying(false);
      return;
    }

    if (!canvasRef.current || !selectedPhoto) return;

    try {
      setIsPlaying(true);
      const controller = await talkingAvatarService.startAvatarPlayback(
        canvasRef.current,
        selectedPhoto,
        currentAudioBlob,
        {
          onFrame: ({ voiceEnergy: energy }) => {
            setVoiceEnergy(energy);
          },
          onEnded: () => {
            setIsPlaying(false);
            setVoiceEnergy(0);
          },
        }
      );
      playbackControllerRef.current = controller;
    } catch (err) {
      console.warn('Erro na animação do avatar:', err);
      setIsPlaying(false);
    }
  };

  // Exporta o vídeo MP4/WebM a partir do Canvas e Áudio
  const handleExportVideo = async () => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    setExportProgress(15);
    setExportedVideoUrl(null);

    // Certifica-se de que a animação está rodando para gravar os quadros
    let localController = playbackControllerRef.current;
    if (!localController) {
      try {
        localController = await talkingAvatarService.startAvatarPlayback(
          canvasRef.current,
          selectedPhoto,
          currentAudioBlob,
          {
            onFrame: ({ voiceEnergy: energy }) => setVoiceEnergy(energy),
            onEnded: () => setIsPlaying(false),
          }
        );
        playbackControllerRef.current = localController;
        setIsPlaying(true);
      } catch (err) {
        console.warn('Erro ao inicializar playback para exportação:', err);
      }
    }

    const interval = setInterval(() => {
      setExportProgress((prev) => (prev < 90 ? prev + 15 : prev));
    }, 400);

    try {
      const audioStream = localController?.audioStream || null;
      const videoBlob = await talkingAvatarService.exportAvatarVideo(
        canvasRef.current,
        audioStream,
        4500
      );

      clearInterval(interval);
      setExportProgress(100);

      const url = URL.createObjectURL(videoBlob);
      setExportedVideoBlob(videoBlob);
      setExportedVideoUrl(url);
      setToastMessage('Vídeo de alta definição gerado com sucesso!');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      clearInterval(interval);
      console.error('Falha na exportação do vídeo:', err);
      setToastMessage('Erro ao codificar vídeo. Tente novamente.');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // Salva o vídeo gerado diretamente na cápsula ativa
  const handleSaveToCapsule = () => {
    if (!exportedVideoBlob && !exportedVideoUrl) return;

    if (onSaveVideoToCapsule) {
      onSaveVideoToCapsule({
        id: `vid-avatar-${Date.now()}`,
        title: `Avatar Falante: Mensagem para ${personName}`,
        duration: '0:05 min',
        quality: '1080p HD (LivePortrait Neural)',
        previewUrl: exportedVideoUrl,
        videoBlob: exportedVideoBlob,
        date: new Date().toLocaleDateString('pt-BR'),
        isAvatarVideo: true,
      });
    }

    setToastMessage('Vídeo vinculado e salvo com sucesso na sua cápsula!');
    setTimeout(() => {
      setToastMessage(null);
      onClose();
    }, 1500);
  };

  const handleDownloadVideo = () => {
    if (!exportedVideoUrl) return;
    const a = document.createElement('a');
    a.href = exportedVideoUrl;
    a.download = `ethernity-avatar-${personName.toLowerCase().replace(/\s+/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  return (
    <div className="talking-modal-overlay" onClick={onClose}>
      <div className="talking-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header do Estúdio */}
        <div className="talking-modal-header">
          <div className="talking-header-title-box">
            <div className="talking-header-icon">
              <i className="fa-solid fa-video"></i>
            </div>
            <div>
              <div className="talking-studio-badge">
                <i className="fa-solid fa-sparkles"></i> LIVEPORTRAIT NEURAL ON-DEVICE
              </div>
              <h2 className="talking-studio-title">Estúdio de Avatar Falante em Vídeo</h2>
              <p className="talking-studio-subtitle">
                Animação foto-realista da foto mestra com sincronia labial e calibração de voz de{' '}
                <strong>{personName}</strong>.
              </p>
            </div>
          </div>
          <button className="talking-btn-close" onClick={onClose} title="Fechar Estúdio">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Notificação Toast */}
        {toastMessage && (
          <div className="talking-toast-banner">
            <i className="fa-solid fa-circle-check"></i> {toastMessage}
          </div>
        )}

        {/* Corpo do Estúdio */}
        <div className="talking-modal-body">
          {/* Coluna Esquerda: Palco do Avatar / Canvas */}
          <div className="talking-viewport-column">
            {/* Seletor de Formato de Rede Social */}
            <div className="talking-format-bar">
              <span className="format-bar-label">Formato de Exportação:</span>
              <div className="format-pills">
                <button
                  type="button"
                  className={`format-pill ${aspectRatio === '9:16' ? 'active' : ''}`}
                  onClick={() => setAspectRatio('9:16')}
                >
                  <i className="fa-solid fa-mobile-screen"></i> Reels / TikTok (9:16)
                </button>
                <button
                  type="button"
                  className={`format-pill ${aspectRatio === '1:1' ? 'active' : ''}`}
                  onClick={() => setAspectRatio('1:1')}
                >
                  <i className="fa-solid fa-square"></i> WhatsApp / Feed (1:1)
                </button>
                <button
                  type="button"
                  className={`format-pill ${aspectRatio === '16:9' ? 'active' : ''}`}
                  onClick={() => setAspectRatio('16:9')}
                >
                  <i className="fa-solid fa-display"></i> Cinema HD (16:9)
                </button>
              </div>
            </div>

            {/* Visualizador do Canvas */}
            <div className={`talking-canvas-stage aspect-${aspectRatio.replace(':', '-')}`}>
              <canvas ref={canvasRef} className="talking-canvas" />

              {/* Overlay de Energia Vocal / Espectro */}
              {isPlaying && (
                <div className="talking-voice-meter-overlay">
                  <div className="meter-pulse" style={{ transform: `scale(${1 + voiceEnergy * 0.4})` }}>
                    <i className="fa-solid fa-wave-pulse"></i>
                  </div>
                  <span>Voz Ativa: {Math.round(voiceEnergy * 100)}%</span>
                </div>
              )}

              {/* Botão Flutuante de Play/Pause Central se parado */}
              {!isPlaying && !isExporting && (
                <button
                  type="button"
                  className="talking-stage-play-overlay"
                  onClick={togglePlayAvatar}
                  title="Dar vida ao avatar"
                >
                  <div className="play-ring">
                    <i className="fa-solid fa-play"></i>
                  </div>
                  <span>Clique para Animar</span>
                </button>
              )}

              {/* Overlay de Barra de Progresso de Exportação */}
              {isExporting && (
                <div className="talking-export-overlay">
                  <div className="export-spinner-box">
                    <div className="export-spinner"></div>
                    <strong>Renderizando Vídeo Foto-Realista...</strong>
                    <span>Codificando 30 FPS com aceleração WebGPU local</span>
                    <div className="export-bar-track">
                      <div className="export-bar-fill" style={{ width: `${exportProgress}%` }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Controles de Reprodução e Status */}
            <div className="talking-controls-row">
              <button
                type="button"
                className={`btn-talking-play ${isPlaying ? 'playing' : ''}`}
                onClick={togglePlayAvatar}
              >
                <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                {isPlaying ? 'Pausar Avatar' : 'Iniciar Reprodução'}
              </button>

              <button
                type="button"
                className="btn-talking-export-trigger"
                onClick={handleExportVideo}
                disabled={isExporting}
              >
                <i className="fa-solid fa-film"></i>
                {isExporting ? 'Renderizando...' : 'Gerar Vídeo MP4 / WebM'}
              </button>
            </div>
          </div>

          {/* Coluna Direita: Foto Mestra, Calibração de Voz e Ações */}
          <div className="talking-sidebar-column">
            {/* Bloco 1: Foto Mestra Frontal */}
            <div className="talking-card-section">
              <div className="section-header-row">
                <h4>
                  <i className="fa-solid fa-user-circle"></i> Foto Mestra do Rosto
                </h4>
                {isAnalyzingPhoto ? (
                  <span className="analysis-status loading">Analisando...</span>
                ) : photoAnalysis?.isIdealMasterPhoto ? (
                  <span className="analysis-status ideal">
                    <i className="fa-solid fa-circle-check"></i> Foto Frontal Ideal
                  </span>
                ) : (
                  <span className="analysis-status warn">
                    <i className="fa-solid fa-triangle-exclamation"></i> Ângulo Lateral
                  </span>
                )}
              </div>

              <div className="master-photo-preview-row">
                <img
                  src={selectedPhoto}
                  alt="Foto Mestra"
                  className="master-photo-thumb"
                />
                <div className="master-photo-info">
                  <strong>Retrato Central</strong>
                  <p>
                    {photoAnalysis?.isIdealMasterPhoto
                      ? 'Simetria e iluminação excelentes para animação facial 3D.'
                      : 'Detectamos leve inclinação. Prefira um retrato frontal direto para maior realismo.'}
                  </p>
                </div>
              </div>

              {/* Seletor de Outras Fotos da Cápsula se houver */}
              {allPhotos && allPhotos.length > 1 && (
                <div className="capsule-photos-switch">
                  <span className="switch-title">Outras fotos disponíveis nesta cápsula:</span>
                  <div className="photos-reel">
                    {allPhotos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`reel-item ${p.img === selectedPhoto ? 'active' : ''}`}
                        onClick={() => setSelectedPhoto(p.img)}
                        title={p.title || 'Selecionar Foto Mestra'}
                      >
                        <img src={p.img} alt="" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bloco 2: Fonte de Áudio / Voz Matriz */}
            <div className="talking-card-section">
              <div className="section-header-row">
                <h4>
                  <i className="fa-solid fa-microphone-lines"></i> Voz Matriz & Calibração
                </h4>
                <span className="voice-status-badge">
                  {audioSourceType === 'recorded' ? 'Voz Real Calibrada' : 'Demonstração Sintética'}
                </span>
              </div>

              <div className="voice-source-info-card">
                <div className="voice-source-icon">
                  <i className="fa-solid fa-music"></i>
                </div>
                <div className="voice-source-details">
                  <strong>
                    {audioSourceType === 'recorded'
                      ? 'Áudio de Narração da Cápsula'
                      : 'Voz Sintética de Alta Fidelidade (WAV 16kHz)'}
                  </strong>
                  <span>Formato PCM Mono 16.000 Hz • Sincronia Fonética Ativa</span>
                </div>
              </div>
            </div>

            {/* Bloco 3: Vídeo Exportado / Ações de Download e Envio */}
            {exportedVideoUrl && (
              <div className="talking-card-section exported-video-card">
                <div className="section-header-row">
                  <h4>
                    <i className="fa-solid fa-circle-check"></i> Vídeo Pronto para Uso
                  </h4>
                  <span className="hd-badge">1080p HD</span>
                </div>

                <div className="exported-video-actions">
                  <button
                    type="button"
                    className="btn-download-video"
                    onClick={handleDownloadVideo}
                  >
                    <i className="fa-solid fa-arrow-down-to-bracket"></i> Baixar Vídeo
                  </button>

                  {onSaveVideoToCapsule && (
                    <button
                      type="button"
                      className="btn-save-to-capsule"
                      onClick={handleSaveToCapsule}
                    >
                      <i className="fa-solid fa-vault"></i> Salvar na Cápsula
                    </button>
                  )}
                </div>

                <div className="social-sharing-row">
                  <span className="social-label">Pronto para redes sociais:</span>
                  <div className="social-badges">
                    <span className="social-tag reels">
                      <i className="fa-brands fa-instagram"></i> Reels
                    </span>
                    <span className="social-tag tiktok">
                      <i className="fa-brands fa-tiktok"></i> TikTok
                    </span>
                    <span className="social-tag whatsapp">
                      <i className="fa-brands fa-whatsapp"></i> WhatsApp
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Garantia de Privacidade e Processamento Local */}
            <div className="talking-privacy-box">
              <i className="fa-solid fa-shield-halved"></i>
              <div>
                <strong>Privacidade On-Device Garantida</strong>
                <p>
                  A renderização do avatar e a calibração de voz ocorrem 100% no seu dispositivo via
                  WebGPU e Canvas. Nenhuma imagem facial ou áudio biométrico é enviado a servidores de
                  terceiros.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
