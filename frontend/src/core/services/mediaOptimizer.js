/**
 * mediaOptimizer.js
 * Utilitário de alta performance para converter e comprimir imagens para o formato WebP
 * antes do upload para o servidor, garantindo arquivos leves, renderização instantânea
 * e economia de tráfego de dados.
 */

/**
 * Converte um arquivo de imagem (JPEG, PNG, HEIC, etc.) para WebP otimizado.
 * Preserva SVGs e ignora arquivos não-imagem.
 *
 * @param {File|Blob} file Arquivo de entrada
 * @param {Object} options Configurações de qualidade e redimensionamento
 * @param {number} options.quality Qualidade da compressão WebP (0.1 a 1.0, padrão: 0.85)
 * @param {number} options.maxWidth Largura máxima em pixels (padrão: 2048)
 * @param {number} options.maxHeight Altura máxima em pixels (padrão: 2048)
 * @param {number} options.maxAvatarSize Limite de dimensão quando isAvatar for true (padrão: 512)
 * @param {boolean} options.isAvatar Se deve aplicar dimensões focadas em avatar/perfil
 * @returns {Promise<File|Blob>} Arquivo convertido em WebP ou original se não conversível
 */
export async function convertImageToWebP(file, options = {}) {
  const {
    quality = 0.85,
    maxWidth = 2048,
    maxHeight = 2048,
    maxAvatarSize = 512,
    isAvatar = false,
  } = options;

  if (!file) {
    return file;
  }

  // Preservar arquivos HEIC/HEIF intactos para transcodificação de alta fidelidade no backend via Sharp
  if (isHeicFile(file)) {
    return file;
  }

  if (!file.type || !file.type.startsWith('image/')) {
    return file;
  }

  // Não rasterizar SVG para manter a qualidade vetorial infinita
  if (file.type === 'image/svg+xml') {
    return file;
  }

  // Fallback seguro se executado fora do browser (ex: Node/SSR/ambiente headless sem canvas)
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const targetMaxWidth = isAvatar ? maxAvatarSize : maxWidth;
        const targetMaxHeight = isAvatar ? maxAvatarSize : maxHeight;

        let width = img.width || 1;
        let height = img.height || 1;

        // Redimensionamento proporcional mantendo a proporção de aspecto (aspect ratio)
        if (width > targetMaxWidth || height > targetMaxHeight) {
          if (width / height > targetMaxWidth / targetMaxHeight) {
            height = Math.max(1, Math.round((height * targetMaxWidth) / width));
            width = targetMaxWidth;
          } else {
            width = Math.max(1, Math.round((width * targetMaxHeight) / height));
            height = targetMaxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file);
        }

        // Renderiza no canvas com interpolação de alta qualidade
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Converte para blob WebP
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return resolve(file);
              }

              const baseName = (file.name || 'image').replace(/\.[^/.]+$/, '');
              const webpFileName = `${baseName}.webp`;

              const webpFile = new File([blob], webpFileName, {
                type: 'image/webp',
                lastModified: Date.now(),
              });

              resolve(webpFile);
            },
            'image/webp',
            quality
          );
        } else {
          resolve(file);
        }
      };

      img.onerror = () => {
        resolve(file);
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      resolve(file);
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Detecta se o arquivo é um formato de imagem Apple HEIC/HEIF
 * @param {File|Blob} file
 * @returns {boolean}
 */
export function isHeicFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type === 'image/heic' ||
    type === 'image/heif'
  );
}

/**
 * Detecta se o arquivo é um vídeo companheiro potencial de Apple Live Photo (.mov ou .mp4)
 * @param {File|Blob} file
 * @returns {boolean}
 */
export function isLivePhotoVideo(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.mov') ||
    type === 'video/quicktime' ||
    (name.endsWith('.mp4') && (file.size || 0) < 50 * 1024 * 1024)
  );
}

/**
 * Emparelha automaticamente arquivos de fotos e clipes de vídeo Apple Live Photos
 * agrupando por nome base (ex: IMG_0042.HEIC + IMG_0042.MOV).
 *
 * @param {Array<File>|FileList} files Coleção de arquivos selecionados ou arrastados
 * @returns {Array<Object>} Lista de itens emparelhados e independentes
 */
export function pairLivePhotos(files) {
  if (!files || !files.length) return [];
  const fileArray = Array.from(files);

  // Mapear por nome base sem extensão
  const getBaseName = (filename) => {
    if (!filename) return '';
    return filename.replace(/\.[^/.]+$/, '').trim().toLowerCase();
  };

  const imageMap = new Map();
  const videoMap = new Map();
  const otherFiles = [];

  for (const f of fileArray) {
    const base = getBaseName(f.name);
    const isImg = isHeicFile(f) || (f.type && f.type.startsWith('image/')) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || '');
    const isVid = isLivePhotoVideo(f) || (f.type && f.type.startsWith('video/'));

    if (isImg) {
      imageMap.set(base, f);
    } else if (isVid) {
      videoMap.set(base, f);
    } else {
      otherFiles.push({ file: f, isLivePhoto: false, type: 'OTHER' });
    }
  }

  const result = [];
  const usedVideos = new Set();

  // Emparelhar cada imagem com seu vídeo homônimo (Live Photo Apple)
  for (const [base, imgFile] of imageMap.entries()) {
    const companionVideo = videoMap.get(base);
    if (companionVideo) {
      usedVideos.add(base);
      result.push({
        id: `lp-${base}-${Date.now()}`,
        name: imgFile.name,
        baseName: base,
        imageFile: imgFile,
        videoFile: companionVideo,
        isLivePhoto: true,
        isHeic: isHeicFile(imgFile),
        type: 'LIVE_PHOTO',
      });
    } else {
      result.push({
        id: `img-${base}-${Date.now()}`,
        name: imgFile.name,
        baseName: base,
        imageFile: imgFile,
        videoFile: null,
        isLivePhoto: false,
        isHeic: isHeicFile(imgFile),
        type: 'IMAGE',
      });
    }
  }

  // Adicionar vídeos que não formaram par como vídeos normais
  for (const [base, vidFile] of videoMap.entries()) {
    if (!usedVideos.has(base)) {
      result.push({
        id: `vid-${base}-${Date.now()}`,
        name: vidFile.name,
        baseName: base,
        imageFile: null,
        videoFile: vidFile,
        isLivePhoto: false,
        type: 'VIDEO',
      });
    }
  }

  return [...result, ...otherFiles];
}

/**
 * Retorna o nome do arquivo com extensão .webp
 */
export function getWebpFilename(filename) {
  if (!filename) return 'image.webp';
  return filename.replace(/\.[^/.]+$/, '') + '.webp';
}

export default {
  convertImageToWebP,
  getWebpFilename,
  isHeicFile,
  isLivePhotoVideo,
  pairLivePhotos,
};
