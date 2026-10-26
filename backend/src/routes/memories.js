/**
 * routes/memories.js
 * Endpoints RESTful para Gerenciamento de Memórias e Timeline no MySQL.
 *
 * GET    /memories/      -> Lista todas as memórias do usuário autenticado (com filtros)
 * GET    /memories/:id   -> Detalhes de uma memória específica (Anti-IDOR)
 * POST   /memories/      -> Cria uma nova memória com persistência no MySQL
 * PUT    /memories/:id   -> Atualiza dados/título/história de uma memória
 * DELETE /memories/:id   -> Expurgo definitivo da memória (CryptoShred)
 */
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { pool, DEMO_USER_ID } from '../db/mysql.js';

const router = Router();

function formatMemory(row) {
  return {
    id: String(row.id),
    capsuleId: row.capsule_id,
    capsule_id: row.capsule_id,
    authorId: row.author_id,
    author_id: row.author_id,
    type: row.type || 'IMAGE',
    title: row.title || '',
    content: row.content || '',
    story: row.content || '',
    mediaUrl: row.media_url,
    media_url: row.media_url,
    img: row.media_url,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    isEncrypted: Boolean(row.is_encrypted),
    encryptionMode: row.encryption_mode,
    variants: typeof row.variants_json === 'string' ? JSON.parse(row.variants_json || '{}') : row.variants_json || {},
    source: row.source || 'UPLOAD',
    occurredAt: row.occurred_at,
    occurred_at: row.occurred_at,
    dateLabel: row.occurred_at
      ? new Date(row.occurred_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : 'Recente',
    year: row.occurred_at ? new Date(row.occurred_at).getFullYear() : new Date().getFullYear(),
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  };
}

// 1. GET /memories/ — Lista memórias do usuário com suporte a filtros
router.get('/memories/', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const { capsule_id, type, source } = req.query;

  try {
    let sql = 'SELECT * FROM memories WHERE author_id = ?';
    const params = [userId];

    if (capsule_id) {
      sql += ' AND capsule_id = ?';
      params.push(capsule_id);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(String(type).toUpperCase());
    }
    if (source) {
      sql += ' AND source = ?';
      params.push(String(source).toUpperCase());
    }

    sql += ' ORDER BY occurred_at DESC, created_at DESC';

    const [rows] = await pool.query(sql, params);
    return res.json((rows || []).map(formatMemory));
  } catch (err) {
    console.error('[Memories] Erro ao listar memórias no MySQL:', err);
    return res.status(500).json({ detail: 'Erro ao consultar memórias no banco de dados.' });
  }
});

// 2. GET /memories/:id — Detalhes com validação Anti-IDOR
router.get('/memories/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const memoryId = req.params.id;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM memories WHERE id = ? LIMIT 1',
      [memoryId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ detail: 'Memória não encontrada.' });
    }

    const memory = rows[0];

    // Validação de acesso do autor
    if (memory.author_id !== userId) {
      // Verifica se é guardião autorizado
      const [guardianCheck] = await pool.query(
        `SELECT c.id FROM capsules c
         JOIN capsule_guardians cg ON cg.capsule_id = c.id
         WHERE c.id = ? AND cg.guardian_email = ? AND c.status = 'UNLOCKED'`,
        [memory.capsule_id, req.user?.email]
      ).catch(() => [[]]);

      if (!guardianCheck || guardianCheck.length === 0) {
        return res.status(403).json({ detail: 'Você não tem permissão para acessar esta memória.' });
      }
    }

    return res.json(formatMemory(memory));
  } catch (err) {
    console.error('[Memories] Erro ao obter memória:', err);
    return res.status(500).json({ detail: 'Erro ao consultar memória no banco de dados.' });
  }
});

// 3. POST /memories/ — Cria nova memória no banco de dados MySQL
router.post('/memories/', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const body = req.body || {};

  const capsuleId = body.capsuleId || body.capsule_id || 'general';
  const type = String(body.type || 'IMAGE').toUpperCase();
  const title = body.title ? String(body.title).trim() : null;
  const content = body.content || body.story ? String(body.content || body.story).trim() : null;
  const mediaUrl = body.mediaUrl || body.media_url || body.img || null;
  const occurredAt = body.occurredAt || body.occurred_at ? new Date(body.occurredAt || body.occurred_at) : new Date();
  const source = body.source ? String(body.source).toUpperCase() : 'UPLOAD';

  if (!mediaUrl && !content && !title) {
    return res.status(400).json({ detail: 'Memória deve possuir título, conteúdo ou arquivo de mídia.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO memories (
        capsule_id, author_id, type, title, content, media_url, 
        is_encrypted, source, occurred_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW(3), NOW(3))`,
      [capsuleId, userId, type, title, content, mediaUrl, source, occurredAt]
    );

    const insertedId = result.insertId;
    const [rows] = await pool.query('SELECT * FROM memories WHERE id = ? LIMIT 1', [insertedId]);
    return res.status(201).json(formatMemory(rows[0]));
  } catch (err) {
    console.error('[Memories] Erro ao inserir memória no MySQL:', err);
    return res.status(500).json({ detail: 'Erro ao salvar memória no banco de dados.' });
  }
});

// 4. PUT /memories/:id — Atualiza dados da memória
router.put('/memories/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const memoryId = req.params.id;
  const body = req.body || {};

  try {
    const [existing] = await pool.query(
      'SELECT * FROM memories WHERE id = ? AND author_id = ? LIMIT 1',
      [memoryId, userId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ detail: 'Memória não encontrada ou acesso não autorizado.' });
    }

    const current = existing[0];
    const newTitle = body.title !== undefined ? body.title : current.title;
    const newContent = body.content !== undefined ? body.content : (body.story !== undefined ? body.story : current.content);
    const newOccurredAt = body.occurredAt || body.occurred_at ? new Date(body.occurredAt || body.occurred_at) : current.occurred_at;

    await pool.query(
      `UPDATE memories SET
        title = ?,
        content = ?,
        occurred_at = ?,
        updated_at = NOW(3)
       WHERE id = ? AND author_id = ?`,
      [newTitle, newContent, newOccurredAt, memoryId, userId]
    );

    const [updatedRows] = await pool.query('SELECT * FROM memories WHERE id = ? LIMIT 1', [memoryId]);
    return res.json(formatMemory(updatedRows[0]));
  } catch (err) {
    console.error('[Memories] Erro ao atualizar memória:', err);
    return res.status(500).json({ detail: 'Erro ao atualizar memória no banco de dados.' });
  }
});

// 5. DELETE /memories/:id — Expurgo da memória
router.delete('/memories/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const memoryId = req.params.id;

  try {
    const [existing] = await pool.query(
      'SELECT * FROM memories WHERE id = ? AND author_id = ? LIMIT 1',
      [memoryId, userId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ detail: 'Memória não encontrada ou acesso não autorizado.' });
    }

    await pool.query('DELETE FROM memories WHERE id = ? AND author_id = ?', [memoryId, userId]);

    return res.json({
      status: 'success',
      message: 'Memória expurgada com sucesso.',
      id: memoryId,
    });
  } catch (err) {
    console.error('[Memories] Erro ao expurgar memória:', err);
    return res.status(500).json({ detail: 'Erro ao excluir memória no banco de dados.' });
  }
});

export default router;
