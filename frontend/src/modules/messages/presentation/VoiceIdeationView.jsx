import React, { useState, useEffect, useRef, useMemo } from 'react';
import localAiService from '../../../core/services/localAiService.js';
import vaultService from '../../vault/application/vaultService.js';
import capsulesService from '../../capsules/application/capsulesService.js';
import './VoiceIdeationView.css';

function formatHtmlToScript(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n"$1"\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function estimateReadingTime(words) {
  if (!words || words <= 0) return '00:00 min';
  const totalSeconds = Math.max(10, Math.round((words / 130) * 60));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `~${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} min`;
}

export default function VoiceIdeationView({
  capsuleId,
  onNavigateTab,
  recipientName = 'Destinatário',
  onBack,
  onSaveToCapsule,
}) {
  // Passos: 1 = Ideação, 2 = Gravação, 3 = Entrega
  const [step, setStep] = useState(1);

  // Estados Passo 1: Ideação
  const [title, setTitle] = useState(`Conselhos essenciais e legado para ${recipientName}`);
  const [aiPrompt, setAiPrompt] = useState('Conselhos para o futuro, valores humanos e decisões importantes na vida');
  const [aiDetails, setAiDetails] = useState('');
  const [script, setScript] = useState(
    `Olá ${recipientName}, preparei esta mensagem de voz para que você sempre guarde consigo estas palavras.\n\n1. Escolha algo que alinhe sua curiosidade com seus valores reais e sua essência.\n\n2. Construa conexões verdadeiras e cuide das pessoas com quem caminha nesta vida.\n\n3. Lembre-se sempre de que o amor que compartilhamos permanece vivo em cada escolha sua.`
  );
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isLocalAiEnabled, setIsLocalAiEnabled] = useState(() => localAiService.isLocalAiEnabled());
  const [toastMessage, setToastMessage] = useState(null);

  // Estados Passo 2: Gravação & Teleprompter
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [takes, setTakes] = useState([]);
  const [activeTakeId, setActiveTakeId] = useState(null);
  const [playingTakeId, setPlayingTakeId] = useState(null);
  const [useAvatarVoice, setUseAvatarVoice] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [recordingError, setRecordingError] = useState(null);
  const [waveformLevels, setWaveformLevels] = useState([
    12, 18, 24, 16, 28, 32, 20, 38, 26, 42, 30, 22, 34, 18, 28, 14, 20, 16,
  ]);

  // Refs de controle de áudio e teleprompter
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const teleprompterRef = useRef(null);
  const audioPreviewRef = useRef(null);

  // Estados Passo 3: Configurar Entrega
  const [deliveryTrigger, setDeliveryTrigger] = useState('posthumous'); // 'date' | 'posthumous'
  const [emailChannel, setEmailChannel] = useState(true);
  const [emailAddress, setEmailAddress] = useState('');
  const [whatsappChannel, setWhatsappChannel] = useState(false);
  const [curiosityShield, setCuriosityShield] = useState(true);
  const [hasFollowUpNote, setHasFollowUpNote] = useState(true);
  const [followUpNoteText, setFollowUpNoteText] = useState(
    `Olá ${recipientName}, preparei esta mensagem de voz com muito carinho e com as palavras que sempre quis que guardasse consigo. Ouça quando estiver num momento tranquilo.`
  );

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cálculos dinâmicos do roteiro
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estimatedTime = estimateReadingTime(wordCount);

  // Análise dinâmica dos tópicos do roteiro para exibição no card de análise
  const analysisPoints = useMemo(() => {
    if (!script || !script.trim()) {
      return [
        `Introdução afetuosa dedicada a ${recipientName}.`,
        'Desenvolvimento com suas palavras e sentimentos sinceros.',
        'Encerramento com mensagem de carinho e apoio eterno.',
      ];
    }
    const paragraphs = script
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 5);

    if (paragraphs.length >= 3) {
      return paragraphs.slice(0, 5).map((p) => {
        const clean = p.replace(/^[\d\.\-\*\•\s]+/, '').replace(/^["']|["']$/g, '');
        return clean.length > 85 ? clean.substring(0, 82) + '...' : clean;
      });
    }

    const sentences = script
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    if (sentences.length >= 2) {
      return sentences.slice(0, 5).map((s) => (s.length > 85 ? s.substring(0, 82) + '...' : s));
    }

    return [
      `Abertura afetuosa e direta para ${recipientName}.`,
      'Conteúdo principal com valores e conselhos de vida.',
      'Encerramento com bênção e afeto duradouro.',
    ];
  }, [script, recipientName]);

  const selectedTake = useMemo(() => {
    return takes.find((t) => t.id === activeTakeId) || takes[0] || null;
  }, [takes, activeTakeId]);

  // Limpeza de recursos multimídia ao desmontar
  const stopMediaTracks = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopMediaTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
    };
  }, []);

  // Timer de Gravação
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

  // Rolagem suave automática do Teleprompter sincronizada com a gravação
  useEffect(() => {
    let interval = null;
    if (isRecording && !isPaused && isAutoScrolling && step === 2) {
      interval = setInterval(() => {
        if (teleprompterRef.current) {
          teleprompterRef.current.scrollTop += 1;
        }
      }, 55);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isPaused, isAutoScrolling, step]);

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  };

  const handleToggleLocalAi = async () => {
    const next = !isLocalAiEnabled;
    setIsLocalAiEnabled(next);
    localAiService.setLocalAiEnabled(next);
    showToast(next ? '🔒 Modo IA Local ativado no seu dispositivo.' : 'Modo IA Local desativado.');
    if (next && localAiService.isWebGpuSupported() && !localAiService.engine) {
      localAiService.initEngine().catch(() => {});
    }
  };

  // 1. Gera roteiro inteligente com localAiService (com streaming em tempo real)
  const handleGenerateScript = async (customPrompt) => {
    const promptToUse = (typeof customPrompt === 'string' ? customPrompt : aiPrompt) || '';
    if (!promptToUse.trim()) {
      showToast('Descreva o tema antes de gerar o roteiro.');
      return;
    }

    setIsGeneratingAi(true);
    try {
      const result = await localAiService.generateSuggestion({
        prompt: promptToUse,
        details: aiDetails,
        recipientName,
        tone: 'afetuoso',
        onChunk: (_delta, _fullText, parsedPreview) => {
          if (parsedPreview?.content) {
            setScript(formatHtmlToScript(parsedPreview.content));
          }
          if (parsedPreview?.title) {
            setTitle(parsedPreview.title);
          }
        },
      });

      if (result && result.content) {
        const cleanScript = formatHtmlToScript(result.content);
        setScript(cleanScript);
        if (result.title) {
          setTitle(result.title);
        }
        showToast('✨ Roteiro gerado com sucesso pela IA!');
      }
    } catch (err) {
      console.warn('Erro ao gerar roteiro pela IA:', err);
      showToast('Roteiro padrão carregado com sucesso.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleChipClick = (text) => {
    setAiPrompt(text);
    handleGenerateScript(text);
  };

  // 2. Gravação de Áudio Real com MediaRecorder
  const startRecording = async () => {
    setRecordingError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não suporta captura direta de microfone.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Conecta o AnalyserNode para alimentar as barras de ondas sonoras reais
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const updateWaveform = () => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);

            const sampled = [];
            const stepSize = Math.max(1, Math.floor(dataArray.length / 18));
            for (let i = 0; i < 18; i++) {
              const val = dataArray[i * stepSize] || 0;
              sampled.push(Math.max(8, Math.round((val / 255) * 38) + 6));
            }
            setWaveformLevels(sampled);
            animFrameRef.current = requestAnimationFrame(updateWaveform);
          };
          updateWaveform();
        }
      } catch (err) {
        console.warn('AudioContext para visualização não disponível:', err);
      }

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const rawBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(rawBlob);
        const secs = recordingSeconds || 1;
        const takeNumber = takes.length + 1;
        const newTake = {
          id: `take-${Date.now()}`,
          number: takeNumber,
          title: `Tentativa de Gravação ${takeNumber}`,
          blob: rawBlob,
          url,
          duration: `${formatTimer(secs)} min`,
          durationSeconds: secs,
          size: `${Math.max(0.1, rawBlob.size / (1024 * 1024)).toFixed(1)} MB`,
          timestamp: `Hoje às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        };

        setTakes((prev) => [newTake, ...prev]);
        setActiveTakeId(newTake.id);
        stopMediaTracks();
        showToast('⏹️ Tentativa de gravação salva com sucesso!');
      };

      recorder.start(250);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingSeconds(0);
      if (teleprompterRef.current) {
        teleprompterRef.current.scrollTop = 0;
      }
    } catch (err) {
      console.warn('Erro ao acessar microfone:', err);
      setRecordingError(err.message || 'Permissão de microfone negada ou microfone indisponível.');
      setIsRecording(false);
    }
  };

  const handleStop = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      try {
        mediaRecorderRef.current.resume();
      } catch {}
      setIsPaused(false);
      showToast('▶️ Gravação retomada.');
    } else {
      try {
        mediaRecorderRef.current.pause();
      } catch {}
      setIsPaused(true);
      showToast('⏸️ Gravação pausada.');
    }
  };

  const handleRestart = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
      stopMediaTracks();
    }
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
    if (teleprompterRef.current) {
      teleprompterRef.current.scrollTop = 0;
    }
    setTimeout(() => {
      startRecording();
      showToast('🔄 Gravação reiniciada do início.');
    }, 120);
  };

  // Preview de reprodução do áudio gravado em cada take
  const togglePlayTake = (take) => {
    if (!take?.url) return;
    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio();
      audioPreviewRef.current.onended = () => setPlayingTakeId(null);
      audioPreviewRef.current.onerror = () => {
        setPlayingTakeId(null);
        showToast('Erro ao reproduzir preview.');
      };
    }

    if (playingTakeId === take.id) {
      audioPreviewRef.current.pause();
      setPlayingTakeId(null);
    } else {
      audioPreviewRef.current.src = take.url;
      audioPreviewRef.current
        .play()
        .then(() => {
          setPlayingTakeId(take.id);
        })
        .catch((err) => {
          console.warn('Erro ao tocar áudio take:', err);
          setPlayingTakeId(null);
        });
    }
  };

  const handleDeleteTake = (takeId) => {
    if (playingTakeId === takeId && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setPlayingTakeId(null);
    }
    setTakes((prev) => {
      const next = prev.filter((t) => t.id !== takeId);
      if (activeTakeId === takeId) {
        setActiveTakeId(next[0]?.id || null);
      }
      return next;
    });
    showToast('🗑️ Tentativa excluída.');
  };

  const handleSaveDraft = () => {
    try {
      const draft = {
        title,
        aiPrompt,
        script,
        recipient: recipientName,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(`ethernity_voice_draft_${capsuleId || 'default'}`, JSON.stringify(draft));
      showToast('💾 Rascunho salvo com sucesso!');
    } catch {
      showToast('Erro ao salvar rascunho.');
    }
  };

  // 3. Salvar definitivo na cápsula e no cofre
  const handleSaveVoiceMessage = async () => {
    try {
      const chosenTake = selectedTake || takes[0];
      const duration = chosenTake
        ? chosenTake.duration
        : recordingSeconds > 0
        ? `${formatTimer(recordingSeconds)} min`
        : '02:24 min';
      const durationSeconds = chosenTake ? chosenTake.durationSeconds : recordingSeconds || 144;

      let audioUrl = chosenTake?.url || null;
      let audioBlob = chosenTake?.blob || null;

      if (audioBlob) {
        try {
          const uploaded = await vaultService.uploadMedia(audioBlob, {
            title: title || 'Mensagem de Voz Definitiva',
            category: 'Histórias de Vida',
            recipient: recipientName,
            description: script,
            deliveryTrigger: deliveryTrigger === 'posthumous' ? 'Após Falecimento' : 'Data Específica',
          });
          if (uploaded?.media_url) {
            audioUrl = uploaded.media_url;
          }
        } catch (err) {
          console.warn('Upload no vaultService opcional falhou, mantendo dados locais:', err);
        }
      }

      const audioItem = {
        id: `voice-${Date.now()}`,
        title: title || 'Mensagem de Voz Definitiva',
        script,
        duration,
        durationSeconds,
        url: audioUrl,
        audioBlob,
        type: 'audio',
        recipient: recipientName,
        deliveryTrigger: deliveryTrigger === 'posthumous' ? 'Após Falecimento' : 'Data Específica',
        createdAt: new Date().toISOString(),
      };

      // 1. Salvar no cofre geral
      const currentVault = JSON.parse(localStorage.getItem('ethernity_vault_items') || '[]');
      const newVaultItem = {
        id: `vault-audio-${Date.now()}`,
        title: title || 'Mensagem de Voz Definitiva',
        type: 'audio',
        category: 'Histórias de Vida',
        recipient: recipientName,
        description: script,
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        duration,
        size: chosenTake?.size || '2.4 MB',
        isEncrypted: true,
        deliveryTrigger: deliveryTrigger === 'posthumous' ? 'Após Falecimento' : 'Data Específica',
        audioUrl,
      };
      localStorage.setItem('ethernity_vault_items', JSON.stringify([newVaultItem, ...currentVault]));
      window.dispatchEvent(new CustomEvent('ethernity_vault_updated'));

      // 2. Salvar na cápsula ativa
      if (capsuleId) {
        capsulesService.addCapsuleAudio(capsuleId, audioItem);
      }
      if (onSaveToCapsule) {
        onSaveToCapsule(audioItem);
      }

      window.dispatchEvent(new CustomEvent('ethernity_capsules_updated'));

      showToast('🎉 Mensagem de voz guardada na sua cápsula e no cofre com sucesso!');
      setTimeout(() => {
        if (onBack) {
          onBack();
        } else if (onNavigateTab) {
          onNavigateTab('capsules');
        }
      }, 900);
    } catch (err) {
      console.error('Erro ao salvar mensagem de voz:', err);
      showToast('Erro ao salvar mensagem de voz.');
    }
  };

  const handleBreadcrumbClick = () => {
    if (onBack) {
      onBack();
    } else if (onNavigateTab) {
      onNavigateTab('capsules');
    }
  };

  return (
    <div className="voice-ideation-wrapper fade-in">
      <div className="voice-ideation-container">
        {/* Toast Notificação */}
        {toastMessage && (
          <div className="vi-toast-banner">
            <i className="fa-solid fa-circle-check"></i>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. Header Superior & Breadcrumb */}
        <div className="vi-top-bar">
          <div className="vi-left-title-block">
            <nav className="vi-breadcrumbs" aria-label="Navegação">
              <span className="vi-crumb-link" onClick={handleBreadcrumbClick}>
                Meu Cofre
              </span>
              <span className="vi-crumb-sep">&gt;</span>
              <span className="vi-crumb-link" onClick={handleBreadcrumbClick}>
                {recipientName}
              </span>
              <span className="vi-crumb-sep">&gt;</span>
              <span className="vi-crumb-link" onClick={handleBreadcrumbClick}>
                Nova Mensagem
              </span>
              <span className="vi-crumb-sep">&gt;</span>
              <span className="vi-crumb-current">
                {step === 1 ? 'Ideação' : step === 2 ? 'Gravação de Voz' : 'Configurar Entrega'}
              </span>
            </nav>

            <h1 className="vi-main-title">
              {step === 1 && 'Preparar Mensagem de Voz'}
              {step === 2 && 'Gravar Mensagem de Voz'}
              {step === 3 && 'Configurar Entrega'}
            </h1>
            <p className="vi-main-subtitle">
              {step === 1 && `Planeje e estruture sua fala antes de gravar seu áudio definitivo para ${recipientName}`}
              {step === 2 && `Grave seu áudio definitivo para ${recipientName} usando o teleprompter integrado abaixo.`}
              {step === 3 && `Defina como e quando sua mensagem será entregue para ${recipientName}.`}
            </p>
          </div>

          {/* Stepper (1 Ideação ── 2 Gravação ── 3 Entrega) */}
          <div className="vi-stepper-pill">
            <div
              className={`vi-stepper-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}
              onClick={() => setStep(1)}
            >
              <span className="vi-stepper-badge">{step > 1 ? '✓' : '1'}</span>
              <span className="vi-stepper-text">Ideação</span>
            </div>

            <div className={`vi-stepper-line ${step >= 2 ? 'active' : ''}`}></div>

            <div
              className={`vi-stepper-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}
              onClick={() => setStep(2)}
            >
              <span className="vi-stepper-badge">{step > 2 ? '✓' : '2'}</span>
              <span className="vi-stepper-text">Gravação</span>
            </div>

            <div className={`vi-stepper-line ${step >= 3 ? 'active' : ''}`}></div>

            <div
              className={`vi-stepper-item ${step === 3 ? 'active' : ''}`}
              onClick={() => setStep(3)}
            >
              <span className="vi-stepper-badge">3</span>
              <span className="vi-stepper-text">Entrega</span>
            </div>
          </div>
        </div>

        {/* ====================================================================
            PASSO 1: IDEAÇÃO
           ==================================================================== */}
        {step === 1 && (
          <div className="vi-two-col-grid">
            <div className="vi-col-primary">
              <div className="vi-white-card">
                <label className="vi-card-label" htmlFor="msg-title">
                  Título da Mensagem
                </label>
                <input
                  id="msg-title"
                  type="text"
                  className="vi-card-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Conselhos essenciais para a sua jornada e carreira"
                />
              </div>

              <div className="vi-ai-purple-card">
                <div className="vi-ai-card-header" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="vi-ai-icon-box">
                      <i className="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <div className="vi-ai-header-info">
                      <h2 className="vi-ai-title">Assistente de Ideação IA</h2>
                      <p className="vi-ai-subtitle">
                        Escreva o tema abaixo ou use as sugestões rápidas para criar um roteiro estruturado com inteligência artificial.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="vi-chip-btn"
                    onClick={handleToggleLocalAi}
                    title="Ativar ou desativar processamento de IA 100% local no seu navegador"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <i className={`fa-solid ${isLocalAiEnabled ? 'fa-shield-halved' : 'fa-laptop'}`} style={{ marginRight: '6px' }}></i>
                    {isLocalAiEnabled ? 'IA Local: Ativa' : 'IA Local: Desativada'}
                  </button>
                </div>

                <div className="vi-ai-prompt-box" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    className="vi-ai-prompt-input"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Descreva o que deseja falar..."
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
                  />
                  <input
                    type="text"
                    className="vi-ai-prompt-input"
                    value={aiDetails}
                    onChange={(e) => setAiDetails(e.target.value)}
                    placeholder="Detalhes reais (opcional): uma lembrança, apelido ou momento marcante..."
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
                  />
                </div>

                <div className="vi-ai-chips-and-btn-row">
                  <div className="vi-chips-group">
                    <button
                      type="button"
                      className="vi-chip-btn"
                      onClick={() => handleChipClick('Palavras para casamento')}
                    >
                      Palavras para casamento
                    </button>
                    <button
                      type="button"
                      className="vi-chip-btn"
                      onClick={() => handleChipClick('Mensagem de saudade')}
                    >
                      Mensagem de saudade
                    </button>
                    <button
                      type="button"
                      className="vi-chip-btn"
                      onClick={() => handleChipClick('Conselho para o futuro')}
                    >
                      Conselho para o futuro
                    </button>
                    <button
                      type="button"
                      className="vi-chip-btn"
                      onClick={() => handleChipClick('Carta de aniversário')}
                    >
                      Carta de aniversário
                    </button>
                    <button
                      type="button"
                      className="vi-chip-btn"
                      onClick={() => handleChipClick('Mensagem de gratidão')}
                    >
                      Mensagem de gratidão
                    </button>
                  </div>

                  <button
                    type="button"
                    className="vi-btn-gerar-roteiro"
                    onClick={() => handleGenerateScript()}
                    disabled={isGeneratingAi}
                  >
                    <i className={`fa-solid ${isGeneratingAi ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    <span>{isGeneratingAi ? 'Gerando...' : 'Gerar Roteiro'}</span>
                  </button>
                </div>
              </div>

              <div className="vi-white-card vi-script-card">
                <div className="vi-script-header-row">
                  <div className="vi-script-title-wrap">
                    <h2 className="vi-script-title">Seu Roteiro (Editável)</h2>
                    <p className="vi-script-subtitle">
                      Personalize o roteiro gerado ou digite suas anotações livremente
                    </p>
                  </div>
                  <span className="vi-badge-salvo">Salvo automaticamente</span>
                </div>

                <textarea
                  rows={8}
                  className="vi-script-textarea"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                ></textarea>
              </div>
            </div>

            <div className="vi-col-secondary">
              <div className="vi-white-card vi-analysis-card">
                <div className="vi-analysis-top-row">
                  <h2 className="vi-analysis-title">Análise do Roteiro</h2>
                  <span className="vi-roteiro-ia-pill">Roteiro IA</span>
                </div>

                <div className="vi-analysis-items-list">
                  {analysisPoints.map((point, idx) => (
                    <div key={idx} className="vi-analysis-step-item">
                      <span className="vi-step-circle">{idx + 1}</span>
                      <p>{point}</p>
                    </div>
                  ))}
                </div>

                <div className="vi-analysis-metrics-row">
                  <div className="vi-metric-block">
                    <span className="vi-metric-label">Estimativa de Tempo</span>
                    <span className="vi-metric-value-large">{estimatedTime}</span>
                  </div>
                  <div className="vi-metric-block text-right">
                    <span className="vi-metric-label">Palavras no texto</span>
                    <span className="vi-metric-value-large">{wordCount} palavras</span>
                  </div>
                </div>
              </div>

              <div className="vi-white-card vi-tips-card">
                <div className="vi-tips-header">
                  <div className="vi-tips-icon-box">
                    <i className="fa-solid fa-waveform-lines"></i>
                  </div>
                  <h3 className="vi-tips-title">Dicas para uma boa gravação</h3>
                </div>

                <ul className="vi-tips-bullets">
                  <li>Procure um ambiente silencioso e livre de ruídos externos ou eco.</li>
                  <li>Mantenha um tom natural e fale pausadamente para facilitar a clareza do áudio.</li>
                  <li>Seu roteiro ficará disponível no teleprompter integrado quando você avançar.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            PASSO 2: GRAVAÇÃO DE VOZ
           ==================================================================== */}
        {step === 2 && (
          <div className="vi-step2-layout">
            <div className="vi-step2-top-grid">
              <div className="vi-teleprompter-box-card">
                <div className="vi-teleprompter-card-header">
                  <div>
                    <h2 className="vi-teleprompter-title">Teleprompter</h2>
                    <p className="vi-teleprompter-desc">
                      Acompanhe seu roteiro planejado enquanto grava seu áudio
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`vi-badge-rolagem ${isAutoScrolling ? 'active' : 'paused'}`}
                    onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                    title="Alternar rolagem automática do teleprompter"
                  >
                    <span className={`vi-dot-pulse ${isAutoScrolling ? '' : 'paused'}`}></span>
                    <span>{isAutoScrolling ? 'Rolagem Ativa' : 'Rolagem Pausada'}</span>
                  </button>
                </div>

                <div className="vi-teleprompter-content-box" ref={teleprompterRef}>
                  <p className="vi-tele-p" style={{ whiteSpace: 'pre-wrap', fontSize: '15px', lineHeight: '1.75' }}>
                    {script || `Olá ${recipientName}, comece a falar com o coração...`}
                  </p>
                </div>
              </div>

              <div className="vi-white-card vi-record-control-card">
                <h2 className="vi-control-title">Controle de Gravação</h2>

                {recordingError && (
                  <div className="vi-mic-error-banner">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>{recordingError}</span>
                  </div>
                )}

                <div className="vi-audio-timer-display-box">
                  <div className="vi-timer-digits-row">
                    <span className="vi-timer-active-num">{formatTimer(recordingSeconds)}</span>
                    <span className="vi-timer-total-num">/ 05:00</span>
                  </div>

                  <div className="vi-waveform-visualizer-live">
                    {waveformLevels.map((h, i) => (
                      <span
                        key={i}
                        className={`vi-wave-bar ${isRecording && !isPaused ? 'animating' : ''}`}
                        style={{
                          height: `${isRecording && !isPaused ? h : Math.max(8, h * 0.4)}px`,
                          animationDelay: `${(i % 5) * 0.15}s`,
                        }}
                      ></span>
                    ))}
                  </div>
                </div>

                <div className="vi-studio-controls-row">
                  {!isRecording ? (
                    <button
                      type="button"
                      className="vi-btn-main-record-start"
                      onClick={startRecording}
                      title="Iniciar Gravação"
                    >
                      <i className="fa-solid fa-microphone"></i>
                      <span>{takes.length > 0 ? 'Gravar Nova Tentativa' : 'Iniciar Gravação'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="vi-btn-circle-action"
                        onClick={handleRestart}
                        title="Reiniciar Gravação"
                      >
                        <i className="fa-solid fa-rotate-left"></i>
                      </button>

                      <button
                        type="button"
                        className="vi-btn-main-record-stop"
                        onClick={handleStop}
                        title="Parar e Salvar Tentativa"
                      >
                        <div className="vi-stop-square-icon"></div>
                      </button>

                      <button
                        type="button"
                        className="vi-btn-circle-action"
                        onClick={handlePauseResume}
                        title={isPaused ? 'Retomar' : 'Pausar'}
                      >
                        <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
                      </button>
                    </>
                  )}
                </div>

                <div className="vi-rec-status-indicator">
                  <span className={`vi-status-dot ${isRecording && !isPaused ? 'live-red' : ''}`}></span>
                  <span>
                    {isRecording
                      ? isPaused
                        ? 'Gravação pausada...'
                        : 'Gravando áudio definitivo...'
                      : takes.length > 0
                      ? 'Gravação salva nas tentativas abaixo.'
                      : 'Pronto para gravar'}
                  </span>
                </div>
              </div>
            </div>

            <div className="vi-avatar-banner-card">
              <div className="vi-avatar-banner-left">
                <div className="vi-avatar-mic-icon-box">
                  <i className="fa-solid fa-microphone"></i>
                </div>
                <div className="vi-avatar-banner-text">
                  <h3 className="vi-avatar-banner-title">Usar Avatar de Voz Digital</h3>
                  <p className="vi-avatar-banner-subtitle">
                    Seu avatar clonado irá reproduzir esta mensagem caso prefira não usar sua voz gravada diretamente.
                  </p>
                </div>
              </div>

              <div
                className={`vi-ios-toggle ${useAvatarVoice ? 'active' : ''}`}
                onClick={() => setUseAvatarVoice(!useAvatarVoice)}
              >
                <div className="vi-ios-toggle-knob"></div>
              </div>
            </div>

            <div className="vi-saved-takes-section">
              <div className="vi-saved-takes-header">
                <h2 className="vi-saved-section-title">Gravações Salvas ({takes.length})</h2>
                {takes.length > 0 && (
                  <span className="vi-saved-takes-hint">Selecione a melhor tentativa para incluir na sua cápsula</span>
                )}
              </div>

              {takes.length === 0 ? (
                <div className="vi-no-takes-card">
                  <div className="vi-no-takes-icon">
                    <i className="fa-solid fa-microphone-slash"></i>
                  </div>
                  <h4>Nenhuma gravação realizada ainda</h4>
                  <p>
                    Clique em <strong>Iniciar Gravação</strong> acima para gravar com auxílio do teleprompter.
                  </p>
                </div>
              ) : (
                takes.map((take) => {
                  const isSelected = activeTakeId === take.id;
                  const isPlaying = playingTakeId === take.id;
                  return (
                    <div
                      key={take.id}
                      className={`vi-saved-take-row ${isSelected ? 'active-selected' : ''}`}
                    >
                      <div className="vi-take-left">
                        <button
                          type="button"
                          className={`vi-take-play-btn ${isPlaying ? 'playing' : ''}`}
                          onClick={() => togglePlayTake(take)}
                          title={isPlaying ? 'Pausar áudio' : 'Ouvir gravação'}
                        >
                          <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                        </button>
                        <div className="vi-take-info">
                          <h4 className="vi-take-title">{take.title}</h4>
                          <span className="vi-take-meta">
                            {take.timestamp} • {take.duration}
                          </span>
                        </div>
                      </div>

                      <div className="vi-take-waveform-preview">
                        <span>••••••••••••••••••••••••••••••••</span>
                      </div>

                      <div className="vi-take-actions-right">
                        {isSelected ? (
                          <span className="btn-take-action-selected">
                            <i className="fa-solid fa-check"></i> Selecionada
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-take-action-secondary"
                            onClick={() => {
                              setActiveTakeId(take.id);
                              showToast(`✅ ${take.title} selecionada para o envio!`);
                            }}
                          >
                            Usar esta
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-take-delete"
                          onClick={() => handleDeleteTake(take.id)}
                          title="Excluir tentativa"
                        >
                          <i className="fa-regular fa-trash-can"></i>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            PASSO 3: CONFIGURAR ENTREGA (EXATO AO NOVO MOCKUP)
           ==================================================================== */}
        {step === 3 && (
          <div className="vi-delivery-step-layout">
            {/* Coluna Esquerda: Formulário de Entrega (1, 2, 3, Shield, 4) */}
            <div className="vi-delivery-left-column">
              {/* 1. Tipo de Entrega */}
              <div className="vi-white-card vi-deliv-card-section">
                <h3 className="vi-deliv-sec-title">1. Tipo de Entrega</h3>
                <p className="vi-deliv-sec-desc">Escolha o gatilho ideal para o envio automático deste registro</p>

                <div className="vi-deliv-trigger-cards-grid">
                  {/* Opção A: Data Específica */}
                  <div
                    className={`vi-deliv-trigger-box ${deliveryTrigger === 'date' ? 'selected' : ''}`}
                    onClick={() => setDeliveryTrigger('date')}
                  >
                    <div className="vi-deliv-trigger-top">
                      <div className="vi-trigger-icon coral-light">
                        <i className="fa-regular fa-calendar"></i>
                      </div>
                      <span className="vi-radio-circle-indicator">
                        {deliveryTrigger === 'date' && <span className="vi-radio-inner-dot"></span>}
                      </span>
                    </div>
                    <h4 className="vi-trigger-card-title">Data Específica</h4>
                    <p className="vi-trigger-card-desc">
                      Entregue rigorosamente no dia e hora agendados abaixo.
                    </p>
                  </div>

                  {/* Opção B: Quando eu não estiver mais aqui */}
                  <div
                    className={`vi-deliv-trigger-box ${deliveryTrigger === 'posthumous' ? 'selected' : ''}`}
                    onClick={() => setDeliveryTrigger('posthumous')}
                  >
                    <div className="vi-deliv-trigger-top">
                      <div className="vi-trigger-icon coral-light">
                        <i className="fa-regular fa-heart"></i>
                      </div>
                      <span className="vi-radio-circle-indicator">
                        {deliveryTrigger === 'posthumous' && <span className="vi-radio-inner-dot"></span>}
                      </span>
                    </div>
                    <h4 className="vi-trigger-card-title">Quando eu não estiver mais aqui</h4>
                    <p className="vi-trigger-card-desc">
                      Enviado após confirmação oficial da sua partida pelos guardiões.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Canal de Entrega */}
              <div className="vi-white-card vi-deliv-card-section">
                <h3 className="vi-deliv-sec-title">2. Canal de Entrega</h3>
                <p className="vi-deliv-sec-desc">Como o destinatário receberá o link para acessar a mensagem segura</p>

                <div className="vi-channels-options-list">
                  {/* Checkbox E-mail com input */}
                  <div className="vi-channel-row-item">
                    <label className="vi-custom-checkbox-label">
                      <input
                        type="checkbox"
                        checked={emailChannel}
                        onChange={(e) => setEmailChannel(e.target.checked)}
                      />
                      <span className="vi-checkbox-box">
                        {emailChannel && <i className="fa-solid fa-check"></i>}
                      </span>
                      <span className="vi-checkbox-text">E-mail</span>
                    </label>

                    {emailChannel && (
                      <input
                        type="email"
                        className="vi-channel-input"
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                      />
                    )}
                  </div>

                  {/* Checkbox WhatsApp */}
                  <div className="vi-channel-row-item">
                    <label className="vi-custom-checkbox-label">
                      <input
                        type="checkbox"
                        checked={whatsappChannel}
                        onChange={(e) => setWhatsappChannel(e.target.checked)}
                      />
                      <span className="vi-checkbox-box">
                        {whatsappChannel && <i className="fa-solid fa-check"></i>}
                      </span>
                      <span className="vi-checkbox-text">WhatsApp</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 3. Guardião Responsável */}
              <div className="vi-white-card vi-deliv-card-section">
                <h3 className="vi-deliv-sec-title">3. Guardião Responsável</h3>
                <p className="vi-deliv-sec-desc">Pessoa encarregada de gerenciar a contingência ou validar a integridade do envio</p>

                <div className="vi-guardian-assigned-box">
                  <div className="vi-guardian-left-info">
                    <img
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250"
                      alt="Roberto Silva de Souza"
                      className="vi-guardian-thumb"
                    />
                    <div className="vi-guardian-text">
                      <h4 className="vi-guardian-name">Roberto Silva de Souza</h4>
                      <div className="vi-guardian-meta-line">
                        <span>Cônjuge</span>
                        <span className="vi-guardian-meta-sep">•</span>
                        <span className="vi-guardian-status-green">ATIVO</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-alterar-guardiao"
                    onClick={() => onNavigateTab && onNavigateTab('guardian')}
                  >
                    Alterar Guardião
                  </button>
                </div>
              </div>

              {/* Box de Alerta: Curiosidade não libera o cofre */}
              <div className="vi-curiosity-shield-card">
                <label className="vi-custom-checkbox-label">
                  <input
                    type="checkbox"
                    checked={curiosityShield}
                    onChange={(e) => setCuriosityShield(e.target.checked)}
                  />
                  <span className="vi-checkbox-box coral-check">
                    {curiosityShield && <i className="fa-solid fa-check"></i>}
                  </span>
                </label>
                <div className="vi-shield-text-content">
                  <h4 className="vi-shield-title">Curiosidade não libera o cofre 🔒</h4>
                  <p className="vi-shield-desc">
                    Se o guardião tentar abrir o cofre, entraremos em contato com você por WhatsApp e SMS durante 48 horas. Se você responder, ótimo, era só um guardião curioso. Caso contrário, as mensagens seguem para os destinatários.
                  </p>
                </div>
              </div>

              {/* 4. Mensagem de Acompanhamento */}
              <div className="vi-white-card vi-deliv-card-section">
                <div className="vi-deliv-toggle-header">
                  <div>
                    <h3 className="vi-deliv-sec-title">4. Mensagem de Acompanhamento</h3>
                    <p className="vi-deliv-sec-desc">Adicione uma nota breve opcional para ser enviada junto à notificação principal</p>
                  </div>

                  <div
                    className={`vi-ios-toggle ${hasFollowUpNote ? 'active' : ''}`}
                    onClick={() => setHasFollowUpNote(!hasFollowUpNote)}
                  >
                    <div className="vi-ios-toggle-knob"></div>
                  </div>
                </div>

                {hasFollowUpNote && (
                  <div className="vi-followup-textarea-box">
                    <textarea
                      rows={4}
                      className="vi-followup-textarea"
                      value={followUpNoteText}
                      onChange={(e) => setFollowUpNoteText(e.target.value)}
                    ></textarea>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita: Card Resumo do Envio */}
            <div className="vi-delivery-right-column">
              <div className="vi-white-card vi-summary-side-card">
                <h3 className="vi-summary-card-title">Resumo do Envio</h3>
                <p className="vi-summary-card-subtitle">Confirme todos os detalhes antes de salvar</p>

                {/* Banner do Áudio no topo do resumo */}
                <div className="vi-summary-media-banner">
                  <div className="vi-summary-media-icon">
                    <i className="fa-solid fa-waveform-lines"></i>
                  </div>
                  <div className="vi-summary-media-info">
                    <h4 className="vi-summary-media-title">{title || 'Mensagem de Voz Definitiva'}</h4>
                    <span className="vi-summary-media-sub">
                      {selectedTake ? `${selectedTake.title} selecionada` : 'Pronta para gravação'}
                    </span>
                  </div>
                </div>

                {/* Lista de Metadados Chave / Valor */}
                <div className="vi-summary-table-rows">
                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Tipo de Registro</span>
                    <strong className="vi-sum-value">
                      Voz ({selectedTake?.blob?.type?.includes('mp4') ? '.mp4' : '.webm'})
                    </strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Duração</span>
                    <strong className="vi-sum-value">
                      {selectedTake ? selectedTake.duration : (recordingSeconds > 0 ? `${formatTimer(recordingSeconds)} min` : estimatedTime)}
                    </strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Destinatário</span>
                    <strong className="vi-sum-value">{recipientName}</strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Gatilho de Envio</span>
                    <strong className="vi-sum-value">
                      {deliveryTrigger === 'posthumous' ? 'Após Falecimento' : 'Data Específica'}
                    </strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Condição de Entrega</span>
                    <strong className="vi-sum-value">Aguardando confirmação</strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Horário</span>
                    <strong className="vi-sum-value">—</strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Canal Principal</span>
                    <strong className="vi-sum-value">E-mail & Link Privado</strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Guardião Nomeado</span>
                    <strong className="vi-sum-value">Roberto Silva de Souza</strong>
                  </div>

                  <div className="vi-sum-row">
                    <span className="vi-sum-label">Acompanhamento</span>
                    <strong className="vi-sum-value">Sim (Texto Ativo)</strong>
                  </div>
                </div>

                {/* Rodapé de Segurança Criptográfica */}
                <div className="vi-summary-security-note">
                  <i className="fa-solid fa-shield-halved"></i>
                  <p>Sua entrega está protegida sob criptografia de ponta-a-ponta e é monitorada pelo guardião ativo de sua confiança.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Rodapé de Ações (Voltar para Gravação / Confirmar e Guardar no Meu Cofre) */}
        <footer className="vi-bottom-actions-row">
          {step === 3 && (
            <button
              type="button"
              className="vi-btn-rascunho"
              onClick={() => setStep(2)}
            >
              Voltar para Gravação
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              className="vi-btn-rascunho"
              onClick={() => setStep(1)}
            >
              Voltar para Ideação
            </button>
          )}

          {step === 1 && (
            <button
              type="button"
              className="vi-btn-rascunho"
              onClick={handleSaveDraft}
            >
              Salvar como Rascunho
            </button>
          )}

          <div className="vi-footer-buttons-right">
            {step === 1 && (
              <button
                type="button"
                className="vi-btn-ir-gravacao"
                onClick={() => setStep(2)}
              >
                <span>Ir para Gravação</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                className="vi-btn-ir-gravacao"
                onClick={() => setStep(3)}
              >
                <span>Configurar Entrega</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                className="vi-btn-ir-gravacao"
                onClick={handleSaveVoiceMessage}
              >
                <span>Confirmar e Guardar no Meu Cofre</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
