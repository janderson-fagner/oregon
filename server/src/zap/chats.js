/**
 * Gerenciamento de chats do WhatsApp
 * Funções para obter, filtrar e manipular chats
 */

const moment = require('moment');
const dbQuery = require('../utils/dbHelper');
const { getAgendamentos } = require('../utils/agendaUtils');
const { getClientById, isClientConnected } = require('./client');
const { mapearMsg } = require('./message');
const { cleanNumber, checkNameContato, usersJump } = require('./utils');

/**
 * Obtém todos os chats de um client
 * @param {string} clientId - ID do client
 * @param {number} limit - Limite de chats por página
 * @param {number} page - Página atual
 * @param {string} searchQuery - Busca por nome
 * @param {boolean} mapeado - Se deve retornar chats mapeados
 * @returns {Promise<Array>} Lista de chats
 */
async function getAllChats(clientId, limit = 5, page = 1, searchQuery = null, mapeado = true, empresa_id = null) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return [];
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.log(`Client ${clientId} não está conectado`);
            return [];
        }

        const offset = (page - 1) * limit;

        const chatsAll = await client.getChats();

        let chats = chatsAll.filter(chat => {
            if (chat.isGroup || (chat.id.server !== 'c.us' && chat.id.server !== 'lid')) {
                return false;
            }

            let numero = chat.id._serialized.replace('@c.us', '').replace('@lid', '');
            let numeroClean = cleanNumber(numero);

            let isUserJump = usersJump.includes(numeroClean);
            if (isUserJump) {
                return false;
            }

            let isValid = numeroClean.length >= 10 && numeroClean.length <= 15;
            return isValid;
        });

        if (!searchQuery || searchQuery == '') {
            chats = chats.slice(offset, offset + limit);
        } else {
            chats = chats.filter(chat => chat.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(offset, offset + limit);
        }

        if (mapeado == 'false') {
            return chats;
        }

        for (let chat of chats) {
            const contato = await chat.getContact();

            if (contato) {
                try {
                    contato.avatar = await contato.getProfilePicUrl();
                } catch (e) {
                    console.error('Erro ao obter avatar do contato:', e);
                    contato.avatar = null;
                    contato.avatarError = e;
                }
                chat.contact = contato;
            }
        }

        // Busca todos os FlowRuns aguardando atendente para marcar na lista
        let waitingRunsMap = {};
        try {
            const waitingRuns = await dbQuery(
                `SELECT id, chat_id, flow_id, phone, status, created_at FROM FlowRuns
                 WHERE waiting_for_response = 1 AND status = 'running'
                 ${empresa_id ? 'AND empresa_id = ?' : ''}`,
                empresa_id ? [empresa_id] : []
            );
            for (const run of waitingRuns) {
                if (run.chat_id) {
                    waitingRunsMap[run.chat_id] = {
                        runId: run.id,
                        flowId: run.flow_id,
                        phone: run.phone,
                        status: run.status,
                        createdAt: run.created_at
                    };
                }
            }
        } catch (e) {
            console.error('Erro ao buscar FlowRuns aguardando atendente:', e);
        }

        const mappedChats = chats.map(async chat => {
            let numero = chat.id._serialized.replace('@c.us', '').replace('@lid', '');

            let mapeado = {
                id: chat.id._serialized,
                pinned: chat.pinned,
                nome: chat.name,
                naoLida: chat.unreadCount,
                ultimaAcao: chat.timestamp ? moment.unix(chat.timestamp).format('DD/MM/YYYY HH:mm:ss') : null,
                contato: chat.contact ? {
                    id: chat.contact.id._serialized,
                    nome: checkNameContato(chat.contact),
                    numero: chat.contact.number,
                    avatar: chat.contact.avatar,
                    raw: chat.contact
                } : null,
                ultimaMensagem: await mapearMsg(chat.lastMessage, false),
                waitingForAgent: waitingRunsMap[chat.id._serialized] || null,
                raw: chat
            };

            return mapeado;
        });

        const resolvedChats = await Promise.all(mappedChats);

        return resolvedChats;
    } catch (error) {
        console.error('Erro ao obter os chats:', error);
        return [];
    }
}

