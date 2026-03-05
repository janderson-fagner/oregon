/**
 * Rotas de Contratos - CRUD, PDF, Assinaturas e Cobranças
 * Todas as rotas são autenticadas via getUserLoggedUser
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const moment = require('moment');

moment.locale('pt-br');

const dbQuery = require('../database');
const { empresaWhere } = require('../utils/dbHelper');
const asaasService = require('../services/asaasService');
const { createContratoPDF, inserirAssinaturaDigitalDoc } = require('../utils/generatePDF');

// Configuração de upload para PDFs de contratos
const caminho = path.join(__dirname, '../files/contratos');
if (!fs.existsSync(caminho)) {
  fs.mkdirSync(caminho, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const contratoDir = path.join(caminho, req.params.id);
    if (!fs.existsSync(contratoDir)) {
      fs.mkdirSync(contratoDir, { recursive: true });
    }
    cb(null, contratoDir);
  },
  filename: function (req, file, cb) {
    cb(null, new Date().getTime() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Upload de assinatura
const caminhoAssinaturas = path.join(__dirname, '../uploads/assinaturas-contratos');
if (!fs.existsSync(caminhoAssinaturas)) {
  fs.mkdirSync(caminhoAssinaturas, { recursive: true });
}

const storageAssinatura = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, caminhoAssinaturas);
  },
  filename: function (req, file, cb) {
    cb(null, new Date().getTime() + '-' + file.originalname);
  }
});

const uploadAssinatura = multer({ storage: storageAssinatura });

/**
 * GET /contratos/list - Lista contratos com paginação, busca e filtros
 */
router.get('/list', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      q = '',
      itemsPerPage = 10,
      page = 1,
      sortBy = 'id',
      orderBy = 'DESC',
      status = '',
      cli_id = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(itemsPerPage);
    const limit = parseInt(itemsPerPage);

    let where = 'WHERE c.empresa_id = ?';
    const params = [empresa_id];

    if (q) {
      where += ' AND (c.numero LIKE ? OR cl.cli_nome LIKE ? OR c.obs LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (status) {
      where += ' AND c.status = ?';
      params.push(status);
    }

    if (cli_id) {
      where += ' AND c.cli_id = ?';
      params.push(cli_id);
    }

    // Colunas permitidas para ordenação
    const allowedSort = ['id', 'numero', 'valor', 'inicio_data', 'status', 'created_at', 'cli_nome'];
    const sortColumn = allowedSort.includes(sortBy) ? sortBy : 'id';
    const sortOrder = orderBy === 'asc' ? 'ASC' : 'DESC';

    const sortPrefix = sortColumn === 'cli_nome' ? 'cl.' : 'c.';

    // Total count
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM CONTRATOS c LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id ${where}`,
      params
    );
    const total = countResult[0].total;

    // Dados paginados
    const contratos = await dbQuery(
      `SELECT c.*, cl.cli_nome, cl.cli_email, cl.cli_celular, cl.cli_cpf
       FROM CONTRATOS c
       LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       ${where}
       ORDER BY ${sortPrefix}${sortColumn} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({ contratos, total });
  } catch (error) {
    console.error('[Contratos] Erro ao listar:', error);
    return res.status(500).json({ message: 'Erro ao listar contratos' });
  }
});

/**
 * GET /contratos/get/:id - Busca contrato com dados do cliente e pagamentos
 */
