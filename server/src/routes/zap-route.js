const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
// execFile assíncrono: não bloqueia o event loop durante o re-encode do áudio
// (execFileSync travava todas as outras requisições por 0,2-1,8s por áudio).
const execFileAsync = promisify(execFile);

const caminhoBase = path.join(__dirname, '../uploads/midias/');

if (!fs.existsSync(caminhoBase)) {
    fs.mkdirSync(caminhoBase, { recursive: true });
}

/**
 * Multer diskStorage legado — usado pelas rotas wwebjs que ainda não foram migradas.
 * NÃO utilizar para o Cloud API (save-anexo usa uploadAnexo abaixo).
 */
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const chatId = req.query.chatId || req.body.chatId || 'flows';
            let caminhoChat = path.join(caminhoBase, chatId);
            if (!fs.existsSync(caminhoChat)) {
                fs.mkdirSync(caminhoChat, { recursive: true });
            }
            cb(null, caminhoChat);
        },
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const newFileName = `${timestamp}-${file.originalname}`;
            cb(null, newFileName);
        }
    }),
});

/**
 * Mimetypes aceitos para upload de anexos via Cloud API (WhatsApp).
 * Documentos de escritório, imagens, vídeos e áudio suportados.
 */
const MIMETYPES_ACEITOS = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    // audio/webm é o formato padrão do MediaRecorder no Chrome. A Cloud API
    // do Meta NÃO aceita webm — convertemos para ogg/opus antes do envio.
    'audio/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Mapa de extensão por mimetype para salvar arquivos com extensão correta.
 */
const MIME_PARA_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/webm': '.webm',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

/**
 * Multer dedicado para o endpoint save-anexo (Cloud API).
 * Usa memoryStorage: o buffer é passado para messageService.sendMediaMessage,
 * que salva em disco após validação. Limite 16MB (máximo WhatsApp para documentos).
 */
/**
 * Normaliza mimetype removendo parâmetros (ex.: "audio/ogg; codecs=opus" → "audio/ogg").
 * O navegador envia o codec no Content-Type, mas o whitelist tem só o tipo base.
 */
function mimeBase(mime) {
    return String(mime || '').split(';')[0].trim().toLowerCase();
}

/**
 * Deriva o tipo de mídia WhatsApp a partir do mimetype (sem parâmetros).
 * @param {string} mime
 * @returns {'image'|'video'|'audio'|'document'}
 */
function tipoMidiaPorMime(mime) {
    const m = mimeBase(mime);
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'document';
}

const uploadAnexo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (MIMETYPES_ACEITOS.has(mimeBase(file.mimetype))) {
            cb(null, true);
        } else {
            const err = new Error(`Tipo de arquivo não permitido: ${file.mimetype}`);
            err.code = 'MIMETYPE_INVALIDO';
            cb(err, false);
        }
    },
});

// Repositórios e serviços da Cloud API
const messageService = require('../whatsapp/messageService');
const conversationRepository = require('../whatsapp/repositories/conversationRepository');
const messageRepository = require('../whatsapp/repositories/messageRepository');
const configRepository = require('../whatsapp/repositories/configRepository');
const cloudApiClient = require('../whatsapp/cloudApiClient');
const contactService = require('../whatsapp/contactService');
const log = require('../whatsapp/logger');
const { emitToEmpresa } = require('../socket');

console.log('Zap route carregado');

// ============= ROTAS DE GERENCIAMENTO DE CLIENTS =============

// Lista clients — recurso descontinuado (wwebjs removido)
router.get('/clients/list', (req, res) => {
    return res.status(410).json({ error: 'Recurso descontinuado. A conexão agora é feita por credenciais do Meta em Configurações > WhatsApp.' });
});

// Cria client — recurso descontinuado (wwebjs removido)
router.post('/clients/create', (req, res) => {
    return res.status(410).json({ error: 'Recurso descontinuado. A conexão agora é feita por credenciais do Meta em Configurações > WhatsApp.' });
});

// Remove client — recurso descontinuado (wwebjs removido)
router.delete('/clients/delete/:clientId', (req, res) => {
    return res.status(410).json({ error: 'Recurso descontinuado. A conexão agora é feita por credenciais do Meta em Configurações > WhatsApp.' });
});

// ============= ROTAS DE CONEXÃO =============

// Conecta via QR code — recurso descontinuado (wwebjs removido)
router.get('/connect', (req, res) => {
    return res.status(410).json({ error: 'Recurso descontinuado. A conexão agora é feita por credenciais do Meta em Configurações > WhatsApp.' });
});

