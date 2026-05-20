<script setup>
import { ref, computed, onMounted } from "vue";
import moment from "moment";
import GraficoEvolucaoServicos from "@/views/apps/relatorios/grafico-evolucao-servicos.vue";

const { setAlert } = useAlert();

const loading = ref(false);

// Formatar valor
const formatValor = (valor) => {
  if (!valor && valor !== 0) return "R$ 0,00";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    const res = await $api("/relatorios/get/servicos", {
      query: {
        dataDe: dataDe.value,
        dataAte: dataAte.value,
      },
    });

    if (!res) return;

    console.log("Relatórios serviços:", res);

    relatorios.value = res;
  } catch (error) {
    console.error("Erro ao buscar relatórios de serviços:", error);
    setAlert(
      "Erro ao buscar relatórios de serviços",
      "error",
      "tabler-alert-triangle",
      5000
    );
    relatorios.value = null;
  }

  loading.value = false;
};

// Computed properties
const servicosDetalhados = computed(
  () => relatorios.value?.servicosDetalhados || []
);
const subservicosDetalhados = computed(
  () => relatorios.value?.subservicosDetalhados || []
);
const servicosPorFuncionario = computed(
  () => relatorios.value?.servicosPorFuncionario || []
);
const evolucaoServicos = computed(
  () => relatorios.value?.evolucaoServicos || []
);

// Computed - Gráfico de Evolução
const dadosEvolucao = computed(() => {
  if (!evolucaoServicos.value || evolucaoServicos.value.length === 0) {
    return {
      series: {
        quantidade: [],
        valorTotal: [],
      },
      categories: [],
    };
  }

  return {
    series: {
      quantidade: evolucaoServicos.value.map((item) => item.quantidade),
      valorTotal: evolucaoServicos.value.map((item) => item.valorTotal),
    },
    categories: evolucaoServicos.value.map((item) =>
      moment(item.data).format("DD/MM")
    ),
  };
});

// Filtros para tabela de serviços
const filtroServicos = ref({
  nome: "",
  valorMin: "",
  valorMax: "",
  quantidadeMin: "",
});

// Filtros para tabela de subserviços
const filtroSubs = ref({
  nome: "",
  valorMin: "",
  valorMax: "",
  quantidadeMin: "",
  quantidadeMax: "",
});

// Filtros para tabela de técnicos
const filtroTecnicos = ref({
  nome: "",
  valorMin: "",
  valorMax: "",
  quantidadeMin: "",
  quantidadeMax: "",
});

// Serviços filtrados
const servicosFiltrados = computed(() => {
  let result = [...servicosDetalhados.value];

  if (filtroServicos.value.nome) {
    result = result.filter((s) =>
      s.ser_nome
        ?.toLowerCase()
        .includes(filtroServicos.value.nome.toLowerCase())
    );
  }

  if (filtroServicos.value.valorMin) {
    const min = parseFloat(filtroServicos.value.valorMin);
    result = result.filter((s) => s.valorTotal >= min);
  }

  if (filtroServicos.value.valorMax) {
    const max = parseFloat(filtroServicos.value.valorMax);
    result = result.filter((s) => s.valorTotal <= max);
  }

  if (filtroServicos.value.quantidadeMin) {
    const min = parseInt(filtroServicos.value.quantidadeMin);
    result = result.filter((s) => s.quantidade >= min);
  }

  return result;
});

// Subserviços filtrados
const subsFiltrados = computed(() => {
  let result = [...subservicosDetalhados.value];

  if (filtroSubs.value.nome) {
    result = result.filter((s) =>
      s.ser_nome?.toLowerCase().includes(filtroSubs.value.nome.toLowerCase())
    );
  }

  if (filtroSubs.value.valorMin) {
    const min = parseFloat(filtroSubs.value.valorMin);
    result = result.filter((s) => s.valorTotal >= min);
  }

  if (filtroSubs.value.valorMax) {
    const max = parseFloat(filtroSubs.value.valorMax);
    result = result.filter((s) => s.valorTotal <= max);
  }

  if (filtroSubs.value.quantidadeMin) {
    const min = parseInt(filtroSubs.value.quantidadeMin);
    result = result.filter((s) => s.quantidade >= min);
  }

  if (filtroSubs.value.quantidadeMax) {
    const max = parseInt(filtroSubs.value.quantidadeMax);
    result = result.filter((s) => s.quantidade <= max);
  }

  return result;
});

