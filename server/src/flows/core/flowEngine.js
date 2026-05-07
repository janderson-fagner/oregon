/**
 * 🎯 FLOW ENGINE - Motor Principal de Execução de Fluxos
 * 
 * Sistema refatorado e modular para execução de fluxos de automação
 */

const moment = require('moment');
require('moment-timezone');
const dbQuery = require('../../utils/dbHelper');

// Importar helpers
const { buildFlatContext, replaceVariables } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');
const { validateCompleteFlow } = require('../validators/flowValidator');
const AGENT_UNLOCK_KEY = process.env.AGENT_UNLOCK_KEY || '#SAIR';

const normalizeText = (t) => {
    if (!t || typeof t !== 'string') return '';
    // remover HTML e normalizar espaços/caso
    const noHtml = t.replace(/<[^>]*>/g, ' ');
    return noHtml.trim().toLowerCase();
};

// Importar actions
const { createAgendamento, updateAgendamento, getAgendamento } = require('../actions/agendamentoActions');
const { updateCliente, createOrUpdateCliente, getClienteByPhone, blockUnblockClientFlows } = require('../actions/clienteActions');
const { createNegocio, updateNegocio } = require('../actions/negocioActions');
const { sendWhatsAppMessage, sendEmail, forwardContact } = require('../actions/messageActions');
const { executeHttp } = require('../actions/httpActions');
const { executeWaitReply, executeWaitReplyConditional, executeWaitReplyOptions, executeDelay } = require('../actions/waitActions');

// Lazy loading para evitar dependências circulares
let formatContent, variaveisItens;
let processMessageWithInterruption;
let getSMTPTransporter;
let generateGeminiText; // Será substituído por GPT posteriormente

// Importar processador AI
const { processAIActions, processAIDecision, processAIOptions } = require('./aiProcessor');

// Importar debouncer de mensagens
const messageDebouncer = require('./messageDebouncer');

/**
 * Carregar utilitários com lazy loading
 */
function getUtils() {
    if (!formatContent || !variaveisItens) {
        const utils = require('../../utils/crmUtils');
        formatContent = utils.formatContent;
        variaveisItens = utils.variaveisItens;
    }
    return { formatContent, variaveisItens };
}

/**
 * Função para criar transporter SMTP dinâmico baseado nas configurações do banco
 */
async function getSMTPTransporterFunction(empresaId) {
    if (!getSMTPTransporter) {
        const nodemailer = require('nodemailer');

        getSMTPTransporter = async (empresaId) => {
            try {
                const smtpConfig = await dbQuery(
                    'SELECT value FROM Options WHERE type = ? AND empresa_id = ?',
                    ['credenciais_smtp', empresaId]
                );

                if (!smtpConfig || smtpConfig.length === 0) {
                    flowLog.log('WARN', 'Credenciais SMTP não configuradas');
                    return null;
                }

                const config = typeof smtpConfig[0].value === 'string'
                    ? JSON.parse(smtpConfig[0].value)
                    : smtpConfig[0].value;

                if (!config.host || !config.user || !config.pass) {
                    flowLog.log('WARN', 'Credenciais SMTP incompletas');
                    return null;
                }

                const port = config.port || 587;
                const secure = port === 465 ? true : false;

                const transportConfig = {
                    host: config.host,
                    port: port,
                    secure: secure,
                    auth: {
                        user: config.user,
                        pass: config.pass
                    }
                };

                if (port === 587) {
                    transportConfig.requireTLS = true;
                    transportConfig.tls = {
                        rejectUnauthorized: false
                    };
                }

                let fromField = config.from || config.user;
                if (config.fromName) {
                    fromField = `"${config.fromName}" <${config.from || config.user}>`;
                }

                return {
                    transporter: nodemailer.createTransport(transportConfig),
                    from: fromField
                };
            } catch (error) {
                flowLog.actionError('get_smtp_transporter', error);
                return null;
            }
        };
    }
    return getSMTPTransporter(empresaId);
}

/**
 * Parse seguro de JSON
 */
const parseJSON = (v) => {
    if (!v) return null;
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
};

/**
 * Buscar fluxo completo por ID (flow, nodes, edges)
 * @param {Number} flowId - ID do fluxo
 * @returns {Promise<Object>} - { flow, nodes, edges }
 */
async function getFlowById(flowId, empresaId) {
    flowLog.log('INFO', `Buscando fluxo ID: ${flowId}`);

    let flow;
    if (empresaId) {
        [flow] = await dbQuery('SELECT * FROM Flows WHERE id = ? AND empresa_id = ?', [flowId, empresaId]);
    } else {
        [flow] = await dbQuery('SELECT * FROM Flows WHERE id = ?', [flowId]);
    }

    if (!flow) {
        flowLog.log('ERROR', `Fluxo ${flowId} não encontrado`);
        return null;
    }

    const flowEmpresaId = flow.empresa_id;

    flowLog.log('INFO', `Fluxo encontrado: ${flow.name}`, { status: flow.status });

    flow.trigger_conditions = flow.trigger_conditions ? JSON.parse(flow.trigger_conditions) : [];

    const nodes = await dbQuery('SELECT * FROM FlowNodes WHERE flow_id = ? AND empresa_id = ? ORDER BY id ASC', [flowId, flowEmpresaId]);
    flowLog.log('DEBUG', `Nós carregados: ${nodes.length}`);

    const edges = await dbQuery('SELECT * FROM FlowEdges WHERE flow_id = ? AND empresa_id = ?', [flowId, flowEmpresaId]);
    flowLog.log('DEBUG', `Conexões carregadas: ${edges.length}`);

    return { flow, nodes, edges };
}

/**
 * Encontrar próximos nós a partir do nó atual
 * @param {Array} edges - Lista de conexões
 * @param {Number} currentNodeId - ID do nó atual
 * @returns {Array} - Lista de próximas conexões
 */
function findNextNodes(edges, currentNodeId) {
    const nextNodes = edges.filter(e => e.source_node_id === currentNodeId);
    flowLog.log('DEBUG', `Próximos nós a partir de ${currentNodeId}: ${nextNodes.length}`);
    return nextNodes;
}

/**
 * Avaliar uma única condição
 * @param {Object} cond - Condição a avaliar
 * @param {Object} ctx - Contexto flat
 * @returns {Boolean} - Resultado da avaliação
 */
// Formatos de data aceitos para parsing
const DATE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD', 'DD/MM/YYYY HH:mm:ss', 'DD/MM/YYYY HH:mm', 'DD/MM/YYYY', moment.ISO_8601];

