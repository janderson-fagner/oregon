/**
 * 🔧 CONTEXT HELPER - Gerenciamento de Contexto de Fluxos
 * 
 * Funções utilitárias para manipular e construir contextos de execução de fluxos
 * 
 * VARIÁVEIS SUPORTADAS (alinhadas com crmUtils.variaveisItens):
 * 
 * CLIENTE:
 * - cliente_nome, cliente_sobrenome, cliente_nomecompleto
 * - cliente_telefone, cliente_celular
 * - cliente_email
 * - cliente_cpf
 * - cliente_data_nascimento, cliente_genero
 * - cliente_cidade, cliente_estado, cliente_bairro
 * - cliente_ultimo_agendamento, cliente_qtd_agendamentos
 * - tags_cliente
 * 
 * AGENDAMENTO:
 * - agendamento_id, agendamento_numero
 * - agendamento_data, agendamento_hora, agendamento_datacompleta
 * - agendamento_data_final, agendamento_hora_final
 * - agendamento_servico, agendamento_profissional
 * - agendamento_status, agendamento_valor
 * - agendamento_observacoes, agendamento_endereco
 * 
 * NEGÓCIO (CRM):
 * - negocio_id, negocio_titulo, negocio_valor
 * - negocio_etapa_nome, negocio_status, negocio_origem
 * 
 * SISTEMA:
 * - data_atual, hora_atual, dia_semana, mes_atual, ano_atual
 */

const moment = require('moment');

/**
 * Constrói um contexto flat para fácil acesso a variáveis
 * @param {Object} ctx - Contexto original
 * @returns {Object} - Contexto flat
 */
