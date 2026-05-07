import { isDaviot } from '@/utils/typeClient';
import { useAssinatura } from '@/composables/useAssinatura';

const menu = ref([]);

const mountMenu = () => {
  const { temFeature, isEmpresaPrincipal, carregarAssinatura } = useAssinatura();


  // Carrega a assinatura para ter as features disponíveis
  carregarAssinatura();

  menu.value = [
    {
      title: 'Início',
      icon: { icon: 'tabler-smart-home' },
      to: 'index',
      action: 'read',
      subject: 'all',
    },
    {
      title: 'Relatórios',
      icon: { icon: 'tabler-chart-pie-2' },
      subjectGeral: 'relatorio',
      children: [
        {
          title: 'Financeiro',
          icon: { icon: 'tabler-coin' },
          to: 'relatoriosFinanceiro',
          action: 'view',
          subject: 'relatorio_financeiro',
        },
        {
          title: 'Contratos',
          icon: { icon: 'tabler-file-text' },
          to: 'relatoriosContratos',
          action: 'view',
          subject: 'relatorio_financeiro',
        },
        {
          title: 'Orçamentos',
          icon: { icon: 'tabler-file-invoice' },
          to: 'relatoriosOrcamentos',
          action: 'view',
          subject: 'relatorio_financeiro',
        },
        {
          title: 'Comissões',
          icon: { icon: 'tabler-gift-card' },
          to: 'relatoriosComissoes',
          action: 'view',
          subject: 'relatorio_financeiro',
        },
        {
          title: 'Serviços',
          icon: { icon: 'tabler-tools' },
          to: 'relatoriosServicos',
          action: 'view',
          subject: 'relatorio_servicos',
        },
        {
          title: 'Agendamentos',
          icon: { icon: 'tabler-calendar' },
          to: 'relatoriosAgendamentos',
          action: 'view',
          subject: 'relatorio_agendamentos',
        },
        {
          title: 'CRM',
          icon: { icon: 'tabler-heart-handshake' },
          to: 'relatoriosCRM',
          action: 'view',
          subject: 'relatorio_crm',
          show: temFeature('acessoCRM'),
        },
        {
          title: 'Atendimento',
          icon: { icon: 'tabler-message-circle-2' },
          to: 'relatoriosAtendimento',
          action: 'view',
          subject: 'relatorio_crm',
          show: temFeature('acessoAtendimento'),
        }
      ]
    },
    {
      heading: 'Gestão',
      action: 'read',
      subject: 'all',
    },
    {
      title: 'Agendamentos',
      icon: { icon: 'tabler-calendar' },
      to: 'agendamento',
      subjectGeral: 'agendamento'
    },
    {
      title: 'Serviços',
      icon: { icon: 'tabler-tools' },
      to: 'servicos',
      subjectGeral: 'servico'
    },
    {
      title: 'Lembretes',
      icon: { icon: 'tabler-bell' },
      to: 'lembretes',
      action: 'read',
      subject: 'all',
    },
    ...(temFeature('gerenciamentoEstoque') ? [{
      title: 'Estoque',
      icon: { icon: 'tabler-package' },
      action: 'view',
      subject: 'estoque',
      children: [
        {
          title: 'Estoque',
          icon: { icon: 'tabler-package' },
          to: 'estoque',
          action: 'view',
          subject: 'estoque'
        },
        {
          title: 'Ordens de Entrada',
          icon: { icon: 'tabler-package-import' },
          to: 'estoque-ordem-entrada',
          action: 'view',
          subject: 'estoque'
        },
        {
          title: 'Ordens de Retirada',
          icon: { icon: 'tabler-package-export' },
          to: 'estoque-ordem-retirada',
          action: 'view',
          subject: 'estoque'
        },
        {
          title: 'Setores',
          icon: { icon: 'tabler-building' },
          to: 'estoque-setores',
          action: 'view',
          subject: 'estoque'
        },
      ]
    }] : []),
    ...(temFeature('acessoCalculadora') ? [{
      title: 'Calculadora',
      icon: { icon: 'tabler-calculator' },
      to: 'calculadora',
      action: 'view',
      subject: 'calculadora'
    }] : []),
    {
      title: 'Clientes',
      icon: { icon: 'tabler-users-group' },
      to: 'clientes',
      subjectGeral: 'cliente'
    },
    ...(temFeature('acessoCRM') ? [{
      title: 'CRM',
      icon: { icon: 'tabler-heart-handshake' },
      subjectGeral: 'crm',
      children: [
        {
          title: 'Relacionamento',
          icon: { icon: 'tabler-filter-star' },
          subjectGeral: 'crm',
          isSubChild: true,
          children: [
            {
              title: 'Funil de Vendas',
              icon: { icon: 'tabler-filter' },
              to: 'crm-funis',
              action: 'view',
              subject: 'crm_funil_vendas'
            },
            {
              title: 'Atividades',
              icon: { icon: 'tabler-list-check' },
              to: 'crm-atividades-geral',
              action: 'view',
              subject: 'crm_funil_vendas'
            },
            {
              title: 'Anotações',
              icon: { icon: 'tabler-notes' },
              to: 'crm-anotacoes-geral',
              action: 'view',
              subject: 'crm_funil_vendas'
            }
          ]
        },
        {
          title: 'Disparos',
          icon: { icon: 'tabler-send' },
          subjectGeral: 'crm',
          isSubChild: true,
          children: [
            {
              title: 'Segmentações',
              icon: { icon: 'tabler-stack-front' },
              to: 'crm-segmentacoes',
              action: 'view',
              subject: 'crm_segmentacoes'
            },
            {
              title: 'Campanhas',
              icon: { icon: 'tabler-send' },
              to: 'crm-campanhas',
              action: 'view',
              subject: 'crm_campanhas'
            },
          ]
        },
        {
          title: 'Atendimento',
          icon: { icon: 'tabler-message-circle-2' },
          subjectGeral: 'crm',
          isSubChild: true,
          children: [
            {
              title: 'Chat',
              icon: { icon: 'tabler-message', size: 22 },
              to: 'crm-chat',
              action: 'view',
              subject: 'crm_chat'
            },
           /*  {
              title: 'Link de Atendimento',
              icon: { icon: 'tabler-link' },
              to: 'crm-link-atendimento',
              action: 'view',
              subject: 'crm_chat'
            }, */
            {
              title: 'Modelos de Mensagens',
              icon: { icon: 'tabler-layout-2' },
              to: 'crm-modelos',
              action: 'view',
              subject: 'crm_modelos_mensagens'
            },
            {
              title: 'Fluxos',
              icon: { icon: 'tabler-timeline-event' },
              to: 'crm-fluxos',
              action: 'view',
              subject: 'crm_fluxos'
            },
          ]
        },
        {
          title: 'Configurações CRM',
          icon: { icon: 'tabler-adjustments' },
          to: 'config-crm',
          subjectGeral: 'crm',
        }
      ]
    }] : []),
    {
      heading: 'Financeiro',
      subjectGeral: 'financeiro'
    },
    {
      title: 'Comissões',
      icon: { icon: 'tabler-gift-card' },
      to: 'comissoes',
      action: 'view',
      subject: 'financeiro_comissao'
    },
    {
      title: 'Contratos',
      icon: { icon: 'tabler-file-text' },
      subjectGeral: 'cliente',
      children: [
        {
          title: 'Contratos',
          icon: { icon: 'tabler-file-text' },
          to: 'contratos',
          action: 'view',
          subject: 'cliente'
        },
        {
          title: 'Modelos',
          icon: { icon: 'tabler-template' },
          to: 'contratos-modelos',
          action: 'view',
          subject: 'cliente'
        },
      ]
    },
    {
      title: 'Pagamentos',
      icon: { icon: 'tabler-coin' },
      action: 'read',
      subject: 'all',
      children: [
        {
          title: 'Receber',
          icon: { icon: 'tabler-wallet' },
          to: 'pagamentosReceber',
          action: 'view',
          subject: 'financeiro_recebimento'
        },
        {
          title: 'Pagar',
          icon: { icon: 'tabler-cash' },
          to: 'pagamentosPagar',
          action: 'view',
          subject: 'financeiro_despesa'
        }
      ],
    },
    {
      heading: 'Configurações',
      subjectGeral: 'config'
    },
    {
      title: 'Usuários',
      icon: { icon: 'tabler-user-cog' },
      to: 'usuarios',
      action: 'manage',
      subject: 'config_user'
    },
    {
      title: 'Configurações',
      icon: { icon: 'tabler-settings' },
      to: 'configuracoes',
      action: 'manage',
      subject: 'config_gerais'
    },
    {
      title: 'Minha Empresa',
      icon: { icon: 'tabler-building-store' },
      to: 'saas-minha-empresa',
      action: 'read',
      subject: 'all'
    },
  ]

  if (isDaviot() || import.meta.env.DEV) {
    menu.value.push(
      {
        title: 'Minha Assinatura',
        icon: { icon: 'tabler-credit-card' },
        to: 'saas-minha-assinatura',
        action: 'read',
        subject: 'all'
      },
      {
        title: 'SaaS',
        icon: { icon: 'tabler-building-community' },
        action: 'manage',
        subject: 'all',
        children: [
          {
            title: 'Empresas',
            icon: { icon: 'tabler-building' },
            to: 'saas-empresas',
            action: 'manage',
            subject: 'all'
          },
          {
            title: 'Planos',
            icon: { icon: 'tabler-receipt-dollar' },
            to: 'saas-planos',
            action: 'manage',
            subject: 'all'
          },
          {
            title: 'Assinaturas',
            icon: { icon: 'tabler-credit-card' },
            to: 'saas-assinaturas',
            action: 'manage',
            subject: 'all'
          },
          {
            title: 'Área de Ajuda',
            icon: { icon: 'tabler-help' },
            to: 'saas-ajuda',
            action: 'manage',
            subject: 'all'
          },
          {
            title: 'Configurações',
            icon: { icon: 'tabler-settings' },
            to: 'saas-configuracoes',
            action: 'manage',
            subject: 'all'
          }
        ]
      })
  }
}

mountMenu();

export default menu.value;
