/**
 * Rotas do Centro de Ajuda (Help Center)
 * Gerencia tópicos, subtópicos e posts de ajuda
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const dbQuery = require('../database');
const { getUserLoggedUser } = require('../utils/functions');

// ============================================
// MIDDLEWARE DE VERIFICAÇÃO DE ADMIN
// ============================================
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
};

// ============================================
// CONFIGURAÇÃO DO MULTER PARA UPLOAD DE IMAGENS
// ============================================
const uploadDir = path.join(__dirname, '../uploads/help-center');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens são permitidas.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ============================================
// HELPERS
// ============================================

/** Gera slug a partir de um texto */
const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

/** Extrai resumo do HTML (primeiros 200 chars sem tags) */
const extractResumo = (html) => {
  if (!html) return '';
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text.substring(0, 200);
};

// ============================================
// ROTAS ADMIN - TÓPICOS
// ============================================

/** GET /help-center/admin/topics - Listar todos os tópicos (incl. inativos) */
router.get('/admin/topics', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const topics = await dbQuery('SELECT * FROM HELP_TOPICS ORDER BY ordem ASC, id ASC');
    res.json(topics);
  } catch (error) {
    console.error('Erro ao listar tópicos:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /help-center/admin/topics - Criar tópico */
router.post('/admin/topics', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { nome, icone, descricao, ordem } = req.body;
    const slug = generateSlug(nome);
    const result = await dbQuery(
      'INSERT INTO HELP_TOPICS (nome, slug, icone, descricao, ordem) VALUES (?, ?, ?, ?, ?)',
      [nome, slug, icone, descricao, ordem || 0]
    );
    res.json({ id: result.insertId, nome, slug, icone, descricao, ordem: ordem || 0 });
  } catch (error) {
    console.error('Erro ao criar tópico:', error);
    res.status(500).json({ error: error.message });
  }
});