function buildFlatContext(ctx) {
    const flat = {};
    
    // ===== CLIENTE =====
    if (ctx.cliente) {
        const cliente = ctx.cliente;
        
        // Nome
        const nomeCompleto = cliente.cli_nome || cliente.first_name || '';
        const partes = nomeCompleto.split(' ');
        flat.cliente_nome = partes[0] || '';
        flat.cliente_sobrenome = partes.slice(1).join(' ') || '';
        flat.cliente_nomecompleto = nomeCompleto;
        
        // ID
        flat.cliente_id = cliente.cli_Id || cliente.id;
        
        // Contato
        flat.cliente_telefone = ctx.phone || cliente.cli_celular || cliente.telefone || cliente.phone || '';
        flat.cliente_celular = flat.cliente_telefone;
        flat.cliente_email = cliente.cli_email || cliente.email || '';
        
        // Documentos e dados pessoais
        flat.cliente_cpf = cliente.cli_cpf || '';
        flat.cliente_data_nascimento = cliente.cli_dataNasc
            ? moment(cliente.cli_dataNasc).format('DD/MM/YYYY')
            : '';
        flat.cliente_genero = cliente.cli_genero || '';
        
        // Endereço (do primeiro endereço se disponível)
        if (cliente.enderecos && cliente.enderecos.length > 0) {
            const end = cliente.enderecos[0];
            flat.cliente_cidade = end.end_cidade || end.cidade || '';
            flat.cliente_estado = end.end_estado || end.estado || '';
            flat.cliente_bairro = end.end_bairro || end.bairro || '';
            flat.cliente_endereco = formatEndereco(end);
        } else if (cliente.endereco) {
            flat.cliente_cidade = cliente.endereco.cidade || '';
            flat.cliente_estado = cliente.endereco.estado || '';
            flat.cliente_bairro = cliente.endereco.bairro || '';
            flat.cliente_endereco = formatEndereco(cliente.endereco);
        }
        
        // Estatísticas
        flat.cliente_qtd_agendamentos = cliente.qtd_agendamentos || cliente.cli_qtd_agendamentos || 0;
        flat.cliente_qtd_agendamentos_concluidos = cliente.cli_qtd_agendamentos_concluidos || 0;
        flat.cliente_qtd_agendamentos_cancelados = cliente.cli_qtd_agendamentos_cancelados || 0;
        flat.cliente_valor_gasto = cliente.cli_valor_gasto || cliente.valor_gasto || 0;
        flat.cliente_ultimo_agendamento = cliente.cli_ultimo_agendamento 
            ? moment(cliente.cli_ultimo_agendamento).format('DD/MM/YYYY')
            : '';
        flat.cliente_ultimo_agendamento_concluido = cliente.cli_ultimo_agendamento_concluido 
            ? moment(cliente.cli_ultimo_agendamento_concluido).format('DD/MM/YYYY')
            : '';
        flat.cliente_data_cadastro = cliente.created_at
            ? moment(cliente.created_at).format('DD/MM/YYYY')
            : '';

        // Datas de última mensagem (com hora para operadores de horas)
        flat.cliente_ultima_msg_data = cliente.cli_ultima_msg_data
            ? moment(cliente.cli_ultima_msg_data).format('YYYY-MM-DD HH:mm:ss')
            : '';
        flat.cliente_ultima_msg_cliente_data = cliente.cli_ultima_msg_cliente_data
            ? moment(cliente.cli_ultima_msg_cliente_data).format('YYYY-MM-DD HH:mm:ss')
            : '';
        flat.cliente_ultima_msg_sistema_data = cliente.cli_ultima_msg_sistema_data
            ? moment(cliente.cli_ultima_msg_sistema_data).format('YYYY-MM-DD HH:mm:ss')
            : '';

        // Tags
        if (cliente.cli_tags) {
            try {
                const tags = typeof cliente.cli_tags === 'string' ? JSON.parse(cliente.cli_tags) : cliente.cli_tags;
                if (Array.isArray(tags)) {
                    flat.tags_cliente = tags.map(t => t.name || t.title || t).join(', ');
                    flat.cliente_tags = flat.tags_cliente;
                }
            } catch (_) {
                flat.tags_cliente = cliente.cli_tags;
                flat.cliente_tags = cliente.cli_tags;
            }
        }
        
        // Garantir que o telefone do WhatsApp esteja sempre no objeto cliente também
        if (ctx.phone && !cliente.cli_celular && !cliente.telefone && !cliente.phone) {
            ctx.cliente.cli_celular = ctx.phone;
            ctx.cliente.telefone = ctx.phone;
            ctx.cliente.phone = ctx.phone;
        }
    } else if (ctx.phone) {
        // Se não há cliente mas há telefone, criar cliente mínimo com telefone
        ctx.cliente = {
            cli_celular: ctx.phone,
            telefone: ctx.phone,
            phone: ctx.phone
        };
        flat.cliente_telefone = ctx.phone;
        flat.cliente_celular = ctx.phone;
    }
    
    // ===== AGENDAMENTO =====
    if (ctx.agendamento) {
        const age = ctx.agendamento;
        
        flat.agendamento_id = age.age_id || age.id;
        flat.agendamento_numero = flat.agendamento_id; // Alias
        
        // Datas
        const dataAge = age.age_data || age.data;
        const horaInicio = age.age_horaInicio || age.hora_inicio;
        const horaFim = age.age_horaFim || age.hora_fim;
        
        flat.agendamento_data = dataAge ? moment(dataAge).format('DD/MM/YYYY') : '';
        flat.agendamento_hora = horaInicio || '';
        flat.agendamento_hora_inicio = horaInicio || '';
        flat.agendamento_datacompleta = dataAge 
            ? `${moment(dataAge).format('DD/MM/YYYY')} às ${horaInicio || ''}`
            : '';
        flat.agendamento_data_final = dataAge ? moment(dataAge).format('DD/MM/YYYY') : '';
        flat.agendamento_hora_final = horaFim || '';
        flat.agendamento_hora_fim = horaFim || '';
        
        // Status e observações
        flat.agendamento_status = age.status_nome || age.status || '';
        flat.agendamento_observacoes = age.age_observacao || age.observacao || '';
        flat.agendamento_observacao = flat.agendamento_observacoes;
        
        // Valor
        flat.agendamento_valor = age.age_valorTotal || age.valor_total || age.valor || 0;
        
        // Profissional
        flat.agendamento_profissional = age.funcionario_nome || age.profissional || '';
        
        // Serviços
        if (age.servicos && Array.isArray(age.servicos)) {
            flat.agendamento_servico = age.servicos.map(s => s.ser_titulo || s.titulo || s.nome).join(', ');
            flat.agendamento_servicos = flat.agendamento_servico;
        } else if (age.servico) {
            flat.agendamento_servico = age.servico;
            flat.agendamento_servicos = age.servico;
        }
        
        // Endereço
        if (age.endereco) {
            flat.agendamento_endereco = formatEndereco(age.endereco);
        }
    }
    
    // ===== NEGÓCIO (CRM) =====
    if (ctx.negocio) {
        const neg = ctx.negocio;
        
        flat.negocio_id = neg.id;
        flat.negocio_titulo = neg.titulo || neg.title || '';
        flat.negocio_valor = neg.valor || 0;
        flat.negocio_status = neg.status || '';
        flat.negocio_origem = neg.origem || '';
        
        // Etapa do funil
        flat.negocio_etapa_nome = neg.etapa_nome || neg.stage_nome || '';
        flat.negocio_stage = flat.negocio_etapa_nome; // Alias
        flat.negocio_funnel = neg.funnel_nome || '';
        flat.negocio_etapa_instrucoes = neg.etapa_instrucoes || ctx.negocio_etapa_instrucoes || '';
    }

    // Resumo do cliente / instruções do funil (IA)
    if (ctx.clienteResumo) {
        flat.clienteResumo_texto = ctx.clienteResumo.textoResumo || ctx.clienteResumo.textoResumoCurto || '';
        flat.clienteResumo_curto = ctx.clienteResumo.textoResumoCurto || '';
    }
    if (ctx.negocio_etapa_instrucoes) {
        flat.negocio_etapa_instrucoes = ctx.negocio_etapa_instrucoes;
    }

    // ===== FLAGS DE ATENDIMENTO =====
    if (ctx.wait_for_agent || ctx.waiting_for_agent) {
        flat.waiting_for_agent = true;
    }
    
    // ===== VARIÁVEIS DO SISTEMA =====
    moment.locale('pt-br');
    flat.data_atual = moment().format('DD/MM/YYYY');
    flat.hora_atual = moment().format('HH:mm');
    flat.dia_semana = moment().format('dddd');
    flat.mes_atual = moment().format('MMMM');
    flat.ano_atual = moment().format('YYYY');
    
    // ===== MENSAGEM =====
    if (ctx.mensagem) {
        flat.ultima_mensagem = ctx.mensagem.text || '';
        flat.ultima_mensagem_cliente = ctx.mensagem.fromMe === false ? ctx.mensagem.text : '';
    }
    if (ctx.lastUserMessage) {
        flat.ultima_mensagem_cliente = ctx.lastUserMessage;
    }
    
    // ===== VARIÁVEIS DINÂMICAS (capturadas no fluxo) =====
    // Adicionar todas as outras propriedades do contexto que não são objetos complexos
    for (const key in ctx) {
        if (!['cliente', 'agendamento', 'negocio', 'mensagem', 'clienteResumo'].includes(key)) {
            // Se for um valor primitivo, adicionar diretamente
            if (typeof ctx[key] !== 'object' || ctx[key] === null) {
                flat[key] = ctx[key];
            }
        }
    }
    
    return flat;
}