function evalCondition(cond, ctx) {
    if (!cond) return true;

    const fieldValue = ctx[cond.field] || '';
    const compareValue = cond.value;

    flowLog.log('DEBUG', 'Avaliando condição', {
        field: cond.field,
        operator: cond.operator,
        fieldValue,
        compareValue
    });

    let result;
    switch (cond.operator) {
        case 'contains':
            result = (fieldValue || '').toString().includes((compareValue || '').toString());
            break;
        case 'not_contains':
            result = !(fieldValue || '').toString().includes((compareValue || '').toString());
            break;
        case 'eq':
        case 'equals':
            result = fieldValue == compareValue;
            break;
        case 'neq':
        case 'not_equals':
            result = fieldValue != compareValue;
            break;
        case 'gt':
        case 'greater':
            result = Number(fieldValue) > Number(compareValue);
            break;
        case 'lt':
        case 'less':
            result = Number(fieldValue) < Number(compareValue);
            break;
        case 'gte':
        case 'greater_equal':
            result = Number(fieldValue) >= Number(compareValue);
            break;
        case 'lte':
        case 'less_equal':
            result = Number(fieldValue) <= Number(compareValue);
            break;
        case 'empty':
            result = !fieldValue || fieldValue === '';
            break;
        case 'not_empty':
            result = fieldValue && fieldValue !== '';
            break;
        case 'regex':
            try {
                const regex = new RegExp(compareValue);
                result = regex.test(fieldValue);
            } catch (error) {
                flowLog.log('ERROR', 'Erro ao processar regex', { compareValue, error: error.message });
                result = false;
            }
            break;
        // ─── Operadores de data ───
        case 'is_today': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const today = moment().tz('America/Sao_Paulo').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(today, 'day');
            break;
        }
        case 'is_tomorrow': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(tomorrow, 'day');
            break;
        }
        case 'is_yesterday': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const yesterday = moment().tz('America/Sao_Paulo').subtract(1, 'day').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(yesterday, 'day');
            break;
        }
        case 'within_days': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowWd = moment().tz('America/Sao_Paulo').startOf('day');
            const endWd = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'days').endOf('day');
            result = fd.isValid() && fd.isBetween(nowWd, endWd, null, '[]');
            break;
        }
        case 'within_past_days': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowPd = moment().tz('America/Sao_Paulo').endOf('day');
            const startPd = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'days').startOf('day');
            result = fd.isValid() && fd.isBetween(startPd, nowPd, null, '[]');
            break;
        }
        case 'within_months': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowWm = moment().tz('America/Sao_Paulo').startOf('day');
            const endWm = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'months').endOf('day');
            result = fd.isValid() && fd.isBetween(nowWm, endWm, null, '[]');
            break;
        }
        case 'within_past_months': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowPm = moment().tz('America/Sao_Paulo').endOf('day');
            const startPm = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'months').startOf('day');
            result = fd.isValid() && fd.isBetween(startPm, nowPm, null, '[]');
            break;
        }
        case 'is_this_week': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const weekStart = moment().tz('America/Sao_Paulo').startOf('week');
            const weekEnd = moment().tz('America/Sao_Paulo').endOf('week');
            result = fd.isValid() && fd.isBetween(weekStart, weekEnd, null, '[]');
            break;
        }
        case 'is_last_week': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const lwStart = moment().tz('America/Sao_Paulo').subtract(1, 'week').startOf('week');
            const lwEnd = moment().tz('America/Sao_Paulo').subtract(1, 'week').endOf('week');
            result = fd.isValid() && fd.isBetween(lwStart, lwEnd, null, '[]');
            break;
        }
        case 'is_next_week': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nwStart = moment().tz('America/Sao_Paulo').add(1, 'week').startOf('week');
            const nwEnd = moment().tz('America/Sao_Paulo').add(1, 'week').endOf('week');
            result = fd.isValid() && fd.isBetween(nwStart, nwEnd, null, '[]');
            break;
        }
        case 'is_this_month': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const mStart = moment().tz('America/Sao_Paulo').startOf('month');
            const mEnd = moment().tz('America/Sao_Paulo').endOf('month');
            result = fd.isValid() && fd.isBetween(mStart, mEnd, null, '[]');
            break;
        }
        case 'is_last_month': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const lmStart = moment().tz('America/Sao_Paulo').subtract(1, 'month').startOf('month');
            const lmEnd = moment().tz('America/Sao_Paulo').subtract(1, 'month').endOf('month');
            result = fd.isValid() && fd.isBetween(lmStart, lmEnd, null, '[]');
            break;
        }
        case 'is_next_month': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nmStart = moment().tz('America/Sao_Paulo').add(1, 'month').startOf('month');
            const nmEnd = moment().tz('America/Sao_Paulo').add(1, 'month').endOf('month');
            result = fd.isValid() && fd.isBetween(nmStart, nmEnd, null, '[]');
            break;
        }
        case 'is_this_year': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const yStart = moment().tz('America/Sao_Paulo').startOf('year');
            const yEnd = moment().tz('America/Sao_Paulo').endOf('year');
            result = fd.isValid() && fd.isBetween(yStart, yEnd, null, '[]');
            break;
        }
        case 'is_last_year': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const lyStart = moment().tz('America/Sao_Paulo').subtract(1, 'year').startOf('year');
            const lyEnd = moment().tz('America/Sao_Paulo').subtract(1, 'year').endOf('year');
            result = fd.isValid() && fd.isBetween(lyStart, lyEnd, null, '[]');
            break;
        }
        case 'is_future_date': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowFut = moment().tz('America/Sao_Paulo').endOf('day');
            result = fd.isValid() && fd.isAfter(nowFut);
            break;
        }
        case 'is_past_date': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowPast = moment().tz('America/Sao_Paulo').startOf('day');
            result = fd.isValid() && fd.isBefore(nowPast);
            break;
        }
        case 'exactly_days_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetDay = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'days').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(targetDay, 'day');
            break;
        }
        case 'exactly_months_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetMonth = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'months').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(targetMonth, 'day');
            break;
        }
        case 'exactly_years_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetYear = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'years').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(targetYear, 'day');
            break;
        }
        case 'exactly_days_from_now': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetDay = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'days').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(targetDay, 'day');
            break;
        }
        case 'exactly_months_from_now': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetMonth = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'months').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(targetMonth, 'day');
            break;
        }
        case 'exactly_years_from_now': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetYear = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'years').startOf('day');
            result = fd.isValid() && fd.startOf('day').isSame(targetYear, 'day');
            break;
        }
        case 'date_before': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const target = moment(compareValue, DATE_FORMATS, true);
            result = fd.isValid() && target.isValid() && fd.startOf('day').isBefore(target.startOf('day'));
            break;
        }
        case 'date_after': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const target = moment(compareValue, DATE_FORMATS, true);
            result = fd.isValid() && target.isValid() && fd.startOf('day').isAfter(target.startOf('day'));
            break;
        }
        // ─── Operadores de horas ───
        case 'within_hours': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowWh = moment().tz('America/Sao_Paulo');
            const endWh = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'hours');
            result = fd.isValid() && fd.isBetween(nowWh, endWh, null, '[]');
            break;
        }
        case 'within_past_hours': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const nowPh = moment().tz('America/Sao_Paulo');
            const startPh = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'hours');
            result = fd.isValid() && fd.isBetween(startPh, nowPh, null, '[]');
            break;
        }
        case 'exactly_hours_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetH = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'hours');
            result = fd.isValid() && fd.startOf('hour').isSame(targetH.startOf('hour'), 'hour');
            break;
        }
        case 'exactly_hours_from_now': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const targetH = moment().tz('America/Sao_Paulo').add(Number(compareValue), 'hours');
            result = fd.isValid() && fd.startOf('hour').isSame(targetH.startOf('hour'), 'hour');
            break;
        }
        // ─── Operadores "a mais de" (more_than) ───
        case 'more_than_hours_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const threshold = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'hours');
            result = fd.isValid() && fd.isBefore(threshold);
            break;
        }
        case 'more_than_days_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const threshold = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'days').startOf('day');
            result = fd.isValid() && fd.startOf('day').isBefore(threshold);
            break;
        }
        case 'more_than_months_ago': {
            const fd = moment(fieldValue, DATE_FORMATS, true);
            const threshold = moment().tz('America/Sao_Paulo').subtract(Number(compareValue), 'months').startOf('day');
            result = fd.isValid() && fd.startOf('day').isBefore(threshold);
            break;
        }
        default:
            flowLog.log('WARN', `Operador desconhecido: ${cond.operator}`);
            result = true;
    }

    flowLog.log('DEBUG', `Resultado da condição: ${result}`);
    return result;
}

/**
 * Avaliar múltiplas condições com operadores lógicos
 * @param {Array} conditions - Lista de condições
 * @param {Object} ctx - Contexto flat
 * @returns {Boolean} - Resultado final
 */
function evalConditions(conditions, ctx) {
    if (!conditions || conditions.length === 0) {
        return true;
    }

    flowLog.log('DEBUG', `Avaliando ${conditions.length} condições`);

    let result = true;

    for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        const conditionResult = evalCondition(condition, ctx);

        if (i === 0) {
            result = conditionResult;
        } else {
            const prevCondition = conditions[i - 1];
            const operator = prevCondition.logicalOperator;

            if (operator === 'or') {
                result = result || conditionResult;
            } else {
                result = result && conditionResult;
            }
        }
    }

    flowLog.log('DEBUG', `Resultado final das condições: ${result}`);
    return result;
}

/**
 * Executar ação de um nó
 * @param {Object} node - Nó a executar
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da execução
 */
