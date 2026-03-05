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
const axios = require('axios');
const moment = require('moment');

const { sanitizeInput, isDiff, can } = require('../utils/functions');
const { getAgendamentos, checkPagamentos,
    setHistoricoAgendamento, createPagamento } = require('../utils/agendaUtils');
const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let caminho = path.join(__dirname, '../uploads/notas-fiscais/', req.params.id);

        if (!fs.existsSync(caminho)) {
            fs.mkdirSync(caminho, { recursive: true });
        }

        cb(null, caminho);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/list/receber', async (req, res) => {
    let {
        q = '',
        d = null,
        dataDe = null,
        dataAte = null,
        pago = 2,
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc'
    } = req.query;

    const empresa_id = req.user.empresa_id;

    page = Number(page) || 1;
    itemsPerPage = Number(itemsPerPage) || 10;

    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == -1 || itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    // FROM principal com joins necessarios
    // Filtra apenas agendamentos atendidos (ast_id correspondente ao status 'Atendido' da empresa)
    const baseFrom = `
      FROM PAGAMENTO p
      JOIN AGENDAMENTO a ON a.age_id = p.age_id
        AND a.ast_id IN (SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao = 'Atendido')
        AND a.age_ativo = 1
      LEFT JOIN CLIENTES c ON c.cli_id = a.cli_id
      LEFT JOIN User u ON u.id = a.fun_id
      WHERE 1 = 1 AND p.empresa_id = ?
    `;

    let filters = '';
    const params = [empresa_id];

    // Busca geral (q) - cliente, funcionario ou valor
    if (q) {
        q = sanitizeInput(q);
        const like = `%${q}%`;

        filters += `
        AND (
          p.pgt_valor LIKE ?
          OR c.cli_nome LIKE ?
          OR u.fullName LIKE ?
        )
      `;
        params.push(like, like, like);
    }

    // Filtro por data exata do agendamento (d)
    if (d) {
        d = sanitizeInput(d);
        filters += ` AND a.age_data = ?`;
        params.push(d);
    }

    // Pago / Nao pago
    if (Number(pago) === 1) {
        filters += ` AND p.pgt_data IS NOT NULL`;
    } else if (Number(pago) === 3) {
        filters += ` AND p.pgt_data IS NULL`;
    }

    // Intervalo de datas ou mes atual
    if (dataDe && dataAte) {
        filters += ` AND a.age_data BETWEEN ? AND ?`;
        params.push(dataDe, dataAte);
    } else {
        const inicioMes = moment().startOf('month').format('YYYY-MM-DD');
        const fimMes = moment().endOf('month').format('YYYY-MM-DD');

        filters += ` AND a.age_data BETWEEN ? AND ?`;
        params.push(inicioMes, fimMes);
    }

    // Ordenacao (whitelist pra evitar injection)
    const allowedSort = ['pgt_data', 'created_at', 'pgt_valor', 'age_data'];
    let orderClause = ' ORDER BY p.created_at DESC';

    sortBy = !sortBy ? 'p.created_at' : sortBy == 'cli_nome' ? 'age_data' : sortBy;
    if (sortBy && allowedSort.includes(sortBy)) {
        const dir = String(orderBy).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        orderClause = ` ORDER BY ${sortBy} ${dir}`;
    }

    const limitClause = ` LIMIT ?, ?`;

    try {
        // 1) total de registros
        const countSql = `SELECT COUNT(*) AS totalPagamentos ${baseFrom} ${filters}`;
        const [{ totalPagamentos }] = await dbQuery(countSql, params);

        // 2) dados paginados
        const dataSql = `
        SELECT
          p.*,
          a.*,
          c.cli_nome,
          u.fullName
        ${baseFrom}
        ${filters}
        ${orderClause}
        ${limitClause}
      `;

        const pagamentos = await dbQuery(dataSql, [...params, offset, itemsPerPage]);

        //Checar agendamentos de acordo com a data
        let agendamentosQuery = '';
        if (dataDe && dataAte) {
            agendamentosQuery = `SELECT * FROM AGENDAMENTO WHERE age_data BETWEEN '${dataDe}' AND '${dataAte}' AND ast_id = 3 AND empresa_id = ${empresa_id}`;
        } else {
            const inicioMes = moment().startOf('month').format('YYYY-MM-DD');
            const fimMes = moment().endOf('month').format('YYYY-MM-DD');

            agendamentosQuery = `SELECT * FROM AGENDAMENTO WHERE age_data BETWEEN '${inicioMes}' AND '${fimMes}' AND ast_id = 3 AND empresa_id = ${empresa_id}`;
        }

        console.log("agendamentosQuery", agendamentosQuery);
        const agendamentosCheck = await getAgendamentos(agendamentosQuery, [], empresa_id);
        console.log("agendamentosCheck", agendamentosCheck.length);

        let totalRecebimento = 0;
        let totalNaoPago = 0;
        let again2 = false;
        for (let pagamento of pagamentos) {
            const check = await checkPagamentos(pagamento.age_id);
            if (check) {
                again2 = true;
            }

            const pags = pagamento.pgt_json ? JSON.parse(pagamento.pgt_json) : [];
            pagamento.pgt_json = pags;

            let valorPago = 0;
            let valorPagoBk = 0;
            const fpg_names = [];

            for (const pag of pags) {
                valorPago += pagamento.pgt_data ? parseFloat(pag.pgt_valor) : 0;
                valorPagoBk += parseFloat(pag.pgt_valor);

                const forma = await dbQuery(
                    `SELECT * FROM FORMAS_PAGAMENTO WHERE fpg_id = ? AND empresa_id = ?`,
                    [pag.fpg_id, empresa_id]
                );
                fpg_names.push(forma.length > 0 ? forma[0].fpg_descricao : 'Dinheiro');
            }

            pagamento.pgt_valor = valorPago;
            pagamento.pgt_valor_bk = valorPagoBk;
            pagamento.fpg_name = fpg_names.join(', ');
            pagamento.pgt_data = pagamento.pgt_data
                ? moment(pagamento.pgt_data).format('DD/MM/YYYY')
                : null;

            // se quiser, ainda pode reaproveitar seu getAgendamentos
            pagamento.agendamento = await getAgendamentos(
                `SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?`,
                [pagamento.age_id, empresa_id],
                empresa_id
            );
        }

        if (again2) {
            return res.status(200).json({ again: true });
        }

        totalRecebimento = agendamentosCheck.reduce((acc, curr) => acc + parseFloat(curr.age_valor || 0) - parseFloat(curr.age_desconto ?? 0), 0);
        totalRecebimento = parseFloat(totalRecebimento.toFixed(2));
        totalNaoPago = agendamentosCheck.reduce((acc, curr) => acc + parseFloat(curr.age_valorNaoPago || 0), 0);
        totalNaoPago = parseFloat(totalNaoPago.toFixed(2));
        let totalPago = parseFloat((totalRecebimento - totalNaoPago).toFixed(2));

        const data = {
            pagamentos,
            totalPagamentos,
            relatorios: {
                totalRecebimento,
                totalNaoPago,
                totalPago
            }
        };

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar pagamentos', error);
        res.status(500).json({ error });
    }
});


