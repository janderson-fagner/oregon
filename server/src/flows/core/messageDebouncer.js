/**
 * 📨 MESSAGE DEBOUNCER - Controle de concorrência para mensagens recebidas
 *
 * Quando um cliente envia várias mensagens seguidas no WhatsApp,
 * este módulo bufferiza e concatena em uma única chamada ao processador.
 * Também enfileira mensagens recebidas durante o processamento.
 */

const DEBOUNCE_MS = 60000;           // 1 minuto (60s) de debounce
const STALE_THRESHOLD_MS = 600000;  // 10 minutos para considerar stale
const CLEANUP_INTERVAL_MS = 300000; // Limpeza a cada 5 minutos
const DUPLICATE_WINDOW_MS = 5000;   // Janela para considerar mensagem duplicada (mesmo texto+midia em <5s)

/**
 * Map<phoneKey, {
 *   messages: [{ text, mediaPath, mediaType, timestamp }],
 *   debounceTimer: Timeout|null,
 *   isProcessing: boolean,
 *   pendingQueue: [{ text, mediaPath, mediaType, timestamp }],
 *   params: { clientId, phone, chatId },
 *   lastActivity: number
 * }>
 */
const phoneStates = new Map();

/** Referência para a função real de processamento */
let _processor = null;

/**
 * Registra a função processadora (evita dependência circular)
 * @param {Function} fn - A função _processIncomingMessage original
 */
function setProcessor(fn) {
    _processor = fn;
}

/**
 * Ponto de entrada principal - bufferiza mensagem e controla debounce
 * @param {Object} params - { phone, chatId, text, clientId, mediaPath, mediaType }
 */
function queueMessage({ phone, chatId, text, clientId = 'default', mediaPath = null, mediaType = null, empresa_id = null }) {
    const phoneKey = (phone || '').replace(/\D/g, '');
    if (!phoneKey) {
        console.log(`[Debouncer] ⚠️ queueMessage chamado sem phone valido (phone="${phone}") - ignorando`);
        return;
    }

    const now = Date.now();
    const msgEntry = { text: text || '', mediaPath, mediaType, timestamp: now };

    if (!phoneStates.has(phoneKey)) {
        phoneStates.set(phoneKey, {
            messages: [],
            debounceTimer: null,
            isProcessing: false,
            pendingQueue: [],
            params: { clientId, phone, chatId, empresa_id },
            lastActivity: now
        });
    }

    const state = phoneStates.get(phoneKey);
    state.lastActivity = now;

    // Atualizar params com os mais recentes
    state.params = { clientId, phone, chatId, empresa_id };

    // ─────────────────────────────────────────────────────────────────
    // DEDUPE DEFENSIVO POR CONTEUDO + JANELA TEMPORAL
    // Protege contra duplicacao residual (listeners acumulados, retries,
    // emissoes duplicadas do whatsapp-web.js que nao tem id estavel).
    // Considera duplicada: mesmo texto + mesma midia em janela <5s.
    // ─────────────────────────────────────────────────────────────────
    const dupSignature = `${msgEntry.text}::${msgEntry.mediaPath || ''}`;

    // Verifica buffer atual
    const dupInBuffer = state.messages.find(m =>
        `${m.text}::${m.mediaPath || ''}` === dupSignature &&
        (now - m.timestamp) < DUPLICATE_WINDOW_MS
    );
    if (dupInBuffer) {
        console.log(`[Debouncer] 🚫 ${phoneKey}: Mensagem DUPLICADA descartada (mesma signature em <${DUPLICATE_WINDOW_MS}ms) | text="${(msgEntry.text || '').slice(0, 60)}" buffer=${state.messages.length} processing=${state.isProcessing}`);
        return;
    }
    // Verifica fila pendente tambem
    const dupInPending = state.pendingQueue.find(m =>
        `${m.text}::${m.mediaPath || ''}` === dupSignature &&
        (now - m.timestamp) < DUPLICATE_WINDOW_MS
    );
    if (dupInPending) {
        console.log(`[Debouncer] 🚫 ${phoneKey}: Mensagem DUPLICADA descartada da fila pendente | text="${(msgEntry.text || '').slice(0, 60)}" pending=${state.pendingQueue.length}`);
        return;
    }
    // Verifica ultima processada (caso a duplicada chegue logo depois do flush)
    if (state.lastProcessedSignature === dupSignature && state.lastProcessedAt && (now - state.lastProcessedAt) < DUPLICATE_WINDOW_MS) {
        console.log(`[Debouncer] 🚫 ${phoneKey}: Mensagem DUPLICADA descartada (mesma signature da ultima processada ha <${DUPLICATE_WINDOW_MS}ms) | text="${(msgEntry.text || '').slice(0, 60)}"`);
        return;
    }

    // Se está processando, colocar na fila de pendentes
    if (state.isProcessing) {
        state.pendingQueue.push(msgEntry);
        console.log(`[Debouncer] ${phoneKey}: Mensagem enfileirada (processamento em andamento). Pendentes: ${state.pendingQueue.length} | text="${(msgEntry.text || '').slice(0, 60)}"`);
        return;
    }

    // Adicionar ao buffer de debounce
    state.messages.push(msgEntry);

    // Resetar timer de debounce
    if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
        _flushMessages(phoneKey);
    }, DEBOUNCE_MS);

    console.log(`[Debouncer] ${phoneKey}: Mensagem bufferizada. Buffer: ${state.messages.length}. Timer resetado para ${DEBOUNCE_MS}ms | text="${(msgEntry.text || '').slice(0, 60)}" media=${mediaType || 'none'} clientId=${clientId}`);
}

