'use strict';

/**
 * Repositório de acesso ao banco para a tabela Conversations.
 * Todas as queries isoladas por empresa_id (multi-tenant).
 */

const dbQuery = require('../../utils/dbHelper');

/**
 * Insere ou atualiza conversa (upsert por empresa_id + contact_wa_id).
 * Atualiza last_message_at, last_message_preview, unread_count e,
 * quando for mensagem inbound, last_inbound_at.
 * Usa LAST_INSERT_ID(id) no ON DUPLICATE KEY para retornar o id correto tanto em insert quanto update.
 * @param {Object} dados - { empresa_id, phone_number_id, contact_wa_id, contact_name, last_inbound_at?, last_message_at, last_message_preview, unread_count?, referral? }
 * @returns {Promise<number>} id da conversa
 */
async function upsertConversation(dados) {
  const {
    empresa_id,
    phone_number_id,
    contact_wa_id,
    contact_name = null,
    last_inbound_at = null,
    last_message_at,
    last_message_preview = null,
    unread_count = 0,
    // Origem (Click-to-WhatsApp Ads): quando a mensagem inbound vem de um anúncio,
    // promovemos o referral ao nível da conversa para exibir "veio do anúncio X".
    // Atualiza para o referral mais recente; mantém o anterior quando vier null.
    referral = null,
  } = dados;

  const referralJson = referral ? JSON.stringify(referral) : null;

  // unread_count: incrementa no inbound, mantém no outbound
  // A expressão usa VALUES() para referenciar o valor proposto do INSERT
  const resultado = await dbQuery(
    `INSERT INTO Conversations
       (empresa_id, phone_number_id, contact_wa_id, contact_name,
        last_message_at, last_message_preview, last_inbound_at, unread_count,
        referral, referral_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id                   = LAST_INSERT_ID(id),
       phone_number_id      = VALUES(phone_number_id),
       last_message_at      = VALUES(last_message_at),
       last_message_preview = VALUES(last_message_preview),
       contact_name         = COALESCE(VALUES(contact_name), contact_name),
       last_inbound_at      = COALESCE(?, last_inbound_at),
       unread_count         = unread_count + ?,
       referral             = COALESCE(VALUES(referral), referral),
       referral_at          = CASE WHEN VALUES(referral) IS NOT NULL
                                   THEN VALUES(referral_at) ELSE referral_at END`,
    [
      empresa_id,
      phone_number_id,
      contact_wa_id,
      contact_name,
      last_message_at || new Date(),
      last_message_preview,
      last_inbound_at,
      unread_count,
      referralJson,
      referralJson ? (last_inbound_at || new Date()) : null,
      // Parâmetros extras para o ON DUPLICATE KEY UPDATE
      last_inbound_at,
      unread_count,
    ]
  );

  return resultado.insertId;
}

/**
 * Lista conversas da empresa com paginação e busca opcional por nome/telefone.
 * Ordenadas por last_message_at DESC.
 * @param {number} empresaId
 * @param {Object} opcoes - { page=1, limit=30, busca='' }
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function listConversations(empresaId, opcoes) {
  const page = Math.max(1, parseInt(opcoes.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opcoes.limit) || 30));
  const offset = (page - 1) * limit;
  const busca = opcoes.busca ? `%${opcoes.busca}%` : null;

  // deleted_at IS NULL: oculta conversas apagadas (soft-delete, só no sistema)
  let whereExtra = ' AND deleted_at IS NULL';
  const params = [empresaId];
  const paramsCount = [empresaId];

  if (busca) {
    whereExtra += ' AND (contact_name LIKE ? OR contact_name_custom LIKE ? OR contact_wa_id LIKE ?)';
    params.push(busca, busca, busca);
    paramsCount.push(busca, busca, busca);
  }

  const [rowsTotal] = await dbQuery(
    `SELECT COUNT(*) AS total FROM Conversations WHERE empresa_id = ?${whereExtra}`,
    paramsCount
  );

  params.push(limit, offset);

  // pinned DESC primeiro: conversas fixadas sempre no topo; depois recentes.
  const rows = await dbQuery(
    `SELECT * FROM Conversations WHERE empresa_id = ?${whereExtra}
     ORDER BY pinned DESC, last_message_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  return {
    rows,
    total: rowsTotal ? rowsTotal.total : 0,
  };
}

/**
 * Busca uma conversa pelo id, validando que pertence à empresa.
 * @param {number} conversationId
 * @param {number} empresaId
 * @returns {Promise<Object|null>}
 */
