/**
 * client.js — Fachada (Facade) Unificada da Camada de Infraestrutura / Repositórios
 * Mantém compatibilidade com os módulos e centraliza chamadas aos repositórios de domínio.
 */
import authRepository from '../modules/auth/infrastructure/authRepository.js';
import profileRepository from '../modules/profile/infrastructure/profileRepository.js';

// 1. Auth Domain
export const login = (email, password) => authRepository.login(email, password);
export const register = (user) => authRepository.register(user);

// 2. Profile Domain
export const getProfile = (token) => profileRepository.getProfile(token);
export const updateProfile = (token, data) => profileRepository.updateProfile(token, data);
export const uploadPhoto = (token, file) => profileRepository.uploadPhoto(token, file);

export default {
  login,
  register,
  getProfile,
  updateProfile,
  uploadPhoto,
};

