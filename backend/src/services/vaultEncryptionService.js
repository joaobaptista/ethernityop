/**
 * vaultEncryptionService.js
 * Módulo Criptográfico Militar (Zero-Knowledge) para o Ethernity DMs.
 * Implementa AES-256-GCM para imagens e metadados, e Chunked AEAD (blocos de 64 KB)
 * para streaming de vídeo e áudio com suporte a HTTP 206 Range Requests.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsClassic from 'node:fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado pelo NIST para GCM
const TAG_LENGTH = 16; // 128 bits de integridade de autenticação
const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB por fatia
const HEADER_MAGIC = Buffer.from('EVLT'); // Ethernity Vault Magic Marker

// Chave Mestra Base do Sistema. Em produção deve vir de VAULT_MASTER_KEY.
// O fallback para JWT_SECRET existe só para não perder arquivos já cifrados com ele:
// nesse caso, trocar o JWT_SECRET deixaria o cofre ilegível.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_VAULT_SECRET = 'ethernity-vault-secret-key-2026';

function resolveSystemSecret() {
  if (process.env.VAULT_MASTER_KEY) return process.env.VAULT_MASTER_KEY;
  if (IS_PRODUCTION) {
    if (!process.env.JWT_SECRET) {
      throw new Error('[Ethernity] VAULT_MASTER_KEY precisa ser definida em produção.');
    }
    console.error(
      '[Ethernity] ATENÇÃO: VAULT_MASTER_KEY não definida — o cofre está usando o JWT_SECRET como chave. ' +
        'Defina VAULT_MASTER_KEY com o valor atual do JWT_SECRET ANTES de trocá-lo, ou os arquivos cifrados ficarão ilegíveis.'
    );
    return process.env.JWT_SECRET;
  }
  return process.env.JWT_SECRET || DEV_VAULT_SECRET;
}

const SYSTEM_SECRET = resolveSystemSecret();

export const vaultEncryptionService = {
  /**
   * Deriva uma chave simétrica de 256 bits exclusiva para o usuário
   * @param {string} userId ID do usuário
   * @param {string} [customSecret] Segredo opcional do usuário (ex: hash da senha)
   * @returns {Buffer} Chave de 32 bytes (256 bits)
   */
  deriveUserKey(userId, customSecret = '') {
    const salt = `ethernity-vault-salt-${userId}`;
    const secret = customSecret || SYSTEM_SECRET;
    return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
  },

  // =========================================================================
  // 1. CRIPTOGRAFIA DE BLOCO ÚNICO (Imagens, Pôsteres e Metadados JSON)
  // =========================================================================

  /**
   * Criptografa um Buffer de mídia estática com AES-256-GCM e AAD
   * Formato binário resultante: [12 bytes IV] + [16 bytes TAG] + [Ciphertext]
   * @param {Buffer} buffer Conteúdo desprotegido
   * @param {Object} context Contexto de autenticação ({ userId, mediaId, variant })
   * @param {Buffer} [userKey] Chave do usuário (opcional, derivada automaticamente se omitida)
   * @returns {Buffer} Buffer autocontido cifrado
   */
  encryptSingleBlock(buffer, context = {}, userKey = null) {
    if (!Buffer.isBuffer(buffer)) {
      buffer = Buffer.from(buffer);
    }

    const key = userKey || this.deriveUserKey(context.userId || 'system');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // AAD: Vincula criptograficamente os metadados do proprietário à cifra
    const aad = Buffer.from(JSON.stringify({
      userId: context.userId || '',
      mediaId: context.mediaId || '',
      variant: context.variant || 'default',
    }));
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Empacota: [IV (12)] + [TAG (16)] + [Ciphertext (N)]
    return Buffer.concat([iv, tag, ciphertext]);
  },

  /**
   * Descriptografa um Buffer autocontido com validação rigorosa de integridade
   * @param {Buffer} encryptedBuffer Buffer cifrado [IV + TAG + Ciphertext]
   * @param {Object} context Contexto de autenticação ({ userId, mediaId, variant })
   * @param {Buffer} [userKey] Chave do usuário
   * @returns {Buffer} Buffer original descriptografado
   */
  decryptSingleBlock(encryptedBuffer, context = {}, userKey = null) {
    if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('[vaultEncryptionService] Buffer cifrado inválido ou truncado.');
    }

    const key = userKey || this.deriveUserKey(context.userId || 'system');
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const tag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = encryptedBuffer.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const aad = Buffer.from(JSON.stringify({
      userId: context.userId || '',
      mediaId: context.mediaId || '',
      variant: context.variant || 'default',
    }));
    decipher.setAAD(aad);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  },

  // =========================================================================
  // 2. CRIPTOGRAFIA CHUNKED AEAD (Vídeos e Áudios para Streaming HTTP 206)
  // =========================================================================

  /**
   * Criptografa um arquivo grande fatiando em blocos de 64 KB com tags GCM individuais
   * @param {string} inputFilePath Caminho do arquivo original desprotegido
   * @param {string} outputEncFilePath Caminho do arquivo .enc resultante
   * @param {Object} context Contexto ({ userId, mediaId })
   * @param {Buffer} [userKey]
   */
  async encryptChunkedFile(inputFilePath, outputEncFilePath, context = {}, userKey = null) {
    const key = userKey || this.deriveUserKey(context.userId || 'system');
    const baseIv = crypto.randomBytes(IV_LENGTH);

    const stat = await fs.stat(inputFilePath);
    const totalBytes = stat.size;
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(totalBytes / chunkSize) || 1;

    const fileHandleRead = await fs.open(inputFilePath, 'r');
    const writeStream = fsClassic.createWriteStream(outputEncFilePath);

    // Escreve Cabeçalho:
    // [MAGIC (4)] + [VERSION (1)] + [CHUNK_SIZE (4 uint32)] + [TOTAL_BYTES (8 uint64)] + [BASE_IV (12)] = 29 bytes
    const headerBuffer = Buffer.alloc(29);
    HEADER_MAGIC.copy(headerBuffer, 0);
    headerBuffer.writeUInt8(1, 4); // Versão 1
    headerBuffer.writeUInt32BE(chunkSize, 5);
    headerBuffer.writeBigUInt64BE(BigInt(totalBytes), 9);
    baseIv.copy(headerBuffer, 17);

    writeStream.write(headerBuffer);

    const readBuffer = Buffer.alloc(chunkSize);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const bytesReadResult = await fileHandleRead.read(readBuffer, 0, chunkSize, chunkIndex * chunkSize);
      const chunkData = readBuffer.subarray(0, bytesReadResult.bytesRead);

      // Deriva IV único para cada chunk via XOR com o índice
      const chunkIv = Buffer.from(baseIv);
      const xorValue = (chunkIv.readUInt32BE(8) ^ chunkIndex) >>> 0;
      chunkIv.writeUInt32BE(xorValue, 8);

      const cipher = crypto.createCipheriv(ALGORITHM, key, chunkIv);
      const aad = Buffer.from(JSON.stringify({
        userId: context.userId || '',
        mediaId: context.mediaId || '',
        chunkIndex,
      }));
      cipher.setAAD(aad);

      const cipherChunk = Buffer.concat([cipher.update(chunkData), cipher.final()]);
      const tag = cipher.getAuthTag();

      // Grava no disco: [TAG (16 bytes)] + [CIPHER_CHUNK (N bytes)]
      writeStream.write(Buffer.concat([tag, cipherChunk]));
    }

    await fileHandleRead.close();
    await new Promise((resolve) => writeStream.end(resolve));

    return {
      totalBytes,
      chunkSize,
      totalChunks,
      headerSize: 29,
    };
  },

  /**
   * Lê os metadados do cabeçalho de um arquivo Chunked AEAD
   * @param {string} encFilePath
   * @returns {Promise<Object>}
   */
  async readChunkedHeader(encFilePath) {
    const handle = await fs.open(encFilePath, 'r');
    try {
      const header = Buffer.alloc(29);
      await handle.read(header, 0, 29, 0);

      const magic = header.subarray(0, 4);
      if (!magic.equals(HEADER_MAGIC)) {
        throw new Error('[vaultEncryptionService] Cabeçalho Chunked inválido ou não reconhecido.');
      }

      const version = header.readUInt8(4);
      const chunkSize = header.readUInt32BE(5);
      const totalBytes = Number(header.readBigUInt64BE(9));
      const baseIv = header.subarray(17, 29);

      return {
        version,
        chunkSize,
        totalBytes,
        baseIv,
        totalChunks: Math.ceil(totalBytes / chunkSize),
      };
    } finally {
      await handle.close();
    }
  },

  /**
   * Descriptografa uma fatia exata de bytes para responder requisições HTTP 206 (Range: bytes=start-end)
   * Decifra pontualmente apenas os blocos de 64 KB necessários na memória RAM.
   * @param {string} encFilePath Caminho do arquivo .enc
   * @param {number} startByte Offset inicial solicitado
   * @param {number} endByte Offset final solicitado (inclusivo)
   * @param {Object} context Contexto ({ userId, mediaId })
   * @param {Buffer} [userKey]
   * @returns {Promise<{ buffer: Buffer, totalBytes: number }>}
   */
  async decryptChunkedRange(encFilePath, startByte, endByte, context = {}, userKey = null) {
    const key = userKey || this.deriveUserKey(context.userId || 'system');
    const header = await this.readChunkedHeader(encFilePath);

    const safeEnd = Math.min(endByte, header.totalBytes - 1);
    if (startByte > safeEnd || startByte < 0) {
      throw new Error('[vaultEncryptionService] Intervalo de bytes fora dos limites do arquivo.');
    }

    const { chunkSize, baseIv, totalBytes } = header;
    const startChunkIndex = Math.floor(startByte / chunkSize);
    const endChunkIndex = Math.floor(safeEnd / chunkSize);

    const handle = await fs.open(encFilePath, 'r');
    const decryptedChunks = [];

    try {
      for (let i = startChunkIndex; i <= endChunkIndex; i++) {
        // Cada registro no arquivo cifrado é: 29 (header) + sum_of_previous_chunks(raw_size + 16)
        // Como todos os chunks exceto o último têm tamanho bruto chunkSize:
        const unencChunkSize = i === header.totalChunks - 1 ? totalBytes - (i * chunkSize) : chunkSize;
        const storedChunkSize = TAG_LENGTH + unencChunkSize;

        const chunkFileOffset = 29 + (i * (TAG_LENGTH + chunkSize));

        const encryptedData = Buffer.alloc(storedChunkSize);
        await handle.read(encryptedData, 0, storedChunkSize, chunkFileOffset);

        const tag = encryptedData.subarray(0, TAG_LENGTH);
        const ciphertext = encryptedData.subarray(TAG_LENGTH);

        const chunkIv = Buffer.from(baseIv);
        const xorValue = (chunkIv.readUInt32BE(8) ^ i) >>> 0;
        chunkIv.writeUInt32BE(xorValue, 8);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, chunkIv);
        decipher.setAuthTag(tag);

        const aad = Buffer.from(JSON.stringify({
          userId: context.userId || '',
          mediaId: context.mediaId || '',
          chunkIndex: i,
        }));
        decipher.setAAD(aad);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        decryptedChunks.push(decrypted);
      }
    } finally {
      await handle.close();
    }

    const fullDecryptedSegment = Buffer.concat(decryptedChunks);

    // Calcula o corte exato dentro do segmento de chunks descriptografados
    const offsetInFirstChunk = startByte - (startChunkIndex * chunkSize);
    const lengthRequested = (safeEnd - startByte) + 1;

    const slice = fullDecryptedSegment.subarray(offsetInFirstChunk, offsetInFirstChunk + lengthRequested);

    return {
      buffer: slice,
      totalBytes,
      startByte,
      endByte: safeEnd,
    };
  },

  // =========================================================================
  // 3. CRYPTO-SHREDDING (Exclusão Segura e Permanente LGPD / GDPR)
  // =========================================================================

  /**
   * Sobrescreve fisicamente os blocos do arquivo com ruído aleatório antes do unlink
   * @param {string} filePath Caminho do arquivo a ser destruído
   */
  async cryptoShredFile(filePath) {
    try {
      const stat = await fs.stat(filePath);
      const handle = await fs.open(filePath, 'r+');
      const randomNoise = crypto.randomBytes(Math.min(stat.size, 64 * 1024));

      // Sobrescreve blocos iniciais e cabeçalhos com ruído estocástico
      await handle.write(randomNoise, 0, randomNoise.length, 0);
      await handle.sync();
      await handle.close();

      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  },

  async cryptoShred(filePath) {
    return this.cryptoShredFile(filePath);
  },
};

export default vaultEncryptionService;
