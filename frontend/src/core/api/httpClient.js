import loadingService from '../services/loadingService.js';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:8000';

class HttpClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Monta os headers padrão incluindo JWT se presente
   */
  _getHeaders(token, isJson = true) {
    const headers = {};
    if (isJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Processa a resposta do fetch de forma padronizada
   */
  async _handleResponse(response) {
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage =
        (typeof data === 'object' && data?.detail) ||
        (typeof data === 'object' && data?.message) ||
        `Erro na requisição (${response.status}): ${response.statusText}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async _execute(requestFn) {
    loadingService.start();
    try {
      return await requestFn();
    } finally {
      loadingService.done();
    }
  }

  async get(endpoint, token = null) {
    return this._execute(async () => {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: this._getHeaders(token, false),
      });
      return this._handleResponse(response);
    });
  }

  async post(endpoint, body, token = null) {
    return this._execute(async () => {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: this._getHeaders(token, !isFormData),
        body: isFormData ? body : JSON.stringify(body),
      });
      return this._handleResponse(response);
    });
  }

  async put(endpoint, body, token = null) {
    return this._execute(async () => {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PUT',
        headers: this._getHeaders(token, true),
        body: JSON.stringify(body),
      });
      return this._handleResponse(response);
    });
  }

  async patch(endpoint, body, token = null) {
    return this._execute(async () => {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PATCH',
        headers: this._getHeaders(token, !isFormData),
        body: isFormData ? body : JSON.stringify(body),
      });
      return this._handleResponse(response);
    });
  }

  async delete(endpoint, token = null) {
    return this._execute(async () => {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE',
        headers: this._getHeaders(token, false),
      });
      return this._handleResponse(response);
    });
  }
}

export const httpClient = new HttpClient();
export default httpClient;
