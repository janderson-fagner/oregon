/**
 * ⚡ FLOW TRIGGERS - Sistema de Triggers de Fluxos
 * 
 * Gerenciamento de triggers automáticos baseados em eventos do sistema
 * (agendamentos, negócios, etc)
 */

const moment = require('moment');
const dbQuery = require('../../utils/dbHelper');
const { empresaWhere } = require('../../utils/dbHelper');
const { flowLog } = require('../helpers/logHelper');

// Lazy loading para evitar dependências circulares
let startFlow, cleanNumber;

/**
 * Carregar flowEngine com lazy loading
 */
function getFlowEngine() {
    if (!startFlow) {
        const flowEngine = require('./flowEngine');
        startFlow = flowEngine.startFlow;
    }
    return { startFlow };
}

/**
 * Carregar utils com lazy loading
 */
function getUtils() {
    if (!cleanNumber) {
        const utils = require('../../zap/utils');
        cleanNumber = utils.cleanNumber;
    }
    return { cleanNumber };
}

/**
 * Limpar número de telefone
 */
function cleanPhoneNumber(phone) {
    const { cleanNumber: cn } = getUtils();
    return cn(phone);
}

/**
 * Disparar fluxos baseado em triggers do sistema (agendamentos)
 * @param {String} triggerType - Tipo do trigger
 * @param {Object} data - Dados do trigger
 * @returns {Promise<void>}
 */
async function triggerAgendamentoFlows(triggerType, data) {
    flowLog.trigger(triggerType, null);
    
    try {
        const empresa_id = data?.empresa_id || data?.agendamento?.empresa_id || data?.cliente?.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        // Buscar fluxos ativos com o trigger específico
        const flows = await dbQuery(
            `SELECT * FROM Flows WHERE trigger_type = ? AND status = "ativo" AND ${ew.sql}`,
            [triggerType, ...ew.params]
        );

        if (flows.length === 0) {
            flowLog.log('INFO', `Nenhum fluxo encontrado para trigger: ${triggerType}`);
            return;
        }

        flowLog.log('INFO', `Encontrados ${flows.length} fluxos para trigger ${triggerType}`);

        for (const flow of flows) {
            try {
                await executeFlowForTrigger(flow, triggerType, data);
            } catch (error) {
                flowLog.log('ERROR', `Erro ao executar fluxo ${flow.id}`, { error: error.message });
            }
        }
    } catch (error) {
        flowLog.log('ERROR', 'Erro ao disparar fluxos do sistema', { error: error.message });
    }
}

/**
 * Executar um fluxo específico baseado no trigger
 * @param {Object} flow - Fluxo a executar
 * @param {String} triggerType - Tipo do trigger
 * @param {Object} data - Dados do trigger
 * @returns {Promise<void>}
 */
async function executeFlowForTrigger(flow, triggerType, data) {
    flowLog.log('INFO', `Executando fluxo ${flow.id} (${flow.name}) para trigger ${triggerType}`);

    try {
        // Verificar se cliente está com fluxos bloqueados
        const cliente = data.cliente;
        if (cliente) {
            const clienteId = cliente.cli_Id || cliente.id;
            if (clienteId) {
                const ew = empresaWhere(flow.empresa_id || data?.empresa_id || null);
                const clienteDB = await dbQuery(
                    `SELECT flows_blocked FROM CLIENTES WHERE cli_Id = ? AND ${ew.sql}`,
                    [clienteId, ...ew.params]
                );
                if (clienteDB.length > 0 && clienteDB[0].flows_blocked === 1) {
                    flowLog.log('INFO', `Cliente ID ${clienteId} está com fluxos bloqueados. Ignorando trigger ${triggerType}.`);
                    return;
                }
            }
        }

        // Buscar o nó inicial do fluxo
        const startNodes = await dbQuery(
            'SELECT * FROM FlowNodes WHERE flow_id = ? AND type = "start"',
            [flow.id]
        );

        if (startNodes.length === 0) {
            flowLog.log('ERROR', `Nó inicial não encontrado para fluxo ${flow.id}`);
            return;
        }

        const startNode = startNodes[0];
        
        // Preparar contexto baseado no tipo de trigger
        let context = await prepareContextForTrigger(triggerType, data);
        
        if (!context) {
            flowLog.log('WARN', `Contexto não preparado para trigger ${triggerType}`);
            return;
        }
        context.empresa_id = context.empresa_id || flow.empresa_id || data?.empresa_id || null;

        // Garantir que o telefone do WhatsApp esteja sempre no cliente
        if (context.phone && context.cliente) {
            context.cliente.cli_celular = context.phone;
            context.cliente.telefone = context.phone;
            context.cliente.phone = context.phone;
        }

        // Verificar condições do trigger se existirem
        let triggerConditions = flow.trigger_conditions;
        
        if (typeof triggerConditions === 'string') {
            try {
                triggerConditions = JSON.parse(triggerConditions);
            } catch (error) {
                flowLog.log('ERROR', `Erro ao fazer parse das condições do fluxo ${flow.id}`, { error: error.message });
                triggerConditions = [];
            }
        }
        
        if (triggerConditions && triggerConditions.length > 0) {
            flowLog.log('DEBUG', `Verificando ${triggerConditions.length} condições para fluxo ${flow.id}`);
            const conditionsMet = await checkTriggerConditions(triggerConditions, context);
            if (!conditionsMet) {
                flowLog.log('INFO', `Condições não atendidas para fluxo ${flow.id}`);
                return;
            }
        }

        // Iniciar o fluxo
        const { startFlow: sf } = getFlowEngine();
        const runId = await sf({
            flowId: flow.id,
            startNodeId: startNode.id,
            phone: context.phone,
            cliente: context.cliente,
            agendamento: context.agendamento,
            chatId: context.chatId,
            context: context
        });

        flowLog.log('INFO', `Fluxo ${flow.id} iniciado com runId: ${runId}`);
        
    } catch (error) {
        flowLog.log('ERROR', `Erro ao executar fluxo ${flow.id}`, { error: error.message });
    }
}