async function execAction(node, context) {
    flowLog.nodeExecution(node.id, node.type, node.label);

    const type = node.type;
    const config = parseJSON(node.config) || {};

    try {
        // Construir contexto flat para facilitar acesso
        context.flat = buildFlatContext(context);

        switch (type) {
            case 'start':
                flowLog.log('INFO', 'Nó inicial - sem ação');
                return { output: 'continue' };

            case 'send_whatsapp':
                flowLog.log('INFO', 'Enviando mensagem WhatsApp');
                const whatsappResult = await sendWhatsAppMessage(config, context);
                return { 
                    output: whatsappResult.success ? 'sent' : 'error',
                    add: whatsappResult
                };

            case 'send_email':
                flowLog.log('INFO', 'Enviando email');
                const emailResult = await sendEmail(config, context);
                return { 
                    output: emailResult.success ? 'sent' : 'error',
                    add: emailResult
                };

            case 'create_agendamento':
                flowLog.log('INFO', 'Criando agendamento');
                if (config.useIA === false) {
                    flowLog.log('INFO', 'Nó create_agendamento marcado como apenas IA - ignorando execução');
                    return { output: 'continue' };
                }
                const createAgendResult = await createAgendamento(config, context);
                if (createAgendResult.success && createAgendResult.agendamento_id) {
                    context.agendamento_id = createAgendResult.agendamento_id;
                }
                return { output: 'continue', add: createAgendResult };

            case 'update_agendamento':
                flowLog.log('INFO', 'Atualizando agendamento');
                if (config.useIA === false) {
                    flowLog.log('INFO', 'Nó update_agendamento marcado como apenas IA - ignorando execução');
                    return { output: 'continue' };
                }
                const updateAgendResult = await updateAgendamento(config, context);
                return { output: 'continue', add: updateAgendResult };

            case 'get_appointment':
                flowLog.log('INFO', 'Obtendo dados do agendamento');
                const getAgendResult = await getAgendamento(config, context);
                return { output: 'continue', add: getAgendResult };

            case 'update_cliente':
                flowLog.log('INFO', 'Atualizando cliente');
                const updateClienteResult = await updateCliente(config, context);
                return { output: 'continue', add: updateClienteResult };

            case 'create_negocio':
                flowLog.log('INFO', 'Criando negócio');
                const createNegResult = await createNegocio(config, context);
                if (createNegResult.success && createNegResult.negocio_id) {
                    context.negocio_id = createNegResult.negocio_id;
                }
                return { output: 'continue', add: createNegResult };

            case 'update_negocio':
                flowLog.log('INFO', 'Atualizando negócio');
                const updateNegResult = await updateNegocio(config, context);
                return { output: 'continue', add: updateNegResult };

            case 'block_flows':
                flowLog.log('INFO', 'Bloqueando/Desbloqueando cliente de fluxos');
                const blockResult = await blockUnblockClientFlows(config, context);
                return { output: 'continue', add: blockResult };

            case 'forward_contact':
                flowLog.log('INFO', 'Encaminhando contato');
                const forwardResult = await forwardContact(node, config, context);
                return { output: 'continue', add: forwardResult };

            case 'condition':
                flowLog.log('INFO', 'Avaliando condição');
                const conditions = config.conditions || [];
                const condResult = evalConditions(conditions, context.flat);
                flowLog.conditionEval(conditions, condResult);
                return { output: condResult ? 'true' : 'false' };

            case 'wait_reply':
                flowLog.log('INFO', 'Aguardando resposta do usuário');
                const waitReplyResult = await executeWaitReply(config, context);
                return waitReplyResult;

            case 'wait_reply_conditional':
                flowLog.log('INFO', 'Aguardando resposta com condições');
                const waitConditionalResult = await executeWaitReplyConditional(config, context);
                return waitConditionalResult;

            case 'wait_reply_options':
                flowLog.log('INFO', 'Aguardando seleção de opção do menu');
                const waitOptionsResult = await executeWaitReplyOptions(config, context);
                return waitOptionsResult;

            case 'wait_for_agent':
                flowLog.log('INFO', 'Aguardando atendente humano');
                // Enviar mensagem opcional antes de bloquear
                if (config.message) {
                    await sendWhatsAppMessage({ message: config.message }, context);
                }
                if (config.finishMessage) {
                    context.wait_for_agent_finish_message = config.finishMessage;
                }
                return { output: 'wait', waitType: 'agent', variableName: 'resposta_agente', wait_for_agent: true };

            case 'delay':
                flowLog.log('INFO', 'Executando delay');
                const delayResult = await executeDelay(config);
                return delayResult;

            case 'http':
                flowLog.log('INFO', 'Executando requisição HTTP');
                const httpResult = await executeHttp(config, context);
                return { output: 'continue', add: httpResult };

            case 'redirect_flow':
                flowLog.log('INFO', 'Redirecionando para outro fluxo');
                const targetFlowId = config.targetFlowId ? await replaceVariables(String(config.targetFlowId), context) : null;
                
                if (!targetFlowId) {
                    flowLog.log('ERROR', 'ID do fluxo de destino não fornecido');
                    return { output: 'continue' };
                }
                
                // Enviar mensagem se configurada
                if (config.message) {
                    await sendWhatsAppMessage({ message: config.message }, context);
                }
                
                // Iniciar o novo fluxo
                flowLog.log('INFO', `Redirecionando para fluxo ${targetFlowId}`);
                
                // Parar o fluxo atual
                await dbQuery('UPDATE FlowRuns SET status = ? WHERE id = ?', ['redirected', context.runId]);
                
                // Iniciar novo fluxo
                const { startFlow } = require('./flowEngine');
                await startFlow({
                    flowId: targetFlowId,
                    phone: context.phone,
                    chatId: context.chatId,
                    clientId: context.clientId,
                    cliente: context.cliente,
                    agendamento: context.agendamento,
                    context: context.flat || {},
                    empresa_id: context.empresa_id
                });
                
                return { output: 'stop' };

            // Nós com IA - Processamento completo com GPT
            case 'ai_actions':
                flowLog.log('INFO', 'Processando bloco AI Actions');
                return await processAIActions(node, context);
            
            case 'ai_decision':
                flowLog.log('INFO', 'Processando bloco AI Decision');
                return await processAIDecision(node, context);
            
            case 'ai_options':
                flowLog.log('INFO', 'Processando bloco AI Options');
                const optionsResult = await processAIOptions(node, context);
                // Para ai_options, o output deve ser usado para encontrar a edge correta
                return optionsResult;

            default:
                flowLog.log('WARN', `Tipo de nó não implementado: ${type}`);
                return { output: 'continue' };
        }
    } catch (error) {
        flowLog.actionError(type, error);
        return { output: 'error', error: error.message };
    }
}

/**
 * Iniciar execução de fluxo
 * @param {Object} params - Parâmetros de inicialização
 * @returns {Promise<Number>} - ID da execução (run)
 */
