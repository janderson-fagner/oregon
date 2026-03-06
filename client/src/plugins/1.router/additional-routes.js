
// 👉 Redirects
export const redirects = [
  // ℹ️ We are redirecting to different pages based on role.
  // NOTE: Role is just for UI purposes. ACL is based on abilities.
]
export const routes = [
  {
    path: '/',
    name: 'index',
    component: () => import('@/pages/home.vue'),
    meta: { action: 'read', subject: 'all', all: true },
  },

  //Ver usuário
  {
    path: '/apps/user/view/:id',
    name: 'usuario',
    component: () => import('@/pages/apps/user/view/[id].vue'),
    meta: { action: 'manage', subject: 'config_user', helpTopic: 'configuracoes' },
  },

  //Lista Usuários
  {
    path: '/apps/user/list',
    name: 'usuarios',
    component: () => import('@/pages/apps/user/list/index.vue'),
    meta: {
      action: 'manage',
      subject: 'config_user',
      helpTopic: 'configuracoes',
    },
  },

  //Nova Senha
  {
    path: '/redefinirSenha',
    name: 'redefinirSenha',
    component: () => import('@/pages/novaSenha.vue'),
    meta: {
      layout: 'blank',
      unauthenticatedOnly: true,
    },
  },

  //Agendamento
  {
    path: '/agendamento',
    name: 'agendamento',
    component: () => import('@/pages/apps/agendamentos/agendamentos-index.vue'),
    meta: { action: 'read', subject: 'all', all: true, helpTopic: 'agendamentos' },
  },

  //Clientes
  {
    path: '/clientes',
    name: 'clientes',
    component: () => import('@/pages/apps/clientes/clientes.vue'),
    meta: {
      action: 'view',
      subject: 'cliente',
      helpTopic: 'clientes',
    },
  },
  {
    path: '/cliente/:id',
    name: 'cliente',
    component: () => import('@/pages/apps/clientes/cliente.vue'),
    meta: {
      action: 'view',
      subject: 'crm_clientes',
      helpTopic: 'clientes',
    },
  },

  //Servicos
  {
    path: '/servicos',
    name: 'servicos',
    component: () => import('@/pages/apps/servicos/servicos.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente'],
      helpTopic: 'servicos',
    },
  },

  //Ordem de Serviço
  {
    path: '/ordem-servico/:age_id',
    name: 'ordem-servico',
    component: () => import('@/pages/apps/ordemServico/ordemServicoAssinatura.vue'),
    meta: {
      layout: 'blank',
      unauthenticatedOnly: true,
    },
  },

  //Configurações
  {
    path: '/configuracoes',
    name: 'configuracoes',
    component: () => import('@/pages/apps/config/config.vue'),
    meta: {
      action: 'manage',
      subject: 'config_gerais',
      helpTopic: 'configuracoes',
    },
  },

  //CRM
  {
    path: '/crm/config',
    name: 'config-crm',
    component: () => import('@/pages/apps/crm/config-crm.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/modelos',
    name: 'crm-modelos',
    component: () => import('@/pages/apps/crm/modelos.vue'),
    meta: {
      action: 'manage',
      subject: 'crm_modelos_mensagens',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/funis',
    name: 'crm-funis',
    component: () => import('@/pages/apps/crm/funis.vue'),
    meta: {
      action: 'view',
      subject: 'crm_funil_vendas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
   {
    path: '/crm/funis/negocio/:id',
    name: 'crm-funis-negocio',
    component: () => import('@/pages/apps/crm/negocio.vue'),
    meta: {
      action: 'view',
      subject: 'crm_funil_vendas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/atividades-geral',
    name: 'crm-atividades-geral',
    component: () => import('@/pages/apps/crm/atividades-geral.vue'),
    meta: {
      action: 'view',
      subject: 'crm_funil_vendas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/anotacoes-geral',
    name: 'crm-anotacoes-geral',
    component: () => import('@/pages/apps/crm/anotacoes-geral.vue'),
    meta: {
      action: 'view',
      subject: 'crm_funil_vendas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/fluxos',
    name: 'crm-fluxos',
    component: () => import('@/pages/apps/fluxo/fluxos-index.vue'),
    meta: {
      action: 'view',
      subject: 'crm_fluxos',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/segmentacoes',
    name: 'crm-segmentacoes',
    component: () => import('@/pages/apps/crm/segmentacoes.vue'),
    meta: {
      action: 'view',
      subject: 'crm_campanhas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/campanhas',
    name: 'crm-campanhas',
    component: () => import('@/pages/apps/crm/campanhas.vue'),
    meta: {
      action: 'view',
      subject: 'crm_campanhas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/campanha/:id?',
    name: 'crm-campanhas-id',
    component: () => import('@/pages/apps/crm/newCampanha.vue'),
    meta: {
      action: 'view',
      subject: 'crm_campanhas',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/link-atendimento',
    name: 'crm-link-atendimento',
    component: () => import('@/pages/apps/crm/linkAtendimento.vue'),
    meta: {
      action: 'view',
      subject: 'crm_chat',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },
  {
    path: '/crm/chat',
    name: 'crm-chat',
    component: () => import('@/pages/apps/crm/chat.vue'),
    meta: {
      action: 'view',
      subject: 'crm_chat',
      feature: 'acessoCRM',
      helpTopic: 'crm',
    },
  },

  //Comissoes
  {
    path: '/comissoes',
    name: 'comissoes',
    component: () => import('@/pages/apps/comissao/comissao-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'financeiro',
    },
  },

  //Estoque
  {
    path: '/estoque',
    name: 'estoque',
    component: () => import('@/pages/apps/estoque/estoque-index.vue'),
    meta: {
      action: 'view',
      subject: 'estoque',
      feature: 'gerenciamentoEstoque',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'estoque',
    },
  },
  {
    path: '/estoque/ordem-retirada',
    name: 'estoque-ordem-retirada',
    component: () => import('@/pages/apps/estoque/ordens-retirada-index.vue'),
    meta: {
      action: 'view',
      subject: 'estoque',
      feature: 'gerenciamentoEstoque',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'estoque',
    },
  },
  {
    path: '/estoque/ordem-entrada',
    name: 'estoque-ordem-entrada',
    component: () => import('@/pages/apps/estoque/ordens-entrada-index.vue'),
    meta: {
      action: 'view',
      subject: 'estoque',
      feature: 'gerenciamentoEstoque',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'estoque',
    },
  },
  {
    path: '/estoque/setores',
    name: 'estoque-setores',
    component: () => import('@/pages/apps/estoque/setores-index.vue'),
    meta: {
      action: 'view',
      subject: 'estoque',
      feature: 'gerenciamentoEstoque',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'estoque',
    },
  },

  //Lembretes
  {
    path: '/lembretes',
    name: 'lembretes',
    component: () => import('@/pages/apps/lembretes/lembretes-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'configuracoes',
    },
  },

  //Pagamentos
  {
    path: '/pagamentos',
    name: 'pagamentos',
    component: () => import('@/pages/apps/pagamentos/pagamentos-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'financeiro',
    },
  },

  //Pagamentos/Receber
  {
    path: '/pagamentos/receber',
    name: 'pagamentosReceber',
    component: () => import('@/pages/apps/pagamentos/pagamentos-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'financeiro',
    },
  },

  //Pagamentos/Pagar
  {
    path: '/pagamentos/pagar',
    name: 'pagamentosPagar',
    component: () => import('@/pages/apps/pagamentos/pagamentos-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'financeiro',
    },
  },

  //Pagamentos/Despesas
  {
    path: '/pagamentos/despesas',
    name: 'pagamentosDespesas',
    component: () => import('@/pages/apps/pagamentos/pagamentos-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'financeiro',
    },
  },

  //Pagamentos/Saídas
  {
    path: '/pagamentos/saidas',
    name: 'pagamentosSaidas',
    component: () => import('@/pages/apps/pagamentos/pagamentos-index.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente-senior', 'admin', 'gerente', 'financeiro'],
      helpTopic: 'financeiro',
    },
  },

  //Relatórios
  {
    path: '/relatorios',
    name: 'relatorios',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['financeiro', 'admin', 'gerente', 'atendente', 'atendente-senior'],
      helpTopic: 'relatorios',
    },
  },


  //Relatórios/Financeiro
  {
    path: '/relatorios/financeiro',
    name: 'relatoriosFinanceiro',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['financeiro', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

  //Relatórios/Comissões
  {
    path: '/relatorios/comissoes',
    name: 'relatoriosComissoes',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['financeiro', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

  //Relatórios/Serviços
  {
    path: '/relatorios/servicos',
    name: 'relatoriosServicos',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

  //Relatórios/Agendamentos
  {
    path: '/relatorios/agendamentos',
    name: 'relatoriosAgendamentos',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

  //Relatórios/CRM
  {
    path: '/relatorios/crm',
    name: 'relatoriosCRM',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

  //Relatórios/Atendimento
  {
    path: '/relatorios/atendimento',
    name: 'relatoriosAtendimento',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['atendente', 'atendente-senior', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

  //Relatórios/Contratos
  {
    path: '/relatorios/contratos',
    name: 'relatoriosContratos',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['financeiro', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },
  //Relatórios/Orçamentos
  {
    path: '/relatorios/orcamentos',
    name: 'relatoriosOrcamentos',
    component: () => import('@/pages/apps/relatorios/relatorios.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['financeiro', 'admin', 'gerente'],
      helpTopic: 'relatorios',
    },
  },

/*   {
    path: '/loginn',
    name: 'loginn',
    component: () => import('@/pages/login.vue'),
    meta: { layout: 'blank', unauthenticatedOnly: true },
  }, */

  //SaaS
  {
    path: '/saas/empresas',
    name: 'saas-empresas',
    component: () => import('@/pages/apps/saas/empresas.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['admin'],
    },
  },
  {
    path: '/saas/planos',
    name: 'saas-planos',
    component: () => import('@/pages/apps/saas/planos.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['admin'],
    },
  },
  {
    path: '/saas/assinaturas',
    name: 'saas-assinaturas',
    component: () => import('@/pages/apps/saas/assinaturas.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['admin'],
    },
  },
  {
    path: '/saas/ajuda',
    name: 'saas-ajuda',
    component: () => import('@/pages/apps/saas/ajuda.vue'),
    meta: {
      action: 'manage',
      subject: 'all',
      role: ['admin'],
    },
  },
  {
    path: '/saas/config',
    name: 'saas-configuracoes',
    component: () => import('@/pages/apps/saas/config.vue'),
    meta: {
      action: 'read',
      subject: 'all',
      role: ['admin'],
    },
  },
  {
    path: '/saas/minha-empresa',
    name: 'saas-minha-empresa',
    component: () => import('@/pages/apps/saas/minha-empresa.vue'),
    meta: {
      action: 'read',
      subject: 'all',
    },
  },
  {
    path: '/saas/minha-assinatura',
    name: 'saas-minha-assinatura',
    component: () => import('@/pages/apps/saas/minha-assinatura.vue'),
    meta: {
      action: 'read',
      subject: 'all',
    },
  },
  //Contratos
  {
    path: '/contratos',
    name: 'contratos',
    component: () => import('@/pages/apps/contratos/contratos.vue'),
    meta: {
      action: 'view',
      subject: 'cliente',
      helpTopic: 'financeiro',
    },
  },
  {
    path: '/contratos/modelos',
    name: 'contratos-modelos',
    component: () => import('@/pages/apps/contratos/modelos.vue'),
    meta: {
      action: 'view',
      subject: 'cliente',
      helpTopic: 'financeiro',
    },
  },
  {
    path: '/contrato/painel/:id',
    name: 'contrato-painel-cliente',
    component: () => import('@/pages/apps/contratos/painel-cliente.vue'),
    meta: {
      layout: 'blank',
      unauthenticatedOnly: true,
      public: true,
    },
  },
  {
    path: '/contrato/assinar/:token',
    name: 'contrato-assinatura-publica',
    component: () => import('@/pages/apps/contratos/assinatura-publica.vue'),
    meta: {
      layout: 'blank',
      unauthenticatedOnly: true,
    },
  },

  //Calculadora de Precificação
  {
    path: '/calculadora',
    name: 'calculadora',
    component: () => import('@/pages/apps/calculadora/index.vue'),
    meta: {
      action: 'view',
      subject: 'calculadora',
      feature: 'acessoCalculadora',
      helpTopic: 'servicos',
    },
  },

  {
    path: '/cadastro-empresa',
    name: 'cadastro',
    component: () => import('@/pages/cadastro-page.vue'),
    meta: {
      layout: 'blank',
      unauthenticatedOnly: true,
      public: true,
    },
  },
  {
    path: '/conheca',
    name: 'landing',
    component: () => import('@/pages/landing.vue'),
    meta: {
      layout: 'blank',
      unauthenticatedOnly: true,
      public: true,
    },
  },
]
