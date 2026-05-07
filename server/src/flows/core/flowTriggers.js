/**
 * ⚡ FLOW TRIGGERS - Sistema de Triggers de Fluxos
 * 
 * Gerenciamento de triggers automáticos baseados em eventos do sistema
 * (agendamentos, negócios, etc)
 */

const moment = require('moment');
require('moment-timezone');
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
const TRIGGER_DATE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD', 'DD/MM/YYYY HH:mm:ss', 'DD/MM/YYYY HH:mm', 'DD/MM/YYYY', moment.ISO_8601];

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
            // ─── Operadores de data ───
            case 'is_today': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const today = moment().tz('America/Sao_Paulo').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(today, 'day');
                break;
            }
            case 'is_tomorrow': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(tomorrow, 'day');
                break;
            }
            case 'is_yesterday': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const yesterday = moment().tz('America/Sao_Paulo').subtract(1, 'day').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(yesterday, 'day');
                break;
            }
            case 'within_days': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowWd = moment().tz('America/Sao_Paulo').startOf('day');
                const endWd = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'days').endOf('day');
                result = fd.isValid() && fd.isBetween(nowWd, endWd, null, '[]');
                break;
            }
            case 'within_past_days': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowPd = moment().tz('America/Sao_Paulo').endOf('day');
                const startPd = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'days').startOf('day');
                result = fd.isValid() && fd.isBetween(startPd, nowPd, null, '[]');
                break;
            }
            case 'within_months': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowWm = moment().tz('America/Sao_Paulo').startOf('day');
                const endWm = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'months').endOf('day');
                result = fd.isValid() && fd.isBetween(nowWm, endWm, null, '[]');
                break;
            }
            case 'within_past_months': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowPm = moment().tz('America/Sao_Paulo').endOf('day');
                const startPm = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'months').startOf('day');
                result = fd.isValid() && fd.isBetween(startPm, nowPm, null, '[]');
                break;
            }
            case 'is_this_week': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const weekStart = moment().tz('America/Sao_Paulo').startOf('week');
                const weekEnd = moment().tz('America/Sao_Paulo').endOf('week');
                result = fd.isValid() && fd.isBetween(weekStart, weekEnd, null, '[]');
                break;
            }
            case 'is_last_week': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const lwStart = moment().tz('America/Sao_Paulo').subtract(1, 'week').startOf('week');
                const lwEnd = moment().tz('America/Sao_Paulo').subtract(1, 'week').endOf('week');
                result = fd.isValid() && fd.isBetween(lwStart, lwEnd, null, '[]');
                break;
            }
            case 'is_next_week': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nwStart = moment().tz('America/Sao_Paulo').add(1, 'week').startOf('week');
                const nwEnd = moment().tz('America/Sao_Paulo').add(1, 'week').endOf('week');
                result = fd.isValid() && fd.isBetween(nwStart, nwEnd, null, '[]');
                break;
            }
            case 'is_this_month': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const mStart = moment().tz('America/Sao_Paulo').startOf('month');
                const mEnd = moment().tz('America/Sao_Paulo').endOf('month');
                result = fd.isValid() && fd.isBetween(mStart, mEnd, null, '[]');
                break;
            }
            case 'is_last_month': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const lmStart = moment().tz('America/Sao_Paulo').subtract(1, 'month').startOf('month');
                const lmEnd = moment().tz('America/Sao_Paulo').subtract(1, 'month').endOf('month');
                result = fd.isValid() && fd.isBetween(lmStart, lmEnd, null, '[]');
                break;
            }
            case 'is_next_month': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nmStart = moment().tz('America/Sao_Paulo').add(1, 'month').startOf('month');
                const nmEnd = moment().tz('America/Sao_Paulo').add(1, 'month').endOf('month');
                result = fd.isValid() && fd.isBetween(nmStart, nmEnd, null, '[]');
                break;
            }
            case 'is_this_year': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const yStart = moment().tz('America/Sao_Paulo').startOf('year');
                const yEnd = moment().tz('America/Sao_Paulo').endOf('year');
                result = fd.isValid() && fd.isBetween(yStart, yEnd, null, '[]');
                break;
            }
            case 'is_last_year': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const lyStart = moment().tz('America/Sao_Paulo').subtract(1, 'year').startOf('year');
                const lyEnd = moment().tz('America/Sao_Paulo').subtract(1, 'year').endOf('year');
                result = fd.isValid() && fd.isBetween(lyStart, lyEnd, null, '[]');
                break;
            }
            case 'is_future_date': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowFut = moment().tz('America/Sao_Paulo').endOf('day');
                result = fd.isValid() && fd.isAfter(nowFut);
                break;
            }
            case 'is_past_date': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowPast = moment().tz('America/Sao_Paulo').startOf('day');
                result = fd.isValid() && fd.isBefore(nowPast);
                break;
            }
            case 'exactly_days_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetDay = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'days').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(targetDay, 'day');
                break;
            }
            case 'exactly_months_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetMonth = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'months').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(targetMonth, 'day');
                break;
            }
            case 'exactly_years_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetYear = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'years').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(targetYear, 'day');
                break;
            }
            case 'exactly_days_from_now': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetDay = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'days').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(targetDay, 'day');
                break;
            }
            case 'exactly_months_from_now': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetMonth = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'months').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(targetMonth, 'day');
                break;
            }
            case 'exactly_years_from_now': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetYear = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'years').startOf('day');
                result = fd.isValid() && fd.startOf('day').isSame(targetYear, 'day');
                break;
            }
            case 'date_before': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const target = moment(conditionValue, TRIGGER_DATE_FORMATS, true);
                result = fd.isValid() && target.isValid() && fd.startOf('day').isBefore(target.startOf('day'));
                break;
            }
            case 'date_after': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const target = moment(conditionValue, TRIGGER_DATE_FORMATS, true);
                result = fd.isValid() && target.isValid() && fd.startOf('day').isAfter(target.startOf('day'));
                break;
            }
            // ─── Operadores de horas ───
            case 'within_hours': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowWh = moment().tz('America/Sao_Paulo');
                const endWh = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'hours');
                result = fd.isValid() && fd.isBetween(nowWh, endWh, null, '[]');
                break;
            }
            case 'within_past_hours': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const nowPh = moment().tz('America/Sao_Paulo');
                const startPh = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'hours');
                result = fd.isValid() && fd.isBetween(startPh, nowPh, null, '[]');
                break;
            }
            case 'exactly_hours_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetH = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'hours');
                result = fd.isValid() && fd.startOf('hour').isSame(targetH.startOf('hour'), 'hour');
                break;
            }
            case 'exactly_hours_from_now': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                const targetH = moment().tz('America/Sao_Paulo').add(Number(conditionValue), 'hours');
                result = fd.isValid() && fd.startOf('hour').isSame(targetH.startOf('hour'), 'hour');
                break;
            }
            // ─── Operadores "a mais de" (more_than) ───
            case 'more_than_hours_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                if (!fd.isValid()) { result = false; break; } // Sem data = false
                const threshold = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'hours');
                result = fd.isBefore(threshold);
                break;
            }
            case 'more_than_days_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                if (!fd.isValid()) { result = false; break; }
                const threshold = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'days').startOf('day');
                result = fd.startOf('day').isBefore(threshold);
                break;
            }
            case 'more_than_months_ago': {
                const fd = moment(fieldValue, TRIGGER_DATE_FORMATS, true);
                if (!fd.isValid()) { result = false; break; }
                const threshold = moment().tz('America/Sao_Paulo').subtract(Number(conditionValue), 'months').startOf('day');
                result = fd.startOf('day').isBefore(threshold);
                break;
            }
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
    const { buildFlatContext } = require('../helpers/contextHelper');
    const flat = buildFlatContext(context);
    return flat[field] !== undefined ? String(flat[field]) : '';
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

        // Verificar bloqueio por telefone (contatos sem cadastro - FlowBlockedPhones)
        const last8Phone = cleanedPhone.slice(-8);
        const phoneBlockedTrigger = await dbQuery(
            `SELECT id FROM FlowBlockedPhones WHERE RIGHT(REPLACE(phone, ' ', ''), 8) = ? OR chat_id = ? LIMIT 1`,
            [last8Phone, chatId || '']
        );
        if (phoneBlockedTrigger && phoneBlockedTrigger.length > 0) {
            flowLog.log('INFO', `Telefone ${phone} está com fluxos bloqueados (FlowBlockedPhones). Ignorando trigger.`);
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

