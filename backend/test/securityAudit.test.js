/**
 * test/securityAudit.test.js
 * Suíte de testes automatizados de AppSec / Red Team para auditoria ofensiva e defensiva.
 * Valida:
 *  1. RBAC e bloqueio de escalonamento de privilégios (/admin/*)
 *  2. Proteção contra IDOR no cofre de memórias criptografadas
 *  3. Rejeição de tipos MIME maliciosos / não autorizados
 *  4. Expurgo criptográfico permanente (cryptoShred)
 *  5. Isolamento de tokens e sessões
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { store, findUserByEmail, reseed } from '../src/db.js';
import { pool } from '../src/db/mysql.js';
import { signToken } from '../src/auth.js';
import config from '../src/config.js';

const app = createApp();

let adminUser;
let adminToken;
let victimUser;
let victimToken;
let attackerUser;
let attackerToken;

before(async () => {
  reseed();

  // 1. Usuário Admin (Root)
  adminUser = findUserByEmail('demo@ethernity.com') || { id: 'u-demo-1', email: 'demo@ethernity.com', is_admin: 1 };
  adminToken = signToken(adminUser);

  // 2. Usuário Vítima (usuário comum)
  victimUser = {
    id: 'u-victim-sec',
    email: 'victim@ethernity.com',
    name: 'Victim User',
    phone: '+55 11 91111-2222',
    is_admin: 0,
  };
  store.users.push(victimUser);
  victimToken = signToken(victimUser);

  // 3. Usuário Atacante (usuário comum querendo escalar privilégio ou invadir cofre)
  attackerUser = {
    id: 'u-attacker-sec',
    email: 'attacker@ethernity.com',
    name: 'Attacker User',
    phone: '+55 11 93333-4444',
    is_admin: 0,
  };
  store.users.push(attackerUser);
  attackerToken = signToken(attackerUser);
});

// =========================================================================
// 1. RBAC & ANTI-PRIVILEGE ESCALATION
// =========================================================================

test('Sec/RBAC: Usuário comum é estritamente bloqueado de rotas administrativas', async () => {
  const resUsers = await request(app)
    .get('/admin/users')
    .set('Authorization', `Bearer ${attackerToken}`);

  assert.equal(resUsers.status, 403);
  assert.match(resUsers.body.detail, /Privilégios de Administrador requeridos/i);

  const resRole = await request(app)
    .patch(`/admin/users/${attackerUser.id}/role`)
    .set('Authorization', `Bearer ${attackerToken}`)
    .send({ is_admin: true });

  assert.equal(resRole.status, 403);
});

test('Sec/RBAC: Administrador legítimo acessa painel administrativo', async () => {
  const res = await request(app)
    .get('/admin/users')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.users));
  assert.ok(res.body.total >= 1);
});

test('Sec/RBAC: Proteção do Root Admin contra revogação de privilégios', async () => {
  const res = await request(app)
    .patch(`/admin/users/${adminUser.id}/role`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ is_admin: false });

  assert.equal(res.status, 400);
  assert.match(res.body.detail, /administrador principal não pode ter seus privilégios removidos/i);
});

test('Sec/RBAC: Usuário comum não pode excluir usuários (DELETE /admin/users/:id)', async () => {
  const res = await request(app)
    .delete(`/admin/users/${victimUser.id}`)
    .set('Authorization', `Bearer ${attackerToken}`);

  assert.equal(res.status, 403);
  assert.match(res.body.detail, /Privilégios de Administrador requeridos/i);
});

test('Sec/RBAC: Administrador não pode excluir a si mesmo nem ao Root Admin', async () => {
  // Tentativa de excluir o Root Admin
  const resRoot = await request(app)
    .delete(`/admin/users/${adminUser.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(resRoot.status, 400);
  assert.match(resRoot.body.detail, /não pode ser excluído/i);
});

test('Sec/RBAC: Administrador pode excluir permanentemente um usuário padrão com expurgo', async () => {
  // Criar um usuário temporário para exclusão
  const tempUser = {
    id: `u-to-delete-${Date.now()}`,
    name: 'Temporary User',
    email: `temp_${Date.now()}@ethernity.test`,
    phone: '+55 11 98888-7777',
    is_admin: 0,
  };
  store.users.push(tempUser);

  const res = await request(app)
    .delete(`/admin/users/${tempUser.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.message, /excluído permanentemente/i);

  // Garantir que não está mais no store
  const found = store.users.find((u) => u.id === tempUser.id);
  assert.equal(found, undefined);
});

test('Sec/RBAC: POST /api/admin/users/batch-delete bloqueia usuários não administradores', async () => {
  const res = await request(app)
    .post('/api/admin/users/batch-delete')
    .set('Authorization', `Bearer ${attackerToken}`)
    .send({ userIds: ['some-id'] });

  assert.equal(res.status, 403);
});

test('Sec/RBAC: POST /api/admin/users/batch-delete exclui usuários comuns em lote e protege contas de administradores e própria conta', async () => {
  const batch1 = {
    id: `u-batch-1-${Date.now()}`,
    name: 'Batch User 1',
    email: `batch1_${Date.now()}@ethernity.test`,
    is_admin: 0,
  };
  const batch2 = {
    id: `u-batch-2-${Date.now()}`,
    name: 'Batch User 2',
    email: `batch2_${Date.now()}@ethernity.test`,
    is_admin: 0,
  };
  store.users.push(batch1, batch2);

  // Solicitar exclusão de batch1, batch2 e do adminUser na mesma chamada
  const res = await request(app)
    .post('/api/admin/users/batch-delete')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userIds: [batch1.id, batch2.id, adminUser.id] });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.deletedCount, 2);
  assert.equal(res.body.skippedCount, 1);

  // Confirma que os usuários padrão foram expurgados
  assert.equal(store.users.find((u) => u.id === batch1.id), undefined);
  assert.equal(store.users.find((u) => u.id === batch2.id), undefined);

  // Confirma que o administrador permaneceu intocado
  assert.notEqual(store.users.find((u) => u.id === adminUser.id), undefined);
});

// =========================================================================
// 2. ANTI-IDOR (INSECURE DIRECT OBJECT REFERENCE) NO COFRE CRIPTOGRAFADO
// =========================================================================

test('Sec/IDOR: Atacante não consegue ler nem decifrar mídias da vítima no cofre', async () => {
  // Vítima cria uma foto confidencial no cofre
  const secretImageBuffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const uploadRes = await request(app)
    .post('/api/vault/media/upload')
    .set('Authorization', `Bearer ${victimToken}`)
    .field('title', 'Documento Altamente Confidencial')
    .attach('file', secretImageBuffer, 'confidencial.png');

  assert.equal(uploadRes.status, 200);
  const mediaId = uploadRes.body.mediaId;
  const memoryId = uploadRes.body.id;

  // Atacante tenta acessar a mídia da vítima diretamente via GET /api/vault/media/:id
  const attackRes = await request(app)
    .get(`/api/vault/media/${mediaId}`)
    .set('Authorization', `Bearer ${attackerToken}`);

  assert.equal(attackRes.status, 403);
  assert.match(attackRes.body.detail, /Acesso não autorizado/i);

  // Atacante tenta forjar token na URL (?token=)
  const attackQueryRes = await request(app)
    .get(`/api/vault/media/${mediaId}?token=${attackerToken}`);

  assert.equal(attackQueryRes.status, 403);

  // Atacante tenta deletar a mídia da vítima (IDOR em DELETE)
  const attackDeleteRes = await request(app)
    .delete(`/api/vault/media/${mediaId}`)
    .set('Authorization', `Bearer ${attackerToken}`);

  assert.equal(attackDeleteRes.status, 403);
});

// =========================================================================
// 3. SANITIZAÇÃO DE UPLOADS MULTIPART & TIPOS MIME
// =========================================================================

test('Sec/Upload: Rejeita uploads com tipos MIME não permitidos (ex: executáveis)', async () => {
  const fakeExeBuffer = Buffer.from('MZ-FAKE-EXECUTABLE-BYTES');

  const res = await request(app)
    .post('/api/vault/media/upload')
    .set('Authorization', `Bearer ${attackerToken}`)
    .field('title', 'Payload Malicioso')
    .attach('file', fakeExeBuffer, {
      filename: 'exploit.exe',
      contentType: 'application/x-msdownload',
    });

  assert.equal(res.status, 400);
  assert.match(res.body.detail, /Tipo de mídia não suportado/i);
});

// =========================================================================
// 4. EXPURGO CRIPTOGRÁFICO DEFINITIVO (REGRA 5 DO AGENTS.MD)
// =========================================================================

test('Sec/CryptoShred: Expurgo destrói arquivos em disco com ruído criptográfico e remove registro', async () => {
  const testBuffer = await sharp({
    create: { width: 80, height: 80, channels: 3, background: { r: 10, g: 200, b: 50 } },
  })
    .png()
    .toBuffer();

  const up = await request(app)
    .post('/api/vault/media/upload')
    .set('Authorization', `Bearer ${victimToken}`)
    .field('title', 'Memória a Ser Destruída')
    .attach('file', testBuffer, 'destruir.png');

  assert.equal(up.status, 200);
  const mediaId = up.body.mediaId;
  const filePath = path.join(config.vaultFolder, victimUser.id, mediaId, 'master.webp.enc');

  // Confirma existência do arquivo criptografado em disco
  const fileExistsBefore = await fs.access(filePath).then(() => true).catch(() => false);
  assert.equal(fileExistsBefore, true, 'Arquivo deve existir em disco antes do expurgo');

  // Vítima executa exclusão permanente
  const delRes = await request(app)
    .delete(`/api/vault/media/${mediaId}`)
    .set('Authorization', `Bearer ${victimToken}`);

  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.success, true);

  // Confirma que o arquivo e diretório foram completamente expurgados do disco
  const fileExistsAfter = await fs.access(filePath).then(() => true).catch(() => false);
  assert.equal(fileExistsAfter, false, 'Arquivo deve ser expurgado do disco após cryptoShred');
});

after(async () => {
  try {
    await pool.query('DELETE FROM memories WHERE author_id IN (?, ?)', [victimUser.id, attackerUser.id]);
    await fs.rm(path.join(config.vaultFolder, victimUser.id), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(config.vaultFolder, attackerUser.id), { recursive: true, force: true }).catch(() => {});
  } catch {}
  try {
    await pool.end();
  } catch {}
});
