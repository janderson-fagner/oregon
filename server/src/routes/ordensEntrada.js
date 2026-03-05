const express = require('express');
const router = express.Router();
const moment = require('moment');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const { sanitizeInput } = require('../utils/functions');

/**
 * GET /ordens-entrada/list - Listar ordens de entrada com filtros
 * Query params: q (busca), sortBy, itemsPerPage, page, orderBy, dataDe, dataAte, produto_id
 */
router.get('/list', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    let {
        q = '',
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'desc',
        dataDe = null,
        dataAte = null,
        funcionario = null,
        produto_id = null
    } = req.query;

    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    let baseQuery = `FROM ORDENS_ENTRADA oe
        INNER JOIN PRODUTOS p ON oe.oe_produto_id = p.prod_id
        LEFT JOIN User u ON oe.oe_usuario_id = u.id
        WHERE 1 = 1 AND oe.empresa_id = ${parseInt(empresa_id)}`;
    
    // Filtro de busca por nome do produto, fornecedor ou nota fiscal
    if (q) {
        baseQuery += ` AND (p.prod_nome LIKE '%${sanitizeInput(q)}%' OR oe.oe_fornecedor LIKE '%${sanitizeInput(q)}%' OR oe.oe_nota_fiscal LIKE '%${sanitizeInput(q)}%')`;
    }

    // Filtro por produto específico
    if (produto_id) {
        baseQuery += ` AND oe.oe_produto_id = ${parseInt(produto_id)}`;
    }

    // Filtro por funcionário
    if (funcionario) {
        baseQuery += ` AND oe.oe_usuario_id = ${parseInt(funcionario)}`;
    }

    // Filtro por período
    if (dataDe && dataAte) {
        baseQuery += ` AND oe.oe_data BETWEEN '${sanitizeInput(dataDe)}' AND '${sanitizeInput(dataAte)}'`;
    } else if (dataDe) {
        baseQuery += ` AND oe.oe_data >= '${sanitizeInput(dataDe)}'`;
    } else if (dataAte) {
        baseQuery += ` AND oe.oe_data <= '${sanitizeInput(dataAte)}'`;
    }

    let dataQuery = `SELECT 
        oe.*,
        p.prod_nome,
        p.prod_sku,
        u.fullName as usuario_nome,
        (SELECT COUNT(*) ${baseQuery}) AS totalOrdens 
        ${baseQuery}`;

    if (sortBy) {
        dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        dataQuery += ` ORDER BY oe.created_at DESC`;
    }

    dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        const ordens = await dbQuery(dataQuery);

        for (let ordem of ordens) {
            let usuarioQuery = await dbQuery('SELECT * FROM User WHERE id = ?', [ordem.oe_usuario_id]);
            if (usuarioQuery.length > 0) {
                ordem.usuario = usuarioQuery[0];
            }
        }

        let data = {
            ordens: ordens,
            totalOrdens: ordens.length > 0 ? ordens[0].totalOrdens : 0
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar ordens de entrada', error);
        res.status(500).json({ error });
    }
});

/**
 * GET /ordens-entrada/get/:id - Buscar ordem de entrada específica
 */
