import { describe, it, expect } from 'vitest';
import {
  convertImageToWebP,
  getWebpFilename,
  isHeicFile,
  isLivePhotoVideo,
  pairLivePhotos,
} from './mediaOptimizer.js';

describe('mediaOptimizer', () => {
  describe('getWebpFilename', () => {
    it('replaces image extension with .webp', () => {
      expect(getWebpFilename('photo.jpg')).toBe('photo.webp');
      expect(getWebpFilename('avatar.png')).toBe('avatar.webp');
      expect(getWebpFilename('my.photo.heic')).toBe('my.photo.webp');
    });

    it('returns default webp name if filename is empty', () => {
      expect(getWebpFilename('')).toBe('image.webp');
      expect(getWebpFilename(null)).toBe('image.webp');
    });
  });

  describe('isHeicFile', () => {
    it('identifies .heic and .heif extensions and mime types', () => {
      expect(isHeicFile(new File([''], 'IMG_0042.HEIC'))).toBe(true);
      expect(isHeicFile(new File([''], 'photo.heif'))).toBe(true);
      expect(isHeicFile(new File([''], 'unknown.bin', { type: 'image/heic' }))).toBe(true);
      expect(isHeicFile(new File([''], 'unknown.bin', { type: 'image/heif' }))).toBe(true);
      expect(isHeicFile(new File([''], 'normal.jpg', { type: 'image/jpeg' }))).toBe(false);
      expect(isHeicFile(null)).toBe(false);
    });
  });

  describe('isLivePhotoVideo', () => {
    it('identifies companion .mov videos for Apple Live Photos', () => {
      expect(isLivePhotoVideo(new File([''], 'IMG_0042.MOV'))).toBe(true);
      expect(isLivePhotoVideo(new File([''], 'clip.bin', { type: 'video/quicktime' }))).toBe(true);
      expect(isLivePhotoVideo(new File([''], 'clip.mp4', { type: 'video/mp4' }))).toBe(true);
      expect(isLivePhotoVideo(new File([''], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false);
      expect(isLivePhotoVideo(null)).toBe(false);
    });
  });

  describe('pairLivePhotos', () => {
    it('automatically pairs matching photo and video by base name', () => {
      const imgFile = new File(['fake-heic'], 'IMG_1024.HEIC', { type: 'image/heic' });
      const movFile = new File(['fake-mov'], 'IMG_1024.MOV', { type: 'video/quicktime' });
      const singleImg = new File(['fake-jpg'], 'VACATION.JPG', { type: 'image/jpeg' });

      const pairs = pairLivePhotos([imgFile, movFile, singleImg]);

      expect(pairs).toHaveLength(2);
      const livePair = pairs.find((p) => p.isLivePhoto);
      expect(livePair).toBeDefined();
      expect(livePair.baseName).toBe('img_1024');
      expect(livePair.imageFile).toBe(imgFile);
      expect(livePair.videoFile).toBe(movFile);
      expect(livePair.isHeic).toBe(true);

      const standardPhoto = pairs.find((p) => !p.isLivePhoto);
      expect(standardPhoto).toBeDefined();
      expect(standardPhoto.baseName).toBe('vacation');
      expect(standardPhoto.videoFile).toBeNull();
    });

    it('returns empty array when passed empty or null input', () => {
      expect(pairLivePhotos([])).toEqual([]);
      expect(pairLivePhotos(null)).toEqual([]);
    });
  });

  describe('convertImageToWebP', () => {
    it('returns non-image files untouched', async () => {
      const textFile = new File(['hello'], 'note.txt', { type: 'text/plain' });
      const result = await convertImageToWebP(textFile);
      expect(result).toBe(textFile);
    });

    it('returns SVG files untouched to keep vector resolution', async () => {
      const svgFile = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });
      const result = await convertImageToWebP(svgFile);
      expect(result).toBe(svgFile);
    });

    it('preserves HEIC files intact for server-side Sharp processing', async () => {
      const heicFile = new File(['raw-heic-bytes'], 'family.heic', { type: 'image/heic' });
      const result = await convertImageToWebP(heicFile);
      expect(result).toBe(heicFile);
    });

    it('handles null or undefined input gracefully', async () => {
      expect(await convertImageToWebP(null)).toBeNull();
      expect(await convertImageToWebP(undefined)).toBeUndefined();
    });
  });
});
