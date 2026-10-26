import { describe, it, expect } from 'vitest';
import faceRecognitionService from './faceRecognitionService.js';
import { SUBSCRIPTION_PLANS } from '../../modules/subscription/domain/subscriptionModel.js';

describe('faceRecognitionService & Capsule People Discovery', () => {
  it('instantiates and provides fallback clustering when in node/vitest environment', async () => {
    const mockPhotos = [
      { id: 'photo-1', img: 'https://example.com/p1.jpg', title: 'Férias 1' },
      { id: 'photo-2', img: 'https://example.com/p2.jpg', title: 'Férias 2' },
      { id: 'photo-3', img: 'https://example.com/p3.jpg', title: 'Férias 3' },
    ];

    const clusters = await faceRecognitionService.detectAndClusterPeople(mockPhotos);
    expect(clusters).toBeDefined();
    expect(Array.isArray(clusters)).toBe(true);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].id).toBeDefined();
    expect(clusters[0].avatar).toBeDefined();
    expect(clusters[0].photos.length).toBeGreaterThan(0);
  });

  it('enforces plan limits for capsule recipients', () => {
    const freePlan = SUBSCRIPTION_PLANS.free;
    const familyPlan = SUBSCRIPTION_PLANS.family;
    const clinicalPlan = SUBSCRIPTION_PLANS.clinical;

    expect(freePlan.maxRecipients).toBe(2);
    expect(familyPlan.maxRecipients).toBe(5);
    expect(clinicalPlan.maxRecipients).toBe(999);
  });

  it('analisa qualidade da Foto Mestra para síntese de Avatar Falante', async () => {
    const emptyResult = await faceRecognitionService.analyzeMasterPhotoQuality(null);
    expect(emptyResult.isIdeal).toBe(false);
    expect(emptyResult.score).toBe(0);

    const validResult = await faceRecognitionService.analyzeMasterPhotoQuality('data:image/jpeg;base64,mock-face');
    expect(validResult.score).toBeGreaterThan(0);
    expect(validResult.reason).toBeDefined();
  });
});