router.get('/get/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const contrato = await dbQuery(
      `SELECT c.*, cl.cli_nome, cl.cli_email, cl.cli_celular, cl.cli_cpf, cl.asaas_customer_id
       FROM CONTRATOS c
       LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.id = ? AND c.empresa_id = ?`,
      [id, empresa_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    const pagamentos = await dbQuery(
      'SELECT * FROM CONTRATO_PAGAMENTOS WHERE contrato_id = ? AND empresa_id = ? ORDER BY data_vencimento DESC',
      [id, empresa_id]
    );

    const data = { ...contrato[0], pagamentos };

    // Parse JSON strings de assinaturas
    if (data.assinatura_empresa && typeof data.assinatura_empresa === 'string') {
      try { data.assinatura_empresa = JSON.parse(data.assinatura_empresa); } catch (e) {}
    }
    if (data.assinatura_cliente && typeof data.assinatura_cliente === 'string') {
      try { data.assinatura_cliente = JSON.parse(data.assinatura_cliente); } catch (e) {}
    }

    return res.json(data);
  } catch (error) {
    console.error('[Contratos] Erro ao buscar:', error);
    return res.status(500).json({ message: 'Erro ao buscar contrato' });
  }
});

/**
 * POST /contratos/create - Criar contrato
 */
