/**
 * subscriptionModel.test.js
 * Testes unitários para regras de domínio de planos e limites do Ethernity DMS.
 */
import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_PLANS,
  canAddCapsule,
  canAddGuardian,
  canAddDevice,
  canAddGeofence,
  isFeatureAvailable,
  calculateYearlyDiscount,
  formatCurrency,
} from './subscriptionModel.js';

describe('subscriptionModel Domain Rules', () => {
  it('should enforce free plan capsule limits (max 5)', () => {
    const freeSub = { planId: 'free' };
    expect(canAddCapsule(0, freeSub)).toBe(true);
    expect(canAddCapsule(4, freeSub)).toBe(true);
    expect(canAddCapsule(5, freeSub)).toBe(false);
  });

  it('should enforce family plan capsule limits (max 50)', () => {
    const familySub = { planId: 'family' };
    expect(canAddCapsule(49, familySub)).toBe(true);
    expect(canAddCapsule(50, familySub)).toBe(false);
  });

  it('should enforce free plan guardian limits (max 2)', () => {
    const freeSub = { planId: 'free' };
    expect(canAddGuardian(1, freeSub)).toBe(true);
    expect(canAddGuardian(2, freeSub)).toBe(false);
  });

  it('should enforce family plan guardian limits (max 10)', () => {
    const familySub = { planId: 'family' };
    expect(canAddGuardian(9, familySub)).toBe(true);
    expect(canAddGuardian(10, familySub)).toBe(false);
  });

  it('should support legacy canAddDevice and canAddGeofence for backward compatibility', () => {
    expect(canAddDevice(0, { planId: 'free' })).toBe(true);
    expect(canAddDevice(1, { planId: 'free' })).toBe(false);
    expect(canAddGeofence(1, { planId: 'free' })).toBe(true);
    expect(canAddGeofence(2, { planId: 'free' })).toBe(false);
  });

  it('should calculate feature availability per tier', () => {
    expect(isFeatureAvailable('ai_letter_ideation', { planId: 'free' })).toBe(false);
    expect(isFeatureAvailable('ai_letter_ideation', { planId: 'family' })).toBe(true);
    expect(isFeatureAvailable('fine_art_export', { planId: 'family' })).toBe(false);
    expect(isFeatureAvailable('fine_art_export', { planId: 'clinical' })).toBe(true);
  });

  it('should calculate yearly discount percentage', () => {
    const discount = calculateYearlyDiscount(SUBSCRIPTION_PLANS.family);
    expect(discount).toBeGreaterThan(15);
  });

  it('should format currency correctly in BRL', () => {
    const formatted = formatCurrency(29.90);
    expect(formatted).toContain('29,90');
  });
});
