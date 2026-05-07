<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import FlowBuilderDialog from "@/views/apps/crm/FlowBuilderDialog.vue";
import { can } from "@layouts/plugins/casl";

if (!can("view", "crm_modelos_mensagens")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

import moment from "moment";
const { setAlert } = useAlert();

const userData = useCookie("userData").value;
const userRole = userData.role;

const router = useRouter();

const route = useRoute();
const loading = ref(false);
const viewFilters = ref(false);

// 👉 Store
const searchQuery = ref("");

// Data table options
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref();
const orderBy = ref();

const updateOptions = (options) => {
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key;
  orderBy.value = options.sortBy[0]?.order;

  getFlows();
};

// Headers
const headers = [
  {
    title: "Nome",
    key: "name",
  },
  {
    title: "Trigger",
    key: "trigger_type",
  },
  {
    title: "Status",
    key: "status",
  },
  {
    title: "Criado em",
    key: "created_at",
  },
  {
    title: "Ações",
    key: "actions",
    sortable: false,
  },
];

const flows = ref([]);
const totalFlows = ref(0);

const getFlows = async () => {
  loading.value = true;

  try {
    const res = await $api("/flows", {
      method: "GET",
      query: {
        q: searchQuery.value,
        itemsPerPage: itemsPerPage.value,
        page: page.value,
        sortBy: sortBy.value,
        orderBy: orderBy.value,
      },
    });

    if (!res) return;

    console.log("flows res", res);

    flows.value = res.flows || [];
    totalFlows.value = res.totalFlows || 0;
  } catch (error) {
    console.error("Error fetching flows data", error, error.response);

    flows.value = [];
    totalFlows.value = 0;

    // Mostrar alerta de erro para o usuário
    setAlert(
      "Erro ao carregar fluxos. Tente novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
  loading.value = false;
};

getFlows();

const viewDialogFlow = ref(false);
const selectedFlow = ref(null);

const openDialogFlow = (item) => {
  selectedFlow.value = item;
  viewDialogFlow.value = true;
};

const closeDialogFlow = () => {
  selectedFlow.value = null;
  viewDialogFlow.value = false;
};

watch(
  () => viewDialogFlow.value,
  (newValue) => {
    if (!newValue) {
      selectedFlow.value = null;
    }
  }
);

const deleteFlow = async (item) => {
  const confirmar = confirm(
    "Deseja realmente excluir esse fluxo? Essa ação não poderá ser desfeita!"
  );

  if (!confirmar) return;

  let index = flows.value.findIndex((flow) => flow.id === item.id);
  flows.value[index].loadingTrash = true;
  try {
    const res = await $api(`/flows/${item.id}`, {
      method: "DELETE",
    });

    if (!res) return;

    console.log("deleteFlow", res);

    getFlows();
    setAlert(
      "Fluxo excluído com sucesso",
      "success",
      "tabler-alert-circle",
      3000
    );
  } catch (error) {
    console.error("Error deleting flow", error, error.response);
    setAlert(
      "Erro ao excluir fluxo. Tente novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  flows.value[index].loadingTrash = false;
};

const toggleFlowStatus = async (item) => {
  try {
    console.log("Item", item);
    const newStatus = item.status === "ativo" ? "inativo" : "ativo";
    const res = await $api(`/flows/toggle-status/${item.id}`, {
      method: "PUT",
      body: { status: newStatus },
    });

    if (!res) return;

    // Atualizar o status localmente
    item.status = newStatus;

    setAlert(
      `Fluxo ${newStatus === "ativo" ? "ativado" : "desativado"} com sucesso`,
      "success",
      "tabler-check",
      3000
    );
  } catch (error) {
    console.error("Error toggling flow status", error, error.response);
    setAlert(
      "Erro ao alterar status do fluxo. Tente novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const getTriggerLabel = (triggerType) => {
  const triggers = {
    webhook: "Webhook",
    novo_agendamento: "Novo Agendamento",
    status_agendamento: "Alteração Status Agendamento",
    novo_pagamento: "Novo Pagamento",
    pagamento_efetuado: "Pagamento Efetuado",
    mensagem_whatsapp: "Mensagem WhatsApp",
    cron_diario: "Executa Diariamente",
    cron_minuto: "Executa a cada minuto",
    cron_hora: "Executa a cada hora",
  };
  return triggers[triggerType] || triggerType;
};

const getStatusColor = (status) => {
  return status === "ativo" ? "success" : "error";
};

const getStatusLabel = (status) => {
  return status === "ativo" ? "Ativo" : "Inativo";
};
</script>

<template>
  <section>
    <!-- 👉 Widgets -->
    <div class="mb-6">
      <h2 class="text-h5 mb-0">Fluxos de Mensagens</h2>
      <p class="text-sm">
        Gerencie os fluxos de mensagens automatizadas do WhatsApp e email.
      </p>
    </div>

    <VCard class="mb-6">
      <VCardText>
        <VRow>
          <!-- 👉 Search  -->
          <VCol cols="12">
            <AppTextField
              v-model="searchQuery"
              label="Pesquise um fluxo"
              @update:model-value="getFlows"
              placeholder="Pesquise por nome"
              density="compact"
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
          <!-- 👉 Add flow button -->
          <VBtn prepend-icon="tabler-plus" @click="viewDialogFlow = true">
            Adicionar Fluxo
          </VBtn>
        </div>
      </VCardText>

      <VDivider />

      <!-- SECTION datatable -->
      <VDataTableServer
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        :items="flows"
        :items-length="totalFlows"
        :headers="headers"
        class="text-no-wrap"
        @update:options="updateOptions"
        :loading="loading"
        loading-text="Carregando fluxos..."
        no-data-text="Nenhum fluxo encontrado"
      >
        <!-- Slot: Trigger -->
        <template #item.trigger_type="{ item }">
          <VChip
            :color="item.trigger_type ? 'primary' : 'grey'"
            size="small"
            variant="tonal"
          >
            {{ getTriggerLabel(item.trigger_type) }}
          </VChip>
        </template>

        <!-- Slot: Status -->
        <template #item.status="{ item }">
          <VChip
            :color="getStatusColor(item.status)"
            size="small"
            variant="tonal"
          >
            {{ getStatusLabel(item.status) }}
          </VChip>
        </template>

        <!-- Slot: Created at -->
        <template #item.created_at="{ item }">
          {{ moment(item.created_at).format("DD/MM/YYYY HH:mm") }}
        </template>

        <!-- Actions -->
        <template #item.actions="{ item }">
          <div class="d-flex align-center">
            <VSwitch
              v-model="item.status"
              value="ativo"
              :color="item.status === 'inativo' ? 'error' : 'success'"
              @click="toggleFlowStatus(item)"
            />

            <IconBtn
              title="Editar fluxo"
              @click="openDialogFlow(item)"
              variant="tonal"
              color="warning"
              class="mx-2"
            >
              <VIcon
                :icon="item.isLoadingUser ? 'tabler-loader' : 'tabler-edit'"
              />
            </IconBtn>

            <IconBtn
              title="Excluir fluxo"
              @click="deleteFlow(item)"
              variant="tonal"
              color="error"
            >
              <VIcon
                :icon="item.loadingTrash ? 'tabler-loader' : 'tabler-trash'"
              />
            </IconBtn>
          </div>
        </template>

        <!-- pagination -->
        <template #bottom>
          <VDivider />
          <div
            class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3"
          >
            <p class="text-sm text-disabled mb-0">
              {{ paginationMeta({ page, itemsPerPage }, totalFlows) }}
            </p>

            <VPagination
              v-model="page"
              :length="Math.ceil(totalFlows / itemsPerPage)"
              :total-visible="
                $vuetify.display.xs
                  ? 1
                  : Math.ceil(totalFlows / itemsPerPage) > 5
                  ? 5
                  : Math.ceil(totalFlows / itemsPerPage)
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
      <!-- SECTION -->
    </VCard>

    <FlowBuilderDialog
      :isDrawerOpen="viewDialogFlow"
      @update:isDrawerOpen="viewDialogFlow = $event"
      :flowData="selectedFlow"
      @updateFlows="getFlows"
    />
  </section>
</template>