async function startFlow({ flowId, startNodeId, phone, cliente, agendamento, chatId, context = {}, whatsappContact = null, clientId = 'default', empresa_id = null }) {
    flowLog.start(flowId, 'Fluxo', null);

    try {
        // Buscar fluxo
        const flowData = await getFlowById(flowId, empresa_id);
        if (!flowData) {
            throw new Error(`Fluxo ${flowId} não encontrado`);
        }

        const { flow, nodes, edges } = flowData;

        // Validar fluxo
        const validation = validateCompleteFlow(flowData);
        if (!validation.valid) {
            flowLog.log('WARN', 'Fluxo com problemas de validação', { errors: validation.errors });
        }

        // Determinar nó inicial
        let initialNode = startNodeId ? nodes.find(n => n.id === startNodeId) : nodes.find(n => n.type === 'start');
        
        if (!initialNode) {
            throw new Error('Nó inicial não encontrado');
        }

        // Garantir que o telefone do WhatsApp esteja sempre no cliente
        let clienteWithPhone = cliente;
        if (phone) {
            if (!clienteWithPhone) {
                clienteWithPhone = {};
            }
            // Sempre garantir que o telefone do WhatsApp esteja no cliente
            clienteWithPhone.cli_celular = phone;
            clienteWithPhone.telefone = phone;
            clienteWithPhone.phone = phone;
        }

        // Preparar contexto
        const fullContext = {
            ...context,
            flowId,
            empresa_id: flow.empresa_id,
            phone,
            chatId,
            clientId,
            cliente: clienteWithPhone,
            agendamento,
            whatsappContact,
            started_at: moment().format('YYYY-MM-DD HH:mm:ss')
        };

        // Criar registro de execução
        const insertResult = await dbQuery(
            `INSERT INTO FlowRuns (flow_id, current_node_id, status, cliente_id, chat_id, phone, context_json, empresa_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [flowId, initialNode.id, 'running', cliente?.cli_Id || null, chatId, phone, JSON.stringify(fullContext), flow.empresa_id]
        );

        const runId = insertResult.insertId;
        fullContext.runId = runId;

        flowLog.log('INFO', `Execução iniciada: Run ID ${runId}`);

        // Executar primeiro nó
        await advance(runId);

        return runId;

    } catch (error) {
        flowLog.flowError(flowId, null, error);
        throw error;
    }
}

/**
 * Avançar para próximo nó na execução
 * @param {Number} runId - ID da execução
 * @returns {Promise<Boolean>} - true se avançou, false se finalizou
 */
async function advance(runId) {
    flowLog.log('INFO', `Avançando execução: Run ID ${runId}`);

    try {
        // Buscar execução
        const runs = await dbQuery('SELECT * FROM FlowRuns WHERE id = ?', [runId]);
        if (!runs || runs.length === 0) {
            throw new Error(`Run ${runId} não encontrado`);
        }

        const run = runs[0];
        const context = parseJSON(run.context_json) || {};
        const flowId = run.flow_id;

        // Buscar fluxo
        const flowData = await getFlowById(flowId, context.empresa_id || run.empresa_id);
        if (!flowData) {
            throw new Error(`Fluxo ${flowId} não encontrado`);
        }

        const { flow, nodes, edges } = flowData;

        // Verificar se o fluxo ainda está ativo antes de continuar
        if (flow.status !== 'ativo') {
            flowLog.log('INFO', `Run #${runId}: fluxo ${flowId} está ${flow.status} - cancelando execução`);
            await dbQuery(
                'UPDATE FlowRuns SET status = ?, waiting_for_response = 0, updated_at = NOW() WHERE id = ?',
                ['cancelled', runId]
            );
            return false;
        }

        // Buscar nó atual
        const currentNode = nodes.find(n => n.id === run.current_node_id);
        if (!currentNode) {
            flowLog.log('WARN', `Run #${runId} obsoleto - nó ${run.current_node_id} não encontrado no fluxo. Finalizando.`);
            await dbQuery(
                'UPDATE FlowRuns SET status = ?, waiting_for_response = 0, updated_at = NOW() WHERE id = ?',
                ['error', runId]
            );
            return false;
        }

        // Executar ação do nó atual
        const result = await execAction(currentNode, context);

        // Se alguma ação sinalizou atendimento humano
        if (result.wait_for_agent || (result.add && result.add.wait_for_agent) || context.wait_for_agent) {
            context.wait_for_agent = false;
            context.waiting_for_agent = true;

            const finishMsg = context.wait_for_agent_finish_message || null;
            const unlockKey = finishMsg ? normalizeText(finishMsg) : (AGENT_UNLOCK_KEY ? normalizeText(AGENT_UNLOCK_KEY) : null);

            const waitState = {
                waitType: 'agent',
                unlockKey: unlockKey
            };

            await dbQuery(
                'UPDATE FlowRuns SET waiting_for_response = 1, wait_state = ?, next_run_at = NULL, context_json = ?, updated_at = NOW() WHERE id = ?',
                [JSON.stringify(waitState), JSON.stringify(context), runId]
            );

            // Bloquear fluxos do cliente para evitar novos disparos enquanto aguarda atendente
            const clienteId = context.cliente?.cli_Id || context.cliente?.id;
            if (clienteId) {
                await dbQuery(
                    `UPDATE CLIENTES SET flows_blocked = 1, flows_blocked_at = NOW(), flows_blocked_reason = 'wait_for_agent' WHERE cli_Id = ?`,
                    [clienteId]
                );
                flowLog.log('INFO', `Cliente ${clienteId} bloqueado (wait_for_agent)`);
            }

            // Bloquear também por telefone (para contatos sem cadastro)
            const phoneForBlock = context.phone || run.phone;
            if (phoneForBlock) {
                const chatIdForBlock = context.chatId || run.chat_id;
                await dbQuery(
                    `INSERT IGNORE INTO FlowBlockedPhones (phone, chat_id, blocked_at, blocked_reason, empresa_id)
                     VALUES (?, ?, NOW(), 'wait_for_agent', ?)`,
                    [phoneForBlock, chatIdForBlock || '', run.empresa_id]
                ).catch(() => {});
            }

            flowLog.log('INFO', `Execução ${runId} aguardando atendente humano. Desbloqueio via mensagem configurada ou chave env.`);
            return false;
        }

        // Se deve aguardar, pausar execução
        if (result.output === 'wait') {
            // Preparar estado de espera
            const waitState = {
                waitType: result.waitType,
                currentAttempt: result.currentAttempt || 0,
                options: result.options || [],
                maxAttempts: result.maxAttempts || 3
            };
            
            // Se for wait_reply_options, enviar o menu
            if (result.waitType === 'options' && result.menuText) {
                const { sendWhatsAppMessage } = require('../actions/messageActions');
                await sendWhatsAppMessage({
                    message: result.menuText
                }, context);
            }
            
            // Configurar timeout se houver
            let nextRunAt = null;
            if (result.timeoutMs && result.timeoutMs > 0) {
                const timeoutDate = new Date(Date.now() + result.timeoutMs);
                nextRunAt = moment(timeoutDate).format('YYYY-MM-DD HH:mm:ss');
                flowLog.log('INFO', `Timeout configurado para: ${nextRunAt}`);
            }
            
            await dbQuery(
                'UPDATE FlowRuns SET waiting_for_response = 1, wait_state = ?, next_run_at = ?, context_json = ?, updated_at = NOW() WHERE id = ?',
                [JSON.stringify(waitState), nextRunAt, JSON.stringify(context), runId]
            );
            
            flowLog.waitingResponse(runId, currentNode.type);
            return false;
        }

        // Adicionar resultados ao contexto
        if (result.add) {
            Object.assign(context, result.add);
        }

        // Encontrar próximo nó
        const nextEdges = findNextNodes(edges, currentNode.id);

        if (nextEdges.length === 0) {
            // Fim do fluxo
            await dbQuery(
                'UPDATE FlowRuns SET status = ?, context_json = ?, updated_at = NOW() WHERE id = ?',
                ['completed', JSON.stringify(context), runId]
            );
            flowLog.flowComplete(flowId, runId, 0);
            return false;
        }

        // Selecionar próximo nó baseado em condições ou output
        let nextEdge;
        if (result.output === 'true' || result.output === 'false') {
            // Condição/Decisão: procurar edge com label correspondente
            // Suporta labels "true"/"false" E "SIM"/"NÃO"
            const isTrue = result.output === 'true';
            nextEdge = nextEdges.find(e => {
                const label = (e.label || '').toLowerCase().trim();
                if (isTrue) return label === 'true' || label === 'sim';
                return label === 'false' || label === 'não' || label === 'nao';
            });
            if (!nextEdge) nextEdge = nextEdges[0];
        } else if (result.output && result.output.startsWith('option_')) {
            // AI Options: procurar edge com label correspondente à opção
            const optionIndex = result.output.replace('option_', '');
            nextEdge = nextEdges.find(e => {
                const edgeLabel = e.label?.toLowerCase() || '';
                return edgeLabel.includes(optionIndex) || 
                       edgeLabel === `opção ${optionIndex}` ||
                       edgeLabel === `option ${optionIndex}`;
            });
            if (!nextEdge) {
                // Tentar encontrar por índice numérico
                const numIndex = parseInt(optionIndex);
                if (!isNaN(numIndex) && numIndex < nextEdges.length) {
                    nextEdge = nextEdges[numIndex];
                } else {
                    nextEdge = nextEdges[0];
                }
            }
        } else {
            // Pegar primeira edge disponível
            nextEdge = nextEdges[0];
        }

        const nextNodeId = nextEdge.target_node_id;

        // Atualizar execução
        await dbQuery(
            'UPDATE FlowRuns SET current_node_id = ?, context_json = ?, updated_at = NOW() WHERE id = ?',
            [nextNodeId, JSON.stringify(context), runId]
        );

        // Continuar execução recursivamente
        return await advance(runId);

    } catch (error) {
        flowLog.flowError(null, runId, error);
        await dbQuery(
            'UPDATE FlowRuns SET status = ?, updated_at = NOW() WHERE id = ?',
            ['error', runId]
        );
        throw error;
    }
}

/**
 * Processar mensagem recebida (função interna - chamada pelo debouncer)
 * @param {Object} params - { phone, chatId, text, clientId, mediaPath, mediaType }
 * @returns {Promise<void>}
 */
