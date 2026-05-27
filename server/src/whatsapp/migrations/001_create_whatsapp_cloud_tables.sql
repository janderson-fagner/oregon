-- Migração 001 — Criação das tabelas do módulo WhatsApp Cloud API
-- Executar no banco DEVdboregonsys (idempotente via IF NOT EXISTS)
-- Todas as colunas são NULLABLE para compatibilidade com versões anteriores do schema (padrão do projeto)

-- Tabela de credenciais Meta por empresa
CREATE TABLE IF NOT EXISTS WhatsappCloudConfig (
  id                   INT          NOT NULL AUTO_INCREMENT,
  empresa_id           INT          NULL,
  phone_number_id      VARCHAR(50)  NULL,
  waba_id              VARCHAR(50)  NULL,
  access_token         TEXT         NULL,
  app_secret           VARCHAR(255) NULL,
  verify_token         VARCHAR(255) NULL,
  display_phone_number VARCHAR(30)  NULL,
  graph_api_version    VARCHAR(10)  NULL DEFAULT 'v23.0',
  ativo                TINYINT(1)   NULL DEFAULT 1,
  created_at           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_phone_number_id (phone_number_id),
  KEY idx_empresa_id (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de conversas por empresa/número
CREATE TABLE IF NOT EXISTS Conversations (
  id                   INT          NOT NULL AUTO_INCREMENT,
  empresa_id           INT          NULL,
  phone_number_id      VARCHAR(50)  NULL,
  contact_wa_id        VARCHAR(30)  NULL,
  contact_name         VARCHAR(255) NULL,
  last_inbound_at      DATETIME     NULL,
  last_message_at      DATETIME     NULL,
  last_message_preview VARCHAR(255) NULL,
  unread_count         INT          NULL DEFAULT 0,
  status               VARCHAR(30)  NULL DEFAULT 'open',
  created_at           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresa_contact (empresa_id, contact_wa_id),
  KEY idx_empresa_last_msg (empresa_id, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de mensagens persistidas
CREATE TABLE IF NOT EXISTS Messages (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  empresa_id       INT          NULL,
  conversation_id  INT          NULL,
  wamid            VARCHAR(255) NULL,
  direction        ENUM('inbound','outbound') NULL,
  type             VARCHAR(30)  NULL DEFAULT 'text',
  body             TEXT         NULL,
  media_path       VARCHAR(500) NULL,
  media_url        VARCHAR(500) NULL,
  media_mime       VARCHAR(100) NULL,
  media_filename   VARCHAR(255) NULL,
  status           VARCHAR(30)  NULL DEFAULT 'pending',
  error_code       VARCHAR(30)  NULL,
  error_data       JSON         NULL,
  reply_to_wamid   VARCHAR(255) NULL,
  sender_name      VARCHAR(255) NULL,
  timestamp_ms     BIGINT       NULL,
  created_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wamid (wamid),
  KEY idx_conversation_id (conversation_id),
  KEY idx_empresa_id (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
