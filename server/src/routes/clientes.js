const express = require('express');
const router = express.Router();
const path = require('path');
const moment = require('moment');

const { sanitizeInput } = require('../utils/functions');
const { getAgendamentos } = require('../utils/agendaUtils');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');


router.get('/list', async (req, res) => {
    let {
        q = '',
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'desc',
        cli_Id = null,
        cadastroDe = null,
        cadastroAte = null,
        totalAgendamentosDe = null,
        totalAgendamentosAte = null,
        gastoDe = null,
        gastoAte = null
    } = req.query;

    const empresa_id = req.user.empresa_id;

    itemsPerPage = parseInt(itemsPerPage);
    page = parseInt(page);

    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    q = sanitizeInput(q);

    // Função para normalizar o texto
    const normalizeText = (text) => {
        return text
            .normalize('NFD') // Decompor acentos
            .replace(/[\u0300-\u036f]/g, '') // Remover acentos
            .replace(/\s+/g, ' ') // Normalizar espaços
            .toLowerCase(); // Converter para minúsculas
    };

    // Normalizar a pesquisa
    const normalizedQuery = normalizeText(q);

    const normalizeField = (field) => {
        return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(REPLACE(${field}, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'),
            'À', 'A'), 'È', 'E'), 'Ì', 'I'), 'Ò', 'O'), 'Ù', 'U'))`;
    }

    const gastoExpr = `
  (
    SELECT COALESCE(SUM(j.pgt_valor), 0)
    FROM AGENDAMENTO a
    JOIN PAGAMENTO p
      ON p.age_id = a.age_id
     AND p.pgt_data IS NOT NULL
    JOIN JSON_TABLE(p.pgt_json, '$[*]'
      COLUMNS(pgt_valor DECIMAL(18,2) PATH '$.pgt_valor')
    ) j
    WHERE a.cli_id = c.cli_Id
  )
