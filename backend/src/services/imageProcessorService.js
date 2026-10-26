/**
 * imageProcessorService.js
 * Motor de processamento de imagens de alta fidelidade para o Ethernity DMs.
 * Padroniza todas as entradas (Google Photos, Apple Photos / HEIC e Upload)
 * no formato Google WebP com arquitetura Multi-Tier (Master 300 DPI, Display e Thumb).
 */
import sharp from 'sharp';

export const imageProcessorService = {
  /**
   * Processa uma imagem de entrada gerando as 3 camadas WebP
   * @param {Buffer} inputBuffer Buffer bruto da imagem
   * @param {Object} [options] Opções adicionais
   * @returns {Promise<Object>} Buffers e metadados das variantes master, display e thumb
   */
  async processImage(inputBuffer, options = {}) {
    if (!Buffer.isBuffer(inputBuffer)) {
      throw new Error('[imageProcessorService] Entrada deve ser um Buffer válido.');
    }

    const image = sharp(inputBuffer);
    const meta = await image.metadata();

    const originalFormat = meta.format;
    const originalWidth = meta.width || 1920;
    const originalHeight = meta.height || 1080;
    const hasAlpha = Boolean(meta.hasAlpha);
    const colorSpace = meta.space || 'srgb';

    // 1. Camada MASTER: Alta Resolução Gráfica para Impressão (300 DPI, Q92, Chroma 4:4:4)
    // Se a imagem for maior que 4096px, redimensiona proporcionalmente; se for menor, preserva integralmente
    const masterResizeOptions =
      originalWidth > 4096 || originalHeight > 4096
        ? { width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true }
        : null;

    let masterPipeline = sharp(inputBuffer).rotate(); // auto-rotação EXIF
    if (masterResizeOptions) {
      masterPipeline = masterPipeline.resize(masterResizeOptions);
    }

    const masterBuffer = await masterPipeline
      .withMetadata({ density: 300 })
      .webp({
        quality: options.masterQuality || 92,
        lossless: false,
        nearLossless: false,
        smartSubsample: true,
        chromaSubsampling: '4:4:4', // preservação total de cores em tons de pele
        effort: 6,
      })
      .toBuffer();

    const masterMeta = await sharp(masterBuffer).metadata();

    // 2. Camada DISPLAY: Tela Cheia Web & Mobile (Full HD 1920px, Q85)
    const displayBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: 1920,
        height: 1080,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: options.displayQuality || 85,
        effort: 4,
      })
      .toBuffer();

    const displayMeta = await sharp(displayBuffer).metadata();

    // 3. Camada THUMBNAIL: Miniatura para Grade e Timeline (400x400 Smart Crop, Q80)
    const thumbBuffer = await sharp(inputBuffer)
      .rotate()
      .resize(400, 400, {
        fit: 'cover',
        position: sharp.strategy.attention, // Foca em rostos e áreas de maior interesse visual
      })
      .webp({
        quality: options.thumbQuality || 80,
        effort: 4,
      })
      .toBuffer();

    const thumbMeta = await sharp(thumbBuffer).metadata();

    return {
      master: {
        buffer: masterBuffer,
        width: masterMeta.width,
        height: masterMeta.height,
        sizeBytes: masterBuffer.length,
        mimeType: 'image/webp',
        quality: 92,
        subsampling: '4:4:4',
        dpi: 300,
      },
      display: {
        buffer: displayBuffer,
        width: displayMeta.width,
        height: displayMeta.height,
        sizeBytes: displayBuffer.length,
        mimeType: 'image/webp',
        quality: 85,
      },
      thumb: {
        buffer: thumbBuffer,
        width: thumbMeta.width,
        height: thumbMeta.height,
        sizeBytes: thumbBuffer.length,
        mimeType: 'image/webp',
        quality: 80,
      },
      metadata: {
        originalFormat,
        originalWidth,
        originalHeight,
        hasAlpha,
        colorSpace,
        processedAt: new Date().toISOString(),
      },
    };
  },

  /**
   * Exporta a imagem mestre para formatos gráficos profissionais de impressão fine-art (TIFF / PNG 300 DPI)
   * @param {Buffer} masterWebpBuffer Buffer da imagem master em WebP
   * @param {Object} [options] Opções de formato e densidade
   * @returns {Promise<{ buffer: Buffer, mimeType: string, filename: string }>}
   */
  async exportForPrint(masterWebpBuffer, options = {}) {
    const { format = 'tiff', dpi = 300, baseFilename = 'ethernity-memoria-print' } = options;

    let pipeline = sharp(masterWebpBuffer).withMetadata({ density: dpi });
    let exportBuffer;
    let mimeType;
    let extension;

    if (format === 'tiff') {
      mimeType = 'image/tiff';
      extension = 'tiff';
      exportBuffer = await pipeline.tiff({ compression: 'lzw' }).toBuffer();
    } else if (format === 'png') {
      mimeType = 'image/png';
      extension = 'png';
      exportBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    } else {
      mimeType = 'image/webp';
      extension = 'webp';
      exportBuffer = await pipeline.webp({ quality: 100, lossless: true }).toBuffer();
    }

    return {
      buffer: exportBuffer,
      mimeType,
      filename: `${baseFilename}-${dpi}dpi.${extension}`,
    };
  },
};

export default imageProcessorService;
