const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const uploadAnexo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (MIMETYPES_ACEITOS.has(file.mimetype)) {
            cb(null, true);
        } else {
            const err = new Error(`Tipo de arquivo não permitido: ${file.mimetype}`);
            err.code = 'MIMETYPE_INVALIDO';
            cb(err, false);
        }
    },
});

const dbQuery = require('../utils/dbHelper');

// Repositórios e serviços da Cloud API
const messageService = require('../whatsapp/messageService');
const conversationRepository = require('../whatsapp/repositories/conversationRepository');
const messageRepository = require('../whatsapp/repositories/messageRepository');
const { emitToEmpresa } = require('../socket');

console.log('Zap route carregado');

// Importa as funções da nova estrutura modular
const {
    initClient,
    disconnectClient,
    isClientConnected,
    getAllClients,
    createClient,
    deleteClient,
    sendZapMessage,
    sendZapMessageImage,
    getAllChats,
    getChatById,
    sendMessageChat,
    actionsChat,
    actionsMsg
} = require('../zap');

/**
 * Resolve o clientId do WhatsApp a partir do usuário autenticado (SaaS).
 * Convenção de ID: {tipo}_{empresa_id} (ex: atendimento_1, disparos_2)
 * @param {Object} req - Request com req.user.empresa_id
 * @param {string} [tipo] - Tipo do client (atendimento, disparos). Se null, usa query/body 'type' ou default 'atendimento'
 * @returns {string} clientId no formato {tipo}_{empresa_id}
 */
function getClientId(req, tipo = null) {
    const empresa_id = req.user?.empresa_id;
    if (!empresa_id) {
        throw new Error('Usuário não autenticado');
    }
    const type = tipo || req.query?.type || req.body?.type || 'atendimento';
    return `${type}_${empresa_id}`;
}

// ============= ROTAS DE GERENCIAMENTO DE CLIENTS =============

