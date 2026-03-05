/**
 * 🧪 FLOW TEST ROUTE - Sistema de Teste de Fluxos
 *
 * Rota sem autenticação para testes de fluxos.
 * Processa fluxos REAIS mas intercepta envio de mensagens.
 * Ideal para testes automatizados e debug por LLMs.
 */

const express = require('express');
const router = express.Router();
const dbQuery = require('../utils/dbHelper');
const moment = require('moment');
const path = require('path');
const { createOrUpdateCliente } = require('../flows/actions/clienteActions');
const { addMessageToHistory } = require('../flows/helpers/conversationHelper');
const TEST_EMPRESA_ID = 1;

// Cache de sessões de simulação (em memória)
const simulationSessions = new Map();

// Lock por telefone para garantir processamento sequencial nas rotas de teste
const phoneLocks = new Map();

/**
 * Garante processamento sequencial por telefone
 * @param {string} phone - Número do telefone
 * @param {Function} fn - Função async a executar
 * @returns {Promise<*>} Resultado da função
 */
async function withPhoneLock(phone, fn) {
    const key = phone.replace(/\D/g, '');
    const prev = phoneLocks.get(key) || Promise.resolve();
    let release;
    const lock = new Promise(resolve => { release = resolve; });
    phoneLocks.set(key, prev.then(() => lock));
    try {
        await prev;
        return await fn();
    } finally {
        release();
    }
}

/**
 * Obtém ou cria uma sessão de simulação para um telefone
 * @param {String} phone - Número de telefone
 * @returns {Object} - Sessão de simulação
 */