// Desconecta — recurso descontinuado (wwebjs removido)
router.get('/disconnect', (req, res) => {
    return res.status(410).json({ error: 'Recurso descontinuado. A conexão agora é feita por credenciais do Meta em Configurações > WhatsApp.' });
});

// Verifica status de conexão via wwebjs — recurso descontinuado
router.get('/check-conn', (req, res) => {
    return res.status(410).json({ error: 'Recurso descontinuado. A conexão agora é feita por credenciais do Meta em Configurações > WhatsApp.' });
});

// ============= ROTAS DE MENSAGENS =============

/**
 * POST /zap/send-message-chat
 * Envia mensagem de texto (ou reply) para uma conversa via Cloud API.
 * Body: { conversationId, text, replyToWamid? }
 * Retorna: { success: true, message }
 * 422 se janela fechada; 400 se erro de negócio; 502 se erro Meta.
 */
router.post('/send-message-chat', async (req, res) => {
    try {
        const { conversationId, text, replyToWamid } = req.body;
        const empresaId = req.user.empresa_id;
        const senderName = req.user.fullName || req.user.nome || req.user.name || 'Atendente';

        const convId = parseInt(conversationId);
        if (!convId || convId <= 0 || !text || !String(text).trim()) {
            return res.status(400).json({ error: 'conversationId e text são obrigatórios.' });
        }

        const resultado = await messageService.sendTextMessage(
            empresaId,
            convId,
            String(text).trim(),
            replyToWamid || null,
            senderName
        );

        if (resultado.windowClosed) {
            return res.status(422).json(resultado);
        }
        if (resultado.error) {
            return res.status(400).json(resultado);
        }

        // sendTextMessage retorna { success, wamid, conversationId } — monta objeto de mensagem
        // para socket e resposta sem query extra ao banco.
        const msgObj = {
            wamid: resultado.wamid || null,
            direction: 'outbound',
            fromMe: true,
            tipo: 'text',
            type: 'text',
            texto: String(text).trim(),
            body: String(text).trim(),
            hasMedia: false,
            media: null,
            media_path: null,
            media_url: null,
            media_mime: null,
            media_filename: null,
            senderName,
            ack: 1,
            status: 'sent',
            reply_to_wamid: replyToWamid || null,
            timestamp_ms: Date.now(),
            data: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };

        emitToEmpresa(empresaId, 'nova-mensagem', {
            conversation_id: convId,
            message: msgObj,
        });

        return res.json({ success: true, message: msgObj });
    } catch (error) {
        console.error('Erro ao enviar mensagem de texto:', error.message);
        return res.status(502).json({ error: error.message || 'Erro ao comunicar com a API do WhatsApp.' });
    }
});

/**
 * POST /zap/send-reaction
 * Envia (ou remove) uma reação do atendente a uma mensagem da conversa.
 * Body: { conversationId, messageWamid, emoji } — emoji '' ou null remove.
 * Valida ownership (empresa_id) da conversa e da mensagem-alvo antes de enviar.
 * Retorna: { success: true, wamid, reaction }
 */
router.post('/send-reaction', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const { conversationId, messageWamid } = req.body;
        const emoji = req.body.emoji || ''; // '' => remover reação

        if (!conversationId || !messageWamid) {
            return res.status(400).json({ error: 'conversationId e messageWamid são obrigatórios.' });
        }

        // Conversa precisa pertencer à empresa (isolamento de tenant)
        const conversation = await conversationRepository.getById(conversationId, empresaId);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        // A mensagem-alvo precisa existir e pertencer à mesma empresa
        const alvo = await messageRepository.getByWamid(messageWamid, empresaId);
        if (!alvo || alvo.conversation_id != conversationId) {
            return res.status(404).json({ error: 'Mensagem não encontrada nesta conversa.' });
        }

        // Config (phone_number_id/token) da empresa
        const config = await configRepository.getByEmpresa(empresaId);
        if (!config || !config.ativo) {
            return res.status(400).json({ error: 'WhatsApp Cloud não configurado para esta empresa.' });
        }

        // Envia a reação ao Meta
        try {
            await cloudApiClient.sendReaction(config, conversation.contact_wa_id, messageWamid, emoji);
        } catch (errMeta) {
            log.err('zap.send-reaction.meta_falhou', { msg: errMeta.message, messageWamid });
            return res.status(502).json({ error: errMeta.message || 'Erro ao comunicar com a API do WhatsApp.' });
        }

        // Persiste localmente e atualiza o frontend (emoji vazio => NULL)
        const valor = emoji && emoji.trim() ? emoji : null;
        await messageRepository.setReactionByWamid(messageWamid, valor, empresaId);
        emitToEmpresa(empresaId, 'update-mensagem', { wamid: messageWamid, reaction: valor });

        return res.json({ success: true, wamid: messageWamid, reaction: valor });
    } catch (error) {
        console.error('Erro ao enviar reação:', error.message);
        return res.status(502).json({ error: error.message || 'Erro ao comunicar com a API do WhatsApp.' });
    }
});

