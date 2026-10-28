/**
 * apiUrl.js — Endereço único da API para uploads, mídias do cofre e sincronização em segundo plano.
 *
 * VITE_API_URL costuma terminar em /api (ex.: https://api.ethernity.app/api). As rotas do backend
 * respondem tanto em /api/* quanto na raiz, e as URLs de mídia devolvidas pelo servidor já vêm
 * com o prefixo /api — por isso elas são resolvidas contra a ORIGEM da API, nunca contra o site.
 */

const RAW_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:8000';

export const API_BASE_URL = RAW_API_URL.replace(/\/$/, '');
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

export function getStoredAuthToken() {
  try {
    const store =
      typeof window !== 'undefined' ? window.localStorage : typeof localStorage !== 'undefined' ? localStorage : null;
    return store ? store.getItem('ethernity_auth_token') || null : null;
  } catch {
    return null;
  }
}

/**
 * Converte um caminho de mídia do servidor (/api/vault/media/...) em URL absoluta utilizável em
 * <img>, <audio> e <video>. Essas tags não enviam cabeçalhos, então o JWT vai em ?token=.
 * URLs absolutas, data: e blob: são devolvidas como estão.
 */
export function resolveMediaUrl(mediaPath, token = getStoredAuthToken()) {
  if (!mediaPath || typeof mediaPath !== 'string') return null;
  if (/^(https?:|data:|blob:)/i.test(mediaPath)) return mediaPath;
  const url = `${API_ORIGIN}${mediaPath.startsWith('/') ? '' : '/'}${mediaPath}`;
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

/**
 * Requisição JSON silenciosa (sem a barra de carregamento global), para sincronização em segundo plano.
 */
export async function backgroundRequest(method, endpoint, body = undefined, token = getStoredAuthToken()) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const isJson = response.headers?.get?.('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok) {
    const error = new Error((data && (data.detail || data.message)) || `Erro HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
