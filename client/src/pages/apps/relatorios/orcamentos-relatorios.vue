<script setup>
import GraficoOrcamentosEvolucao from "@/views/apps/relatorios/grafico-orcamentos-evolucao.vue";
import GraficoOrcamentosFunil from "@/views/apps/relatorios/grafico-orcamentos-funil.vue";

const { setAlert } = useAlert();
const loading = ref(false);
const relatorios = ref(null);

const hoje = new Date().toISOString().slice(0, 10);
const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const dataDe = ref(inicioMes);
const dataAte = ref(hoje);

const resumo = computed(() => relatorios.value?.resumo || {});
const evolucao = computed(() => relatorios.value?.evolucao || []);
const topClientes = computed(() => relatorios.value?.topClientes || []);
const funil = computed(() => relatorios.value?.funil || {});
const servicosMaisOrcados = computed(() => relatorios.value?.servicosMaisOrcados || []);

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const setPeriodo = (tipo) => {
  const h = new Date();
  if (tipo === "hoje") { dataDe.value = hoje; dataAte.value = hoje; }
  else if (tipo === "semana") { const s = new Date(h); s.setDate(h.getDate() - 7); dataDe.value = s.toISOString().slice(0, 10); dataAte.value = hoje; }
  else if (tipo === "mes") { dataDe.value = inicioMes; dataAte.value = hoje; }
  else if (tipo === "trimestre") { const t = new Date(h); t.setMonth(h.getMonth() - 3); dataDe.value = t.toISOString().slice(0, 10); dataAte.value = hoje; }
  else if (tipo === "ano") { dataDe.value = `${h.getFullYear()}-01-01`; dataAte.value = hoje; }
  getRelatorios();
};

const getRelatorios = async () => {
  loading.value = true;
  try {
    const res = await $api("/relatorios/get/orcamentos", {
      method: "GET",
      query: { dataDe: dataDe.value, dataAte: dataAte.value },
    });
    relatorios.value = res;
  } catch (error) {
    console.error("Erro ao buscar relatórios:", error);
    setAlert("Erro ao buscar relatórios", "error", "tabler-x", 3000);
  }
  loading.value = false;
};

onMounted(() => getRelatorios());
</script>