router.get('/get/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        let queryOrdem = `
            SELECT
                oe.*,
                p.prod_nome,
                p.prod_sku,
                p.prod_descricao,
                u.fullName as usuario_nome
            FROM ORDENS_ENTRADA oe
            INNER JOIN PRODUTOS p ON oe.oe_produto_id = p.prod_id
            LEFT JOIN User u ON oe.oe_usuario_id = u.id
            WHERE oe.oe_id = ? AND oe.empresa_id = ?`;
        let ordemQuery = await dbQuery(queryOrdem, [id, empresa_id]);

        if (!ordemQuery || ordemQuery.length == 0) {
            return res.status(404).json({ message: 'Ordem de entrada não encontrada' });
        }

        const ordem = ordemQuery[0];

        // Se tiver despesa associada, buscar dados da despesa
        if (ordem.oe_despesa_id) {
            const despesaQuery = await dbQuery('SELECT * FROM DESPESAS WHERE des_id = ?', [ordem.oe_despesa_id]);
            if (despesaQuery.length > 0) {
                ordem.despesa = despesaQuery[0];
            }
        }

        res.status(200).json(ordem);
    } catch (error) {
        console.error('Erro ao buscar ordem de entrada', error);
        res.status(500).json({ error });
    }
});

/**
 * POST /ordens-entrada/create - Criar nova ordem de entrada
 * Atualiza a quantidade do produto e opcionalmente cria uma despesa
 */
router.post('/create', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const {
        oe_produto_id,
        oe_quantidade,
        oe_valor_unitario = 0,
        oe_valor_total = 0,
        oe_data,
        oe_fornecedor = null,
        oe_nota_fiscal = null,
        oe_observacoes = null,
        oe_criar_despesa = false,
        despesa_paga = false,
        despesa_forma_pagamento = null,
        despesa_tipo = null
    } = req.body;

    if (!oe_produto_id || !oe_quantidade || !oe_data) {
        return res.status(400).json({ 
            message: 'Produto, quantidade e data são obrigatórios' 
        });
    }

    if (oe_quantidade <= 0) {
        return res.status(400).json({ 
            message: 'A quantidade deve ser maior que zero' 
        });
    }

    try {
        // Verificar se o produto existe
        const produtoQuery = await dbQuery('SELECT * FROM PRODUTOS WHERE prod_id = ?', [oe_produto_id]);
        if (!produtoQuery || produtoQuery.length === 0) {
            return res.status(404).json({ message: 'Produto não encontrado' });
        }

        const produto = produtoQuery[0];
        let despesa_id = null;

        // Criar despesa se solicitado e valor total > 0
        if (oe_criar_despesa && oe_valor_total > 0) {
            const des_descricao = `Entrada de estoque - ${produto.prod_nome} (${oe_quantidade} unidades)`;
            const des_data = moment(oe_data).format('YYYY-MM-DD');
            const des_pago = despesa_paga ? 1 : 0;
            const des_paga_data = despesa_paga ? des_data : null;
            const des_tipo = despesa_tipo || 'Estoque';
            const des_obs = oe_observacoes || `Ordem de entrada - Nota: ${oe_nota_fiscal || 'N/A'}`;

            let despesaQuery = `INSERT INTO DESPESAS (
                des_descricao, des_valor, des_data, des_pago, des_paga_data, 
                des_tipo, des_obs, des_forma_pagamento, des_pagoPor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const despesaResult = await dbQuery(despesaQuery, [
                des_descricao,
                oe_valor_total,
                des_data,
                des_pago,
                des_paga_data,
                des_tipo,
                des_obs,
                despesa_forma_pagamento,
                req.user ? req.user.fullName : null
            ]);

            despesa_id = despesaResult.insertId;
        }

        // Criar ordem de entrada
        let query = `INSERT INTO ORDENS_ENTRADA (
            oe_produto_id, oe_quantidade, oe_valor_unitario, oe_valor_total,
            oe_data, oe_fornecedor, oe_nota_fiscal, oe_observacoes,
            oe_criar_despesa, oe_despesa_id, oe_usuario_id, empresa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const result = await dbQuery(query, [
            oe_produto_id,
            oe_quantidade,
            oe_valor_unitario,
            oe_valor_total,
            moment(oe_data).format('YYYY-MM-DD'),
            oe_fornecedor,
            oe_nota_fiscal,
            oe_observacoes,
            oe_criar_despesa ? 1 : 0,
            despesa_id,
            req.user ? req.user.id : null,
            empresa_id
        ]);

        // Atualizar quantidade do produto
        const novaQuantidade = parseInt(produto.prod_quantidade) + parseInt(oe_quantidade);
        await dbQuery('UPDATE PRODUTOS SET prod_quantidade = ?, updated_at = NOW() WHERE prod_id = ?', 
            [novaQuantidade, oe_produto_id]);

        res.status(201).json({ 
            message: 'Ordem de entrada cadastrada com sucesso',
            ordem_id: result.insertId,
            despesa_id: despesa_id
        });
    } catch (error) {
        console.error('Erro ao cadastrar ordem de entrada', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /ordens-entrada/update/:id - Atualizar ordem de entrada
 * ATENÇÃO: Atualizar uma ordem recalcula a quantidade do produto
 */
router.post('/update/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const {
        oe_quantidade,
        oe_valor_unitario = 0,
        oe_valor_total = 0,
        oe_data,
        oe_fornecedor = null,
        oe_nota_fiscal = null,
        oe_observacoes = null
    } = req.body;

    if (!oe_quantidade || !oe_data) {
        return res.status(400).json({ message: 'Quantidade e data são obrigatórios' });
    }

    if (oe_quantidade <= 0) {
        return res.status(400).json({ 
            message: 'A quantidade deve ser maior que zero' 
        });
    }

    try {
        // Buscar ordem atual
        const ordemAtualQuery = await dbQuery('SELECT * FROM ORDENS_ENTRADA WHERE oe_id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!ordemAtualQuery || ordemAtualQuery.length === 0) {
            return res.status(404).json({ message: 'Ordem de entrada não encontrada' });
        }

        const ordemAtual = ordemAtualQuery[0];
        const diferencaQuantidade = parseInt(oe_quantidade) - parseInt(ordemAtual.oe_quantidade);

        // Buscar produto
        const produtoQuery = await dbQuery('SELECT * FROM PRODUTOS WHERE prod_id = ?', [ordemAtual.oe_produto_id]);
        if (!produtoQuery || produtoQuery.length === 0) {
            return res.status(404).json({ message: 'Produto não encontrado' });
        }

        const produto = produtoQuery[0];

        // Atualizar ordem de entrada
        let updateQuery = `UPDATE ORDENS_ENTRADA SET 
            oe_quantidade = ?, oe_valor_unitario = ?, oe_valor_total = ?,
            oe_data = ?, oe_fornecedor = ?, oe_nota_fiscal = ?, oe_observacoes = ?,
            updated_at = NOW()
            WHERE oe_id = ? AND empresa_id = ?`;

        await dbQuery(updateQuery, [
            oe_quantidade,
            oe_valor_unitario,
            oe_valor_total,
            moment(oe_data).format('YYYY-MM-DD'),
            oe_fornecedor,
            oe_nota_fiscal,
            oe_observacoes,
            id,
            empresa_id
        ]);

        // Atualizar quantidade do produto
        const novaQuantidade = parseInt(produto.prod_quantidade) + diferencaQuantidade;
        await dbQuery('UPDATE PRODUTOS SET prod_quantidade = ?, updated_at = NOW() WHERE prod_id = ?', 
            [novaQuantidade, ordemAtual.oe_produto_id]);

        // Atualizar despesa se existir
        if (ordemAtual.oe_despesa_id && oe_valor_total > 0) {
            await dbQuery('UPDATE DESPESAS SET des_valor = ?, updated_at = NOW() WHERE des_id = ?', 
                [oe_valor_total, ordemAtual.oe_despesa_id]);
        }

        res.status(200).json({ message: 'Ordem de entrada atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar ordem de entrada', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /ordens-entrada/delete/:id - Deletar ordem de entrada
 * Remove a quantidade do produto e deleta a despesa associada se existir
 */
router.delete('/delete/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        // Buscar ordem
        const ordemQuery = await dbQuery('SELECT * FROM ORDENS_ENTRADA WHERE oe_id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!ordemQuery || ordemQuery.length === 0) {
            return res.status(404).json({ message: 'Ordem de entrada não encontrada' });
        }

        const ordem = ordemQuery[0];

        // Buscar produto
        const produtoQuery = await dbQuery('SELECT * FROM PRODUTOS WHERE prod_id = ?', [ordem.oe_produto_id]);
        if (produtoQuery && produtoQuery.length > 0) {
            const produto = produtoQuery[0];
            
            // Remover quantidade do produto
            const novaQuantidade = parseInt(produto.prod_quantidade) - parseInt(ordem.oe_quantidade);
            await dbQuery('UPDATE PRODUTOS SET prod_quantidade = ?, updated_at = NOW() WHERE prod_id = ?', 
                [novaQuantidade >= 0 ? novaQuantidade : 0, ordem.oe_produto_id]);
        }

        // Deletar despesa associada se existir
        if (ordem.oe_despesa_id) {
            await dbQuery('DELETE FROM DESPESAS WHERE des_id = ?', [ordem.oe_despesa_id]);
        }

        // Deletar ordem
        await dbQuery('DELETE FROM ORDENS_ENTRADA WHERE oe_id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Ordem de entrada deletada com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar ordem de entrada', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /ordens-entrada/por-produto/:produto_id - Listar ordens de entrada de um produto específico
 */
router.get('/por-produto/:produto_id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { produto_id } = req.params;

    try {
        const ordens = await dbQuery(`
            SELECT
                oe.*,
                u.fullName as usuario_nome
            FROM ORDENS_ENTRADA oe
            LEFT JOIN User u ON oe.oe_usuario_id = u.id
            WHERE oe.oe_produto_id = ? AND oe.empresa_id = ?
            ORDER BY oe.oe_data DESC, oe.created_at DESC
        `, [produto_id, empresa_id]);

        res.status(200).json(ordens);
    } catch (error) {
        console.error('Erro ao buscar ordens de entrada do produto', error);
        res.status(500).json({ error });
    }
});

module.exports = router;

