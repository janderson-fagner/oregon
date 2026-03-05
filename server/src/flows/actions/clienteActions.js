/**
 * 👤 CLIENTE ACTIONS - Ações relacionadas a Clientes
 * 
 * Funções para criar, atualizar e gerenciar clientes nos fluxos
 * 
 * Estrutura do frontend (update-cliente-block.vue):
 * - config.actions: Array de ações com { type, value }
 * - Tipos: update_name, update_email, update_phone, update_phone2,
 *          update_cpf, update_birth_date, update_gender, update_notes,
 *          add_tags, remove_tags
 */

const dbQuery = require('../../utils/dbHelper');
const { empresaWhere } = require('../../utils/dbHelper');
const { replaceVariables } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');

/**
 * Atualizar dados do cliente
 * @param {Object} config - Configuração do nó
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado da operação
 */
async function updateCliente(config, context) {
    flowLog.actionSuccess('update_cliente', { step: 'start', config });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        // Buscar ID do cliente
        let clienteId = context.cliente?.cli_Id || context.cliente?.id;

        if (!clienteId) {
            flowLog.actionError('update_cliente', new Error('Cliente não encontrado no contexto'));
            return { success: false, error: 'Cliente não encontrado no contexto do fluxo' };
        }

        flowLog.actionSuccess('update_cliente', { step: 'cliente_encontrado', clienteId });

        // Preparar dados de atualização
        const updates = [];
        const values = [];

        // Processar actions do frontend (novo formato)
        const actions = config.actions || [];
        
        for (const action of actions) {
            if (!action.type || action.value === undefined) continue;
            
            const processedValue = typeof action.value === 'string' 
                ? await replaceVariables(action.value, context)
                : action.value;
            
            switch (action.type) {
                case 'update_name':
                    if (processedValue) {
                        updates.push('cli_nome = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_email':
                    if (processedValue) {
                        updates.push('cli_email = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_phone':
                    if (processedValue) {
                        updates.push('cli_celular = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_phone2':
                    if (processedValue) {
                        updates.push('cli_celular2 = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_cpf':
                    if (processedValue) {
                        updates.push('cli_cpf = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_birth_date':
                    if (processedValue) {
                        updates.push('cli_dataNascimento = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_gender':
                    if (processedValue) {
                        updates.push('cli_genero = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'update_notes':
                    if (processedValue) {
                        updates.push('cli_observacoes = ?');
                        values.push(processedValue);
                    }
                    break;
                    
                case 'add_tags':
                    // Buscar tags atuais e adicionar novas
                    if (Array.isArray(processedValue) && processedValue.length > 0) {
                        const clienteAtual = await dbQuery(`SELECT cli_tags FROM CLIENTES WHERE cli_Id = ? AND ${ew.sql}`, [clienteId, ...ew.params]);
                        let tagsAtuais = [];
                        try {
                            tagsAtuais = clienteAtual[0]?.cli_tags 
                                ? JSON.parse(clienteAtual[0].cli_tags) 
                                : [];
                        } catch (e) {
                            tagsAtuais = [];
                        }
                        // Adicionar novas tags sem duplicar
                        const novasTags = [...new Set([...tagsAtuais, ...processedValue])];
                        updates.push('cli_tags = ?');
                        values.push(JSON.stringify(novasTags));
                    }
                    break;
                    
                case 'remove_tags':
                    // Buscar tags atuais e remover
                    if (Array.isArray(processedValue) && processedValue.length > 0) {
                        const clienteAtualRemove = await dbQuery(`SELECT cli_tags FROM CLIENTES WHERE cli_Id = ? AND ${ew.sql}`, [clienteId, ...ew.params]);
                        let tagsAtuaisRemove = [];
                        try {
                            tagsAtuaisRemove = clienteAtualRemove[0]?.cli_tags 
                                ? JSON.parse(clienteAtualRemove[0].cli_tags) 
                                : [];
                        } catch (e) {
                            tagsAtuaisRemove = [];
                        }
                        // Remover tags especificadas
                        const tagsRestantes = tagsAtuaisRemove.filter(t => !processedValue.includes(t));
                        updates.push('cli_tags = ?');
                        values.push(JSON.stringify(tagsRestantes));
                    }
                    break;
            }
        }

        // Compatibilidade com formato antigo (campos diretos na config)
        if (config.nome && !actions.some(a => a.type === 'update_name')) {
            updates.push('cli_nome = ?');
            values.push(await replaceVariables(config.nome, context));
        }
        if (config.email && !actions.some(a => a.type === 'update_email')) {
            updates.push('cli_email = ?');
            values.push(await replaceVariables(config.email, context));
        }
        if (config.telefone && !actions.some(a => a.type === 'update_phone')) {
            updates.push('cli_celular = ?');
            values.push(await replaceVariables(config.telefone, context));
        }
        if (config.cpf && !actions.some(a => a.type === 'update_cpf')) {
            updates.push('cli_cpf = ?');
            values.push(await replaceVariables(config.cpf, context));
        }
        if (config.dataNascimento && !actions.some(a => a.type === 'update_birth_date')) {
            updates.push('cli_dataNascimento = ?');
            values.push(await replaceVariables(config.dataNascimento, context));
        }
        if (config.genero && !actions.some(a => a.type === 'update_gender')) {
            updates.push('cli_genero = ?');
            values.push(config.genero);
        }
        if (config.observacoes && !actions.some(a => a.type === 'update_notes')) {
            updates.push('cli_observacoes = ?');
            values.push(await replaceVariables(config.observacoes, context));
        }

        // Tags em formato antigo
        if (config.tags && Array.isArray(config.tags) && !actions.some(a => a.type === 'add_tags' || a.type === 'remove_tags')) {
            updates.push('cli_tags = ?');
            values.push(JSON.stringify(config.tags));
        }

        // Custom fields (compatibilidade)
        if (config.customFields && typeof config.customFields === 'object') {
            for (const [key, value] of Object.entries(config.customFields)) {
                const fieldValue = await replaceVariables(String(value), context);
                updates.push(`cli_${key} = ?`);
                values.push(fieldValue);
            }
        }

        if (updates.length === 0) {
            flowLog.log('WARN', 'Nenhum campo para atualizar no cliente');
            return { success: true, message: 'Nenhum campo para atualizar' };
        }

        // Adicionar timestamp de atualização
        updates.push('updated_at = NOW()');
        
        // Adicionar ID no final
        values.push(clienteId);

        // Executar update
        values.push(...ew.params);
        const query = `UPDATE CLIENTES SET ${updates.join(', ')} WHERE cli_Id = ? AND ${ew.sql}`;
        await dbQuery(query, values);

        // Buscar dados atualizados do cliente
        const clientesAtualizados = await dbQuery(`SELECT * FROM CLIENTES WHERE cli_Id = ? AND ${ew.sql}`, [clienteId, ...ew.params]);
        if (clientesAtualizados.length > 0) {
            context.cliente = clientesAtualizados[0];
        }

        flowLog.actionSuccess('update_cliente', { 
            step: 'finalizado', 
            clienteId,
            updatedFields: updates.length - 1 // -1 por causa do updated_at
        });

        return {
            success: true,
            message: `Cliente #${clienteId} atualizado com sucesso`,
            updatedFields: updates.length - 1
        };

    } catch (error) {
        flowLog.actionError('update_cliente', error);
        return { success: false, error: error.message };
    }
}

/**
 * Criar ou buscar cliente por telefone
 * @param {String} phone - Telefone
 * @param {String} name - Nome (opcional)
 * @param {Object} whatsappContact - Dados do contato WhatsApp (opcional)
 * @param {Number|null} empresa_id - ID da empresa para isolamento multi-tenant (opcional)
 * @returns {Promise<Object>} - Cliente encontrado ou criado
 */
async function createOrUpdateCliente(phone, name, whatsappContact = {}, empresa_id = null) {
    flowLog.actionSuccess('create_or_update_cliente', { step: 'start', phone });

    try {
        const ew = empresaWhere(empresa_id);

        // Limpar telefone
        const cleanPhone = phone.replace(/\D/g, '');
        const last8 = cleanPhone.slice(-8);

        // Buscar cliente existente (filtrado por empresa_id)
        // Busca em cli_celular, cli_celular2 e cli_contatos (JSON)
        const clientes = await dbQuery(`
            SELECT DISTINCT c.*
            FROM CLIENTES c
            WHERE ${ew.sql}
            AND (
                RIGHT(REGEXP_REPLACE(COALESCE(c.cli_celular, ''), '[^0-9]', ''), 8) = ?
                OR RIGHT(REGEXP_REPLACE(COALESCE(c.cli_celular2, ''), '[^0-9]', ''), 8) = ?
                OR EXISTS (
                    SELECT 1
                    FROM JSON_TABLE(
                        COALESCE(c.cli_contatos, '[]'),
                        '$[*]' COLUMNS(
                            type VARCHAR(20) PATH '$.type',
                            val VARCHAR(64) PATH '$.value'
                        )
                    ) jt
                    WHERE jt.type = 'phone'
                    AND RIGHT(REGEXP_REPLACE(COALESCE(jt.val, ''), '[^0-9]', ''), 8) = ?
                )
            )
            LIMIT 1
        `, [...ew.params, last8, last8, last8]);

        let cliente;

        if (clientes.length > 0) {
            // Cliente já existe
            cliente = clientes[0];
            flowLog.actionSuccess('create_or_update_cliente', { step: 'cliente_encontrado', clienteId: cliente.cli_Id });

            // Atualizar dados se fornecidos
            if (name && (!cliente.cli_nome || cliente.cli_nome.trim() === '')) {
                await dbQuery(`UPDATE CLIENTES SET cli_nome = ? WHERE cli_Id = ? AND ${ew.sql}`, [name, cliente.cli_Id, ...ew.params]);
                cliente.cli_nome = name;
                flowLog.actionSuccess('create_or_update_cliente', { step: 'nome_atualizado' });
            }

        } else {
            // Criar novo cliente
            const nomeCliente = name || whatsappContact.pushname || whatsappContact.name || 'Cliente';

            const insertData = {
                cli_nome: nomeCliente,
                cli_celular: cleanPhone,
                cli_ativo: 1,
                flows_blocked: 0,
                empresa_id: empresa_id
            };

            const result = await dbQuery('INSERT INTO CLIENTES SET ?', insertData);
            const clienteId = result.insertId;

            cliente = {
                cli_Id: clienteId,
                ...insertData
            };

            flowLog.actionSuccess('create_or_update_cliente', {
                step: 'cliente_criado',
                clienteId,
                nome: nomeCliente
            });
        }

        return cliente;

    } catch (error) {
        flowLog.actionError('create_or_update_cliente', error);
        throw error;
    }
}

/**
 * Buscar cliente por telefone
 * @param {String} phone - Telefone do WhatsApp
 * @param {Number|null} empresa_id - ID da empresa para isolamento multi-tenant (opcional)
 * @returns {Promise<Object|null>} - Cliente encontrado ou null
 */
async function getClienteByPhone(phone, empresa_id = null) {
    flowLog.actionSuccess('get_cliente_by_phone', { step: 'start', phone });

    try {
        const ew = empresaWhere(empresa_id);
        const cleanPhone = phone.replace(/\D/g, '');
        const last8 = cleanPhone.slice(-8);

        // Busca em cli_celular, cli_celular2 e cli_contatos (JSON)
        // Limpa caracteres não numéricos e compara os últimos 8 dígitos
        const clientes = await dbQuery(`
            SELECT DISTINCT c.*
            FROM CLIENTES c
            WHERE ${ew.sql}
            AND (
                RIGHT(REGEXP_REPLACE(COALESCE(c.cli_celular, ''), '[^0-9]', ''), 8) = ?
                OR RIGHT(REGEXP_REPLACE(COALESCE(c.cli_celular2, ''), '[^0-9]', ''), 8) = ?
                OR EXISTS (
                    SELECT 1
                    FROM JSON_TABLE(
                        COALESCE(c.cli_contatos, '[]'),
                        '$[*]' COLUMNS(
                            type VARCHAR(20) PATH '$.type',
                            val VARCHAR(64) PATH '$.value'
                        )
                    ) jt
                    WHERE jt.type = 'phone'
                    AND RIGHT(REGEXP_REPLACE(COALESCE(jt.val, ''), '[^0-9]', ''), 8) = ?
                )
            )
            LIMIT 1
        `, [...ew.params, last8, last8, last8]);

        if (clientes.length > 0) {
            const cliente = clientes[0];
            
            // Sempre garantir que o telefone do WhatsApp esteja no cliente retornado
            cliente.cli_celular = phone;
            cliente.telefone = phone;
            cliente.phone = phone;
            
            flowLog.actionSuccess('get_cliente_by_phone', { step: 'cliente_encontrado', clienteId: cliente.cli_Id });
            return cliente;
        }

        flowLog.log('INFO', 'Cliente não encontrado por telefone', { phone });
        
        // Se não encontrou cliente, retornar objeto mínimo com telefone do WhatsApp
        return {
            cli_celular: phone,
            telefone: phone,
            phone: phone
        };

    } catch (error) {
        flowLog.actionError('get_cliente_by_phone', error);
        // Em caso de erro, retornar objeto mínimo com telefone do WhatsApp
        return {
            cli_celular: phone,
            telefone: phone,
            phone: phone
        };
    }
}

/**
 * Bloquear/Desbloquear cliente de receber fluxos
 * @param {Object} config - Configuração { action: 'block' | 'unblock', message: string }
 * @param {Object} context - Contexto
 * @returns {Promise<Object>} - Resultado
 */
async function blockUnblockClientFlows(config, context) {
    flowLog.actionSuccess('block_unblock_client_flows', { step: 'start', config });

    try {
        const empresa_id = context.empresa_id || null;
        const ew = empresaWhere(empresa_id);

        let clienteId = context.cliente?.cli_Id || context.cliente?.id;

        if (!clienteId) {
            return { success: false, error: 'Cliente não encontrado no contexto' };
        }

        const action = config.action || 'block'; // 'block' ou 'unblock'
        const flowsBlocked = action === 'block' ? 1 : 0;

        await dbQuery(`UPDATE CLIENTES SET flows_blocked = ?, updated_at = NOW() WHERE cli_Id = ? AND ${ew.sql}`, [flowsBlocked, clienteId, ...ew.params]);

        // Atualizar contexto
        if (context.cliente) {
            context.cliente.flows_blocked = flowsBlocked;
        }

        const actionText = action === 'block' ? 'bloqueado de receber fluxos automáticos' : 'desbloqueado para receber fluxos automáticos';
        flowLog.actionSuccess('block_unblock_client_flows', { 
            step: 'finalizado', 
            clienteId,
            action: action,
            flows_blocked: flowsBlocked
        });

        // Enviar mensagem opcional
        let messageSent = false;
        if (config.message && context.phone) {
            try {
                const { sendWhatsAppMessage } = require('./messageActions');
                await sendWhatsAppMessage({ message: config.message }, context);
                messageSent = true;
            } catch (msgError) {
                flowLog.log('WARN', 'Erro ao enviar mensagem de confirmação de bloqueio', { error: msgError.message });
            }
        }

        return {
            success: true,
            message: `Cliente #${clienteId} ${actionText}`,
            flows_blocked: flowsBlocked,
            message_sent: messageSent
        };

    } catch (error) {
        flowLog.actionError('block_unblock_client_flows', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    updateCliente,
    createOrUpdateCliente,
    getClienteByPhone,
    blockUnblockClientFlows
};
