/**
 * 📡 CHAT STATE EMITTER
 *
 * Emite eventos de socket quando o estado de um chat/contato muda
 * (bloqueio de fluxos, aguardando atendimento, em atendimento, liberado).
 *
 * Frontend escuta "chat:state-update" e atualiza o chat correspondente
 * em tempo real, sem precisar refresh.
 */

const { emitToEmpresa } = require('../socket');

/**
 * Emite atualizacao de estado para uma empresa.
 *
 * @param {number} empresaId - Empresa do evento
 * @param {Object} payload - Estado atualizado
 * @param {string} [payload.chatId] - ID do chat WhatsApp (ex: "5541...@c.us")
 * @param {string} [payload.phone] - Telefone normalizado
 * @param {number} [payload.clienteId] - ID do cliente cadastrado (se houver)
 * @param {number|null} [payload.runId] - ID do FlowRun correspondente
 * @param {('waiting'|'in_attendance'|null)} [payload.agent_status]
 * @param {number|null} [payload.agent_user_id]
 * @param {boolean} [payload.waiting_for_agent] - true se aguardando atendente
 * @param {boolean} [payload.flows_blocked] - cliente bloqueado (CLIENTES.flows_blocked)
 * @param {boolean} [payload.phone_blocked] - FlowBlockedPhones
 * @param {string} [payload.reason] - motivo da mudanca (log/debug)
 */
function emitChatStateUpdate(empresaId, payload = {}) {
    if (!empresaId) return;
    try {
        emitToEmpresa(Number(empresaId), 'chat:state-update', {
            ...payload,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[ChatStateEmitter] Falha ao emitir:', err.message);
    }
}

module.exports = { emitChatStateUpdate };
