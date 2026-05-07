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
                `SELECT id, chat_id, flow_id, phone, status, created_at, agent_status, agent_user_id, agent_started_at FROM FlowRuns
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
                        createdAt: run.created_at,
                        agent_status: run.agent_status || 'waiting',
                        agent_user_id: run.agent_user_id || null,
                        agent_started_at: run.agent_started_at || null
                    };
                }
            }
        } catch (e) {
            console.error('Erro ao buscar FlowRuns aguardando atendente:', e);
        }

        // Busca bloqueios de fluxo (CLIENTES + FlowBlockedPhones) para marcar na lista
        let blockedMap = {};
        try {
            // Bloqueios por chat_id (FlowBlockedPhones)
            const blockedPhones = await dbQuery(
                `SELECT chat_id, phone FROM FlowBlockedPhones ${empresa_id ? 'WHERE empresa_id = ?' : ''}`,
                empresa_id ? [empresa_id] : []
            );
            for (const bp of blockedPhones) {
                if (bp.chat_id) blockedMap[bp.chat_id] = true;
            }

            // Bloqueios por cliente (CLIENTES.flows_blocked)
            const blockedClientes = await dbQuery(
                `SELECT c.cli_celular, c.cli_celular2 FROM CLIENTES c
                 WHERE c.flows_blocked = 1 ${empresa_id ? 'AND c.empresa_id = ?' : ''}`,
                empresa_id ? [empresa_id] : []
            );
            // Criar mapa de últimos 8 dígitos dos telefones bloqueados
            let blockedPhoneSet = new Set();
            for (const c of blockedClientes) {
                if (c.cli_celular) blockedPhoneSet.add(c.cli_celular.replace(/\D/g, '').slice(-8));
                if (c.cli_celular2) blockedPhoneSet.add(c.cli_celular2.replace(/\D/g, '').slice(-8));
            }
            // Mapear para chat_ids baseado no número do contato
            for (const chat of chats) {
                if (chat.contact && chat.contact.number) {
                    const last8 = chat.contact.number.replace(/\D/g, '').slice(-8);
                    if (blockedPhoneSet.has(last8)) {
                        blockedMap[chat.id._serialized] = true;
                    }
                }
            }
        } catch (e) {
            console.error('Erro ao buscar bloqueios de fluxo:', e);
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
                phoneFlowsBlocked: blockedMap[chat.id._serialized] || false,
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
                `SELECT id, flow_id, phone, status, created_at, agent_status, agent_user_id, agent_started_at FROM FlowRuns
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
                    createdAt: run.created_at,
                    agent_status: run.agent_status || 'waiting',
                    agent_user_id: run.agent_user_id || null,
                    agent_started_at: run.agent_started_at || null
                };
            }
        } catch (e) {
            console.error('Erro ao buscar FlowRun aguardando atendente:', e);
        }

        // Verificar bloqueio por telefone (FlowBlockedPhones) - para contatos sem cadastro
        let phoneFlowsBlocked = false;
        try {
            const phoneBlockCheck = await dbQuery(
                `SELECT id FROM FlowBlockedPhones WHERE chat_id = ? OR RIGHT(REPLACE(phone, ' ', ''), 8) = ? LIMIT 1`,
                [chatId, numeroSearch]
            );
            phoneFlowsBlocked = phoneBlockCheck && phoneBlockCheck.length > 0;
        } catch (e) {
            console.error('Erro ao verificar FlowBlockedPhones:', e);
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
            phoneFlowsBlocked: phoneFlowsBlocked,
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
 * Busca uma label no WhatsApp Business por keywords (case-insensitive).
 * Nunca lanca - retorna null em erro ou se nao encontrar.
 *
 * @param {Object} client - Instancia wwebjs
 * @param {string[]} keywords - lista de palavras-chave (ordem = prioridade)
 * @returns {Promise<Object|null>}
 */
async function findLabelByKeywords(client, keywords) {
    try {
        if (!client || typeof client?.getLabels !== 'function') return null;
        const labels = await client.getLabels().catch(() => null);
        if (!labels || !Array.isArray(labels) || labels.length === 0) return null;

        for (const keyword of keywords) {
            const k = (keyword || '').toLowerCase();
            if (!k) continue;
            const found = labels.find(l => (l?.name || '').toLowerCase().includes(k));
            if (found) return found;
        }
        return null;
    } catch (error) {
        console.error('❌ Erro ao buscar labels do WhatsApp:', error?.message);
        return null;
    }
}

/**
 * Busca a label de "aguardando atendimento"
 */
async function findWaitingLabel(client) {
    return findLabelByKeywords(client, ['aguardando atendimento', 'aguardando']);
}

/**
 * Busca a label de "em atendimento"
 */
async function findInAttendanceLabel(client) {
    return findLabelByKeywords(client, ['em atendimento', 'atendimento']);
}

/**
 * Aplica labels ao chat - define o estado final preservando labels externas.
 * Recebe as labels "do sistema" (aguardando/em atendimento) e decide quais
 * devem estar presentes no chat. Labels que nao sao do sistema sao preservadas.
 *
 * @param {Object} client - wwebjs client
 * @param {string} chatId
 * @param {Array<Object>} systemLabels - [{ id, present: boolean }]
 * @returns {Promise<boolean>}
 */
async function applyChatLabels(client, chatId, systemLabels) {
    try {
        if (!client || !chatId) return false;

        const currentLabels = await client.getChatLabels(chatId).catch(() => []);
        const currentIds = (currentLabels || []).map(l => l?.id).filter(Boolean);

        const systemIds = systemLabels.map(s => s?.id).filter(Boolean);
        // Labels que nao sao do sistema - preservar sempre
        const externalIds = currentIds.filter(id => !systemIds.includes(id));

        const finalIds = [...externalIds];
        for (const s of systemLabels) {
            if (s?.present && s?.id && !finalIds.includes(s.id)) {
                finalIds.push(s.id);
            }
        }

        // Se estado final identico ao atual, nao chamar API
        const sameSet = finalIds.length === currentIds.length &&
            finalIds.every(id => currentIds.includes(id));
        if (sameSet) return true;

        await client.addOrRemoveLabels(finalIds, [chatId]);
        return true;
    } catch (error) {
        console.error('❌ Erro ao aplicar labels no chat:', error?.message);
        return false;
    }
}

/**
 * Adiciona tag "aguardando atendimento" e remove "em atendimento" (se houver).
 * Nunca lanca - sempre retorna boolean.
 */
async function addWaitingForAgentTag(clientId, chatId) {
    try {
        const client = getClientById(clientId);
        if (!client) {
            console.log('⚠️ addWaitingForAgentTag: Client não encontrado:', clientId);
            return false;
        }

        const waiting = await findWaitingLabel(client);
        const inAttendance = await findInAttendanceLabel(client);

        // Se nao existe label de aguardando, logar e sair (mas nao falhar)
        if (!waiting?.id) {
            console.log('⚠️ addWaitingForAgentTag: Label de "aguardando atendimento" nao existe no WhatsApp');
            return false;
        }

        // Evitar conflito: se mesma label foi resolvida para ambos papeis (ex: so existe "atendimento"),
        // priorizar comportamento de "aguardando" - nao tentar remover a mesma label.
        const sameLabel = inAttendance?.id && inAttendance.id === waiting.id;

        const result = await applyChatLabels(client, chatId, [
            { id: waiting.id, present: true },
            ...(sameLabel ? [] : [{ id: inAttendance?.id, present: false }])
        ]);

        if (result) {
            console.log(`✅ Label "${waiting.name}" aplicada ao chat ${chatId} (aguardando)`);
        }
        return result;
    } catch (error) {
        console.error('❌ Erro em addWaitingForAgentTag:', error?.message);
        return false;
    }
}

/**
 * Adiciona tag "em atendimento" e remove "aguardando atendimento".
 * Usado quando o usuario clica em "Iniciar Atendimento".
 */
async function addInAttendanceTag(clientId, chatId) {
    try {
        const client = getClientById(clientId);
        if (!client) {
            console.log('⚠️ addInAttendanceTag: Client não encontrado:', clientId);
            return false;
        }

        const waiting = await findWaitingLabel(client);
        const inAttendance = await findInAttendanceLabel(client);

        if (!inAttendance?.id) {
            console.log('⚠️ addInAttendanceTag: Label de "em atendimento" nao existe no WhatsApp');
            // Mesmo sem label de "em atendimento", remover a de aguardando
            if (waiting?.id) {
                await applyChatLabels(client, chatId, [{ id: waiting.id, present: false }]);
            }
            return false;
        }

        const sameLabel = waiting?.id && waiting.id === inAttendance.id;

        const result = await applyChatLabels(client, chatId, [
            { id: inAttendance.id, present: true },
            ...(sameLabel ? [] : [{ id: waiting?.id, present: false }])
        ]);

        if (result) {
            console.log(`✅ Label "${inAttendance.name}" aplicada ao chat ${chatId} (em atendimento)`);
        }
        return result;
    } catch (error) {
        console.error('❌ Erro em addInAttendanceTag:', error?.message);
        return false;
    }
}

/**
 * Remove AMBAS as labels (aguardando + em atendimento) do chat.
 * Usado em Finalizar Atendimento.
 */
async function removeAttendanceTags(clientId, chatId) {
    try {
        const client = getClientById(clientId);
        if (!client) {
            console.log('⚠️ removeAttendanceTags: Client não encontrado:', clientId);
            return false;
        }

        const waiting = await findWaitingLabel(client);
        const inAttendance = await findInAttendanceLabel(client);

        const systemLabels = [];
        if (waiting?.id) systemLabels.push({ id: waiting.id, present: false });
        if (inAttendance?.id && inAttendance.id !== waiting?.id) {
            systemLabels.push({ id: inAttendance.id, present: false });
        }

        if (systemLabels.length === 0) {
            console.log('ℹ️ removeAttendanceTags: Nenhuma label de atendimento encontrada no WhatsApp');
            return true;
        }

        const result = await applyChatLabels(client, chatId, systemLabels);
        if (result) {
            console.log(`✅ Labels de atendimento removidas do chat ${chatId}`);
        }
        return result;
    } catch (error) {
        console.error('❌ Erro em removeAttendanceTags:', error?.message);
        return false;
    }
}

/**
 * Alias compatibilidade - remove apenas a tag de "aguardando".
 * Mantido para nao quebrar chamadas antigas. Delega para removeAttendanceTags.
 */
async function removeWaitingForAgentTag(clientId, chatId) {
    return removeAttendanceTags(clientId, chatId);
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

/**
 * Popular datas de última mensagem para todos os clientes cadastrados
 * Itera pelos chats do WhatsApp, cruza com CLIENTES e atualiza as datas
 * @param {string} clientId - ID do client WhatsApp
 * @param {number} empresa_id - ID da empresa
 * @returns {Object} - Resultado { total, atualizados, erros }
 */
async function popularUltimaMsgClientes(clientId, empresa_id) {
    const client = getClientById(clientId);
    if (!client) throw new Error(`Client ${clientId} não encontrado`);

    const connected = await isClientConnected(clientId);
    if (!connected) throw new Error(`Client ${clientId} não está conectado`);

    console.log('🔄 Iniciando população de datas de última mensagem...');

    // Buscar todos os clientes com telefone
    const clientes = await dbQuery(
        `SELECT cli_Id, cli_celular, cli_celular2 FROM CLIENTES
         WHERE empresa_id = ? AND cli_celular IS NOT NULL AND cli_celular != ''`,
        [empresa_id]
    );

    console.log(`📋 ${clientes.length} clientes encontrados no banco`);

    // Buscar todos os chats do WhatsApp (sem paginar)
    const chatsAll = await client.getChats();
    const chats = chatsAll.filter(chat =>
        !chat.isGroup && (chat.id.server === 'c.us' || chat.id.server === 'lid')
    );

    console.log(`💬 ${chats.length} chats encontrados no WhatsApp`);

    // Criar mapa de phone (últimos 8 dígitos) → chat
    const chatMap = {};
    for (const chat of chats) {
        let numero = chat.id._serialized.replace('@c.us', '').replace('@lid', '');
        const last8 = numero.replace(/\D/g, '').slice(-8);
        if (last8.length === 8) {
            chatMap[last8] = chat;
        }
    }

    let atualizados = 0;
    let erros = 0;
    let semChat = 0;

    for (const cli of clientes) {
        try {
            const phoneClean = (cli.cli_celular || '').replace(/\D/g, '');
            const last8 = phoneClean.slice(-8);
            if (!last8 || last8.length < 8) continue;

            const chat = chatMap[last8];
            if (!chat) {
                semChat++;
                continue;
            }

            // Buscar últimas 10 mensagens desse chat
            const mensagens = await chat.fetchMessages({ limit: 10 });
            if (!mensagens || mensagens.length === 0) continue;

            let ultimaMsgData = null;
            let ultimaMsgClienteData = null;
            let ultimaMsgSistemaData = null;

            for (const msg of mensagens) {
                const msgDate = new Date(msg.timestamp * 1000);

                // Última mensagem geral (a mais recente)
                if (!ultimaMsgData || msgDate > ultimaMsgData) {
                    ultimaMsgData = msgDate;
                }

                if (msg.fromMe) {
                    if (!ultimaMsgSistemaData || msgDate > ultimaMsgSistemaData) {
                        ultimaMsgSistemaData = msgDate;
                    }
                } else {
                    if (!ultimaMsgClienteData || msgDate > ultimaMsgClienteData) {
                        ultimaMsgClienteData = msgDate;
                    }
                }
            }

            // Atualizar no banco
            await dbQuery(
                `UPDATE CLIENTES SET
                    cli_ultima_msg_data = COALESCE(?, cli_ultima_msg_data),
                    cli_ultima_msg_cliente_data = COALESCE(?, cli_ultima_msg_cliente_data),
                    cli_ultima_msg_sistema_data = COALESCE(?, cli_ultima_msg_sistema_data)
                 WHERE cli_Id = ?`,
                [ultimaMsgData, ultimaMsgClienteData, ultimaMsgSistemaData, cli.cli_Id]
            );

            atualizados++;

            if (atualizados % 50 === 0) {
                console.log(`⏳ Progresso: ${atualizados}/${clientes.length} atualizados...`);
            }
        } catch (err) {
            erros++;
        }
    }

    const resultado = {
        total: clientes.length,
        chatsWhatsApp: chats.length,
        atualizados,
        semChat,
        erros
    };

    console.log('✅ População concluída:', resultado);
    return resultado;
}

module.exports = {
    getAllChats,
    getChatById,
    actionsChat,
    getAllContacts,
    addWaitingForAgentTag,
    addInAttendanceTag,
    removeAttendanceTags,
    removeWaitingForAgentTag,
    getChatMessages,
    popularUltimaMsgClientes
};

