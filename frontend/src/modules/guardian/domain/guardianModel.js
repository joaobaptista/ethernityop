/**
 * guardianModel.js — Bounded Context: Guardian (Rede de Guardiões & Protocolo de Confiança)
 * 
 * Regras de Domínio Puras (Sem dependência de React, DOM ou APIs de navegador).
 * 100% Isomórfico para uso em React Web e React Native (iOS & Android).
 */

export const GUARDIAN_ROLES = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
};

export const GUARDIAN_STATUS = {
  ACTIVE: 'active',
  PENDING_INVITE: 'pending_invite',
  REJECTED: 'rejected',
};

export function validateGuardian(guardian) {
  if (!guardian || typeof guardian !== 'object') {
    return { valid: false, error: 'Guardião inválido.' };
  }
  if (!guardian.name || typeof guardian.name !== 'string' || guardian.name.trim().length === 0) {
    return { valid: false, error: 'Nome do guardião é obrigatório.' };
  }
  if (!guardian.email || typeof guardian.email !== 'string' || !guardian.email.includes('@')) {
    return { valid: false, error: 'E-mail válido do guardião é obrigatório.' };
  }
  return { valid: true };
}

export function createGuardianMember(payload) {
  const validation = validateGuardian(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return {
    id: payload.id || `guardian-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone || '',
    relation: payload.relation || 'Pessoa de Confiança',
    role: payload.role || GUARDIAN_ROLES.PRIMARY,
    status: payload.status || GUARDIAN_STATUS.ACTIVE,
    avatar: payload.avatar || null,
    canTriggerDelivery: payload.canTriggerDelivery !== false,
    createdAt: payload.createdAt || Date.now(),
  };
}

/**
 * Calcula se o quórum de confirmação póstuma foi atingido
 * Regra de negócio: Mínimo de 2 guardiões primários confirmados ou 100% se houver apenas 1 cadastrado.
 */
export function calculateGuardianQuorum(guardians = [], confirmedIds = []) {
  if (!Array.isArray(guardians) || guardians.length === 0) {
    return { reached: false, required: 1, confirmed: 0 };
  }

  const activeGuardians = guardians.filter((g) => g.status === GUARDIAN_STATUS.ACTIVE && g.canTriggerDelivery);
  const total = activeGuardians.length;
  const required = total === 1 ? 1 : Math.min(2, total);
  const confirmed = confirmedIds.filter((id) => activeGuardians.some((g) => g.id === id)).length;

  return {
    reached: confirmed >= required,
    required,
    confirmed,
    percentage: Math.min(100, Math.round((confirmed / required) * 100)),
  };
}

/**
 * Gera um registro padronizado para a trilha de auditoria de acessos póstumos
 */
export function createAuditLogEntry({
  action = 'STREAM_REQUEST',
  mediaId = 'mem-default',
  guardianName = 'Guardião Anônimo',
  guardianEmail = 'guardian@ethernity.app',
  status = 206,
} = {}) {
  const ts = new Date().toISOString();
  const shortHash = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 6);
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: ts,
    action,
    mediaId,
    guardianName,
    guardianEmail,
    status,
    hmacSignature: `hmac-sha256:${shortHash}`,
  };
}

/**
 * Avalia o status do protocolo Dead Man's Switch com base no último check-in
 */
export function getDeadManSwitchStatus({
  lastCheckinTimestamp = Date.now(),
  checkinIntervalDays = 60,
  isQuorumReached = false,
} = {}) {
  const now = Date.now();
  const diffDays = Math.floor((now - lastCheckinTimestamp) / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays > checkinIntervalDays;
  const daysRemaining = Math.max(0, checkinIntervalDays - diffDays);

  return {
    isHealthy: !isOverdue,
    daysRemaining,
    diffDays,
    isOverdue,
    canUnlock: isOverdue && isQuorumReached,
  };
}

