/**
 * Rotas da Calculadora de Precificação
 * CRUD de configurações e orçamentos
 */

const express = require('express');
const router = express.Router();
const dbQuery = require('../database');
const { calculateDistance } = require('../utils/distanceHelper');
const { createOrcamento } = require('../utils/generatePDF');
const { getNegociosCliente, registrarOrcamentoNosNegocios } = require('../utils/negocioHelper');

/**
 * Helper: monta condição para empresa_id (trata NULL)
 */
const empresaWhere = (empresa_id) => {
  if (empresa_id) return { sql: 'empresa_id = ?', params: [empresa_id] };
  return { sql: 'empresa_id IS NULL', params: [] };
};

// ============================================
// CONFIGURAÇÕES
// ============================================

/**
 * GET /calculadora/config - Buscar config da empresa do usuário logado
 */
router.get('/config', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const ew = empresaWhere(empresa_id);
    const rows = await dbQuery(`SELECT * FROM Calculadora_Config WHERE ${ew.sql} LIMIT 1`, ew.params);

    if (rows.length > 0) {
      const config = rows[0];
      // Parse materiais JSON
      if (config.materiais && typeof config.materiais === 'string') {
        config.materiais = JSON.parse(config.materiais);
      }
      res.json(config);
    } else {
      // Retorna config padrão (sem salvar ainda)
      res.json({
        id: null,
        empresa_id,
        materiais: [],
        combustivel_custo_litro: 6.00,
        veiculo_km_por_litro: 10.00,
        dias_trabalhados_mes: 22,
        meta_mensal: 10000.00,
        horas_por_dia: 8,
        margem_padrao: 30.00,
        custos_fixos_mensais: 0.00
      });
    }
  } catch (error) {
    console.error('Erro ao buscar config da calculadora:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

/**
 * POST /calculadora/config - Salvar/atualizar config (upsert por empresa_id)
 */
router.post('/config', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      materiais,
      combustivel_custo_litro,
      veiculo_km_por_litro,
      dias_trabalhados_mes,
      meta_mensal,
      horas_por_dia,
      margem_padrao,
      custos_fixos_mensais,
      endereco_base
    } = req.body;

    const materiaisJSON = materiais ? JSON.stringify(materiais) : '[]';

    // Verifica se já existe config para essa empresa
    const ew = empresaWhere(empresa_id);
    const existing = await dbQuery(`SELECT id FROM Calculadora_Config WHERE ${ew.sql} LIMIT 1`, ew.params);

    if (existing.length > 0) {
      await dbQuery(
        `UPDATE Calculadora_Config SET
          materiais = ?, combustivel_custo_litro = ?, veiculo_km_por_litro = ?,
          dias_trabalhados_mes = ?, meta_mensal = ?, horas_por_dia = ?,
          margem_padrao = ?, custos_fixos_mensais = ?, endereco_base = ?
        WHERE ${ew.sql}`,
        [materiaisJSON, combustivel_custo_litro, veiculo_km_por_litro,
         dias_trabalhados_mes, meta_mensal, horas_por_dia,
         margem_padrao, custos_fixos_mensais, endereco_base || null, ...ew.params]
      );
    } else {
      await dbQuery(
        `INSERT INTO Calculadora_Config
          (empresa_id, materiais, combustivel_custo_litro, veiculo_km_por_litro,
           dias_trabalhados_mes, meta_mensal, horas_por_dia, margem_padrao, custos_fixos_mensais, endereco_base)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [empresa_id, materiaisJSON, combustivel_custo_litro, veiculo_km_por_litro,
         dias_trabalhados_mes, meta_mensal, horas_por_dia, margem_padrao, custos_fixos_mensais, endereco_base || null]
      );
    }

    res.json({ success: true, message: 'Configurações salvas com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar config da calculadora:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// ============================================
// DISTÂNCIA
// ============================================

/**
 * GET /calculadora/distancia - Calcula distância entre endereço base e endereço do cliente
 * Query: endereco_cliente (string)
 * Retorna: { distancia_km, endereco_origem, endereco_cliente_formatado }
 */
router.get('/distancia', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { endereco_cliente } = req.query;

    if (!endereco_cliente) {
      return res.status(400).json({ error: 'Informe o endereço do cliente' });
    }

    // 1. Buscar endereço base da config
    const ew = empresaWhere(empresa_id);
    const configRows = await dbQuery(`SELECT endereco_base FROM Calculadora_Config WHERE ${ew.sql} LIMIT 1`, ew.params);
    let endereco_origem = configRows.length > 0 ? configRows[0].endereco_base : null;

    // 2. Se não tiver endereço base na config, buscar da empresa
    if (!endereco_origem && empresa_id) {
      const empresaRows = await dbQuery(
        `SELECT endereco, numero, bairro, cidade, estado, cep FROM Empresas WHERE id = ? LIMIT 1`,
        [empresa_id]
      );
      if (empresaRows.length > 0) {
        const emp = empresaRows[0];
        const partes = [emp.endereco, emp.numero, emp.bairro, emp.cidade, emp.estado, emp.cep].filter(Boolean);
        endereco_origem = partes.join(', ');
      }
    }

    if (!endereco_origem) {
      return res.status(400).json({ error: 'Nenhum endereço base configurado. Configure nas configurações da calculadora ou cadastre o endereço da empresa.' });
    }

    // 3. Calcular distância usando distanceHelper
    const resultado = await calculateDistance(endereco_origem, endereco_cliente);

    if (!resultado.sucesso) {
      return res.status(422).json({ error: resultado.erro || 'Não foi possível calcular a distância' });
    }

    res.json({
      distancia_km: Math.round(resultado.distancia * 100) / 100,
      endereco_origem: resultado.endereco1_formatted,
      endereco_cliente_formatado: resultado.endereco2_formatted
    });
  } catch (error) {
    console.error('Erro ao calcular distância:', error);
    res.status(500).json({ error: 'Erro ao calcular distância' });
  }
});

// ============================================
// ORÇAMENTOS
// ============================================

/**
 * GET /calculadora/orcamentos - Listar orçamentos com paginação e busca
 */
router.get('/orcamentos', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { q, status, page = 1, itemsPerPage = 10, sortBy = 'id', orderBy = 'desc' } = req.query;

    const ew = empresaWhere(empresa_id);
    let where = `WHERE ${ew.sql}`;
    const params = [...ew.params];

    if (q) {
      where += ' AND (cliente_nome LIKE ? OR tipo_servico LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    // Sanitizar sortBy para evitar SQL injection
    const allowedSorts = ['id', 'cliente_nome', 'tipo_servico', 'valor_final', 'status', 'created_at'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'id';
    const safeOrderBy = orderBy === 'asc' ? 'ASC' : 'DESC';

    const countResult = await dbQuery(`SELECT COUNT(*) as total FROM Calculadora_Orcamentos ${where}`, params);
    const total = countResult[0].total;

    const offset = (parseInt(page) - 1) * parseInt(itemsPerPage);
    const rows = await dbQuery(
      `SELECT * FROM Calculadora_Orcamentos ${where} ORDER BY ${safeSortBy} ${safeOrderBy} LIMIT ? OFFSET ?`,
      [...params, parseInt(itemsPerPage), offset]
    );

    // Parse JSON fields
    rows.forEach(row => {
      if (row.materiais_usados && typeof row.materiais_usados === 'string') {
        row.materiais_usados = JSON.parse(row.materiais_usados);
      }
      if (row.servicos && typeof row.servicos === 'string') {
        row.servicos = JSON.parse(row.servicos);
      }
      if (row.negocios_ids && typeof row.negocios_ids === 'string') {
        try { row.negocios_ids = JSON.parse(row.negocios_ids); } catch { row.negocios_ids = []; }
      }
    });

    res.json({ orcamentos: rows, total });
  } catch (error) {
    console.error('Erro ao listar orçamentos:', error);
    res.status(500).json({ error: 'Erro ao listar orçamentos' });
  }
});

/**
 * POST /calculadora/orcamentos - Criar orçamento
 */
router.post('/orcamentos', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const id_usuario = req.user.id;
    const {
      cliente_nome, cliente_telefone, cliente_endereco,
      servicos, tipo_servico, horas_trabalho, distancia_km,
      materiais_usados, custo_materiais, custo_mao_obra,
      custo_deslocamento, custo_fixo_rateado, valor_custo_total,
      margem_aplicada, valor_final, observacoes, status,
      cli_Id, modelo_id, conteudo_html_customizado, negocios_ids,
      mover_negocios_etapa_id, validade_dias, condicoes_pagamento,
      desconto, desconto_tipo, valor_original
    } = req.body;

    const result = await dbQuery(
      `INSERT INTO Calculadora_Orcamentos
        (empresa_id, id_usuario, cliente_nome, cliente_telefone, cliente_endereco,
         servicos, tipo_servico, horas_trabalho, distancia_km, materiais_usados,
         custo_materiais, custo_mao_obra, custo_deslocamento, custo_fixo_rateado,
         valor_custo_total, margem_aplicada, valor_final, observacoes, status,
         cli_Id, modelo_id, conteudo_html_customizado, negocios_ids,
         mover_negocios_etapa_id, validade_dias, condicoes_pagamento,
         desconto, desconto_tipo, valor_original)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empresa_id, id_usuario, cliente_nome, cliente_telefone, cliente_endereco,
       servicos ? JSON.stringify(servicos) : '[]',
       tipo_servico, horas_trabalho || 0, distancia_km || 0,
       materiais_usados ? JSON.stringify(materiais_usados) : '[]',
       custo_materiais || 0, custo_mao_obra || 0, custo_deslocamento || 0,
       custo_fixo_rateado || 0, valor_custo_total || 0, margem_aplicada || 0,
       valor_final || 0, observacoes, status || 'gerado',
       cli_Id || null, modelo_id || null, conteudo_html_customizado || null,
       negocios_ids ? JSON.stringify(negocios_ids) : null,
       mover_negocios_etapa_id || null, validade_dias || 30,
       condicoes_pagamento || null, desconto || 0, desconto_tipo || 'percentual',
       valor_original || null]
    );

    const orcamentoId = result.insertId;

    // Registrar nos negócios vinculados e mover etapa se necessário
    if (negocios_ids && negocios_ids.length > 0) {
      await registrarOrcamentoNosNegocios({
        orcamentoId,
        negociosIds: negocios_ids,
        evento: 'orcamento-criado',
        empresa_id,
        dadosExtra: { valor: valor_final, feitoPor: req.user?.fullName || 'Sistema' }
      });

      // Mover negócios para etapa selecionada
      if (mover_negocios_etapa_id) {
        for (const negId of negocios_ids) {
          try {
            await dbQuery(
              'UPDATE Negocios SET etapaId = ? WHERE id = ? AND empresa_id = ?',
              [mover_negocios_etapa_id, negId, empresa_id]
            );
          } catch (err) {
            console.error(`Erro ao mover negócio ${negId}:`, err);
          }
        }
      }
    }

    res.json({ success: true, id: orcamentoId, message: 'Orçamento criado com sucesso' });
  } catch (error) {
    console.error('Erro ao criar orçamento:', error);
    res.status(500).json({ error: 'Erro ao criar orçamento' });
  }
});

