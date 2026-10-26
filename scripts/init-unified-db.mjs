#!/usr/bin/env node
/**
 * scripts/init-unified-db.mjs
 * Script de inicialização da base de dados unificada na raiz do projeto (database.sql).
 * Suporta execução em desenvolvimento, CI e produção.
 */
import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Importar mysql2 a partir do backend (ou global)
let mysql;
try {
  const mysqlModule = await import('../backend/node_modules/mysql2/promise.js');
  mysql = mysqlModule.default || mysqlModule;
} catch {
  const mysqlModule = await import('mysql2/promise');
  mysql = mysqlModule.default || mysqlModule;
}

// Carregar variáveis de ambiente manualmente sem dependências externas
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

loadEnvFile(path.join(ROOT_DIR, 'backend', '.env'));
loadEnvFile(path.join(ROOT_DIR, '.env'));

const DB_CONFIG = {
  host: process.env.DB_HOST || process.env.DATABASE_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.DATABASE_PORT || 3306),
  user: process.env.DB_USER || process.env.DATABASE_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || '',
  database: process.env.DB_NAME || process.env.DATABASE_NAME || 'ethernity',
};

async function executeSqlFile(connection, sqlFilePath) {
  const content = await fsAsync.readFile(sqlFilePath, 'utf8');

  // Quebrar comandos por ponto e vírgula ignorando comentários e delimitadores internos
  const cleanSql = content
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`[DB Init] Executando ${statements.length} instruções SQL de ${path.basename(sqlFilePath)}...`);

  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (err) {
      // Ignorar erros comuns não-bloqueantes de "já existe"
      if (!err.message.includes('already exists') && !err.message.includes('Duplicate')) {
        console.warn(`[DB Init] Aviso ao executar instrução: ${err.message.slice(0, 120)}...`);
      }
    }
  }
}

async function main() {
  console.log('=====================================================================');
  console.log('🔷 ETHERNITY DMS — PROVISIONAMENTO DO BANCO UNIFICADO DE PRODUÇÃO');
  console.log('=====================================================================');
  console.log(`Target: ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);

  let serverConn;
  try {
    // 1. Conectar ao servidor MySQL para garantir que o banco de dados exista
    serverConn = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
    });

    await serverConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    console.log(`[DB Init] ✅ Banco de dados "${DB_CONFIG.database}" assegurado no servidor.`);
    await serverConn.end();
  } catch (err) {
    console.error(`[DB Init] ❌ Falha de conexão com MySQL em ${DB_CONFIG.host}:${DB_CONFIG.port}:`, err.message);
    console.log('[DB Init] Verifique se o MySQL ou container Docker está em execução.');
    process.exit(1);
  }

  // 2. Conectar diretamente ao banco ethernity
  const dbConn = await mysql.createConnection({
    ...DB_CONFIG,
    multipleStatements: true,
  });

  try {
    const databaseSqlPath = path.join(ROOT_DIR, 'database.sql');
    await executeSqlFile(dbConn, databaseSqlPath);

    // 3. Obter auditoria das tabelas criadas
    const [tables] = await dbConn.query('SHOW TABLES;');
    const tableList = tables.map((t) => Object.values(t)[0]);

    console.log('\n---------------------------------------------------------------------');
    console.log(`📊 TABELAS HOMOLOGADAS NO BANCO UNIFICADO (${tableList.length} tabelas):`);
    console.log('---------------------------------------------------------------------');

    for (const tableName of tableList) {
      const [countResult] = await dbConn.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
      const total = countResult[0]?.total ?? 0;
      console.log(`  ✓ ${tableName.padEnd(32)} [${String(total).padStart(4)} registros]`);
    }

    console.log('---------------------------------------------------------------------');
    console.log('🎉 BANCO UNIFICADO NA RAIZ PROVISIONADO E 100% OPERACIONAL!');
    console.log('=====================================================================\n');
  } catch (err) {
    console.error('[DB Init] Erro durante o provisionamento:', err);
    process.exit(1);
  } finally {
    await dbConn.end();
  }
}

main();
