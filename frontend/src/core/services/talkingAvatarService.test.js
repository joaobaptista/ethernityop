import { describe, it, expect } from 'vitest';
import talkingAvatarService from './talkingAvatarService.js';

describe('talkingAvatarService', () => {
  it('instancia o serviço com estados iniciais corretos', () => {
    expect(talkingAvatarService).toBeDefined();
    expect(talkingAvatarService.isRendering).toBe(false);
  });

  it('verifica suporte a WebGPU ou fallback com segurança', () => {
    const supported = talkingAvatarService.isWebGpuSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('valida rejeição quando foto não é informada', async () => {
    await expect(talkingAvatarService.prepareMasterFrame(null)).rejects.toThrow('Foto mestra necessária.');
  });

  it('valida rejeição de exportação quando canvas não suporta captureStream', async () => {
    await expect(talkingAvatarService.exportAvatarVideo(null)).rejects.toThrow('Canvas captureStream não suportado');
    await expect(talkingAvatarService.exportAvatarVideo({})).rejects.toThrow('Canvas captureStream não suportado');
  });

  it('valida rejeição quando canvas não é fornecido para playback', async () => {
    await expect(talkingAvatarService.startAvatarPlayback(null, 'foto.jpg', null)).rejects.toThrow('Elemento Canvas não fornecido.');
  });
});
