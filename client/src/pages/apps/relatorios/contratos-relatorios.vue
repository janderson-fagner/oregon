<script setup>
import GraficoContratosStatus from "@/views/apps/relatorios/grafico-contratos-status.vue";
import GraficoContratosEvolucao from "@/views/apps/relatorios/grafico-contratos-evolucao.vue";
import GraficoPizzaFormas from "@/views/apps/relatorios/grafico-pizza-formas.vue";
import moment from "moment";

const { setAlert } = useAlert();
const loading = ref(false);

const formatValor = (v) => {
  if (!v && v !== 0) return "R$ 0,00";
  return parseFloat(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const mesAtual = new Date().getMonth() + 1;
const anoAtual = new Date().getFullYear();
const dataDe = ref(formatDate(`${anoAtual}-${mesAtual}-01`));
const dataAte = ref(formatDate(`${anoAtual}-${mesAtual}-${new Date(anoAtual, mesAtual, 0).getDate()}`));

const relatorios = ref(null);

const getRelatorios = async () => {
  if (dataAte.value < dataDe.value) {
    return setAlert("A data de inicio nao pode ser maior que a data final.", "error", "tabler-alert-triangle", 5000);
  }
  loading.value = true;
  try {
    const res = await $api("/relatorios/get/contratos", { query: { dataDe: dataDe.value, dataAte: dataAte.value } });
    relatorios.value = res;
  } catch (error) {
    console.error("Erro:", error);
    setAlert("Erro ao buscar relatorios", "error", "tabler-alert-triangle", 5000);
    relatorios.value = null;
  }
  loading.value = false;
};

const resumo = computed(() => relatorios.value?.resumo || {});
const pagamentos = computed(() => relatorios.value?.pagamentos || {});
const evolucao = computed(() => relatorios.value?.evolucao || []);
const formasPagamento = computed(() => relatorios.value?.formasPagamento || []);
const statusContratos = computed(() => relatorios.value?.statusContratos || []);
const contratos = computed(() => relatorios.value?.contratos || []);

const getStatusColor = (s) => {
  const m = { rascunho: "default", assinado_empresa: "info", assinado_cliente: "info", ativo: "success", cancelado: "error" };
  return m[s] || "default";
};

const setPeriodo = (tipo) => {
  const hoje = new Date();
  switch (tipo) {
    case "hoje": dataDe.value = formatDate(hoje); dataAte.value = formatDate(hoje); break;
    case "semana": const ini = new Date(hoje); ini.setDate(hoje.getDate() - hoje.getDay()); dataDe.value = formatDate(ini); dataAte.value = formatDate(hoje); break;
    case "mes": dataDe.value = formatDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); dataAte.value = formatDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)); break;
    case "trimestre": const it = Math.floor(hoje.getMonth() / 3) * 3; dataDe.value = formatDate(new Date(hoje.getFullYear(), it, 1)); dataAte.value = formatDate(hoje); break;
    case "ano": dataDe.value = formatDate(new Date(hoje.getFullYear(), 0, 1)); dataAte.value = formatDate(new Date(hoje.getFullYear(), 11, 31)); break;
  }
  getRelatorios();
};

onMounted(getRelatorios);
</script>

