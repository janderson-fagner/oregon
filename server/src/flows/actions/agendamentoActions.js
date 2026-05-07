/**
 * 📅 AGENDAMENTO ACTIONS - Ações relacionadas a Agendamentos
 * 
 * Funções para criar, atualizar e gerenciar agendamentos nos fluxos
 */

const moment = require('moment');
const dbQuery = require('../../utils/dbHelper');
const { empresaWhere } = require('../../utils/dbHelper');
const { replaceVariables } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');
const {
    verificarDisponibilidadeGeral,
    buscarOpcoesDisponibilidade,
    resumirOpcoesParaIAComMaps,
    getPeriodoDoHorario,
    geocodificarEnderecoComMaps
} = require('../helpers/availabilityHelper');

/**
 * Criar novo agendamento
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
async function createAgendamento(config, context) {
    flowLog.actionSuccess('create_agendamento', { step: 'start' });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        // 🔥 CRÍTICO: Buscar cliente ID de múltiplas formas
        // 🎯 ATENÇÃO: O banco retorna cli_Id (com I maiúsculo)
        let clienteId = config.clienteId ||
            context.cliente?.cli_Id ||
            context.cliente?.id ||
            context.cliente?.cli_id ||
            context.cliente?.cli_ID;

        if (!clienteId) {
            flowLog.actionError('create_agendamento', new Error('Cliente não encontrado no contexto'));
            return { success: false, error: 'Cliente não encontrado no contexto do fluxo' };
        }

        flowLog.actionSuccess('create_agendamento', { step: 'cliente_encontrado', clienteId });

        // Processar data
        let dataAgendamento = config.data ? await replaceVariables(config.data, context) : null;
        if (dataAgendamento && dataAgendamento.includes('/')) {
            // Converter DD/MM/YYYY para YYYY-MM-DD
            const parts = dataAgendamento.split('/');
            if (parts.length === 3) {
                dataAgendamento = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        // Processar endereço
        let enderecoId = null;
        if (config.enderecoMode === 'novo' && config.endereco) {
            const endereco = config.endereco;
            const endResult = await dbQuery(
                'INSERT INTO ENDERECO (cli_id, end_cep, end_logradouro, end_numero, end_complemento, end_bairro, end_cidade, end_estado, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    clienteId,
                    endereco.cep ? await replaceVariables(endereco.cep, context) : null,
                    endereco.logradouro ? await replaceVariables(endereco.logradouro, context) : null,
                    endereco.numero ? await replaceVariables(endereco.numero, context) : null,
                    endereco.complemento ? await replaceVariables(endereco.complemento, context) : null,
                    endereco.bairro ? await replaceVariables(endereco.bairro, context) : null,
                    endereco.cidade ? await replaceVariables(endereco.cidade, context) : null,
                    endereco.estado ? await replaceVariables(endereco.estado, context) : null,
                    empresa_id
                ]
            );
            enderecoId = endResult.insertId;
            flowLog.actionSuccess('create_agendamento', { step: 'endereco_criado', enderecoId });
        } else if (config.enderecoMode === 'variavel' && config.enderecoVariavel) {
            const endVar = await replaceVariables(`{{${config.enderecoVariavel}}}`, context);
            if (endVar && !endVar.includes('{{')) {
                enderecoId = parseInt(endVar);
            }
        } else {
            // Usar endereço padrão do cliente
            const enderecosCliente = await dbQuery(`SELECT end_id FROM ENDERECO WHERE cli_id = ? AND ${ew.sql} ORDER BY end_id DESC LIMIT 1`, [clienteId, ...ew.params]);
            if (enderecosCliente.length > 0) {
                enderecoId = enderecosCliente[0].end_id;
            }
        }

        // Processar fonte
        let fonte = config.fonte || 'fluxo';
        if (config.fonteCustom) {
            fonte = await replaceVariables(config.fonteCustom, context);
        }

        // Preparar dados do agendamento
        const duracaoMinutos = config.duracaoMinutos || 60;

        // Validar disponibilidade antes de criar
        const latLng = await obterLatLngSeguro(config, context);

        const disponibilidade = await validarDisponibilidadeOuSugerir({
            data: dataAgendamento,
            horaInicio: config.horaInicio ? await replaceVariables(config.horaInicio, context) : null,
            horaFim: config.horaFim ? await replaceVariables(config.horaFim, context) : null,
            funId: config.funcionarioId ? await replaceVariables(config.funcionarioId, context) : null,
            periodoPreferido: config.periodoPreferido || getPeriodoDoHorario(config.horaInicio || '08:00'),
            duracaoMinutos,
            latLng,
            empresa_id
        });

        if (!disponibilidade.ok) {
            return {
                success: false,
                error: disponibilidade.message || 'Sem disponibilidade para este horário',
                alternativas: disponibilidade.alternativas || [],
                resumo: disponibilidade.resumo || null
            };
        }

        const fun_id_escolhido = disponibilidade.funIdEscolhido;

        const agendamentoData = {
            cli_id: clienteId,
            age_data: dataAgendamento,
            age_horaInicio: config.horaInicio ? await replaceVariables(config.horaInicio, context) : null,
            age_horaFim: config.horaFim ? await replaceVariables(config.horaFim, context) : null,
            fun_id: fun_id_escolhido,
            ast_id: config.statusId || 1,
            age_observacao: config.observacoes ? await replaceVariables(config.observacoes, context) : null,
            age_fonte: fonte,
            age_endereco: enderecoId,
            age_type: 'servico',
            created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            created_by: 'Sistema - Fluxo',
            updated_by: 'Sistema - Fluxo',
            empresa_id: empresa_id
        };

        // Inserir no banco
        const result = await dbQuery('INSERT INTO AGENDAMENTO SET ?', agendamentoData);
        const agendamentoId = result.insertId;

        flowLog.actionSuccess('create_agendamento', { step: 'agendamento_criado', agendamentoId });

        // Processar serviços
        if (config.servicos && Array.isArray(config.servicos) && config.servicos.length > 0) {
            let valorTotal = 0;
            
            for (const servico of config.servicos) {
                if (!servico.servicoId) continue;

                const servicoId = await replaceVariables(String(servico.servicoId), context);
                const quantidade = servico.quantidade || 1;
                const valor = servico.valor || 0;
                const descricao = servico.descricao ? await replaceVariables(servico.descricao, context) : null;

                // Buscar informações do serviço
                let servicoDB = await dbQuery(`SELECT * FROM SERVICOS_NEW WHERE ser_id = ? AND ${ew.sql}`, [servicoId, ...ew.params]);
                let isSub = false;
                let serPai = servicoId;

                if (servicoDB.length === 0) {
                    servicoDB = await dbQuery(`SELECT * FROM SERVICOS_SUBS WHERE ser_id = ? AND ${ew.sql}`, [servicoId, ...ew.params]);
                    if (servicoDB.length > 0) {
                        isSub = true;
                        serPai = servicoDB[0].ser_pai;
                    }
                }

                if (servicoDB.length === 0) {
                    flowLog.log('WARN', `Serviço não encontrado: ${servicoId}`);
                    continue;
                }

                // Inserir na tabela AXS
                await dbQuery(
                    'INSERT INTO AXS (age_id, ser_id, ser_sub_id, ser_quantity, ser_valor, ser_descricao, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [agendamentoId, serPai, isSub ? servicoId : null, quantidade, valor, descricao, empresa_id]
                );

                valorTotal += parseFloat(valor) * quantidade;
            }

            // Atualizar valor total do agendamento
            if (valorTotal > 0) {
                await dbQuery(`UPDATE AGENDAMENTO SET age_valor = ? WHERE age_id = ? AND ${ew.sql}`, [valorTotal, agendamentoId, ...ew.params]);
                flowLog.actionSuccess('create_agendamento', { step: 'valor_total_atualizado', valorTotal });
            }
        }

        // Atualizar contexto
        context.agendamento = {
            id: agendamentoId,
            ...agendamentoData
        };
        context.agendamento_id = agendamentoId;
        context.agendamento_data = agendamentoData.age_data;
        context.agendamento_hora_inicio = agendamentoData.age_horaInicio;
        context.agendamento_hora_fim = agendamentoData.age_horaFim;

        flowLog.actionSuccess('create_agendamento', { 
            step: 'finalizado', 
            agendamentoId,
            message: `Agendamento ${agendamentoId} criado com sucesso`
        });

        return {
            success: true,
            message: `Agendamento ${agendamentoId} criado com sucesso`,
            agendamento_id: agendamentoId
        };

    } catch (error) {
        flowLog.actionError('create_agendamento', error);
        return { success: false, error: error.message };
    }
}

/**
 * Atualizar agendamento existente
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
/**
 * Usa IA para interpretar instruções e determinar quais campos atualizar no agendamento
 * @param {String} instrucoesIA - Instruções em texto livre
 * @param {Object} agendamentoAtual - Dados atuais do agendamento
 * @param {Number} empresa_id - ID da empresa
 * @returns {Object} - Campos a atualizar { statusId, observacoes }
 */