/**
 * PUT /calculadora/orcamentos/:id - Atualizar orçamento
 */
router.put('/orcamentos/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const {
      cliente_nome, cliente_telefone, cliente_endereco,
      servicos, tipo_servico, horas_trabalho, distancia_km,
      materiais_usados, custo_materiais, custo_mao_obra,
      custo_deslocamento, custo_fixo_rateado, valor_custo_total,
      margem_aplicada, valor_final, observacoes, status,
      cli_Id, modelo_id, conteudo_html_customizado, negocios_ids,
      mover_negocios_etapa_id, validade_dias, condicoes_pagamento,
      desconto, desconto_tipo, valor_original
    } = req.body;

    // Verificar que pertence à empresa
    const ew = empresaWhere(empresa_id);
    const existing = await dbQuery(`SELECT id FROM Calculadora_Orcamentos WHERE id = ? AND ${ew.sql}`, [id, ...ew.params]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    await dbQuery(
      `UPDATE Calculadora_Orcamentos SET
        cliente_nome = ?, cliente_telefone = ?, cliente_endereco = ?,
        servicos = ?, tipo_servico = ?, horas_trabalho = ?, distancia_km = ?,
        materiais_usados = ?, custo_materiais = ?, custo_mao_obra = ?,
        custo_deslocamento = ?, custo_fixo_rateado = ?, valor_custo_total = ?,
        margem_aplicada = ?, valor_final = ?, observacoes = ?, status = ?,
        cli_Id = ?, modelo_id = ?, conteudo_html_customizado = ?, negocios_ids = ?,
        mover_negocios_etapa_id = ?, validade_dias = ?, condicoes_pagamento = ?,
        desconto = ?, desconto_tipo = ?, valor_original = ?
      WHERE id = ? AND ${ew.sql}`,
      [cliente_nome, cliente_telefone, cliente_endereco,
       servicos ? JSON.stringify(servicos) : '[]',
       tipo_servico, horas_trabalho || 0, distancia_km || 0,
       materiais_usados ? JSON.stringify(materiais_usados) : '[]',
       custo_materiais || 0, custo_mao_obra || 0, custo_deslocamento || 0,
       custo_fixo_rateado || 0, valor_custo_total || 0, margem_aplicada || 0,
       valor_final || 0, observacoes, status || 'gerado',
       cli_Id || null, modelo_id || null, conteudo_html_customizado || null,
       negocios_ids ? JSON.stringify(negocios_ids) : null,
       mover_negocios_etapa_id || null, validade_dias || 30,
       condicoes_pagamento || null, desconto || 0, desconto_tipo || 'percentual',
       valor_original || null,
       id, ...ew.params]
    );

    res.json({ success: true, message: 'Orçamento atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar orçamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar orçamento' });
  }
});

