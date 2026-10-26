/**
 * adminRepository.js
 * Comunicação com as rotas administrativas no backend Ethernity.
 */
import httpClient from '../../../core/api/httpClient.js';

export const adminRepository = {
  /**
   * Listar todos os usuários do sistema com filtros opcionais
   */
  async listUsers(token, { search = '', role = 'all' } = {}) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (role && role !== 'all') params.append('role', role);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await httpClient.get(`/admin/users${queryString}`, token);
    return res || { total: 0, users: [] };
  },

  /**
   * Conceder ou revogar papel de Administrador
   */
  async setUserAdminRole(token, userId, isAdmin) {
    const res = await httpClient.patch(
      `/admin/users/${userId}/role`,
      { is_admin: Boolean(isAdmin) },
      token
    );
    return res;
  },

  /**
   * Obter métricas do painel administrativo
   */
  async getMetrics(token) {
    const res = await httpClient.get('/admin/metrics', token);
    return res || {};
  },

  /**
   * Excluir usuário definitivamente do sistema (Admin e Root)
   */
  async deleteUser(token, userId) {
    const res = await httpClient.delete(`/admin/users/${userId}`, token);
    return res;
  },

  /**
   * Excluir múltiplos usuários em lote (Admin e Root, ignora administradores)
   */
  async batchDeleteUsers(token, userIds) {
    const res = await httpClient.post('/admin/users/batch-delete', { userIds }, token);
    return res;
  },
};

export default adminRepository;
