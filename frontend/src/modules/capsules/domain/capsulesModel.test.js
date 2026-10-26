import { describe, it, expect } from 'vitest';
import {
  CAPSULE_STATUS,
  CAPSULE_TRIGGERS,
  validateCapsule,
  createTimeCapsule,
  canDeliverCapsule,
} from './capsulesModel.js';

describe('capsulesModel Domain Rules', () => {
  it('validates correct capsules', () => {
    const valid = validateCapsule({
      title: '18 anos da Mariana',
      recipient: 'Mariana Silva',
      triggerType: CAPSULE_TRIGGERS.AGE_MILESTONE,
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects capsules without recipient or title', () => {
    const noTitle = validateCapsule({ title: '', recipient: 'Mariana' });
    expect(noTitle.valid).toBe(false);

    const noRecipient = validateCapsule({ title: 'Carta', recipient: '' });
    expect(noRecipient.valid).toBe(false);
  });

  it('creates standardized time capsule entity with defaults', () => {
    const capsule = createTimeCapsule({
      title: 'Mensagem de Bodas',
      recipient: 'Esposa',
      triggerType: CAPSULE_TRIGGERS.POSTHUMOUS,
    });

    expect(capsule.id).toBeDefined();
    expect(capsule.requiresGuardianQuorum).toBe(true);
    expect(capsule.status).toBe(CAPSULE_STATUS.SEALED);
  });

  it('evaluates delivery feasibility based on scheduled dates', () => {
    const pastDate = new Date(Date.now() - 10000).toISOString();
    const futureDate = new Date(Date.now() + 10000000).toISOString();

    const readyCapsule = createTimeCapsule({
      title: 'Passada',
      recipient: 'Filho',
      triggerType: CAPSULE_TRIGGERS.DATE_SPECIFIC,
      scheduledDate: pastDate,
    });

    const futureCapsule = createTimeCapsule({
      title: 'Futura',
      recipient: 'Filho',
      triggerType: CAPSULE_TRIGGERS.DATE_SPECIFIC,
      scheduledDate: futureDate,
    });

    expect(canDeliverCapsule(readyCapsule)).toBe(true);
    expect(canDeliverCapsule(futureCapsule)).toBe(false);
  });
});
