/**
 * appVersion.js — Versão do Ethernity exibida ao usuário.
 *
 * Segue o Versionamento Semântico (SemVer, MAJOR.MINOR.PATCH), exibido com prefixo "v":
 * MAJOR para mudanças incompatíveis, MINOR para recursos novos, PATCH para correções.
 * A fonte é o campo "version" do frontend/package.json, injetado no build pelo Vite.
 */
/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