/**
 * Obtém um chat específico pelo ID
 * @param {string} clientId - ID do client
 * @param {string} chatId - ID do chat
 * @param {boolean} mapeado - Se deve retornar chat mapeado
 * @param {number} limit - Limite de mensagens
 * @param {number|null} empresa_id - ID da empresa para filtrar (opcional)
 * @returns {Promise<Object|null>} Chat encontrado ou null
 */
async function getChatById(clientId, chatId, mapeado = true, limit = 50, empresa_id = null) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return null;
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.log(`Client ${clientId} não está conectado`);
            return null;
        }

        const chat = await client.getChatById(chatId);

        if (limit > 20) {
            let sync = await chat.syncHistory();
        }

        const contato = await chat.getContact();

        if (contato) {
            try {
                contato.avatar = await contato.getProfilePicUrl();
            } catch (e) {
                contato.avatar = null;
            }
            chat.contact = contato;
        }

        const mensagens = await chat.fetchMessages({ limit: parseInt(limit) });

        if (mapeado == 'false') {
            return chat;
        }

        const messagesMap = await Promise.all(
            mensagens.map(async mensagem => {
                return await mapearMsg(mensagem, true);
            })
        );

        // Remove nulos e ordena por timestamp
        const mensagensOrdenadas = messagesMap.filter(Boolean).sort((a, b) => {
            return moment(a.data, 'DD/MM/YYYY HH:mm:ss').unix() - moment(b.data, 'DD/MM/YYYY HH:mm:ss').unix();
        });

        const messagesComData = [];
        let ultimaData = null;

        for (let msg of mensagensOrdenadas) {
            const dataAtual = moment(msg.data, 'DD/MM/YYYY HH:mm:ss').format('DD/MM/YYYY');

            if (dataAtual !== ultimaData) {
                messagesComData.push({
                    tipo: 'data',
                    data: dataAtual
                });
                ultimaData = dataAtual;
            }

            messagesComData.push(msg);
        }

        let numeroSearch = cleanNumber(chat.contact.number);

        console.log('Número do contato:', numeroSearch);

        // Pegar os 8 últimos dígitos do número
        numeroSearch = numeroSearch.slice(-8);

        console.log('Número de busca:', numeroSearch);

        let sql = `
        SELECT DISTINCT c.*
        FROM CLIENTES c
        WHERE (RIGHT(REGEXP_REPLACE(COALESCE(c.cli_celular, ''), '[^0-9]', ''), 8) = ?
        OR RIGHT(REGEXP_REPLACE(COALESCE(c.cli_celular2, ''), '[^0-9]', ''), 8) = ?
        OR EXISTS (
                SELECT 1
                FROM JSON_TABLE(COALESCE(c.cli_contatos, '[]'),
                                '$[*]' COLUMNS(type VARCHAR(20) PATH '$.type',
                                            val  VARCHAR(64) PATH '$.value')) jt
                WHERE jt.type = 'phone'
                AND RIGHT(REGEXP_REPLACE(COALESCE(jt.val,''), '[^0-9]', ''), 8) = ?
        ))
        `;
        let sqlParams = [numeroSearch, numeroSearch, numeroSearch];

        if (empresa_id) {
            sql += ' AND c.empresa_id = ?';
            sqlParams.push(empresa_id);
        }
        sql += ' LIMIT 1';

        const clienteQuery = await dbQuery(sql, sqlParams);
        let cliente = null;

        if (clienteQuery && clienteQuery.length > 0) {
            cliente = clienteQuery[0];

            cliente.id = cliente.cli_Id;
            const agendQuery = empresa_id
                ? 'SELECT * FROM AGENDAMENTO WHERE cli_id = ? AND empresa_id = ?'
                : 'SELECT * FROM AGENDAMENTO WHERE cli_id = ?';
            const agendParams = empresa_id ? [cliente.cli_Id, empresa_id] : [cliente.cli_Id];
            cliente.agendamentos = await getAgendamentos(agendQuery, agendParams, empresa_id || null);

            const endQuery = empresa_id
                ? 'SELECT * FROM ENDERECO WHERE cli_id = ? AND empresa_id = ?'
                : 'SELECT * FROM ENDERECO WHERE cli_id = ?';
            const endParams = empresa_id ? [cliente.cli_Id, empresa_id] : [cliente.cli_Id];
            cliente.endereco = await dbQuery(endQuery, endParams);
            cliente.nome = cliente.cli_nome;
            cliente.email = cliente.cli_email;
            cliente.cpf = cliente.cli_cpf;
            cliente.personType = cliente.cli_personType;
            cliente.genero = cliente.cli_genero;
            cliente.contatos = cliente.cli_contatos ? JSON.parse(cliente.cli_contatos) : [];
            cliente.tags = cliente.cli_tags ? JSON.parse(cliente.cli_tags) : [];
        }

        // Busca FlowRun ativo aguardando atendente humano para este chat
        let waitingForAgent = null;
        try {
            const flowRunQuery = await dbQuery(
                `SELECT id, flow_id, phone, status, created_at FROM FlowRuns
                 WHERE chat_id = ? AND waiting_for_response = 1 AND status = 'running'
                 ORDER BY created_at DESC LIMIT 1`,
                [chatId]
            );
            if (flowRunQuery && flowRunQuery.length > 0) {
                const run = flowRunQuery[0];
                waitingForAgent = {
                    runId: run.id,
                    flowId: run.flow_id,
                    phone: run.phone,
                    status: run.status,
                    createdAt: run.created_at
                };
            }
        } catch (e) {
            console.error('Erro ao buscar FlowRun aguardando atendente:', e);
        }

        const mappedChat = {
            id: chat.id._serialized,
            pinned: chat.pinned,
            nome: chat.name,
            naoLida: chat.unreadCount,
            ultimaAcao: chat.timestamp ? moment.unix(chat.timestamp).format('DD/MM/YYYY HH:mm:ss') : null,
            contato: chat.contact ? {
                id: chat.contact.id._serialized,
                nome: checkNameContato(chat.contact),
                numero: chat.contact.number,
                avatar: chat.contact.avatar
            } : null,
            ultimaMensagem: await mapearMsg(chat.lastMessage),
            messagens: messagesComData,
            cliente: cliente,
            waitingForAgent: waitingForAgent,
            limit: limit,
            raw: chat
        };

        await chat.sendSeen();
        await chat.syncHistory();

        return mappedChat;
    } catch (error) {
        console.error('Erro ao obter o chat:', error);
        return null;
    }
}