async function _processIncomingMessage({ phone, chatId, text, clientId = 'default', mediaPath = null, mediaType = null, empresa_id = null }) {
    flowLog.log('INFO', 'Processando mensagem recebida', { phone, chatId, text: text?.substring(0, 50) });

    try {
        // Verificar sistema de interrupção
        if (!processMessageWithInterruption) {
            const interruptionManager = require('../core/flowInterruptionManager');
            processMessageWithInterruption = interruptionManager.processMessageWithInterruption;
        }

        const interruptionResult = await processMessageWithInterruption({ phone, chatId, text, empresa_id });

        if (!interruptionResult.shouldContinue) {
            flowLog.log('INFO', 'Mensagem bloqueada por sistema de interrupção');
            return;
        }

        // Buscar execução aguardando resposta
        const phoneToSearch = phone.slice(-8);
        const runs = await dbQuery(`
            SELECT * FROM FlowRuns
            WHERE status = 'running'
            AND waiting_for_response = 1
            AND (phone LIKE ? OR chat_id = ?)
            AND empresa_id = ?
            ORDER BY id DESC
            LIMIT 1
        `, [`%${phoneToSearch}%`, chatId, empresa_id]);

        if (runs.length > 0) {
            // Processar resposta para execução existente
            const run = runs[0];
            const context = parseJSON(run.context_json) || {};

            // Buscar nó atual para determinar tipo de wait
            const currentNode = await dbQuery('SELECT * FROM FlowNodes WHERE id = ? AND empresa_id = ?', [run.current_node_id, run.empresa_id]);
            if (currentNode.length === 0) {
                // Run obsoleto: nó foi deletado (fluxo editado). Marcar como erro e continuar.
                flowLog.log('WARN', `Run #${run.id} obsoleto - nó ${run.current_node_id} deletado. Finalizando run e prosseguindo.`);
                await dbQuery(
                    'UPDATE FlowRuns SET status = ?, waiting_for_response = 0, updated_at = NOW() WHERE id = ?',
                    ['error', run.id]
                );
                // Não retornar - deixar cair no fluxo normal para disparar novos fluxos se necessário
            } else {

            const node = currentNode[0];
            const config = parseJSON(node.config) || {};

            flowLog.log('INFO', `Processando resposta para nó tipo: ${node.type}`);

            // Desbloqueio automático de atendimento humano
            if (run.wait_state) {
                try {
                    const waitState = parseJSON(run.wait_state) || {};
                    if (waitState.waitType === 'agent') {
                        const unlockKey = waitState.unlockKey || null;
                        const incoming = normalizeText(text || '');
                        if (unlockKey && incoming.includes(unlockKey)) {
                            context.waiting_for_agent = false;
                            context.wait_for_agent = false;
                            await dbQuery(
                                'UPDATE FlowRuns SET waiting_for_response = 0, wait_state = NULL, context_json = ?, updated_at = NOW() WHERE id = ?',
                                [JSON.stringify(context), run.id]
                            );

                            // Desbloquear fluxos do cliente
                            const clienteIdUnblock = context.cliente?.cli_Id || run.cliente_id;
                            if (clienteIdUnblock) {
                                await dbQuery(
                                    `UPDATE CLIENTES SET flows_blocked = 0, flows_blocked_at = NULL, flows_blocked_reason = NULL WHERE cli_Id = ?`,
                                    [clienteIdUnblock]
                                );
                            }
                            // Remover bloqueio por telefone
                            const phoneUnblock = (phone || run.phone || '').replace(/\D/g, '').slice(-8);
                            if (phoneUnblock) {
                                await dbQuery(
                                    `DELETE FROM FlowBlockedPhones WHERE RIGHT(REPLACE(phone, ' ', ''), 8) = ? OR chat_id = ?`,
                                    [phoneUnblock, chatId || run.chat_id || '']
                                ).catch(() => {});
                            }

                            // Remover tags de atendimento do WhatsApp
                            if (chatId || run.chat_id) {
                                try {
                                    const { removeAttendanceTags } = require('../../zap/chats');
                                    const cId = context.clientId || `atendimento_${empresa_id}`;
                                    await removeAttendanceTags(cId, chatId || run.chat_id).catch(() => {});
                                } catch (tagErr) {
                                    console.log('⚠️ Não foi possível remover tags do WhatsApp:', tagErr.message);
                                }
                            }

                            // Emitir evento socket
                            try {
                                const { emitChatStateUpdate } = require('../../utils/chatStateEmitter');
                                emitChatStateUpdate(empresa_id, {
                                    chatId: chatId || run.chat_id,
                                    phone: phone || run.phone,
                                    clienteId: clienteIdUnblock || null,
                                    runId: run.id,
                                    agent_status: null,
                                    agent_user_id: null,
                                    waiting_for_agent: false,
                                    flows_blocked: false,
                                    phone_blocked: false,
                                    reason: 'unlock_by_message'
                                });
                            } catch (_) {}

                            flowLog.log('INFO', `Desbloqueio por mensagem configurada no run ${run.id}`);
                            await advance(run.id);
                            return;
                        } else {
                            // Continua aguardando atendente; não avança fluxo
                            flowLog.log('INFO', 'Execução aguardando atendente; mensagem recebida não contém chave de desbloqueio');
                            return;
                        }
                    }
                } catch (_) {
                    // ignora parse
                }
            }

            // Processar baseado no tipo de wait
            if (node.type === 'wait_reply') {
                // Wait Reply - Capturar variáveis simples
                const { processWaitReplyResponse } = require('../actions/waitActions');
                const result = await processWaitReplyResponse(text, config, context);
                
                // Adicionar variáveis ao contexto
                Object.assign(context, result.variables);
                context.ultima_mensagem = text;
                
                // Atualizar e continuar
                await dbQuery(
                    'UPDATE FlowRuns SET waiting_for_response = 0, context_json = ?, updated_at = NOW() WHERE id = ?',
                    [JSON.stringify(context), run.id]
                );
                
                flowLog.log('INFO', `${result.variablesCaptured} variáveis capturadas`);
                await advance(run.id);
                return;
                
            } else if (node.type === 'wait_reply_conditional') {
                // Wait Reply Conditional - Capturar variáveis e avaliar condições
                const { processWaitReplyConditionalResponse } = require('../actions/waitActions');
                const result = await processWaitReplyConditionalResponse(text, config, context);
                
                // Adicionar variáveis ao contexto
                Object.assign(context, result.variables);
                context.ultima_mensagem = text;
                context.wait_conditional_result = result.conditionMet ? 'true' : 'false';
                
                // Atualizar e continuar
                await dbQuery(
                    'UPDATE FlowRuns SET waiting_for_response = 0, context_json = ?, updated_at = NOW() WHERE id = ?',
                    [JSON.stringify(context), run.id]
                );
                
                flowLog.log('INFO', `Condição: ${result.conditionMet ? 'VERDADEIRA' : 'FALSA'}`);
                
                // Buscar próxima edge baseada no resultado
                const edges = await dbQuery('SELECT * FROM FlowEdges WHERE source_node_id = ? AND empresa_id = ?', [node.id, context.empresa_id]);
                const nextEdge = edges.find(e => {
                    const label = (e.label || '').toLowerCase();
                    return result.conditionMet ? 
                        (label.includes('sim') || label.includes('true') || label.includes('verdadeiro')) :
                        (label.includes('não') || label.includes('nao') || label.includes('false') || label.includes('falso'));
                });
                
                if (nextEdge) {
                    await dbQuery(
                        'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                        [nextEdge.target_node_id, run.id]
                    );
                }
                
                await advance(run.id);
                return;
                
            } else if (node.type === 'wait_reply_options') {
                // Wait Reply Options - Processar menu de opções
                const { processOptionsResponse } = require('../actions/waitActions');
                const waitState = parseJSON(run.wait_state) || {};
                const options = config.options || [];
                
                const result = processOptionsResponse(text, options);
                
                if (result.valid) {
                    // Opção válida selecionada
                    context.selected_option = result.selectedIndex;
                    context.selected_option_label = result.option.label;
                    context.selected_option_value = result.selectedIndex + 1;
                    context.ultima_mensagem = text;
                    
                    // Atualizar e continuar
                    await dbQuery(
                        'UPDATE FlowRuns SET waiting_for_response = 0, wait_state = NULL, context_json = ?, updated_at = NOW() WHERE id = ?',
                        [JSON.stringify(context), run.id]
                    );
                    
                    flowLog.log('INFO', `Opção ${result.selectedIndex + 1} selecionada: ${result.option.label}`);
                    
                    // Buscar edge correspondente à opção
                    const edges = await dbQuery('SELECT * FROM FlowEdges WHERE source_node_id = ? AND empresa_id = ? ORDER BY id ASC', [node.id, context.empresa_id]);
                    let nextEdge = null;
                    
                    // Tentar encontrar edge específica para a opção
                    if (edges.length > result.selectedIndex) {
                        nextEdge = edges[result.selectedIndex];
                    } else if (edges.length > 0) {
                        nextEdge = edges[0];
                    }
                    
                    if (nextEdge) {
                        await dbQuery(
                            'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                            [nextEdge.target_node_id, run.id]
                        );
                    }
                    
                    await advance(run.id);
                    return;
                    
                } else {
                    // Opção inválida
                    const currentAttempt = (waitState.currentAttempt || 0) + 1;
                    const maxAttempts = config.maxAttempts || 3;
                    
                    if (currentAttempt >= maxAttempts) {
                        // Máximo de tentativas atingido - seguir para timeout
                        flowLog.log('WARN', 'Máximo de tentativas atingido em wait_reply_options');
                        
                        context.max_attempts_exceeded = true;
                        context.ultima_mensagem = text;
                        
                        await dbQuery(
                            'UPDATE FlowRuns SET waiting_for_response = 0, wait_state = NULL, context_json = ?, updated_at = NOW() WHERE id = ?',
                            [JSON.stringify(context), run.id]
                        );
                        
                        // Buscar edge de timeout/max_attempts
                        const edges = await dbQuery('SELECT * FROM FlowEdges WHERE source_node_id = ? AND empresa_id = ?', [node.id, context.empresa_id]);
                        const timeoutEdge = edges.find(e => {
                            const label = (e.label || '').toLowerCase();
                            return label.includes('timeout') || label.includes('max') || label.includes('limite');
                        });
                        
                        if (timeoutEdge) {
                            await dbQuery(
                                'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                                [timeoutEdge.target_node_id, run.id]
                            );
                        }
                        
                        await advance(run.id);
                        return;
                    } else {
                        // Enviar mensagem de opção inválida
                        const invalidMessage = config.invalidOptionMessage || '<p>Opção inválida. Por favor, escolha uma das opções acima.</p>';
                        const { sendWhatsAppMessage } = require('../actions/messageActions');
                        
                        // Remover tags HTML
                        const cleanMessage = invalidMessage.replace(/<[^>]*>/g, '');
                        
                        await sendWhatsAppMessage({
                            message: cleanMessage
                        }, context);
                        
                        // Atualizar contador de tentativas
                        waitState.currentAttempt = currentAttempt;
                        
                        await dbQuery(
                            'UPDATE FlowRuns SET wait_state = ?, updated_at = NOW() WHERE id = ?',
                            [JSON.stringify(waitState), run.id]
                        );
                        
                        flowLog.log('INFO', `Opção inválida - Tentativa ${currentAttempt}/${maxAttempts}`);
                        return;
                    }
                }
                
            } else {
                // Comportamento padrão para outros tipos de wait
                const variableName = config.variableName || 'resposta_usuario';
                context[variableName] = text;
                context.ultima_mensagem = text;

                await dbQuery(
                    'UPDATE FlowRuns SET waiting_for_response = 0, context_json = ?, updated_at = NOW() WHERE id = ?',
                    [JSON.stringify(context), run.id]
                );

                flowLog.log('INFO', `Resposta capturada na variável: ${variableName}`);
                await advance(run.id);
                return;
            }
        } // fim do else (nó encontrado)
        }

        // Verificar se há um Run recém-finalizado para este telefone (últimos 60s)
        // Se existir, continuar o mesmo fluxo em vez de disparar um novo (evita resposta duplicada)
        const recentRun = await dbQuery(`
            SELECT * FROM FlowRuns
            WHERE status IN ('completed', 'finished')
            AND (phone LIKE ? OR chat_id = ?)
            AND empresa_id = ?
            AND updated_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
            ORDER BY id DESC
            LIMIT 1
        `, [`%${phoneToSearch}%`, chatId, empresa_id]);

        if (recentRun.length > 0) {
            const run = recentRun[0];
            const context = parseJSON(run.context_json) || {};

            // Verificar se o fluxo tem nó AI Actions para continuar a conversa
            const aiNode = await dbQuery(`
                SELECT fn.* FROM FlowNodes fn
                WHERE fn.flow_id = ? AND fn.type = 'ai_actions' AND fn.empresa_id = ?
                LIMIT 1
            `, [run.flow_id, empresa_id]);

            if (aiNode.length > 0) {
                flowLog.log('INFO', `Continuando conversa no fluxo recém-finalizado #${run.id} (Run < 60s atrás)`);

                // Reativar o Run com o nó AI Actions
                await dbQuery(
                    'UPDATE FlowRuns SET status = ?, current_node_id = ?, waiting_for_response = 0, updated_at = NOW() WHERE id = ?',
                    ['running', aiNode[0].id, run.id]
                );

                // Atualizar contexto com nova mensagem
                context.ultima_mensagem = text;
                if (mediaPath) {
                    context.mediaPath = mediaPath;
                    context.mediaType = mediaType;
                }
                await dbQuery(
                    'UPDATE FlowRuns SET context_json = ? WHERE id = ?',
                    [JSON.stringify(context), run.id]
                );

                // Avançar com a nova mensagem
                await advance(run.id);
                return;
            }
        }

        // Se não há execução aguardando nem recente, verificar se há fluxos com trigger de mensagem WhatsApp
        flowLog.log('INFO', 'Nenhuma execução aguardando resposta, verificando triggers de mensagem WhatsApp');
        
        // Buscar fluxos com trigger de mensagem WhatsApp
        const flowsWithMessageTrigger = await dbQuery(`
            SELECT * FROM Flows
            WHERE trigger_type = 'mensagem_whatsapp'
            AND status = 'ativo'
            AND empresa_id = ?
        `, [empresa_id]);

        if (flowsWithMessageTrigger.length === 0) {
            flowLog.log('INFO', 'Nenhum fluxo com trigger de mensagem WhatsApp encontrado');
            return;
        }

        flowLog.log('INFO', `Encontrados ${flowsWithMessageTrigger.length} fluxos com trigger de mensagem WhatsApp`);

        // Buscar ou criar cliente
        let cliente = null;
        try {
            const { getClienteByPhone } = require('../actions/clienteActions');
            const flowEmpresaId = empresa_id || flowsWithMessageTrigger[0]?.empresa_id || null;
            cliente = await getClienteByPhone(phone, flowEmpresaId);

            flowLog.log('INFO', `Cliente encontrado: ${JSON.stringify(cliente)}`);
        } catch (error) {
            flowLog.log('WARN', 'Erro ao buscar cliente', { error: error.message });
        }

        // Garantir que o telefone do WhatsApp esteja sempre no cliente
        if (!cliente) {
            cliente = {};
        }
        // Sempre garantir que o telefone do WhatsApp esteja no cliente
        cliente.cli_celular = phone;
        cliente.telefone = phone;
        cliente.phone = phone;

        // Atualizar data da última mensagem do cliente (recebida do WhatsApp)
        if (cliente.cli_Id && empresa_id) {
            dbQuery(
                'UPDATE CLIENTES SET cli_ultima_msg_cliente_data = NOW(), cli_ultima_msg_data = NOW() WHERE cli_Id = ? AND empresa_id = ?',
                [cliente.cli_Id, empresa_id]
            ).catch(() => {});
            cliente.cli_ultima_msg_cliente_data = new Date();
            cliente.cli_ultima_msg_data = new Date();
        }

        // Disparar cada fluxo encontrado
        const { triggerMessageReceivedFlows } = require('../core/flowTriggers');
        await triggerMessageReceivedFlows({
            phone,
            chatId,
            text,
            clientId,
            mediaPath,
            mediaType,
            empresa_id,
            cliente
        }, flowsWithMessageTrigger);

    } catch (error) {
        flowLog.log('ERROR', 'Erro ao processar mensagem recebida', { error: error.message });
    }
}

