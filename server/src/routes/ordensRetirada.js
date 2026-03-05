const express = require('express');
const router = express.Router();
const moment = require('moment');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const { sanitizeInput } = require('../utils/functions');

/**
 * GET /ordens-retirada/list - Listar ordens de retirada com filtros
 * Query params: q (busca), sortBy, itemsPerPage, page, orderBy, dataDe, dataAte, produto_id, funcionario_id
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
        produto_id = null,
        funcionario = null,
        lancadoPor = null,
    } = req.query;

    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    let baseQuery = `FROM ORDENS_RETIRADA orr
        INNER JOIN PRODUTOS p ON orr.or_produto_id = p.prod_id
        LEFT JOIN User u ON orr.or_usuario_id = u.id
        LEFT JOIN User f ON orr.or_funcionario_id = f.id
        WHERE 1 = 1 AND orr.empresa_id = ${parseInt(empresa_id)}`;
    
    // Filtro de busca por nome do produto ou motivo
    if (q) {
        baseQuery += ` AND (p.prod_nome LIKE '%${sanitizeInput(q)}%' OR orr.or_motivo LIKE '%${sanitizeInput(q)}%' OR f.fullName LIKE '%${sanitizeInput(q)}%')`;
    }

    // Filtro por produto específico
    if (produto_id) {
        baseQuery += ` AND orr.or_produto_id = ${parseInt(produto_id)}`;
    }

    // Filtro por funcionário
    if (funcionario) {
        baseQuery += ` AND orr.or_funcionario_id = ${parseInt(funcionario)}`;
    }
    
    // Filtro por lançado por
    if (lancadoPor) {
        baseQuery += ` AND orr.or_usuario_id = ${parseInt(lancadoPor)}`;
    }

    // Filtro por período
    if (dataDe && dataAte) {
        baseQuery += ` AND orr.or_data BETWEEN '${sanitizeInput(dataDe)}' AND '${sanitizeInput(dataAte)}'`;
    } else if (dataDe) {
        baseQuery += ` AND orr.or_data >= '${sanitizeInput(dataDe)}'`;
    } else if (dataAte) {
        baseQuery += ` AND orr.or_data <= '${sanitizeInput(dataAte)}'`;
    }

    let dataQuery = `SELECT 
        orr.*,
        p.prod_nome,
        p.prod_sku,
        u.fullName as usuario_nome,
        f.fullName as funcionario_nome,
        (SELECT COUNT(*) ${baseQuery}) AS totalOrdens 
        ${baseQuery}`;

    if (sortBy) {
        dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        dataQuery += ` ORDER BY orr.created_at DESC`;
    }

    dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        const ordens = await dbQuery(dataQuery);

        for (let ordem of ordens) {
            let usuarioQuery = await dbQuery('SELECT * FROM User WHERE id = ?', [ordem.or_usuario_id]);
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
        console.error('Erro ao buscar ordens de retirada', error);
        res.status(500).json({ error });
    }
});

/**
 * GET /ordens-retirada/get/:id - Buscar ordem de retirada específica
 */
