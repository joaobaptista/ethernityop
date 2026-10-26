import { describe, it, expect } from 'vitest';
import {
  GUARDIAN_ROLES,
  GUARDIAN_STATUS,
  validateGuardian,
  createGuardianMember,
  calculateGuardianQuorum,
  createAuditLogEntry,
  getDeadManSwitchStatus,
} from './guardianModel.js';

describe('guardianModel Domain Rules', () => {
  it('validates correct guardian information', () => {
    const valid = validateGuardian({
      name: 'Dra. Helena Costa',
      email: 'helena@advocacia.com',
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects invalid guardian name or email', () => {
    const noName = validateGuardian({ name: '', email: 'teste@exemplo.com' });
    expect(noName.valid).toBe(false);

    const invalidEmail = validateGuardian({ name: 'Helena', email: 'not-an-email' });
    expect(invalidEmail.valid).toBe(false);
  });

  it('creates standardized GuardianMember entities', () => {
    const guardian = createGuardianMember({
      name: 'Carlos Oliveira',
      email: 'carlos@exemplo.com',
      relation: 'Irmão',
      role: GUARDIAN_ROLES.PRIMARY,
    });

    expect(guardian.id).toBeDefined();
    expect(guardian.name).toBe('Carlos Oliveira');
    expect(guardian.canTriggerDelivery).toBe(true);
    expect(guardian.status).toBe(GUARDIAN_STATUS.ACTIVE);
  });

  it('calculates guardian quorum rules for posthumous release', () => {
    const g1 = createGuardianMember({ id: 'g-1', name: 'G1', email: 'g1@test.com' });
    const g2 = createGuardianMember({ id: 'g-2', name: 'G2', email: 'g2@test.com' });
    const g3 = createGuardianMember({ id: 'g-3', name: 'G3', email: 'g3@test.com' });

    // With 3 guardians, required quorum is 2
    const quorumNotReached = calculateGuardianQuorum([g1, g2, g3], ['g-1']);
    expect(quorumNotReached.reached).toBe(false);
    expect(quorumNotReached.required).toBe(2);
    expect(quorumNotReached.confirmed).toBe(1);

    const quorumReached = calculateGuardianQuorum([g1, g2, g3], ['g-1', 'g-2']);
    expect(quorumReached.reached).toBe(true);
    expect(quorumReached.confirmed).toBe(2);
  });

  it('creates structured cryptographic audit log entry', () => {
    const log = createAuditLogEntry({
      action: 'STREAM_VIDEO_REQUEST',
      mediaId: 'video-123',
      guardianName: 'João da Silva',
      guardianEmail: 'joao@email.com',
      status: 206,
    });

    expect(log.id).toBeDefined();
    expect(log.action).toBe('STREAM_VIDEO_REQUEST');
    expect(log.status).toBe(206);
    expect(log.hmacSignature).toContain('hmac-sha256:');
    expect(log.guardianEmail).toBe('joao@email.com');
  });

  it('evaluates dead man switch status and health check window', () => {
    const now = Date.now();
    // Check-in feito há 10 dias (intervalo 60 dias)
    const healthy = getDeadManSwitchStatus({
      lastCheckinTimestamp: now - 10 * 24 * 60 * 60 * 1000,
      checkinIntervalDays: 60,
      isQuorumReached: false,
    });
    expect(healthy.isHealthy).toBe(true);
    expect(healthy.isOverdue).toBe(false);
    expect(healthy.canUnlock).toBe(false);

    // Check-in atrasado há 70 dias com quórum atingido
    const overdueAndUnlocked = getDeadManSwitchStatus({
      lastCheckinTimestamp: now - 70 * 24 * 60 * 60 * 1000,
      checkinIntervalDays: 60,
      isQuorumReached: true,
    });
    expect(overdueAndUnlocked.isHealthy).toBe(false);
    expect(overdueAndUnlocked.isOverdue).toBe(true);
    expect(overdueAndUnlocked.canUnlock).toBe(true);
  });
});