/**
 * POST /zap/save-anexo
 * Recebe arquivo via multipart, salva em disco e envia via Cloud API.
 * Multer dedicado (memoryStorage, 16MB, whitelist de mimetypes).
 * Body: conversationId, caption? + campo 'file'.
 * Retorna: { success: true, message }
 */
router.post('/save-anexo', (req, res, next) => {
    uploadAnexo.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 16MB.' });
            }
            if (err.code === 'MIMETYPE_INVALIDO') {
                return res.status(400).json({ error: err.message });
            }
            return res.status(400).json({ error: 'Erro ao processar o arquivo enviado.' });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { conversationId, caption } = req.body;
        const empresaId = req.user.empresa_id;
        const senderName = req.user.fullName || req.user.nome || req.user.name || 'Atendente';

        const convId = parseInt(conversationId);
        if (!convId || convId <= 0 || !req.file) {
            return res.status(400).json({ error: 'conversationId e arquivo são obrigatórios.' });
        }

        // Normaliza mimetype para o whitelist + extensão + Meta (sem parâmetros de codec)
        let mimeNormal = mimeBase(req.file.mimetype);
        let bufferEnviar = req.file.buffer;
        let originalname = req.file.originalname;

        log('save-anexo.recebido', {
            empresaId, convId, mimeRaw: req.file.mimetype, mimeNormal,
            originalname, bufferSize: req.file.size, captionLen: (caption || '').length,
        });

        // O Chrome grava áudio em audio/webm (Opus, stereo, ~120 kbps). A Cloud API não aceita
        // webm e o WhatsApp espera nota de voz em OGG/Opus MONO, ~16-32 kbps, otimizado para voip.
        // Um `-c:a copy` produz OGG válido sintaticamente, mas carrega metadados/canais do webm
        // que o cliente do WhatsApp não reproduz corretamente (toca picotado/silencioso).
        // Por isso re-encodamos: re-encode de áudio curto (<30s) leva <200ms e garante
        // um arquivo limpo equivalente ao que o app de WhatsApp gera nativamente.
        if (mimeNormal === 'audio/webm') {
            const tamanhoAntes = bufferEnviar.length;
            const tmpIn = path.join(os.tmpdir(), `${crypto.randomUUID()}.webm`);
            const tmpOut = path.join(os.tmpdir(), `${crypto.randomUUID()}.ogg`);
            try {
                await fs.promises.writeFile(tmpIn, bufferEnviar);
                await execFileAsync(
                    'ffmpeg',
                    [
                        '-y', '-i', tmpIn,
                        '-vn',                         // sem stream de vídeo
                        '-map_metadata', '-1',         // descarta tags herdadas (ex.: language=eng)
                        // Cadeia de filtros para nota de voz audível:
                        //  highpass=80  -> corta ruído grave/rumble do microfone
                        //  loudnorm     -> normaliza o volume (EBU R128, alvo -16 LUFS).
                        //                  É o que conserta o áudio "muito baixo": traz
                        //                  gravações fracas para um nível alto e consistente.
                        '-af', 'highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-c:a', 'libopus',             // re-encode opus (exigido p/ nota de voz)
                        '-b:a', '64k',                 // qualidade boa p/ voz (opus 64k mono)
                        '-vbr', 'constrained',         // VBR limitado: segura o tamanho perto do alvo
                                                       // (~488KB p/ 60s, sob 512KB = mantém ícone de play)
                        '-compression_level', '10',    // máxima qualidade do encoder (custo de CPU desprezível p/ áudio curto)
                        '-ac', '1',                    // mono (obrigatório para nota de voz no WhatsApp)
                        '-ar', '48000',                // 48 kHz (taxa nativa do Opus)
                        '-application', 'audio',       // som mais cheio que 'voip' já que o loudnorm cuida do nível
                        tmpOut,
                    ],
                    { stdio: 'ignore' }
                );
                bufferEnviar = await fs.promises.readFile(tmpOut);
                mimeNormal = 'audio/ogg';
                originalname = (originalname || 'voz').replace(/\.[^.]+$/i, '') + '.ogg';
                log('save-anexo.webm_para_ogg.ok', { antes: tamanhoAntes, depois: bufferEnviar.length });
            } catch (convErr) {
                log.err('save-anexo.webm_para_ogg.falhou', { msg: convErr.message, stack: convErr.stack });
                return res.status(500).json({ error: 'Falha ao processar o áudio gravado. Tente novamente.' });
            } finally {
                try { await fs.promises.unlink(tmpIn); } catch (_) {}
                try { await fs.promises.unlink(tmpOut); } catch (_) {}
            }
        }

        const tipoMidia = tipoMidiaPorMime(mimeNormal);

        // Salva buffer em disco antes de enviar (path local para exibição no chat)
        const ext = MIME_PARA_EXT[mimeNormal] || '.bin';
        const nomeArquivo = `${crypto.randomUUID()}${ext}`;
        const pastaEmpresa = path.join(__dirname, '../uploads/midias', String(empresaId));

        await fs.promises.mkdir(pastaEmpresa, { recursive: true });

        const caminhoCompleto = path.join(pastaEmpresa, nomeArquivo);
        await fs.promises.writeFile(caminhoCompleto, bufferEnviar);

        // mediaPath relativo ao diretório uploads/ (servido como /uploads/midias/{id}/{arquivo})
        const mediaPath = `midias/${empresaId}/${nomeArquivo}`;

        const resultado = await messageService.sendMediaMessage(
            empresaId,
            convId,
            bufferEnviar,
            mimeNormal,
            originalname,
            caption || null,
            senderName,
            mediaPath
        );

        if (resultado.windowClosed) {
            log.warn('save-anexo.janela_fechada', { convId, tipoMidia });
            return res.status(422).json(resultado);
        }
        if (resultado.error) {
            log.warn('save-anexo.resultado_erro', { convId, resultado });
            return res.status(400).json(resultado);
        }

        log('save-anexo.ok', {
            convId, wamid: resultado.wamid, tipoMidia, mimeNormal, mediaPath,
        });

        const msgObj = {
            wamid: resultado.wamid || null,
            direction: 'outbound',
            fromMe: true,
            tipo: tipoMidia,
            type: tipoMidia,
            texto: caption || null,
            body: caption || null,
            hasMedia: true,
            media: mediaPath,
            media_path: mediaPath,
            media_url: '/uploads/' + mediaPath,
            media_mime: mimeNormal,
            media_filename: originalname,
            senderName,
            ack: 1,
            status: 'sent',
            reply_to_wamid: null,
            timestamp_ms: Date.now(),
            data: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };

        emitToEmpresa(empresaId, 'nova-mensagem', {
            conversation_id: convId,
            message: msgObj,
        });

        return res.json({ success: true, message: msgObj });
    } catch (error) {
        log.err('save-anexo.excecao', { msg: error.message, metaCode: error.metaCode, stack: error.stack });
        return res.status(502).json({ error: error.message || 'Erro ao comunicar com a API do WhatsApp.' });
    }
});

