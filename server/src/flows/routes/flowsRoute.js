/**
 * 📋 FLOWS ROUTE - Rotas da API de Fluxos
 * 
 * CRUD e operações de fluxos de automação
 */

const express = require('express');
const router = express.Router();
const dbQuery = require('../../utils/dbHelper');
const { getFlowById, startFlow, advance } = require('../core/flowEngine');
const { flowLog } = require('../helpers/logHelper');
const { getUserLoggedUser } = require('../../utils/functions');

// ===== CRUD BÁSICO =====

/**
 * GET / - Listar fluxos com paginação e filtros
 */
router.get('/', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let { q, page = 1, itemsPerPage = 10, sortBy, orderBy } = req.query;

        let whereClause = 'WHERE empresa_id = ?';
        let params = [empresa_id];

        if (q) {
            whereClause += ' AND name LIKE ?';
            params.push(`%${q}%`);
        }
        
        page = parseInt(page) || 1;
        itemsPerPage = parseInt(itemsPerPage) || 10;
        
        const offset = (page - 1) * itemsPerPage;
        const limit = itemsPerPage === -1 ? 1000 : itemsPerPage;
        
        // Contar total
        const countQuery = `SELECT COUNT(*) as total FROM Flows ${whereClause}`;
        const countResult = await dbQuery(countQuery, params);
        const totalFlows = countResult[0].total;
        
        // Buscar fluxos
        let orderClause = '';
        if (sortBy && orderBy) {
            orderClause = `ORDER BY ${sortBy} ${orderBy.toUpperCase()}`;
        } else {
            orderClause = 'ORDER BY created_at DESC';
        }
        
        const flowsQuery = `
            SELECT * FROM Flows 
            ${whereClause} 
            ${orderClause} 
            LIMIT ? OFFSET ?
        `;
        
        const flows = await dbQuery(flowsQuery, [...params, limit, offset]);
        
        res.json({
            flows,
            totalFlows,
            page: parseInt(page),
            itemsPerPage: parseInt(itemsPerPage)
        });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao listar fluxos', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

/**
 * GET /:id - Buscar fluxo por ID
 */
router.get('/:id', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const flowId = parseInt(req.params.id, 10);

        // Verificar se o fluxo pertence à empresa do usuário
        const flowCheck = await dbQuery('SELECT id FROM Flows WHERE id = ? AND empresa_id = ?', [flowId, empresa_id]);
        if (!flowCheck || flowCheck.length === 0) return res.status(404).json({ message: 'Não encontrado' });

        const data = await getFlowById(flowId);
        if (!data) return res.status(404).json({ message: 'Não encontrado' });
        res.json(data);
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao buscar fluxo', { error: err.message });
        res.status(500).json({ message: 'Ocorreu um erro ao buscar o fluxo', err: err.message }); 
    }
});

/**
 * POST / - Criar novo fluxo
 */
router.post('/', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            name,
            description,
            status = 'ativo',
            trigger_type = null,
            webhook_key = null,
            trigger_conditions = null,
            priority = 50,
            interruptible = true,
            global_keywords = null,
            nodes = [],
            edges = []
        } = req.body;

        const triggerConditionsJson = trigger_conditions && Array.isArray(trigger_conditions) && trigger_conditions.length > 0
            ? JSON.stringify(trigger_conditions)
            : null;

        const globalKeywordsJson = global_keywords && Array.isArray(global_keywords) && global_keywords.length > 0
            ? JSON.stringify(global_keywords)
            : null;

        const inserted = await dbQuery(
            'INSERT INTO Flows (name, description, status, trigger_type, webhook_key, trigger_conditions, priority, interruptible, global_keywords, empresa_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [name, description, status, trigger_type, webhook_key, triggerConditionsJson, priority, interruptible ? 1 : 0, globalKeywordsJson, empresa_id]
        );
        
        const flowId = inserted.insertId || inserted;
        
        // Inserir nós
        for (const n of nodes) {
            await dbQuery(
                'INSERT INTO FlowNodes (flow_id, type, label, config, position_x, position_y, empresa_id) VALUES (?,?,?,?,?,?,?)',
                [flowId, n.type, n.label || null, JSON.stringify(n.config || {}), n.position_x || 100, n.position_y || 100, empresa_id]
            );
        }

        // Inserir edges
        const allNodes = await dbQuery('SELECT * FROM FlowNodes WHERE flow_id = ? AND empresa_id = ?', [flowId, empresa_id]);
        const findNodeId = (idx) => allNodes[idx]?.id;

        for (const e of edges) {
            const sourceId = e.source_node_id || findNodeId(e.sourceIndex || 0);
            const targetId = e.target_node_id || findNodeId(e.targetIndex || 0);

            const finalSourceId = typeof sourceId === 'string' ? findNodeId(e.sourceIndex || 0) : sourceId;
            const finalTargetId = typeof targetId === 'string' ? findNodeId(e.targetIndex || 0) : targetId;

            if (finalSourceId && finalTargetId) {
                await dbQuery(
                    'INSERT INTO FlowEdges (flow_id, source_node_id, target_node_id, label, condition_json, empresa_id) VALUES (?,?,?,?,?,?)',
                    [flowId, finalSourceId, finalTargetId, e.label || null, JSON.stringify(e.condition || null), empresa_id]
                );
            }
        }
        
        flowLog.log('INFO', 'Fluxo criado com sucesso', { flowId, name });
        res.json({ id: flowId });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao criar fluxo', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

