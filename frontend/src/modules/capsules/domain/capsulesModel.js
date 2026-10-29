/**
 * capsulesModel.js — Bounded Context: Capsules (Cápsulas do Tempo & Entregas Programadas)
 * 
 * Regras de Domínio Puras (Sem dependência de React, DOM ou APIs de navegador).
 * 100% Isomórfico para uso em React Web e React Native (iOS & Android).
 */

export const CAPSULE_STATUS = {
  DRAFT: 'draft',
  SEALED: 'sealed',
  PENDING_GUARDIAN_APPROVAL: 'pending_guardian_approval',
  DELIVERED: 'delivered',
};

export const CAPSULE_TRIGGERS = {
  DATE_SPECIFIC: 'date_specific',
  AGE_MILESTONE: 'age_milestone',
  POSTHUMOUS: 'posthumous',
};

export function validateCapsule(capsule) {
  if (!capsule || typeof capsule !== 'object') {
    return { valid: false, error: 'Cápsula inválida.' };
  }
  if (!capsule.title || typeof capsule.title !== 'string' || capsule.title.trim().length === 0) {
    return { valid: false, error: 'Título da cápsula é obrigatório.' };
  }
  if (!capsule.recipient || typeof capsule.recipient !== 'string' || capsule.recipient.trim().length === 0) {
    return { valid: false, error: 'Destinatário da cápsula é obrigatório.' };
  }
  const validTriggers = Object.values(CAPSULE_TRIGGERS);
  if (capsule.triggerType && !validTriggers.includes(capsule.triggerType)) {
    return { valid: false, error: `Tipo de gatilho inválido. Tipos suportados: ${validTriggers.join(', ')}` };
  }
  return { valid: true };
}

export function createTimeCapsule(payload) {
  const validation = validateCapsule(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return {
    id: payload.id || `capsule-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    title: payload.title.trim(),
    recipient: payload.recipient.trim(),
    recipientAvatar: payload.recipientAvatar || null,
    triggerType: payload.triggerType || CAPSULE_TRIGGERS.DATE_SPECIFIC,
    scheduledDate: payload.scheduledDate || null,
    milestoneAge: payload.milestoneAge ? Number(payload.milestoneAge) : null,
    status: payload.status || CAPSULE_STATUS.SEALED,
    items: Array.isArray(payload.items) ? payload.items : [],
    requiresGuardianQuorum: payload.triggerType === CAPSULE_TRIGGERS.POSTHUMOUS || Boolean(payload.requiresGuardianQuorum),
    isEncrypted: payload.isEncrypted !== false,
    createdAt: payload.createdAt || Date.now(),
  };
}

export function canDeliverCapsule(capsule, now = new Date()) {
  if (!capsule) return false;
  if (capsule.status === CAPSULE_STATUS.DELIVERED) return false;

  if (capsule.triggerType === CAPSULE_TRIGGERS.DATE_SPECIFIC && capsule.scheduledDate) {
    const target = new Date(capsule.scheduledDate);
    return now >= target;
  }

  return false;
}

/**
 * Rótulos de entrega derivados apenas do que o usuário definiu (sem datas presumidas).
 */
export function describeCapsuleDelivery(capsule = {}) {
  if (capsule.deliveryType === 'posthumous') {
    return { triggerLabel: 'Liberação póstuma (guardiões)', statusText: 'Aguardando o protocolo dos guardiões' };
  }
  const date = capsule.scheduledDate ? new Date(capsule.scheduledDate) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const label = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { triggerLabel: `Entrega em ${label}`, statusText: 'Bloqueada até a data' };
  }
  return { triggerLabel: 'Data de entrega a definir', statusText: 'Rascunho: defina a entrega' };
}
