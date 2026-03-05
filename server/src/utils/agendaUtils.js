
const moment = require('moment');
const { sanitizeInput } = require('../utils/functions');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');

async function getAgendamentos(dataQuery, queryParams, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    console.log('Empresa ID:', empresa_id, 'ew:', ew);
    try {
        const agendamentos = await dbQuery(dataQuery, queryParams);

        for (let agendamento of agendamentos) {
            try {
                agendamento.cliente = await dbQuery('SELECT * FROM CLIENTES WHERE cli_Id = ? AND ' + ew.sql, [agendamento.cli_id, ...ew.params]);

                if (agendamento.cliente.length > 0 && agendamento.cliente[0].cli_contratos) {
                    agendamento.cliente[0].cli_contratos = JSON.parse(agendamento.cliente[0].cli_contratos);

                    if (agendamento.age_contrato) {
                        agendamento.age_contrato_obj = agendamento.cliente[0].cli_contratos.find(c => c.numero === agendamento.age_contrato) || null;
                    }
                }

                agendamento.funcionario = await dbQuery('SELECT * FROM User WHERE id = ? AND ' + ew.sql, [agendamento.fun_id, ...ew.params]);
                agendamento.age_metragem = agendamento.age_metragem ? JSON.parse(agendamento.age_metragem) : { interno: '', externo: '', total: '' };
                agendamento.endereco = agendamento.age_endereco ? await dbQuery('SELECT * FROM ENDERECO WHERE end_id = ? AND ' + ew.sql, [agendamento.age_endereco, ...ew.params])
                    : await dbQuery('SELECT * FROM ENDERECO WHERE cli_id = ? AND ' + ew.sql, [agendamento.cli_id, ...ew.params]);

                let servicos = [];


                let axs = await dbQuery('SELECT * FROM AXS WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);

                for (let ax of axs) {
                    let servico;

                    if (ax.ser_sub_id) {
                        servico = await dbQuery('SELECT * FROM SERVICOS_SUBS WHERE ser_id = ? AND ' + ew.sql, [ax.ser_sub_id, ...ew.params]);
                    } else {
                        servico = await dbQuery('SELECT * FROM SERVICOS_NEW WHERE ser_id = ? AND ' + ew.sql, [ax.ser_id, ...ew.params]);
                    }

                    if (servico.length > 0) {
                        let objPush = {
                            ...ax,
                            ser_id: ax.ser_sub_id && servico[0].ser_pai ? servico[0].ser_pai : ax.ser_id,
                            isSub: ax.ser_sub_id ? true : false,
                            ser_nome: ax.ser_nome ? ax.ser_nome : servico[0].ser_nome,
                            ser_descricao: ax.ser_descricao ? ax.ser_descricao : null,
                            ser_valor: ax.ser_valor ? ax.ser_valor : 0,
                            ser_data: ax.ser_data ? JSON.parse(ax.ser_data) : {},
                            servico_raw: servico[0]
                        };

                        if (objPush.isSub) {
                            const paiQuery = await dbQuery('SELECT * FROM SERVICOS_NEW WHERE ser_id = ? AND ' + ew.sql, [servico[0].ser_pai, ...ew.params]);
                            if (paiQuery.length > 0) {
                                objPush.pai_name = paiQuery[0].ser_nome;

                                /*   if (objPush.ser_valor == null) {
                                      objPush.ser_valor = paiQuery[0].ser_valor;
                                  } */

                                /*   if (!objPush.servico_raw?.ser_comissao && paiQuery[0].ser_comissao) {
                                      objPush.servico_raw.ser_comissao = paiQuery[0].ser_comissao;
                                  }
  
                                  if (!objPush.servico_raw?.ser_comissao_type && paiQuery[0].ser_comissao_type) {
                                      objPush.servico_raw.ser_comissao_type = paiQuery[0].ser_comissao_type;
                                  } */
                            } else {
                                objPush.pai_name = '-';
                            }
                        }

                        servicos.push(objPush);
                    }

                }

                let axs_old = await dbQuery('SELECT * FROM AGENDAMENTO_X_SERVICOS WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);

                for (let ax of axs_old) {
                    let servico = await dbQuery('SELECT * FROM SERVICOS WHERE ser_id = ? AND ' + ew.sql, [ax.ser_id, ...ew.params]);

                    if (!servico.length) continue;

                    servico[0].ser_quantity = ax.ser_quantity;
                    servico[0].isOld = true;
                    servicos.push(servico[0]);
                }


                agendamento.servicos = servicos;

                if (agendamento.age_type == 'retrabalho' && !agendamento.age_retrabalho) {
                    await dbQuery('UPDATE AGENDAMENTO SET age_retrabalho = 1 WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);
                    agendamento.age_retrabalho = true;
                }

                agendamento.age_retrabalho = agendamento.age_retrabalho ? true : false;
                agendamento.imagens = await dbQuery('SELECT * FROM IMAGENS_AGE WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);

                let status = await dbQuery('SELECT * FROM AGENDAMENTO_STATUS WHERE ast_id = ? AND ' + ew.sql, [agendamento.ast_id, ...ew.params]);

                agendamento.status = status.length > 0 ? status[0].ast_descricao : 'Agendado';
                agendamento.statusColors = await dbQuery('SELECT * FROM Options WHERE type IN ("cor_atendido", "cor_cancelado", "cor_remarcado", "cor_bloqueio") AND ' + ew.sql, [...ew.params]);

                if (agendamento.age_type == 'bloqueio') {
                    agendamento.bkColor = agendamento.statusColors.length > 0 ? agendamento.statusColors.find(cor => cor.type === 'cor_bloqueio').value : '#000000';
                } else if (agendamento.ast_id === 3) { //Atendido
                    agendamento.bkColor = agendamento.statusColors.length > 0 ? agendamento.statusColors.find(cor => cor.type === 'cor_atendido').value : '#A8A8A8';
                } else if (agendamento.ast_id === 6) { //Cancelado
                    agendamento.bkColor = agendamento.statusColors.length > 0 ? agendamento.statusColors.find(cor => cor.type === 'cor_cancelado').value : '#AA0000';
                } else if (agendamento.ast_id === 7) { //Remarcado
                    agendamento.bkColor = agendamento.statusColors.length > 0 ? agendamento.statusColors.find(cor => cor.type === 'cor_remarcado').value : '#FF4500';
                } else {
                    agendamento.bkColor = agendamento.funcionario[0] ? agendamento.funcionario[0].color : '#BDBDBD';
                }

                const pagamentos = await dbQuery(`SELECT * FROM PAGAMENTO WHERE age_id = ? AND ` + ew.sql, [agendamento.age_id, ...ew.params]);

                let age_valor = servicos.reduce((total, servico) => total + (parseFloat(servico.ser_valor || 0) * (servico.ser_quantity ?? 1)), 0);
                age_valor = parseFloat(age_valor.toFixed(2));

                if (age_valor != agendamento.age_valor) {
                    console.log("Valor do agendamento diferente do valor calculado", age_valor, agendamento.age_valor);
                    agendamento.age_valor = age_valor;
                    await dbQuery('UPDATE AGENDAMENTO SET age_valor = ? WHERE age_id = ? AND ' + ew.sql, [age_valor, agendamento.age_id, ...ew.params]);
                }

                let valorPago = 0;

                for (let pagamento of pagamentos) {
                    for (let pag of JSON.parse(pagamento.pgt_json || '[]')) {
                        valorPago += pagamento.pgt_data ? parseFloat(pag.pgt_valor) : 0;
                    }
                }

                let ageValorFinal = parseFloat(agendamento.age_valor - (parseFloat(agendamento.age_desconto ?? 0)));
                agendamento.age_valorPago = parseFloat(valorPago.toFixed(2));
                agendamento.age_valorNaoPago = parseFloat((ageValorFinal - valorPago).toFixed(2));
                agendamento.pago = valorPago == ageValorFinal && agendamento.ast_id == 3;

                agendamento.age_ordemServico = agendamento.age_ordemServico ? JSON.parse(agendamento.age_ordemServico) : null;
            } catch (error) {
                console.error('Erro ao encontrar agendamento em uilts: ', error);
            }
        }

        return agendamentos;
    } catch (error) {
        console.error('Erro ao buscar agendamentos em utils 2: ', error);
        return [];
    }
}

async function checkPagamentos(age_id, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    try {
        let agendamentoQuery = await dbQuery(`SELECT * FROM AGENDAMENTO WHERE age_id = ? AND ` + ew.sql, [age_id, ...ew.params]);
        if (!agendamentoQuery.length) return false;

        let agendamento = agendamentoQuery[0];

        // Ignorar agendamentos não-atendidos (não devem ter pagamentos)
        const statusAtendido = await dbQuery(`SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao = 'Atendido' AND ` + ew.sql, [...ew.params]);
        const idsAtendido = statusAtendido.map(s => s.ast_id);
        if (!idsAtendido.includes(agendamento.ast_id)) return false;

        let age_valor = agendamento.age_valor - (agendamento.age_desconto ?? 0);

        if(age_valor == 0) return false;

        const pagamentos = await dbQuery(`SELECT * FROM PAGAMENTO WHERE age_id = ? AND ` + ew.sql, [age_id, ...ew.params]);

        let alterado = false;
        if (pagamentos.length) {

            //Checar se tem pagamentos suficientes para cobrir o valor do agendamento, caso não tenha, crie
            let valorTotalPagamentos = 0;
            for (let pagamento of pagamentos) {
                for (let pag of JSON.parse(pagamento.pgt_json || '[]')) {
                    valorTotalPagamentos += parseFloat(pag.pgt_valor);
                }
            }

            let valorRestante = age_valor - valorTotalPagamentos;
            if (valorRestante > 0) {
                console.log('valorRestante: ', valorRestante);
                let formasPagamento = await dbQuery('SELECT * FROM FORMAS_PAGAMENTO WHERE ' + ew.sql, [...ew.params]);
                let fpg_id = formasPagamento.find(f => f.fpg_descricao.toLowerCase() === 'dinheiro')?.fpg_id ?? formasPagamento[0]?.fpg_id ?? 1;

                let objF = [
                    {
                        fpg_id,
                        pgt_valor: valorRestante
                    }
                ]

                await dbQuery('INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_json, empresa_id) VALUES (?, ?, ?, ?)',
                    [age_id, valorRestante, JSON.stringify(objF), empresa_id]);

                alterado = true;
            } else if (valorRestante < 0) {
                console.log('valorRestante negativo: ', valorRestante);
                //Remover o pagamento que está sobrando
                await dbQuery(`DELETE FROM PAGAMENTO WHERE age_id = ? AND pgt_data IS NULL AND ` + ew.sql, [age_id, ...ew.params]);

                alterado = true;
            }
        } else {
            let formasPagamento = await dbQuery('SELECT * FROM FORMAS_PAGAMENTO WHERE ' + ew.sql, [...ew.params]);
            let fpg_id = formasPagamento.find(f => f.fpg_descricao.toLowerCase() === 'dinheiro')?.fpg_id ?? formasPagamento[0]?.fpg_id ?? 1;

            let objF = [
                {
                    fpg_id,
                    pgt_valor: age_valor
                }
            ]

            console.log('Inserindo pagamento: ', age_id, age_valor, JSON.stringify(objF));
            await dbQuery('INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_json, empresa_id) VALUES (?, ?, ?, ?)',
                [age_id, age_valor, JSON.stringify(objF), empresa_id]);

            alterado = true;
        }

        return alterado;
    } catch (error) {
        console.error('Erro ao verificar pagamentos em utils: ', error);
        return false;
    }
}

async function createPagamento(age_id, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    try {

        if (!age_id) return { status: 400, message: 'Agendamento não informado' };

        let agendamento = await dbQuery('SELECT * FROM AGENDAMENTO WHERE age_id = ? AND ' + ew.sql, [age_id, ...ew.params]);

        if (agendamento.length === 0) {
            return { status: 404, message: 'Agendamento não encontrado' };
        }

        // Validar que o agendamento está atendido
        const statusAtendido = await dbQuery(`SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao = 'Atendido' AND ` + ew.sql, [...ew.params]);
        const idsAtendido = statusAtendido.map(s => s.ast_id);
        if (!idsAtendido.includes(agendamento[0].ast_id)) {
            return { status: 400, message: 'Somente agendamentos atendidos podem receber pagamento.' };
        }

        let valor = agendamento[0].age_valor - (agendamento[0].age_desconto ?? 0);

        let pagamentos = await dbQuery(`SELECT * FROM PAGAMENTO WHERE age_id = ? AND ` + ew.sql, [age_id, ...ew.params]);

        if (pagamentos.length > 0) {
            let totalPagamentos = pagamentos.reduce((acc, curr) => acc + curr.pgt_valor, 0);
            let totalJaPago = pagamentos.reduce((acc, curr) => {
                let pags = curr.pgt_json ? JSON.parse(curr.pgt_json) : [];
                let valorPago = 0;

                for (let pag of pags) {
                    valorPago += curr.pgt_data ? parseFloat(pag.pgt_valor) : 0;
                }

                return acc + valorPago;
            }, 0);

            if (totalJaPago > valor) {
                return { status: 400, message: 'Este agendamento já foi totalmente pago, edite os pagamentos existentes para ajustar o valor.' };
            } else if (totalPagamentos > valor) {
                return { status: 400, message: 'Este agendamento já possuí pagamentos com o valor total, edite os pagamentos existentes para ajustar o valor.' };
            } else if (totalPagamentos > 0 || totalJaPago > 0) {
                valor = valor - totalPagamentos;
            }
        }

        let formasPagamento = await dbQuery('SELECT * FROM FORMAS_PAGAMENTO WHERE ' + ew.sql, [...ew.params]);
        let fpg_id = formasPagamento.find(f => f.fpg_descricao.toLowerCase() === 'dinheiro')?.fpg_id ?? formasPagamento[0]?.fpg_id ?? 1;

        let objF = [
            {
                fpg_id,
                pgt_valor: valor
            }
        ]

        let pagamento = await dbQuery('INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_json, empresa_id) VALUES (?, ?, ?, ?)',
            [age_id, valor, JSON.stringify(objF), empresa_id]);


        return { status: 200, message: 'Pagamento criado com sucesso', pagamento: pagamento.insertId };
    } catch (error) {
        console.error('Erro ao criar pagamento em utils: ', error);
        return { status: 500, message: 'Erro ao criar pagamento' };
    }
}

async function getHistoricoAgendamento(age_id, empresa_id = null) {
    if (!age_id) return [];

    const ew = empresaWhere(empresa_id);
    try {
        let historicoQuery = await dbQuery('SELECT * FROM AGENDAMENTO_HISTORICO WHERE age_id = ? AND ' + ew.sql, [age_id, ...ew.params]);

        if (!historicoQuery.length) {
            await dbQuery('INSERT INTO AGENDAMENTO_HISTORICO (age_id, historico, empresa_id) VALUES (?, ?, ?)', [age_id, JSON.stringify([]), empresa_id]);
            return [];
        }

        let historico = historicoQuery[0];

        if (!historico.historico) return [];

        try {
            return JSON.parse(historico.historico);
        } catch (error) {
            console.error('Erro ao parsear histórico do agendamento em utils: ', error);
            return [];
        }
    } catch (error) {
        console.error('Erro ao buscar histórico do agendamento em utils: ', error);
        return [];
    }
}

async function setHistoricoAgendamento(age_id, newHist, empresa_id = null) {
    if (!newHist || !age_id) return false;

    const ew = empresaWhere(empresa_id);
    try {
        let historico = await getHistoricoAgendamento(age_id, empresa_id);

        if (!historico || !Array.isArray(historico)) {
            historico = [];
        }

        if (!Array.isArray(newHist)) {

            historico.unshift({
                ...newHist,
                title: newHist.title || 'Alteração',
                description: newHist.description || `Alteração no agendamento #${age_id}`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: newHist.feitoPor || 'Sistema',
                color: newHist.color || null,
                icon: newHist.icon || 'tabler-list-details'
            });
        } else {
            for (let hist of newHist) {
                historico.unshift({
                    ...hist,
                    title: hist.title || 'Alteração',
                    description: hist.description || `Alteração no agendamento #${age_id}`,
                    date: moment().format('YYYY-MM-DD HH:mm:ss'),
                    feitoPor: hist.feitoPor || 'Sistema',
                    color: hist.color || null,
                    icon: hist.icon || 'tabler-list-details'
                });
            }
        }

        historico = historico.sort((a, b) => new Date(a.date) - new Date(b.date));

        await dbQuery('UPDATE AGENDAMENTO_HISTORICO SET historico = ? WHERE age_id = ? AND ' + ew.sql, [JSON.stringify(historico), age_id, ...ew.params]);

        return true;
    } catch (error) {
        console.error('Erro ao setar histórico do agendamento em utils: ', error);
        return false;
    }
}

async function getAgendamentosSimple(dataQuery, queryParams, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    try {
        const agendamentos = await dbQuery(dataQuery, queryParams);

        for (let agendamento of agendamentos) {
            try {
                agendamento.cliente = await dbQuery('SELECT cli_Id, cli_nome FROM CLIENTES WHERE cli_Id = ? AND ' + ew.sql, [agendamento.cli_id, ...ew.params]);
                agendamento.funcionario = await dbQuery('SELECT id, fullName FROM User WHERE id = ? AND ' + ew.sql, [agendamento.fun_id, ...ew.params]);

                let servicos = [];

                // Buscar serviços novos (AXS)
                let axs = await dbQuery('SELECT * FROM AXS WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);

                for (let ax of axs) {
                    let servico;

                    if (ax.ser_sub_id) {
                        servico = await dbQuery('SELECT * FROM SERVICOS_SUBS WHERE ser_id = ? AND ' + ew.sql, [ax.ser_sub_id, ...ew.params]);
                    } else {
                        servico = await dbQuery('SELECT * FROM SERVICOS_NEW WHERE ser_id = ? AND ' + ew.sql, [ax.ser_id, ...ew.params]);
                    }

                    if (servico.length > 0) {
                        let objPush = {
                            ...ax,
                            ser_id: ax.ser_sub_id && servico[0].ser_pai ? servico[0].ser_pai : ax.ser_id,
                            ser_pai_id: ax.ser_sub_id && servico[0].ser_pai ? servico[0].ser_pai : null,
                            ser_sub_id: ax.ser_sub_id || null,
                            isSub: ax.ser_sub_id ? true : false,
                            ser_nome: ax.ser_nome ? ax.ser_nome : servico[0].ser_nome,
                            ser_descricao: ax.ser_descricao ? ax.ser_descricao : null,
                            ser_valor: ax.ser_valor ? ax.ser_valor : 0,
                            ser_quantity: ax.ser_quantity || 1,
                            servico_raw: servico[0]
                        };

                        servicos.push(objPush);
                    }
                }

                // Buscar serviços antigos (AGENDAMENTO_X_SERVICOS)
                let axs_old = await dbQuery('SELECT * FROM AGENDAMENTO_X_SERVICOS WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);

                for (let ax of axs_old) {
                    let servico = await dbQuery('SELECT * FROM SERVICOS WHERE ser_id = ? AND ' + ew.sql, [ax.ser_id, ...ew.params]);

                    if (!servico.length) continue;

                    servico[0].ser_quantity = ax.ser_quantity || 1;
                    servico[0].isOld = true;
                    servicos.push(servico[0]);
                }

                agendamento.servicos = servicos;

                let age_valor = servicos.reduce((total, servico) => total + (parseFloat(servico.ser_valor || 0) * (servico.ser_quantity ?? 1)), 0);
                age_valor = parseFloat(age_valor.toFixed(2));

                if (parseFloat(age_valor.toFixed(2)) != parseFloat(agendamento.age_valor.toFixed(2))) {
                    console.log("Valor do agendamento diferente do valor calculado", age_valor, agendamento.age_valor);
                    agendamento.age_valor = age_valor;
                    await dbQuery('UPDATE AGENDAMENTO SET age_valor = ? WHERE age_id = ? AND ' + ew.sql, [age_valor.toFixed(2), agendamento.age_id, ...ew.params]);
                }

                if (agendamento.age_type == 'retrabalho' && !agendamento.age_retrabalho) {
                    await dbQuery('UPDATE AGENDAMENTO SET age_retrabalho = 1 WHERE age_id = ? AND ' + ew.sql, [agendamento.age_id, ...ew.params]);
                    agendamento.age_retrabalho = true;
                }

            } catch (error) {
                console.error('Erro ao processar agendamento simples: ', error);
            }
        }

        return agendamentos;
    } catch (error) {
        console.error('Erro ao buscar agendamentos simples: ', error);
        return [];
    }
}

module.exports = {
    getAgendamentos,
    getAgendamentosSimple,
    checkPagamentos,
    getHistoricoAgendamento,
    setHistoricoAgendamento,
    createPagamento
}