/**
 * PUT /:id - Atualizar fluxo existente
 */
router.put('/:id', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const id = parseInt(req.params.id, 10);
        const {
            name, 
            description, 
            status = 'ativo', 
            trigger_type = null, 
            webhook_key = null, 
            trigger_conditions = null,
            priority = 50,
            interruptible = true,
            global_keywords = null,
            nodes = [], 
            edges = [] 
        } = req.body;
        
        const triggerConditionsJson = trigger_conditions && Array.isArray(trigger_conditions) && trigger_conditions.length > 0 
            ? JSON.stringify(trigger_conditions) 
            : null;
        
        const globalKeywordsJson = global_keywords && Array.isArray(global_keywords) && global_keywords.length > 0
            ? JSON.stringify(global_keywords)
            : null;
        
        await dbQuery(
            'UPDATE Flows SET name=?, description=?, status=?, trigger_type=?, webhook_key=?, trigger_conditions=?, priority=?, interruptible=?, global_keywords=?, updated_at=NOW() WHERE id=? AND empresa_id=?',
            [name, description, status, trigger_type, webhook_key, triggerConditionsJson, priority, interruptible ? 1 : 0, globalKeywordsJson, id, empresa_id]
        );

        // Deletar nós e conexões antigas
        await dbQuery('DELETE FROM FlowEdges WHERE flow_id=? AND empresa_id=?', [id, empresa_id]);
        await dbQuery('DELETE FROM FlowNodes WHERE flow_id=? AND empresa_id=?', [id, empresa_id]);
        
        // Criar mapa de IDs
        const nodeIdMap = {};
        
        // Inserir novos nós
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const result = await dbQuery(
                'INSERT INTO FlowNodes (flow_id, type, label, config, position_x, position_y, empresa_id) VALUES (?,?,?,?,?,?,?)',
                [id, n.type, n.label || null, JSON.stringify(n.config || {}), n.position_x || 100, n.position_y || 100, empresa_id]
            );

            const newNodeId = result.insertId;
            nodeIdMap[i] = newNodeId;

            if (n.id) {
                nodeIdMap[`id_${n.id}`] = newNodeId;
            }

            if (n.label) {
                nodeIdMap[`label_${n.label}`] = newNodeId;
            }
        }

        // Buscar nós para fallback
        const allNodes = await dbQuery('SELECT * FROM FlowNodes WHERE flow_id = ? AND empresa_id = ? ORDER BY id', [id, empresa_id]);
        
        // Inserir edges
        for (const e of edges) {
            let sourceId, targetId;
            
            if (e.sourceIndex !== undefined && e.sourceIndex !== null) {
                sourceId = nodeIdMap[e.sourceIndex];
            } else if (e.source_node_id) {
                sourceId = nodeIdMap[`id_${e.source_node_id}`];
            } else if (e.source_label) {
                sourceId = nodeIdMap[`label_${e.source_label}`];
            }
            
            if (e.targetIndex !== undefined && e.targetIndex !== null) {
                targetId = nodeIdMap[e.targetIndex];
            } else if (e.target_node_id) {
                targetId = nodeIdMap[`id_${e.target_node_id}`];
            } else if (e.target_label) {
                targetId = nodeIdMap[`label_${e.target_label}`];
            }
            
            // Fallback
            if (!sourceId && e.source_label) {
                sourceId = allNodes.find(n => n.label === e.source_label)?.id;
            }
            if (!targetId && e.target_label) {
                targetId = allNodes.find(n => n.label === e.target_label)?.id;
            }
            
            if (!sourceId) sourceId = allNodes[0]?.id;
            if (!targetId) targetId = allNodes[0]?.id;
            
            if (sourceId && targetId) {
                await dbQuery(
                    'INSERT INTO FlowEdges (flow_id, source_node_id, target_node_id, label, condition_json, empresa_id) VALUES (?,?,?,?,?,?)',
                    [id, sourceId, targetId, e.label || null, JSON.stringify(e.condition || null), empresa_id]
                );
            }
        }

        flowLog.log('INFO', 'Fluxo atualizado com sucesso', { flowId: id, name });
        res.json({ ok: true });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao atualizar fluxo', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