function getOrCreateSession(phone) {
    const cleanPhone = phone.replace(/\D/g, '');

    if (!simulationSessions.has(cleanPhone)) {
        simulationSessions.set(cleanPhone, {
            phone: cleanPhone,
            runId: null,
            flowId: null,
            flowName: null,
            status: 'idle',
            simulatedResponses: [],
            conversationHistory: [],
            waitingFor: null,
            context: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    return simulationSessions.get(cleanPhone);
}

/**
 * Atualiza uma sessão de simulação
 * @param {String} phone - Número de telefone
 * @param {Object} updates - Atualizações
 */
function updateSession(phone, updates) {
    const cleanPhone = phone.replace(/\D/g, '');
    const session = getOrCreateSession(cleanPhone);
    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
}

/**
 * Limpa uma sessão de simulação
 * @param {String} phone - Número de telefone
 */
function clearSession(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    simulationSessions.delete(cleanPhone);
}

/**
 * Coleta respostas simuladas do contexto
 * @param {Object} context - Contexto do fluxo
 * @returns {Array} - Respostas coletadas
 */
function collectSimulatedResponses(context) {
    return context.simulatedResponses || [];
}

/**
 * GET HTML de teste de fluxos
 * @returns {HTML} - HTML de teste de fluxos
 */
router.get('/test', async (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../../public/flow-test.html'));
    } catch (error) {
        console.error('Erro em test:', error);
    }
});

/**
 * POST /flow-test/simulate-message
 * Simula uma mensagem de entrada e processa o fluxo real
 */
router.post('/simulate-message', async (req, res) => {
    try {
        const { phone, text, clientId = 'atendimento_1', ttsEnabled = false, fullAudio = false } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'O campo phone é obrigatório'
            });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // Processar com lock por telefone para evitar race conditions
        const lockResult = await withPhoneLock(cleanPhone, async () => {

        // Armazenar opções de áudio na sessão
        const audioOptions = { ttsEnabled, fullAudio };

        const session = getOrCreateSession(cleanPhone);

        // Adicionar mensagem do usuário ao histórico
        session.conversationHistory.push({
            from: 'user',
            text: text || '',
            timestamp: new Date().toISOString()
        });

        // Verificar se já existe um fluxo em execução
        const existingRuns = await dbQuery(`
            SELECT fr.*, f.name as flow_name
            FROM FlowRuns fr
            JOIN Flows f ON fr.flow_id = f.id
            WHERE fr.phone LIKE ?
            AND fr.status = 'running'
            AND fr.empresa_id = ?
            AND f.empresa_id = ?
            ORDER BY fr.id DESC
            LIMIT 1
        `, [`%${cleanPhone.slice(-8)}%`, TEST_EMPRESA_ID, TEST_EMPRESA_ID]);

        let runId, flowId, flowName;
        let responses = [];
        let waitingFor = null;
        let currentStatus = 'running';

        if (existingRuns.length > 0) {
            // Fluxo já em execução - processar resposta
            const run = existingRuns[0];
            runId = run.id;
            flowId = run.flow_id;
            flowName = run.flow_name;

            // Processar a mensagem usando o engine (modo simulação)
            const result = await processMessageInSimulation(cleanPhone, text, clientId, run, audioOptions);

            responses = result.responses || [];
            waitingFor = result.waitingFor;
            currentStatus = result.status;

        } else {
            // Nenhum fluxo em execução - tentar iniciar um novo
            const flows = await dbQuery(`
                SELECT * FROM Flows
                WHERE trigger_type = 'mensagem_whatsapp'
                AND status = 'ativo'
                AND empresa_id = ?
                ORDER BY priority DESC
                LIMIT 1
            `, [TEST_EMPRESA_ID]);

            if (flows.length === 0) {
                return res.json({
                    success: true,
                    flowStarted: false,
                    message: 'Nenhum fluxo ativo com trigger mensagem_whatsapp encontrado',
                    botResponses: []
                });
            }

            const flow = flows[0];
            flowId = flow.id;
            flowName = flow.name;

            // Iniciar fluxo em modo simulação
            const result = await startFlowInSimulation(flow, cleanPhone, text, clientId, {}, audioOptions);

            runId = result.runId;
            responses = result.responses || [];
            waitingFor = result.waitingFor;
            currentStatus = result.status;
        }

        // Adicionar respostas do bot ao histórico
        for (const response of responses) {
            session.conversationHistory.push({
                from: 'bot',
                text: response.content,
                type: response.type,
                timestamp: response.timestamp || new Date().toISOString()
            });
        }

        // Atualizar sessão
        updateSession(cleanPhone, {
            runId,
            flowId,
            flowName,
            status: currentStatus,
            waitingFor,
            simulatedResponses: responses
        });

        return {
            success: true,
            flowStarted: true,
            flowId,
            flowName,
            runId,
            currentStatus,
            botResponses: responses,
            waitingFor,
            conversationHistory: session.conversationHistory
        };

        }); // fim withPhoneLock

        res.json(lockResult);

    } catch (error) {
        console.error('Erro em simulate-message:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /flow-test/respond
 * Envia resposta do usuário para fluxo em execução
 */
router.post('/respond', async (req, res) => {
    try {
        const { phone, text, ttsEnabled = false, fullAudio = false } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'O campo phone é obrigatório'
            });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // Processar com lock por telefone para evitar race conditions
        const lockResult = await withPhoneLock(cleanPhone, async () => {

        const session = getOrCreateSession(cleanPhone);

        // Opções de áudio
        const audioOptions = { ttsEnabled, fullAudio };

        // Buscar execução ativa
        const runs = await dbQuery(`
            SELECT fr.*, f.name as flow_name
            FROM FlowRuns fr
            JOIN Flows f ON fr.flow_id = f.id
            WHERE fr.phone LIKE ?
            AND fr.status = 'running'
            AND fr.waiting_for_response = 1
            AND fr.empresa_id = ?
            AND f.empresa_id = ?
            ORDER BY fr.id DESC
            LIMIT 1
        `, [`%${cleanPhone.slice(-8)}%`, TEST_EMPRESA_ID, TEST_EMPRESA_ID]);

        if (runs.length === 0) {
            return {
                success: false,
                error: 'Nenhum fluxo aguardando resposta para este telefone',
                suggestion: 'Use /flow-test/simulate-message para iniciar um novo fluxo'
            };
        }

        const run = runs[0];

        // Adicionar mensagem do usuário ao histórico
        session.conversationHistory.push({
            from: 'user',
            text: text || '',
            timestamp: new Date().toISOString()
        });

        // Processar resposta
        const result = await processMessageInSimulation(cleanPhone, text, 'atendimento_1', run, audioOptions);

        // Adicionar respostas do bot ao histórico
        for (const response of (result.responses || [])) {
            session.conversationHistory.push({
                from: 'bot',
                text: response.content,
                type: response.type,
                timestamp: response.timestamp || new Date().toISOString()
            });
        }

        // Atualizar sessão
        updateSession(cleanPhone, {
            status: result.status,
            waitingFor: result.waitingFor,
            simulatedResponses: result.responses
        });

        return {
            success: true,
            runId: run.id,
            flowName: run.flow_name,
            currentStatus: result.status,
            botResponses: result.responses || [],
            waitingFor: result.waitingFor,
            conversationHistory: session.conversationHistory
        };

        }); // fim withPhoneLock

        res.json(lockResult);

    } catch (error) {
        console.error('Erro em respond:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /flow-test/status/:phone
 * Obtém status atual do fluxo para um telefone
 */
router.get('/status/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        // Buscar execução ativa
        const runs = await dbQuery(`
            SELECT fr.*, f.name as flow_name, fn.type as current_node_type, fn.label as current_node_label
            FROM FlowRuns fr
            JOIN Flows f ON fr.flow_id = f.id
            LEFT JOIN FlowNodes fn ON fr.current_node_id = fn.id
            WHERE fr.phone LIKE ?
            AND fr.empresa_id = ?
            AND f.empresa_id = ?
            ORDER BY fr.id DESC
            LIMIT 1
        `, [`%${cleanPhone.slice(-8)}%`, TEST_EMPRESA_ID, TEST_EMPRESA_ID]);

        if (runs.length === 0) {
            return res.json({
                hasActiveRun: false,
                message: 'Nenhuma execução encontrada para este telefone'
            });
        }

        const run = runs[0];
        const session = getOrCreateSession(cleanPhone);

        let waitingFor = null;
        if (run.waiting_for_response && run.wait_state) {
            try {
                waitingFor = JSON.parse(run.wait_state);
            } catch (_) {}
        }

        res.json({
            hasActiveRun: run.status === 'running',
            runId: run.id,
            flowId: run.flow_id,
            flowName: run.flow_name,
            status: run.status,
            currentNode: {
                id: run.current_node_id,
                type: run.current_node_type,
                label: run.current_node_label
            },
            waitingForResponse: run.waiting_for_response === 1,
            waitingFor,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            conversationHistory: session.conversationHistory
        });

    } catch (error) {
        console.error('Erro em status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /flow-test/cancel
 * Cancela fluxo ativo
 */
router.post('/cancel', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'O campo phone é obrigatório'
            });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // Cancelar execuções ativas
        const result = await dbQuery(`
            UPDATE FlowRuns
            SET status = 'cancelled', updated_at = NOW()
            WHERE phone LIKE ?
            AND status = 'running'
            AND empresa_id = ?
        `, [`%${cleanPhone.slice(-8)}%`, TEST_EMPRESA_ID]);

        // Limpar sessão de simulação
        const session = getOrCreateSession(cleanPhone);
        session.status = 'cancelled';
        session.waitingFor = null;

        res.json({
            success: true,
            message: `${result.affectedRows} execução(ões) cancelada(s)`,
            affectedRows: result.affectedRows
        });

    } catch (error) {
        console.error('Erro em cancel:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /flow-test/flows
 * Lista fluxos disponíveis
 */
router.get('/flows', async (req, res) => {
    try {
        const flows = await dbQuery(`
            SELECT id, name, description, status, trigger_type, priority
            FROM Flows
            WHERE empresa_id = ?
            ORDER BY status DESC, priority DESC, name ASC
        `, [TEST_EMPRESA_ID]);

        res.json({
            success: true,
            total: flows.length,
            flows: flows.map(f => ({
                id: f.id,
                name: f.name,
                description: f.description,
                status: f.status,
                trigger: f.trigger_type,
                priority: f.priority
            }))
        });

    } catch (error) {
        console.error('Erro em flows:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /flow-test/start-flow
 * Inicia um fluxo específico manualmente
 */
router.post('/start-flow', async (req, res) => {
    try {
        const { flowId, phone, initialContext = {}, ttsEnabled = false, fullAudio = false } = req.body;

        if (!flowId || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Os campos flowId e phone são obrigatórios'
            });
        }

        // Opções de áudio
        const audioOptions = { ttsEnabled, fullAudio };

        const cleanPhone = phone.replace(/\D/g, '');

        // Buscar fluxo
        const flows = await dbQuery('SELECT * FROM Flows WHERE id = ? AND empresa_id = ?', [flowId, TEST_EMPRESA_ID]);

        if (flows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Fluxo ${flowId} não encontrado`
            });
        }

        const flow = flows[0];

        // Cancelar execuções anteriores
        await dbQuery(`
            UPDATE FlowRuns
            SET status = 'cancelled', updated_at = NOW()
            WHERE phone LIKE ?
            AND status = 'running'
            AND empresa_id = ?
        `, [`%${cleanPhone.slice(-8)}%`, TEST_EMPRESA_ID]);

        // Limpar sessão anterior
        clearSession(cleanPhone);

        // Iniciar fluxo
        const result = await startFlowInSimulation(flow, cleanPhone, '', 'atendimento_1', initialContext, audioOptions);

        // Criar nova sessão
        const session = getOrCreateSession(cleanPhone);
        session.runId = result.runId;
        session.flowId = flow.id;
        session.flowName = flow.name;
        session.status = result.status;
        session.waitingFor = result.waitingFor;
        session.simulatedResponses = result.responses;

        // Adicionar respostas ao histórico
        for (const response of (result.responses || [])) {
            session.conversationHistory.push({
                from: 'bot',
                text: response.content,
                type: response.type,
                timestamp: response.timestamp || new Date().toISOString()
            });
        }

        res.json({
            success: true,
            flowId: flow.id,
            flowName: flow.name,
            runId: result.runId,
            currentStatus: result.status,
            botResponses: result.responses || [],
            waitingFor: result.waitingFor
        });

    } catch (error) {
        console.error('Erro em start-flow:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /flow-test/reset
 * Limpa todos os dados de teste de um telefone
 */
router.post('/reset', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'O campo phone é obrigatório'
            });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // Cancelar todas as execuções
        const cancelResult = await dbQuery(`
            UPDATE FlowRuns
            SET status = 'cancelled', updated_at = NOW()
            WHERE phone LIKE ?
            AND empresa_id = ?
        `, [`%${cleanPhone.slice(-8)}%`, TEST_EMPRESA_ID]);

        // Limpar sessão de simulação
        clearSession(cleanPhone);

        res.json({
            success: true,
            message: 'Dados de teste limpos com sucesso',
            runsAffected: cancelResult.affectedRows
        });

    } catch (error) {
        console.error('Erro em reset:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /flow-test/run/:runId
 * Obtém detalhes de uma execução específica
 */
router.get('/run/:runId', async (req, res) => {
    try {
        const { runId } = req.params;

        const runs = await dbQuery(`
            SELECT fr.*, f.name as flow_name, f.description as flow_description
            FROM FlowRuns fr
            JOIN Flows f ON fr.flow_id = f.id
            WHERE fr.id = ?
            AND fr.empresa_id = ?
            AND f.empresa_id = ?
        `, [runId, TEST_EMPRESA_ID, TEST_EMPRESA_ID]);

        if (runs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Execução não encontrada'
            });
        }

        const run = runs[0];
        let context = {};
        let waitState = null;

        try {
            context = run.context_json ? JSON.parse(run.context_json) : {};
        } catch (_) {}

        try {
            waitState = run.wait_state ? JSON.parse(run.wait_state) : null;
        } catch (_) {}

        // Buscar nós executados
        const actions = await dbQuery(`
            SELECT * FROM FlowActions
            WHERE flow_run_id = ?
            ORDER BY created_at ASC
        `, [runId]);

        res.json({
            success: true,
            run: {
                id: run.id,
                flowId: run.flow_id,
                flowName: run.flow_name,
                status: run.status,
                currentNodeId: run.current_node_id,
                phone: run.phone,
                chatId: run.chat_id,
                waitingForResponse: run.waiting_for_response === 1,
                waitState,
                createdAt: run.created_at,
                updatedAt: run.updated_at
            },
            context: {
                cliente: context.cliente,
                agendamento: context.agendamento,
                negocio: context.negocio,
                variables: Object.keys(context).filter(k =>
                    !['cliente', 'agendamento', 'negocio', 'flat', 'simulatedResponses'].includes(k)
                ).reduce((obj, k) => { obj[k] = context[k]; return obj; }, {})
            },
            actionsExecuted: actions.length,
            actions: actions.map(a => ({
                id: a.id,
                tipo: a.tipo_acao,
                nodeType: a.node_type,
                nodeLabel: a.node_label,
                sucesso: a.sucesso === 1,
                erro: a.erro_mensagem,
                tempoExecucao: a.tempo_execucao,
                createdAt: a.created_at
            }))
        });

    } catch (error) {
        console.error('Erro em run/:runId:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// FUNÇÕES AUXILIARES DE SIMULAÇÃO
// ============================================================

/**
 * Inicia um fluxo em modo simulação
 * @param {Object} flow - Fluxo a iniciar
 * @param {String} phone - Telefone
 * @param {String} text - Texto inicial
 * @param {String} clientId - ID do client WhatsApp
 * @param {Object} initialContext - Contexto inicial opcional
 * @param {Object} audioOptions - Opções de áudio TTS {ttsEnabled, fullAudio}
 * @returns {Promise<Object>} - Resultado da simulação
 */
async function startFlowInSimulation(flow, phone, text, clientId, initialContext = {}, audioOptions = {}) {
    const responses = [];

    try {
        // Buscar nó inicial
        const startNodes = await dbQuery(
            'SELECT * FROM FlowNodes WHERE flow_id = ? AND type = "start" AND empresa_id = ?',
            [flow.id, TEST_EMPRESA_ID]
        );

        if (startNodes.length === 0) {
            return {
                runId: null,
                status: 'error',
                error: 'Nó inicial não encontrado',
                responses: []
            };
        }

        const startNode = startNodes[0];

        // Buscar cliente existente pelo telefone; criar só se não existir
        let cliente = null;
        try {
            const { getClienteByPhone } = require('../flows/actions/clienteActions');
            cliente = await getClienteByPhone(phone, TEST_EMPRESA_ID);
            if (!cliente || !cliente.cli_Id) {
                // Cliente não encontrado, criar um novo
                cliente = await createOrUpdateCliente(phone, null, {}, TEST_EMPRESA_ID);
            }
            console.log('✅ Cliente para simulação:', cliente?.cli_Id, cliente?.cli_nome);
        } catch (clienteError) {
            console.error('⚠️ Erro ao buscar/criar cliente para simulação:', clienteError.message);
            cliente = {
                cli_celular: phone,
                telefone: phone,
                phone: phone
            };
        }

        // Criar contexto de simulação
        const context = {
            ...initialContext,
            isSimulation: true,
            simulatedResponses: [],
            history: [], // NOVO: histórico de conversa para a IA
            flowId: flow.id,
            phone,
            clientId,
            chatId: `simulation_${phone}_${Date.now()}`,
            cliente, // Adiciona cliente ao contexto
            mensagem: {
                text: text || '',
                timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
            },
            started_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            empresa_id: TEST_EMPRESA_ID,
            // 🎤 Opções de áudio TTS
            ttsEnabled: audioOptions.ttsEnabled || false,
            fullAudio: audioOptions.fullAudio || false
        };

        // Se há texto inicial, adicionar ao histórico
        if (text && text.trim()) {
            addMessageToHistory(context, 'user', text);
        }

        // Criar registro de execução
        const insertResult = await dbQuery(
            `INSERT INTO FlowRuns (flow_id, current_node_id, status, chat_id, phone, context_json, empresa_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [flow.id, startNode.id, 'running', context.chatId, phone, JSON.stringify(context), TEST_EMPRESA_ID]
        );

        const runId = insertResult.insertId;
        context.runId = runId;

        // Executar fluxo em modo simulação
        const result = await advanceInSimulation(runId, context);

        return {
            runId,
            status: result.status,
            responses: result.responses,
            waitingFor: result.waitingFor
        };

    } catch (error) {
        console.error('Erro ao iniciar fluxo em simulação:', error);
        return {
            runId: null,
            status: 'error',
            error: error.message,
            responses: []
        };
    }
}

/**
 * Processa uma mensagem em modo simulação
 * @param {String} phone - Telefone
 * @param {String} text - Texto da mensagem
 * @param {String} clientId - ID do client
 * @param {Object} run - Execução atual
 * @param {Object} audioOptions - Opções de áudio TTS {ttsEnabled, fullAudio}
 * @returns {Promise<Object>} - Resultado
 */
async function processMessageInSimulation(phone, text, clientId, run, audioOptions = {}) {
    try {
        // Carregar contexto
        let context = {};
        try {
            context = run.context_json ? JSON.parse(run.context_json) : {};
        } catch (_) {}

        // Marcar como simulação
        context.isSimulation = true;
        context.simulatedResponses = [];

        // 🎤 Aplicar opções de áudio (manter existentes ou usar novas)
        if (audioOptions.ttsEnabled !== undefined) context.ttsEnabled = audioOptions.ttsEnabled;
        if (audioOptions.fullAudio !== undefined) context.fullAudio = audioOptions.fullAudio;

        // Garantir que history existe
        if (!context.history) {
            context.history = [];
        }

        // Adicionar mensagem do usuário ao histórico ANTES de processar
        if (text && text.trim()) {
            addMessageToHistory(context, 'user', text);
            console.log(`📝 Histórico atualizado: ${context.history.length} mensagens (+ user)`);
        }

        // Buscar nó atual
        const nodes = await dbQuery('SELECT * FROM FlowNodes WHERE id = ? AND empresa_id = ?', [run.current_node_id, TEST_EMPRESA_ID]);

        if (nodes.length === 0) {
            return {
                status: 'error',
                error: 'Nó atual não encontrado',
                responses: []
            };
        }

        const node = nodes[0];
        const config = node.config ? JSON.parse(node.config) : {};

        // Processar resposta baseado no tipo de nó
        if (node.type === 'ai_actions') {
            // Nó de IA - processar nova mensagem com a IA e continuar aguardando
            // NOTA: O processAIActions chama sendWhatsAppMessage internamente,
            // que já adiciona ao simulatedResponses com audioUrl
            context.ultima_mensagem = text;
            context.mensagem = { text, timestamp: new Date().toISOString() };

            try {
                const { processAIActions } = require('../flows/core/aiProcessor');
                const aiResult = await processAIActions(node, context);

                // A resposta já foi adicionada ao simulatedResponses pelo sendWhatsAppMessage
                // Apenas adicionar ao histórico se houver resposta
                if (aiResult && aiResult.response) {
                    // IMPORTANTE: Adicionar resposta da IA ao histórico
                    addMessageToHistory(context, 'model', aiResult.response);
                    console.log(`📝 Histórico atualizado: ${context.history.length} mensagens (+ model)`);
                }

                // Mesclar dados adicionais ao contexto
                if (aiResult?.add) {
                    Object.assign(context, aiResult.add);
                }

                // Atualizar contexto mas manter aguardando resposta
                await dbQuery(
                    'UPDATE FlowRuns SET context_json = ?, updated_at = NOW() WHERE id = ?',
                    [JSON.stringify(context), run.id]
                );

                return {
                    status: 'waiting_for_response',
                    responses: context.simulatedResponses || [],
                    waitingFor: {
                        type: 'ai_conversation',
                        variableName: 'ultima_mensagem'
                    }
                };

            } catch (aiError) {
                console.error('Erro ao processar IA:', aiError);
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'ai_error',
                    content: `[ERRO IA] ${aiError.message}`,
                    timestamp: new Date().toISOString()
                });

                return {
                    status: 'waiting_for_response',
                    responses: context.simulatedResponses,
                    waitingFor: { type: 'ai_conversation' }
                };
            }
        } else if (node.type === 'wait_reply' || node.type === 'wait_reply_conditional' || node.type === 'wait_reply_options') {
            // Processar resposta do wait
            const { processWaitReplyResponse, processWaitReplyConditionalResponse, processOptionsResponse } = require('../flows/actions/waitActions');

            // Buscar edges do nó atual para navegação
            const nodeEdges = await dbQuery('SELECT * FROM FlowEdges WHERE source_node_id = ? AND empresa_id = ? ORDER BY id ASC', [node.id, TEST_EMPRESA_ID]);

            if (node.type === 'wait_reply') {
                const result = processWaitReplyResponse(text, config, context);
                Object.assign(context, result.variables);

                // Navegar para próximo nó se houver edge
                if (nodeEdges.length > 0) {
                    await dbQuery(
                        'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                        [nodeEdges[0].target_node_id, run.id]
                    );
                }
            } else if (node.type === 'wait_reply_conditional') {
                const result = processWaitReplyConditionalResponse(text, config, context);
                Object.assign(context, result.variables);
                context.wait_conditional_result = result.conditionMet ? 'true' : 'false';

                // Navegar para edge correta (sim/não)
                const targetEdge = nodeEdges.find(e => {
                    const label = (e.label || '').toLowerCase();
                    return result.conditionMet ?
                        (label.includes('sim') || label.includes('true') || label.includes('verdadeiro')) :
                        (label.includes('não') || label.includes('nao') || label.includes('false') || label.includes('falso'));
                }) || nodeEdges[0];

                if (targetEdge) {
                    await dbQuery(
                        'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                        [targetEdge.target_node_id, run.id]
                    );
                }
            } else if (node.type === 'wait_reply_options') {
                const options = config.options || [];
                const result = processOptionsResponse(text, options);

                if (!result.valid) {
                    // Opção inválida - enviar mensagem de erro
                    const invalidMessage = config.invalidOptionMessage || 'Opção inválida. Por favor, escolha uma das opções acima.';
                    context.simulatedResponses.push({
                        type: 'text',
                        content: invalidMessage,
                        timestamp: new Date().toISOString()
                    });

                    // Continuar aguardando
                    await dbQuery(
                        'UPDATE FlowRuns SET context_json = ?, updated_at = NOW() WHERE id = ?',
                        [JSON.stringify(context), run.id]
                    );

                    return {
                        status: 'waiting_for_response',
                        responses: context.simulatedResponses,
                        waitingFor: {
                            type: 'wait_reply_options',
                            options: options.map(o => o.label)
                        }
                    };
                }

                context.selected_option = result.selectedIndex;
                context.selected_option_label = result.option.label;
                context.selected_option_value = result.selectedIndex + 1;

                // Navegar para edge correspondente à opção selecionada
                if (nodeEdges.length > result.selectedIndex) {
                    await dbQuery(
                        'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                        [nodeEdges[result.selectedIndex].target_node_id, run.id]
                    );
                } else if (nodeEdges.length > 0) {
                    await dbQuery(
                        'UPDATE FlowRuns SET current_node_id = ? WHERE id = ?',
                        [nodeEdges[0].target_node_id, run.id]
                    );
                }
            }
        }

        context.ultima_mensagem = text;

        // Atualizar para não aguardar mais
        await dbQuery(
            'UPDATE FlowRuns SET waiting_for_response = 0, wait_state = NULL, context_json = ?, updated_at = NOW() WHERE id = ?',
            [JSON.stringify(context), run.id]
        );

        // Continuar execução
        const result = await advanceInSimulation(run.id, context);

        return result;

    } catch (error) {
        console.error('Erro ao processar mensagem em simulação:', error);
        return {
            status: 'error',
            error: error.message,
            responses: []
        };
    }
}

/**
 * Avança a execução em modo simulação
 * @param {Number} runId - ID da execução
 * @param {Object} context - Contexto
 * @returns {Promise<Object>} - Resultado
 */
async function advanceInSimulation(runId, context) {
    const allResponses = [];

    try {
        // Buscar execução
        const runs = await dbQuery('SELECT * FROM FlowRuns WHERE id = ? AND empresa_id = ?', [runId, TEST_EMPRESA_ID]);

        if (runs.length === 0) {
            return { status: 'error', error: 'Execução não encontrada', responses: [] };
        }

        const run = runs[0];

        // Buscar fluxo
        const flows = await dbQuery('SELECT * FROM Flows WHERE id = ? AND empresa_id = ?', [run.flow_id, TEST_EMPRESA_ID]);
        const nodes = await dbQuery('SELECT * FROM FlowNodes WHERE flow_id = ? AND empresa_id = ? ORDER BY id', [run.flow_id, TEST_EMPRESA_ID]);
        const edges = await dbQuery('SELECT * FROM FlowEdges WHERE flow_id = ? AND empresa_id = ?', [run.flow_id, TEST_EMPRESA_ID]);

        if (flows.length === 0) {
            return { status: 'error', error: 'Fluxo não encontrado', responses: [] };
        }

        let currentNodeId = run.current_node_id;
        let iterations = 0;
        const maxIterations = 50; // Limite de segurança

        while (iterations < maxIterations) {
            iterations++;

            // Buscar nó atual
            const currentNode = nodes.find(n => n.id === currentNodeId);

            if (!currentNode) {
                await dbQuery('UPDATE FlowRuns SET status = ?, updated_at = NOW() WHERE id = ?', ['completed', runId]);
                return { status: 'completed', responses: allResponses, waitingFor: null };
            }

            // Executar ação do nó em modo simulação
            const result = await execActionInSimulation(currentNode, context);

            // Coletar respostas simuladas
            if (context.simulatedResponses && context.simulatedResponses.length > 0) {
                allResponses.push(...context.simulatedResponses);
                context.simulatedResponses = [];
            }

            // Se deve aguardar, pausar
            if (result.output === 'wait') {
                const waitState = {
                    waitType: result.waitType,
                    options: result.options || []
                };

                await dbQuery(
                    'UPDATE FlowRuns SET current_node_id = ?, waiting_for_response = 1, wait_state = ?, context_json = ?, updated_at = NOW() WHERE id = ?',
                    [currentNodeId, JSON.stringify(waitState), JSON.stringify(context), runId]
                );

                return {
                    status: 'waiting_for_response',
                    responses: allResponses,
                    waitingFor: {
                        type: result.waitType,
                        options: result.options?.map(o => o.label) || [],
                        variableName: result.variableName
                    }
                };
            }

            // Adicionar resultados ao contexto
            if (result.add) {
                Object.assign(context, result.add);
            }

            // Encontrar próximo nó
            const nextEdges = edges.filter(e => e.source_node_id === currentNodeId);

            if (nextEdges.length === 0) {
                // Fim do fluxo
                await dbQuery(
                    'UPDATE FlowRuns SET status = ?, context_json = ?, updated_at = NOW() WHERE id = ?',
                    ['completed', JSON.stringify(context), runId]
                );
                return { status: 'completed', responses: allResponses, waitingFor: null };
            }

            // Selecionar próximo nó
            let nextEdge;
            if (result.output === 'true' || result.output === 'false') {
                nextEdge = nextEdges.find(e => e.label?.toLowerCase() === result.output.toLowerCase());
                if (!nextEdge) nextEdge = nextEdges[0];
            } else if (result.output && result.output.startsWith('option_')) {
                const optionIndex = parseInt(result.output.replace('option_', ''));
                if (!isNaN(optionIndex) && optionIndex < nextEdges.length) {
                    nextEdge = nextEdges[optionIndex];
                } else {
                    nextEdge = nextEdges[0];
                }
            } else {
                nextEdge = nextEdges[0];
            }

            currentNodeId = nextEdge.target_node_id;

            // Atualizar execução
            await dbQuery(
                'UPDATE FlowRuns SET current_node_id = ?, context_json = ?, updated_at = NOW() WHERE id = ?',
                [currentNodeId, JSON.stringify(context), runId]
            );
        }

        // Limite de iterações atingido
        await dbQuery('UPDATE FlowRuns SET status = ?, updated_at = NOW() WHERE id = ?', ['error', runId]);
        return { status: 'error', error: 'Limite de iterações atingido', responses: allResponses };

    } catch (error) {
        console.error('Erro em advanceInSimulation:', error);
        await dbQuery('UPDATE FlowRuns SET status = ?, updated_at = NOW() WHERE id = ?', ['error', runId]);
        return { status: 'error', error: error.message, responses: allResponses };
    }
}

/**
 * Executa ação de um nó em modo simulação
 * @param {Object} node - Nó a executar
 * @param {Object} context - Contexto
 * @returns {Promise<Object>} - Resultado
 */
async function execActionInSimulation(node, context) {
    const type = node.type;
    let config = {};

    try {
        config = node.config ? JSON.parse(node.config) : {};
    } catch (_) {}

    const { replaceVariables, buildFlatContext } = require('../flows/helpers/contextHelper');
    context.flat = buildFlatContext(context);

    try {
        switch (type) {
            case 'start':
                return { output: 'continue' };

            case 'send_whatsapp':
                // Em simulação, apenas coleta a mensagem
                const message = await replaceVariables(config.message || '', context);
                if (message) {
                    context.simulatedResponses = context.simulatedResponses || [];
                    context.simulatedResponses.push({
                        type: 'text',
                        content: message,
                        timestamp: new Date().toISOString()
                    });
                }
                return { output: 'sent', success: true };

            case 'send_email':
                // Em simulação, registra mas não envia
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'email',
                    content: `[EMAIL] Para: ${config.to}, Assunto: ${config.subject}`,
                    timestamp: new Date().toISOString()
                });
                return { output: 'sent', success: true };

            case 'condition':
                const { evalConditions } = require('../flows/core/flowEngine');
                const conditions = config.conditions || [];
                const condResult = evalConditions(conditions, context.flat);
                return { output: condResult ? 'true' : 'false' };

            case 'wait_reply':
                return {
                    output: 'wait',
                    waitType: 'reply',
                    variableName: config.variableName || 'resposta_usuario'
                };

            case 'wait_reply_conditional':
                return {
                    output: 'wait',
                    waitType: 'reply_conditional',
                    variableName: config.variableName || 'resposta_usuario'
                };

            case 'wait_reply_options':
                const options = config.options || [];
                const menuMessage = config.message || '';
                let menuText = await replaceVariables(menuMessage, context) + '\n\n';
                options.forEach((opt, idx) => {
                    menuText += `${idx + 1} - ${opt.label}\n`;
                });

                // Enviar menu como mensagem
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'menu',
                    content: menuText.trim(),
                    options: options.map(o => o.label),
                    timestamp: new Date().toISOString()
                });

                return {
                    output: 'wait',
                    waitType: 'wait_reply_options',
                    options: options
                };

            case 'delay':
                // Em simulação, não aguarda de verdade
                return { output: 'continue' };

            case 'update_cliente':
            case 'create_negocio':
            case 'update_negocio':
            case 'create_agendamento':
            case 'update_agendamento':
                // Em simulação, registra mas não executa de verdade
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'action',
                    content: `[AÇÃO] ${type}: ${JSON.stringify(config)}`,
                    timestamp: new Date().toISOString()
                });
                return { output: 'continue' };

            case 'forward_contact':
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'forward',
                    content: `[ENCAMINHAMENTO] Para: ${(config.phones || []).map(p => p.label || p.phone).join(', ')}`,
                    timestamp: new Date().toISOString()
                });
                return { output: 'continue' };

            case 'ai_actions':
                // Processar IA de verdade usando o aiProcessor
                // NOTA: O processAIActions chama sendWhatsAppMessage internamente,
                // que já adiciona ao simulatedResponses com audioUrl
                try {
                    const { processAIActions } = require('../flows/core/aiProcessor');

                    const aiResult = await processAIActions(node, context);

                    // A resposta já foi adicionada ao simulatedResponses pelo sendWhatsAppMessage
                    // Apenas adicionar ao histórico se houver resposta
                    if (aiResult && aiResult.response) {
                        // IMPORTANTE: Adicionar resposta da IA ao histórico
                        addMessageToHistory(context, 'model', aiResult.response);
                    }

                    // ai_actions deve aguardar próxima mensagem para conversa contínua
                    // Isso permite que o fluxo mantenha a conversa com a IA
                    return {
                        output: 'wait',
                        waitType: 'ai_conversation',
                        variableName: 'ultima_mensagem',
                        add: aiResult?.add || {}
                    };

                } catch (aiError) {
                    console.error(`Erro ao processar IA (ai_actions):`, aiError);
                    context.simulatedResponses = context.simulatedResponses || [];
                    context.simulatedResponses.push({
                        type: 'ai_error',
                        content: `[ERRO IA] ${aiError.message}`,
                        timestamp: new Date().toISOString()
                    });
                    return { output: 'continue', add: { ai_error: aiError.message } };
                }

            case 'ai_decision':
                // Processar decisão da IA
                try {
                    const { processAIDecision } = require('../flows/core/aiProcessor');
                    const decisionResult = await processAIDecision(node, context);

                    return {
                        output: decisionResult?.output || 'true',
                        add: decisionResult?.add || {}
                    };

                } catch (aiError) {
                    console.error(`Erro ao processar IA (ai_decision):`, aiError);
                    return { output: 'true', add: { ai_error: aiError.message } };
                }

            case 'ai_options':
                // Processar opções da IA
                try {
                    const { processAIOptions } = require('../flows/core/aiProcessor');
                    const optionsResult = await processAIOptions(node, context);

                    return {
                        output: optionsResult?.output || 'option_0',
                        add: optionsResult?.add || {}
                    };

                } catch (aiError) {
                    console.error(`Erro ao processar IA (ai_options):`, aiError);
                    return { output: 'option_0', add: { ai_error: aiError.message } };
                }

            case 'redirect_flow':
                // Em simulação, registra redirecionamento
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'redirect',
                    content: `[REDIRECIONAMENTO] Para fluxo ID: ${config.targetFlowId}`,
                    timestamp: new Date().toISOString()
                });
                return { output: 'stop' };

            case 'block_flows':
                return { output: 'continue', add: { flows_blocked: config.action === 'block' } };

            case 'http':
                context.simulatedResponses = context.simulatedResponses || [];
                context.simulatedResponses.push({
                    type: 'http',
                    content: `[HTTP] ${config.method || 'GET'} ${config.url}`,
                    timestamp: new Date().toISOString()
                });
                return { output: 'continue' };

            default:
                return { output: 'continue' };
        }

    } catch (error) {
        console.error(`Erro ao executar nó ${type}:`, error);
        return { output: 'error', error: error.message };
    }
}

