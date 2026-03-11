/**
 * 🛡️ FLOW INTERRUPTION MANAGER - Sistema de Interrupção de Fluxos
 * 
 * Sistema robusto para gerenciar interrupções de fluxos, prioridades e palavras-chave globais
 * 
 * Funcionalidades:
 * 1. Palavras-chave globais que funcionam em qualquer fluxo
 * 2. Sistema de prioridades (fluxos com maior prioridade interrompem os menores)
 * 3. Análise de intenção (detecta se mensagem deveria acionar outro fluxo)
 * 4. Controle de interrupção (alguns fluxos não podem ser interrompidos)
 */

const moment = require('moment');
const dbQuery = require('../../utils/dbHelper');
const { flowLog } = require('../helpers/logHelper');

/**
 * Verificar se a mensagem contém uma palavra-chave global
 * @param {String} message - Mensagem do usuário
 * @param {Object} currentRun - Execução atual do fluxo (pode ser null)
 * @returns {Promise<Object|null>} - { flowId, keyword, action } ou null
 */
async function checkGlobalKeywords(message, currentRun = null) {
    flowLog.log('INFO', 'Verificando palavras-chave globais', { 
        message: message?.substring(0, 50),
        hasCurrentRun: !!currentRun 
    });

    if (!message || typeof message !== 'string') {
        return null;
    }

    const normalizedMessage = message.trim().toLowerCase();

    try {
        const flowsWithKeywords = await dbQuery(`
            SELECT id, name, priority, interruptible, global_keywords, trigger_type
            FROM Flows 
            WHERE status = 'ativo' 
            AND global_keywords IS NOT NULL
            ORDER BY priority DESC
        `);

        flowLog.log('DEBUG', `Fluxos com palavras-chave: ${flowsWithKeywords.length}`);

        for (const flow of flowsWithKeywords) {
            let keywords = [];

            try {
                keywords = typeof flow.global_keywords === 'string' 
                    ? JSON.parse(flow.global_keywords) 
                    : flow.global_keywords;
            } catch (error) {
                flowLog.log('ERROR', `Erro ao parsear keywords do fluxo ${flow.id}`, { error: error.message });
                continue;
            }

            if (!Array.isArray(keywords) || keywords.length === 0) {
                continue;
            }

            for (const keywordObj of keywords) {
                const keyword = keywordObj.keyword?.trim().toLowerCase();
                const matchType = keywordObj.matchType || 'exact';
                const action = keywordObj.action || 'trigger_flow';

                if (!keyword) continue;

                let match = false;

                switch (matchType) {
                    case 'exact':
                        match = normalizedMessage === keyword;
                        break;
                    case 'contains':
                        match = normalizedMessage.includes(keyword);
                        break;
                    case 'startsWith':
                        match = normalizedMessage.startsWith(keyword);
                        break;
                    case 'endsWith':
                        match = normalizedMessage.endsWith(keyword);
                        break;
                    case 'regex':
                        try {
                            const regex = new RegExp(keyword, 'i');
                            match = regex.test(normalizedMessage);
                        } catch (error) {
                            flowLog.log('ERROR', `Erro ao processar regex`, { keyword, error: error.message });
                            match = false;
                        }
                        break;
                    default:
                        match = normalizedMessage === keyword;
                }

                if (match) {
                    flowLog.log('INFO', `Palavra-chave global encontrada: ${keyword}`, {
                        flowId: flow.id,
                        flowName: flow.name,
                        action
                    });

                    return {
                        flowId: flow.id,
                        flowName: flow.name,
                        keyword: keyword,
                        matchType: matchType,
                        action: action,
                        priority: flow.priority,
                        fullKeywordConfig: keywordObj
                    };
                }
            }
        }

        return null;

    } catch (error) {
        flowLog.log('ERROR', 'Erro ao verificar palavras-chave globais', { error: error.message });
        return null;
    }
}

/**
 * Verificar se um fluxo pode interromper o fluxo atual baseado em prioridade
 * @param {Object} currentRun - Execução do fluxo atual
 * @param {Number} newFlowId - ID do novo fluxo que deseja ser iniciado
 * @returns {Promise<Object>} - { canInterrupt: boolean, reason: string, currentPriority: number, newPriority: number }
 */
