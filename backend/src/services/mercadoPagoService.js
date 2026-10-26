/**
 * mercadoPagoService.js
 * Serviço de integração com o gateway de pagamentos Mercado Pago (PIX, Cartão e Checkout Pro).
 */
import crypto from 'node:crypto';

// Credenciais configuráveis via variáveis de ambiente
const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
const MP_PUBLIC_KEY = process.env.MERCADO_PAGO_PUBLIC_KEY || 'TEST-00000000-0000-0000-0000-000000000000';

export const PLANS_CONFIG = {
  free: {
    id: 'free',
    name: 'Gratuito / Essencial',
    priceMonthly: 0,
    priceYearly: 0,
    maxCapsules: 5,
    maxGuardians: 2,
    storageGb: 5,
    maxDevices: 0,
    maxGeofences: 0,
    historyDays: 30,
    features: [
      'Até 5 Cápsulas do Tempo',
      '2 Guardiões de Confiança',
      '5 GB no Cofre Criptografado',
      'Criptografia Zero-Knowledge AES-256-GCM',
    ],
  },
  family: {
    id: 'family',
    name: 'Legado Familiar',
    priceMonthly: 29.90,
    priceYearly: 299.00, // Economia de 2 meses
    maxCapsules: 50,
    maxGuardians: 10,
    storageGb: 100,
    maxDevices: 0,
    maxGeofences: 0,
    historyDays: 365,
    popular: true,
    features: [
      'Até 50 Cápsulas do Tempo',
      'Até 10 Guardiões de Confiança',
      '100 GB no Cofre Criptografado',
      'Narração e Gravação com Foto Original',
      'Assistente de Ideação de Cartas com IA Local',
      'Suporte a Apple Live Photos e Formato .HEIC',
    ],
  },
  clinical: {
    id: 'clinical',
    name: 'Patrimonial & Eterno',
    priceMonthly: 79.90,
    priceYearly: 799.00,
    maxCapsules: 9999,
    maxGuardians: 9999,
    storageGb: 1000,
    maxDevices: 0,
    maxGeofences: 0,
    historyDays: 9999,
    features: [
      'Cápsulas e Cartas Ilimitadas',
      'Guardiões de Confiança Ilimitados',
      '1 TB de Armazenamento Seguro',
      'Protocolo Dead Man Switch com Quórum Avançado',
      'Exportação Gráfica Fine-Art para Impressão 300 DPI',
      'Suporte e Consultoria de Legado Prioritário 24/7',
    ],
  },
  infinity: {
    id: 'infinity',
    name: 'Plano Infinity (Liberado Tudo)',
    priceMonthly: 0,
    priceYearly: 0,
    maxCapsules: 9999,
    maxGuardians: 9999,
    storageGb: 9999,
    maxDevices: 0,
    maxGeofences: 0,
    historyDays: 9999,
    features: [
      'Criação Ilimitada de Cápsulas e Destinatários',
      'Guardiões e Cofre Ilimitados',
      'Acesso Irrestrito a Todos os Recursos e IA',
      'Armazenamento Perpétuo com Criptografia Militar',
    ],
  },
};

/**
 * Cria uma preferência de Checkout do Mercado Pago
 */
export async function createCheckoutPreference({ planId, cycle = 'monthly', user, backUrls = {} }) {
  const plan = PLANS_CONFIG[planId];
  if (!plan) {
    throw new Error(`Plano inválido: ${planId}`);
  }

  const unitPrice = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const preferenceId = `pref_mp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const title = `Ethernity DMS — Plano ${plan.name} (${cycle === 'yearly' ? 'Anual' : 'Mensal'})`;

  // Em produção, aqui chamaria a API oficial: POST https://api.mercadopago.com/checkout/preferences
  const preferenceData = {
    id: preferenceId,
    items: [
      {
        id: `${plan.id}_${cycle}`,
        title,
        description: `Assinatura de telemetria e monitoramento de saúde do paciente (${cycle === 'yearly' ? '12 meses com desconto' : 'mensal recorrente'})`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: unitPrice,
      },
    ],
    payer: {
      name: user.name || 'Cuidador Familiar',
      email: user.email,
    },
    back_urls: {
      success: backUrls.success || 'http://localhost:5173/?status=success',
      pending: backUrls.pending || 'http://localhost:5173/?status=pending',
      failure: backUrls.failure || 'http://localhost:5173/?status=failure',
    },
    auto_return: 'approved',
    external_reference: JSON.stringify({ userId: user.id, planId, cycle }),
    init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${preferenceId}`,
    sandbox_init_point: `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=${preferenceId}`,
  };

  return preferenceData;
}

/**
 * Cria um pagamento direto via PIX instantâneo do Mercado Pago
 */
export async function createPixPayment({ planId, cycle = 'monthly', user }) {
  const plan = PLANS_CONFIG[planId];
  if (!plan) {
    throw new Error(`Plano inválido: ${planId}`);
  }

  const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const paymentId = `mp_pix_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  // Código Copia-e-Cola PIX padrão Banco Central / Mercado Pago (EMV BR Code)
  const qrCodeText = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}520400005303986540${amount.toFixed(2)}5802BR5913ETHERNITY DMS6009SAO PAULO62070503***6304${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  
  // Em produção, aqui chamaria: POST https://api.mercadopago.com/v1/payments com payment_method_id: 'pix'
  return {
    id: paymentId,
    status: 'pending',
    status_detail: 'waiting_transfer',
    transaction_amount: amount,
    date_created: new Date().toISOString(),
    date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    payment_method_id: 'pix',
    point_of_interaction: {
      type: 'CHECKOUT',
      transaction_data: {
        qr_code: qrCodeText,
        qr_code_base64: '', // QR visual pode ser renderizado no front via canvas/svg
        ticket_url: `https://www.mercadopago.com.br/payments/${paymentId}/ticket`,
      },
    },
    planId,
    cycle,
    userId: user.id,
  };
}

/**
 * Processa a notificação de Webhook enviada pelo Mercado Pago
 */
export function processWebhook(payload) {
  const { action, type, data } = payload || {};
  return {
    received: true,
    action: action || 'payment.updated',
    resourceId: data?.id || 'unknown',
    processedAt: new Date().toISOString(),
  };
}

export default {
  PLANS_CONFIG,
  createCheckoutPreference,
  createPixPayment,
  processWebhook,
};
