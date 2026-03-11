/**
 * 🎯 FLOW ENGINE - Motor Principal de Execução de Fluxos
 * 
 * Sistema refatorado e modular para execução de fluxos de automação
 */

const moment = require('moment');
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
            result = fieldValue == compareValue;
            break;
        case 'neq':
            result = fieldValue != compareValue;
            break;
        case 'gt':
            result = Number(fieldValue) > Number(compareValue);
            break;
        case 'lt':
            result = Number(fieldValue) < Number(compareValue);
            break;
        case 'gte':
            result = Number(fieldValue) >= Number(compareValue);
            break;
        case 'lte':
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

        const { nodes, edges } = flowData;

        // Buscar nó atual
        const currentNode = nodes.find(n => n.id === run.current_node_id);
        if (!currentNode) {
            throw new Error(`Nó ${run.current_node_id} não encontrado`);
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
            // Condição: procurar edge com label correspondente
            nextEdge = nextEdges.find(e => e.label?.toLowerCase() === result.output.toLowerCase());
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

        const interruptionResult = await processMessageWithInterruption({ phone, chatId, text });

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
                flowLog.log('ERROR', 'Nó atual não encontrado');
                return;
            }

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

                            // Remover tag de "aguardando atendimento" do WhatsApp
                            if (chatId || run.chat_id) {
                                try {
                                    const { removeWaitingForAgentTag } = require('../../zap/chats');
                                    const cId = context.clientId || `atendimento_${empresa_id}`;
                                    await removeWaitingForAgentTag(cId, chatId || run.chat_id);
                                } catch (tagErr) {
                                    console.log('⚠️ Não foi possível remover tag do WhatsApp:', tagErr.message);
                                }
                            }

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
        }

        // Se não há execução aguardando, verificar se há fluxos com trigger de mensagem WhatsApp
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
                    flowLog.log('ERROR', `Nó ${run.current_node_id} não encontrado para timeout`);
                    continue;
                }

                const node = currentNode[0];
                const edges = await dbQuery('SELECT * FROM FlowEdges WHERE source_node_id = ? AND empresa_id = ? ORDER BY id ASC', [node.id, run.empresa_id]);

                // Procurar edge de timeout
                let timeoutEdge = edges.find(e => {
                    const label = (e.label || '').toLowerCase();
                    return label.includes('timeout') || label.includes('expirado') || label.includes('sem resposta');
                });

                // Se não encontrar edge de timeout, usar a última edge (convenção)
                if (!timeoutEdge && edges.length > 0) {
                    timeoutEdge = edges[edges.length - 1];
                }

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
 * Bufferiza mensagens rápidas do mesmo telefone e processa uma única vez.
 * @param {Object} params - { phone, chatId, text, clientId, mediaPath, mediaType }
 */
function handleIncomingMessage(params) {
    messageDebouncer.queueMessage(params);
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

