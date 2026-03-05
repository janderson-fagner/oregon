<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import { can } from "@layouts/plugins/casl";
import moment from "moment";

import ContratoDialog from "@/views/apps/contratos/ContratoDialog.vue";

const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(true);

if (!can("view", "cliente")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

onMounted(() => {
  getContratos();
});

const searchQuery = ref("");
const statusFilter = ref("");
const viewFilters = ref(false);

// Data table options
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref();
const orderBy = ref();

const updateOptions = (options) => {
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key;
  orderBy.value = options.sortBy[0]?.order;
  getContratos();
};

const headers = [
  { title: "Número", key: "numero" },
  { title: "Cliente", key: "cli_nome" },
  { title: "Valor", key: "valor" },
  { title: "Status", key: "status" },
  { title: "Início", key: "inicio_data" },
  { title: "Vigência", key: "periodo", sortable: false },
  { title: "Criado em", key: "created_at" },
  { title: "Ações", key: "actions", sortable: false },
];

const contratos = ref([]);
const totalContratos = ref(0);

const getContratos = async () => {
  loading.value = true;
  try {
    const res = await $api("/contratos/list", {
      method: "GET",
      query: {
        q: searchQuery.value,
        itemsPerPage: itemsPerPage.value,
        page: page.value,
        sortBy: sortBy.value,
        orderBy: orderBy.value,
        status: statusFilter.value,
      },
    });

    contratos.value = res.contratos;
    totalContratos.value = res.total;
  } catch (err) {
    console.error("Erro ao buscar contratos:", err);
  }
  loading.value = false;
};

// Dialog
const viewContratoDialog = ref(false);
const selectedContrato = ref(null);

watch(viewContratoDialog, (val) => {
  if (!val) selectedContrato.value = null;
});

const openContrato = async (item) => {
  if (item) {
    try {
      const res = await $api(`/contratos/get/${item.id}`);
      if (!res) return;
      selectedContrato.value = res;
    } catch (err) {
      console.error("Erro ao buscar contrato:", err);
      setAlert(
        err?.response?._data?.message || "Erro ao buscar contrato",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return;
    }
  }
  viewContratoDialog.value = true;
};

const deleteContrato = async (id) => {
  const confirm = window.confirm(
    "Tem certeza que deseja cancelar este contrato?"
  );
  if (!confirm) return;

  try {
    await $api(`/contratos/delete/${id}`, { method: "DELETE" });
    setAlert(
      "Contrato cancelado com sucesso!",
      "success",
      "tabler-trash",
      3000
    );
    getContratos();
  } catch (err) {
    console.error("Erro ao cancelar contrato:", err);
    setAlert(
      "Ocorreu um erro ao cancelar o contrato, tente novamente!",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const getStatusColor = (status) => {
  const map = {
    gerado: "secondary",
    rascunho: "warning",
    assinado_empresa: "info",
    assinado_cliente: "info",
    ativo: "success",
    cancelado: "error",
  };
  return map[status] || "default";
};

const getStatusLabel = (status) => {
  const map = {
    gerado: "Gerado",
    rascunho: "Rascunho",
    assinado_empresa: "Assinado Empresa",
    assinado_cliente: "Assinado Cliente",
    ativo: "Ativo",
    cancelado: "Cancelado",
  };
  return map[status] || status;
};

const formatValor = (valor) => {
  if (!valor) return "R$ 0,00";
  return parseFloat(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};
</script>

<template>
  <h2 class="text-h5 mb-0">Contratos ({{ totalContratos ?? 0 }})</h2>
  <p class="text-sm">Gerencie os contratos cadastrados no sistema.</p>

  <VCard class="mb-6">
    <VCardText class="d-flex flex-row gap-3 align-end">
      <VRow>
        <VCol cols="12" md="8">
          <AppTextField
            v-model="searchQuery"
            label="Pesquise um contrato"
            placeholder="Pesquisar por número, cliente ou observação"
            @update:modelValue="getContratos()"
            clearable
          />
        </VCol>

        <VCol cols="12" md="4">
          <AppSelect
            v-model="statusFilter"
            label="Status"
            :items="[
              { title: 'Todos', value: '' },
              { title: 'Gerado', value: 'gerado' },
              { title: 'Rascunho', value: 'rascunho' },
              { title: 'Assinado Empresa', value: 'assinado_empresa' },
              { title: 'Assinado Cliente', value: 'assinado_cliente' },
              { title: 'Ativo', value: 'ativo' },
              { title: 'Cancelado', value: 'cancelado' },
            ]"
            clearable
            @update:modelValue="getContratos()"
          />
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <VCard>
    <VCardText class="d-flex flex-wrap py-4 gap-4">
      <div class="me-3 d-flex gap-3">
        <AppSelect
          :model-value="itemsPerPage"
          :items="[
            { value: 10, title: '10' },
            { value: 25, title: '25' },
            { value: 50, title: '50' },
            { value: 100, title: '100' },
            { value: -1, title: 'Todos' },
          ]"
          style="inline-size: 6.25rem"
          @update:model-value="itemsPerPage = parseInt($event, 10)"
        />
      </div>
      <VSpacer />

      <div class="app-user-search-filter d-flex align-center flex-wrap gap-4">
        <VBtn prepend-icon="tabler-plus" @click="openContrato(null)">
          Novo Contrato
        </VBtn>
      </div>
    </VCardText>

    <VDivider />

    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :items="contratos"
      :items-length="totalContratos"
      :headers="headers"
      class="text-no-wrap"
      @update:options="updateOptions"
      :loading="loading"
      loading-text="Carregando contratos..."
    >
      <template #item.numero="{ item }">
        <span class="font-weight-medium">{{ item.numero || "-" }}</span>
      </template>

      <template #item.cli_nome="{ item }">
        <div class="mt-1 mb-2">
          <p class="mb-0">{{ item.cli_nome || "Sem cliente" }}</p>
          <p class="mb-0 text-caption" v-if="item.cli_email">
            <VIcon icon="tabler-mail" class="mr-1" />
            {{ item.cli_email }}
          </p>
          <p class="mb-0 text-caption" v-if="item.cli_celular">
            <VIcon icon="tabler-phone" class="mr-1" />
            {{ item.cli_celular }}
          </p>
        </div>
      </template>

      <template #item.valor="{ item }">
        {{ formatValor(item.valor) }}
      </template>

      <template #item.status="{ item }">
        <VChip :color="getStatusColor(item.status)" size="small" label>
          {{ getStatusLabel(item.status) }}
        </VChip>
      </template>

      <template #item.inicio_data="{ item }">
        {{
          item.inicio_data ? moment(item.inicio_data).format("DD/MM/YYYY") : "-"
        }}
      </template>

      <template #item.periodo="{ item }">
        <span v-if="item.periodo && item.periodo_type">
          {{ item.periodo }} {{ item.periodo_type }}
        </span>
        <span v-else>-</span>
      </template>

      <template #item.created_at="{ item }">
        {{ moment(item.created_at).format("DD/MM/YYYY HH:mm") }}
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex gap-2" v-if="item.status !== 'cancelado'">
          <IconBtn
            variant="tonal"
            color="warning"
            title="Editar contrato"
            @click="openContrato(item)"
          >
            <VIcon icon="tabler-edit" />
          </IconBtn>

          <IconBtn
            variant="tonal"
            color="error"
            title="Cancelar contrato"
            @click="deleteContrato(item.id)"
          >
            <VIcon icon="tabler-trash" />
          </IconBtn>
        </div>

        <div v-else>
          <VChip color="error" size="small" label>Cancelado</VChip>
        </div>
      </template>

      <!-- pagination -->
      <template #bottom>
        <VDivider />
        <div
          class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3"
        >
          <p class="text-sm text-disabled mb-0">
            {{ paginationMeta({ page, itemsPerPage }, totalContratos) }}
          </p>

          <VPagination
            v-model="page"
            :length="Math.ceil(totalContratos / itemsPerPage)"
            :total-visible="
              $vuetify.display.xs
                ? 1
                : totalContratos > 100
                ? 4
                : Math.ceil(totalContratos / itemsPerPage)
            "
          >
            <template #prev="slotProps">
              <VBtn
                variant="tonal"
                color="default"
                v-bind="slotProps"
                :icon="false"
              >
                Anterior
              </VBtn>
            </template>

            <template #next="slotProps">
              <VBtn
                variant="tonal"
                color="default"
                v-bind="slotProps"
                :icon="false"
              >
                Próximo
              </VBtn>
            </template>
          </VPagination>
        </div>
      </template>
    </VDataTableServer>
  </VCard>

  <ContratoDialog
    :isDrawerOpen="viewContratoDialog"
    @update:isDrawerOpen="viewContratoDialog = $event"
    :contratoData="selectedContrato"
    @contratoSaved="getContratos"
  />
</template>