router.get('/list/pagar', async (req, res) => {
    let {
        q = '',
        d = null,
        dataDe = null,
        dataAte = null,
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc',
        funcionario = null,
        tipo = null,
        status = null
    } = req.query;

    const empresa_id = req.user.empresa_id;

    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    let baseQueryDespesas = `FROM DESPESAS WHERE 1 = 1 AND empresa_id = ${empresa_id}`;
    let baseQueryComissoes = `FROM COMISSOES WHERE 1 = 1 AND empresa_id = ${empresa_id}`;

    if (q) {
        q = sanitizeInput(q);

        //QUERY COMISSOES
        let funcionarios = await dbQuery(`SELECT * FROM User WHERE fullName LIKE '%${q}%' AND empresa_id = ?`, [empresa_id]);
        let funcionariosIds = funcionarios.map(f => f.id);

        let agendamentos = await dbQuery(`SELECT * FROM AGENDAMENTO WHERE empresa_id = ? AND (fun_id IN (${funcionariosIds.length > 0 ? funcionariosIds.join(',') : '0'}) OR cli_id IN (SELECT cli_Id FROM CLIENTES WHERE cli_nome LIKE '%${q}%' AND empresa_id = ?))`, [empresa_id, empresa_id]);
        let agendamentosIds = agendamentos.map(a => a.age_id);

        let qQuery = '';

        if (agendamentosIds.length > 0) {
            qQuery = ` AND (age_id IN (${agendamentosIds.join(',')}) OR com_valor LIKE '%${q}%')`;
        } else {
            qQuery = ` AND com_valor LIKE '%${q}%'`;
        }

        baseQueryComissoes += qQuery;

        //QUERY DESPESAS
        baseQueryDespesas += ` AND (
             des_descricao LIKE '%${q}%' OR
             des_valor LIKE '%${q}%' OR
             des_data LIKE '%${q}%'
         )`;
    }

    if (d) {
        let agendamentosData = await dbQuery(`SELECT * FROM AGENDAMENTO WHERE age_data = ? AND empresa_id = ?`, [d, empresa_id]);
        let agendamentosDataIds = agendamentosData.map(a => a.age_id);

        if (agendamentosDataIds.length > 0) {
            baseQueryComissoes += ` AND age_id IN (${agendamentosDataIds.join(',')})`;
        } else {
            baseQueryComissoes += ` AND age_id = 0`; //Nenhum agendamento
        }

        baseQueryDespesas += ` AND des_data = '${sanitizeInput(d)}'`;
    }

    if (dataDe && dataAte) {
        let agendamentosData = await dbQuery(`SELECT * FROM AGENDAMENTO WHERE age_data BETWEEN ? AND ? AND empresa_id = ?`, [dataDe, dataAte, empresa_id]);
        let agendamentosDataIds = agendamentosData.map(a => a.age_id);

        if (agendamentosDataIds.length > 0) {
            baseQueryComissoes += ` AND age_id IN (${agendamentosDataIds.join(',')})`;
        } else {
            baseQueryComissoes += ` AND age_id = 0`; //Nenhum agendamento
        }

        baseQueryDespesas += ` AND des_data BETWEEN '${sanitizeInput(dataDe)}' AND '${sanitizeInput(dataAte)}'`;
    } else {
        let inicioMes = moment().startOf('month').format('YYYY-MM-DD');
        let fimMes = moment().endOf('month').format('YYYY-MM-DD');
        let agendamentosData = await dbQuery(`SELECT * FROM AGENDAMENTO WHERE age_data BETWEEN ? AND ? AND empresa_id = ?`, [inicioMes, fimMes, empresa_id]);

        let agendamentosDataIds = agendamentosData.map(a => a.age_id);
        baseQueryComissoes += ` AND age_id IN (${agendamentosDataIds.length > 0 ? agendamentosDataIds.join(',') : '0'})`;
        baseQueryDespesas += ` AND des_data BETWEEN '${inicioMes}' AND '${fimMes}'`;
    }

    try {
        let despesas = await dbQuery(`SELECT * ${baseQueryDespesas}`);
        let comissoes = await dbQuery(`SELECT * ${baseQueryComissoes}`);

        let pagarDataMapeado = await Promise.all([...despesas, ...comissoes].map(async (pagar) => {
            let isDespesa = pagar.des_id ? true : false;
            let isPaid = isDespesa ? pagar.des_pago : pagar.com_paga;

            let descricao = '';
            let data;
            let funcionarioName;
            let fun_id;

            if (!isDespesa) {
                const agendamentoQuery = await getAgendamentos('SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?', [pagar.age_id, empresa_id], empresa_id);

                if (agendamentoQuery.length > 0) {
                    const agendamento = agendamentoQuery[0];

                    let iconCalendar = `<i class="v-icon notranslate mr-1 tabler-calendar v-icon notranslate" aria-hidden="true" style="font-size: 14px; height: 14px; width: 14px;"></i>`;
                    let iconClient = `<i class="v-icon notranslate mr-1 tabler-user v-icon notranslate" aria-hidden="true" style="font-size: 14px; height: 14px; width: 14px;"></i>`;
                    let iconEmployee = `<i class="v-icon notranslate mr-1 tabler-user-cog v-icon notranslate" aria-hidden="true" style="font-size: 14px; height: 14px; width: 14px;"></i>`;
                    descricao = `${iconCalendar} ${moment(agendamento.age_data).format('DD/MM/YYYY')}<br />
                    ${iconClient} ${agendamento.cliente?.[0]?.cli_nome}<br />
                    ${iconEmployee} ${agendamento.funcionario?.[0]?.fullName || 'Nao encontrado'}`;

                    funcionarioName = agendamento.funcionario?.[0]?.fullName || 'Nao encontrado';
                    fun_id = agendamento.fun_id;
                    data = agendamento.age_data;
                } else {
                    descricao = 'Agendamento nao encontrado';
                    funcionarioName = 'Nao encontrado';
                }
            } else {
                descricao = `
                <div class="text-sm">
                    <p class="mb-0">${pagar.des_descricao}</p>
                    ${pagar.des_tipo && pagar.des_tipo != "null" ?
                        `<p class="mb-0 text-caption">
                        <i class="v-icon notranslate mr-1 tabler-list v-icon notranslate" aria-hidden="true" style="font-size: 14px; height: 14px; width: 14px;"></i>
                        ${pagar.des_tipo}
                    </p>` : ''}
                </div>`
                data = pagar.des_data;
            }

            return {
                id: isDespesa ? 'D' + pagar.des_id : 'C' + pagar.com_id,
                descricao: descricao,
                funcionario: funcionarioName,
                fun_id,
                valor: isDespesa ? pagar.des_valor : pagar.com_valor,
                data,
                pago: isPaid,
                tipo: isDespesa ? 'Despesa' : 'Comissao',
                status: checkDateStatus(data, isPaid).status,
                selectable: isPaid == 1 ? false : true,
            }
        }));

        if (sortBy == 'tipo') {
            pagarDataMapeado.sort((a, b) => {
                return orderBy == 'asc' ? a.tipo.localeCompare(b.tipo) : b.tipo.localeCompare(a.tipo);
            });
        } else if (sortBy == 'pago') {
            const statusOrder = { 'Pago': 1, 'Em atraso': 2, 'Pagar hoje': 3, 'Em aberto': 4 };

            pagarDataMapeado.sort((a, b) => {
                if (orderBy == 'asc') {
                    return statusOrder[a.status] - statusOrder[b.status];
                } else {
                    return statusOrder[b.status] - statusOrder[a.status];
                }
            });
        } else if (sortBy == 'valor') {
            pagarDataMapeado.sort((a, b) => orderBy == 'asc' ? a.valor - b.valor : b.valor - a.valor);
        } else {
            pagarDataMapeado.sort((a, b) => orderBy == 'asc' ? new Date(a.data) - new Date(b.data) : new Date(b.data) - new Date(a.data));
        }

        if (funcionario) {
            pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.fun_id == funcionario);
        }

        if (tipo) {
            pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.tipo == tipo);
        }

        if (status) {
            if (status == 1) {
                pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.pago == 1);
            } else if (status == 2) {
                pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.status == 'Em aberto');
            } else if (status == 3) {
                pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.status == 'Em atraso');
            } else if (status == 4) {
                pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.status == 'Pagar hoje');
            } else if (status == 5) {
                pagarDataMapeado = pagarDataMapeado.filter(pagar => pagar.pago == 0);
            }
        }

        // Paginacao correta: depois de juntar, ordenar e filtrar
        let totalPagar = pagarDataMapeado.length;
        let totalPages = Math.ceil(totalPagar / itemsPerPage);

        pagarDataMapeado = pagarDataMapeado.slice(
            offset,
            offset + parseInt(itemsPerPage)
        );


        let totalaPagar = pagarDataMapeado.filter(pagar => pagar.pago == 0).reduce((acc, curr) => acc + curr.valor, 0);
        let totalEmAberto = pagarDataMapeado.filter(pagar => pagar.status == 'Em aberto').reduce((acc, curr) => acc + curr.valor, 0);
        let totalEmAtraso = pagarDataMapeado.filter(pagar => pagar.status == 'Em atraso').reduce((acc, curr) => acc + curr.valor, 0);
        let totalPago = pagarDataMapeado.filter(pagar => pagar.pago == 1).reduce((acc, curr) => acc + curr.valor, 0);

        let countAPagar = {
            despesas: despesas.filter(despesa => despesa.des_pago == 0).length,
            comissoes: comissoes.filter(comissao => comissao.com_paga == 0).length
        }

        let countEmAberto = {
            despesas: despesas.filter(despesa => despesa.des_pago == 0 && despesa.des_data > new Date()).length,
            comissoes: comissoes.filter(comissao => comissao.com_paga == 0 && comissao.age_data > new Date()).length
        }

        let countEmAtraso = {
            despesas: despesas.filter(despesa => despesa.des_pago == 0 && despesa.des_data < new Date()).length,
            comissoes: comissoes.filter(comissao => comissao.com_paga == 0 && comissao.age_data < new Date()).length
        }

        let countPago = {
            despesas: despesas.filter(despesa => despesa.des_pago == 1).length,
            comissoes: comissoes.filter(comissao => comissao.com_paga == 1).length
        }

        let data = {
            totalPages,
            pagar: pagarDataMapeado,
            despesas,
            comissoes,
            totalPagar: totalPagar,
            relatorios: {
                totalaPagar,
                totalEmAberto,
                totalEmAtraso,
                totalPago,
                countAPagar,
                countEmAberto,
                countEmAtraso,
                countPago
            }
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar despesas e comissoes', error);
        res.status(500).json({ error });
    }
});

