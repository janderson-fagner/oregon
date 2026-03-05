/**
 * ⏳ WAIT ACTIONS - Ações de espera e captura de respostas
 * 
 * Funções para gerenciar blocos de espera de resposta do usuário
 */

const { replaceVariables } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');
const dbQuery = require('../../utils/dbHelper');

/**
 * Converte valor e tipo de tempo para milissegundos
 * @param {Number} value - Valor do tempo
 * @param {String} type - Tipo (seconds, minutes, hours, days)
 * @returns {Number} - Tempo em milissegundos
 */
function convertTimeToMs(value, type = 'seconds') {
    if (!value || value === 0) return 0;
    
    const conversions = {
        'seconds': 1000,
        'minutes': 60 * 1000,
        'hours': 60 * 60 * 1000,
        'days': 24 * 60 * 60 * 1000
    };
    
    return value * (conversions[type] || conversions.seconds);
}

/**
 * Converte tempo em ms para formato legível
 * @param {Number} ms - Tempo em milissegundos
 * @returns {String} - Tempo formatado
 */
function formatTime(ms) {
    if (ms === 0) return 'sem limite';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} dia(s)`;
    if (hours > 0) return `${hours} hora(s)`;
    if (minutes > 0) return `${minutes} minuto(s)`;
    return `${seconds} segundo(s)`;
}

/**
 * Wait Reply - Aguardar resposta simples e capturar variáveis
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado
 */
async function executeWaitReply(config, context) {
    flowLog.actionSuccess('wait_reply', { step: 'start' });
    
    try {
        // Converter timeout para ms
        const timeoutValue = config.timeoutValue || config.timeoutSeconds || 0;
        const timeoutType = config.timeoutType || 'seconds';
        const timeoutMs = convertTimeToMs(timeoutValue, timeoutType);
        
        flowLog.log('INFO', `Aguardando resposta - Timeout: ${formatTime(timeoutMs)}`);
        
        // Configurar variáveis a capturar
        const variables = config.variables || [];
        flowLog.log('INFO', `Variáveis a capturar: ${variables.length}`);
        
        return {
            success: true,
            output: 'wait',
            waitType: 'reply',
            timeoutMs: timeoutMs,
            variables: variables,
            captureMode: 'simple'
        };
        
    } catch (error) {
        flowLog.actionError('wait_reply', error);
        return {
            success: false,
            output: 'continue',
            error: error.message
        };
    }
}

/**
 * Wait Reply Conditional - Aguardar resposta e avaliar condições
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado
 */
async function executeWaitReplyConditional(config, context) {
    flowLog.actionSuccess('wait_reply_conditional', { step: 'start' });
    
    try {
        // Converter timeout para ms
        const timeoutValue = config.timeoutValue || config.timeoutSeconds || 0;
        const timeoutType = config.timeoutType || 'seconds';
        const timeoutMs = convertTimeToMs(timeoutValue, timeoutType);
        
        flowLog.log('INFO', `Aguardando resposta condicional - Timeout: ${formatTime(timeoutMs)}`);
        
        // Configurar variáveis a capturar
        const variables = config.variables || [];
        const conditions = config.conditions || [];
        
        flowLog.log('INFO', `Variáveis: ${variables.length}, Condições: ${conditions.length}`);
        
        return {
            success: true,
            output: 'wait',
            waitType: 'reply_conditional',
            timeoutMs: timeoutMs,
            variables: variables,
            conditions: conditions,
            captureMode: 'conditional'
        };
        
    } catch (error) {
        flowLog.actionError('wait_reply_conditional', error);
        return {
            success: false,
            output: 'continue',
            error: error.message
        };
    }
}

/**
 * Wait Reply Options - Menu de opções interativo
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado
 */
async function executeWaitReplyOptions(config, context) {
    flowLog.actionSuccess('wait_reply_options', { step: 'start' });

    try {
        const options = config.options || [];
        const message = config.message || '';
        const maxAttempts = config.maxAttempts || 3;
        const invalidOptionMessage = config.invalidOptionMessage || 'Opção inválida. Por favor, escolha uma das opções acima.';

        // Converter timeout para ms (nova funcionalidade)
        const timeoutValue = config.timeoutValue || 0;
        const timeoutType = config.timeoutType || 'minutes';
        const timeoutMs = convertTimeToMs(timeoutValue, timeoutType);

        if (options.length === 0) {
            flowLog.log('WARN', 'Nenhuma opção configurada no menu');
            return {
                success: false,
                output: 'continue',
                error: 'Nenhuma opção configurada'
            };
        }

        // Processar mensagem com variáveis
        const processedMessage = await replaceVariables(message, context);

        // Montar texto do menu
        let menuText = processedMessage + '\n\n';
        options.forEach((option, index) => {
            menuText += `${index + 1} - ${option.label}\n`;
        });

        flowLog.log('INFO', `Menu com ${options.length} opções preparado - Timeout: ${formatTime(timeoutMs)}`);

        return {
            success: true,
            output: 'wait',
            waitType: 'options',
            menuText: menuText,
            options: options,
            maxAttempts: maxAttempts,
            invalidOptionMessage: invalidOptionMessage,
            captureMode: 'options',
            currentAttempt: 0,
            timeoutMs: timeoutMs
        };
        
    } catch (error) {
        flowLog.actionError('wait_reply_options', error);
        return {
            success: false,
            output: 'continue',
            error: error.message
        };
    }
}

/**
 * Processar resposta do wait_reply - capturar variáveis
 * @param {String} userResponse - Resposta do usuário
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto atual
 * @returns {Object} - Variáveis capturadas
 */
function processWaitReplyResponse(userResponse, config, context) {
    const variables = config.variables || [];
    const capturedVariables = {};
    
    if (variables.length === 0) {
        // Se não há variáveis configuradas, capturar em resposta_usuario
        capturedVariables.resposta_usuario = userResponse;
        return { variables: capturedVariables, variablesCaptured: 1 };
    }
    
    // Capturar cada variável configurada
    // Por padrão, todas recebem o mesmo valor (a resposta completa)
    // Isso pode ser expandido futuramente com regex ou IA
    for (const variable of variables) {
        if (variable.name) {
            capturedVariables[variable.name] = userResponse;
        }
    }
    
    // Sempre capturar em resposta_usuario também
    capturedVariables.resposta_usuario = userResponse;
    
    flowLog.log('INFO', `Variáveis capturadas: ${Object.keys(capturedVariables).join(', ')}`);
    
    return {
        variables: capturedVariables,
        variablesCaptured: Object.keys(capturedVariables).length
    };
}

/**
 * Processar resposta do wait_reply_conditional - capturar variáveis e avaliar condições
 * @param {String} userResponse - Resposta do usuário
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto atual
 * @returns {Object} - Variáveis e resultado da condição
 */
function processWaitReplyConditionalResponse(userResponse, config, context) {
    // Primeiro, capturar variáveis
    const variables = config.variables || [];
    const capturedVariables = {};
    
    for (const variable of variables) {
        if (variable.name) {
            capturedVariables[variable.name] = userResponse;
        }
    }
    
    capturedVariables.resposta_usuario = userResponse;
    
    // Adicionar resposta ao contexto temporário para avaliação
    const evalContext = { ...context, ...capturedVariables, ultima_mensagem: userResponse };
    
    // Avaliar condições
    const conditions = config.conditions || [];
    const { evalConditions } = require('../core/flowEngine');
    
    // Construir contexto flat
    const { buildFlatContext } = require('../helpers/contextHelper');
    const flatContext = buildFlatContext(evalContext);
    
    const conditionResult = evalConditions(conditions, flatContext);
    
    flowLog.log('INFO', `Condições avaliadas: ${conditionResult ? 'VERDADEIRO' : 'FALSO'}`);
    
    return {
        variables: capturedVariables,
        variablesCaptured: Object.keys(capturedVariables).length,
        conditionMet: conditionResult
    };
}

/**
 * Processar resposta do wait_reply_options
 * @param {String} userResponse - Resposta do usuário
 * @param {Array} options - Opções do menu
 * @returns {Object} - Resultado do processamento
 */
function processOptionsResponse(userResponse, options) {
    if (!userResponse || !options || options.length === 0) {
        return { valid: false, selectedIndex: -1 };
    }
    
    const response = userResponse.trim().toLowerCase();
    
    // 1. Tentar como número direto
    const numberMatch = response.match(/^(\d+)$/);
    if (numberMatch) {
        const num = parseInt(numberMatch[1]);
        if (num >= 1 && num <= options.length) {
            flowLog.log('INFO', `Opção selecionada por número: ${num}`);
            return { valid: true, selectedIndex: num - 1, option: options[num - 1] };
        }
    }
    
    // 2. Tentar match por texto contendo parte da label
    for (let i = 0; i < options.length; i++) {
        const optionLabel = options[i].label.toLowerCase();
        
        // Match exato
        if (optionLabel === response) {
            flowLog.log('INFO', `Opção selecionada por match exato: ${i + 1}`);
            return { valid: true, selectedIndex: i, option: options[i] };
        }
        
        // Contém texto da opção
        if (response.includes(optionLabel) || optionLabel.includes(response)) {
            flowLog.log('INFO', `Opção selecionada por contém: ${i + 1}`);
            return { valid: true, selectedIndex: i, option: options[i] };
        }
    }
    
    // 3. Buscar palavras-chave da label na resposta
    for (let i = 0; i < options.length; i++) {
        const optionWords = options[i].label.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const responseWords = response.split(/\s+/);
        
        for (const optionWord of optionWords) {
            for (const responseWord of responseWords) {
                if (responseWord.includes(optionWord) || optionWord.includes(responseWord)) {
                    flowLog.log('INFO', `Opção selecionada por palavra-chave: ${i + 1}`);
                    return { valid: true, selectedIndex: i, option: options[i] };
                }
            }
        }
    }
    
    flowLog.log('WARN', 'Nenhuma opção válida encontrada na resposta');
    return { valid: false, selectedIndex: -1 };
}

/**
 * Executar delay com suporte a value + type
 * @param {Object} config - Configuração do delay
 * @returns {Promise<Object>} - Resultado
 */
async function executeDelay(config) {
    flowLog.actionSuccess('delay', { step: 'start' });
    
    try {
        // Suportar formato antigo (seconds) e novo (value + type)
        let delayMs = 0;
        
        if (config.delayValue !== undefined && config.delayType) {
            // Novo formato
            delayMs = convertTimeToMs(config.delayValue, config.delayType);
        } else if (config.seconds !== undefined) {
            // Formato antigo (compatibilidade)
            delayMs = config.seconds * 1000;
        }
        
        flowLog.log('INFO', `Aguardando delay de ${formatTime(delayMs)}`);
        
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        return {
            success: true,
            output: 'continue',
            delayMs: delayMs
        };
        
    } catch (error) {
        flowLog.actionError('delay', error);
        return {
            success: false,
            output: 'continue',
            error: error.message
        };
    }
}

module.exports = {
    executeWaitReply,
    executeWaitReplyConditional,
    executeWaitReplyOptions,
    processWaitReplyResponse,
    processWaitReplyConditionalResponse,
    processOptionsResponse,
    executeDelay,
    convertTimeToMs,
    formatTime
};

