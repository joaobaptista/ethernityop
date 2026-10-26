/**
 * routes/subscriptions.js
 * Endpoints REST para planos de assinatura e integração com Mercado Pago.
 */
import { Router } from 'express';
import { requireAuth, isRootAdminEmail } from '../auth.js';
import config from '../config.js';
import { store, findUserById } from '../db.js';
import { pool } from '../db/mysql.js';
import { uuid } from '../seed.js';
import mercadoPagoService, { PLANS_CONFIG } from '../services/mercadoPagoService.js';

const router = Router();

/**
 * GET /subscriptions/plans
 * Retorna todos os planos disponíveis, preços e recursos
 */
router.get('/subscriptions/plans', (_req, res) => {
  const publicPlans = Object.values(PLANS_CONFIG).filter((p) => p.id !== 'infinity');
  return res.json({
    plans: publicPlans,
    currency: 'BRL',
    supportedPaymentMethods: ['pix', 'credit_card', 'debit_card', 'mercado_pago_checkout'],
  });
});

/**
 * GET /subscriptions/current
 * Retorna a assinatura ativa do usuário autenticado e seus limites
 */
router.get('/subscriptions/current', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  let dbSubData = null;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (rows && rows.length > 0) {
      const dbSub = rows[0];
      const plan = PLANS_CONFIG[dbSub.plan_id] || PLANS_CONFIG.infinity || PLANS_CONFIG.free;
      dbSubData = {
        id: dbSub.id,
        planId: dbSub.plan_id,
        planName: plan.name,
        status: dbSub.status,
        cycle: dbSub.billing_cycle || 'monthly',
        maxDevices: plan.maxDevices,
        maxGeofences: plan.maxGeofences,
        historyDays: plan.historyDays,
        expiresAt: dbSub.current_period_end,
        paymentMethod: dbSub.payment_method,
      };
    }
  } catch (err) {
    console.warn('[Subscriptions] Erro ao buscar assinatura no MySQL:', err.message);
  }

  const user = findUserById(userId) || req.user;
  const isVagner =
    isRootAdminEmail(user?.email) ||
    user?.plan === 'Plano Infinity' ||
    user?.plan_id === 'infinity';

  const userPlan = isVagner ? 'infinity' : (user?.plan_id || (user?.plan === 'Plano Infinity' ? 'infinity' : 'free'));
  const defaultPlan = PLANS_CONFIG[userPlan] || PLANS_CONFIG.free;

  const subscription = user?.subscription || dbSubData || {
    planId: defaultPlan.id,
    planName: defaultPlan.name,
    status: 'active',
    cycle: 'monthly',
    maxCapsules: defaultPlan.maxCapsules || 50,
    maxGuardians: defaultPlan.maxGuardians || 10,
    storageGb: defaultPlan.storageGb || 100,
    maxDevices: 0,
    maxGeofences: 0,
    historyDays: defaultPlan.historyDays,
    expiresAt: null,
  };

  return res.json({
    subscription,
    usage: {
      capsulesCount: 0,
      capsulesLimit: subscription.maxCapsules || 50,
      guardiansCount: 0,
      guardiansLimit: subscription.maxGuardians || 10,
      storageGbUsed: 0,
      storageGbLimit: subscription.storageGb || 100,
      devicesCount: 0,
      devicesLimit: subscription.maxDevices || 0,
      areasCount: 0,
      areasLimit: subscription.maxGeofences || 0,
    },
  });
});

/**
 * POST /subscriptions/create-preference
 * Cria uma transação de pagamento no Mercado Pago (PIX ou Checkout Pro)
 */
