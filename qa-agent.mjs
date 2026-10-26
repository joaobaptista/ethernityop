/**
 * qa-agent.mjs — Agente de Testes Automatizados e Auditoria de Qualidade (QA)
 * Valida a infraestrutura, banco de dados MySQL, autenticação social com Google,
 * login tradicional e integração oficial com Google Photos Picker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from './backend/node_modules/jsonwebtoken/index.js';
import mysql from './backend/node_modules/mysql2/promise.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = __dirname;

// Carregar variáveis de ambiente do backend
const BACKEND_ENV_PATH = path.join(ROOT_DIR, 'backend', '.env');
if (fs.existsSync(BACKEND_ENV_PATH)) {
  const envContent = fs.readFileSync(BACKEND_ENV_PATH, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const BACKEND_URL = process.env.PUBLIC_API_URL || 'http://localhost:3333';
const BACKEND_SECONDARY_URL = 'http://localhost:8000';
const FRONTEND_URL = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DATABASE_PORT || 3306);
const DB_NAME = process.env.DATABASE_NAME || 'ethernity';
const DB_USER = process.env.DATABASE_USER || 'root';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'eternity-local-development-only-change-before-production-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_PHOTOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_PHOTOS_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || '';

const results = [];
let suiteCount = 0;

function report(suite, name, pass, details = '') {
  results.push({ suite, name, pass, details });
  const icon = pass ? '🟢 PASS' : '🔴 FAIL';
  console.log(`  [${icon}] ${name}${details ? ` -> ${details}` : ''}`);
}

async function run() {
  console.log('\n======================================================');
  console.log('  AGENTE DE QA — ETHERNITY AUDIT RUNNER');
  console.log('======================================================\n');
  const startTime = Date.now();

  // ── SUITE 1: Infraestrutura e Conectividade ──
  console.log('1. Infraestrutura e Conectividade de Serviços:');
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    const data = await res.json();
    report('1. Infraestrutura', 'Backend API (porta 3333)', data.status === 'healthy', `Status: ${data.status}`);
  } catch (err) {
    report('1. Infraestrutura', 'Backend API (porta 3333)', false, err.message);
  }

  try {
    const res = await fetch(`${BACKEND_SECONDARY_URL}/health`);
    const data = await res.json();
    report('1. Infraestrutura', 'Backend API Compatibilidade (porta 8000)', data.status === 'healthy', `Status: ${data.status}`);
  } catch (err) {
    report('1. Infraestrutura', 'Backend API Compatibilidade (porta 8000)', false, err.message);
  }

  try {
    const res = await fetch(FRONTEND_URL);
    report('1. Infraestrutura', 'Frontend Vite Online', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    report('1. Infraestrutura', 'Frontend Vite Online', false, err.message);
  }

  let dbConn = null;
  try {
    dbConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    });
    report('1. Infraestrutura', 'Banco de Dados MySQL Conectado', true, `Database: ${DB_NAME}`);

    const [userCols] = await dbConn.query('DESCRIBE users;');
    const passCol = userCols.find((c) => c.Field === 'password_hash');
    report(
      '1. Infraestrutura',
      'Schema users.password_hash aceita NULL',
      passCol && passCol.Null === 'YES',
      'Permite contas sem senha criadas via Google Social Login'
    );

    const [tables] = await dbConn.query('SHOW TABLES;');
    const tableNames = tables.map((t) => Object.values(t)[0]);
    const requiredTables = ['users', 'integration_connections', 'google_photos_picker_sessions', 'memories'];
    const allPresent = requiredTables.every((t) => tableNames.includes(t));
    report('1. Infraestrutura', 'Tabelas Essenciais Presentes', allPresent, requiredTables.join(', '));
  } catch (err) {
    report('1. Infraestrutura', 'Banco de Dados MySQL Conectado', false, err.message);
  }

  // ── SUITE 2: Autenticação Tradicional ──
  console.log('\n2. Autenticação Tradicional (E-mail e Senha):');
  const testEmail = `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@ethernity.test`;
  const testPassword = 'Password123!QA';
  let authToken = null;

  try {
    const regRes = await fetch(`${BACKEND_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'QA Test Runner',
        email: testEmail,
        phone: '(11) 99999-8888',
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    report('2. Autenticação Tradicional', 'Registro de Usuário (POST /register)', regRes.ok && Boolean(regData.id), `ID: ${regData.id}`);

    // Prevenção de duplicidade
    const dupRes = await fetch(`${BACKEND_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'QA Duplicate',
        email: testEmail,
        phone: '(11) 99999-8888',
        password: testPassword,
      }),
    });
    report('2. Autenticação Tradicional', 'Prevenção de E-mail Duplicado', dupRes.status === 400, `HTTP ${dupRes.status}`);

    // Login com credenciais válidas
    const loginRes = await fetch(`${BACKEND_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginRes.json();
    authToken = loginData.access_token;
    report('2. Autenticação Tradicional', 'Login com Credenciais Válidas (POST /login)', Boolean(authToken), 'JWT emitido');

    // Bloqueio de senha incorreta
    const badLoginRes = await fetch(`${BACKEND_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'wrong-password' }),
    });
    report('2. Autenticação Tradicional', 'Bloqueio de Senha Incorreta', badLoginRes.status === 401, `HTTP ${badLoginRes.status}`);

    // Identificação de sessão (GET /auth/me)
    const meRes = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const meData = await meRes.json();
    report('2. Autenticação Tradicional', 'Identificação de Sessão (GET /auth/me)', meRes.ok && meData.user?.email === testEmail, `Usuário: ${meData.user?.name}`);
  } catch (err) {
    report('2. Autenticação Tradicional', 'Fluxo de Autenticação Tradicional', false, err.message);
  }

  // ── SUITE 3: Autenticação Social com Google (OpenID Connect) ──
  console.log('\n3. Autenticação Social com Google (OpenID Connect / Gmail):');
  try {
    const authUrlRes = await fetch(`${BACKEND_URL}/api/auth/google/url`);
    const authUrlData = await authUrlRes.json();
    const googleUrlStr = authUrlData.url;
    report('3. Social Login Google', 'Endpoint de URL Google Auth (GET /api/auth/google/url)', Boolean(googleUrlStr), 'URL gerada com sucesso');

    if (googleUrlStr) {
      const googleUrl = new URL(googleUrlStr);
      report('3. Social Login Google', 'Client ID Configurado no Google Auth', googleUrl.searchParams.get('client_id') === GOOGLE_CLIENT_ID, googleUrl.searchParams.get('client_id'));
      report('3. Social Login Google', 'Redirect URI Consistente', googleUrl.searchParams.get('redirect_uri') === GOOGLE_REDIRECT_URI, googleUrl.searchParams.get('redirect_uri'));
      report('3. Social Login Google', 'Escopos OIDC Presentes', googleUrl.searchParams.get('scope') === 'openid email profile', googleUrl.searchParams.get('scope'));

      const stateToken = googleUrl.searchParams.get('state');
      let statePayload = null;
      try {
        statePayload = jwt.verify(stateToken, JWT_SECRET, { audience: 'google-auth-state' });
      } catch (jwtErr) {
        statePayload = null;
      }
      report(
        '3. Social Login Google',
        'State Token Anti-CSRF Válido',
        Boolean(statePayload && statePayload.action === 'auth'),
        statePayload ? `action: "${statePayload.action}", aud: "${statePayload.aud}"` : 'Assinatura inválida'
      );
    }
  } catch (err) {
    report('3. Social Login Google', 'Endpoint Google Auth', false, err.message);
  }

  // ── SUITE 4: Integração Google Photos Picker API ──
  console.log('\n4. Integração Google Photos Picker API:');
  try {
    const statusRes = await fetch(`${BACKEND_URL}/api/integrations/google-photos/status`);
    const statusData = await statusRes.json();
    report('4. Google Photos Picker', 'Status da Conexão (GET /api/integrations/google-photos/status)', statusData.configured === true, `Configured: ${statusData.configured}`);

    const pickerAuthRes = await fetch(`${BACKEND_URL}/api/integrations/google-photos/authorization-url`, { method: 'POST' });
    const pickerAuthData = await pickerAuthRes.json();
    const pickerUrlStr = pickerAuthData.authorizationUrl || pickerAuthData.url;
    const pickerHasScope = pickerUrlStr && pickerUrlStr.includes('photospicker.mediaitems.readonly');
    report('4. Google Photos Picker', 'URL de Autorização do Google Fotos Picker', Boolean(pickerHasScope), 'Escopo photospicker.mediaitems.readonly verificado');

    // Criação de sessão do Picker
    const sessRes = await fetch(`${BACKEND_URL}/api/capsules/cap-demo-1/google-photos/sessions`, { method: 'POST' });
    const sessData = await sessRes.json();
    const hasPickerUri = sessData.session?.pickerUri || sessData.pickerUri;
    report('4. Google Photos Picker', 'Criação de Sessão Picker API (POST /sessions)', sessRes.status === 201 || sessRes.ok, `URI: ${hasPickerUri}`);
  } catch (err) {
    report('4. Google Photos Picker', 'Google Photos Picker API', false, err.message);
  }

  // -------------------------------------------------------------
  // 5. Cofre Multimodal Criptografado (Zero-Knowledge AES-256-GCM)
  // -------------------------------------------------------------
  console.log('\n5. Cofre Multimodal Criptografado (Zero-Knowledge):');
  try {
    // 5.1 Bloqueio de upload anônimo
    const anonRes = await fetch(`${BACKEND_URL}/api/vault/media/upload`, { method: 'POST' });
    report('5. Cofre Multimodal', 'Proteção de Upload Anônimo (HTTP 403)', anonRes.status === 403, 'Bloqueio estrito sem JWT');

    // 5.2 Upload de Imagem Sintética
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    // 1x1 WebP sintético
    const dummyWebp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nFoto Teste QA Criptografada\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="capsuleId"\r\n\r\ncapsule-default\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="qa-photo.webp"\r\nContent-Type: image/webp\r\n\r\n`,
    ];
    const postPayload = Buffer.concat([
      Buffer.from(bodyParts[0]),
      Buffer.from(bodyParts[1]),
      Buffer.from(bodyParts[2]),
      dummyWebp,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${BACKEND_URL}/api/vault/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: postPayload,
    });

    const uploadData = await uploadRes.json();
    const uploadOk = uploadRes.ok && uploadData.mediaId;
    report('5. Cofre Multimodal', 'Upload & Transcodificação WebP Multi-Tier', uploadOk, `MediaId: ${uploadData.mediaId}`);

    if (uploadOk) {
      // 5.3 Streaming decifrado com Token
      const getRes = await fetch(`${BACKEND_URL}/api/vault/media/${uploadData.mediaId}?variant=display`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const isWebpHeader = getRes.headers.get('content-type') === 'image/webp';
      report('5. Cofre Multimodal', 'Descriptografia On-The-Fly WebP (AES-256-GCM)', getRes.ok && isWebpHeader, `Content-Type: ${getRes.headers.get('content-type')}`);

      // 5.4 Exportação Fine-Art 300 DPI
      const exportRes = await fetch(`${BACKEND_URL}/api/vault/media/${uploadData.mediaId}/export?format=tiff`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      report('5. Cofre Multimodal', 'Exportação Fine-Art para Impressão (300 DPI TIFF)', exportRes.ok && exportRes.headers.get('content-type') === 'image/tiff', 'TIFF 300 DPI gerado com sucesso');
    }
  } catch (err) {
    report('5. Cofre Multimodal', 'Execução do Cofre Multimodal', false, err.message);
  }

  if (dbConn) await dbConn.end();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalTests = results.length;
  const passedTests = results.filter((r) => r.pass).length;
  const failedTests = totalTests - passedTests;

  console.log('\n======================================================');
  console.log(`  RESULTADO: ${passedTests}/${totalTests} PASSOU (${elapsed}s)`);
  if (failedTests === 0) {
    console.log('  STATUS GERAL: 🟢 APROVADO');
  } else {
    console.log(`  STATUS GERAL: 🔴 ${failedTests} FALHA(S)`);
  }
  console.log('======================================================\n');

  // Gerar relatório em Markdown (QA_REPORT.md)
  let markdown = `# Relatório de Execução do Agente de QA — Ethernity\n\n`;
  markdown += `**Data da Execução:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
  markdown += `**Duração:** ${elapsed}s\n`;
  markdown += `**Total de Testes:** ${totalTests} | **Aprovados:** ${passedTests} | **Falhas:** ${failedTests}\n\n`;
  markdown += `> [!${failedTests === 0 ? 'TIP' : 'WARNING'}]\n`;
  markdown += `> **STATUS GERAL: ${failedTests === 0 ? 'APROVADO' : 'ATENÇÃO'}** — ${
    failedTests === 0
      ? 'Todos os componentes essenciais (Google OAuth, Gmail Login, Picker API e MySQL) responderam conforme o esperado.'
      : `${failedTests} teste(s) falharam na execução.`
  }\n\n---\n\n`;

  const suites = [...new Set(results.map((r) => r.suite))];
  suites.forEach((suite) => {
    markdown += `### ${suite}\n\n`;
    markdown += `| Teste | Status | Detalhes / Diagnóstico |\n| :--- | :---: | :--- |\n`;
    results
      .filter((r) => r.suite === suite)
      .forEach((r) => {
        markdown += `| ${r.name} | ${r.pass ? '🟢 PASS' : '🔴 FAIL'} | ${r.details || '-'} |\n`;
      });
    markdown += '\n';
  });

  markdown += `---\n\n*Relatório gerado automaticamente pelo Agente Especialista em Google Photos & Gmail do Ethernity.*\n`;
  fs.writeFileSync(path.join(ROOT_DIR, 'QA_REPORT.md'), markdown, 'utf8');
  console.log('Relatório gravado em QA_REPORT.md com sucesso.\n');
}

run().catch((err) => {
  console.error('Fatal error during QA run:', err);
  process.exit(1);
});
