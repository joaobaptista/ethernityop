/**
 * mysql.js
 * Monolithic MySQL database client and schema initialization for Ethernity DMS.
 * Connects directly to the local MySQL instance (database: ethernity)
 * and manages persistence for users, circle connections, and legacy memories.
 */
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ethernity',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const DEMO_USER_ID = 'u-demo-1';
export const DEMO_EMAIL = 'demo@ethernity.com';

// Conta demo e círculo fictício existem só em desenvolvimento/testes (ou com ENABLE_DEMO_LOGIN=1).
const SEED_DEMO_DATA = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_LOGIN === '1';

export async function initDatabase() {
  try {
    const conn = await pool.getConnection();
    console.log('[MySQL] Conectado com sucesso ao banco monolito "ethernity".');

    // 1. Garantir existência da tabela users e colunas necessárias
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(191) NOT NULL,
        phone VARCHAR(64) NULL,
        password_hash VARCHAR(255) NULL,
        avatar_url VARCHAR(1024) NULL,
        plan_id VARCHAR(64) NOT NULL DEFAULT 'infinity',
        is_admin TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await conn.query('ALTER TABLE users ADD COLUMN phone VARCHAR(64) NULL AFTER email');
    } catch {
      // already exists
    }
    try {
      await conn.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
    } catch {
      // already exists
    }
    try {
      await conn.query('ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER plan_id');
    } catch {
      // already exists
    }

    // 1.1 Garantir tabela circle_connections
    await conn.query(`
      CREATE TABLE IF NOT EXISTS circle_connections (
        id VARCHAR(64) NOT NULL,
        requester_id VARCHAR(64) NOT NULL,
        requester_name VARCHAR(150) NULL,
        requester_email VARCHAR(191) NULL,
        target_name VARCHAR(150) NOT NULL,
        target_email VARCHAR(191) NOT NULL,
        relation VARCHAR(64) NULL,
        role VARCHAR(64) NOT NULL DEFAULT 'family',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        can_trigger_delivery TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_circle_connections_requester (requester_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1.2 Garantir tabelas capsules e capsule_guardians
    await conn.query(`
      CREATE TABLE IF NOT EXISTS capsules (
        id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        recipient JSON NOT NULL,
        delivery_type VARCHAR(32) NOT NULL DEFAULT 'date',
        scheduled_date DATETIME(3) NULL,
        emotion VARCHAR(32) NOT NULL DEFAULT 'love',
        status VARCHAR(16) NOT NULL DEFAULT 'LOCKED',
        video_duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
        video_blob_url VARCHAR(2048) NULL,
        video_size_mb DECIMAL(10,2) NULL,
        is_encrypted TINYINT(1) NOT NULL DEFAULT 1,
        encryption_hash VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_capsules_user_id (user_id),
        KEY idx_capsules_status (status),
        KEY idx_capsules_scheduled_date (scheduled_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Migrações defensivas para instâncias pré-existentes da tabela capsules
    const addCapsuleCol = async (sql) => {
      try {
        await conn.query(sql);
      } catch {
        // Já existe ou erro não-impeditivo
      }
    };
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN user_id VARCHAR(64) NULL AFTER id");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN recipient JSON NULL AFTER title");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN delivery_type VARCHAR(32) NOT NULL DEFAULT 'date' AFTER recipient");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN scheduled_date DATETIME(3) NULL AFTER delivery_type");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN emotion VARCHAR(32) NOT NULL DEFAULT 'love' AFTER scheduled_date");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN video_duration_seconds INT UNSIGNED NOT NULL DEFAULT 0 AFTER status");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN video_blob_url VARCHAR(2048) NULL AFTER video_duration_seconds");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN video_size_mb DECIMAL(10,2) NULL AFTER video_blob_url");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 1 AFTER video_size_mb");
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN encryption_hash VARCHAR(255) NULL AFTER is_encrypted");
    // Campos de apresentação da cápsula (avatar, pessoa, áudios, vídeos...) que antes viviam só no navegador
    await addCapsuleCol("ALTER TABLE capsules ADD COLUMN metadata JSON NULL AFTER encryption_hash");
    try {
      await conn.query("UPDATE capsules SET user_id = author_id WHERE (user_id IS NULL OR user_id = '') AND author_id IS NOT NULL;");
    } catch {
      // Ignora se coluna author_id não existir
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS capsule_guardians (
        id VARCHAR(64) NOT NULL,
        capsule_id VARCHAR(64) NOT NULL,
        guardian_email VARCHAR(191) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_capsule_guardians_capsule (capsule_id, guardian_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Garantir tabela integration_connections (Tokens Google OAuth cifrados)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS integration_connections (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id VARCHAR(64) NOT NULL,
        provider VARCHAR(40) NOT NULL,
        external_account_id VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NULL,
        scopes JSON NULL,
        credentials_encrypted MEDIUMTEXT NULL,
        sync_cursor TEXT NULL,
        status ENUM('ACTIVE', 'REVOKED', 'ERROR') NOT NULL DEFAULT 'ACTIVE',
        last_synced_at DATETIME NULL,
        last_error TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_integration_connection (user_id, provider, external_account_id),
        KEY idx_integration_connections_user_status (user_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Garantir tabela google_photos_picker_sessions (Sessões da Picker API)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS google_photos_picker_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id VARCHAR(64) NOT NULL,
        capsule_id VARCHAR(64) NOT NULL,
        google_session_id VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        picker_uri VARCHAR(2048) NULL,
        status ENUM(
          'PENDING',
          'PICKING',
          'SELECTION_READY',
          'IMPORTING',
          'COMPLETED',
          'EXPIRED',
          'CANCELLED',
          'ERROR'
        ) NOT NULL DEFAULT 'PENDING',
        selected_count INT UNSIGNED NOT NULL DEFAULT 0,
        imported_count INT UNSIGNED NOT NULL DEFAULT 0,
        imported_item_ids JSON NULL,
        metadata JSON NULL,
        expires_at DATETIME NULL,
        last_polled_at DATETIME NULL,
        selection_ready_at DATETIME NULL,
        import_started_at DATETIME NULL,
        import_completed_at DATETIME NULL,
        last_error TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_google_photos_picker_sessions_google_session (google_session_id),
        KEY idx_google_photos_picker_sessions_user_status (user_id, status, created_at),
        KEY idx_google_photos_picker_sessions_capsule_status (capsule_id, status, updated_at),
        KEY idx_google_photos_picker_sessions_expiry (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Garantir tabela memories (Memórias importadas e fotos guardadas)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        capsule_id VARCHAR(64) NOT NULL,
        author_id VARCHAR(64) NOT NULL,
        type ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO') NOT NULL DEFAULT 'IMAGE',
        title VARCHAR(180) NULL,
        content MEDIUMTEXT NULL,
        media_url VARCHAR(2048) NULL,
        storage_key VARCHAR(1024) NULL,
        mime_type VARCHAR(127) NULL,
        file_size_bytes BIGINT UNSIGNED NULL,
        source ENUM('UPLOAD', 'GOOGLE_PHOTOS', 'ICLOUD', 'API') NOT NULL DEFAULT 'UPLOAD',
        provider_metadata JSON NULL,
        occurred_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_memories_capsule_timeline (capsule_id, occurred_at, created_at),
        KEY idx_memories_author_created (author_id, created_at),
        KEY idx_memories_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4.1 Garantir colunas do cofre multimodal criptografado em memories
    const addMemoryCol = async (sql) => {
      try {
        await conn.query(sql);
      } catch {
        // já existe
      }
    };
    await addMemoryCol("ALTER TABLE memories ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 1 AFTER file_size_bytes");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN encryption_mode ENUM('SINGLE_BLOCK_GCM', 'CHUNKED_AEAD') NOT NULL DEFAULT 'SINGLE_BLOCK_GCM' AFTER is_encrypted");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN encryption_iv VARCHAR(64) NULL AFTER encryption_mode");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN encryption_tag VARCHAR(64) NULL AFTER encryption_iv");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN chunk_size_bytes INT UNSIGNED NULL DEFAULT 65536 AFTER encryption_tag");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN variants_json JSON NULL AFTER chunk_size_bytes");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN media_duration_seconds INT UNSIGNED NULL AFTER variants_json");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN waveform_peaks JSON NULL AFTER media_duration_seconds");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN dpi INT UNSIGNED NOT NULL DEFAULT 300 AFTER waveform_peaks");
    await addMemoryCol("ALTER TABLE memories ADD COLUMN color_profile VARCHAR(32) NOT NULL DEFAULT 'sRGB' AFTER dpi");

    // 4.2 Garantir tabela subscriptions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        plan_id VARCHAR(16) NOT NULL DEFAULT 'free',
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        price_formatted VARCHAR(32) NOT NULL DEFAULT 'R$ 0,00',
        billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly',
        payment_method VARCHAR(32) NULL,
        current_period_start DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        current_period_end DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_subscriptions_user (user_id),
        KEY idx_subscriptions_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4.3 Garantir tabela messages (Cartas Ethernity e notificações de entrega)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content MEDIUMTEXT NULL,
        recipient_name VARCHAR(160) NULL,
        recipient_email VARCHAR(255) NULL,
        recipient_phone VARCHAR(64) NULL,
        delivery_type VARCHAR(32) NOT NULL DEFAULT 'date',
        delivery_date DATETIME(3) NULL,
        delivery_time VARCHAR(16) DEFAULT '09:00',
        guardian_protected TINYINT(1) NOT NULL DEFAULT 1,
        email_notification TINYINT(1) NOT NULL DEFAULT 1,
        whatsapp_notification TINYINT(1) NOT NULL DEFAULT 0,
        media_files JSON NULL,
        category VARCHAR(64) DEFAULT 'Cartas de Amor',
        status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
        is_encrypted TINYINT(1) NOT NULL DEFAULT 1,
        device_id VARCHAR(64) NULL,
        message_text TEXT NULL,
        severity VARCHAR(32) DEFAULT 'info',
        source VARCHAR(32) DEFAULT 'web',
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_messages_user_id (user_id),
        KEY idx_messages_status (status),
        KEY idx_messages_device_id (device_id),
        KEY idx_messages_delivery_date (delivery_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4.4 Garantir tabela guardians
    await conn.query(`
      CREATE TABLE IF NOT EXISTS guardians (
        id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(160) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        relation VARCHAR(100) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        can_trigger_delivery TINYINT(1) NOT NULL DEFAULT 1,
        notes TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_guardians_user_id (user_id),
        KEY idx_guardians_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4.5 Garantir tabela device_tokens
    await conn.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        token VARCHAR(2048) NOT NULL,
        platform VARCHAR(16) NOT NULL DEFAULT 'web',
        device_model VARCHAR(120) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_device_tokens_user_token (user_id, token(191)),
        KEY idx_device_tokens_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4.6 Garantir tabela notifications
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        data JSON NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        delivery_status VARCHAR(16) NOT NULL DEFAULT 'pending',
        delivery_attempts INT UNSIGNED NOT NULL DEFAULT 0,
        delivered_at DATETIME(3) NULL,
        delivery_error TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_notifications_user_id (user_id),
        KEY idx_notifications_is_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4.7 Garantir tabela outbox_events
    await conn.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id VARCHAR(64) NOT NULL,
        type VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        payload JSON NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        published_at DATETIME(3) DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_outbox_type_status_created (type, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    if (SEED_DEMO_DATA) {
      // 5. Garantir usuário Demo inicial (Vagner Ibas como Admin Inicial)
      await conn.query(`
        INSERT INTO users (id, name, email, phone, avatar_url, plan_id, is_admin, created_at, updated_at)
        VALUES (
          '${DEMO_USER_ID}',
          'Vagner Ibas',
          'demo@ethernity.com',
          '(11) 98765-4321',
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
          'infinity',
          1,
          NOW(3),
          NOW(3)
        )
        ON DUPLICATE KEY UPDATE is_admin = 1, plan_id = VALUES(plan_id);
      `);

      // 6. Garantir contatos no círculo familiar para associação de cápsulas
      const circleSeed = [
        { id: 'c-1', name: 'Mariana Silva', email: 'mariana@ethernity.com', relation: 'Filha' },
        { id: 'c-2', name: 'Antônio Silva', email: 'antonio@ethernity.com', relation: 'Pai' },
        { id: 'c-3', name: 'Pedro Silva', email: 'pedro@ethernity.com', relation: 'Filho' },
        { id: 'c-4', name: 'João & Roberta', email: 'roberta@ethernity.com', relation: 'Casal' },
        { id: 'c-5', name: 'Camila Zhang', email: 'camila@ethernity.com', relation: 'Amiga de Infância' },
      ];

      for (const member of circleSeed) {
        await conn.query(`
          INSERT INTO circle_connections (
            id, requester_id, requester_name, requester_email,
            target_name, target_email, relation, role, status,
            can_trigger_delivery, created_at, updated_at
          ) VALUES (
            ?, '${DEMO_USER_ID}', 'Vagner Ibas', 'demo@ethernity.com',
            ?, ?, ?, 'family', 'active',
            1, NOW(3), NOW(3)
          )
          ON DUPLICATE KEY UPDATE target_name = VALUES(target_name), relation = VALUES(relation);
        `, [member.id, member.name, member.email, member.relation]);
      }
    } else {
      // Bancos de produção criados antes desta correção: a conta demo perde o admin
      // (a senha dela é pública no repositório).
      await conn.query('UPDATE users SET is_admin = 0 WHERE email = ?', [DEMO_EMAIL]);
    }

    conn.release();
    console.log('[MySQL] Banco monolito inicializado com sucesso.');
  } catch (err) {
    console.error('[MySQL] Erro ao inicializar tabelas no banco monolito:', err);
    throw err;
  }
}

export default pool;
