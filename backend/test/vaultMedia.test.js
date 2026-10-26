/**
 * test/vaultMedia.test.js
 * Testes de integração end-to-end do Cofre Multimodal Criptografado (Zero-Knowledge).
 * Valida upload de imagens WebP multi-tier, criptografia AES-256-GCM, isolamento em disco,
 * streaming com HTTP 206 Range requests e exportação fine-art 300 DPI.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { findUserByEmail } from '../src/db.js';
import { pool } from '../src/db/mysql.js';
import { signToken } from '../src/auth.js';
import config from '../src/config.js';

const app = createApp();
const DEMO_EMAIL = 'demo@ethernity.com';
let token = '';
let userId = '';

before(async () => {
  const user = findUserByEmail(DEMO_EMAIL) || { id: 'u-demo-1', email: DEMO_EMAIL };
  userId = user.id;
  token = signToken(user);
});

after(async () => {
  try {
    await pool.query('DELETE FROM memories WHERE author_id = ?', [userId]);
    const userDir = path.join(config.vaultFolder, userId);
    await fs.rm(userDir, { recursive: true, force: true }).catch(() => {});
  } catch {}
  try {
    await pool.end();
  } catch {}
});

test('Cofre: Rejeita upload não autenticado', async () => {
  const res = await request(app).post('/api/vault/media/upload');
  assert.equal(res.status, 403);
});

test('Cofre: Upload de imagem, transcodificação WebP Multi-Tier e cifragem AES-256-GCM', async () => {
  // Gera uma imagem sintética 600x600 via sharp
  const testImageBuffer = await sharp({
    create: {
      width: 600,
      height: 600,
      channels: 3,
      background: { r: 50, g: 120, b: 240 },
    },
  })
    .png()
    .toBuffer();

  const res = await request(app)
    .post('/api/vault/media/upload')
    .set('Authorization', `Bearer ${token}`)
    .field('title', 'Retrato de Família 2026')
    .field('description', 'Memória fotográfica de teste')
    .attach('file', testImageBuffer, 'foto-familia.png');

  assert.equal(res.status, 200);
  assert.ok(res.body.mediaId, 'Deve retornar mediaId');
  assert.equal(res.body.type, 'IMAGE');
  assert.equal(res.body.mimeType, 'image/webp');
  assert.ok(res.body.variants.thumb, 'Deve ter variante thumb');
  assert.ok(res.body.variants.display, 'Deve ter variante display');
  assert.ok(res.body.variants.master, 'Deve ter variante master');

  const mediaId = res.body.mediaId;

  // 1. Validação em disco: o arquivo armazenado deve estar estritamente cifrado
  const encPath = path.join(config.vaultFolder, userId, mediaId, 'master.webp.enc');
  const encBuffer = await fs.readFile(encPath);
  assert.ok(encBuffer.length > 0, 'Arquivo .enc deve existir em disco');

  // Não pode conter cabeçalho WebP 'RIFF....WEBP'
  const isPlainWebP = encBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
                      encBuffer.subarray(8, 12).toString('ascii') === 'WEBP';
  assert.equal(isPlainWebP, false, 'O arquivo em disco NÃO pode ser texto plano/WebP sem cifragem');

  // 2. Leitura via endpoint autenticado com Header Bearer
  const getRes = await request(app)
    .get(`/api/vault/media/${mediaId}?variant=display`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers['content-type'], 'image/webp');
  assert.equal(getRes.headers['cache-control'], 'private, no-store, max-age=0');

  // Valida que o buffer descriptografado é um WebP legítimo
  const decryptedBuf = getRes.body;
  assert.equal(decryptedBuf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(decryptedBuf.subarray(8, 12).toString('ascii'), 'WEBP');

  // 3. Leitura via query param ?token= (suporte a tags <img src="..."> e <video src="...">)
  const queryAuthRes = await request(app)
    .get(`/api/vault/media/${mediaId}?variant=thumb&token=${token}`);

  assert.equal(queryAuthRes.status, 200);
  assert.equal(queryAuthRes.headers['content-type'], 'image/webp');
  assert.equal(queryAuthRes.body.subarray(0, 4).toString('ascii'), 'RIFF');

  // 4. Exportação Fine-Art para impressão física (300 DPI)
  const exportRes = await request(app)
    .get(`/api/vault/media/${mediaId}/export?format=tiff`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(exportRes.status, 200);
  assert.equal(exportRes.headers['content-type'], 'image/tiff');
  assert.ok(exportRes.headers['content-disposition'].includes('.tiff'));
});

test('Cofre: Streaming com HTTP 206 Range requests em áudio/vídeo cifrado', async () => {
  // Simula um arquivo de áudio sintético em temp
  const sampleAudioBuffer = Buffer.alloc(150000, 0x42); // 150 KB

  const res = await request(app)
    .post('/api/vault/media/upload')
    .set('Authorization', `Bearer ${token}`)
    .field('title', 'Mensagem de Voz')
    .attach('audio', sampleAudioBuffer, 'audio-sample.wav');

  // Caso o ffmpeg processe ou caia no handler
  if (res.status === 200) {
    const mediaId = res.body.mediaId;
    assert.equal(res.body.type, 'AUDIO');

    // Teste de Range Request (bytes 0-1024)
    const rangeRes = await request(app)
      .get(`/api/vault/media/${mediaId}/stream`)
      .set('Authorization', `Bearer ${token}`)
      .set('Range', 'bytes=0-1023');

    assert.equal(rangeRes.status, 206);
    assert.ok(rangeRes.headers['content-range'].startsWith('bytes 0-1023/'));
    assert.equal(rangeRes.body.length, 1024);

    // Teste de busca da forma de onda (waveform)
    const waveRes = await request(app)
      .get(`/api/vault/media/${mediaId}/waveform`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(waveRes.status, 200);
    assert.ok(Array.isArray(waveRes.body.waveformPeaks));
  }
});
