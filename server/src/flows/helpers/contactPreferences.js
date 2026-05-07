/**
 * Preferências de canal por contato (texto vs áudio).
 *
 * Persistência por telefone (similar a FlowBlockedPhones), independente de
 * o contato estar cadastrado em CLIENTES.
 */

const { dbQuery } = require('../../utils/dbHelper');

/**
 * Verifica se o contato pediu para receber só texto.
 * @returns {Promise<boolean>}
 */
async function getPreferTextOnly(phone, empresa_id) {
    if (!phone) return false;
    try {
        const phoneClean = String(phone).replace(/\s/g, '');
        const last8 = phoneClean.slice(-8);
        const rows = await dbQuery(
            `SELECT prefer_text_only FROM ContactPreferences
             WHERE RIGHT(REPLACE(phone, ' ', ''), 8) = ?
             ${empresa_id ? 'AND (empresa_id = ? OR empresa_id IS NULL)' : ''}
             ORDER BY updated_at DESC LIMIT 1`,
            empresa_id ? [last8, empresa_id] : [last8]
        );
        return Array.isArray(rows) && rows.length > 0 && Number(rows[0].prefer_text_only) === 1;
    } catch (err) {
        console.error('[contactPreferences] getPreferTextOnly erro:', err.message);
        return false;
    }
}

/**
 * Define preferência de só-texto. Upsert por (phone, empresa_id).
 */
async function setPreferTextOnly(phone, empresa_id, value, opts = {}) {
    if (!phone) return false;
    try {
        const flag = value ? 1 : 0;
        const reason = opts.reason || null;
        const chatId = opts.chatId || null;
        await dbQuery(
            `INSERT INTO ContactPreferences (phone, chat_id, prefer_text_only, prefer_text_reason, empresa_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                prefer_text_only = VALUES(prefer_text_only),
                prefer_text_reason = VALUES(prefer_text_reason),
                chat_id = COALESCE(VALUES(chat_id), chat_id),
                updated_at = CURRENT_TIMESTAMP`,
            [phone, chatId, flag, reason, empresa_id || null]
        );
        return true;
    } catch (err) {
        console.error('[contactPreferences] setPreferTextOnly erro:', err.message);
        return false;
    }
}

/**
 * Detecta se a mensagem do cliente é um pedido para receber respostas em texto.
 * Cobre variações comuns no WhatsApp: "consegue escrever?", "manda por texto",
 * "prefiro digitado", "não consigo ouvir áudio", etc.
 *
 * @returns {{textPreference: boolean, audioPreference: boolean, reason: string|null}}
 */
function detectChannelPreference(text) {
    if (!text || typeof text !== 'string') {
        return { textPreference: false, audioPreference: false, reason: null };
    }
    const t = text.toLowerCase().trim();

    // Pedidos explícitos por TEXTO
    const textPatterns = [
        /\bconsegue\s+(escrever|digitar|mandar\s+escrito|mandar\s+por\s+texto)/i,
        /\b(pode|poderia|d[áa])\s+(escrever|digitar|me\s+responder\s+(escrito|por\s+texto|digitado))/i,
        /\b(prefiro|prefer[oê]ncia|melhor)\s+(texto|escrito|digitado|por\s+texto|por\s+escrito)/i,
        /\b(manda|envia|responde)\s+(por\s+)?(texto|escrito|digitado)/i,
        /\bn[ãa]o\s+(consigo|posso|d[áa]\s+pra|estou\s+conseguindo)\s+(ouvir|escutar|abrir)\s+(o\s+)?(áudio|audio|mensagem\s+de\s+voz)/i,
        /\bn[ãa]o\s+(estou\s+)?(conseguindo|consigo)\s+(ouvir|escutar)/i,
        /\b(sem|n[ãa]o\s+manda)\s+(áudio|audio)/i,
        /\bs[óo]\s+texto\b/i,
        /\bescreve\s+(por\s+)?(favor|gentileza|aí|ai)\b/i,
        /\bpor\s+favor\s+escreve/i,
        /\bme\s+responda\s+(por\s+)?(texto|escrito)/i,
    ];

    for (const re of textPatterns) {
        if (re.test(t)) {
            return { textPreference: true, audioPreference: false, reason: t.slice(0, 120) };
        }
    }

    // Pedidos explícitos por ÁUDIO (revertem a preferência)
    const audioPatterns = [
        /\b(manda|envia|responde)\s+(por\s+)?(áudio|audio|voz)/i,
        /\bprefiro\s+(áudio|audio|voz)/i,
        /\bpode\s+(mandar|gravar)\s+(o\s+)?(áudio|audio)/i,
    ];

    for (const re of audioPatterns) {
        if (re.test(t)) {
            return { textPreference: false, audioPreference: true, reason: t.slice(0, 120) };
        }
    }

    return { textPreference: false, audioPreference: false, reason: null };
}

module.exports = {
    getPreferTextOnly,
    setPreferTextOnly,
    detectChannelPreference,
};