async function interpretarAtualizacaoComIA(instrucoesIA, agendamentoAtual, empresa_id) {
    const { generateGeminiText, getGeminiConfig } = require('../../utils/gemini');

    // Buscar status disponíveis
    const statusList = await dbQuery(
        'SELECT ast_id, ast_descricao FROM AGENDAMENTO_STATUS WHERE empresa_id = ? ORDER BY ast_id',
        [empresa_id || 1]
    );
    const statusOptions = statusList.map(s => `${s.ast_id} = ${s.ast_descricao}`).join(', ');

    const prompt = `Você é um assistente que interpreta instruções para atualizar agendamentos.

STATUS DISPONÍVEIS: ${statusOptions}
STATUS ATUAL DO AGENDAMENTO: ${agendamentoAtual.ast_id}

INSTRUÇÃO: "${instrucoesIA}"

Responda APENAS com um JSON válido contendo os campos a atualizar. Campos possíveis:
- "statusId": número do novo status (apenas se a instrução pedir mudança de status)
- "observacoes": texto (apenas se a instrução pedir adicionar observações)

Se a instrução não pedir mudança em algum campo, não inclua ele no JSON.
Responda SOMENTE o JSON, sem explicações, sem markdown, sem crases.`;

    const config = await getGeminiConfig(empresa_id);
    const response = await generateGeminiText({
        instructions: prompt,
        userText: instrucoesIA,
        context: { empresa_id },
        history: []
    });

    // Extrair JSON da resposta
    const jsonMatch = (response || '').match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
        flowLog.log('WARN', 'IA não retornou JSON válido para update_agendamento', { response });
        return {};
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            statusId: parsed.statusId || null,
            observacoes: parsed.observacoes || null
        };
    } catch (e) {
        flowLog.log('WARN', 'Erro ao parsear JSON da IA', { response: jsonMatch[0] });
        return {};
    }
}