// Técnicos filtrados
const tecnicosFiltrados = computed(() => {
  let result = [...servicosPorFuncionario.value];

  if (filtroTecnicos.value.nome) {
    result = result.filter((t) =>
      t.fun_nome
        ?.toLowerCase()
        .includes(filtroTecnicos.value.nome.toLowerCase())
    );
  }

  if (filtroTecnicos.value.valorMin) {
    const min = parseFloat(filtroTecnicos.value.valorMin);
    result = result.filter((t) => t.valorTotal >= min);
  }

  if (filtroTecnicos.value.valorMax) {
    const max = parseFloat(filtroTecnicos.value.valorMax);
    result = result.filter((t) => t.valorTotal <= max);
  }

  if (filtroTecnicos.value.quantidadeMin) {
    const min = parseInt(filtroTecnicos.value.quantidadeMin);
    result = result.filter((t) => t.quantidadeTotal >= min);
  }

  if (filtroTecnicos.value.quantidadeMax) {
    const max = parseInt(filtroTecnicos.value.quantidadeMax);
    result = result.filter((t) => t.quantidadeTotal <= max);
  }

  return result;
});

// Limpar filtros
const limparFiltrosServicos = () => {
  filtroServicos.value = {
    nome: "",
    valorMin: "",
    valorMax: "",
    quantidadeMin: "",
  };
};

const limparFiltrosSubs = () => {
  filtroSubs.value = {
    nome: "",
    valorMin: "",
    valorMax: "",
    quantidadeMin: "",
    quantidadeMax: "",
  };
};

