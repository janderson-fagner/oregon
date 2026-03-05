/**
 * Rotas de Modelos de Orçamento - CRUD de modelos reutilizáveis
 * Todas as rotas são autenticadas via getUserLoggedUser
 */

const express = require('express');
const router = express.Router();

const dbQuery = require('../database');

/**
 * GET /orcamento-modelos/list - Lista modelos com filtro
 */
router.get('/list', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { q = '', ativo = '1', tipo } = req.query;

    let where = 'WHERE empresa_id = ? AND ativo = ?';
    const params = [empresa_id, parseInt(ativo)];

    if (q) {
      where += ' AND titulo LIKE ?';
      params.push(`%${q}%`);
    }

    if (tipo) {
      where += ' AND tipo = ?';
      params.push(tipo);
    }

    const modelos = await dbQuery(
      `SELECT id, titulo, descricao, tipo, ativo, created_at, updated_at
       FROM Orcamento_Modelos ${where}
       ORDER BY updated_at DESC`,
      params
    );

    return res.json(modelos);
  } catch (error) {
    console.error('[Orcamento Modelos] Erro ao listar:', error);
    return res.status(500).json({ message: 'Erro ao listar modelos' });
  }
});

/**
 * GET /orcamento-modelos/get/:id - Busca modelo com conteúdo HTML
 */
router.get('/get/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const modelo = await dbQuery(
      'SELECT * FROM Orcamento_Modelos WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );

    if (modelo.length === 0) {
      return res.status(404).json({ message: 'Modelo não encontrado' });
    }

    return res.json(modelo[0]);
  } catch (error) {
    console.error('[Orcamento Modelos] Erro ao buscar:', error);
    return res.status(500).json({ message: 'Erro ao buscar modelo' });
  }
});

/**
 * POST /orcamento-modelos/create - Criar modelo
 */
router.post('/create', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { titulo, descricao, tipo, conteudo_html } = req.body;

    if (!titulo) {
      return res.status(400).json({ message: 'Título é obrigatório' });
    }

    const result = await dbQuery(
      `INSERT INTO Orcamento_Modelos (titulo, descricao, tipo, conteudo_html, created_by, empresa_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [titulo, descricao || null, tipo || 'geral', conteudo_html || null, req.user?.id || null, empresa_id]
    );

    return res.json({ message: 'Modelo criado com sucesso', id: result.insertId });
  } catch (error) {
    console.error('[Orcamento Modelos] Erro ao criar:', error);
    return res.status(500).json({ message: 'Erro ao criar modelo' });
  }
});

/**
 * PUT /orcamento-modelos/update/:id - Atualizar modelo
 */
router.put('/update/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { titulo, descricao, tipo, conteudo_html } = req.body;

    await dbQuery(
      `UPDATE Orcamento_Modelos SET titulo = ?, descricao = ?, tipo = ?, conteudo_html = ?
       WHERE id = ? AND empresa_id = ?`,
      [titulo || null, descricao || null, tipo || 'geral', conteudo_html || null, id, empresa_id]
    );

    return res.json({ message: 'Modelo atualizado com sucesso' });
  } catch (error) {
    console.error('[Orcamento Modelos] Erro ao atualizar:', error);
    return res.status(500).json({ message: 'Erro ao atualizar modelo' });
  }
});

/**
 * DELETE /orcamento-modelos/delete/:id - Soft-delete (ativo=0)
 */
router.delete('/delete/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    await dbQuery(
      'UPDATE Orcamento_Modelos SET ativo = 0 WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );

    return res.json({ message: 'Modelo removido com sucesso' });
  } catch (error) {
    console.error('[Orcamento Modelos] Erro ao remover:', error);
    return res.status(500).json({ message: 'Erro ao remover modelo' });
  }
});

module.exports = router;
