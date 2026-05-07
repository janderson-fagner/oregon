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
            cron_time = null,
            cron_time_start = null,
            cron_time_end = null,
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
            'INSERT INTO Flows (name, description, status, trigger_type, webhook_key, trigger_conditions, priority, interruptible, global_keywords, cron_time, cron_time_start, cron_time_end, empresa_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [name, description, status, trigger_type, webhook_key, triggerConditionsJson, priority, interruptible ? 1 : 0, globalKeywordsJson, cron_time, cron_time_start, cron_time_end, empresa_id]
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
 * PUT /block-phone - Bloquear/desbloquear fluxos por telefone (para contatos sem cadastro)
 * Body: { phone, chatId, blocked }
 */
router.put('/block-phone', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { phone, chatId, blocked } = req.body;

        if (!phone && !chatId) {
            return res.status(400).json({ message: 'Phone ou chatId é obrigatório' });
        }

        const cleanPhone = phone ? phone.replace(/\D/g, '') : null;

        if (blocked) {
            // Verificar se já existe bloqueio
            let existing = null;
            if (chatId) {
                existing = await dbQuery('SELECT id FROM FlowBlockedPhones WHERE chat_id = ? AND empresa_id = ?', [chatId, empresa_id]);
            }
            if ((!existing || existing.length === 0) && cleanPhone) {
                existing = await dbQuery('SELECT id FROM FlowBlockedPhones WHERE phone = ? AND empresa_id = ?', [cleanPhone, empresa_id]);
            }

            if (!existing || existing.length === 0) {
                await dbQuery(
                    'INSERT INTO FlowBlockedPhones (phone, chat_id, empresa_id, blocked_at) VALUES (?, ?, ?, NOW())',
                    [cleanPhone || '', chatId || null, empresa_id]
                );
            }

            // Também completar FlowRuns em espera para esse telefone/chat
            if (chatId) {
                await dbQuery(
                    `UPDATE FlowRuns SET status = 'completed', waiting_for_response = 0, updated_at = NOW()
                     WHERE chat_id = ? AND status = 'running' AND empresa_id = ?`,
                    [chatId, empresa_id]
                );
            }

            flowLog.log('INFO', 'Fluxos bloqueados por telefone', { phone: cleanPhone, chatId });
        } else {
            // Desbloquear: remover da tabela
            if (chatId) {
                await dbQuery('DELETE FROM FlowBlockedPhones WHERE chat_id = ? AND empresa_id = ?', [chatId, empresa_id]);
            }
            if (cleanPhone) {
                const last8 = cleanPhone.slice(-8);
                await dbQuery(
                    `DELETE FROM FlowBlockedPhones WHERE RIGHT(REPLACE(phone, ' ', ''), 8) = ? AND empresa_id = ?`,
                    [last8, empresa_id]
                );
            }

            // Também completar FlowRuns em espera
            if (chatId) {
                await dbQuery(
                    `UPDATE FlowRuns SET status = 'completed', waiting_for_response = 0, updated_at = NOW()
                     WHERE chat_id = ? AND status = 'running' AND waiting_for_response = 1 AND empresa_id = ?`,
                    [chatId, empresa_id]
                );
            }

            flowLog.log('INFO', 'Fluxos desbloqueados por telefone', { phone: cleanPhone, chatId });
        }

        // Emitir evento socket para atualizar chat em tempo real
        try {
            const { emitChatStateUpdate } = require('../../utils/chatStateEmitter');
            emitChatStateUpdate(empresa_id, {
                chatId: chatId || null,
                phone: cleanPhone,
                phone_blocked: !!blocked,
                waiting_for_agent: false,
                agent_status: null,
                agent_user_id: null,
                reason: blocked ? 'phone_blocked' : 'phone_unblocked'
            });
        } catch (_) {}

        res.json({ ok: true, message: blocked ? 'Fluxos bloqueados' : 'Fluxos desbloqueados' });
    } catch (err) {
        flowLog.log('ERROR', 'Erro ao bloquear/desbloquear por telefone', { error: err.message });
        res.status(500).json({ message: 'Erro ao bloquear/desbloquear fluxos', err: err.message });
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
            cron_time = null,
            cron_time_start = null,
            cron_time_end = null,
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
            'UPDATE Flows SET name=?, description=?, status=?, trigger_type=?, webhook_key=?, trigger_conditions=?, priority=?, interruptible=?, global_keywords=?, cron_time=?, cron_time_start=?, cron_time_end=?, updated_at=NOW() WHERE id=? AND empresa_id=?',
            [name, description, status, trigger_type, webhook_key, triggerConditionsJson, priority, interruptible ? 1 : 0, globalKeywordsJson, cron_time, cron_time_start, cron_time_end, id, empresa_id]
        );

        // Finalizar FlowRuns running deste fluxo (evita runs órfãos com nós deletados)
        await dbQuery(
            `UPDATE FlowRuns SET status = 'error', waiting_for_response = 0, updated_at = NOW()
             WHERE flow_id = ? AND empresa_id = ? AND status = 'running'`,
            [id, empresa_id]
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
 * POST /run/:runId/start-attendance - Iniciar atendimento humano
 * Marca o run como "em atendimento" (sai de "aguardando")
 * Mantém o bloqueio de fluxos até o atendente finalizar via release-agent-block
 */
router.post('/run/:runId/start-attendance', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const userId = req.user.id || req.user.user_id || null;
        const runId = parseInt(req.params.runId, 10);

        const runs = await dbQuery('SELECT * FROM FlowRuns WHERE id = ? AND empresa_id = ?', [runId, empresa_id]);
        if (!runs || runs.length === 0) {
            return res.status(404).json({ message: 'Execução não encontrada' });
        }

        const run = runs[0];

        if (run.agent_status === 'in_attendance') {
            return res.json({
                ok: true,
                message: 'Atendimento já iniciado',
                runId,
                agent_status: 'in_attendance',
                agent_user_id: run.agent_user_id,
                agent_started_at: run.agent_started_at
            });
        }

        // Atualizar TODOS os runs em espera desse chat/telefone para "em atendimento"
        const whereConditions = ['empresa_id = ?', 'status = ?', 'waiting_for_response = 1'];
        const whereParams = [empresa_id, 'running'];

        if (run.chat_id) {
            whereConditions.push('chat_id = ?');
            whereParams.push(run.chat_id);
        } else if (run.phone) {
            whereConditions.push('phone = ?');
            whereParams.push(run.phone);
        } else {
            whereConditions.push('id = ?');
            whereParams.push(runId);
        }

        await dbQuery(
            `UPDATE FlowRuns
             SET agent_status = 'in_attendance',
                 agent_user_id = ?,
                 agent_started_at = NOW(),
                 updated_at = NOW()
             WHERE ${whereConditions.join(' AND ')}`,
            [userId, ...whereParams]
        );

        const updated = await dbQuery('SELECT agent_status, agent_user_id, agent_started_at FROM FlowRuns WHERE id = ? LIMIT 1', [runId]);

        // Trocar tag "aguardando atendimento" por "em atendimento" no WhatsApp
        if (run.chat_id) {
            try {
                const { addInAttendanceTag } = require('../../zap/chats');
                const context = JSON.parse(run.context_json || '{}');
                const clientId = context.clientId || `atendimento_${empresa_id}`;
                await addInAttendanceTag(clientId, run.chat_id).catch(() => {});
            } catch (tagErr) {
                flowLog.log('INFO', 'Nao foi possivel atualizar tag do WhatsApp em start-attendance', { error: tagErr.message });
            }
        }

        flowLog.log('INFO', 'Atendimento iniciado pelo usuário', { runId, userId, chatId: run.chat_id, phone: run.phone });

        // Emitir evento socket para atualizar chat em tempo real
        try {
            const { emitChatStateUpdate } = require('../../utils/chatStateEmitter');
            emitChatStateUpdate(empresa_id, {
                chatId: run.chat_id,
                phone: run.phone,
                clienteId: run.cliente_id,
                runId,
                agent_status: 'in_attendance',
                agent_user_id: userId,
                waiting_for_agent: true,
                reason: 'attendance_started'
            });
        } catch (_) {}

        res.json({
            ok: true,
            message: 'Atendimento iniciado',
            runId,
            agent_status: updated?.[0]?.agent_status || 'in_attendance',
            agent_user_id: updated?.[0]?.agent_user_id,
            agent_started_at: updated?.[0]?.agent_started_at
        });
    } catch (err) {
        flowLog.log('ERROR', 'Erro ao iniciar atendimento', { error: err.message });
        res.status(500).json({ message: 'Erro ao iniciar atendimento', err: err.message });
    }
});