router.get('/list/despesas', async (req, res) => {
    let {
        q = '',
        d = null,
        dataDe = null,
        dataAte = null,
        status = '',
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc'
    } = req.query;

    const empresa_id = req.user.empresa_id;

    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        itemsPerPage = 1000000;
    }

    let baseQuery = `FROM DESPESAS WHERE 1 = 1 AND empresa_id = ${empresa_id}`;

    if (q) {
        q = sanitizeInput(q);

        baseQuery += ` AND (
            des_descricao LIKE '%${q}%' OR
            des_valor LIKE '%${q}%' OR
            des_data LIKE '%${q}%'
        )`;
    }

    if (d) {
        d = sanitizeInput(d);
        baseQuery += ` AND des_data = '${d}'`;
    }

    if (dataDe && dataAte) {
        baseQuery += ` AND des_data BETWEEN '${sanitizeInput(dataDe)}' AND '${sanitizeInput(dataAte)}'`;
    } else {
        let inicioMes = moment().startOf('month').format('YYYY-MM-DD');
        let fimMes = moment().endOf('month').format('YYYY-MM-DD');

        baseQuery += ` AND des_data BETWEEN '${inicioMes}' AND '${fimMes}'`;
    }

    if (status == 1) {
        baseQuery += ` AND des_pago = 1`;
    } else if (status == 2) {
        baseQuery += ` AND des_pago = 0 AND des_data > CURDATE()`;
    } else if (status == 3) {
        baseQuery += ` AND des_pago = 0 AND des_data < CURDATE()`;
    }

    let dataQuery = `SELECT *, (SELECT COUNT(*) ${baseQuery}) AS totalDespesas ${baseQuery}`;

    if (sortBy) {
        dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        dataQuery += ` ORDER BY created_at DESC`;
    }

    dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {

        const despesas = await dbQuery(dataQuery);

        let totalValorDespesas = despesas.reduce((acc, curr) => acc + curr.des_valor, 0);
        let totalEmAberto = despesas.filter(despesa => !despesa.des_pago && new Date(despesa.des_data) < new Date()).reduce((acc, curr) => acc + curr.des_valor, 0);
        let totalEmAtraso = despesas.filter(despesa => !despesa.des_pago && new Date(despesa.des_data) > new Date()).reduce((acc, curr) => acc + curr.des_valor, 0);
        let totalPago = despesas.filter(despesa => despesa.des_pago).reduce((acc, curr) => acc + curr.des_valor, 0);

        let data = {
            despesas,
            totalDespesas: despesas.length > 0 ? despesas[0].totalDespesas : 0,
            relatorios: {
                totalValorDespesas,
                totalEmAberto,
                totalEmAtraso,
                totalPago
            }
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar despesas', error);
        res.status(500).json({ error });
    }
})

