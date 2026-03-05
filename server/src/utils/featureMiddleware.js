/**
 * Middleware de verificação de features do plano SaaS.
 * Verifica se a empresa do usuário logado tem acesso a uma feature específica.
 * empresa_id === 1 sempre tem acesso total (bypass).
 */

const dbQuery = require('./dbHelper');

/**
 * Busca a assinatura ativa da empresa e retorna as features do plano.
 * @param {number} empresaId - ID da empresa
 * @returns {object|null} - Features do plano ou null se não encontrar
 */
const getEmpresaFeatures = async (empresaId) => {
  const assinatura = await dbQuery(`
    SELECT p.features as plano_features
    FROM Assinaturas a
    LEFT JOIN Planos p ON a.plano_id = p.id
    WHERE a.empresa_id = ? AND a.status IN ('ativa', 'trial')
    ORDER BY a.created_at DESC LIMIT 1
  `, [empresaId]);

  if (!assinatura.length || !assinatura[0].plano_features) {
    return null;
  }

  try {
    return JSON.parse(assinatura[0].plano_features);
  } catch {
    return null;
  }
};

/**
 * Middleware que verifica se a empresa tem acesso a uma feature específica.
 * @param {string} featureName - Nome da feature (ex: 'gerenciamentoEstoque', 'acessoCRM', 'acessoCalculadora')
 */
const checkFeature = (featureName) => async (req, res, next) => {
  try {
    const empresaId = req.user?.empresa_id;

    // empresa_id 1 = empresa dona do sistema, bypass total
    if (!empresaId || empresaId === 1) {
      return next();
    }

    const features = await getEmpresaFeatures(empresaId);

    if (!features) {
      return res.status(403).json({ error: 'Nenhuma assinatura ativa encontrada. Acesso negado.' });
    }

    if (!features[featureName]) {
      return res.status(403).json({ error: 'Seu plano não inclui acesso a este recurso.' });
    }

    next();
  } catch (error) {
    console.error('[FeatureMiddleware] Erro ao verificar feature:', error);
    res.status(500).json({ error: 'Erro ao verificar permissões do plano.' });
  }
};

/**
 * Middleware que verifica se a empresa atingiu o limite de funcionários do plano.
 * Usado ao criar novos usuários.
 */
const checkEmployeeLimit = () => async (req, res, next) => {
  try {
    const empresaId = req.user?.empresa_id;

    // empresa_id 1 = empresa dona do sistema, bypass total
    if (!empresaId || empresaId === 1) {
      return next();
    }

    const features = await getEmpresaFeatures(empresaId);

    if (!features) {
      return res.status(403).json({ error: 'Nenhuma assinatura ativa encontrada. Acesso negado.' });
    }

    const limite = features.qtdFuncionarios;
    if (!limite || limite <= 0) {
      return res.status(403).json({ error: 'Seu plano não permite cadastrar funcionários.' });
    }

    // Contar usuários ativos da empresa
    const resultado = await dbQuery(
      'SELECT COUNT(*) as total FROM User WHERE empresa_id = ? AND ativo = 1',
      [empresaId]
    );

    const totalAtual = resultado[0]?.total || 0;

    if (totalAtual >= limite) {
      return res.status(403).json({
        error: `Limite de ${limite} funcionário(s) atingido. Faça upgrade do plano para adicionar mais.`
      });
    }

    next();
  } catch (error) {
    console.error('[FeatureMiddleware] Erro ao verificar limite de funcionários:', error);
    res.status(500).json({ error: 'Erro ao verificar permissões do plano.' });
  }
};

module.exports = {
  checkFeature,
  checkEmployeeLimit,
  getEmpresaFeatures
};
