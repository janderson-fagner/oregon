'use strict';

/**
 * Repositório de acesso ao banco para a tabela Messages.
 * Todas as queries isoladas por empresa_id (multi-tenant).
 */

const dbQuery = require('../../utils/dbHelper');

/**
 * Insere nova mensagem.
 * Idempotente: se wamid já existir (UNIQUE KEY), ignora a inserção e retorna null.
 * Se wamid for null (mensagem outbound ainda sem confirmação), sempre insere.
 * @param {Object} dados - { empresa_id, conversation_id, wamid?, direction, type, body?, media_path?, media_mime?, media_filename?, status, reply_to_wamid?, sender_name?, timestamp_ms? }
 * @returns {Promise<number|null>} id inserido ou null se wamid duplicado
 */
async function insertMessage(dados) {
  const {
    empresa_id,
    conversation_id,
    wamid = null,
    direction,
    type,
    body = null,
    media_path = null,
    media_mime = null,
    media_filename = null,
    status = 'pending',
    reply_to_wamid = null,
    sender_name = null,
    timestamp_ms = null,
  } = dados;

  const resultado = await dbQuery(
    `INSERT IGNORE INTO Messages
       (empresa_id, conversation_id, wamid, direction, type,
        body, media_path, media_mime, media_filename,
        status, reply_to_wamid, sender_name, timestamp_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      empresa_id,
      conversation_id,
      wamid,
      direction,
      type,
      body,
      media_path,
      media_mime,
      media_filename,
      status,
      reply_to_wamid,
      sender_name,
      timestamp_ms,
    ]
  );

  // INSERT IGNORE: affectedRows = 0 significa que o wamid já existia
  if (resultado.affectedRows === 0) {
    return null;
  }

  return resultado.insertId;
}

/**
 * Atualiza status de uma mensagem pelo wamid (status update do webhook).
 * Inclui empresa_id no WHERE para isolamento de tenant.
 * @param {string} wamid
 * @param {string} status - 'sent'|'delivered'|'read'|'failed'
 * @param {Object|null} errorData - dados de erro se status=failed
 * @param {number} empresaId - para segurança (isolar tenant)
 * @returns {Promise<void>}
 */
async function updateMessageStatusByWamid(wamid, status, errorData, empresaId) {
  const erroJson = errorData ? JSON.stringify(errorData) : null;

  await dbQuery(
    `UPDATE Messages
     SET status = ?, error_data = ?
     WHERE wamid = ? AND empresa_id = ?`,
    [status, erroJson, wamid, empresaId]
  );
}

/**
 * Aplica (ou remove) a reação de uma mensagem, identificada pelo wamid alvo.
 * O WhatsApp envia emoji vazio ('') quando o usuário REMOVE a reação — nesse
 * caso gravamos NULL. Inclui empresa_id no WHERE para isolamento de tenant.
 * @param {string} targetWamid - wamid da mensagem que recebeu a reação
 * @param {string|null} emoji - emoji da reação, ou null/'' para remover
 * @param {number} empresaId
 * @returns {Promise<number>} linhas afetadas (0 = mensagem alvo não encontrada)
 */
async function setReactionByWamid(targetWamid, emoji, empresaId) {
  const valor = emoji && emoji.trim() ? emoji : null;
  const resultado = await dbQuery(
    `UPDATE Messages
     SET reaction = ?
     WHERE wamid = ? AND empresa_id = ?`,
    [valor, targetWamid, empresaId]
  );
  return resultado.affectedRows || 0;
}

/**
 * Busca mensagens de uma conversa com paginação.
 * Ordenadas cronologicamente (mais antigas primeiro) via COALESCE para tratar timestamp_ms nulo.
 * @param {number} conversationId
 * @param {number} empresaId
 * @param {Object} opcoes - { page=1, limit=50 }
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function getMessages(conversationId, empresaId, opcoes) {
  const page = Math.max(1, parseInt((opcoes || {}).page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt((opcoes || {}).limit) || 50));
  const offset = (page - 1) * limit;

  const [rowTotal] = await dbQuery(
    'SELECT COUNT(*) AS total FROM Messages WHERE conversation_id = ? AND empresa_id = ?',
    [conversationId, empresaId]
  );

  const rows = await dbQuery(
    `SELECT * FROM Messages
     WHERE conversation_id = ? AND empresa_id = ?
     ORDER BY COALESCE(timestamp_ms, UNIX_TIMESTAMP(created_at) * 1000) ASC
     LIMIT ? OFFSET ?`,
    [conversationId, empresaId, limit, offset]
  );

  return {
    rows,
    total: rowTotal ? rowTotal.total : 0,
  };
}

/**
 * Atualiza o caminho e MIME de mídia de uma mensagem após download em background.
 * media_url é derivado do path para ser servível pelo endpoint /uploads.
 * @param {number} msgId - id primário da mensagem
 * @param {string} mediaPath - path relativo (ex: midias/1/uuid.jpg)
 * @param {string} mediaMime - MIME type do arquivo
 * @returns {Promise<void>}
 */
async function updateMediaPath(msgId, mediaPath, mediaMime) {
  const mediaUrl = `/uploads/${mediaPath}`;
  await dbQuery(
    `UPDATE Messages
     SET media_path = ?,
         media_url  = ?,
         media_mime = COALESCE(?, media_mime)
     WHERE id = ?`,
    [mediaPath, mediaUrl, mediaMime || null, msgId]
  );
}

/**
 * Busca mensagem pelo wamid, validando tenant.
 * @param {string} wamid
 * @param {number} empresaId
 * @returns {Promise<Object|null>}
 */
async function getByWamid(wamid, empresaId) {
  const rows = await dbQuery(
    'SELECT * FROM Messages WHERE wamid = ? AND empresa_id = ? LIMIT 1',
    [wamid, empresaId]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  insertMessage,
  updateMessageStatusByWamid,
  setReactionByWamid,
  updateMediaPath,
  getMessages,
  getByWamid,
};