<template>
  <div>
    <!-- Filtros -->
    <VCard class="mb-6">
      <VCardText>
        <VRow class="align-center">
          <VCol cols="12" md="3">
            <h4>Filtros de Período</h4>
          </VCol>
          <VCol cols="12" md="9">
            <VRow class="align-end">
              <VCol cols="12" sm="4">
                <AppTextField v-model="dataDe" type="date" label="Data Inicial" />
              </VCol>
              <VCol cols="12" sm="4">
                <AppTextField v-model="dataAte" type="date" label="Data Final" />
              </VCol>
              <VCol cols="12" sm="4">
                <VBtn color="primary" @click="getRelatorios" :loading="loading" block>
                  <VIcon icon="tabler-search" class="mr-2" />Filtrar
                </VBtn>
              </VCol>
            </VRow>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <VBtn size="small" variant="tonal" @click="setPeriodo('hoje')">Hoje</VBtn>
              <VBtn size="small" variant="tonal" @click="setPeriodo('semana')">7 dias</VBtn>
              <VBtn size="small" variant="tonal" @click="setPeriodo('mes')">Mês atual</VBtn>
              <VBtn size="small" variant="tonal" @click="setPeriodo('trimestre')">3 meses</VBtn>
              <VBtn size="small" variant="tonal" @click="setPeriodo('ano')">Ano</VBtn>
            </div>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <VProgressCircular indeterminate color="primary" />
    </div>

    <!-- Cards de Resumo -->
    <VRow class="match-height mb-6 justify-space-around" v-if="relatorios" dense>
      <VCol cols="6" sm="4" md="2">
        <VCard>
          <VCardText>
            <VAvatar color="info" variant="tonal" rounded size="30" class="mb-2">
              <VIcon icon="tabler-file-invoice" size="20" />
            </VAvatar>
            <h3 class="text-h5 mt-2 mb-1">{{ resumo.total || 0 }}</h3>
            <p class="text-sm mb-0">Total</p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol cols="6" sm="4" md="2">
        <VCard>
          <VCardText>
            <VAvatar color="success" variant="tonal" rounded size="30" class="mb-2">
              <VIcon icon="tabler-check" size="20" />
            </VAvatar>
            <h3 class="text-h5 mt-2 mb-1">{{ resumo.aceitos || 0 }}</h3>
            <p class="text-sm mb-0">Aceitos</p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol cols="6" sm="4" md="2">
        <VCard>
          <VCardText>
            <VAvatar color="error" variant="tonal" rounded size="30" class="mb-2">
              <VIcon icon="tabler-x" size="20" />
            </VAvatar>
            <h3 class="text-h5 mt-2 mb-1">{{ resumo.negados || 0 }}</h3>
            <p class="text-sm mb-0">Negados</p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol cols="6" sm="4" md="2">
        <VCard>
          <VCardText>
            <VAvatar color="primary" variant="tonal" rounded size="30" class="mb-2">
              <VIcon icon="tabler-currency-real" size="20" />
            </VAvatar>
            <h3 class="text-h6 mt-2 mb-1">{{ fmt(resumo.valor_aceitos) }}</h3>
            <p class="text-sm mb-0">Valor Aceitos</p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol cols="6" sm="4" md="2">
        <VCard>
          <VCardText>
            <VAvatar color="warning" variant="tonal" rounded size="30" class="mb-2">
              <VIcon icon="tabler-percentage" size="20" />
            </VAvatar>
            <h3 class="text-h5 mt-2 mb-1">{{ resumo.taxa_aceitacao || 0 }}%</h3>
            <p class="text-sm mb-0">Taxa Aceitação</p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol cols="6" sm="4" md="2">
        <VCard>
          <VCardText>
            <VAvatar color="secondary" variant="tonal" rounded size="30" class="mb-2">
              <VIcon icon="tabler-receipt" size="20" />
            </VAvatar>
            <h3 class="text-h6 mt-2 mb-1">{{ fmt(resumo.valor_medio) }}</h3>
            <p class="text-sm mb-0">Valor Médio</p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- Gráficos -->
    <VRow class="mb-6" v-if="relatorios">
      <VCol cols="12" md="7">
        <GraficoOrcamentosEvolucao :evolucao="evolucao" />
      </VCol>
      <VCol cols="12" md="5">
        <GraficoOrcamentosFunil :funil="funil" />
      </VCol>
    </VRow>

    <!-- Tabelas -->
    <VRow class="mb-6" v-if="relatorios">
      <VCol cols="12" md="6">
        <VCard>
          <VCardText>
            <h3 class="text-h6 mb-3">
              <VIcon icon="tabler-users" class="mr-2" />
              Top Clientes
            </h3>
            <VTable v-if="topClientes.length > 0" density="compact">
              <thead>
                <tr><th>Cliente</th><th>Qtd</th><th>Valor</th><th>Aceitos</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in topClientes" :key="c.cliente_nome">
                  <td>{{ c.cliente_nome }}</td>
                  <td>{{ c.quantidade }}</td>
                  <td>{{ fmt(c.valor_total) }}</td>
                  <td>
                    <VChip size="x-small" :color="c.taxa_aceitacao >= 50 ? 'success' : 'warning'" variant="tonal">
                      {{ c.taxa_aceitacao }}%
                    </VChip>
                  </td>
                </tr>
              </tbody>
            </VTable>
            <p v-else class="text-center text-disabled py-4">Sem dados</p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol cols="12" md="6">
        <VCard>
          <VCardText>
            <h3 class="text-h6 mb-3">
              <VIcon icon="tabler-star" class="mr-2" />
              Serviços Mais Orçados
            </h3>
            <VTable v-if="servicosMaisOrcados.length > 0" density="compact">
              <thead>
                <tr><th>Serviço</th><th>Qtd</th><th>Valor Total</th></tr>
              </thead>
              <tbody>
                <tr v-for="s in servicosMaisOrcados" :key="s.servico">
                  <td>{{ s.servico }}</td>
                  <td>{{ s.quantidade }}</td>
                  <td>{{ fmt(s.valor_total) }}</td>
                </tr>
              </tbody>
            </VTable>
            <p v-else class="text-center text-disabled py-4">Sem dados</p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>
