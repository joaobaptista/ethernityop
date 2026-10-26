/**
 * rateLimit.js
 * Limitador de tentativas em memória (janela fixa) para rotas sensíveis como
 * login e cadastro. Cada instância mantém o próprio contador; com várias
 * instâncias, troque o Map por um store compartilhado (ex.: Redis).
 */
import config from './config.js';

/**
 * @param {object} options
 * @param {number} options.windowMs  duração da janela
 * @param {number} options.max       tentativas permitidas por chave na janela
 * @param {(req) => string|null} options.key  chave do contador (null = não conta)
 * @param {boolean} [options.enabled]  padrão: config.rateLimitEnabled
 */
export function createRateLimiter({ windowMs, max, key, enabled = config.rateLimitEnabled }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(k);
    }
  }, windowMs);
  sweep.unref?.();

  return function rateLimit(req, res, next) {
    if (!enabled) return next();
    const k = key(req);
    if (!k) return next();

    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ detail: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    return next();
  };
}

export const byIp = (prefix) => (req) => `${prefix}:ip:${req.ip}`;

export const byEmail = (prefix) => (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return email ? `${prefix}:email:${email}` : null;
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Força bruta distribuída numa conta (por e-mail) e varredura a partir de um IP.
export const loginLimiters = [
  createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: 10, key: byEmail('login') }),
  createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: 30, key: byIp('login') }),
];

export const registerLimiters = [
  createRateLimiter({ windowMs: ONE_HOUR, max: 10, key: byIp('register') }),
];