/**
 * Consolida mensagens bufferizadas e envia ao processador
 * @param {string} phoneKey - Chave do telefone
 */
async function _flushMessages(phoneKey) {
    const state = phoneStates.get(phoneKey);
    if (!state || state.messages.length === 0) return;

    state.isProcessing = true;
    state.debounceTimer = null;

    // Copiar e limpar buffer
    const bufferedMessages = [...state.messages];
    state.messages = [];

    // Concatenar textos das mensagens
    const combinedText = bufferedMessages
        .map(m => m.text)
        .filter(t => t && t.trim())
        .join('\n');

    // Preservar última mídia do buffer
    let lastMediaPath = null;
    let lastMediaType = null;
    for (let i = bufferedMessages.length - 1; i >= 0; i--) {
        if (bufferedMessages[i].mediaPath) {
            lastMediaPath = bufferedMessages[i].mediaPath;
            lastMediaType = bufferedMessages[i].mediaType;
            break;
        }
    }

    const msgCount = bufferedMessages.length;
    if (msgCount > 1) {
        console.log(`[Debouncer] ${phoneKey}: Consolidando ${msgCount} mensagens em uma única chamada | combinedText="${(combinedText || '').slice(0, 100)}"`);
    } else {
        console.log(`[Debouncer] ${phoneKey}: Flush de 1 mensagem | text="${(combinedText || '').slice(0, 100)}"`);
    }

    // Salva signature da mensagem que sera processada para dedupe pos-flush
    state.lastProcessedSignature = `${combinedText}::${lastMediaPath || ''}`;

    try {
        if (!_processor) {
            console.error('[Debouncer] Processador não registrado! Use setProcessor() antes de queueMessage()');
            return;
        }

        await _processor({
            phone: state.params.phone,
            chatId: state.params.chatId,
            text: combinedText,
            clientId: state.params.clientId,
            mediaPath: lastMediaPath,
            mediaType: lastMediaType,
            empresa_id: state.params.empresa_id
        });
    } catch (error) {
        console.error(`[Debouncer] ${phoneKey}: Erro no processamento:`, error.message, error.stack);
    } finally {
        state.isProcessing = false;
        state.lastProcessedAt = Date.now();

        // Se há mensagens pendentes, mover para buffer e processar com debounce curto
        // (o debounce curto aqui é intencional — as mensagens já esperaram durante o processamento)
        if (state.pendingQueue.length > 0) {
            state.messages = [...state.pendingQueue];
            state.pendingQueue = [];

            console.log(`[Debouncer] ${phoneKey}: ${state.messages.length} mensagens pendentes movidas para buffer. Processando com debounce curto (3s).`);

            // Debounce curto para pendentes — elas já esperaram o processamento inteiro
            state.debounceTimer = setTimeout(() => {
                _flushMessages(phoneKey);
            }, 3000);
        }
    }
}

/**
 * Retorna estatísticas para debug/monitoramento
 * @returns {Object} Stats de todos os telefones ativos
 */
function getStats() {
    const stats = {};
    for (const [key, state] of phoneStates.entries()) {
        stats[key] = {
            buffered: state.messages.length,
            pending: state.pendingQueue.length,
            isProcessing: state.isProcessing,
            hasTimer: !!state.debounceTimer,
            lastActivity: new Date(state.lastActivity).toISOString()
        };
    }
    return stats;
}

/**
 * Limpa entradas inativas (stale) do Map
 */
function cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, state] of phoneStates.entries()) {
        if (!state.isProcessing && (now - state.lastActivity) > STALE_THRESHOLD_MS) {
            if (state.debounceTimer) clearTimeout(state.debounceTimer);
            phoneStates.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[Debouncer] Cleanup: ${cleaned} entradas stale removidas`);
    }
}

// Agendar cleanup periódico
const _cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);

// Evitar que o interval impeça o processo de fechar
if (_cleanupInterval.unref) {
    _cleanupInterval.unref();
}

module.exports = {
    queueMessage,
    setProcessor,
    getStats,
    cleanup,
    DEBOUNCE_MS,
    STALE_THRESHOLD_MS
};
