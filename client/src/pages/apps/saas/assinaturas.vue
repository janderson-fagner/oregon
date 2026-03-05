<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import moment from "moment";

const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(false);

// Verificar permissão de admin
const userData = useCookie("userData").value;
if (userData?.role !== 'admin') {
  setAlert("Você não tem permissão para acessar esta página.", "error", "tabler-alert-triangle", 3000);
  router.push("/");
}

// Dados
const assinaturas = ref([]);
const totalAssinaturas = ref(0);
const selectedAssinatura = ref(null);
const dialogDetalhes = ref(false);

// Filtros e paginação
const searchQuery = ref("");
const statusFilter = ref(null);
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref('a.id');
const orderBy = ref('desc');

const statusOptions = [
  { title: 'Todas', value: null },
  { title: 'Ativa', value: 'ativa' },
  { title: 'Trial', value: 'trial' },
  { title: 'Pendente', value: 'pendente' },
  { title: 'Vencida', value: 'vencida' },
  { title: 'Suspensa', value: 'suspensa' },
  { title: 'Cancelada', value: 'cancelada' }
];

// Headers da tabela
const headers = [
  { title: 'ID', key: 'id', sortable: true },
  { title: 'Empresa', key: 'empresa_nome', sortable: true },
  { title: 'Plano', key: 'plano_nome', sortable: true },
  { title: 'Valor', key: 'valor', sortable: true },
  { title: 'Ciclo', key: 'ciclo', sortable: false },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Próx. Vencimento', key: 'data_proximo_vencimento', sortable: true },
  { title: 'Ações', key: 'actions', sortable: false }
];

