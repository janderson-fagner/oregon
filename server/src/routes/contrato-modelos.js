/**
 * Rotas de Modelos de Contrato - CRUD de modelos reutilizáveis
 * Todas as rotas são autenticadas via getUserLoggedUser
 */

const express = require('express');
const router = express.Router();

const dbQuery = require('../database');

/**
 * GET /contrato-modelos/list - Lista modelos com filtro
 */
router.get('/list', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { q = '', ativo = '1' } = req.query;

    let where = 'WHERE empresa_id = ? AND ativo = ?';
    const params = [empresa_id, parseInt(ativo)];

    if (q) {
      where += ' AND titulo LIKE ?';
      params.push(`%${q}%`);
    }

    const modelos = await dbQuery(
      `SELECT id, titulo, ativo, created_at, updated_at
       FROM CONTRATO_MODELOS ${where}
       ORDER BY updated_at DESC`,
      params
    );

    return res.json(modelos);
  } catch (error) {
    console.error('[Contrato Modelos] Erro ao listar:', error);
    return res.status(500).json({ message: 'Erro ao listar modelos' });
  }
});

/**
 * GET /contrato-modelos/get/:id - Busca modelo com conteúdo HTML
 */
router.get('/get/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const modelo = await dbQuery(
      'SELECT * FROM CONTRATO_MODELOS WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );

    if (modelo.length === 0) {
      return res.status(404).json({ message: 'Modelo não encontrado' });
    }

    return res.json(modelo[0]);
  } catch (error) {
    console.error('[Contrato Modelos] Erro ao buscar:', error);
    return res.status(500).json({ message: 'Erro ao buscar modelo' });
  }
});

/**
 * POST /contrato-modelos/create - Criar modelo
 */
router.post('/create', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { titulo, conteudo_html } = req.body;

    if (!titulo) {
      return res.status(400).json({ message: 'Título é obrigatório' });
    }

    const result = await dbQuery(
      `INSERT INTO CONTRATO_MODELOS (titulo, conteudo_html, created_by, empresa_id)
       VALUES (?, ?, ?, ?)`,
      [titulo, conteudo_html || null, req.user?.id || null, empresa_id]
    );

    return res.json({ message: 'Modelo criado com sucesso', id: result.insertId });
  } catch (error) {
    console.error('[Contrato Modelos] Erro ao criar:', error);
    return res.status(500).json({ message: 'Erro ao criar modelo' });
  }
});

/**
 * PUT /contrato-modelos/update/:id - Atualizar modelo
 */
router.put('/update/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { titulo, conteudo_html } = req.body;

    await dbQuery(
      `UPDATE CONTRATO_MODELOS SET titulo = ?, conteudo_html = ?
       WHERE id = ? AND empresa_id = ?`,
      [titulo || null, conteudo_html || null, id, empresa_id]
    );

    return res.json({ message: 'Modelo atualizado com sucesso' });
  } catch (error) {
    console.error('[Contrato Modelos] Erro ao atualizar:', error);
    return res.status(500).json({ message: 'Erro ao atualizar modelo' });
  }
});

/**
 * DELETE /contrato-modelos/delete/:id - Soft-delete (ativo=0)
 */
router.delete('/delete/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    await dbQuery(
      'UPDATE CONTRATO_MODELOS SET ativo = 0 WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );

    return res.json({ message: 'Modelo removido com sucesso' });
  } catch (error) {
    console.error('[Contrato Modelos] Erro ao remover:', error);
    return res.status(500).json({ message: 'Erro ao remover modelo' });
  }
});

module.exports = router;