/**
 * Verificar e processar timeouts de wait_reply
 * Executado periodicamente via cron
 * @returns {Promise<void>}
 */
async function checkWaitTimeouts() {
    try {
        // Buscar execuções aguardando resposta com timeout configurado
        const expiredRuns = await dbQuery(`
            SELECT * FROM FlowRuns 
            WHERE status = 'running' 
            AND waiting_for_response = 1
            AND next_run_at IS NOT NULL
            AND next_run_at <= NOW()
            LIMIT 50
        `);

        if (expiredRuns.length === 0) {
            return;
        }

        flowLog.log('INFO', `Processando ${expiredRuns.length} timeout(s) de wait_reply`);

        for (const run of expiredRuns) {
            try {
                flowLog.log('INFO', `Processando timeout para Run ID ${run.id}`);
                
                const context = parseJSON(run.context_json) || {};
                context.timeout_occurred = true;
                context.timeout_at = moment().format('YYYY-MM-DD HH:mm:ss');

                // Buscar nó atual
                const currentNode = await dbQuery('SELECT * FROM FlowNodes WHERE id = ? AND empresa_id = ?', [run.current_node_id, run.empresa_id]);
                if (currentNode.length === 0) {
                    flowLog.log('WARN', `Run #${run.id} obsoleto - nó ${run.current_node_id} não encontrado para timeout. Finalizando.`);
                    await dbQuery(
                        'UPDATE FlowRuns SET status = ?, waiting_for_response = 0, updated_at = NOW() WHERE id = ?',
                        ['error', run.id]
                    );
                    continue;
                }

                const node = currentNode[0];
                const edges = await dbQuery('SELECT * FROM FlowEdges WHERE source_node_id = ? AND empresa_id = ? ORDER BY id ASC', [node.id, run.empresa_id]);

                // Procurar edge de timeout (deve ter label explícita)
                let timeoutEdge = edges.find(e => {
                    const label = (e.label || '').toLowerCase();
                    return label.includes('timeout') || label.includes('expirado') || label.includes('sem resposta');
                });

                // Se não encontrar edge de timeout explícita, NÃO usar fallback
                // O fluxo deve ser finalizado se não há caminho de timeout configurado

                // Atualizar status
                await dbQuery(
                    'UPDATE FlowRuns SET waiting_for_response = 0, wait_state = NULL, next_run_at = NULL, context_json = ?, updated_at = NOW() WHERE id = ?',
                    [JSON.stringify(context), run.id]
                );

                // Se encontrou edge, mover para próximo nó
                if (timeoutEdge) {
                    await dbQuery(
                        'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                        [timeoutEdge.target_node_id, run.id]
                    );
                    
                    flowLog.log('INFO', `Timeout processado - movendo para nó ${timeoutEdge.target_node_id}`);
                    
                    // Continuar execução
                    await advance(run.id);
                } else {
                    // Sem edge de timeout, finalizar fluxo
                    await dbQuery(
                        'UPDATE FlowRuns SET status = ? WHERE id = ?',
                        ['timeout', run.id]
                    );
                    
                    flowLog.log('INFO', `Timeout processado - fluxo finalizado (sem edge de timeout)`);
                }
                
            } catch (error) {
                flowLog.log('ERROR', `Erro ao processar timeout do Run ${run.id}:`, error);
            }
        }
    } catch (error) {
        flowLog.log('ERROR', 'Erro ao verificar timeouts de wait_reply:', error);
    }
}

