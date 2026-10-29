/**
 * test/guardians.test.js
 * Testes automatizados do Módulo de Guardiões de Confiança (CRUD, Anti-IDOR e Expurgo).
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
const userB = { id: 'u-attacker-guardians', email: 'attacker-guardians@test.com', is_admin: 0 };
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

test('Guardiões: GET /guardians sem token retorna 403', async () => {
  const res = await request(app).get('/guardians/');
  assert.equal(res.status, 403);
});

test('Guardiões: POST /guardians sem campos obrigatórios retorna 400', async () => {
  const noName = await request(app)
    .post('/guardians/')
    .set(headersA)
    .send({ email: 'test@ethernity.com' });
  assert.equal(noName.status, 400);

  const noEmail = await request(app)
    .post('/guardians/')
    .set(headersA)
    .send({ name: 'Maria Silva' });
  assert.equal(noEmail.status, 400);
});

test('Guardiões: Ciclo de Vida Completo (POST, GET, PUT, Anti-IDOR, DELETE)', async () => {
  const uniqueEmail = `guardiao_${Date.now()}@ethernity.com`;

  // 1. Criar novo guardião
  const createRes = await request(app)
    .post('/guardians/')
    .set(headersA)
    .send({
      name: 'Dr. Roberto Mendes',
      email: uniqueEmail,
      phone: '+55 11 98888-7777',
      relationship: 'Médico da Família',
      notes: 'Contato em caso de emergência médica',
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.name, 'Dr. Roberto Mendes');
  assert.equal(createRes.body.email, uniqueEmail);
  const guardianId = createRes.body.id;
  assert.ok(guardianId);

  // 2. Prevenir e-mail duplicado
  const dupRes = await request(app)
    .post('/guardians/')
    .set(headersA)
    .send({
      name: 'Outro Roberto',
      email: uniqueEmail,
      phone: '+55 11 91111-2222',
    });
  assert.equal(dupRes.status, 400);

  // 3. Listar guardiões e encontrar o recém-criado
  const listRes = await request(app).get('/guardians/').set(headersA);
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body));
  const found = listRes.body.find((g) => g.id === guardianId);
  assert.ok(found, 'O guardião criado deve estar presente na listagem');
  assert.equal(found.email, uniqueEmail);

  // 4. Obter detalhes individuais
  const detailRes = await request(app).get(`/guardians/${guardianId}`).set(headersA);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.id, guardianId);
  assert.equal(detailRes.body.name, 'Dr. Roberto Mendes');

  // 5. Anti-IDOR: Usuário B não pode acessar o guardião do Usuário A
  const idorGet = await request(app).get(`/guardians/${guardianId}`).set(headersB);
  assert.equal(idorGet.status, 403);

  const idorPut = await request(app)
    .put(`/guardians/${guardianId}`)
    .set(headersB)
    .send({ name: 'Hacker Edit' });
  assert.equal(idorPut.status, 404);

  const idorDelete = await request(app).delete(`/guardians/${guardianId}`).set(headersB);
  assert.equal(idorDelete.status, 404);

  // 6. Atualizar guardião legitimamente (PUT)
  const updateRes = await request(app)
    .put(`/guardians/${guardianId}`)
    .set(headersA)
    .send({
      name: 'Dr. Roberto Mendes (Atualizado)',
      phone: '+55 11 99999-0000',
      notes: 'Atualizado com novo telefone',
    });

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.name, 'Dr. Roberto Mendes (Atualizado)');
  assert.equal(updateRes.body.phone, '+55 11 99999-0000');

  // 7. Expurgo definitivo do guardião (DELETE)
  const deleteRes = await request(app).delete(`/guardians/${guardianId}`).set(headersA);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.status, 'success');

  // 8. Confirmar que não existe mais após expurgo
  const checkRes = await request(app).get(`/guardians/${guardianId}`).set(headersA);
  assert.equal(checkRes.status, 404);
});

test('Guardiões: foto só existe se cadastrada após a criação, com dono validado e expurgo do arquivo', async () => {
  const sharp = (await import('sharp')).default;
  const fs = await import('node:fs');
  const path = await import('node:path');
  const config = (await import('../src/config.js')).default;

  const created = await request(app)
    .post('/guardians/')
    .set(headersA)
    .send({
      name: 'Guardiã Sem Foto',
      email: `foto_${Date.now()}@ethernity.com`,
      avatar: 'https://example.com/foto-externa.jpg',
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.avatar, null, 'guardião nasce sem foto e não aceita URL externa');
  assert.equal(created.body.phone, '', 'sem telefone inventado');
  const id = created.body.id;

  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#cc6644' } }).png().toBuffer();

  const intruder = await request(app).post(`/guardians/${id}/photo`).set(headersB).attach('photo', png, { filename: 'a.png', contentType: 'image/png' });
  assert.equal(intruder.status, 404);

  const fake = await request(app).post(`/guardians/${id}/photo`).set(headersA).attach('photo', Buffer.from('não é imagem'), { filename: 'x.png', contentType: 'image/png' });
  assert.equal(fake.status, 400);

  const uploaded = await request(app).post(`/guardians/${id}/photo`).set(headersA).attach('photo', png, { filename: 'rosto.png', contentType: 'image/png' });
  assert.equal(uploaded.status, 200);
  assert.match(uploaded.body.avatar, /^\/uploads\/.+\/guardian-.+\.webp$/);
  const filePath = path.join(config.uploadFolder, uploaded.body.avatar.slice('/uploads/'.length));
  assert.ok(fs.existsSync(filePath));

  const listed = await request(app).get('/guardians/').set(headersA);
  assert.equal(listed.body.find((g) => g.id === id).avatar, uploaded.body.avatar);

  const del = await request(app).delete(`/guardians/${id}`).set(headersA);
  assert.equal(del.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.existsSync(filePath), false, 'arquivo da foto expurgado junto com o guardião');
});