/**
 * Preparar contexto baseado no tipo de trigger
 * @param {String} triggerType - Tipo do trigger
 * @param {Object} data - Dados do evento
 * @returns {Promise<Object|null>} - Contexto preparado ou null
 */
async function prepareContextForTrigger(triggerType, data) {
    switch (triggerType) {
        case 'novo_agendamento':
            return await prepareNovoAgendamentoContext(data);
        case 'status_agendamento':
            return await prepareStatusAgendamentoContext(data);
        case 'agendamento_proximo':
            return await prepareAgendamentoProximoContext(data);
        case 'agendamento_confirmado':
            return await prepareAgendamentoConfirmadoContext(data);
        case 'agendamento_cancelado':
            return await prepareAgendamentoCanceladoContext(data);
        case 'mensagem_whatsapp':
            return await prepareMensagemWhatsAppContext(data);
        default:
            return null;
    }
}

/**
 * Contexto para mensagem WhatsApp
 */
async function prepareMensagemWhatsAppContext(data) {
    const { phone, chatId, text, clientId, mediaPath, mediaType, cliente } = data;
    
    // Garantir que o telefone do WhatsApp esteja sempre no cliente
    let clienteWithPhone = cliente;
    if (!clienteWithPhone) {
        clienteWithPhone = {};
    }
    // Sempre garantir que o telefone do WhatsApp esteja no cliente
    clienteWithPhone.cli_celular = phone;
    clienteWithPhone.telefone = phone;
    clienteWithPhone.phone = phone;
    
    return {
        phone: cleanPhoneNumber(phone),
        chatId: chatId,
        clientId: clientId || 'default',
        cliente: clienteWithPhone,
        mensagem: {
            text: text || '',
            mediaPath: mediaPath,
            mediaType: mediaType,
            timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
        },
        triggerData: {
            triggerType: 'mensagem_whatsapp',
            phone: phone,
            chatId: chatId,
            text: text?.substring(0, 100) || '',
            hasMedia: !!mediaPath
        }
    };
}

/**
 * Contexto para novo agendamento
 */
async function prepareNovoAgendamentoContext(data) {
    const { agendamento, cliente } = data;
    
    if (!cliente) {
        return null;
    }

    // Garantir que o telefone do WhatsApp esteja sempre no cliente
    const phone = cleanPhoneNumber(cliente.telefone || cliente.cli_celular || cliente.phone || '');
    if (!phone) {
        return null;
    }

    // Sempre garantir que o telefone do WhatsApp esteja no cliente
    cliente.cli_celular = phone;
    cliente.telefone = phone;
    cliente.phone = phone;

    return {
        phone: phone,
        cliente: cliente,
        agendamento: agendamento,
        chatId: `agendamento_${agendamento.id}`,
        triggerData: {
            triggerType: 'novo_agendamento',
            agendamentoId: agendamento.id,
            data: agendamento.data,
            horaInicio: agendamento.hora_inicio
        }
    };
}

/**
 * Contexto para alteração de status do agendamento
 */
