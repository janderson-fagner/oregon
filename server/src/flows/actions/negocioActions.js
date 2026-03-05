/**
 * 💼 NEGÓCIO ACTIONS - Ações relacionadas a Negócios (CRM)
 * 
 * Funções para criar, atualizar e gerenciar negócios nos fluxos
 * 
 * Tabelas corretas no banco:
 * - Negocios: tabela principal de negócios
 * - Funis: tabela de etapas/estágios do funil
 */

const moment = require('moment');
const dbQuery = require('../../utils/dbHelper');
const { empresaWhere } = require('../../utils/dbHelper');
const { replaceVariables } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');

/**
 * Criar novo negócio
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
async function createNegocio(config, context) {
    flowLog.actionSuccess('create_negocio', { step: 'start', config });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        // Buscar ID do cliente
        let clienteId = context.cliente?.cli_Id || context.cliente?.id;

        if (!clienteId) {
            flowLog.actionError('create_negocio', new Error('Cliente não encontrado no contexto'));
            return { success: false, error: 'Cliente não encontrado no contexto do fluxo' };
        }

        // Processar valores com substituição de variáveis
        const titulo = config.titulo ? await replaceVariables(config.titulo, context) : 'Negócio sem título';
        const descricao = config.descricao ? await replaceVariables(config.descricao, context) : null;
        const valor = config.valor ? parseFloat(await replaceVariables(String(config.valor), context)) || 0 : 0;
        const origem = config.origem ? await replaceVariables(config.origem, context) : 'Fluxo Automático';

        // Etapa do funil (usando etapaId conforme estrutura do banco)
        let etapaId = config.etapaId || config.stageId || null;

        // Se não forneceu etapa, buscar primeira etapa do funil
        if (!etapaId) {
            const primeiraEtapa = await dbQuery(`SELECT id FROM Funis WHERE ${ew.sql} ORDER BY ordem ASC LIMIT 1`, [...ew.params]);
            if (primeiraEtapa.length > 0) {
                etapaId = primeiraEtapa[0].id;
            }
        }

        if (!etapaId) {
            flowLog.actionError('create_negocio', new Error('Etapa do funil não encontrada'));
            return { success: false, error: 'Nenhuma etapa do funil configurada. Configure pelo menos uma etapa em CRM > Funis.' };
        }

        // Processar tags se houver
        let tagsJson = null;
        if (config.tags && Array.isArray(config.tags) && config.tags.length > 0) {
            tagsJson = JSON.stringify(config.tags);
        }

        // Processar data de fechamento esperada
        let dataFechamentoEsperada = null;
        if (config.dataFechamentoEsperada) {
            dataFechamentoEsperada = moment(config.dataFechamentoEsperada).isValid() 
                ? moment(config.dataFechamentoEsperada).format('YYYY-MM-DD HH:mm:ss')
                : null;
        }

        // Vincular agendamento se existir no contexto
        const agendamentoId = config.agendamentoId || context.agendamento?.age_id || context.agendamento?.id || null;

        // Inserir no banco - usando estrutura correta da tabela Negocios
        const insertQuery = `
            INSERT INTO Negocios
            (cli_Id, title, status, valor, etapaId, origem, age_id, tags, data_fechamento_esperada, created_at, created_by, empresa_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
        `;

        const result = await dbQuery(insertQuery, [
            clienteId,
            titulo,
            'Pendente', // status padrão
            valor,
            etapaId,
            origem,
            agendamentoId,
            tagsJson,
            dataFechamentoEsperada,
            'Sistema (Fluxo)',
            empresa_id
        ]);
        
        const negocioId = result.insertId;

        flowLog.actionSuccess('create_negocio', { 
            step: 'negocio_criado', 
            negocioId,
            titulo,
            etapaId,
            clienteId
        });

        // Buscar etapa para adicionar ao contexto
        const etapaInfo = await dbQuery(`SELECT * FROM Funis WHERE id = ? AND ${ew.sql}`, [etapaId, ...ew.params]);

        // Atualizar contexto com negócio criado
        context.negocio = {
            id: negocioId,
            cli_Id: clienteId,
            title: titulo,
            titulo: titulo,
            status: 'Pendente',
            valor: valor,
            etapaId: etapaId,
            etapa_nome: etapaInfo[0]?.nome || '',
            origem: origem,
            age_id: agendamentoId
        };
        context.negocio_id = negocioId;

        return {
            success: true,
            message: `Negócio #${negocioId} criado com sucesso`,
            negocio_id: negocioId,
            negocio: context.negocio
        };

    } catch (error) {
        flowLog.actionError('create_negocio', error);
        return { success: false, error: error.message };
    }
}

/**
 * Atualizar negócio existente
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
async function updateNegocio(config, context) {
    flowLog.actionSuccess('update_negocio', { step: 'start', config });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        // Identificar o negócio a ser atualizado
        let negocioId = null;
        const identificationType = config.identificationType || 'context';

        if (identificationType === 'id' && config.negocioId) {
            negocioId = await replaceVariables(String(config.negocioId), context);
        } else if (identificationType === 'ultimo') {
            // Buscar último negócio do cliente
            const clienteId = context.cliente?.cli_Id || context.cliente?.id;
            if (clienteId) {
                const ultimoNegocio = await dbQuery(
                    `SELECT id FROM Negocios WHERE cli_Id = ? AND ${ew.sql} ORDER BY created_at DESC LIMIT 1`,
                    [clienteId, ...ew.params]
                );
                if (ultimoNegocio.length > 0) {
                    negocioId = ultimoNegocio[0].id;
                }
            }
        } else {
            // context - usar negócio do contexto
            negocioId = context.negocio?.id;
        }

        if (!negocioId) {
            flowLog.actionError('update_negocio', new Error('ID do negócio não encontrado'));
            return { success: false, error: 'Negócio não encontrado. Verifique se há um negócio no contexto do fluxo.' };
        }

        // Verificar se negócio existe
        const negocioExiste = await dbQuery(`SELECT * FROM Negocios WHERE id = ? AND ${ew.sql}`, [negocioId, ...ew.params]);
        if (negocioExiste.length === 0) {
            return { success: false, error: `Negócio #${negocioId} não encontrado no banco de dados.` };
        }

        flowLog.actionSuccess('update_negocio', { step: 'negocio_encontrado', negocioId });

        // Processar ações de atualização
        const actions = config.actions || [];
        const updates = [];
        const values = [];

        for (const action of actions) {
            switch (action.type) {
                case 'update_title':
                    if (action.value) {
                        updates.push('title = ?');
                        values.push(await replaceVariables(action.value, context));
                    }
                    break;
                    
                case 'update_valor':
                    if (action.value !== undefined && action.value !== null) {
                        updates.push('valor = ?');
                        values.push(parseFloat(action.value) || 0);
                    }
                    break;
                    
                case 'update_origem':
                    if (action.value) {
                        updates.push('origem = ?');
                        values.push(await replaceVariables(action.value, context));
                    }
                    break;
                    
                case 'update_etapa':
                    if (action.value) {
                        updates.push('etapaId = ?');
                        values.push(parseInt(action.value));
                    }
                    break;
                    
                case 'update_status':
                    if (action.value) {
                        updates.push('status = ?');
                        values.push(action.value);
                    }
                    break;
                    
                case 'mark_won':
                    updates.push('status = ?', 'data_fechamento = NOW()');
                    values.push('Ganho');
                    break;
                    
                case 'mark_lost':
                    updates.push('status = ?', 'dataPerdido = NOW()');
                    values.push('Perdido');
                    if (action.motivo) {
                        updates.push('motivoPerdido = ?');
                        values.push(action.motivo);
                    }
                    if (action.observacao) {
                        updates.push('obsPerdido = ?');
                        values.push(action.observacao);
                    }
                    break;
                    
                case 'update_data_fechamento_esperada':
                    if (action.value) {
                        updates.push('data_fechamento_esperada = ?');
                        values.push(moment(action.value).format('YYYY-MM-DD HH:mm:ss'));
                    }
                    break;
                    
                case 'vincular_agendamento':
                    if (action.value) {
                        const ageId = await replaceVariables(String(action.value), context);
                        updates.push('age_id = ?');
                        values.push(parseInt(ageId) || null);
                    }
                    break;
                    
                case 'update_tags':
                    if (action.value && Array.isArray(action.value)) {
                        updates.push('tags = ?');
                        values.push(JSON.stringify(action.value));
                    }
                    break;
            }
        }

        // Também processar campos diretos da config (compatibilidade)
        if (config.titulo && !actions.some(a => a.type === 'update_title')) {
            updates.push('title = ?');
            values.push(await replaceVariables(config.titulo, context));
        }
        if (config.stageId && !actions.some(a => a.type === 'update_etapa')) {
            updates.push('etapaId = ?');
            values.push(config.stageId);
        }
        if (config.status && !actions.some(a => a.type === 'update_status')) {
            updates.push('status = ?');
            values.push(config.status);
        }

        if (updates.length === 0) {
            flowLog.log('WARN', 'Nenhum campo para atualizar no negócio');
            return { success: true, message: 'Nenhum campo para atualizar' };
        }

        // Adicionar timestamp de atualização
        updates.push('updated_at = NOW()');
        updates.push('updated_by = ?');
        values.push('Sistema (Fluxo)');
        values.push(negocioId);

        // Executar update
        values.push(...ew.params);
        const query = `UPDATE Negocios SET ${updates.join(', ')} WHERE id = ? AND ${ew.sql}`;
        await dbQuery(query, values);

        flowLog.actionSuccess('update_negocio', { 
            step: 'finalizado', 
            negocioId,
            updatedFields: updates.length - 2 // -2 por updated_at e updated_by
        });

        // Atualizar contexto
        const negocioAtualizado = await dbQuery(`SELECT * FROM Negocios WHERE id = ? AND ${ew.sql}`, [negocioId, ...ew.params]);
        if (negocioAtualizado.length > 0) {
            const etapaInfo = await dbQuery(`SELECT * FROM Funis WHERE id = ? AND ${ew.sql}`, [negocioAtualizado[0].etapaId, ...ew.params]);
            context.negocio = {
                ...negocioAtualizado[0],
                titulo: negocioAtualizado[0].title,
                etapa_nome: etapaInfo[0]?.nome || ''
            };
        }

        return {
            success: true,
            message: `Negócio #${negocioId} atualizado com sucesso`
        };

    } catch (error) {
        flowLog.actionError('update_negocio', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mover negócio para outra etapa do funil
 * @param {Object} config - Configuração
 * @param {Object} context - Contexto
 * @returns {Promise<Object>} - Resultado
 */