/**
 * Executa ações em um chat
 * @param {string} clientId - ID do client
 * @param {string} chatId - ID do chat
 * @param {string} action - Ação a executar
 * @returns {Promise<boolean>} True se executado com sucesso
 */
async function actionsChat(clientId, chatId, action) {
    try {
        const client = getClientById(clientId);
        
        if (!client || !chatId || !action) {
            return false;
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return false;
        }

        const chat = await client.getChatById(chatId);

        if (!chat) {
            console.log('Chat não encontrado:', chatId);
            return false;
        }

        switch (action) {
            case 'markAsRead':
                await chat.sendSeen();
                console.log('Chat marcado como lido:', chatId);
                break;
            case 'markAsUnread':
                await chat.markUnread();
                console.log('Chat marcado como não lido:', chatId);
                break;
            case 'delete':
                await chat.delete();
                console.log('Chat excluído:', chatId);
                break;
            case 'unpin':
                await chat.unpin();
                console.log('Chat desfixado:', chatId);
                break;
            case 'pin':
                await chat.pin();
                console.log('Chat fixado:', chatId);
                break;
            default:
                console.log('Ação inválida:', action);
                return false;
        }

        return true;
    } catch (error) {
        console.error('Erro ao executar ação no chat:', error);
        return false;
    }
}

