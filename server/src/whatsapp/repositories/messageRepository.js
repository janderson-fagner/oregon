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
 * @param {Object} dados - { empresa_id, conversation_id, wamid?, direction, type, body?, media_path?, media_mime?, media_filename?, status, reply_to_wamid?, sender_name?, timestamp_ms?, referral?, referred_product?, contacts? }
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
    // Origem da mensagem (Click-to-WhatsApp Ads / produto do catálogo).
    // Aceita objeto (serializado aqui) ou null. Guardado bruto em coluna JSON.
    referral = null,
    referred_product = null,
    // Cartão de contato compartilhado (vCard) — array bruto da Meta ou null.
    contacts = null,
    // Localização compartilhada (type=location) — objeto bruto da Meta ou null:
    // { latitude, longitude, name?, address? }. Guardado em coluna JSON.
    location = null,
  } = dados;

  const referralJson = referral ? JSON.stringify(referral) : null;
  const referredProductJson = referred_product ? JSON.stringify(referred_product) : null;
  const contactsJson = contacts ? JSON.stringify(contacts) : null;
  const locationJson = location ? JSON.stringify(location) : null;

  const resultado = await dbQuery(
    `INSERT IGNORE INTO Messages
       (empresa_id, conversation_id, wamid, direction, type,
        body, media_path, media_mime, media_filename,
        status, reply_to_wamid, sender_name, timestamp_ms,
        referral, referred_product, contacts, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      referralJson,
      referredProductJson,
      contactsJson,
      locationJson,
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
 * Busca mensagens de uma conversa.
 *
 * Princípio (corrige o bug de "mensagens sumindo"): a tela de chat precisa SEMPRE
 * das mensagens MAIS RECENTES no carregamento inicial. Por isso buscamos em ordem
 * DESC (recentes primeiro) com LIMIT e depois invertemos para ordem cronológica
 * (ASC) na exibição. Antes, a query trazia ASC com OFFSET 0, devolvendo as 50
 * mais ANTIGAS e escondendo as recentes em conversas com mais de `limit` mensagens.
 *
 * Ordenação estável: além da chave temporal, desempata por `id` DESC — o
 * timestamp_ms de mensagens inbound só tem precisão de segundos, então várias
 * mensagens no mesmo segundo ficavam em ordem não-determinística ("desorganizadas").
 *
 * Paginação ("carregar mais antigas") por CURSOR, imune a inserções em tempo real:
 *  - beforeTs + beforeId: chave temporal e id da mensagem mais ANTIGA já carregada;
 *    retorna apenas as estritamente anteriores a ela.
 *  - Sem cursor, aceita page/limit (offset) como fallback retrocompatível.
 *
 * @param {number} conversationId
 * @param {number} empresaId
 * @param {Object} opcoes - { limit=50, beforeTs?, beforeId?, page? }
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function getMessages(conversationId, empresaId, opcoes) {
  const o = opcoes || {};
  const limit = Math.min(100, Math.max(1, parseInt(o.limit) || 50));

  // deleted_at IS NULL: oculta mensagens apagadas (soft-delete, só no sistema)
  const [rowTotal] = await dbQuery(
    'SELECT COUNT(*) AS total FROM Messages WHERE conversation_id = ? AND empresa_id = ? AND deleted_at IS NULL',
    [conversationId, empresaId]
  );

  // Chave de ordenação cronológica (trata timestamp_ms nulo via created_at).
  const KEY = 'COALESCE(timestamp_ms, UNIX_TIMESTAMP(created_at) * 1000)';

  const where = ['conversation_id = ?', 'empresa_id = ?', 'deleted_at IS NULL'];
  const params = [conversationId, empresaId];

  const beforeTs = o.beforeTs != null ? parseInt(o.beforeTs) : null;
  const beforeId = o.beforeId != null ? parseInt(o.beforeId) : null;
  let offset = 0;

  if (beforeTs != null && beforeId != null && !Number.isNaN(beforeTs) && !Number.isNaN(beforeId)) {
    // Cursor: somente mensagens anteriores à mais antiga já carregada.
    where.push(`(${KEY} < ? OR (${KEY} = ? AND id < ?))`);
    params.push(beforeTs, beforeTs, beforeId);
  } else {
    // Fallback por página (offset). page=1 => 50 mais recentes.
    const page = Math.max(1, parseInt(o.page) || 1);
    offset = (page - 1) * limit;
  }

  const rows = await dbQuery(
    `SELECT * FROM Messages
     WHERE ${where.join(' AND ')}
     ORDER BY ${KEY} DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Inverte para ordem cronológica ascendente (mais antigas no topo da bolha).
  rows.reverse();

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

/**
 * Busca mensagem pelo id primário, validando tenant.
 * @param {number} msgId
 * @param {number} empresaId
 * @returns {Promise<Object|null>}
 */
async function getById(msgId, empresaId) {
  const rows = await dbQuery(
    'SELECT * FROM Messages WHERE id = ? AND empresa_id = ? LIMIT 1',
    [msgId, empresaId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Soft-delete de uma mensagem (apenas no sistema; a Cloud API não apaga no WhatsApp).
 * Marca deleted_at; a mensagem some das listagens mas permanece no banco.
 * Isolado por empresa_id.
 * @param {number} msgId
 * @param {number} empresaId
 * @returns {Promise<number>} linhas afetadas
 */
async function softDeleteMessage(msgId, empresaId) {
  const resultado = await dbQuery(
    'UPDATE Messages SET deleted_at = NOW() WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    [msgId, empresaId]
  );
  return resultado.affectedRows || 0;
}

/**
 * Retorna o wamid da última mensagem inbound da conversa (para enviar recibo de
 * leitura "lido" à Cloud API ao marcar a conversa como lida). Ignora apagadas.
 * @param {number} conversationId
 * @param {number} empresaId
 * @returns {Promise<string|null>}
 */
async function getLastInboundWamid(conversationId, empresaId) {
  const rows = await dbQuery(
    `SELECT wamid FROM Messages
     WHERE conversation_id = ? AND empresa_id = ? AND direction = 'inbound'
       AND wamid IS NOT NULL AND deleted_at IS NULL
     ORDER BY COALESCE(timestamp_ms, UNIX_TIMESTAMP(created_at) * 1000) DESC
     LIMIT 1`,
    [conversationId, empresaId]
  );
  return rows.length > 0 ? rows[0].wamid : null;
}

module.exports = {
  insertMessage,
  updateMessageStatusByWamid,
  setReactionByWamid,
  updateMediaPath,
  getMessages,
  getByWamid,
  getById,
  softDeleteMessage,
  getLastInboundWamid,
};