router.post('/create', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      cli_id, numero, inicio_data, periodo, periodo_type,
      ativo, valor, obs, conteudo_html, status
    } = req.body;

    const result = await dbQuery(
      `INSERT INTO CONTRATOS
        (cli_id, numero, inicio_data, periodo, periodo_type, ativo, valor, obs, conteudo_html, status, created_by, empresa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cli_id || null,
        numero || null,
        inicio_data || null,
        periodo || null,
        periodo_type || null,
        ativo !== undefined ? ativo : 1,
        valor || null,
        obs || null,
        conteudo_html || null,
        status || 'gerado',
        req.user?.id || null,
        empresa_id
      ]
    );

    return res.json({ message: 'Contrato criado com sucesso', id: result.insertId });
  } catch (error) {
    console.error('[Contratos] Erro ao criar:', error);
    return res.status(500).json({ message: 'Erro ao criar contrato' });
  }
});

/**
 * PUT /contratos/update/:id - Atualizar contrato
 */
router.put('/update/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    // Campos permitidos para atualização
    const allowedFields = {
      cli_id: req.body.cli_id,
      numero: req.body.numero,
      inicio_data: req.body.inicio_data,
      periodo: req.body.periodo,
      periodo_type: req.body.periodo_type,
      ativo: req.body.ativo,
      valor: req.body.valor,
      obs: req.body.obs,
      conteudo_html: req.body.conteudo_html,
      status: req.body.status
    };

    // Somente atualiza campos que foram enviados no body
    const setClauses = [];
    const params = [];

    for (const [field, value] of Object.entries(allowedFields)) {
      if (value !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    params.push(id, empresa_id);

    await dbQuery(
      `UPDATE CONTRATOS SET ${setClauses.join(', ')} WHERE id = ? AND empresa_id = ?`,
      params
    );

    return res.json({ message: 'Contrato atualizado com sucesso' });
  } catch (error) {
    console.error('[Contratos] Erro ao atualizar:', error);
    return res.status(500).json({ message: 'Erro ao atualizar contrato' });
  }
});

/**
 * DELETE /contratos/delete/:id - Soft-delete (status='cancelado')
 */
router.delete('/delete/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    await dbQuery(
      'UPDATE CONTRATOS SET status = ?, ativo = 0 WHERE id = ? AND empresa_id = ?',
      ['cancelado', id, empresa_id]
    );

    return res.json({ message: 'Contrato cancelado com sucesso' });
  } catch (error) {
    console.error('[Contratos] Erro ao cancelar:', error);
    return res.status(500).json({ message: 'Erro ao cancelar contrato' });
  }
});

/**
 * POST /contratos/upload-pdf/:id - Upload de PDF do conteúdo do contrato
 */
router.post('/upload-pdf/:id', upload.single('pdf'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    const filePath = req.file.path;
    const fileUrl = `/download/docs/contratos/${id}/${req.file.filename}`;

    const empresa_id = req.user.empresa_id;
    await dbQuery(
      'UPDATE CONTRATOS SET conteudo_pdf_path = ?, conteudo_pdf_url = ? WHERE id = ? AND empresa_id = ?',
      [filePath, fileUrl, id, empresa_id]
    );

    return res.json({
      message: 'PDF enviado com sucesso',
      filePath,
      fileUrl
    });
  } catch (error) {
    console.error('[Contratos] Erro ao fazer upload do PDF:', error);
    return res.status(500).json({ message: 'Erro ao fazer upload do PDF' });
  }
});

/**
 * POST /contratos/gerar-pdf/:id - Gerar PDF a partir do HTML do QuillEditor
 */
router.post('/gerar-pdf/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    // Busca contrato com dados do cliente
    const contrato = await dbQuery(
      `SELECT c.*, cl.cli_nome, cl.cli_email, cl.cli_celular, cl.cli_cpf
       FROM CONTRATOS c
       LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.id = ? AND c.empresa_id = ?`,
      [id, empresa_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    const result = await createContratoPDF({ ...contrato[0], empresa_id });

    if (!result) {
      return res.status(500).json({ message: 'Erro ao gerar PDF' });
    }

    await dbQuery(
      'UPDATE CONTRATOS SET pdf_gerado_path = ?, pdf_gerado_url = ? WHERE id = ? AND empresa_id = ?',
      [result.filePath, result.fileUrl, id, empresa_id]
    );

    return res.json({
      message: 'PDF gerado com sucesso',
      ...result
    });
  } catch (error) {
    console.error('[Contratos] Erro ao gerar PDF:', error);
    return res.status(500).json({ message: 'Erro ao gerar PDF' });
  }
});

/**
 * POST /contratos/assinar-empresa/:id - Assinatura digital da empresa no PDF
 */
router.post('/assinar-empresa/:id', uploadAssinatura.single('assinatura'), async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma assinatura enviada' });
    }

    let { assinaturaCoordinates } = req.body;

    if (!assinaturaCoordinates) {
      return res.status(400).json({ message: 'Coordenadas da assinatura inválidas' });
    }

    assinaturaCoordinates = JSON.parse(assinaturaCoordinates);

    // Busca contrato
    const contrato = await dbQuery('SELECT * FROM CONTRATOS WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    const c = contrato[0];
    const pdfPath = c.pdf_gerado_path || c.conteudo_pdf_path;

    if (!pdfPath) {
      return res.status(400).json({ message: 'Nenhum PDF encontrado para assinar. Gere ou faça upload de um PDF primeiro.' });
    }

    // Usa a função de assinatura digital existente
    const dadosDoc = {
      assinaturaData: {
        filePdf: {
          filePath: pdfPath,
          url: c.pdf_gerado_url || c.conteudo_pdf_url
        }
      },
      age_id: `contrato-${id}` // Usado como referência no path
    };

    const documentoAssinado = await inserirAssinaturaDigitalDoc(dadosDoc, req.file.path, assinaturaCoordinates);

    if (!documentoAssinado) {
      return res.status(400).json({ message: 'Erro ao assinar o documento' });
    }

    // Atualiza o contrato com os dados da assinatura
    const assinaturaData = {
      assinado_por: req.user?.nome || 'Empresa',
      assinado_em: moment().format('DD/MM/YYYY HH:mm:ss'),
      user_id: req.user?.id || null
    };

    // Atualiza paths do PDF assinado
    const newUrl = `/download/docs/contratos/${id}/${path.basename(documentoAssinado.filePath)}`;

    await dbQuery(
      `UPDATE CONTRATOS SET
        pdf_gerado_path = ?, pdf_gerado_url = ?,
        assinatura_empresa = ?, status = CASE WHEN status IN ('rascunho', 'gerado') THEN 'assinado_empresa' ELSE status END
       WHERE id = ? AND empresa_id = ?`,
      [documentoAssinado.filePath, newUrl, JSON.stringify(assinaturaData), id, empresa_id]
    );

    return res.json({
      message: 'Contrato assinado com sucesso',
      filePath: documentoAssinado.filePath,
      fileUrl: newUrl
    });
  } catch (error) {
    console.error('[Contratos] Erro ao assinar:', error);
    return res.status(500).json({ message: 'Erro ao assinar contrato' });
  }
});

/**
 * POST /contratos/gerar-link-assinatura/:id - Gerar token/link para assinatura remota do cliente
 */
router.post('/gerar-link-assinatura/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const contrato = await dbQuery('SELECT * FROM CONTRATOS WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    // Gera token único
    const token = crypto.randomBytes(32).toString('hex');
    const expira = moment().add(7, 'days').format('YYYY-MM-DD HH:mm:ss');

    await dbQuery(
      'UPDATE CONTRATOS SET assinatura_token = ?, assinatura_token_expira = ? WHERE id = ? AND empresa_id = ?',
      [token, expira, id, empresa_id]
    );

    const baseUrl = (process.env.APP_URL || 'https://daviot.com.br').replace(/\/+$/, '');
    const link = `${baseUrl}/contrato/assinar/${token}`;

    return res.json({
      message: 'Link de assinatura gerado com sucesso',
      link,
      token,
      expira
    });
  } catch (error) {
    console.error('[Contratos] Erro ao gerar link:', error);
    return res.status(500).json({ message: 'Erro ao gerar link de assinatura' });
  }
});

/**
 * POST /contratos/criar-cobranca/:id - Criar cobrança no Asaas
 */
router.post('/criar-cobranca/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { valor, data_vencimento, forma_pagamento, descricao } = req.body;

    if (!valor || !data_vencimento) {
      return res.status(400).json({ message: 'Valor e data de vencimento são obrigatórios' });
    }

    // Busca contrato com dados do cliente
    const contrato = await dbQuery(
      `SELECT c.*, cl.cli_nome, cl.cli_email, cl.cli_celular, cl.cli_cpf, cl.cli_Id, cl.asaas_customer_id
       FROM CONTRATOS c
       LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.id = ? AND c.empresa_id = ?`,
      [id, empresa_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    const c = contrato[0];

    if (!c.cli_cpf) {
      return res.status(400).json({ message: 'O cliente precisa ter CPF/CNPJ cadastrado para gerar cobranças' });
    }

    // Cria/verifica customer no Asaas
    let customerId = c.asaas_customer_id;

    if (!customerId) {
      const customerResult = await asaasService.createCustomerForClient({
        cli_Id: c.cli_Id,
        cli_nome: c.cli_nome,
        cli_cpf: c.cli_cpf,
        cli_email: c.cli_email,
        cli_celular: c.cli_celular
      });
      customerId = customerResult.id;
    }

    // Mapa de billing types
    const billingTypeMap = {
      'Boleto': 'BOLETO',
      'Cartão': 'CREDIT_CARD',
      'PIX': 'PIX',
      'Todas': 'UNDEFINED'
    };

    const billingType = billingTypeMap[forma_pagamento] || 'UNDEFINED';

    // Cria pagamento no Asaas
    const paymentData = {
      customer: customerId,
      billingType,
      value: parseFloat(valor),
      dueDate: data_vencimento,
      description: descricao || `Contrato ${c.numero || id} - ${c.cli_nome || ''}`,
      externalReference: `contrato_${id}`
    };

    const payment = await asaasService.asaasRequest('/v3/payments', 'POST', paymentData);

    // Insere registro local
    await dbQuery(
      `INSERT INTO CONTRATO_PAGAMENTOS
        (contrato_id, asaas_payment_id, valor, data_vencimento, status, forma_pagamento, invoice_url, bank_slip_url, descricao, dados_json, empresa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        payment.id,
        payment.value,
        payment.dueDate,
        payment.status,
        payment.billingType,
        payment.invoiceUrl || null,
        payment.bankSlipUrl || null,
        descricao || null,
        JSON.stringify(payment),
        empresa_id
      ]
    );

    return res.json({
      message: 'Cobrança criada com sucesso',
      payment: {
        id: payment.id,
        invoiceUrl: payment.invoiceUrl,
        bankSlipUrl: payment.bankSlipUrl,
        status: payment.status,
        value: payment.value
      }
    });
  } catch (error) {
    console.error('[Contratos] Erro ao criar cobrança:', error);
    return res.status(500).json({ message: error.message || 'Erro ao criar cobrança' });
  }
});

