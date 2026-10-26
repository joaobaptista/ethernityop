/**
 * test/googlePhotos.test.js
 * Unit & integration tests for Google Photos OAuth & Picker API endpoints.
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { reseed, findUserByEmail } from '../src/db.js';
import { pool } from '../src/db/mysql.js';
import { signToken } from '../src/auth.js';

const app = createApp();
const DEMO_EMAIL = 'demo@ethernity.com';

function demoHeaders() {
  const user = findUserByEmail(DEMO_EMAIL);
  return { Authorization: `Bearer ${signToken(user)}` };
}

before(async () => {
  reseed();
  await request(app).post('/google-photos/disconnect').set(demoHeaders());
});
beforeEach(() => reseed());
after(async () => {
  try {
    await pool.query('DELETE FROM memories WHERE source = ?', ['GOOGLE_PHOTOS']);
  } catch {}
  try {
    await pool.end();
  } catch {}
});

test('GET /google-photos/auth-url returns OAuth details or demo fallback', async () => {
  const res = await request(app).get('/google-photos/auth-url');
  assert.equal(res.status, 200);
  assert.ok(res.body.scope.includes('photospicker.mediaitems.readonly'));
  assert.ok(res.body.mode === 'demo_simulation' || res.body.mode === 'production');
});

test('GET /google-photos/status returns disconnected initial status', async () => {
  const res = await request(app)
    .get('/google-photos/status')
    .set(demoHeaders());
  assert.equal(res.status, 200);
  assert.equal(res.body.connected, false);
});

test('POST /google-photos/connect saves user connection', async () => {
  const res = await request(app)
    .post('/google-photos/connect')
    .set(demoHeaders())
    .send({
      email: 'user.test@gmail.com',
      name: 'User Test Google',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.connection.connected, true);
  assert.equal(res.body.connection.email, 'user.test@gmail.com');
});

test('POST /google-photos/session creates a picker session', async () => {
  const res = await request(app)
    .post('/google-photos/session')
    .set(demoHeaders());

  assert.equal(res.status, 200);
  assert.ok(res.body.id.startsWith('session-'));
  assert.ok(res.body.pickerUri.includes('photospicker.googleapis.com'));
  assert.ok(Array.isArray(res.body.availablePhotos));
});

test('GET /google-photos/photos lists photos with category and search filter', async () => {
  // Cria memória real de Google Photos para teste end-to-end
  await request(app)
    .post('/memories/')
    .set(demoHeaders())
    .send({
      capsuleId: 'cap-general',
      title: 'Foto Especial do Google Fotos',
      story: 'Registro sincronizado com segurança.',
      mediaUrl: 'https://images.unsplash.com/photo-test-real',
      type: 'IMAGE',
      source: 'GOOGLE_PHOTOS',
    });

  const resAll = await request(app)
    .get('/google-photos/photos')
    .set(demoHeaders());
  assert.equal(resAll.status, 200);
  assert.ok(resAll.body.photos.length > 0);

  const resFamily = await request(app)
    .get('/google-photos/photos?category=family')
    .set(demoHeaders());
  assert.equal(resFamily.status, 200);
  assert.ok(resFamily.body.photos.every((p) => p.category === 'family'));
});

test('POST /google-photos/import imports chosen photos into the vault', async () => {
  const res = await request(app)
    .post('/google-photos/import')
    .set(demoHeaders())
    .send({
      photoIds: ['gp-photo-1', 'gp-photo-2'],
      targetCapsuleId: 'cap-123',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.importedCount, 2);
  assert.equal(res.body.targetCapsuleId, 'cap-123');
});

test('GET /google-photos/live-photos without token returns fallback photos', async () => {
  const res = await request(app)
    .get('/google-photos/live-photos')
    .set(demoHeaders());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.photos));
  assert.equal(res.body.mode, 'curated_fallback');
});

test('POST /google-photos/userinfo without token returns 400', async () => {
  const res = await request(app)
    .post('/google-photos/userinfo')
    .send({});
  assert.equal(res.status, 400);
});

test('POST /google-photos/disconnect clears user connection', async () => {
  const res = await request(app)
    .post('/google-photos/disconnect')
    .set(demoHeaders());

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