router.post('/subscriptions/create-preference', requireAuth, async (req, res) => {
  // A integração com o Mercado Pago ainda é simulada (PIX com chave aleatória, checkout fictício):
  // em produção não pode ser exibida a clientes reais.
  if (!config.paymentSimulationEnabled) {
    return res.status(503).json({ detail: 'Pagamentos online ainda não estão disponíveis.' });
  }

  const { planId, cycle = 'monthly', paymentType = 'pix', backUrls } = req.body;

  if (!PLANS_CONFIG[planId]) {
    return res.status(400).json({ detail: `Plano inválido: ${planId}` });
  }

  try {
    if (paymentType === 'pix') {
      const pixPayment = await mercadoPagoService.createPixPayment({
        planId,
        cycle,
        user: req.user,
      });
      return res.json({
        type: 'pix',
        payment: pixPayment,
      });
    }

    // Checkout Pro Padrão
    const preference = await mercadoPagoService.createCheckoutPreference({
      planId,
      cycle,
      user: req.user,
      backUrls,
    });

    return res.json({
      type: 'checkout_pro',
      preference,
    });
  } catch (err) {
    console.error('Erro ao gerar pagamento Mercado Pago:', err);
    return res.status(500).json({ detail: 'Erro ao processar pagamento' });
  }
});

/**
 * POST /subscriptions/simulate-payment
 * Simula a confirmação imediata do pagamento (PIX / Cartão) em ambiente de demonstração
 */
router.post('/subscriptions/simulate-payment', requireAuth, async (req, res) => {
  if (!config.paymentSimulationEnabled) {
    return res.status(403).json({ detail: 'Pagamento simulado desabilitado neste ambiente.' });
  }

  const { planId, cycle = 'monthly', paymentId } = req.body;
  const plan = PLANS_CONFIG[planId];

  if (!plan) {
    return res.status(400).json({ detail: `Plano inválido: ${planId}` });
  }

  const userId = req.user?.id;
  const user = findUserById(userId) || req.user;
  if (!user) {
    return res.status(404).json({ detail: 'Usuário não encontrado' });
  }

  const durationDays = cycle === 'yearly' ? 365 : 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const subId = `sub-${uuid().slice(0, 12)}`;

  // 1. Persistir no MySQL
  try {
    await pool.query(
      `INSERT INTO subscriptions (
        id, user_id, plan_id, status, price_formatted, billing_cycle,
        payment_method, current_period_start, current_period_end, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, 'mercado_pago_pix', NOW(3), DATE_ADD(NOW(3), INTERVAL ? DAY), NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        plan_id = VALUES(plan_id),
        status = 'active',
        billing_cycle = VALUES(billing_cycle),
        current_period_end = VALUES(current_period_end),
        updated_at = NOW(3)`,
      [subId, userId, plan.id, `R$ ${plan.priceMonthly}`, cycle, durationDays]
    );

    await pool.query('UPDATE users SET plan_id = ?, updated_at = NOW(3) WHERE id = ?', [plan.id, userId]);
  } catch (dbErr) {
    console.warn('[Subscriptions] Erro ao persistir no MySQL:', dbErr.message);
  }

  // 2. Atualiza assinatura no banco em memória
  user.subscription = {
    id: subId,
    planId: plan.id,
    planName: plan.name,
    status: 'active',
    cycle,
    maxCapsules: plan.maxCapsules,
    maxGuardians: plan.maxGuardians,
    storageGb: plan.storageGb,
    maxDevices: plan.maxDevices,
    maxGeofences: plan.maxGeofences,
    historyDays: plan.historyDays,
    expiresAt,
    paymentMethod: 'mercado_pago_pix',
    lastPaymentId: paymentId || `mp_${Date.now()}`,
    updatedAt: new Date().toISOString(),
  };

  return res.json({
    success: true,
    message: `Plano "${plan.name}" ativado com sucesso!`,
    subscription: user.subscription,
  });
});

/**
 * POST /subscriptions/pay-card
 * Processa pagamento com cartão de crédito ou débito direto via Mercado Pago Checkout Transparente
 */
