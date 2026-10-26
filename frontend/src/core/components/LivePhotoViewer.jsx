import React, { useState, useRef, useEffect } from 'react';
import './LivePhotoViewer.css';

/**
 * LivePhotoViewer.jsx
 * Visualizador de alta fidelidade para Apple Live Photos e fotos dinâmicas.
 * Respeita a Regra 1 de Governança (object-fit: contain) e reproduz a camada de movimento
 * sob demanda com interação tátil ou hover.
 *
 * @param {Object} props
 * @param {string} props.imageUrl URL da imagem estática (WebP de alta fidelidade)
 * @param {string} props.videoUrl URL da camada de movimento (vídeo MP4 HTTP 206)
 * @param {string} [props.alt] Texto alternativo da imagem
 * @param {string} [props.className] Classes CSS adicionais
 * @param {Object} [props.style] Estilos em linha
 */
export default function LivePhotoViewer({
  imageUrl,
  videoUrl,
  alt = 'Apple Live Photo',
  className = '',
  style = {},
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef(null);

  // Reproduzir vídeo quando ativado por hover ou toque
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (isPlaying || isHovered) {
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[LivePhotoViewer] Autoplay suave pausado:', err.message);
        });
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isPlaying, isHovered, videoUrl]);

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setIsHovered(false);
  };

  return (
    <div
      className={`live-photo-container ${className} ${isPlaying || isHovered ? 'is-playing' : ''}`}
      style={style}
      onMouseEnter={() => videoUrl && setIsHovered(true)}
      onMouseLeave={() => videoUrl && setIsHovered(false)}
      onTouchStart={() => videoUrl && setIsPlaying(true)}
      onTouchEnd={() => videoUrl && setIsPlaying(false)}
    >
      {/* 1. Imagem Base Estática — object-fit: contain (Regra de Governança §1) */}
      <img
        src={imageUrl}
        alt={alt}
        className="live-photo-still"
        loading="lazy"
        draggable={false}
      />

      {/* 2. Camada de Vídeo MP4 (H.264 FastStart) */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          className={`live-photo-video ${videoLoaded && (isPlaying || isHovered) ? 'visible' : ''}`}
          playsInline
          muted
          preload="metadata"
          onLoadedData={() => setVideoLoaded(true)}
          onEnded={handleVideoEnded}
        />
      )}

      {/* 3. Badge Apple Live Photo */}
      {videoUrl && (
        <button
          type="button"
          className={`live-photo-badge ${isPlaying || isHovered ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsPlaying(!isPlaying);
          }}
          title="Apple Live Photo — Segure ou passe o mouse para animar"
          aria-label="Reproduzir Live Photo"
        >
          <span className="live-icon-rings">
            <span className="ring ring-outer" />
            <span className="ring ring-inner" />
            <span className="ring ring-dot" />
          </span>
          <span className="live-text">LIVE</span>
        </button>
      )}
    </div>
  );
}