async function prepareStatusAgendamentoContext(data) {
    const { agendamento, cliente, statusAnterior, statusNovo } = data;
    
    if (!cliente) {
        return null;
    }

    // Garantir que o telefone do WhatsApp esteja sempre no cliente
    const phone = cleanPhoneNumber(cliente.telefone || cliente.cli_celular || cliente.phone || '');
    if (!phone) {
        return null;
    }

    // Sempre garantir que o telefone do WhatsApp esteja no cliente
    cliente.cli_celular = phone;
    cliente.telefone = phone;
    cliente.phone = phone;

    return {
        phone: phone,
        cliente: cliente,
        agendamento: agendamento,
        chatId: `status_agendamento_${agendamento.id}`,
        triggerData: {
            triggerType: 'status_agendamento',
            agendamentoId: agendamento.id,
            statusAnterior,
            statusNovo,
            data: agendamento.data
        }
    };
}

/**
 * Contexto para agendamento próximo (lembrete)
 */
async function prepareAgendamentoProximoContext(data) {
    const { agendamento, cliente } = data;
    
    if (!cliente) {
        return null;
    }

    // Garantir que o telefone do WhatsApp esteja sempre no cliente
    const phone = cleanPhoneNumber(cliente.telefone || cliente.cli_celular || cliente.phone || '');
    if (!phone) {
        return null;
    }

    // Sempre garantir que o telefone do WhatsApp esteja no cliente
    cliente.cli_celular = phone;
    cliente.telefone = phone;
    cliente.phone = phone;

    return {
        phone: phone,
        cliente: cliente,
        agendamento: agendamento,
        chatId: `proximo_${agendamento.id}`,
        triggerData: {
            triggerType: 'agendamento_proximo',
            agendamentoId: agendamento.id,
            data: agendamento.data,
            horaInicio: agendamento.hora_inicio,
            horasFaltando: data.horasFaltando || 24
        }
    };
}

/**
 * Contexto para agendamento confirmado
 */
async function prepareAgendamentoConfirmadoContext(data) {
    const { agendamento, cliente } = data;
    
    if (!cliente) {
        return null;
    }

    // Garantir que o telefone do WhatsApp esteja sempre no cliente
    const phone = cleanPhoneNumber(cliente.telefone || cliente.cli_celular || cliente.phone || '');
    if (!phone) {
        return null;
    }

    // Sempre garantir que o telefone do WhatsApp esteja no cliente
    cliente.cli_celular = phone;
    cliente.telefone = phone;
    cliente.phone = phone;

    return {
        phone: phone,
        cliente: cliente,
        agendamento: agendamento,
        chatId: `confirmado_${agendamento.id}`,
        triggerData: {
            triggerType: 'agendamento_confirmado',
            agendamentoId: agendamento.id,
            data: agendamento.data,
            horaInicio: agendamento.hora_inicio
        }
    };
}

/**
 * Contexto para agendamento cancelado
 */
async function prepareAgendamentoCanceladoContext(data) {
    const { agendamento, cliente, motivoCancelamento } = data;
    
    if (!cliente) {
        return null;
    }

    // Garantir que o telefone do WhatsApp esteja sempre no cliente
    const phone = cleanPhoneNumber(cliente.telefone || cliente.cli_celular || cliente.phone || '');
    if (!phone) {
        return null;
    }

    // Sempre garantir que o telefone do WhatsApp esteja no cliente
    cliente.cli_celular = phone;
    cliente.telefone = phone;
    cliente.phone = phone;

    return {
        phone: phone,
        cliente: cliente,
        agendamento: agendamento,
        chatId: `cancelado_${agendamento.id}`,
        triggerData: {
            triggerType: 'agendamento_cancelado',
            agendamentoId: agendamento.id,
            data: agendamento.data,
            motivoCancelamento: motivoCancelamento || 'Não informado'
        }
    };
}

/**
 * Verificar condições do trigger
 * @param {Array} conditions - Lista de condições
 * @param {Object} context - Contexto
 * @returns {Promise<Boolean>} - true se condições atendidas
 */
async function checkTriggerConditions(conditions, context) {
    try {
        for (const condition of conditions) {
            const conditionMet = await evalCondition(condition, context);
            if (!conditionMet && condition.logicalOperator !== 'or') {
                flowLog.log('INFO', `Condição ${
                    condition.field} não atendida para fluxo ${
                    context.flowId} valor é ${condition.value} e o campo é ${
                    JSON.stringify(condition)}`);
                return false;
            }
            if (conditionMet && condition.logicalOperator === 'or') {
                return true;
            }
        }
        return true;
    } catch (error) {
        flowLog.log('ERROR', 'Erro ao verificar condições do trigger', { error: error.message });
        return false;
    }
}

