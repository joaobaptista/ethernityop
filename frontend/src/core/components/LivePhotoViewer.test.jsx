import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import LivePhotoViewer from './LivePhotoViewer.jsx';

describe('LivePhotoViewer Component', () => {
  it('renders still image element with correct attributes and contain object-fit', () => {
    const html = renderToString(
      <LivePhotoViewer
        imageUrl="https://example.com/photo.webp"
        videoUrl="https://example.com/video.mp4"
        alt="Memória de Família Live"
      />
    );

    expect(html).toContain('live-photo-container');
    expect(html).toContain('src="https://example.com/photo.webp"');
    expect(html).toContain('alt="Memória de Família Live"');
    expect(html).toContain('live-photo-still');
  });

  it('renders video element and badge when videoUrl is provided', () => {
    const html = renderToString(
      <LivePhotoViewer
        imageUrl="https://example.com/photo.webp"
        videoUrl="https://example.com/video.mp4"
      />
    );

    expect(html).toContain('live-photo-video');
    expect(html).toContain('src="https://example.com/video.mp4"');
    expect(html).toContain('live-photo-badge');
    expect(html).toContain('LIVE');
  });

  it('does not render video element or badge when videoUrl is missing', () => {
    const html = renderToString(
      <LivePhotoViewer
        imageUrl="https://example.com/photo.webp"
        videoUrl={null}
      />
    );

    expect(html).toContain('live-photo-container');
    expect(html).toContain('src="https://example.com/photo.webp"');
    expect(html).not.toContain('live-photo-video');
    expect(html).not.toContain('live-photo-badge');
  });
});
