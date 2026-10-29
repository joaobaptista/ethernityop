import { describe, it, expect } from 'vitest';
import { pickPrimaryGuardian } from './usePrimaryGuardian.js';

describe('pickPrimaryGuardian', () => {
  it('não inventa guardião quando não há nenhum cadastrado', () => {
    expect(pickPrimaryGuardian([])).toBeNull();
    expect(pickPrimaryGuardian(undefined)).toBeNull();
  });

  it('prefere o guardião ativo que pode liberar a entrega', () => {
    const list = [
      { id: 'a', status: 'pending', canTriggerDelivery: true },
      { id: 'b', status: 'active', canTriggerDelivery: true },
    ];
    expect(pickPrimaryGuardian(list).id).toBe('b');
  });
});
