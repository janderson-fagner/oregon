<script setup>
import { ref, computed, onMounted, watch } from "vue";
import GraficoEvolucao from "@/views/apps/relatorios/grafico-evolucao.vue";
import GraficoPizzaFormas from "@/views/apps/relatorios/grafico-pizza-formas.vue";
import GraficoPizzaFormasDespesas from "@/views/apps/relatorios/grafico-pizza-formas-despesas.vue";
import GraficoDespesasTipo from "@/views/apps/relatorios/grafico-despesas-tipo.vue";
import GraficoTopClientes from "@/views/apps/relatorios/grafico-top-clientes.vue";
import moment from "moment";

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
    const res = await $api("/relatorios/get/financeiro", {
      query: {
        dataDe: dataDe.value,
        dataAte: dataAte.value,
      },
    });

    if (!res) return;

    console.log("Relatórios financeiros:", res);
    relatorios.value = res;
  } catch (error) {
    console.error("Erro ao buscar relatórios:", error);
    setAlert(
      "Erro ao buscar relatórios financeiros",
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
const evolucao = computed(() => relatorios.value?.evolucao || {});
const topClientes = computed(() => relatorios.value?.topClientes || []);
const formasPagamento = computed(() => relatorios.value?.formasPagamento || []);
const formasPagamentoDespesas = computed(
  () => relatorios.value?.formasPagamentoDespesas || []
);
const tiposDespesas = computed(() => relatorios.value?.tiposDespesas || []);
const ultimosRecebimentos = computed(
  () => relatorios.value?.ultimosRecebimentos || []
);
const ultimasDespesas = computed(() => relatorios.value?.ultimasDespesas || []);
const contadores = computed(() => relatorios.value?.contadores || {});

// Filtros para tabelas
const filtroRecebimentos = ref({
  forma: "",
  cliente: "",
  valorMin: "",
  valorMax: "",
});

const filtroDespesas = ref({
  descricao: "",
  tipo: "",
  valorMin: "",
  valorMax: "",
});

// Tabelas filtradas
const recebimentosFiltrados = computed(() => {
  let result = [...ultimosRecebimentos.value];

  if (filtroRecebimentos.value.forma) {
    result = result.filter((r) =>
      r.fpg_name
        ?.toLowerCase()
        .includes(filtroRecebimentos.value.forma.toLowerCase())
    );
  }

  if (filtroRecebimentos.value.cliente) {
    result = result.filter((r) =>
      r.cli_nome
        ?.toLowerCase()
        .includes(filtroRecebimentos.value.cliente.toLowerCase())
    );
  }

  if (filtroRecebimentos.value.valorMin) {
    const min = parseFloat(filtroRecebimentos.value.valorMin);
    result = result.filter((r) => r.pgt_valor >= min);
  }

  if (filtroRecebimentos.value.valorMax) {
    const max = parseFloat(filtroRecebimentos.value.valorMax);
    result = result.filter((r) => r.pgt_valor <= max);
  }

  return result;
});

const despesasFiltradas = computed(() => {
  let result = [...ultimasDespesas.value];

  if (filtroDespesas.value.descricao) {
    result = result.filter((d) =>
      d.des_descricao
        ?.toLowerCase()
        .includes(filtroDespesas.value.descricao.toLowerCase())
    );
  }

  if (filtroDespesas.value.tipo) {
    result = result.filter((d) =>
      d.des_tipo
        ?.toLowerCase()
        .includes(filtroDespesas.value.tipo.toLowerCase())
    );
  }

  if (filtroDespesas.value.valorMin) {
    const min = parseFloat(filtroDespesas.value.valorMin);
    result = result.filter((d) => d.des_valor >= min);
  }

  if (filtroDespesas.value.valorMax) {
    const max = parseFloat(filtroDespesas.value.valorMax);
    result = result.filter((d) => d.des_valor <= max);
  }

  return result;
});

// Limpar filtros
const limparFiltrosRecebimentos = () => {
  filtroRecebimentos.value = {
    forma: "",
    cliente: "",
    valorMin: "",
    valorMax: "",
  };
};

const limparFiltrosDespesas = () => {
  filtroDespesas.value = {
    descricao: "",
    tipo: "",
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
</script>

<template>
  <!-- Dialog de Loading -->
  <VDialog v-model="loading" persistent max-width="500">
    <VCard>
      <VCardText class="text-center pa-8">
        <VProgressCircular indeterminate color="primary" size="64" />
        <p class="mt-4 mb-0">Carregando relatórios financeiros...</p>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- Filtros -->
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
                <VIcon icon="tabler-search" class="mr-2" />
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
  <VRow class="match-height mb-6 justify-space-around" v-if="relatorios" dense>
    <!-- Receitas -->
    <VCol cols="12" sm="6" md="2">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="success" variant="tonal" rounded size="30">
              <VIcon icon="tabler-trending-up" size="20" />
            </VAvatar>
            <VChip color="success" size="small">
              {{ contadores.pagamentosRecebidos }} pagos
            </VChip>
          </div>

          <h3 class="text-h5 mt-4 mb-1">
            {{ formatValor(resumo.totalReceitaRecebida) }}
          </h3>
          <p class="text-sm mb-0">Receitas Recebidas</p>

          <div class="d-flex flex-column mt-3 text-sm">
            <span class="text-disabled">Pendente:</span>
            <span class="font-weight-medium">{{
              formatValor(resumo.totalReceitaPendente)
            }}</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Receita Futura -->
    <VCol cols="12" sm="6" md="2">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="info" variant="tonal" rounded size="30">
              <VIcon icon="tabler-calendar-dollar" size="20" />
            </VAvatar>
            <VChip color="info" size="small">
              {{ contadores.agendamentosFuturos }} futuros
            </VChip>
          </div>

          <h3 class="text-h5 mt-4 mb-1">
            {{ formatValor(resumo.totalReceitaFutura) }}
          </h3>
          <p class="text-sm mb-0">Receita Futura</p>
          <p
            v-if="resumo.totalReceitaFuturaRealista !== undefined"
            class="text-xs text-disabled mt-1 mb-0"
            :title="`Estimativa descontando ${resumo.taxaCancelamentoHistorica}% de cancelamento histórico (últimos 90 dias)`"
          >
            Realista: {{ formatValor(resumo.totalReceitaFuturaRealista) }}
            <span class="text-warning">(−{{ resumo.taxaCancelamentoHistorica }}%)</span>
          </p>

          <div class="d-flex flex-column mt-3 text-sm">
            <p class="mb-0">
              <span class="text-disabled">Agendados:</span>
              <span class="font-weight-medium">{{
                contadores.agendamentosAgendados
              }}</span>
            </p>
            <p class="mb-0">
              <span class="text-disabled">Confirmados:</span>
              <span class="font-weight-medium">{{
                contadores.agendamentosConfirmados
              }}</span>
            </p>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Despesas -->
    <VCol cols="12" sm="6" md="2">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="error" variant="tonal" rounded size="30">
              <VIcon icon="tabler-receipt" size="20" />
            </VAvatar>
            <VChip color="error" size="small">
              {{ contadores.despesasPagas }} pagas
            </VChip>
          </div>

          <h3 class="text-h5 mt-4 mb-1">
            {{ formatValor(resumo.totalDespesasPagas) }}
          </h3>
          <p class="text-sm mb-0">Despesas Pagas</p>

          <div class="d-flex flex-column mt-3 text-sm">
            <span class="text-disabled">Pendente:</span>
            <span class="font-weight-medium">{{
              formatValor(resumo.totalDespesasPendentes)
            }}</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Comissões -->
    <VCol cols="12" sm="6" md="2">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar color="warning" variant="tonal" rounded size="30">
              <VIcon icon="tabler-coins" size="20" />
            </VAvatar>
            <VChip color="warning" size="small">
              {{ contadores.comissoesPagas }} pagas
            </VChip>
          </div>

          <h3 class="text-h5 mt-4 mb-1">
            {{ formatValor(resumo.totalComissoesPagas) }}
          </h3>
          <p class="text-sm mb-0">Comissões Pagas</p>

          <div class="d-flex flex-column mt-3 text-sm">
            <span class="text-disabled">Pendente:</span>
            <span class="font-weight-medium">{{
              formatValor(resumo.totalComissoesPendentes)
            }}</span>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Lucro Líquido -->
    <VCol cols="12" sm="6" md="2">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-2">
            <VAvatar
              :color="
                resumo.resultado === 'Positivo'
                  ? 'info'
                  : resumo.resultado === 'Negativo'
                  ? 'error'
                  : 'warning'
              "
              variant="tonal"
              rounded
              size="30"
            >
              <VIcon
                :icon="
                  resumo.resultado === 'Positivo'
                    ? 'tabler-chart-arrows'
                    : resumo.resultado === 'Negativo'
                    ? 'tabler-chart-arrows-vertical'
                    : 'tabler-minus'
                "
                size="20"
              />
            </VAvatar>
            <VChip
              :color="
                resumo.resultado === 'Positivo'
                  ? 'success'
                  : resumo.resultado === 'Negativo'
                  ? 'error'
                  : 'warning'
              "
              size="small"
            >
              {{ resumo.margemLucro }}%
            </VChip>
          </div>

          <h3 class="text-h5 mt-4 mb-1">
            {{ formatValor(resumo.lucroLiquido) }}
          </h3>
          <p class="text-sm mb-0">Lucro Líquido</p>

          <div class="d-flex align-center mt-3 text-sm">
            <span class="text-disabled">Saldo:</span>
            <VChip
              :color="
                resumo.resultado === 'Positivo'
                  ? 'success'
                  : resumo.resultado === 'Negativo'
                  ? 'error'
                  : 'warning'
              "
              size="x-small"
              class="ml-2"
            >
              {{ resumo.resultado }}
            </VChip>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Gráfico de Evolução -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <GraficoEvolucao :dados="evolucao" />
    </VCol>
  </VRow>

  <!-- Formas de Pagamento -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12" md="6">
      <GraficoPizzaFormas :formasPagamento="formasPagamento" />
    </VCol>
    <VCol cols="12" md="6">
      <GraficoPizzaFormasDespesas
        :formasPagamentoDespesas="formasPagamentoDespesas"
      />
    </VCol>
  </VRow>

  <!-- Despesas por Tipo - Largura Total -->
  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <GraficoDespesasTipo :tiposDespesas="tiposDespesas" />
    </VCol>
  </VRow>

  <!-- Top Clientes -->
  <VRow class="mb-6" v-if="relatorios && topClientes.length > 0">
    <VCol cols="12">
      <GraficoTopClientes :topClientes="topClientes" />
    </VCol>
  </VRow>

  <!-- Pagamentos em Aberto -->
  <VRow
    class="mb-6"
    v-if="relatorios && relatorios.pagamentosEmAberto && relatorios.pagamentosEmAberto.length > 0"
  >
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Pagamentos em Aberto</h5>
              <p class="text-sm text-disabled mb-0">
                Atendimentos realizados no período sem o valor totalmente pago
              </p>
            </div>
            <VAvatar color="warning" variant="tonal" rounded size="42">
              <VIcon icon="tabler-cash-off" size="28" />
            </VAvatar>
          </div>

          <div style="max-height: 420px; overflow-y: auto;">
            <VTable density="compact" hover>
              <thead style="position: sticky; top: 0; background: rgb(var(--v-theme-surface)); z-index: 1;">
                <tr>
                  <th>Agendamento</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th class="text-end">Cobrado</th>
                  <th class="text-end">Recebido</th>
                  <th class="text-end">Em Aberto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in relatorios.pagamentosEmAberto" :key="p.age_id">
                  <td>#{{ p.age_id }}</td>
                  <td>{{ p.cli_nome }}</td>
                  <td>{{ new Date(p.age_data).toLocaleDateString('pt-BR') }}</td>
                  <td class="text-end">{{ formatValor(p.valorCobrado) }}</td>
                  <td class="text-end text-success">{{ formatValor(p.valorRecebido) }}</td>
                  <td class="text-end font-weight-bold text-warning">
                    {{ formatValor(p.valorEmAberto) }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- Tabelas Completas com Filtros -->
  <VRow class="mb-6" v-if="relatorios">
    <!-- Tabela de Recebimentos -->
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Recebimentos</h5>
              <p class="text-sm text-disabled mb-0">
                {{ recebimentosFiltrados.length }} de
                {{ ultimosRecebimentos.length }} recebimentos
              </p>
            </div>
            <VAvatar color="success" variant="tonal" rounded size="42">
              <VIcon icon="tabler-cash" size="28" />
            </VAvatar>
          </div>

          <!-- Filtros Recebimentos -->
          <VRow class="mb-4">
            <VCol cols="12" sm="3">
              <AppTextField
                v-model="filtroRecebimentos.cliente"
                placeholder="Filtrar por cliente"
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
                v-model="filtroRecebimentos.forma"
                placeholder="Filtrar por forma"
                density="compact"
                clearable
              >
                <template #prepend-inner>
                  <VIcon icon="tabler-credit-card" size="20" />
                </template>
              </AppTextField>
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroRecebimentos.valorMin"
                placeholder="Valor mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroRecebimentos.valorMax"
                placeholder="Valor máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <VBtn
                color="secondary"
                variant="tonal"
                @click="limparFiltrosRecebimentos"
                block
                density="compact"
              >
                <VIcon icon="tabler-x" size="18" />
                Limpar
              </VBtn>
            </VCol>
          </VRow>

          <!-- Tabela -->
          <div style="max-height: 400px; overflow-y: auto">
            <VTable v-if="recebimentosFiltrados.length > 0">
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
                  <th>Valor</th>
                  <th>Forma</th>
                  <th>Data Recebimento</th>
                  <th>Data Agendamento</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="recebimento in recebimentosFiltrados"
                  :key="recebimento.pgt_id"
                >
                  <td>
                    <p class="mb-0 font-weight-medium">
                      {{ recebimento.cli_nome }}
                    </p>
                  </td>
                  <td class="font-weight-medium">
                    {{ formatValor(recebimento.pgt_valor) }}
                  </td>
                  <td>
                    <VChip size="small" variant="tonal" color="success">
                      {{ recebimento.fpg_name }}
                    </VChip>
                  </td>
                  <td>
                    {{ moment(recebimento.pgt_data).format("DD/MM/YYYY") }}
                  </td>
                  <td class="text-disabled">
                    {{ moment(recebimento.age_data).format("DD/MM/YYYY") }}
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-else class="text-center py-8">
              <VIcon
                icon="tabler-cash"
                size="48"
                color="disabled"
                class="mb-2"
              />
              <p class="text-disabled mb-0">
                {{
                  ultimosRecebimentos.length === 0
                    ? "Nenhum recebimento no período"
                    : "Nenhum recebimento encontrado com os filtros aplicados"
                }}
              </p>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Tabela de Despesas -->
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="d-flex justify-space-between align-center mb-4">
            <div>
              <h5 class="text-h5 mb-1">Despesas</h5>
              <p class="text-sm text-disabled mb-0">
                {{ despesasFiltradas.length }} de
                {{ ultimasDespesas.length }} despesas
              </p>
            </div>
            <VAvatar color="error" variant="tonal" rounded size="42">
              <VIcon icon="tabler-receipt" size="28" />
            </VAvatar>
          </div>

          <!-- Filtros Despesas -->
          <VRow class="mb-4">
            <VCol cols="12" sm="3">
              <AppTextField
                v-model="filtroDespesas.descricao"
                placeholder="Filtrar por descrição"
                density="compact"
                clearable
              >
                <template #prepend-inner>
                  <VIcon icon="tabler-file-text" size="20" />
                </template>
              </AppTextField>
            </VCol>
            <VCol cols="12" sm="3">
              <AppTextField
                v-model="filtroDespesas.tipo"
                placeholder="Filtrar por tipo"
                density="compact"
                clearable
              >
                <template #prepend-inner>
                  <VIcon icon="tabler-category" size="20" />
                </template>
              </AppTextField>
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroDespesas.valorMin"
                placeholder="Valor mín."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <AppTextField
                v-model="filtroDespesas.valorMax"
                placeholder="Valor máx."
                type="number"
                density="compact"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="2">
              <VBtn
                color="secondary"
                variant="tonal"
                @click="limparFiltrosDespesas"
                block
                density="compact"
              >
                <VIcon icon="tabler-x" size="18" />
                Limpar
              </VBtn>
            </VCol>
          </VRow>

          <!-- Tabela -->
          <div style="max-height: 400px; overflow-y: auto">
            <VTable v-if="despesasFiltradas.length > 0">
              <thead
                style="
                  position: sticky;
                  top: 0;
                  background: inherit;
                  z-index: 1;
                "
              >
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Data Pagamento</th>
                  <th>Data Vencimento</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="despesa in despesasFiltradas" :key="despesa.des_id">
                  <td>
                    <p class="mb-0 font-weight-medium">
                      {{ despesa.des_descricao || "-" }}
                    </p>
                  </td>
                  <td>
                    <VChip
                      size="small"
                      variant="tonal"
                      color="error"
                      v-if="despesa.des_tipo"
                    >
                      {{ despesa.des_tipo }}
                    </VChip>
                    <span v-else class="text-disabled">-</span>
                  </td>
                  <td class="font-weight-medium">
                    {{ formatValor(despesa.des_valor) }}
                  </td>
                  <td>
                    {{ moment(despesa.des_paga_data).format("DD/MM/YYYY") }}
                  </td>
                  <td class="text-disabled">
                    {{ moment(despesa.des_data).format("DD/MM/YYYY") }}
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-else class="text-center py-8">
              <VIcon
                icon="tabler-receipt"
                size="48"
                color="disabled"
                class="mb-2"
              />
              <p class="text-disabled mb-0">
                {{
                  ultimasDespesas.length === 0
                    ? "Nenhuma despesa no período"
                    : "Nenhuma despesa encontrada com os filtros aplicados"
                }}
              </p>
            </div>
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
          <VIcon
            icon="tabler-chart-line"
            size="64"
            color="disabled"
            class="mb-4"
          />
          <h4 class="text-h4 mb-2">Selecione um período</h4>
          <p class="text-disabled mb-0">
            Configure o período desejado e clique em Filtrar para visualizar os
            relatórios financeiros
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
