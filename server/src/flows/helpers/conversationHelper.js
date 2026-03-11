/**
 * 💬 CONVERSATION HELPER - Gerenciamento de Histórico de Conversa para IA
 *
 * Sistema de histórico que funciona tanto em modo simulação quanto produção.
 * Mantém contexto da conversa para que a IA responda de forma coerente.
 *
 * Formato compatível com Gemini:
 * { role: "user"|"model", parts: [{ text: "..." }], timestamp: "ISO8601" }
 */

const { flowLog } = require('./logHelper');

/**
 * Adiciona uma mensagem ao histórico de conversa no contexto
 * @param {Object} context - Contexto do fluxo
 * @param {String} role - "user" para mensagens do cliente, "model" para respostas da IA
 * @param {String} text - Texto da mensagem
 * @returns {Object} - Contexto atualizado
 */
function addMessageToHistory(context, role, text) {
    if (!context) {
        flowLog.log('WARN', '⚠️ Contexto nulo em addMessageToHistory');
        return context;
    }

    // Inicializar histórico se não existir
    if (!context.history) {
        context.history = [];
    }

    // Validar role
    const validRole = role === 'model' ? 'model' : 'user';

    // Não adicionar mensagens vazias
    if (!text || typeof text !== 'string' || !text.trim()) {
        return context;
    }

    // Criar mensagem no formato Gemini
    const message = {
        role: validRole,
        parts: [{ text: text.trim() }],
        timestamp: new Date().toISOString()
    };

    // Evitar duplicatas (mesma mensagem nos últimos 2 segundos)
    const lastMsg = context.history[context.history.length - 1];
    if (lastMsg) {
        const timeDiff = new Date() - new Date(lastMsg.timestamp);
        const sameText = lastMsg.parts?.[0]?.text === text.trim();
        const sameRole = lastMsg.role === validRole;

        if (sameText && sameRole && timeDiff < 2000) {
            flowLog.log('DEBUG', '🔄 Mensagem duplicada ignorada');
            return context;
        }
    }

    context.history.push(message);

    // Limitar tamanho do histórico (máximo 50 mensagens)
    if (context.history.length > 50) {
        context.history = context.history.slice(-50);
    }

    flowLog.log('DEBUG', `📝 Mensagem adicionada ao histórico: ${validRole} (total: ${context.history.length})`);

    return context;
}

/**
 * Obtém histórico formatado para uso com Gemini
 * @param {Object} context - Contexto do fluxo
 * @param {Number} limit - Número máximo de mensagens (padrão: 20)
 * @returns {Array} - Array de mensagens no formato Gemini
 */
function getFormattedHistory(context, limit = 20) {
    if (!context || !context.history || !Array.isArray(context.history)) {
        return [];
    }

    // Pegar as últimas N mensagens
    const messages = context.history.slice(-limit);

    // Formatar para Gemini (garantir estrutura correta)
    return messages.map(msg => ({
        role: msg.role || 'user',
        parts: Array.isArray(msg.parts) ? msg.parts : [{ text: msg.parts || '' }]
    })).filter(msg => {
        // Filtrar mensagens vazias
        const text = msg.parts?.[0]?.text;
        return text && text.trim();
    });
}

/**
 * Sincroniza histórico do WhatsApp para o contexto (fallback)
 * Usado quando não há histórico no contexto mas há client WhatsApp disponível
 * @param {Object} context - Contexto do fluxo
 * @param {String} clientId - ID do client WhatsApp
 * @param {String} chatId - ID do chat
 * @returns {Promise<Object>} - Contexto atualizado
 */