/**
 * Formata endereço para exibição
 * @param {Object} endereco - Objeto de endereço
 * @returns {String} - Endereço formatado
 */
function formatEndereco(endereco) {
    if (!endereco) return '';

    const end = {
        logradouro: endereco.end_logradouro || endereco.logradouro || '',
        numero: endereco.end_numero || endereco.numero || '',
        complemento: endereco.end_complemento || endereco.complemento || '',
        bairro: endereco.end_bairro || endereco.bairro || '',
        cidade: endereco.end_cidade || endereco.cidade || '',
        estado: endereco.end_estado || endereco.estado || '',
        cep: endereco.end_cep || endereco.cep || '',
    };

    const partes = [];

    // Linha 1: Logradouro, número, complemento
    let linha1 = [end.logradouro, end.numero, end.complemento]
        .filter(Boolean)
        .join(', ');
    if (linha1) partes.push(linha1);

    // Bairro
    if (end.bairro) partes.push(end.bairro);

    // Cidade - Estado
    if (end.cidade || end.estado) {
        partes.push([end.cidade, end.estado].filter(Boolean).join(' - '));
    }

    // CEP
    if (end.cep) partes.push(`CEP: ${end.cep}`);

    return partes.join(', ');
}

/**
 * Substitui variáveis em um texto pelo valor do contexto
 * @param {String} text - Texto com variáveis no formato {{variavel}}
 * @param {Object} context - Contexto com os valores
 * @returns {Promise<String>} - Texto com variáveis substituídas
 */
async function replaceVariables(text, context) {
    if (!text || typeof text !== 'string') return text;
    
    const flat = buildFlatContext(context);
    
    // Substituir todas as variáveis {{variavel}} e pipelines {{opção1|opção2|opção3}}
    let result = text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmed = varName.trim();

        // Pipeline/spin: se contém "|", selecionar aleatoriamente uma das opções
        if (trimmed.includes('|')) {
            const options = trimmed.split('|').map(o => o.trim());
            return options[Math.floor(Math.random() * options.length)];
        }

        // Verificar se existe no contexto flat
        if (flat.hasOwnProperty(trimmed)) {
            const value = flat[trimmed];
            return value !== null && value !== undefined ? String(value) : '';
        }

        // Se não encontrar, manter a variável original
        return match;
    });
    
    return result;
}

/**
 * Valida se todas as variáveis obrigatórias existem no contexto
 * @param {Array} requiredVars - Array com nomes das variáveis obrigatórias
 * @param {Object} context - Contexto
 * @returns {Object} - { valid: boolean, missing: Array }
 */
function validateRequiredVariables(requiredVars, context) {
    const flat = buildFlatContext(context);
    const missing = [];
    
    for (const varName of requiredVars) {
        if (!flat.hasOwnProperty(varName) || flat[varName] === null || flat[varName] === undefined) {
            missing.push(varName);
        }
    }
    
    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * Extrair valor de uma variável do contexto
 * @param {String} varName - Nome da variável
 * @param {Object} context - Contexto
 * @returns {*} - Valor da variável ou null
 */
function getContextVariable(varName, context) {
    const flat = buildFlatContext(context);
    return flat[varName] || null;
}

/**
 * Lista todas as variáveis disponíveis no contexto
 * @param {Object} context - Contexto
 * @returns {Array} - Lista de variáveis com seus valores
 */
function listContextVariables(context) {
    const flat = buildFlatContext(context);
    return Object.entries(flat).map(([key, value]) => ({
        name: key,
        value: value,
        type: typeof value
    }));
}

module.exports = {
    buildFlatContext,
    replaceVariables,
    validateRequiredVariables,
    getContextVariable,
    listContextVariables,
    formatEndereco
};
