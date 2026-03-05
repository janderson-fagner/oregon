const express = require('express');
const router = express.Router();
const moment = require('moment');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const { sanitizeInput } = require('../utils/functions');

// GET /estoque/list - Listar produtos com filtros
router.get('/list', async (req, res) => {
    let {
        q = '',
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc',
        ativo = null,
        estoqueBaixo = false,
        quantidadeMin = null,
        quantidadeMax = null,
        setorId = null
    } = req.query;

    const empresa_id = req.user.empresa_id;
    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    let baseQuery = `FROM PRODUTOS WHERE empresa_id = ${parseInt(empresa_id)}`;
    
    // Filtro de busca por nome, descrição ou valor
    if (q != null && q != '') {
        baseQuery += ` AND (prod_nome LIKE '%${sanitizeInput(q)}%' OR prod_descricao LIKE '%${sanitizeInput(q)}%' OR prod_valor LIKE '%${sanitizeInput(q)}%')`;
    }

    // Filtro por status ativo/inativo
    if (ativo != null && ativo != '') {
        baseQuery += ` AND prod_ativo = ${ativo}`;
    }

    // Filtro por setor
    if (setorId != null && setorId != '') {
        baseQuery += ` AND prod_setor_id = ${parseInt(setorId)}`;
    }

    // Filtro por estoque baixo
    if (estoqueBaixo === 'true' || estoqueBaixo === true) {
        baseQuery += ` AND prod_quantidade < prod_limiar`;
    }

    // Filtro por quantidade mínima
    if (quantidadeMin != null && quantidadeMin != '') {
        baseQuery += ` AND prod_quantidade >= ${parseInt(quantidadeMin)}`;
    }

    // Filtro por quantidade máxima
    if (quantidadeMax != null && quantidadeMax != '') {
        baseQuery += ` AND prod_quantidade <= ${parseInt(quantidadeMax)}`;
    }

    console.log('BaseQuery', baseQuery);

    let dataQuery = `SELECT *,(SELECT COUNT(*) ${baseQuery}) AS totalProdutos ${baseQuery}`;

    if (sortBy) {
        dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        dataQuery += ` ORDER BY PRODUTOS.created_at DESC`;
    }

    dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        const produtos = await dbQuery(dataQuery);

        // Adicionar verificação de limiar
        for (let produto of produtos) {
            produto.estoque_baixo = produto.prod_quantidade < produto.prod_limiar;
            let setorQuery = await dbQuery('SELECT * FROM SETORES WHERE set_id = ? AND empresa_id = ?', [produto.prod_setor_id, empresa_id]);
            if (setorQuery.length > 0) {
                produto.setor = setorQuery[0];
            }
        }

        let data = {
            produtos: produtos,
            totalProdutos: produtos.length > 0 ? produtos[0].totalProdutos : 0
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar produtos', error);
        res.status(500).json({ error });
    }
});

// GET /estoque/get/:id - Buscar produto específico
router.get('/get/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        let queryProduto = `
            SELECT p.*, s.set_nome
            FROM PRODUTOS p
            LEFT JOIN SETORES s ON p.prod_setor_id = s.set_id
            WHERE p.prod_id = ? AND p.empresa_id = ?`;
        let produtoQuery = await dbQuery(queryProduto, [id, empresa_id]);

        if (!produtoQuery || produtoQuery.length == 0) {
            return res.status(404).json({ message: 'Produto não encontrado' });
        }

        const produto = produtoQuery[0];
        produto.estoque_baixo = produto.prod_quantidade < produto.prod_limiar;

        res.status(200).json(produto);
    } catch (error) {
        console.error('Erro ao buscar produto', error);
        res.status(500).json({ error });
    }
});

// POST /estoque/create - Criar novo produto
router.post('/create', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const {
        prod_nome,
        prod_descricao = null,
        prod_valor,
        prod_quantidade = 0,
        prod_limiar = 0,
        prod_fotos = null,
        prod_sku = null,
        prod_fornecedor = null,
        prod_setor_id = null,
        prod_prateleira = null,
        prod_secao = null,
        prod_case = null,
        prod_caixa = null,
        prod_lote = null,
        prod_observacoes = null,
        prod_info_adicional = null
    } = req.body;

    if (!prod_nome || !prod_valor) {
        return res.status(400).json({
            message: `Preencha ${!prod_nome ? 'o nome' : 'o valor'} do produto`
        });
    }

    try {
        let query = `INSERT INTO PRODUTOS (
            prod_nome, prod_descricao, prod_valor, prod_quantidade, prod_limiar, prod_fotos,
            prod_sku, prod_fornecedor, prod_setor_id, prod_prateleira, prod_secao,
            prod_case, prod_caixa, prod_lote, prod_observacoes, prod_info_adicional, empresa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await dbQuery(query, [
            prod_nome, prod_descricao, prod_valor, prod_quantidade, prod_limiar, prod_fotos,
            prod_sku, prod_fornecedor, prod_setor_id, prod_prateleira, prod_secao,
            prod_case, prod_caixa, prod_lote, prod_observacoes, prod_info_adicional, empresa_id
        ]);

        res.status(201).json({ message: 'Produto cadastrado com sucesso' });
    } catch (error) {
        console.error('Erro ao cadastrar produto', error);
        res.status(500).json({ error });
    }
});

