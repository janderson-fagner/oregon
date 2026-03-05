<script setup>
import { ref, computed, onMounted } from "vue";
import moment from "moment";
import GraficoEvolucaoAgendamentos from "@/views/apps/relatorios/grafico-evolucao-agendamentos.vue";
import tableagendamentosretrabalho from "@/views/apps/relatorios/tableagendamentosretrabalho.vue";
import tableagendamentosgarantia from "@/views/apps/relatorios/tableagendamentosgarantia.vue";
import tableagendamentosclientes from "@/views/apps/relatorios/tableagendamentosclientes.vue";
import { useFunctions } from "@/composables/useFunctions";
import { temaAtual } from "@core/stores/config";

const { formatDateAgendamento } = useFunctions();
const { setAlert } = useAlert();

const router = useRouter();
const loading = ref(false);

// Formatar valor
const formatValor = (valor) => {
  if (!valor && valor !== 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
};

// Formatar data
const formatDate = (date) => {
  if (!date) return null;
  const data = new Date(date);
  const dia = data.getDate().toString().padStart(2, "0");
  const mes = (data.getMonth() + 1).toString().padStart(2, "0");
  const ano = data.getFullYear();
  return `${ano}-${mes}-${dia}`;
};

// Datas padrão (mês atual)
let mesAtual = new Date().getMonth() + 1;
let anoAtual = new Date().getFullYear();

const dataDe = ref(formatDate(`${anoAtual}-${mesAtual}-01`));
const dataAte = ref(
  formatDate(
    `${anoAtual}-${mesAtual}-${new Date(anoAtual, mesAtual, 0).getDate()}`
  )
);

const relatorios = ref(null);

// Buscar relatórios
const getRelatorios = async () => {
  if (dataAte.value < dataDe.value) {
    return setAlert(
      "A data de início não pode ser maior que a data final.",
      "error",
      "tabler-alert-triangle",
      5000
    );
  }

  loading.value = true;
  try {
    const res = await $api("/relatorios/get/agendamentos", {
      query: {
        dataDe: dataDe.value,
        dataAte: dataAte.value,
      },
    });

    if (!res) return;

    console.log("Relatórios agendamentos:", res);

    relatorios.value = res;
  } catch (error) {
    console.error("Erro ao buscar relatórios de agendamentos:", error);
    setAlert(
      "Erro ao buscar relatórios de agendamentos",
      "error",
      "tabler-alert-triangle",
      5000
    );
    relatorios.value = null;
  }

  loading.value = false;
};

// Computed properties
const resumo = computed(() => relatorios.value?.resumo || {});
const resumoContratos = computed(() => relatorios.value?.resumoContratos || {});
const evolucao = computed(() => relatorios.value?.evolucao || []);
const cidades = computed(() => relatorios.value?.cidades || []);
const bairros = computed(() => relatorios.value?.bairros || []);
const clientes = computed(() => relatorios.value?.clientes || []);
const tiposAgendamento = computed(
  () => relatorios.value?.tiposAgendamento || []
);
const contratos = computed(() => relatorios.value?.contratos || []);
const status = computed(() => relatorios.value?.status || []);
const fontes = computed(() => relatorios.value?.fontes || []);

// Calcular período do contrato
const calcularPeriodo = (contratoInfo) => {
  if (
    !contratoInfo ||
    !contratoInfo.periodoType ||
    !contratoInfo.periodo ||
    !contratoInfo.inicioData
  )
    return "";

  let inicio = moment(contratoInfo.inicioData);

  switch (contratoInfo.periodoType) {
    case "Mensal":
      return inicio.add(contratoInfo.periodo, "months").format("DD/MM/YYYY");
    case "Trimestral":
      return inicio
        .add(contratoInfo.periodo * 3, "months")
        .format("DD/MM/YYYY");
    case "Semestral":
      return inicio
        .add(contratoInfo.periodo * 6, "months")
        .format("DD/MM/YYYY");
    case "Anual":
      return inicio.add(contratoInfo.periodo, "years").format("DD/MM/YYYY");
  }

  return "";
};

// Computed - Gráfico de Evolução
const dadosEvolucao = computed(() => {
  if (!evolucao.value || evolucao.value.length === 0) {
    return {
      series: {
        quantidade: [],
        valorRecebido: [],
      },
      categories: [],
    };
  }

  return {
    series: {
      quantidade: evolucao.value.map((item) => item.quantidade),
      valorRecebido: evolucao.value.map((item) => item.valorRecebido),
    },
    categories: evolucao.value.map((item) => moment(item.data).format("DD/MM")),
  };
});

// Filtros para tabelas
const filtroCidades = ref({
  cidade: "",
  quantidadeMin: "",
  quantidadeMax: "",
  valorMin: "",
  valorMax: "",
});

const filtroBairros = ref({
  bairro: "",
  quantidadeMin: "",
  quantidadeMax: "",
  valorMin: "",
  valorMax: "",
});

const filtroClientes = ref({
  cliente: "",
  quantidadeMin: "",
  quantidadeMax: "",
  valorMin: "",
  valorMax: "",
});

const filtroTipos = ref({
  tipo: "",
  quantidadeMin: "",
  quantidadeMax: "",
  valorMin: "",
  valorMax: "",
});

const filtroContratos = ref({
  contrato: "",
  quantidadeMin: "",
  quantidadeMax: "",
  valorMin: "",
  valorMax: "",
});

// Tabelas filtradas
const cidadesFiltradas = computed(() => {
  let result = [...cidades.value];

  if (filtroCidades.value.cidade) {
    result = result.filter((c) =>
      c.cidade?.toLowerCase().includes(filtroCidades.value.cidade.toLowerCase())
    );
  }

  if (filtroCidades.value.quantidadeMin) {
    const min = parseInt(filtroCidades.value.quantidadeMin);
    result = result.filter((c) => c.quantidade >= min);
  }

  if (filtroCidades.value.quantidadeMax) {
    const max = parseInt(filtroCidades.value.quantidadeMax);
    result = result.filter((c) => c.quantidade <= max);
  }

  if (filtroCidades.value.valorMin) {
    const min = parseFloat(filtroCidades.value.valorMin);
    result = result.filter((c) => c.valorRecebido >= min);
  }

  if (filtroCidades.value.valorMax) {
    const max = parseFloat(filtroCidades.value.valorMax);
    result = result.filter((c) => c.valorRecebido <= max);
  }

  return result;
});

const bairrosFiltrados = computed(() => {
  let result = [...bairros.value];

  if (filtroBairros.value.bairro) {
    result = result.filter((b) =>
      b.bairro?.toLowerCase().includes(filtroBairros.value.bairro.toLowerCase())
    );
  }

  if (filtroBairros.value.quantidadeMin) {
    const min = parseInt(filtroBairros.value.quantidadeMin);
    result = result.filter((b) => b.quantidade >= min);
  }

  if (filtroBairros.value.quantidadeMax) {
    const max = parseInt(filtroBairros.value.quantidadeMax);
    result = result.filter((b) => b.quantidade <= max);
  }

  if (filtroBairros.value.valorMin) {
    const min = parseFloat(filtroBairros.value.valorMin);
    result = result.filter((b) => b.valorRecebido >= min);
  }

  if (filtroBairros.value.valorMax) {
    const max = parseFloat(filtroBairros.value.valorMax);
    result = result.filter((b) => b.valorRecebido <= max);
  }

  return result;
});

const clientesFiltrados = computed(() => {
  let result = [...clientes.value];

  if (filtroClientes.value.cliente) {
    result = result.filter((c) =>
      c.cliente
        ?.toLowerCase()
        .includes(filtroClientes.value.cliente.toLowerCase())
    );
  }

  if (filtroClientes.value.quantidadeMin) {
    const min = parseInt(filtroClientes.value.quantidadeMin);
    result = result.filter((c) => c.quantidade >= min);
  }

  if (filtroClientes.value.quantidadeMax) {
    const max = parseInt(filtroClientes.value.quantidadeMax);
    result = result.filter((c) => c.quantidade <= max);
  }

  if (filtroClientes.value.valorMin) {
    const min = parseFloat(filtroClientes.value.valorMin);
    result = result.filter((c) => c.valorRecebido >= min);
  }

  if (filtroClientes.value.valorMax) {
    const max = parseFloat(filtroClientes.value.valorMax);
    result = result.filter((c) => c.valorRecebido <= max);
  }

  return result;
});

const tiposFiltrados = computed(() => {
  let result = [...tiposAgendamento.value];

  if (filtroTipos.value.tipo) {
    result = result.filter((t) =>
      t.tipo?.toLowerCase().includes(filtroTipos.value.tipo.toLowerCase())
    );
  }

  if (filtroTipos.value.quantidadeMin) {
    const min = parseInt(filtroTipos.value.quantidadeMin);
    result = result.filter((t) => t.quantidade >= min);
  }

  if (filtroTipos.value.quantidadeMax) {
    const max = parseInt(filtroTipos.value.quantidadeMax);
    result = result.filter((t) => t.quantidade <= max);
  }

  if (filtroTipos.value.valorMin) {
    const min = parseFloat(filtroTipos.value.valorMin);
    result = result.filter((t) => t.valorRecebido >= min);
  }

  if (filtroTipos.value.valorMax) {
    const max = parseFloat(filtroTipos.value.valorMax);
    result = result.filter((t) => t.valorRecebido <= max);
  }

  return result;
});

const contratosFiltrados = computed(() => {
  let result = [...contratos.value];

  if (filtroContratos.value.contrato) {
    result = result.filter((c) =>
      c.contrato
        ?.toLowerCase()
        .includes(filtroContratos.value.contrato.toLowerCase())
    );
  }

  if (filtroContratos.value.quantidadeMin) {
    const min = parseInt(filtroContratos.value.quantidadeMin);
    result = result.filter((c) => c.quantidade >= min);
  }

  if (filtroContratos.value.quantidadeMax) {
    const max = parseInt(filtroContratos.value.quantidadeMax);
    result = result.filter((c) => c.quantidade <= max);
  }

  if (filtroContratos.value.valorMin) {
    const min = parseFloat(filtroContratos.value.valorMin);
    result = result.filter((c) => c.valorRecebido >= min);
  }

  if (filtroContratos.value.valorMax) {
    const max = parseFloat(filtroContratos.value.valorMax);
    result = result.filter((c) => c.valorRecebido <= max);
  }

  return result;
});

// Limpar filtros
const limparFiltrosCidades = () => {
  filtroCidades.value = {
    cidade: "",
    quantidadeMin: "",
    quantidadeMax: "",
    valorMin: "",
    valorMax: "",
  };
};

const limparFiltrosBairros = () => {
  filtroBairros.value = {
    bairro: "",
    quantidadeMin: "",
    quantidadeMax: "",
    valorMin: "",
    valorMax: "",
  };
};

const limparFiltrosClientes = () => {
  filtroClientes.value = {
    cliente: "",
    quantidadeMin: "",
    quantidadeMax: "",
    valorMin: "",
    valorMax: "",
  };
};

const limparFiltrosTipos = () => {
  filtroTipos.value = {
    tipo: "",
    quantidadeMin: "",
    quantidadeMax: "",
    valorMin: "",
    valorMax: "",
  };
};

const limparFiltrosContratos = () => {
  filtroContratos.value = {
    contrato: "",
    quantidadeMin: "",
    quantidadeMax: "",
    valorMin: "",
    valorMax: "",
  };
};

onMounted(() => {
  getRelatorios();
});

// Atalhos de período
const setPeriodo = (tipo) => {
  const hoje = new Date();

  switch (tipo) {
    case "hoje":
      dataDe.value = formatDate(hoje);
      dataAte.value = formatDate(hoje);
      break;
    case "semana":
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      dataDe.value = formatDate(inicioSemana);
      dataAte.value = formatDate(hoje);
      break;
    case "mes":
      dataDe.value = formatDate(
        new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      );
      dataAte.value = formatDate(
        new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      );
      break;
    case "trimestre":
      const mesAtualNum = hoje.getMonth();
      const inicioTrimestre = Math.floor(mesAtualNum / 3) * 3;
      dataDe.value = formatDate(
        new Date(hoje.getFullYear(), inicioTrimestre, 1)
      );
      dataAte.value = formatDate(hoje);
      break;
    case "ano":
      dataDe.value = formatDate(new Date(hoje.getFullYear(), 0, 1));
      dataAte.value = formatDate(new Date(hoje.getFullYear(), 11, 31));
      break;
  }

  getRelatorios();
};

const prodTab = ref("Geral");
const tabs = [
  {
    title: "Geral",
    icon: "tabler-chart-pie-2",
  },
  {
    title: "Retrabalhos",
    icon: "tabler-refresh-alert",
  },
  {
    title: "Garantias",
    icon: "tabler-shield-dollar",
  },
  {
    title: "Clientes",
    icon: "tabler-users-group",
  }
];

const viewAge = (age) => {
  router.push({
    name: "agendamento",
    query: {
      viewAgendamento: age.age_id,
    },
  });
};
</script>

<template>
  <!-- Dialog de Loading -->
  <VDialog v-model="loading" persistent max-width="500">
    <VCard>
      <VCardText class="text-center pa-8">
        <VProgressCircular indeterminate color="primary" size="64" />
        <p class="mt-4 mb-0">Carregando relatórios de agendamentos...</p>
      </VCardText>
    </VCard>
  </VDialog>

  <h2 class="text-h4 mb-2">Relatórios de Agendamentos</h2>
  <p class="text-sm text-disabled mb-6">
    Visualize e analise os agendamentos realizados por período
  </p>

  <!-- Filtros de Período -->
  <VCard class="mb-6">
    <VCardText>
      <VRow class="align-center">
        <VCol cols="12" md="3">
          <h4 class="mb-0">Filtros de Período</h4>
          <p class="text-sm text-disabled mb-0">Selecione o período desejado</p>
        </VCol>

        <VCol cols="12" md="9">
          <VRow class="align-end">
            <!-- Datas customizadas -->
            <VCol cols="12" sm="4">
              <AppTextField
                v-model="dataDe"
                type="date"
                label="Data Inicial"
                :disabled="loading"
              />
            </VCol>

            <VCol cols="12" sm="4">
              <AppTextField
                v-model="dataAte"
                type="date"
                label="Data Final"
                :disabled="loading"
              />
            </VCol>

            <VCol cols="12" sm="4">
              <VBtn
                color="primary"
                @click="getRelatorios"
                :loading="loading"
                block
              >
                <VIcon icon="tabler-search" class="mr-1" />
                Filtrar
              </VBtn>
            </VCol>

            <!-- Atalhos -->
            <VCol cols="12" class="py-0">
              <div class="d-flex flex-wrap gap-2 mb-3">
                <VBtn
                  size="small"
                  variant="tonal"
                  @click="setPeriodo('hoje')"
                  style="height: 30px"
                >
                  Hoje
                </VBtn>

                <VBtn
                  size="small"
                  variant="tonal"
                  @click="setPeriodo('semana')"
                  style="height: 30px"
                >
                  Esta Semana
                </VBtn>

                <VBtn
                  size="small"
                  variant="tonal"
                  @click="setPeriodo('mes')"
                  style="height: 30px"
                >
                  Este Mês
                </VBtn>

                <VBtn
                  size="small"
                  variant="tonal"
                  @click="setPeriodo('trimestre')"
                  style="height: 30px"
                >
                  Este Trimestre
                </VBtn>

                <VBtn
                  size="small"
                  variant="tonal"
                  @click="setPeriodo('ano')"
                  style="height: 30px"
                >
                  Este Ano
                </VBtn>
              </div>
            </VCol>
          </VRow>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <div class="d-flex justify-center">
    <VTabs v-model="prodTab" class="v-tabs-pill">
      <VTab v-for="tab in tabs" :key="tab.icon" :value="tab.title">
        <VIcon :size="18" :icon="tab.icon" class="me-1" />
        <span>{{ tab.title }}</span>
      </VTab>
    </VTabs>
  </div>

  <VWindow v-model="prodTab" class="mt-6 disable-tab-transition" :touch="false">
    <VWindowItem value="Geral">
      <!-- Cards de Resumo -->
      <VRow class="mb-6 match-height" v-if="relatorios">
        <!-- Total de Agendamentos -->
        <VCol cols="12" md="3">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center">
                <div class="text-left">
                  <h3 class="text-h3 mb-0">
                    {{ resumo.totalAgendamentos }}
                  </h3>
                  <p class="text-sm mb-1">Agendamentos</p>

                  <p class="text-caption mb-1 font-weight-medium">
                    <span class="text-success">
                      {{ formatValor(resumo.totalValorRecebido) }}

                      <VTooltip
                        activator="parent"
                        text="Valor recebido de todos os agendamentos"
                      />
                    </span>
                    <span class="text-disabled"> | </span>
                    <span class="text-warning">
                      {{ formatValor(resumo.totalValorPendente) }}

                      <VTooltip
                        activator="parent"
                        text="Valor pendente de todos os agendamentos"
                      />
                    </span>
                    <span class="text-disabled"> | </span>
                    <span class="text-info">
                      {{ formatValor(resumo.totalValorFuturo) }}

                      <VTooltip activator="parent" text="Valor a receber" />
                    </span>
                  </p>
                </div>
                <VAvatar color="primary" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-calendar" size="28" />
                </VAvatar>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Atendidos -->
        <VCol cols="12" md="3">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center">
                <div class="text-left">
                  <h3 class="text-h3 mb-0">{{ resumo.qtdAtendidos }}</h3>
                  <p class="text-sm mb-0">Atendidos</p>

                  <p class="text-disabled text-caption mb-0">
                    Ticket Médio: {{ formatValor(resumo.ticketMedio) }}
                  </p>
                </div>

                <VAvatar color="success" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-calendar-check" size="28" />
                </VAvatar>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Confirmados -->
        <VCol cols="12" md="3">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center">
                <div class="text-left">
                  <h3 class="text-h3 mb-0">{{ resumo.qtdConfirmados }}</h3>
                  <p class="text-sm mb-0">Confirmados</p>

                  <p class="text-disabled text-caption mb-0">
                    Aguardando atendimento
                  </p>
                </div>

                <VAvatar color="warning" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-clock" size="28" />
                </VAvatar>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Retrabalhos -->
        <VCol cols="12" md="3">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center">
                <div class="text-left">
                  <h3 class="text-h3 mb-0">{{ resumo.qtdRetrabalhos }}</h3>
                  <p class="text-sm mb-0">Retrabalhos</p>

                  <p class="text-disabled text-caption mb-0">
                    {{
                      resumo.totalAgendamentos > 0
                        ? (
                            (resumo.qtdRetrabalhos / resumo.totalAgendamentos) *
                            100
                          ).toFixed(1)
                        : 0
                    }}% do total
                  </p>
                </div>

                <VAvatar color="error" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-refresh-alert" size="28" />
                </VAvatar>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Gráfico de Evolução -->
      <VRow class="mb-6" v-if="relatorios">
        <VCol cols="12">
          <GraficoEvolucaoAgendamentos :dados="dadosEvolucao" />
        </VCol>
      </VRow>

      <!-- Gráfico de Status -->
      <VRow class="mb-6" v-if="relatorios && status.length > 0">
        <VCol cols="12" md="6">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Agendamentos por Status</h5>
                  <p class="text-sm text-disabled mb-0">
                    Distribuição por status
                  </p>
                </div>
                <VAvatar color="primary" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-flag" size="28" />
                </VAvatar>
              </div>

              <div style="max-height: 300px; height: 300px; overflow-y: auto">
                <div v-for="st in status" :key="st.status" class="mb-3 pr-3">
                  <div class="d-flex justify-space-between mb-1">
                    <p class="mb-0 text-sm">
                      {{ st.status }}
                      ({{ st.quantidade }})
                    </p>
                    <p class="mb-0 text-sm font-weight-medium">
                      <span class="text-success" v-if="st.valorRecebido > 0">
                        {{ formatValor(st.valorRecebido) }}

                        <VTooltip activator="parent" text="Valor recebido" />
                      </span>
                      <span
                        class="text-disabled"
                        v-if="st.valorRecebido > 0 && st.valorFuturo > 0"
                      >
                        |
                      </span>
                      <span class="text-info" v-if="st.valorFuturo > 0">
                        {{ formatValor(st.valorFuturo) }}

                        <VTooltip activator="parent" text="Valor a receber" />
                      </span>
                    </p>
                  </div>
                  <VProgressLinear
                    :model-value="
                      (st.quantidade / resumo.totalAgendamentos) * 100
                    "
                    height="8"
                    rounded
                    color="primary"
                  />
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Gráfico de Fontes -->
        <VCol cols="12" md="6" v-if="fontes.length > 0">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Agendamentos por Fonte</h5>
                  <p class="text-sm text-disabled mb-0">
                    De onde vieram os agendamentos
                  </p>
                </div>
                <VAvatar color="info" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-world" size="28" />
                </VAvatar>
              </div>

              <div style="max-height: 300px; height: 300px; overflow-y: auto">
                <div
                  v-for="fonte in fontes"
                  :key="fonte.fonte"
                  class="mb-3 pr-3"
                >
                  <div class="d-flex justify-space-between mb-1">
                    <p class="mb-0 text-sm">
                      {{ fonte.fonte }}
                      ({{ fonte.quantidade }})
                    </p>
                    <p class="mb-0 text-sm font-weight-medium">
                      <span class="text-success" v-if="fonte.valorRecebido > 0">
                        {{ formatValor(fonte.valorRecebido) }}

                        <VTooltip activator="parent" text="Valor recebido" />
                      </span>
                      <span
                        class="text-disabled"
                        v-if="fonte.valorRecebido > 0 && fonte.valorFuturo > 0"
                      >
                        |
                      </span>
                      <span class="text-info" v-if="fonte.valorFuturo > 0">
                        {{ formatValor(fonte.valorFuturo) }}

                        <VTooltip activator="parent" text="Valor a receber" />
                      </span>
                    </p>
                  </div>
                  <VProgressLinear
                    :model-value="
                      (fonte.valorRecebido / resumo.totalValorRecebido) * 100
                    "
                    height="8"
                    rounded
                    color="info"
                  />
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Tabela de Tipos de Agendamento -->
      <VRow class="mb-6" v-if="relatorios && tiposAgendamento.length > 0">
        <VCol cols="12">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Tipos de Agendamento</h5>
                  <p class="text-sm text-disabled mb-0">
                    {{ tiposFiltrados.length }} de
                    {{ tiposAgendamento.length }} tipos
                  </p>
                </div>
                <VAvatar color="primary" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-category" size="28" />
                </VAvatar>
              </div>

              <!-- Filtros -->
              <VRow class="mb-4">
                <VCol cols="12" sm="3">
                  <AppTextField
                    v-model="filtroTipos.tipo"
                    placeholder="Filtrar por tipo"
                    density="compact"
                    clearable
                  >
                    <template #prepend-inner>
                      <VIcon icon="tabler-search" size="20" />
                    </template>
                  </AppTextField>
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroTipos.quantidadeMin"
                    placeholder="Qtd. mín."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroTipos.quantidadeMax"
                    placeholder="Qtd. máx."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroTipos.valorMin"
                    placeholder="Valor mín."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroTipos.valorMax"
                    placeholder="Valor máx."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="1">
                  <VBtn
                    color="secondary"
                    variant="tonal"
                    @click="limparFiltrosTipos"
                    block
                    density="compact"
                  >
                    <VIcon icon="tabler-x" size="18" />
                  </VBtn>
                </VCol>
              </VRow>

              <!-- Tabela -->
              <div style="max-height: 400px; overflow-y: auto">
                <VTable v-if="tiposFiltrados.length > 0">
                  <thead
                    style="
                      position: sticky;
                      top: 0;
                      background: inherit;
                      z-index: 1;
                    "
                  >
                    <tr>
                      <th>Tipo</th>
                      <th>Quantidade Total</th>
                      <th>Por Status</th>
                      <th>Valor Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="tipo in tiposFiltrados" :key="tipo.tipo">
                      <td>
                        {{
                          tipo.tipo == "servico"
                            ? "Serviço"
                            : tipo.tipo == "orcamento"
                            ? "Orçamento"
                            : tipo.tipo == "retrabalho"
                            ? "Retrabalho"
                            : tipo.tipo == "bloqueio"
                            ? "Bloqueio de Horário"
                            : tipo.tipo
                        }}
                      </td>
                      <td class="font-weight-medium">
                        <p class="text-sm mb-0 font-weight-medium">
                          {{ tipo.quantidade }}
                        </p>
                      </td>
                      <td>
                        <div class="my-2">
                          <p
                            class="text-sm mb-1"
                            v-for="(count, status) in tipo.statusCount"
                            :key="status"
                            v-show="count > 0"
                          >
                            {{ status }}: {{ count }}
                          </p>
                        </div>
                      </td>
                      <td class="font-weight-bold text-success">
                        {{ formatValor(tipo.valorRecebido) }}
                      </td>
                    </tr>
                  </tbody>
                </VTable>

                <div v-else class="text-center py-8">
                  <VIcon
                    icon="tabler-category"
                    size="48"
                    color="disabled"
                    class="mb-2"
                  />
                  <p class="text-disabled mb-0">Nenhum tipo encontrado</p>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Tabelas de Cidades, Bairros e Clientes -->
      <VRow class="mb-6" v-if="relatorios">
        <!-- Cidades -->
        <VCol cols="12" md="4">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Por Cidade</h5>
                  <p class="text-sm text-disabled mb-0">
                    {{ cidadesFiltradas.length }} de
                    {{ cidades.length }} cidades
                  </p>
                </div>
                <VAvatar color="info" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-building-skyscraper" size="28" />
                </VAvatar>
              </div>

              <!-- Filtros -->
              <VRow class="mb-2">
                <VCol cols="12">
                  <AppTextField
                    v-model="filtroCidades.cidade"
                    placeholder="Filtrar"
                    density="compact"
                    clearable
                  >
                    <template #prepend-inner>
                      <VIcon icon="tabler-search" size="20" />
                    </template>
                  </AppTextField>
                </VCol>
              </VRow>

              <!-- Tabela -->
              <div style="max-height: 300px; overflow-y: auto">
                <VTable density="compact" v-if="cidadesFiltradas.length > 0">
                  <thead
                    style="
                      position: sticky;
                      top: 0;
                      background: inherit;
                      z-index: 1;
                    "
                  >
                    <tr>
                      <th>Cidade</th>
                      <th>Qtd</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="cidade in cidadesFiltradas" :key="cidade.cidade">
                      <td class="text-sm">{{ cidade.cidade }}</td>
                      <td class="text-sm">{{ cidade.quantidade }}</td>
                      <td class="text-sm text-success">
                        {{ formatValor(cidade.valorRecebido) }}
                      </td>
                    </tr>
                  </tbody>
                </VTable>
                <div v-else class="text-center py-4">
                  <p class="text-disabled text-sm mb-0">Nenhuma cidade</p>
                </div>
              </div>

              <div class="mt-2">
                <VBtn
                  color="secondary"
                  variant="text"
                  size="small"
                  @click="limparFiltrosCidades"
                >
                  Limpar filtros
                </VBtn>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Bairros -->
        <VCol cols="12" md="4">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Por Bairro</h5>
                  <p class="text-sm text-disabled mb-0">
                    {{ bairrosFiltrados.length }} de
                    {{ bairros.length }} bairros
                  </p>
                </div>
                <VAvatar color="warning" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-map-pin" size="28" />
                </VAvatar>
              </div>

              <!-- Filtros -->
              <VRow class="mb-2">
                <VCol cols="12">
                  <AppTextField
                    v-model="filtroBairros.bairro"
                    placeholder="Filtrar"
                    density="compact"
                    clearable
                  >
                    <template #prepend-inner>
                      <VIcon icon="tabler-search" size="20" />
                    </template>
                  </AppTextField>
                </VCol>
              </VRow>

              <!-- Tabela -->
              <div style="max-height: 300px; overflow-y: auto">
                <VTable density="compact" v-if="bairrosFiltrados.length > 0">
                  <thead
                    style="
                      position: sticky;
                      top: 0;
                      background: inherit;
                      z-index: 1;
                    "
                  >
                    <tr>
                      <th>Bairro</th>
                      <th>Qtd</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="bairro in bairrosFiltrados" :key="bairro.bairro">
                      <td class="text-sm">{{ bairro.bairro }}</td>
                      <td class="text-sm">{{ bairro.quantidade }}</td>
                      <td class="text-sm text-success">
                        {{ formatValor(bairro.valorRecebido) }}
                      </td>
                    </tr>
                  </tbody>
                </VTable>
                <div v-else class="text-center py-4">
                  <p class="text-disabled text-sm mb-0">Nenhum bairro</p>
                </div>
              </div>

              <div class="mt-2">
                <VBtn
                  color="secondary"
                  variant="text"
                  size="small"
                  @click="limparFiltrosBairros"
                >
                  Limpar filtros
                </VBtn>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Clientes -->
        <VCol cols="12" md="4">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Por Cliente</h5>
                  <p class="text-sm text-disabled mb-0">
                    {{ clientesFiltrados.length }} de
                    {{ clientes.length }} clientes
                  </p>
                </div>
                <VAvatar color="success" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-users" size="28" />
                </VAvatar>
              </div>

              <!-- Filtros -->
              <VRow class="mb-2">
                <VCol cols="12">
                  <AppTextField
                    v-model="filtroClientes.cliente"
                    placeholder="Filtrar"
                    density="compact"
                    clearable
                  >
                    <template #prepend-inner>
                      <VIcon icon="tabler-search" size="20" />
                    </template>
                  </AppTextField>
                </VCol>
              </VRow>

              <!-- Tabela -->
              <div style="max-height: 300px; overflow-y: auto">
                <VTable density="compact" v-if="clientesFiltrados.length > 0">
                  <thead
                    style="
                      position: sticky;
                      top: 0;
                      background: inherit;
                      z-index: 1;
                    "
                  >
                    <tr>
                      <th>Cliente</th>
                      <th>Qtd</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="cliente in clientesFiltrados"
                      :key="cliente.cli_id"
                    >
                      <td class="text-sm">{{ cliente.cliente }}</td>
                      <td class="text-sm">{{ cliente.quantidade }}</td>
                      <td class="text-sm text-success">
                        {{ formatValor(cliente.valorRecebido) }}
                      </td>
                    </tr>
                  </tbody>
                </VTable>
                <div v-else class="text-center py-4">
                  <p class="text-disabled text-sm mb-0">Nenhum cliente</p>
                </div>
              </div>

              <div class="mt-2">
                <VBtn
                  color="secondary"
                  variant="text"
                  size="small"
                  @click="limparFiltrosClientes"
                >
                  Limpar filtros
                </VBtn>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem value="Retrabalhos">
      <!-- Tabelas de Retrabalho e Garantia -->
      <VRow class="mb-6" v-if="relatorios">
        <VCol cols="12">
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Relatório de Retrabalhos</h5>
              <p class="text-sm text-disabled mb-0">
                Agendamentos que tiveram retrabalho
              </p>
            </div>
            <VAvatar color="error" variant="tonal" rounded size="42">
              <VIcon icon="tabler-repeat" size="28" />
            </VAvatar>
          </div>

          <tableagendamentosretrabalho :dataDe="dataDe" :dataAte="dataAte" />
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem value="Garantias">
      <VRow class="mb-6" v-if="relatorios">
        <VCol cols="12">
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Relatório de Garantias</h5>
              <p class="text-sm text-disabled mb-0">
                Agendamentos com garantia ativa
              </p>
            </div>
            <VAvatar color="success" variant="tonal" rounded size="42">
              <VIcon icon="tabler-certificate" size="28" />
            </VAvatar>
          </div>

          <tableagendamentosgarantia :dataDe="dataDe" :dataAte="dataAte" />
        </VCol>
      </VRow>
    </VWindowItem>

   <!--  <VWindowItem>
      <VRow class="mb-6" v-if="relatorios && resumoContratos.qtdContratos > 0">
        <VCol cols="12" md="6">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-2">
                <div class="text-left">
                  <h3 class="text-h4 mb-0">
                    {{ resumoContratos.qtdContratos }}
                  </h3>
                  <p class="text-sm mb-0">Contratos Ativos</p>

                  <p class="text-disabled text-caption mb-0">
                    Contratos no período selecionado
                  </p>
                </div>
                <VAvatar color="info" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-file-text" size="28" />
                </VAvatar>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" md="6">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-2">
                <div class="text-left">
                  <h3 class="text-h4 mb-0">
                    {{ formatValor(resumoContratos.valorTotalContratos) }}
                  </h3>
                  <p class="text-sm mb-0">Valor Total dos Contratos</p>

                  <p class="text-disabled text-caption mb-0">
                    Soma dos valores de todos os contratos
                  </p>
                </div>
                <VAvatar color="success" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-currency-real" size="28" />
                </VAvatar>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow class="mb-6" v-if="relatorios && contratos.length > 0">
        <VCol cols="12">
          <VCard>
            <VCardText>
              <div class="d-flex justify-space-between align-center mb-4">
                <div>
                  <h5 class="text-h5 mb-1">Agendamentos por Contrato</h5>
                  <p class="text-sm text-disabled mb-0">
                    {{ contratosFiltrados.length }} de
                    {{ contratos.length }} contratos
                  </p>
                </div>
                <VAvatar color="warning" variant="tonal" rounded size="42">
                  <VIcon icon="tabler-file-text" size="28" />
                </VAvatar>
              </div>

              <VRow class="mb-4">
                <VCol cols="12" sm="3">
                  <AppTextField
                    v-model="filtroContratos.contrato"
                    placeholder="Filtrar por contrato"
                    density="compact"
                    clearable
                  >
                    <template #prepend-inner>
                      <VIcon icon="tabler-search" size="20" />
                    </template>
                  </AppTextField>
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroContratos.quantidadeMin"
                    placeholder="Qtd. mín."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroContratos.quantidadeMax"
                    placeholder="Qtd. máx."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroContratos.valorMin"
                    placeholder="Valor mín."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="2">
                  <AppTextField
                    v-model="filtroContratos.valorMax"
                    placeholder="Valor máx."
                    type="number"
                    density="compact"
                    clearable
                  />
                </VCol>
                <VCol cols="12" sm="1">
                  <VBtn
                    color="secondary"
                    variant="tonal"
                    @click="limparFiltrosContratos"
                    block
                    density="compact"
                  >
                    <VIcon icon="tabler-x" size="18" />
                  </VBtn>
                </VCol>
              </VRow>

              <div style="max-height: 400px; overflow-y: auto">
                <VTable
                  v-if="contratosFiltrados.length > 0"
                  density="comfortable"
                >
                  <thead
                    style="
                      position: sticky;
                      top: 0;
                      background: inherit;
                      z-index: 1;
                    "
                  >
                    <tr>
                      <th style="width: 300px">Informações do Contrato</th>
                      <th>Agendamentos</th>
                      <th>Valor Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="contrato in contratosFiltrados"
                      :key="contrato.contrato"
                    >
                      <td>
                        <div
                          v-if="contrato.contratoInfo"
                          class="d-flex flex-column gap-0 py-2"
                        >
                          <div class="d-flex flex-row align-center mb-1">
                            <p class="mb-0 text-sm font-weight-bold">
                              N° #{{ contrato.contrato }}
                            </p>
                            <VChip
                              :color="
                                contrato.contratoInfo.ativo
                                  ? 'success'
                                  : 'error'
                              "
                              size="x-small"
                              label
                              class="ml-2"
                            >
                              {{
                                contrato.contratoInfo.ativo
                                  ? "Ativo"
                                  : "Inativo"
                              }}
                            </VChip>
                          </div>

                          <p class="mb-0 text-sm">
                            <strong>Cliente:</strong>
                            {{ contrato.contratoInfo.cliente }}
                          </p>

                          <p class="mb-0 text-sm">
                            <strong>Período:</strong>
                            {{ contrato.contratoInfo.periodo }}
                            {{ contrato.contratoInfo.periodoType }}
                          </p>

                          <p class="mb-0 text-sm">
                            <strong>Início:</strong>
                            {{
                              moment(contrato.contratoInfo.inicioData).format(
                                "DD/MM/YYYY"
                              )
                            }}
                            - <strong>Fim:</strong>
                            {{ calcularPeriodo(contrato.contratoInfo) }}
                          </p>

                          <p class="mb-0 text-sm">
                            <strong>Valor:</strong>
                            {{ formatValor(contrato.contratoInfo.valor) }}
                          </p>
                        </div>
                        <div v-else>
                          <p class="mb-0 text-sm font-weight-bold">
                            N° #{{ contrato.contrato }}
                          </p>
                          <p class="mb-0 text-sm text-disabled">
                            Informações não disponíveis
                          </p>
                        </div>
                      </td>
                      <td>
                        <p class="mb-0 font-weight-medium">
                          {{ contrato.quantidade }} Agendamentos
                          <VIcon
                            :icon="
                              contrato.viewAges
                                ? 'tabler-chevron-up'
                                : 'tabler-chevron-down'
                            "
                            class="ml-1"
                            @click="contrato.viewAges = !contrato.viewAges"
                          />
                        </p>

                        <VCard
                          v-if="contrato.viewAges"
                          class="my-2 pa-3 pl-5"
                          rounded="xl"
                          max-width="350px"
                          v-for="agendamento in contrato.agendamentos"
                          :key="agendamento.age_id"
                          :color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                          @click="viewAge(agendamento)"
                        >
                          <p class="mb-1 text-sm">
                            <VIcon icon="tabler-calendar" class="mr-2" />
                            {{
                              formatDateAgendamento(
                                agendamento.age_data,
                                agendamento.age_horaInicio,
                                agendamento.age_horaFim
                              )
                            }}
                            <VTooltip activator="parent" location="bottom">
                              <p class="mb-0 text-sm">Data do agendamento</p>
                            </VTooltip>
                          </p>

                          <p class="mb-1 text-sm">
                            <VIcon icon="tabler-info-circle" class="mr-2" />
                            {{ agendamento?.status_nome || "Sem status" }}
                            <VTooltip activator="parent" location="bottom">
                              <p class="mb-0 text-sm">Status do agendamento</p>
                            </VTooltip>
                          </p>

                          <p class="mb-1 text-sm text-truncate">
                            <VIcon icon="tabler-user" class="mr-2" />
                            {{
                              agendamento?.funcionario?.length
                                ? agendamento.funcionario[0]?.fullName
                                : "Sem funcionário"
                            }}
                            <VTooltip activator="parent" location="bottom">
                              <p class="mb-0 text-sm">
                                Funcionário responsável
                              </p>
                            </VTooltip>
                          </p>

                          <p
                            class="mb-0 text-sm"
                            v-if="agendamento?.age_valor != null"
                          >
                            <VIcon icon="tabler-coin" class="mr-2" />
                            {{ formatValor(agendamento?.age_valor) }}
                            <VTooltip activator="parent" location="bottom">
                              <p class="mb-0 text-sm">Valor do agendamento</p>
                            </VTooltip>
                          </p>
                        </VCard>
                      </td>
                      <td class="font-weight-bold text-success">
                        {{ formatValor(contrato.valorRecebido) }}
                      </td>
                    </tr>
                  </tbody>
                </VTable>

                <div v-else class="text-center py-8">
                  <VIcon
                    icon="tabler-file-text"
                    size="48"
                    color="disabled"
                    class="mb-2"
                  />
                  <p class="text-disabled mb-0">Nenhum contrato encontrado</p>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem> -->

    <VWindowItem value="Clientes">
      <tableagendamentosclientes :dataDe="dataDe" :dataAte="dataAte" />
    </VWindowItem>
  </VWindow>

  <!-- Estado vazio -->
  <VRow v-if="!relatorios && !loading">
    <VCol cols="12">
      <VCard>
        <VCardText class="text-center py-16">
          <VIcon
            icon="tabler-calendar"
            size="64"
            color="disabled"
            class="mb-4"
          />
          <h4 class="text-h4 mb-2">Selecione um período</h4>
          <p class="text-disabled mb-0">
            Configure o período desejado e clique em Filtrar para visualizar os
            relatórios de agendamentos
          </p>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style scoped>
.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
