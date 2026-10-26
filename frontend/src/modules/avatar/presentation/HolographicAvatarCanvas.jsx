import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './HolographicAvatarCanvas.css';

/**
 * HolographicAvatarCanvas
 * Renderizador de Avatar Holográfico 3D com Three.js:
 * - Olhos vivos com reflexo córneo (catchlight) e piscadas orgânicas.
 * - Boca fonoarticulatória com deformação de malha sincronizada com a voz.
 * - Efeito holográfico etéreo com aura de partículas cósmicas e anel de luz 3D.
 * - Parallax interativo: o holograma acompanha sutilmente o olhar e a posição do mouse.
 */
export default function HolographicAvatarCanvas({
  photoSrc,
  isPlaying = false,
  voiceEnergy = 0,
  width = 240,
  height = 240,
  className = '',
  onClick = null,
}) {
  const containerRef = useRef(null);
  const isPlayingRef = useRef(isPlaying);
  const voiceEnergyRef = useRef(voiceEnergy);
  const mousePosRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    voiceEnergyRef.current = voiceEnergy;
  }, [voiceEnergy]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !photoSrc) return;

    // 1. Configuração da Cena e Câmera Three.js
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5eb, 1.4);
    keyLight.position.set(2, 2, 3);
    scene.add(keyLight);

    // Rim light holográfico (Coral & Dourado Ethernity)
    const rimLightLeft = new THREE.DirectionalLight(0xf05a47, 2.2);
    rimLightLeft.position.set(-3, 1, 1);
    scene.add(rimLightLeft);

    const rimLightRight = new THREE.DirectionalLight(0xf59e0b, 1.8);
    rimLightRight.position.set(3, -1, 1);
    scene.add(rimLightRight);

    // 3. Grupo Principal da Cabeça (Permite rotação em conjunto)
    const headGroup = new THREE.Group();
    scene.add(headGroup);

    // 4. Malha Facial Deformável (PlaneGeometry subdividido para boca e respiração)
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    let faceMesh = null;
    let originalPositions = null;

    textureLoader.load(
      photoSrc,
      (texture) => {
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;

        // Malha 48x48 para deformação precisa de lábios e queixo
        const geometry = new THREE.PlaneGeometry(2.3, 2.3, 48, 48);
        originalPositions = geometry.attributes.position.clone();

        // Curvatura facial elipsoidal (para volume 3D)
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const distFromCenter = Math.sqrt(x * x + y * y);
          // Curva as bordas para trás criando volume facial 3D
          const zDepth = -Math.pow(distFromCenter / 1.5, 2) * 0.35;
          pos.setZ(i, zDepth);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.35,
          metalness: 0.1,
          transparent: true,
          side: THREE.DoubleSide,
        });

        faceMesh = new THREE.Mesh(geometry, material);
        headGroup.add(faceMesh);
      },
      undefined,
      (err) => {
        console.warn('[HolographicAvatarCanvas] Erro ao carregar textura do avatar:', err);
      }
    );

    // 5. Olhos Vivos: Brilho de Córnea (Catchlight 3D) & Pálpebras
    const eyeGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });

    const leftEyeLight = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), eyeGlowMaterial);
    leftEyeLight.position.set(-0.35, 0.22, 0.05);
    headGroup.add(leftEyeLight);

    const rightEyeLight = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), eyeGlowMaterial);
    rightEyeLight.position.set(0.35, 0.22, 0.05);
    headGroup.add(rightEyeLight);

    // 6. Anel Holográfico de Energia Orbital
    const ringGeo = new THREE.TorusGeometry(1.65, 0.015, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf05a47,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const holoRing = new THREE.Mesh(ringGeo, ringMat);
    holoRing.rotation.x = Math.PI / 2.3;
    scene.add(holoRing);

    // 7. Partículas Holográficas de Aura (Poeira Estelar do Legado)
    const particleCount = 70;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const radius = 1.2 + Math.random() * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 2.5;

      particlePositions[i * 3] = Math.cos(theta) * radius;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = Math.sin(theta) * radius;
      particleSpeeds[i] = 0.005 + Math.random() * 0.01;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.04,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // 8. Interação do Mouse (Parallax do Olhar)
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mousePosRef.current.targetX = x * 0.35;
      mousePosRef.current.targetY = y * 0.25;
    };

    const handleMouseLeave = () => {
      mousePosRef.current.targetX = 0;
      mousePosRef.current.targetY = 0;
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    // 9. Loop de Animação a 60 FPS
    let animationFrameId = null;
    let clock = new THREE.Clock();
    let nextBlinkTime = 2.0;
    let isBlinking = false;
    let blinkDuration = 0.16;
    let blinkTimer = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Suavização do movimento do mouse (Lerp)
      mousePosRef.current.x += (mousePosRef.current.targetX - mousePosRef.current.x) * 0.08;
      mousePosRef.current.y += (mousePosRef.current.targetY - mousePosRef.current.y) * 0.08;

      // Micro-movimentos naturais de cabeça e respiração
      const breathY = Math.sin(time * 1.6) * 0.035;
      const idleHeadRoll = Math.sin(time * 0.8) * 0.02;

      headGroup.rotation.y = mousePosRef.current.x + idleHeadRoll;
      headGroup.rotation.x = -mousePosRef.current.y + (breathY * 0.3);
      headGroup.position.y = breathY;

      // Rotação suave do anel e das partículas holográficas
      holoRing.rotation.z = time * 0.25;
      holoRing.rotation.y = Math.sin(time * 0.4) * 0.15;

      const pPos = particleSystem.geometry.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        let py = pPos.getY(i);
        py += particleSpeeds[i];
        if (py > 1.4) py = -1.4;
        pPos.setY(i, py);
      }
      pPos.needsUpdate = true;

      // Controle de Piscada Orgânica dos Olhos
      if (time > nextBlinkTime && !isBlinking) {
        isBlinking = true;
        blinkTimer = 0;
        nextBlinkTime = time + 2.5 + Math.random() * 2.5; // Piscada a cada 2.5s a 5s
      }

      if (isBlinking) {
        blinkTimer += delta;
        const blinkProgress = blinkTimer / blinkDuration;
        if (blinkProgress >= 1) {
          isBlinking = false;
          leftEyeLight.scale.set(1, 1, 1);
          rightEyeLight.scale.set(1, 1, 1);
        } else {
          // Escala Y do olho diminui para simular a pálpebra fechando e abrindo
          const scaleY = Math.abs(Math.sin(blinkProgress * Math.PI - (Math.PI / 2)));
          leftEyeLight.scale.y = Math.max(0.05, scaleY);
          rightEyeLight.scale.y = Math.max(0.05, scaleY);
        }
      }

      // Deformação da Boca e Mandíbula com a Voz
      if (faceMesh && originalPositions) {
        const currentPos = faceMesh.geometry.attributes.position;
        const voicePwr = isPlayingRef.current ? Math.max(0.1, voiceEnergyRef.current) : 0;
        const mouthOpenAmount = voicePwr * 0.22; // Intensidade da abertura da boca
        const mouthWidthAmount = Math.sin(time * 12) * voicePwr * 0.04;

        for (let i = 0; i < currentPos.count; i++) {
          const origX = originalPositions.getX(i);
          const origY = originalPositions.getY(i);
          const origZ = originalPositions.getZ(i);

          // Região da boca e mandíbula (terço inferior do rosto: Y entre -0.7 e -0.15)
          if (origY < -0.15 && origY > -0.75 && Math.abs(origX) < 0.45) {
            const mouthFactor = Math.cos((origX / 0.45) * (Math.PI / 2));
            const yOffset = -mouthOpenAmount * mouthFactor;
            const xOffset = origX > 0 ? mouthWidthAmount : -mouthWidthAmount;
            const zOffset = (voicePwr * 0.05) * mouthFactor;

            currentPos.setY(i, origY + yOffset);
            currentPos.setX(i, origX + xOffset);
            currentPos.setZ(i, origZ - zOffset);
          } else {
            currentPos.setY(i, origY);
            currentPos.setX(i, origX);
            currentPos.setZ(i, origZ);
          }
        }
        currentPos.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 10. Limpeza ao Desmontar
    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      renderer.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    };
  }, [photoSrc, width, height]);

  return (
    <div
      ref={containerRef}
      className={`holo-avatar-container ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
    />
  );
}