// Registrar processador no debouncer
messageDebouncer.setProcessor(_processIncomingMessage);

/**
 * Ponto de entrada público para mensagens recebidas (com debounce)
 * Verifica bloqueio ANTES de enfileirar no debouncer.
 * @param {Object} params - { phone, chatId, text, clientId, mediaPath, mediaType, empresa_id }
 */
async function handleIncomingMessage(params) {
    const { phone, chatId, empresa_id } = params;
    if (!phone) return;

    try {
        const phoneClean = phone.replace(/\D/g, '');
        const last8 = phoneClean.slice(-8);

        // Verificar bloqueio no CLIENTES (flows_blocked = 1)
        const { findClienteByPhoneBlocked } = require('../../utils/clienteHelper');
        const clienteBloqueado = await findClienteByPhoneBlocked(last8, true, empresa_id);
        if (clienteBloqueado) {
            console.log(`[FlowEngine] Mensagem ignorada - cliente bloqueado (cli_Id: ${clienteBloqueado.cli_Id})`);
            return;
        }

        // Verificar bloqueio por telefone (FlowBlockedPhones)
        const phoneBloqueado = await dbQuery(
            `SELECT id FROM FlowBlockedPhones WHERE RIGHT(REPLACE(phone, ' ', ''), 8) = ? OR chat_id = ? LIMIT 1`,
            [last8, chatId || '']
        );
        if (phoneBloqueado && phoneBloqueado.length > 0) {
            console.log(`[FlowEngine] Mensagem ignorada - telefone bloqueado (FlowBlockedPhones)`);
            return;
        }
    } catch (err) {
        // Em caso de erro na verificação, deixa passar (fail-open para não perder mensagens legítimas)
        console.error('[FlowEngine] Erro ao verificar bloqueio pré-debounce:', err.message);
    }

    messageDebouncer.queueMessage(params);
}

/**
 * Limpar número de telefone (para uso em checkScheduledFlows)
 */
function cleanPhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

/**
 * Verifica e executa fluxos agendados (cron_minuto e cron_diario)
 * Chamado a cada minuto pelo crons.js
 */
async function checkScheduledFlows() {
    try {
        const now = moment().tz('America/Sao_Paulo');
        const currentHour = now.format('HH');
        const currentMinute = now.format('mm');
        const currentTimeNum = parseInt(currentHour) * 60 + parseInt(currentMinute);

        // Buscar fluxos cron ativos
        const cronFlows = await dbQuery(`
            SELECT * FROM Flows
            WHERE trigger_type IN ('cron_minuto', 'cron_diario', 'cron_hora')
            AND status = 'ativo'
        `);

        if (!cronFlows || cronFlows.length === 0) return;

        for (const flow of cronFlows) {
            try {
                // Para cron_diario: verificar horário exato configurado
                if (flow.trigger_type === 'cron_diario') {
                    const cronTime = flow.cron_time || '08:00';
                    const [targetHour, targetMinute] = cronTime.split(':');
                    if (currentHour !== targetHour || currentMinute !== targetMinute) continue;
                }

                // Para cron_hora: verificar se é no minuto 00
                if (flow.trigger_type === 'cron_hora') {
                    if (currentMinute !== '00') continue;
                }

                // Para cron_minuto e cron_hora: verificar horário comercial (se configurado)
                if (flow.trigger_type === 'cron_minuto' || flow.trigger_type === 'cron_hora') {
                    const startTime = flow.cron_time_start;
                    const endTime = flow.cron_time_end;

                    if (startTime && endTime) {
                        const [startH, startM] = startTime.split(':').map(Number);
                        const [endH, endM] = endTime.split(':').map(Number);
                        const startNum = startH * 60 + startM;
                        const endNum = endH * 60 + endM;

                        if (currentTimeNum < startNum || currentTimeNum > endNum) {
                            continue; // Fora do horário comercial
                        }
                    }
                }

                // Parse trigger_conditions
                let conditions = flow.trigger_conditions;
                if (typeof conditions === 'string') {
                    try { conditions = JSON.parse(conditions); } catch (e) { conditions = []; }
                }
                if (!Array.isArray(conditions) || conditions.length === 0) {
                    flowLog.log('WARN', `Cron flow ${flow.id} sem condições, pulando`);
                    continue;
                }

                await executeCronFlow(flow, conditions);
            } catch (error) {
                flowLog.log('ERROR', `Erro ao processar cron flow ${flow.id}`, { error: error.message });
            }
        }
    } catch (error) {
        flowLog.log('ERROR', 'Erro em checkScheduledFlows', { error: error.message });
    }
}

/**
 * Executa um fluxo cron: itera sobre entidades relevantes baseado nas condições
 */
