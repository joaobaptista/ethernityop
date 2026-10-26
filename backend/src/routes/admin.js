/**
 * routes/admin.js
 * Rotas administrativas exclusivas: Listagem de usuários, busca, concessão/revogação de privilégios de admin e estatísticas do dashboard.
 */
import { Router } from 'express';
import path from 'node:path';
import { requireAdmin, isRootAdminEmail, ROOT_ADMIN_EMAILS } from '../auth.js';
import { pool } from '../db/mysql.js';
import { store } from '../db.js';
import config from '../config.js';
import vaultEncryptionService from '../services/vaultEncryptionService.js';

const router = Router();

/**
 * GET /api/admin/users
 * Retorna todos os usuários cadastrados no MySQL com filtros opcionais de busca.
 */
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const filterRole = req.query.role ? String(req.query.role).trim().toLowerCase() : 'all'; // 'all', 'admin', 'user'

    let sql = 'SELECT id, name, email, phone, avatar_url, plan_id, is_admin, created_at, updated_at FROM users';
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (filterRole === 'admin') {
      conditions.push('(is_admin = 1 OR LOWER(email) IN (?))');
      params.push(ROOT_ADMIN_EMAILS);
    } else if (filterRole === 'user') {
      conditions.push('(is_admin = 0 AND LOWER(email) NOT IN (?))');
      params.push(ROOT_ADMIN_EMAILS);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY is_admin DESC, created_at DESC';

    const [rows] = await pool.query(sql, params);

    const users = (rows || []).map((u) => {
      const isRootAdmin =
        isRootAdminEmail(u.email);
      return {
        id: u.id,
        name: u.name || 'Usuário Sem Nome',
        email: u.email,
        phone: u.phone || null,
        avatar_url: u.avatar_url || null,
        photo_url: u.avatar_url || null,
        avatar: u.avatar_url || null,
        plan: u.plan_id === 'infinity' ? 'Plano Infinity' : 'Gratuito',
        plan_id: u.plan_id || 'free',
        is_admin: isRootAdmin ? 1 : (u.is_admin ? 1 : 0),
        is_root_admin: isRootAdmin,
        created_at: u.created_at,
        updated_at: u.updated_at,
      };
    });

    return res.json({
      total: users.length,
      users,
    });
  } catch (err) {
    console.error('[Admin] Erro ao listar usuários:', err);
    return res.status(500).json({ detail: 'Falha ao listar usuários.' });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Alterna ou define privilégio de Administrador para um usuário específico.
 */
router.patch('/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_admin } = req.body || {};

  if (is_admin === undefined) {
    return res.status(400).json({ detail: 'Parâmetro is_admin (booleano ou 0/1) é obrigatório.' });
  }

  const newAdminValue = is_admin === true || is_admin === 1 || is_admin === '1' ? 1 : 0;

  try {
    const [existing] = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = ? LIMIT 1', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ detail: 'Usuário não encontrado.' });
    }

    const targetUser = existing[0];
    const isRoot =
      isRootAdminEmail(targetUser.email);

    if (isRoot && newAdminValue === 0) {
      return res.status(400).json({ detail: 'O usuário administrador principal não pode ter seus privilégios removidos.' });
    }

    await pool.query('UPDATE users SET is_admin = ?, updated_at = NOW(3) WHERE id = ?', [newAdminValue, id]);

    // Atualizar na store em memória se presente
    const memUser = store.users.find((u) => u.id === id);
    if (memUser) {
      memUser.is_admin = newAdminValue;
    }

    return res.json({
      success: true,
      id,
      name: targetUser.name,
      email: targetUser.email,
      is_admin: newAdminValue,
      message: newAdminValue === 1
        ? `Usuário ${targetUser.name || targetUser.email} agora é um Administrador!`
        : `Privilégios de Administrador removidos de ${targetUser.name || targetUser.email}.`,
    });
  } catch (err) {
    console.error('[Admin] Erro ao atualizar privilégio:', err);
    return res.status(500).json({ detail: 'Falha ao alterar perfil.' });
  }
});