async function canInterruptFlow(currentRun, newFlowId) {
    flowLog.log('INFO', 'Verificando possibilidade de interrupção', {
        currentRunId: currentRun?.id,
        newFlowId
    });

    if (!currentRun) {
        return { 
            canInterrupt: true, 
            reason: 'Nenhum fluxo ativo',
            currentPriority: 0,
            newPriority: 0
        };
    }

    try {
        const currentFlowQuery = await dbQuery('SELECT * FROM Flows WHERE id = ?', [currentRun.flow_id]);
        
        if (!currentFlowQuery || currentFlowQuery.length === 0) {
            return { 
                canInterrupt: true, 
                reason: 'Fluxo atual não encontrado',
                currentPriority: 0,
                newPriority: 0
            };
        }

        const currentFlow = currentFlowQuery[0];
        const currentPriority = currentFlow.priority || 50;
        const isInterruptible = currentFlow.interruptible !== 0;

        flowLog.log('DEBUG', 'Fluxo atual', {
            name: currentFlow.name,
            priority: currentPriority,
            interruptible: isInterruptible
        });

        if (!isInterruptible) {
            flowLog.log('WARN', 'Fluxo atual não é interruptível');
            return {
                canInterrupt: false,
                reason: 'Fluxo atual não é interruptível',
                currentPriority: currentPriority,
                newPriority: 0
            };
        }

        const newFlowQuery = await dbQuery('SELECT * FROM Flows WHERE id = ?', [newFlowId]);
        
        if (!newFlowQuery || newFlowQuery.length === 0) {
            return { 
                canInterrupt: false, 
                reason: 'Novo fluxo não encontrado',
                currentPriority: currentPriority,
                newPriority: 0
            };
        }

        const newFlow = newFlowQuery[0];
        const newPriority = newFlow.priority || 50;

        flowLog.log('DEBUG', 'Novo fluxo', {
            name: newFlow.name,
            priority: newPriority
        });

        if (newPriority > currentPriority) {
            flowLog.log('INFO', 'Pode interromper - Nova prioridade maior', {
                currentPriority,
                newPriority
            });
            return {
                canInterrupt: true,
                reason: `Nova prioridade (${newPriority}) maior que atual (${currentPriority})`,
                currentPriority: currentPriority,
                newPriority: newPriority
            };
        } else {
            flowLog.log('WARN', 'Não pode interromper - Prioridade insuficiente', {
                currentPriority,
                newPriority
            });
            return {
                canInterrupt: false,
                reason: `Nova prioridade (${newPriority}) não é maior que atual (${currentPriority})`,
                currentPriority: currentPriority,
                newPriority: newPriority
            };
        }

    } catch (error) {
        flowLog.log('ERROR', 'Erro ao verificar possibilidade de interrupção', { error: error.message });
        return {
            canInterrupt: false,
            reason: 'Erro ao verificar interrupção',
            currentPriority: 0,
            newPriority: 0,
            error: error.message
        };
    }
}

/**
 * Interromper fluxo atual e iniciar novo fluxo
 * @param {Object} currentRun - Execução do fluxo atual
 * @param {Number} newFlowId - ID do novo fluxo
 * @param {String} reason - Motivo da interrupção
 * @returns {Promise<Boolean>} - true se interrompeu com sucesso
 */
