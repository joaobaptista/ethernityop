#!/usr/bin/env node
/**
 * Gera PNGs do favicon SVG usando a API do macOS (qlmanage via AppleScript)
 * ou via canvas nativo do Node — aqui usamos uma abordagem com fetch + FileReader
 * Alternativa: usa sharp se disponível
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../frontend/public');
const faviconSvgPath = join(publicDir, 'favicon.svg');
const maskableSvgPath = join(publicDir, 'maskable-icon.svg');

const faviconSvgContent = readFileSync(faviconSvgPath, 'utf8');
const maskableSvgContent = readFileSync(maskableSvgPath, 'utf8');

// Transparent Desktop / General PWA icons (from favicon.svg)
const standardIcons = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon.png', size: 512 },
  { name: 'pwa-64x64.png', size: 64 },
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'og-image.png', size: 512 },
];

// Android Maskable & iOS Apple Touch icons with solid safe-zone background (from maskable-icon.svg)
const platformIcons = [
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'maskable-icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-180x180.png', size: 180 },
];

// Try using sharp
try {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    const sharpPath = join(__dirname, '../frontend/node_modules/sharp/dist/index.mjs');
    sharp = (await import(pathToFileURL(sharpPath).href)).default;
  }

  const faviconBuffer = Buffer.from(faviconSvgContent);
  const maskableBuffer = Buffer.from(maskableSvgContent);

  // Generate Standard Transparent Icons
  for (const { name, size } of standardIcons) {
    const outPath = join(publicDir, name);
    await sharp(faviconBuffer).resize(size, size).png().toFile(outPath);
    console.log(`✅ [Desktop/Web] ${name} (${size}x${size})`);
  }

  // Generate Android & iOS Maskable/Solid Icons
  for (const { name, size } of platformIcons) {
    const outPath = join(publicDir, name);
    await sharp(maskableBuffer).resize(size, size).png().toFile(outPath);
    console.log(`✅ [Android/iOS] ${name} (${size}x${size})`);
  }

  // Generate favicon.ico (16, 32, 48)
  const icoSizes = [16, 32, 48];
  const images = [];
  for (const s of icoSizes) {
    const pngBuf = await sharp(faviconBuffer).resize(s, s).png().toBuffer();
    images.push({ size: s, buffer: pngBuf });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let currentOffset = 6 + (16 * images.length);
  const dirEntries = [];
  const buffers = [header];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(currentOffset, 12);
    dirEntries.push(entry);
    currentOffset += img.buffer.length;
  }
  buffers.push(...dirEntries);
  for (const img of images) buffers.push(img.buffer);
  writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat(buffers));
  console.log('✅ favicon.ico (16x16, 32x32, 48x48)');

  console.log('\n🎉 Todos os ícones PNG e ICO gerados com sucesso!');
} catch (e) {
  console.error('❌ Erro ao gerar ícones:', e.message);
}

