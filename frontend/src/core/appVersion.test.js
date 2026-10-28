import { describe, it, expect } from 'vitest';
import { APP_VERSION, APP_VERSION_LABEL } from './appVersion.js';
import pkg from '../../package.json';

describe('appVersion', () => {
  it('usa a versão SemVer do package.json com prefixo v', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_VERSION_LABEL).toBe(`v${pkg.version}`);
  });
});