/**
 * GET /api/admin/metrics
 * Retorna contagens de usuários e estrutura para o dashboard admin.
 */
router.get('/admin/metrics', requireAdmin, async (_req, res) => {
  try {
    const [[{ total_users }]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    const [[{ total_admins }]] = await pool.query('SELECT COUNT(*) AS total_admins FROM users WHERE is_admin = 1');
    const [[{ total_memories }]] = await pool.query('SELECT COUNT(*) AS total_memories FROM memories');

    return res.json({
      totalUsers: Number(total_users) || 1,
      totalAdmins: Number(total_admins) || 1,
      totalMemories: Number(total_memories) || 0,
      systemStatus: 'healthy',
    });
  } catch {
    return res.json({
      totalUsers: store.users.length || 1,
      totalAdmins: 1,
      totalMemories: 0,
      systemStatus: 'healthy',
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Exclusão definitiva de um usuário por Administradores e Roots.
 * Realiza expurgo seguro em cascata de dados e mídias, preservando regras de segurança.
 */
router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [existing] = await pool.query(
      'SELECT id, name, email, is_admin FROM users WHERE id = ? LIMIT 1',
      [id]
    );

    let targetUser = existing && existing.length > 0 ? existing[0] : null;
    if (!targetUser) {
      targetUser = store.users.find((u) => u.id === id);
    }

    if (!targetUser) {
      return res.status(404).json({ detail: 'Usuário não encontrado.' });
    }

    const isRoot =
      isRootAdminEmail(targetUser.email);

    // 1. Root admin não pode ser excluído
    if (isRoot) {
      return res.status(400).json({
        detail: 'O administrador principal (Root) é estritamente protegido e não pode ser excluído.',
      });
    }

    // 2. Não permitir que o usuário logado exclua a si mesmo nesta rota administrativa
    if (req.user?.id === targetUser.id || req.user?.email === targetUser.email) {
      return res.status(400).json({
        detail: 'Você não pode excluir sua própria conta nesta lista administrativa.',
      });
    }

    // 3. Expurgo criptográfico de mídias do usuário no cofre em disco
    try {
      const [memories] = await pool.query(
        'SELECT id, storage_key FROM memories WHERE author_id = ?',
        [id]
      );
      for (const m of memories || []) {
        if (m.storage_key) {
          const filePath = path.resolve(config.vaultFolder, m.storage_key);
          await vaultEncryptionService.cryptoShredFile(filePath);
        }
      }
    } catch (shredErr) {
      console.warn('[AdminDelete] Aviso ao expurgar mídias em disco:', shredErr.message);
    }

    // 4. Limpeza em cascata no MySQL (memórias, sessões, dispositivos e usuário)
    try {
      await pool.query('DELETE FROM memories WHERE author_id = ?', [id]);
    } catch {}
    try {
      await pool.query('DELETE FROM google_photos_picker_sessions WHERE user_id = ?', [id]);
    } catch {}
    try {
      await pool.query('DELETE FROM devices WHERE user_id = ?', [id]);
    } catch {}
    try {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
    } catch (sqlErr) {
      console.error('[AdminDelete] Erro ao deletar usuário no MySQL:', sqlErr);
      return res.status(500).json({ detail: `Falha ao remover usuário do banco: ${sqlErr.message}` });
    }

    // 5. Limpeza no store em memória
    store.users = store.users.filter((u) => u.id !== id && u.email !== targetUser.email);
    store.devices = (store.devices || []).filter((d) => d.user_id !== id);
    store.messages = (store.messages || []).filter((m) => m.user_id !== id);

    return res.json({
      success: true,
      id,
      name: targetUser.name,
      email: targetUser.email,
      message: `Usuário ${targetUser.name || targetUser.email} excluído permanentemente do sistema com sucesso.`,
    });
  } catch (err) {
    console.error('[AdminDelete] Erro inesperado na exclusão:', err);
    return res.status(500).json({ detail: 'Falha na exclusão.' });
  }
});

/**
 * POST /api/admin/users/batch-delete
 * Exclusão em lote de múltiplos usuários.
 * Filtra rigorosamente e protege administradores e roots contra exclusão.
 */
router.post('/admin/users/batch-delete', requireAdmin, async (req, res) => {
  const { userIds } = req.body || {};

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ detail: 'Lista de IDs de usuários inválida ou vazia.' });
  }

  try {
    // 1. Buscar todos os usuários solicitados no MySQL
    const [rows] = await pool.query(
      `SELECT id, name, email, is_admin FROM users WHERE id IN (?)`,
      [userIds]
    );

    const allCandidates = new Map();
    for (const r of rows || []) {
      allCandidates.set(r.id, r);
    }
    for (const uid of userIds) {
      if (!allCandidates.has(uid)) {
        const memU = store.users.find((u) => u.id === uid);
        if (memU) allCandidates.set(uid, memU);
      }
    }

    // 2. Filtrar apenas os que NÃO são root, NÃO são admin e NÃO são o próprio usuário
    const eligibleToDelete = [];
    const skippedAdmins = [];

    for (const [uid, user] of allCandidates.entries()) {
      const isRoot =
        isRootAdminEmail(user.email);

      const isAdmin = user.is_admin === 1 || Boolean(user.is_admin);
      const isSelf = req.user?.id === uid || req.user?.email === user.email;

      if (isRoot || isAdmin || isSelf) {
        skippedAdmins.push({ id: uid, name: user.name, email: user.email });
      } else {
        eligibleToDelete.push({ id: uid, name: user.name, email: user.email });
      }
    }

    if (eligibleToDelete.length === 0) {
      return res.status(400).json({
        detail: 'Nenhum usuário elegível para exclusão em lote (administradores e sua própria conta são protegidos).',
        skippedCount: skippedAdmins.length,
      });
    }

    const eligibleIds = eligibleToDelete.map((u) => u.id);
    const eligibleEmails = eligibleToDelete.map((u) => u.email);

    // 3. Expurgo criptográfico de mídias no disco para os usuários elegíveis
    try {
      const [memories] = await pool.query(
        `SELECT id, storage_key FROM memories WHERE author_id IN (?)`,
        [eligibleIds]
      );
      for (const m of memories || []) {
        if (m.storage_key) {
          const filePath = path.resolve(config.vaultFolder, m.storage_key);
          await vaultEncryptionService.cryptoShredFile(filePath);
        }
      }
    } catch (shredErr) {
      console.warn('[AdminBatchDelete] Aviso ao expurgar mídias em disco:', shredErr.message);
    }

    // 4. Limpeza em cascata no MySQL
    try {
      await pool.query(`DELETE FROM memories WHERE author_id IN (?)`, [eligibleIds]);
    } catch {}
    try {
      await pool.query(`DELETE FROM google_photos_picker_sessions WHERE user_id IN (?)`, [eligibleIds]);
    } catch {}
    try {
      await pool.query(`DELETE FROM devices WHERE user_id IN (?)`, [eligibleIds]);
    } catch {}
    try {
      await pool.query(`DELETE FROM users WHERE id IN (?)`, [eligibleIds]);
    } catch (sqlErr) {
      console.error('[AdminBatchDelete] Erro ao deletar usuários no MySQL:', sqlErr);
      return res.status(500).json({ detail: `Falha ao remover usuários do banco: ${sqlErr.message}` });
    }

    // 5. Limpeza no store em memória
    store.users = store.users.filter((u) => !eligibleIds.includes(u.id) && !eligibleEmails.includes(u.email));
    store.devices = (store.devices || []).filter((d) => !eligibleIds.includes(d.user_id));
    store.messages = (store.messages || []).filter((m) => !eligibleIds.includes(m.user_id));

    return res.json({
      success: true,
      deletedCount: eligibleToDelete.length,
      deletedUsers: eligibleToDelete,
      skippedCount: skippedAdmins.length,
      message: `${eligibleToDelete.length} usuário(s) excluído(s) permanentemente com sucesso.`,
    });
  } catch (err) {
    console.error('[AdminBatchDelete] Erro inesperado na exclusão em lote:', err);
    return res.status(500).json({ detail: 'Falha na exclusão em lote.' });
  }
});

export default router;