// POST /estoque/update/:id - Atualizar produto (upsert)
router.post('/update/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;
    const {
        prod_nome,
        prod_descricao = null,
        prod_valor,
        prod_quantidade = 0,
        prod_limiar = 0,
        prod_fotos = null,
        prod_ativo = 1,
        prod_sku = null,
        prod_fornecedor = null,
        prod_setor_id = null,
        prod_prateleira = null,
        prod_secao = null,
        prod_case = null,
        prod_caixa = null,
        prod_lote = null,
        prod_observacoes = null,
        prod_info_adicional = null
    } = req.body;

    if (!prod_nome || !prod_valor) {
        return res.status(400).json({ message: 'Nome e valor são obrigatórios' });
    }

    try {
        // Verificar se o produto existe
        let checkQuery = `SELECT * FROM PRODUTOS WHERE prod_id = ? AND empresa_id = ?`;
        let existingProduto = await dbQuery(checkQuery, [id, empresa_id]);

        if (existingProduto && existingProduto.length > 0) {
            // Atualizar produto existente (não atualiza quantidade aqui, apenas via ordens)
            let updateQuery = `UPDATE PRODUTOS SET
                prod_nome = ?, prod_descricao = ?, prod_valor = ?, prod_limiar = ?,
                prod_fotos = ?, prod_ativo = ?, prod_sku = ?, prod_fornecedor = ?,
                prod_setor_id = ?, prod_prateleira = ?, prod_secao = ?, prod_case = ?,
                prod_caixa = ?, prod_lote = ?, prod_observacoes = ?, prod_info_adicional = ?,
                updated_at = NOW()
                WHERE prod_id = ? AND empresa_id = ?`;
            await dbQuery(updateQuery, [
                prod_nome, prod_descricao, prod_valor, prod_limiar, prod_fotos, prod_ativo,
                prod_sku, prod_fornecedor, prod_setor_id, prod_prateleira, prod_secao,
                prod_case, prod_caixa, prod_lote, prod_observacoes, prod_info_adicional, id, empresa_id
            ]);
            res.status(200).json({ message: 'Produto atualizado com sucesso' });
        } else {
            // Criar novo produto
            let insertQuery = `INSERT INTO PRODUTOS (
                prod_nome, prod_descricao, prod_valor, prod_quantidade, prod_limiar, prod_fotos, prod_ativo,
                prod_sku, prod_fornecedor, prod_setor_id, prod_prateleira, prod_secao,
                prod_case, prod_caixa, prod_lote, prod_observacoes, prod_info_adicional, empresa_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            await dbQuery(insertQuery, [
                prod_nome, prod_descricao, prod_valor, prod_quantidade, prod_limiar, prod_fotos, prod_ativo,
                prod_sku, prod_fornecedor, prod_setor_id, prod_prateleira, prod_secao,
                prod_case, prod_caixa, prod_lote, prod_observacoes, prod_info_adicional, empresa_id
            ]);
            res.status(201).json({ message: 'Produto criado com sucesso' });
        }
    } catch (error) {
        console.error('Erro ao atualizar produto', error);
        res.status(500).json({ error });
    }
});

// DELETE /estoque/delete/:id - Deletar produto
router.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery('DELETE FROM PRODUTOS WHERE prod_id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Produto deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar produto', error);
        res.status(500).json({ error });
    }
});

// PUT /estoque/update-quantity/:id - ROTA REMOVIDA - Use ordens de entrada/retirada
// A quantidade agora é gerenciada apenas via ordens de entrada e retirada

// GET /estoque/baixo-estoque - Listar produtos com estoque baixo
router.get('/baixo-estoque', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    try {
        let query = `SELECT * FROM PRODUTOS WHERE prod_quantidade < prod_limiar AND prod_ativo = 1 AND empresa_id = ? ORDER BY (prod_quantidade - prod_limiar) ASC`;

        const produtos = await dbQuery(query, [empresa_id]);

        res.status(200).json({ produtos });
    } catch (error) {
        console.error('Erro ao buscar produtos com estoque baixo', error);
        res.status(500).json({ error });
    }
});

module.exports = router;