async function moveNegocioToStage(config, context) {
    flowLog.actionSuccess('move_negocio_to_stage', { step: 'start' });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        let negocioId = config.negocioId ? await replaceVariables(String(config.negocioId), context) : context.negocio?.id;
        const etapaId = config.stageId || config.etapaId;

        if (!negocioId || !etapaId) {
            return { success: false, error: 'Negócio ou etapa não fornecido' };
        }

        // Verificar se etapa existe
        const etapaExiste = await dbQuery(`SELECT * FROM Funis WHERE id = ? AND ${ew.sql}`, [etapaId, ...ew.params]);
        if (etapaExiste.length === 0) {
            return { success: false, error: `Etapa #${etapaId} não encontrada` };
        }

        // Atualizar negócio
        await dbQuery(
            `UPDATE Negocios SET etapaId = ?, updated_at = NOW(), updated_by = ? WHERE id = ? AND ${ew.sql}`,
            [etapaId, 'Sistema (Fluxo)', negocioId, ...ew.params]
        );

        // Atualizar contexto
        if (context.negocio) {
            context.negocio.etapaId = etapaId;
            context.negocio.etapa_nome = etapaExiste[0].nome;
        }

        flowLog.actionSuccess('move_negocio_to_stage', { 
            step: 'finalizado', 
            negocioId,
            etapaId,
            etapaNome: etapaExiste[0].nome
        });

        return {
            success: true,
            message: `Negócio #${negocioId} movido para etapa "${etapaExiste[0].nome}"`
        };

    } catch (error) {
        flowLog.actionError('move_negocio_to_stage', error);
        return { success: false, error: error.message };
    }
}