router.get('/get/receber/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        const pagamentoQuery = await dbQuery(`SELECT * FROM PAGAMENTO WHERE pgt_id = ? AND empresa_id = ?`, [id, empresa_id]);

        if (!pagamentoQuery || pagamentoQuery.length === 0) {
            return res.status(404).json({ message: 'Pagamento nao encontrado1' });
        }

        const pagamento = pagamentoQuery[0];

        let pags = pagamento.pgt_json ? JSON.parse(pagamento.pgt_json) : [];
        pagamento.pgt_json = pags;

        let valorPago = 0;
        let valorPagoBk = 0;
        let fpg_names = [];
        for (let pag of pags) {
            valorPago += pagamento.pgt_data ? parseFloat(pag.pgt_valor) : 0;
            valorPagoBk += parseFloat(pag.pgt_valor);

            let forma = await dbQuery(`SELECT * FROM FORMAS_PAGAMENTO WHERE fpg_id = ? AND empresa_id = ?`, [pag.fpg_id, empresa_id]);
            fpg_names.push(forma.length > 0 ? forma[0].fpg_descricao : 'Dinheiro');
        }

        pagamento.pgt_valor = valorPago;
        pagamento.pgt_valor_bk = valorPagoBk;
        pagamento.fpg_name = fpg_names.join(', ');

        pagamento.agendamento = await getAgendamentos('SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?', [pagamento.age_id, empresa_id], empresa_id);

        pagamento.agendamento[0].outrosPagamentos = await
            dbQuery(`SELECT * FROM PAGAMENTO WHERE age_id = ? AND pgt_id != ? AND empresa_id = ?`, [pagamento.age_id, pagamento.pgt_id, empresa_id]);
        pagamento.agendamento[0].age_valor = pagamento.agendamento[0].age_valor - pagamento.agendamento[0].age_desconto;
        pagamento.pago = pagamento.pgt_data ? true : false;
        pagamento.pgt_data = pagamento.pgt_data ? pagamento.pgt_data : new Date().toISOString().slice(0, 19).replace('T', ' ');
        pagamento.pgt_desconto = pagamento.agendamento[0].age_desconto;

        let outros = pagamento.agendamento[0].outrosPagamentos;

        for (let outro of outros) {
            if (outro.pgt_id != pagamento.pgt_id) {
                let pags = outro.pgt_json ? JSON.parse(outro.pgt_json) : [];
                for (let pag of pags) {
                    valorPago += outro.pgt_data ? parseFloat(pag.pgt_valor) : 0;
                }
            }
        }

        pagamento.agendamento[0].valorPago = valorPago;
        pagamento.agendamento[0].valorNaoPago = parseFloat(pagamento.agendamento[0].age_valor) - valorPago;
        pagamento.agendamento[0].outrosPagamentos = outros;

        if (pagamento?.pgt_id) {
            res.status(200).json(pagamento);
        } else {
            res.status(404).json({ message: 'Pagamento nao encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar pagamento', error);
        res.status(500).json({ error });
    }
})

