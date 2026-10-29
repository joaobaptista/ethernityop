import React, { useState, useEffect, useRef, useMemo } from 'react';
import localAiService from '../../../core/services/localAiService.js';
import GuardianAvatar from '../../guardian/presentation/GuardianAvatar.jsx';
import usePrimaryGuardian from '../../guardian/presentation/usePrimaryGuardian.js';
import './VideoIdeationView.css';

function estimateVideoTime(words) {
  if (!words || words <= 0) return '~00:00 min';
  const totalSeconds = Math.max(15, Math.round((words / 125) * 60));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `~${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} min`;
}

const VIDEO_QUALITIES = {
  1080: { width: 1920, height: 1080, label: 'Full HD 1080p (Recomendado)', badge: '1080p' },
  720: { width: 1280, height: 720, label: 'HD 720p (Economia de Dados)', badge: '720p' },
  2160: { width: 3840, height: 2160, label: 'Ultra HD 4K (se a câmera suportar)', badge: '4K' },
};
const MAX_RECORDING_SECONDS = 300;

export default function VideoIdeationView({ onNavigateTab, recipientName = 'Destinatário', onBack, onSaveToCapsule }) {
  // Passos: 1 = Ideação, 2 = Gravação, 3 = Entrega
  const primaryGuardian = usePrimaryGuardian();
  const [step, setStep] = useState(1);

  // Estados Passo 1: Ideação
  const [title, setTitle] = useState('Conselhos essenciais para a sua vida e legado');
  const [aiPrompt, setAiPrompt] = useState('conselhos para faculdade, carreira e decisões importantes no futuro profissional');
  const [aiDetails, setAiDetails] = useState('');
  const [script, setScript] = useState(
    `[Cena 1: Plano médio olhando diretamente para a câmera, com postura acolhedora]\nOlá ${recipientName}, hoje gostaria de compartilhar com você algumas lições importantes que aprendi ao longo da vida.\n\n[Cena 2: Plano mais reflexivo e pausado]\n1. Escolha algo que alinhe sua curiosidade com seus valores reais.\n2. Cuide das relações humanas. No final das contas, o verdadeiro legado é feito de suporte mútuo e integridade.`
  );
  const [useAvatarDigital] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isLocalAiEnabled, setIsLocalAiEnabled] = useState(() => localAiService.isLocalAiEnabled());
  const [toastMessage, setToastMessage] = useState(null);

  // Estados Passo 2: Gravação & Teleprompter de Vídeo
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [takes, setTakes] = useState([]);
  const [selectedTakeId, setSelectedTakeId] = useState(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [cameraInput, setCameraInput] = useState('');
  const [videoQuality, setVideoQuality] = useState('1080');
  const [cameraError, setCameraError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const timerRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const discardRef = useRef(false);
  const secondsRef = useRef(0);
  const takesRef = useRef([]);

  // Estados Passo 3: Configurar Entrega
  const [deliveryTrigger, setDeliveryTrigger] = useState('posthumous'); // 'date' | 'posthumous'
  const [emailChannel, setEmailChannel] = useState(true);
  const [emailAddress, setEmailAddress] = useState('');
  const [whatsappChannel, setWhatsappChannel] = useState(false);
  const [curiosityShield, setCuriosityShield] = useState(true);
  const [hasFollowUpNote, setHasFollowUpNote] = useState(true);
  const [followUpNoteText, setFollowUpNoteText] = useState(
    `Olá ${recipientName}, preparei esta mensagem em vídeo com muito carinho e com as palavras que sempre quis que guardasse consigo. Assista quando estiver num momento tranquilo.`
  );

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cálculos dinâmicos
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estimatedTime = estimateVideoTime(wordCount);

  const analysisPoints = useMemo(() => {
    if (!script || !script.trim()) {
      return [
        `Introdução calorosa direcionada a ${recipientName}.`,
        'Desenvolvimento com suas palavras e lembranças sinceras.',
        'Encerramento com mensagem inspiradora e afeto duradouro.',
      ];
    }
    const paragraphs = script
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 5 && !/^\[Cena\s*\d+/i.test(p));

    if (paragraphs.length >= 2) {
      return paragraphs.slice(0, 5).map((p) => {
        const clean = p.replace(/^[\d.\-*•\s]+/, '').replace(/^["']|["']$/g, '');
        return clean.length > 88 ? clean.substring(0, 85) + '...' : clean;
      });
    }

    return [
      `Introdução calorosa direcionada a ${recipientName}.`,
      'Desenvolvimento do tema principal com orientações de câmera.',
      'Encerramento com mensagem inspiradora e afeto duradouro.',
    ];
  }, [script, recipientName]);

  // Timer de Gravação (Passo 2)
  useEffect(() => {
    if (isRecording && !isPaused && step === 2) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused, step]);

  useEffect(() => {
    secondsRef.current = recordingSeconds;
  }, [recordingSeconds]);

  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);

  useEffect(
    () => () => {
      takesRef.current.forEach((tk) => URL.revokeObjectURL(tk.url));
    },
    []
  );

  // Câmera e microfone reais enquanto a etapa de gravação está aberta
  useEffect(() => {
    if (step !== 2) return undefined;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este navegador não permite gravar vídeo.');
      return undefined;
    }

    let cancelled = false;
    let audioCtx = null;
    let rafId = null;
    const quality = VIDEO_QUALITIES[videoQuality] || VIDEO_QUALITIES[1080];

    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: cameraInput ? { exact: cameraInput } : undefined,
          width: { ideal: quality.width },
          height: { ideal: quality.height },
        },
        audio: true,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraError('');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCameraDevices(
            devices
              .filter((d) => d.kind === 'videoinput')
              .map((d, i) => ({ id: d.deviceId, label: d.label || `Câmera ${i + 1}` }))
          );
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx && stream.getAudioTracks().length > 0) {
          audioCtx = new AudioCtx();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          audioCtx.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          let lastUpdate = 0;
          const tick = (ts) => {
            if (ts - lastUpdate > 100) {
              analyser.getByteTimeDomainData(samples);
              let sum = 0;
              for (const v of samples) {
                const x = (v - 128) / 128;
                sum += x * x;
              }
              setAudioLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
              lastUpdate = ts;
            }
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Permita o acesso à câmera e ao microfone no navegador para gravar.'
            : 'Não foi possível acessar a câmera. Verifique se ela está conectada e livre.'
        );
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        discardRef.current = true;
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setAudioLevel(0);
    };
  }, [step, cameraInput, videoQuality]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      showToast(cameraError || 'A câmera ainda não está pronta para gravar.');
      return;
    }
    const mimeType =
      ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type)
      ) || '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    discardRef.current = false;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      setIsRecording(false);
      setIsPaused(false);
      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (discardRef.current) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (!blob.size) return;
      const take = {
        id: `take-${Date.now()}`,
        blob,
        url: URL.createObjectURL(blob),
        durationSeconds: secondsRef.current,
        createdAt: new Date(),
      };
      setTakes((prev) => [take, ...prev]);
      setSelectedTakeId(take.id);
      showToast('⏹️ Gravação salva nas tentativas.');
    };

    recorderRef.current = recorder;
    recorder.start(1000);
    setRecordingSeconds(0);
    setIsRecording(true);
    setIsPaused(false);
  };

  const handleStop = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      handleStop();
    } else {
      startRecording();
    }
  };

  const handleRestart = () => {
    const recorder = recorderRef.current;
    if (!isRecording || !recorder || recorder.state === 'inactive') return;
    discardRef.current = true;
    recorder.stop();
    setRecordingSeconds(0);
    showToast('Gravação atual descartada.');
  };

  const handlePauseResume = () => {
    const recorder = recorderRef.current;
    if (!isRecording || !recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      setIsPaused(true);
    } else if (recorder.state === 'paused') {
      recorder.resume();
      setIsPaused(false);
    }
  };

  const handleDeleteTake = (takeId) => {
    setTakes((prev) => {
      const target = prev.find((tk) => tk.id === takeId);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((tk) => tk.id !== takeId);
    });
    if (selectedTakeId === takeId) setSelectedTakeId(null);
  };

  useEffect(() => {
    if (isRecording && recordingSeconds >= MAX_RECORDING_SECONDS) {
      handleStop();
      showToast('Limite de 5 minutos atingido. Gravação salva.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, recordingSeconds]);

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  };

  const handleToggleLocalAi = () => {
    const next = !isLocalAiEnabled;
    setIsLocalAiEnabled(next);
    localAiService.setLocalAiEnabled(next);
    showToast(next ? '🔒 Modo IA Local ativado no seu dispositivo.' : 'Modo IA Local desativado.');
    if (next && localAiService.isWebGpuSupported() && !localAiService.engine) {
      localAiService.initEngine().catch(() => {});
    }
  };

  // Sugestões de IA no Passo 1
  const handleChipClick = (text) => {
    setAiPrompt(text);
    handleGenerateScript(text);
  };

  const handleGenerateScript = async (customPrompt) => {
    const promptToUse = (typeof customPrompt === 'string' ? customPrompt : aiPrompt) || '';
    if (!promptToUse.trim()) {
      showToast('Descreva o tema antes de gerar o roteiro.');
      return;
    }

    setIsGeneratingAi(true);
    try {
      const result = await localAiService.generateVideoScript({
        prompt: promptToUse,
        details: aiDetails,
        recipientName,
        tone: 'afetuoso',
        onChunk: (_delta, _fullText, preview) => {
          if (preview?.title) setTitle(preview.title);
          if (preview?.script) setScript(preview.script);
        },
      });

      if (result) {
        if (result.title) setTitle(result.title);
        if (result.script) setScript(result.script);
      }

      showToast('✨ Roteiro de vídeo gerado com sucesso pela IA!');
    } catch (err) {
      console.warn('[VideoIdeationView] Erro ao gerar roteiro de vídeo:', err);
      showToast('Erro ao gerar roteiro.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSaveDraft = () => {
    try {
      const draft = {
        title,
        aiPrompt,
        script,
        useAvatarDigital,
        recipient: recipientName,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('ethernity_video_draft', JSON.stringify(draft));
      showToast('💾 Rascunho de vídeo salvo com sucesso!');
    } catch {
      showToast('Erro ao salvar rascunho.');
    }
  };

  const handleSaveVideoMessage = () => {
    const take = takes.find((tk) => tk.id === selectedTakeId) || takes[0];
    if (!take) {
      showToast('Grave o vídeo antes de guardar.');
      setStep(2);
      return;
    }
    if (!onSaveToCapsule) {
      showToast('Abra uma cápsula para guardar este vídeo.');
      return;
    }
    // A cápsula guarda o vídeo no aparelho e o envia ao cofre do servidor na sincronização
    onSaveToCapsule({
      id: `video-${Date.now()}`,
      title: title.trim() || 'Mensagem de vídeo',
      description: script,
      script,
      duration: formatTimer(take.durationSeconds),
      durationSeconds: take.durationSeconds,
      videoBlob: take.blob,
      url: take.url,
      type: 'video',
      date: new Date().toISOString(),
    });
    showToast('🎉 Vídeo guardado na cápsula.');
    setTimeout(() => {
      if (onBack) {
        onBack();
      } else if (onNavigateTab) {
        onNavigateTab('capsules');
      }
    }, 900);
  };

  const handleBreadcrumbClick = () => {
    if (onBack) {
      onBack();
    } else if (onNavigateTab) {
      onNavigateTab('vault');
    }
  };

  return (
    <div className="video-ideation-wrapper fade-in">
      <div className="video-ideation-container">
        {/* Toast Notificação */}
        {toastMessage && (
          <div className="vid-toast-banner">
            <i className="fa-solid fa-circle-check"></i>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. Header Superior & Breadcrumb */}
        <div className="vid-top-bar">
          <div className="vid-left-title-block">
            <nav className="vid-breadcrumbs" aria-label="Navegação">
              <span className="vid-crumb-link" onClick={handleBreadcrumbClick}>
                Meu Cofre
              </span>
              <span className="vid-crumb-sep">&gt;</span>
              <span className="vid-crumb-link" onClick={handleBreadcrumbClick}>
                {recipientName}
              </span>
              <span className="vid-crumb-sep">&gt;</span>
              <span className="vid-crumb-link" onClick={handleBreadcrumbClick}>
                Nova Mensagem
              </span>
              <span className="vid-crumb-sep">&gt;</span>
              <span className="vid-crumb-current">
                {step === 1 ? 'Ideação de Vídeo' : step === 2 ? 'Gravação de Vídeo' : 'Configurar Entrega'}
              </span>
            </nav>

            <h1 className="vid-main-title">
              {step === 1 && 'Preparar Mensagem de Vídeo'}
              {step === 2 && 'Gravar Mensagem de Vídeo'}
              {step === 3 && 'Configurar Entrega'}
            </h1>
            <p className="vid-main-subtitle">
              {step === 1 && `Planeje e estruture sua mensagem de vídeo antes de gravar para ${recipientName}`}
              {step === 2 && `Grave seu vídeo definitivo para ${recipientName} usando o teleprompter integrado abaixo.`}
              {step === 3 && `Defina como e quando ${recipientName} receberá este vídeo com segurança.`}
            </p>
          </div>

          {/* Stepper (1 Ideação ── 2 Gravação ── 3 Entrega) */}
          <div className="vid-stepper-pill">
            <div
              className={`vid-stepper-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}
              onClick={() => setStep(1)}
            >
              <span className="vid-stepper-badge">{step > 1 ? '✓' : '1'}</span>
              <span className="vid-stepper-text">Ideação</span>
            </div>

            <div className={`vid-stepper-line ${step >= 2 ? 'active' : ''}`}></div>

            <div
              className={`vid-stepper-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}
              onClick={() => setStep(2)}
            >
              <span className="vid-stepper-badge">{step > 2 ? '✓' : '2'}</span>
              <span className="vid-stepper-text">Gravação</span>
            </div>

            <div className={`vid-stepper-line ${step >= 3 ? 'active' : ''}`}></div>

            <div
              className={`vid-stepper-item ${step === 3 ? 'active' : ''}`}
              onClick={() => setStep(3)}
            >
              <span className="vid-stepper-badge">3</span>
              <span className="vid-stepper-text">Entrega</span>
            </div>
          </div>
        </div>

        {/* ====================================================================
            PASSO 1: IDEAÇÃO DE VÍDEO (EXATO AO NOVO MOCKUP)
           ==================================================================== */}
        {step === 1 && (
          <div className="vid-two-col-grid">
            {/* Coluna Esquerda: Inputs, Assistente IA e Roteiro */}
            <div className="vid-col-primary">
              {/* Card: Título da Mensagem */}
              <div className="vid-white-card">
                <label className="vid-card-label" htmlFor="video-msg-title">
                  Título da Mensagem
                </label>
                <input
                  id="video-msg-title"
                  type="text"
                  className="vid-card-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Conselhos essenciais para a sua jornada e carreira"
                />
              </div>

              {/* Card: Assistente de Ideação IA */}
              <div className="vid-ai-purple-card">
                <div className="vid-ai-card-header" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="vid-ai-icon-box">
                      <i className="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <div className="vid-ai-header-info">
                      <h2 className="vid-ai-title">Assistente de Ideação IA</h2>
                      <p className="vid-ai-subtitle">
                        Escreva o tema abaixo ou use as sugestões rápidas para criar um roteiro estruturado com sugestões de cena.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="vid-chip-btn"
                    onClick={handleToggleLocalAi}
                    title="Ativar ou desativar processamento de IA 100% local no seu navegador"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <i className={`fa-solid ${isLocalAiEnabled ? 'fa-shield-halved' : 'fa-laptop'}`} style={{ marginRight: '6px' }}></i>
                    {isLocalAiEnabled ? 'IA Local: Ativa' : 'IA Local: Desativada'}
                  </button>
                </div>

                <div className="vid-ai-prompt-box" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    className="vid-ai-prompt-input"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Descreva o que deseja falar..."
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
                  />
                  <input
                    type="text"
                    className="vid-ai-prompt-input"
                    value={aiDetails}
                    onChange={(e) => setAiDetails(e.target.value)}
                    placeholder="Detalhes reais (opcional): uma lembrança, apelido ou momento marcante..."
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
                  />
                </div>

                <div className="vid-ai-chips-and-btn-row">
                  <div className="vid-chips-group">
                    <button
                      type="button"
                      className="vid-chip-btn"
                      onClick={() => handleChipClick('Mensagem de aniversário')}
                    >
                      Mensagem de aniversário
                    </button>
                    <button
                      type="button"
                      className="vid-chip-btn"
                      onClick={() => handleChipClick('Declaração especial')}
                    >
                      Declaração especial
                    </button>
                    <button
                      type="button"
                      className="vid-chip-btn"
                      onClick={() => handleChipClick('Conselho para formatura')}
                    >
                      Conselho para formatura
                    </button>
                  </div>

                  <button
                    type="button"
                    className="vid-btn-gerar-roteiro"
                    onClick={() => handleGenerateScript()}
                    disabled={isGeneratingAi}
                  >
                    <i className={`fa-solid ${isGeneratingAi ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    <span>{isGeneratingAi ? 'Gerando...' : 'Gerar Roteiro'}</span>
                  </button>
                </div>
              </div>

              {/* Card: Seu Roteiro (Editável) */}
              <div className="vid-white-card vid-script-card">
                <div className="vid-script-header-row">
                  <div className="vid-script-title-wrap">
                    <h2 className="vid-script-title">Seu Roteiro (Editável)</h2>
                    <p className="vid-script-subtitle">
                      Personalize o roteiro gerado ou digite suas anotações livremente
                    </p>
                  </div>
                  <span className="vid-badge-salvo">Salvo automaticamente</span>
                </div>

                <textarea
                  rows={8}
                  className="vid-script-textarea"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                ></textarea>
              </div>
            </div>

            {/* Coluna Direita: Análise do Roteiro, Dicas e Avatar Digital */}
            <div className="vid-col-secondary">
              {/* Card: Análise do Roteiro */}
              <div className="vid-white-card vid-analysis-card">
                <div className="vid-analysis-top-row">
                  <h2 className="vid-analysis-title">Análise do Roteiro</h2>
                  <span className="vid-roteiro-ia-pill">Roteiro IA</span>
                </div>

                <div className="vid-analysis-items-list">
                  {analysisPoints.map((point, idx) => (
                    <div key={idx} className="vid-analysis-step-item">
                      <span className="vid-step-circle">{idx + 1}</span>
                      <p>{point}</p>
                    </div>
                  ))}
                </div>

                <div className="vid-analysis-metrics-row">
                  <div className="vid-metric-block">
                    <span className="vid-metric-label">Tempo Estimado</span>
                    <span className="vid-metric-value-large">{estimatedTime}</span>
                  </div>
                  <div className="vid-metric-block text-right">
                    <span className="vid-metric-label">Total de Palavras</span>
                    <span className="vid-metric-value-large">{wordCount} palavras</span>
                  </div>
                </div>
              </div>

              {/* Card: Dicas para gravação de vídeo */}
              <div className="vid-white-card vid-tips-card">
                <div className="vid-tips-header">
                  <div className="vid-tips-icon-box">
                    <i className="fa-solid fa-waveform-lines"></i>
                  </div>
                  <h3 className="vid-tips-title">Dicas para gravação de vídeo</h3>
                </div>

                <ul className="vid-tips-bullets">
                  <li>Garantir iluminação frontal suave no rosto, evitando sombras duras.</li>
                  <li>Enquadre a câmera na altura dos olhos (plano médio é ideal).</li>
                  <li>Procure um fundo neutro e sem distrações visuais.</li>
                  <li>Olhe diretamente para a lente da câmera, mantendo contato visual direto.</li>
                </ul>
              </div>

              {/* Card: Usar Avatar Digital com Toggle Switch */}
              <div className="vid-white-card vid-avatar-toggle-card">
                <div className="vid-avatar-toggle-header">
                  <h3 className="vid-avatar-toggle-title">Usar Avatar Digital</h3>
                  <span className="vid-soon-badge">Em breve</span>
                </div>
                <p className="vid-avatar-toggle-desc">
                  Gerar o vídeo automaticamente com o seu avatar digital ainda está em desenvolvimento.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            PASSO 2: GRAVAÇÃO DE VÍDEO & TELEPROMPTER
           ==================================================================== */}
        {step === 2 && (
          <div className="vid-step2-layout">
            <div className="vid-two-col-grid">
              {/* Coluna Esquerda: Feed de Vídeo com Teleprompter */}
              <div className="vid-col-primary">
                <div className="vid-video-player-card">
                  <div className="vid-camera-feed-box">
                    <div className="vid-video-top-badges">
                      {isRecording && (
                        <span className="vid-rec-badge">
                          <span className="vid-rec-dot"></span> {isPaused ? 'PAUSADO' : 'GRAVANDO'}
                        </span>
                      )}
                      <span className="vid-quality-badge">{(VIDEO_QUALITIES[videoQuality] || VIDEO_QUALITIES[1080]).badge}</span>
                    </div>

                    <video ref={videoRef} className="vid-camera-feed-img vid-camera-live" muted playsInline autoPlay />
                    {cameraError && (
                      <div className="vid-camera-feed-placeholder vid-camera-error">
                        <i className="fa-solid fa-video-slash"></i>
                        <span>{cameraError}</span>
                      </div>
                    )}

                    <div className="vid-video-bottom-overlay">
                      <div className="vid-timer-badge">
                        <span className="vid-timer-coral">{formatTimer(recordingSeconds)}</span>
                        <span className="vid-timer-total"> / 05:00</span>
                      </div>
                      <div className="vid-author-tag">
                        <span>Para: {recipientName}</span>
                        <i className="fa-solid fa-microphone vid-author-mic-icon"></i>
                      </div>
                    </div>
                  </div>

                  {/* Teleprompter Card Integrado */}
                  <div className="vid-teleprompter-dark-panel">
                    <div className="vid-tele-header">
                      <span className="vid-tele-label">SCRIPT INTEGRADO • ROLAGEM AUTOMÁTICA</span>
                      <span className="vid-tele-speed">Velocidade: 1.0×</span>
                    </div>
                    <p className="vid-tele-text" style={{ whiteSpace: 'pre-wrap' }}>
                      {script ? `"${script.slice(0, 240)}..."` : `Olá ${recipientName}, comece a falar com o coração...`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Controle de Vídeo */}
              <div className="vid-col-secondary">
                <div className="vid-white-card vid-control-card">
                  <h2 className="vid-control-title">Controle de Vídeo</h2>

                  {/* Sinal de Áudio de Entrada */}
                  <div className="vid-audio-signal-container">
                    <span className="vid-audio-signal-label">Sinal de Áudio de Entrada</span>
                    <div className="vid-waveform-visual">
                      {[8, 14, 22, 18, 30, 26, 36, 24, 32, 28, 34, 22, 30, 16, 24, 12, 18, 10].map((h, i) => (
                        <span
                          key={i}
                          className="vid-wave-bar"
                          style={{ height: `${Math.max(3, Math.round(h * Math.min(1, 0.1 + audioLevel)))}px` }}
                        ></span>
                      ))}
                    </div>
                  </div>

                  {/* Botões de Ação de Gravação */}
                  <div className="vid-controls-btns-row">
                    <button
                      type="button"
                      className="vid-ctrl-circle-btn"
                      onClick={handleRestart}
                      disabled={!isRecording}
                      title="Descartar gravação atual"
                      aria-label="Descartar gravação atual"
                    >
                      <i className="fa-solid fa-rotate-left"></i>
                    </button>

                    <button
                      type="button"
                      className={`vid-ctrl-stop-main-btn ${isRecording ? '' : 'is-idle'}`}
                      onClick={handleRecordToggle}
                      disabled={!isRecording && Boolean(cameraError)}
                      title={isRecording ? 'Parar e salvar gravação' : 'Começar a gravar'}
                      aria-label={isRecording ? 'Parar e salvar gravação' : 'Começar a gravar'}
                    >
                      <div className={isRecording ? 'vid-stop-square-icon' : 'vid-rec-circle-icon'}></div>
                    </button>

                    <button
                      type="button"
                      className="vid-ctrl-circle-btn"
                      onClick={handlePauseResume}
                      disabled={!isRecording}
                      title={isPaused ? 'Continuar' : 'Pausar'}
                      aria-label={isPaused ? 'Continuar' : 'Pausar'}
                    >
                      <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
                    </button>
                  </div>

                  {/* Dropdowns de Câmera e Resolução */}
                  <div className="vid-select-controls-group">
                    <div className="vid-select-field">
                      <label className="vid-select-label">Câmera de Entrada</label>
                      <div className="vid-custom-select-wrapper">
                        <i className="fa-solid fa-video vid-select-icon-left"></i>
                        <select
                          className="vid-custom-select"
                          value={cameraInput}
                          onChange={(e) => setCameraInput(e.target.value)}
                          disabled={isRecording}
                        >
                          <option value="">Câmera padrão do aparelho</option>
                          {cameraDevices.map((cam) => (
                            <option key={cam.id} value={cam.id}>
                              {cam.label}
                            </option>
                          ))}
                        </select>
                        <i className="fa-solid fa-chevron-down vid-select-arrow"></i>
                      </div>
                    </div>

                    <div className="vid-select-field">
                      <label className="vid-select-label">Qualidade do Vídeo</label>
                      <div className="vid-custom-select-wrapper">
                        <i className="fa-solid fa-photo-film vid-select-icon-left"></i>
                        <select
                          className="vid-custom-select"
                          value={videoQuality}
                          onChange={(e) => setVideoQuality(e.target.value)}
                          disabled={isRecording}
                        >
                          {Object.entries(VIDEO_QUALITIES).map(([key, q]) => (
                            <option key={key} value={key}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                        <i className="fa-solid fa-chevron-down vid-select-arrow"></i>
                      </div>
                    </div>
                  </div>

                  {/* Card Usar Avatar Digital */}
                  <div className="vid-avatar-toggle-inner-card">
                    <div className="vid-avatar-toggle-top-row">
                      <h4 className="vid-avatar-toggle-inner-title">Usar Avatar Digital</h4>
                      <span className="vid-soon-badge">Em breve</span>
                    </div>
                    <p className="vid-avatar-toggle-inner-desc">
                      Gerar o vídeo a partir do roteiro com o seu avatar digital ainda está em desenvolvimento.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Gravações de Vídeo Salvas (Abaixo do Grid) */}
            <div className="vid-saved-takes-section">
              <h3 className="vid-saved-title">Gravações de Vídeo Salvas</h3>

              {takes.length === 0 ? (
                <p className="vid-takes-empty">
                  Nenhuma gravação ainda. Clique no botão vermelho para começar a gravar.
                </p>
              ) : (
                <div className="vid-takes-list">
                  {takes.map((take, idx) => {
                    const isSelected = (selectedTakeId || takes[0]?.id) === take.id;
                    return (
                      <div
                        key={take.id}
                        className={`vid-take-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedTakeId(take.id)}
                      >
                        <div className="vid-take-thumb-wrapper">
                          <video src={take.url} className="vid-take-thumb-img" muted playsInline preload="metadata" />
                          <div className="vid-take-play-mini">
                            <i className="fa-solid fa-play"></i>
                          </div>
                        </div>

                        <div className="vid-take-info">
                          <h4 className="vid-take-name">Tentativa {takes.length - idx}</h4>
                          <p className="vid-take-details">
                            {take.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} •{' '}
                            {formatTimer(take.durationSeconds)} min • {(take.blob.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>

                        <div className="vid-take-action-wrap">
                          {isSelected ? (
                            <button type="button" className="btn-take-coral-selected">
                              Selecionado
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-take-outline-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTakeId(take.id);
                              }}
                            >
                              Usar este
                            </button>
                          )}
                          <button
                            type="button"
                            className="vid-take-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTake(take.id);
                            }}
                            title="Excluir esta tentativa"
                            aria-label={`Excluir tentativa ${takes.length - idx}`}
                          >
                            <i className="fa-regular fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            PASSO 3: CONFIGURAR ENTREGA DE VÍDEO
           ==================================================================== */}
        {step === 3 && (
          <div className="vid-delivery-step-layout">
            <div className="vid-delivery-left-column">
              <div className="vid-white-card vid-deliv-card-section">
                <h3 className="vid-deliv-sec-title">1. Tipo de Entrega</h3>
                <p className="vid-deliv-sec-desc">Escolha o gatilho ideal para o envio automático deste vídeo</p>

                <div className="vid-deliv-trigger-cards-grid">
                  <div
                    className={`vid-deliv-trigger-box ${deliveryTrigger === 'date' ? 'selected' : ''}`}
                    onClick={() => setDeliveryTrigger('date')}
                  >
                    <div className="vid-deliv-trigger-top">
                      <div className="vid-trigger-icon coral-light">
                        <i className="fa-regular fa-calendar"></i>
                      </div>
                      <span className="vid-radio-circle-indicator">
                        {deliveryTrigger === 'date' && <span className="vid-radio-inner-dot"></span>}
                      </span>
                    </div>
                    <h4 className="vid-trigger-card-title">Data Específica</h4>
                    <p className="vid-trigger-card-desc">
                      Entregue rigorosamente no dia e hora agendados abaixo.
                    </p>
                  </div>

                  <div
                    className={`vid-deliv-trigger-box ${deliveryTrigger === 'posthumous' ? 'selected' : ''}`}
                    onClick={() => setDeliveryTrigger('posthumous')}
                  >
                    <div className="vid-deliv-trigger-top">
                      <div className="vid-trigger-icon coral-light">
                        <i className="fa-regular fa-heart"></i>
                      </div>
                      <span className="vid-radio-circle-indicator">
                        {deliveryTrigger === 'posthumous' && <span className="vid-radio-inner-dot"></span>}
                      </span>
                    </div>
                    <h4 className="vid-trigger-card-title">Quando eu não estiver mais aqui</h4>
                    <p className="vid-trigger-card-desc">
                      Enviado após confirmação oficial da sua partida pelos guardiões.
                    </p>
                  </div>
                </div>
              </div>

              <div className="vid-white-card vid-deliv-card-section">
                <h3 className="vid-deliv-sec-title">2. Canal de Entrega</h3>
                <p className="vid-deliv-sec-desc">Como o destinatário receberá o link para assistir ao vídeo seguro</p>

                <div className="vid-channels-options-list">
                  <div className="vid-channel-row-item">
                    <label className="vid-custom-checkbox-label">
                      <input
                        type="checkbox"
                        checked={emailChannel}
                        onChange={(e) => setEmailChannel(e.target.checked)}
                      />
                      <span className="vid-checkbox-box">
                        {emailChannel && <i className="fa-solid fa-check"></i>}
                      </span>
                      <span className="vid-checkbox-text">E-mail</span>
                    </label>

                    {emailChannel && (
                      <input
                        type="email"
                        className="vid-channel-input"
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                      />
                    )}
                  </div>

                  <div className="vid-channel-row-item">
                    <label className="vid-custom-checkbox-label">
                      <input
                        type="checkbox"
                        checked={whatsappChannel}
                        onChange={(e) => setWhatsappChannel(e.target.checked)}
                      />
                      <span className="vid-checkbox-box">
                        {whatsappChannel && <i className="fa-solid fa-check"></i>}
                      </span>
                      <span className="vid-checkbox-text">WhatsApp</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="vid-white-card vid-deliv-card-section">
                <h3 className="vid-deliv-sec-title">3. Guardião Responsável</h3>
                <p className="vid-deliv-sec-desc">Pessoa encarregada de validar a liberação do vídeo</p>

                <div className="vid-guardian-assigned-box">
                  <div className="vid-guardian-left-info">
                    <GuardianAvatar src={primaryGuardian?.avatar} name={primaryGuardian?.name} className="vid-guardian-thumb" />
                    <div className="vid-guardian-text">
                      <h4 className="vid-guardian-name">{primaryGuardian ? primaryGuardian.name : 'Nenhum guardião cadastrado'}</h4>
                      <div className="vid-guardian-meta-line">
                        {primaryGuardian ? (
                          <>
                            {primaryGuardian.relationship && <span>{primaryGuardian.relationship}</span>}
                            {primaryGuardian.relationship && <span className="vid-guardian-meta-sep">•</span>}
                            {primaryGuardian.status === 'active' ? (
                              <span className="vid-guardian-status-green">ATIVO</span>
                            ) : (
                              <span>PENDENTE</span>
                            )}
                          </>
                        ) : (
                          <span>Cadastre um guardião para validar a entrega</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-alterar-guardiao"
                    onClick={() => onNavigateTab && onNavigateTab('guardian')}
                  >
                    {primaryGuardian ? 'Alterar Guardião' : 'Cadastrar Guardião'}
                  </button>
                </div>
              </div>

              <div className="vid-curiosity-shield-card">
                <label className="vid-custom-checkbox-label">
                  <input
                    type="checkbox"
                    checked={curiosityShield}
                    onChange={(e) => setCuriosityShield(e.target.checked)}
                  />
                  <span className="vid-checkbox-box coral-check">
                    {curiosityShield && <i className="fa-solid fa-check"></i>}
                  </span>
                </label>
                <div className="vid-shield-text-content">
                  <h4 className="vid-shield-title">Curiosidade não libera o cofre 🔒</h4>
                  <p className="vid-shield-desc">
                    Se o guardião tentar abrir o cofre, entraremos em contato com você por WhatsApp e SMS durante 48 horas. Se você responder, ótimo, era só um guardião curioso. Caso contrário, as mensagens seguem para os destinatários.
                  </p>
                </div>
              </div>

              <div className="vid-white-card vid-deliv-card-section">
                <div className="vid-deliv-toggle-header">
                  <div>
                    <h3 className="vid-deliv-sec-title">4. Mensagem de Acompanhamento</h3>
                    <p className="vid-deliv-sec-desc">Adicione uma nota breve opcional para acompanhar o vídeo</p>
                  </div>

                  <div
                    className={`vid-ios-toggle ${hasFollowUpNote ? 'active' : ''}`}
                    onClick={() => setHasFollowUpNote(!hasFollowUpNote)}
                  >
                    <div className="vid-ios-toggle-knob"></div>
                  </div>
                </div>

                {hasFollowUpNote && (
                  <div className="vid-followup-textarea-box">
                    <textarea
                      rows={4}
                      className="vid-followup-textarea"
                      value={followUpNoteText}
                      onChange={(e) => setFollowUpNoteText(e.target.value)}
                    ></textarea>
                  </div>
                )}
              </div>
            </div>

            <div className="vid-delivery-right-column">
              <div className="vid-white-card vid-summary-side-card">
                <h3 className="vid-summary-card-title">Resumo do Envio</h3>
                <p className="vid-summary-card-subtitle">Confirme todos os detalhes antes de salvar</p>

                <div className="vid-summary-media-banner">
                  <div className="vid-summary-media-icon">
                    <i className="fa-solid fa-video"></i>
                  </div>
                  <div className="vid-summary-media-info">
                    <h4 className="vid-summary-media-title">Mensagem de Vídeo HD</h4>
                    <span className="vid-summary-media-sub">Roteiro: Escolha de Carreira e Proposta</span>
                  </div>
                </div>

                <div className="vid-summary-table-rows">
                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Tipo de Registro</span>
                    <strong className="vid-sum-value">Vídeo (.mp4 1080p)</strong>
                  </div>

                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Duração Estimada</span>
                    <strong className="vid-sum-value">03:15 min</strong>
                  </div>

                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Destinatário</span>
                    <strong className="vid-sum-value">{recipientName}</strong>
                  </div>

                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Gatilho de Envio</span>
                    <strong className="vid-sum-value">
                      {deliveryTrigger === 'posthumous' ? 'Após Falecimento' : 'Data Específica'}
                    </strong>
                  </div>

                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Condição de Entrega</span>
                    <strong className="vid-sum-value">Aguardando confirmação</strong>
                  </div>

                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Canal Principal</span>
                    <strong className="vid-sum-value">E-mail & Link Privado</strong>
                  </div>

                  <div className="vid-sum-row">
                    <span className="vid-sum-label">Guardião Nomeado</span>
                    <strong className="vid-sum-value">{primaryGuardian ? primaryGuardian.name : 'Nenhum guardião cadastrado'}</strong>
                  </div>
                </div>

                <div className="vid-summary-security-note">
                  <i className="fa-solid fa-shield-halved"></i>
                  <p>Sua entrega está protegida sob criptografia de ponta-a-ponta e é monitorada pelo guardião ativo de sua confiança.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Rodapé de Ações */}
        <footer className="vid-bottom-actions-row">
          {step === 3 && (
            <button
              type="button"
              className="vid-btn-rascunho"
              onClick={() => setStep(2)}
            >
              Voltar para Gravação
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              className="vid-btn-rascunho"
              onClick={() => setStep(1)}
            >
              Voltar para Ideação
            </button>
          )}

          {step === 1 && (
            <button
              type="button"
              className="vid-btn-rascunho"
              onClick={handleSaveDraft}
            >
              Salvar como Rascunho
            </button>
          )}

          <div className="vid-footer-buttons-right">
            {step === 1 && (
              <button
                type="button"
                className="vid-btn-ir-gravacao"
                onClick={() => setStep(2)}
              >
                <span>Ir para Gravação</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                className="vid-btn-ir-gravacao"
                onClick={() => setStep(3)}
              >
                <span>Configurar Entrega</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                className="vid-btn-ir-gravacao"
                onClick={handleSaveVideoMessage}
              >
                <span>Confirmar e Guardar na Cápsula</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
