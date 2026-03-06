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
async function getAllChats(clientId, limit = 5, page = 1, searchQuery = null, mapeado = true) {
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
                    contato.avatar = null;
                }
                chat.contact = contato;
            }
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
                    avatar: chat.contact.avatar
                } : null,
                ultimaMensagem: await mapearMsg(chat.lastMessage, false),
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
 * Remove tag de espera de atendimento (WhatsApp Business)
 * Esta função é um stub para compatibilidade com sistemas que usam WhatsApp Business API
 * @param {string} chatId - ID do chat
 * @returns {Promise<boolean>} True se removido com sucesso
 */
async function removeWaitingForAgentTag(chatId) {
    // Função stub - WhatsApp Business API não implementada
    console.log('⚠️ removeWaitingForAgentTag: Função não implementada para whatsapp-web.js');
    return false;
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

        // Mapear mensagens para formato simples
        const messagesMap = await Promise.all(
            mensagens.map(async mensagem => {
                return await mapearMsg(mensagem, false);
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
    removeWaitingForAgentTag,
    getChatMessages
};

