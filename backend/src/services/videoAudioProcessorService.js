/**
 * videoAudioProcessorService.js
 * Motor de processamento e transcodificação para vídeos e áudios no Ethernity DMs.
 * Padrão YouTube para vídeo (H.264 + FastStart + Poster WebP) e Spotify para áudio (Opus/AAC + Waveform).
 */
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Configura caminhos estáticos dos executáveis C++
if (ffmpegInstaller?.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}
if (ffprobeInstaller?.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

export const videoAudioProcessorService = {
  /**
   * Obtém metadados detalhados de áudio e vídeo via ffprobe
   * @param {string} filePath Caminho do arquivo
   * @returns {Promise<Object>}
   */
  async getMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);

        const format = metadata.format || {};
        const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams?.find((s) => s.codec_type === 'audio');

        resolve({
          durationSeconds: Math.round(Number(format.duration || 0)),
          bitrate: Number(format.bit_rate || 0),
          sizeBytes: Number(format.size || 0),
          video: videoStream
            ? {
                codec: videoStream.codec_name,
                width: videoStream.width,
                height: videoStream.height,
                fps: eval(videoStream.r_frame_rate || '30'),
              }
            : null,
          audio: audioStream
            ? {
                codec: audioStream.codec_name,
                sampleRate: Number(audioStream.sample_rate || 44100),
                channels: audioStream.channels || 2,
              }
            : null,
        });
      });
    });
  },

  /**
   * Transcodifica vídeo para MP4 H.264 com flag +faststart e extrai pôster WebP
   * @param {string} inputPath Caminho do vídeo original
   * @param {string} outputVideoPath Caminho de saída do MP4 otimizado
   * @param {string} outputPosterPath Caminho de saída do pôster WebP
   * @param {Object} [options]
   * @returns {Promise<Object>} Metadados do vídeo e pôster processados
   */
  async processVideo(inputPath, outputVideoPath, outputPosterPath, options = {}) {
    const meta = await this.getMetadata(inputPath);
    const targetTimestamp = Math.min(1.0, meta.durationSeconds > 0 ? meta.durationSeconds * 0.1 : 0);

    // 1. Transcodifica vídeo para MP4 (H.264 + AAC + FastStart)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions([
          '-preset medium',
          '-crf 22',
          '-movflags +faststart', // moov atom no início para streaming instantâneo
          '-pix_fmt yuv420p', // compatibilidade universal em navegadores e iOS
        ])
        .output(outputVideoPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // 2. Extrai frame de capa (Poster) e converte para WebP via Sharp
    const tempPosterPng = path.join(os.tmpdir(), `poster-${Date.now()}.png`);
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(outputVideoPath)
          .seekInput(targetTimestamp)
          .frames(1)
          .output(tempPosterPng)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      const posterBuffer = await fs.readFile(tempPosterPng);
      const webpPosterBuffer = await sharp(posterBuffer)
        .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88, effort: 4 })
        .toBuffer();

      await fs.writeFile(outputPosterPath, webpPosterBuffer);
    } finally {
      await fs.unlink(tempPosterPng).catch(() => {});
    }

    const finalMeta = await this.getMetadata(outputVideoPath);

    return {
      durationSeconds: finalMeta.durationSeconds,
      width: finalMeta.video?.width || 1920,
      height: finalMeta.video?.height || 1080,
      fps: finalMeta.video?.fps || 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
    };
  },

  /**
   * Transcodifica áudio para M4A / AAC e gera o vetor Waveform JSON
   * @param {string} inputPath Caminho do áudio gravado
   * @param {string} outputAudioPath Caminho de saída do áudio otimizado (M4A)
   * @param {Object} [options]
   * @returns {Promise<{ durationSeconds: number, waveformPeaks: number[] }>}
   */
  async processAudio(inputPath, outputAudioPath, options = {}) {
    // 1. Transcodifica áudio para M4A / AAC (48 kHz, 128 kbps)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('aac')
        .audioBitrate('128k')
        .audioFrequency(48000)
        .audioChannels(2)
        .output(outputAudioPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const meta = await this.getMetadata(outputAudioPath);
    const waveformPeaks = await this.generateWaveformPeaks(outputAudioPath, options.numPeaks || 100);

    return {
      durationSeconds: meta.durationSeconds,
      waveformPeaks,
      sampleRate: 48000,
      codec: 'aac',
    };
  },

  /**
   * Extrai os picos de amplitude do áudio para renderização de forma de onda (Waveform)
   * @param {string} audioPath Caminho do áudio
   * @param {number} numPoints Quantidade de picos normalizados (ex: 100)
   * @returns {Promise<number[]>} Array com números entre 0.05 e 1.0
   */
  async generateWaveformPeaks(audioPath, numPoints = 100) {
    const rawPcmPath = path.join(os.tmpdir(), `pcm-${Date.now()}.raw`);

    try {
      // Exporta stream PCM mono de 16 bits a 8 kHz para cálculo ultrarrápido
      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .audioChannels(1)
          .audioFrequency(8000)
          .format('s16le')
          .output(rawPcmPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      const pcmBuffer = await fs.readFile(rawPcmPath);
      const totalSamples = Math.floor(pcmBuffer.length / 2);
      if (totalSamples === 0) {
        return new Array(numPoints).fill(0.1);
      }

      const samplesPerBucket = Math.max(1, Math.floor(totalSamples / numPoints));
      const peaks = [];
      let globalMax = 1;

      for (let i = 0; i < numPoints; i++) {
        const start = i * samplesPerBucket;
        const end = Math.min(start + samplesPerBucket, totalSamples);
        let maxVal = 0;

        for (let j = start; j < end; j++) {
          const val = Math.abs(pcmBuffer.readInt16LE(j * 2));
          if (val > maxVal) maxVal = val;
        }

        if (maxVal > globalMax) globalMax = maxVal;
        peaks.push(maxVal);
      }

      // Normaliza para valores entre 0.05 (mínimo visual estético) e 1.0 (pico)
      return peaks.map((p) => Number(Math.max(0.05, p / globalMax).toFixed(2)));
    } catch (e) {
      console.warn('[videoAudioProcessorService] Falha ao calcular waveform, usando padrão:', e);
      return new Array(numPoints).fill(0.2);
    } finally {
      await fs.unlink(rawPcmPath).catch(() => {});
    }
  },
};

export default videoAudioProcessorService;
