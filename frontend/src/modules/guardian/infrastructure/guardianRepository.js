import httpClient from '../../../core/api/httpClient.js';

export const guardianRepository = {
  /**
   * Busca todos os guardiões do usuário autenticado no MySQL
   */
  async getGuardians(token) {
    return httpClient.get('/guardians/', token);
  },

  /**
   * Busca um guardião específico por ID
   */
  async getGuardianById(token, id) {
    return httpClient.get(`/guardians/${id}`, token);
  },

  /**
   * Adiciona um novo guardião de confiança
   */
  async createGuardian(token, guardianData) {
    return httpClient.post('/guardians/', guardianData, token);
  },

  /**
   * Atualiza dados de um guardião existente
   */
  async updateGuardian(token, id, updates) {
    return httpClient.put(`/guardians/${id}`, updates, token);
  },

  /**
   * Expurga definitivamente um guardião (CryptoShred)
   */
  async deleteGuardian(token, id) {
    return httpClient.delete(`/guardians/${id}`, token);
  },

  /**
   * Busca conexões do círculo familiar
   */
  async getCircleConnections(token) {
    return httpClient.get('/guardians/circle/connections', token);
  },
};

export default guardianRepository;
