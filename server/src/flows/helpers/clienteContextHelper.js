const dbQuery = require('../../utils/dbHelper');
const { empresaWhere } = require('../../utils/dbHelper');
const moment = require('moment');

/**
 * Gera um resumo simplificado e contextualizado do cliente para a IA
 * @param {Object} cliente - Dados básicos do cliente
 * @returns {String} Resumo do cliente formatado
 */
async function getClienteResumoParaIA(cliente, empresa_id = null) {
    if (!cliente || !cliente.cli_Id) {
        return 'Nenhuma informação prévia do cliente disponível.';
    }

    const ew = empresaWhere(empresa_id);

    let resumo = [];

    // ===== DADOS BÁSICOS =====
    resumo.push(`**Nome:** ${cliente.cli_nome || 'Não informado'}`);
    
    if (cliente.cli_celular) {
        resumo.push(`**Telefone:** ${cliente.cli_celular}`);
    }
    
    if (cliente.cli_email) {
        resumo.push(`**Email:** ${cliente.cli_email}`);
    }

    // ===== HISTÓRICO DE AGENDAMENTOS =====
    try {
        const agendamentos = await dbQuery(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN age_status = 'Concluído' THEN 1 ELSE 0 END) as concluidos,
                SUM(CASE WHEN age_status = 'Cancelado' THEN 1 ELSE 0 END) as cancelados,
                MAX(CASE WHEN age_status = 'Concluído' THEN age_data END) as ultima_visita,
                COUNT(CASE WHEN age_data >= DATE_SUB(NOW(), INTERVAL 6 MONTH) THEN 1 END) as ultimos_6_meses
            FROM AGENDAMENTO
            WHERE cli_id = ? AND ${ew.sql}
        `, [cliente.cli_Id, ...ew.params]);

        if (agendamentos && agendamentos[0]) {
            const hist = agendamentos[0];
            
            if (hist.total > 0) {
                resumo.push(`\n**Histórico de Atendimentos:**`);
                resumo.push(`- Total de agendamentos: ${hist.total}`);
                resumo.push(`- Concluídos: ${hist.concluidos}`);
                
                if (hist.cancelados > 0) {
                    resumo.push(`- Cancelados: ${hist.cancelados}`);
                }
                
                if (hist.ultima_visita) {
                    const diasDesdeUltima = moment().diff(moment(hist.ultima_visita), 'days');
                    resumo.push(`- Última visita: ${moment(hist.ultima_visita).format('DD/MM/YYYY')} (há ${diasDesdeUltima} dias)`);
                }
                
                if (hist.ultimos_6_meses > 0) {
                    resumo.push(`- Atendimentos nos últimos 6 meses: ${hist.ultimos_6_meses}`);
                }

                // Buscar serviços mais utilizados
                const servicosFrequentes = await dbQuery(`
                    SELECT s.ser_nome, COUNT(*) as vezes
                    FROM AGENDAMENTO a
                    LEFT JOIN SERVICOS_NEW s ON s.ser_id = a.ser_id
                    WHERE a.cli_id = ? AND a.age_status = 'Concluído' AND a.${ew.sql}
                    GROUP BY s.ser_nome
                    ORDER BY vezes DESC
                    LIMIT 3
                `, [cliente.cli_Id, ...ew.params]);

                if (servicosFrequentes && servicosFrequentes.length > 0) {
                    resumo.push(`- Serviços mais contratados: ${servicosFrequentes.map(s => `${s.ser_nome} (${s.vezes}x)`).join(', ')}`);
                }
            } else {
                resumo.push(`\n**Histórico:** Cliente novo, sem agendamentos anteriores.`);
            }
        }
    } catch (error) {
        console.error('Erro ao buscar histórico de agendamentos:', error);
    }

    // ===== HISTÓRICO FINANCEIRO =====
    try {
        const financeiro = await dbQuery(`
            SELECT
                COALESCE(SUM(p.pgt_valor), 0) as total_pago,
                COUNT(DISTINCT p.pgt_id) as total_pagamentos,
                AVG(p.pgt_valor) as ticket_medio,
                MAX(p.pgt_data) as ultimo_pagamento
            FROM PAGAMENTO p
            JOIN AGENDAMENTO a ON a.age_id = p.age_id
            WHERE a.cli_id = ? AND p.pgt_data IS NOT NULL AND a.${ew.sql}
        `, [cliente.cli_Id, ...ew.params]);

        if (financeiro && financeiro[0] && financeiro[0].total_pago > 0) {
            const fin = financeiro[0];
            resumo.push(`\n**Histórico Financeiro:**`);
            resumo.push(`- Total investido: R$ ${parseFloat(fin.total_pago).toFixed(2)}`);
            resumo.push(`- Ticket médio: R$ ${parseFloat(fin.ticket_medio).toFixed(2)}`);
            
            if (fin.ultimo_pagamento) {
                resumo.push(`- Último pagamento: ${moment(fin.ultimo_pagamento).format('DD/MM/YYYY')}`);
            }
        }
    } catch (error) {
        console.error('Erro ao buscar histórico financeiro:', error);
    }

    // ===== ENDEREÇOS =====
    try {
        const enderecos = await dbQuery(`
            SELECT end_logradouro, end_numero, end_bairro, end_cidade, end_estado
            FROM ENDERECO
            WHERE cli_Id = ? AND ${ew.sql}
            LIMIT 2
        `, [cliente.cli_Id, ...ew.params]);

        if (enderecos && enderecos.length > 0) {
            resumo.push(`\n**Endereços cadastrados:**`);
            enderecos.forEach((end, idx) => {
                resumo.push(`${idx + 1}. ${end.end_logradouro || ''}, ${end.end_numero || ''} - ${end.end_bairro || ''}, ${end.end_cidade || ''}/${end.end_estado || ''}`);
            });
        } else {
            resumo.push(`\n**Endereço:** Nenhum endereço cadastrado.`);
        }
    } catch (error) {
        console.error('Erro ao buscar endereços:', error);
    }

    // ===== AGENDAMENTOS PENDENTES/FUTUROS =====
    try {
        const agendamentosFuturos = await dbQuery(`
            SELECT a.age_id, a.age_data, a.age_horaInicio, s.ser_nome, st.sta_nome
            FROM AGENDAMENTO a
            LEFT JOIN SERVICOS_NEW s ON s.ser_id = a.ser_id
            LEFT JOIN STATUS st ON st.sta_id = a.age_status
            WHERE a.cli_id = ?
            AND a.age_data >= CURDATE()
            AND a.age_status NOT IN ('Cancelado', 'Concluído')
            AND a.${ew.sql}
            ORDER BY a.age_data, a.age_horaInicio
            LIMIT 3
        `, [cliente.cli_Id, ...ew.params]);

        if (agendamentosFuturos && agendamentosFuturos.length > 0) {
            resumo.push(`\n**Agendamentos Futuros:**`);
            agendamentosFuturos.forEach((ag, idx) => {
                resumo.push(`${idx + 1}. ${ag.ser_nome || 'Serviço'} - ${moment(ag.age_data).format('DD/MM/YYYY')} às ${ag.age_horaInicio} (${ag.sta_nome || 'Status'})`);
            });
        }
    } catch (error) {
        console.error('Erro ao buscar agendamentos futuros:', error);
    }

    // ===== TAGS DO CLIENTE =====
    if (cliente.cli_tags) {
        try {
            const tags = typeof cliente.cli_tags === 'string' ? JSON.parse(cliente.cli_tags) : cliente.cli_tags;
            if (tags && tags.length > 0) {
                resumo.push(`\n**Tags:** ${tags.map(t => t.name || t).join(', ')}`);
            }
        } catch (error) {
            // Ignorar erro de parse
        }
    }

    // ===== OBSERVAÇÕES E PREFERÊNCIAS =====
    if (cliente.cli_observacoes) {
        resumo.push(`\n**Observações:** ${cliente.cli_observacoes}`);
    }

    return resumo.join('\n');
}

/**
 * Verifica se as configurações de IA do Gemini estão completas
 * @returns {Object} { configured: boolean, missingFields: [] }
 */
async function verificarConfiguracoesIA(empresa_id = null) {
    console.log('🔍 Verificando configurações de IA (Gemini)...');

    const ew = empresaWhere(empresa_id);
    const camposObrigatorios = [
        'gemini_key',
        'gemini_comportamento',
        'gemini_empresa',
        'gemini_agendamentos'
    ];

    const configs = await dbQuery(`
        SELECT type, value FROM Options
        WHERE type IN (${camposObrigatorios.map(() => '?').join(',')}) AND ${ew.sql}
    `, [...camposObrigatorios, ...ew.params]);

    const missing = [];
    
    for (const campo of camposObrigatorios) {
        const config = configs.find(c => c.type === campo);
        
        if (!config || !config.value || config.value === '' || config.value === 'null' || config.value === '{}') {
            missing.push(campo);
        }
    }

    const configured = missing.length === 0;
    
    console.log(configured ? '✅ Configurações de IA completas' : `⚠️ Configurações incompletas: ${missing.join(', ')}`);
    
    return {
        configured,
        missingFields: missing
    };
}

/**
 * Obtém dados completos do cliente enriquecidos para contexto da IA
 * @param {Number|Object} clienteIdOrObj - ID do cliente ou objeto do cliente
 * @returns {Object} Dados completos do cliente
 */
async function getClienteCompletoParaIA(clienteIdOrObj, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    let cliente;

    if (typeof clienteIdOrObj === 'object') {
        cliente = clienteIdOrObj;
    } else {
        const rows = await dbQuery(`SELECT * FROM CLIENTES WHERE cli_Id = ? AND ${ew.sql}`, [clienteIdOrObj, ...ew.params]);
        if (!rows || rows.length === 0) {
            return null;
        }
        cliente = rows[0];
    }

    // Enriquecer com resumo
    const resumo = await getClienteResumoParaIA(cliente, empresa_id);

    return {
        ...cliente,
        resumo_ia: resumo
    };
}

module.exports = {
    getClienteResumoParaIA,
    verificarConfiguracoesIA,
    getClienteCompletoParaIA
};