// Buscar assinaturas
const getAssinaturas = async () => {
  loading.value = true;

  try {
    const res = await $api('/saas/assinaturas', {
      method: 'GET',
      query: {
        q: searchQuery.value,
        status: statusFilter.value,
        itemsPerPage: itemsPerPage.value,
        page: page.value,
        sortBy: sortBy.value,
        orderBy: orderBy.value
      }
    });

    assinaturas.value = res.assinaturas || [];
    totalAssinaturas.value = res.total || 0;
  } catch (error) {
    console.error('Erro ao buscar assinaturas:', error);
    setAlert('Erro ao buscar assinaturas', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Atualizar opções da tabela
const updateOptions = (options) => {
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key || 'a.id';
  orderBy.value = options.sortBy[0]?.order || 'desc';
  getAssinaturas();
};

// Ver detalhes da assinatura
const viewDetalhes = async (assinatura) => {
  loading.value = true;

  try {
    const res = await $api(`/saas/assinaturas/${assinatura.id}`);
    selectedAssinatura.value = res;
    dialogDetalhes.value = true;
  } catch (error) {
    console.error('Erro ao buscar detalhes:', error);
    setAlert('Erro ao buscar detalhes', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Cancelar assinatura
const cancelarAssinatura = async (assinatura) => {
  const motivo = prompt('Informe o motivo do cancelamento:');
  if (!motivo) return;

  loading.value = true;

  try {
    await $api(`/saas/assinaturas/${assinatura.id}/cancelar`, {
      method: 'POST',
      body: { motivo }
    });
    setAlert('Assinatura cancelada com sucesso!', 'success', 'tabler-check', 3000);
    getAssinaturas();
    dialogDetalhes.value = false;
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    setAlert('Erro ao cancelar assinatura', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Formatar valor
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

// Formatar data
const formatDate = (date) => {
  if (!date) return '-';
  return moment(date).format('DD/MM/YYYY');
};

// Cor do status
const getStatusColor = (status) => {
  const colors = {
    ativa: 'success',
    trial: 'info',
    pendente: 'warning',
    vencida: 'error',
    suspensa: 'error',
    cancelada: 'secondary'
  };
  return colors[status] || 'default';
};

// Label do ciclo
const getCicloLabel = (ciclo) => {
  return ciclo === 'YEARLY' ? 'Anual' : 'Mensal';
};

onMounted(() => {
  getAssinaturas();
});
</script>

<template>
  <h2 class="text-h5 mb-0">Assinaturas ({{ totalAssinaturas }})</h2>
  <p class="text-sm">Gerencie as assinaturas das empresas</p>

  <VCard>
    <VCardText class="d-flex flex-row gap-3 align-end">
      <VRow>
        <VCol cols="12" md="6">
          <AppTextField
            v-model="searchQuery"
            label="Pesquisar"
            placeholder="Nome da empresa ou plano"
            @keyup.enter="getAssinaturas()"
            clearable
          />
        </VCol>

        <VCol cols="12" md="3">
          <AppSelect
            v-model="statusFilter"
            label="Status"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            clearable
          />
        </VCol>

        <VCol cols="12" md="3" class="d-flex align-end">
          <VBtn color="primary" @click="getAssinaturas()">
            <VIcon icon="tabler-search" class="mr-2" />
            Buscar
          </VBtn>
        </VCol>
      </VRow>
    </VCardText>

    <VDivider />

    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :headers="headers"
      :items="assinaturas"
      :items-length="totalAssinaturas"
      :loading="loading"
      @update:options="updateOptions"
    >
      <!-- Empresa -->
      <template #item.empresa_nome="{ item }">
        <div class="d-flex flex-column">
          <span class="font-weight-medium">{{ item.empresa_nome }}</span>
          <span class="text-xs text-medium-emphasis">{{ item.empresa_email }}</span>
        </div>
      </template>

      <!-- Valor -->
      <template #item.valor="{ item }">
        {{ formatCurrency(item.valor) }}
      </template>

      <!-- Ciclo -->
      <template #item.ciclo="{ item }">
        <VChip size="small" variant="tonal">
          {{ getCicloLabel(item.ciclo) }}
        </VChip>
      </template>

      <!-- Status -->
      <template #item.status="{ item }">
        <VChip :color="getStatusColor(item.status)" size="small">
          {{ item.status }}
        </VChip>
      </template>

      <!-- Data -->
      <template #item.data_proximo_vencimento="{ item }">
        {{ formatDate(item.data_proximo_vencimento) }}
      </template>

      <!-- Ações -->
      <template #item.actions="{ item }">
        <div class="d-flex gap-1">
          <IconBtn size="small" @click="viewDetalhes(item)">
            <VIcon icon="tabler-eye" size="18" />
          </IconBtn>
          <IconBtn
            v-if="!['cancelada'].includes(item.status)"
            size="small"
            color="error"
            @click="cancelarAssinatura(item)"
          >
            <VIcon icon="tabler-x" size="18" />
          </IconBtn>
        </div>
      </template>

      <!-- Paginação -->
      <template #bottom>
        <VDivider />
        <div class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3">
          <p class="text-sm text-disabled mb-0">
            {{ paginationMeta({ page, itemsPerPage }, totalAssinaturas) }}
          </p>
          <VPagination
            v-model="page"
            :length="Math.ceil(totalAssinaturas / itemsPerPage)"
            :total-visible="$vuetify.display.xs ? 1 : totalAssinaturas > 100 ? 4 : Math.ceil(totalAssinaturas / itemsPerPage)"
            @update:model-value="getAssinaturas()"
          >
            <template #prev="slotProps">
              <VBtn variant="tonal" color="default" v-bind="slotProps" :icon="false">Anterior</VBtn>
            </template>
            <template #next="slotProps">
              <VBtn variant="tonal" color="default" v-bind="slotProps" :icon="false">Próximo</VBtn>
            </template>
          </VPagination>
        </div>
      </template>
    </VDataTableServer>
  </VCard>

  <!-- Dialog de Detalhes -->
  <VDialog v-model="dialogDetalhes" max-width="700">
    <VCard v-if="selectedAssinatura">
      <VCardText>
        <AppDrawerHeaderSection
          title="Detalhes da Assinatura"
          @cancel="dialogDetalhes = false"
        />

        <VRow class="mt-4">
          <VCol cols="12" md="6">
            <h4 class="text-h6 mb-3">
              <VIcon icon="tabler-building" class="mr-2" />
              Empresa
            </h4>
            <p class="mb-1"><strong>Nome:</strong> {{ selectedAssinatura.empresa_nome }}</p>
            <p class="mb-1"><strong>Email:</strong> {{ selectedAssinatura.empresa_email }}</p>
          </VCol>

          <VCol cols="12" md="6">
            <h4 class="text-h6 mb-3">
              <VIcon icon="tabler-credit-card" class="mr-2" />
              Plano
            </h4>
            <p class="mb-1"><strong>Nome:</strong> {{ selectedAssinatura.plano_nome }}</p>
            <p class="mb-1"><strong>Valor:</strong> {{ formatCurrency(selectedAssinatura.valor) }}</p>
            <p class="mb-1"><strong>Ciclo:</strong> {{ getCicloLabel(selectedAssinatura.ciclo) }}</p>
          </VCol>

          <VCol cols="12">
            <VDivider class="my-2" />
          </VCol>

          <VCol cols="12" md="6">
            <h4 class="text-h6 mb-3">
              <VIcon icon="tabler-calendar" class="mr-2" />
              Datas
            </h4>
            <p class="mb-1"><strong>Início:</strong> {{ formatDate(selectedAssinatura.data_inicio) }}</p>
            <p class="mb-1" v-if="selectedAssinatura.data_fim_trial">
              <strong>Fim do Trial:</strong> {{ formatDate(selectedAssinatura.data_fim_trial) }}
            </p>
            <p class="mb-1"><strong>Próximo Vencimento:</strong> {{ formatDate(selectedAssinatura.data_proximo_vencimento) }}</p>
          </VCol>

          <VCol cols="12" md="6">
            <h4 class="text-h6 mb-3">
              <VIcon icon="tabler-info-circle" class="mr-2" />
              Status
            </h4>
            <VChip :color="getStatusColor(selectedAssinatura.status)" class="mb-2">
              {{ selectedAssinatura.status }}
            </VChip>
            <p class="mb-1" v-if="selectedAssinatura.asaas_subscription_id">
              <strong>ID Asaas:</strong> {{ selectedAssinatura.asaas_subscription_id }}
            </p>
          </VCol>

          <!-- Pagamentos -->
          <VCol cols="12" v-if="selectedAssinatura.pagamentos?.length > 0">
            <VDivider class="my-2" />
            <h4 class="text-h6 mb-3">
              <VIcon icon="tabler-receipt" class="mr-2" />
              Histórico de Pagamentos
            </h4>
            <VTable density="compact">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Forma</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pag in selectedAssinatura.pagamentos" :key="pag.id">
                  <td>{{ formatDate(pag.data_pagamento || pag.data_vencimento) }}</td>
                  <td>{{ formatCurrency(pag.valor) }}</td>
                  <td>{{ pag.forma_pagamento || '-' }}</td>
                  <td>
                    <VChip size="x-small" :color="pag.status === 'RECEIVED' ? 'success' : 'warning'">
                      {{ pag.status }}
                    </VChip>
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VCol>
        </VRow>

        <div class="d-flex justify-end gap-2 mt-4">
          <VBtn variant="outlined" @click="dialogDetalhes = false">
            Fechar
          </VBtn>
          <VBtn
            v-if="!['cancelada'].includes(selectedAssinatura.status)"
            color="error"
            @click="cancelarAssinatura(selectedAssinatura)"
          >
            <VIcon icon="tabler-x" class="mr-2" />
            Cancelar Assinatura
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
