import { describe, it, expect } from 'vitest';
import {
  formatWhatsAppNumber,
  getUserInitials,
  getAbsolutePhotoUrl,
  isUserAdmin,
} from './profileModel.js';

describe('profileModel domain logic', () => {
  describe('formatWhatsAppNumber', () => {
    it('formats 11 digit Brazilian mobile/WhatsApp numbers correctly', () => {
      expect(formatWhatsAppNumber('11987654321')).toBe('(11) 98765-4321');
      expect(formatWhatsAppNumber('(11) 98765-4321')).toBe('(11) 98765-4321');
    });

    it('formats 10 digit Brazilian landline numbers correctly', () => {
      expect(formatWhatsAppNumber('1133334444')).toBe('(11) 3333-4444');
    });

    it('formats progressive typing correctly', () => {
      expect(formatWhatsAppNumber('11')).toBe('(11');
      expect(formatWhatsAppNumber('119')).toBe('(11) 9');
      expect(formatWhatsAppNumber('1198765')).toBe('(11) 98765');
      expect(formatWhatsAppNumber('11987654')).toBe('(11) 98765-4');
    });

    it('formats international numbers with +55 and other country codes correctly', () => {
      expect(formatWhatsAppNumber('+5511987654321')).toBe('+55 (11) 98765-4321');
      expect(formatWhatsAppNumber('+15550100')).toBe('+1 555 0100');
    });

    it('handles empty or null inputs gracefully', () => {
      expect(formatWhatsAppNumber('')).toBe('');
      expect(formatWhatsAppNumber(null)).toBe('');
    });
  });

  describe('getUserInitials', () => {
    it('returns two initials for full names', () => {
      expect(getUserInitials('Vagner Ribas')).toBe('VR');
      expect(getUserInitials('Maria Silva Souza')).toBe('MS');
    });

    it('returns first two letters for single names', () => {
      expect(getUserInitials('Carlos')).toBe('CA');
    });

    it('returns default initial for empty or invalid names', () => {
      expect(getUserInitials('')).toBe('U');
      expect(getUserInitials(null)).toBe('U');
    });
  });

  describe('getAbsolutePhotoUrl', () => {
    it('returns null if no photo url is provided', () => {
      expect(getAbsolutePhotoUrl(null)).toBeNull();
      expect(getAbsolutePhotoUrl('')).toBeNull();
    });

    it('returns untouched url if it is already http or data-uri or blob-uri', () => {
      expect(getAbsolutePhotoUrl('https://example.com/avatar.jpg')).toBe(
        'https://example.com/avatar.jpg'
      );
      expect(getAbsolutePhotoUrl('data:image/png;base64,...')).toBe(
        'data:image/png;base64,...'
      );
      expect(getAbsolutePhotoUrl('blob:http://localhost:5173/123-abc')).toBe(
        'blob:http://localhost:5173/123-abc'
      );
    });

    it('prepends base url for relative backend upload paths', () => {
      expect(getAbsolutePhotoUrl('/uploads/users/avatar.jpg')).toBe(
        'http://localhost:8000/uploads/users/avatar.jpg'
      );
    });
  });

  describe('isUserAdmin', () => {
    it('returns true for is_admin flag set to 1 or true', () => {
      expect(isUserAdmin({ is_admin: 1 })).toBe(true);
      expect(isUserAdmin({ is_admin: true })).toBe(true);
    });

    it('returns true for root admin users by email', () => {
      expect(isUserAdmin({ email: 'vameri@gmail.com', is_admin: 0 })).toBe(true);
      expect(isUserAdmin({ email: 'demo@ethernity.com', is_admin: 0 })).toBe(true);
    });

    it('does not grant admin based on display name', () => {
      expect(isUserAdmin({ name: 'Vagner Ri', email: 'impostor@example.com', is_admin: 0 })).toBe(false);
    });

    it('returns false for non-admin regular users', () => {
      expect(isUserAdmin({ name: 'João Silva', email: 'joao@example.com', is_admin: 0 })).toBe(false);
      expect(isUserAdmin(null)).toBe(false);
      expect(isUserAdmin(undefined)).toBe(false);
    });
  });
});
