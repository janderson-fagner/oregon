/**
 * ✅ FLOW VALIDATOR - Validação de Fluxos e Nós
 * 
 * Funções para validar a integridade e configuração de fluxos
 */

const { flowLog } = require('../helpers/logHelper');

/**
 * Valida se um fluxo tem estrutura mínima válida
 * @param {Object} flow - Dados do fluxo
 * @returns {Object} - { valid: boolean, errors: Array }
 */
function validateFlow(flow) {
    const errors = [];
    
    if (!flow) {
        errors.push('Fluxo não fornecido');
        return { valid: false, errors };
    }
    
    if (!flow.id) {
        errors.push('Fluxo sem ID');
    }
    
    if (!flow.name || flow.name.trim() === '') {
        errors.push('Fluxo sem nome');
    }
    
    if (!flow.status) {
        errors.push('Fluxo sem status');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Valida se um nó tem configuração válida
 * @param {Object} node - Nó do fluxo
 * @returns {Object} - { valid: boolean, errors: Array }
 */
function validateNode(node) {
    const errors = [];
    
    if (!node) {
        errors.push('Nó não fornecido');
        return { valid: false, errors };
    }
    
    if (!node.id) {
        errors.push('Nó sem ID');
    }
    
    if (!node.type) {
        errors.push('Nó sem tipo');
    }
    
    // Validações específicas por tipo de nó
    const nodeValidators = {
        'send_whatsapp': validateSendWhatsappNode,
        'send_email': validateSendEmailNode,
        'condition': validateConditionNode,
        'create_agendamento': validateCreateAgendamentoNode,
        'update_agendamento': validateUpdateAgendamentoNode,
        'create_negocio': validateCreateNegocioNode,
        'update_negocio': validateUpdateNegocioNode,
        'wait_reply': validateWaitReplyNode,
        'ai_decision': validateAIDecisionNode
    };
    
    if (nodeValidators[node.type]) {
        const specificValidation = nodeValidators[node.type](node);
        errors.push(...specificValidation.errors);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validações específicas por tipo de nó
 */

function validateSendWhatsappNode(node) {
    const errors = [];
    const config = node.config || {};
    
    if (!config.message || config.message.trim() === '') {
        errors.push('Nó "Enviar Mensagem" sem mensagem configurada');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateSendEmailNode(node) {
    const errors = [];
    const config = node.config || {};
    
    if (!config.to) {
        errors.push('Nó "Enviar Email" sem destinatário');
    }
    
    if (!config.subject) {
        errors.push('Nó "Enviar Email" sem assunto');
    }
    
    if (!config.body) {
        errors.push('Nó "Enviar Email" sem corpo da mensagem');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateConditionNode(node) {
    const errors = [];
    const config = node.config || {};
    
    if (!config.conditions || !Array.isArray(config.conditions) || config.conditions.length === 0) {
        errors.push('Nó "Condição" sem condições configuradas');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateCreateAgendamentoNode(node) {
    const errors = [];
    const config = node.config || {};
    
    // Validações básicas - data e hora são importantes
    if (!config.data && !config.dataVariavel) {
        errors.push('Nó "Criar Agendamento" sem data configurada');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateUpdateAgendamentoNode(node) {
    const errors = [];
    const config = node.config || {};
    
    // Deve ter pelo menos um campo para atualizar
    const hasUpdateField = config.data || config.horaInicio || config.horaFim || 
                          config.statusId || config.observacoes || config.funcionarioId;
    
    if (!hasUpdateField) {
        errors.push('Nó "Atualizar Agendamento" sem campos para atualizar');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateCreateNegocioNode(node) {
    const errors = [];
    const config = node.config || {};
    
    if (!config.titulo) {
        errors.push('Nó "Criar Negócio" sem título');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateUpdateNegocioNode(node) {
    const errors = [];
    const config = node.config || {};
    
    // Deve ter pelo menos um campo para atualizar
    const hasUpdateField = config.titulo || config.valor || config.stageId || config.observacoes;
    
    if (!hasUpdateField) {
        errors.push('Nó "Atualizar Negócio" sem campos para atualizar');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateWaitReplyNode(node) {
    const errors = [];
    const config = node.config || {};
    
    if (!config.variableName) {
        errors.push('Nó "Aguardar Resposta" sem nome de variável configurado');
    }
    
    return { valid: errors.length === 0, errors };
}

function validateAIDecisionNode(node) {
    const errors = [];
    const config = node.config || {};
    
    if (!config.instructions || config.instructions.trim() === '') {
        errors.push('Nó "Decisão com IA" sem instruções configuradas');
    }
    
    return { valid: errors.length === 0, errors };
}

/**
 * Valida se há nós órfãos (sem conexões)
 * @param {Array} nodes - Lista de nós
 * @param {Array} edges - Lista de conexões
 * @returns {Object} - { valid: boolean, orphanNodes: Array }
 */
function validateNodeConnections(nodes, edges) {
    const orphanNodes = [];
    
    for (const node of nodes) {
        // Nó start não precisa ter entrada
        if (node.type === 'start') continue;
        
        // Verificar se tem alguma conexão de entrada
        const hasIncomingEdge = edges.some(edge => edge.target_node_id === node.id);
        
        if (!hasIncomingEdge) {
            orphanNodes.push({
                id: node.id,
                type: node.type,
                label: node.label
            });
        }
    }
    
    return {
        valid: orphanNodes.length === 0,
        orphanNodes
    };
}

/**
 * Valida se o fluxo tem nó inicial
 * @param {Array} nodes - Lista de nós
 * @returns {Object} - { valid: boolean, error: String }
 */
function validateStartNode(nodes) {
    const startNodes = nodes.filter(n => n.type === 'start');
    
    if (startNodes.length === 0) {
        return {
            valid: false,
            error: 'Fluxo sem nó inicial (start)'
        };
    }
    
    if (startNodes.length > 1) {
        return {
            valid: false,
            error: 'Fluxo com mais de um nó inicial'
        };
    }
    
    return {
        valid: true,
        error: null
    };
}

/**
 * Validação completa de fluxo (estrutura + nós + conexões)
 * @param {Object} flowData - { flow, nodes, edges }
 * @returns {Object} - { valid: boolean, errors: Array }
 */
function validateCompleteFlow(flowData) {
    const allErrors = [];
    
    // Validar estrutura do fluxo
    const flowValidation = validateFlow(flowData.flow);
    if (!flowValidation.valid) {
        allErrors.push(...flowValidation.errors);
    }
    
    // Validar nó inicial
    const startValidation = validateStartNode(flowData.nodes);
    if (!startValidation.valid) {
        allErrors.push(startValidation.error);
    }
    
    // Validar cada nó
    for (const node of flowData.nodes) {
        const nodeValidation = validateNode(node);
        if (!nodeValidation.valid) {
            allErrors.push(`Nó ${node.id} (${node.type}): ${nodeValidation.errors.join(', ')}`);
        }
    }
    
    // Validar triggers cron
    const cronValidation = validateCronTrigger(flowData.flow);
    if (!cronValidation.valid) {
        allErrors.push(...cronValidation.errors);
    }

    // Validar conexões
    const connectionValidation = validateNodeConnections(flowData.nodes, flowData.edges);
    if (!connectionValidation.valid) {
        for (const orphan of connectionValidation.orphanNodes) {
            allErrors.push(`Nó órfão (sem conexões de entrada): ${orphan.label || orphan.type} (ID: ${orphan.id})`);
        }
    }
    
    return {
        valid: allErrors.length === 0,
        errors: allErrors
    };
}

/**
 * Valida triggers do tipo cron
 * @param {Object} flow - Dados do fluxo
 * @returns {Object} - { valid: boolean, errors: Array }
 */
function validateCronTrigger(flow) {
    const errors = [];
    if (['cron_minuto', 'cron_diario', 'cron_hora'].includes(flow.trigger_type)) {
        let conditions = flow.trigger_conditions;
        if (typeof conditions === 'string') {
            try { conditions = JSON.parse(conditions); } catch(e) { conditions = []; }
        }
        if (!Array.isArray(conditions) || conditions.length === 0) {
            errors.push('Triggers do tipo Cron requerem pelo menos 1 condição configurada');
        }
    }
    return { valid: errors.length === 0, errors };
}

module.exports = {
    validateFlow,
    validateNode,
    validateNodeConnections,
    validateStartNode,
    validateCompleteFlow,
    validateCronTrigger
};

