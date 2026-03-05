const express = require('express');
const router = express.Router();
const moment = require('moment');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const { sanitizeInput } = require('../utils/functions');

/**
 * GET /setores/list - Listar setores com filtros
 * Query params: q (busca), sortBy, itemsPerPage, page, orderBy, ativo
 */
router.get('/list', async (req, res) => {
    let {
        q = '',
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc',
        ativo = null
    } = req.query;

    const empresa_id = req.user.empresa_id;
    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == '-1') {
        offset = 0;
        itemsPerPage = 1000000;
    }

    let baseQuery = `FROM SETORES WHERE empresa_id = ${parseInt(empresa_id)}`;
    
    // Filtro de busca por nome ou descrição
    if (q) {
        baseQuery += ` AND (set_nome LIKE '%${sanitizeInput(q)}%' OR set_descricao LIKE '%${sanitizeInput(q)}%')`;
    }

    // Filtro por status ativo/inativo
    if (ativo != null && ativo != '') {
        baseQuery += ` AND set_ativo = ${ativo}`;
    }

    let dataQuery = `SELECT *,(SELECT COUNT(*) ${baseQuery}) AS totalSetores ${baseQuery}`;

    if (sortBy) {
        dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        dataQuery += ` ORDER BY SETORES.created_at DESC`;
    }

    dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        const setores = await dbQuery(dataQuery);

        // Adicionar contagem de produtos por setor
        for (let setor of setores) {
            const countQuery = await dbQuery('SELECT COUNT(*) as total FROM PRODUTOS WHERE prod_setor_id = ? AND empresa_id = ?', [setor.set_id, empresa_id]);
            setor.total_produtos = countQuery[0].total;
        }

        let data = {
            setores: setores,
            totalSetores: setores.length > 0 ? setores[0].totalSetores : 0
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar setores', error);
        res.status(500).json({ error });
    }
});

/**
 * GET /setores/get/:id - Buscar setor específico
 */
router.get('/get/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        let querySetor = `SELECT * FROM SETORES WHERE set_id = ? AND empresa_id = ?`;
        let setorQuery = await dbQuery(querySetor, [id, empresa_id]);

        if (!setorQuery || setorQuery.length == 0) {
            return res.status(404).json({ message: 'Setor não encontrado' });
        }

        const setor = setorQuery[0];

        // Adicionar contagem de produtos
        const countQuery = await dbQuery('SELECT COUNT(*) as total FROM PRODUTOS WHERE prod_setor_id = ? AND empresa_id = ?', [setor.set_id, empresa_id]);
        setor.total_produtos = countQuery[0].total;

        res.status(200).json(setor);
    } catch (error) {
        console.error('Erro ao buscar setor', error);
        res.status(500).json({ error });
    }
});

/**
 * POST /setores/create - Criar novo setor
 */
router.post('/create', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const {
        set_nome,
        set_descricao = null,
        set_ativo = 1
    } = req.body;

    if (!set_nome) {
        return res.status(400).json({
            message: 'O nome do setor é obrigatório'
        });
    }

    try {
        let query = `INSERT INTO SETORES (set_nome, set_descricao, set_ativo, empresa_id) VALUES (?, ?, ?, ?)`;

        await dbQuery(query, [set_nome, set_descricao, set_ativo, empresa_id]);

        res.status(201).json({ message: 'Setor cadastrado com sucesso' });
    } catch (error) {
        console.error('Erro ao cadastrar setor', error);
        res.status(500).json({ error });
    }
});

/**
 * POST /setores/update/:id - Atualizar setor
 */
router.post('/update/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;
    const {
        set_nome,
        set_descricao = null,
        set_ativo = 1
    } = req.body;

    if (!set_nome) {
        return res.status(400).json({ message: 'Nome do setor é obrigatório' });
    }

    try {
        // Verificar se o setor existe
        let checkQuery = `SELECT * FROM SETORES WHERE set_id = ? AND empresa_id = ?`;
        let existingSetor = await dbQuery(checkQuery, [id, empresa_id]);

        if (existingSetor && existingSetor.length > 0) {
            // Atualizar setor existente
            let updateQuery = `UPDATE SETORES SET set_nome = ?, set_descricao = ?, set_ativo = ?, updated_at = NOW() WHERE set_id = ? AND empresa_id = ?`;
            await dbQuery(updateQuery, [set_nome, set_descricao, set_ativo, id, empresa_id]);
            res.status(200).json({ message: 'Setor atualizado com sucesso' });
        } else {
            // Criar novo setor
            let insertQuery = `INSERT INTO SETORES (set_nome, set_descricao, set_ativo, empresa_id) VALUES (?, ?, ?, ?)`;
            await dbQuery(insertQuery, [set_nome, set_descricao, set_ativo, empresa_id]);
            res.status(201).json({ message: 'Setor criado com sucesso' });
        }
    } catch (error) {
        console.error('Erro ao atualizar setor', error);
        res.status(500).json({ error });
    }
});

/**
 * DELETE /setores/delete/:id - Deletar setor
 * Verifica se existem produtos associados antes de deletar
 */
router.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        // Verificar se existem produtos neste setor
        const produtosQuery = await dbQuery('SELECT COUNT(*) as total FROM PRODUTOS WHERE prod_setor_id = ? AND empresa_id = ?', [id, empresa_id]);

        if (produtosQuery[0].total > 0) {
            return res.status(400).json({
                message: `Não é possível deletar este setor pois existem ${produtosQuery[0].total} produto(s) associado(s). Remova os produtos primeiro.`
            });
        }

        await dbQuery('DELETE FROM SETORES WHERE set_id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Setor deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar setor', error);
        res.status(500).json({ error });
    }
});

/**
 * GET /setores/all - Listar todos os setores ativos (para dropdowns)
 */
router.get('/all', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    try {
        const setores = await dbQuery('SELECT set_id, set_nome FROM SETORES WHERE set_ativo = 1 AND empresa_id = ? ORDER BY set_nome ASC', [empresa_id]);
        res.status(200).json(setores);
    } catch (error) {
        console.error('Erro ao buscar setores', error);
        res.status(500).json({ error });
    }
});

module.exports = router;