async function executeCronFlow(flow, conditions) {
    const empresaId = flow.empresa_id;

    // Detectar escopo baseado nas condições
    const hasAgendamentoCondition = conditions.some(c =>
        c.field && c.field.startsWith('agendamento_')
    );

    // Buscar nó start do fluxo
    const startNodes = await dbQuery(
        'SELECT * FROM FlowNodes WHERE flow_id = ? AND type = ? LIMIT 1',
        [flow.id, 'start']
    );
    if (!startNodes || startNodes.length === 0) {
        flowLog.log('WARN', `Cron flow ${flow.id} sem nó start`);
        return;
    }
    const startNode = startNodes[0];

    if (hasAgendamentoCondition) {
        // Otimização: pré-filtrar por condições simples de data no SQL
        let dateFilter = '';
        const dateCondition = conditions.find(c =>
            c.field === 'agendamento_data' && ['is_tomorrow', 'is_today', 'within_days'].includes(c.operator)
        );

        if (dateCondition) {
            const today = moment().tz('America/Sao_Paulo').format('YYYY-MM-DD');
            if (dateCondition.operator === 'is_today') {
                dateFilter = ` AND DATE(a.age_data) = '${today}'`;
            } else if (dateCondition.operator === 'is_tomorrow') {
                const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').format('YYYY-MM-DD');
                dateFilter = ` AND DATE(a.age_data) = '${tomorrow}'`;
            } else if (dateCondition.operator === 'within_days') {
                const endDate = moment().tz('America/Sao_Paulo').add(Number(dateCondition.value), 'days').format('YYYY-MM-DD');
                dateFilter = ` AND DATE(a.age_data) BETWEEN '${today}' AND '${endDate}'`;
            }
        }

        // Buscar agendamentos com clientes
        const rows = await dbQuery(`
            SELECT a.*, c.cli_Id, c.cli_nome, c.cli_email, c.cli_celular, c.cli_genero,
                   c.cli_cpf, c.cli_dataNasc AS cli_data_nasc, c.flows_blocked,
                   s.ast_descricao AS age_status_nome
            FROM AGENDAMENTO a
            JOIN CLIENTES c ON a.cli_id = c.cli_Id
            LEFT JOIN AGENDAMENTO_STATUS s ON a.ast_id = s.ast_id
            WHERE a.empresa_id = ?
            AND a.age_ativo = 1
            AND (c.flows_blocked IS NULL OR c.flows_blocked != 1)
            ${dateFilter}
        `, [empresaId]);

        if (!rows || rows.length === 0) return;

        flowLog.log('INFO', `Cron flow ${flow.id}: ${rows.length} agendamentos encontrados para avaliar`);

        for (const row of rows) {
            try {
                const phone = cleanPhoneNumber(row.cli_celular || '');
                if (!phone) continue;

                // Verificar se já existe run rodando para este flow+phone
                const existing = await dbQuery(
                    'SELECT id FROM FlowRuns WHERE flow_id = ? AND phone = ? AND status = ? LIMIT 1',
                    [flow.id, phone, 'running']
                );
                if (existing && existing.length > 0) continue;

                // Montar contexto
                const context = {
                    phone,
                    cliente: {
                        cli_Id: row.cli_Id,
                        cli_nome: row.cli_nome,
                        cli_email: row.cli_email,
                        cli_celular: row.cli_celular,
                        cli_genero: row.cli_genero,
                        cli_cpf: row.cli_cpf,
                        cli_data_nasc: row.cli_data_nasc
                    },
                    agendamento: {
                        age_id: row.age_id,
                        age_data: row.age_data,
                        age_data_final: row.age_dataFim,
                        age_hora_inicio: row.age_horaInicio,
                        age_hora_fim: row.age_horaFim,
                        age_status: row.ast_id,
                        age_status_nome: row.age_status_nome,
                        age_valor: row.age_valor,
                        age_observacao: row.age_observacao,
                        age_funcionario_id: row.fun_id,
                        age_tipo: row.age_type
                    },
                    empresa_id: empresaId,
                    triggerData: {
                        triggerType: flow.trigger_type,
                        timestamp: moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss')
                    }
                };

                // Avaliar condições usando buildFlatContext
                const flat = buildFlatContext(context);

                const conditionsMet = evalConditions(conditions, flat);
                if (!conditionsMet) continue;

                // Iniciar fluxo
                flowLog.log('INFO', `Cron flow ${flow.id}: iniciando para phone ${phone}`);
                await startFlow({
                    flowId: flow.id,
                    startNodeId: startNode.id,
                    phone: phone,
                    cliente: context.cliente,
                    agendamento: context.agendamento,
                    context: context
                });

                // Delay aleatório entre 60s e 90s para evitar banimento no WhatsApp
                const delayMs = 60000 + Math.floor(Math.random() * 30000);
                flowLog.log('INFO', `Cron flow ${flow.id}: aguardando ${Math.round(delayMs / 1000)}s antes do próximo disparo`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } catch (err) {
                flowLog.log('ERROR', `Cron flow ${flow.id}: erro para registro ${row.age_id}`, { error: err.message });
            }
        }
    } else {
        // Apenas clientes (com último agendamento CONCLUÍDO - Atendido/Pago)
        // Buscar IDs de status "concluídos" dinamicamente por empresa
        const statusConcluidos = await dbQuery(
            `SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao IN ('Atendido', 'Pago') AND empresa_id = ?`,
            [empresaId]
        );
        const statusIds = statusConcluidos.length > 0
            ? statusConcluidos.map(s => s.ast_id).join(',')
            : '3,4'; // fallback

        const clientes = await dbQuery(`
            SELECT c.*,
                   (SELECT MAX(a.age_data) FROM AGENDAMENTO a WHERE a.cli_id = c.cli_Id AND a.empresa_id = c.empresa_id AND a.age_ativo = 1 AND a.ast_id IN (${statusIds})) as cli_ultimo_agendamento,
                   (SELECT COUNT(a.age_id) FROM AGENDAMENTO a WHERE a.cli_id = c.cli_Id AND a.empresa_id = c.empresa_id AND a.age_ativo = 1 AND a.ast_id IN (${statusIds})) as cli_qtd_agendamentos
            FROM CLIENTES c
            WHERE c.empresa_id = ? AND (c.flows_blocked IS NULL OR c.flows_blocked != 1)
        `, [empresaId]);

        if (!clientes || clientes.length === 0) return;

        flowLog.log('INFO', `Cron flow ${flow.id}: ${clientes.length} clientes encontrados para avaliar`);

        for (const cliente of clientes) {
            try {
                const phone = cleanPhoneNumber(cliente.cli_celular || '');
                if (!phone) continue;

                const existing = await dbQuery(
                    'SELECT id FROM FlowRuns WHERE flow_id = ? AND phone = ? AND status = ? LIMIT 1',
                    [flow.id, phone, 'running']
                );
                if (existing && existing.length > 0) continue;

                const context = {
                    phone,
                    cliente: cliente,
                    empresa_id: empresaId,
                    triggerData: {
                        triggerType: flow.trigger_type,
                        timestamp: moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss')
                    }
                };

                const flat = buildFlatContext(context);

                const conditionsMet = evalConditions(conditions, flat);
                if (!conditionsMet) continue;

                flowLog.log('INFO', `Cron flow ${flow.id}: iniciando para phone ${phone}`);
                await startFlow({
                    flowId: flow.id,
                    startNodeId: startNode.id,
                    phone: phone,
                    cliente: cliente,
                    context: context
                });

                // Delay aleatório entre 60s e 90s para evitar banimento no WhatsApp
                const delayMs = 60000 + Math.floor(Math.random() * 30000);
                flowLog.log('INFO', `Cron flow ${flow.id}: aguardando ${Math.round(delayMs / 1000)}s antes do próximo disparo`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } catch (err) {
                flowLog.log('ERROR', `Cron flow ${flow.id}: erro para cliente ${cliente.cli_Id}`, { error: err.message });
            }
        }
    }
}

/**
 * Stub para checkTimeouts - o timeout handling real é feito por checkWaitTimeouts
 */
async function checkTimeouts() {
    // Timeout handling is done in checkWaitTimeouts
}

// Exportar funções principais
module.exports = {
    getFlowById,
    startFlow,
    advance,
    handleIncomingMessage,
    _processIncomingMessage,
    execAction,
    evalCondition,
    evalConditions,
    findNextNodes,
    getSMTPTransporter: getSMTPTransporterFunction,
    checkWaitTimeouts,
    checkScheduledFlows,
    checkTimeouts,

    // Debouncer stats (para debug)
    getDebouncerStats: messageDebouncer.getStats,

    // Funções auxiliares para compatibilidade
    getClienteByPhone,
    createOrUpdateCliente,

    // Re-exportar actions para compatibilidade
    createAgendamento,
    updateAgendamento,
    getAgendamento,
    updateCliente,
    createNegocio,
    updateNegocio,
    blockUnblockClientFlows
};

