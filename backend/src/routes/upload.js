/**
 * routes/upload.js
 * POST /upload/ — accepts a single image (multipart), saves it under
 * uploads/<userId>/ and returns { filename, url }.
 * Mirrors the backend's upload router (JWT required, image-only, 2MB cap).
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { requireAuth } from '../auth.js';
import config from '../config.js';
import { uuid } from '../seed.js';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: config.maxUploadBytes } });

router.post(
  '/upload/',
  requireAuth,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'media', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const file = req.files?.file?.[0] || req.files?.photo?.[0] || req.files?.media?.[0];
      if (!file) {
        return res.status(422).json({ detail: 'file, photo or media is required' });
      }

      // Validate file type (mirrors backend allowed_types).
      if (
        config.allowedUploadTypes &&
        config.allowedUploadTypes.length > 0 &&
        !config.allowedUploadTypes.includes(file.mimetype)
      ) {
        return res.status(400).json({ detail: 'File type not allowed' });
      }

      // Max size check
      if (file.size > config.maxUploadBytes) {
        return res.status(400).json({ detail: 'File too large' });
      }

      // Save under user-specific directory.
      const rawExt = path.extname(file.originalname || '.bin').toLowerCase();
      let safeExt = /^\.[a-z0-9]+$/.test(rawExt) ? rawExt : '.bin';
      let fileBuffer = file.buffer;

      // Se for formato Apple HEIC/HEIF, transcodifica para WebP transparente
      if (rawExt === '.heic' || rawExt === '.heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        try {
          fileBuffer = await sharp(file.buffer).rotate().webp({ quality: 90 }).toBuffer();
          safeExt = '.webp';
        } catch (e) {
          console.warn('[Upload] Falha ao converter HEIC para WebP, salvando binário original:', e.message);
        }
      }

      const filename = `${uuid()}${safeExt}`;
      const userDir = path.join(config.uploadFolder, req.user?.id || 'public');
      fs.mkdirSync(userDir, { recursive: true });
      fs.writeFileSync(path.join(userDir, filename), fileBuffer);

      const url = `/uploads/${req.user?.id || 'public'}/${filename}`;
      return res.json({
        filename,
        url,
        photo_url: url,
        fileUrl: url,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;