<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import EmpresaDialog from "@/views/apps/saas/EmpresaDialog.vue";

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
const empresas = ref([]);
const totalEmpresas = ref(0);
const selectedEmpresa = ref(null);
const dialogEmpresa = ref(false);

// Filtros e paginação
const searchQuery = ref("");
const statusFilter = ref(null);
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref('id');
const orderBy = ref('desc');

const statusOptions = [
  { title: 'Todas', value: null },
  { title: 'Ativa', value: 'ativa' },
  { title: 'Pendente', value: 'pendente' },
  { title: 'Suspensa', value: 'suspensa' },
  { title: 'Inativa', value: 'inativa' }
];

// Headers da tabela
const headers = [
  { title: 'ID', key: 'id', sortable: true },
  { title: 'Nome', key: 'nome', sortable: true },
  { title: 'Email', key: 'email', sortable: true },
  { title: 'CNPJ/CPF', key: 'documento', sortable: false },
  { title: 'Plano', key: 'plano', sortable: false },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Ações', key: 'actions', sortable: false }
];

// Buscar empresas
const getEmpresas = async () => {
  loading.value = true;

  try {
    const res = await $api('/saas/empresas', {
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

    empresas.value = res.empresas || [];
    totalEmpresas.value = res.total || 0;
  } catch (error) {
    console.error('Erro ao buscar empresas:', error);
    setAlert('Erro ao buscar empresas', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Atualizar opções da tabela
const updateOptions = (options) => {
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key || 'id';
  orderBy.value = options.sortBy[0]?.order || 'desc';
  getEmpresas();
};

// Abrir dialog para criar empresa
const openCreateDialog = () => {
  selectedEmpresa.value = null;
  dialogEmpresa.value = true;
};

// Abrir dialog para editar empresa
const openEditDialog = (empresa) => {
  selectedEmpresa.value = { ...empresa };
  dialogEmpresa.value = true;
};

// Salvar empresa
const saveEmpresa = async (empresaData) => {
  loading.value = true;

  try {
    if (empresaData.id) {
      await $api(`/saas/empresas/${empresaData.id}`, {
        method: 'PUT',
        body: empresaData
      });
      setAlert('Empresa atualizada com sucesso!', 'success', 'tabler-check', 3000);
    } else {
      await $api('/saas/empresas', {
        method: 'POST',
        body: empresaData
      });
      setAlert('Empresa criada com sucesso!', 'success', 'tabler-check', 3000);
    }

    dialogEmpresa.value = false;
    getEmpresas();
  } catch (error) {
    console.error('Erro ao salvar empresa:', error);
    setAlert(error?.response?._data?.error || 'Erro ao salvar empresa', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Desativar empresa
const deleteEmpresa = async (empresa) => {
  const confirm = window.confirm(`Deseja desativar a empresa "${empresa.nome}"?`);
  if (!confirm) return;

  loading.value = true;

  try {
    await $api(`/saas/empresas/${empresa.id}`, { method: 'DELETE' });
    setAlert('Empresa desativada com sucesso!', 'success', 'tabler-check', 3000);
    getEmpresas();
  } catch (error) {
    console.error('Erro ao desativar empresa:', error);
    setAlert('Erro ao desativar empresa', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Cor do status
const getStatusColor = (status) => {
  const colors = {
    ativa: 'success',
    pendente: 'warning',
    suspensa: 'error',
    inativa: 'secondary'
  };
  return colors[status] || 'default';
};

onMounted(() => {
  getEmpresas();
});
</script>

<template>
  <h2 class="text-h5 mb-0">Empresas ({{ totalEmpresas }})</h2>
  <p class="text-sm">Gerencie as empresas cadastradas no sistema</p>

  <VCard>
    <VCardText class="d-flex flex-row gap-3 align-end">
      <VRow>
        <VCol cols="12" md="6">
          <AppTextField
            v-model="searchQuery"
            label="Pesquisar"
            placeholder="Nome, email, CNPJ ou CPF"
            @keyup.enter="getEmpresas()"
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

        <VCol cols="12" md="3" class="d-flex gap-2 align-end">
          <VBtn color="primary" @click="getEmpresas()">
            <VIcon icon="tabler-search" class="mr-2" />
            Buscar
          </VBtn>
          <VBtn color="success" @click="openCreateDialog">
            <VIcon icon="tabler-plus" class="mr-2" />
            Nova
          </VBtn>
        </VCol>
      </VRow>
    </VCardText>

    <VDivider />

    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :headers="headers"
      :items="empresas"
      :items-length="totalEmpresas"
      :loading="loading"
      @update:options="updateOptions"
    >
      <!-- Nome -->
      <template #item.nome="{ item }">
        <div class="d-flex align-center gap-2">
          <VAvatar size="32" color="primary" variant="tonal">
            <span class="text-xs">{{ item.nome?.charAt(0)?.toUpperCase() }}</span>
          </VAvatar>
          <span>{{ item.nome }}</span>
        </div>
      </template>

      <!-- Documento -->
      <template #item.documento="{ item }">
        {{ item.documento || item.cnpj || item.cpf || '-' }}
      </template>

      <!-- Plano -->
      <template #item.plano="{ item }">
        <VChip
          v-if="item.assinatura"
          :color="item.assinatura.status === 'ativa' ? 'primary' : 'warning'"
          size="small"
        >
          {{ item.assinatura.plano_nome }}
        </VChip>
        <span v-else class="text-medium-emphasis">Sem plano</span>
      </template>

      <!-- Status -->
      <template #item.status="{ item }">
        <VChip :color="getStatusColor(item.status)" size="small">
          {{ item.status }}
        </VChip>
      </template>

      <!-- Ações -->
      <template #item.actions="{ item }">
        <div class="d-flex gap-1">
          <IconBtn size="small" @click="openEditDialog(item)">
            <VIcon icon="tabler-edit" size="18" />
          </IconBtn>
          <IconBtn v-if="item.id !== 1" size="small" color="error" @click="deleteEmpresa(item)">
            <VIcon icon="tabler-trash" size="18" />
          </IconBtn>
        </div>
      </template>

      <!-- Paginação -->
      <template #bottom>
        <VDivider />
        <div class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3">
          <p class="text-sm text-disabled mb-0">
            {{ paginationMeta({ page, itemsPerPage }, totalEmpresas) }}
          </p>
          <VPagination
            v-model="page"
            :length="Math.ceil(totalEmpresas / itemsPerPage)"
            :total-visible="$vuetify.display.xs ? 1 : totalEmpresas > 100 ? 4 : Math.ceil(totalEmpresas / itemsPerPage)"
            @update:model-value="getEmpresas()"
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

  <!-- Dialog de Empresa -->
  <EmpresaDialog
    v-model="dialogEmpresa"
    :empresa="selectedEmpresa"
    @save="saveEmpresa"
  />
</template>
