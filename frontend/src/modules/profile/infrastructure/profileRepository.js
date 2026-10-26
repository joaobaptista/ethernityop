/**
 * profileRepository.js — Repositório de Infraestrutura do Domínio Profile
 */
import httpClient from '../../../core/api/httpClient.js';

export const profileRepository = {
  async getProfile(token) {
    return httpClient.get('/profile', token);
  },

  async updateProfile(token, profileData) {
    return httpClient.put('/profile', profileData, token);
  },

  async uploadPhoto(token, file) {
    const formData = new FormData();
    formData.append('photo', file);
    return httpClient.post('/profile/photo', formData, token);
  },
};

export default profileRepository;