<template>
  <VDialog v-model="loading" persistent max-width="500">
    <VCard><VCardText class="text-center pa-8"><VProgressCircular indeterminate color="primary" size="64" /><p class="mt-4 mb-0">Carregando relatorios...</p></VCardText></VCard>
  </VDialog>

  <VCard class="mb-6">
    <VCardText>
      <VRow class="align-center">
        <VCol cols="12" md="3"><h4 class="mb-0">Filtros de Periodo</h4><p class="text-sm text-disabled mb-0">Selecione o periodo</p></VCol>
        <VCol cols="12" md="9">
          <VRow class="align-end">
            <VCol cols="12" sm="4"><AppTextField v-model="dataDe" type="date" label="Data Inicial" /></VCol>
            <VCol cols="12" sm="4"><AppTextField v-model="dataAte" type="date" label="Data Final" /></VCol>
            <VCol cols="12" sm="4"><VBtn color="primary" @click="getRelatorios" :loading="loading" block><VIcon icon="tabler-search" class="mr-2" />Filtrar</VBtn></VCol>
            <VCol cols="12" class="py-0">
              <div class="d-flex flex-wrap gap-2 mb-3">
                <VBtn size="small" variant="tonal" @click="setPeriodo('hoje')" style="height:30px">Hoje</VBtn>
                <VBtn size="small" variant="tonal" @click="setPeriodo('semana')" style="height:30px">Esta Semana</VBtn>
                <VBtn size="small" variant="tonal" @click="setPeriodo('mes')" style="height:30px">Este Mes</VBtn>
                <VBtn size="small" variant="tonal" @click="setPeriodo('trimestre')" style="height:30px">Este Trimestre</VBtn>
                <VBtn size="small" variant="tonal" @click="setPeriodo('ano')" style="height:30px">Este Ano</VBtn>
              </div>
            </VCol>
          </VRow>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <VRow class="match-height mb-6 justify-space-around" v-if="relatorios" dense>
    <VCol cols="12" sm="6" md="2">
      <VCard><VCardText>
        <VAvatar color="primary" variant="tonal" rounded size="30" class="mb-2"><VIcon icon="tabler-file-text" size="20" /></VAvatar>
        <h3 class="text-h5 mt-2 mb-1">{{ resumo.total || 0 }}</h3>
        <p class="text-sm mb-0">Total Contratos</p>
      </VCardText></VCard>
    </VCol>
    <VCol cols="12" sm="6" md="2">
      <VCard><VCardText>
        <VAvatar color="success" variant="tonal" rounded size="30" class="mb-2"><VIcon icon="tabler-check" size="20" /></VAvatar>
        <h3 class="text-h5 mt-2 mb-1">{{ resumo.ativos || 0 }}</h3>
        <p class="text-sm mb-0">Ativos</p>
      </VCardText></VCard>
    </VCol>
    <VCol cols="12" sm="6" md="2">
      <VCard><VCardText>
        <VAvatar color="info" variant="tonal" rounded size="30" class="mb-2"><VIcon icon="tabler-coin" size="20" /></VAvatar>
        <h3 class="text-h5 mt-2 mb-1">{{ formatValor(pagamentos.total_cobrado) }}</h3>
        <p class="text-sm mb-0">Total Cobrado</p>
      </VCardText></VCard>
    </VCol>
    <VCol cols="12" sm="6" md="2">
      <VCard><VCardText>
        <VAvatar color="success" variant="tonal" rounded size="30" class="mb-2"><VIcon icon="tabler-cash" size="20" /></VAvatar>
        <h3 class="text-h5 mt-2 mb-1">{{ formatValor(pagamentos.total_recebido) }}</h3>
        <p class="text-sm mb-0">Total Recebido</p>
      </VCardText></VCard>
    </VCol>
    <VCol cols="12" sm="6" md="2">
      <VCard><VCardText>
        <VAvatar color="error" variant="tonal" rounded size="30" class="mb-2"><VIcon icon="tabler-alert-circle" size="20" /></VAvatar>
        <h3 class="text-h5 mt-2 mb-1">{{ formatValor(pagamentos.total_vencido) }}</h3>
        <p class="text-sm mb-0">Total Vencido</p>
      </VCardText></VCard>
    </VCol>
  </VRow>

  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12"><GraficoContratosEvolucao :evolucao="evolucao" /></VCol>
  </VRow>

  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12" md="6"><GraficoContratosStatus :statusContratos="statusContratos" /></VCol>
    <VCol cols="12" md="6"><GraficoPizzaFormas :formasPagamento="formasPagamento" /></VCol>
  </VRow>

  <VRow class="mb-6" v-if="relatorios">
    <VCol cols="12">
      <VCard>
        <VCardText>
          <h5 class="text-h5 mb-4">Contratos Detalhados</h5>
          <div style="max-height: 400px; overflow-y: auto">
            <VTable v-if="contratos.length > 0">
              <thead style="position:sticky;top:0;background:inherit;z-index:1">
                <tr><th>Numero</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Recebido</th><th>Pendente</th><th>Criado em</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in contratos" :key="c.id">
                  <td class="font-weight-medium">{{ c.numero || c.id }}</td>
                  <td>{{ c.cli_nome || '-' }}</td>
                  <td>{{ formatValor(c.valor) }}</td>
                  <td><VChip :color="getStatusColor(c.status)" size="small" label>{{ c.status }}</VChip></td>
                  <td class="text-success">{{ formatValor(c.total_recebido) }}</td>
                  <td class="text-warning">{{ formatValor(c.total_pendente) }}</td>
                  <td>{{ c.created_at ? moment(c.created_at).format('DD/MM/YYYY') : '-' }}</td>
                </tr>
              </tbody>
            </VTable>
            <div v-else class="text-center py-8"><VIcon icon="tabler-file-off" size="48" color="disabled" class="mb-2" /><p class="text-disabled mb-0">Nenhum contrato no periodo</p></div>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <VRow v-if="!relatorios && !loading">
    <VCol cols="12">
      <VCard><VCardText class="text-center py-16"><VIcon icon="tabler-chart-line" size="64" color="disabled" class="mb-4" /><h4 class="text-h4 mb-2">Selecione um periodo</h4><p class="text-disabled mb-0">Configure o periodo e clique em Filtrar</p></VCardText></VCard>
    </VCol>
  </VRow>
</template>