// Lista todos os clients
router.get('/clients/list', async (req, res) => {
    try {
        const empresa_id = req.user?.empresa_id || null;
        const clients = await getAllClients(empresa_id);
        res.status(200).json(clients);
    } catch (error) {
        console.error('Erro ao listar clients:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cria um novo client
router.post('/clients/create', async (req, res) => {
    try {
        const { clientId, name } = req.body;
        const empresa_id = req.user?.empresa_id || null;

        if (!clientId || !name) {
            return res.status(400).json({ error: 'clientId e name são obrigatórios' });
        }

        const result = await createClient(clientId, name, empresa_id);

        if (result.success) {
            res.status(200).json({ message: result.message });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Erro ao criar client:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove um client (valida que pertence à empresa do usuário)
router.delete('/clients/delete/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const empresa_id = req.user?.empresa_id;

        // Valida que o client pertence à empresa do usuário
        const check = await dbQuery('SELECT id FROM Clients WHERE id = ? AND empresa_id = ?', [clientId, empresa_id]);
        if (check.length === 0) {
            return res.status(403).json({ error: 'Client não pertence à sua empresa' });
        }

        const result = await deleteClient(clientId);

        if (result) {
            res.status(200).json({ message: 'Client removido com sucesso' });
        } else {
            res.status(400).json({ error: 'Erro ao remover client' });
        }
    } catch (error) {
        console.error('Erro ao deletar client:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= ROTAS DE CONEXÃO =============

// Conecta um client
router.get('/connect', async (req, res) => {
    console.log('Conectando WhatsApp...');

    try {
        const clientId = getClientId(req);

        const connected = await isClientConnected(clientId);
        if (connected) {
            return res.status(200).json({ message: 'Conectado', clientId });
        }

        const result = await initClient(clientId);

        if (result.success) {
            res.status(200).json({ message: 'Iniciado', clientId });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error) {
        console.error('Erro ao conectar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Desconecta um client
router.get('/disconnect', async (req, res) => {
    try {
        const clientId = getClientId(req);

        const result = await disconnectClient(clientId);

        if (result) {
            res.status(200).json({ message: 'Desconectado com sucesso', clientId });
        } else {
            res.status(400).json({ error: 'Erro ao desconectar' });
        }
    } catch (error) {
        console.error('Erro ao desconectar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verifica status de conexão
router.get('/check-conn', async (req, res) => {
    try {
        const clientId = getClientId(req);
        const empresa_id = req.user.empresa_id;

        const clientData = await dbQuery(
            'SELECT * FROM Clients WHERE id = ? AND empresa_id = ?',
            [clientId, empresa_id]
        );

        if (clientData.length === 0) {
            return res.status(200).json({ status: 'Desconectado', clientId });
        }

        const status = clientData[0].status === 'connected' ? 'Conectado' : 'Desconectado';

        res.status(200).json({
            status,
            clientId,
            data: clientData[0]
        });
    } catch (error) {
        console.error('Erro ao verificar conexão:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= ROTAS DE MENSAGENS =============

// Envia mensagem de texto
router.post('/send-message', async (req, res) => {
    try {
        const clientId = getClientId(req);
        let { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(500).json({ error: 'WhatsApp desconectado!' });
        }

        console.log('Enviando mensagem:', { clientId, number, message });

        await sendZapMessage(clientId, number, message);

        res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: error.message });
    }
});

// Envia mensagem com imagem
router.post('/send-image', async (req, res) => {
    try {
        const clientId = getClientId(req);
        let { number, message, imagePath } = req.body;

        if (!number || !imagePath) {
            return res.status(400).json({ error: 'Número e imagem são obrigatórios' });
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(500).json({ error: 'WhatsApp desconectado!' });
        }

        console.log('Enviando imagem:', { clientId, number, message, imagePath });

        await sendZapMessageImage(clientId, number, message, imagePath);

        res.status(200).json({ message: 'Mensagem com imagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar imagem:', error);
        res.status(500).json({ error: error.message });
    }
});

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

        // Salva buffer em disco antes de enviar (path local para exibição no chat)
        const ext = MIME_PARA_EXT[req.file.mimetype] || '.bin';
        const nomeArquivo = `${crypto.randomUUID()}${ext}`;
        const pastaEmpresa = path.join(__dirname, '../uploads/midias', String(empresaId));

        if (!fs.existsSync(pastaEmpresa)) {
            fs.mkdirSync(pastaEmpresa, { recursive: true });
        }

        const caminhoCompleto = path.join(pastaEmpresa, nomeArquivo);
        fs.writeFileSync(caminhoCompleto, req.file.buffer);

        // mediaPath relativo ao diretório uploads/ (servido como /uploads/midias/{id}/{arquivo})
        const mediaPath = `midias/${empresaId}/${nomeArquivo}`;

        const resultado = await messageService.sendMediaMessage(
            empresaId,
            convId,
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname,
            caption || null,
            senderName,
            mediaPath
        );

        if (resultado.windowClosed) {
            return res.status(422).json(resultado);
        }
        if (resultado.error) {
            return res.status(400).json(resultado);
        }

        const msgObj = {
            wamid: resultado.wamid || null,
            direction: 'outbound',
            fromMe: true,
            tipo: resultado.type || 'document',
            type: resultado.type || 'document',
            texto: caption || null,
            body: caption || null,
            hasMedia: true,
            media: mediaPath,
            media_path: mediaPath,
            media_url: '/uploads/' + mediaPath,
            media_mime: req.file.mimetype,
            media_filename: req.file.originalname,
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
        console.error('Erro ao enviar anexo:', error.message);
        return res.status(502).json({ error: error.message || 'Erro ao comunicar com a API do WhatsApp.' });
    }
});

// Edita mensagem
router.post('/editar-msg', async (req, res) => {
    try {
        const clientId = getClientId(req);
        const { msgId, texto } = req.body;

        if (!msgId || !texto) {
            return res.status(400).json({ error: 'ID da mensagem ou texto não fornecidos' });
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(500).json({ error: 'WhatsApp desconectado!' });
        }

        const editar = await actionsMsg(clientId, msgId, 'edit', { conteudo: texto });

        if (!editar) {
            return res.status(400).json({ error: 'Erro ao editar mensagem! Tente novamente' });
        }

        return res.status(200).json({ message: 'Mensagem editada com sucesso!' });
    } catch (error) {
        console.error('Erro ao editar mensagem:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= FUNÇÕES DE MAPEAMENTO (Cloud API → shape do frontend) =============

/**
 * Mapeia status Cloud API para ACK numérico do wwebjs (retrocompatibilidade com o frontend).
 * @param {string} status
 * @returns {number}
 */
function mapearAckStatus(status) {
    const mapa = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
    return mapa[status] !== undefined ? mapa[status] : 0;
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
        reply_to_wamid: msg.reply_to_wamid || null,
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

        // Valida ownership (cross-tenant protection)
        const conversation = await conversationRepository.getById(conversationId, empresaId);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        // Zera contador de não lidas
        await conversationRepository.markConversationRead(conversationId, empresaId);

        const resultado = await messageRepository.getMessages(conversationId, empresaId, { page, limit });

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

// Ações em chat
router.get('/actions-chat/:id', async (req, res) => {
    try {
        const clientId = getClientId(req);
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'ID do chat não fornecido' });
        }

        const action = req.query.action || null;

        if (!action) {
            return res.status(400).json({ error: 'Ação não fornecida' });
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(500).json({ error: 'WhatsApp desconectado!' });
        }

        const actions = await actionsChat(clientId, id, action);

        if (!actions) {
            return res.status(404).json({ error: 'Ação não encontrada' });
        }

        return res.status(200).json({ message: 'Ação realizada com sucesso!', actions });
    } catch (error) {
        console.error('Erro ao executar ação do chat:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ações em mensagem
router.get('/actions-msg/:id', async (req, res) => {
    try {
        const clientId = getClientId(req);
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'ID da mensagem não fornecido' });
        }

        const action = req.query.action || null;

        if (!action) {
            return res.status(400).json({ error: 'Ação não fornecida' });
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(500).json({ error: 'WhatsApp desconectado!' });
        }

        const actions = await actionsMsg(clientId, id, action);
        if (!actions) {
            return res.status(404).json({ error: 'Ação não encontrada' });
        }
        return res.status(200).json({ message: 'Ação realizada com sucesso!', actions });
    } catch (error) {
        console.error('Erro ao executar ação da mensagem:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