async function interruptCurrentFlow(currentRun, newFlowId, reason) {
    flowLog.flowInterrupted(currentRun.flow_id, currentRun.id, reason);

    try {
        const context = typeof currentRun.context_json === 'string' 
            ? JSON.parse(currentRun.context_json) 
            : currentRun.context_json;

        context.interrupted_at = moment().format('YYYY-MM-DD HH:mm:ss');
        context.interrupted_by_flow = newFlowId;
        context.interrupted_reason = reason;

        await dbQuery(
            `UPDATE FlowRuns 
             SET status = 'interrupted', 
                 waiting_for_response = 0,
                 context_json = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(context), currentRun.id]
        );

        flowLog.log('INFO', 'Fluxo interrompido com sucesso', {
            runId: currentRun.id,
            newFlowId,
            reason
        });

        return true;

    } catch (error) {
        flowLog.log('ERROR', 'Erro ao interromper fluxo', { error: error.message });
        return false;
    }
}

/**
 * Analisar intenção da mensagem e sugerir melhor fluxo
 * @param {String} message - Mensagem do usuário
 * @param {Object} currentRun - Execução atual (pode ser null)
 * @returns {Promise<Object|null>} - { flowId, flowName, confidence, keywords } ou null
 */
async function analyzeIntention(message, currentRun = null) {
    flowLog.log('INFO', 'Analisando intenção da mensagem', {
        message: message?.substring(0, 50)
    });

    if (!message || typeof message !== 'string') {
        return null;
    }

    const normalizedMessage = message.trim().toLowerCase();

    try {
        const flows = await dbQuery(`
            SELECT id, name, priority, trigger_conditions
            FROM Flows 
            WHERE status = 'ativo' 
            AND trigger_type = 'mensagem_whatsapp'
            ORDER BY priority DESC
        `);

        flowLog.log('DEBUG', `Fluxos de mensagem encontrados: ${flows.length}`);

        let bestMatch = null;
        let highestConfidence = 0;

        for (const flow of flows) {
            if (currentRun && flow.id === currentRun.flow_id) {
                continue;
            }

            let conditions = [];
            if (flow.trigger_conditions) {
                try {
                    conditions = typeof flow.trigger_conditions === 'string'
                        ? JSON.parse(flow.trigger_conditions)
                        : flow.trigger_conditions;
                } catch (error) {
                    flowLog.log('ERROR', `Erro ao parsear conditions do fluxo ${flow.id}`);
                    continue;
                }
            }

            let confidence = 0;
            let matchedKeywords = [];

            for (const condition of conditions) {
                if (condition.field === 'incoming_text' || condition.field === 'ultima_mensagem') {
                    const value = condition.value?.toLowerCase() || '';
                    
                    switch (condition.operator) {
                        case 'contains':
                            if (normalizedMessage.includes(value)) {
                                confidence += 30;
                                matchedKeywords.push(value);
                            }
                            break;
                        case 'eq':
                            if (normalizedMessage === value) {
                                confidence += 50;
                                matchedKeywords.push(value);
                            }
                            break;
                        case 'regex':
                            try {
                                const regex = new RegExp(value, 'i');
                                if (regex.test(normalizedMessage)) {
                                    confidence += 40;
                                    matchedKeywords.push(value);
                                }
                            } catch (error) {
                                // Ignore regex errors
                            }
                            break;
                    }
                }
            }

            if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestMatch = {
                    flowId: flow.id,
                    flowName: flow.name,
                    confidence: confidence,
                    keywords: matchedKeywords,
                    priority: flow.priority
                };
            }
        }

        if (bestMatch && highestConfidence >= 30) {
            flowLog.log('INFO', 'Melhor match encontrado', bestMatch);
            return bestMatch;
        }

        return null;

    } catch (error) {
        flowLog.log('ERROR', 'Erro ao analisar intenção', { error: error.message });
        return null;
    }
}

/**
 * Processar mensagem com sistema de interrupção
 * Esta é a função principal que orquestra toda a lógica
 * @param {Object} params - { phone, chatId, text }
 * @returns {Promise<Object>} - Resultado do processamento
 */
async function processMessageWithInterruption({ phone, chatId, text }) {
    flowLog.log('INFO', '=== PROCESSAMENTO DE MENSAGEM COM INTERRUPÇÃO ===', {
        phone,
        chatId,
        text: text?.substring(0, 50)
    });

    try {
        const phoneToSearch = phone.slice(-8);

        // 1️⃣ Buscar execução atual
        const currentRunQuery = await dbQuery(`
            SELECT * FROM FlowRuns 
            WHERE status = 'running' 
            AND (phone LIKE ? OR chat_id = ?)
            ORDER BY id DESC
            LIMIT 1
        `, [`%${phoneToSearch}%`, chatId]);

        const currentRun = currentRunQuery && currentRunQuery.length > 0 ? currentRunQuery[0] : null;
        
        // 2️⃣ Verificar palavras-chave globais (PRIMEIRA PRIORIDADE)
        const globalKeyword = await checkGlobalKeywords(text, currentRun);

        if (globalKeyword) {
            flowLog.log('INFO', '✨ PALAVRA-CHAVE GLOBAL DETECTADA', {
                keyword: globalKeyword.keyword,
                flowId: globalKeyword.flowId
            });

            // Verificar se cliente está bloqueado e desbloquear automaticamente
            const { findClienteByPhoneBlocked } = require('../../utils/clienteHelper');
            const clienteBlockedResult = await findClienteByPhoneBlocked(phoneToSearch, true);
            const clienteBlocked = clienteBlockedResult ? [clienteBlockedResult] : [];

            if (clienteBlocked && clienteBlocked.length > 0) {
                flowLog.log('INFO', 'Cliente bloqueado - Desbloqueando automaticamente', {
                    clienteId: clienteBlocked[0].cli_Id
                });

                await dbQuery(`
                    UPDATE CLIENTES
                    SET flows_blocked = 0,
                        updated_at = NOW()
                    WHERE cli_Id = ?
                `, [clienteBlocked[0].cli_Id]);

                // Remover tag de "aguardando atendimento" do WhatsApp
                if (chatId) {
                    try {
                        const { removeWaitingForAgentTag } = require('../../zap/chats');
                        // Determinar clientId baseado na empresa do cliente
                        const clienteEmpresa = clienteBlocked[0].empresa_id || 1;
                        await removeWaitingForAgentTag(`atendimento_${clienteEmpresa}`, chatId);
                    } catch (tagErr) {
                        console.log('⚠️ Não foi possível remover tag do WhatsApp:', tagErr.message);
                    }
                }
            }

            // Interromper fluxo atual se existir
            if (currentRun) {
                await interruptCurrentFlow(
                    currentRun, 
                    globalKeyword.flowId, 
                    `Palavra-chave global: "${globalKeyword.keyword}"`
                );
            }

            return {
                processed: true,
                action: 'global_keyword',
                globalKeyword: globalKeyword,
                shouldContinue: true,
                newFlowId: globalKeyword.flowId,
                interruptedRun: currentRun ? currentRun.id : null,
                wasBlocked: clienteBlocked && clienteBlocked.length > 0,
                unblocked: clienteBlocked && clienteBlocked.length > 0
            };
        }

        // 3️⃣ Verificar bloqueio permanente
        const { findClienteByPhoneBlocked } = require('../../utils/clienteHelper');
        const clienteBlockedResult = await findClienteByPhoneBlocked(phoneToSearch, true);
        const clienteBlocked = clienteBlockedResult ? [clienteBlockedResult] : [];

        if (clienteBlocked && clienteBlocked.length > 0) {
            flowLog.log('WARN', 'Cliente com bloqueio permanente', {
                clienteId: clienteBlocked[0].cli_Id
            });
            return { 
                processed: false, 
                reason: 'Cliente com bloqueio permanente',
                shouldContinue: false
            };
        }

        // 4️⃣ Se há execução aguardando resposta, analisar intenção
        if (currentRun && currentRun.waiting_for_response === 1) {
            const intention = await analyzeIntention(text, currentRun);

            if (intention && intention.confidence >= 50) {
                flowLog.log('INFO', 'Intenção alternativa detectada', intention);

                const canInterrupt = await canInterruptFlow(currentRun, intention.flowId);

                if (canInterrupt.canInterrupt) {
                    await interruptCurrentFlow(
                        currentRun, 
                        intention.flowId, 
                        `Intenção detectada (${intention.confidence}%): ${intention.keywords.join(', ')}`
                    );

                    return {
                        processed: true,
                        action: 'intention_redirect',
                        intention: intention,
                        shouldContinue: true,
                        newFlowId: intention.flowId,
                        interruptedRun: currentRun.id
                    };
                } else {
                    flowLog.log('INFO', 'Não pode interromper - continuando fluxo atual');
                }
            }

            return {
                processed: false,
                action: 'continue_current_flow',
                shouldContinue: true,
                currentRun: currentRun
            };
        }

        // 5️⃣ Sem interrupções necessárias
        flowLog.log('INFO', 'Prosseguir com lógica normal de disparo de fluxos');

        return {
            processed: false,
            action: 'normal_flow',
            shouldContinue: true
        };

    } catch (error) {
        flowLog.log('ERROR', 'Erro no processamento de interrupção', { error: error.message, stack: error.stack });

        return {
            processed: false,
            action: 'error',
            shouldContinue: true,
            error: error.message
        };
    }
}

module.exports = {
    checkGlobalKeywords,
    canInterruptFlow,
    interruptCurrentFlow,
    analyzeIntention,
    processMessageWithInterruption
};

