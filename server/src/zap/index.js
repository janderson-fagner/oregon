/**
 * MÓDULO WWEBJS REMOVIDO
 * Listeners de message_create, message_ack e message_edit desativados.
 * O webhook /webhook/whatsapp (Cloud API) substitui esses listeners.
 * Todos os exports são preservados para não quebrar call sites.
 * @deprecated Removido na migração para Cloud API (FASE-05)
 */

// Importa módulos stub (sem require('whatsapp-web.js'))
const clientFunctions = require('./client');
const messageFunctions = require('./message');
const chatFunctions = require('./chats');
const utilFunctions = require('./utils');

/**
 * Stub: setupClientListeners — sem client wwebjs para registrar listeners.
 * @param {string} clientId
 */
async function setupClientListeners(clientId) {
    // Stub: wwebjs removido — listeners desativados.
}

/**
 * Stub: removeClientListeners — sem client wwebjs para remover listeners.
 * @param {string} clientId
 */
function removeClientListeners(clientId) {
    // Stub: wwebjs removido — nada a remover.
}

/**
 * Stub: initDefaultClient — não inicializa mais Chrome/wwebjs.
 * Loga aviso único na inicialização do servidor.
 */
async function initDefaultClient() {
    console.log('[zap/index] STUB: wwebjs removido — clients não são mais inicializados (Cloud API ativa em /webhook/whatsapp).');
}

// Exporta todas as funções — mesmos nomes que call sites esperam
module.exports = {
    // Funções de client
    ...clientFunctions,

    // Sobrescreve initClient com versão no-op (compatível com call sites)
    initClient: async (clientId) => {
        console.warn('[zap] STUB: initClient — wwebjs removido. Use Cloud API.');
        return { success: false, message: 'wwebjs removido' };
    },

    // Sobrescreve disconnectClient com versão no-op
    disconnectClient: async (clientId) => {
        console.warn('[zap] STUB: disconnectClient — wwebjs removido.');
        return false;
    },

    // Funções de mensagens
    ...messageFunctions,

    // Funções de chats
    ...chatFunctions,

    // Funções utilitárias
    ...utilFunctions,

    // Gerenciamento de listeners (no-op)
    setupClientListeners,
    removeClientListeners,

    // Inicialização
    initDefaultClient
};
