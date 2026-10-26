/**
 * db.js
 * In-memory data store for the mock. Provides the same conceptual entities
 * as the real backend (User, Device with soft-delete, Area, Message) but
 * backed by plain arrays — there is no persistence and no database.
 */
import { buildSeed } from './seed.js';

export const store = {
  users: [],
  devices: [],
  areas: [],
  messages: [],
};

export function reseed() {
  const data = buildSeed();
  // Em produção nenhum usuário semeado (com senha pública) existe em memória.
  store.users = process.env.NODE_ENV === 'production' ? [] : data.users;
  store.devices = data.devices || [];
  store.areas = data.areas || [];
  store.messages = data.messages || [];
  return data;
}

reseed();

// ---- lookups ------------------------------------------------------------

export function findUserByEmail(email) {
  return store.users.find((u) => u.email === email);
}

export function findUserById(id) {
  return store.users.find((u) => u.id === id);
}

/**
 * Active (non soft-deleted) devices owned by a user (Legacy safe fallback).
 */
export function activeDevicesForUser(userId) {
  return (store.devices || []).filter((d) => d.user_id === userId && d.deleted === 0);
}

export function ownedActiveDevice(userId, deviceId) {
  return (
    (store.devices || []).find(
      (d) => d.user_id === userId && (d.id === deviceId || d.device_id === deviceId) && d.deleted === 0
    ) || null
  );
}

export function ownedActiveDeviceByRawId(userId, rawDeviceId) {
  return (
    (store.devices || []).find(
      (d) => d.user_id === userId && d.device_id === rawDeviceId && d.deleted === 0
    ) || null
  );
}

/** Serialize a user, always stripping the (mock) password field. */
export function publicUser(user) {
  const photo = user.photo_url || user.avatar_url || null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    photo_url: photo,
    avatar_url: photo,
    avatar: photo,
    is_admin: user.is_admin ? 1 : 0,
  };
}

export default store;