/**
 * Buscar negócio por ID e carregar no contexto
 * @param {Object} config - Configuração
 * @param {Object} context - Contexto
 * @returns {Promise<Object>} - Resultado
 */
async function getNegocio(config, context) {
    flowLog.actionSuccess('get_negocio', { step: 'start' });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        let negocioId = null;

        if (config.negocioId) {
            negocioId = await replaceVariables(String(config.negocioId), context);
        } else if (context.negocio?.id) {
            negocioId = context.negocio.id;
        } else {
            // Tentar buscar pelo cliente
            const clienteId = context.cliente?.cli_Id || context.cliente?.id;
            if (clienteId) {
                const negocios = await dbQuery(
                    `SELECT id FROM Negocios WHERE cli_Id = ? AND ${ew.sql} ORDER BY created_at DESC LIMIT 1`,
                    [clienteId, ...ew.params]
                );
                if (negocios.length > 0) {
                    negocioId = negocios[0].id;
                }
            }
        }

        if (!negocioId) {
            return { success: false, error: 'ID do negócio não encontrado' };
        }

        // Buscar negócio completo
        const negocios = await dbQuery(`
            SELECT n.*, f.nome as etapa_nome, f.probabilidade, c.cli_nome as cliente_nome
            FROM Negocios n
            LEFT JOIN Funis f ON n.etapaId = f.id
            LEFT JOIN CLIENTES c ON n.cli_Id = c.cli_Id
            WHERE n.id = ? AND n.${ew.sql}
        `, [negocioId, ...ew.params]);

        if (negocios.length === 0) {
            return { success: false, error: `Negócio #${negocioId} não encontrado` };
        }

        const negocio = negocios[0];

        // Atualizar contexto
        context.negocio = {
            ...negocio,
            titulo: negocio.title,
            id: negocio.id
        };
        context.negocio_id = negocio.id;

        flowLog.actionSuccess('get_negocio', { 
            step: 'finalizado', 
            negocioId,
            titulo: negocio.title
        });

        return {
            success: true,
            message: `Negócio #${negocioId} carregado`,
            negocio: context.negocio
        };

    } catch (error) {
        flowLog.actionError('get_negocio', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    createNegocio,
    updateNegocio,
    moveNegocioToStage,
    getNegocio
};
