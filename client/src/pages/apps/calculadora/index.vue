<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import { can } from "@layouts/plugins/casl";
import ModeloOrcamentoDialog from "@/views/apps/calculadora/ModeloOrcamentoDialog.vue";
import NegociosSelectorDialog from "@/views/apps/calculadora/NegociosSelectorDialog.vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";

const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(false);
const tabAtual = ref("calculadora");

// ============================================
// PERMISSÕES
// ============================================
if (!can("view", "calculadora") && !can("manage", "calculadora")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

const canCreate = computed(
  () => can("create", "calculadora") || can("manage", "calculadora")
);
const canManageConfig = computed(
  () => can("manage", "calculadora_config") || can("manage", "calculadora")
);

// ============================================
// MODELOS DE ORÇAMENTO
// ============================================
const modelos = ref([]);
const modeloDialogOpen = ref(false);
const modeloEditData = ref(null);

const getModelos = async () => {
  try {
    const res = await $api("/orcamento-modelos/list", { method: "GET" });
    modelos.value = res || [];
  } catch (error) {
    console.error("Erro ao buscar modelos:", error);
  }
};

const editarModelo = async (modelo) => {
  try {
    const res = await $api(`/orcamento-modelos/get/${modelo.id}`, { method: "GET" });
    modeloEditData.value = res;
    modeloDialogOpen.value = true;
  } catch (error) {
    console.error("Erro ao buscar modelo:", error);
  }
};

const novoModelo = () => {
  modeloEditData.value = null;
  modeloDialogOpen.value = true;
};

const excluirModelo = async (modelo) => {
  if (!confirm(`Excluir modelo "${modelo.titulo}"?`)) return;
  try {
    await $api(`/orcamento-modelos/delete/${modelo.id}`, { method: "DELETE" });
    setAlert("Modelo removido!", "success", "tabler-check", 3000);
    getModelos();
  } catch (error) {
    setAlert("Erro ao remover modelo", "error", "tabler-x", 3000);
  }
};

// ============================================
// DESCONTO & TEMPLATE & CRM (NOVO)
// ============================================
const modelosDisponiveis = ref([]);
const modeloSelecionado = ref(null);
const showConteudoHtml = ref(false);
const conteudoHtmlCustomizado = ref(null);
const descontoAtivo = ref(false);
const descontoTipo = ref("percentual");
const descontoValor = ref(0);
const condicoesPagamento = ref("");
const validadeDias = ref(30);
const cliIdSelecionado = ref(null);

// CRM
const negociosCliente = ref([]);
const negociosDialogOpen = ref(false);
const negociosSelecionados = ref([]);
const moverNegociosEtapaId = ref(null);

const toolbarOptionsOrc = [
  [{ header: 1 }, { header: 2 }],
  ["bold", "italic", "underline"],
  [{ color: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["clean"],
];

const carregarModelosDisponiveis = async () => {
  try {
    const res = await $api("/orcamento-modelos/list", { method: "GET" });
    modelosDisponiveis.value = (res || []).map((m) => ({
      title: m.titulo,
      value: m.id,
    }));
  } catch (error) {
    console.error("Erro ao buscar modelos:", error);
  }
};

const onModeloChange = async (modeloId) => {
  if (!modeloId) return;
  try {
    const res = await $api(`/orcamento-modelos/get/${modeloId}`, { method: "GET" });
    if (res?.conteudo_html) {
      conteudoHtmlCustomizado.value = res.conteudo_html;
      showConteudoHtml.value = true;
    }
  } catch (error) {
    console.error("Erro ao carregar modelo:", error);
  }
};

const valorOriginalComputado = computed(() => {
  return valorFinal.value;
});

const valorComDesconto = computed(() => {
  if (!descontoAtivo.value || !descontoValor.value) return valorFinal.value;
  if (descontoTipo.value === "percentual") {
    return valorFinal.value * (1 - descontoValor.value / 100);
  }
  return Math.max(0, valorFinal.value - descontoValor.value);
});

const buscarNegociosCliente = async (cliId) => {
  if (!cliId) {
    negociosCliente.value = [];
    return;
  }
  try {
    const res = await $api(`/calculadora/negocios-cliente/${cliId}`, { method: "GET" });
    negociosCliente.value = res || [];
  } catch (error) {
    console.error("Erro ao buscar negócios:", error);
    negociosCliente.value = [];
  }
};

const onNegociosConfirmed = ({ negociosIds, moverEtapaId }) => {
  negociosSelecionados.value = negociosIds;
  moverNegociosEtapaId.value = moverEtapaId;
};

// ============================================
// CONFIGURAÇÕES
// ============================================
const config = ref({
  materiais: [],
  combustivel_custo_litro: 6.0,
  veiculo_km_por_litro: 10.0,
  dias_trabalhados_mes: 22,
  meta_mensal: 10000.0,
  horas_por_dia: 8,
  margem_padrao: 30.0,
  custos_fixos_mensais: 0.0,
  endereco_base: "",
});

const savingConfig = ref(false);

// Novo material temp
const novoMaterial = ref({
  nome: "",
  unidade: "ML",
  tamanho_unidade: 1000,
  custo_unitario: 0,
});
const unidades = ["ML", "L", "G", "KG", "UN", "M", "M²", "M³", "CM", "PCT"];

// Carregar config
const getConfig = async () => {
  try {
    const res = await $api("/calculadora/config", { method: "GET" });
    if (res) {
      config.value = {
        ...config.value,
        ...res,
        materiais: res.materiais || [],
        endereco_base: res.endereco_base || "",
      };
      orcamento.value.margem = config.value.margem_padrao || 30;
    }
  } catch (error) {
    console.error("Erro ao buscar config:", error);
  }
};

// Salvar config
const salvarConfig = async () => {
  savingConfig.value = true;
  try {
    await $api("/calculadora/config", {
      method: "POST",
      body: config.value,
    });
    setAlert(
      "Configurações salvas com sucesso!",
      "success",
      "tabler-check",
      3000
    );
  } catch (error) {
    console.error("Erro ao salvar config:", error);
    setAlert("Erro ao salvar configurações", "error", "tabler-x", 3000);
  }
  savingConfig.value = false;
};

// Adicionar material personalizado
const adicionarMaterial = () => {
  if (!novoMaterial.value.nome) {
    setAlert(
      "Informe o nome do material",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }
  config.value.materiais.push({ ...novoMaterial.value });
  novoMaterial.value = {
    nome: "",
    unidade: "ML",
    tamanho_unidade: 1000,
    custo_unitario: 0,
  };
};

const removerMaterial = (idx) => {
  config.value.materiais.splice(idx, 1);
};

// ============================================
// BUSCA DE SERVIÇOS (mesmo padrão do AgendamentoCard)
// ============================================
const servicoSearch = ref("");
const servicoItems = ref([]);
const servicoLoading = ref(false);
let servicoDebounce = null;

const buscarServicos = async (val) => {
  if (!val || val.length < 3) {
    servicoItems.value = [];
    return;
  }
  servicoLoading.value = true;
  try {
    const res = await $api("/servicos/list", {
      method: "GET",
      query: { q: val, search: true },
    });
    servicoItems.value = res.servicos || [];
  } catch (error) {
    console.error("Erro ao buscar serviços:", error);
    servicoItems.value = [];
  }
  servicoLoading.value = false;
};

const servicoJaSelecionado = ref(false);
watch(servicoSearch, (val) => {
  if (servicoJaSelecionado.value) {
    servicoJaSelecionado.value = false;
    return;
  }
  clearTimeout(servicoDebounce);
  servicoDebounce = setTimeout(() => buscarServicos(val), 500);
});

const servicoSelecionadoValor = ref(null);
const onServicoSelect = (servico) => {
  if (!servico) return;
  // Não duplicar serviço já adicionado
  const jaExiste = orcamento.value.servicos.find(
    (s) => s.nome === servico.ser_nome
  );
  if (jaExiste) {
    setAlert("Serviço já adicionado", "warning", "tabler-alert-triangle", 2000);
    servicoSearch.value = "";
    servicoItems.value = [];
    return;
  }
  orcamento.value.servicos.push({
    nome: servico.ser_nome || "",
    tipo: "horas",
    horas: 1,
    valor: 0,
    valor_ref: servico.ser_valor || null,
  });
  servicoJaSelecionado.value = true;
  servicoSearch.value = "";
  servicoItems.value = [];
};

// ============================================
// BUSCA DE PRODUTOS DO ESTOQUE
// ============================================
const produtoSearch = ref("");
const produtoItems = ref([]);
const produtoLoading = ref(false);
let produtoDebounce = null;

const buscarProdutos = async (val) => {
  if (!val || val.length < 2) {
    produtoItems.value = [];
    return;
  }
  produtoLoading.value = true;
  try {
    const res = await $api("/estoque/list", {
      method: "GET",
      query: { q: val, ativo: 1, page: 1, itemsPerPage: 20 },
    });
    produtoItems.value = (res.produtos || []).map((p) => ({
      title: p.prod_nome,
      value: p.prod_id,
      prod_nome: p.prod_nome,
      prod_valor: p.prod_valor || 0,
      prod_quantidade: p.prod_quantidade || 0,
    }));
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
  }
  produtoLoading.value = false;
};

watch(produtoSearch, (val) => {
  clearTimeout(produtoDebounce);
  produtoDebounce = setTimeout(() => buscarProdutos(val), 500);
});

// Materiais do estoque selecionados no orçamento
const materiaisEstoque = ref([]);
const tabMateriais = ref("estoque");

const adicionarProdutoEstoque = (item) => {
  if (!item) return;
  const prod =
    typeof item === "object"
      ? item
      : produtoItems.value.find((p) => p.value === item);
  if (!prod) return;

  // Não duplicar
  if (materiaisEstoque.value.find((m) => m.prod_id === prod.value)) {
    setAlert("Produto já adicionado", "warning", "tabler-alert-triangle", 2000);
    return;
  }

  materiaisEstoque.value.push({
    prod_id: prod.value,
    nome: prod.prod_nome,
    valor_unitario: prod.prod_valor,
    quantidade: 1,
  });
  produtoSearch.value = "";
};

const removerProdutoEstoque = (idx) => {
  materiaisEstoque.value.splice(idx, 1);
};

// ============================================
// BUSCA DE CLIENTES (mesmo padrão do NewAgendamento)
// ============================================
const clienteSearch = ref("");
const clienteItems = ref([]);
const clienteLoading = ref(false);
let clienteDebounce = null;

const buscarClientes = async (val) => {
  if (!val || val.length < 3) {
    clienteItems.value = [];
    return;
  }
  clienteLoading.value = true;
  try {
    const res = await $api("/clientes/list", {
      method: "GET",
      query: { q: val },
    });
    clienteItems.value = res.clientes || [];
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    clienteItems.value = [];
  }
  clienteLoading.value = false;
};

const clienteJaSelecionado = ref(false);
watch(clienteSearch, (val) => {
  if (clienteJaSelecionado.value) {
    clienteJaSelecionado.value = false;
    return;
  }
  clearTimeout(clienteDebounce);
  clienteDebounce = setTimeout(() => buscarClientes(val), 500);
});

const calculandoDistancia = ref(false);
const distanciaInfo = ref(null);

// Ao selecionar cliente, buscar dados completos via /clientes/get/:id
const onClienteSelect = async (cliente) => {
  if (!cliente || !cliente.cli_Id) return;

  orcamento.value.cliente_nome = cliente.cli_nome || "";
  orcamento.value.cliente_telefone = cliente.cli_celular || "";
  cliIdSelecionado.value = cliente.cli_Id;
  clienteJaSelecionado.value = true;
  clienteSearch.value = cliente.cli_nome || "";
  clienteItems.value = [];
  showClienteData.value = true;

  // Buscar negócios do cliente no CRM
  buscarNegociosCliente(cliente.cli_Id);

  // Buscar dados completos do cliente (endereços)
  try {
    const res = await $api(`/clientes/get/${cliente.cli_Id}`, {
      method: "GET",
    });
    if (res && res.length > 0) {
      const clienteCompleto = res[0];
      const enderecos = clienteCompleto.endereco || [];

      if (enderecos.length > 0) {
        const end = enderecos[0];
        const partes = [
          end.logradouro,
          end.numero,
          end.bairro,
          end.cidade,
          end.estado,
          end.cep,
        ].filter(Boolean);
        const enderecoCompleto = partes.join(", ");
        orcamento.value.cliente_endereco = enderecoCompleto;
        await calcularDistancia(enderecoCompleto);
      }
    }
  } catch (error) {
    console.error("Erro ao buscar dados do cliente:", error);
  }
};

// Calcular distância
const calcularDistancia = async (endereco) => {
  if (!endereco) return;
  calculandoDistancia.value = true;
  distanciaInfo.value = null;
  try {
    const res = await $api("/calculadora/distancia", {
      method: "GET",
      query: { endereco_cliente: endereco },
    });
    orcamento.value.distancia_km = res.distancia_km || 0;
    distanciaInfo.value = res;
  } catch (error) {
    console.error("Erro ao calcular distância:", error);
    distanciaInfo.value = { erro: true };
  }
  calculandoDistancia.value = false;
};

// ============================================
// VALORES COMPUTADOS
// ============================================
const custoKm = computed(() => {
  if (!config.value.veiculo_km_por_litro) return 0;
  return (
    config.value.combustivel_custo_litro / config.value.veiculo_km_por_litro
  );
});

const valorHora = computed(() => {
  const divisor =
    config.value.dias_trabalhados_mes * config.value.horas_por_dia;
  if (!divisor) return 0;
  return config.value.meta_mensal / divisor;
});

const custoFixoDia = computed(() => {
  if (!config.value.dias_trabalhados_mes) return 0;
  return config.value.custos_fixos_mensais / config.value.dias_trabalhados_mes;
});

// ============================================
// CALCULADORA / ORÇAMENTO
// ============================================
const orcamento = ref({
  servicos: [], // [{ nome, horas, valor_ref }]
  distancia_km: 0,
  margem: 30,
  cliente_nome: "",
  cliente_telefone: "",
  cliente_endereco: "",
  observacoes: "",
  materiais_selecionados: [], // [{idx, quantidade, selecionado}]
});

const editingOrcamentoId = ref(null);

// Inicializar seleção de materiais personalizados quando config carrega
watch(
  () => config.value.materiais,
  (mats) => {
    if (
      mats &&
      mats.length > 0 &&
      orcamento.value.materiais_selecionados.length === 0
    ) {
      orcamento.value.materiais_selecionados = mats.map((_, idx) => ({
        idx,
        selecionado: false,
        quantidade: 0,
      }));
    }
  },
  { immediate: true }
);

// Total de horas (soma dos serviços com tipo horas)
const totalHoras = computed(() => {
  return orcamento.value.servicos
    .filter((s) => s.tipo !== "valor")
    .reduce((acc, s) => acc + (parseFloat(s.horas) || 0), 0);
});

// Valor base de um serviço (sem margem)
const custoBaseServico = (srv) => {
  if (srv.tipo === "valor") return parseFloat(srv.valor) || 0;
  return (parseFloat(srv.horas) || 0) * valorHora.value;
};

// Valor de um serviço COM margem aplicada
const valorServicoFinal = (srv) => {
  const base = custoBaseServico(srv);
  return base * (1 + (orcamento.value.margem || 0) / 100);
};

// Custos computados
const custoDeslocamento = computed(() => {
  return (orcamento.value.distancia_km || 0) * custoKm.value;
});

// Custo de materiais personalizados (da config)
const custoMateriaisPersonalizados = computed(() => {
  let total = 0;
  orcamento.value.materiais_selecionados.forEach((ms) => {
    if (ms.selecionado && ms.quantidade > 0) {
      const mat = config.value.materiais[ms.idx];
      if (mat && mat.tamanho_unidade > 0) {
        total += ms.quantidade * (mat.custo_unitario / mat.tamanho_unidade);
      }
    }
  });
  return total;
});

// Custo de materiais do estoque
const custoMateriaisEstoque = computed(() => {
  let total = 0;
  materiaisEstoque.value.forEach((m) => {
    total += (m.valor_unitario || 0) * (m.quantidade || 0);
  });
  return total;
});

// Total de materiais combinados
const custoMateriais = computed(() => {
  return custoMateriaisPersonalizados.value + custoMateriaisEstoque.value;
});

const custoFixoRateado = computed(() => {
  if (!config.value.horas_por_dia) return 0;
  return (totalHoras.value / config.value.horas_por_dia) * custoFixoDia.value;
});

// Soma dos valores base dos serviços (sem margem)
const custoServicos = computed(() => {
  return orcamento.value.servicos.reduce((acc, s) => acc + custoBaseServico(s), 0);
});

// Soma dos valores finais dos serviços (com margem individual)
const totalServicosComMargem = computed(() => {
  return orcamento.value.servicos.reduce((acc, s) => acc + valorServicoFinal(s), 0);
});

// Custos extras (deslocamento + materiais + fixos) - sem margem
const custosExtras = computed(() => {
  return custoDeslocamento.value + custoMateriais.value + custoFixoRateado.value;
});

const valorFinal = computed(() => {
  return totalServicosComMargem.value + custosExtras.value;
});

// Formatar moeda
const fmt = (v) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);
};

// Salvar orçamento
const salvarOrcamento = async (status = "gerado") => {
  if (!canCreate.value) {
    setAlert(
      "Sem permissão para criar orçamentos",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }
  if (orcamento.value.servicos.length === 0) {
    setAlert(
      "Adicione pelo menos um serviço",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  loading.value = true;

  // Montar materiais usados (personalizados + estoque)
  const materiaisUsados = [];

  // Personalizados
  orcamento.value.materiais_selecionados.forEach((ms) => {
    if (ms.selecionado && ms.quantidade > 0) {
      const mat = config.value.materiais[ms.idx];
      if (mat) {
        materiaisUsados.push({
          tipo: "personalizado",
          material_index: ms.idx,
          nome: mat.nome,
          quantidade: ms.quantidade,
          custo_total:
            ms.quantidade * (mat.custo_unitario / mat.tamanho_unidade),
        });
      }
    }
  });

  // Estoque
  materiaisEstoque.value.forEach((m) => {
    materiaisUsados.push({
      tipo: "estoque",
      prod_id: m.prod_id,
      nome: m.nome,
      quantidade: m.quantidade,
      valor_unitario: m.valor_unitario,
      custo_total: m.valor_unitario * m.quantidade,
    });
  });

  // Salvar servicos com valor_final calculado por serviço
  const servicosComValor = orcamento.value.servicos.map((s) => ({
    ...s,
    valor_final: valorServicoFinal(s),
  }));

  const valorFinalReal = descontoAtivo.value ? valorComDesconto.value : valorFinal.value;

  const body = {
    cliente_nome: orcamento.value.cliente_nome,
    cliente_telefone: orcamento.value.cliente_telefone,
    cliente_endereco: orcamento.value.cliente_endereco,
    servicos: servicosComValor,
    tipo_servico: orcamento.value.servicos.map((s) => s.nome).join(", "),
    horas_trabalho: totalHoras.value,
    distancia_km: orcamento.value.distancia_km,
    materiais_usados: materiaisUsados,
    custo_materiais: custoMateriais.value,
    custo_mao_obra: custoServicos.value,
    custo_deslocamento: custoDeslocamento.value,
    custo_fixo_rateado: custoFixoRateado.value,
    valor_custo_total: custoServicos.value + custosExtras.value,
    margem_aplicada: orcamento.value.margem,
    valor_final: valorFinalReal,
    observacoes: orcamento.value.observacoes,
    status,
    cli_Id: cliIdSelecionado.value || null,
    modelo_id: modeloSelecionado.value || null,
    conteudo_html_customizado: showConteudoHtml.value ? conteudoHtmlCustomizado.value : null,
    negocios_ids: negociosSelecionados.value.length > 0 ? negociosSelecionados.value : null,
    mover_negocios_etapa_id: moverNegociosEtapaId.value || null,
    validade_dias: validadeDias.value || 30,
    condicoes_pagamento: condicoesPagamento.value || null,
    desconto: descontoAtivo.value ? descontoValor.value : 0,
    desconto_tipo: descontoTipo.value,
    valor_original: descontoAtivo.value ? valorFinal.value : null,
  };

  try {
    if (editingOrcamentoId.value) {
      await $api(`/calculadora/orcamentos/${editingOrcamentoId.value}`, {
        method: "PUT",
        body,
      });
      setAlert("Orçamento atualizado!", "success", "tabler-check", 3000);
    } else {
      await $api("/calculadora/orcamentos", { method: "POST", body });
      setAlert("Orçamento salvo!", "success", "tabler-check", 3000);
    }

    limparOrcamento();
    getOrcamentos();
  } catch (error) {
    console.error("Erro ao salvar orçamento:", error);
    setAlert("Erro ao salvar orçamento", "error", "tabler-x", 3000);
  }

  loading.value = false;
};

// Limpar formulário
const limparOrcamento = () => {
  editingOrcamentoId.value = null;
  servicoSelecionadoValor.value = null;
  distanciaInfo.value = null;
  materiaisEstoque.value = [];
  servicoSearch.value = "";
  clienteSearch.value = "";
  servicoItems.value = [];
  clienteItems.value = [];
  showClienteData.value = false;
  modeloSelecionado.value = null;
  showConteudoHtml.value = false;
  conteudoHtmlCustomizado.value = null;
  descontoAtivo.value = false;
  descontoTipo.value = "percentual";
  descontoValor.value = 0;
  condicoesPagamento.value = "";
  validadeDias.value = 30;
  cliIdSelecionado.value = null;
  negociosCliente.value = [];
  negociosSelecionados.value = [];
  moverNegociosEtapaId.value = null;
  orcamento.value = {
    servicos: [],
    distancia_km: 0,
    margem: config.value.margem_padrao || 30,
    cliente_nome: "",
    cliente_telefone: "",
    cliente_endereco: "",
    observacoes: "",
    materiais_selecionados: config.value.materiais.map((_, idx) => ({
      idx,
      selecionado: false,
      quantidade: 0,
    })),
  };
};

// ============================================
// ORÇAMENTOS (listagem)
// ============================================
const orcamentos = ref([]);
const totalOrcamentos = ref(0);
const searchOrcamentos = ref("");
const statusFilterOrc = ref(null);
const pageOrc = ref(1);
const itemsPerPageOrc = ref(10);

const statusOptionsOrc = [
  { title: "Todos", value: null },
  { title: "Gerado", value: "gerado" },
  { title: "Enviado", value: "enviado" },
  { title: "Aceito", value: "aceito" },
  { title: "Negado", value: "negado" },
  { title: "Fechado", value: "fechado" },
];

const headersOrc = [
  { title: "ID", key: "id", sortable: true },
  { title: "Data", key: "created_at", sortable: true },
  { title: "Cliente", key: "cliente_nome", sortable: true },
  { title: "Serviço", key: "tipo_servico", sortable: true },
  { title: "Valor Final", key: "valor_final", sortable: true },
  { title: "Status", key: "status", sortable: true },
  { title: "Ações", key: "actions", sortable: false },
];

const getOrcamentos = async () => {
  try {
    const res = await $api("/calculadora/orcamentos", {
      method: "GET",
      query: {
        q: searchOrcamentos.value,
        status: statusFilterOrc.value,
        page: pageOrc.value,
        itemsPerPage: itemsPerPageOrc.value,
        sortBy: "id",
        orderBy: "desc",
      },
    });
    orcamentos.value = res.orcamentos || [];
    totalOrcamentos.value = res.total || 0;
  } catch (error) {
    console.error("Erro ao buscar orçamentos:", error);
  }
};

const updateOptionsOrc = (options) => {
  pageOrc.value = options.page;
  getOrcamentos();
};

// Editar orçamento
const editarOrcamento = (orc) => {
  editingOrcamentoId.value = orc.id;

  // Restaurar servicos do JSON, com fallback para campos legados
  let servicos = orc.servicos;
  if (typeof servicos === "string") {
    try {
      servicos = JSON.parse(servicos);
    } catch {
      servicos = null;
    }
  }
  if (!servicos || !Array.isArray(servicos) || servicos.length === 0) {
    servicos = orc.tipo_servico
      ? [
          {
            nome: orc.tipo_servico,
            tipo: "horas",
            horas: orc.horas_trabalho || 0,
            valor: 0,
            valor_ref: null,
          },
        ]
      : [];
  }
  // Garantir campo tipo em serviços legados
  servicos = servicos.map((s) => ({ tipo: "horas", valor: 0, ...s }));
  orcamento.value.servicos = servicos;

  orcamento.value.distancia_km = orc.distancia_km || 0;
  orcamento.value.margem = orc.margem_aplicada || 30;
  orcamento.value.cliente_nome = orc.cliente_nome || "";
  orcamento.value.cliente_telefone = orc.cliente_telefone || "";
  orcamento.value.cliente_endereco = orc.cliente_endereco || "";
  orcamento.value.observacoes = orc.observacoes || "";

  // Restaurar materiais personalizados
  orcamento.value.materiais_selecionados = config.value.materiais.map(
    (_, idx) => {
      const usado = (orc.materiais_usados || []).find(
        (m) => m.material_index === idx && m.tipo === "personalizado"
      );
      return {
        idx,
        selecionado: !!usado,
        quantidade: usado ? usado.quantidade : 0,
      };
    }
  );

  // Restaurar materiais do estoque
  materiaisEstoque.value = (orc.materiais_usados || [])
    .filter((m) => m.tipo === "estoque")
    .map((m) => ({
      prod_id: m.prod_id,
      nome: m.nome,
      valor_unitario: m.valor_unitario || 0,
      quantidade: m.quantidade || 0,
    }));

  showClienteData.value = !!(
    orc.cliente_nome ||
    orc.cliente_telefone ||
    orc.cliente_endereco
  );

  // Restaurar novos campos
  cliIdSelecionado.value = orc.cli_Id || null;
  modeloSelecionado.value = orc.modelo_id || null;
  conteudoHtmlCustomizado.value = orc.conteudo_html_customizado || null;
  showConteudoHtml.value = !!orc.conteudo_html_customizado;
  validadeDias.value = orc.validade_dias || 30;
  condicoesPagamento.value = orc.condicoes_pagamento || "";
  descontoAtivo.value = !!(orc.desconto && parseFloat(orc.desconto) > 0);
  descontoValor.value = parseFloat(orc.desconto) || 0;
  descontoTipo.value = orc.desconto_tipo || "percentual";

  let nIds = orc.negocios_ids;
  if (nIds && typeof nIds === "string") {
    try { nIds = JSON.parse(nIds); } catch { nIds = []; }
  }
  negociosSelecionados.value = nIds || [];
  moverNegociosEtapaId.value = orc.mover_negocios_etapa_id || null;

  if (cliIdSelecionado.value) {
    buscarNegociosCliente(cliIdSelecionado.value);
  }

  tabAtual.value = "calculadora";
};

// Excluir orçamento
const excluirOrcamento = async (orc) => {
  if (!confirm(`Deseja excluir o orçamento #${orc.id}?`)) return;

  try {
    await $api(`/calculadora/orcamentos/${orc.id}`, { method: "DELETE" });
    setAlert("Orçamento excluído", "success", "tabler-check", 3000);
    getOrcamentos();
  } catch (error) {
    console.error("Erro ao excluir:", error);
    setAlert("Erro ao excluir orçamento", "error", "tabler-x", 3000);
  }
};

// Gerar PDF do orçamento
const pdfLoading = ref(null);
const gerarPdfOrcamento = async (orc) => {
  pdfLoading.value = orc.id;
  try {
    const res = await $api(`/calculadora/orcamentos/${orc.id}/pdf`, {
      method: "GET",
    });
    if (res?.url) {
      window.open(res.url, "_blank");
    }
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    setAlert("Erro ao gerar PDF do orçamento", "error", "tabler-x", 3000);
  }
  pdfLoading.value = null;
};

const fmtDate = (d) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
};

const statusColor = (status) => {
  const map = {
    gerado: "info",
    enviado: "primary",
    aceito: "success",
    negado: "error",
    fechado: "secondary",
    // legado
    rascunho: "warning",
    finalizado: "success",
  };
  return map[status] || "default";
};

const statusLabel = (status) => {
  const map = {
    gerado: "Gerado",
    enviado: "Enviado",
    aceito: "Aceito",
    negado: "Negado",
    fechado: "Fechado",
    rascunho: "Rascunho",
    finalizado: "Finalizado",
  };
  return map[status] || status;
};

const alterarStatusOrcamento = async (orc, novoStatus) => {
  try {
    await $api(`/calculadora/orcamentos/${orc.id}/status`, {
      method: "PATCH",
      body: { status: novoStatus },
    });
    orc.status = novoStatus;
    setAlert(
      `Status alterado para "${statusLabel(novoStatus)}"`,
      "success",
      "tabler-check",
      2000
    );
  } catch (error) {
    console.error("Erro ao alterar status:", error);
    setAlert("Erro ao alterar status", "error", "tabler-x", 3000);
  }
};

const showClienteData = ref(false);

onMounted(() => {
  getConfig();
  getOrcamentos();
  getModelos();
  carregarModelosDisponiveis();
});
</script>

<template>
  <div>
    <h2 class="text-h5 mb-0">Calculadora de Precificação</h2>
    <p class="text-sm">Configure custos e gere orçamentos para seus serviços</p>

    <div class="d-flex flex-row flex-nowrap gap-3 mb-4">
      <VBtn
        :color="tabAtual === 'calculadora' ? 'primary' : 'grey lighten-2'"
        @click="tabAtual = 'calculadora'"
        class="text-none"
      >
        <VIcon icon="tabler-calculator" class="mr-2" />
        Calculadora
      </VBtn>
      <VBtn
        v-if="canManageConfig"
        :color="tabAtual === 'configuracoes' ? 'primary' : 'grey lighten-2'"
        @click="tabAtual = 'configuracoes'"
        class="text-none"
      >
        <VIcon icon="tabler-settings" class="mr-2" />
        Configurações
      </VBtn>
      <VBtn
        :color="tabAtual === 'orcamentos' ? 'primary' : 'grey lighten-2'"
        @click="tabAtual = 'orcamentos'"
        class="text-none"
      >
        <VIcon icon="tabler-file-invoice" class="mr-2" />
        Orçamentos
      </VBtn>
      <VBtn
        :color="tabAtual === 'modelos' ? 'primary' : 'grey lighten-2'"
        @click="tabAtual = 'modelos'"
        class="text-none"
      >
        <VIcon icon="tabler-template" class="mr-2" />
        Modelos
      </VBtn>
    </div>

    <VWindow v-model="tabAtual">
      <!-- ============================================ -->
      <!-- TAB 1: CALCULADORA -->
      <!-- ============================================ -->
      <VWindowItem value="calculadora">
        <VRow>
          <!-- Formulário -->
          <VCol cols="12" md="7">
            <!-- Serviço -->
            <VCard class="mb-4">
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-briefcase" class="mr-2" />
                  Dados do Serviço
                  <VChip
                    v-if="editingOrcamentoId"
                    color="warning"
                    size="x-small"
                    class="ml-2"
                  >
                    Editando #{{ editingOrcamentoId }}
                  </VChip>
                </h3>

                <VRow>
                  <VCol cols="12">
                    <v-menu location="bottom" max-height="250">
                      <template v-slot:activator="{ props }">
                        <AppTextField
                          v-model="servicoSearch"
                          v-bind="props"
                          :loading="servicoLoading"
                          label="Adicionar Serviço"
                          placeholder="Pesquise por nome do serviço (mínimo 3 caracteres)"
                          append-inner-icon="tabler-search"
                          clearable
                          @click:clear="servicoItems = []"
                        />
                      </template>
                      <VList dense v-if="servicoItems.length > 0">
                        <VListItem
                          v-for="(s, idx) in servicoItems"
                          :key="idx"
                          @click="onServicoSelect(s)"
                        >
                          <div :class="{ 'ml-2': s.isSub }">
                            <p class="mb-0">
                              {{ s.isSub ? "↳ " : "" }}{{ s.ser_nome }} -
                              {{ fmt(s.ser_valor) }}
                            </p>
                            <p
                              class="text-caption mb-0 text-disabled"
                              v-if="s.isSub"
                            >
                              Serviço vinculado a: {{ s.pai_name }}
                            </p>
                            <p
                              class="text-caption mb-0 text-disabled"
                              v-if="s.ser_descricao"
                            >
                              {{ s.ser_descricao }}
                            </p>
                          </div>
                        </VListItem>
                      </VList>
                    </v-menu>
                  </VCol>

                  <!-- Lista de serviços adicionados -->
                  <VCol cols="12" v-if="orcamento.servicos.length > 0">
                    <div
                      v-for="(srv, idx) in orcamento.servicos"
                      :key="idx"
                      class="d-flex align-center gap-3 mb-2 pa-2 rounded"
                      style="background: rgba(var(--v-theme-on-surface), 0.04)"
                    >
                      <div style="flex: 1">
                        <span class="text-sm font-weight-medium">{{
                          srv.nome
                        }}</span>
                        <VChip
                          v-if="srv.valor_ref"
                          size="x-small"
                          color="info"
                          variant="tonal"
                          class="ml-1"
                        >
                          Ref: {{ fmt(srv.valor_ref) }}
                        </VChip>
                      </div>
                      <VBtnToggle
                        v-model="srv.tipo"
                        mandatory
                        density="compact"
                        divided
                        variant="outlined"
                        color="primary"
                      >
                        <VBtn value="horas" size="x-small" style="height: 30px;" class="mr-2">
                          <VIcon
                            icon="tabler-clock"
                            size="14"
                            class="mr-1"
                          />Horas
                        </VBtn>
                        <VBtn value="valor" size="x-small" style="height: 30px;">
                          <VIcon
                            icon="tabler-currency-real"
                            size="14"
                            class="mr-1"
                          />Valor
                        </VBtn>
                      </VBtnToggle>
                      <AppTextField
                        v-if="srv.tipo !== 'valor'"
                        v-model.number="srv.horas"
                        type="number"
                        min="0"
                        step="0.5"
                        density="compact"
                        hide-details
                        style="max-width: 100px"
                        placeholder="Horas"
                      />
                      <Dinheiro
                        v-else
                        v-model.number="srv.valor"
                        style="max-width: 120px"
                        placeholder="Valor"
                      />
                      <IconBtn
                        size="small"
                        color="error"
                        @click="orcamento.servicos.splice(idx, 1)"
                      >
                        <VIcon icon="tabler-x" size="16" />
                      </IconBtn>
                    </div>
                    <div class="text-right mt-1" v-if="totalHoras > 0">
                      <span class="text-sm font-weight-medium"
                        >Total horas: {{ totalHoras }}h</span
                      >
                    </div>
                  </VCol>
                  <VCol cols="12" v-else>
                    <div class="text-center py-2 text-medium-emphasis">
                      <p class="text-sm mb-0">Nenhum serviço adicionado</p>
                    </div>
                  </VCol>

                  <VCol cols="12" md="6">
                    <AppTextField
                      v-model.number="orcamento.distancia_km"
                      label="Distância (KM)"
                      type="number"
                      min="0"
                      step="0.1"
                      :loading="calculandoDistancia"
                    />
                  </VCol>
                </VRow>
              </VCardText>
            </VCard>

            <!-- Materiais -->
            <VCard class="mb-4">
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-package" class="mr-2" />
                  Materiais
                </h3>

                <VTabs v-model="tabMateriais" density="compact" class="mb-3">
                  <VTab value="estoque" size="small" class="pb-4">
                    <VIcon
                      icon="tabler-building-warehouse"
                      class="mr-1"
                      size="18"
                    />
                    Estoque
                  </VTab>
                  <VTab value="personalizados" size="small" class="pb-4">
                    <VIcon icon="tabler-list-check" class="mr-1" size="18" />
                    Personalizados
                  </VTab>
                </VTabs>

                <VWindow v-model="tabMateriais">
                  <!-- Materiais do Estoque -->
                  <VWindowItem value="estoque">
                    <v-menu location="bottom" max-height="250">
                      <template v-slot:activator="{ props }">
                        <AppTextField
                          v-model="produtoSearch"
                          v-bind="props"
                          :loading="produtoLoading"
                          label="Buscar produto no estoque"
                          placeholder="Digite 2+ caracteres..."
                          append-inner-icon="tabler-search"
                          clearable
                          class="mb-3"
                        />
                      </template>
                      <VList dense v-if="produtoItems.length > 0">
                        <VListItem
                          v-for="(p, idx) in produtoItems"
                          :key="idx"
                          @click="adicionarProdutoEstoque(p)"
                        >
                          <p class="mb-0">{{ p.prod_nome }}</p>
                          <p class="text-caption mb-0 text-disabled">
                            {{ fmt(p.prod_valor) }}/un
                          </p>
                        </VListItem>
                      </VList>
                    </v-menu>

                    <div
                      v-if="materiaisEstoque.length === 0"
                      class="text-center py-3 text-medium-emphasis"
                    >
                      <p class="text-sm mb-0">
                        Nenhum produto do estoque adicionado
                      </p>
                    </div>

                    <div
                      v-for="(mat, idx) in materiaisEstoque"
                      :key="mat.prod_id"
                      class="d-flex align-center gap-3 mb-2 pa-2 rounded"
                      style="background: rgba(var(--v-theme-on-surface), 0.04)"
                    >
                      <div style="flex: 1">
                        <span class="text-sm font-weight-medium">{{
                          mat.nome
                        }}</span>
                        <span class="text-xs text-medium-emphasis ml-1"
                          >({{ fmt(mat.valor_unitario) }}/un)</span
                        >
                      </div>
                      <AppTextField
                        v-model.number="mat.quantidade"
                        type="number"
                        min="1"
                        density="compact"
                        hide-details
                        style="max-width: 90px"
                        label="Qtd"
                      />
                      <span
                        class="text-sm font-weight-medium text-primary"
                        style="min-width: 80px; text-align: right"
                      >
                        {{ fmt(mat.valor_unitario * mat.quantidade) }}
                      </span>
                      <IconBtn
                        size="small"
                        color="error"
                        @click="removerProdutoEstoque(idx)"
                      >
                        <VIcon icon="tabler-x" size="16" />
                      </IconBtn>
                    </div>

                    <div
                      v-if="materiaisEstoque.length > 0"
                      class="text-right mt-2"
                    >
                      <span class="text-sm font-weight-medium"
                        >Subtotal:
                        <span class="text-primary">{{
                          fmt(custoMateriaisEstoque)
                        }}</span></span
                      >
                    </div>
                  </VWindowItem>

                  <!-- Materiais Personalizados -->
                  <VWindowItem value="personalizados">
                    <div
                      v-if="config.materiais.length === 0"
                      class="text-center py-3 text-medium-emphasis"
                    >
                      <p class="text-sm mb-0">
                        Configure materiais na aba Configurações
                      </p>
                    </div>

                    <div
                      v-for="(ms, idx) in orcamento.materiais_selecionados"
                      :key="idx"
                      class="d-flex align-center gap-3 mb-2"
                    >
                      <VCheckbox
                        v-model="ms.selecionado"
                        :label="config.materiais[ms.idx]?.nome || ''"
                        density="compact"
                        hide-details
                        style="flex: 1"
                      />
                      <AppTextField
                        v-if="ms.selecionado"
                        v-model.number="ms.quantidade"
                        :label="`Qtd (${
                          config.materiais[ms.idx]?.unidade || 'UN'
                        })`"
                        type="number"
                        min="0"
                        density="compact"
                        style="max-width: 140px"
                        hide-details
                      />
                      <span
                        v-if="ms.selecionado && ms.quantidade > 0"
                        class="text-sm text-medium-emphasis"
                        style="min-width: 80px; text-align: right"
                      >
                        {{
                          fmt(
                            ms.quantidade *
                              (config.materiais[ms.idx]?.custo_unitario /
                                config.materiais[ms.idx]?.tamanho_unidade)
                          )
                        }}
                      </span>
                    </div>

                    <div
                      v-if="custoMateriaisPersonalizados > 0"
                      class="text-right mt-2"
                    >
                      <span class="text-sm font-weight-medium"
                        >Subtotal:
                        <span class="text-primary">{{
                          fmt(custoMateriaisPersonalizados)
                        }}</span></span
                      >
                    </div>
                  </VWindowItem>
                </VWindow>
              </VCardText>
            </VCard>

            <!-- Cliente -->
            <VCard class="mb-4">
              <VCardText>
                <div
                  class="d-flex align-center cursor-pointer mb-1"
                  @click="showClienteData = !showClienteData"
                >
                  <VIcon
                    :icon="
                      showClienteData
                        ? 'tabler-chevron-down'
                        : 'tabler-chevron-right'
                    "
                    class="mr-2"
                  />
                  <span class="text-h6" style="flex: 1">
                    <VIcon icon="tabler-user" class="mr-2" />
                    Dados do Cliente
                  </span>
                  <span class="text-sm text-disabled">(opcional)</span>
                </div>

                <VExpandTransition>
                  <div v-if="showClienteData">
                    <VDivider class="my-3" />
                    <VRow>
                      <VCol cols="12">
                        <v-menu location="bottom" max-height="250">
                          <template v-slot:activator="{ props }">
                            <AppTextField
                              v-model="clienteSearch"
                              v-bind="props"
                              :loading="clienteLoading"
                              label="Buscar cliente"
                              placeholder="Pesquise por nome do cliente (mínimo 3 caracteres)"
                              append-inner-icon="tabler-search"
                              clearable
                              @click:clear="clienteItems = []"
                            />
                          </template>
                          <VList dense v-if="clienteItems.length > 0">
                            <VListItem
                              v-for="(c, idx) in clienteItems"
                              :key="idx"
                              @click="onClienteSelect(c)"
                            >
                              <p class="mb-0">{{ c.cli_nome }}</p>
                              <p class="text-caption mb-0 text-disabled">
                                {{ c.cli_celular || "Sem telefone" }}
                              </p>
                            </VListItem>
                          </VList>
                        </v-menu>
                      </VCol>
                      <VCol cols="12" md="6">
                        <AppTextField
                          v-model="orcamento.cliente_nome"
                          label="Nome do Cliente"
                          placeholder="Nome"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <AppTextField
                          v-model="orcamento.cliente_telefone"
                          label="Telefone"
                          placeholder="(00) 00000-0000"
                        />
                      </VCol>
                      <VCol cols="12">
                        <div class="d-flex gap-2 align-end">
                          <AppTextField
                            v-model="orcamento.cliente_endereco"
                            label="Endereço"
                            placeholder="Endereço do serviço"
                            style="flex: 1"
                          />
                          <VBtn
                            variant="tonal"
                            color="primary"
                            @click="
                              calcularDistancia(orcamento.cliente_endereco)
                            "
                            :loading="calculandoDistancia"
                            :disabled="!orcamento.cliente_endereco"
                            size="small"
                            class="mb-1"
                          >
                            <VIcon icon="tabler-ruler-2" class="mr-1" />
                            Calcular
                          </VBtn>
                        </div>
                        <div
                          v-if="distanciaInfo && !distanciaInfo.erro"
                          class="mt-1"
                        >
                          <VChip size="small" color="success" variant="tonal">
                            {{ distanciaInfo.distancia_km }} km de
                            {{ distanciaInfo.endereco_origem }}
                          </VChip>
                        </div>
                        <div
                          v-else-if="distanciaInfo && distanciaInfo.erro"
                          class="mt-1"
                        >
                          <VChip size="small" color="error" variant="tonal">
                            Não foi possível calcular distância
                          </VChip>
                        </div>
                      </VCol>
                      <VCol cols="12">
                        <AppTextField
                          v-model="orcamento.observacoes"
                          label="Observações"
                          placeholder="Notas adicionais..."
                        />
                      </VCol>

                      <!-- CRM: Vincular Negócios -->
                      <VCol cols="12" v-if="negociosCliente.length > 0">
                        <div class="d-flex align-center gap-2">
                          <VBtn
                            variant="tonal"
                            color="info"
                            size="small"
                            @click="negociosDialogOpen = true"
                          >
                            <VIcon icon="tabler-briefcase" class="mr-1" />
                            Vincular Negócios ({{ negociosCliente.length }} disponíveis)
                          </VBtn>
                          <VChip
                            v-if="negociosSelecionados.length > 0"
                            color="success"
                            size="small"
                            variant="tonal"
                          >
                            {{ negociosSelecionados.length }} vinculado(s)
                          </VChip>
                        </div>
                      </VCol>
                    </VRow>
                  </div>
                </VExpandTransition>
              </VCardText>
            </VCard>

            <!-- Modelo / Template do Orçamento -->
            <VCard class="mb-4">
              <VCardText>
                <h3 class="text-h6 mb-3">
                  <VIcon icon="tabler-template" class="mr-2" />
                  Modelo do Orçamento
                  <span class="text-caption text-disabled ml-2">(opcional)</span>
                </h3>

                <VRow>
                  <VCol cols="12" md="6">
                    <AppSelect
                      v-model="modeloSelecionado"
                      :items="modelosDisponiveis"
                      item-title="title"
                      item-value="value"
                      label="Selecionar modelo"
                      placeholder="Sem modelo"
                      clearable
                      @update:modelValue="onModeloChange"
                    />
                  </VCol>
                  <VCol cols="12" md="3">
                    <AppTextField
                      v-model.number="validadeDias"
                      label="Validade (dias)"
                      type="number"
                      min="1"
                    />
                  </VCol>
                  <VCol cols="12" md="3" class="d-flex align-end">
                    <VBtn
                      variant="tonal"
                      size="small"
                      @click="showConteudoHtml = !showConteudoHtml"
                      class="mb-1"
                    >
                      <VIcon :icon="showConteudoHtml ? 'tabler-chevron-up' : 'tabler-chevron-down'" class="mr-1" />
                      {{ showConteudoHtml ? 'Ocultar' : 'Editar' }} conteúdo
                    </VBtn>
                  </VCol>
                </VRow>

                <VExpandTransition>
                  <div v-if="showConteudoHtml" class="mt-3">
                    <p class="text-caption text-disabled mb-2">
                      Variáveis: &#123;&#123;cliente_nome&#125;&#125;, &#123;&#123;valor_total&#125;&#125;, &#123;&#123;data_hoje&#125;&#125;, &#123;&#123;validade_dias&#125;&#125;, &#123;&#123;orcamento_id&#125;&#125;
                    </p>
                    <QuillEditor
                      v-model:content="conteudoHtmlCustomizado"
                      theme="snow"
                      :toolbar="toolbarOptionsOrc"
                      class="inputQuill"
                      contentType="html"
                      placeholder="Conteúdo personalizado do orçamento..."
                      style="min-height: 200px;"
                    />
                  </div>
                </VExpandTransition>

                <!-- Condições de pagamento -->
                <AppTextField
                  v-model="condicoesPagamento"
                  label="Condições de Pagamento"
                  placeholder="Ex: 50% na aprovação, 50% na conclusão do serviço"
                  class="mt-3"
                />
              </VCardText>
            </VCard>

            <!-- Desconto -->
            <VCard class="mb-4">
              <VCardText>
                <div class="d-flex align-center gap-3 mb-3">
                  <h3 class="text-h6 mb-0">
                    <VIcon icon="tabler-discount-2" class="mr-2" />
                    Desconto
                  </h3>
                  <VSwitch
                    v-model="descontoAtivo"
                    hide-details
                    density="compact"
                  />
                </div>

                <VExpandTransition>
                  <VRow v-if="descontoAtivo">
                    <VCol cols="12" md="4">
                      <AppSelect
                        v-model="descontoTipo"
                        label="Tipo"
                        :items="[
                          { title: 'Percentual (%)', value: 'percentual' },
                          { title: 'Valor (R$)', value: 'valor' },
                        ]"
                        item-title="title"
                        item-value="value"
                      />
                    </VCol>
                    <VCol cols="12" md="4">
                      <AppTextField
                        v-model.number="descontoValor"
                        :label="descontoTipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'"
                        type="number"
                        min="0"
                        :suffix="descontoTipo === 'percentual' ? '%' : ''"
                      />
                    </VCol>
                    <VCol cols="12" md="4" class="d-flex align-center">
                      <div v-if="descontoValor > 0">
                        <p class="text-sm mb-0 text-disabled" style="text-decoration: line-through;">
                          {{ fmt(valorFinal) }}
                        </p>
                        <p class="text-body-1 font-weight-bold text-success mb-0">
                          {{ fmt(valorComDesconto) }}
                        </p>
                      </div>
                    </VCol>
                  </VRow>
                </VExpandTransition>
              </VCardText>
            </VCard>

            <!-- Margem -->
            <VCard class="mb-4">
              <VCardText>
                <h3 class="text-h6 mb-3">
                  <VIcon icon="tabler-percentage" class="mr-2" />
                  Margem de Lucro
                </h3>
                <div class="d-flex align-center gap-3">
                  <VSlider
                    v-model.number="orcamento.margem"
                    :min="0"
                    :max="200"
                    :step="1"
                    thumb-label
                    style="flex: 1"
                  />
                  <AppTextField
                    v-model.number="orcamento.margem"
                    type="number"
                    min="0"
                    max="200"
                    suffix="%"
                    style="max-width: 100px"
                    density="compact"
                    hide-details
                  />
                </div>
              </VCardText>
            </VCard>
          </VCol>

          <!-- Resumo (sticky) -->
          <VCol cols="12" md="5">
            <div style="position: sticky; top: 80px">
              <VCard>
                <VCardText>
                  <h3 class="text-h6 mb-4">
                    <VIcon icon="tabler-receipt" class="mr-2" />
                    Resumo do Orçamento
                  </h3>

                  <!-- Serviços (cada um com margem aplicada) -->
                  <template
                    v-for="(srv, idx) in orcamento.servicos"
                    :key="'srv-' + idx"
                  >
                    <div class="d-flex justify-space-between mb-1">
                      <span class="text-sm">
                        <VIcon :icon="srv.tipo === 'valor' ? 'tabler-briefcase' : 'tabler-clock'" size="16" class="mr-1" />
                        {{ srv.nome }}
                        <span class="text-disabled" v-if="srv.tipo !== 'valor'">({{ srv.horas || 0 }}h)</span>
                      </span>
                      <span class="text-sm font-weight-medium">{{
                        fmt(valorServicoFinal(srv))
                      }}</span>
                    </div>
                  </template>

                  <div v-if="orcamento.servicos.length > 0 && orcamento.margem > 0" class="mb-2">
                    <span class="text-xs text-disabled">Margem de {{ orcamento.margem }}% aplicada por serviço</span>
                  </div>

                  <!-- Deslocamento -->
                  <div class="d-flex justify-space-between mb-2">
                    <span class="text-sm">
                      <VIcon icon="tabler-car" size="16" class="mr-1" />
                      Deslocamento ({{ orcamento.distancia_km || 0 }}km x
                      {{ fmt(custoKm) }}/km)
                    </span>
                    <span class="text-sm font-weight-medium">{{
                      fmt(custoDeslocamento)
                    }}</span>
                  </div>

                  <!-- Materiais do Estoque -->
                  <template
                    v-for="(mat, idx) in materiaisEstoque"
                    :key="'est-' + idx"
                  >
                    <div class="d-flex justify-space-between mb-2">
                      <span class="text-sm">
                        <VIcon icon="tabler-package" size="16" class="mr-1" />
                        {{ mat.nome }} ({{ mat.quantidade }}x)
                      </span>
                      <span class="text-sm font-weight-medium">
                        {{ fmt(mat.valor_unitario * mat.quantidade) }}
                      </span>
                    </div>
                  </template>

                  <!-- Materiais Personalizados -->
                  <template
                    v-for="(ms, idx) in orcamento.materiais_selecionados"
                    :key="'pers-' + idx"
                  >
                    <div
                      v-if="ms.selecionado && ms.quantidade > 0"
                      class="d-flex justify-space-between mb-2"
                    >
                      <span class="text-sm">
                        <VIcon icon="tabler-package" size="16" class="mr-1" />
                        {{ config.materiais[ms.idx]?.nome }}
                      </span>
                      <span class="text-sm font-weight-medium">
                        {{
                          fmt(
                            ms.quantidade *
                              (config.materiais[ms.idx]?.custo_unitario /
                                config.materiais[ms.idx]?.tamanho_unidade)
                          )
                        }}
                      </span>
                    </div>
                  </template>

                  <!-- Custos Fixos -->
                  <div
                    v-if="custoFixoRateado > 0"
                    class="d-flex justify-space-between mb-2"
                  >
                    <span class="text-sm">
                      <VIcon icon="tabler-building" size="16" class="mr-1" />
                      Custos fixos rateados
                    </span>
                    <span class="text-sm font-weight-medium">{{
                      fmt(custoFixoRateado)
                    }}</span>
                  </div>

                  <VDivider class="my-3" />

                  <!-- Valor Final -->
                  <div v-if="descontoAtivo && descontoValor > 0" class="d-flex justify-space-between align-center mb-1">
                    <span class="text-sm text-disabled">Subtotal</span>
                    <span class="text-sm text-disabled" style="text-decoration: line-through;">{{ fmt(valorFinal) }}</span>
                  </div>
                  <div v-if="descontoAtivo && descontoValor > 0" class="d-flex justify-space-between align-center mb-2">
                    <span class="text-sm text-success">Desconto {{ descontoTipo === 'percentual' ? `${descontoValor}%` : fmt(descontoValor) }}</span>
                    <span class="text-sm text-success">-{{ fmt(valorFinal - valorComDesconto) }}</span>
                  </div>
                  <div class="d-flex justify-space-between align-center mb-4">
                    <span class="text-h6 font-weight-bold">VALOR FINAL</span>
                    <span class="text-h5 font-weight-bold text-primary">{{
                      fmt(descontoAtivo ? valorComDesconto : valorFinal)
                    }}</span>
                  </div>

                  <div class="d-flex gap-2" v-if="canCreate">
                    <VBtn
                      color="primary"
                      block
                      @click="salvarOrcamento('gerado')"
                      :loading="loading"
                    >
                      {{
                        editingOrcamentoId
                          ? "Atualizar Orçamento"
                          : "Gerar Orçamento"
                      }}
                    </VBtn>
                  </div>
                  <VBtn
                    v-if="editingOrcamentoId"
                    variant="text"
                    block
                    class="mt-2"
                    @click="limparOrcamento"
                  >
                    Cancelar edição
                  </VBtn>
                </VCardText>
              </VCard>
            </div>
          </VCol>
        </VRow>
      </VWindowItem>

      <!-- ============================================ -->
      <!-- TAB 2: CONFIGURAÇÕES -->
      <!-- ============================================ -->
      <VWindowItem value="configuracoes" v-if="canManageConfig">
        <VRow>
          <!-- Materiais/Produtos -->
          <VCol cols="12">
            <VCard>
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-package" class="mr-2" />
                  Materiais / Produtos Personalizados
                </h3>

                <div v-if="config.materiais.length > 0" class="mb-4">
                  <VTable>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Unidade</th>
                        <th>Tamanho</th>
                        <th>Custo Embalagem</th>
                        <th style="max-width: 80px">Custo/Unidade</th>
                        <th style="width: 50px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(mat, idx) in config.materiais" :key="idx">
                        <td>
                          <AppTextField
                            v-model="mat.nome"
                            density="compact"
                            hide-details
                            variant="plain"
                          />
                        </td>
                        <td>
                          <AppSelect
                            v-model="mat.unidade"
                            :items="unidades"
                            density="compact"
                            hide-details
                            variant="plain"
                            style="max-width: 90px"
                          />
                        </td>
                        <td>
                          <AppTextField
                            v-model.number="mat.tamanho_unidade"
                            type="number"
                            density="compact"
                            hide-details
                            variant="plain"
                            style="max-width: 100px"
                          />
                        </td>
                        <td>
                          <Dinheiro
                            v-model.number="mat.custo_unitario"
                            type="number"
                            placeholder="Custo"
                            style="max-width: 120px"
                          />
                        </td>
                        <td class="text-primary font-weight-medium">
                          {{
                            mat.tamanho_unidade > 0
                              ? fmt(mat.custo_unitario / mat.tamanho_unidade)
                              : "-"
                          }}/{{ mat.unidade }}
                        </td>
                        <td>
                          <IconBtn
                            size="small"
                            color="error"
                            @click="removerMaterial(idx)"
                          >
                            <VIcon icon="tabler-trash" size="18" />
                          </IconBtn>
                        </td>
                      </tr>
                    </tbody>
                  </VTable>
                </div>

                <VRow class="align-end">
                  <VCol cols="12" md="3">
                    <AppTextField
                      v-model="novoMaterial.nome"
                      label="Nome"
                      placeholder="Ex: Detergente"
                      density="compact"
                    />
                  </VCol>
                  <VCol cols="6" md="2">
                    <AppSelect
                      v-model="novoMaterial.unidade"
                      label="Unidade"
                      :items="unidades"
                      density="compact"
                    />
                  </VCol>
                  <VCol cols="6" md="2">
                    <AppTextField
                      v-model.number="novoMaterial.tamanho_unidade"
                      label="Tamanho"
                      type="number"
                      density="compact"
                    />
                  </VCol>
                  <VCol cols="6" md="2">
                    <Dinheiro
                      v-model.number="novoMaterial.custo_unitario"
                      label="Custo"
                      placeholder="Custo"
                    />
                  </VCol>
                  <VCol cols="6" md="3">
                    <VBtn
                      color="primary"
                      variant="tonal"
                      @click="adicionarMaterial"
                      block
                    >
                      <VIcon icon="tabler-plus" class="mr-1" />
                      Adicionar
                    </VBtn>
                  </VCol>
                </VRow>
              </VCardText>
            </VCard>
          </VCol>

          <!-- Veículo -->
          <VCol cols="12" md="6">
            <VCard>
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-car" class="mr-2" />
                  Veículo / Deslocamento
                </h3>

                <VRow>
                  <VCol cols="12" md="6">
                    <Dinheiro
                      v-model.number="config.combustivel_custo_litro"
                      label="Custo Combustível"
                      placeholder="Custo Combustível"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <AppTextField
                      v-model.number="config.veiculo_km_por_litro"
                      label="Rendimento (KM/L)"
                      type="number"
                      suffix="km/L"
                      step="0.1"
                    />
                  </VCol>
                  <VCol cols="12">
                    <AppTextField
                      v-model="config.endereco_base"
                      label="Endereço base para cálculo de distância"
                      placeholder="Deixe vazio para usar o endereço da empresa"
                      persistent-hint
                      hint="Endereço de onde o serviço parte (origem do deslocamento)"
                    />
                  </VCol>
                </VRow>

                <VAlert
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mt-10 "
                >
                  Custo por KM: <strong>{{ fmt(custoKm) }}</strong>
                </VAlert>
              </VCardText>
            </VCard>
          </VCol>

          <!-- Mão de Obra -->
          <VCol cols="12" md="6">
            <VCard>
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-clock" class="mr-2" />
                  Mão de Obra
                </h3>

                <VRow>
                  <VCol cols="12" md="4">
                    <Dinheiro
                      v-model.number="config.meta_mensal"
                      label="Meta Mensal"
                      placeholder="Meta Mensal"
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <AppTextField
                      v-model.number="config.dias_trabalhados_mes"
                      label="Dias/Mês"
                      type="number"
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <AppTextField
                      v-model.number="config.horas_por_dia"
                      label="Horas/Dia"
                      type="number"
                    />
                  </VCol>
                </VRow>

                <VAlert
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mt-3"
                >
                  Valor por hora: <strong>{{ fmt(valorHora) }}</strong>
                </VAlert>
              </VCardText>
            </VCard>
          </VCol>

          <!-- Custos Fixos -->
          <VCol cols="12" md="6">
            <VCard>
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-building" class="mr-2" />
                  Custos Fixos Mensais
                </h3>

                <Dinheiro
                  v-model.number="config.custos_fixos_mensais"
                  label="Total Custos Fixos (R$/mês)"
                  placeholder="Total Custos Fixos"
                  hint="Aluguel, energia, água, internet, etc."
                />

                <VAlert
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mt-3"
                >
                  Custo fixo por dia: <strong>{{ fmt(custoFixoDia) }}</strong>
                </VAlert>
              </VCardText>
            </VCard>
          </VCol>

          <!-- Margem Padrão -->
          <VCol cols="12" md="6">
            <VCard>
              <VCardText>
                <h3 class="text-h6 mb-4">
                  <VIcon icon="tabler-percentage" class="mr-2" />
                  Margem Padrão
                </h3>

                <div class="d-flex align-center gap-3">
                  <VSlider
                    v-model.number="config.margem_padrao"
                    :min="0"
                    :max="200"
                    :step="1"
                    thumb-label
                    style="flex: 1"
                  />
                  <AppTextField
                    v-model.number="config.margem_padrao"
                    type="number"
                    suffix="%"
                    style="max-width: 100px"
                    density="compact"
                    hide-details
                  />
                </div>
                <p class="text-sm text-medium-emphasis mt-2">
                  Margem aplicada automaticamente em novos orçamentos
                </p>
              </VCardText>
            </VCard>
          </VCol>

          <!-- Botão Salvar -->
          <VCol cols="12">
            <div class="d-flex justify-end">
              <VBtn
                color="primary"
                @click="salvarConfig"
                :loading="savingConfig"
                size="large"
              >
                <VIcon icon="tabler-device-floppy" class="mr-2" />
                Salvar Configurações
              </VBtn>
            </div>
          </VCol>
        </VRow>
      </VWindowItem>

      <!-- ============================================ -->
      <!-- TAB 3: ORÇAMENTOS -->
      <!-- ============================================ -->
      <VWindowItem value="orcamentos">
        <VCard>
          <VCardText class="d-flex flex-row gap-3 align-end">
            <VRow>
              <VCol cols="12" md="6">
                <AppTextField
                  v-model="searchOrcamentos"
                  label="Pesquisar"
                  placeholder="Nome do cliente ou tipo de serviço"
                  @keyup.enter="getOrcamentos()"
                  clearable
                />
              </VCol>
              <VCol cols="12" md="3">
                <AppSelect
                  v-model="statusFilterOrc"
                  label="Status"
                  :items="statusOptionsOrc"
                  item-title="title"
                  item-value="value"
                  clearable
                />
              </VCol>
              <VCol cols="12" md="3" class="d-flex gap-2 align-end">
                <VBtn color="primary" @click="getOrcamentos()">
                  <VIcon icon="tabler-search" class="mr-2" />
                  Buscar
                </VBtn>
              </VCol>
            </VRow>
          </VCardText>

          <VDivider />

          <VDataTableServer
            v-model:items-per-page="itemsPerPageOrc"
            v-model:page="pageOrc"
            :headers="headersOrc"
            :items="orcamentos"
            :items-length="totalOrcamentos"
            @update:options="updateOptionsOrc"
          >
            <template #item.created_at="{ item }">
              {{ fmtDate(item.created_at) }}
            </template>

            <template #item.cliente_nome="{ item }">
              {{ item.cliente_nome || "-" }}
            </template>

            <template #item.valor_final="{ item }">
              <span class="font-weight-medium text-primary">{{
                fmt(item.valor_final)
              }}</span>
            </template>

            <template #item.status="{ item }">
              <VMenu>
                <template #activator="{ props }">
                  <VChip
                    v-bind="props"
                    :color="statusColor(item.status)"
                    size="small"
                    class="cursor-pointer"
                  >
                    {{ statusLabel(item.status) }}
                    <VIcon icon="tabler-chevron-down" size="14" class="ml-1" />
                  </VChip>
                </template>
                <VList dense>
                  <VListItem
                    v-for="opt in statusOptionsOrc.filter((o) => o.value)"
                    :key="opt.value"
                    @click="alterarStatusOrcamento(item, opt.value)"
                    :disabled="item.status === opt.value"
                  >
                    <VChip
                      :color="statusColor(opt.value)"
                      size="x-small"
                      class="mr-2"
                      >{{ opt.title }}</VChip
                    >
                  </VListItem>
                </VList>
              </VMenu>
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex gap-1">
                <IconBtn
                  size="small"
                  color="primary"
                  @click="gerarPdfOrcamento(item)"
                  :loading="pdfLoading === item.id"
                >
                  <VIcon icon="tabler-file-type-pdf" size="18" />
                </IconBtn>
                <IconBtn size="small" @click="editarOrcamento(item)">
                  <VIcon icon="tabler-edit" size="18" />
                </IconBtn>
                <IconBtn
                  size="small"
                  color="error"
                  @click="excluirOrcamento(item)"
                >
                  <VIcon icon="tabler-trash" size="18" />
                </IconBtn>
              </div>
            </template>

            <template #bottom>
              <VDivider />
              <div class="d-flex justify-end flex-wrap gap-x-6 px-2 py-1">
                <div
                  class="d-flex align-center gap-x-2 text-medium-emphasis text-base"
                >
                  Itens por página:
                  <AppSelect
                    v-model="itemsPerPageOrc"
                    class="per-page-select"
                    variant="plain"
                    :items="[10, 20, 50]"
                  />
                </div>

                <p
                  class="d-flex align-center text-base text-high-emphasis me-2 mb-0"
                >
                  {{
                    paginationMeta(
                      { page: pageOrc, itemsPerPage: itemsPerPageOrc },
                      totalOrcamentos
                    )
                  }}
                </p>

                <div class="d-flex gap-x-2 align-center me-2">
                  <VBtn
                    icon="tabler-chevron-left"
                    class="flip-in-rtl"
                    variant="text"
                    density="comfortable"
                    color="high-emphasis"
                    :disabled="pageOrc <= 1"
                    @click="pageOrc > 1 && (pageOrc--, getOrcamentos())"
                  />
                  <VBtn
                    class="flip-in-rtl"
                    icon="tabler-chevron-right"
                    density="comfortable"
                    variant="text"
                    color="high-emphasis"
                    :disabled="
                      pageOrc >= Math.ceil(totalOrcamentos / itemsPerPageOrc)
                    "
                    @click="
                      pageOrc < Math.ceil(totalOrcamentos / itemsPerPageOrc) &&
                        (pageOrc++, getOrcamentos())
                    "
                  />
                </div>
              </div>
            </template>
          </VDataTableServer>
        </VCard>
      </VWindowItem>
      <!-- ============================================ -->
      <!-- TAB 4: MODELOS -->
      <!-- ============================================ -->
      <VWindowItem value="modelos">
        <VCard>
          <VCardText>
            <div class="d-flex justify-space-between align-center mb-4">
              <h3 class="text-h6 mb-0">
                <VIcon icon="tabler-template" class="mr-2" />
                Modelos de Orçamento
              </h3>
              <VBtn color="primary" @click="novoModelo">
                <VIcon icon="tabler-plus" class="mr-1" />
                Novo Modelo
              </VBtn>
            </div>

            <VTable v-if="modelos.length > 0">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Atualizado</th>
                  <th style="width: 100px">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="modelo in modelos" :key="modelo.id">
                  <td>{{ modelo.titulo }}</td>
                  <td>
                    <VChip size="x-small" color="info" variant="tonal" label>
                      {{ modelo.tipo || 'geral' }}
                    </VChip>
                  </td>
                  <td>{{ fmtDate(modelo.updated_at) }}</td>
                  <td>
                    <div class="d-flex gap-1">
                      <IconBtn size="small" @click="editarModelo(modelo)">
                        <VIcon icon="tabler-edit" size="18" />
                      </IconBtn>
                      <IconBtn size="small" color="error" @click="excluirModelo(modelo)">
                        <VIcon icon="tabler-trash" size="18" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-else class="text-center py-8">
              <VIcon icon="tabler-template" size="48" color="disabled" />
              <p class="text-body-2 text-disabled mt-2">Nenhum modelo criado ainda</p>
              <VBtn variant="tonal" color="primary" @click="novoModelo" class="mt-2">
                Criar primeiro modelo
              </VBtn>
            </div>
          </VCardText>
        </VCard>
      </VWindowItem>
    </VWindow>

    <!-- Dialogs -->
    <ModeloOrcamentoDialog
      v-model:isDrawerOpen="modeloDialogOpen"
      :modeloData="modeloEditData"
      @saved="getModelos(); carregarModelosDisponiveis();"
    />

    <NegociosSelectorDialog
      v-model:isDrawerOpen="negociosDialogOpen"
      :negocios="negociosCliente"
      :selectedIds="negociosSelecionados"
      :moverEtapaId="moverNegociosEtapaId"
      @confirmed="onNegociosConfirmed"
    />
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
