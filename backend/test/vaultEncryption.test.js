import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vaultEncryptionService from '../src/services/vaultEncryptionService.js';

describe('vaultEncryptionService (AES-256-GCM & Chunked AEAD)', () => {
  const testUserId = 'u-test-777';
  const testMediaId = 'mem-456';

  it('derives unique 256-bit symmetric key per user', () => {
    const key1 = vaultEncryptionService.deriveUserKey('user-alpha');
    const key2 = vaultEncryptionService.deriveUserKey('user-beta');
    const key1Again = vaultEncryptionService.deriveUserKey('user-alpha');

    assert.equal(key1.length, 32);
    assert.equal(key2.length, 32);
    assert.deepEqual(key1, key1Again);
    assert.notDeepEqual(key1, key2);
  });

  it('encrypts and decrypts single block with AES-256-GCM', () => {
    const secretMessage = Buffer.from('Minha carta de amor eterna para a posteridade familiar.');
    const context = { userId: testUserId, mediaId: testMediaId, variant: 'display' };

    const encrypted = vaultEncryptionService.encryptSingleBlock(secretMessage, context);
    assert.equal(encrypted.length, secretMessage.length + 28); // 12 IV + 16 TAG + plaintext

    const decrypted = vaultEncryptionService.decryptSingleBlock(encrypted, context);
    assert.deepEqual(decrypted, secretMessage);
    assert.equal(decrypted.toString('utf8'), 'Minha carta de amor eterna para a posteridade familiar.');
  });

  it('rejects decryption if ciphertext or authentication tag is tampered (Anti-Tamper)', () => {
    const secretMessage = Buffer.from('Foto ultra-secreta de família');
    const context = { userId: testUserId, mediaId: testMediaId };

    const encrypted = vaultEncryptionService.encryptSingleBlock(secretMessage, context);

    // Adultera o último byte do ciphertext
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;

    assert.throws(() => {
      vaultEncryptionService.decryptSingleBlock(tampered, context);
    });
  });

  it('rejects decryption if context/userId differs (Anti-Impersonation AAD)', () => {
    const secretMessage = Buffer.from('Dados privados do Usuário 1');
    const contextUser1 = { userId: 'user-1', mediaId: 'mem-1' };
    const contextUser2 = { userId: 'user-2', mediaId: 'mem-1' };

    const encrypted = vaultEncryptionService.encryptSingleBlock(secretMessage, contextUser1);

    // Tentativa de outro usuário decifrar com seu próprio contexto
    assert.throws(() => {
      vaultEncryptionService.decryptSingleBlock(encrypted, contextUser2);
    });
  });

  it('encrypts chunked video/audio and streams arbitrary byte ranges (HTTP 206 Partial Content)', async () => {
    const tempDir = os.tmpdir();
    const rawFile = path.join(tempDir, `test-raw-${Date.now()}.bin`);
    const encFile = path.join(tempDir, `test-enc-${Date.now()}.enc`);

    try {
      // Gera 150 KB de dados binários pseudoaleatórios (abrange 3 chunks de 64 KB)
      const rawData = crypto.randomBytes(150 * 1024);
      await fs.writeFile(rawFile, rawData);

      const context = { userId: testUserId, mediaId: 'video-test-123' };

      // 1. Cifra em chunks de 64 KB
      const result = await vaultEncryptionService.encryptChunkedFile(rawFile, encFile, context);
      assert.equal(result.totalBytes, 150 * 1024);
      assert.equal(result.totalChunks, 3);

      // 2. Simula requisição Range: bytes=1000-75000 (atravessa fronteira do chunk 0 para o chunk 1)
      const startByte = 1000;
      const endByte = 75000;
      const rangeResult = await vaultEncryptionService.decryptChunkedRange(encFile, startByte, endByte, context);

      assert.equal(rangeResult.totalBytes, 150 * 1024);
      assert.equal(rangeResult.buffer.length, (endByte - startByte) + 1);

      // Validação byte a byte com o original
      const expectedSlice = rawData.subarray(startByte, endByte + 1);
      assert.deepEqual(rangeResult.buffer, expectedSlice);

      // 3. Simula Range dos primeiros 10 bytes: bytes=0-9
      const headRange = await vaultEncryptionService.decryptChunkedRange(encFile, 0, 9, context);
      assert.equal(headRange.buffer.length, 10);
      assert.deepEqual(headRange.buffer, rawData.subarray(0, 10));
    } finally {
      await fs.unlink(rawFile).catch(() => {});
      await fs.unlink(encFile).catch(() => {});
    }
  });

  it('crypto-shreds file by overwriting with random noise before unlinking', async () => {
    const tempFile = path.join(os.tmpdir(), `shred-${Date.now()}.bin`);
    await fs.writeFile(tempFile, Buffer.from('Dados confidenciais que devem sumir sem deixar rastro.'));

    const success = await vaultEncryptionService.cryptoShredFile(tempFile);
    assert.equal(success, true);

    await assert.rejects(async () => {
      await fs.stat(tempFile);
    });
  });
});