// ============= FUNÇÕES DE MAPEAMENTO (Cloud API → shape do frontend) =============

/**
 * Mapeia status Cloud API para ACK numérico do wwebjs (retrocompatibilidade com o frontend).
 * @param {string} status
 * @returns {number}
 */
function mapearAckStatus(status) {
    // 'played' é enviado pela Meta quando o destinatário OUVE uma mensagem de voz.
    // Sem mapeá-lo, áudios ouvidos caíam no default 0 (relógio "pendente") para sempre.
    // Tratado como 'read' (ack 3) — entregue e visualizado.
    const mapa = { pending: 0, sent: 1, delivered: 2, read: 3, played: 3, failed: -1 };
    return mapa[status] !== undefined ? mapa[status] : 0;
}

/**
 * Parse seguro de coluna JSON — o driver `mysql` pode devolver objeto já parseado
 * ou string crua dependendo da versão. Retorna o fallback em qualquer erro.
 * @param {*} value
 * @param {*} fallback
 * @returns {*}
 */
function safeJson(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

/**
 * Mapeia objeto de mensagem do banco para o shape que o frontend espera.
 * Mantém retrocompatibilidade com os campos do wwebjs (tipo, texto, hasMedia, media, ack, data).
 * media_url: usa msg.media_url (já preenchida pelo webhook) ou deriva de media_path.
 * @param {Object} msg - linha da tabela Messages
 * @returns {Object}
 */
function mapearMsgCloud(msg) {
    const mediaUrl = msg.media_url || (msg.media_path ? '/uploads/' + msg.media_path : null);
    return {
        id: msg.id,
        wamid: msg.wamid,
        fromMe: msg.direction === 'outbound',
        direction: msg.direction,
        tipo: msg.type,
        type: msg.type,
        texto: msg.body,
        body: msg.body,
        hasMedia: !!(msg.media_path || msg.media_url),
        media: msg.media_path || msg.media_url || null,
        media_path: msg.media_path || null,
        media_url: mediaUrl,
        media_mime: msg.media_mime || null,
        media_filename: msg.media_filename || null,
        senderName: msg.sender_name || null,
        ack: mapearAckStatus(msg.status),
        status: msg.status,
        reaction: msg.reaction || null,
        reply_to_wamid: msg.reply_to_wamid || null,
        // Origem da mensagem: anúncio Click-to-WhatsApp / produto do catálogo
        referral: safeJson(msg.referral, null),
        referred_product: safeJson(msg.referred_product, null),
        // Cartão de contato compartilhado (vCard)
        contacts: safeJson(msg.contacts, null),
        // Localização compartilhada (type=location): { latitude, longitude, name?, address? }
        location: safeJson(msg.location, null),
        data: msg.timestamp_ms ? new Date(Number(msg.timestamp_ms)).toISOString() : msg.created_at,
        timestamp_ms: msg.timestamp_ms,
        created_at: msg.created_at,
    };
}

// ============= ROTAS DE CHATS =============

/**
 * GET /zap/allChats
 * Lista conversas da empresa com paginação e busca.
 * Query params: page, limit, busca (ou q como alias).
 * Retorna: { chats, total, page, limit }
 */
router.get('/allChats', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
        const busca = req.query.busca || req.query.q || '';

        const resultado = await conversationRepository.listConversations(empresaId, { page, limit, busca });

        // Vincula cliente cadastrado + estado de atendimento/bloqueio (consultas em lote)
        await contactService.enrichConversationsBulk(resultado.rows, empresaId);

        return res.json({
            chats: resultado.rows,
            total: resultado.total,
            page,
            limit,
        });
    } catch (error) {
        console.error('Erro ao listar chats:', error);
        return res.status(500).json({ error: 'Erro interno ao listar conversas.' });
    }
});