/**
 * POST /attendance/start - Iniciar atendimento manual (sem run em espera)
 * Body: { chatId, phone, clienteId }
 * Se ja existe um run em espera desse chat/phone, marca como in_attendance (reusa a logica).
 * Caso contrario, cria um FlowRun "manual" (flow_id = NULL) apenas para rastrear o atendimento.
 */
router.post('/attendance/start', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const userId = req.user.id || req.user.user_id || null;
        const { chatId, phone, clienteId } = req.body || {};

        if (!chatId && !phone && !clienteId) {
            return res.status(400).json({ message: 'chatId, phone ou clienteId e obrigatorio' });
        }

        // Tentar localizar um run ja em execucao para esse chat/phone/cliente
        const whereLookup = ['empresa_id = ?', 'status = ?'];
        const paramsLookup = [empresa_id, 'running'];
        const orConditions = [];

        if (chatId) { orConditions.push('chat_id = ?'); paramsLookup.push(chatId); }
        if (phone) { orConditions.push('phone = ?'); paramsLookup.push(phone); }
        if (clienteId) { orConditions.push('cliente_id = ?'); paramsLookup.push(clienteId); }

        whereLookup.push('(' + orConditions.join(' OR ') + ')');

        const existing = await dbQuery(
            `SELECT * FROM FlowRuns WHERE ${whereLookup.join(' AND ')} ORDER BY id DESC LIMIT 1`,
            paramsLookup
        );

        let run = existing?.[0] || null;
        let runId = run?.id || null;
        let created = false;

        if (run && run.agent_status === 'in_attendance') {
            return res.json({
                ok: true,
                message: 'Atendimento ja iniciado',
                runId: run.id,
                agent_status: 'in_attendance',
                agent_user_id: run.agent_user_id,
                agent_started_at: run.agent_started_at,
                reused: true
            });
        }

        if (run) {
            // Reutilizar run existente - atualizar status de agent
            await dbQuery(
                `UPDATE FlowRuns
                 SET agent_status = 'in_attendance',
                     agent_user_id = ?,
                     agent_started_at = NOW(),
                     updated_at = NOW()
                 WHERE id = ?`,
                [userId, run.id]
            );
        } else {
            // Criar run manual (sem flow_id)
            const ctx = { manual_attendance: true, chatId, phone, clienteId };
            const result = await dbQuery(
                `INSERT INTO FlowRuns
                    (flow_id, status, cliente_id, chat_id, phone, context_json,
                     waiting_for_response, empresa_id, agent_status, agent_user_id, agent_started_at, created_at, updated_at)
                 VALUES (NULL, 'running', ?, ?, ?, ?, 0, ?, 'in_attendance', ?, NOW(), NOW(), NOW())`,
                [clienteId || null, chatId || null, phone || null, JSON.stringify(ctx), empresa_id, userId]
            );
            runId = result?.insertId || null;
            created = true;
        }

        // Aplicar tag "em atendimento" no WhatsApp
        if (chatId) {
            try {
                const { addInAttendanceTag } = require('../../zap/chats');
                const ctx = run ? JSON.parse(run.context_json || '{}') : {};
                const clientId = ctx.clientId || `atendimento_${empresa_id}`;
                await addInAttendanceTag(clientId, chatId).catch(() => {});
            } catch (tagErr) {
                flowLog.log('INFO', 'Nao foi possivel aplicar tag em atendimento', { error: tagErr.message });
            }
        }

        flowLog.log('INFO', 'Atendimento iniciado (manual/reusado)', { runId, userId, chatId, phone, created });

        // Emitir socket
        try {
            const { emitChatStateUpdate } = require('../../utils/chatStateEmitter');
            emitChatStateUpdate(empresa_id, {
                chatId: chatId || null,
                phone: phone || null,
                clienteId: clienteId || null,
                runId,
                agent_status: 'in_attendance',
                agent_user_id: userId,
                waiting_for_agent: true,
                reason: created ? 'attendance_started_manual' : 'attendance_started'
            });
        } catch (_) {}

        res.json({
            ok: true,
            message: 'Atendimento iniciado',
            runId,
            agent_status: 'in_attendance',
            agent_user_id: userId,
            created
        });
    } catch (err) {
        flowLog.log('ERROR', 'Erro ao iniciar atendimento manual', { error: err.message });
        res.status(500).json({ message: 'Erro ao iniciar atendimento', err: err.message });
    }
});

