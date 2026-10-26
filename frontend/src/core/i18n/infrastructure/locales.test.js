import { describe, it, expect } from 'vitest';
import pt from './locales/pt.js';
import en from './locales/en.js';
import es from './locales/es.js';
import localeRepository from './localeRepository.js';

function extractAllKeys(obj, prefix = '') {
  let keys = [];
  for (const k in obj) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys = keys.concat(extractAllKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n Locales Dictionary Parity', () => {
  const ptKeys = extractAllKeys(pt);
  const enKeys = extractAllKeys(en);
  const esKeys = extractAllKeys(es);

  it('contains essential namespaces in all locales', () => {
    expect(pt.common).toBeDefined();
    expect(en.common).toBeDefined();
    expect(es.common).toBeDefined();

    expect(pt.auth).toBeDefined();
    expect(en.auth).toBeDefined();
    expect(es.auth).toBeDefined();

    expect(pt.dashboard).toBeDefined();
    expect(en.dashboard).toBeDefined();
    expect(es.dashboard).toBeDefined();
  });

  it('guarantees 100% parity of keys between PT, EN and ES', () => {
    expect(ptKeys.length).toBeGreaterThan(30);

    const missingInEn = ptKeys.filter((k) => !enKeys.includes(k));
    const missingInEs = ptKeys.filter((k) => !esKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInEs).toEqual([]);
  });

  it('localeRepository retrieves correct dictionaries', () => {
    expect(localeRepository.getTranslations('pt')).toBe(pt);
    expect(localeRepository.getTranslations('en')).toBe(en);
    expect(localeRepository.getTranslations('es')).toBe(es);
    expect(localeRepository.getTranslations('fr')).toBe(pt); // Fallback
  });
});
