/**
 * vaultMedia.js
 * Rotas seguras de upload e streaming do Cofre Multimodal Criptografado (Zero-Knowledge).
 * Suporta imagens WebP (multi-tier), vídeos MP4/H.264 (+faststart) e áudios Opus/AAC com Range Requests (HTTP 206).
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsClassic from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { requireAuth } from '../auth.js';
import config from '../config.js';
import { pool } from '../db/mysql.js';
import imageProcessorService from '../services/imageProcessorService.js';
import videoAudioProcessorService from '../services/videoAudioProcessorService.js';
import vaultEncryptionService from '../services/vaultEncryptionService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const VAULT_DIR = config.vaultFolder || path.resolve(config.uploadFolder, 'vault');
fs.mkdir(VAULT_DIR, { recursive: true }).catch(() => {});

/**
 * Auxiliar: Busca e valida autorização de acesso a uma memória do cofre
 */
async function getAuthorizedMemory(memoryId, user) {
  const [rows] = await pool.query(
    'SELECT * FROM memories WHERE id = ? OR storage_key LIKE ?',
    [memoryId, `%/${memoryId}`]
  );

  const memory = rows[0];
  if (!memory) {
    const error = new Error('Memória não encontrada no cofre.');
    error.status = 404;
    throw error;
  }

  const userId = user?.id || user?.sub;

  // 1. Proprietário direto tem acesso irrestrito
  if (memory.author_id === userId) {
    return memory;
  }

  // 2. Verifica se o requisitante é Guardião de Confiança com protocolo liberado
  const [guardianCheck] = await pool.query(
    `SELECT c.id FROM capsules c
     JOIN capsule_guardians cg ON cg.capsule_id = c.id
     WHERE c.id = ? AND cg.guardian_email = ? AND c.status = 'UNLOCKED'`,
    [memory.capsule_id, user?.email]
  ).catch(() => [[]]);

  if (guardianCheck && guardianCheck.length > 0) {
    return memory;
  }

  const forbiddenErr = new Error('Acesso não autorizado a esta memória protegida.');
  forbiddenErr.status = 403;
  throw forbiddenErr;
}

