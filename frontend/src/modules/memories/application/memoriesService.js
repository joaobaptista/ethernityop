/**
 * memoriesService.js — Application Layer for Memories Context (Universal Use Cases)
 * 
 * Reutilizável em React Web e React Native (iOS & Android).
 */
import memoriesRepository from '../infrastructure/memoriesRepository.js';
import {
  groupPhotosByYear,
  togglePhotoSelection,
  setAllPhotosSelection,
  calculateSelectionStats,
  createCuratedPhoto,
} from '../domain/memoriesModel.js';

export class MemoriesService {
  constructor(repository = memoriesRepository) {
    this.repository = repository;
    this.listeners = new Set();
    this._activePhotosForCapsules = null;
  }

  setActivePhotosForCapsules(photos = []) {
    this._activePhotosForCapsules = Array.isArray(photos) ? photos : [];
  }

  getActivePhotosForCapsules() {
    return this._activePhotosForCapsules;
  }

  clearActivePhotosForCapsules() {
    this._activePhotosForCapsules = null;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(photos) {
    this.listeners.forEach((callback) => {
      try {
        callback(photos);
      } catch (err) {
        console.error('[MemoriesService] Erro no listener:', err);
      }
    });
  }

  async getPhotos() {
    return this.repository.getPhotos();
  }

  getPhotosSync() {
    return this.repository.getPhotosSync();
  }

  async toggleSelection(photoId) {
    const current = await this.repository.getPhotos();
    const updated = togglePhotoSelection(current, photoId);
    await this.repository.savePhotos(updated);
    this._notify(updated);
    return updated;
  }

  async setAllSelection(selectAll = true) {
    const current = await this.repository.getPhotos();
    const updated = setAllPhotosSelection(current, selectAll);
    await this.repository.savePhotos(updated);
    this._notify(updated);
    return updated;
  }

  async importGooglePhotos(items = []) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const newPhotos = items.map((item, idx) => ({
      id: item.id || `gp-imported-${Date.now()}-${idx}`,
      img: item.media_url || item.fullUrl || item.thumbnailUrl,
      title: item.title || 'Foto importada do Google Photos',
      dateLabel: item.date || item.dateLabel || 'Recente',
      year: item.year || new Date().getFullYear(),
      selected: true,
      source: 'google_photos',
    }));

    const updated = await this.repository.addPhotos(newPhotos);
    this.setActivePhotosForCapsules(newPhotos);
    this._notify(updated);
    return updated;
  }

  async addLocalPhotos(photosData = []) {
    if (Array.isArray(photosData) && photosData.length > 0) {
      this.setActivePhotosForCapsules(photosData);
    }
    const updated = await this.repository.addPhotos(photosData);
    this._notify(updated);
    return updated;
  }

  groupByYear(photos, years) {
    return groupPhotosByYear(photos, years);
  }

  getStats(photos) {
    return calculateSelectionStats(photos);
  }
}

export const memoriesService = new MemoriesService();
export default memoriesService;

