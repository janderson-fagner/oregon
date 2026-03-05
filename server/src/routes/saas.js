/**
 * Rotas do módulo SaaS - Sistema de Assinaturas
 * Gerencia empresas, planos, assinaturas e integração com Asaas
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const dbQuery = require('../database');
const asaasService = require('../services/asaasService');
const { seedEmpresaData } = require('../services/empresaSeedService');
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
// ROTAS DE CONFIGURAÇÃO ASAAS
// ============================================

/**
 * GET /saas/config - Obtém as configurações do Asaas
 * Requer: Admin
 */
router.get('/config', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const config = await asaasService.getAsaasConfig();
    res.json(config);
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/config - Salva as configurações do Asaas
 * Requer: Admin
 * Body: { apiKey?, apiUrl? }
 */
router.post('/config', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body;

    if (apiKey) {
      await asaasService.saveAsaasConfig('asaas_api_key', apiKey);
    }
    if (apiUrl) {
      await asaasService.saveAsaasConfig('asaas_api_url', apiUrl);
    }

    // Configura automaticamente o webhook após salvar as credenciais
    if (apiKey || apiUrl) {
      try {
        await asaasService.handleApiAsaas();
      } catch (webhookError) {
        console.error('Erro ao configurar webhook automático:', webhookError);
        // Não falha a requisição se o webhook falhar
      }
    }

    res.json({ success: true, message: 'Configurações salvas com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/config/test - Testa a conexão com a API do Asaas
 * Requer: Admin
 */
router.post('/config/test', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const result = await asaasService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROTAS DE EMPRESAS
// ============================================

/**
 * GET /saas/empresas - Lista todas as empresas
 * Requer: Admin
 */
router.get('/empresas', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    let {
      q = '',
      sortBy = 'id',
      itemsPerPage = 10,
      page = 1,
      orderBy = 'desc',
      status = null
    } = req.query;

    itemsPerPage = parseInt(itemsPerPage);
    page = parseInt(page);
    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == -1) {
      offset = 0;
      itemsPerPage = 1000000;
    }

    let baseQuery = 'FROM Empresas WHERE deleted_at IS NULL';
    let params = [];

    if (q && q.trim() !== '') {
      baseQuery += ` AND (nome LIKE ? OR documento LIKE ? OR cnpj LIKE ? OR cpf LIKE ? OR email LIKE ?)`;
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      baseQuery += ' AND status = ?';
      params.push(status);
    }

    const countQuery = await dbQuery(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countQuery[0].total;

    baseQuery += ` ORDER BY ${sortBy} ${orderBy} LIMIT ? OFFSET ?`;
    params.push(itemsPerPage, offset);

    const empresas = await dbQuery(`SELECT * ${baseQuery}`, params);

    // Buscar assinatura ativa de cada empresa
    for (let empresa of empresas) {
      const assinatura = await dbQuery(`
        SELECT a.*, p.nome as plano_nome
        FROM Assinaturas a
        LEFT JOIN Planos p ON a.plano_id = p.id
        WHERE a.empresa_id = ? AND a.status NOT IN ('cancelada')
        ORDER BY a.created_at DESC LIMIT 1
      `, [empresa.id]);
      empresa.assinatura = assinatura[0] || null;
    }

    res.json({ empresas, total });
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /saas/empresas/:id - Obtém uma empresa pelo ID
 * Requer: Admin
 */
router.get('/empresas/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const empresa = await dbQuery('SELECT * FROM Empresas WHERE id = ? AND deleted_at IS NULL', [id]);

    if (empresa.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    // Buscar assinaturas
    const assinaturas = await dbQuery(`
      SELECT a.*, p.nome as plano_nome
      FROM Assinaturas a
      LEFT JOIN Planos p ON a.plano_id = p.id
      WHERE a.empresa_id = ?
      ORDER BY a.created_at DESC
    `, [id]);

    // Buscar usuários da empresa
    const usuarios = await dbQuery('SELECT id, fullName, email, role FROM User WHERE empresa_id = ?', [id]);

    res.json({
      ...empresa[0],
      assinaturas,
      usuarios
    });
  } catch (error) {
    console.error('Erro ao buscar empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/empresas - Cria uma nova empresa
 * Requer: Admin
 */
router.post('/empresas', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const {
      nome, documento, email, telefone,
      endereco, numero, complemento, bairro, cidade, estado, cep, logo
    } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }

    // Backward compat: copiar documento para cnpj/cpf legado
    const docLimpo = documento ? documento.replace(/\D/g, '') : null;
    const cnpj = docLimpo && docLimpo.length > 11 ? docLimpo : null;
    const cpf = docLimpo && docLimpo.length <= 11 ? docLimpo : null;

    // Verificar duplicidade por documento ou email
    const existente = await dbQuery(
      'SELECT id FROM Empresas WHERE (email = ? OR (documento = ? AND documento IS NOT NULL)) AND deleted_at IS NULL',
      [email, docLimpo]
    );

    if (existente.length > 0) {
      return res.status(400).json({ error: 'Já existe uma empresa com este email ou CPF/CNPJ' });
    }

    const result = await dbQuery(`
      INSERT INTO Empresas (nome, documento, cnpj, cpf, email, telefone,
        endereco, numero, complemento, bairro, cidade, estado, cep, logo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
    `, [nome, docLimpo, cnpj, cpf, email, telefone,
      endereco, numero, complemento, bairro, cidade, estado, cep, logo]);

    const novaEmpresa = await dbQuery('SELECT * FROM Empresas WHERE id = ?', [result.insertId]);

    res.status(201).json(novaEmpresa[0]);
  } catch (error) {
    console.error('Erro ao criar empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /saas/empresas/:id - Atualiza uma empresa
 * Requer: Admin
 */
router.put('/empresas/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nome, documento, email, telefone,
      endereco, numero, complemento, bairro, cidade, estado, cep, logo, status
    } = req.body;

    const empresa = await dbQuery('SELECT * FROM Empresas WHERE id = ? AND deleted_at IS NULL', [id]);
    if (empresa.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    // Backward compat: copiar documento para cnpj/cpf legado
    const docLimpo = documento ? documento.replace(/\D/g, '') : null;
    const cnpj = docLimpo && docLimpo.length > 11 ? docLimpo : null;
    const cpf = docLimpo && docLimpo.length <= 11 ? docLimpo : null;

    await dbQuery(`
      UPDATE Empresas SET
        nome = COALESCE(?, nome),
        documento = COALESCE(?, documento),
        cnpj = COALESCE(?, cnpj),
        cpf = COALESCE(?, cpf),
        email = COALESCE(?, email),
        telefone = COALESCE(?, telefone),
        endereco = COALESCE(?, endereco),
        numero = COALESCE(?, numero),
        complemento = COALESCE(?, complemento),
        bairro = COALESCE(?, bairro),
        cidade = COALESCE(?, cidade),
        estado = COALESCE(?, estado),
        cep = COALESCE(?, cep),
        logo = COALESCE(?, logo),
        status = COALESCE(?, status)
      WHERE id = ?
    `, [nome, docLimpo, cnpj, cpf, email, telefone,
      endereco, numero, complemento, bairro, cidade, estado, cep, logo, status, id]);

    // Se empresa tem asaas_customer_id, atualiza no Asaas também
    if (empresa[0].asaas_customer_id) {
      try {
        await asaasService.updateCustomer(empresa[0].asaas_customer_id, {
          ...empresa[0],
          nome: nome || empresa[0].nome,
          email: email || empresa[0].email
        });
      } catch (asaasError) {
        console.error('Erro ao atualizar cliente no Asaas:', asaasError);
      }
    }

    const empresaAtualizada = await dbQuery('SELECT * FROM Empresas WHERE id = ?', [id]);
    res.json(empresaAtualizada[0]);
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /saas/empresas/:id - Desativa uma empresa (soft delete)
 * Requer: Admin
 */
router.delete('/empresas/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Proteção: empresa principal (id=1) não pode ser excluída
    if (parseInt(id) === 1) {
      return res.status(403).json({ error: 'A empresa principal não pode ser excluída.' });
    }

    await dbQuery('UPDATE Empresas SET deleted_at = NOW(), status = "inativa" WHERE id = ?', [id]);

    res.json({ success: true, message: 'Empresa desativada com sucesso' });
  } catch (error) {
    console.error('Erro ao desativar empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /saas/minha-empresa - Obtém a empresa do usuário logado
 * Requer: Auth
 */
router.get('/minha-empresa', getUserLoggedUser, async (req, res) => {
  try {
    if (!req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não vinculado a nenhuma empresa' });
    }

    const empresa = await dbQuery('SELECT * FROM Empresas WHERE id = ? AND deleted_at IS NULL', [req.user.empresa_id]);

    if (empresa.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    res.json(empresa[0]);
  } catch (error) {
    console.error('Erro ao buscar empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /saas/minha-empresa - Atualiza a empresa do usuário logado
 * Requer: Auth
 */
router.put('/minha-empresa', getUserLoggedUser, async (req, res) => {
  try {
    if (!req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não vinculado a nenhuma empresa' });
    }

    const {
      nome, telefone, endereco, numero,
      complemento, bairro, cidade, estado, cep, logo
    } = req.body;

    // Não permite alterar documento ou email
    await dbQuery(`
      UPDATE Empresas SET
        nome = COALESCE(?, nome),
        telefone = COALESCE(?, telefone),
        endereco = COALESCE(?, endereco),
        numero = COALESCE(?, numero),
        complemento = COALESCE(?, complemento),
        bairro = COALESCE(?, bairro),
        cidade = COALESCE(?, cidade),
        estado = COALESCE(?, estado),
        cep = COALESCE(?, cep),
        logo = COALESCE(?, logo)
      WHERE id = ?
    `, [nome, telefone, endereco, numero,
      complemento, bairro, cidade, estado, cep, logo, req.user.empresa_id]);

    const empresaAtualizada = await dbQuery('SELECT * FROM Empresas WHERE id = ?', [req.user.empresa_id]);
    res.json(empresaAtualizada[0]);
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS DE PLANOS
// ============================================

/**
 * GET /saas/planos - Lista todos os planos
 * Público (para página de cadastro)
 */
router.get('/planos', async (req, res) => {
  try {
    const { ativo } = req.query;

    let query = 'SELECT * FROM Planos WHERE 1=1';
    let params = [];

    if (ativo !== undefined) {
      query += ' AND ativo = ?';
      params.push(ativo === 'true' ? 1 : 0);
    }

    query += ' ORDER BY ordem ASC, valor_mensal ASC';

    const planos = await dbQuery(query, params);

    // Parse JSON fields
    planos.forEach(plano => {
      plano.tags = plano.tags ? JSON.parse(plano.tags) : [];
      plano.features = plano.features ? JSON.parse(plano.features) : {};
    });

    res.json(planos);
  } catch (error) {
    console.error('Erro ao listar planos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /saas/planos/:id - Obtém um plano pelo ID
 * Público
 */
router.get('/planos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const plano = await dbQuery('SELECT * FROM Planos WHERE id = ?', [id]);

    if (plano.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    plano[0].tags = plano[0].tags ? JSON.parse(plano[0].tags) : [];
    plano[0].features = plano[0].features ? JSON.parse(plano[0].features) : {};

    res.json(plano[0]);
  } catch (error) {
    console.error('Erro ao buscar plano:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/planos - Cria um novo plano
 * Requer: Admin
 */
router.post('/planos', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { nome, descricao, valor_mensal, tags, features, dias_teste, ativo, ordem } = req.body;

    if (!nome || valor_mensal === undefined) {
      return res.status(400).json({ error: 'Nome e valor mensal são obrigatórios' });
    }

    // Garante que ativo seja 0 ou 1
    const ativoValue = ativo !== undefined ? (ativo ? 1 : 0) : 1;

    const result = await dbQuery(`
      INSERT INTO Planos (nome, descricao, valor_mensal, tags, features, dias_teste, ativo, ordem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nome,
      descricao || null,
      valor_mensal,
      tags ? JSON.stringify(tags) : null,
      features ? JSON.stringify(features) : null,
      dias_teste || 0,
      ativoValue,
      ordem || 0
    ]);

    const novoPlano = await dbQuery('SELECT * FROM Planos WHERE id = ?', [result.insertId]);
    novoPlano[0].tags = novoPlano[0].tags ? JSON.parse(novoPlano[0].tags) : [];
    novoPlano[0].features = novoPlano[0].features ? JSON.parse(novoPlano[0].features) : {};

    res.status(201).json(novoPlano[0]);
  } catch (error) {
    console.error('Erro ao criar plano:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /saas/planos/:id - Atualiza um plano
 * Requer: Admin
 */
router.put('/planos/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, valor_mensal, tags, features, dias_teste, ativo, ordem } = req.body;

    const planoExistente = await dbQuery('SELECT * FROM Planos WHERE id = ?', [id]);
    if (planoExistente.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    // Trata campo ativo separadamente pois COALESCE interpreta 0 como NULL
    const ativoValue = ativo !== undefined ? (ativo ? 1 : 0) : planoExistente[0].ativo;

    await dbQuery(`
      UPDATE Planos SET
        nome = COALESCE(?, nome),
        descricao = COALESCE(?, descricao),
        valor_mensal = COALESCE(?, valor_mensal),
        tags = COALESCE(?, tags),
        features = COALESCE(?, features),
        dias_teste = COALESCE(?, dias_teste),
        ativo = ?,
        ordem = COALESCE(?, ordem)
      WHERE id = ?
    `, [
      nome,
      descricao,
      valor_mensal,
      tags ? JSON.stringify(tags) : null,
      features ? JSON.stringify(features) : null,
      dias_teste,
      ativoValue,
      ordem,
      id
    ]);

    const planoAtualizado = await dbQuery('SELECT * FROM Planos WHERE id = ?', [id]);
    planoAtualizado[0].tags = planoAtualizado[0].tags ? JSON.parse(planoAtualizado[0].tags) : [];
    planoAtualizado[0].features = planoAtualizado[0].features ? JSON.parse(planoAtualizado[0].features) : {};

    // Se o valor mensal mudou, propagar para assinaturas ativas/trial
    if (valor_mensal !== undefined && valor_mensal !== null && parseFloat(valor_mensal) !== parseFloat(planoExistente[0].valor_mensal)) {
      const novoValorMensal = parseFloat(valor_mensal);
      const assinaturas = await dbQuery(
        'SELECT * FROM Assinaturas WHERE plano_id = ? AND status IN ("ativa", "trial")',
        [id]
      );

      for (const assinatura of assinaturas) {
        const novoValor = assinatura.ciclo === 'YEARLY'
          ? novoValorMensal * 12 * 0.9
          : novoValorMensal;

        await dbQuery('UPDATE Assinaturas SET valor = ? WHERE id = ?', [novoValor, assinatura.id]);

        // Tentar atualizar no Asaas
        if (assinatura.asaas_subscription_id) {
          try {
            await asaasService.asaasRequest(`/v3/subscriptions/${assinatura.asaas_subscription_id}`, 'PUT', {
              value: novoValor
            });
          } catch (asaasError) {
            console.warn(`[SaaS] Não foi possível atualizar valor da assinatura ${assinatura.id} no Asaas:`, asaasError.message);
          }
        }
      }

      planoAtualizado[0].assinaturas_atualizadas = assinaturas.length;
    }

    res.json(planoAtualizado[0]);
  } catch (error) {
    console.error('Erro ao atualizar plano:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /saas/planos/:id - Desativa um plano
 * Requer: Admin
 */
router.delete('/planos/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar todas assinaturas não canceladas deste plano
    const assinaturas = await dbQuery(
      'SELECT * FROM Assinaturas WHERE plano_id = ? AND status NOT IN ("cancelada")',
      [id]
    );

    let canceladas = 0;

    // Cancelar cada assinatura e inativar a empresa
    for (const assinatura of assinaturas) {
      // Cancelar no Asaas se tiver ID
      if (assinatura.asaas_subscription_id) {
        try {
          await asaasService.cancelSubscription(assinatura.asaas_subscription_id);
        } catch (asaasError) {
          console.error(`Erro ao cancelar assinatura ${assinatura.id} no Asaas:`, asaasError);
        }
      }

      // Cancelar assinatura localmente
      await dbQuery(`
        UPDATE Assinaturas SET
          status = 'cancelada',
          data_cancelamento = NOW(),
          motivo_cancelamento = 'Plano desativado pelo administrador'
        WHERE id = ?
      `, [assinatura.id]);

      // Inativar empresa
      await dbQuery('UPDATE Empresas SET status = "inativa" WHERE id = ?', [assinatura.empresa_id]);

      canceladas++;
    }

    // Desativar o plano
    await dbQuery('UPDATE Planos SET ativo = 0 WHERE id = ?', [id]);

    res.json({
      success: true,
      message: canceladas > 0
        ? `Plano desativado. ${canceladas} assinatura(s) cancelada(s).`
        : 'Plano desativado com sucesso.',
      canceladas
    });
  } catch (error) {
    console.error('Erro ao desativar plano:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS DE ASSINATURAS
// ============================================

/**
 * GET /saas/assinaturas - Lista todas as assinaturas
 * Requer: Admin
 */
router.get('/assinaturas', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    let {
      q = '',
      sortBy = 'a.id',
      itemsPerPage = 10,
      page = 1,
      orderBy = 'desc',
      status = null,
      empresa_id = null
    } = req.query;

    itemsPerPage = parseInt(itemsPerPage);
    page = parseInt(page);
    let offset = (page - 1) * itemsPerPage;

    if (itemsPerPage == -1) {
      offset = 0;
      itemsPerPage = 1000000;
    }

    let baseQuery = `
      FROM Assinaturas a
      LEFT JOIN Empresas e ON a.empresa_id = e.id
      LEFT JOIN Planos p ON a.plano_id = p.id
      WHERE 1=1
    `;
    let params = [];

    if (q && q.trim() !== '') {
      baseQuery += ` AND (e.nome LIKE ? OR p.nome LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    if (status) {
      baseQuery += ' AND a.status = ?';
      params.push(status);
    }

    if (empresa_id) {
      baseQuery += ' AND a.empresa_id = ?';
      params.push(empresa_id);
    }

    const countQuery = await dbQuery(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countQuery[0].total;

    baseQuery += ` ORDER BY ${sortBy} ${orderBy} LIMIT ? OFFSET ?`;
    params.push(itemsPerPage, offset);

    const assinaturas = await dbQuery(`
      SELECT a.*, e.nome as empresa_nome, e.email as empresa_email, p.nome as plano_nome
      ${baseQuery}
    `, params);

    res.json({ assinaturas, total });
  } catch (error) {
    console.error('Erro ao listar assinaturas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /saas/assinaturas/:id - Obtém uma assinatura pelo ID
 * Requer: Admin
 */
router.get('/assinaturas/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const assinatura = await dbQuery(`
      SELECT a.*, e.nome as empresa_nome, e.email as empresa_email,
             p.nome as plano_nome, p.features as plano_features
      FROM Assinaturas a
      LEFT JOIN Empresas e ON a.empresa_id = e.id
      LEFT JOIN Planos p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [id]);

    if (assinatura.length === 0) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    // Buscar pagamentos
    const pagamentos = await dbQuery(
      'SELECT * FROM Assinatura_Pagamentos WHERE assinatura_id = ? ORDER BY created_at DESC',
      [id]
    );

    pagamentos.forEach(p => {
      p.dados_json = p.dados_json ? JSON.parse(p.dados_json) : null;
    });

    assinatura[0].plano_features = assinatura[0].plano_features
      ? JSON.parse(assinatura[0].plano_features)
      : {};
    assinatura[0].pagamentos = pagamentos;

    res.json(assinatura[0]);
  } catch (error) {
    console.error('Erro ao buscar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/assinaturas - Cria uma nova assinatura
 * Requer: Admin
 */
router.post('/assinaturas', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { empresa_id, plano_id, ciclo, status } = req.body;

    if (!empresa_id || !plano_id) {
      return res.status(400).json({ error: 'Empresa e plano são obrigatórios' });
    }

    const empresa = await dbQuery('SELECT * FROM Empresas WHERE id = ? AND deleted_at IS NULL', [empresa_id]);
    if (empresa.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const plano = await dbQuery('SELECT * FROM Planos WHERE id = ? AND ativo = 1', [plano_id]);
    if (plano.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado ou inativo' });
    }

    const cicloFinal = ciclo || 'MONTHLY';
    const valor = cicloFinal === 'YEARLY' ? plano[0].valor_mensal * 12 * 0.9 : plano[0].valor_mensal;
    const statusFinal = status || (plano[0].dias_teste > 0 ? 'trial' : 'pendente');

    const dataInicio = new Date();
    let dataFimTrial = null;
    if (plano[0].dias_teste > 0) {
      dataFimTrial = new Date();
      dataFimTrial.setDate(dataFimTrial.getDate() + plano[0].dias_teste);
    }

    const result = await dbQuery(`
      INSERT INTO Assinaturas (empresa_id, plano_id, status, valor, ciclo, data_inicio, data_fim_trial)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [empresa_id, plano_id, statusFinal, valor, cicloFinal, dataInicio, dataFimTrial]);

    // Atualiza status da empresa
    await dbQuery('UPDATE Empresas SET status = ? WHERE id = ?', [statusFinal === 'trial' ? 'ativa' : 'pendente', empresa_id]);

    const novaAssinatura = await dbQuery(`
      SELECT a.*, e.nome as empresa_nome, p.nome as plano_nome
      FROM Assinaturas a
      LEFT JOIN Empresas e ON a.empresa_id = e.id
      LEFT JOIN Planos p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [result.insertId]);

    res.status(201).json(novaAssinatura[0]);
  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /saas/assinaturas/:id - Atualiza uma assinatura
 * Requer: Admin
 */
router.put('/assinaturas/:id', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plano_id, status, ciclo } = req.body;

    const assinatura = await dbQuery('SELECT * FROM Assinaturas WHERE id = ?', [id]);
    if (assinatura.length === 0) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    let valor = assinatura[0].valor;
    if (plano_id) {
      const plano = await dbQuery('SELECT * FROM Planos WHERE id = ?', [plano_id]);
      if (plano.length > 0) {
        const cicloFinal = ciclo || assinatura[0].ciclo;
        valor = cicloFinal === 'YEARLY' ? plano[0].valor_mensal * 12 * 0.9 : plano[0].valor_mensal;
      }
    }

    await dbQuery(`
      UPDATE Assinaturas SET
        plano_id = COALESCE(?, plano_id),
        status = COALESCE(?, status),
        ciclo = COALESCE(?, ciclo),
        valor = ?
      WHERE id = ?
    `, [plano_id, status, ciclo, valor, id]);

    // Atualiza status da empresa baseado no status da assinatura
    if (status) {
      const statusEmpresa = ['ativa', 'trial'].includes(status) ? 'ativa' :
                           status === 'suspensa' ? 'suspensa' :
                           status === 'cancelada' ? 'inativa' : 'pendente';
      await dbQuery('UPDATE Empresas SET status = ? WHERE id = ?', [statusEmpresa, assinatura[0].empresa_id]);
    }

    const assinaturaAtualizada = await dbQuery(`
      SELECT a.*, e.nome as empresa_nome, p.nome as plano_nome
      FROM Assinaturas a
      LEFT JOIN Empresas e ON a.empresa_id = e.id
      LEFT JOIN Planos p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [id]);

    res.json(assinaturaAtualizada[0]);
  } catch (error) {
    console.error('Erro ao atualizar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/assinaturas/:id/cancelar - Cancela uma assinatura
 * Requer: Admin
 */
router.post('/assinaturas/:id/cancelar', getUserLoggedUser, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const assinatura = await dbQuery('SELECT * FROM Assinaturas WHERE id = ?', [id]);
    if (assinatura.length === 0) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    // Cancela no Asaas se tiver ID
    if (assinatura[0].asaas_subscription_id) {
      try {
        await asaasService.cancelSubscription(assinatura[0].asaas_subscription_id);
      } catch (asaasError) {
        console.error('Erro ao cancelar no Asaas:', asaasError);
      }
    }

    await dbQuery(`
      UPDATE Assinaturas SET
        status = 'cancelada',
        data_cancelamento = NOW(),
        motivo_cancelamento = ?
      WHERE id = ?
    `, [motivo || 'Cancelamento administrativo', id]);

    // Atualiza status da empresa
    await dbQuery('UPDATE Empresas SET status = "inativa" WHERE id = ?', [assinatura[0].empresa_id]);

    res.json({ success: true, message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /saas/minha-assinatura - Obtém a assinatura da empresa do usuário logado
 * Requer: Auth
 */
router.get('/minha-assinatura', getUserLoggedUser, async (req, res) => {
  try {
    if (!req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não vinculado a nenhuma empresa' });
    }

    const assinatura = await dbQuery(`
      SELECT a.*, p.nome as plano_nome, p.features as plano_features, p.descricao as plano_descricao
      FROM Assinaturas a
      LEFT JOIN Planos p ON a.plano_id = p.id
      WHERE a.empresa_id = ? AND a.status NOT IN ('cancelada')
      ORDER BY a.created_at DESC LIMIT 1
    `, [req.user.empresa_id]);

    if (assinatura.length === 0) {
      return res.status(404).json({ error: 'Nenhuma assinatura encontrada' });
    }

    assinatura[0].plano_features = assinatura[0].plano_features
      ? JSON.parse(assinatura[0].plano_features)
      : {};

    res.json(assinatura[0]);
  } catch (error) {
    console.error('Erro ao buscar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /saas/minha-assinatura/pagamentos - Obtém os pagamentos da assinatura do usuário
 * Requer: Auth
 */
router.get('/minha-assinatura/pagamentos', getUserLoggedUser, async (req, res) => {
  try {
    if (!req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não vinculado a nenhuma empresa' });
    }

    const assinatura = await dbQuery(
      'SELECT id FROM Assinaturas WHERE empresa_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.empresa_id]
    );

    if (assinatura.length === 0) {
      return res.json([]);
    }

    const pagamentos = await dbQuery(
      'SELECT * FROM Assinatura_Pagamentos WHERE assinatura_id = ? ORDER BY created_at DESC',
      [assinatura[0].id]
    );

    pagamentos.forEach(p => {
      p.dados_json = p.dados_json ? JSON.parse(p.dados_json) : null;
    });

    res.json(pagamentos);
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /saas/minha-assinatura/cartao - Atualiza o cartão de crédito da assinatura do usuário
 * Requer: Auth
 */
router.put('/minha-assinatura/cartao', getUserLoggedUser, async (req, res) => {
  try {
    if (!req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não vinculado a nenhuma empresa' });
    }

    const { creditCard, creditCardHolderInfo } = req.body;

    if (!creditCard || !creditCardHolderInfo) {
      return res.status(400).json({ error: 'Dados do cartão são obrigatórios' });
    }

    // Buscar assinatura ativa
    const assinatura = await dbQuery(
      "SELECT * FROM Assinaturas WHERE empresa_id = ? AND status NOT IN ('cancelada') ORDER BY created_at DESC LIMIT 1",
      [req.user.empresa_id]
    );

    if (assinatura.length === 0) {
      return res.status(404).json({ error: 'Nenhuma assinatura encontrada' });
    }

    if (!assinatura[0].asaas_subscription_id) {
      return res.status(400).json({ error: 'Assinatura não possui integração com gateway de pagamento' });
    }

    // Obter IP do cliente
    const remoteIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.connection?.remoteAddress
      || req.ip
      || '127.0.0.1';

    // Atualizar cartão no Asaas
    await asaasService.asaasRequest(
      `/v3/subscriptions/${assinatura[0].asaas_subscription_id}/creditCard`,
      'PUT',
      { creditCard, creditCardHolderInfo, remoteIp }
    );

    res.json({ success: true, message: 'Cartão atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar cartão:', error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar cartão de crédito' });
  }
});

/**
 * POST /saas/minha-assinatura/cancelar - Cancela a assinatura do usuário logado
 * Requer: Auth
 */
router.post('/minha-assinatura/cancelar', getUserLoggedUser, async (req, res) => {
  try {
    if (!req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não vinculado a nenhuma empresa' });
    }

    const { motivo } = req.body;

    // Buscar assinatura ativa
    const assinatura = await dbQuery(
      "SELECT * FROM Assinaturas WHERE empresa_id = ? AND status NOT IN ('cancelada') ORDER BY created_at DESC LIMIT 1",
      [req.user.empresa_id]
    );

    if (assinatura.length === 0) {
      return res.status(404).json({ error: 'Nenhuma assinatura encontrada' });
    }

    // Cancelar no Asaas se tiver ID
    if (assinatura[0].asaas_subscription_id) {
      try {
        await asaasService.cancelSubscription(assinatura[0].asaas_subscription_id);
      } catch (asaasError) {
        console.error('Erro ao cancelar no Asaas:', asaasError);
      }
    }

    await dbQuery(`
      UPDATE Assinaturas SET
        status = 'cancelada',
        data_cancelamento = NOW(),
        motivo_cancelamento = ?
      WHERE id = ?
    `, [motivo || 'Cancelamento pelo usuário', assinatura[0].id]);

    // Atualiza status da empresa
    await dbQuery('UPDATE Empresas SET status = "inativa" WHERE id = ?', [req.user.empresa_id]);

    res.json({ success: true, message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS DE CADASTRO PÚBLICO
// ============================================

/**
 * POST /saas/cadastro - Cadastro de nova empresa + usuário + assinatura
 * Público
 */
router.post('/cadastro', async (req, res) => {
  try {
    const {
      // Dados da empresa
      empresa_nome,
      empresa_documento,
      empresa_email,
      empresa_telefone,
      empresa_endereco,
      empresa_numero,
      empresa_complemento,
      empresa_bairro,
      empresa_cidade,
      empresa_estado,
      empresa_cep,
      // Dados do usuário
      usuario_nome,
      usuario_email,
      usuario_senha,
      // Dados da assinatura
      plano_id,
      ciclo,
      // Dados do cartão de crédito
      creditCard,
      creditCardHolderInfo,
    } = req.body;

    // Validações
    if (!empresa_nome) {
      return res.status(400).json({ error: 'Nome da empresa é obrigatório' });
    }
    if (!empresa_documento) {
      return res.status(400).json({ error: 'CPF ou CNPJ da empresa é obrigatório' });
    }
    if (!usuario_nome || !usuario_email || !usuario_senha) {
      return res.status(400).json({ error: 'Dados do usuário são obrigatórios' });
    }
    if (!plano_id) {
      return res.status(400).json({ error: 'Plano é obrigatório' });
    }

    // Usa email do usuário como email da empresa se não informado
    const emailEmpresa = empresa_email || usuario_email;

    // Backward compat: copiar documento para cnpj/cpf legado
    const docLimpo = empresa_documento.replace(/\D/g, '');
    const empresa_cnpj = docLimpo.length > 11 ? docLimpo : null;
    const empresa_cpf = docLimpo.length <= 11 ? docLimpo : null;

    // Verificar se já existe empresa
    const empresaExistente = await dbQuery(
      'SELECT id FROM Empresas WHERE email = ? OR (documento = ? AND documento IS NOT NULL)',
      [emailEmpresa, docLimpo]
    );
    if (empresaExistente.length > 0) {
      return res.status(400).json({ error: 'Já existe uma empresa cadastrada com este email ou CPF/CNPJ' });
    }

    // Verificar se já existe usuário
    const usuarioExistente = await dbQuery('SELECT id FROM User WHERE email = ?', [usuario_email]);
    if (usuarioExistente.length > 0) {
      return res.status(400).json({ error: 'Já existe um usuário com este email' });
    }

    // Buscar plano
    const plano = await dbQuery('SELECT * FROM Planos WHERE id = ? AND ativo = 1', [plano_id]);
    if (plano.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado ou inativo' });
    }

    if (!creditCard || !creditCardHolderInfo) {
      return res.status(400).json({ error: 'Dados do cartão de crédito são obrigatórios' });
    }

    const cicloFinal = ciclo || 'MONTHLY';

    // ====================================================
    // ETAPA 1: Validar no Asaas ANTES de criar no banco
    // ====================================================

    // 1a. Criar customer no Asaas
    let asaasCustomer;
    try {
      asaasCustomer = await asaasService.createCustomer({
        id: 0, // temporário, será atualizado depois
        nome: empresa_nome,
        documento: docLimpo,
        email: emailEmpresa,
        telefone: empresa_telefone || null,
        endereco: empresa_endereco || null,
        numero: empresa_numero || null,
        complemento: empresa_complemento || null,
        bairro: empresa_bairro || null,
        cep: empresa_cep || null,
      });
    } catch (asaasError) {
      console.error('Erro ao criar customer no Asaas:', asaasError);
      return res.status(400).json({ error: asaasError.message || 'Erro ao validar dados no gateway de pagamento' });
    }

    // 1b. Criar subscription com cartão no Asaas
    let asaasSubscription;
    try {
      const remoteIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.connection?.remoteAddress
        || req.ip
        || '127.0.0.1';

      asaasSubscription = await asaasService.createSubscriptionWithCreditCard(
        asaasCustomer.id,
        plano[0],
        cicloFinal,
        creditCard,
        creditCardHolderInfo,
        remoteIp
      );
    } catch (asaasError) {
      console.error('Erro ao criar assinatura no Asaas:', asaasError);
      // Limpar customer órfão no Asaas
      try { await asaasService.asaasRequest(`/v3/customers/${asaasCustomer.id}`, 'DELETE'); } catch (e) { /* ignore */ }
      return res.status(400).json({ error: asaasError.message || 'Erro ao processar cartão de crédito' });
    }

    // ====================================================
    // ETAPA 2: Asaas OK - agora criar tudo no banco local
    // ====================================================

    // Criar empresa
    const empresaResult = await dbQuery(`
      INSERT INTO Empresas (nome, documento, cnpj, cpf, email, telefone,
        endereco, numero, complemento, bairro, cidade, estado, cep, status, asaas_customer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativa', ?)
    `, [empresa_nome, docLimpo, empresa_cnpj, empresa_cpf, emailEmpresa,
      empresa_telefone, empresa_endereco, empresa_numero,
      empresa_complemento, empresa_bairro, empresa_cidade, empresa_estado, empresa_cep,
      asaasCustomer.id]);

    const empresaId = empresaResult.insertId;

    // Atualizar externalReference do customer no Asaas com o ID real da empresa
    try { await asaasService.updateCustomer(asaasCustomer.id, { nome: empresa_nome, documento: docLimpo, email: emailEmpresa, id: empresaId }); } catch (e) { /* ignore */ }

    // Criar usuário Gestor da empresa
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(usuario_senha, 10);

    const userResult = await dbQuery(`
      INSERT INTO User (fullName, email, password, role, empresa_id)
      VALUES (?, ?, ?, 'Gestor', ?)
    `, [usuario_nome, usuario_email, hashedPassword, empresaId]);

    const userId = userResult.insertId;

    // Criar assinatura local
    const valor = cicloFinal === 'YEARLY' ? plano[0].valor_mensal * 12 * 0.9 : plano[0].valor_mensal;
    const statusAssinatura = plano[0].dias_teste > 0 ? 'trial' : 'ativa';

    const dataInicio = new Date();
    let dataFimTrial = null;
    if (plano[0].dias_teste > 0) {
      dataFimTrial = new Date();
      dataFimTrial.setDate(dataFimTrial.getDate() + plano[0].dias_teste);
    }

    await dbQuery(`
      INSERT INTO Assinaturas (empresa_id, plano_id, status, valor, ciclo, data_inicio, data_fim_trial, asaas_customer_id, asaas_subscription_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [empresaId, plano_id, statusAssinatura, valor, cicloFinal, dataInicio, dataFimTrial, asaasCustomer.id, asaasSubscription.id]);

    // Popula dados iniciais da empresa (roles, status, serviços, etc.)
    seedEmpresaData(empresaId, userId).catch(err => {
      console.error('Erro no seed de dados:', err);
    });

    // Gerar token JWT para auto-login
    const jose = require('jose-node-cjs-runtime');
    const { secretKey } = require('../utils/functions');

    const token = await new jose.EncryptJWT({ id: userId })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .encrypt(secretKey);

    // Buscar dados do usuário criado
    const novoUsuario = await dbQuery('SELECT * FROM User WHERE id = ?', [userId]);
    const userData = { ...novoUsuario[0] };
    delete userData.password;

    // Buscar abilities do role Gestor
    const roles = await dbQuery('SELECT role_ability FROM Roles WHERE role_name = ? AND empresa_id = ?', ['Gestor', empresaId]);
    let userAbilityRules = '[]';
    if (roles.length > 0) {
      userAbilityRules = roles[0].role_ability;
    } else {
      // Fallback: buscar role Gestor da empresa principal
      const rolesFallback = await dbQuery('SELECT role_ability FROM Roles WHERE role_name = ? AND empresa_id = 1', ['Gestor']);
      if (rolesFallback.length > 0) {
        userAbilityRules = rolesFallback[0].role_ability;
      }
    }

    res.status(201).json({
      success: true,
      empresa_id: empresaId,
      status: statusAssinatura,
      message: 'Cadastro realizado com sucesso!',
      // Dados para auto-login
      accessToken: token,
      userData,
      userAbilityRules,
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /saas/checkout - Cria um checkout/link de pagamento
 * Público (com validação de empresa)
 */
router.post('/checkout', async (req, res) => {
  try {
    const { empresa_id, plano_id, ciclo } = req.body;

    if (!empresa_id || !plano_id) {
      return res.status(400).json({ error: 'Empresa e plano são obrigatórios' });
    }

    const empresa = await dbQuery('SELECT * FROM Empresas WHERE id = ?', [empresa_id]);
    if (empresa.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const plano = await dbQuery('SELECT * FROM Planos WHERE id = ? AND ativo = 1', [plano_id]);
    if (plano.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    // Criar cliente no Asaas se ainda não existe
    let customerId = empresa[0].asaas_customer_id;
    if (!customerId) {
      const customer = await asaasService.createCustomer(empresa[0]);
      customerId = customer.id;
    }

    // Criar link de pagamento
    const link = await asaasService.createPaymentLink(
      plano[0],
      empresa[0],
      ciclo || 'MONTHLY',
      `${process.env.APP_URL || 'https://daviot.com.br'}/cadastro/sucesso`
    );

    res.json({
      success: true,
      payment_link: link.url,
      payment_link_id: link.id
    });
  } catch (error) {
    console.error('Erro ao criar checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
