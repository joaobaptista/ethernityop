import { describe, it, expect } from 'vitest';
import { INITIAL_GUARDIANS, SAMPLE_FIXTURE_GUARDIANS, filterUnlockedMedia } from './GuardianView.jsx';
import {
  calculateGuardianQuorum,
  createAuditLogEntry,
  getDeadManSwitchStatus,
} from '../domain/guardianModel.js';

describe('GuardianView Logic & Dead Man\'s Switch Presentation Tests', () => {
  it('inicia com ambiente virgem sem guardiões mockados', () => {
    expect(INITIAL_GUARDIANS).toEqual([]);
  });

  it('valida configuração de fixtures de guardiões de teste', () => {
    expect(SAMPLE_FIXTURE_GUARDIANS.length).toBeGreaterThanOrEqual(3);

    SAMPLE_FIXTURE_GUARDIANS.forEach((g) => {
      expect(g.id).toBeDefined();
      expect(g.name).toBeTruthy();
      expect(g.email).toContain('@');
      expect(g.canTriggerDelivery).toBe(true);
      expect(g.avatar).toBeTruthy();
    });
  });

  it('filters unlocked media items by category accurately', () => {
    const mockItems = [
      { id: '1', title: 'Vídeo Póstumo', type: 'video' },
      { id: '2', title: 'Áudio com Conselhos', type: 'audio' },
      { id: '3', title: 'Foto de Família', type: 'photo' },
      { id: '4', title: 'Carta Afetiva', type: 'letter' },
    ];

    expect(filterUnlockedMedia(mockItems, 'all')).toHaveLength(4);
    expect(filterUnlockedMedia(mockItems, 'video')).toHaveLength(1);
    expect(filterUnlockedMedia(mockItems, 'video')[0].id).toBe('1');
    expect(filterUnlockedMedia(mockItems, 'audio')).toHaveLength(1);
    expect(filterUnlockedMedia(mockItems, 'audio')[0].id).toBe('2');
    expect(filterUnlockedMedia(mockItems, 'photo')).toHaveLength(1);
    expect(filterUnlockedMedia(mockItems, 'letter')).toHaveLength(1);
    expect(filterUnlockedMedia(null, 'all')).toEqual([]);
    expect(filterUnlockedMedia(mockItems, '')).toHaveLength(4);
  });

  it('correctly calculates quorum progression from sample guardians list', () => {
    // 2 active guardians (João and Pedro), Ana is pending
    const initialStatus = calculateGuardianQuorum(SAMPLE_FIXTURE_GUARDIANS, ['g-1']);
    expect(initialStatus.required).toBe(2);
    expect(initialStatus.confirmed).toBe(1);
    expect(initialStatus.percentage).toBe(50);
    expect(initialStatus.reached).toBe(false);

    // When both active guardians confirm
    const unlockedStatus = calculateGuardianQuorum(SAMPLE_FIXTURE_GUARDIANS, ['g-1', 'g-2']);
    expect(unlockedStatus.confirmed).toBe(2);
    expect(unlockedStatus.percentage).toBe(100);
    expect(unlockedStatus.reached).toBe(true);
  });

  it('generates cryptographic audit logs with valid HMAC hashes', () => {
    const log = createAuditLogEntry({
      action: 'STREAM_VIDEO_REQUEST',
      mediaId: 'mem-video-1',
      guardianName: 'João da Silva',
      guardianEmail: 'joao@email.com',
      status: 206,
    });

    expect(log.id).toBeDefined();
    expect(log.action).toBe('STREAM_VIDEO_REQUEST');
    expect(log.status).toBe(206);
    expect(log.guardianName).toBe('João da Silva');
    expect(log.hmacSignature).toMatch(/^hmac-sha256:[a-f0-9]+/);
    expect(log.timestamp).toBeTruthy();
  });

  it('evaluates life-check health and prevents premature unlocking', () => {
    const now = Date.now();
    // Check-in feito hoje
    const recentCheckin = getDeadManSwitchStatus({
      lastCheckinTimestamp: now,
      checkinIntervalDays: 60,
      isQuorumReached: true,
    });
    // Even if quorum is simulated, if owner is alive, the vault does not unlock automatically without protocol completion
    expect(recentCheckin.isHealthy).toBe(true);
    expect(recentCheckin.daysRemaining).toBe(60);
    expect(recentCheckin.canUnlock).toBe(false);

    // Check-in vencido com quórum alcançado
    const overdueAndQuorum = getDeadManSwitchStatus({
      lastCheckinTimestamp: now - 65 * 24 * 60 * 60 * 1000,
      checkinIntervalDays: 60,
      isQuorumReached: true,
    });
    expect(overdueAndQuorum.isHealthy).toBe(false);
    expect(overdueAndQuorum.isOverdue).toBe(true);
    expect(overdueAndQuorum.canUnlock).toBe(true);
  });
});