router.get('/get/despesas/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        const despesa = await dbQuery(`SELECT * FROM DESPESAS WHERE des_id = ? AND empresa_id = ?`, [id, empresa_id]);

        if (despesa.length) {
            res.status(200).json(despesa[0]);
        } else {
            res.status(404).json({ message: 'Despesa nao encontrada' });
        }
    } catch (error) {
        console.error('Erro ao buscar despesa', error);
        res.status(500).json({ error });
    }
})

router.post('/despesas/repeat', async (req, res) => {
    const { despesa, repeatData, tipo } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        console.log('Tipo', tipo)

        let { des_descricao, des_valor, des_data, des_pago, des_id, des_tipo = null, des_obs = null } = despesa;
        let { tipo_repeat, quantidade_repeat, add_lembretes = 0 } = repeatData;

        if (tipo == 'update') {
            await dbQuery(`UPDATE DESPESAS SET des_descricao = ?, des_valor = ?, des_data = ?, des_pago = ?, des_obs = ?, des_tipo = ? WHERE des_id = ? AND empresa_id = ?`,
                [des_descricao, des_valor, des_data, des_pago, des_obs, des_tipo, des_id, empresa_id]);
        } else if (tipo == 'create') {
            let despesaAdd = await dbQuery(`INSERT INTO DESPESAS (des_descricao, des_valor, des_data, des_pago, des_obs, des_tipo, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [des_descricao, des_valor, des_data, des_pago, des_obs, des_tipo, empresa_id]);
            des_id = despesaAdd.insertId;
        }

        console.log('quantidade_repeat', quantidade_repeat)

        if (quantidade_repeat > 0) {
            for (let i = 0; i < quantidade_repeat; i++) {
                let index = i + 1;
                console.log('Index', index);

                let no_parcela = index + 1 > quantidade_repeat ? quantidade_repeat + 1 : index + 1;
                console.log('no_parcela', no_parcela);

                let des_data_repeat = moment(des_data);

                if (tipo_repeat === 'Diario') {
                    des_data_repeat.add(1 * index, 'days');
                } else if (tipo_repeat === 'Semanal') {
                    des_data_repeat.add(1 * index, 'weeks');
                } else if (tipo_repeat === 'Mensal') {
                    des_data_repeat.add(1 * index, 'months');
                }

                des_data_repeat = des_data_repeat.format('YYYY-MM-DD');

                let des_descricao_repeat = `${des_descricao} - ${no_parcela}/${quantidade_repeat + 1}`;

                let despesaAdd = await dbQuery(`INSERT INTO DESPESAS (des_descricao, des_valor, des_data, des_pago, des_parent, des_obs, des_tipo, empresa_id) VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
                    [des_descricao_repeat, des_valor, des_data_repeat, des_id, des_obs, des_tipo, empresa_id]);

                if (add_lembretes) {
                    // Adicionar 08:00 como horario padrao
                    let dateLembrete = moment(`${des_data_repeat}T08:00:00`).toISOString().split('T')[0];

                    let data = {
                        lembreteData: {
                            title: 'Despesa a pagar',
                            subtitle: des_descricao_repeat,
                            agendado_time: dateLembrete,
                            repeat: 0,
                            repeat_times: 0,
                            repeat_type: 'none',
                            notify_email: 0,
                            params: `${process.env.APP_URL}/pagamentos?viewDespesa=${despesaAdd.insertId}`
                        }
                    }

                    try {
                        let resLembrete = await axios.post(`${process.env.API_URL}/lembretes/create`, data);
                        console.log('Lembrete adicionado', resLembrete.data);
                    } catch (error) {
                        console.error('Erro ao adicionar lembrete', error);
                    }
                }
            }

            //Atualizar a despesa atual para 1/(quantidade_repeat + 1)
            await dbQuery(`UPDATE DESPESAS SET des_descricao = ? WHERE des_id = ? AND empresa_id = ?`,
                [`${des_descricao} - 1/${quantidade_repeat + 1}`, des_id, empresa_id]);
        }

        res.status(200).json('Despesa repetida com sucesso!');
    } catch (error) {
        console.error('Erro ao repetir despesa', error);
        res.status(500).json({ error });
    }
});