/**
 * POST /:id/duplicate - Duplicar fluxo
 */
router.post('/:id/duplicate', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const flowId = parseInt(req.params.id, 10);

        const originalFlow = await dbQuery('SELECT * FROM Flows WHERE id = ? AND empresa_id = ?', [flowId, empresa_id]);
        
        if (!originalFlow || originalFlow.length === 0) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }
        
        const flow = originalFlow[0];
        
        // Criar cópia
        const newFlowResult = await dbQuery(
            `INSERT INTO Flows (name, description, status, trigger_type, webhook_key, trigger_conditions, priority, interruptible, global_keywords, empresa_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                `${flow.name} (Cópia)`,
                flow.description,
                'inativo',
                flow.trigger_type,
                flow.webhook_key ? `${flow.webhook_key}_copy_${Date.now()}` : null,
                flow.trigger_conditions,
                flow.priority,
                flow.interruptible,
                flow.global_keywords,
                empresa_id
            ]
        );
        
        const newFlowId = newFlowResult.insertId;
        
        // Copiar nós
        const originalNodes = await dbQuery('SELECT * FROM FlowNodes WHERE flow_id = ? AND empresa_id = ?', [flowId, empresa_id]);
        const nodeIdMap = {};

        for (const node of originalNodes) {
            const newNodeResult = await dbQuery(
                `INSERT INTO FlowNodes (flow_id, type, label, config, position_x, position_y, empresa_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [newFlowId, node.type, node.label, node.config, node.position_x, node.position_y, empresa_id]
            );
            
            nodeIdMap[node.id] = newNodeResult.insertId;
        }
        
        // Copiar edges
        const originalEdges = await dbQuery('SELECT * FROM FlowEdges WHERE flow_id = ? AND empresa_id = ?', [flowId, empresa_id]);

        for (const edge of originalEdges) {
            const newSourceId = nodeIdMap[edge.source_node_id];
            const newTargetId = nodeIdMap[edge.target_node_id];

            if (newSourceId && newTargetId) {
                await dbQuery(
                    `INSERT INTO FlowEdges (flow_id, source_node_id, target_node_id, label, condition_json, empresa_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [newFlowId, newSourceId, newTargetId, edge.label, edge.condition_json, empresa_id]
                );
            }
        }
        
        flowLog.log('INFO', 'Fluxo duplicado com sucesso', { originalFlowId: flowId, newFlowId });
        res.json({ 
            ok: true, 
            newFlowId,
            message: 'Fluxo duplicado com sucesso'
        });
        
    } catch (err) {
        flowLog.log('ERROR', 'Erro ao duplicar fluxo', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /:id - Deletar fluxo
 */
router.delete('/:id', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const id = parseInt(req.params.id, 10);
        await dbQuery('DELETE FROM Flows WHERE id=? AND empresa_id=?', [id, empresa_id]);
        flowLog.log('INFO', 'Fluxo deletado', { flowId: id });
        res.json({ ok: true });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao deletar fluxo', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

/**
 * PUT /toggle-status/:id - Ativar/Desativar fluxo
 */
router.put('/toggle-status/:id', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;

        if (!status || !['ativo', 'inativo'].includes(status)) {
            return res.status(400).json({ message: 'Status inválido' });
        }

        await dbQuery('UPDATE Flows SET status=?, updated_at=NOW() WHERE id=? AND empresa_id=?', [status, id, empresa_id]);
        flowLog.log('INFO', `Fluxo ${status}`, { flowId: id });
        res.json({ ok: true, status });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao alterar status do fluxo', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

// ===== EXECUÇÃO DE FLUXOS =====

/**
 * POST /:id/run - Executar fluxo manualmente
 */
router.post('/:id/run', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const id = parseInt(req.params.id, 10);

        // Verificar se o fluxo pertence à empresa do usuário
        const flowCheck = await dbQuery('SELECT id FROM Flows WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!flowCheck || flowCheck.length === 0) return res.status(404).json({ message: 'Fluxo não encontrado' });

        const { startNodeId, phone, cliente = null, agendamento = null, chatId = null, context = {} } = req.body;
        const runId = await startFlow({ flowId: id, startNodeId, phone, cliente, agendamento, chatId, context });
        flowLog.log('INFO', 'Fluxo executado manualmente', { flowId: id, runId });
        res.json({ runId });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao executar fluxo', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

/**
 * POST /run/:runId/advance - Avançar execução
 */
router.post('/run/:runId/advance', getUserLoggedUser, async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const ok = await advance(runId);
        res.json({ ok });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao avançar execução', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

/**
 * POST /run/:runId/release-agent-block - Liberar bloqueio de atendimento
 */
router.post('/run/:runId/release-agent-block', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const runId = parseInt(req.params.runId, 10);

        const runs = await dbQuery('SELECT * FROM FlowRuns WHERE id = ? AND empresa_id = ?', [runId, empresa_id]);
        if (!runs || runs.length === 0) {
            return res.status(404).json({ message: 'Execução não encontrada' });
        }
        
        const run = runs[0];
        const context = JSON.parse(run.context_json || '{}');
        
        // Remover tag de "aguardando atendimento" do WhatsApp
        if (run.chat_id) {
            try {
                const { removeWaitingForAgentTag } = require('../../zap/chats');
                const clientId = context.clientId || `atendimento_${empresa_id}`;
                await removeWaitingForAgentTag(clientId, run.chat_id);
                flowLog.log('INFO', 'Tag de aguardando atendimento removida do WhatsApp');
            } catch (error) {
                flowLog.log('INFO', 'Não foi possível remover tag do WhatsApp:', error.message);
            }
        }
        
        delete context.waiting_for_agent;
        delete context.wait_for_agent;
        delete context.wait_for_agent_finish_message;
        
        await dbQuery(
            'UPDATE FlowRuns SET status = ?, waiting_for_response = 0, context_json = ? WHERE id = ? AND empresa_id = ?',
            ['completed', JSON.stringify(context), runId, empresa_id]
        );

        // Desbloquear fluxos do cliente se foi bloqueado por wait_for_agent
        if (run.cliente_id) {
            await dbQuery(
                `UPDATE CLIENTES SET flows_blocked = 0, flows_blocked_at = NULL, flows_blocked_reason = NULL
                 WHERE cli_Id = ? AND flows_blocked_reason = 'wait_for_agent'`,
                [run.cliente_id]
            );
        }

        flowLog.log('INFO', 'Bloqueio de atendimento liberado', { runId });
        
        res.json({ 
            ok: true, 
            message: 'Bloqueio de atendimento liberado com sucesso',
            runId 
        });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro ao liberar bloqueio', { error: err.message });
        res.status(500).json({ message: 'Erro ao liberar bloqueio', err: err.message }); 
    }
});

/**
 * ALL /webhook/:key - Webhook trigger
 */
router.all('/webhook/:key', async (req, res) => {
    try {
        const key = req.params.key;
        const flows = await dbQuery('SELECT * FROM Flows WHERE webhook_key = ? AND status = "ativo"', [key]);
        const flow = flows[0];
        
        if (!flow) return res.status(404).json({ message: 'Fluxo não encontrado' });

        const flowData = await getFlowById(flow.id);
        const startNode = flowData.nodes.find(n => n.type === 'start');
        
        if (!startNode) return res.status(400).json({ message: 'Nó inicial não encontrado' });

        const context = { webhook: { query: req.query, body: req.body, headers: req.headers } };
        const runId = await startFlow({ 
            flowId: flow.id, 
            startNodeId: startNode.id, 
            phone: null, 
            cliente: null, 
            agendamento: null, 
            chatId: null, 
            context 
        });
        
        flowLog.log('INFO', 'Fluxo disparado por webhook', { flowId: flow.id, runId, webhookKey: key });
        res.json({ ok: true, runId });
    } catch (err) { 
        flowLog.log('ERROR', 'Erro em webhook', { error: err.message });
        res.status(500).json({ message: 'Erro', err: err.message }); 
    }
});

module.exports = router;