router.post('/subscriptions/pay-card', requireAuth, async (req, res) => {
  if (!config.paymentSimulationEnabled) {
    return res.status(403).json({ detail: 'Pagamento simulado desabilitado neste ambiente.' });
  }

  const { planId, cycle = 'monthly', cardData } = req.body;
  const plan = PLANS_CONFIG[planId];

  if (!plan) {
    return res.status(400).json({ detail: `Plano inválido: ${planId}` });
  }

  const userId = req.user?.id;
  const user = findUserById(userId) || req.user;
  if (!user) {
    return res.status(404).json({ detail: 'Usuário não encontrado' });
  }

  const cardNumberClean = (cardData?.cardNumber || '').replace(/\D/g, '');
  if (!cardNumberClean || cardNumberClean.length < 13 || cardNumberClean.length > 19) {
    return res.status(400).json({ detail: 'Número de cartão inválido' });
  }

  if (!cardData?.holderName || cardData.holderName.trim().length < 3) {
    return res.status(400).json({ detail: 'Nome do titular é obrigatório' });
  }

  if (!cardData?.expiry || !cardData.expiry.includes('/')) {
    return res.status(400).json({ detail: 'Data de validade inválida (MM/AA)' });
  }

  const cvvClean = (cardData?.cvv || '').replace(/\D/g, '');
  if (!cvvClean || cvvClean.length < 3 || cvvClean.length > 4) {
    return res.status(400).json({ detail: 'Código de segurança (CVV) inválido' });
  }

  const cardType = cardData?.cardType === 'debit' ? 'debit' : 'credit';
  const durationDays = cycle === 'yearly' ? 365 : 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const lastFour = cardNumberClean.slice(-4);
  const paymentId = `mp_${cardType === 'debit' ? 'db' : 'cc'}_${Date.now()}`;
  const subId = `sub-${uuid().slice(0, 12)}`;
  const paymentMethod = cardType === 'debit' ? 'mercado_pago_debit_card' : 'mercado_pago_credit_card';

  // 1. Persistir no MySQL
  try {
    await pool.query(
      `INSERT INTO subscriptions (
        id, user_id, plan_id, status, price_formatted, billing_cycle,
        payment_method, current_period_start, current_period_end, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, NOW(3), DATE_ADD(NOW(3), INTERVAL ? DAY), NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        plan_id = VALUES(plan_id),
        status = 'active',
        billing_cycle = VALUES(billing_cycle),
        current_period_end = VALUES(current_period_end),
        updated_at = NOW(3)`,
      [subId, userId, plan.id, `R$ ${plan.priceMonthly}`, cycle, paymentMethod, durationDays]
    );

    await pool.query('UPDATE users SET plan_id = ?, updated_at = NOW(3) WHERE id = ?', [plan.id, userId]);
  } catch (dbErr) {
    console.warn('[Subscriptions] Erro ao persistir cartão no MySQL:', dbErr.message);
  }

  user.subscription = {
    id: subId,
    planId: plan.id,
    planName: plan.name,
    status: 'active',
    cycle,
    maxCapsules: plan.maxCapsules,
    maxGuardians: plan.maxGuardians,
    storageGb: plan.storageGb,
    maxDevices: plan.maxDevices,
    maxGeofences: plan.maxGeofences,
    historyDays: plan.historyDays,
    expiresAt,
    paymentMethod,
    cardType,
    cardBrand: cardData.brand || 'Mastercard',
    cardLastFour: lastFour,
    installments: cardType === 'debit' ? 1 : (Number(cardData.installments) || 1),
    lastPaymentId: paymentId,
    updatedAt: new Date().toISOString(),
  };

  const typeLabel = cardType === 'debit' ? 'débito' : 'crédito';
  return res.json({
    success: true,
    message: `Pagamento com cartão de ${typeLabel} aprovado! Plano "${plan.name}" ativado com sucesso.`,
    paymentId,
    subscription: user.subscription,
  });
});

/**
 * POST /subscriptions/webhook
 * Webhook oficial para receber notificações de pagamento do Mercado Pago
 */
router.post('/subscriptions/webhook', (req, res) => {
  const result = mercadoPagoService.processWebhook(req.body);
  return res.status(200).json(result);
});

export default router;
