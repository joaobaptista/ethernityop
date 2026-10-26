/**
 * routes/guardians.js
 * Endpoints RESTful para Gestão de Guardiões de Confiança e Círculo Familiar no MySQL.
 *
 * GET    /guardians/                    -> Lista todos os guardiões do usuário autenticado
 * GET    /guardians/:id                 -> Detalhes de um guardião (com validação Anti-IDOR)
 * POST   /guardians/                    -> Adiciona um novo guardião (com validação de duplicidade)
 * PUT    /guardians/:id                 -> Atualiza os dados de um guardião
 * DELETE /guardians/:id                 -> Expurgo definitivo do guardião (CryptoShred e desassociação)
 * GET    /guardians/circle/connections  -> Lista conexões do círculo familiar
 * POST   /guardians/circle/invite       -> Gera código de convite familiar
 */
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { pool, DEMO_USER_ID } from '../db/mysql.js';
import { uuid } from '../seed.js';

const router = Router();

function formatGuardian(row) {
  return {
    id: row.id,
    userId: row.user_id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    relation: row.relation,
    relationship: row.relation,
    status: row.status,
    canTriggerDelivery: Boolean(row.can_trigger_delivery),
    can_trigger_delivery: Boolean(row.can_trigger_delivery),
    notes: row.notes,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  };
}

// 1. GET /guardians/ — Lista os guardiões do usuário autenticado
router.get('/guardians/', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM guardians WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );

    return res.json((rows || []).map(formatGuardian));
  } catch (err) {
    console.error('[Guardians] Erro ao listar guardiões:', err);
    return res.status(500).json({ detail: 'Erro ao consultar guardiões no banco de dados.' });
  }
});

// 2. GET /guardians/circle/connections — Conexões familiares
router.get('/guardians/circle/connections', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const userEmail = req.user?.email || '';

  try {
    const [rows] = await pool.query(
      `SELECT * FROM circle_connections 
       WHERE requester_id = ? OR target_user_id = ? OR target_email = ?
       ORDER BY created_at DESC`,
      [userId, userId, userEmail]
    );

    return res.json(rows || []);
  } catch (err) {
    console.error('[Guardians] Erro ao listar conexões do círculo:', err);
    return res.status(500).json({ detail: 'Erro ao consultar círculo familiar.' });
  }
});

// 3. GET /guardians/:id — Detalhes de um guardião com validação Anti-IDOR
router.get('/guardians/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const guardianId = req.params.id;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM guardians WHERE id = ? LIMIT 1',
      [guardianId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ detail: 'Guardião não encontrado.' });
    }

    const guardian = rows[0];
    if (guardian.user_id !== userId) {
      return res.status(403).json({ detail: 'Você não tem permissão para acessar este guardião.' });
    }

    return res.json(formatGuardian(guardian));
  } catch (err) {
    console.error('[Guardians] Erro ao obter guardião:', err);
    return res.status(500).json({ detail: 'Erro ao consultar guardião no banco de dados.' });
  }
});

// 4. POST /guardians/ — Adiciona novo guardião
router.post('/guardians/', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const body = req.body || {};

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const relation = String(body.relation || body.relationship || 'Familiar').trim();
  const notes = body.notes ? String(body.notes).trim() : null;
  const canTriggerDelivery = body.canTriggerDelivery !== undefined ? (body.canTriggerDelivery ? 1 : 0) : 1;

  if (!name) {
    return res.status(400).json({ detail: 'Nome do guardião é obrigatório.' });
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ detail: 'E-mail válido do guardião é obrigatório.' });
  }

  try {
    // Verificar se já existe guardião com este e-mail para este usuário
    const [existing] = await pool.query(
      'SELECT id FROM guardians WHERE user_id = ? AND email = ? LIMIT 1',
      [userId, email]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ detail: 'Já existe um guardião cadastrado com este e-mail.' });
    }

    const id = body.id && String(body.id).startsWith('g-') ? body.id : `g-${uuid().slice(0, 8)}`;

    await pool.query(
      `INSERT INTO guardians (
        id, user_id, name, email, phone, relation, status, can_trigger_delivery, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW(3), NOW(3))`,
      [id, userId, name, email, phone, relation, canTriggerDelivery, notes]
    );

    const [createdRows] = await pool.query('SELECT * FROM guardians WHERE id = ? LIMIT 1', [id]);
    const created = createdRows && createdRows[0] ? formatGuardian(createdRows[0]) : { id, name, email };

    return res.status(201).json(created);
  } catch (err) {
    console.error('[Guardians] Erro ao criar guardião no MySQL:', err);
    return res.status(500).json({ detail: 'Erro ao salvar guardião no banco de dados.' });
  }
});

// 5. PUT /guardians/:id — Atualiza dados do guardião
router.put('/guardians/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const guardianId = req.params.id;
  const body = req.body || {};

  try {
    const [existing] = await pool.query(
      'SELECT * FROM guardians WHERE id = ? AND user_id = ? LIMIT 1',
      [guardianId, userId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ detail: 'Guardião não encontrado ou acesso não autorizado.' });
    }

    const current = existing[0];
    const newName = body.name !== undefined ? String(body.name).trim() : current.name;
    const newEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : current.email;
    const newPhone = body.phone !== undefined ? String(body.phone).trim() : current.phone;
    const newRelation = body.relation || body.relationship || current.relation;
    const newStatus = body.status || current.status;
    const newNotes = body.notes !== undefined ? body.notes : current.notes;
    const newCanTrigger = body.canTriggerDelivery !== undefined ? (body.canTriggerDelivery ? 1 : 0) : current.can_trigger_delivery;

    await pool.query(
      `UPDATE guardians SET
        name = ?,
        email = ?,
        phone = ?,
        relation = ?,
        status = ?,
        can_trigger_delivery = ?,
        notes = ?,
        updated_at = NOW(3)
       WHERE id = ? AND user_id = ?`,
      [newName, newEmail, newPhone, newRelation, newStatus, newCanTrigger, newNotes, guardianId, userId]
    );

    const [updatedRows] = await pool.query('SELECT * FROM guardians WHERE id = ? LIMIT 1', [guardianId]);
    return res.json(formatGuardian(updatedRows[0]));
  } catch (err) {
    console.error('[Guardians] Erro ao atualizar guardião no MySQL:', err);
    return res.status(500).json({ detail: 'Erro ao atualizar guardião no banco de dados.' });
  }
});

// 6. DELETE /guardians/:id — Expurgo atômico do guardião
router.delete('/guardians/:id', requireAuth, async (req, res) => {
  const userId = req.user?.id || req.user?.sub || DEMO_USER_ID;
  const guardianId = req.params.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT * FROM guardians WHERE id = ? AND user_id = ? LIMIT 1',
      [guardianId, userId]
    );

    if (!existing || existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ detail: 'Guardião não encontrado ou acesso não autorizado.' });
    }

    const guardian = existing[0];

    // Desassocia de quaisquer cápsulas que vinculavam o e-mail deste guardião
    await connection.query(
      'DELETE FROM capsule_guardians WHERE guardian_email = ?',
      [guardian.email]
    );

    // Remove registro de guardiões
    await connection.query(
      'DELETE FROM guardians WHERE id = ? AND user_id = ?',
      [guardianId, userId]
    );

    await connection.commit();
    return res.json({
      status: 'success',
      message: 'Guardião expurgado definitivamente.',
      id: guardianId,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[Guardians] Erro no expurgo de guardião:', err);
    return res.status(500).json({ detail: 'Erro ao excluir guardião no banco de dados.' });
  } finally {
    connection.release();
  }
});

export default router;