/**
 * GET /zap/getChat/:id
 * Busca mensagens de uma conversa com paginação.
 * Valida ownership pelo empresa_id do JWT antes de retornar dados.
 * Zera unread_count da conversa ao acessar.
 * Retorna: { conversation, messages, total, page, limit }
 */
router.get('/getChat/:id', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const conversationId = parseInt(req.params.id);

        if (!conversationId || conversationId <= 0) {
            return res.status(400).json({ error: 'ID da conversa inválido.' });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        // Cursor para "carregar mensagens mais antigas" (paginação imune a tempo real)
        const beforeTs = req.query.beforeTs;
        const beforeId = req.query.beforeId;

        // Valida ownership (cross-tenant protection)
        const conversation = await conversationRepository.getById(conversationId, empresaId);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        // Zera contador de não lidas
        await conversationRepository.markConversationRead(conversationId, empresaId);

        // Vincula cliente cadastrado + endereço + estado de atendimento/bloqueio à conversa
        await contactService.enrichConversation(conversation, empresaId);

        const resultado = await messageRepository.getMessages(conversationId, empresaId, { page, limit, beforeTs, beforeId });

        return res.json({
            conversation,
            messages: resultado.rows.map(mapearMsgCloud),
            total: resultado.total,
            page,
            limit,
        });
    } catch (error) {
        console.error('Erro ao buscar chat:', error);
        return res.status(500).json({ error: 'Erro interno ao buscar conversa.' });
    }
});

/**
 * POST /zap/start-conversation
 * Inicia uma nova conversa com um telefone via template (única forma de iniciar
 * contato fora da janela de 24h, conforme regra da Cloud API).
 * Cria/recupera a conversa pelo telefone e envia o template selecionado.
 * Body: { phone, templateName, languageCode, components? }
 * Retorna: { success: true, conversationId, conversation }
 */
