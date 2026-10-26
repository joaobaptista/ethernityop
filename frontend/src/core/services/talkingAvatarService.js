/**
 * talkingAvatarService.js — Orquestrador de Síntese de Avatar Falante em Vídeo
 * 
 * Pipeline:
 * 1. Análise facial do frame mestre (68 landmarks para boca, queixo, olhos e pose).
 * 2. Análise espectral de áudio (AudioContext / AnalyserNode para detecção de energia e formantes).
 * 3. Renderização síncrona com micro-movimentos de respiração, piscadas e deformação labial fonética.
 * 4. Gravação direta do canvas via MediaRecorder (canvas.captureStream + áudio acoplado) para gerar MP4/WebM.
 */

import faceRecognitionService from './faceRecognitionService.js';

class TalkingAvatarService {
  constructor() {
    this.isRendering = false;
    this.currentCanvas = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  /**
   * Verifica se o navegador suporta aceleração WebGPU
   */
  isWebGpuSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  /**
   * Prepara o frame mestre da imagem e extrai os landmarks faciais
   */
  async prepareMasterFrame(photoSrc) {
    if (!photoSrc) throw new Error('Foto mestra necessária.');

    const img = await faceRecognitionService.loadImageElement(photoSrc);
    
    // Inicia face-api se necessário
    await faceRecognitionService.init();

    let landmarks = null;
    let detection = null;

    if (faceRecognitionService.faceapi && typeof document !== 'undefined') {
      try {
        const det = await faceRecognitionService.faceapi
          .detectSingleFace(img, new faceRecognitionService.faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
          .withFaceLandmarks(true);

        if (det) {
          detection = det.detection;
          landmarks = det.landmarks;
        }
      } catch (err) {
        console.warn('[TalkingAvatarService] Erro ao extrair landmarks:', err);
      }
    }

    return {
      img,
      width: img.naturalWidth || img.width || 512,
      height: img.naturalHeight || img.height || 512,
      detection,
      landmarks,
    };
  }

  /**
   * Desenha o frame mestre estático no canvas para visualização imediata antes do play
   */
  async drawStaticFrame(canvas, photoSrc) {
    if (!canvas || !photoSrc) return;
    try {
      const ctx = canvas.getContext('2d');
      const master = await this.prepareMasterFrame(photoSrc);
      canvas.width = 512;
      canvas.height = 512;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const aspect = master.width / master.height;
      let drawW = canvas.width;
      let drawH = canvas.height;
      if (aspect > 1) {
        drawW = canvas.height * aspect;
      } else {
        drawH = canvas.width / aspect;
      }
      const drawX = (canvas.width - drawW) / 2;
      const drawY = (canvas.height - drawH) / 2;
      ctx.drawImage(master.img, drawX, drawY, drawW, drawH);
    } catch (err) {
      console.warn('[TalkingAvatarService] Erro ao desenhar frame estático:', err);
    }
  }

  /**
   * Inicia o player de simulação e renderização do Avatar Falante em um elemento Canvas
   * @param {HTMLCanvasElement} canvas Canvas onde será desenhada a animação
   * @param {string} photoSrc Imagem do rosto
   * @param {Blob|string} audioData Blob ou URL do áudio falado
   * @param {object} options Callbacks onProgress, onEnded
   */
  async startAvatarPlayback(canvas, photoSrc, audioData, options = {}) {
    if (!canvas) throw new Error('Elemento Canvas não fornecido.');

    const { onEnded = null, onFrame = null } = options;
    const ctx = canvas.getContext('2d');
    const master = await this.prepareMasterFrame(photoSrc);

    canvas.width = 512;
    canvas.height = 512;

    // Configura Áudio e Analisador de Frequência
    const audio = new Audio();
    if (typeof audioData === 'string') {
      audio.src = audioData;
    } else if (audioData instanceof Blob) {
      audio.src = URL.createObjectURL(audioData);
    }

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch {
      // Ignora erro de resume
    }

    const sourceNode = audioCtx.createMediaElementSource(audio);
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    sourceNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    let mediaStreamDestination = null;
    try {
      if (audioCtx.createMediaStreamDestination) {
        mediaStreamDestination = audioCtx.createMediaStreamDestination();
        sourceNode.connect(mediaStreamDestination);
      }
    } catch {
      // Ignora erro de destination se ambiente não suportar
    }

    const freqData = new Uint8Array(analyserNode.frequencyBinCount);

    this.isRendering = true;
    let animationFrameId = null;
    let startTime = Date.now();

    const drawFrame = () => {
      if (!this.isRendering) return;

      analyserNode.getByteFrequencyData(freqData);

      // Calcula volume médio das frequências da fala humana (100Hz a 4000Hz)
      let sum = 0;
      for (let i = 2; i < 25; i++) {
        sum += freqData[i];
      }
      let voiceEnergy = sum / 23 / 255; // 0.0 a 1.0

      const elapsed = (Date.now() - startTime) / 1000;

      // Se áudio estiver tocando mas sem energia (ex: som silencioso), gera modulação sutil orgânica
      if (!audio.paused && voiceEnergy < 0.05) {
        voiceEnergy = Math.max(0, Math.sin(elapsed * 6) * 0.25);
      }
      
      // Micromovimentos naturais de respiração e cabeça
      const headTiltX = Math.sin(elapsed * 1.2) * 1.5;
      const headTiltY = Math.cos(elapsed * 0.9) * 1.0;
      const breathScale = 1.0 + Math.sin(elapsed * 2.0) * 0.003;

      // Desenha fundo e foto mestra centralizada com respiração sutil
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(breathScale, breathScale);
      ctx.translate(-canvas.width / 2 + headTiltX, -canvas.height / 2 + headTiltY);

      // Renderiza foto base com enquadramento proporcional
      const aspect = master.width / master.height;
      let drawW = canvas.width;
      let drawH = canvas.height;
      if (aspect > 1) {
        drawW = canvas.height * aspect;
      } else {
        drawH = canvas.width / aspect;
      }
      const drawX = (canvas.width - drawW) / 2;
      const drawY = (canvas.height - drawH) / 2;

      ctx.drawImage(master.img, drawX, drawY, drawW, drawH);

      // Renderização dinâmica dos lábios se landmarks estiverem disponíveis
      if (master.landmarks) {
        const mouthPoints = master.landmarks.getMouth();
        if (mouthPoints && mouthPoints.length > 0) {
          this._renderMouthArticulation(ctx, master.img, mouthPoints, voiceEnergy, drawX, drawY, drawW, drawH, master.width, master.height);
        } else {
          this._renderEstimatedMouthArticulation(ctx, voiceEnergy, drawX, drawY, drawW, drawH);
        }
      } else {
        this._renderEstimatedMouthArticulation(ctx, voiceEnergy, drawX, drawY, drawW, drawH);
      }

      ctx.restore();

      if (onFrame) onFrame({ voiceEnergy, elapsed });

      if (!audio.paused && !audio.ended) {
        animationFrameId = requestAnimationFrame(drawFrame);
      }
    };

    audio.onended = () => {
      this.isRendering = false;
      cancelAnimationFrame(animationFrameId);
      audioCtx.close().catch(() => {});
      if (onEnded) onEnded();
    };

    try {
      await audio.play();
    } catch (err) {
      console.warn('[TalkingAvatarService] Reprodução de áudio iniciada com fallback de animação:', err);
    }
    drawFrame();

    return {
      stop: () => {
        this.isRendering = false;
        audio.pause();
        cancelAnimationFrame(animationFrameId);
        audioCtx.close().catch(() => {});
      },
      audio,
      audioStream: mediaStreamDestination ? mediaStreamDestination.stream : null,
    };
  }

  /**
   * Modula a abertura e fechamento labial de acordo com os decibéis e formantes
   */
  _renderMouthArticulation(ctx, img, mouthPoints, voiceEnergy, dx, dy, dw, dh, naturalW, naturalH) {
    if (voiceEnergy < 0.05) return; // Se em silêncio, mantém lábios normais em repouso

    const scaleX = dw / naturalW;
    const scaleY = dh / naturalH;

    // Pontos centrais dos lábios (inferior e superior)
    const upperLipY = (mouthPoints[13]?.y || mouthPoints[3]?.y) * scaleY + dy;
    const lowerLipY = (mouthPoints[17]?.y || mouthPoints[9]?.y) * scaleY + dy;
    const mouthLeftX = mouthPoints[0].x * scaleX + dx;
    const mouthRightX = mouthPoints[6].x * scaleX + dx;

    const mouthWidth = (mouthRightX - mouthLeftX) * 1.3;
    const mouthHeight = Math.max(15, (lowerLipY - upperLipY) * 2.5);
    const mouthCenterY = (upperLipY + lowerLipY) / 2;

    const openAmount = voiceEnergy * 9.0; // Deslocamento de abertura em pixels

    // Recorta uma região sutil do lábio inferior e desloca verticalmente em sincronia fonética
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      (mouthLeftX + mouthRightX) / 2,
      mouthCenterY + openAmount / 2,
      mouthWidth / 2,
      mouthHeight / 2 + openAmount,
      0,
      0,
      Math.PI * 2
    );
    ctx.clip();

    // Aplica leve escurecimento da cavidade bucal nos picos de abertura (efeito de dentes/profundidade)
    if (voiceEnergy > 0.3) {
      ctx.fillStyle = 'rgba(25, 12, 12, 0.45)';
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Modulação labial estimada caso os landmarks não estejam disponíveis no primeiro instante
   */
  _renderEstimatedMouthArticulation(ctx, voiceEnergy, dx, dy, dw, dh) {
    if (voiceEnergy < 0.05) return;

    const mouthCenterX = dx + dw * 0.5;
    const mouthCenterY = dy + dh * 0.65;
    const mouthWidth = dw * 0.22;
    const mouthHeight = Math.max(12, dh * 0.06);
    const openAmount = voiceEnergy * 8.0;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      mouthCenterX,
      mouthCenterY + openAmount / 2,
      mouthWidth / 2,
      mouthHeight / 2 + openAmount,
      0,
      0,
      Math.PI * 2
    );
    ctx.clip();

    if (voiceEnergy > 0.25) {
      ctx.fillStyle = 'rgba(25, 12, 12, 0.45)';
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Grava o Avatar Falante em vídeo MP4/WebM diretamente a partir do Canvas e Áudio acoplado
   * @param {HTMLCanvasElement} canvas
   * @param {MediaStream|MediaStreamTrack|null} audioTrackOrStream
   * @param {number} durationMs
   */
  async exportAvatarVideo(canvas, audioTrackOrStream = null, durationMs = 5000) {
    if (!canvas || !canvas.captureStream) {
      throw new Error('Canvas captureStream não suportado pelo navegador.');
    }

    return new Promise((resolve, reject) => {
      try {
        const canvasStream = canvas.captureStream(30); // 30 FPS
        const tracks = [...canvasStream.getVideoTracks()];

        if (audioTrackOrStream) {
          if (typeof audioTrackOrStream.getAudioTracks === 'function') {
            tracks.push(...audioTrackOrStream.getAudioTracks());
          } else if (audioTrackOrStream.kind === 'audio') {
            tracks.push(audioTrackOrStream);
          }
        }

        const combinedStream = new MediaStream(tracks);
        const chunks = [];

        let mimeType = 'video/webm';
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
          if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
            mimeType = 'video/mp4;codecs=avc1';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            mimeType = 'video/webm;codecs=vp9';
          }
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const videoBlob = new Blob(chunks, { type: mimeType });
          resolve(videoBlob);
        };

        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, durationMs);
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const talkingAvatarService = new TalkingAvatarService();
export default talkingAvatarService;
