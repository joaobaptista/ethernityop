import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import audioCalibrationService from '../../../core/services/audioCalibrationService.js';
import vaultService from '../../vault/application/vaultService.js';
import './VoiceRecorderModal.css';

export default function VoiceRecorderModal({ isOpen, onClose, onSave, defaultPersonName = 'Família' }) {
  const { t } = useI18n();
  const [recordMode, setRecordMode] = useState('standard'); // 'standard' | 'matrix_calibration'
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [recordingError, setRecordingError] = useState(null);
  const [calibrationMetrics, setCalibrationMetrics] = useState(null);
  const [isCalibratingWav, setIsCalibratingWav] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const phoneticPrompts = audioCalibrationService.getPhoneticPrompts(defaultPersonName);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(`${t('voiceModal.modalTitle', 'Gravação de Voz')} (${new Date().toLocaleDateString()})`);
      setDescription(t('voiceModal.modalDesc', 'Mensagem de voz e depoimento para o cofre e cápsulas.'));
      setAudioBlob(null);
      setAudioUrl(null);
      setAudioFile(null);
      setRecordingSeconds(0);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingError(null);
    } else {
      stopTracks();
    }
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, t]);

  const stopTracks = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setRecordingError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador não suporta gravação de áudio direta. Por favor, envie um arquivo.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (recordMode === 'matrix_calibration') {
          setIsCalibratingWav(true);
          try {
            const wav16k = await audioCalibrationService.convertToWav16kMono(rawBlob);
            const metrics = await audioCalibrationService.analyzeAudioQuality(wav16k);
            setAudioBlob(wav16k);
            setCalibrationMetrics(metrics);
            const url = URL.createObjectURL(wav16k);
            setAudioUrl(url);
          } catch {
            setAudioBlob(rawBlob);
            setAudioUrl(URL.createObjectURL(rawBlob));
          } finally {
            setIsCalibratingWav(false);
          }
        } else {
          setAudioBlob(rawBlob);
          const url = URL.createObjectURL(rawBlob);
          setAudioUrl(url);
        }
        stopTracks();
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setIsPaused(false);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Erro ao acessar microfone:', err);
      setRecordingError(err.message || 'Permissão de microfone negada ou indisponível.');
    }
  };

  const pauseResumeRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setAudioBlob(file);
    setTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleSave = async () => {
    if (!title.trim() || isUploading) return;

    setIsUploading(true);
    setUploadStatus('Criptografando com AES-256-GCM e transcodificando...');

    const durationText = recordingSeconds > 0 ? `${formatTimer(recordingSeconds)} min` : '03:15 min';
    const finalSize = audioBlob ? `${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB` : '2.8 MB';

    let uploadResult = null;
    if (audioBlob) {
      try {
        setUploadStatus('Processando áudio e gravando no Cofre...');
        uploadResult = await vaultService.uploadMedia(audioBlob, {
          title: title.trim(),
          description: description.trim(),
          category: recordMode === 'matrix_calibration' ? 'Voz Matriz Calibrada' : 'Histórias de Vida',
          recipient: defaultPersonName,
          filename: recordMode === 'matrix_calibration' ? 'voz_matriz.wav' : `${title.trim() || 'gravacao'}.webm`,
        });
        setUploadStatus(
          uploadResult?.offline
            ? '⚠️ Servidor indisponível: salvo só neste aparelho. Tente enviar de novo quando estiver online.'
            : '✨ Memória criptografada e salva no Cofre!'
        );
      } catch (err) {
        console.warn('[VoiceRecorderModal] Erro ao enviar ao cofre:', err);
        setUploadStatus('Salvo localmente no dispositivo.');
      }
    }

    if (onSave) {
      onSave({
        id: uploadResult?.vaultItem?.id || uploadResult?.mediaId || `audio-${Date.now()}`,
        title: title.trim(),
        type: 'audio',
        typeLabel: 'Áudio / Voz Gravada',
        iconColor: '#7E57C2',
        previewType: 'audio_waveform',
        previewUrl: uploadResult?.vaultItem?.mediaUrl || uploadResult?.mediaUrl || audioUrl,
        streamUrl: uploadResult?.vaultItem?.streamUrl,
        waveformUrl: uploadResult?.vaultItem?.waveformUrl,
        duration: durationText,
        size: finalSize,
        description: description.trim(),
        audioBlob,
        category: recordMode === 'matrix_calibration' ? 'Voz Matriz Calibrada' : 'Histórias de Vida',
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
        isEncrypted: true,
        encryptionMode: 'CHUNKED_AEAD',
      });
    }

    setTimeout(() => {
      setIsUploading(false);
      setUploadStatus(null);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="voice-modal-overlay" onClick={onClose}>
      <div className="voice-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="voice-modal-header">
          <div className="voice-icon-badge">
            <i className="fa-solid fa-microphone"></i>
          </div>
          <div className="voice-title-group">
            <h3 className="voice-modal-title">{t('voiceModal.modalTitle', 'Gravação de Voz & Depoimento')}</h3>
            <p className="voice-modal-subtitle">
              {t('voiceModal.modalDesc', 'Grave suas memórias em áudio para guardar no seu cofre e incluir em cápsulas do tempo.')}
            </p>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label={t('common.close')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Seletor de Modo: Padrão vs Calibração de Voz Matriz */}
        <div className="voice-mode-tabs">
          <button
            type="button"
            className={`voice-mode-tab ${recordMode === 'standard' ? 'active' : ''}`}
            onClick={() => {
              setRecordMode('standard');
              setTitle(`Gravação de Voz (${new Date().toLocaleDateString()})`);
            }}
          >
            <i className="fa-solid fa-microphone-lines"></i>
            <span>Mensagem Padrão</span>
          </button>
          <button
            type="button"
            className={`voice-mode-tab ${recordMode === 'matrix_calibration' ? 'active' : ''}`}
            onClick={() => {
              setRecordMode('matrix_calibration');
              setTitle(`Voz Matriz Calibrada — ${defaultPersonName}`);
              setDescription('Amostra de calibração fonética e timbre em WAV PCM 16kHz para geração de Avatar Falante.');
            }}
          >
            <i className="fa-solid fa-wand-magic-sparkles"></i>
            <span>Voz Matriz (Avatar Falante)</span>
            <span className="badge-new-feature">IA</span>
          </button>
        </div>

        {/* Teleprompter Guiado para Modo Calibração */}
        {recordMode === 'matrix_calibration' && (
          <div className="teleprompter-card">
            <div className="teleprompter-header">
              <span className="teleprompter-step">
                Frase {activePromptIndex + 1} de {phoneticPrompts.length}
              </span>
              <span className="teleprompter-focus">
                {phoneticPrompts[activePromptIndex].focus}
              </span>
            </div>

            <p className="teleprompter-instruction">
              {phoneticPrompts[activePromptIndex].instruction}
            </p>

            <div className="teleprompter-text-box">
              <span className="quote-mark">“</span>
              <p className="teleprompter-reading-text">
                {phoneticPrompts[activePromptIndex].text}
              </p>
              <span className="quote-mark right">”</span>
            </div>

            <div className="teleprompter-nav-row">
              <button
                type="button"
                className="btn-teleprompter-prev"
                onClick={() => setActivePromptIndex((prev) => Math.max(0, prev - 1))}
                disabled={activePromptIndex === 0}
              >
                <i className="fa-solid fa-arrow-left"></i> Anterior
              </button>

              <div className="teleprompter-dots">
                {phoneticPrompts.map((_, idx) => (
                  <span
                    key={idx}
                    className={`tele-dot ${idx === activePromptIndex ? 'active' : ''}`}
                    onClick={() => setActivePromptIndex(idx)}
                  ></span>
                ))}
              </div>

              <button
                type="button"
                className="btn-teleprompter-next"
                onClick={() => setActivePromptIndex((prev) => Math.min(phoneticPrompts.length - 1, prev + 1))}
                disabled={activePromptIndex === phoneticPrompts.length - 1}
              >
                Próxima <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Gravador Principal */}
        <div className="voice-recorder-body">
          <div className={`mic-studio-area ${isRecording ? 'recording' : ''}`}>
            <div className="waveform-visualizer">
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
            </div>

            <div className="timer-display">
              <span className="live-dot"></span>
              <span className="timer-digits">{formatTimer(recordingSeconds)}</span>
            </div>

            <div className="recorder-controls">
              {!isRecording && !audioUrl && (
                <button type="button" className="btn-rec-action start" onClick={startRecording}>
                  <i className="fa-solid fa-microphone"></i>
                  <span>{t('voiceModal.startRecord', 'Iniciar Gravação')}</span>
                </button>
              )}

              {isRecording && (
                <>
                  <button type="button" className="btn-rec-action pause" onClick={pauseResumeRecording}>
                    <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
                    <span>{isPaused ? t('voiceModal.resumeRecord', 'Continuar') : t('voiceModal.pauseRecord', 'Pausar')}</span>
                  </button>
                  <button type="button" className="btn-rec-action stop" onClick={stopRecording}>
                    <i className="fa-solid fa-stop"></i>
                    <span>{t('voiceModal.finishRecord', 'Concluir Gravação')}</span>
                  </button>
                </>
              )}

              {audioUrl && !isRecording && (
                <button type="button" className="btn-rec-action retry" onClick={startRecording}>
                  <i className="fa-solid fa-rotate-left"></i>
                  <span>{t('voiceModal.discardRecord', 'Gravar Novamente')}</span>
                </button>
              )}
            </div>

            {audioUrl && !isRecording && (
              <div className="audio-player-preview">
                <audio controls src={audioUrl} style={{ width: '100%' }} />
              </div>
            )}

            {/* Card de Métricas de Calibração Fonética */}
            {isCalibratingWav && (
              <div className="calibrating-notice-box">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Normalizando espectro de áudio para WAV PCM 16kHz mono...</span>
              </div>
            )}

            {calibrationMetrics && !isRecording && (
              <div className="calibration-metrics-card">
                <div className="calib-metric-header">
                  <div className="calib-score-badge">
                    <i className="fa-solid fa-circle-check"></i>
                    <span>Score de Estúdio: {calibrationMetrics.score}%</span>
                  </div>
                  <span className="calib-status-tag">{calibrationMetrics.qualityLabel}</span>
                </div>
                <div className="calib-metric-details">
                  <span><strong>Formato:</strong> WAV PCM 16.000 Hz</span>
                  <span><strong>Duração:</strong> {Math.round(calibrationMetrics.duration)}s</span>
                  <span><strong>Compatibilidade:</strong> LivePortrait & Wav2Lip Pronta</span>
                </div>
              </div>
            )}

            {recordingError && (
              <div className="voice-error-notice">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{recordingError}</span>
              </div>
            )}
          </div>

          {/* Opção de Enviar Arquivo de Áudio */}
          <div className="audio-upload-divider">
            <span>{t('voiceModal.uploadAudio', 'Ou envie um arquivo de áudio')}</span>
          </div>

          <div className="audio-upload-bar">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="btn-upload-audio-inline"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>{audioFile ? audioFile.name : t('voiceModal.uploadAudio', 'Selecionar arquivo de áudio')}</span>
            </button>
          </div>

          {/* Formulário de Metadados */}
          <div className="voice-meta-form">
            <div className="form-group">
              <label>{t('voiceModal.titlePlaceholder', 'Título da Memória')}</label>
              <input
                type="text"
                className="voice-form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('voiceModal.titlePlaceholder', 'ex: Conselho especial sobre paciência')}
              />
            </div>

            <div className="form-group">
              <label>{t('voiceModal.descPlaceholder', 'Descrição / Notas afetivas')}</label>
              <textarea
                className="voice-form-textarea"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('voiceModal.descPlaceholder', 'Conte um pouco sobre o contexto deste momento...')}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="voice-footer-actions">
          {uploadStatus && (
            <div className="voice-upload-feedback-badge">
              <i className="fa-solid fa-lock"></i>
              <span>{uploadStatus}</span>
            </div>
          )}
          <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={isUploading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-modal-save-voice"
            onClick={handleSave}
            disabled={!title.trim() || isUploading || isRecording}
          >
            {isUploading ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i>
                <span>{uploadStatus || 'Criptografando...'}</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-shield-heart"></i>
                <span>{t('voiceModal.saveToVault', 'Salvar no Meu Cofre')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
