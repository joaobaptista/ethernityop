/**
 * test/api.test.js
 * Integration tests for the Ethernity DMS Backend API using Node's built-in test runner + supertest.
 * Verifies status codes, JSON response shapes, authentication and security semantics.
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { reseed, findUserByEmail } from '../src/db.js';
import { pool } from '../src/db/mysql.js';
import { signToken } from '../src/auth.js';
import config from '../src/config.js';

const app = createApp();
const DEMO_EMAIL = 'demo@ethernity.com';
const DEMO_PASS = 'password123';

function demoHeaders() {
  const user = findUserByEmail(DEMO_EMAIL);
  return { Authorization: `Bearer ${signToken(user)}` };
}

const REGISTER_EMAIL = 'new@ethernity.com';

async function purgeRegisteredUser() {
  try {
    await pool.query('DELETE FROM users WHERE email = ?', [REGISTER_EMAIL]);
  } catch {
    // MySQL indisponível
  }
}

before(async () => {
  reseed();
  await purgeRegisteredUser();
});
beforeEach(() => reseed());
after(async () => {
  await purgeRegisteredUser();
  try {
    await pool.end();
  } catch {
    // ignore
  }
});

// ---- root / meta ---------------------------------------------------------

test('GET / returns the API banner', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.ok(res.body.message.includes('Ethernity DMS API') || res.body.message.includes('GPS Tracking API'));
});

test('GET /health reports healthy when MySQL responds', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'healthy');
  assert.equal(res.body.database, 'up');
  assert.match(res.body.version, /^\d+\.\d+\.\d+$/);
});

test('GET /metrics returns a Prometheus text body', async () => {
  const res = await request(app).get('/metrics');
  assert.equal(res.status, 200);
  assert.match(res.text, /tracker_requests_total/);
});

test('GET /openapi.json returns OpenAPI 3.0 spec', async () => {
  const res = await request(app).get('/openapi.json');
  assert.equal(res.status, 200);
  assert.equal(res.body.openapi, '3.0.3');
  assert.ok(res.body.paths['/capsules/']);
  assert.ok(res.body.paths['/subscriptions/plans']);
});

test('GET /docs returns Swagger UI HTML', async () => {
  const res = await request(app).get('/docs');
  assert.equal(res.status, 200);
  assert.match(res.text, /swagger-ui/);
  assert.match(res.text, /Ethernity DMS/);
});

test('GET /redoc returns ReDoc HTML', async () => {
  const res = await request(app).get('/redoc');
  assert.equal(res.status, 200);
  assert.match(res.text, /redoc/);
});

test('unknown route returns 404 with FastAPI-style detail', async () => {
  const res = await request(app).get('/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { detail: 'Not Found' });
});

// ---- auth ----------------------------------------------------------------

test('POST /register creates a user', async () => {
  const res = await request(app)
    .post('/register')
    .send({
      email: 'new@ethernity.com',
      password: 'secret123',
      name: 'New Ethernity User',
      phone: '+1 555 9999',
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'new@ethernity.com');
  assert.equal(res.body.name, 'New Ethernity User');
  assert.ok(res.body.id);
  assert.equal(res.body.password, undefined);
});

test('POST /register rejects duplicate email with 400', async () => {
  const res = await request(app)
    .post('/register')
    .send({ email: DEMO_EMAIL, password: 'Senha-Duplicada-1', name: 'Dup', phone: '1' });
  assert.equal(res.status, 400);
  assert.equal(res.body.detail, 'Email already registered');
});

test('POST /login success returns bearer token', async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: DEMO_EMAIL, password: DEMO_PASS });
  assert.equal(res.status, 200);
  assert.ok(res.body.access_token);
  assert.equal(res.body.token_type, 'bearer');
});

test('POST /login with bad credentials returns 401', async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: DEMO_EMAIL, password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.detail, 'Incorrect email or password');
});

// ---- protected routes: missing header => 403, invalid token => 401 -------

test('protected route without header returns 403', async () => {
  const res = await request(app).get('/capsules/');
  assert.equal(res.status, 403);
});

test('protected route with invalid token returns 401', async () => {
  const res = await request(app)
    .get('/capsules/')
    .set('Authorization', 'Bearer not.a.jwt');
  assert.equal(res.status, 401);
});

test('protected route with unknown subject returns 401', async () => {
  const bad = jwt.sign(
    { sub: 'ghost@ethernity.com' },
    config.jwtSecret,
    { algorithm: 'HS256' }
  );
  const res = await request(app)
    .get('/capsules/')
    .set('Authorization', `Bearer ${bad}`);
  assert.equal(res.status, 401);
});

// ---- users ----------------------------------------------------------------

test('GET /profile returns the current user', async () => {
  const res = await request(app).get('/profile').set(demoHeaders());
  assert.equal(res.status, 200);
  assert.equal(res.body.email, DEMO_EMAIL);
  assert.equal(res.body.password, undefined);
});

test('PUT /profile updates the user', async () => {
  const res = await request(app)
    .put('/profile')
    .set(demoHeaders())
    .send({ name: 'Demo Updated', phone: '+1 555 0001' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Demo Updated');
  assert.equal(res.body.phone, '+1 555 0001');
});

// ---- legacy IoT isolation --------------------------------------------------

test('legacy IoT endpoints (/devices, /areas, /geofencing) are disabled and return 404', async () => {
  const resDevices = await request(app).get('/devices/').set(demoHeaders());
  assert.equal(resDevices.status, 404);

  const resAreas = await request(app).get('/areas/').set(demoHeaders());
  assert.equal(resAreas.status, 404);

  const resGeo = await request(app).get('/geofencing/data');
  assert.equal(resGeo.status, 404);
});

// ---- messages ----------------------------------------------------------------

test('GET /messages/ returns demo messages', async () => {
  const res = await request(app).get('/messages/').set(demoHeaders());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 1);
});

test('PUT /messages/:id updates message fields', async () => {
  const list = await request(app).get('/messages/').set(demoHeaders());
  const msg = list.body[0];
  const res = await request(app)
    .put(`/messages/${msg.id}`)
    .set(demoHeaders())
    .send({ title: 'Carta Atualizada', active: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'Carta Atualizada');
  assert.equal(res.body.active, false);
});

test('DELETE /messages/:id removes the message', async () => {
  const list = await request(app).get('/messages/').set(demoHeaders());
  const msg = list.body[0];
  const res = await request(app).delete(`/messages/${msg.id}`).set(demoHeaders());
  assert.equal(res.status, 200);
});

test('POST /messages/ creates an Ethernity letter with title', async () => {
  const res = await request(app)
    .post('/messages/')
    .set(demoHeaders())
    .send({
      title: 'Carta Especial de 18 Anos',
      content: 'Querida Mariana, parabéns pela sua jornada...',
      recipientName: 'Mariana Silva',
      deliveryType: 'date',
      deliveryDate: '2028-05-10',
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.title, 'Carta Especial de 18 Anos');
  assert.equal(res.body.recipientName, 'Mariana Silva');
  assert.ok(res.body.id.startsWith('msg-'));
});

test('POST /messages/ rejects empty title with 400', async () => {
  const res = await request(app)
    .post('/messages/')
    .set(demoHeaders())
    .send({
      title: '   ',
      content: 'Sem título',
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.detail, 'O título da mensagem é obrigatório.');
});

test('POST /messages/generate-ai generates anniversary letter suggestion', async () => {
  const res = await request(app)
    .post('/messages/generate-ai')
    .set(demoHeaders())
    .send({
      prompt: 'Carta de aniversário de 18 anos',
      recipientName: 'Mariana',
      tone: 'afetuoso',
    });
  assert.equal(res.status, 200);
  assert.ok(res.body.title.includes('Aniversário Especial'));
  assert.ok(res.body.content.length > 50);
});

// ---- upload ---------------------------------------------------------------

test('POST /upload/ with valid image returns url', async () => {
  const res = await request(app)
    .post('/upload/')
    .set(demoHeaders())
    .attach('file', Buffer.from('fake-png-bytes'), {
      filename: 'pic.png',
      contentType: 'image/png',
    });
  assert.equal(res.status, 200);
  assert.ok(res.body.url.startsWith('/uploads/'));
  assert.ok(res.body.filename);
});

test('POST /upload/ with disallowed type returns 400', async () => {
  const res = await request(app)
    .post('/upload/')
    .set(demoHeaders())
    .attach('file', Buffer.from('hello'), {
      filename: 'a.exe',
      contentType: 'application/x-msdownload',
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.detail, 'File type not allowed');
});