/**
 * Obtém todos os contatos
 * @param {string} clientId - ID do client
 * @returns {Promise<Array>} Lista de contatos
 */
async function getAllContacts(clientId) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return [];
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.log(`Client ${clientId} não está conectado`);
            return [];
        }

        const contacts = await client.getContacts();
        return contacts;
    } catch (error) {
        console.error('Erro ao obter os contatos:', error);
        return [];
    }
}

/**
 * Busca a label de "aguardando atendimento" no WhatsApp Business
 * Procura por labels cujo nome contenha "aguardando", "atendimento" (case-insensitive)
 * @param {Object} client - Instância do client wwebjs
 * @returns {Promise<Object|null>} Label encontrada ou null
 */
async function findWaitingLabel(client) {
    try {
        const labels = await client.getLabels();
        if (!labels || labels.length === 0) return null;

        const keywords = ['aguardando atendimento', 'aguardando', 'atendimento'];
        for (const keyword of keywords) {
            const found = labels.find(l => l.name.toLowerCase().includes(keyword));
            if (found) return found;
        }
        return null;
    } catch (error) {
        console.error('❌ Erro ao buscar labels do WhatsApp:', error.message);
        return null;
    }
}

/**
 * Adiciona tag de "aguardando atendimento" no chat do WhatsApp Business
 * @param {string} clientId - ID do client (ex: "atendimento_1")
 * @param {string} chatId - ID do chat WhatsApp
 * @returns {Promise<boolean>} True se adicionada com sucesso
 */
