/**
 * test/capsules.test.js
 * Testes automatizados do Módulo de Cápsulas do Tempo (CRUD, Relacionamentos e Anti-IDOR).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, DEMO_USER_ID } from '../src/db/mysql.js';
import { store } from '../src/db.js';
import { signToken } from '../src/auth.js';

const app = createApp();

const userA = { id: DEMO_USER_ID, email: 'demo@ethernity.com', is_admin: 1 };
const userB = { id: 'u-attacker-99', email: 'attacker@test.com', is_admin: 0 };
store.users.push(userB);

const headersA = { Authorization: `Bearer ${signToken(userA)}` };
const headersB = { Authorization: `Bearer ${signToken(userB)}` };

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore
  }
});

test('Cápsulas: GET /capsules sem token retorna 403', async () => {
  const res = await request(app).get('/capsules/');
  assert.equal(res.status, 403);
});

test('Cápsulas: POST /capsules sem título retorna 400', async () => {
  const res = await request(app)
    .post('/capsules/')
    .set(headersA)
    .send({ recipient: 'Mariana' });
  assert.equal(res.status, 400);
});

test('Cápsulas: Ciclo de Vida Completo (POST, GET, PUT, Anti-IDOR, DELETE)', async () => {
  const uniqueTitle = `Cápsula de Teste Automatizado ${Date.now()}`;

  // 1. Criar Cápsula com Guardiões e Fotos
  const createRes = await request(app)
    .post('/capsules/')
    .set(headersA)
    .send({
      title: uniqueTitle,
      recipient: { name: 'Mariana Silva', relation: 'Filha' },
      deliveryType: 'date',
      scheduledDate: '2030-10-15T12:00:00.000Z',
      emotion: 'love',
      guardians: ['guardiao.teste@ethernity.com'],
      photos: [
        {
          img: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&q=80&w=800',
          story: 'Momento inesquecível de infância',
        },
      ],
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.title, uniqueTitle);
  assert.equal(createRes.body.recipient, 'Mariana Silva');
  assert.ok(createRes.body.id);
  assert.equal(createRes.body.photosCount, 1);
  assert.deepEqual(createRes.body.guardians, ['guardiao.teste@ethernity.com']);

  const capsuleId = createRes.body.id;

  // 2. Listar Cápsulas e encontrar a recém-criada
  const listRes = await request(app).get('/capsules/').set(headersA);
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body));
  const found = listRes.body.find((c) => c.id === capsuleId);
  assert.ok(found, 'A cápsula criada deve estar presente na listagem do usuário');

  // 3. Obter Detalhes da Cápsula com memórias vinculadas
  const detailRes = await request(app).get(`/capsules/${capsuleId}`).set(headersA);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.id, capsuleId);
  assert.equal(detailRes.body.title, uniqueTitle);
  assert.ok(Array.isArray(detailRes.body.memories));
  assert.equal(detailRes.body.memories.length, 1);

  // 4. Anti-IDOR: Usuário B não pode acessar nem modificar a cápsula do Usuário A
  const idorGet = await request(app).get(`/capsules/${capsuleId}`).set(headersB);
  assert.equal(idorGet.status, 403);

  const idorPut = await request(app)
    .put(`/capsules/${capsuleId}`)
    .set(headersB)
    .send({ title: 'Tentativa de Hijack' });
  assert.equal(idorPut.status, 404);

  const idorDelete = await request(app).delete(`/capsules/${capsuleId}`).set(headersB);
  assert.equal(idorDelete.status, 404);

  // 5. Atualizar Cápsula Legitimamente (PUT)
  const updateRes = await request(app)
    .put(`/capsules/${capsuleId}`)
    .set(headersA)
    .send({
      title: `${uniqueTitle} - Atualizada`,
      emotion: 'wisdom',
      guardians: ['novo.guardiao@ethernity.com'],
    });

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.title, `${uniqueTitle} - Atualizada`);
  assert.equal(updateRes.body.emotion, 'wisdom');
  assert.deepEqual(updateRes.body.guardians, ['novo.guardiao@ethernity.com']);

  // 6. Excluir Cápsula Definitivamente (DELETE / CryptoShred)
  const deleteRes = await request(app).delete(`/capsules/${capsuleId}`).set(headersA);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.success, true);

  // 7. Verificar que não existe mais após a exclusão
  const checkDeleted = await request(app).get(`/capsules/${capsuleId}`).set(headersA);
  assert.equal(checkDeleted.status, 404);
});

test('Cápsulas: reenvio do mesmo id atualiza (idempotente), guarda metadados e ignora fotos em base64', async () => {
  const id = `cap-sync-${Date.now()}`;
  const first = await request(app)
    .post('/capsules/')
    .set(headersA)
    .send({
      id,
      title: 'Versão 1',
      recipient: { name: 'Ana', avatar: 'data:image/jpeg;base64,AAAA' },
      metadata: { personId: 'p-1', removedContentItems: [] },
      photos: [{ img: 'data:image/jpeg;base64,FOTOGRANDE', title: 'Base64 não vira memória' }],
    });
  assert.equal(first.status, 201);
  assert.equal(first.body.photosCount, 0);

  const second = await request(app)
    .post('/capsules/')
    .set(headersA)
    .send({ id, title: 'Versão 2', recipient: { name: 'Ana' }, metadata: { personId: 'p-1', hasVoice: true } });
  assert.equal(second.status, 200);
  assert.equal(second.body.title, 'Versão 2');
  assert.equal(second.body.metadata.hasVoice, true);

  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM capsules WHERE id = ?', [id]);
  assert.equal(rows[0].n, 1);
  const [mems] = await pool.query('SELECT COUNT(*) AS n FROM memories WHERE capsule_id = ?', [id]);
  assert.equal(mems[0].n, 0);

  // Outro usuário não pode sobrescrever a cápsula reutilizando o id
  const hijack = await request(app).post('/capsules/').set(headersB).send({ id, title: 'Sequestro' });
  assert.equal(hijack.status, 409);

  await request(app).delete(`/capsules/${id}`).set(headersA);
});

test('Cápsulas: mídia não pode ser anexada à cápsula de outro usuário e o expurgo apaga os arquivos cifrados', async () => {
  const sharp = (await import('sharp')).default;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const config = (await import('../src/config.js')).default;

  const id = `cap-media-${Date.now()}`;
  await request(app).post('/capsules/').set(headersA).send({ id, title: 'Com foto', recipient: 'Ana' });

  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();

  const intruder = await request(app)
    .post('/api/vault/media/upload')
    .set(headersB)
    .field('capsuleId', id)
    .attach('file', png, 'intruso.png');
  assert.equal(intruder.status, 403);

  const upload = await request(app)
    .post('/api/vault/media/upload')
    .set(headersA)
    .field('capsuleId', id)
    .field('title', 'Foto da cápsula')
    .attach('file', png, 'foto.png');
  assert.equal(upload.status, 200);

  const detail = await request(app).get(`/capsules/${id}`).set(headersA);
  assert.equal(detail.body.memories.length, 1);
  assert.equal(detail.body.memories[0].mediaId, upload.body.mediaId);

  const mediaDir = path.join(config.vaultFolder, userA.id, upload.body.mediaId);
  await fs.access(mediaDir);

  const del = await request(app).delete(`/capsules/${id}`).set(headersA);
  assert.equal(del.status, 200);
  await assert.rejects(fs.access(mediaDir), 'os arquivos cifrados da cápsula devem ser expurgados');
});
