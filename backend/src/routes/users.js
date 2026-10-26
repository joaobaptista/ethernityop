/**
 * routes/users.js
 * GET/PUT /profile and POST /profile/photo — mirrors the backend's users router (JWT required).
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../auth.js';
import { cacheGoogleAvatar, MIN_PASSWORD_LENGTH } from './auth.js';
import { publicUser, findUserByEmail } from '../db.js';
import { pool, DEMO_USER_ID } from '../db/mysql.js';
import config from '../config.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.uploadFolder, { recursive: true });
    cb(null, config.uploadFolder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    const userId = req.user?.id || DEMO_USER_ID;
    const safeName = `avatar-${userId}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos para a foto de perfil.'));
    }
  },
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || DEMO_USER_ID;
    const userEmail = req.user?.email || 'demo@ethernity.com';
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, avatar_url, plan_id, is_admin FROM users WHERE id = ? OR email = ? LIMIT 1',
      [userId, userEmail]
    );
    if (rows && rows.length > 0) {
      const dbUser = rows[0];
      req.user.id = dbUser.id || req.user.id;
      req.user.name = dbUser.name || req.user.name;
      req.user.email = dbUser.email || req.user.email;
      if (dbUser.phone) req.user.phone = dbUser.phone;
      if (dbUser.is_admin !== undefined) req.user.is_admin = dbUser.is_admin ? 1 : 0;
      if (dbUser.avatar_url) {
        let finalAvatar = dbUser.avatar_url;
        if (typeof finalAvatar === 'string' && finalAvatar.startsWith('http') && finalAvatar.includes('googleusercontent.com')) {
          try {
            finalAvatar = await cacheGoogleAvatar(finalAvatar, dbUser.id || userId);
            await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [finalAvatar, dbUser.id || userId]);
          } catch (e) {
            console.warn('[Users] Erro ao cachear avatar do Google em GET /profile:', e.message);
          }
        }
        req.user.photo_url = finalAvatar;
        req.user.avatar_url = finalAvatar;
      }
    }
  } catch (err) {
    console.warn('[MySQL] Erro ao sincronizar profile com banco:', err.message);
  }
  return res.json(publicUser(req.user));
});

router.put('/profile', requireAuth, async (req, res) => {
  const {
    email,
    name,
    phone,
    password,
    photo_url,
    avatar_url,
  } = req.body || {};

  const finalPhoto = photo_url || avatar_url;
  const newEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
  const newPassword = typeof password === 'string' && password.trim() ? password.trim() : null;

  if (!req.user?.id) {
    return res.status(401).json({ detail: 'Could not validate credentials' });
  }

  if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(422).json({ detail: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  // E-mail é a identidade do login: não pode colidir com outra conta.
  if (newEmail && newEmail !== String(req.user.email || '').toLowerCase()) {
    if (findUserByEmail(newEmail)) {
      return res.status(409).json({ detail: 'Este e-mail já está em uso por outra conta.' });
    }
    try {
      const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [newEmail, req.user.id]);
      if (taken && taken.length > 0) {
        return res.status(409).json({ detail: 'Este e-mail já está em uso por outra conta.' });
      }
    } catch (err) {
      console.error('[MySQL] Erro ao validar e-mail no perfil:', err.message);
      return res.status(503).json({ detail: 'Não foi possível atualizar o perfil agora.' });
    }
  }

  const passwordHash = newPassword ? await bcrypt.hash(newPassword, 10) : null;

  // Persiste primeiro (somente a linha do próprio usuário) e só então atualiza a memória.
  try {
    await pool.query(
      `UPDATE users 
       SET name = COALESCE(?, name), 
           email = COALESCE(?, email), 
           phone = COALESCE(?, phone), 
           password_hash = COALESCE(?, password_hash),
           avatar_url = COALESCE(?, avatar_url), 
           updated_at = NOW(3) 
       WHERE id = ?`,
      [name || null, newEmail, phone || null, passwordHash, finalPhoto || null, req.user.id]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ detail: 'Este e-mail já está em uso por outra conta.' });
    }
    console.error('[MySQL] Erro ao persistir perfil no banco:', err.message);
    return res.status(503).json({ detail: 'Não foi possível atualizar o perfil agora.' });
  }

  if (newEmail) req.user.email = newEmail;
  if (name !== undefined) req.user.name = name;
  if (phone !== undefined) req.user.phone = phone;
  if (passwordHash) {
    req.user.password_hash = passwordHash;
    delete req.user.password;
  }
  if (finalPhoto !== undefined) {
    req.user.photo_url = finalPhoto;
    req.user.avatar_url = finalPhoto;
  }

  return res.json(publicUser(req.user));
});

// POST /profile/photo — Upload de foto de avatar do usuário (aceita campo 'photo' ou 'file')
router.post(
  '/profile/photo',
  requireAuth,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const file = req.files?.photo?.[0] || req.files?.file?.[0];
      if (!file) {
        return res.status(400).json({ detail: 'Nenhuma foto enviada no campo "photo" ou "file".' });
      }

      const fileUrl = `/uploads/${file.filename}`;
      req.user.photo_url = fileUrl;
      req.user.avatar_url = fileUrl;

      // Sincronizar com MySQL
      try {
        await pool.query(
          `UPDATE users SET avatar_url = ?, updated_at = NOW(3) WHERE id = ?`,
          [fileUrl, req.user.id]
        );
      } catch (err) {
        console.warn('[MySQL] Erro ao atualizar avatar no banco:', err.message);
      }

      return res.json({
        success: true,
        photo_url: fileUrl,
        avatar_url: fileUrl,
        url: fileUrl,
        filename: file.filename,
        user: publicUser(req.user),
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;