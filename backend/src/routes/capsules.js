/**
 * routes/capsules.js
 * Endpoints completos para gerenciamento de Cápsulas do Tempo no MySQL.
 *
 * GET    /capsules/      -> Lista todas as cápsulas do usuário autenticado
 * GET    /capsules/:id   -> Detalhes de uma cápsula específica (com guardiões e mídias)
 * POST   /capsules/      -> Cria uma nova cápsula com transação atômica
 * PUT    /capsules/:id   -> Atualiza metadados, gatilho ou status da cápsula
 * DELETE /capsules/:id   -> Expurgo definitivo da cápsula e mídias vinculadas (CryptoShred)
 */
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { pool, DEMO_USER_ID } from '../db/mysql.js';
import { uuid } from '../seed.js';

const router = Router();

/**
 * Normaliza o objeto de cápsula retornado do MySQL para um formato universal
 * consumível tanto pela Web (React) quanto pelo Mobile App (React Native).
 */
function formatCapsule(row, guardians = [], photosCount = 0) {
  let recipientData = row.recipient;
  if (typeof recipientData === 'string') {
    try {
      recipientData = JSON.parse(recipientData);
    } catch {
      recipientData = { name: recipientData };
    }
  }

  const recipientName =
    typeof recipientData === 'object' && recipientData !== null
      ? recipientData.name || recipientData.recipient || 'Destinatário Especial'
      : String(recipientData || 'Destinatário Especial');

  const recipientAvatar =
    typeof recipientData === 'object' && recipientData !== null
      ? recipientData.avatar || recipientData.recipientAvatar || null
      : null;

  return {
    id: row.id,
    userId: row.user_id || row.author_id,
    user_id: row.user_id || row.author_id,
    title: row.title,
    recipient: recipientName,
    recipientData: recipientData || { name: recipientName },
    avatar: recipientAvatar,
    recipientAvatar,
    deliveryType: row.delivery_type || 'date',
    delivery_type: row.delivery_type || 'date',
    scheduledDate: row.scheduled_date || row.unlock_at || null,
    scheduled_date: row.scheduled_date || row.unlock_at || null,
    triggerLabel:
      row.delivery_type === 'posthumous'
        ? 'Liberação Póstuma (Guardião Responsável)'
        : row.scheduled_date
        ? new Date(row.scheduled_date).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'Data Definida',
    emotion: row.emotion || 'love',
    status: row.status || 'LOCKED',
    statusText:
      row.status === 'UNLOCKED'
        ? 'Cápsula Desbloqueada'
        : row.status === 'ARCHIVED'
        ? 'Cápsula Arquivada'
        : row.delivery_type === 'posthumous'
        ? 'Sob Guarda do Guardião'
        : 'Bloqueada até a data',
    sealColor:
      row.emotion === 'gratitude'
        ? '#4CAF50'
        : row.emotion === 'wisdom'
        ? '#7E57C2'
        : '#F05A47',
    videoDurationSeconds: row.video_duration_seconds || 0,
    videoBlobUrl: row.video_blob_url || null,
    videoSizeMb: row.video_size_mb || null,
    isEncrypted: Boolean(row.is_encrypted !== 0),
    guardians: guardians,
    photosCount: Number(photosCount || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 1. GET /capsules/ — Lista todas as cápsulas do usuário autenticado
router.get('/capsules/', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;

  try {
    const [capsulesRows] = await pool.query(
      `SELECT * FROM capsules 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    if (!capsulesRows || capsulesRows.length === 0) {
      return res.json([]);
    }

    const capsuleIds = capsulesRows.map((c) => c.id);

    // Buscar guardiões vinculados a essas cápsulas
    const [guardiansRows] = await pool.query(
      'SELECT capsule_id, guardian_email FROM capsule_guardians WHERE capsule_id IN (?)',
      [capsuleIds]
    ).catch(() => [[]]);

    // Buscar contagem de memórias vinculadas a essas cápsulas
    const [memoriesCountRows] = await pool.query(
      'SELECT capsule_id, COUNT(*) as count FROM memories WHERE capsule_id IN (?) GROUP BY capsule_id',
      [capsuleIds]
    ).catch(() => [[]]);

    const guardiansMap = {};
    for (const g of guardiansRows || []) {
      if (!guardiansMap[g.capsule_id]) guardiansMap[g.capsule_id] = [];
      guardiansMap[g.capsule_id].push(g.guardian_email);
    }

    const countMap = {};
    for (const m of memoriesCountRows || []) {
      countMap[m.capsule_id] = m.count;
    }

    const response = capsulesRows.map((row) =>
      formatCapsule(row, guardiansMap[row.id] || [], countMap[row.id] || 0)
    );

    return res.json(response);
  } catch (err) {
    console.error('[Capsules] Erro ao listar cápsulas no MySQL:', err);
    return res.status(500).json({ detail: 'Erro ao consultar cápsulas no banco de dados.' });
  }
});

// 2. GET /capsules/:id — Detalhes de uma cápsula específica
router.get('/capsules/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const userEmail = req.user?.email;
  const capsuleId = req.params.id;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM capsules WHERE id = ? LIMIT 1',
      [capsuleId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ detail: 'Cápsula não encontrada.' });
    }

    const capsule = rows[0];

    // Validação de acesso: autor direto ou guardião com permissão
    const isOwner = capsule.user_id === userId;
    let isAuthorizedGuardian = false;

    if (!isOwner && userEmail) {
      const [gCheck] = await pool.query(
        'SELECT id FROM capsule_guardians WHERE capsule_id = ? AND guardian_email = ? LIMIT 1',
        [capsuleId, userEmail]
      ).catch(() => [[]]);
      if (gCheck && gCheck.length > 0 && capsule.status === 'UNLOCKED') {
        isAuthorizedGuardian = true;
      }
    }

    if (!isOwner && !isAuthorizedGuardian) {
      return res.status(403).json({ detail: 'Você não tem permissão para acessar esta cápsula.' });
    }

    const [guardiansRows] = await pool.query(
      'SELECT guardian_email FROM capsule_guardians WHERE capsule_id = ?',
      [capsuleId]
    ).catch(() => [[]]);

    const [memoriesRows] = await pool.query(
      `SELECT id, type, title, content, media_url, is_encrypted, mime_type, file_size_bytes, occurred_at, created_at 
       FROM memories 
       WHERE capsule_id = ? 
       ORDER BY occurred_at ASC, created_at ASC`,
      [capsuleId]
    ).catch(() => [[]]);

    const formatted = formatCapsule(
      capsule,
      (guardiansRows || []).map((g) => g.guardian_email),
      memoriesRows ? memoriesRows.length : 0
    );

    formatted.memories = memoriesRows || [];

    return res.json(formatted);
  } catch (err) {
    console.error('[Capsules] Erro ao buscar cápsula por id:', err);
    return res.status(500).json({ detail: 'Erro ao buscar detalhes da cápsula.' });
  }
});

// 3. POST /capsules/ — Cria uma nova cápsula no MySQL
router.post('/capsules/', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const body = req.body || {};

  const title = (body.title || '').trim();
  if (!title) {
    return res.status(400).json({ detail: 'O título da cápsula é obrigatório.' });
  }

  const capsuleId = body.id || `cap-${uuid().slice(0, 8)}`;
  const recipient =
    typeof body.recipient === 'object' && body.recipient !== null
      ? JSON.stringify(body.recipient)
      : JSON.stringify({ name: body.recipient || 'Destinatário Especial' });

  const deliveryType = body.deliveryType || body.delivery_type || 'date';
  const scheduledDate =
    deliveryType === 'date' && (body.scheduledDate || body.scheduled_date)
      ? new Date(body.scheduledDate || body.scheduled_date)
      : null;

  const emotion = body.emotion || 'love';
  const status = body.status || 'LOCKED';
  const videoDurationSeconds = Number(body.videoDurationSeconds || body.video_duration_seconds || 0);
  const videoBlobUrl = body.videoBlobUrl || body.video_blob_url || null;
  const videoSizeMb = body.videoSizeMb || body.video_size_mb || null;
  const isEncrypted = body.isEncrypted !== undefined ? (body.isEncrypted ? 1 : 0) : 1;
  const encryptionHash = body.encryptionHash || body.encryption_hash || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO capsules (
        id, user_id, title, recipient, delivery_type, scheduled_date,
        emotion, status, video_duration_seconds, video_blob_url,
        video_size_mb, is_encrypted, encryption_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        capsuleId,
        userId,
        title,
        recipient,
        deliveryType,
        scheduledDate,
        emotion,
        status,
        videoDurationSeconds,
        videoBlobUrl,
        videoSizeMb,
        isEncrypted,
        encryptionHash,
      ]
    );

    // Salvar guardiões vinculados se enviados
    const guardiansList = Array.isArray(body.guardians) ? body.guardians : [];
    for (const g of guardiansList) {
      const email = typeof g === 'string' ? g : g?.email;
      if (email && email.trim()) {
        const guardianRowId = `cg-${uuid().slice(0, 10)}`;
        await conn.query(
          `INSERT INTO capsule_guardians (id, capsule_id, guardian_email, created_at)
           VALUES (?, ?, ?, NOW(3))
           ON DUPLICATE KEY UPDATE guardian_email = VALUES(guardian_email)`,
          [guardianRowId, capsuleId, email.trim()]
        );
      }
    }

    // Salvar fotos/memórias vinculadas se enviadas
    const photosList = Array.isArray(body.photos || body.curatedPhotos)
      ? body.photos || body.curatedPhotos
      : [];

    for (const photo of photosList) {
      const photoId = photo.id || `mem-${uuid().slice(0, 10)}`;
      const photoUrl = photo.img || photo.media_url || photo.url;
      const photoTitle = photo.story || photo.title || 'Foto da Cápsula';
      if (photoUrl) {
        await conn.query(
          `INSERT INTO memories (
            capsule_id, author_id, type, title, content, media_url, source, occurred_at, created_at, updated_at
          ) VALUES (?, ?, 'IMAGE', ?, ?, ?, 'UPLOAD', NOW(3), NOW(3), NOW(3))`,
          [capsuleId, userId, photoTitle, photo.story || '', photoUrl]
        );
      }
    }

    await conn.commit();

    const [createdRows] = await conn.query('SELECT * FROM capsules WHERE id = ?', [capsuleId]);
    conn.release();

    const formatted = formatCapsule(
      createdRows[0],
      guardiansList.map((g) => (typeof g === 'string' ? g : g?.email)),
      photosList.length
    );

    return res.status(201).json(formatted);
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('[Capsules] Erro ao criar cápsula no MySQL:', err);
    return res.status(500).json({ detail: 'Falha ao salvar cápsula no banco de dados.' });
  }
});

// 4. PUT /capsules/:id — Atualiza cápsula existente
router.put('/capsules/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const capsuleId = req.params.id;
  const body = req.body || {};

  try {
    const [existing] = await pool.query(
      'SELECT * FROM capsules WHERE id = ? AND user_id = ? LIMIT 1',
      [capsuleId, userId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ detail: 'Cápsula não encontrada ou acesso não autorizado.' });
    }

    const current = existing[0];
    const newTitle = body.title !== undefined ? String(body.title).trim() : current.title;

    let newRecipient = current.recipient;
    if (body.recipient !== undefined) {
      newRecipient =
        typeof body.recipient === 'object' && body.recipient !== null
          ? JSON.stringify(body.recipient)
          : JSON.stringify({ name: String(body.recipient) });
    } else if (typeof newRecipient === 'object' && newRecipient !== null) {
      newRecipient = JSON.stringify(newRecipient);
    }

    const newDeliveryType = body.deliveryType || body.delivery_type || current.delivery_type;
    const newScheduledDate =
      body.scheduledDate !== undefined || body.scheduled_date !== undefined
        ? body.scheduledDate || body.scheduled_date
          ? new Date(body.scheduledDate || body.scheduled_date)
          : null
        : current.scheduled_date;

    const newEmotion = body.emotion || current.emotion;
    const newStatus = body.status || current.status;

    await pool.query(
      `UPDATE capsules SET
        title = ?,
        recipient = ?,
        delivery_type = ?,
        scheduled_date = ?,
        emotion = ?,
        status = ?,
        updated_at = NOW(3)
       WHERE id = ?`,
      [newTitle, newRecipient, newDeliveryType, newScheduledDate, newEmotion, newStatus, capsuleId]
    );

    // Se guardiões foram enviados, sincroniza
    if (Array.isArray(body.guardians)) {
      await pool.query('DELETE FROM capsule_guardians WHERE capsule_id = ?', [capsuleId]);
      for (const g of body.guardians) {
        const email = typeof g === 'string' ? g : g?.email;
        if (email && email.trim()) {
          const rowId = `cg-${uuid().slice(0, 10)}`;
          await pool.query(
            'INSERT INTO capsule_guardians (id, capsule_id, guardian_email, created_at) VALUES (?, ?, ?, NOW(3))',
            [rowId, capsuleId, email.trim()]
          );
        }
      }
    }

    const [updatedRows] = await pool.query('SELECT * FROM capsules WHERE id = ?', [capsuleId]);
    const [guardiansRows] = await pool.query(
      'SELECT guardian_email FROM capsule_guardians WHERE capsule_id = ?',
      [capsuleId]
    ).catch(() => [[]]);

    const formatted = formatCapsule(
      updatedRows[0],
      (guardiansRows || []).map((g) => g.guardian_email)
    );

    return res.json(formatted);
  } catch (err) {
    console.error('[Capsules] Erro ao atualizar cápsula no MySQL:', err);
    return res.status(500).json({ detail: 'Erro ao atualizar dados da cápsula no banco.' });
  }
});

// 5. DELETE /capsules/:id — Exclui definitivamente a cápsula e mídias vinculadas (CryptoShred)
router.delete('/capsules/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const capsuleId = req.params.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT id FROM capsules WHERE id = ? AND user_id = ? LIMIT 1',
      [capsuleId, userId]
    );

    if (!existing || existing.length === 0) {
      conn.release();
      return res.status(404).json({ detail: 'Cápsula não encontrada ou acesso não autorizado.' });
    }

    // 1. Remover guardiões associados
    await conn.query('DELETE FROM capsule_guardians WHERE capsule_id = ?', [capsuleId]);

    // 2. Remover memórias associadas
    await conn.query('DELETE FROM memories WHERE capsule_id = ?', [capsuleId]);

    // 3. Remover a própria cápsula
    await conn.query('DELETE FROM capsules WHERE id = ?', [capsuleId]);

    await conn.commit();
    conn.release();

    return res.json({
      success: true,
      message: 'Cápsula e todas as suas associações foram eliminadas definitivamente do banco de dados.',
      id: capsuleId,
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('[Capsules] Erro ao deletar cápsula no MySQL:', err);
    return res.status(500).json({ detail: 'Falha ao excluir cápsula do banco de dados.' });
  }
});

export default router;