async function syncHistoryFromWhatsApp(context, clientId, chatId) {
    if (!context) return context;

    // Se já tem histórico no contexto, não sobrescrever
    if (context.history && context.history.length > 0) {
        flowLog.log('DEBUG', '📚 Histórico já existe no contexto, não sincronizando');
        return context;
    }

    // Se é simulação, não tentar buscar do WhatsApp
    if (context.isSimulation) {
        flowLog.log('DEBUG', '🧪 Modo simulação - não sincronizando do WhatsApp');
        return context;
    }

    // Tentar buscar do WhatsApp
    if (clientId && chatId) {
        try {
            const { getChatMessages } = require('../../zap/chats');
            const messages = await getChatMessages(clientId, chatId, 20);

            if (messages && messages.length > 0) {
                context.history = messages.map(msg => {
                    const entry = {
                        role: msg.from_me === 1 || msg.fromMe === true ? 'model' : 'user',
                        parts: [{ text: msg.body || msg.text || '' }],
                        timestamp: msg.timestamp || new Date().toISOString()
                    };
                    // Preservar dados de mídia para o Gemini processar
                    if (msg.media) entry.media = msg.media;
                    if (msg.image) entry.image = msg.image;
                    if (msg.audio) entry.audio = msg.audio;
                    if (msg.video) entry.video = msg.video;
                    return entry;
                }).filter(msg => msg.parts[0].text || msg.media || msg.image);

                flowLog.log('INFO', `📚 Sincronizado ${context.history.length} mensagens do WhatsApp`);
            }
        } catch (err) {
            flowLog.log('WARN', '⚠️ Erro ao sincronizar histórico do WhatsApp', { error: err.message });
        }
    }

    return context;
}

/**
 * Verifica se há mensagens anteriores do modelo (IA) no histórico
 * Útil para saber se é a primeira interação ou continuação
 * @param {Object} context - Contexto do fluxo
 * @returns {Boolean} - true se já houve resposta da IA
 */
function hasPreviousModelMessage(context) {
    if (!context || !context.history || !Array.isArray(context.history)) {
        return false;
    }

    return context.history.some(msg => msg.role === 'model');
}

/**
 * Obtém a última mensagem do usuário no histórico
 * @param {Object} context - Contexto do fluxo
 * @returns {String|null} - Texto da última mensagem ou null
 */
function getLastUserMessage(context) {
    if (!context || !context.history || !Array.isArray(context.history)) {
        return null;
    }

    // Buscar de trás para frente a primeira mensagem de usuário
    for (let i = context.history.length - 1; i >= 0; i--) {
        if (context.history[i].role === 'user') {
            return context.history[i].parts?.[0]?.text || null;
        }
    }

    return null;
}

/**
 * Obtém a última mensagem do modelo (IA) no histórico
 * @param {Object} context - Contexto do fluxo
 * @returns {String|null} - Texto da última mensagem ou null
 */
function getLastModelMessage(context) {
    if (!context || !context.history || !Array.isArray(context.history)) {
        return null;
    }

    // Buscar de trás para frente a primeira mensagem do modelo
    for (let i = context.history.length - 1; i >= 0; i--) {
        if (context.history[i].role === 'model') {
            return context.history[i].parts?.[0]?.text || null;
        }
    }

    return null;
}

/**
 * Cria um resumo do histórico para incluir no prompt
 * @param {Object} context - Contexto do fluxo
 * @param {Number} limit - Número de mensagens para resumir (padrão: 5)
 * @returns {String} - Resumo formatado
 */
function getHistorySummary(context, limit = 5) {
    if (!context || !context.history || !Array.isArray(context.history)) {
        return '';
    }

    const lastMessages = context.history.slice(-limit);

    if (lastMessages.length === 0) {
        return '';
    }

    let summary = '';

    for (const msg of lastMessages) {
        const role = msg.role === 'user' ? '👤 Cliente' : '🤖 Você';
        const text = msg.parts?.[0]?.text || '';

        if (text) {
            // Truncar mensagens longas
            const truncated = text.length > 150 ? text.substring(0, 150) + '...' : text;
            summary += `${role}: "${truncated}"\n`;
        }
    }

    return summary;
}

/**
 * Limpa o histórico de conversa
 * @param {Object} context - Contexto do fluxo
 * @returns {Object} - Contexto com histórico limpo
 */
function clearHistory(context) {
    if (context) {
        context.history = [];
    }
    return context;
}

/**
 * Conta o número de mensagens no histórico
 * @param {Object} context - Contexto do fluxo
 * @returns {Number} - Número de mensagens
 */
function getHistoryCount(context) {
    if (!context || !context.history || !Array.isArray(context.history)) {
        return 0;
    }
    return context.history.length;
}

module.exports = {
    addMessageToHistory,
    getFormattedHistory,
    syncHistoryFromWhatsApp,
    hasPreviousModelMessage,
    getLastUserMessage,
    getLastModelMessage,
    getHistorySummary,
    clearHistory,
    getHistoryCount
};