router.post('/start-conversation', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const senderName = req.user.fullName || req.user.nome || req.user.name || 'Atendente';
        const { phone, templateName, languageCode, components = [] } = req.body;

        // Normaliza telefone: apenas dígitos; prefixa código do país (55) se ausente em número BR
        let digits = String(phone || '').replace(/\D/g, '');
        if (!digits || digits.length < 10) {
            return res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (ex: 41999998888).' });
        }
        if (!digits.startsWith('55') && digits.length <= 11) {
            digits = '55' + digits;
        }

        if (!templateName || !languageCode) {
            return res.status(400).json({ error: 'Selecione um template para iniciar a conversa.' });
        }
        if (!Array.isArray(components)) {
            return res.status(400).json({ error: 'components deve ser um array.' });
        }

        // Config (phone_number_id) da empresa
        const config = await configRepository.getByEmpresa(empresaId);
        if (!config || !config.ativo) {
            return res.status(400).json({ error: 'WhatsApp Cloud não configurado para esta empresa.' });
        }

        // Upsert da conversa — NÃO mexe em last_inbound_at (a janela de 24h só abre
        // quando o CLIENTE responde; iniciar por template não abre janela de texto livre).
        const conversationId = await conversationRepository.upsertConversation({
            empresa_id: empresaId,
            phone_number_id: config.phone_number_id,
            contact_wa_id: digits,
            contact_name: null,
            last_message_at: new Date(),
            last_message_preview: `[template: ${templateName}]`,
            last_inbound_at: null,
            unread_count: 0,
        });

        // Envia o template
        let resultado;
        try {
            resultado = await messageService.sendTemplateMessage(
                empresaId,
                conversationId,
                templateName,
                languageCode,
                components,
                senderName
            );
        } catch (errMeta) {
            return res.status(502).json({ error: errMeta.message || 'Erro ao comunicar com a API do WhatsApp.' });
        }

        if (resultado.error) {
            return res.status(400).json(resultado);
        }

        // Recupera a conversa criada + enriquecimento para o frontend abrir direto
        const conversation = await conversationRepository.getById(conversationId, empresaId);
        await contactService.enrichConversation(conversation, empresaId);

        const msgObj = {
            wamid: resultado.wamid || null,
            direction: 'outbound',
            fromMe: true,
            tipo: 'template',
            type: 'template',
            texto: `[template: ${templateName}]`,
            body: templateName,
            hasMedia: false,
            status: 'sent',
            ack: 1,
            senderName,
            timestamp_ms: Date.now(),
            data: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };

        emitToEmpresa(empresaId, 'nova-mensagem', {
            conversation_id: conversationId,
            message: msgObj,
        });

        return res.json({ success: true, conversationId, conversation });
    } catch (error) {
        console.error('Erro ao iniciar conversa:', error.message);
        return res.status(500).json({ error: 'Erro interno ao iniciar conversa.' });
    }
});

/**
 * GET /zap/window-status/:conversationId
 * Retorna status da janela de atendimento de 24h para uma conversa.
 * Retorna: { windowOpen, expiresAt, hoursRemaining }
 */
router.get('/window-status/:conversationId', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const conversationId = parseInt(req.params.conversationId);

        if (!conversationId || conversationId <= 0) {
            return res.status(400).json({ error: 'ID da conversa inválido.' });
        }

        const conversa = await conversationRepository.getById(conversationId, empresaId);
        if (!conversa) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        const windowOpen = messageService.isWindowOpen(conversa);
        let expiresAt = null;
        let hoursRemaining = null;

        if (conversa.last_inbound_at) {
            const expiry = new Date(new Date(conversa.last_inbound_at).getTime() + 24 * 3600 * 1000);
            expiresAt = expiry.toISOString();
            const horas = (expiry - new Date()) / 3600000;
            hoursRemaining = parseFloat(Math.max(0, horas).toFixed(1));
        }

        return res.json({ windowOpen, expiresAt, hoursRemaining });
    } catch (error) {
        console.error('Erro ao verificar status da janela:', error);
        return res.status(500).json({ error: 'Erro interno ao verificar janela de atendimento.' });
    }
});

/**
 * PUT /zap/contact-name/:conversationId
 * Define o nome de contato editado manualmente (precedência sobre o perfil Meta).
 * Body: { name } — vazio/null limpa o personalizado (volta ao nome do perfil).
 * Retorna: { success, contact_name_custom }
 */
router.put('/contact-name/:conversationId', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const conversationId = parseInt(req.params.conversationId);

        if (!conversationId || conversationId <= 0) {
            return res.status(400).json({ error: 'ID da conversa inválido.' });
        }

        const conversa = await conversationRepository.getById(conversationId, empresaId);
        if (!conversa) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        const nome = (req.body && req.body.name) || null;
        await conversationRepository.updateContactNameCustom(conversationId, empresaId, nome);

        const valor = nome && String(nome).trim() ? String(nome).trim().slice(0, 255) : null;
        return res.json({ success: true, contact_name_custom: valor });
    } catch (error) {
        console.error('Erro ao atualizar nome do contato:', error);
        return res.status(500).json({ error: 'Erro interno ao atualizar nome do contato.' });
    }
});

