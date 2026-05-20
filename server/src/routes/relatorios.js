const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const transporter = require('../transporter');
const fs = require('fs');
const handlebars = require('handlebars');
const util = require('util');
const moment = require('moment');
moment.locale('pt-br');

const { createRelatorioSaida, createRelatorioReceber, createRelatorioComissoes, createRelatorioServicosTecnicos } = require('../utils/generatePDF');

require('dotenv').config();
const paginateArray = (array, perPage, page) => array.slice((page - 1) * perPage, page * perPage)
const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');

const statusNomes = [
    { ast_id: 1, ast_descricao: 'Agendado' },
    { ast_id: 2, ast_descricao: 'Confirmado' },
    { ast_id: 3, ast_descricao: 'Atendido' },
    { ast_id: 4, ast_descricao: 'Pago' },
    { ast_id: 6, ast_descricao: 'Cancelado' },
    { ast_id: 7, ast_descricao: 'Remarcado' }
]

router.get('/get/financeiro', async (req, res) => {
    try {
        const {
            dataDe = null,
            dataAte = null,
        } = req.query;

        const empresa_id = req.user.empresa_id;

        // ==========================
        // 1. BUSCAR DADOS BASE
        // ==========================

        // Buscar pagamentos (receitas) - filtrando pela data do agendamento
        // IMPORTANTE: Apenas agendamentos ATENDIDOS (ast_id = 3)
        let queryPagamentos = `
            SELECT
                PAGAMENTO.*,
                AGENDAMENTO.age_data,
                AGENDAMENTO.age_valor,
                AGENDAMENTO.age_desconto,
                AGENDAMENTO.age_fonte,
                AGENDAMENTO.cli_id,
                AGENDAMENTO.ast_id,
                CLIENTES.cli_nome
            FROM PAGAMENTO
            JOIN AGENDAMENTO ON PAGAMENTO.age_id = AGENDAMENTO.age_id
            LEFT JOIN CLIENTES ON AGENDAMENTO.cli_id = CLIENTES.cli_Id
            WHERE AGENDAMENTO.ast_id = 3
            AND AGENDAMENTO.age_ativo = 1
            AND PAGAMENTO.empresa_id = ${empresa_id}
        `;

        // Buscar agendamentos atendidos (para incluir os que ainda nao tem pagamento)
        let queryAgendamentosAtendidos = `
            SELECT
                AGENDAMENTO.age_id,
                AGENDAMENTO.age_data,
                AGENDAMENTO.age_valor,
                AGENDAMENTO.age_desconto,
                AGENDAMENTO.cli_id,
                CLIENTES.cli_nome
            FROM AGENDAMENTO
            JOIN CLIENTES ON AGENDAMENTO.cli_id = CLIENTES.cli_Id
            WHERE AGENDAMENTO.ast_id = 3
            AND AGENDAMENTO.age_ativo = 1
            AND AGENDAMENTO.empresa_id = ${empresa_id}
        `;

        // Buscar agendamentos futuros (Agendado ou Confirmado)
        let queryAgendamentosFuturos = `
            SELECT
                AGENDAMENTO.age_id,
                AGENDAMENTO.age_data,
                AGENDAMENTO.age_valor,
                AGENDAMENTO.age_desconto,
                AGENDAMENTO.ast_id,
                CLIENTES.cli_nome
            FROM AGENDAMENTO
            JOIN CLIENTES ON AGENDAMENTO.cli_id = CLIENTES.cli_Id
            WHERE AGENDAMENTO.ast_id IN (1, 2)
            AND AGENDAMENTO.age_ativo = 1
            AND AGENDAMENTO.empresa_id = ${empresa_id}
        `;

        // Buscar despesas - usando des_data
        let queryDespesas = `SELECT * FROM DESPESAS WHERE 1 = 1 AND empresa_id = ${empresa_id}`;

        // Buscar comissoes - usando created_at do COMISSOES
        let queryComissoes = `
            SELECT
                COMISSOES.*,
                AGENDAMENTO.age_data
            FROM COMISSOES
            JOIN AGENDAMENTO ON COMISSOES.age_id = AGENDAMENTO.age_id
            WHERE 1 = 1
            AND COMISSOES.empresa_id = ${empresa_id}
        `;

        if (dataDe) {
            queryPagamentos += ` AND AGENDAMENTO.age_data >= '${dataDe}'`;
            queryAgendamentosAtendidos += ` AND AGENDAMENTO.age_data >= '${dataDe}'`;
            queryAgendamentosFuturos += ` AND AGENDAMENTO.age_data >= '${dataDe}'`;
            queryDespesas += ` AND DESPESAS.des_data >= '${dataDe}'`;
            queryComissoes += ` AND AGENDAMENTO.age_data >= '${dataDe}'`;
        }

        if (dataAte) {
            queryPagamentos += ` AND AGENDAMENTO.age_data <= '${dataAte}'`;
            queryAgendamentosAtendidos += ` AND AGENDAMENTO.age_data <= '${dataAte}'`;
            queryAgendamentosFuturos += ` AND AGENDAMENTO.age_data <= '${dataAte}'`;
            queryDespesas += ` AND DESPESAS.des_data <= '${dataAte}'`;
            queryComissoes += ` AND AGENDAMENTO.age_data <= '${dataAte}'`;
        }

        queryPagamentos += ` ORDER BY AGENDAMENTO.age_data DESC`;
        queryAgendamentosAtendidos += ` ORDER BY AGENDAMENTO.age_data DESC`;
        queryAgendamentosFuturos += ` ORDER BY AGENDAMENTO.age_data DESC`;
        queryDespesas += ` ORDER BY DESPESAS.des_data DESC`;
        queryComissoes += ` ORDER BY AGENDAMENTO.age_data DESC`;

        const pagamentos = await dbQuery(queryPagamentos);
        const agendamentosAtendidos = await dbQuery(queryAgendamentosAtendidos);
        const agendamentosFuturos = await dbQuery(queryAgendamentosFuturos);
        const despesas = await dbQuery(queryDespesas);
        const comissoes = await dbQuery(queryComissoes);

        // Cache de FORMAS_PAGAMENTO (evita N+1 queries dentro do loop de pagamentos)
        const formasPagamentoRows = await dbQuery('SELECT fpg_id, fpg_descricao FROM FORMAS_PAGAMENTO WHERE empresa_id = ?', [empresa_id]);
        const formasPagamentoCache = {};
        for (const fp of formasPagamentoRows) formasPagamentoCache[fp.fpg_id] = fp.fpg_descricao;

        // ==========================
        // 2. PROCESSAR PAGAMENTOS (RECEITAS)
        // ==========================
        // Importante: gráfico de evolução é agrupado pela age_data (mesma data do filtro),
        // garantindo que a soma das colunas do gráfico bata com o total recebido do período.

        let totalReceitaBruta = 0;
        let totalReceitaRecebida = 0;
        let totalReceitaPendente = 0;
        let quantidadePagamentosRecebidos = 0;
        let quantidadePagamentosPendentes = 0;

        const formasPagamentoMap = {};
        const receitaPorDia = {};
        const topClientes = {}; // key = cli_id, value = { cli_id, cli_nome, valor }
        const receitaPorFonte = {}; // key normalizada, value = { fonte, valor }

        // Mapa para evitar contagem duplicada do mesmo agendamento
        const agendamentoMap = {};

        for (let pagamento of pagamentos) {
            const ageId = pagamento.age_id;
            const valorAgendamento = parseFloat(pagamento.age_valor || 0) - parseFloat(pagamento.age_desconto || 0);

            if (!agendamentoMap[ageId]) {
                agendamentoMap[ageId] = {
                    age_id: ageId,
                    valorAgendamento,
                    cli_nome: pagamento.cli_nome,
                    age_data: pagamento.age_data,
                    valorPago: 0,
                };
            }

            const pags = pagamento.pgt_json ? JSON.parse(pagamento.pgt_json) : [];
            let valorPagoPagamento = 0;
            const fpg_names = [];

            for (let pag of pags) {
                // Somar apenas valores efetivamente pagos (pgt_data preenchida)
                if (pagamento.pgt_data) {
                    valorPagoPagamento += parseFloat(pag.pgt_valor || 0);
                }

                const formaDesc = formasPagamentoCache[pag.fpg_id] || 'Dinheiro';
                fpg_names.push(formaDesc);

                if (pagamento.pgt_data) {
                    formasPagamentoMap[formaDesc] = (formasPagamentoMap[formaDesc] || 0) + parseFloat(pag.pgt_valor || 0);
                }
            }

            pagamento.fpg_name = fpg_names.join(', ');
            pagamento.valorPago = valorPagoPagamento;

            if (pagamento.pgt_data) {
                agendamentoMap[ageId].valorPago += valorPagoPagamento;

                // Agrupar por age_data (consistente com o filtro do período) — garante que a soma do gráfico = total recebido
                const dia = moment(pagamento.age_data).format('YYYY-MM-DD');
                receitaPorDia[dia] = (receitaPorDia[dia] || 0) + valorPagoPagamento;

                // Top clientes — agrupado por cli_id (evita duplicar clientes com mesmo nome)
                if (pagamento.cli_id) {
                    if (!topClientes[pagamento.cli_id]) {
                        topClientes[pagamento.cli_id] = {
                            cli_id: pagamento.cli_id,
                            cli_nome: pagamento.cli_nome || 'Sem nome',
                            valor: 0
                        };
                    }
                    topClientes[pagamento.cli_id].valor += valorPagoPagamento;
                }

                // Receita por fonte — chave normalizada (case/space-insensitive)
                const fonteOriginal = (pagamento.age_fonte || '').trim();
                const fonteExibicao = fonteOriginal || 'Outros';
                const fonteKey = fonteOriginal.toLowerCase() || '__outros__';
                if (!receitaPorFonte[fonteKey]) {
                    receitaPorFonte[fonteKey] = { fonte: fonteExibicao, valor: 0 };
                }
                receitaPorFonte[fonteKey].valor += valorPagoPagamento;
            }
        }

        // Garantir que agendamentos atendidos sem nenhum pagamento tambem sejam considerados (pendentes)
        for (const agendamento of agendamentosAtendidos) {
            if (!agendamentoMap[agendamento.age_id]) {
                agendamentoMap[agendamento.age_id] = {
                    age_id: agendamento.age_id,
                    valorAgendamento: parseFloat(agendamento.age_valor || 0) - parseFloat(agendamento.age_desconto || 0),
                    cli_nome: agendamento.cli_nome,
                    age_data: agendamento.age_data,
                    valorPago: 0
                };
            }
        }

        // Consolidacao por agendamento (evita duplicidade) + monta lista de pagamentos em aberto
        const pagamentosEmAberto = [];
        for (const agendamento of Object.values(agendamentoMap)) {
            totalReceitaBruta += agendamento.valorAgendamento;
            totalReceitaRecebida += agendamento.valorPago;

            const pendente = Math.max(agendamento.valorAgendamento - agendamento.valorPago, 0);
            const pagoCompleto = pendente <= 0.0001; // tolerancia pequena

            totalReceitaPendente += pendente;

            if (pagoCompleto) {
                quantidadePagamentosRecebidos++;
            } else {
                quantidadePagamentosPendentes++;
                pagamentosEmAberto.push({
                    age_id: agendamento.age_id,
                    cli_nome: agendamento.cli_nome || 'Sem nome',
                    age_data: agendamento.age_data,
                    valorCobrado: parseFloat(agendamento.valorAgendamento.toFixed(2)),
                    valorRecebido: parseFloat(agendamento.valorPago.toFixed(2)),
                    valorEmAberto: parseFloat(pendente.toFixed(2))
                });
            }
        }
        pagamentosEmAberto.sort((a, b) => b.valorEmAberto - a.valorEmAberto);

        // ==========================
        // 2.1. PROCESSAR AGENDAMENTOS FUTUROS (RECEITA FUTURA)
        // ==========================
        //
        // Receita futura realista: aplica taxa de cancelamento histórica (últimos 90 dias)
        // sobre Agendado/Confirmado, gerando um intervalo Otimista (cheio) → Realista (descontado).

        // Calcular taxa de cancelamento histórica (últimos 90 dias, anteriores ao período do relatório)
        let taxaCancelamentoHistorica = 0;
        try {
            const refDate = dataDe ? moment(dataDe) : moment();
            const desde = refDate.clone().subtract(90, 'days').format('YYYY-MM-DD');
            const ate = refDate.clone().subtract(1, 'days').format('YYYY-MM-DD');
            const totaisHist = await dbQuery(`
                SELECT
                  SUM(CASE WHEN ast_id = 3 THEN 1 ELSE 0 END) AS atendidos,
                  SUM(CASE WHEN ast_id = 6 THEN 1 ELSE 0 END) AS cancelados
                FROM AGENDAMENTO
                WHERE empresa_id = ? AND age_ativo = 1
                  AND age_data BETWEEN ? AND ?
                  AND (age_type IS NULL OR age_type != 'bloqueio')
            `, [empresa_id, desde, ate]);
            const atendidosH = parseInt(totaisHist[0]?.atendidos || 0, 10);
            const canceladosH = parseInt(totaisHist[0]?.cancelados || 0, 10);
            const totalDecididos = atendidosH + canceladosH;
            if (totalDecididos > 0) {
                taxaCancelamentoHistorica = canceladosH / totalDecididos;
            }
        } catch (e) {
            console.error('Erro ao calcular taxa de cancelamento historica:', e);
        }

        let totalReceitaFutura = 0;
        let quantidadeAgendamentosFuturos = 0;
        let quantidadeAgendados = 0;
        let quantidadeConfirmados = 0;

        for (let agendamento of agendamentosFuturos) {
            const valorAgendamento = parseFloat(agendamento.age_valor || 0) - parseFloat(agendamento.age_desconto || 0);
            totalReceitaFutura += valorAgendamento;
            quantidadeAgendamentosFuturos++;

            if (agendamento.ast_id === 1) {
                quantidadeAgendados++;
            } else if (agendamento.ast_id === 2) {
                quantidadeConfirmados++;
            }
        }

        const totalReceitaFuturaRealista = parseFloat(
            (totalReceitaFutura * (1 - taxaCancelamentoHistorica)).toFixed(2)
        );

        // ==========================
        // 3. PROCESSAR DESPESAS
        // ==========================

        let totalDespesas = 0;
        let totalDespesasPagas = 0;
        let totalDespesasPendentes = 0;
        let quantidadeDespesasPagas = 0;
        let quantidadeDespesasPendentes = 0;

        const despesasPorTipo = {};
        const despesasPorDia = {};
        const formasPagamentoDespesas = {};

        for (let despesa of despesas) {
            const valor = parseFloat(despesa.des_valor || 0);
            totalDespesas += valor;

            if (despesa.des_pago) {
                totalDespesasPagas += valor;
                quantidadeDespesasPagas++;

                // Agrupar por des_data (consistente com o filtro do período) — garante soma do gráfico = total
                const dia = moment(despesa.des_data).format('YYYY-MM-DD');
                despesasPorDia[dia] = (despesasPorDia[dia] || 0) + valor;

                // Agrupar por forma de pagamento
                const forma = despesa.des_forma_pagamento || 'Nao especificado';
                formasPagamentoDespesas[forma] = (formasPagamentoDespesas[forma] || 0) + valor;
            } else {
                totalDespesasPendentes += valor;
                quantidadeDespesasPendentes++;
            }

            // Agrupar por tipo (chave normalizada — consolida variações como "Gasolina" vs "gasolina")
            const tipoOriginal = (despesa.des_tipo || '').trim();
            const tipoExibicao = tipoOriginal || 'Outros';
            const tipoKey = tipoOriginal.toLowerCase() || '__outros__';
            if (!despesasPorTipo[tipoKey]) {
                despesasPorTipo[tipoKey] = { tipo: tipoExibicao, quantidade: 0, valor: 0, valorPago: 0 };
            }
            despesasPorTipo[tipoKey].quantidade++;
            despesasPorTipo[tipoKey].valor += valor;
            if (despesa.des_pago) {
                despesasPorTipo[tipoKey].valorPago += valor;
            }
        }

        // ==========================
        // 4. PROCESSAR COMISSOES
        // ==========================

        let totalComissoes = 0;
        let totalComissoesPagas = 0;
        let totalComissoesPendentes = 0;
        let quantidadeComissoesPagas = 0;
        let quantidadeComissoesPendentes = 0;

        const comissoesPorDia = {};

        for (let comissao of comissoes) {
            const valor = parseFloat(comissao.com_valor || 0);
            totalComissoes += valor;

            if (comissao.com_paga) {
                totalComissoesPagas += valor;
                quantidadeComissoesPagas++;

                // Agrupar por age_data (consistente com o filtro do período)
                const dia = moment(comissao.age_data).format('YYYY-MM-DD');
                comissoesPorDia[dia] = (comissoesPorDia[dia] || 0) + valor;
            } else {
                totalComissoesPendentes += valor;
                quantidadeComissoesPendentes++;
            }
        }

        // ==========================
        // 5. CALCULAR TOTAIS E LUCRO
        // ==========================

        // Arredondar para 2 casas decimais para evitar imprecisão de float
        totalReceitaBruta = parseFloat(totalReceitaBruta.toFixed(2));
        totalReceitaRecebida = parseFloat(totalReceitaRecebida.toFixed(2));
        totalReceitaPendente = parseFloat(totalReceitaPendente.toFixed(2));
        totalDespesas = parseFloat(totalDespesas.toFixed(2));
        totalDespesasPagas = parseFloat(totalDespesasPagas.toFixed(2));
        totalDespesasPendentes = parseFloat(totalDespesasPendentes.toFixed(2));
        totalComissoes = parseFloat(totalComissoes.toFixed(2));
        totalComissoesPagas = parseFloat(totalComissoesPagas.toFixed(2));
        totalComissoesPendentes = parseFloat(totalComissoesPendentes.toFixed(2));

        const totalGastos = parseFloat((totalDespesasPagas + totalComissoesPagas).toFixed(2));
        const totalGastosPendentes = parseFloat((totalDespesasPendentes + totalComissoesPendentes).toFixed(2));
        const lucroLiquido = parseFloat((totalReceitaRecebida - totalGastos).toFixed(2));
        const margemLucro = totalReceitaRecebida > 0 ? (lucroLiquido / totalReceitaRecebida) * 100 : 0;

        // ==========================
        // 6. EVOLUCAO TEMPORAL
        // ==========================

        const diasPeriodo = [];
        const evolucaoReceitas = [];
        const evolucaoDespesas = [];
        const evolucaoComissoes = [];
        const evolucaoLucro = [];

        if (dataDe && dataAte) {
            let dataAtual = moment(dataDe);
            const dataFinal = moment(dataAte);

            while (dataAtual.isSameOrBefore(dataFinal)) {
                const diaKey = dataAtual.format('YYYY-MM-DD');
                diasPeriodo.push(dataAtual.format('DD/MM'));

                const receita = receitaPorDia[diaKey] || 0;
                const despesa = despesasPorDia[diaKey] || 0;
                const comissao = comissoesPorDia[diaKey] || 0;
                const lucro = receita - despesa - comissao;

                evolucaoReceitas.push(receita);
                evolucaoDespesas.push(despesa);
                evolucaoComissoes.push(comissao);
                evolucaoLucro.push(lucro);

                dataAtual.add(1, 'day');
            }
        }

        // ==========================
        // 7. TOP CLIENTES
        // ==========================

        const topClientesArray = Object.values(topClientes)
            .map(c => ({ cli_id: c.cli_id, nome: c.cli_nome, valor: c.valor }))
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10);

        const receitaPorFonteArray = Object.values(receitaPorFonte)
            .sort((a, b) => b.valor - a.valor);

        // ==========================
        // 8. FORMAS DE PAGAMENTO
        // ==========================

        const formasPagamentoArray = Object.keys(formasPagamentoMap)
            .map(forma => ({ forma, valor: formasPagamentoMap[forma] }))
            .filter(item => item.forma && item.forma !== 'null')
            .sort((a, b) => b.valor - a.valor);

        // ==========================
        // 9. TIPOS DE DESPESAS
        // ==========================

        const tiposDespesasArray = Object.values(despesasPorTipo)
            .filter(item => item.tipo && item.tipo !== 'null')
            .sort((a, b) => b.valor - a.valor);

        // ==========================
        // 9.1. FORMAS DE PAGAMENTO DAS DESPESAS
        // ==========================

        const formasPagamentoDespesasArray = Object.keys(formasPagamentoDespesas)
            .map(forma => ({ forma, valor: formasPagamentoDespesas[forma] }))
            .filter(item => item.forma && item.forma !== 'null')
            .sort((a, b) => b.valor - a.valor);

        // ==========================
        // 10. ULTIMOS REGISTROS
        // ==========================

        const ultimosRecebimentos = pagamentos
            .filter(p => p.pgt_data)
            .sort((a, b) => new Date(b.pgt_data) - new Date(a.pgt_data))
            .slice(0, 10)
            .map(p => ({
                pgt_id: p.pgt_id,
                cli_nome: p.cli_nome,
                pgt_valor: p.valorPago,
                fpg_name: p.fpg_name,
                pgt_data: p.pgt_data,
                age_data: p.age_data
            }));

        const ultimasDespesas = despesas
            .filter(d => d.des_pago)
            .sort((a, b) => new Date(b.des_paga_data || b.des_data) - new Date(a.des_paga_data || a.des_data))
            .slice(0, 10)
            .map(d => ({
                des_id: d.des_id,
                des_descricao: d.des_descricao,
                des_valor: d.des_valor,
                des_tipo: d.des_tipo,
                des_paga_data: d.des_paga_data,
                des_data: d.des_data
            }));

        // ==========================
        // 11. RESPOSTA FINAL
        // ==========================

        const data = {
            // Resumo Financeiro
            resumo: {
                totalReceitaBruta,
                totalReceitaRecebida,
                totalReceitaPendente,
                totalReceitaFutura,
                totalReceitaFuturaRealista,
                taxaCancelamentoHistorica: parseFloat((taxaCancelamentoHistorica * 100).toFixed(2)),
                totalDespesas,
                totalDespesasPagas,
                totalDespesasPendentes,
                totalComissoes,
                totalComissoesPagas,
                totalComissoesPendentes,
                totalGastos,
                totalGastosPendentes,
                lucroLiquido,
                margemLucro: margemLucro.toFixed(2),
                saldo: lucroLiquido,
                resultado: lucroLiquido > 0 ? 'Positivo' : lucroLiquido < 0 ? 'Negativo' : 'Equilibrado'
            },

            // Contadores
            contadores: {
                pagamentosRecebidos: quantidadePagamentosRecebidos,
                pagamentosPendentes: quantidadePagamentosPendentes,
                agendamentosFuturos: quantidadeAgendamentosFuturos,
                agendamentosAgendados: quantidadeAgendados,
                agendamentosConfirmados: quantidadeConfirmados,
                despesasPagas: quantidadeDespesasPagas,
                despesasPendentes: quantidadeDespesasPendentes,
                comissoesPagas: quantidadeComissoesPagas,
                comissoesPendentes: quantidadeComissoesPendentes
            },

            // Evolucao Temporal
            evolucao: {
                dias: diasPeriodo,
                receitas: evolucaoReceitas,
                despesas: evolucaoDespesas,
                comissoes: evolucaoComissoes,
                lucro: evolucaoLucro
            },

            // Top Clientes
            topClientes: topClientesArray,

            // Receita por Fonte (de onde vem o dinheiro)
            receitaPorFonte: receitaPorFonteArray,

            // Formas de Pagamento (Recebimentos)
            formasPagamento: formasPagamentoArray,

            // Formas de Pagamento (Despesas)
            formasPagamentoDespesas: formasPagamentoDespesasArray,

            // Tipos de Despesas
            tiposDespesas: tiposDespesasArray,

            // Ultimos Registros
            ultimosRecebimentos,
            ultimasDespesas,

            // Pagamentos em aberto (agendamentos atendidos cujo pagamento ainda nao foi quitado)
            pagamentosEmAberto,

            // Dados Completos (para referencia)
            dadosCompletos: {
                totalPagamentos: pagamentos.length,
                totalDespesasCount: despesas.length,
                totalComissoesCount: comissoes.length
            }
        };

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar dados financeiros', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/get/comissoes', async (req, res) => {
    try {
        const {
            dataDe = null,
            dataAte = null,
        } = req.query;

        const empresa_id = req.user.empresa_id;

        const moment = require('moment');
        moment.locale('pt-br');
        const { getAgendamentos } = require('../utils/agendaUtils');

        // ==========================
        // 1. BUSCAR COMISSOES
        // ==========================

        // Filtro por AGENDAMENTO.age_data (consistente com o relatorio financeiro)
        // LEFT JOIN CLIENTES garante que comissões cujo cliente foi excluído ainda apareçam.
        let query = `SELECT
                        COMISSOES.*,
                        User.fullName,
                        User.color,
                        AGENDAMENTO.age_data,
                        AGENDAMENTO.age_valor,
                        CLIENTES.cli_nome
                    FROM COMISSOES
                    JOIN User ON COMISSOES.fun_id = User.id
                    JOIN AGENDAMENTO ON COMISSOES.age_id = AGENDAMENTO.age_id
                    LEFT JOIN CLIENTES ON AGENDAMENTO.cli_id = CLIENTES.cli_Id
                    WHERE 1 = 1 AND COMISSOES.empresa_id = ${empresa_id}`;

        if (dataDe) {
            query += ` AND AGENDAMENTO.age_data >= '${dataDe}'`;
        }

        if (dataAte) {
            query += ` AND AGENDAMENTO.age_data <= '${dataAte}'`;
        }

        query += ` ORDER BY AGENDAMENTO.age_data DESC`;

        const comissoes = await dbQuery(query);
        const funcionarios = await dbQuery('SELECT * FROM User WHERE (role = "tecnico" OR role = "tecnico-senior") AND empresa_id = ?', [empresa_id]);

        // Buscar detalhes dos agendamentos com servicos
        const ageIds = [...new Set(comissoes.map(c => c.age_id))];
        let agendamentosMap = {};

        if (ageIds.length > 0) {
            const agendamentosQuery = `SELECT * FROM AGENDAMENTO WHERE age_id IN (${ageIds.join(',')}) AND empresa_id = ${empresa_id}`;
            const agendamentosCompletos = await getAgendamentos(agendamentosQuery, [], empresa_id);

            agendamentosCompletos.forEach(age => {
                agendamentosMap[age.age_id] = age;
            });
        }

        // ==========================
        // 2. PROCESSAR COMISSOES
        // ==========================

        let totalComissoes = 0;
        let totalComissoesPagas = 0;
        let totalComissoesNaoPagas = 0;
        let valorTotalComissoes = 0;
        let valorTotalComissoesPagas = 0;
        let valorTotalComissoesNaoPagas = 0;

        const comissoesPorDia = {};
        const comissoesPorFuncionario = {};
        const formasPagamentoComissoes = {};

        for (let comissao of comissoes) {
            const valor = parseFloat(comissao.com_valor || 0);
            totalComissoes++;
            valorTotalComissoes += valor;

            // Comissoes por funcionario
            if (!comissoesPorFuncionario[comissao.fullName]) {
                comissoesPorFuncionario[comissao.fullName] = {
                    fullName: comissao.fullName,
                    color: comissao.color,
                    valorPago: 0,
                    valorPagoQtd: 0,
                    valorNaoPago: 0,
                    valorNaoPagoQtd: 0,
                    total: 0,
                    fun_id: comissao.fun_id
                };
            }

            comissoesPorFuncionario[comissao.fullName].total += valor;

            if (comissao.com_paga) {
                totalComissoesPagas++;
                valorTotalComissoesPagas += valor;

                comissoesPorFuncionario[comissao.fullName].valorPago += valor;
                comissoesPorFuncionario[comissao.fullName].valorPagoQtd++;

                // Agrupar por age_data (consistente com filtro do período)
                const dia = moment(comissao.age_data).format('YYYY-MM-DD');
                comissoesPorDia[dia] = (comissoesPorDia[dia] || 0) + valor;

                // Formas de pagamento
                if (comissao.com_forma_pagamento) {
                    formasPagamentoComissoes[comissao.com_forma_pagamento] =
                        (formasPagamentoComissoes[comissao.com_forma_pagamento] || 0) + valor;
                }
            } else {
                totalComissoesNaoPagas++;
                valorTotalComissoesNaoPagas += valor;

                comissoesPorFuncionario[comissao.fullName].valorNaoPago += valor;
                comissoesPorFuncionario[comissao.fullName].valorNaoPagoQtd++;
            }
        }

        // ==========================
        // 3. EVOLUCAO TEMPORAL
        // ==========================

        const diasPeriodo = [];
        const evolucaoComissoesPagas = [];
        const evolucaoComissoesNaoPagas = [];

        if (dataDe && dataAte) {
            let dataAtual = moment(dataDe);
            const dataFinal = moment(dataAte);

            while (dataAtual.isSameOrBefore(dataFinal)) {
                const diaKey = dataAtual.format('YYYY-MM-DD');
                diasPeriodo.push(dataAtual.format('DD/MM'));

                const comissoesDia = comissoesPorDia[diaKey] || 0;
                evolucaoComissoesPagas.push(comissoesDia);

                dataAtual.add(1, 'day');
            }
        }

        // ==========================
        // 4. COMISSOES POR FUNCIONARIO
        // ==========================

        const totalComissoesFun = Object.values(comissoesPorFuncionario)
            .sort((a, b) => b.total - a.total);

        // ==========================
        // 5. FORMAS DE PAGAMENTO
        // ==========================

        const formasPagamentoArray = Object.keys(formasPagamentoComissoes)
            .map(forma => ({ forma, valor: formasPagamentoComissoes[forma] }))
            .filter(item => item.forma && item.forma !== 'null')
            .sort((a, b) => b.valor - a.valor);

        // ==========================
        // 6. TICKET MEDIO E METRICAS
        // ==========================

        const ticketMedioPago = totalComissoesPagas > 0
            ? valorTotalComissoesPagas / totalComissoesPagas
            : 0;

        const ticketMedioTotal = totalComissoes > 0
            ? valorTotalComissoes / totalComissoes
            : 0;

        const taxaPagamento = totalComissoes > 0
            ? (totalComissoesPagas / totalComissoes) * 100
            : 0;

        // ==========================
        // 7. LISTA COMPLETA DE COMISSOES
        // ==========================

        const comissoesDetalhadas = comissoes.map(c => {
            const agendamento = agendamentosMap[c.age_id];
            const servicos = agendamento?.servicos?.map(s => ({
                ser_nome: s.ser_nome,
                ser_descricao: s.ser_descricao,
                ser_valor: s.ser_valor,
                ser_quantity: s.ser_quantity || 1
            })) || [];

            return {
                com_id: c.com_id,
                com_valor: c.com_valor,
                com_paga: c.com_paga,
                com_paga_data: c.com_paga_data,
                com_forma_pagamento: c.com_forma_pagamento,
                com_descricao: c.com_descricao,
                created_at: c.created_at,
                fullName: c.fullName,
                fun_id: c.fun_id,
                cli_nome: c.cli_nome,
                age_id: c.age_id,
                age_data: c.age_data,
                age_valor: c.age_valor,
                servicos: servicos
            };
        });

        // ==========================
        // 8. RESPOSTA FINAL
        // ==========================

        const data = {
            // Resumo
            resumo: {
                totalComissoes,
                valorTotalComissoes,
                totalComissoesPagas,
                valorTotalComissoesPagas,
                totalComissoesNaoPagas,
                valorTotalComissoesNaoPagas,
                ticketMedioPago,
                ticketMedioTotal,
                taxaPagamento: taxaPagamento.toFixed(2)
            },

            // Evolucao Temporal
            evolucao: {
                dias: diasPeriodo,
                comissoesPagas: evolucaoComissoesPagas
            },

            // Comissoes por Funcionario
            comissoesPorFuncionario: totalComissoesFun,

            // Formas de Pagamento
            formasPagamento: formasPagamentoArray,

            // Lista completa
            comissoes: comissoesDetalhadas,

            // Dados dos funcionarios
            funcionarios
        };

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar comissoes', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/get/servicos', async (req, res) => {
    try {
        const {
            dataDe = null,
            dataAte = null,
        } = req.query;

        const empresa_id = req.user.empresa_id;

        const moment = require('moment');
        moment.locale('pt-br');
        const { getAgendamentosSimple } = require('../utils/agendaUtils');

        // ==========================
        // 1. BUSCAR AGENDAMENTOS COM PAGAMENTOS ATENDIDOS NO PERIODO
        // ==========================

        let queryAgendamentosComPagamento = `
            SELECT DISTINCT AGENDAMENTO.age_id
            FROM AGENDAMENTO
            JOIN PAGAMENTO ON AGENDAMENTO.age_id = PAGAMENTO.age_id
            WHERE AGENDAMENTO.ast_id = 3
            AND PAGAMENTO.pgt_data IS NOT NULL
            AND AGENDAMENTO.age_ativo = 1
            AND AGENDAMENTO.empresa_id = ${empresa_id}
            AND (
                EXISTS (SELECT 1 FROM AXS WHERE AXS.age_id = AGENDAMENTO.age_id)
                OR EXISTS (SELECT 1 FROM AGENDAMENTO_X_SERVICOS WHERE AGENDAMENTO_X_SERVICOS.age_id = AGENDAMENTO.age_id)
            )
        `;

        if (dataDe) {
            queryAgendamentosComPagamento += ` AND AGENDAMENTO.age_data >= '${dataDe}'`;
        }

        if (dataAte) {
            queryAgendamentosComPagamento += ` AND AGENDAMENTO.age_data <= '${dataAte}'`;
        }

        const ageIdsComPagamento = await dbQuery(queryAgendamentosComPagamento);

        if (ageIdsComPagamento.length === 0) {
            return res.status(200).json({
                totalServicosRealizados: 0,
                totalValorGerado: 0,
                ticketMedio: 0,
                servicoMaisRealizado: null,
                servicoMaisLucrativo: null,
                evolucaoServicos: [],
                servicosDetalhados: [],
                subservicosDetalhados: [],
                servicosPorFuncionario: [],
                funcionarios: [],
                statusAgendamentos: []
            });
        }

        // Buscar agendamentos completos com servicos
        const ageIds = ageIdsComPagamento.map(item => item.age_id);
        let queryAgendamentos = `SELECT * FROM AGENDAMENTO WHERE age_id IN (${ageIds.join(',')}) AND empresa_id = ${empresa_id} ORDER BY age_data DESC`;

        const agendamentos = await getAgendamentosSimple(queryAgendamentos, [], empresa_id);
        const funcionarios = await dbQuery('SELECT * FROM User WHERE podeAgendamento = 1 AND empresa_id = ?', [empresa_id]);
        const statusAgendamentos = await dbQuery('SELECT * FROM AGENDAMENTO_STATUS');

        // ==========================
        // 1.5 BUSCAR PAGAMENTOS EFETIVOS POR AGENDAMENTO (usado para calcular valorRecebido)
        // ==========================

        const pagamentosPorAgendamento = {};
        if (ageIds.length > 0) {
            const pagamentosEfetivos = await dbQuery(`
                SELECT age_id, pgt_json FROM PAGAMENTO
                WHERE age_id IN (${ageIds.join(',')}) AND pgt_data IS NOT NULL AND empresa_id = ?
            `, [empresa_id]);
            for (const pgt of pagamentosEfetivos) {
                const pgtJson = pgt.pgt_json ? JSON.parse(pgt.pgt_json) : [];
                let valorPago = 0;
                for (const item of pgtJson) valorPago += parseFloat(item.pgt_valor || 0);
                pagamentosPorAgendamento[pgt.age_id] = (pagamentosPorAgendamento[pgt.age_id] || 0) + valorPago;
            }
        }

        // ==========================
        // 2. AGREGAR DADOS POR SERVICO (PAI + SUBS + LEGACY)
        // ==========================
        // Regras (definidas pelo cliente):
        //  - "quantidade" em servicosPai, servicosPorData, servicosPorFuncionario
        //     = numero de ATENDIMENTOS DISTINTOS (nao soma de itens). Usar Sets de age_id.
        //  - "quantidade" em subservicosDetalhados = soma de itens (qty do AXS).
        //  - "valorTotal" = valor CADASTRADO no agendamento (ser_valor * qty do AXS).
        //  - "valorRecebido" = parcela do valor pago (pgt_json) atribuida ao servico,
        //     proporcional ao peso do servico no valor cobrado do agendamento.
        //     SUM(valorRecebido) por todos os servicos = total recebido (bate com Financeiro).
        // ==========================

        // Pre-cache de nomes de SERVICOS_NEW pais para evitar N+1 queries dentro do loop
        const paiIdsNecessarios = new Set();
        for (const agendamento of agendamentos) {
            for (const servico of (agendamento.servicos || [])) {
                if (servico.isSub && servico.ser_pai_id) paiIdsNecessarios.add(servico.ser_pai_id);
            }
        }
        const servicosNewMap = {};
        if (paiIdsNecessarios.size > 0) {
            const rows = await dbQuery(
                `SELECT ser_id, ser_nome FROM SERVICOS_NEW WHERE ser_id IN (${[...paiIdsNecessarios].join(',')}) AND empresa_id = ?`,
                [empresa_id]
            );
            for (const r of rows) servicosNewMap[r.ser_id] = r.ser_nome;
        }

        let servicosPaiMap = {}; // Servicos PAI (com subs somados)
        let subsDetalhados = {}; // Subservicos detalhados
        let servicosPorData = {}; // Para evolucao temporal
        let servicosPorFuncionario = {}; // Para tabela de tecnicos
        let servicosPorFonte = {}; // Pai+Fonte cruzados: "Estofados via Instagram"
        let fontesGerais = {};   // Resumo por fonte (no relatorio de servicos)

        let totalValorGerado = 0; // Valor COBRADO (cadastro do servico no agendamento)
        let totalValorRecebido = 0; // Valor RECEBIDO (pagamento proporcional)

        // Sets para contagem de atendimentos DISTINTOS por agrupador
        const ageIdsPorPai = {};                  // ser_pai_key -> Set(age_id)
        const ageIdsPorData = {};                 // ageData -> Set(age_id)
        const ageIdsPorFuncionario = {};          // funId -> Set(age_id)
        const ageIdsPorFuncionarioServico = {};   // `${funId}_${ser_pai_key}` -> Set(age_id)
        const ageIdsPorServicoFonte = {};         // `${ser_pai_key}__${fonteKey}` -> Set(age_id)
        const ageIdsPorFonteGeral = {};           // fonteKey -> Set(age_id)
        const totalAtendimentosSet = new Set();   // age_id distintos no relatorio

        for (const agendamento of agendamentos) {
            const ageData = moment(agendamento.age_data).format('YYYY-MM-DD');
            const ageId = agendamento.age_id;
            const astId = agendamento.ast_id;
            const funId = agendamento.fun_id;
            const statusDescricao = statusAgendamentos.find(s => s.ast_id === astId)?.ast_descricao || 'Desconhecido';

            // Fonte do atendimento (normalizada)
            const fonteOriginal = (agendamento.age_fonte || '').trim();
            const fonteExibicao = fonteOriginal || 'Outros';
            const fonteKey = fonteOriginal.toLowerCase() || '__outros__';

            totalAtendimentosSet.add(ageId);

            // Pre-calculo de cobrado/pago no agendamento (para distribuir valorRecebido)
            const valorPagoAgendamento = pagamentosPorAgendamento[ageId] || 0;
            let valorCobradoAgendamento = 0;
            for (const s of agendamento.servicos) {
                valorCobradoAgendamento += parseFloat(s.ser_valor || 0) * (s.ser_quantity || 1);
            }

            // Processar cada servico do agendamento
            for (const servico of agendamento.servicos) {
                const serNome = servico.ser_nome || 'Sem nome';
                const serValor = parseFloat(servico.ser_valor || 0);
                const serQuantity = servico.ser_quantity || 1;

                // Valor CADASTRADO do servico no agendamento (ser_valor * qty do AXS).
                // Pode divergir do recebido quando ha desconto/parcial/gorjeta.
                const serValorTotal = serValor * serQuantity;

                // Valor RECEBIDO proporcional (mesma logica que o relatorio Financeiro usa para o total)
                let serValorRecebido = 0;
                if (valorCobradoAgendamento > 0) {
                    serValorRecebido = (serValorTotal / valorCobradoAgendamento) * valorPagoAgendamento;
                } else if (valorPagoAgendamento > 0 && agendamento.servicos.length > 0) {
                    serValorRecebido = valorPagoAgendamento / agendamento.servicos.length;
                }

                const isOld = servico.isOld || false;
                const isSub = servico.isSub || false;
                const serPaiId = servico.ser_pai_id || servico.ser_id;

                // Determinar a chave do servico PAI
                const ser_pai_key = isOld ? `old_${servico.ser_id}` : `new_${serPaiId}`;

                totalValorGerado += serValorTotal;
                totalValorRecebido += serValorRecebido;

                // Resolver nome do PAI via cache (sem N+1 queries)
                const nomePai = (isSub && serPaiId && servicosNewMap[serPaiId]) ? servicosNewMap[serPaiId] : serNome;

                // ==========================
                // 2.1 Agregar por SERVICO PAI (inclui subs)
                // ==========================
                if (!servicosPaiMap[ser_pai_key]) {
                    servicosPaiMap[ser_pai_key] = {
                        ser_id: serPaiId,
                        ser_nome: nomePai,
                        ser_descricao: isOld ? 'Servico Antigo' : '',
                        isOld: isOld,
                        quantidade: 0,
                        valorTotal: 0,
                        valorRecebido: 0,
                        statusCount: {},
                        agendamentos: []
                    };
                    for (const status of statusAgendamentos) {
                        servicosPaiMap[ser_pai_key].statusCount[status.ast_descricao] = 0;
                    }
                    ageIdsPorPai[ser_pai_key] = new Set();
                }

                servicosPaiMap[ser_pai_key].valorTotal += serValorTotal;
                servicosPaiMap[ser_pai_key].valorRecebido += serValorRecebido;

                // statusCount conta ATENDIMENTOS distintos por status
                if (!ageIdsPorPai[ser_pai_key].has(ageId)) {
                    servicosPaiMap[ser_pai_key].statusCount[statusDescricao] =
                        (servicosPaiMap[ser_pai_key].statusCount[statusDescricao] || 0) + 1;
                }
                ageIdsPorPai[ser_pai_key].add(ageId);

                // ==========================
                // 2.2 Agregar SUBSERVICOS detalhados (apenas subs) - conta ITENS
                // ==========================
                if (isSub && servico.ser_sub_id) {
                    const sub_key = `sub_${servico.ser_sub_id}`;

                    if (!subsDetalhados[sub_key]) {
                        subsDetalhados[sub_key] = {
                            ser_sub_id: servico.ser_sub_id,
                            ser_pai_id: serPaiId,
                            ser_nome: serNome,
                            ser_descricao: servico.ser_descricao || '',
                            quantidade: 0,
                            valorTotal: 0,
                            valorRecebido: 0,
                            statusCount: {}
                        };
                        for (const status of statusAgendamentos) {
                            subsDetalhados[sub_key].statusCount[status.ast_descricao] = 0;
                        }
                    }

                    subsDetalhados[sub_key].quantidade += serQuantity;
                    subsDetalhados[sub_key].valorTotal += serValorTotal;
                    subsDetalhados[sub_key].valorRecebido += serValorRecebido;
                    subsDetalhados[sub_key].statusCount[statusDescricao] =
                        (subsDetalhados[sub_key].statusCount[statusDescricao] || 0) + serQuantity;
                }

                // ==========================
                // 2.3 Agregar por data (evolucao) - ATENDIMENTOS distintos
                // ==========================
                if (!servicosPorData[ageData]) {
                    servicosPorData[ageData] = { data: ageData, quantidade: 0, valorTotal: 0, valorRecebido: 0 };
                    ageIdsPorData[ageData] = new Set();
                }
                servicosPorData[ageData].valorTotal += serValorTotal;
                servicosPorData[ageData].valorRecebido += serValorRecebido;
                ageIdsPorData[ageData].add(ageId);

                // ==========================
                // 2.4 Agregar por funcionario - ATENDIMENTOS distintos
                // ==========================
                if (!servicosPorFuncionario[funId]) {
                    const funcionario = funcionarios.find(f => f.id === funId);
                    servicosPorFuncionario[funId] = {
                        fun_id: funId,
                        fun_nome: funcionario?.fullName || 'Desconhecido',
                        servicosRealizados: {},
                        quantidadeTotal: 0,
                        valorTotal: 0,
                        valorRecebido: 0,
                        statusCount: {}
                    };
                    for (const status of statusAgendamentos) {
                        servicosPorFuncionario[funId].statusCount[status.ast_descricao] = 0;
                    }
                    ageIdsPorFuncionario[funId] = new Set();
                }

                const funServicoKey = `${funId}_${ser_pai_key}`;

                if (!servicosPorFuncionario[funId].servicosRealizados[ser_pai_key]) {
                    servicosPorFuncionario[funId].servicosRealizados[ser_pai_key] = {
                        ser_nome: nomePai,
                        quantidade: 0,
                        valorTotal: 0,
                        valorRecebido: 0,
                        statusCount: {}
                    };
                    for (const status of statusAgendamentos) {
                        servicosPorFuncionario[funId].servicosRealizados[ser_pai_key].statusCount[status.ast_descricao] = 0;
                    }
                    ageIdsPorFuncionarioServico[funServicoKey] = new Set();
                }

                servicosPorFuncionario[funId].servicosRealizados[ser_pai_key].valorTotal += serValorTotal;
                servicosPorFuncionario[funId].servicosRealizados[ser_pai_key].valorRecebido += serValorRecebido;

                if (!ageIdsPorFuncionarioServico[funServicoKey].has(ageId)) {
                    servicosPorFuncionario[funId].servicosRealizados[ser_pai_key].statusCount[statusDescricao] =
                        (servicosPorFuncionario[funId].servicosRealizados[ser_pai_key].statusCount[statusDescricao] || 0) + 1;
                }
                ageIdsPorFuncionarioServico[funServicoKey].add(ageId);

                servicosPorFuncionario[funId].valorTotal += serValorTotal;
                servicosPorFuncionario[funId].valorRecebido += serValorRecebido;

                if (!ageIdsPorFuncionario[funId].has(ageId)) {
                    servicosPorFuncionario[funId].statusCount[statusDescricao] =
                        (servicosPorFuncionario[funId].statusCount[statusDescricao] || 0) + 1;
                }
                ageIdsPorFuncionario[funId].add(ageId);

                // ==========================
                // 2.5 Agregar por SERVICO PAI x FONTE
                // ==========================
                const servicoFonteKey = `${ser_pai_key}__${fonteKey}`;
                if (!servicosPorFonte[servicoFonteKey]) {
                    servicosPorFonte[servicoFonteKey] = {
                        ser_id: serPaiId,
                        ser_nome: nomePai,
                        fonte: fonteExibicao,
                        quantidade: 0,        // atendimentos distintos
                        valorTotal: 0,        // cobrado
                        valorRecebido: 0      // recebido proporcional
                    };
                    ageIdsPorServicoFonte[servicoFonteKey] = new Set();
                }
                servicosPorFonte[servicoFonteKey].valorTotal += serValorTotal;
                servicosPorFonte[servicoFonteKey].valorRecebido += serValorRecebido;
                ageIdsPorServicoFonte[servicoFonteKey].add(ageId);

                // ==========================
                // 2.6 Agregar por FONTE geral (resumo do relatorio de servicos)
                // ==========================
                if (!fontesGerais[fonteKey]) {
                    fontesGerais[fonteKey] = {
                        fonte: fonteExibicao,
                        quantidade: 0,      // atendimentos distintos com aquela fonte
                        valorTotal: 0,
                        valorRecebido: 0
                    };
                    ageIdsPorFonteGeral[fonteKey] = new Set();
                }
                fontesGerais[fonteKey].valorTotal += serValorTotal;
                fontesGerais[fonteKey].valorRecebido += serValorRecebido;
                ageIdsPorFonteGeral[fonteKey].add(ageId);
            }
        }

        // Materializar contadores de ATENDIMENTOS distintos a partir dos Sets
        const totalServicosRealizados = totalAtendimentosSet.size;
        for (const key of Object.keys(servicosPaiMap)) {
            servicosPaiMap[key].quantidade = ageIdsPorPai[key]?.size || 0;
        }
        for (const key of Object.keys(servicosPorData)) {
            servicosPorData[key].quantidade = ageIdsPorData[key]?.size || 0;
        }
        for (const funId of Object.keys(servicosPorFuncionario)) {
            servicosPorFuncionario[funId].quantidadeTotal = ageIdsPorFuncionario[funId]?.size || 0;
            for (const sKey of Object.keys(servicosPorFuncionario[funId].servicosRealizados)) {
                servicosPorFuncionario[funId].servicosRealizados[sKey].quantidade =
                    ageIdsPorFuncionarioServico[`${funId}_${sKey}`]?.size || 0;
            }
        }
        for (const key of Object.keys(servicosPorFonte)) {
            servicosPorFonte[key].quantidade = ageIdsPorServicoFonte[key]?.size || 0;
        }
        for (const key of Object.keys(fontesGerais)) {
            fontesGerais[key].quantidade = ageIdsPorFonteGeral[key]?.size || 0;
        }

        // ==========================
        // 3. CONSOLIDAR SERVICOS LEGACY POR NOME
        // ==========================

        const servicosConsolidados = {};

        for (const [key, servico] of Object.entries(servicosPaiMap)) {
            if (servico.isOld) {
                const nomeNormalizado = servico.ser_nome
                    .toLowerCase()
                    .trim()
                    .replace(/s$/, '');

                const keyLegacy = `legacy_${nomeNormalizado}`;

                if (!servicosConsolidados[keyLegacy]) {
                    servicosConsolidados[keyLegacy] = {
                        ser_id: 'legacy_' + nomeNormalizado,
                        ser_nome: servico.ser_nome.replace(/s$/, ''),
                        ser_descricao: 'Servico Antigo Consolidado',
                        isOld: true,
                        quantidade: 0,
                        valorTotal: 0,
                        valorRecebido: 0,
                        statusCount: {}
                    };

                    // Inicializar status counts
                    for (const status of statusAgendamentos) {
                        servicosConsolidados[keyLegacy].statusCount[status.ast_descricao] = 0;
                    }
                }

                // Merge status counts
                for (const [status, count] of Object.entries(servico.statusCount)) {
                    servicosConsolidados[keyLegacy].statusCount[status] =
                        (servicosConsolidados[keyLegacy].statusCount[status] || 0) + count;
                }

                servicosConsolidados[keyLegacy].quantidade += servico.quantidade;
                servicosConsolidados[keyLegacy].valorTotal += servico.valorTotal;
                servicosConsolidados[keyLegacy].valorRecebido += servico.valorRecebido || 0;
            } else {
                servicosConsolidados[key] = servico;
            }
        }

        // ==========================
        // 4. PREPARAR DADOS PARA O FRONTEND
        // ==========================

        // 4.1 Converter mapas em arrays e ordenar
        const servicosArray = Object.values(servicosConsolidados).sort((a, b) => b.quantidade - a.quantidade);
        const servicosPorFuncionarioArray = Object.values(servicosPorFuncionario)
            .map(func => ({
                ...func,
                servicosRealizados: Object.values(func.servicosRealizados).sort((a, b) => b.quantidade - a.quantidade)
            }))
            .sort((a, b) => b.quantidadeTotal - a.quantidadeTotal);

        // Subservicos detalhados em array
        const subsDetalhadosArray = Object.values(subsDetalhados).sort((a, b) => b.quantidade - a.quantidade);

        // Serviço x Fonte (matriz cruzada) e Fontes (resumo)
        const servicosPorFonteArray = Object.values(servicosPorFonte)
            .sort((a, b) => b.quantidade - a.quantidade);
        const fontesGeraisArray = Object.values(fontesGerais)
            .sort((a, b) => b.quantidade - a.quantidade);

        // 4.2 Preparar evolucao temporal
        const evolucaoServicos = Object.values(servicosPorData).sort((a, b) => new Date(a.data) - new Date(b.data));

        // 4.3 Calcular metricas gerais
        const ticketMedio = totalServicosRealizados > 0 ? totalValorGerado / totalServicosRealizados : 0;
        const servicoMaisRealizado = servicosArray.length > 0 ? servicosArray[0] : null;
        const servicoMaisLucrativo = servicosArray.sort((a, b) => b.valorTotal - a.valorTotal)[0] || null;
        servicosArray.sort((a, b) => b.quantidade - a.quantidade); // Reordenar

        // ==========================
        // 5. RESPOSTA
        // ==========================

        res.status(200).json({
            // Metricas gerais
            totalServicosRealizados,
            totalValorGerado,         // COBRADO
            totalValorRecebido,        // RECEBIDO (proporcional aos pagamentos)
            ticketMedio,
            servicoMaisRealizado,
            servicoMaisLucrativo,

            // Evolucao temporal
            evolucaoServicos,

            // Tabelas
            servicosDetalhados: servicosArray,
            subservicosDetalhados: subsDetalhadosArray,
            servicosPorFuncionario: servicosPorFuncionarioArray,

            // Origem dos atendimentos (cruzamento serviço × fonte)
            servicosPorFonte: servicosPorFonteArray,
            fontesGerais: fontesGeraisArray,

            // Dados auxiliares
            funcionarios,
            statusAgendamentos
        });
    } catch (error) {
        console.error('Erro ao buscar relatorio de servicos', error);
        res.status(500).json({ error: error.message });
    }
});


router.get('/get/agendamentos', async (req, res) => {
    try {
        let {
            dataDe = null,
            dataAte = null
        } = req.query;

        const empresa_id = req.user.empresa_id;

        if (!dataDe || !dataAte) {
            return res.status(400).json({ message: 'Parametros de data obrigatorios' });
        }

        // Formatar datas
        const formattedDataDe = moment(dataDe).format('YYYY-MM-DD');
        const formattedDataAte = moment(dataAte).format('YYYY-MM-DD');

        // Buscar agendamentos no periodo (EXCLUINDO BLOQUEIOS)
        let queryAgendamentos = `
            SELECT
                AGENDAMENTO.*,
                AGENDAMENTO_STATUS.ast_descricao as status_nome
            FROM AGENDAMENTO
            JOIN AGENDAMENTO_STATUS ON AGENDAMENTO.ast_id = AGENDAMENTO_STATUS.ast_id
            WHERE AGENDAMENTO.age_data >= ?
            AND AGENDAMENTO.age_data <= ?
            AND AGENDAMENTO.age_ativo = 1
            AND AGENDAMENTO.empresa_id = ?
            AND (AGENDAMENTO.age_type IS NULL OR AGENDAMENTO.age_type != 'bloqueio')
            ORDER BY AGENDAMENTO.age_data ASC
        `;

        const agendamentos = await dbQuery(queryAgendamentos, [formattedDataDe, formattedDataAte, empresa_id]);

        // Buscar clientes unicos
        const clienteIds = [...new Set(agendamentos.filter(a => a.cli_id).map(a => a.cli_id))];
        let clientesMap = {};

        if (clienteIds.length > 0) {
            const clientes = await dbQuery(`SELECT * FROM CLIENTES WHERE cli_Id IN (${clienteIds.join(',')}) AND empresa_id = ?`, [empresa_id]);
            clientes.forEach(cli => {
                clientesMap[cli.cli_Id] = cli;
            });
        }

        // Buscar enderecos unicos
        const enderecoIds = [...new Set(agendamentos.filter(a => a.age_endereco).map(a => a.age_endereco))];
        let enderecosMap = {};

        if (enderecoIds.length > 0) {
            const enderecos = await dbQuery(`SELECT * FROM ENDERECO WHERE end_id IN (${enderecoIds.join(',')})`);
            enderecos.forEach(end => {
                enderecosMap[end.end_id] = end;
            });
        }

        const funcionarioIds = [...new Set(agendamentos.filter(a => a.fun_id).map(a => a.fun_id))];
        let funcionariosMap = {};

        if (funcionarioIds.length > 0) {
            const funcionarios = await dbQuery(`SELECT * FROM User WHERE id IN (${funcionarioIds.join(',')}) AND empresa_id = ?`, [empresa_id]);
            funcionarios.forEach(fun => {
                funcionariosMap[fun.id] = fun;
            });
        }

        // Buscar pagamentos dos agendamentos atendidos
        const ageIds = agendamentos.filter(a => a.ast_id === 3).map(a => a.age_id);
        let pagamentosMap = {};

        if (ageIds.length > 0) {
            const pagamentos = await dbQuery(`
                SELECT * FROM PAGAMENTO
                WHERE age_id IN (${ageIds.join(',')})
                AND pgt_data IS NOT NULL
                AND empresa_id = ?
            `, [empresa_id]);

            pagamentos.forEach(pgt => {
                const pgtJson = pgt.pgt_json ? JSON.parse(pgt.pgt_json) : [];
                const valorPago = pgtJson.reduce((sum, item) => sum + parseFloat(item.pgt_valor || 0), 0);
                pagamentosMap[pgt.age_id] = valorPago;
            });
        }

        // === RESUMO GERAL ===
        const totalAgendamentos = agendamentos.length;
        let totalValorRecebido = 0;
        let totalValorPendente = 0;
        let totalValorFuturo = 0;

        // === EVOLUCAO POR DATA ===
        const evolucaoPorData = {};

        // === DADOS POR CIDADE ===
        const cidadesMap = {};

        // === DADOS POR BAIRRO ===
        const bairrosMap = {};

        // === DADOS POR CLIENTE ===
        const clientesStatsMap = {};

        // === DADOS POR TIPO DE AGENDAMENTO ===
        const tiposMap = {};

        // === DADOS POR CONTRATO ===
        const contratosMap = {};

        // Buscar informacoes completas dos contratos unicos (dos clientes)
        const contratoIds = [...new Set(agendamentos.filter(a => a.age_contrato).map(a => a.age_contrato))];
        let contratosInfoMap = {};

        if (contratoIds.length > 0 && clienteIds.length > 0) {
            // Buscar clientes que possuem contratos
            const clientesComContratos = await dbQuery(`
                SELECT cli_Id, cli_nome, cli_contratos
                FROM CLIENTES
                WHERE cli_contratos IS NOT NULL
                AND cli_contratos != '[]'
                AND cli_Id IN (${clienteIds.join(',')})
                AND empresa_id = ?
            `, [empresa_id]);

            // Processar contratos de cada cliente
            clientesComContratos.forEach(cliente => {
                try {
                    const contratos = JSON.parse(cliente.cli_contratos || '[]');
                    contratos.forEach(contrato => {
                        if (contrato.numero && contratoIds.includes(contrato.numero.toString())) {
                            contratosInfoMap[contrato.numero.toString()] = {
                                ...contrato,
                                cliente: cliente.cli_nome
                            };
                        }
                    });
                } catch (e) {
                    console.error('Erro ao fazer parse de cli_contratos:', e);
                }
            });
        }

        // === DADOS POR STATUS ===
        const statusMap = {};

        // === DADOS POR FONTE ===
        const fontesMap = {};

        // Processar cada agendamento
        for (const agendamento of agendamentos) {
            const cliente = clientesMap[agendamento.cli_id];
            const endereco = enderecosMap[agendamento.age_endereco];
            const valorPago = pagamentosMap[agendamento.age_id] || 0;
            const ageData = moment(agendamento.age_data).format('YYYY-MM-DD');
            const ageValor = parseFloat(agendamento.age_valor || 0) - parseFloat(agendamento.age_desconto || 0);
            const isAtendido = agendamento.ast_id === 3;
            const isAgendadoOuConfirmado = agendamento.ast_id === 1 || agendamento.ast_id === 2;
            const isPago = valorPago > 0;
            const funcionario = funcionariosMap[agendamento.fun_id] || null;
            const funcionarioNome = funcionario?.fullName || null;

            agendamento.funcionario = funcionario;

            // Evolucao por data
            if (!evolucaoPorData[ageData]) {
                evolucaoPorData[ageData] = {
                    data: ageData,
                    quantidade: 0,
                    valorRecebido: 0
                };
            }
            evolucaoPorData[ageData].quantidade += 1;
            if (isAtendido && isPago) {
                evolucaoPorData[ageData].valorRecebido += valorPago;
            }

            // Total recebido/pendente/futuro
            if (isAtendido) {
                if (isPago) {
                    totalValorRecebido += valorPago;
                } else {
                    totalValorPendente += ageValor;
                }
            } else if (isAgendadoOuConfirmado) {
                totalValorFuturo += ageValor;
            }

            // Por cidade
            if (endereco && endereco.end_cidade) {
                const cidadeKey = endereco.end_cidade.trim().toLowerCase();
                const cidadeNome = endereco.end_cidade.trim().charAt(0).toUpperCase() + endereco.end_cidade.trim().slice(1).toLowerCase();

                if (!cidadesMap[cidadeKey]) {
                    cidadesMap[cidadeKey] = {
                        cidade: cidadeNome,
                        quantidade: 0,
                        valorRecebido: 0
                    };
                }
                cidadesMap[cidadeKey].quantidade += 1;
                if (isAtendido && isPago) {
                    cidadesMap[cidadeKey].valorRecebido += valorPago;
                }
            }

            // Por bairro (chave normalizada para consolidar variações de digitação)
            if (endereco && endereco.end_bairro) {
                const bairroOriginal = endereco.end_bairro.trim();
                const bairroKey = bairroOriginal.toLowerCase();

                if (!bairrosMap[bairroKey]) {
                    bairrosMap[bairroKey] = {
                        bairro: bairroOriginal,
                        quantidade: 0,
                        valorRecebido: 0
                    };
                }
                bairrosMap[bairroKey].quantidade += 1;
                if (isAtendido && isPago) {
                    bairrosMap[bairroKey].valorRecebido += valorPago;
                }
            }

            // Por cliente
            if (cliente && cliente.cli_nome) {
                const cliKey = cliente.cli_Id;

                if (!clientesStatsMap[cliKey]) {
                    clientesStatsMap[cliKey] = {
                        cli_id: cliente.cli_Id,
                        cliente: cliente.cli_nome,
                        quantidade: 0,
                        valorRecebido: 0
                    };
                }
                clientesStatsMap[cliKey].quantidade += 1;
                if (isAtendido && isPago) {
                    clientesStatsMap[cliKey].valorRecebido += valorPago;
                }
            }

            // Por tipo de agendamento
            const tipoKey = agendamento.age_type || 'servico';
            const statusNome2 = statusNomes.find(status => status.ast_id === agendamento.ast_id)?.ast_descricao || 'Indefinido';

            if (!tiposMap[tipoKey]) {
                tiposMap[tipoKey] = {
                    tipo: tipoKey,
                    quantidade: 0,
                    valorRecebido: 0,
                    statusCount: {}
                };
            }
            tiposMap[tipoKey].quantidade += 1;

            // Contagem por status
            if (!tiposMap[tipoKey].statusCount[statusNome2]) {
                tiposMap[tipoKey].statusCount[statusNome2] = 0;
            }
            tiposMap[tipoKey].statusCount[statusNome2] += 1;

            if (isAtendido && isPago) {
                tiposMap[tipoKey].valorRecebido += valorPago;
            }

            // Por contrato
            if (agendamento.age_contrato) {
                const contratoKey = agendamento.age_contrato;
                const contratoInfo = contratosInfoMap[contratoKey];

                if (!contratosMap[contratoKey]) {
                    contratosMap[contratoKey] = {
                        contrato: contratoKey,
                        quantidade: 0,
                        valorRecebido: 0,
                        contratoInfo: contratoInfo ? contratoInfo : null
                    };
                }
                contratosMap[contratoKey].quantidade += 1;
                contratosMap[contratoKey].agendamentos = [
                    ...(contratosMap[contratoKey].agendamentos || []),
                    agendamento
                ];
                if (isAtendido && isPago) {
                    contratosMap[contratoKey].valorRecebido += valorPago;
                }
            }

            // Por status
            const statusKey = agendamento.status_nome || 'Nao informado';
            if (!statusMap[statusKey]) {
                statusMap[statusKey] = {
                    status: statusKey,
                    quantidade: 0,
                    valorRecebido: 0,
                    valorFuturo: 0
                };
            }
            statusMap[statusKey].quantidade += 1;

            // Adicionar valor baseado no status
            if (isAtendido && isPago) {
                statusMap[statusKey].valorRecebido += valorPago;
            } else if (isAgendadoOuConfirmado) {
                statusMap[statusKey].valorFuturo += ageValor;
            }

            // Por fonte (chave normalizada para consolidar variações de digitação)
            const fonteOriginal = (agendamento.age_fonte || '').trim();
            const fonteExibicao = fonteOriginal || 'Outros';
            const fonteKey = fonteOriginal.toLowerCase() || '__outros__';
            if (!fontesMap[fonteKey]) {
                fontesMap[fonteKey] = {
                    fonte: fonteExibicao,
                    quantidade: 0,
                    valorRecebido: 0,
                    valorFuturo: 0
                };
            }
            fontesMap[fonteKey].quantidade += 1;
            if (isAtendido && isPago) {
                fontesMap[fonteKey].valorRecebido += valorPago;
            } else if (isAgendadoOuConfirmado) {
                fontesMap[fonteKey].valorFuturo += ageValor;
            }
        }

        // Converter maps para arrays e ordenar
        const evolucaoArray = Object.values(evolucaoPorData).sort((a, b) =>
            moment(a.data).valueOf() - moment(b.data).valueOf()
        );

        const cidadesArray = Object.values(cidadesMap).sort((a, b) => b.quantidade - a.quantidade);
        const bairrosArray = Object.values(bairrosMap).sort((a, b) => b.quantidade - a.quantidade);
        const clientesArray = Object.values(clientesStatsMap).sort((a, b) => b.quantidade - a.quantidade);
        const tiposArray = Object.values(tiposMap).sort((a, b) => b.quantidade - a.quantidade);
        const contratosArray = Object.values(contratosMap).sort((a, b) => b.quantidade - a.quantidade);
        const statusArray = Object.values(statusMap).sort((a, b) => b.quantidade - a.quantidade);
        const fontesArray = Object.values(fontesMap).sort((a, b) => b.quantidade - a.quantidade);

        // Estatisticas por status especificos
        const qtdAtendidos = agendamentos.filter(a => a.ast_id === 3).length;
        const qtdConfirmados = agendamentos.filter(a => a.ast_id === 2).length;
        const qtdCancelados = agendamentos.filter(a => a.ast_id === 6).length;
        const qtdRetrabalhos = agendamentos.filter(a => a.age_retrabalho === 1).length;

        // Estatisticas de contratos (DOS CONTRATOS, nao dos agendamentos)
        let todosContratos = [];
        if (clienteIds.length > 0) {
            const todosClientesComContratos = await dbQuery(`
                SELECT DISTINCT cli_Id, cli_contratos
                FROM CLIENTES
                WHERE cli_contratos IS NOT NULL
                AND cli_contratos != '[]'
                AND cli_Id IN (${clienteIds.join(',')})
                AND empresa_id = ?
            `, [empresa_id]);

            todosClientesComContratos.forEach(cliente => {
                try {
                    const contratos = JSON.parse(cliente.cli_contratos || '[]');
                    todosContratos = [...todosContratos, ...contratos];
                } catch (e) {
                    console.error('Erro ao fazer parse de cli_contratos:', e);
                }
            });
        }

        const qtdContratosTotal = todosContratos.length;
        const valorTotalContratos = todosContratos.reduce((sum, contrato) =>
            sum + parseFloat(contrato.valor || 0), 0
        );

        // Resposta final
        const response = {
            // Resumo
            resumo: {
                totalAgendamentos,
                totalValorRecebido,
                totalValorPendente,
                totalValorFuturo,
                ticketMedio: qtdAtendidos > 0 ? totalValorRecebido / qtdAtendidos : 0,
                qtdAtendidos,
                qtdConfirmados,
                qtdCancelados,
                qtdRetrabalhos
            },

            // Resumo de contratos
            resumoContratos: {
                qtdContratos: qtdContratosTotal,
                valorTotalContratos: valorTotalContratos
            },

            // Evolucao
            evolucao: evolucaoArray,

            // Detalhamentos
            cidades: cidadesArray,
            bairros: bairrosArray,
            clientes: clientesArray,
            tiposAgendamento: tiposArray,
            contratos: contratosArray,
            status: statusArray,
            fontes: fontesArray
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Erro ao buscar relatorio de agendamentos:', error);
        res.status(500).json({ message: error.message });
    }
});

router.get('/list-servicos', async (req, res) => {
    let {
        q = '',
        dataDe = null,
        dataAte = null,
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc'
    } = req.query;

    const empresa_id = req.user.empresa_id;
    const offset = (page - 1) * itemsPerPage;

    let query = `SELECT * FROM SERVICOS WHERE 1 = 1 AND ser_ativo = 1 AND empresa_id = ${empresa_id}`;

    if (q) {
        query += ` AND (
            ser_nome LIKE '%${q}%' OR
            ser_descricao LIKE '%${q}%' OR
            ser_valor LIKE '%${q}%'
        )`;
    }

    if (sortBy) {
        query += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        query += ` ORDER BY ser_nome ASC`;
    }

    query += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        let totalServicos = await dbQuery(`SELECT COUNT(*) AS total FROM SERVICOS WHERE ser_ativo = 1 AND empresa_id = ?`, [empresa_id]);

        const servicos = await dbQuery(query);

        for (let servico of servicos) {
            let qtdAtendidos = 0;
            let axs = await dbQuery(`SELECT * FROM AGENDAMENTO_X_SERVICOS WHERE ser_id = ?`, [servico.ser_id]);

            for (let ax of axs) {
                let agesQuery = `SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?`;
                let agesParams = [ax.age_id, empresa_id];
                if (dataDe && dataAte) {
                    dataDe = new Date(dataDe).toISOString().split('T')[0];
                    dataAte = new Date(dataAte).toISOString().split('T')[0];
                    agesQuery += ` AND age_data >= ? AND age_data <= ?`;
                    agesParams.push(dataDe, dataAte);
                }
                let ages = await dbQuery(agesQuery, agesParams);
                if (ages.length > 0) {
                    qtdAtendidos += ax.ser_quantity;
                }
            }

            servico.qtdAtendidos = qtdAtendidos;
        }

        let juntarServicos = [];

        // Juntar servicos que tenham o mesmo nome
        for (let servico of servicos) {
            let index = juntarServicos.findIndex(juntarServico => juntarServico.ser_nome == servico.ser_nome);
            if (index == -1) {
                juntarServicos.push(servico);
            } else {
                juntarServicos[index].qtdAtendidos += servico.qtdAtendidos;
            }
        }


        let data = {
            servicos: juntarServicos,
            totalServicos: totalServicos[0].total
        };

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar servicos', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/list-servicos-f', async (req, res) => {
    const {
        f = null,
        dataDe = null,
        dataAte = null,
        sortBy = '',
        orderBy = 'asc'
    } = req.query;

    const empresa_id = req.user.empresa_id;

    const formattedDataDe = dataDe ? new Date(dataDe).toISOString().split('T')[0] : null;
    const formattedDataAte = dataAte ? new Date(dataAte).toISOString().split('T')[0] : null;

    let agesQuery = `SELECT * FROM AGENDAMENTO WHERE 1 = 1 AND empresa_id = ${empresa_id}`;

    if (formattedDataDe && formattedDataAte) {
        agesQuery += ` AND age_data >= '${formattedDataDe}' AND age_data <= '${formattedDataAte}'`;
    }

    if (f) {
        agesQuery += ` AND fun_id = ${f}`;
    }

    if (sortBy) {
        agesQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        agesQuery += ` ORDER BY age_data ASC`;
    }

    try {
        const agendamentos = await dbQuery(agesQuery);

        for (let agendamento of agendamentos) {
            agendamento.cliente = await dbQuery('SELECT * FROM CLIENTES WHERE cli_id = ? AND empresa_id = ?', [agendamento.cli_id, empresa_id]);
            agendamento.endereco = agendamento.age_endereco ? await dbQuery('SELECT * FROM ENDERECO WHERE end_id = ?', [agendamento.age_endereco])
                : await dbQuery('SELECT * FROM ENDERECO WHERE cli_id = ?', [agendamento.cli_id]);

            let axs = await dbQuery(`SELECT * FROM AGENDAMENTO_X_SERVICOS WHERE age_id = ?`, [agendamento.age_id]);

            let servicos = [];

            for (let ax of axs) {
                let servico = await dbQuery('SELECT * FROM SERVICOS WHERE ser_id = ?', [ax.ser_id]);
                if (servico.length > 0) {
                    servico[0].qtdAtendidos = ax.ser_quantity;
                    servico[0].ser_quantity = ax.ser_quantity;
                    servicos.push(servico[0]);
                }
            }

            agendamento.servicos = servicos;
        }

        let data = {
            agendamentos,
            totalAgendamentos: agendamentos.length
        };

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar servicos', error);
        res.status(500).json(error);
    }
});

// Rota de impressao de saidas removida - funcionalidade descontinuada

router.post('/print/receber', async (req, res) => {
    const {
        dataDe = null,
        dataAte = null,
    } = req.query;

    const empresa_id = req.user.empresa_id;

    if (!dataDe || !dataAte) {
        return res.status(400).json({ message: 'Parametros invalidos' });
    }

    const formattedDataDe = dataDe ? new Date(dataDe).toISOString().split('T')[0] : null;
    const formattedDataAte = dataAte ? new Date(dataAte).toISOString().split('T')[0] : null;

    try {
        let query = `SELECT DISTINCT
                        PAGAMENTO.*,
                        User.id AS user_id,
                        User.fullName AS user_fullName,
                        User.email AS user_email,
                        AGENDAMENTO.*,
                        CLIENTES.*,
                        (
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'ser_id', SERVICOS.ser_id,
                                'ser_nome', SERVICOS.ser_nome,
                                'ser_descricao', SERVICOS.ser_descricao,
                                'ser_valor', SERVICOS.ser_valor
                            ))
                            FROM AGENDAMENTO_X_SERVICOS
                            JOIN SERVICOS ON AGENDAMENTO_X_SERVICOS.ser_id = SERVICOS.ser_id
                            WHERE AGENDAMENTO_X_SERVICOS.age_id = AGENDAMENTO.age_id
                        ) AS servicos
                    FROM PAGAMENTO
                    JOIN AGENDAMENTO ON PAGAMENTO.age_id = AGENDAMENTO.age_id
                    JOIN User ON AGENDAMENTO.fun_id = User.id
                    JOIN CLIENTES ON AGENDAMENTO.cli_id = CLIENTES.cli_id
                    WHERE 1 = 1 AND PAGAMENTO.empresa_id = ${empresa_id}
                    AND AGENDAMENTO.age_data >= '${formattedDataDe}' AND AGENDAMENTO.age_data <= '${formattedDataAte}'
                    ORDER BY AGENDAMENTO.age_data DESC`;

        const pagamentos = await dbQuery(query);

        for (let i = 0; i < pagamentos.length; i++) {
            pagamentos[i].cliente = pagamentos[i].cli_nome;
            let pags = pagamentos[i].pgt_json ? JSON.parse(pagamentos[i].pgt_json) : [];
            let fpg_names = [];
            for (let pag of pags) {

                let forma = await dbQuery(`SELECT * FROM FORMAS_PAGAMENTO WHERE fpg_id = ? AND empresa_id = ?`, [pag.fpg_id, empresa_id]);
                fpg_names.push(forma.length > 0 ? forma[0].fpg_descricao : 'Dinheiro');
            }

            pagamentos[i].fpg_name = fpg_names.join(', ');
        }

        let totalRecebimento = pagamentos.reduce((acc, curr) => acc + curr.pgt_valor, 0);
        let totalNaoPago = pagamentos.filter(pagamento => !pagamento.pgt_data).reduce((acc, curr) => acc + curr.pgt_valor, 0);
        let totalPago = totalRecebimento - totalNaoPago;

        let dataDeText = dataDe ? new Date(dataDe).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
        let dataAteText = dataAte ? new Date(dataAte).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

        let data = {
            mesText: dataDeText == dataAteText ? `de ${dataDeText}` : `de ${dataDeText} ate ${dataAteText}`,
            recebimentos: pagamentos,
            dataRelatorio: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            totalRecebimentos: pagamentos.length,
            valorTotalRecebimentos: totalRecebimento,
            valorTotalNaoPago: totalNaoPago,
            valorTotalPago: totalPago,
            empresa_id,
        }

        const pdf = await createRelatorioReceber(data);

        let url = `/download/docs/relatorios/${pdf.fileName}`;

        res.status(200).json(url);
    } catch (error) {
        console.error('Erro ao buscar dados financeiros', error)
        res.status(500).json(error);
    }
});

router.post('/print/comissoes', async (req, res) => {
    const {
        dataDe = null,
        dataAte = null,
        fun_id = null,
    } = req.body;

    const empresa_id = req.user.empresa_id;

    if (!dataDe || !dataAte || !fun_id) {
        return res.status(400).json({ message: 'Parametros invalidos' });
    }

    const formattedDataDe = dataDe ? new Date(dataDe).toISOString().split('T')[0] : null;
    const formattedDataAte = dataAte ? new Date(dataAte).toISOString().split('T')[0] : null;

    try {
        const { getAgendamentos } = require('../utils/agendaUtils');

        // Buscar funcionario
        const funcionarioQuery = await dbQuery('SELECT * FROM User WHERE id = ? AND empresa_id = ?', [fun_id, empresa_id]);
        if (!funcionarioQuery.length) {
            return res.status(404).json({ message: 'Funcionario nao encontrado' });
        }
        const funcionario = funcionarioQuery[0];

        // Buscar comissoes do funcionario
        let query = `SELECT
                        COMISSOES.*,
                        AGENDAMENTO.age_data,
                        AGENDAMENTO.age_valor,
                        CLIENTES.cli_nome
                    FROM COMISSOES
                    JOIN AGENDAMENTO ON COMISSOES.age_id = AGENDAMENTO.age_id
                    JOIN CLIENTES ON AGENDAMENTO.cli_id = CLIENTES.cli_id
                    WHERE COMISSOES.fun_id = ?
                    AND COMISSOES.empresa_id = ?
                    AND DATE(COMISSOES.created_at) >= '${formattedDataDe}'
                    AND DATE(COMISSOES.created_at) <= '${formattedDataAte}'
                    ORDER BY COMISSOES.created_at DESC`;

        const comissoes = await dbQuery(query, [fun_id, empresa_id]);

        // Buscar agendamentos com servicos
        const ageIds = [...new Set(comissoes.map(c => c.age_id))];
        let agendamentosMap = {};

        if (ageIds.length > 0) {
            const agendamentosQuery = `SELECT * FROM AGENDAMENTO WHERE age_id IN (${ageIds.join(',')}) AND empresa_id = ${empresa_id}`;
            const agendamentosCompletos = await getAgendamentos(agendamentosQuery, [], empresa_id);

            agendamentosCompletos.forEach(age => {
                agendamentosMap[age.age_id] = age;
            });
        }

        // Mapear comissoes com detalhes completos
        const comissoesDetalhadas = comissoes.map(c => {
            const agendamento = agendamentosMap[c.age_id];
            const servicos = agendamento?.servicos?.map(s => ({
                ser_nome: s.ser_nome,
                ser_descricao: s.ser_descricao,
                ser_valor: s.ser_valor,
                ser_quantity: s.ser_quantity || 1
            })) || [];

            return {
                com_id: c.com_id,
                com_valor: c.com_valor,
                com_paga: c.com_paga,
                com_paga_data: c.com_paga_data,
                com_forma_pagamento: c.com_forma_pagamento,
                created_at: c.created_at,
                cli_nome: c.cli_nome,
                age_id: c.age_id,
                age_data: c.age_data,
                age_valor: c.age_valor,
                servicos: servicos
            };
        });

        let dataDeText = dataDe ? new Date(dataDe).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
        let dataAteText = dataAte ? new Date(dataAte).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

        let data = {
            mesText: dataDeText == dataAteText ? `de ${dataDeText}` : `de ${dataDeText} ate ${dataAteText}`,
            funcionario: funcionario.fullName,
            comissoes: comissoesDetalhadas,
            dataRelatorio: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            totalComissoes: comissoes.length,
            valorTotalComissoes: comissoes.reduce((acc, curr) => acc + curr.com_valor, 0),
            valorTotalPago: comissoes.filter(comissao => comissao.com_paga).reduce((acc, curr) => acc + curr.com_valor, 0),
            valorTotalNaoPago: comissoes.filter(comissao => !comissao.com_paga).reduce((acc, curr) => acc + curr.com_valor, 0),
            empresa_id,
        }

        const pdf = await createRelatorioComissoes(data);

        res.status(200).json({ url: `/download/docs/relatorios/${pdf.fileName}` });
    } catch (error) {
        console.error('Erro ao gerar relatorio de comissoes', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/print/servico-tecnico', async (req, res) => {
    const {
        f = null,
        dataDe = null,
        dataAte = null,
        sortBy = '',
        orderBy = 'asc'
    } = req.body;

    const empresa_id = req.user.empresa_id;

    const formattedDataDe = dataDe ? new Date(dataDe).toISOString().split('T')[0] : null;
    const formattedDataAte = dataAte ? new Date(dataAte).toISOString().split('T')[0] : null;

    let agesQuery = `SELECT * FROM AGENDAMENTO WHERE ast_id = 3 AND empresa_id = ${empresa_id}`;

    if (formattedDataDe && formattedDataAte) {
        agesQuery += ` AND age_data >= '${formattedDataDe}' AND age_data <= '${formattedDataAte}'`;
    }

    if (f) {
        agesQuery += ` AND fun_id = ${f}`;
    }

    if (sortBy) {
        agesQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        agesQuery += ` ORDER BY age_data DESC`;
    }

    try {
        const agendamentos = await dbQuery(agesQuery);

        for (let agendamento of agendamentos) {
            agendamento.cliente = await dbQuery('SELECT * FROM CLIENTES WHERE cli_id = ? AND empresa_id = ?', [agendamento.cli_id, empresa_id]);
            agendamento.endereco = agendamento.age_endereco ? await dbQuery('SELECT * FROM ENDERECO WHERE end_id = ?', [agendamento.age_endereco])
                : await dbQuery('SELECT * FROM ENDERECO WHERE cli_id = ?', [agendamento.cli_id]);

            let axs = await dbQuery(`SELECT * FROM AGENDAMENTO_X_SERVICOS WHERE age_id = ?`, [agendamento.age_id]);

            let servicos = [];

            for (let ax of axs) {
                let servico = await dbQuery('SELECT * FROM SERVICOS WHERE ser_id = ?', [ax.ser_id]);
                if (servico.length > 0) {
                    servico[0].qtdAtendidos = 1;
                    servicos.push(servico[0]);
                }
            }

            agendamento.servicos = servicos;
        }

        let dataDeText = dataDe ? new Date(dataDe).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
        let dataAteText = dataAte ? new Date(dataAte).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

        let tecnico = await dbQuery(`SELECT * FROM User WHERE id = ? AND empresa_id = ?`, [f, empresa_id]);

        let quantidadeServicosAtendidos = agendamentos.reduce((acc, curr) => acc + curr.servicos.length, 0);
        let valorTotalServicosAtendidos = agendamentos.reduce((acc, curr) => acc + curr.servicos.reduce((acc, curr) => acc + curr.ser_valor, 0), 0);
        let valorTotalAgendamentos = agendamentos.reduce((acc, curr) => acc + curr.age_valor, 0);

        let data = {
            mesText: dataDeText == dataAteText ? `de ${dataDeText}` : `de ${dataDeText} ate ${dataAteText}`,
            agendamentos,
            tecnico: tecnico[0].fullName,
            dataRelatorio: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            totalServicosAtendidos: quantidadeServicosAtendidos,
            valorTotalServicosAtendidos,
            valorTotalAgendamentos,
            empresa_id,
        };

        const pdf = await createRelatorioServicosTecnicos(data);

        let url = `/download/docs/relatorios/${pdf.fileName}`;

        res.status(200).json(url);
    } catch (error) {
        console.error('Erro ao buscar servicos', error);
        res.status(500).json(error);
    }
});

// Endpoint para relatorio de CRM
router.get('/get/crm', async (req, res) => {
    try {
        const {
            dataDe = null,
            dataAte = null,
        } = req.query;

        const empresa_id = req.user.empresa_id;

        // Construir filtros de data
        let dataFilter = ' AND empresa_id = ?';
        let dataParams = [empresa_id];

        if (dataDe && dataAte) {
            dataFilter += ' AND DATE(created_at) BETWEEN ? AND ?';
            dataParams.push(dataDe, dataAte);
        }

        // 1. Buscar todos os negocios
        const negocios = await dbQuery(`SELECT * FROM Negocios WHERE 1=1 ${dataFilter}`, dataParams);

        // 2. Buscar todos os funis
        const funis = await dbQuery('SELECT * FROM Funis WHERE empresa_id = ? ORDER BY ordem ASC', [empresa_id]);

        // 3. Estatisticas gerais
        const totalNegocios = negocios.length;
        const valorTotalNegocios = negocios.reduce((acc, n) => acc + (n.valor || 0), 0);
        const negociosGanhos = negocios.filter(n => n.status === 'Ganho').length;
        const negociosPerdidos = negocios.filter(n => n.status === 'Perdido').length;
        const negociosPendentes = negocios.filter(n => n.status === 'Pendente').length;

        const valorGanho = negocios.filter(n => n.status === 'Ganho').reduce((acc, n) => acc + (n.valor || 0), 0);
        const valorPerdido = negocios.filter(n => n.status === 'Perdido').reduce((acc, n) => acc + (n.valor || 0), 0);
        const valorPendente = negocios.filter(n => n.status === 'Pendente').reduce((acc, n) => acc + (n.valor || 0), 0);

        const taxaAprovacao = totalNegocios > 0 ? ((negociosGanhos / totalNegocios) * 100).toFixed(2) : 0;
        const taxaPerda = totalNegocios > 0 ? ((negociosPerdidos / totalNegocios) * 100).toFixed(2) : 0;

        // 4. Dados por etapa do funil
        const dadosPorEtapa = [];
        for (const funil of funis) {
            const negociosDaEtapa = negocios.filter(n => n.etapaId === funil.id);
            const valorDaEtapa = negociosDaEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);

            dadosPorEtapa.push({
                etapaId: funil.id,
                etapaNome: funil.nome,
                probabilidade: funil.probabilidade,
                quantidade: negociosDaEtapa.length,
                valor: valorDaEtapa,
                percentual: totalNegocios > 0 ? ((negociosDaEtapa.length / totalNegocios) * 100).toFixed(2) : 0
            });
        }

        // 5. Negocios criados por data (ultimos 30 dias ou periodo selecionado)
        const negociosPorDia = {};
        negocios.forEach(n => {
            const data = moment(n.created_at).format('YYYY-MM-DD');
            if (!negociosPorDia[data]) {
                negociosPorDia[data] = { quantidade: 0, valor: 0 };
            }
            negociosPorDia[data].quantidade++;
            negociosPorDia[data].valor += n.valor || 0;
        });

        const negociosPorDiaArray = Object.keys(negociosPorDia).map(data => ({
            data,
            quantidade: negociosPorDia[data].quantidade,
            valor: negociosPorDia[data].valor
        })).sort((a, b) => new Date(a.data) - new Date(b.data));

        // 6. Top 10 negocios por valor
        const top10Negocios = negocios
            .sort((a, b) => (b.valor || 0) - (a.valor || 0))
            .slice(0, 10)
            .map(n => ({
                id: n.id,
                title: n.title,
                valor: n.valor,
                status: n.status,
                created_at: n.created_at
            }));

        // 7. Tempo medio por etapa
        const tempoMedioPorEtapa = [];
        for (const funil of funis) {
            const negociosDaEtapa = negocios.filter(n => n.etapaId === funil.id && n.status !== 'Pendente');
            let tempoTotal = 0;

            negociosDaEtapa.forEach(n => {
                const inicio = new Date(n.created_at);
                const fim = n.data_fechamento ? new Date(n.data_fechamento) : new Date();
                const diferenca = Math.floor((fim - inicio) / (1000 * 60 * 60 * 24)); // dias
                tempoTotal += diferenca;
            });

            const tempoMedio = negociosDaEtapa.length > 0 ? Math.floor(tempoTotal / negociosDaEtapa.length) : 0;

            tempoMedioPorEtapa.push({
                etapaId: funil.id,
                etapaNome: funil.nome,
                tempoMedio // em dias
            });
        }

        // 8. Motivos de perda
        const motivosPerda = {};
        negocios.filter(n => n.status === 'Perdido' && n.motivoPerdido).forEach(n => {
            const motivo = n.motivoPerdido || 'Nao informado';
            if (!motivosPerda[motivo]) {
                motivosPerda[motivo] = 0;
            }
            motivosPerda[motivo]++;
        });

        const motivosPerdaArray = Object.keys(motivosPerda).map(motivo => ({
            motivo,
            quantidade: motivosPerda[motivo]
        })).sort((a, b) => b.quantidade - a.quantidade);

        res.status(200).json({
            estatisticas: {
                totalNegocios,
                valorTotalNegocios,
                negociosGanhos,
                negociosPerdidos,
                negociosPendentes,
                valorGanho,
                valorPerdido,
                valorPendente,
                taxaAprovacao,
                taxaPerda
            },
            dadosPorEtapa,
            negociosPorDia: negociosPorDiaArray,
            top10Negocios,
            tempoMedioPorEtapa,
            motivosPerda: motivosPerdaArray
        });
    } catch (error) {
        console.error('Erro ao buscar relatorio CRM:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para relatorio de Atendimento
router.get('/get/atendimento', async (req, res) => {
    try {
        const {
            dataDe = null,
            dataAte = null,
        } = req.query;

        const empresa_id = req.user.empresa_id;

        // Construir filtros de data
        let dataFilter = ' AND empresa_id = ?';
        let dataParams = [empresa_id];

        if (dataDe && dataAte) {
            dataFilter += ' AND DATE(inicio_conversa) BETWEEN ? AND ?';
            dataParams.push(dataDe, dataAte);
        }

        // 1. Buscar todas as conversas
        const conversas = await dbQuery(`SELECT * FROM FlowConversations WHERE 1=1 ${dataFilter}`, dataParams);

        // 2. Buscar estatisticas de fluxos
        let flowStatsFilter = ' WHERE empresa_id = ?';
        let flowStatsParams = [empresa_id];
        if (dataDe && dataAte) {
            flowStatsFilter += ' AND data_execucao BETWEEN ? AND ?';
            flowStatsParams.push(dataDe, dataAte);
        }
        const flowStats = await dbQuery(`SELECT * FROM FlowStats ${flowStatsFilter}`, flowStatsParams);

        // 3. Buscar acoes executadas
        let actionsFilter = ' WHERE empresa_id = ?';
        let actionsParams = [empresa_id];
        if (dataDe && dataAte) {
            actionsFilter += ' AND DATE(created_at) BETWEEN ? AND ?';
            actionsParams.push(dataDe, dataAte);
        }
        const flowActions = await dbQuery(`SELECT * FROM FlowActions ${actionsFilter}`, actionsParams);

        // 4. Estatisticas gerais
        const totalConversas = conversas.length;
        const conversasFinalizadas = conversas.filter(c => c.status === 'finalizado').length;
        const conversasEmAndamento = conversas.filter(c => c.status === 'em_andamento').length;
        const conversasCanceladas = conversas.filter(c => c.status === 'cancelado').length;

        const totalAgendamentosGerados = conversas.filter(c => c.gerou_agendamento === 1).length;
        const totalNegociosGerados = conversas.filter(c => c.gerou_negocio === 1).length;

        const taxaConversaoAgendamento = totalConversas > 0 ? ((totalAgendamentosGerados / totalConversas) * 100).toFixed(2) : 0;
        const taxaConversaoNegocio = totalConversas > 0 ? ((totalNegociosGerados / totalConversas) * 100).toFixed(2) : 0;

        // 5. Tempo medio de atendimento
        let tempoTotalAtendimento = 0;
        let conversasComTempo = 0;
        conversas.forEach(c => {
            if (c.fim_conversa) {
                const inicio = new Date(c.inicio_conversa);
                const fim = new Date(c.fim_conversa);
                const diferenca = Math.floor((fim - inicio) / (1000 * 60)); // minutos
                tempoTotalAtendimento += diferenca;
                conversasComTempo++;
            }
        });
        const tempoMedioAtendimento = conversasComTempo > 0 ? Math.floor(tempoTotalAtendimento / conversasComTempo) : 0;

        // 6. Conversas por fluxo
        const conversasPorFluxo = {};
        conversas.forEach(c => {
            const flowId = c.flow_id || 'Sem fluxo';
            if (!conversasPorFluxo[flowId]) {
                conversasPorFluxo[flowId] = {
                    quantidade: 0,
                    agendamentos: 0,
                    negocios: 0
                };
            }
            conversasPorFluxo[flowId].quantidade++;
            if (c.gerou_agendamento) conversasPorFluxo[flowId].agendamentos++;
            if (c.gerou_negocio) conversasPorFluxo[flowId].negocios++;
        });

        // Buscar nomes dos fluxos
        const flowIds = Object.keys(conversasPorFluxo).filter(id => id !== 'Sem fluxo');
        let fluxosNomes = {};
        if (flowIds.length > 0) {
            const flows = await dbQuery(`SELECT id, name FROM Flows WHERE id IN (${flowIds.join(',')}) AND empresa_id = ?`, [empresa_id]);
            flows.forEach(f => {
                fluxosNomes[f.id] = f.name;
            });
        }

        const conversasPorFluxoArray = Object.keys(conversasPorFluxo).map(flowId => ({
            flowId,
            flowNome: fluxosNomes[flowId] || 'Sem fluxo',
            quantidade: conversasPorFluxo[flowId].quantidade,
            agendamentos: conversasPorFluxo[flowId].agendamentos,
            negocios: conversasPorFluxo[flowId].negocios,
            taxaConversao: conversasPorFluxo[flowId].quantidade > 0
                ? ((conversasPorFluxo[flowId].agendamentos / conversasPorFluxo[flowId].quantidade) * 100).toFixed(2)
                : 0
        })).sort((a, b) => b.quantidade - a.quantidade);

        // 7. Conversas por dia
        const conversasPorDia = {};
        conversas.forEach(c => {
            const data = moment(c.inicio_conversa).format('YYYY-MM-DD');
            if (!conversasPorDia[data]) {
                conversasPorDia[data] = { quantidade: 0, agendamentos: 0, negocios: 0 };
            }
            conversasPorDia[data].quantidade++;
            if (c.gerou_agendamento) conversasPorDia[data].agendamentos++;
            if (c.gerou_negocio) conversasPorDia[data].negocios++;
        });

        const conversasPorDiaArray = Object.keys(conversasPorDia).map(data => ({
            data,
            quantidade: conversasPorDia[data].quantidade,
            agendamentos: conversasPorDia[data].agendamentos,
            negocios: conversasPorDia[data].negocios
        })).sort((a, b) => new Date(a.data) - new Date(b.data));

        // 8. Acoes mais executadas
        const acoesPorTipo = {};
        flowActions.forEach(a => {
            const tipo = a.tipo_acao || 'Desconhecido';
            if (!acoesPorTipo[tipo]) {
                acoesPorTipo[tipo] = { quantidade: 0, sucesso: 0, erro: 0 };
            }
            acoesPorTipo[tipo].quantidade++;
            if (a.sucesso) acoesPorTipo[tipo].sucesso++;
            else acoesPorTipo[tipo].erro++;
        });

        const acoesPorTipoArray = Object.keys(acoesPorTipo).map(tipo => ({
            tipo,
            quantidade: acoesPorTipo[tipo].quantidade,
            sucesso: acoesPorTipo[tipo].sucesso,
            erro: acoesPorTipo[tipo].erro,
            taxaSucesso: acoesPorTipo[tipo].quantidade > 0
                ? ((acoesPorTipo[tipo].sucesso / acoesPorTipo[tipo].quantidade) * 100).toFixed(2)
                : 0
        })).sort((a, b) => b.quantidade - a.quantidade);

        // 9. Estatisticas agregadas de execucao de fluxos
        let totalExecucoes = 0;
        let totalCompletados = 0;
        let totalCancelados = 0;
        let totalTimeout = 0;

        flowStats.forEach(fs => {
            totalExecucoes += fs.total_execucoes || 0;
            totalCompletados += fs.total_completados || 0;
            totalCancelados += fs.total_cancelados || 0;
            totalTimeout += fs.total_timeout || 0;
        });

        res.status(200).json({
            estatisticas: {
                totalConversas,
                conversasFinalizadas,
                conversasEmAndamento,
                conversasCanceladas,
                totalAgendamentosGerados,
                totalNegociosGerados,
                taxaConversaoAgendamento,
                taxaConversaoNegocio,
                tempoMedioAtendimento, // em minutos
                totalExecucoes,
                totalCompletados,
                totalCancelados,
                totalTimeout
            },
            conversasPorFluxo: conversasPorFluxoArray,
            conversasPorDia: conversasPorDiaArray,
            acoesPorTipo: acoesPorTipoArray
        });
    } catch (error) {
        console.error('Erro ao buscar relatorio de atendimento:', error);
        res.status(500).json({ error: error.message });
    }
});

const checkDateStatus = (date, isPaid) => {
    if (isPaid) return { status: 'Pago', color: 'success' };

    const today = new Date();
    const dateToCheck = new Date(date);

    // Normalize the dates to only compare year, month, and day
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateToCheckNormalized = new Date(dateToCheck.getFullYear(), dateToCheck.getMonth(), dateToCheck.getDate());

    if (dateToCheckNormalized < todayNormalized) {
        return { status: 'Em atraso', color: 'error' };
    } else if (dateToCheckNormalized > todayNormalized) {
        return { status: 'Em aberto', color: 'warning' };
    } else {
        return { status: 'Pagar hoje', color: 'info' };
    }
};


/**
 * GET /relatorios/get/contratos - Relatório detalhado de contratos
 */
router.get('/get/contratos', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { dataDe, dataAte } = req.query;

    if (!dataDe || !dataAte) {
      return res.status(400).json({ message: 'Período é obrigatório' });
    }

    // Resumo geral de contratos
    const contratosResumo = await dbQuery(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) as cancelados,
        SUM(CASE WHEN status = 'rascunho' THEN 1 ELSE 0 END) as rascunhos,
        SUM(CASE WHEN status IN ('assinado_empresa', 'assinado_cliente') THEN 1 ELSE 0 END) as em_assinatura,
        COALESCE(SUM(valor), 0) as valor_total,
        COALESCE(SUM(CASE WHEN status = 'ativo' THEN valor ELSE 0 END), 0) as valor_ativos
      FROM CONTRATOS
      WHERE empresa_id = ? AND created_at BETWEEN ? AND CONCAT(?, ' 23:59:59')
    `, [empresa_id, dataDe, dataAte]);

    // Resumo de pagamentos
    const pagamentosResumo = await dbQuery(`
      SELECT
        COALESCE(SUM(cp.valor), 0) as total_cobrado,
        COALESCE(SUM(CASE WHEN cp.status IN ('RECEIVED', 'CONFIRMED') THEN cp.valor ELSE 0 END), 0) as total_recebido,
        COALESCE(SUM(CASE WHEN cp.status = 'PENDING' THEN cp.valor ELSE 0 END), 0) as total_pendente,
        COALESCE(SUM(CASE WHEN cp.status = 'OVERDUE' THEN cp.valor ELSE 0 END), 0) as total_vencido,
        COUNT(*) as total_cobrancas,
        SUM(CASE WHEN cp.status IN ('RECEIVED', 'CONFIRMED') THEN 1 ELSE 0 END) as cobrancas_pagas,
        SUM(CASE WHEN cp.status = 'PENDING' THEN 1 ELSE 0 END) as cobrancas_pendentes,
        SUM(CASE WHEN cp.status = 'OVERDUE' THEN 1 ELSE 0 END) as cobrancas_vencidas
      FROM CONTRATO_PAGAMENTOS cp
      INNER JOIN CONTRATOS c ON cp.contrato_id = c.id
      WHERE c.empresa_id = ? AND cp.data_vencimento BETWEEN ? AND ?
    `, [empresa_id, dataDe, dataAte]);

    // Evolução mês a mês
    const evolucao = await dbQuery(`
      SELECT
        DATE_FORMAT(cp.data_vencimento, '%Y-%m') as mes,
        COALESCE(SUM(CASE WHEN cp.status IN ('RECEIVED', 'CONFIRMED') THEN cp.valor ELSE 0 END), 0) as recebido,
        COALESCE(SUM(CASE WHEN cp.status = 'PENDING' THEN cp.valor ELSE 0 END), 0) as pendente,
        COALESCE(SUM(CASE WHEN cp.status = 'OVERDUE' THEN cp.valor ELSE 0 END), 0) as vencido
      FROM CONTRATO_PAGAMENTOS cp
      INNER JOIN CONTRATOS c ON cp.contrato_id = c.id
      WHERE c.empresa_id = ? AND cp.data_vencimento BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(cp.data_vencimento, '%Y-%m')
      ORDER BY mes ASC
    `, [empresa_id, dataDe, dataAte]);

    // Formas de pagamento
    const formasPagamento = await dbQuery(`
      SELECT
        COALESCE(cp.forma_pagamento, 'N/A') as forma,
        COALESCE(SUM(cp.valor), 0) as valor,
        COUNT(*) as quantidade
      FROM CONTRATO_PAGAMENTOS cp
      INNER JOIN CONTRATOS c ON cp.contrato_id = c.id
      WHERE c.empresa_id = ? AND cp.data_vencimento BETWEEN ? AND ? AND cp.status IN ('RECEIVED', 'CONFIRMED')
      GROUP BY cp.forma_pagamento
    `, [empresa_id, dataDe, dataAte]);

    // Contratos por status
    const statusContratos = await dbQuery(`
      SELECT status, COUNT(*) as quantidade
      FROM CONTRATOS
      WHERE empresa_id = ? AND created_at BETWEEN ? AND CONCAT(?, ' 23:59:59')
      GROUP BY status
    `, [empresa_id, dataDe, dataAte]);

    // Lista detalhada
    const contratos = await dbQuery(`
      SELECT c.id, c.numero, c.valor, c.status, c.inicio_data, c.created_at,
             cl.cli_nome,
             COALESCE((SELECT SUM(cp2.valor) FROM CONTRATO_PAGAMENTOS cp2 WHERE cp2.contrato_id = c.id AND cp2.status IN ('RECEIVED', 'CONFIRMED') AND cp2.data_vencimento BETWEEN ? AND ?), 0) as total_recebido,
             COALESCE((SELECT SUM(cp3.valor) FROM CONTRATO_PAGAMENTOS cp3 WHERE cp3.contrato_id = c.id AND cp3.status = 'PENDING' AND cp3.data_vencimento BETWEEN ? AND ?), 0) as total_pendente
      FROM CONTRATOS c
      LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
      WHERE c.empresa_id = ? AND c.created_at BETWEEN ? AND CONCAT(?, ' 23:59:59')
      ORDER BY c.created_at DESC
    `, [dataDe, dataAte, dataDe, dataAte, empresa_id, dataDe, dataAte]);

    return res.json({
      resumo: contratosResumo[0] || {},
      pagamentos: pagamentosResumo[0] || {},
      evolucao,
      formasPagamento,
      statusContratos,
      contratos,
    });
  } catch (error) {
    console.error('[Relatórios] Erro ao buscar relatório de contratos:', error);
    return res.status(500).json({ message: 'Erro ao buscar relatório de contratos' });
  }
});

/**
 * GET /relatorios/get/orcamentos - Relatório de orçamentos
 * Query: dataDe, dataAte
 */
router.get('/get/orcamentos', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { dataDe, dataAte } = req.query;

    if (!dataDe || !dataAte) {
      return res.status(400).json({ message: 'Período é obrigatório' });
    }

    const dateFilter = 'AND o.created_at BETWEEN ? AND CONCAT(?, \' 23:59:59\')';
    const baseParams = [empresa_id, dataDe, dataAte];

    // 1. Resumo geral
    const resumoRows = await db(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN o.status = 'gerado' THEN 1 ELSE 0 END) as gerados,
        SUM(CASE WHEN o.status = 'enviado' THEN 1 ELSE 0 END) as enviados,
        SUM(CASE WHEN o.status = 'aceito' THEN 1 ELSE 0 END) as aceitos,
        SUM(CASE WHEN o.status = 'negado' THEN 1 ELSE 0 END) as negados,
        SUM(CASE WHEN o.status = 'fechado' THEN 1 ELSE 0 END) as fechados,
        COALESCE(SUM(o.valor_final), 0) as valor_total,
        COALESCE(SUM(CASE WHEN o.status = 'aceito' THEN o.valor_final ELSE 0 END), 0) as valor_aceitos,
        COALESCE(SUM(CASE WHEN o.status = 'negado' THEN o.valor_final ELSE 0 END), 0) as valor_negados,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('aceito', 'negado', 'fechado') THEN o.valor_final ELSE 0 END), 0) as valor_pendentes
      FROM Calculadora_Orcamentos o
      WHERE o.empresa_id = ? ${dateFilter}
    `, baseParams);

    const resumo = resumoRows[0] || {};
    resumo.taxa_aceitacao = resumo.total > 0 ? ((resumo.aceitos / resumo.total) * 100).toFixed(1) : 0;
    resumo.valor_medio = resumo.total > 0 ? (resumo.valor_total / resumo.total) : 0;
    resumo.ticket_medio_aceitos = resumo.aceitos > 0 ? (resumo.valor_aceitos / resumo.aceitos) : 0;

    // 2. Evolução por dia
    const evolucao = await db(`
      SELECT
        DATE_FORMAT(o.created_at, '%Y-%m-%d') as data,
        COUNT(*) as quantidade,
        COALESCE(SUM(o.valor_final), 0) as valor,
        SUM(CASE WHEN o.status = 'aceito' THEN 1 ELSE 0 END) as aceitos,
        SUM(CASE WHEN o.status = 'negado' THEN 1 ELSE 0 END) as negados
      FROM Calculadora_Orcamentos o
      WHERE o.empresa_id = ? ${dateFilter}
      GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')
      ORDER BY data ASC
    `, baseParams);

    // 3. Top clientes
    const topClientes = await db(`
      SELECT
        o.cliente_nome,
        COUNT(*) as quantidade,
        COALESCE(SUM(o.valor_final), 0) as valor_total,
        SUM(CASE WHEN o.status = 'aceito' THEN 1 ELSE 0 END) as aceitos,
        ROUND(SUM(CASE WHEN o.status = 'aceito' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as taxa_aceitacao
      FROM Calculadora_Orcamentos o
      WHERE o.empresa_id = ? ${dateFilter}
        AND o.cliente_nome IS NOT NULL AND o.cliente_nome != ''
      GROUP BY o.cliente_nome
      ORDER BY valor_total DESC
      LIMIT 10
    `, baseParams);

    // 4. Funil de conversão
    const funil = {
      gerados: resumo.total || 0,
      enviados: (resumo.enviados || 0) + (resumo.aceitos || 0) + (resumo.negados || 0) + (resumo.fechados || 0),
      aceitos: (resumo.aceitos || 0) + (resumo.fechados || 0),
    };
    funil.taxa_gerado_enviado = funil.gerados > 0 ? ((funil.enviados / funil.gerados) * 100).toFixed(1) : 0;
    funil.taxa_enviado_aceito = funil.enviados > 0 ? ((funil.aceitos / funil.enviados) * 100).toFixed(1) : 0;

    // 5. Serviços mais orçados
    const servicosMaisOrcados = await db(`
      SELECT
        o.tipo_servico as servico,
        COUNT(*) as quantidade,
        COALESCE(SUM(o.valor_final), 0) as valor_total
      FROM Calculadora_Orcamentos o
      WHERE o.empresa_id = ? ${dateFilter}
        AND o.tipo_servico IS NOT NULL AND o.tipo_servico != ''
      GROUP BY o.tipo_servico
      ORDER BY quantidade DESC
      LIMIT 10
    `, baseParams);

    return res.json({
      resumo,
      evolucao,
      topClientes,
      funil,
      servicosMaisOrcados,
    });
  } catch (error) {
    console.error('[Relatórios] Erro ao buscar relatório de orçamentos:', error);
    return res.status(500).json({ message: 'Erro ao buscar relatório de orçamentos' });
  }
});

module.exports = router;