/**
 * PATCH /calculadora/orcamentos/:id/status - Alterar status do orçamento
 */
router.patch('/orcamentos/:id/status', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { status } = req.body;

    const statusValidos = ['gerado', 'enviado', 'aceito', 'negado', 'fechado'];
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const ew = empresaWhere(empresa_id);

    // Buscar orçamento para verificar negócios vinculados
    const [orc] = await dbQuery(
      `SELECT id, negocios_ids, valor_final FROM Calculadora_Orcamentos WHERE id = ? AND ${ew.sql}`,
      [id, ...ew.params]
    );

    if (!orc) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    await dbQuery(
      `UPDATE Calculadora_Orcamentos SET status = ? WHERE id = ? AND ${ew.sql}`,
      [status, id, ...ew.params]
    );

    // Propagar evento para negócios vinculados
    let negociosIds = orc.negocios_ids;
    if (negociosIds && typeof negociosIds === 'string') {
      try { negociosIds = JSON.parse(negociosIds); } catch { negociosIds = null; }
    }

    if (negociosIds && negociosIds.length > 0) {
      const eventoMap = {
        'enviado': 'orcamento-enviado',
        'aceito': 'orcamento-aceito',
        'negado': 'orcamento-negado'
      };

      if (eventoMap[status]) {
        await registrarOrcamentoNosNegocios({
          orcamentoId: id,
          negociosIds,
          evento: eventoMap[status],
          empresa_id,
          dadosExtra: { valor: orc.valor_final, feitoPor: req.user?.fullName || 'Sistema' }
        });
      }
    }

    res.json({ success: true, message: 'Status atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar status do orçamento:', error);
    res.status(500).json({ error: 'Erro ao alterar status' });
  }
});