async function getById(conversationId, empresaId) {
  const rows = await dbQuery(
    'SELECT * FROM Conversations WHERE id = ? AND empresa_id = ? LIMIT 1',
    [conversationId, empresaId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Incrementa o unread_count da conversa em 1.
 * Usado pelo webhook APÓS confirmar que a mensagem inbound é nova (não duplicada),
 * evitando inflar o contador quando o Meta reentrega o mesmo evento.
 * @param {number} conversationId
 * @param {number} empresaId
 * @returns {Promise<void>}
 */
async function incrementUnread(conversationId, empresaId) {
  await dbQuery(
    'UPDATE Conversations SET unread_count = unread_count + 1 WHERE id = ? AND empresa_id = ?',
    [conversationId, empresaId]
  );
}

/**
 * Zera unread_count da conversa (marcar como lida).
 * @param {number} conversationId
 * @param {number} empresaId
 * @returns {Promise<void>}
 */
async function markConversationRead(conversationId, empresaId) {
  await dbQuery(
    'UPDATE Conversations SET unread_count = 0 WHERE id = ? AND empresa_id = ?',
    [conversationId, empresaId]
  );
}

/**
 * Define (ou limpa) o nome de contato editado manualmente. Tem precedência sobre
 * o `contact_name` do perfil Meta e nunca é sobrescrito pelo webhook.
 * Isolado por empresa_id. Passar nome vazio/null limpa o personalizado.
 * @param {number} conversationId
 * @param {number} empresaId
 * @param {string|null} nome
 * @returns {Promise<number>} linhas afetadas
 */
async function updateContactNameCustom(conversationId, empresaId, nome) {
  const valor = nome && String(nome).trim() ? String(nome).trim().slice(0, 255) : null;
  const resultado = await dbQuery(
    'UPDATE Conversations SET contact_name_custom = ? WHERE id = ? AND empresa_id = ?',
    [valor, conversationId, empresaId]
  );
  return resultado.affectedRows || 0;
}

/**
 * Fixa/desafixa a conversa (pinned). Conversas fixadas aparecem no topo da lista.
 * Isolado por empresa_id.
 * @param {number} conversationId
 * @param {number} empresaId
 * @param {boolean} pinned
 * @returns {Promise<number>} linhas afetadas
 */
async function setPinned(conversationId, empresaId, pinned) {
  const resultado = await dbQuery(
    'UPDATE Conversations SET pinned = ? WHERE id = ? AND empresa_id = ?',
    [pinned ? 1 : 0, conversationId, empresaId]
  );
  return resultado.affectedRows || 0;
}

/**
 * Soft-delete da conversa (apenas no sistema; a Cloud API não apaga no WhatsApp).
 * Marca deleted_at; a conversa some das listagens mas o histórico permanece no banco.
 * Isolado por empresa_id.
 * @param {number} conversationId
 * @param {number} empresaId
 * @returns {Promise<number>} linhas afetadas
 */
async function softDeleteConversation(conversationId, empresaId) {
  const resultado = await dbQuery(
    'UPDATE Conversations SET deleted_at = NOW() WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    [conversationId, empresaId]
  );
  return resultado.affectedRows || 0;
}

module.exports = {
  upsertConversation,
  listConversations,
  getById,
  incrementUnread,
  markConversationRead,
  updateContactNameCustom,
  setPinned,
  softDeleteConversation,
};