/**
 * Avaliar uma condição específica
 * @param {Object} condition - Condição
 * @param {Object} context - Contexto
 * @returns {Promise<Boolean>} - Resultado da avaliação
 */
async function evalCondition(condition, context) {
    const { field, operator, value } = condition;
    
    try {
        let fieldValue = getFieldValue(field, context);
        let conditionValue = value;

        console.log('condition', {
            field: field,
            fieldValue: fieldValue,
            conditionValue: conditionValue,
            operator: operator,
            condition: condition,
            context: context
        });
        
        // Converter valores baseado no tipo
        if (field?.includes('data')) {
            fieldValue = moment(fieldValue).format('YYYY-MM-DD');
            conditionValue = moment(conditionValue).format('YYYY-MM-DD');
        }
        
        let result = false;
        
        switch (operator) {
            case 'eq':
            case 'equals':
                result = fieldValue == conditionValue;
                break;
            case 'neq':
            case 'not_equals':
                result = fieldValue != conditionValue;
                break;
            case 'contains':
                result = String(fieldValue).toLowerCase().includes(String(conditionValue).toLowerCase());
                break;
            case 'not_contains':
                result = !String(fieldValue).toLowerCase().includes(String(conditionValue).toLowerCase());
                break;
            case 'gt':
            case 'greater':
                result = Number(fieldValue) > Number(conditionValue);
                break;
            case 'lt':
            case 'less':
                result = Number(fieldValue) < Number(conditionValue);
                break;
            case 'gte':
            case 'greater_equal':
                result = Number(fieldValue) >= Number(conditionValue);
                break;
            case 'lte':
            case 'less_equal':
                result = Number(fieldValue) <= Number(conditionValue);
                break;
            case 'empty':
                result = !fieldValue || fieldValue === '';
                break;
            case 'not_empty':
                result = fieldValue && fieldValue !== '';
                break;
            case 'regex':
                result = new RegExp(conditionValue).test(String(fieldValue));
                break;
            default:
                result = false;
        }
        
        return result;
        
    } catch (error) {
        flowLog.log('ERROR', 'Erro ao avaliar condição', { error: error.message });
        return false;
    }
}

/**
 * Obter valor de um campo do contexto
 * @param {String} field - Nome do campo
 * @param {Object} context - Contexto
 * @returns {*} - Valor do campo
 */
function getFieldValue(field, context) {
    const { cliente, pedido, triggerData } = context;
    
    switch (field) {
        // Campos do cliente
        case 'cliente_nome':
            return cliente?.cli_nome || cliente?.first_name || '';
        case 'cliente_email':
            return cliente?.cli_email || cliente?.email || '';
        case 'cliente_telefone':
            return cliente?.cli_celular || cliente?.phone || '';
        case 'cliente_genero':
            return cliente?.cli_genero || cliente?.genero || '';
            
        // Campos do pedido
        case 'pedido_numero':
            return pedido?.numero || '';
        case 'pedido_status':
            return pedido?.status || '';
            
        // Variáveis do sistema
        case 'data_atual':
            return moment().format('YYYY-MM-DD');
        case 'hora_atual':
            return moment().format('HH:mm');
            
        default:
            return '';
    }
}

/**
 * Disparar fluxos com trigger de mensagem WhatsApp
 * @param {Object} messageData - Dados da mensagem { phone, chatId, text, clientId, mediaPath, mediaType, cliente }
 * @param {Array} flows - Lista de fluxos para disparar (opcional, se não fornecido busca no banco)
 * @returns {Promise<void>}
 */