// ============================================================
// ROTAS DE ÁUDIO E TTS
// ============================================================

/**
 * GET /flow-test/tts-status
 * Obtém status atual do TTS
 */
router.get('/tts-status', async (req, res) => {
    try {
        const { getTTSStatus, getAudioConfig } = require('../flows/helpers/textToSpeech');
        const status = await getTTSStatus();
        const config = await getAudioConfig();

        res.json({
            success: true,
            tts: {
                enabled: config.audio.ativo || false,
                hasApiKey: !!config.apiKey,
                currentGenero: config.comportamento.genero || 'neutro',
                customVoiceId: config.customVoiceId || null,
                counter: status.counter,
                cycle: status.cycle,
                nextWillBeAudio: status.nextWillBeAudio
            }
        });
    } catch (error) {
        console.error('Erro em tts-status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /flow-test/tts-preview
 * Gera preview de áudio com uma voz específica
 */
router.post('/tts-preview', async (req, res) => {
    try {
        const { text = 'Olá! Esta é uma prévia da voz selecionada.', voiceId } = req.body;

        if (!voiceId) {
            return res.status(400).json({
                success: false,
                error: 'voiceId é obrigatório'
            });
        }

        const { getAudioConfig, textToSpeech } = require('../flows/helpers/textToSpeech');
        const config = await getAudioConfig();

        if (!config.apiKey) {
            return res.status(400).json({
                success: false,
                error: 'API Key do ElevenLabs não configurada'
            });
        }

        // Gerar áudio com a voz especificada
        const https = require('https');
        const fs = require('fs').promises;
        const path = require('path');

        const postData = JSON.stringify({
            text: text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability: 0.72,
                similarity_boost: 0.80,
                style: 0.10,
                use_speaker_boost: true
            }
        });

        const audioBuffer = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.elevenlabs.io',
                port: 443,
                path: `/v1/text-to-speech/${voiceId}`,
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': config.apiKey,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (response) => {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`ElevenLabs error: ${response.statusCode}`));
                        return;
                    }
                    resolve(Buffer.concat(chunks));
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        // Salvar arquivo temporário
        const audioDir = path.join(__dirname, '../../uploads/audio-tts');
        await fs.mkdir(audioDir, { recursive: true });

        const filename = `preview-${voiceId}-${Date.now()}.mp3`;
        const filePath = path.join(audioDir, filename);
        await fs.writeFile(filePath, audioBuffer);

        // URL para acessar o áudio
        const audioUrl = `/uploads/audio-tts/${filename}`;

        res.json({
            success: true,
            voiceId,
            audioUrl,
            audioPath: filePath,
            size: audioBuffer.length
        });

    } catch (error) {
        console.error('Erro em tts-preview:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /flow-test/reset-tts-counter
 * Reseta o contador de TTS
 */
router.post('/reset-tts-counter', async (req, res) => {
    try {
        const { resetTTSCounter } = require('../flows/helpers/textToSpeech');
        resetTTSCounter();
        res.json({ success: true, message: 'Contador TTS resetado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