router.get('/get/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        let queryOrdem = `
            SELECT
                orr.*,
                p.prod_nome,
                p.prod_sku,
                p.prod_descricao,
                u.fullName as usuario_nome,
                f.fullName as funcionario_nome,
                f.email as funcionario_email
            FROM ORDENS_RETIRADA orr
            INNER JOIN PRODUTOS p ON orr.or_produto_id = p.prod_id
            LEFT JOIN User u ON orr.or_usuario_id = u.id
            LEFT JOIN User f ON orr.or_funcionario_id = f.id
            WHERE orr.or_id = ? AND orr.empresa_id = ?`;
        let ordemQuery = await dbQuery(queryOrdem, [id, empresa_id]);

        if (!ordemQuery || ordemQuery.length == 0) {
            return res.status(404).json({ message: 'Ordem de retirada não encontrada' });
        }

        const ordem = ordemQuery[0];

        res.status(200).json(ordem);
    } catch (error) {
        console.error('Erro ao buscar ordem de retirada', error);
        res.status(500).json({ error });
    }
});

/**
 * POST /ordens-retirada/create - Criar nova ordem de retirada
 * Atualiza a quantidade do produto (remove do estoque)
 */
router.post('/create', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const {
        or_produto_id,
        or_quantidade,
        or_data,
        or_motivo = null,
        or_funcionario_id = null,
        or_observacoes = null
    } = req.body;

    if (!or_produto_id || !or_quantidade || !or_data) {
        return res.status(400).json({ 
            message: 'Produto, quantidade e data são obrigatórios' 
        });
    }

    if (or_quantidade <= 0) {
        return res.status(400).json({ 
            message: 'A quantidade deve ser maior que zero' 
        });
    }

    try {
        // Verificar se o produto existe
        const produtoQuery = await dbQuery('SELECT * FROM PRODUTOS WHERE prod_id = ?', [or_produto_id]);
        if (!produtoQuery || produtoQuery.length === 0) {
            return res.status(404).json({ message: 'Produto não encontrado' });
        }

        const produto = produtoQuery[0];

        // Verificar se há quantidade suficiente em estoque
        if (parseInt(produto.prod_quantidade) < parseInt(or_quantidade)) {
            return res.status(400).json({ 
                message: `Quantidade insuficiente em estoque. Disponível: ${produto.prod_quantidade}, Solicitado: ${or_quantidade}` 
            });
        }

        // Criar ordem de retirada
        let query = `INSERT INTO ORDENS_RETIRADA (
            or_produto_id, or_quantidade, or_data, or_motivo,
            or_funcionario_id, or_observacoes, or_usuario_id, empresa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const result = await dbQuery(query, [
            or_produto_id,
            or_quantidade,
            moment(or_data).format('YYYY-MM-DD'),
            or_motivo,
            or_funcionario_id,
            or_observacoes,
            req.user ? req.user.id : null,
            empresa_id
        ]);

        // Atualizar quantidade do produto (remover do estoque)
        const novaQuantidade = parseInt(produto.prod_quantidade) - parseInt(or_quantidade);
        await dbQuery('UPDATE PRODUTOS SET prod_quantidade = ?, updated_at = NOW() WHERE prod_id = ?', 
            [novaQuantidade, or_produto_id]);

        res.status(201).json({ 
            message: 'Ordem de retirada cadastrada com sucesso',
            ordem_id: result.insertId
        });
    } catch (error) {
        console.error('Erro ao cadastrar ordem de retirada', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /ordens-retirada/update/:id - Atualizar ordem de retirada
 * ATENÇÃO: Atualizar uma ordem recalcula a quantidade do produto
 */
router.post('/update/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const {
        or_quantidade,
        or_data,
        or_motivo = null,
        or_funcionario_id = null,
        or_observacoes = null
    } = req.body;

    if (!or_quantidade || !or_data) {
        return res.status(400).json({ message: 'Quantidade e data são obrigatórios' });
    }

    if (or_quantidade <= 0) {
        return res.status(400).json({ 
            message: 'A quantidade deve ser maior que zero' 
        });
    }

    try {
        // Buscar ordem atual
        const ordemAtualQuery = await dbQuery('SELECT * FROM ORDENS_RETIRADA WHERE or_id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!ordemAtualQuery || ordemAtualQuery.length === 0) {
            return res.status(404).json({ message: 'Ordem de retirada não encontrada' });
        }

        const ordemAtual = ordemAtualQuery[0];
        const diferencaQuantidade = parseInt(or_quantidade) - parseInt(ordemAtual.or_quantidade);

        // Buscar produto
        const produtoQuery = await dbQuery('SELECT * FROM PRODUTOS WHERE prod_id = ?', [ordemAtual.or_produto_id]);
        if (!produtoQuery || produtoQuery.length === 0) {
            return res.status(404).json({ message: 'Produto não encontrado' });
        }

        const produto = produtoQuery[0];

        // Se aumentou a quantidade retirada, verificar se há estoque suficiente
        if (diferencaQuantidade > 0 && parseInt(produto.prod_quantidade) < diferencaQuantidade) {
            return res.status(400).json({ 
                message: `Quantidade insuficiente em estoque para esta alteração. Disponível: ${produto.prod_quantidade}` 
            });
        }

        // Atualizar ordem de retirada
        let updateQuery = `UPDATE ORDENS_RETIRADA SET 
            or_quantidade = ?, or_data = ?, or_motivo = ?,
            or_funcionario_id = ?, or_observacoes = ?,
            updated_at = NOW()
            WHERE or_id = ? AND empresa_id = ?`;

        await dbQuery(updateQuery, [
            or_quantidade,
            moment(or_data).format('YYYY-MM-DD'),
            or_motivo,
            or_funcionario_id,
            or_observacoes,
            id,
            empresa_id
        ]);

        // Atualizar quantidade do produto (diferença negativa = mais retirada, positiva = menos retirada)
        const novaQuantidade = parseInt(produto.prod_quantidade) - diferencaQuantidade;
        await dbQuery('UPDATE PRODUTOS SET prod_quantidade = ?, updated_at = NOW() WHERE prod_id = ?', 
            [novaQuantidade, ordemAtual.or_produto_id]);

        res.status(200).json({ message: 'Ordem de retirada atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar ordem de retirada', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /ordens-retirada/delete/:id - Deletar ordem de retirada
 * Devolve a quantidade ao estoque do produto
 */
router.delete('/delete/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        // Buscar ordem
        const ordemQuery = await dbQuery('SELECT * FROM ORDENS_RETIRADA WHERE or_id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!ordemQuery || ordemQuery.length === 0) {
            return res.status(404).json({ message: 'Ordem de retirada não encontrada' });
        }

        const ordem = ordemQuery[0];

        // Buscar produto
        const produtoQuery = await dbQuery('SELECT * FROM PRODUTOS WHERE prod_id = ?', [ordem.or_produto_id]);
        if (produtoQuery && produtoQuery.length > 0) {
            const produto = produtoQuery[0];
            
            // Devolver quantidade ao produto
            const novaQuantidade = parseInt(produto.prod_quantidade) + parseInt(ordem.or_quantidade);
            await dbQuery('UPDATE PRODUTOS SET prod_quantidade = ?, updated_at = NOW() WHERE prod_id = ?', 
                [novaQuantidade, ordem.or_produto_id]);
        }

        // Deletar ordem
        await dbQuery('DELETE FROM ORDENS_RETIRADA WHERE or_id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Ordem de retirada deletada com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar ordem de retirada', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /ordens-retirada/por-produto/:produto_id - Listar ordens de retirada de um produto específico
 */
router.get('/por-produto/:produto_id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { produto_id } = req.params;

    try {
        const ordens = await dbQuery(`
            SELECT
                orr.*,
                u.fullName as usuario_nome,
                f.fullName as funcionario_nome
            FROM ORDENS_RETIRADA orr
            LEFT JOIN User u ON orr.or_usuario_id = u.id
            LEFT JOIN User f ON orr.or_funcionario_id = f.id
            WHERE orr.or_produto_id = ? AND orr.empresa_id = ?
            ORDER BY orr.or_data DESC, orr.created_at DESC
        `, [produto_id, empresa_id]);

        res.status(200).json(ordens);
    } catch (error) {
        console.error('Erro ao buscar ordens de retirada do produto', error);
        res.status(500).json({ error });
    }
});

/**
 * GET /ordens-retirada/por-funcionario/:funcionario_id - Listar ordens de retirada de um funcionário específico
 */
router.get('/por-funcionario/:funcionario_id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { funcionario_id } = req.params;

    try {
        const ordens = await dbQuery(`
            SELECT
                orr.*,
                p.prod_nome,
                p.prod_sku,
                u.fullName as usuario_nome
            FROM ORDENS_RETIRADA orr
            INNER JOIN PRODUTOS p ON orr.or_produto_id = p.prod_id
            LEFT JOIN User u ON orr.or_usuario_id = u.id
            WHERE orr.or_funcionario_id = ? AND orr.empresa_id = ?
            ORDER BY orr.or_data DESC, orr.created_at DESC
        `, [funcionario_id, empresa_id]);

        res.status(200).json(ordens);
    } catch (error) {
        console.error('Erro ao buscar ordens de retirada do funcionário', error);
        res.status(500).json({ error });
    }
});

module.exports = router;