async function triggerMessageReceivedFlows(messageData, flows = null) {
    const { phone, chatId, text, clientId, mediaPath, mediaType, cliente } = messageData;
    const empresa_id = messageData?.empresa_id || cliente?.empresa_id || null;
    const ew = empresaWhere(empresa_id);
    
    flowLog.log('INFO', 'Disparando fluxos com trigger de mensagem WhatsApp', { phone, chatId });

    try {
        // Verificar se cliente existe e está bloqueado (flows_blocked)
        const cleanedPhone = cleanPhoneNumber(phone);
        const clienteDB = await dbQuery(`
            SELECT cli_Id, cli_nome, flows_blocked 
            FROM CLIENTES 
            WHERE (cli_celular LIKE ? OR cli_celular2 LIKE ?) AND ${ew.sql}
            LIMIT 1
        `, [`%${cleanedPhone}%`, `%${cleanedPhone}%`, ...ew.params]);

        if (clienteDB.length > 0 && clienteDB[0].flows_blocked === 1) {
            flowLog.log('INFO', `Cliente ${clienteDB[0].cli_nome} (ID: ${clienteDB[0].cli_Id}) está com fluxos bloqueados (flows_blocked). Ignorando trigger.`);
            return;
        }

        // Se não forneceu fluxos, buscar no banco
        if (!flows) {
            flows = await dbQuery(`
                SELECT * FROM Flows 
                WHERE trigger_type = 'mensagem_whatsapp' 
                AND status = 'ativo'
                AND ${ew.sql}
            `, [...ew.params]);
        }

        if (flows.length === 0) {
            flowLog.log('INFO', 'Nenhum fluxo encontrado para trigger de mensagem WhatsApp');
            return;
        }

        flowLog.log('INFO', `Encontrados ${flows.length} fluxos para trigger de mensagem WhatsApp`);

        // Garantir que o telefone do WhatsApp esteja sempre no cliente
        let clienteWithPhone = cliente || (clienteDB.length > 0 ? clienteDB[0] : {});
        if (!clienteWithPhone) {
            clienteWithPhone = {};
        }
        // Sempre garantir que o telefone do WhatsApp esteja no cliente
        clienteWithPhone.cli_celular = phone;
        clienteWithPhone.telefone = phone;
        clienteWithPhone.phone = phone;

        // Preparar contexto para mensagem recebida
        const context = {
            phone: cleanPhoneNumber(phone),
            chatId: chatId,
            clientId: clientId,
            empresa_id,
            cliente: clienteWithPhone,
            mensagem: {
                text: text || '',
                mediaPath: mediaPath,
                mediaType: mediaType,
                timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
            },
            triggerData: {
                triggerType: 'mensagem_whatsapp',
                phone: phone,
                chatId: chatId,
                text: text?.substring(0, 100) || '',
                hasMedia: !!mediaPath
            }
        };

        // Executar cada fluxo
        for (const flow of flows) {
            try {
                // Verificar condições do trigger se existirem
                let triggerConditions = flow.trigger_conditions;
                
                if (typeof triggerConditions === 'string') {
                    try {
                        triggerConditions = JSON.parse(triggerConditions);
                    } catch (error) {
                        flowLog.log('ERROR', `Erro ao fazer parse das condições do fluxo ${flow.id}`, { error: error.message });
                        triggerConditions = [];
                    }
                }
                
                if (triggerConditions && triggerConditions.length > 0) {
                    flowLog.log('DEBUG', `Verificando ${triggerConditions.length} condições para fluxo ${flow.id}`);
                    const conditionsMet = await checkTriggerConditions(triggerConditions, context);
                    if (!conditionsMet) {
                        flowLog.log('INFO', `Condições não atendidas para fluxo ${flow.id}`);
                        continue;
                    }
                }

                // Buscar nó inicial
                const startNodes = await dbQuery(
                    'SELECT * FROM FlowNodes WHERE flow_id = ? AND type = "start"',
                    [flow.id]
                );

                if (startNodes.length === 0) {
                    flowLog.log('ERROR', `Nó inicial não encontrado para fluxo ${flow.id}`);
                    continue;
                }

                const startNode = startNodes[0];

                // Iniciar fluxo
                const { startFlow: sf } = getFlowEngine();
                const runId = await sf({
                    flowId: flow.id,
                    startNodeId: startNode.id,
                    phone: context.phone,
                    cliente: context.cliente,
                    chatId: context.chatId,
                    clientId: clientId,
                    context: {
                        ...context,
                        empresa_id: flow.empresa_id || context.empresa_id || null
                    }
                });

                flowLog.log('INFO', `Fluxo ${flow.id} iniciado com runId: ${runId} para mensagem WhatsApp`);

            } catch (error) {
                flowLog.log('ERROR', `Erro ao executar fluxo ${flow.id} para mensagem WhatsApp`, { error: error.message });
            }
        }

    } catch (error) {
        flowLog.log('ERROR', 'Erro ao disparar fluxos de mensagem WhatsApp', { error: error.message });
    }
}

module.exports = {
    triggerAgendamentoFlows,
    triggerEcommerceFlows: triggerAgendamentoFlows, // Alias para compatibilidade
    triggerMessageReceivedFlows,
    executeFlowForTrigger,
    prepareContextForTrigger
};