/** PUT /help-center/admin/topics/:id - Atualizar tópico */
router.put('/admin/topics/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { nome, icone, descricao, ordem } = req.body;
    const slug = generateSlug(nome);
    await dbQuery(
      'UPDATE HELP_TOPICS SET nome=?, slug=?, icone=?, descricao=?, ordem=? WHERE id=?',
      [nome, slug, icone, descricao, ordem || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar tópico:', error);
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /help-center/admin/topics/:id - Soft-delete tópico */
router.delete('/admin/topics/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    await dbQuery('UPDATE HELP_TOPICS SET ativo=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir tópico:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS ADMIN - SUBTÓPICOS
// ============================================

/** GET /help-center/admin/subtopics - Listar subtópicos (?topic_id) */
router.get('/admin/subtopics', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    let sql = `SELECT s.*, t.nome AS topic_nome
               FROM HELP_SUBTOPICS s
               LEFT JOIN HELP_TOPICS t ON t.id = s.topic_id`;
    const params = [];

    if (req.query.topic_id) {
      sql += ' WHERE s.topic_id = ?';
      params.push(req.query.topic_id);
    }

    sql += ' ORDER BY s.ordem ASC, s.id ASC';
    const subtopics = await dbQuery(sql, params);
    res.json(subtopics);
  } catch (error) {
    console.error('Erro ao listar subtópicos:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /help-center/admin/subtopics - Criar subtópico */
router.post('/admin/subtopics', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { nome, topic_id, descricao, ordem } = req.body;
    const slug = generateSlug(nome);
    const result = await dbQuery(
      'INSERT INTO HELP_SUBTOPICS (nome, slug, topic_id, descricao, ordem) VALUES (?, ?, ?, ?, ?)',
      [nome, slug, topic_id, descricao, ordem || 0]
    );
    res.json({ id: result.insertId, nome, slug, topic_id, descricao, ordem: ordem || 0 });
  } catch (error) {
    console.error('Erro ao criar subtópico:', error);
    res.status(500).json({ error: error.message });
  }
});

/** PUT /help-center/admin/subtopics/:id - Atualizar subtópico */
router.put('/admin/subtopics/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { nome, topic_id, descricao, ordem } = req.body;
    const slug = generateSlug(nome);
    await dbQuery(
      'UPDATE HELP_SUBTOPICS SET nome=?, slug=?, topic_id=?, descricao=?, ordem=? WHERE id=?',
      [nome, slug, topic_id, descricao, ordem || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar subtópico:', error);
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /help-center/admin/subtopics/:id - Soft-delete subtópico */
router.delete('/admin/subtopics/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    await dbQuery('UPDATE HELP_SUBTOPICS SET ativo=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir subtópico:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS ADMIN - POSTS
// ============================================

/** GET /help-center/admin/posts - Listar posts (paginado, filtros) */
router.get('/admin/posts', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { topic_id, subtopic_id, status, q, page = 1, itemsPerPage = 10 } = req.query;
    const limit = parseInt(itemsPerPage);
    const offset = (parseInt(page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (topic_id) {
      whereClauses.push('p.topic_id = ?');
      params.push(topic_id);
    }
    if (subtopic_id) {
      whereClauses.push('p.subtopic_id = ?');
      params.push(subtopic_id);
    }
    if (status) {
      whereClauses.push('p.status = ?');
      params.push(status);
    }
    if (q) {
      whereClauses.push('(p.titulo LIKE ? OR p.resumo LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countSql = `SELECT COUNT(*) as total FROM HELP_POSTS p ${where}`;
    const countResult = await dbQuery(countSql, params);
    const total = countResult[0].total;

    const sql = `SELECT p.*, t.nome AS topic_nome, st.nome AS subtopic_nome
                 FROM HELP_POSTS p
                 LEFT JOIN HELP_TOPICS t ON t.id = p.topic_id
                 LEFT JOIN HELP_SUBTOPICS st ON st.id = p.subtopic_id
                 ${where}
                 ORDER BY p.ordem ASC, p.id DESC
                 LIMIT ? OFFSET ?`;

    const posts = await dbQuery(sql, [...params, limit, offset]);

    res.json({ posts, total });
  } catch (error) {
    console.error('Erro ao listar posts:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /help-center/admin/posts/:id - Post completo */
router.get('/admin/posts/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const posts = await dbQuery(
      `SELECT p.*, t.nome AS topic_nome, st.nome AS subtopic_nome
       FROM HELP_POSTS p
       LEFT JOIN HELP_TOPICS t ON t.id = p.topic_id
       LEFT JOIN HELP_SUBTOPICS st ON st.id = p.subtopic_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!posts.length) return res.status(404).json({ error: 'Post não encontrado' });
    res.json(posts[0]);
  } catch (error) {
    console.error('Erro ao buscar post:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /help-center/admin/posts - Criar post */
router.post('/admin/posts', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { titulo, conteudo_html, topic_id, subtopic_id, status, ordem } = req.body;
    const slug = generateSlug(titulo);
    const resumo = extractResumo(conteudo_html);
    const result = await dbQuery(
      `INSERT INTO HELP_POSTS (titulo, slug, conteudo_html, resumo, topic_id, subtopic_id, status, ordem, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [titulo, slug, conteudo_html, resumo, topic_id || null, subtopic_id || null, status || 'draft', ordem || 0, req.user.id]
    );
    res.json({ id: result.insertId });
  } catch (error) {
    console.error('Erro ao criar post:', error);
    res.status(500).json({ error: error.message });
  }
});

/** PUT /help-center/admin/posts/:id - Atualizar post */
router.put('/admin/posts/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { titulo, conteudo_html, topic_id, subtopic_id, status, ordem } = req.body;
    const slug = generateSlug(titulo);
    const resumo = extractResumo(conteudo_html);
    await dbQuery(
      `UPDATE HELP_POSTS SET titulo=?, slug=?, conteudo_html=?, resumo=?, topic_id=?, subtopic_id=?, status=?, ordem=? WHERE id=?`,
      [titulo, slug, conteudo_html, resumo, topic_id || null, subtopic_id || null, status || 'draft', ordem || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar post:', error);
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /help-center/admin/posts/:id - Soft-delete post */
router.delete('/admin/posts/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    await dbQuery('UPDATE HELP_POSTS SET ativo=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir post:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /help-center/admin/upload-image - Upload de imagem */
router.post('/admin/upload-image', getUserLoggedUser, isAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }
    const url = `/uploads/help-center/${req.file.filename}`;
    res.json({ url });
  } catch (error) {
    console.error('Erro ao fazer upload de imagem:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS PÚBLICAS (apenas autenticado)
// ============================================

/** GET /help-center/topics - Tópicos ativos + subtópicos + contagem de posts */
router.get('/topics', getUserLoggedUser, async (req, res) => {
  try {
    const topics = await dbQuery(
      `SELECT t.*,
        (SELECT COUNT(*) FROM HELP_POSTS p WHERE p.topic_id = t.id AND p.status = 'published' AND p.ativo = 1) AS post_count
       FROM HELP_TOPICS t
       WHERE t.ativo = 1
       ORDER BY t.ordem ASC, t.id ASC`
    );

    const subtopics = await dbQuery(
      `SELECT s.*,
        (SELECT COUNT(*) FROM HELP_POSTS p WHERE p.subtopic_id = s.id AND p.status = 'published' AND p.ativo = 1) AS post_count
       FROM HELP_SUBTOPICS s
       WHERE s.ativo = 1
       ORDER BY s.ordem ASC, s.id ASC`
    );

    // Agrupa subtópicos nos tópicos
    const result = topics.map(t => ({
      ...t,
      subtopics: subtopics.filter(s => s.topic_id === t.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('Erro ao listar tópicos públicos:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /help-center/posts - Posts publicados (?topic_id, ?subtopic_id, ?q) */
router.get('/posts', getUserLoggedUser, async (req, res) => {
  try {
    const { topic_id, subtopic_id, q } = req.query;
    let whereClauses = ["p.status = 'published'", "p.ativo = 1"];
    let params = [];

    if (topic_id) {
      whereClauses.push('p.topic_id = ?');
      params.push(topic_id);
    }
    if (subtopic_id) {
      whereClauses.push('p.subtopic_id = ?');
      params.push(subtopic_id);
    }
    if (q) {
      whereClauses.push('(p.titulo LIKE ? OR p.resumo LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const where = 'WHERE ' + whereClauses.join(' AND ');

    const sql = `SELECT p.id, p.titulo, p.slug, p.resumo, p.topic_id, p.subtopic_id, p.views, p.created_at,
                        t.nome AS topic_nome, st.nome AS subtopic_nome
                 FROM HELP_POSTS p
                 LEFT JOIN HELP_TOPICS t ON t.id = p.topic_id
                 LEFT JOIN HELP_SUBTOPICS st ON st.id = p.subtopic_id
                 ${where}
                 ORDER BY p.ordem ASC, p.id DESC`;

    const posts = await dbQuery(sql, params);
    res.json(posts);
  } catch (error) {
    console.error('Erro ao listar posts públicos:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /help-center/posts/:id - Post único (incrementa views) */
router.get('/posts/:id', getUserLoggedUser, async (req, res) => {
  try {
    await dbQuery('UPDATE HELP_POSTS SET views = views + 1 WHERE id = ?', [req.params.id]);

    const posts = await dbQuery(
      `SELECT p.*, t.nome AS topic_nome, t.icone AS topic_icone, st.nome AS subtopic_nome
       FROM HELP_POSTS p
       LEFT JOIN HELP_TOPICS t ON t.id = p.topic_id
       LEFT JOIN HELP_SUBTOPICS st ON st.id = p.subtopic_id
       WHERE p.id = ? AND p.status = 'published' AND p.ativo = 1`,
      [req.params.id]
    );

    if (!posts.length) return res.status(404).json({ error: 'Post não encontrado' });
    res.json(posts[0]);
  } catch (error) {
    console.error('Erro ao buscar post público:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /help-center/search?q= - Busca FULLTEXT + fallback LIKE */
router.get('/search', getUserLoggedUser, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    // Tenta FULLTEXT primeiro
    let posts = await dbQuery(
      `SELECT p.id, p.titulo, p.slug, p.resumo, p.topic_id, p.subtopic_id, p.views, p.created_at,
              t.nome AS topic_nome, st.nome AS subtopic_nome,
              MATCH(p.titulo, p.conteudo_html, p.resumo) AGAINST(? IN BOOLEAN MODE) AS relevance
       FROM HELP_POSTS p
       LEFT JOIN HELP_TOPICS t ON t.id = p.topic_id
       LEFT JOIN HELP_SUBTOPICS st ON st.id = p.subtopic_id
       WHERE p.status = 'published' AND p.ativo = 1
         AND MATCH(p.titulo, p.conteudo_html, p.resumo) AGAINST(? IN BOOLEAN MODE)
       ORDER BY relevance DESC
       LIMIT 20`,
      [q, q]
    );

    // Fallback LIKE se FULLTEXT não retornar resultados
    if (!posts.length) {
      posts = await dbQuery(
        `SELECT p.id, p.titulo, p.slug, p.resumo, p.topic_id, p.subtopic_id, p.views, p.created_at,
                t.nome AS topic_nome, st.nome AS subtopic_nome
         FROM HELP_POSTS p
         LEFT JOIN HELP_TOPICS t ON t.id = p.topic_id
         LEFT JOIN HELP_SUBTOPICS st ON st.id = p.subtopic_id
         WHERE p.status = 'published' AND p.ativo = 1
           AND (p.titulo LIKE ? OR p.resumo LIKE ?)
         ORDER BY p.titulo ASC
         LIMIT 20`,
        [`%${q}%`, `%${q}%`]
      );
    }

    res.json(posts);
  } catch (error) {
    console.error('Erro ao buscar posts:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
