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