/**
 * GET /contratos/pagamentos/:id - Listar pagamentos do contrato
 */
router.get('/pagamentos/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const pagamentos = await dbQuery(
      'SELECT * FROM CONTRATO_PAGAMENTOS WHERE contrato_id = ? AND empresa_id = ? ORDER BY data_vencimento DESC',
      [id, empresa_id]
    );

    return res.json(pagamentos);
  } catch (error) {
    console.error('[Contratos] Erro ao listar pagamentos:', error);
    return res.status(500).json({ message: 'Erro ao listar pagamentos' });
  }
});

/**
 * DELETE /contratos/pagamento/:pagamentoId - Cancelar pagamento
 */
router.delete('/pagamento/:pagamentoId', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { pagamentoId } = req.params;

    const pagamento = await dbQuery(
      'SELECT * FROM CONTRATO_PAGAMENTOS WHERE id = ? AND empresa_id = ?',
      [pagamentoId, empresa_id]
    );

    if (pagamento.length === 0) {
      return res.status(404).json({ message: 'Pagamento não encontrado' });
    }

    // Cancela no Asaas se tiver ID
    if (pagamento[0].asaas_payment_id) {
      try {
        await asaasService.asaasRequest(`/v3/payments/${pagamento[0].asaas_payment_id}`, 'DELETE');
      } catch (err) {
        console.warn('[Contratos] Erro ao cancelar pagamento no Asaas:', err.message);
      }
    }

    await dbQuery(
      'UPDATE CONTRATO_PAGAMENTOS SET status = ? WHERE id = ? AND empresa_id = ?',
      ['CANCELLED', pagamentoId, empresa_id]
    );

    return res.json({ message: 'Pagamento cancelado com sucesso' });
  } catch (error) {
    console.error('[Contratos] Erro ao cancelar pagamento:', error);
    return res.status(500).json({ message: 'Erro ao cancelar pagamento' });
  }
});

