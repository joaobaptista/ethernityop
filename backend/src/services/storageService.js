import crypto from 'node:crypto';
import fsClassic from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import config from '../config.js';

const extensionByMimeType = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/heic': '.heic',
});

function normalizedMimeType(value) {
  return typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
}

export const storageService = {
  isSupportedImageMimeType(value) {
    return Boolean(extensionByMimeType[normalizedMimeType(value)]);
  },

  async saveRemoteImage(response, { mimeType, originalFilename, maxBytes = 50 * 1024 * 1024 }) {
    const safeMimeType = normalizedMimeType(mimeType) || 'image/jpeg';
    const extension = extensionByMimeType[safeMimeType] || '.jpg';

    if (!response?.body) {
      throw new Error('Não foi possível receber os dados da imagem do Google Fotos.');
    }

    const uploadDir = path.resolve(config.uploadFolder);
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `gp-${crypto.randomUUID()}${extension}`;
    const temporaryPath = path.join(uploadDir, `.${filename}.part`);
    const finalPath = path.join(uploadDir, filename);
    let byteSize = 0;

    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        byteSize += chunk.length;
        if (byteSize > maxBytes) {
          callback(new Error('A imagem excede o limite de importação configurado.'));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body),
        limit,
        fsClassic.createWriteStream(temporaryPath, { flags: 'wx' })
      );
      await fs.rename(temporaryPath, finalPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => {});
      await fs.unlink(finalPath).catch(() => {});
      throw error;
    }

    return {
      mediaUrl: `/uploads/${filename}`,
      storageKey: `local/${filename}`,
      metadata: {
        mimeType: safeMimeType,
        byteSize,
        originalFilename: typeof originalFilename === 'string' ? originalFilename.slice(0, 255) : filename,
      },
    };
  },
};

export default storageService;