router.post('/update/receber/:id', async (req, res) => {
    const { id } = req.params;
    const { pagamentoData, marcarComoPago = false } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        const {
            pgt_valor,
            pgt_json,
            fpg_id,
            age_id,
            pgt_numero_nota_fiscal = null,
            pgt_data = moment().format('YYYY-MM-DD'),
            pgt_obs = null
        } = pagamentoData;

        // Usar prepared statements para evitar SQL injection
        const updateFields = ['pgt_valor = ?', 'fpg_id = ?', 'pgt_json = ?'];
        const updateParams = [parseFloat(pgt_valor), fpg_id, JSON.stringify(pgt_json)];

        if (marcarComoPago) {
            updateFields.push('pgt_data = ?');
            updateParams.push(pgt_data);
        }

        if (pgt_numero_nota_fiscal) {
            updateFields.push('pgt_numero_nota_fiscal = ?');
            updateParams.push(pgt_numero_nota_fiscal);
        }

        if (pgt_obs) {
            updateFields.push('pgt_obs = ?');
            updateParams.push(pgt_obs);
        }

        const query = `UPDATE PAGAMENTO SET ${updateFields.join(', ')} WHERE pgt_id = ? AND empresa_id = ?`;
        updateParams.push(id, empresa_id);

        let agendamentoQuery = await getAgendamentos(`SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?`, [age_id, empresa_id], empresa_id);

        if (!agendamentoQuery || agendamentoQuery.length === 0) {
            console.error('[ERRO PAGAMENTOS] Agendamento nao encontrado', age_id);
            return res.status(404).json({ message: 'Agendamento nao encontrado' });
        }

        let agendamento = agendamentoQuery[0];

        // Validar que o agendamento está atendido antes de permitir pagamento
        const statusAtendido = await dbQuery(`SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao = 'Atendido' AND empresa_id = ?`, [empresa_id]);
        const idsAtendido = statusAtendido.map(s => s.ast_id);
        if (!idsAtendido.includes(agendamento.ast_id)) {
            console.error('[ERRO PAGAMENTOS] Agendamento nao atendido. Status:', agendamento.ast_id);
            return res.status(400).json({ message: 'Somente agendamentos atendidos podem receber pagamento.' });
        }

        const tolerancia = 0.0001;
        let valorAgendamento = parseFloat(agendamento.age_valor) - parseFloat(agendamento.age_desconto ?? 0);

        if (marcarComoPago) {
            const pagamentos = await dbQuery(`SELECT * FROM PAGAMENTO WHERE age_id = ? AND pgt_id != ? AND empresa_id = ?`, [age_id, id, empresa_id]);

            const totalPagoOutros = pagamentos.reduce((acc, curr) => {
                if (!curr.pgt_data) return acc;
                const pags = curr.pgt_json ? JSON.parse(curr.pgt_json) : [];
                const valorPago = pags.reduce((s, p) => s + parseFloat(p.pgt_valor || 0), 0);
                return acc + valorPago;
            }, 0);

            const valorRestanteParaQuitar = valorAgendamento - totalPagoOutros;
            if (valorRestanteParaQuitar < -tolerancia) {
                console.error('[ERRO PAGAMENTOS] Valor ja pago excede o agendamento.', totalPagoOutros, valorAgendamento);
                return res.status(400).json({ message: 'O valor ja pago excede o valor do agendamento.' });
            }

            // Se o pagamento atual for maior que o restante, bloquear
            if (parseFloat(pgt_valor) - valorRestanteParaQuitar > tolerancia) {
                console.error('[ERRO PAGAMENTOS] Pagamento maior que o restante.', pgt_valor, valorRestanteParaQuitar);
                return res.status(400).json({ message: 'O valor do pagamento nao pode ser maior que o restante do agendamento.' });
            }

            // Se quita o agendamento (igual ao restante), remove todos os pendentes e segue
            const quitaAgendamento = Math.abs(parseFloat(pgt_valor) - valorRestanteParaQuitar) <= tolerancia;
            if (quitaAgendamento) {
                await dbQuery(`DELETE FROM PAGAMENTO WHERE age_id = ? AND pgt_id != ? AND pgt_data IS NULL AND empresa_id = ?`, [age_id, id, empresa_id]);
            } else {
                // Caso ainda falte valor, cria um novo pagamento pendente com o restante
                const formasPagamento = await dbQuery('SELECT * FROM FORMAS_PAGAMENTO WHERE empresa_id = ?', [empresa_id]);
                const fpg_id_padrao = formasPagamento.find(f => f.fpg_descricao.toLowerCase() === 'dinheiro')?.fpg_id ?? formasPagamento[0]?.fpg_id ?? 1;

                const restante = valorRestanteParaQuitar - parseFloat(pgt_valor);
                const objF = [
                    {
                        fpg_id: fpg_id_padrao,
                        pgt_valor: restante
                    }
                ];

                await dbQuery('INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_json, empresa_id) VALUES (?, ?, ?, ?)',
                    [agendamento.age_id, restante, JSON.stringify(objF), empresa_id]);
            }
        }

        await dbQuery(query, updateParams);

        const userData = req.user;
        if (marcarComoPago && userData && userData.fullName) {
            setHistoricoAgendamento(age_id, {
                title: 'Pagamento recebido',
                description: `Pagamento de R$ ${parseFloat(pgt_valor).toFixed(2)} marcado como recebido`,
                feitoPor: userData.fullName,
                color: 'success',
                icon: 'tabler-cash'
            });
        } else if (userData && userData.fullName) {
            setHistoricoAgendamento(age_id, {
                title: 'Pagamento atualizado',
                description: `Informacoes do pagamento foram atualizadas`,
                feitoPor: userData.fullName,
                color: 'info',
                icon: 'tabler-edit'
            });
        }

        res.status(200).json(marcarComoPago ? 'Pagamento atualizado e marcado como pago' : 'Pagamento atualizado');
    } catch (error) {
        console.error('Erro ao atualizar pagamento', error);
        res.status(500).json({ error });
    }
});