// ============================================
// ASSINATURAS RECORRENTES
// ============================================

/**
 * POST /contratos/criar-assinatura/:id - Cria assinatura recorrente no Asaas
 */
router.post('/criar-assinatura/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { valor, ciclo, billing_type, descricao, next_due_date } = req.body;

    if (!valor || !next_due_date) {
      return res.status(400).json({ message: 'Valor e data do primeiro vencimento são obrigatórios' });
    }

    // Busca contrato com dados do cliente
    const contrato = await dbQuery(
      `SELECT c.*, cl.cli_nome, cl.cli_email, cl.cli_celular, cl.cli_cpf, cl.cli_Id, cl.asaas_customer_id
       FROM CONTRATOS c
       LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.id = ? AND c.empresa_id = ?`,
      [id, empresa_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    const c = contrato[0];

    if (!c.cli_cpf) {
      return res.status(400).json({ message: 'O cliente precisa ter CPF/CNPJ cadastrado' });
    }

    // Verifica se já tem assinatura ativa
    const assinaturaExistente = await dbQuery(
      "SELECT id FROM CONTRATO_ASSINATURAS WHERE contrato_id = ? AND status NOT IN ('CANCELLED', 'INACTIVE')",
      [id]
    );

    if (assinaturaExistente.length > 0) {
      return res.status(400).json({ message: 'Este contrato já possui uma assinatura ativa' });
    }

    // Cria/verifica customer no Asaas
    let customerId = c.asaas_customer_id;
    if (!customerId) {
      const customerResult = await asaasService.createCustomerForClient({
        cli_Id: c.cli_Id,
        cli_nome: c.cli_nome,
        cli_cpf: c.cli_cpf,
        cli_email: c.cli_email,
        cli_celular: c.cli_celular
      });
      customerId = customerResult.id;
    }

    // Mapa de billing types
    const billingTypeMap = {
      'Boleto': 'BOLETO',
      'Cartão': 'CREDIT_CARD',
      'PIX': 'PIX',
      'Todas': 'UNDEFINED'
    };

    const billingType = billingTypeMap[billing_type] || billing_type || 'UNDEFINED';

    // Cria assinatura no Asaas
    const subscription = await asaasService.createContractSubscription(customerId, {
      value: parseFloat(valor),
      nextDueDate: next_due_date,
      cycle: ciclo || 'MONTHLY',
      billingType,
      description: descricao || `Contrato ${c.numero || id} - ${c.cli_nome || ''}`,
      externalReference: `contrato_sub_${id}`
    });

    // Salva localmente
    await dbQuery(
      `INSERT INTO CONTRATO_ASSINATURAS
        (contrato_id, cli_id, asaas_subscription_id, asaas_customer_id, valor, ciclo, billing_type, descricao, status, next_due_date, dados_json, empresa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        c.cli_Id,
        subscription.id,
        customerId,
        subscription.value,
        subscription.cycle,
        subscription.billingType,
        descricao || null,
        subscription.status || 'ACTIVE',
        subscription.nextDueDate,
        JSON.stringify(subscription),
        empresa_id
      ]
    );

    return res.json({
      message: 'Assinatura criada com sucesso',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        value: subscription.value,
        nextDueDate: subscription.nextDueDate,
      }
    });
  } catch (error) {
    console.error('[Contratos] Erro ao criar assinatura:', error);
    return res.status(500).json({ message: error.message || 'Erro ao criar assinatura' });
  }
});

/**
 * GET /contratos/assinatura/:id - Busca assinatura ativa do contrato
 */
router.get('/assinatura/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const assinatura = await dbQuery(
      `SELECT * FROM CONTRATO_ASSINATURAS
       WHERE contrato_id = ? AND empresa_id = ? AND status NOT IN ('CANCELLED', 'INACTIVE')
       ORDER BY created_at DESC LIMIT 1`,
      [id, empresa_id]
    );

    if (assinatura.length === 0) {
      return res.json(null);
    }

    return res.json(assinatura[0]);
  } catch (error) {
    console.error('[Contratos] Erro ao buscar assinatura:', error);
    return res.status(500).json({ message: 'Erro ao buscar assinatura' });
  }
});

/**
 * GET /contratos/assinatura-pagamentos/:id - Lista pagamentos da assinatura
 */
router.get('/assinatura-pagamentos/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    // Busca assinatura do contrato
    const assinatura = await dbQuery(
      "SELECT * FROM CONTRATO_ASSINATURAS WHERE contrato_id = ? AND empresa_id = ? AND status NOT IN ('CANCELLED', 'INACTIVE') ORDER BY created_at DESC LIMIT 1",
      [id, empresa_id]
    );

    if (assinatura.length === 0) {
      return res.json([]);
    }

    // Busca pagamentos da assinatura no Asaas
    if (assinatura[0].asaas_subscription_id) {
      try {
        const payments = await asaasService.getSubscriptionPayments(assinatura[0].asaas_subscription_id);
        return res.json(payments?.data || []);
      } catch (err) {
        console.warn('[Contratos] Erro ao buscar pagamentos no Asaas:', err.message);
      }
    }

    return res.json([]);
  } catch (error) {
    console.error('[Contratos] Erro ao listar pagamentos da assinatura:', error);
    return res.status(500).json({ message: 'Erro ao listar pagamentos da assinatura' });
  }
});

/**
 * PUT /contratos/assinatura/:assinaturaId - Atualiza assinatura (valor, ciclo)
 */
router.put('/assinatura/:assinaturaId', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { assinaturaId } = req.params;
    const { valor, ciclo } = req.body;

    const assinatura = await dbQuery(
      'SELECT * FROM CONTRATO_ASSINATURAS WHERE id = ? AND empresa_id = ?',
      [assinaturaId, empresa_id]
    );

    if (assinatura.length === 0) {
      return res.status(404).json({ message: 'Assinatura não encontrada' });
    }

    // Atualiza no Asaas
    if (assinatura[0].asaas_subscription_id) {
      const updateData = {};
      if (valor) updateData.value = parseFloat(valor);
      if (ciclo) updateData.cycle = ciclo;

      await asaasService.asaasRequest(
        `/v3/subscriptions/${assinatura[0].asaas_subscription_id}`,
        'PUT',
        updateData
      );
    }

    // Atualiza local
    await dbQuery(
      'UPDATE CONTRATO_ASSINATURAS SET valor = COALESCE(?, valor), ciclo = COALESCE(?, ciclo) WHERE id = ? AND empresa_id = ?',
      [valor || null, ciclo || null, assinaturaId, empresa_id]
    );

    return res.json({ message: 'Assinatura atualizada com sucesso' });
  } catch (error) {
    console.error('[Contratos] Erro ao atualizar assinatura:', error);
    return res.status(500).json({ message: error.message || 'Erro ao atualizar assinatura' });
  }
});

/**
 * DELETE /contratos/assinatura/:assinaturaId - Cancela assinatura
 */
router.delete('/assinatura/:assinaturaId', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { assinaturaId } = req.params;

    const assinatura = await dbQuery(
      'SELECT * FROM CONTRATO_ASSINATURAS WHERE id = ? AND empresa_id = ?',
      [assinaturaId, empresa_id]
    );

    if (assinatura.length === 0) {
      return res.status(404).json({ message: 'Assinatura não encontrada' });
    }

    // Cancela no Asaas
    if (assinatura[0].asaas_subscription_id) {
      try {
        await asaasService.cancelSubscription(assinatura[0].asaas_subscription_id);
      } catch (err) {
        console.warn('[Contratos] Erro ao cancelar no Asaas:', err.message);
      }
    }

    // Atualiza local
    await dbQuery(
      'UPDATE CONTRATO_ASSINATURAS SET status = ? WHERE id = ? AND empresa_id = ?',
      ['CANCELLED', assinaturaId, empresa_id]
    );

    return res.json({ message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    console.error('[Contratos] Erro ao cancelar assinatura:', error);
    return res.status(500).json({ message: 'Erro ao cancelar assinatura' });
  }
});

// ============================================
// PAINEL DO CLIENTE (Dashboard)
// ============================================

/**
 * PUT /contratos/set-senha/:id - Definir/alterar senha do painel do cliente
 */
router.put('/set-senha/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { senha } = req.body;

    if (!senha || senha.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(senha, 10);

    await dbQuery(
      'UPDATE CONTRATOS SET dashboard_senha = ? WHERE id = ? AND empresa_id = ?',
      [hash, id, empresa_id]
    );

    return res.json({ message: 'Senha definida com sucesso' });
  } catch (error) {
    console.error('[Contratos] Erro ao definir senha:', error);
    return res.status(500).json({ message: 'Erro ao definir senha' });
  }
});

/**
 * GET /contratos/dashboard-link/:id - Retorna link do painel do cliente
 */
router.get('/dashboard-link/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const contrato = await dbQuery(
      'SELECT id, numero, dashboard_senha FROM CONTRATOS WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    if (!contrato[0].dashboard_senha) {
      return res.status(400).json({ message: 'Defina uma senha antes de gerar o link' });
    }

    const baseUrl = (process.env.APP_URL || 'https://daviot.com.br').replace(/\/+$/, '');
    const link = `${baseUrl}/contrato/painel/${contrato[0].numero || id}`;

    return res.json({ link });
  } catch (error) {
    console.error('[Contratos] Erro ao gerar link:', error);
    return res.status(500).json({ message: 'Erro ao gerar link do painel' });
  }
});

module.exports = router;
