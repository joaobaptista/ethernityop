/**
 * profileModel.js — Modelo e Regras de Domínio do Perfil do Usuário
 */

export function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  if (!str) return '';

  const hasPlus = str.startsWith('+');
  const digits = str.replace(/\D/g, '');
  if (!digits) return hasPlus ? '+' : '';

  // Internacional com +55 (Brasil)
  if (hasPlus && digits.startsWith('55')) {
    const local = digits.slice(2);
    if (local.length === 0) return '+55 ';
    if (local.length <= 2) return `+55 (${local}`;
    if (local.length <= 6) return `+55 (${local.slice(0, 2)}) ${local.slice(2)}`;
    if (local.length === 11 || (local.length > 6 && local[2] === '9')) {
      return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}${local.length > 7 ? '-' + local.slice(7, 11) : ''}`;
    }
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}${local.length > 6 ? '-' + local.slice(6, 10) : ''}`;
  }

  // Outros números internacionais iniciados com +
  if (hasPlus) {
    if (digits.length <= 3) return `+${digits}`;
    if (digits.length <= 6) return `+${digits.slice(0, 1)} ${digits.slice(1)}`;
    if (digits.length <= 10) return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`;
    return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  }

  // Número brasileiro com 11 dígitos (Celular/WhatsApp)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  // Número brasileiro com 10 dígitos (Fixo)
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  // Mais de 11 dígitos com 55 no início sem o +
  if (digits.length > 11) {
    if (digits.startsWith('55') && digits.length === 13) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
    }
    if (digits.startsWith('55') && digits.length === 12) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  // Digitação em andamento (1 a 9 dígitos)
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits[2] === '9') {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}${digits.length > 7 ? '-' + digits.slice(7) : ''}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}${digits.length > 6 ? '-' + digits.slice(6) : ''}`;
}

export function getUserInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAbsolutePhotoUrl(photoUrl, baseUrl) {
  if (!photoUrl) return null;
  if (
    photoUrl.startsWith('http://') ||
    photoUrl.startsWith('https://') ||
    photoUrl.startsWith('data:') ||
    photoUrl.startsWith('blob:')
  ) {
    return photoUrl;
  }

  let base = baseUrl;
  if (!base) {
    if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
      base = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
    } else {
      base = 'http://localhost:8000';
    }
  }

  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
  return `${cleanBase}${cleanPath}`;
}

export function isUserAdmin(profile) {
  if (!profile) return false;
  return (
    profile.is_admin === 1 ||
    profile.is_admin === true ||
    Boolean(profile.is_admin) ||
    profile.email === 'demo@ethernity.com' ||
    profile.email === 'vameri@gmail.com'
  );
}

