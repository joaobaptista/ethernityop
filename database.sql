-- =====================================================================
-- ETHERNITY DMS — SCHEMA UNIFICADO DE PRODUÇÃO (BANCO MONÓLITO)
-- =====================================================================
-- Versão: 1.0.0
-- Charset: utf8mb4 / Collation: utf8mb4_unicode_ci
-- Compatibilidade: MySQL 8.0+ / MariaDB 10.5+ / Cloud SQL / AWS RDS Aurora
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `ethernity`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ethernity`;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. TABELA: users (Contas de usuários, SSO e credenciais de acesso)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` VARCHAR(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` VARCHAR(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `plan_id` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free',
  `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `encryption_public_key` TEXT COLLATE utf8mb4_unicode_ci,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_plan` (`plan_id`),
  KEY `idx_users_is_admin` (`is_admin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. TABELA: capsules (Cápsulas do tempo, legados e entregas programadas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `capsules` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient` JSON NOT NULL,
  `delivery_type` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'date',
  `scheduled_date` DATETIME(3) DEFAULT NULL,
  `emotion` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'love',
  `status` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'LOCKED',
  `video_duration_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
  `video_blob_url` VARCHAR(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video_size_mb` DECIMAL(10,2) DEFAULT NULL,
  `is_encrypted` TINYINT(1) NOT NULL DEFAULT 1,
  `encryption_hash` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_capsules_user_id` (`user_id`),
  KEY `idx_capsules_status` (`status`),
  KEY `idx_capsules_scheduled_date` (`scheduled_date`),
  CONSTRAINT `fk_capsules_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. TABELA: capsule_guardians (Associação de guardiões com cápsulas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `capsule_guardians` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capsule_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guardian_email` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_capsule_guardians_capsule` (`capsule_id`, `guardian_email`),
  CONSTRAINT `fk_capsule_guardians_capsule` FOREIGN KEY (`capsule_id`) REFERENCES `capsules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. TABELA: guardians (Guardiões de confiança do usuário e Dead Man's Switch)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `guardians` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` VARCHAR(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relation` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `can_trigger_delivery` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT COLLATE utf8mb4_unicode_ci,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_guardians_user_id` (`user_id`),
  KEY `idx_guardians_email` (`email`),
  CONSTRAINT `fk_guardians_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. TABELA: circle_connections (Círculo de conexões e destinatários familiares)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `circle_connections` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requester_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requester_name` VARCHAR(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requester_email` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_email` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_name` VARCHAR(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relation` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'family',
  `status` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `can_trigger_delivery` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT COLLATE utf8mb4_unicode_ci,
  `invite_code` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_circle_invite_code` (`invite_code`),
  KEY `idx_circle_requester_id` (`requester_id`),
  KEY `idx_circle_target_user_id` (`target_user_id`),
  KEY `idx_circle_target_email` (`target_email`),
  CONSTRAINT `fk_circle_requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. TABELA: memories (Cofre multimodal criptografado — Zero-Knowledge)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `memories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `capsule_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO') NOT NULL DEFAULT 'IMAGE',
  `title` VARCHAR(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` MEDIUMTEXT COLLATE utf8mb4_unicode_ci,
  `media_url` VARCHAR(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_key` VARCHAR(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mime_type` VARCHAR(127) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size_bytes` BIGINT UNSIGNED DEFAULT NULL,
  `is_encrypted` TINYINT(1) NOT NULL DEFAULT 1,
  `encryption_mode` ENUM('SINGLE_BLOCK_GCM', 'CHUNKED_AEAD') NOT NULL DEFAULT 'SINGLE_BLOCK_GCM',
  `encryption_iv` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `encryption_tag` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chunk_size_bytes` INT UNSIGNED DEFAULT 65536,
  `variants_json` JSON DEFAULT NULL,
  `media_duration_seconds` INT UNSIGNED DEFAULT NULL,
  `waveform_peaks` JSON DEFAULT NULL,
  `dpi` INT UNSIGNED NOT NULL DEFAULT 300,
  `color_profile` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sRGB',
  `source` ENUM('UPLOAD', 'GOOGLE_PHOTOS', 'ICLOUD', 'API') NOT NULL DEFAULT 'UPLOAD',
  `provider_metadata` JSON DEFAULT NULL,
  `occurred_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_memories_capsule_timeline` (`capsule_id`, `occurred_at`, `created_at`),
  KEY `idx_memories_author_created` (`author_id`, `created_at`),
  KEY `idx_memories_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. TABELA: messages (Cartas Ethernity, redação e mensagens agendadas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` MEDIUMTEXT COLLATE utf8mb4_unicode_ci,
  `recipient_name` VARCHAR(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recipient_email` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recipient_phone` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_type` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'date',
  `delivery_date` DATETIME(3) DEFAULT NULL,
  `delivery_time` VARCHAR(16) COLLATE utf8mb4_unicode_ci DEFAULT '09:00',
  `guardian_protected` TINYINT(1) NOT NULL DEFAULT 1,
  `email_notification` TINYINT(1) NOT NULL DEFAULT 1,
  `whatsapp_notification` TINYINT(1) NOT NULL DEFAULT 0,
  `media_files` JSON DEFAULT NULL,
  `category` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT 'Cartas de Amor',
  `status` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `is_encrypted` TINYINT(1) NOT NULL DEFAULT 1,
  `device_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_text` TEXT COLLATE utf8mb4_unicode_ci,
  `severity` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT 'info',
  `source` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT 'web',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_messages_user_id` (`user_id`),
  KEY `idx_messages_status` (`status`),
  KEY `idx_messages_device_id` (`device_id`),
  KEY `idx_messages_delivery_date` (`delivery_date`),
  CONSTRAINT `fk_messages_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. TABELA: subscriptions (Planos de assinatura e pagamentos Mercado Pago)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free',
  `status` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `price_formatted` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'R$ 0,00',
  `billing_cycle` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `payment_method` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_period_start` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `current_period_end` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subscriptions_user_id` (`user_id`),
  KEY `idx_subscriptions_status` (`status`),
  CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. TABELA: integration_connections (Credenciais cifradas Google Photos/Drive)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `integration_connections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` VARCHAR(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_account_id` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scopes` JSON DEFAULT NULL,
  `credentials_encrypted` MEDIUMTEXT COLLATE utf8mb4_unicode_ci,
  `sync_cursor` TEXT COLLATE utf8mb4_unicode_ci,
  `status` ENUM('ACTIVE', 'REVOKED', 'ERROR') NOT NULL DEFAULT 'ACTIVE',
  `last_synced_at` DATETIME DEFAULT NULL,
  `last_error` TEXT COLLATE utf8mb4_unicode_ci,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_integration_connection` (`user_id`, `provider`, `external_account_id`),
  KEY `idx_integration_connections_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_integration_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. TABELA: google_photos_picker_sessions (Sessões oficiais Google Photos Picker)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `google_photos_picker_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capsule_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `google_session_id` VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `picker_uri` VARCHAR(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` ENUM(
    'PENDING',
    'PICKING',
    'SELECTION_READY',
    'IMPORTING',
    'COMPLETED',
    'EXPIRED',
    'CANCELLED',
    'ERROR'
  ) NOT NULL DEFAULT 'PENDING',
  `selected_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `imported_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `imported_item_ids` JSON DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `last_polled_at` DATETIME DEFAULT NULL,
  `selection_ready_at` DATETIME DEFAULT NULL,
  `import_started_at` DATETIME DEFAULT NULL,
  `import_completed_at` DATETIME DEFAULT NULL,
  `last_error` TEXT COLLATE utf8mb4_unicode_ci,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_google_photos_picker_sessions_google_session` (`google_session_id`),
  KEY `idx_google_photos_picker_sessions_user_status` (`user_id`, `status`, `created_at`),
  KEY `idx_google_photos_picker_sessions_capsule_status` (`capsule_id`, `status`, `updated_at`),
  KEY `idx_google_photos_picker_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. TABELA: device_tokens (Push tokens APNs iOS, FCM Android e Web Push)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `device_tokens` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` VARCHAR(2048) COLLATE utf8mb4_unicode_ci NOT NULL,
  `platform` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'web',
  `device_model` VARCHAR(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_device_tokens_user_token` (`user_id`, `token`(191)),
  KEY `idx_device_tokens_user_id` (`user_id`),
  CONSTRAINT `fk_device_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. TABELA: notifications (Notificações in-app, lembretes de calendário)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` JSON DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `delivery_status` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `delivery_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `delivered_at` DATETIME(3) DEFAULT NULL,
  `delivery_error` TEXT COLLATE utf8mb4_unicode_ci,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_id` (`user_id`),
  KEY `idx_notifications_is_read` (`is_read`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. TABELA: outbox_events (Fila assíncrona para webhooks e envio resiliente)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `payload` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_at` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_outbox_type_status_created` (`type`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. TABELA: drive_folders (Pastas organizacionais no Google Drive / Vault)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `drive_folders` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT 'em Meu Drive',
  `color` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT '#5F6368',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_drive_folders_user` (`user_id`),
  CONSTRAINT `fk_drive_folders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15. TABELA: drive_files (Arquivos sincronizados na nuvem e no cofre)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `drive_files` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `folder_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` ENUM('doc', 'photo', 'video', 'audio') NOT NULL,
  `type_label` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `icon_color` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `preview_type` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `preview_url` VARCHAR(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` LONGTEXT COLLATE utf8mb4_unicode_ci,
  `description` TEXT COLLATE utf8mb4_unicode_ci,
  `size` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` ENUM('personal_loose', 'in_capsule', 'in_vault') NOT NULL DEFAULT 'personal_loose',
  `capsule_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capsule_recipient` VARCHAR(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `moved_to_capsule_at` DATETIME(3) DEFAULT NULL,
  `moved_to_vault_at` DATETIME(3) DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_drive_files_user_status` (`user_id`, `status`),
  KEY `idx_drive_files_folder` (`folder_id`),
  KEY `idx_drive_files_capsule_recip` (`capsule_recipient`),
  KEY `fk_drive_files_capsule` (`capsule_id`),
  CONSTRAINT `fk_drive_files_capsule` FOREIGN KEY (`capsule_id`) REFERENCES `capsules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_drive_files_folder` FOREIGN KEY (`folder_id`) REFERENCES `drive_folders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_drive_files_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. TABELA: migrations (Controle de versões de migração estrutural)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `timestamp` BIGINT NOT NULL,
  `name` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SEED DE PRODUÇÃO ESSENCIAL (ZERO DADOS MOCKADOS — REGRA 3 AGENTS.MD)
-- =====================================================================

-- A conta demo NÃO é criada aqui: este script inicializa o banco de produção.
-- Em desenvolvimento ela é semeada por backend/src/db/mysql.js.

-- Registro de Migração Inicial
INSERT INTO `migrations` (`timestamp`, `name`)
SELECT UNIX_TIMESTAMP(), 'init_unified_production_schema_v1'
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `name` = 'init_unified_production_schema_v1');