async function updateAgendamento(config, context) {
    flowLog.actionSuccess('update_agendamento', { step: 'start' });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        // Identificar cliente e agendamento corrente
        const clienteId =
            config.clienteId ||
            context.cliente?.cli_Id ||
            context.cliente?.id ||
            context.cliente?.cli_id ||
            context.cliente?.cli_ID;

        let agendamentoAtual = null;
        let agendamentoId = config.agendamentoId
            ? await replaceVariables(config.agendamentoId, context)
            : context.agendamento?.id || context.agendamento?.age_id;

        // Se não veio ID e há cliente, pegar o último agendamento ativo do cliente
        if (!agendamentoId && clienteId) {
            const lastAg = await dbQuery(
                `SELECT * FROM AGENDAMENTO
                 WHERE cli_id = ? AND age_ativo = 1 AND ${ew.sql}
                 ORDER BY age_data DESC, age_id DESC
                 LIMIT 1`,
                [clienteId, ...ew.params]
            );
            if (lastAg.length > 0) {
                agendamentoAtual = lastAg[0];
                agendamentoId = agendamentoAtual.age_id;
            }
        }

        // Se ainda não há ID, não dá para prosseguir
        if (!agendamentoId) {
            flowLog.actionError('update_agendamento', new Error('ID do agendamento não encontrado'));
            return { success: false, error: 'Agendamento não encontrado no contexto do fluxo' };
        }

        // Garantir que temos os dados completos do agendamento para fallback de campos
        if (!agendamentoAtual) {
            const agRows = await dbQuery(`SELECT * FROM AGENDAMENTO WHERE age_id = ? AND ${ew.sql}`, [agendamentoId, ...ew.params]);
            if (agRows.length === 0) {
                flowLog.actionError('update_agendamento', new Error('Agendamento não encontrado no banco'));
                return { success: false, error: 'Agendamento não encontrado' };
            }
            agendamentoAtual = agRows[0];
        }

        flowLog.actionSuccess('update_agendamento', { step: 'agendamento_encontrado', agendamentoId });

        // Preparar dados de atualização
        const updates = [];
        const values = [];

        // Capturar campos propostos
        let dataNova = null;
        if (config.data) {
            dataNova = await replaceVariables(config.data, context);
            if (dataNova && dataNova.includes('/')) {
                const parts = dataNova.split('/');
                if (parts.length === 3) dataNova = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        let horaInicioNova = config.horaInicio ? await replaceVariables(config.horaInicio, context) : null;
        let horaFimNova = config.horaFim ? await replaceVariables(config.horaFim, context) : null;
        let funIdNovo = config.funcionarioId ? await replaceVariables(config.funcionarioId, context) : null;

        // Se algum dado de horário/funcionário mudou, validar disponibilidade
        const precisaValidar =
            dataNova || horaInicioNova || horaFimNova || funIdNovo;

        if (precisaValidar) {
            const duracaoMinutos = config.duracaoMinutos || 60;
            const latLng = await obterLatLngSeguro(config, context);
            const disponibilidade = await validarDisponibilidadeOuSugerir({
                data: dataNova || agendamentoAtual.age_data,
                horaInicio: horaInicioNova || agendamentoAtual.age_horaInicio,
                horaFim: horaFimNova || agendamentoAtual.age_horaFim,
                funId: funIdNovo || agendamentoAtual.fun_id,
                periodoPreferido: config.periodoPreferido || getPeriodoDoHorario(horaInicioNova || agendamentoAtual.age_horaInicio || '08:00'),
                duracaoMinutos,
                latLng,
                empresa_id
            });

            if (!disponibilidade.ok) {
                return {
                    success: false,
                    error: disponibilidade.message || 'Sem disponibilidade para este horário',
                    alternativas: disponibilidade.alternativas || [],
                    resumo: disponibilidade.resumo || null
                };
            }

            if (dataNova) {
                updates.push('age_data = ?');
                values.push(dataNova);
            }
            if (horaInicioNova) {
                updates.push('age_horaInicio = ?');
                values.push(horaInicioNova);
            }
            if (horaFimNova) {
                updates.push('age_horaFim = ?');
                values.push(horaFimNova);
            }
            if (funIdNovo) {
                updates.push('fun_id = ?');
                values.push(funIdNovo);
            }
        }

        if (config.statusId) {
            updates.push('ast_id = ?');
            values.push(config.statusId);
        }
        if (config.observacoes) {
            updates.push('age_observacao = ?');
            values.push(await replaceVariables(config.observacoes, context));
        }

        // Se não há campos para atualizar e useIA está ativo, usar IA para interpretar instruções
        if (updates.length === 0 && config.useIA && config.instrucoesIA) {
            flowLog.log('INFO', 'Nenhum campo preenchido manualmente. Usando IA para interpretar instruções...');
            try {
                const aiUpdates = await interpretarAtualizacaoComIA(config.instrucoesIA, agendamentoAtual, empresa_id);
                if (aiUpdates.statusId) {
                    updates.push('ast_id = ?');
                    values.push(aiUpdates.statusId);
                }
                if (aiUpdates.observacoes) {
                    updates.push('age_observacao = ?');
                    values.push(aiUpdates.observacoes);
                }
                flowLog.log('INFO', 'IA determinou atualizações', aiUpdates);
            } catch (aiErr) {
                flowLog.log('ERROR', 'Erro na interpretação IA', { error: aiErr.message });
            }
        }

        if (updates.length === 0) {
            flowLog.log('WARN', 'Nenhum campo para atualizar no agendamento');
            return { success: true, message: 'Nenhum campo para atualizar' };
        }

        // Adicionar timestamp de atualização
        updates.push('updated_at = NOW()');
        updates.push('updated_by = ?');
        values.push('Sistema - Fluxo');
        values.push(agendamentoId);

        // Executar update
        values.push(...ew.params);
        const query = `UPDATE AGENDAMENTO SET ${updates.join(', ')} WHERE age_id = ? AND ${ew.sql}`;
        await dbQuery(query, values);

        flowLog.actionSuccess('update_agendamento', { 
            step: 'finalizado', 
            agendamentoId,
            updatedFields: updates.length - 2 // Menos os campos de controle
        });

        return {
            success: true,
            message: `Agendamento ${agendamentoId} atualizado com sucesso`
        };

    } catch (error) {
        flowLog.actionError('update_agendamento', error);
        return { success: false, error: error.message };
    }
}

/**
 * Obter dados de um agendamento
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
async function getAgendamento(config, context) {
    flowLog.actionSuccess('get_agendamento', { step: 'start' });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        let agendamentoId = config.agendamentoId ? await replaceVariables(config.agendamentoId, context) : context.agendamento?.id;

        if (!agendamentoId) {
            return { success: false, error: 'ID do agendamento não fornecido' };
        }

        const agendamentos = await dbQuery(`
            SELECT
                a.*,
                c.cli_nome,
                c.cli_email,
                c.cli_celular,
                f.fullName as funcionario_nome,
                s.ast_nome as status_nome
            FROM AGENDAMENTO a
            LEFT JOIN CLIENTES c ON a.cli_id = c.cli_Id
            LEFT JOIN User f ON a.fun_id = f.id
            LEFT JOIN AGENDAMENTO_STATUS s ON a.ast_id = s.ast_id
            WHERE a.age_id = ? AND a.${ew.sql}
        `, [agendamentoId, ...ew.params]);

        if (agendamentos.length === 0) {
            return { success: false, error: 'Agendamento não encontrado' };
        }

        const agendamento = agendamentos[0];

        // Buscar serviços
        const servicos = await dbQuery(`
            SELECT
                axs.*,
                s.ser_nome,
                ss.ser_nome as subservico_nome
            FROM AXS axs
            LEFT JOIN SERVICOS_NEW s ON axs.ser_id = s.ser_id
            LEFT JOIN SERVICOS_SUBS ss ON axs.ser_sub_id = ss.ser_id
            WHERE axs.age_id = ? AND axs.${ew.sql}
        `, [agendamentoId, ...ew.params]);

        agendamento.servicos = servicos;

        // Atualizar contexto
        context.agendamento = agendamento;
        context.agendamento_id = agendamento.age_id;

        flowLog.actionSuccess('get_agendamento', { 
            step: 'finalizado', 
            agendamentoId,
            servicosCount: servicos.length
        });

        return {
            success: true,
            agendamento
        };

    } catch (error) {
        flowLog.actionError('get_agendamento', error);
        return { success: false, error: error.message };
    }
}

/**
 * Valida disponibilidade ou sugere alternativas usando heurística e Maps Grounding (sem Distance Matrix)
 * @param {Object} params
 * @returns {Promise<{ok:boolean, funIdEscolhido?:number, alternativas?:Array, resumo?:string, message?:string}>}
 */
async function validarDisponibilidadeOuSugerir(params) {
    const { data, horaInicio, horaFim, funId, periodoPreferido, duracaoMinutos = 60, latLng = null } = params;

    if (!data || !horaInicio || !horaFim) {
        return { ok: false, message: 'Dados de data/horário incompletos' };
    }

    // Verificar disponibilidade geral
    const dispGeral = await verificarDisponibilidadeGeral(data, horaInicio, horaFim, null, null, params.empresa_id || null);
    if (dispGeral.disponivel) {
        // Se funId foi informado, checar se ele está disponível
        if (funId) {
            const disponivelFun = (dispGeral.funcionariosDisponiveis || []).find(f => f.id == funId);
            if (disponivelFun) {
                return { ok: true, funIdEscolhido: funId };
            }
            // Se não está, tentar escolher outro disponível
        }

        // Escolher o primeiro disponível (já vem ordenado por prioridade/ordemCalendar)
        const funEscolhido = (dispGeral.funcionariosDisponiveis || [])[0];
        if (funEscolhido) {
            return { ok: true, funIdEscolhido: funEscolhido.id };
        }
    }

    // Sem disponibilidade: buscar alternativas compactas
    const dataInicio = data;
    const dataFim = moment(data).add(3, 'days').format('YYYY-MM-DD');

    const opcoes = await buscarOpcoesDisponibilidade(
        dataInicio,
        dataFim,
        duracaoMinutos,
        periodoPreferido || getPeriodoDoHorario(horaInicio),
        null,
        null,
        params.empresa_id || null
    );

      
    const resumo = await resumirOpcoesParaIAComMaps(opcoes, latLng);

    return {
        ok: false,
        alternativas: opcoes,
        resumo,
        message: 'Sem disponibilidade no horário solicitado'
    };
}

/**
 * Tenta construir endereço textual e geocodificar via Maps grounding (Gemini).
 * Usa endereço do config (novo), ou do cliente no contexto.
 */
async function obterLatLngSeguro(config, context) {
    try {
        // Endereço novo informado no config
        if (config.endereco && typeof config.endereco === 'object') {
            const end = config.endereco;
            const texto = [
                end.logradouro,
                end.numero,
                end.bairro,
                end.cidade,
                end.estado,
                end.cep
            ].filter(Boolean).join(', ');
            const latLng = await geocodificarEnderecoComMaps(texto, null);
            if (latLng) return latLng;
        }

        // Endereço do cliente em contexto (se houver)
        if (context?.cliente) {
            const c = context.cliente;
            const textoCliente = [
                c.end_logradouro || c.cli_logradouro,
                c.end_numero || c.cli_numero,
                c.end_bairro || c.cli_bairro,
                c.end_cidade || c.cli_cidade,
                c.end_estado || c.cli_estado,
                c.end_cep || c.cli_cep
            ].filter(Boolean).join(', ');
            if (textoCliente.length > 5) {
                const latLng = await geocodificarEnderecoComMaps(textoCliente, null);
                if (latLng) return latLng;
            }
        }
    } catch (err) {
        console.error('Falha ao geocodificar endereço:', err.message);
    }
    return null;
}

module.exports = {
    createAgendamento,
    updateAgendamento,
    getAgendamento
};