/**
 * POST /zap/mark-read/:conversationId
 * Zera unread_count da conversa (marca como lida no sistema) e, em best-effort,
 * envia recibo de leitura à Cloud API para a última mensagem inbound (tiques azuis).
 */
router.post('/mark-read/:conversationId', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const conversationId = parseInt(req.params.conversationId);
        if (!conversationId || conversationId <= 0) {
            return res.status(400).json({ error: 'ID da conversa inválido.' });
        }
        const conversa = await conversationRepository.getById(conversationId, empresaId);
        if (!conversa) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        const wamid = await messageRepository.getLastInboundWamid(conversationId, empresaId);
        if (wamid) {
            // markMessageRead envia recibo ao Meta E zera o unread_count.
            // Se a chamada ao Meta falhar, ao menos zera o contador localmente.
            try {
                await messageService.markMessageRead(empresaId, wamid, conversationId);
            } catch (e) {
                await conversationRepository.markConversationRead(conversationId, empresaId);
            }
        } else {
            await conversationRepository.markConversationRead(conversationId, empresaId);
        }
        return res.json({ success: true });
    } catch (error) {
        console.error('Erro ao marcar conversa como lida:', error.message);
        return res.status(500).json({ error: 'Erro interno ao marcar como lida.' });
    }
});

/**
 * PUT /zap/pin/:conversationId  Body: { pinned: boolean }
 * Fixa/desafixa a conversa no topo da lista (somente no sistema).
 */
router.put('/pin/:conversationId', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const conversationId = parseInt(req.params.conversationId);
        if (!conversationId || conversationId <= 0) {
            return res.status(400).json({ error: 'ID da conversa inválido.' });
        }
        const conversa = await conversationRepository.getById(conversationId, empresaId);
        if (!conversa) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }
        const pinned = !!(req.body && req.body.pinned);
        await conversationRepository.setPinned(conversationId, empresaId, pinned);
        return res.json({ success: true, pinned });
    } catch (error) {
        console.error('Erro ao fixar conversa:', error.message);
        return res.status(500).json({ error: 'Erro interno ao fixar conversa.' });
    }
});

/**
 * DELETE /zap/conversation/:id
 * Soft-delete da conversa (apenas no sistema — a Cloud API não apaga no WhatsApp).
 * Emite 'conversa-apagada' para remover a conversa das outras sessões abertas.
 */
router.delete('/conversation/:id', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const conversationId = parseInt(req.params.id);
        if (!conversationId || conversationId <= 0) {
            return res.status(400).json({ error: 'ID da conversa inválido.' });
        }
        const conversa = await conversationRepository.getById(conversationId, empresaId);
        if (!conversa) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }
        await conversationRepository.softDeleteConversation(conversationId, empresaId);
        emitToEmpresa(empresaId, 'conversa-apagada', { conversation_id: conversationId });
        return res.json({ success: true });
    } catch (error) {
        console.error('Erro ao apagar conversa:', error.message);
        return res.status(500).json({ error: 'Erro interno ao apagar conversa.' });
    }
});

/**
 * DELETE /zap/message/:id
 * Soft-delete de uma mensagem (apenas no sistema). Emite 'update-mensagem' com
 * { id, deleted: true } para remover a bolha nas sessões abertas.
 */
router.delete('/message/:id', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const msgId = parseInt(req.params.id);
        if (!msgId || msgId <= 0) {
            return res.status(400).json({ error: 'ID da mensagem inválido.' });
        }
        const msg = await messageRepository.getById(msgId, empresaId);
        if (!msg) {
            return res.status(404).json({ error: 'Mensagem não encontrada.' });
        }
        await messageRepository.softDeleteMessage(msgId, empresaId);
        emitToEmpresa(empresaId, 'update-mensagem', {
            id: msgId, conversation_id: msg.conversation_id, deleted: true,
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('Erro ao apagar mensagem:', error.message);
        return res.status(500).json({ error: 'Erro interno ao apagar mensagem.' });
    }
});

/**
 * POST /zap/forward
 * Encaminha uma mensagem existente (texto ou mídia) para outra conversa ou número.
 * Body: { messageId, toConversationId? , toPhone? } — informe um dos destinos.
 * Reaproveita o arquivo de mídia local (não re-baixa). Respeita a janela de 24h.
 */