router.post('/update/despesas/:id', async (req, res) => {
    const { id } = req.params;
    const { despesaData, marcarComoPago } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        const { des_descricao, des_valor, des_data, des_pago, sai_fpt = null, sai_data = null, des_tipo = null, des_obs = null } = despesaData;

        let query = `UPDATE DESPESAS SET des_descricao = ?, des_valor = ?, des_data = ?`;
        let values = [des_descricao, des_valor, des_data];

        if (marcarComoPago) {
            query += `, des_paga_data = ?, des_pago = 1, des_forma_pagamento = ?, des_pagoPor = ?`;
            values.push(sai_data ? moment(sai_data).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'), sai_fpt, req.user.fullName);
        }

        if (des_obs) {
            query += `, des_obs = ?`;
            values.push(des_obs);
        }

        if (des_tipo) {
            query += `, des_tipo = ?`;
            values.push(des_tipo);
        }

        query += ` WHERE des_id = ? AND empresa_id = ?`;
        values.push(id, empresa_id);

        await dbQuery(query, values);

        res.status(200).json('Despesa atualizada');
    } catch (error) {
        console.error('Erro ao atualizar despesa', error);
        res.status(500).json({ error });
    }
});

router.post('/create/despesas', async (req, res) => {
    const { despesaData, marcarComoPago } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        const { des_descricao, des_valor, des_data, des_pago, des_tipo = null, sai_fpt = null, sai_data = null, des_obs = null } = despesaData;

        let query = `INSERT INTO DESPESAS (`;
        let values = [des_descricao, des_valor, des_data];
        let fields = ['des_descricao', 'des_valor', 'des_data'];
        let placeholders = ['?', '?', '?'];

        if (marcarComoPago) {
            fields.push('des_paga_data', 'des_pago', 'des_forma_pagamento', 'des_pagoPor');
            placeholders.push('?', '?', '?', '?');
            values.push(sai_data ? moment(sai_data).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'), 1, sai_fpt, req.user.fullName);
        }

        if (des_obs) {
            fields.push('des_obs');
            placeholders.push('?');
            values.push(des_obs);
        }

        if (des_tipo) {
            fields.push('des_tipo');
            placeholders.push('?');
            values.push(des_tipo);
        }

        // Adicionar empresa_id
        fields.push('empresa_id');
        placeholders.push('?');
        values.push(empresa_id);

        query += `${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;

        let inseridaDespesa = await dbQuery(query, values);

        res.status(200).json('Despesa criada');
    } catch (error) {
        console.error('Erro ao criar despesa', error);
        res.status(500).json({ error });
    }
});

router.post('/create/receber', async (req, res) => {
    try {
        const userData = req.user;
        const empresa_id = req.user.empresa_id;

        if (!userData || !userData.fullName) {
            return res.status(400).json({ message: 'Usuario nao autenticado' });
        }

        if (!can('create', 'financeiro_recebimento', userData.abilitys)) {
            return res.status(400).json({ message: 'Sem permissao!' });
        }

        const { age_id } = req.body;

        const pagamento = await createPagamento(age_id);

        if (pagamento.status !== 200) {
            return res.status(pagamento.status).json({ message: pagamento.message });
        }

        setHistoricoAgendamento(age_id, {
            title: 'Pagamento criado',
            description: `Novo pagamento de R$ ${parseFloat(valor).toFixed(2)} adicionado ao agendamento`,
            feitoPor: userData.fullName,
            color: 'success',
            icon: 'tabler-cash-banknote'
        });


        res.status(200).json(pagamento.pagamento);
    } catch (error) {
        console.error('Erro ao adicionar pagamento: ', error);
        res.status(500).json(error);
    }
});

router.delete('/delete/receber/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        const pagamentoQuery = await dbQuery(`SELECT * FROM PAGAMENTO WHERE pgt_id = ? AND empresa_id = ?`, [id, empresa_id]);
        const age_id = pagamentoQuery.length > 0 ? pagamentoQuery[0].age_id : null;
        const pgt_valor = pagamentoQuery.length > 0 ? pagamentoQuery[0].pgt_valor : 0;

        await dbQuery(`DELETE FROM PAGAMENTO WHERE pgt_id = ? AND empresa_id = ?`, [id, empresa_id]);

        //Verificar se o pagamento tem lembretes associados
        await dbQuery(`DELETE FROM Lembretes WHERE params LIKE '%viewPagamento=${id}%' AND empresa_id = ?`, [empresa_id]);

        const userData = req.user;
        if (age_id && userData && userData.fullName) {
            setHistoricoAgendamento(age_id, {
                title: 'Pagamento removido',
                description: `Pagamento de R$ ${parseFloat(pgt_valor).toFixed(2)} foi removido`,
                feitoPor: userData.fullName,
                color: 'error',
                icon: 'tabler-trash'
            });
        }

        res.status(200).json('Pagamento deletado');
    } catch (error) {
        console.error('Erro ao deletar pagamento', error);
        res.status(500).json({ error });
    }
});

router.delete('/delete/despesas/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery(`DELETE FROM DESPESAS WHERE des_id = ? AND empresa_id = ?`, [id, empresa_id]);

        //Verificar se a despesa tem lembretes associados
        let lembretes = await dbQuery(`SELECT * FROM Lembretes WHERE params LIKE '%viewDespesa=${id}%' AND empresa_id = ?`, [empresa_id]);

        if (lembretes.length) {
            for (let lembrete of lembretes) {
                await axios.get(`${process.env.API_URL}/lembretes/delete/${lembrete.id}`);
            }
        }

        res.status(200).json('Despesa deletada');
    } catch (error) {
        console.error('Erro ao deletar despesa', error);
        res.status(500).json({ error });
    }
});

router.post('/anexar-nota/:id', upload.single('nota'), async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        const pagamento = await dbQuery(`SELECT * FROM PAGAMENTO WHERE pgt_id = ? AND empresa_id = ?`, [id, empresa_id]);

        if (pagamento.length) {
            const file = req.file;
            const notaNome = file.filename;

            let url = '/download/docs/notas/' + id + '/' + notaNome;

            await dbQuery(`UPDATE PAGAMENTO SET pgt_nota_fiscal = ? WHERE pgt_id = ? AND empresa_id = ?`, [url, id, empresa_id]);

            res.status(200).json(url);
        } else {
            res.status(404).json({ message: 'Pagamento nao encontrado' });
        }
    } catch (error) {
        console.error('Erro ao anexar nota', error);
        res.status(500).json({ error });
    }
});

router.post('/lancarSaida', async (req, res) => {

    try {
        const user = req.user;
        const empresa_id = req.user.empresa_id;

        if (!user || !user.fullName) {
            return res.status(401).json({ message: 'Usuario nao autenticado' });
        }

        let { sai_data, sai_fpt, sai_contas } = req.body;

        if (!sai_contas || sai_contas.length === 0) {
            return res.status(400).json({ message: 'Nenhuma conta selecionada para lancar a saida.' });
        }

        sai_data = sai_data ? moment(sai_data).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');

        for (let conta of sai_contas) {
            if (conta.tipo === 'Despesa') {
                let idDespesa = conta.id.replace('D', '');
                await dbQuery(`UPDATE DESPESAS SET des_pago = 1, des_paga_data = ?, des_forma_pagamento = ?, des_pagoPor = ? WHERE des_id = ? AND empresa_id = ?`,
                    [sai_data, sai_fpt, user.fullName, idDespesa, empresa_id]);
            } else if (conta.tipo === 'Comissao') {
                let idComissao = conta.id.replace('C', '');

                const comissaoQuery = await dbQuery(`SELECT * FROM COMISSOES WHERE com_id = ? AND empresa_id = ?`, [idComissao, empresa_id]);
                const age_id = comissaoQuery.length > 0 ? comissaoQuery[0].age_id : null;
                const com_valor = comissaoQuery.length > 0 ? comissaoQuery[0].com_valor : 0;

                await dbQuery(`UPDATE COMISSOES SET com_paga = 1, com_paga_data = ?, com_forma_pagamento = ?, com_pagoPor = ? WHERE com_id = ? AND empresa_id = ?`,
                    [sai_data, sai_fpt, user.fullName, idComissao, empresa_id]);

                if (age_id) {
                    setHistoricoAgendamento(age_id, {
                        title: 'Comissao paga',
                        description: `Comissao de R$ ${parseFloat(com_valor).toFixed(2)} foi marcada como paga`,
                        feitoPor: user.fullName,
                        color: 'success',
                        icon: 'tabler-coins'
                    });
                }
            }
        }

        res.status(200).json('Pagamento lancado com sucesso!');
    } catch (error) {
        console.error('Erro ao lancar saida', error);
        res.status(500).json({ error });
    }
});

router.get('/forma_entrada', async (req, res) => {
    const empresa_id = req.user.empresa_id;

    try {
        const formas = await dbQuery('SELECT * FROM FORMAS_PAGAMENTO WHERE empresa_id = ?', [empresa_id]);

        res.status(200).json(formas);
    } catch (error) {
        console.error('Erro ao buscar formas de pagamento', error);
        res.status(500).json({ error });
    }
});

router.post('/forma_entrada', async (req, res) => {
    const { fpg_descricao } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery('INSERT INTO FORMAS_PAGAMENTO (fpg_descricao, empresa_id) VALUES (?, ?)', [fpg_descricao, empresa_id]);

        res.status(200).json('Forma de pagamento adicionada');
    } catch (error) {
        console.error('Erro ao adicionar forma de pagamento', error);
        res.status(500).json({ error });
    }
});

router.delete('/forma_entrada/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery(`DELETE FROM FORMAS_PAGAMENTO WHERE fpg_id = ? AND empresa_id = ?`, [id, empresa_id]);

        res.status(200).json('Forma de pagamento deletada');
    } catch (error) {
        console.error('Erro ao deletar forma de pagamento', error);
        res.status(500).json({ error });
    }
});

router.post('/save-nota/:id', async (req, res) => {
    const { id } = req.params;
    const { pgt_numero_nota_fiscal } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery(`UPDATE PAGAMENTO SET pgt_numero_nota_fiscal = ? WHERE pgt_id = ? AND empresa_id = ?`, [pgt_numero_nota_fiscal, id, empresa_id]);

        res.status(200).json('Nota salva');
    } catch (error) {
        console.error('Erro ao salvar nota', error);
        res.status(500).json({ error });
    }
});

const checkDateStatus = (date, isPaid) => {
    if (isPaid) return { status: 'Pago', color: 'success' };

    const today = moment();
    const dateToCheck = moment(date);

    const diff = dateToCheck.diff(today, 'days');
    if (diff < 0) {
        return { status: 'Em atraso', color: 'error' };
    } else if (diff === 0) {
        return { status: 'Pagar hoje', color: 'info' };
    } else {
        return { status: 'Em aberto', color: 'warning' };
    }
};

module.exports = router;
