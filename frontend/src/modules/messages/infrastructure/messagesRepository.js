import httpClient from '../../../core/api/httpClient.js';

export const messagesRepository = {
  /**
   * Busca todas as mensagens do usuário autenticado
   */
  async getMessages(token, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `/messages/?${query}` : '/messages/';
    return httpClient.get(url, token);
  },

  /**
   * Busca uma mensagem por ID
   */
  async getMessageById(token, id) {
    return httpClient.get(`/messages/${id}`, token);
  },

  /**
   * Cria ou agenda uma nova mensagem
   */
  async createMessage(token, messageData) {
    return httpClient.post('/messages/', messageData, token);
  },

  /**
   * Atualiza uma mensagem ou rascunho existente
   */
  async updateMessage(token, id, updates) {
    return httpClient.put(`/messages/${id}`, updates, token);
  },

  /**
   * Exclui uma mensagem
   */
  async deleteMessage(token, id) {
    return httpClient.delete(`/messages/${id}`, token);
  },

  /**
   * Gera sugestão de texto e título com Assistente de IA
   */
  async generateAiSuggestion(token, { prompt, recipientName, tone }) {
    return httpClient.post('/messages/generate-ai', { prompt, recipientName, tone }, token);
  },
};

export default messagesRepository;
