/**
 * 🌐 HTTP ACTIONS - Requisições HTTP em fluxos
 * 
 * Funções para fazer requisições HTTP e processar respostas
 */

const axios = require('axios');
const { replaceVariables } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');

/**
 * Executar requisição HTTP
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
async function executeHttp(config, context) {
    flowLog.actionSuccess('http', { step: 'start' });
    
    try {
        // Processar URL com variáveis
        const url = await replaceVariables(config.url || '', context);
        
        if (!url) {
            flowLog.actionError('http', new Error('URL não fornecida'));
            return { success: false, error: 'URL não fornecida' };
        }

        flowLog.actionSuccess('http', { step: 'url_processada', url });

        // Processar headers
        const headers = {};
        if (config.headers && Array.isArray(config.headers)) {
            for (const header of config.headers) {
                if (header.key && header.value) {
                    headers[header.key] = await replaceVariables(header.value, context);
                }
            }
        }

        // Processar body
        let body = null;
        if (config.body && (config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH')) {
            body = await replaceVariables(config.body, context);
            
            // Tentar fazer parse se bodyType for json
            if (config.bodyType === 'json' && typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch (e) {
                    flowLog.log('WARN', 'Erro ao fazer parse do body JSON, usando string');
                }
            }
        }

        // Configurar requisição
        const axiosConfig = {
            method: config.method || 'GET',
            url: url,
            headers: headers,
            timeout: (config.timeout || 30) * 1000
        };

        if (body) {
            axiosConfig.data = body;
        }

        flowLog.actionSuccess('http', { step: 'enviando_requisicao', method: config.method, url });

        // Executar requisição
        const response = await axios(axiosConfig);

        flowLog.actionSuccess('http', { 
            step: 'requisicao_concluida', 
            status: response.status,
            dataSize: JSON.stringify(response.data).length
        });

        // Processar variáveis de resposta
        const contextUpdates = {
            http_response_status: response.status,
            http_response_statusText: response.statusText,
            http_response_data: response.data,
            http_response_headers: response.headers,
            http_success: true
        };

        // Mapear variáveis personalizadas
        if (config.responseVariables && Array.isArray(config.responseVariables)) {
            for (const varConfig of config.responseVariables) {
                // Aceitar tanto 'variableName' (backend) quanto 'name' (frontend) para compatibilidade
                const varName = varConfig.variableName || varConfig.name;
                if (varConfig.path && varName) {
                    try {
                        // Usar eval para acessar propriedades aninhadas
                        // ex: path = "data.user.name" -> response.data.user.name
                        const value = eval(`response.${varConfig.path}`);
                        contextUpdates[varName] = value;
                        flowLog.log('INFO', `Variável mapeada: ${varName} = ${value}`);
                    } catch (error) {
                        flowLog.log('WARN', `Erro ao mapear variável ${varName}: ${error.message}`);
                    }
                }
            }
        }

        return {
            success: true,
            message: `Requisição HTTP concluída com status ${response.status}`,
            ...contextUpdates
        };

    } catch (error) {
        flowLog.actionError('http', error);
        
        // Capturar detalhes do erro da requisição
        const errorDetails = {
            success: false,
            http_success: false,
            http_error: error.message
        };

        if (error.response) {
            // Erro da resposta HTTP
            errorDetails.http_response_status = error.response.status;
            errorDetails.http_response_statusText = error.response.statusText;
            errorDetails.http_response_data = error.response.data;
        } else if (error.request) {
            // Requisição foi feita mas não houve resposta
            errorDetails.http_error = 'Sem resposta do servidor';
        }

        return errorDetails;
    }
}

module.exports = {
    executeHttp
};

