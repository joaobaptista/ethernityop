import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import imageProcessorService from '../src/services/imageProcessorService.js';
import videoAudioProcessorService from '../src/services/videoAudioProcessorService.js';

describe('imageProcessorService (Multi-Tier WebP Engine)', () => {
  it('processes raw image into master, display and thumb WebP tiers', async () => {
    // Cria imagem sintética 500x500 PNG
    const rawBuffer = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 238, g: 89, b: 69 }, // Terracota Coral
      },
    })
      .png()
      .toBuffer();

    const result = await imageProcessorService.processImage(rawBuffer);

    // 1. Valida Master WebP (300 DPI)
    assert.ok(result.master);
    assert.equal(result.master.mimeType, 'image/webp');
    assert.equal(result.master.dpi, 300);
    assert.equal(result.master.subsampling, '4:4:4');
    assert.ok(result.master.buffer.length > 0);

    // 2. Valida Display WebP
    assert.ok(result.display);
    assert.equal(result.display.mimeType, 'image/webp');
    assert.ok(result.display.width <= 1920);

    // 3. Valida Thumb WebP (400x400)
    assert.ok(result.thumb);
    assert.equal(result.thumb.mimeType, 'image/webp');
    assert.equal(result.thumb.width, 400);
    assert.equal(result.thumb.height, 400);

    // 4. Valida Metadados
    assert.equal(result.metadata.originalFormat, 'png');
  });

  it('exports master WebP to TIFF with 300 DPI for fine-art print', async () => {
    const rawBuffer = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 45, g: 27, b: 24 }, // Chocolate Profundo
      },
    })
      .webp({ quality: 90 })
      .toBuffer();

    const exported = await imageProcessorService.exportForPrint(rawBuffer, {
      format: 'tiff',
      dpi: 300,
    });

    assert.equal(exported.mimeType, 'image/tiff');
    assert.ok(exported.buffer.length > 0);
    assert.ok(exported.filename.endsWith('.tiff'));
  });
});

describe('videoAudioProcessorService (Autonomous Engine)', () => {
  it('exposes autonomous ffmpeg and ffprobe services', () => {
    assert.equal(typeof videoAudioProcessorService.getMetadata, 'function');
    assert.equal(typeof videoAudioProcessorService.processVideo, 'function');
    assert.equal(typeof videoAudioProcessorService.processAudio, 'function');
    assert.equal(typeof videoAudioProcessorService.generateWaveformPeaks, 'function');
  });
});
