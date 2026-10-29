/**
 * test/memories.test.js
 * Testes automatizados do Módulo de Memórias e Timeline Relacional no MySQL.
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
const userB = { id: 'u-attacker-memories', email: 'attacker-memories@test.com', is_admin: 0 };
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

test('Memórias: GET /memories sem token retorna 403', async () => {
  const res = await request(app).get('/memories/');
  assert.equal(res.status, 403);
});

test('Memórias: POST /memories sem campos de mídia/conteúdo retorna 400', async () => {
  const res = await request(app)
    .post('/memories/')
    .set(headersA)
    .send({});
  assert.equal(res.status, 400);
});

test('Memórias: Ciclo de Vida Completo (POST, GET, PUT, Anti-IDOR, DELETE)', async () => {
  const uniqueTitle = `Memória de Viagem ${Date.now()}`;

  // 1. Criar nova memória vinculada a uma cápsula geral
  const createRes = await request(app)
    .post('/memories/')
    .set(headersA)
    .send({
      capsuleId: 'cap-general',
      title: uniqueTitle,
      story: 'Passeio inesquecível pelas montanhas ao entardecer.',
      mediaUrl: 'https://media.test/memory-photo.jpg',
      type: 'IMAGE',
      source: 'UPLOAD',
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.title, uniqueTitle);
  const memoryId = createRes.body.id;
  assert.ok(memoryId);

  // 2. Listar memórias e verificar se está inclusa
  const listRes = await request(app).get('/memories/').set(headersA);
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body));
  const found = listRes.body.find((m) => m.id === memoryId);
  assert.ok(found, 'A memória recém-criada deve estar na listagem');
  assert.equal(found.title, uniqueTitle);

  // 3. Obter detalhes da memória
  const detailRes = await request(app).get(`/memories/${memoryId}`).set(headersA);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.id, memoryId);
  assert.equal(detailRes.body.title, uniqueTitle);

  // 4. Anti-IDOR: Usuário B não pode acessar memória do Usuário A
  const idorGet = await request(app).get(`/memories/${memoryId}`).set(headersB);
  assert.equal(idorGet.status, 403);

  const idorPut = await request(app)
    .put(`/memories/${memoryId}`)
    .set(headersB)
    .send({ title: 'Tentativa de Hack' });
  assert.equal(idorPut.status, 404);

  const idorDelete = await request(app).delete(`/memories/${memoryId}`).set(headersB);
  assert.equal(idorDelete.status, 404);

  // 5. Atualizar memória legitimamente (PUT)
  const updateRes = await request(app)
    .put(`/memories/${memoryId}`)
    .set(headersA)
    .send({
      title: `${uniqueTitle} (Revisitada)`,
      story: 'Passeio inesquecível pelas montanhas com a família toda reunida.',
    });

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.title, `${uniqueTitle} (Revisitada)`);

  // 6. Excluir memória (DELETE)
  const deleteRes = await request(app).delete(`/memories/${memoryId}`).set(headersA);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.status, 'success');

  // 7. Confirmar exclusão definitiva
  const checkRes = await request(app).get(`/memories/${memoryId}`).set(headersA);
  assert.equal(checkRes.status, 404);
});
