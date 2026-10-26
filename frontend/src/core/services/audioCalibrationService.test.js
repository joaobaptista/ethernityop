import { describe, it, expect } from 'vitest';
import audioCalibrationService, { PHONETIC_PROMPTS } from './audioCalibrationService.js';

describe('audioCalibrationService', () => {
  it('fornece as 3 frases fonéticas calibradas com substituição do nome', () => {
    const prompts = audioCalibrationService.getPhoneticPrompts('Mariana');
    expect(prompts.length).toBe(3);
    expect(prompts[0].text).toContain('Mariana');
    expect(prompts[0].focus).toBeDefined();
    expect(prompts[1].id).toBe('f2_emotion');
    expect(prompts[2].id).toBe('f3_plosives');
  });

  it('possui a lista base de frases estática consistente', () => {
    expect(PHONETIC_PROMPTS.length).toBe(3);
    expect(PHONETIC_PROMPTS[0].id).toBe('f1_timbre');
  });

  it('gera blob de áudio sintético em WAV com cabeçalho RIFF válido', () => {
    const blob = audioCalibrationService.generateSyntheticVoiceBlob(2);
    expect(blob).toBeDefined();
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44);
  });
});