async function addWaitingForAgentTag(clientId, chatId) {
    try {
        const client = getClientById(clientId);
        if (!client) {
            console.log('⚠️ addWaitingForAgentTag: Client não encontrado:', clientId);
            return false;
        }

        const label = await findWaitingLabel(client);
        if (!label) {
            console.log('⚠️ addWaitingForAgentTag: Nenhuma label de "aguardando atendimento" encontrada no WhatsApp');
            return false;
        }

        // Buscar labels atuais do chat para preservar e adicionar a nova
        const currentLabels = await client.getChatLabels(chatId);
        const currentIds = currentLabels.map(l => l.id);

        // Se já tem a label, não precisa adicionar
        if (currentIds.includes(label.id)) {
            console.log('ℹ️ Chat já possui a label de aguardando atendimento');
            return true;
        }

        // addOrRemoveLabels define o estado final das labels do chat
        // Precisa incluir as labels atuais + a nova
        const finalLabelIds = [...currentIds, label.id];
        await client.addOrRemoveLabels(finalLabelIds, [chatId]);

        console.log(`✅ Label "${label.name}" (${label.id}) adicionada ao chat ${chatId}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao adicionar tag de aguardando atendimento:', error.message);
        return false;
    }
}

/**
 * Remove tag de "aguardando atendimento" do chat do WhatsApp Business
 * @param {string} clientId - ID do client (ex: "atendimento_1")
 * @param {string} chatId - ID do chat WhatsApp
 * @returns {Promise<boolean>} True se removida com sucesso
 */
async function removeWaitingForAgentTag(clientId, chatId) {
    try {
        const client = getClientById(clientId);
        if (!client) {
            console.log('⚠️ removeWaitingForAgentTag: Client não encontrado:', clientId);
            return false;
        }

        const label = await findWaitingLabel(client);
        if (!label) {
            console.log('⚠️ removeWaitingForAgentTag: Nenhuma label de "aguardando atendimento" encontrada no WhatsApp');
            return false;
        }

        // Buscar labels atuais do chat
        const currentLabels = await client.getChatLabels(chatId);
        const currentIds = currentLabels.map(l => l.id);

        // Se não tem a label, não precisa remover
        if (!currentIds.includes(label.id)) {
            console.log('ℹ️ Chat não possui a label de aguardando atendimento');
            return true;
        }

        // Remover a label mantendo as demais
        const finalLabelIds = currentIds.filter(id => id !== label.id);
        await client.addOrRemoveLabels(finalLabelIds, [chatId]);

        console.log(`✅ Label "${label.name}" (${label.id}) removida do chat ${chatId}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao remover tag de aguardando atendimento:', error.message);
        return false;
    }
}

/**
 * Obtém mensagens de um chat específico
 * @param {string} clientId - ID do client
 * @param {string} chatId - ID do chat
 * @param {number} limit - Limite de mensagens (padrão: 50)
 * @returns {Promise<Array>} Lista de mensagens formatadas
 */
async function getChatMessages(clientId, chatId, limit = 50) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return [];
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.log(`Client ${clientId} não está conectado`);
            return [];
        }

        const chat = await client.getChatById(chatId);
        
        if (!chat) {
            console.log(`Chat ${chatId} não encontrado`);
            return [];
        }

        // Sincronizar histórico se necessário
        if (limit > 20) {
            await chat.syncHistory();
        }

        // Buscar mensagens
        const mensagens = await chat.fetchMessages({ limit: parseInt(limit) });
        
        if (!mensagens || mensagens.length === 0) {
            return [];
        }

        // Mapear mensagens para formato simples (save=true para ter caminho de mídia)
        const messagesMap = await Promise.all(
            mensagens.map(async mensagem => {
                return await mapearMsg(mensagem, true);
            })
        );

        // Filtrar nulos e ordenar por timestamp (mais antigo primeiro)
        const mensagensOrdenadas = messagesMap
            .filter(Boolean)
            .sort((a, b) => {
                const timestampA = a.data ? moment(a.data, 'DD/MM/YYYY HH:mm:ss').unix() : 0;
                const timestampB = b.data ? moment(b.data, 'DD/MM/YYYY HH:mm:ss').unix() : 0;
                return timestampA - timestampB;
            });

        // Formatar para o formato esperado pelo Gemini (com suporte a mídias)
        return mensagensOrdenadas.map(msg => {
            const formatted = {
                message_id: msg.id,
                from_me: msg.fromMe ? 1 : 0,
                body: msg.texto || '',
                timestamp: msg.data || moment().format('YYYY-MM-DD HH:mm:ss'),
                type: msg.tipo || 'chat',
                text: msg.texto || '', // Compatibilidade
                role: msg.fromMe ? 'model' : 'user' // Para Gemini (model = assistente, user = cliente)
            };
            
            // Incluir informações de mídia se disponível
            if (msg.hasMedia && msg.media) {
                formatted.media = {
                    caminho: msg.media.caminho,
                    path: msg.media.caminho,
                    url: msg.media.url,
                    mime: msg.media.mime,
                    type: msg.media.type, // image, audio, video
                    filename: msg.media.filename
                };
                
                // Mapear tipo de mídia
                if (msg.media.mime) {
                    if (msg.media.mime.startsWith('image/')) {
                        formatted.image = msg.media.caminho;
                    } else if (msg.media.mime.startsWith('audio/')) {
                        formatted.audio = msg.media.caminho;
                    } else if (msg.media.mime.startsWith('video/')) {
                        formatted.video = msg.media.caminho;
                    }
                }
            }
            
            return formatted;
        });
        
    } catch (error) {
        console.error('Erro ao obter mensagens do chat:', error);
        return [];
    }
}

module.exports = {
    getAllChats,
    getChatById,
    actionsChat,
    getAllContacts,
    addWaitingForAgentTag,
    removeWaitingForAgentTag,
    getChatMessages
};

