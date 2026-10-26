/**
 * test/subscriptions.test.js
 * Testes automatizados para o sistema de planos de assinatura e integração com Mercado Pago.
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

before(() => reseed());
beforeEach(() => reseed());
after(async () => {
  try {
    await pool.end();
  } catch {}
});

test('GET /subscriptions/plans returns list of available plans and Mercado Pago methods', async () => {
  const res = await request(app).get('/subscriptions/plans');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.plans));
  assert.equal(res.body.plans.length, 3);
  
  const planIds = res.body.plans.map(p => p.id);
  assert.ok(planIds.includes('free'));
  assert.ok(planIds.includes('family'));
  assert.ok(planIds.includes('clinical'));
  assert.ok(res.body.supportedPaymentMethods.includes('pix'));
});

test('GET /subscriptions/current returns user active subscription and usage limits', async () => {
  const res = await request(app)
    .get('/subscriptions/current')
    .set(demoHeaders());
  
  assert.equal(res.status, 200);
  assert.equal(res.body.subscription.planId, 'family');
  assert.equal(res.body.subscription.status, 'active');
  assert.ok(res.body.usage);
  assert.equal(typeof res.body.usage.devicesCount, 'number');
});

test('POST /subscriptions/create-preference creates Pix payment with EMV QR code', async () => {
  const res = await request(app)
    .post('/subscriptions/create-preference')
    .set(demoHeaders())
    .send({
      planId: 'family',
      cycle: 'yearly',
      paymentType: 'pix',
    });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'pix');
  assert.ok(res.body.payment.point_of_interaction.transaction_data.qr_code);
  assert.equal(res.body.payment.payment_method_id, 'pix');
});

test('POST /subscriptions/simulate-payment activates upgraded plan for user', async () => {
  const res = await request(app)
    .post('/subscriptions/simulate-payment')
    .set(demoHeaders())
    .send({
      planId: 'clinical',
      cycle: 'yearly',
      paymentId: 'test_mp_pay_123',
    });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.subscription.planId, 'clinical');
  assert.equal(res.body.subscription.maxCapsules, 9999);
  assert.equal(res.body.subscription.maxDevices, 0);
});

test('POST /subscriptions/pay-card processes credit card payment and upgrades plan', async () => {
  const res = await request(app)
    .post('/subscriptions/pay-card')
    .set(demoHeaders())
    .send({
      planId: 'clinical',
      cycle: 'yearly',
      cardData: {
        cardNumber: '5555444433332222',
        holderName: 'VAGNER IBAS',
        expiry: '12/28',
        cvv: '999',
        cpf: '12345678901',
        brand: 'Mastercard',
        installments: 3,
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.subscription.planId, 'clinical');
  assert.equal(res.body.subscription.paymentMethod, 'mercado_pago_credit_card');
  assert.equal(res.body.subscription.cardLastFour, '2222');
  assert.equal(res.body.subscription.installments, 3);
});

test('POST /subscriptions/pay-card rejects invalid card number', async () => {
  const res = await request(app)
    .post('/subscriptions/pay-card')
    .set(demoHeaders())
    .send({
      planId: 'clinical',
      cycle: 'monthly',
      cardData: {
        cardNumber: '123',
        holderName: 'VAGNER IBAS',
        expiry: '12/28',
        cvv: '999',
      },
    });

  assert.equal(res.status, 400);
  assert.match(res.body.detail, /inválido/i);
});

test('POST /subscriptions/webhook receives and acknowledges Mercado Pago event', async () => {
  const res = await request(app)
    .post('/subscriptions/webhook')
    .send({
      action: 'payment.created',
      type: 'payment',
      data: { id: '123456789' },
    });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(res.body.resourceId, '123456789');
});
