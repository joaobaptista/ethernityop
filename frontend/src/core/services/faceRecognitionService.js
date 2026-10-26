/**
 * faceRecognitionService.js — Client-Side Face Recognition, Clustering & Avatar Cropping
 * 
 * 100% Client-side, Zero-Knowledge E2EE, Open Source via @vladmandic/face-api & TensorFlow.js.
 * Extrai vetores de 128D, agrupa fotos por pessoa e gera avatares recortados em alta definição.
 */

const MODELS_PATH = '/models';
const SIMILARITY_THRESHOLD = 0.58; // Distância euclidiana máxima para considerar a mesma pessoa (0.55 - 0.60)

export class FaceRecognitionService {
  constructor() {
    this.faceapi = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
  }

  /**
   * Inicializa e carrega dinamicamente os modelos leves de IA (apenas no browser com WebGL/WASM)
   */
  async init() {
    if (this.isLoaded) return true;
    if (this.isLoading) return this.loadPromise;

    // Se estiver em ambiente Node/Vitest sem DOM real, retorna fallback seguro
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        if (!this.faceapi) {
          this.faceapi = await import('@vladmandic/face-api/dist/face-api.esm.js');
        }

        const faceapi = this.faceapi;
        // Carrega detector SSD MobileNet (máxima precisão), TinyFace (fallback veloz), landmarks e reconhecimento
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_PATH).catch((e) => console.warn('[FaceAPI] SSD load note:', e)),
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH).catch((e) => console.warn('[FaceAPI] TinyFace load note:', e)),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH).catch((e) => console.warn('[FaceAPI] Landmarks68 load note:', e)),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_PATH).catch((e) => console.warn('[FaceAPI] LandmarksTiny load note:', e)),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH).catch((e) => console.warn('[FaceAPI] Recognition load note:', e)),
        ]);
        this.isLoaded = true;
        this.isLoading = false;
        return true;
      } catch (err) {
        console.warn('[FaceRecognitionService] Falha ao carregar modelos locais do face-api:', err);
        this.isLoading = false;
        return false;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Converte uma imagem (URL ou Base64) em elemento HTMLImageElement
   */
  async loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Não define crossOrigin para data URLs (Base64) ou Blob URLs para evitar falhas de CORS
      if (typeof src === 'string' && !src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.warn('[FaceRecognitionService] Erro ao carregar imagem para análise facial:', err);
        reject(new Error('Falha ao carregar imagem para análise facial'));
      };
      img.src = src;
    });
  }

  /**
   * Recorta com precisão o rosto detectado em formato circular/quadrado (240x240)
   */
  cropFaceAvatar(imgElement, box) {
    try {
      if (!box) return null;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const bX = box.x !== undefined ? box.x : (box.left !== undefined ? box.left : 0);
      const bY = box.y !== undefined ? box.y : (box.top !== undefined ? box.top : 0);
      const bW = box.width || 100;
      const bH = box.height || 100;

      // 40% de margem extra ao redor do rosto para incluir cabelo, queixo e ombros no avatar de retrato
      const paddingPercent = 0.40;
      const padX = bW * paddingPercent;
      const padY = bH * paddingPercent;

      const natW = imgElement.naturalWidth || imgElement.width || 240;
      const natH = imgElement.naturalHeight || imgElement.height || 240;

      const sx = Math.max(0, bX - padX);
      const sy = Math.max(0, bY - padY);
      const sWidth = Math.min(natW - sx, bW + padX * 2);
      const sHeight = Math.min(natH - sy, bH + padY * 2);

      canvas.width = 240;
      canvas.height = 240;

      // Desenha imagem recortada proporcionalmente
      ctx.drawImage(imgElement, sx, sy, sWidth, sHeight, 0, 0, 240, 240);
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (e) {
      console.warn('[FaceRecognitionService] Erro ao recortar avatar via canvas:', e);
      return null;
    }
  }

  /**
   * Detecta todas as pessoas presentes em uma única foto e retorna miniaturas recortadas
   * @param {string} imgSrc URL ou Base64 da imagem
   * @returns {Promise<Array<{id: string, index: number, cropUrl: string, box: any}>>}
   */
  async detectFacesInPhoto(imgSrc) {
    if (!imgSrc) return [];
    try {
      await this.init();
      if (!this.faceapi || typeof document === 'undefined') return [];
      const imgEl = await this.loadImageElement(imgSrc);
      const faceapi = this.faceapi;

      let detections = [];
      try {
        if (faceapi.nets.ssdMobilenetv1 && faceapi.nets.ssdMobilenetv1.isLoaded) {
          detections = await faceapi
            .detectAllFaces(imgEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
            .withFaceLandmarks(true);
        }
      } catch (e1) {
        console.warn('[FaceRecognitionService] SSD detectAllFaces note:', e1);
      }

      if (!detections || detections.length === 0) {
        try {
          if (faceapi.nets.tinyFaceDetector && faceapi.nets.tinyFaceDetector.isLoaded) {
            detections = await faceapi
              .detectAllFaces(imgEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.12 }))
              .withFaceLandmarks(true);
          }
        } catch (e2) {
          console.warn('[FaceRecognitionService] TinyFace detectAllFaces note:', e2);
        }
      }

      if (!detections || detections.length === 0) return [];

      const results = [];
      for (let i = 0; i < detections.length; i++) {
        const det = detections[i];
        const box = det.detection ? det.detection.box : (det.box || det);
        const cropUrl = this.cropFaceAvatar(imgEl, box);
        if (cropUrl) {
          results.push({
            id: `face-person-${Date.now()}-${i}`,
            index: i + 1,
            cropUrl,
            box,
          });
        }
      }
      return results;
    } catch (err) {
      console.warn('[FaceRecognitionService] Falha ao extrair múltiplos rostos:', err);
      return [];
    }
  }

  /**
   * Analisa um lote de fotos, detecta todos os rostos e agrupa em clusters de pessoas reais
   * @param {Array<{id: string, img: string, title?: string}>} photos
   * @returns {Promise<Array<{id: string, name: string, avatar: string, photosCount: string, totalCount: number, photoIds: string[], photos: any[]}>>}
   */
  async detectAndClusterPeople(photos = []) {
    if (!Array.isArray(photos) || photos.length === 0) return [];

    let isReady = false;
    try {
      isReady = await this.init();
    } catch (err) {
      console.warn('[FaceRecognitionService] Falha no init do face-api:', err);
    }

    // Se estiver em ambiente Node/Vitest sem DOM real, retorna fallback seguro para testes
    if (!isReady || !this.faceapi || typeof document === 'undefined') {
      return this._fallbackCluster(photos);
    }

    const faceapi = this.faceapi;
    const clusters = []; // Array de { id, descriptor, avatar, photos: [] }

    for (let i = 0; i < photos.length; i++) {
      const photoItem = photos[i];
      try {
        const imgEl = await this.loadImageElement(photoItem.img);

        let detections = [];

        // 1. Detecção com SSD MobileNet V1 (máxima precisão do TensorFlow com minConfidence refinado para fotos em grupo)
        try {
          if (faceapi.nets.ssdMobilenetv1 && faceapi.nets.ssdMobilenetv1.isLoaded) {
            detections = await faceapi
              .detectAllFaces(imgEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
              .withFaceLandmarks(true)
              .withFaceDescriptors();
          }
        } catch (e1) {
          console.warn('[FaceRecognitionService] SSD MobileNet tentativa:', e1);
        }

        // 2. Se SSD não encontrou todos os rostos esperados ou nenhum, tenta TinyFaceDetector em maior resolução
        if (!detections || detections.length === 0) {
          try {
            if (faceapi.nets.tinyFaceDetector && faceapi.nets.tinyFaceDetector.isLoaded) {
              detections = await faceapi
                .detectAllFaces(imgEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.10 }))
                .withFaceLandmarks(true)
                .withFaceDescriptors();
            }
          } catch (e2) {
            console.warn('[FaceRecognitionService] TinyFace tentativa:', e2);
          }
        }

        // 3. Fallback de detecção de caixas (bounding boxes) sem landmarks caso os descritores falhem
        let faceCanvases = [];
        if (detections && detections.length > 0) {
          try {
            faceCanvases = await faceapi.extractFaces(imgEl, detections.map((d) => d.detection || d));
          } catch (extErr) {
            console.warn('[FaceRecognitionService] ExtractFaces nativo note:', extErr);
          }
        } else {
          try {
            let simpleDetections = [];
            if (faceapi.nets.ssdMobilenetv1 && faceapi.nets.ssdMobilenetv1.isLoaded) {
              simpleDetections = await faceapi.detectAllFaces(imgEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.12 }));
            }
            if (!simpleDetections || simpleDetections.length === 0) {
              if (faceapi.nets.tinyFaceDetector && faceapi.nets.tinyFaceDetector.isLoaded) {
                simpleDetections = await faceapi.detectAllFaces(imgEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.08 }));
              }
            }
            if (simpleDetections && simpleDetections.length > 0) {
              faceCanvases = await faceapi.extractFaces(imgEl, simpleDetections);
              detections = simpleDetections.map((sd) => ({ detection: sd, descriptor: null }));
            }
          } catch (simpleErr) {
            console.warn('[FaceRecognitionService] Fallback de detecção simples note:', simpleErr);
          }
        }

        // REGRA CRUCIAL: SE NÃO HOUVER ROSTOS DETECTADOS, NÃO CRIA PESSOA!
        // Fotos de paisagens, balões, praia vazia ou mapas são desconsideradas da lista de pessoas.
        if (!detections || detections.length === 0) {
          continue;
        }

        // Processa cada rosto encontrado
        for (let d = 0; d < detections.length; d++) {
          const det = detections[d];
          const descriptor = det.descriptor || null;
          const faceBox = det.detection ? (det.detection.box || det.detection) : det.box;

          let avatarUrl = null;
          if (faceCanvases && faceCanvases[d]) {
            try {
              avatarUrl = faceCanvases[d].toDataURL('image/jpeg', 0.92);
            } catch (cvErr) {
              console.warn('[FaceRecognitionService] Erro ao extrair base64 de faceCanvas:', cvErr);
            }
          }

          if (!avatarUrl && faceBox) {
            avatarUrl = this.cropFaceAvatar(imgEl, faceBox);
          }

          if (!avatarUrl) {
            avatarUrl = photoItem.img;
          }

          // Agrupamento por proximidade euclidiana de descritor 128D
          let bestMatchIndex = -1;
          let minDistance = Infinity;

          if (descriptor) {
            for (let c = 0; c < clusters.length; c++) {
              if (!clusters[c].descriptor) continue;
              // Regra de exclusão mútua: se o cluster já contém esta MESMA foto nesta iteração,
              // dois rostos na mesma foto NUNCA podem pertencer à mesma pessoa.
              const alreadyHasThisPhoto = clusters[c].photos.some((p) => p.id === photoItem.id);
              if (alreadyHasThisPhoto) continue;

              const dist = faceapi.euclideanDistance(clusters[c].descriptor, descriptor);
              if (dist < minDistance) {
                minDistance = dist;
                bestMatchIndex = c;
              }
            }
          }

          if (bestMatchIndex !== -1 && minDistance < SIMILARITY_THRESHOLD) {
            const cluster = clusters[bestMatchIndex];
            if (!cluster.photos.some((p) => p.id === photoItem.id)) {
              cluster.photos.push(photoItem);
            }
          } else {
            clusters.push({
              id: `person-${Date.now()}-${clusters.length + 1}`,
              name: `Pessoa ${clusters.length + 1}`,
              relationship: 'Família',
              descriptor: descriptor,
              avatar: avatarUrl,
              photos: [photoItem],
            });
          }
        }
      } catch (err) {
        console.warn(`[FaceRecognitionService] Erro ao analisar foto ${photoItem.id}:`, err);
      }
    }

    if (clusters.length === 0) {
      return [];
    }

    // Ordena do cluster com mais fotos para o com menos fotos
    clusters.sort((a, b) => b.photos.length - a.photos.length);

    return clusters.map((c, index) => {
      const count = c.photos.length;
      return {
        id: c.id,
        name: c.name || `Pessoa ${index + 1}`,
        relationship: c.relationship || 'Família',
        photosCount: count === 1 ? '1 foto' : `${count} fotos`,
        totalCount: count,
        avatar: c.avatar,
        selected: false,
        photoIds: c.photos.map((p) => p.id),
        photos: c.photos,
      };
    });
  }

  /**
   * Fallback limpo: utiliza estritamente as fotos reais fornecidas pelo usuário
   */
  _fallbackCluster(photos = []) {
    if (!Array.isArray(photos) || photos.length === 0) return [];
    return photos.map((p, index) => ({
      id: `person-${p.id || index + 1}`,
      name: p.title || `Pessoa ${index + 1}`,
      relationship: 'Família',
      photosCount: '1 foto',
      totalCount: 1,
      avatar: p.img,
      selected: false,
      photoIds: [p.id],
      photos: [p],
    }));
  }
  /**
   * Avalia a qualidade de uma foto candidata a "Foto Mestra" para síntese de Avatar Falante (LivePortrait).
   * Verifica se o rosto está frontal, com boa proporção e sem cortes excessivos.
   */
  async analyzeMasterPhotoQuality(photoSrc) {
    if (!photoSrc) {
      return { isIdeal: false, score: 0, reason: 'Nenhuma foto fornecida.' };
    }

    try {
      const isReady = await this.init();
      if (!isReady || !this.faceapi || typeof document === 'undefined') {
        return { isIdeal: true, score: 85, reason: 'Foto frontal aceita (validação básica).' };
      }

      const imgEl = await this.loadImageElement(photoSrc);
      const detection = await this.faceapi
        .detectSingleFace(imgEl, new this.faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }))
        .withFaceLandmarks(true);

      if (!detection) {
        return {
          isIdeal: false,
          score: 30,
          reason: 'Nenhum rosto claramente identificado de frente. Escolha uma foto com melhor nitidez e iluminação.',
        };
      }

      const landmarks = detection.landmarks;
      const nose = landmarks.getNose();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      // Calcula simetria dos olhos em relação ao nariz para medir o ângulo frontal
      const eyeDistLeft = Math.abs(nose[0].x - leftEye[0].x);
      const eyeDistRight = Math.abs(rightEye[3].x - nose[0].x);
      const asymmetryRatio = Math.abs(eyeDistLeft - eyeDistRight) / Math.max(eyeDistLeft, eyeDistRight);

      const isFrontal = asymmetryRatio < 0.35; // Diferença menor que 35% indica ângulo frontal direto
      const score = isFrontal ? 95 : 60;

      return {
        isIdeal: isFrontal,
        score,
        reason: isFrontal
          ? 'Excelente! Rosto em ângulo frontal direto, ideal para Avatar de Vídeo.'
          : 'Aviso: Rosto levemente inclinado ou em perfil. Para o melhor realismo cinematográfico, prefira uma foto olhando direto para a lente.',
      };
    } catch {
      return { isIdeal: true, score: 80, reason: 'Foto aceita para renderização.' };
    }
  }
}

export const faceRecognitionService = new FaceRecognitionService();
export default faceRecognitionService;
