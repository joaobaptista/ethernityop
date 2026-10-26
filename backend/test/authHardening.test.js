/**
 * test/authHardening.test.js
 * Regressões de segurança da autenticação e da superfície pública da API:
 *  1. Privilégio de admin nunca derivado do nome exibido
 *  2. Senhas demo restritas à conta demo
 *  3. /register não sobrescreve conta existente no MySQL
 *  4. /reset exige administrador
 *  5. CORS não reflete origens desconhecidas
 *  6. Upload de SVG (XSS armazenado) rejeitado
 *  7. Redirect do Google OAuth restrito a origens confiáveis
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { store, reseed } from '../src/db.js';
import { pool } from '../src/db/mysql.js';
import { signToken } from '../src/auth.js';
import config from '../src/config.js';
import { createRateLimiter, byEmail } from '../src/rateLimit.js';

const app = createApp();

const impostor = {
  id: 'u-impostor-vagner',
  email: 'impostor-vagner@test.com',
  name: 'Vagner Impostor',
  phone: '+55 11 90000-0000',
  password: 'Senha-Do-Impostor-1',
  is_admin: 0,
};
let impostorToken;

const DB_ONLY_EMAIL = 'db-only-hardening@test.com';
const DB_ONLY_ID = 'u-db-only-hardening';
const DB_ONLY_PASSWORD = 'Senha-Original-Forte-1';

before(async () => {
  reseed();
  store.users.push(impostor);
  impostorToken = signToken(impostor);
});

test('Sec/RBAC: nome contendo "vagner" não concede privilégios de administrador', async () => {
  const res = await request(app)
    .get('/admin/users')
    .set('Authorization', `Bearer ${impostorToken}`);
  assert.equal(res.status, 403);
});

test('Sec/Auth: senha demo não autentica contas que não são a demo', async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: impostor.email, password: 'password123' });
  assert.equal(res.status, 401);
});

test('Sec/Auth: conta demo continua acessível com a senha demo fora de produção', async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: 'demo@ethernity.com', password: 'password123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.access_token);
});

test('Sec/Auth: em produção, senhas da semente em memória não autenticam (admin demo)', async (t) => {
  const original = config.demoLoginEnabled;
  config.demoLoginEnabled = false;
  t.after(() => {
    config.demoLoginEnabled = original;
  });

  for (const password of ['Ethernity2026!Demo', 'password123']) {
    const demo = await request(app).post('/login').send({ email: 'demo@ethernity.com', password });
    assert.equal(demo.status, 401, `senha da semente "${password}" não pode abrir a conta demo`);
  }

  const memUser = await request(app).post('/login').send({ email: impostor.email, password: impostor.password });
  assert.equal(memUser.status, 401);
});

test('Sec/Auth: /register rejeita e-mail existente apenas no MySQL sem sobrescrever a senha', async (t) => {
  try {
    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, plan_id, created_at, updated_at)
       VALUES (?, 'DB Only', ?, '000', ?, 'infinity', NOW(3), NOW(3))`,
      [DB_ONLY_ID, DB_ONLY_EMAIL, bcrypt.hashSync(DB_ONLY_PASSWORD, 10)]
    );
  } catch (err) {
    t.skip(`MySQL indisponível: ${err.message}`);
    return;
  }

  const res = await request(app)
    .post('/register')
    .send({ email: DB_ONLY_EMAIL, password: 'Senha-Do-Atacante-1', name: 'Atacante', phone: '111' });
  assert.equal(res.status, 400);

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [DB_ONLY_ID]);
  assert.equal(bcrypt.compareSync(DB_ONLY_PASSWORD, rows[0].password_hash), true);
});

test('Sec/API: POST /reset exige administrador', async () => {
  const anon = await request(app).post('/reset');
  assert.equal(anon.status, 403);

  const nonAdmin = await request(app).post('/reset').set('Authorization', `Bearer ${impostorToken}`);
  assert.equal(nonAdmin.status, 403);
});

test('Sec/CORS: origem desconhecida não recebe Access-Control-Allow-Origin', async () => {
  const evil = await request(app).get('/health').set('Origin', 'https://evil.example.com');
  assert.equal(evil.headers['access-control-allow-origin'], undefined);

  const local = await request(app).get('/health').set('Origin', 'http://localhost:5173');
  assert.equal(local.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('Sec/Upload: SVG é rejeitado (vetor de XSS armazenado)', async () => {
  const res = await request(app)
    .post('/upload/')
    .set('Authorization', `Bearer ${impostorToken}`)
    .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
      filename: 'xss.svg',
      contentType: 'image/svg+xml',
    });
  assert.equal(res.status, 400);
});

test('Sec/OAuth: state do Google ignora origem não confiável e usa o frontend oficial', async () => {
  const res = await request(app)
    .get('/auth/google/url')
    .set('Origin', 'https://evil.example.com');
  assert.equal(res.status, 200);
  const state = new URL(res.body.url).searchParams.get('state');
  const payload = jwt.verify(state, config.jwtSecret, { audience: 'google-auth-state' });
  assert.equal(payload.origin, config.frontendUrl.replace(/\/$/, ''));
});

const PROFILE_A = { email: 'profile-a-hardening@test.com', password: 'Senha-Conta-A-1', name: 'Conta A', phone: '+55 11 90000-0001' };
const PROFILE_B = { email: 'profile-b-hardening@test.com', password: 'Senha-Conta-B-1', name: 'Conta B', phone: '+55 11 90000-0002' };

test('Sec/Profile: não permite assumir o e-mail de outra conta nem alterar a linha dela', async () => {
  await pool.query('DELETE FROM users WHERE email IN (?, ?)', [PROFILE_A.email, PROFILE_B.email]);
  assert.equal((await request(app).post('/register').send(PROFILE_A)).status, 200);
  assert.equal((await request(app).post('/register').send(PROFILE_B)).status, 200);

  const login = await request(app).post('/login').send({ email: PROFILE_A.email, password: PROFILE_A.password });
  const token = login.body.access_token;

  const res = await request(app)
    .put('/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: PROFILE_B.email, password: 'Senha-Do-Atacante-9' });
  assert.equal(res.status, 409);

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE email = ?', [PROFILE_B.email]);
  assert.ok(bcrypt.compareSync(PROFILE_B.password, rows[0].password_hash), 'senha da conta B não pode mudar');
  const stillA = await request(app).post('/login').send({ email: PROFILE_A.email, password: PROFILE_A.password });
  assert.equal(stillA.status, 200, 'conta A não pode ter sido alterada pela tentativa recusada');
});

test('Sec/Profile: troca de senha guarda só o hash, nunca o texto puro em memória', async () => {
  const login = await request(app).post('/login').send({ email: PROFILE_A.email, password: PROFILE_A.password });
  const res = await request(app)
    .put('/profile')
    .set('Authorization', `Bearer ${login.body.access_token}`)
    .send({ password: 'Nova-Senha-Forte-2' });
  assert.equal(res.status, 200);

  const mem = store.users.find((u) => u.email === PROFILE_A.email);
  assert.equal(mem.password, undefined);
  assert.ok(bcrypt.compareSync('Nova-Senha-Forte-2', mem.password_hash));
  const relogin = await request(app).post('/login').send({ email: PROFILE_A.email, password: 'Nova-Senha-Forte-2' });
  assert.equal(relogin.status, 200);
});

test('Sec/RateLimit: bloqueia com 429 após exceder tentativas por e-mail', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, key: byEmail('t'), enabled: true });
  const run = () =>
    new Promise((resolve) => {
      const res = {
        headers: {},
        set(k, v) { this.headers[k] = v; return this; },
        status(code) { resolve({ code, headers: this.headers }); return { json() {} }; },
      };
      limiter({ body: { email: 'Alvo@Test.com' }, ip: '1.1.1.1' }, res, () => resolve({ code: 'next' }));
    });

  assert.equal((await run()).code, 'next');
  assert.equal((await run()).code, 'next');
  const blocked = await run();
  assert.equal(blocked.code, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
});

test('Sec/Auth: cadastro e troca de senha exigem pelo menos 8 caracteres', async () => {
  const reg = await request(app)
    .post('/register')
    .send({ email: 'senha-curta-hardening@test.com', password: '1234567', name: 'Curta', phone: '1' });
  assert.equal(reg.status, 422);

  const login = await request(app).post('/login').send({ email: PROFILE_A.email, password: 'Nova-Senha-Forte-2' });
  const prof = await request(app)
    .put('/profile')
    .set('Authorization', `Bearer ${login.body.access_token}`)
    .send({ password: 'curta' });
  assert.equal(prof.status, 422);
});

test('Sec/API: erro 500 não expõe a mensagem interna e respostas têm cabeçalhos de segurança', async () => {
  const express = (await import('express')).default;
  const probe = createApp();
  // Monta uma rota que falha antes do 404 para exercitar o handler de erro global.
  probe._router.stack.splice(
    probe._router.stack.findIndex((l) => l.name === 'router'),
    0,
    ...express.Router().get('/__boom', () => { throw new Error('ECONNREFUSED segredo-interno'); }).stack
  );
  const res = await request(probe).get('/__boom');
  assert.equal(res.status, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /segredo-interno/);

  const health = await request(app).get('/health');
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(health.headers['x-frame-options'], 'DENY');
  assert.equal(health.headers['x-powered-by'], undefined);
});

after(async () => {
  try {
    await pool.query('DELETE FROM users WHERE id = ? OR email = ?', [DB_ONLY_ID, DB_ONLY_EMAIL]);
    await pool.query('DELETE FROM users WHERE email IN (?, ?, ?)', [PROFILE_A.email, PROFILE_B.email, 'senha-curta-hardening@test.com']);
  } catch {}
  try {
    await pool.end();
  } catch {}
});
