/**
 * Rotas públicas de Contratos - Assinatura remota do cliente
 * Sem autenticação - acesso via token
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const moment = require('moment');

moment.locale('pt-br');

const dbQuery = require('../database');
const { inserirAssinaturaDigitalDoc } = require('../utils/generatePDF');

// Upload de assinatura do cliente
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
 * GET /contrato-publico/assinatura/:token - Busca dados do contrato para assinatura
 */
router.get('/assinatura/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const contrato = await dbQuery(
      `SELECT c.id, c.numero, c.valor, c.inicio_data, c.periodo, c.periodo_type, c.status,
              c.pdf_gerado_url, c.conteudo_pdf_url, c.assinatura_empresa, c.assinatura_cliente,
              c.assinatura_token_expira,
              cl.cli_nome
       FROM CONTRATOS c
       LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.assinatura_token = ?`,
      [token]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado ou link inválido' });
    }

    const c = contrato[0];

    // Verifica se o token expirou
    if (c.assinatura_token_expira && moment(c.assinatura_token_expira).isBefore(moment())) {
      return res.status(410).json({ message: 'Link de assinatura expirado' });
    }

    // Verifica se já foi assinado pelo cliente
    if (c.assinatura_cliente) {
      return res.status(400).json({ message: 'Este contrato já foi assinado pelo cliente', assinado: true });
    }

    return res.json({
      id: c.id,
      numero: c.numero,
      valor: c.valor,
      inicio_data: c.inicio_data,
      periodo: c.periodo,
      periodo_type: c.periodo_type,
      status: c.status,
      pdfUrl: c.pdf_gerado_url || c.conteudo_pdf_url,
      cli_nome: c.cli_nome,
      assinatura_empresa: c.assinatura_empresa
    });
  } catch (error) {
    console.error('[Contratos Público] Erro ao buscar contrato:', error);
    return res.status(500).json({ message: 'Erro ao buscar contrato' });
  }
});

/**
 * POST /contrato-publico/assinar/:token - Cliente assina o contrato
 */
router.post('/assinar/:token', uploadAssinatura.single('assinatura'), async (req, res) => {
  try {
    const { token } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma assinatura enviada' });
    }

    let { assinaturaCoordinates } = req.body;

    if (!assinaturaCoordinates) {
      return res.status(400).json({ message: 'Coordenadas da assinatura inválidas' });
    }

    assinaturaCoordinates = JSON.parse(assinaturaCoordinates);

    // Busca contrato pelo token
    const contrato = await dbQuery(
      'SELECT * FROM CONTRATOS WHERE assinatura_token = ?',
      [token]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado ou link inválido' });
    }

    const c = contrato[0];

    // Verifica expiração
    if (c.assinatura_token_expira && moment(c.assinatura_token_expira).isBefore(moment())) {
      return res.status(410).json({ message: 'Link de assinatura expirado' });
    }

    // Verifica se já foi assinado
    if (c.assinatura_cliente) {
      return res.status(400).json({ message: 'Este contrato já foi assinado pelo cliente' });
    }

    const pdfPath = c.pdf_gerado_path || c.conteudo_pdf_path;

    if (!pdfPath) {
      return res.status(400).json({ message: 'Nenhum PDF encontrado para assinar' });
    }

    // Aplica assinatura digital
    const dadosDoc = {
      assinaturaData: {
        filePdf: {
          filePath: pdfPath,
          url: c.pdf_gerado_url || c.conteudo_pdf_url
        }
      },
      age_id: `contrato-${c.id}`
    };

    const documentoAssinado = await inserirAssinaturaDigitalDoc(dadosDoc, req.file.path, assinaturaCoordinates);

    if (!documentoAssinado) {
      return res.status(400).json({ message: 'Erro ao assinar o documento' });
    }

    // Atualiza contrato
    const assinaturaData = {
      assinado_em: moment().format('DD/MM/YYYY HH:mm:ss'),
      ip: req.ip || req.connection?.remoteAddress
    };

    const newUrl = `/download/docs/contratos/${c.id}/${path.basename(documentoAssinado.filePath)}`;

    // Determina novo status
    let newStatus = c.status;
    if (c.assinatura_empresa) {
      newStatus = 'ativo'; // Ambas assinaturas feitas
    } else {
      newStatus = 'assinado_cliente';
    }

    await dbQuery(
      `UPDATE CONTRATOS SET
        pdf_gerado_path = ?, pdf_gerado_url = ?,
        assinatura_cliente = ?, status = ?
       WHERE id = ?`,
      [documentoAssinado.filePath, newUrl, JSON.stringify(assinaturaData), newStatus, c.id]
    );

    return res.json({
      message: 'Contrato assinado com sucesso!',
      fileUrl: newUrl
    });
  } catch (error) {
    console.error('[Contratos Público] Erro ao assinar:', error);
    return res.status(500).json({ message: 'Erro ao assinar contrato' });
  }
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET_DASHBOARD = process.env.JWT_SECRET || 'oregon-contratos-dashboard-secret';

/**
 * Middleware para validar token JWT do dashboard do cliente
 */
const validateDashboardToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET_DASHBOARD);
    req.dashboardContrato = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
};