router.post('/forward', async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        const senderName = req.user.fullName || req.user.nome || req.user.name || 'Atendente';
        const { messageId, toConversationId, toPhone } = req.body;

        const msgId = parseInt(messageId);
        if (!msgId) {
            return res.status(400).json({ error: 'messageId é obrigatório.' });
        }
        const origem = await messageRepository.getById(msgId, empresaId);
        if (!origem) {
            return res.status(404).json({ error: 'Mensagem de origem não encontrada.' });
        }

        // Resolve a conversa de destino: por id (conversa existente) ou por telefone (novo).
        let convId = parseInt(toConversationId) || 0;
        if (!convId && toPhone) {
            const config = await configRepository.getByEmpresa(empresaId);
            if (!config || !config.ativo) {
                return res.status(400).json({ error: 'WhatsApp Cloud não configurado para esta empresa.' });
            }
            let digits = String(toPhone).replace(/\D/g, '');
            if (!digits || digits.length < 10) {
                return res.status(400).json({ error: 'Telefone de destino inválido.' });
            }
            if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
            convId = await conversationRepository.upsertConversation({
                empresa_id: empresaId,
                phone_number_id: config.phone_number_id,
                contact_wa_id: digits,
                contact_name: null,
                last_message_at: new Date(),
                last_message_preview: null,
                last_inbound_at: null,
                unread_count: 0,
            });
        }
        if (!convId) {
            return res.status(400).json({ error: 'Informe a conversa ou o telefone de destino.' });
        }
        const destino = await conversationRepository.getById(convId, empresaId);
        if (!destino) {
            return res.status(404).json({ error: 'Conversa de destino não encontrada.' });
        }

        const temMidia = !!origem.media_path && origem.type !== 'text' && origem.type !== 'template';
        let resultado;
        let msgObj;

        if (temMidia) {
            const caminho = path.join(__dirname, '../uploads', origem.media_path);
            if (!fs.existsSync(caminho)) {
                return res.status(400).json({ error: 'Arquivo de mídia indisponível para encaminhar.' });
            }
            const buffer = await fs.promises.readFile(caminho);
            resultado = await messageService.sendMediaMessage(
                empresaId, convId, buffer, origem.media_mime,
                origem.media_filename || 'arquivo', null, senderName, origem.media_path
            );
            if (resultado.windowClosed) return res.status(422).json(resultado);
            if (resultado.error) return res.status(400).json(resultado);

            const tipoMidia = tipoMidiaPorMime(origem.media_mime);
            msgObj = {
                wamid: resultado.wamid || null,
                direction: 'outbound', fromMe: true,
                tipo: tipoMidia, type: tipoMidia,
                texto: null, body: null, hasMedia: true,
                media: origem.media_path,
                media_path: origem.media_path,
                media_url: '/uploads/' + origem.media_path,
                media_mime: origem.media_mime,
                media_filename: origem.media_filename,
                senderName, ack: 1, status: 'sent', reply_to_wamid: null,
                timestamp_ms: Date.now(),
                data: new Date().toISOString(),
                created_at: new Date().toISOString(),
            };
        } else {
            const texto = origem.body;
            if (!texto || !String(texto).trim()) {
                return res.status(400).json({ error: 'Mensagem sem conteúdo de texto para encaminhar.' });
            }
            resultado = await messageService.sendTextMessage(
                empresaId, convId, String(texto).trim(), null, senderName
            );
            if (resultado.windowClosed) return res.status(422).json(resultado);
            if (resultado.error) return res.status(400).json(resultado);

            msgObj = {
                wamid: resultado.wamid || null,
                direction: 'outbound', fromMe: true,
                tipo: 'text', type: 'text',
                texto: String(texto).trim(), body: String(texto).trim(),
                hasMedia: false, media: null, media_path: null,
                media_url: null, media_mime: null, media_filename: null,
                senderName, ack: 1, status: 'sent', reply_to_wamid: null,
                timestamp_ms: Date.now(),
                data: new Date().toISOString(),
                created_at: new Date().toISOString(),
            };
        }

        emitToEmpresa(empresaId, 'nova-mensagem', { conversation_id: convId, message: msgObj });
        return res.json({ success: true, conversationId: convId, message: msgObj });
    } catch (error) {
        console.error('Erro ao encaminhar mensagem:', error.message);
        return res.status(502).json({ error: error.message || 'Erro ao encaminhar mensagem.' });
    }
});

module.exports = router;
