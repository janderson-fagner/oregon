/**
 * MÓDULO WWEBJS REMOVIDO
 * O chat agora usa WhatsApp Cloud API oficial do Meta.
 * Ver server/src/whatsapp/ para o novo módulo.
 * @deprecated Removido na migração para Cloud API (FASE-05)
 */

/**
 * Stub: getAllChats — dados agora vêm de Conversations/Messages (Cloud API).
 * @returns {Promise<Array>}
 */
async function getAllChats(clientId, limit = 5, page = 1, searchQuery = null, mapeado = true, empresa_id = null) {
    return [];
}

/**
 * Stub: getChatById — dados agora vêm de Conversations/Messages (Cloud API).
 * @returns {Promise<null>}
 */
async function getChatById(clientId, chatId, mapeado = true, limit = 50, empresa_id = null) {
    return null;
}

/**
 * Stub: actionsChat — wwebjs removido.
 * @returns {Promise<false>}
 */
async function actionsChat(clientId, chatId, action) {
    return false;
}

/**
 * Stub: getAllContacts — wwebjs removido.
 * @returns {Promise<Array>}
 */
async function getAllContacts(clientId) {
    return [];
}

/**
 * Stub: addWaitingForAgentTag — labels do WhatsApp Business via wwebjs removidas.
 * @returns {Promise<false>}
 */
async function addWaitingForAgentTag(clientId, chatId) {
    return false;
}

/**
 * Stub: addInAttendanceTag — labels do WhatsApp Business via wwebjs removidas.
 * @returns {Promise<false>}
 */
async function addInAttendanceTag(clientId, chatId) {
    return false;
}

/**
 * Stub: removeAttendanceTags — labels do WhatsApp Business via wwebjs removidas.
 * @returns {Promise<false>}
 */
async function removeAttendanceTags(clientId, chatId) {
    return false;
}

/**
 * Stub: removeWaitingForAgentTag — alias para removeAttendanceTags.
 * @returns {Promise<false>}
 */
async function removeWaitingForAgentTag(clientId, chatId) {
    return false;
}

/**
 * Stub: getChatMessages — dados agora vêm de Messages (Cloud API).
 * @returns {Promise<Array>}
 */
async function getChatMessages(clientId, chatId, limit = 50) {
    return [];
}

/**
 * Stub: popularUltimaMsgClientes — wwebjs removido, sem acesso aos chats.
 * @returns {Promise<Object>}
 */
async function popularUltimaMsgClientes(clientId, empresa_id) {
    console.warn('[zap/chats] STUB: popularUltimaMsgClientes — wwebjs removido.');
    return { total: 0, chatsWhatsApp: 0, atualizados: 0, semChat: 0, erros: 0 };
}

module.exports = {
    getAllChats,
    getChatById,
    actionsChat,
    getAllContacts,
    addWaitingForAgentTag,
    addInAttendanceTag,
    removeAttendanceTags,
    removeWaitingForAgentTag,
    getChatMessages,
    popularUltimaMsgClientes
};
