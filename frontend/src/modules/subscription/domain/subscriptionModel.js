/**
 * subscriptionModel.js — Modelo de Domínio para Planos de Assinatura Ethernity DMS
 * Regras de limites de uso, cálculo de preços por ciclo e verificação de recursos.
 */

export const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    key: 'free',
    name: 'Gratuito / Essencial',
    priceMonthly: 0,
    priceYearly: 0,
    maxCapsules: 5,
    maxGuardians: 2,
    storageGb: 5,
    maxRecipients: 2,
    historyDays: 30,
    tier: 1,
    // Compatibilidade retroativa
    maxDevices: 1,
    maxGeofences: 2,
  },
  family: {
    id: 'family',
    key: 'family',
    name: 'Legado Familiar',
    priceMonthly: 29.90,
    priceYearly: 299.00,
    maxCapsules: 50,
    maxGuardians: 10,
    storageGb: 100,
    maxRecipients: 5,
    historyDays: 365,
    popular: true,
    tier: 2,
    // Compatibilidade retroativa
    maxDevices: 3,
    maxGeofences: 999,
  },
  clinical: {
    id: 'clinical',
    key: 'clinical',
    name: 'Patrimonial & Eterno',
    priceMonthly: 79.90,
    priceYearly: 799.00,
    maxCapsules: 9999,
    maxGuardians: 9999,
    storageGb: 1000,
    maxRecipients: 999,
    historyDays: 9999,
    tier: 3,
    // Compatibilidade retroativa
    maxDevices: 10,
    maxGeofences: 999,
  },
  infinity: {
    id: 'infinity',
    key: 'infinity',
    name: 'Plano Infinity (Liberado Tudo)',
    priceMonthly: 0,
    priceYearly: 0,
    maxCapsules: 9999,
    maxGuardians: 9999,
    storageGb: 9999,
    maxRecipients: 9999,
    historyDays: 9999,
    tier: 99,
    // Compatibilidade retroativa
    maxDevices: 9999,
    maxGeofences: 9999,
  },
};

/**
 * Verifica se um usuário possui liberação irrestrita (admin/desenvolvedor como Vagner)
 */
export function isUserUnlimited(userOrProfile = null) {
  if (!userOrProfile) {
    try {
      const stored = localStorage.getItem('ethernity_user');
      if (stored) {
        userOrProfile = JSON.parse(stored);
      }
    } catch {}
  }
  if (!userOrProfile) return false;
  const email = (userOrProfile.email || '').toLowerCase();
  const role = (userOrProfile.role || '').toLowerCase();
  const plan = (userOrProfile.plan || userOrProfile.plan_id || userOrProfile.planId || '').toLowerCase();

  return (
    email === 'demo@ethernity.com' ||
    email === 'vameri@gmail.com' ||
    role === 'admin' ||
    plan === 'infinity' ||
    plan.includes('infinity')
  );
}

/**
 * Retorna o plano efetivo do usuário considerando liberação automática
 */
export function getEffectiveUserPlan(subscription = null, userOrProfile = null) {
  if (isUserUnlimited(userOrProfile)) {
    return SUBSCRIPTION_PLANS.infinity;
  }
  const planId = subscription?.planId || 'free';
  return SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.free;
}

/**
 * Calcula a economia percentual ao assinar o plano anual
 */
export function calculateYearlyDiscount(plan) {
  if (!plan || !plan.priceMonthly || !plan.priceYearly) return 0;
  const fullYearPrice = plan.priceMonthly * 12;
  const savings = ((fullYearPrice - plan.priceYearly) / fullYearPrice) * 100;
  return Math.round(savings);
}

/**
 * Formata valor monetário para o padrão BRL (R$ 29,90)
 */
export function formatCurrency(amount, currency = 'BRL', locale = 'pt-BR') {
  if (typeof amount !== 'number' || isNaN(amount)) return 'R$ 0,00';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Verifica se o usuário pode criar mais uma cápsula no plano atual
 */
export function canAddCapsule(currentCapsulesCount = 0, subscription = null, userOrProfile = null) {
  const plan = getEffectiveUserPlan(subscription, userOrProfile);
  return currentCapsulesCount < plan.maxCapsules;
}

/**
 * Verifica se o usuário pode adicionar mais um guardião no plano atual
 */
export function canAddGuardian(currentGuardiansCount = 0, subscription = null, userOrProfile = null) {
  const plan = getEffectiveUserPlan(subscription, userOrProfile);
  return currentGuardiansCount < plan.maxGuardians;
}

/**
 * Compatibilidade: Verifica se o usuário pode adicionar mais um dispositivo
 */
export function canAddDevice(currentDevicesCount = 0, subscription = null, userOrProfile = null) {
  const plan = getEffectiveUserPlan(subscription, userOrProfile);
  return currentDevicesCount < plan.maxDevices;
}

/**
 * Compatibilidade: Verifica se o usuário pode criar mais uma cerca virtual
 */
export function canAddGeofence(currentGeofencesCount = 0, subscription = null, userOrProfile = null) {
  const plan = getEffectiveUserPlan(subscription, userOrProfile);
  return currentGeofencesCount < plan.maxGeofences;
}

/**
 * Verifica se um recurso específico está disponível no plano
 */
export function isFeatureAvailable(featureKey, subscription = null, userOrProfile = null) {
  const plan = getEffectiveUserPlan(subscription, userOrProfile);

  switch (featureKey) {
    case 'fine_art_export':
    case 'indoor_monitoring':
    case 'export_reports':
    case 'sla_priority':
      return plan.tier >= 3;
    case 'ai_letter_ideation':
    case 'live_photos_sync':
    case 'dead_man_switch_advanced':
    case 'unlimited_geofences':
    case 'priority_push':
    case 'multi_caregivers':
    case 'history_30_days':
      return plan.tier >= 2;
    default:
      return true;
  }
}
