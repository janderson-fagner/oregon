const express = require('express');
const router = express.Router();
const multer = require("multer");
const fs = require('fs');
const path = require('path');

const caminhoBase = path.join(__dirname, `../uploads/midias/`);

if (!fs.existsSync(caminhoBase)) {
    fs.mkdirSync(caminhoBase, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            // Se não tem chatId, usar pasta 'flows' para uploads do flow builder
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

const dbQuery = require('../utils/dbHelper');

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

// Envia mensagem em chat específico
router.post('/send-message-chat', async (req, res) => {
    try {
        const clientId = getClientId(req);
        let { chatId, message, midiaPath = null, replyId = null } = req.body;

        if (!chatId || (!message && !midiaPath)) {
            return res.status(400).json({ error: 'ID do chat ou mensagem não fornecidos' });
        }

        if (midiaPath && !message) {
            message = '';
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(500).json({ error: 'WhatsApp desconectado!' });
        }

        const sendMessage = await sendMessageChat(clientId, chatId, message, replyId, midiaPath);

        if (!sendMessage) {
            return res.status(400).json({ error: 'Erro ao enviar mensagem! Tente novamente' });
        }

        return res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: error.message });
    }
});

// Salva anexo
router.post('/save-anexo', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        console.log('📎 Arquivo salvo:', req.file.path);
        
        // Retornar objeto com path (esperado pelo frontend)
        return res.status(200).json({ 
            path: req.file.path,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });
    } catch (error) {
        console.error('Erro ao salvar anexo:', error);
        res.status(500).json({ error: error.message });
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

// ============= ROTAS DE CHATS =============

// Lista todos os chats
router.get('/allChats', async (req, res) => {
    try {
        const clientId = getClientId(req);
        const {
            itemsPerPage = 12,
            page = 1,
            q = null,
            mapeado = true
        } = req.query;

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(200).json({ status: 'Desconectado', chats: [] });
        }

        const chats = await getAllChats(clientId, itemsPerPage, page, q, mapeado);

        return res.status(200).json(chats);
    } catch (error) {
        console.error('Erro ao obter todos os chats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtém chat específico
router.get('/getChat/:id', async (req, res) => {
    try {
        const clientId = getClientId(req);
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'ID do chat não fornecido' });
        }

        const { limit = 50, mapeado = true } = req.query;

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return res.status(200).json({ status: 'Desconectado' });
        }

        const empresa_id = req.user.empresa_id;
        const chat = await getChatById(clientId, id, mapeado, limit, empresa_id);

        if (!chat) {
            return res.status(404).json({ error: 'Chat não encontrado' });
        }

        return res.status(200).json(chat);
    } catch (error) {
        console.error('Erro ao obter chat:', error);
        res.status(500).json({ error: error.message });
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
