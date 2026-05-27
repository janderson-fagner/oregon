/**
 * MÓDULO WWEBJS REMOVIDO
 * O chat agora usa WhatsApp Cloud API oficial do Meta.
 * Ver server/src/whatsapp/ para o novo módulo.
 * @deprecated Removido na migração para Cloud API (FASE-05)
 */

const dbQuery = require('../utils/dbHelper');

/**
 * Stub: retorna null — sem instância wwebjs ativa.
 * @param {string} clientId
 * @returns {null}
 */
function getClientById(clientId) {
    return null;
}

/**
 * Stub: consulta o banco para compatibilidade, mas sem Chrome/wwebjs.
 * @param {string} clientId
 * @returns {Promise<boolean>}
 */
async function isClientConnected(clientId) {
    try {
        const clientData = await dbQuery('SELECT status FROM Clients WHERE id = ?', [clientId]);
        if (clientData.length === 0) return false;
        return clientData[0].status === 'connected';
    } catch (error) {
        return false;
    }
}

/**
 * Stub: no-op — atualização de status mantida para não quebrar leituras legadas.
 * @param {string} clientId
 * @param {string} status
 * @param {Object} additionalData
 */
async function updateClientStatus(clientId, status, additionalData = {}) {
    // Stub: sem wwebjs. Não atualiza mais — evita confusão de estado.
}

/**
 * Stub: não inicializa Chrome/wwebjs.
 * @param {string} clientId
 * @returns {Promise<Object>}
 */
async function initClient(clientId) {
    console.warn('[zap/client] STUB: wwebjs removido — initClient é no-op. Chat via Cloud API (server/src/whatsapp/).');
    return { success: false, message: 'wwebjs removido — use Cloud API' };
}

/**
 * Stub: não desconecta Chrome/wwebjs.
 * @param {string} clientId
 * @returns {Promise<boolean>}
 */
async function disconnectClient(clientId) {
    console.warn('[zap/client] STUB: wwebjs removido — disconnectClient é no-op.');
    return false;
}

/**
 * Lê lista de clients do banco (dados históricos, sem iniciar Chrome).
 * @param {number|null} empresa_id
 * @returns {Promise<Array>}
 */
async function getAllClients(empresa_id = null) {
    try {
        let query = 'SELECT * FROM Clients';
        let params = [];
        if (empresa_id) {
            query += ' WHERE empresa_id = ?';
            params.push(empresa_id);
        }
        query += ' ORDER BY created_at DESC';
        return await dbQuery(query, params);
    } catch (error) {
        console.error('[zap/client] Erro ao listar clients:', error);
        return [];
    }
}

/**
 * Stub: não cria mais clients (wwebjs removido).
 * @param {string} clientId
 * @param {string} name
 * @param {number|null} empresa_id
 * @returns {Promise<Object>}
 */
async function createClient(clientId, name, empresa_id = null) {
    console.warn('[zap/client] STUB: wwebjs removido — createClient é no-op.');
    return { success: false, message: 'wwebjs removido' };
}

/**
 * Stub: não remove clients (wwebjs removido, dados históricos preservados).
 * @param {string} clientId
 * @returns {Promise<boolean>}
 */
async function deleteClient(clientId) {
    console.warn('[zap/client] STUB: wwebjs removido — deleteClient é no-op.');
    return false;
}

/**
 * Stub: não auto-inicializa Chrome/wwebjs.
 */
async function autoInitClients() {
    console.warn('[zap/client] STUB: wwebjs removido — autoInitClients é no-op.');
}

module.exports = {
    getClientById,
    isClientConnected,
    updateClientStatus,
    initClient,
    disconnectClient,
    getAllClients,
    createClient,
    deleteClient,
    autoInitClients
};