/**
 * POST /contrato-publico/dashboard/login - Login do painel do cliente
 */
router.post('/dashboard/login', async (req, res) => {
  try {
    const { numero, senha } = req.body;

    if (!numero || !senha) {
      return res.status(400).json({ message: 'Número do contrato e senha são obrigatórios' });
    }

    const contrato = await dbQuery(
      `SELECT c.id, c.numero, c.dashboard_senha, c.empresa_id, cl.cli_nome
       FROM CONTRATOS c LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.numero = ? AND c.empresa_id IS NOT NULL`,
      [numero]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    if (!contrato[0].dashboard_senha) {
      return res.status(400).json({ message: 'Painel não configurado para este contrato' });
    }

    const valid = await bcrypt.compare(senha, contrato[0].dashboard_senha);
    if (!valid) {
      return res.status(401).json({ message: 'Senha incorreta' });
    }

    const token = jwt.sign(
      { contrato_id: contrato[0].id, empresa_id: contrato[0].empresa_id },
      JWT_SECRET_DASHBOARD,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      contrato: {
        id: contrato[0].id,
        numero: contrato[0].numero,
        cli_nome: contrato[0].cli_nome,
      }
    });
  } catch (error) {
    console.error('[Contrato Dashboard] Erro no login:', error);
    return res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

/**
 * GET /contrato-publico/dashboard/dados - Dados do contrato
 */
router.get('/dashboard/dados', validateDashboardToken, async (req, res) => {
  try {
    const { contrato_id } = req.dashboardContrato;

    const contrato = await dbQuery(
      `SELECT c.id, c.numero, c.valor, c.inicio_data, c.periodo, c.periodo_type,
              c.status, c.pdf_gerado_url, c.conteudo_pdf_url, c.assinatura_cliente, c.assinatura_empresa,
              cl.cli_nome, cl.cli_email
       FROM CONTRATOS c LEFT JOIN CLIENTES cl ON c.cli_id = cl.cli_Id
       WHERE c.id = ?`,
      [contrato_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    return res.json(contrato[0]);
  } catch (error) {
    console.error('[Contrato Dashboard] Erro ao buscar dados:', error);
    return res.status(500).json({ message: 'Erro ao buscar dados' });
  }
});

/**
 * GET /contrato-publico/dashboard/pdf - URL do PDF do contrato
 */
router.get('/dashboard/pdf', validateDashboardToken, async (req, res) => {
  try {
    const { contrato_id } = req.dashboardContrato;

    const contrato = await dbQuery(
      'SELECT pdf_gerado_url, conteudo_pdf_url FROM CONTRATOS WHERE id = ?',
      [contrato_id]
    );

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    return res.json({ pdfUrl: contrato[0].pdf_gerado_url || contrato[0].conteudo_pdf_url });
  } catch (error) {
    console.error('[Contrato Dashboard] Erro ao buscar PDF:', error);
    return res.status(500).json({ message: 'Erro ao buscar PDF' });
  }
});

/**
 * GET /contrato-publico/dashboard/pagamentos - Lista cobranças
 */
router.get('/dashboard/pagamentos', validateDashboardToken, async (req, res) => {
  try {
    const { contrato_id } = req.dashboardContrato;

    const pagamentos = await dbQuery(
      'SELECT id, valor, data_vencimento, data_pagamento, status, forma_pagamento, invoice_url FROM CONTRATO_PAGAMENTOS WHERE contrato_id = ? ORDER BY data_vencimento DESC',
      [contrato_id]
    );

    return res.json(pagamentos);
  } catch (error) {
    console.error('[Contrato Dashboard] Erro ao buscar pagamentos:', error);
    return res.status(500).json({ message: 'Erro ao buscar pagamentos' });
  }
});

/**
 * GET /contrato-publico/dashboard/assinatura - Info da assinatura recorrente
 */
router.get('/dashboard/assinatura', validateDashboardToken, async (req, res) => {
  try {
    const { contrato_id } = req.dashboardContrato;

    const assinatura = await dbQuery(
      "SELECT id, valor, ciclo, billing_type, status, next_due_date, credit_card_last_digits, credit_card_brand FROM CONTRATO_ASSINATURAS WHERE contrato_id = ? AND status NOT IN ('CANCELLED', 'INACTIVE') ORDER BY created_at DESC LIMIT 1",
      [contrato_id]
    );

    return res.json(assinatura.length > 0 ? assinatura[0] : null);
  } catch (error) {
    console.error('[Contrato Dashboard] Erro ao buscar assinatura:', error);
    return res.status(500).json({ message: 'Erro ao buscar assinatura' });
  }
});

/**
 * POST /contrato-publico/dashboard/assinar - Cliente assina o contrato pelo painel
 */
router.post('/dashboard/assinar', validateDashboardToken, uploadAssinatura.single('assinatura'), async (req, res) => {
  try {
    const { contrato_id } = req.dashboardContrato;

    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma assinatura enviada' });
    }

    // Busca contrato
    const contrato = await dbQuery('SELECT * FROM CONTRATOS WHERE id = ?', [contrato_id]);

    if (contrato.length === 0) {
      return res.status(404).json({ message: 'Contrato não encontrado' });
    }

    const c = contrato[0];

    // Verifica se já foi assinado pelo cliente
    if (c.assinatura_cliente) {
      return res.status(400).json({ message: 'Este contrato já foi assinado pelo cliente' });
    }

    const pdfPath = c.pdf_gerado_path || c.conteudo_pdf_path;
    if (!pdfPath) {
      return res.status(400).json({ message: 'Nenhum PDF encontrado para assinar' });
    }

    // Usa coordenadas do body ou posição fixa (área "Assinatura do Cliente")
    let coords = req.body.assinaturaCoordinates;
    if (coords) {
      coords = typeof coords === 'string' ? JSON.parse(coords) : coords;
    } else {
      // Determina número de páginas do PDF e coloca na última página, lado direito
      const { PDFDocument: PDFDocL } = require('pdf-lib');
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocL.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();
      coords = { page: totalPages, xNorm: 0.52, yNorm: 0.78, wNorm: 0.35, hNorm: 0.08 };
    }

    // Aplica assinatura digital
    const dadosDoc = {
      assinaturaData: {
        filePdf: {
          filePath: pdfPath,
          url: c.pdf_gerado_url || c.conteudo_pdf_url
        }
      },
      age_id: `contrato-${c.id}`
    };

    const documentoAssinado = await inserirAssinaturaDigitalDoc(dadosDoc, req.file.path, coords);

    if (!documentoAssinado) {
      return res.status(400).json({ message: 'Erro ao assinar o documento' });
    }

    // Atualiza contrato
    const assinaturaData = {
      assinado_em: moment().format('DD/MM/YYYY HH:mm:ss'),
      ip: req.ip || req.connection?.remoteAddress
    };

    const newUrl = `/download/docs/contratos/${c.id}/${path.basename(documentoAssinado.filePath)}`;

    // Determina novo status
    let newStatus = c.status;
    if (c.assinatura_empresa) {
      newStatus = 'ativo'; // Ambas assinaturas feitas
    } else {
      newStatus = 'assinado_cliente';
    }

    await dbQuery(
      `UPDATE CONTRATOS SET
        pdf_gerado_path = ?, pdf_gerado_url = ?,
        assinatura_cliente = ?, status = ?
       WHERE id = ?`,
      [documentoAssinado.filePath, newUrl, JSON.stringify(assinaturaData), newStatus, c.id]
    );

    return res.json({
      message: 'Contrato assinado com sucesso!',
      fileUrl: newUrl
    });
  } catch (error) {
    console.error('[Contrato Dashboard] Erro ao assinar:', error);
    return res.status(500).json({ message: 'Erro ao assinar contrato' });
  }
});

/**
 * PUT /contrato-publico/dashboard/cartao - Atualizar cartão de crédito
 */
router.put('/dashboard/cartao', validateDashboardToken, async (req, res) => {
  try {
    const { contrato_id } = req.dashboardContrato;
    const { creditCard, creditCardHolderInfo } = req.body;

    if (!creditCard || !creditCardHolderInfo) {
      return res.status(400).json({ message: 'Dados do cartão são obrigatórios' });
    }

    const assinatura = await dbQuery(
      "SELECT * FROM CONTRATO_ASSINATURAS WHERE contrato_id = ? AND status NOT IN ('CANCELLED', 'INACTIVE') ORDER BY created_at DESC LIMIT 1",
      [contrato_id]
    );

    if (assinatura.length === 0 || !assinatura[0].asaas_subscription_id) {
      return res.status(400).json({ message: 'Nenhuma assinatura ativa encontrada' });
    }

    const asaasService = require('../services/asaasService');
    await asaasService.updateSubscriptionCreditCard(
      assinatura[0].asaas_subscription_id,
      creditCard,
      creditCardHolderInfo
    );

    // Atualiza dados do cartão localmente
    const lastDigits = creditCard.number ? creditCard.number.slice(-4) : null;
    await dbQuery(
      'UPDATE CONTRATO_ASSINATURAS SET credit_card_last_digits = ?, billing_type = ? WHERE id = ?',
      [lastDigits, 'CREDIT_CARD', assinatura[0].id]
    );

    return res.json({ message: 'Cartão atualizado com sucesso' });
  } catch (error) {
    console.error('[Contrato Dashboard] Erro ao atualizar cartão:', error);
    return res.status(500).json({ message: error.message || 'Erro ao atualizar cartão' });
  }
});

module.exports = router;