`;

    // Iniciar a query com JOIN entre clientes e ENDERECO e incluir a subquery para contagem total
    let baseQuery = `FROM CLIENTES c WHERE c.empresa_id = ${parseInt(empresa_id)}`;


    if (q && q.trim() !== '') {
        let qQuery = '';

        let enderecosQuery = await dbQuery(`
            SELECT * FROM ENDERECO WHERE empresa_id = ? AND (
            ${normalizeField('end_logradouro')} LIKE ? OR
            ${normalizeField('end_bairro')} LIKE ? OR
            ${normalizeField('end_cidade')} LIKE ?)
        `, [empresa_id, `%${normalizedQuery}%`, `%${normalizedQuery}%`, `%${normalizedQuery}%`]);

        if (enderecosQuery.length > 0) {
            //baseQuery += ` AND cli_Id IN (${enderecosQuery.map(e => e.cli_id).join(',')})`;
            qQuery += ` AND (c.cli_Id IN (${enderecosQuery.map(e => e.cli_id).join(',')})
            OR ${normalizeField('c.cli_nome')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_celular')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_celular2')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_cpf')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_email')} LIKE '%${normalizedQuery}%'
            )`;
        } else {
            qQuery += ` AND (${normalizeField('c.cli_nome')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_celular')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_celular2')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_cpf')} LIKE '%${normalizedQuery}%' OR
            ${normalizeField('c.cli_email')} LIKE '%${normalizedQuery}%')`;
        }

        baseQuery += qQuery;
    } else {
        baseQuery += ' AND c.cli_ativo = 1';
    }

    if (cadastroDe) {
        baseQuery += ` AND c.created_at >= '${cadastroDe}'`;
    }
    if (cadastroAte) {
        baseQuery += ` AND c.created_at <= '${cadastroAte}'`;
    }
    if (totalAgendamentosDe) {
        baseQuery += ` AND (SELECT COUNT(*) FROM AGENDAMENTO WHERE cli_id = c.cli_Id) >= ${totalAgendamentosDe}`;
    }
    if (totalAgendamentosAte) {
        baseQuery += ` AND (SELECT COUNT(*) FROM AGENDAMENTO WHERE cli_id = c.cli_Id) <= ${totalAgendamentosAte}`;
    }

    if (gastoDe) {
        baseQuery += ` AND ${gastoExpr} >= ${gastoDe}`;
    }

    if (gastoAte) {
        baseQuery += ` AND ${gastoExpr} <= ${gastoAte}`;
    }

    // Adicione ordenação
    let r;
    if (sortBy) {
        r = sortBy == 'user' ? 'c.cli_nome' : `${sortBy}`;
    } else {
        r = 'c.cli_Id';
    }

    baseQuery += ` ORDER BY ${r} ${orderBy.toUpperCase()}`;

    let totalClientesQuery = await dbQuery(`SELECT COUNT(*) as totalClientes ${baseQuery}`);
    let totalClientes = totalClientesQuery[0] ? totalClientesQuery[0].totalClientes : 0;

    // Adicione paginação
    baseQuery += ` LIMIT ${itemsPerPage} OFFSET ${offset}`;

    const itens = `
    c.cli_Id, c.cli_nome, c.cli_celular, c.cli_celular2, c.cli_email, 
    c.cli_contratos, c.cli_cpf, c.cli_ativo, c.cli_obs, c.created_at,
    c.updated_at,
    ${gastoExpr} AS gasto
    `;
    let dataQuery = `SELECT ${itens} ${baseQuery}`;

    /* console.log('Final SQL Query:', dataQuery);
    console.log('Total Clientes Query:', totalClientesQuery); */
    try {
        const clientes = await dbQuery(dataQuery);

        if (cli_Id) {
            //Checar se o cli_Id existe na lista de clientes retornados
            const clienteExiste = clientes.find(c => c.cli_Id == cli_Id);

            if (!clienteExiste) {
                const itens2 = `
                cli_Id, cli_nome, cli_celular, cli_celular2, cli_email,
                cli_cpf, cli_ativo, cli_obs, created_at, updated_at
                `;
                const clienteExtra = await dbQuery(`SELECT ${itens2} FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?`, [cli_Id, empresa_id]);
                if (clienteExtra.length > 0) {
                    clientes.unshift(clienteExtra[0]);
                    totalClientes += 1;
                }
            }
        }

        for (let cliente of clientes) {
            let agendamentos = await dbQuery('SELECT * FROM AGENDAMENTO WHERE cli_id = ? AND empresa_id = ?', [cliente.cli_Id, empresa_id]);
            cliente.agendamentos = agendamentos.length > 0 ? agendamentos : null;
            cliente.agendamentoVisible = false;

            let enderecos = await dbQuery('SELECT * FROM ENDERECO WHERE cli_id = ? AND empresa_id = ?', [cliente.cli_Id, empresa_id]);
            cliente.enderecos = enderecos.length > 0 ? enderecos : null;

            cliente.cli_contratos = cliente.cli_contratos ? JSON.parse(cliente.cli_contratos) : null;
        }


        res.status(200).json({ clientes, totalClientes });
    } catch (error) {
        console.error('Erro ao buscar clientes', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/list/total', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    try {
        const total = await dbQuery('SELECT COUNT(*) as total FROM CLIENTES WHERE cli_ativo = 1 AND empresa_id = ?', [empresa_id]);
        res.status(200).json({ totalclientes: total[0].total });
    } catch (error) {
        console.error('Erro ao buscar total de clientes', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/get/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    if (!id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
    }

    try {
        const clienteQuery = await dbQuery('SELECT * FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?', [id, empresa_id]);
        const enderecoQuery = await dbQuery('SELECT * FROM ENDERECO WHERE cli_id = ? AND empresa_id = ?', [id, empresa_id]);

        let cliente = clienteQuery.map((c) => {
            return {
                id: c.cli_Id,
                nome: c.cli_nome,
                email: c.cli_email,
                celular: c.cli_celular,
                celular2: c.cli_celular2,
                cpf: c.cli_cpf,
                endereco: enderecoQuery.map((e) => {
                    return {
                        id: e.end_id,
                        cep: e.end_cep,
                        logradouro: e.end_logradouro,
                        numero: e.end_numero,
                        complemento: e.end_complemento,
                        bairro: e.end_bairro,
                        cidade: e.end_cidade,
                        estado: e.end_estado,
                    }
                }),
                observacao: c.cli_obs,
                personType: c.cli_personType,
                genero: c.cli_genero,
                contatos: c.cli_contatos ? JSON.parse(c.cli_contatos) : [],
                historico: c.cli_historico ? JSON.parse(c.cli_historico) : [],
                atividades: c.cli_atividades ? JSON.parse(c.cli_atividades) : [],
                anotacoes: c.cli_anotacoes ? JSON.parse(c.cli_anotacoes) : [],
                ativo: c.cli_ativo,
                tags: c.cli_tags ? JSON.parse(c.cli_tags) : [],
                contratos: c.cli_contratos ? JSON.parse(c.cli_contratos) : [],
                created_at: c.created_at,
                updated_at: c.updated_at,
            }
        });

        res.status(200).json(cliente);
    } catch (error) {
        console.error('Erro ao buscar cliente', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/create', async (req, res) => {
    const data = req.body;
    const empresa_id = req.user.empresa_id;

    //console.log('Corpo da requisição:', req.body);

    const nome = data.nome;
    const celular = data.celular || null;
    const endereco = data.endereco || null;

    const {
        cpf = null,
        email = null,
        observacao = '',
        contatos = [],
        personType = null,
        genero = null,
        contratos = []
    } = data;

    if (!nome) {
        return res.status(400).json({ error: 'Nome e celular são obrigatórios' });
    }

    try {
        if (!data.id) {
            const historicoCliente = [{
                title: 'Cliente criado',
                description: `Cliente ${nome} criado no painel`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
                color: 'success',
                icon: 'tabler-user-plus'
            }];

            const cliente = await dbQuery(`INSERT INTO CLIENTES
                (cli_nome, cli_cpf, cli_email, cli_celular, cli_obs, cli_personType,
                cli_genero, cli_contatos, cli_historico, cli_contratos, empresa_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [nome, cpf, email, celular, observacao, personType, genero,
                    JSON.stringify(contatos), JSON.stringify(historicoCliente),
                    JSON.stringify(contratos), empresa_id]);

            if (endereco) {
                for (const enderecoV of endereco) {
                    let logradouro = enderecoV.logradouro && enderecoV.logradouro !== '' ? enderecoV.logradouro : null;
                    let numero = enderecoV.numero && enderecoV.numero !== '' ? enderecoV.numero : null;
                    let complemento = enderecoV.complemento && enderecoV.complemento !== '' ? enderecoV.complemento : null;
                    let bairro = enderecoV.bairro && enderecoV.bairro !== '' ? enderecoV.bairro : null;
                    let cidade = enderecoV.cidade && enderecoV.cidade !== '' ? enderecoV.cidade : null;
                    let estado = enderecoV.estado && enderecoV.estado !== '' ? enderecoV.estado : null;
                    let cep = enderecoV.cep && enderecoV.cep !== '' ? enderecoV.cep : null;

                    const queryEndereco = 'INSERT INTO ENDERECO (cli_id, end_logradouro, end_numero, end_complemento, end_bairro, end_cidade, end_estado, end_cep, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
                    const valuesEndereco = [cliente.insertId, logradouro, numero, complemento, bairro, cidade, estado, cep, empresa_id];

                    await dbQuery(queryEndereco, valuesEndereco);
                }
            }

            let queryNewCliente = endereco && endereco.length > 0 ? `SELECT CLIENTES.*, ENDERECO.*
            FROM CLIENTES
            JOIN ENDERECO ON CLIENTES.cli_Id = ENDERECO.cli_id
            WHERE CLIENTES.cli_Id = ? AND CLIENTES.empresa_id = ?` : `SELECT * FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?`;

            const newCliente = await dbQuery(queryNewCliente, [cliente.insertId, empresa_id]);

            newCliente[0].cli_historico = JSON.parse(newCliente[0].cli_historico || '[]');
            newCliente[0].cli_contatos = JSON.parse(newCliente[0].cli_contatos || '[]');
            newCliente[0].cli_contratos = JSON.parse(newCliente[0].cli_contratos || '[]');

            return res.status(200).json(newCliente[0]);
        } else {
            const { id } = data;

            const clienteExistente = await dbQuery('SELECT * FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?', [id, empresa_id]);
            if (clienteExistente.length === 0) {
                return res.status(404).json({ error: 'Cliente não encontrado' });
            }

            const historicoAtual = JSON.parse(clienteExistente[0].cli_historico || '[]');
            historicoAtual.unshift({
                title: 'Cliente editado',
                description: `Cliente ${nome} editado no painel`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
                color: 'info',
                icon: 'tabler-edit'
            });

            await dbQuery(`
                    UPDATE CLIENTES
                    SET cli_nome = ?, cli_cpf = ?, cli_email = ?, cli_celular = ?, cli_obs = ?,
                    cli_personType = ?, cli_genero = ?, cli_contatos = ?, cli_historico = ?, cli_contratos = ?
                    WHERE cli_Id = ? AND empresa_id = ?
                `, [nome, cpf, email, celular, observacao, personType, genero, JSON.stringify(contatos),
                    JSON.stringify(historicoAtual), JSON.stringify(contratos), id, empresa_id]);

            if (endereco) {
                for (const enderecoV of endereco) {
                    let logradouro = enderecoV.logradouro && enderecoV.logradouro !== '' ? enderecoV.logradouro : null;
                    let numero = enderecoV.numero && enderecoV.numero !== '' ? enderecoV.numero : null;
                    let complemento = enderecoV.complemento && enderecoV.complemento !== '' ? enderecoV.complemento : null;
                    let bairro = enderecoV.bairro && enderecoV.bairro !== '' ? enderecoV.bairro : null;
                    let cidade = enderecoV.cidade && enderecoV.cidade !== '' ? enderecoV.cidade : null;
                    let estado = enderecoV.estado && enderecoV.estado !== '' ? enderecoV.estado : null;
                    let cep = enderecoV.cep && enderecoV.cep !== '' ? enderecoV.cep : null;

                    if (enderecoV.id) {
                        // console.log("Updating endereco:", enderecoV.id);
                        await dbQuery(`
                                UPDATE ENDERECO
                                SET end_logradouro = ?, end_numero = ?, end_complemento = ?, end_bairro = ?, end_cidade = ?, end_estado = ?, end_cep = ?
                                WHERE end_id = ? AND cli_id = ? AND empresa_id = ?
                            `, [logradouro, numero, complemento, bairro, cidade, estado, cep, enderecoV.id, id, empresa_id]);
                    } else {
                        const queryEndereco = 'INSERT INTO ENDERECO (cli_id, end_logradouro, end_numero, end_complemento, end_bairro, end_cidade, end_estado, end_cep, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
                        const valuesEndereco = [id, logradouro, numero, complemento, bairro, cidade, estado, cep, empresa_id];
                        await dbQuery(queryEndereco, valuesEndereco);
                    }
                }
            }

            const updatedCliente = await dbQuery('SELECT * FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?', [id, empresa_id]);

            updatedCliente[0].cli_historico = JSON.parse(updatedCliente[0].cli_historico || '[]');
            updatedCliente[0].cli_contatos = JSON.parse(updatedCliente[0].cli_contatos || '[]');
            updatedCliente[0].cli_contratos = JSON.parse(updatedCliente[0].cli_contratos || '[]');
            
            return res.status(200).json(updatedCliente[0]);
        }
    } catch (error) {
        console.error('Erro ao criar cliente', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/delete/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    if (!id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
    }

    try {
        await dbQuery('UPDATE CLIENTES SET cli_ativo = 0 WHERE cli_Id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Cliente deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar cliente', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/restore/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    if (!id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
    }

    try {
        await dbQuery('UPDATE CLIENTES SET cli_ativo = 1 WHERE cli_Id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Cliente restaurado com sucesso' });
    } catch (error) {
        console.error('Erro ao restaurar cliente', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/clientes-cep', async (req, res) => {
    //Obter CEP do ViaCEP
    const { cep } = req.query;

    if (!cep) {
        return res.status(400).json({ error: 'CEP é obrigatório' });
    }

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar CEP', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/getAgendamentos/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;
    let {
        q = null,
        f = null,
        d = null,
        sortBy = 'age_id',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'desc'
    } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
    }

    itemsPerPage = parseInt(itemsPerPage);
    page = parseInt(page);

    let offset = (page - 1) * parseInt(itemsPerPage);

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    let baseQuery = `FROM AGENDAMENTO WHERE cli_id = ? AND empresa_id = ?`;

    if (q && q.trim() !== '') {
        baseQuery += ` AND (
            age_data LIKE ? OR 
            age_valor LIKE ?
        )`;
    }

    if (f && f.trim() !== '') {
        baseQuery += ` AND fun_id = ?`;
    }

    if (d && d.trim() !== '') {
        baseQuery += ` AND age_data = ?`;
    }


    let dataQuery = `SELECT *, (SELECT COUNT(*) ${baseQuery}) as totalAgendamentos ${baseQuery}`;

    if (sortBy) {
        dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        dataQuery += ' ORDER BY age_data DESC';
    }

    dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        // Preparar os parâmetros da consulta
        let queryParams = [id, empresa_id];
        if (q) {
            queryParams.push(`%${q}%`);
        }
        if (f) {
            queryParams.push(f);
        }
        if (d) {
            queryParams.push(d);
        }

        //console.log('Final SQL Query for Agendamentos:', dataQuery, queryParams);

        const agendamentos = await getAgendamentos(dataQuery, [...queryParams, ...queryParams], empresa_id);

        let data = {
            agendamentos,
            totalAgendamentos: agendamentos.length > 0 ? agendamentos[0].totalAgendamentos : 0,
            query: req.query
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar agendamentos', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/block-flows/:id', async (req, res) => {
    const { id } = req.params;
    const { blocked } = req.body;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery('UPDATE CLIENTES SET flows_blocked = ? WHERE cli_Id = ? AND empresa_id = ?', [blocked, id, empresa_id]);
        res.status(200).json({ message: 'Fluxos bloqueados com sucesso' });
    } catch (error) {
        console.error('Erro ao bloquear fluxos', error);

        res.status(500).json({ error: error.message });
    }
});


module.exports = router;