// =========================================================================
// 1. POST /vault/media/upload — Upload Multimodal Unificado & Criptografia
// =========================================================================
router.post(
  '/vault/media/upload',
  requireAuth,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'media', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'livePhotoVideo', maxCount: 1 },
    { name: 'live_video', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const file =
        req.files?.file?.[0] ||
        req.files?.media?.[0] ||
        req.files?.photo?.[0] ||
        req.files?.video?.[0] ||
        req.files?.audio?.[0];

      if (!file) {
        return res.status(422).json({ detail: 'Nenhum arquivo enviado.' });
      }

      const mime = (file.mimetype || '').toLowerCase();
      const rawExt = path.extname(file.originalname || '').toLowerCase();
      const isHeic = rawExt === '.heic' || rawExt === '.heif' || mime === 'image/heic' || mime === 'image/heif';
      const isImage = mime.startsWith('image/') || isHeic;
      const isVideo = mime.startsWith('video/');
      const isAudio = mime.startsWith('audio/');

      if (!isImage && !isVideo && !isAudio) {
        return res.status(400).json({ detail: 'Tipo de mídia não suportado. Envie imagem, vídeo ou áudio.' });
      }

      const userId = req.user.id || req.user.sub;
      const mediaId = `mem-${crypto.randomUUID()}`;
      const mediaDir = path.join(VAULT_DIR, userId, mediaId);
      await fs.mkdir(mediaDir, { recursive: true });

      const capsuleId = req.body.capsuleId || 'capsule-default';
      const title = req.body.title || file.originalname || 'Arquivo no Cofre';
      const description = req.body.description || '';

      // -------------------------------------------------------------------
      // CASO A: IMAGEM (WebP Multi-Tier + Suporte a HEIC & Apple Live Photos)
      // -------------------------------------------------------------------
      if (isImage) {
        const processed = await imageProcessorService.processImage(file.buffer);

        // Criptografa variantes com AES-256-GCM e AAD vinculado ao usuário
        const masterEnc = vaultEncryptionService.encryptSingleBlock(processed.master.buffer, {
          userId,
          mediaId,
          variant: 'master',
        });
        const displayEnc = vaultEncryptionService.encryptSingleBlock(processed.display.buffer, {
          userId,
          mediaId,
          variant: 'display',
        });
        const thumbEnc = vaultEncryptionService.encryptSingleBlock(processed.thumb.buffer, {
          userId,
          mediaId,
          variant: 'thumb',
        });

        await fs.writeFile(path.join(mediaDir, 'master.webp.enc'), masterEnc);
        await fs.writeFile(path.join(mediaDir, 'display.webp.enc'), displayEnc);
        await fs.writeFile(path.join(mediaDir, 'thumb.webp.enc'), thumbEnc);

        const variantsJson = {
          master: { width: processed.master.width, height: processed.master.height, size: processed.master.sizeBytes, dpi: 300 },
          display: { width: processed.display.width, height: processed.display.height, size: processed.display.sizeBytes },
          thumb: { width: processed.thumb.width, height: processed.thumb.height, size: processed.thumb.sizeBytes },
          isHeic,
          originalFormat: isHeic ? 'heic' : (rawExt.replace('.', '') || 'jpeg'),
        };

        // Processar vídeo companheiro de Apple Live Photo se enviado
        const liveVideoFile = req.files?.livePhotoVideo?.[0] || req.files?.live_video?.[0];
        let isLivePhoto = false;

        if (liveVideoFile) {
          const tempLiveInput = path.join(os.tmpdir(), `live-in-${Date.now()}-${liveVideoFile.originalname || 'clip.mov'}`);
          const tempLiveMp4 = path.join(os.tmpdir(), `live-out-${Date.now()}.mp4`);
          const tempLivePoster = path.join(os.tmpdir(), `live-poster-${Date.now()}.webp`);
          try {
            await fs.writeFile(tempLiveInput, liveVideoFile.buffer);
            await videoAudioProcessorService.processVideo(tempLiveInput, tempLiveMp4, tempLivePoster);
            const encLivePath = path.join(mediaDir, 'live_video.mp4.enc');
            await vaultEncryptionService.encryptChunkedFile(tempLiveMp4, encLivePath, { userId, mediaId });
            isLivePhoto = true;
            variantsJson.isLivePhoto = true;
            variantsJson.liveVideoUrl = `/api/vault/media/${mediaId}/live-video`;
          } catch (liveErr) {
            console.warn('[vaultMedia] Falha ao processar vídeo da Live Photo:', liveErr.message);
          } finally {
            await fs.unlink(tempLiveInput).catch(() => {});
            await fs.unlink(tempLiveMp4).catch(() => {});
            await fs.unlink(tempLivePoster).catch(() => {});
          }
        }

        const mediaUrl = `/api/vault/media/${mediaId}`;

        const [result] = await pool.query(
          `INSERT INTO memories (
            capsule_id, author_id, type, title, content, media_url,
            storage_key, mime_type, file_size_bytes, source, is_encrypted,
            encryption_mode, variants_json, dpi, occurred_at, created_at, updated_at
          ) VALUES (?, ?, 'IMAGE', ?, ?, ?, ?, 'image/webp', ?, 'UPLOAD', 1, 'SINGLE_BLOCK_GCM', ?, 300, NOW(3), NOW(3), NOW(3))`,
          [
            capsuleId,
            userId,
            title,
            description,
            mediaUrl,
            `vault/${userId}/${mediaId}`,
            processed.master.sizeBytes,
            JSON.stringify(variantsJson),
          ]
        );

        return res.json({
          id: result.insertId,
          mediaId,
          type: 'IMAGE',
          mimeType: 'image/webp',
          isLivePhoto,
          liveVideoUrl: isLivePhoto ? `${mediaUrl}/live-video` : null,
          mediaUrl,
          displayUrl: `${mediaUrl}?variant=display`,
          thumbUrl: `${mediaUrl}?variant=thumb`,
          masterUrl: `${mediaUrl}?variant=master`,
          variants: variantsJson,
        });
      }

      // -------------------------------------------------------------------
      // CASO B: VÍDEO (MP4 H.264 + FastStart + Poster WebP + Chunked AEAD)
      // -------------------------------------------------------------------
      if (mime.startsWith('video/')) {
        const tempInput = path.join(os.tmpdir(), `input-${Date.now()}-${file.originalname}`);
        const tempMp4 = path.join(os.tmpdir(), `transcoded-${Date.now()}.mp4`);
        const tempPoster = path.join(os.tmpdir(), `poster-${Date.now()}.webp`);

        try {
          await fs.writeFile(tempInput, file.buffer);
          const videoMeta = await videoAudioProcessorService.processVideo(tempInput, tempMp4, tempPoster);

          // Criptografa vídeo com Chunked AEAD (blocos de 64 KB)
          const encVideoPath = path.join(mediaDir, 'video.mp4.enc');
          await vaultEncryptionService.encryptChunkedFile(tempMp4, encVideoPath, { userId, mediaId });

          // Criptografa pôster com AES-256-GCM
          const posterRaw = await fs.readFile(tempPoster);
          const encPoster = vaultEncryptionService.encryptSingleBlock(posterRaw, {
            userId,
            mediaId,
            variant: 'poster',
          });
          await fs.writeFile(path.join(mediaDir, 'poster.webp.enc'), encPoster);

          const stat = await fs.stat(tempMp4);
          const mediaUrl = `/api/vault/media/${mediaId}/stream`;

          const [result] = await pool.query(
            `INSERT INTO memories (
              capsule_id, author_id, type, title, content, media_url,
              storage_key, mime_type, file_size_bytes, source, is_encrypted,
              encryption_mode, media_duration_seconds, chunk_size_bytes,
              occurred_at, created_at, updated_at
            ) VALUES (?, ?, 'VIDEO', ?, ?, ?, ?, 'video/mp4', ?, 'UPLOAD', 1, 'CHUNKED_AEAD', ?, 65536, NOW(3), NOW(3), NOW(3))`,
            [
              capsuleId,
              userId,
              title,
              description,
              mediaUrl,
              `vault/${userId}/${mediaId}`,
              stat.size,
              videoMeta.durationSeconds,
            ]
          );

          return res.json({
            id: result.insertId,
            mediaId,
            type: 'VIDEO',
            mimeType: 'video/mp4',
            mediaUrl,
            streamUrl: mediaUrl,
            posterUrl: `/api/vault/media/${mediaId}/poster`,
            durationSeconds: videoMeta.durationSeconds,
            resolution: `${videoMeta.width}x${videoMeta.height}`,
          });
        } finally {
          await fs.unlink(tempInput).catch(() => {});
          await fs.unlink(tempMp4).catch(() => {});
          await fs.unlink(tempPoster).catch(() => {});
        }
      }

      // -------------------------------------------------------------------
      // CASO C: ÁUDIO (Opus/AAC M4A + Waveform Peaks + Chunked AEAD)
      // -------------------------------------------------------------------
      if (mime.startsWith('audio/')) {
        const tempInput = path.join(os.tmpdir(), `input-${Date.now()}-${file.originalname}`);
        const tempM4a = path.join(os.tmpdir(), `transcoded-${Date.now()}.m4a`);

        try {
          await fs.writeFile(tempInput, file.buffer);
          const audioMeta = await videoAudioProcessorService.processAudio(tempInput, tempM4a);

          const encAudioPath = path.join(mediaDir, 'audio.m4a.enc');
          await vaultEncryptionService.encryptChunkedFile(tempM4a, encAudioPath, { userId, mediaId });

          const stat = await fs.stat(tempM4a);
          const mediaUrl = `/api/vault/media/${mediaId}/stream`;

          const [result] = await pool.query(
            `INSERT INTO memories (
              capsule_id, author_id, type, title, content, media_url,
              storage_key, mime_type, file_size_bytes, source, is_encrypted,
              encryption_mode, media_duration_seconds, waveform_peaks, chunk_size_bytes,
              occurred_at, created_at, updated_at
            ) VALUES (?, ?, 'AUDIO', ?, ?, ?, ?, 'audio/mp4', ?, 'UPLOAD', 1, 'CHUNKED_AEAD', ?, ?, 65536, NOW(3), NOW(3), NOW(3))`,
            [
              capsuleId,
              userId,
              title,
              description,
              mediaUrl,
              `vault/${userId}/${mediaId}`,
              stat.size,
              audioMeta.durationSeconds,
              JSON.stringify(audioMeta.waveformPeaks),
            ]
          );

          return res.json({
            id: result.insertId,
            mediaId,
            type: 'AUDIO',
            mimeType: 'audio/mp4',
            mediaUrl,
            streamUrl: mediaUrl,
            waveformUrl: `/api/vault/media/${mediaId}/waveform`,
            durationSeconds: audioMeta.durationSeconds,
            waveformPeaks: audioMeta.waveformPeaks,
          });
        } finally {
          await fs.unlink(tempInput).catch(() => {});
          await fs.unlink(tempM4a).catch(() => {});
        }
      }

      return res.status(400).json({ detail: 'Tipo de mídia não suportado. Envie imagem, vídeo ou áudio.' });
    } catch (err) {
      return next(err);
    }
  }
);

