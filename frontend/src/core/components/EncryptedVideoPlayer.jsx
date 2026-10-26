/**
 * EncryptedVideoPlayer.jsx
 * Player de vídeo de alta fidelidade (Padrão YouTube) com suporte nativo
 * a streaming criptografado sob demanda via HTTP 206 Range Requests.
 *
 * Tecnologias:
 *  - H.264 / AVC + AAC com +faststart moov atom decifrado em blocos AEAD (64 KB).
 *  - Poster WebP decifrado diretamente do cofre.
 *  - Barra de scrubbing de alta precisão com suporte a buffer range.
 *  - Velocidades de reprodução (0.5x até 2x), tela cheia e atalhos de teclado.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './EncryptedVideoPlayer.css';

const AUTH_TOKEN_KEY = 'ethernity_auth_token';

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function EncryptedVideoPlayer({
  mediaId,
  streamUrl: propStreamUrl,
  posterUrl: propPosterUrl,
  title = 'Vídeo no Cofre',
  durationSeconds = 0,
  token: explicitToken,
  autoPlay = false,
  className = '',
}) {
  const videoRef = useRef(null);
  const scrubberRef = useRef(null);
  const containerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const token = useMemo(() => {
    if (explicitToken) return explicitToken;
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }, [explicitToken]);

  const resolvedStreamUrl = useMemo(() => {
    const raw = propStreamUrl || (mediaId ? `/api/vault/media/${mediaId}/stream` : '');
    if (!raw) return '';
    const cleanBase = raw.split('?')[0];
    return token ? `${cleanBase}?token=${encodeURIComponent(token)}` : cleanBase;
  }, [propStreamUrl, mediaId, token]);

  const resolvedPosterUrl = useMemo(() => {
    const raw = propPosterUrl || (mediaId ? `/api/vault/media/${mediaId}/poster` : '');
    if (!raw) return '';
    const cleanBase = raw.split('?')[0];
    return token ? `${cleanBase}?token=${encodeURIComponent(token)}` : cleanBase;
  }, [propPosterUrl, mediaId, token]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (!duration || duration === 0) {
      setDuration(video.duration || 0);
    }

    if (video.buffered.length > 0) {
      setBufferedEnd(video.buffered.end(video.buffered.length - 1));
    }
  };

  const handleScrubberClick = (e) => {
    const video = videoRef.current;
    const scrubber = scrubberRef.current;
    if (!video || !scrubber) return;

    const rect = scrubber.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * (duration || video.duration || 0);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleSpeedChange = (e) => {
    const rate = parseFloat(e.target.value);
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight' && videoRef.current) {
        e.preventDefault();
        videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
      } else if (e.code === 'ArrowLeft' && videoRef.current) {
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, duration]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`encrypted-video-player-wrapper ${className}`}
      onMouseMove={() => setControlsVisible(true)}
      onMouseLeave={() => isPlaying && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        src={resolvedStreamUrl}
        poster={resolvedPosterUrl}
        className="encrypted-video-element"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
      />

      {!isPlaying && (
        <div className="encrypted-video-overlay-play" onClick={togglePlay} title="Assistir Vídeo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      )}

      <div className={`encrypted-video-controls-bar ${controlsVisible ? 'is-visible' : ''}`}>
        <div
          ref={scrubberRef}
          className="encrypted-video-scrubber-container"
          onClick={handleScrubberClick}
          title="Buscar no vídeo (Range HTTP 206)"
        >
          <div className="encrypted-video-scrubber-buffered" style={{ width: `${bufferedPercent}%` }} />
          <div className="encrypted-video-scrubber-progress" style={{ width: `${progressPercent}%` }} />
          <div className="encrypted-video-scrubber-thumb" style={{ left: `${progressPercent}%` }} />
        </div>

        <div className="encrypted-video-controls-row">
          <div className="encrypted-video-controls-left">
            <button className="encrypted-video-btn" onClick={togglePlay} title={isPlaying ? 'Pausar' : 'Reproduzir'}>
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button className="encrypted-video-btn" onClick={toggleMute} title={isMuted ? 'Desmutar' : 'Mutar'}>
              {isMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>

            <div className="encrypted-video-time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="encrypted-video-controls-right">
            <span className="encrypted-video-badge-security" title="Cifragem em Trânsito e Repouso com Chunked AEAD">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              AES-GCM
            </span>

            <select
              className="encrypted-video-rate-select"
              value={playbackRate}
              onChange={handleSpeedChange}
              title="Velocidade de Reprodução"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>

            <button className="encrypted-video-btn" onClick={toggleFullscreen} title="Tela Cheia">
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