const limparFiltrosTecnicos = () => {
  filtroTecnicos.value = {
    nome: "",
    valorMin: "",
    valorMax: "",
    quantidadeMin: "",
    quantidadeMax: "",
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
</script>

<template>
  <!-- Dialog de Loading -->
  <VDialog v-model="loading" persistent max-width="500">
    <VCard>
      <VCardText class="text-center pa-8">
        <VProgressCircular indeterminate color="primary" size="64" />
        <p class="mt-4 mb-0">Carregando relatórios de serviços...</p>
      </VCardText>
    </VCard>
  </VDialog>

  <h2 class="text-h4 mb-2">Relatórios de Serviços</h2>
  <p class="text-sm text-disabled mb-6">
    Visualize e analise os serviços realizados por período
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

  <!-- Cards de Resumo -->
  <VRow class="mb-6" v-if="relatorios">
    <!-- Total de Serviços -->
    <VCol cols="12" md="3">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="primary" variant="tonal" rounded size="42">
              <VIcon icon="tabler-tools" size="28" />
            </VAvatar>
            <VChip color="primary" size="small">
              {{ relatorios.totalServicosRealizados }}
            </VChip>
          </div>

          <h3 class="text-h3 mt-4 mb-1">
            {{ formatValor(relatorios.totalValorGerado) }}
          </h3>
          <p class="text-sm mb-0">Total Cobrado em Serviços</p>

          <div class="d-flex align-center mt-3 text-sm">
            <span class="text-disabled">{{ relatorios.totalServicosRealizados }} atendimentos</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Ticket Médio -->
    <VCol cols="12" md="3">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="success" variant="tonal" rounded size="42">
              <VIcon icon="tabler-chart-line" size="28" />
            </VAvatar>
          </div>

          <h3 class="text-h3 mt-4 mb-1">
            {{ formatValor(relatorios.ticketMedio) }}
          </h3>
          <p class="text-sm mb-0">Ticket Médio Cobrado</p>

          <div class="d-flex align-center mt-3 text-sm">
            <span class="text-disabled">Por Atendimento</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Mais Realizado -->
    <VCol cols="12" md="3">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="warning" variant="tonal" rounded size="42">
              <VIcon icon="tabler-trophy" size="28" />
            </VAvatar>
            <VChip
              color="warning"
              size="small"
              v-if="relatorios.servicoMaisRealizado"
            >
              {{ relatorios.servicoMaisRealizado.quantidade }}x
            </VChip>
          </div>

          <h3
            class="text-h3 mt-4 mb-1 text-truncate"
            :title="relatorios.servicoMaisRealizado?.ser_nome"
          >
            {{ relatorios.servicoMaisRealizado?.ser_nome || "-" }}
          </h3>
          <p class="text-sm mb-0">Mais Realizado</p>

          <div class="d-flex align-center mt-3 text-sm">
            <span class="text-disabled">Top 1</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Mais Lucrativo -->
    <VCol cols="12" md="3">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="info" variant="tonal" rounded size="42">
              <VIcon icon="tabler-currency-real" size="28" />
            </VAvatar>
          </div>

          <h3
            class="text-h3 mt-4 mb-1 text-truncate"
            :title="relatorios.servicoMaisLucrativo?.ser_nome"
          >
            {{ relatorios.servicoMaisLucrativo?.ser_nome || "-" }}
          </h3>
          <p class="text-sm mb-0">Mais Lucrativo</p>

          <div class="d-flex align-center mt-3 text-sm">
            <span class="text-disabled">{{
              formatValor(relatorios.servicoMaisLucrativo?.valorTotal || 0)
            }}</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Nota: origem dos valores -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <VAlert
        type="info"
        variant="tonal"
        density="comfortable"
        icon="tabler-info-circle"
      >
        <div class="text-sm">
          <strong>Sobre os valores:</strong> os valores exibidos neste relatório
          referem-se ao <strong>cadastro do serviço no agendamento</strong>
          (preço cobrado × quantidade). Eles podem diferir do valor efetivamente
          recebido quando há descontos, pagamentos parciais, gorjetas ou
          ajustes manuais. Para conferir o que entrou no caixa, consulte o
          <strong>Relatório Financeiro</strong>.
        </div>
      </VAlert>
    </VCol>
  </VRow>

  <!-- Gráfico de Evolução -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <GraficoEvolucaoServicos :dados="dadosEvolucao" />
    </VCol>
  </VRow>

  <!-- Tabela de Serviços Realizados -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Serviços Realizados</h5>
              <p class="text-sm text-disabled mb-0">
                {{ servicosFiltrados.length }} de
                {{ servicosDetalhados.length }} serviços
              </p>
            </div>
            <VAvatar color="primary" variant="tonal" rounded size="42">
              <VIcon icon="tabler-list-details" size="28" />
            </VAvatar>
          </div>

          <!-- Filtros -->
          <VRow class="mb-4">
            <VCol cols="12" sm="3">
              <AppTextField
                v-model="filtroServicos.nome"
                placeholder="Filtrar por nome"
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
                v-model="filtroServicos.valorMin"
                placeholder="Valor mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroServicos.valorMax"
                placeholder="Valor máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="3">
              <AppTextField
                v-model="filtroServicos.quantidadeMin"
                placeholder="Qtd. mínima"
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <VBtn
                color="secondary"
                variant="tonal"
                @click="limparFiltrosServicos"
                block
                density="compact"
              >
                <VIcon icon="tabler-x" size="18" />
                Limpar
              </VBtn>
            </VCol>
          </VRow>

          <!-- Tabela -->
          <div style="max-height: 500px; overflow-y: auto">
            <VTable v-if="servicosFiltrados.length > 0">
              <thead
                style="
                  position: sticky;
                  top: 0;
                  background: inherit;
                  z-index: 1;
                "
              >
                <tr>
                  <th>Serviço</th>
                  <th>Atendimentos</th>
                  <th>Cobrado</th>
                  <th>Recebido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="servico in servicosFiltrados" :key="servico.ser_id">
                  <td>
                    <div>
                      <p class="mb-0 font-weight-medium">
                        {{ servico.ser_nome }}
                        <VChip
                          v-if="servico.isOld"
                          size="x-small"
                          color="warning"
                          class="ml-1"
                        >
                          Antigo
                        </VChip>
                      </p>
                      <p
                        v-if="servico.ser_descricao"
                        class="mb-0 text-sm text-disabled"
                      >
                        {{ servico.ser_descricao }}
                      </p>
                    </div>
                  </td>
                  <td>
                    <VChip color="primary" size="small">
                      {{ servico.quantidade }}
                    </VChip>
                  </td>
                  <td class="font-weight-bold">
                    {{ formatValor(servico.valorTotal) }}
                  </td>
                  <td class="font-weight-bold text-success">
                    {{ formatValor(servico.valorRecebido || 0) }}
                  </td>
                  <td>
                    <div class="d-flex flex-wrap gap-1">
                      <VChip
                        v-for="(count, status) in servico.statusCount"
                        :key="status"
                        v-show="count > 0"
                        size="x-small"
                        :color="
                          status === 'Atendido'
                            ? 'success'
                            : status === 'Cancelado'
                            ? 'error'
                            : 'default'
                        "
                      >
                        {{ status }}: {{ count }}
                      </VChip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-else class="text-center py-8">
              <VIcon
                icon="tabler-list-details"
                size="48"
                color="disabled"
                class="mb-2"
              />
              <p class="text-disabled mb-0">
                {{
                  servicosDetalhados.length === 0
                    ? "Nenhum serviço no período"
                    : "Nenhum serviço encontrado com os filtros aplicados"
                }}
              </p>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Tabela de Subserviços Detalhados -->
  <VRow class="mb-6" v-if="relatorios && subservicosDetalhados.length > 0">
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Subserviços Detalhados</h5>
              <p class="text-sm text-disabled mb-0">
                {{ subsFiltrados.length }} de
                {{ subservicosDetalhados.length }} subserviços
              </p>
            </div>
            <VAvatar color="info" variant="tonal" rounded size="42">
              <VIcon icon="tabler-sitemap" size="28" />
            </VAvatar>
          </div>

          <!-- Filtros -->
          <VRow class="mb-4">
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroSubs.nome"
                placeholder="Filtrar por nome"
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
                v-model="filtroSubs.valorMin"
                placeholder="Valor mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroSubs.valorMax"
                placeholder="Valor máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroSubs.quantidadeMin"
                placeholder="Qtd. mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroSubs.quantidadeMax"
                placeholder="Qtd. máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <VBtn
                color="secondary"
                variant="tonal"
                @click="limparFiltrosSubs"
                block
                density="compact"
              >
                <VIcon icon="tabler-x" size="18" />
                Limpar
              </VBtn>
            </VCol>
          </VRow>

          <!-- Tabela -->
          <div style="max-height: 500px; overflow-y: auto">
            <VTable v-if="subsFiltrados.length > 0">
              <thead
                style="
                  position: sticky;
                  top: 0;
                  background: inherit;
                  z-index: 1;
                "
              >
                <tr>
                  <th>Subserviço</th>
                  <th>Quantidade</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="sub in subsFiltrados" :key="sub.ser_sub_id">
                  <td>
                    <div>
                      <p class="mb-0 font-weight-medium">{{ sub.ser_nome }}</p>
                      <p
                        v-if="sub.ser_descricao"
                        class="mb-0 text-sm text-disabled"
                      >
                        {{ sub.ser_descricao }}
                      </p>
                    </div>
                  </td>
                  <td>
                    <VChip color="info" size="small">
                      {{ sub.quantidade }}
                    </VChip>
                  </td>
                  <td class="font-weight-bold text-info">
                    {{ formatValor(sub.valorTotal) }}
                  </td>
                  <td>
                    <div class="d-flex flex-wrap gap-1">
                      <VChip
                        v-for="(count, status) in sub.statusCount"
                        :key="status"
                        v-show="count > 0"
                        size="x-small"
                        :color="
                          status === 'Atendido'
                            ? 'success'
                            : status === 'Cancelado'
                            ? 'error'
                            : 'default'
                        "
                      >
                        {{ status }}: {{ count }}
                      </VChip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-else class="text-center py-8">
              <VIcon
                icon="tabler-sitemap"
                size="48"
                color="disabled"
                class="mb-2"
              />
              <p class="text-disabled mb-0">
                {{
                  subservicosDetalhados.length === 0
                    ? "Nenhum subserviço no período"
                    : "Nenhum subserviço encontrado com os filtros aplicados"
                }}
              </p>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Tabela de Serviços por Técnico -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Serviços por Técnico</h5>
              <p class="text-sm text-disabled mb-0">
                {{ tecnicosFiltrados.length }} de
                {{ servicosPorFuncionario.length }} técnicos
              </p>
            </div>
            <VAvatar color="warning" variant="tonal" rounded size="42">
              <VIcon icon="tabler-users" size="28" />
            </VAvatar>
          </div>

          <!-- Filtros -->
          <VRow class="mb-4">
            <VCol cols="12" sm="4">
              <AppTextField
                v-model="filtroTecnicos.nome"
                placeholder="Filtrar por técnico"
                density="compact"
                clearable
              >
                <template #prepend-inner>
                  <VIcon icon="tabler-user" size="20" />
                </template>
              </AppTextField>
            </VCol>
            <VCol cols="12" sm="3">
              <AppTextField
                v-model="filtroTecnicos.valorMin"
                placeholder="Valor mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroTecnicos.valorMax"
                placeholder="Valor máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroTecnicos.quantidadeMin"
                placeholder="Qtd. mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroTecnicos.quantidadeMax"
                placeholder="Qtd. máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="1">
              <VBtn
                color="secondary"
                variant="tonal"
                @click="limparFiltrosTecnicos"
                block
                density="compact"
              >
                <VIcon icon="tabler-x" size="18" />
              </VBtn>
            </VCol>
          </VRow>

          <!-- Tabela -->
          <div style="max-height: 500px; overflow-y: auto">
            <VTable v-if="tecnicosFiltrados.length > 0">
              <thead
                style="
                  position: sticky;
                  top: 0;
                  background: inherit;
                  z-index: 1;
                "
              >
                <tr>
                  <th>Técnico</th>
                  <th>Total Serviços</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="tecnico in tecnicosFiltrados" :key="tecnico.fun_id">
                  <td>
                    <div class="d-flex align-center">
                      <VAvatar color="primary" size="32" class="mr-2">
                        <span class="text-xs">{{
                          tecnico.fun_nome
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                        }}</span>
                      </VAvatar>
                      <p class="mb-0 font-weight-medium">
                        {{ tecnico.fun_nome }}
                      </p>
                    </div>
                  </td>
                  <td>
                    <VChip color="primary" size="small">
                      {{ tecnico.quantidadeTotal }}
                    </VChip>
                  </td>
                  <td class="font-weight-bold text-success">
                    {{ formatValor(tecnico.valorTotal) }}
                  </td>
                  <td>
                    <div class="d-flex flex-wrap gap-1">
                      <VChip
                        v-for="(count, status) in tecnico.statusCount"
                        :key="status"
                        v-show="count > 0"
                        size="x-small"
                        :color="
                          status === 'Atendido'
                            ? 'success'
                            : status === 'Cancelado'
                            ? 'error'
                            : 'default'
                        "
                      >
                        {{ status }}: {{ count }}
                      </VChip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-else class="text-center py-8">
              <VIcon
                icon="tabler-users"
                size="48"
                color="disabled"
                class="mb-2"
              />
              <p class="text-disabled mb-0">
                {{
                  servicosPorFuncionario.length === 0
                    ? "Nenhum técnico no período"
                    : "Nenhum técnico encontrado com os filtros aplicados"
                }}
              </p>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Origem dos Atendimentos - Resumo por Fonte -->
  <VRow class="mb-6" v-if="relatorios && relatorios.fontesGerais && relatorios.fontesGerais.length > 0">
    <VCol cols="12" md="5">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Origem dos Atendimentos</h5>
              <p class="text-sm text-disabled mb-0">
                Total por fonte
              </p>
            </div>
            <VAvatar color="success" variant="tonal" rounded size="42">
              <VIcon icon="tabler-arrow-down-right" size="28" />
            </VAvatar>
          </div>

          <VTable density="compact" hover>
            <thead>
              <tr>
                <th>Fonte</th>
                <th class="text-end">Atend.</th>
                <th class="text-end">Recebido</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in relatorios.fontesGerais" :key="f.fonte">
                <td>{{ f.fonte }}</td>
                <td class="text-end">
                  <VChip color="success" size="x-small">{{ f.quantidade }}</VChip>
                </td>
                <td class="text-end font-weight-bold text-success">
                  {{ formatValor(f.valorRecebido) }}
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Cruzamento Serviço × Fonte -->
    <VCol cols="12" md="7">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Serviço × Origem</h5>
              <p class="text-sm text-disabled mb-0">
                De onde vem cada categoria
              </p>
            </div>
            <VAvatar color="info" variant="tonal" rounded size="42">
              <VIcon icon="tabler-arrows-split" size="28" />
            </VAvatar>
          </div>

          <div style="max-height: 420px; overflow-y: auto;">
            <VTable density="compact" hover>
              <thead style="position: sticky; top: 0; background: rgb(var(--v-theme-surface)); z-index: 1;">
                <tr>
                  <th>Serviço</th>
                  <th>Origem</th>
                  <th class="text-end">Atend.</th>
                  <th class="text-end">Recebido</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="sf in relatorios.servicosPorFonte"
                  :key="`${sf.ser_id}_${sf.fonte}`"
                >
                  <td>{{ sf.ser_nome }}</td>
                  <td>
                    <VChip size="x-small" color="primary" variant="tonal">{{ sf.fonte }}</VChip>
                  </td>
                  <td class="text-end">{{ sf.quantidade }}</td>
                  <td class="text-end font-weight-bold text-success">
                    {{ formatValor(sf.valorRecebido) }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Estado vazio -->
  <VRow v-if="!relatorios && !loading">
    <VCol cols="12">
      <VCard>
        <VCardText class="text-center py-16">
          <VIcon icon="tabler-tools" size="64" color="disabled" class="mb-4" />
          <h4 class="text-h4 mb-2">Selecione um período</h4>
          <p class="text-disabled mb-0">
            Configure o período desejado e clique em Filtrar para visualizar os
            relatórios de serviços
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