/**
 * DELETE /calculadora/orcamentos/:id - Deletar orçamento
 */
router.delete('/orcamentos/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const ew = empresaWhere(empresa_id);
    const result = await dbQuery(`DELETE FROM Calculadora_Orcamentos WHERE id = ? AND ${ew.sql}`, [id, ...ew.params]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    res.json({ success: true, message: 'Orçamento excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir orçamento:', error);
    res.status(500).json({ error: 'Erro ao excluir orçamento' });
  }
});

/**
 * GET /calculadora/orcamentos/:id/pdf - Gerar PDF do orçamento
 */
router.get('/orcamentos/:id/pdf', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const ew = empresaWhere(empresa_id);
    const rows = await dbQuery(
      `SELECT * FROM Calculadora_Orcamentos WHERE id = ? AND ${ew.sql}`,
      [id, ...ew.params]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    const orc = rows[0];

    // Parse JSON fields
    if (orc.materiais_usados && typeof orc.materiais_usados === 'string') {
      orc.materiais_usados = JSON.parse(orc.materiais_usados);
    }
    if (orc.servicos && typeof orc.servicos === 'string') {
      orc.servicos = JSON.parse(orc.servicos);
    }
    // Fallback: se não tem servicos JSON, reconstruir do legado
    if (!orc.servicos || !Array.isArray(orc.servicos) || orc.servicos.length === 0) {
      orc.servicos = orc.tipo_servico
        ? [{ nome: orc.tipo_servico, tipo: 'horas', horas: orc.horas_trabalho || 0, valor: 0, valor_ref: null }]
        : [];
    }

    // Formatar data
    const moment = require('moment');
    const dataFormatada = orc.created_at ? moment(orc.created_at).format('DD/MM/YYYY') : moment().format('DD/MM/YYYY');

    const result = await createOrcamento({
      id: orc.id,
      data: dataFormatada,
      cliente_nome: orc.cliente_nome,
      cliente_telefone: orc.cliente_telefone,
      cliente_endereco: orc.cliente_endereco,
      servicos: orc.servicos,
      tipo_servico: orc.tipo_servico,
      horas_trabalho: orc.horas_trabalho,
      distancia_km: orc.distancia_km,
      materiais_usados: orc.materiais_usados || [],
      custo_materiais: orc.custo_materiais,
      custo_mao_obra: orc.custo_mao_obra,
      custo_deslocamento: orc.custo_deslocamento,
      custo_fixo_rateado: orc.custo_fixo_rateado,
      valor_custo_total: orc.valor_custo_total,
      margem_aplicada: orc.margem_aplicada,
      valor_final: orc.valor_final,
      observacoes: orc.observacoes,
      empresa_id,
      conteudo_html_customizado: orc.conteudo_html_customizado,
      validade_dias: orc.validade_dias,
      condicoes_pagamento: orc.condicoes_pagamento,
      desconto: orc.desconto,
      desconto_tipo: orc.desconto_tipo,
      valor_original: orc.valor_original,
    });

    res.json({
      success: true,
      url: `/download/docs/orcamentos/${result.fileName}`
    });
  } catch (error) {
    console.error('Erro ao gerar PDF do orçamento:', error);
    res.status(500).json({ error: 'Erro ao gerar PDF do orçamento' });
  }
});

/**
 * GET /calculadora/negocios-cliente/:cli_Id - Retorna negócios ativos do cliente
 */
router.get('/negocios-cliente/:cli_Id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { cli_Id } = req.params;

    const negocios = await getNegociosCliente(parseInt(cli_Id), empresa_id);

    // Retornar apenas campos necessários para o selector
    const resultado = (negocios || []).map(n => ({
      id: n.id,
      title: n.title,
      valor: n.valor,
      status: n.status,
      etapa_nome: n.etapa_nome,
      etapaId: n.etapaId,
      created_at: n.created_at
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar negócios do cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar negócios do cliente' });
  }
});

/**
 * GET /calculadora/funis - Retorna etapas do funil para seleção
 */
router.get('/funis', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const ew = empresaWhere(empresa_id);

    const funis = await dbQuery(
      `SELECT id, nome, ordem FROM Funis WHERE ${ew.sql} ORDER BY ordem ASC`,
      [...ew.params]
    );

    res.json(funis || []);
  } catch (error) {
    console.error('Erro ao buscar funis:', error);
    res.status(500).json({ error: 'Erro ao buscar funis' });
  }
});

module.exports = router;