/**
 * POST /run/:runId/release-agent-block - Liberar bloqueio de atendimento
 * Libera o run específico E todos os outros runs/bloqueios do mesmo cliente/telefone
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

        // Remover TODAS as tags de atendimento (aguardando + em atendimento)
        if (run.chat_id) {
            try {
                const { removeAttendanceTags } = require('../../zap/chats');
                const clientId = context.clientId || `atendimento_${empresa_id}`;
                await removeAttendanceTags(clientId, run.chat_id).catch(() => {});
                flowLog.log('INFO', 'Tags de atendimento removidas do WhatsApp');
            } catch (error) {
                flowLog.log('INFO', 'Não foi possível remover tags do WhatsApp:', error.message);
            }
        }

        // Completar TODOS os FlowRuns em espera do mesmo chat/telefone (não só o run específico)
        const whereConditions = ['empresa_id = ?', 'status = ?', 'waiting_for_response = 1'];
        const whereParams = [empresa_id, 'running'];

        if (run.chat_id) {
            whereConditions.push('chat_id = ?');
            whereParams.push(run.chat_id);
        } else if (run.phone) {
            whereConditions.push('phone = ?');
            whereParams.push(run.phone);
        } else {
            // Fallback: só o run específico
            whereConditions.push('id = ?');
            whereParams.push(runId);
        }

        await dbQuery(
            `UPDATE FlowRuns SET status = 'completed', waiting_for_response = 0, updated_at = NOW() WHERE ${whereConditions.join(' AND ')}`,
            whereParams
        );

        // Também atualizar o run específico caso não tenha sido pego acima
        await dbQuery(
            'UPDATE FlowRuns SET status = ?, waiting_for_response = 0, updated_at = NOW() WHERE id = ? AND empresa_id = ?',
            ['completed', runId, empresa_id]
        );

        // Desbloquear fluxos do cliente (qualquer razão, não só wait_for_agent)
        if (run.cliente_id) {
            await dbQuery(
                `UPDATE CLIENTES SET flows_blocked = 0, flows_blocked_at = NULL, flows_blocked_reason = NULL
                 WHERE cli_Id = ?`,
                [run.cliente_id]
            );
        }

        // Também desbloquear na tabela FlowBlockedPhones por telefone/chat
        if (run.phone) {
            const cleanPhone = run.phone.replace(/\D/g, '').slice(-8);
            await dbQuery(
                `DELETE FROM FlowBlockedPhones WHERE RIGHT(REPLACE(phone, ' ', ''), 8) = ? AND empresa_id = ?`,
                [cleanPhone, empresa_id]
            );
        }
        if (run.chat_id) {
            await dbQuery(
                `DELETE FROM FlowBlockedPhones WHERE chat_id = ? AND empresa_id = ?`,
                [run.chat_id, empresa_id]
            );
        }

        flowLog.log('INFO', 'Bloqueio de atendimento liberado (completo)', { runId, chatId: run.chat_id, phone: run.phone });

        // Emitir evento socket para atualizar chat em tempo real
        try {
            const { emitChatStateUpdate } = require('../../utils/chatStateEmitter');
            emitChatStateUpdate(empresa_id, {
                chatId: run.chat_id,
                phone: run.phone,
                clienteId: run.cliente_id,
                runId,
                agent_status: null,
                agent_user_id: null,
                waiting_for_agent: false,
                flows_blocked: false,
                phone_blocked: false,
                reason: 'attendance_released'
            });
        } catch (_) {}

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