// =========================================================================
// 2. GET /vault/media/:id — Descriptografia e Streaming de Imagens WebP
// =========================================================================
router.get('/vault/media/:id', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    const variant = req.query.variant || 'display'; // 'thumb' | 'display' | 'master'
    const safeVariant = ['thumb', 'display', 'master'].includes(variant) ? variant : 'display';

    // Localiza o arquivo .enc no cofre isolado do usuário
    const mediaId = path.basename(memory.storage_key);
    const encPath = path.join(VAULT_DIR, memory.author_id, mediaId, `${safeVariant}.webp.enc`);

    let encBuffer;
    try {
      encBuffer = await fs.readFile(encPath);
    } catch {
      // Fallback para master se a variante específica não existir
      encBuffer = await fs.readFile(path.join(VAULT_DIR, memory.author_id, mediaId, 'master.webp.enc'));
    }

    const decrypted = vaultEncryptionService.decryptSingleBlock(encBuffer, {
      userId: memory.author_id,
      mediaId,
      variant: safeVariant,
    });

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': decrypted.length,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });

    return res.end(decrypted);
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// 3. GET /vault/media/:id/stream — Streaming Chunked com HTTP 206 Range
// =========================================================================
router.get('/vault/media/:id/stream', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    const mediaId = path.basename(memory.storage_key);
    const isVideo = memory.type === 'VIDEO';
    const encFileName = isVideo ? 'video.mp4.enc' : 'audio.m4a.enc';
    const encPath = path.join(VAULT_DIR, memory.author_id, mediaId, encFileName);
    const mimeType = isVideo ? 'video/mp4' : 'audio/mp4';

    const header = await vaultEncryptionService.readChunkedHeader(encPath);
    const totalBytes = header.totalBytes;
    const rangeHeader = req.headers.range;

    res.set({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });

    if (rangeHeader) {
      // Requisição Range (ex: "bytes=1048576-2097152")
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalBytes - 1;

      const safeEnd = Math.min(end, totalBytes - 1);
      const rangeResult = await vaultEncryptionService.decryptChunkedRange(encPath, start, safeEnd, {
        userId: memory.author_id,
        mediaId,
      });

      res.status(206).set({
        'Content-Range': `bytes ${start}-${safeEnd}/${totalBytes}`,
        'Content-Length': rangeResult.buffer.length,
        'Content-Type': mimeType,
      });

      return res.end(rangeResult.buffer);
    } else {
      // Inicial: Envia primeiros 128 KB para iniciar buffer imediato
      const initialChunk = await vaultEncryptionService.decryptChunkedRange(encPath, 0, Math.min(131072, totalBytes - 1), {
        userId: memory.author_id,
        mediaId,
      });

      res.set({
        'Content-Type': mimeType,
        'Content-Length': totalBytes,
      });

      return res.end(initialChunk.buffer);
    }
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// 4. GET /vault/media/:id/poster — Pôster WebP de Vídeo Decifrado
// =========================================================================
router.get('/vault/media/:id/poster', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    const mediaId = path.basename(memory.storage_key);
    const posterEncPath = path.join(VAULT_DIR, memory.author_id, mediaId, 'poster.webp.enc');

    const encBuffer = await fs.readFile(posterEncPath);
    const decrypted = vaultEncryptionService.decryptSingleBlock(encBuffer, {
      userId: memory.author_id,
      mediaId,
      variant: 'poster',
    });

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': decrypted.length,
      'Cache-Control': 'private, no-store, max-age=0',
    });

    return res.end(decrypted);
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// 5. GET /vault/media/:id/waveform — Vetor de Picos da Onda Sonora
// =========================================================================
router.get('/vault/media/:id/waveform', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    let peaks = memory.waveform_peaks;
    if (typeof peaks === 'string') {
      try {
        peaks = JSON.parse(peaks);
      } catch {}
    }

    return res.json({
      waveformPeaks: Array.isArray(peaks) ? peaks : new Array(100).fill(0.2),
      durationSeconds: memory.media_duration_seconds || 0,
    });
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// 6. GET /vault/media/:id/live-video — Streaming de Vídeo de Apple Live Photos (HTTP 206)
// =========================================================================
router.get('/vault/media/:id/live-video', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    const mediaId = path.basename(memory.storage_key);
    const encPath = path.join(VAULT_DIR, memory.author_id, mediaId, 'live_video.mp4.enc');

    const header = await vaultEncryptionService.readChunkedHeader(encPath);
    const totalBytes = header.totalBytes;
    const rangeHeader = req.headers.range;

    res.set({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalBytes - 1;

      const safeEnd = Math.min(end, totalBytes - 1);
      const rangeResult = await vaultEncryptionService.decryptChunkedRange(encPath, start, safeEnd, {
        userId: memory.author_id,
        mediaId,
      });

      res.status(206).set({
        'Content-Range': `bytes ${start}-${safeEnd}/${totalBytes}`,
        'Content-Length': rangeResult.buffer.length,
        'Content-Type': 'video/mp4',
      });

      return res.end(rangeResult.buffer);
    } else {
      const initialChunk = await vaultEncryptionService.decryptChunkedRange(encPath, 0, Math.min(131072, totalBytes - 1), {
        userId: memory.author_id,
        mediaId,
      });

      res.set({
        'Content-Type': 'video/mp4',
        'Content-Length': totalBytes,
      });

      return res.end(initialChunk.buffer);
    }
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// 7. GET /vault/media/:id/export — Exportação Fine-Art para Impressão (300 DPI)
// =========================================================================
router.get('/vault/media/:id/export', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    const mediaId = path.basename(memory.storage_key);
    const format = req.query.format || 'tiff'; // 'tiff' | 'png' | 'webp'

    const encMasterPath = path.join(VAULT_DIR, memory.author_id, mediaId, 'master.webp.enc');
    const encBuffer = await fs.readFile(encMasterPath);
    const masterWebp = vaultEncryptionService.decryptSingleBlock(encBuffer, {
      userId: memory.author_id,
      mediaId,
      variant: 'master',
    });

    const exported = await imageProcessorService.exportForPrint(masterWebp, {
      format,
      dpi: 300,
      baseFilename: `ethernity-${memory.title ? memory.title.replace(/\s+/g, '-') : 'memoria'}`,
    });

    res.set({
      'Content-Type': exported.mimeType,
      'Content-Length': exported.buffer.length,
      'Content-Disposition': `attachment; filename="${exported.filename}"`,
      'Cache-Control': 'private, no-store',
    });

    return res.end(exported.buffer);
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// 7. DELETE /vault/media/:id — Expurgo Criptográfico Definitivo (Anti-Data Recovery)
// =========================================================================
router.delete('/vault/media/:id', requireAuth, async (req, res, next) => {
  try {
    const memory = await getAuthorizedMemory(req.params.id, req.user);
    const userId = req.user.id || req.user.sub;

    if (memory.author_id !== userId) {
      return res.status(403).json({ detail: 'Apenas o autor pode expurgar esta memória do cofre.' });
    }

    const mediaId = path.basename(memory.storage_key);
    const mediaDir = path.join(VAULT_DIR, userId, mediaId);

    // Crypto-shredding seguro de todos os arquivos criptografados em disco
    try {
      const files = await fs.readdir(mediaDir);
      for (const f of files) {
        const fullPath = path.join(mediaDir, f);
        const shredded = await vaultEncryptionService.cryptoShredFile(fullPath);
        if (!shredded) {
          await fs.unlink(fullPath).catch(() => {});
        }
      }
      await fs.rm(mediaDir, { recursive: true, force: true }).catch(() => {});
    } catch {}

    // Expurgo definitivo da tabela memories
    await pool.query('DELETE FROM memories WHERE id = ? AND author_id = ?', [memory.id, userId]);

    return res.json({
      success: true,
      message: 'Memória expurgada com sucesso e destruída criptograficamente.',
      id: memory.id,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
