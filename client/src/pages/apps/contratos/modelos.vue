<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import moment from "moment";

import ModeloContratoDialog from "@/views/apps/contratos/ModeloContratoDialog.vue";

const { setAlert } = useAlert();

const modelos = ref([]);
const loading = ref(true);
const search = ref("");
const totalModelos = ref(0);
const viewModeloDialog = ref(false);
const modeloSelecionado = ref(null);

// Data table options
const itemsPerPage = ref(10);
const page = ref(1);

const headers = [
  { title: "Título", key: "titulo" },
  { title: "Criado em", key: "created_at" },
  { title: "Atualizado em", key: "updated_at" },
  { title: "Ações", key: "actions", sortable: false },
];

const getModelos = async () => {
  loading.value = true;
  try {
    const res = await $api("/contrato-modelos/list", {
      query: { q: search.value },
    });
    modelos.value = res;
    totalModelos.value = res.length;
  } catch (err) {
    console.error("Erro ao buscar modelos:", err);
    setAlert("Erro ao buscar modelos", "error", "tabler-alert-triangle", 5000);
  }
  loading.value = false;
};

const novoModelo = () => {
  modeloSelecionado.value = null;
  viewModeloDialog.value = true;
};

const editarModelo = async (item) => {
  try {
    const res = await $api(`/contrato-modelos/get/${item.id}`);
    modeloSelecionado.value = res;
    viewModeloDialog.value = true;
  } catch (err) {
    console.error("Erro ao buscar modelo:", err);
    setAlert("Erro ao buscar modelo", "error", "tabler-alert-triangle", 5000);
  }
};

const excluirModelo = async (item) => {
  const confirm = window.confirm(`Deseja excluir o modelo "${item.titulo}"?`);
  if (!confirm) return;
  try {
    await $api(`/contrato-modelos/delete/${item.id}`, { method: "DELETE" });
    setAlert("Modelo removido!", "success", "tabler-check", 3000);
    getModelos();
  } catch (err) {
    console.error("Erro ao excluir modelo:", err);
    setAlert("Erro ao excluir modelo", "error", "tabler-alert-triangle", 5000);
  }
};

let searchTimeout = null;
watch(search, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(getModelos, 400);
});

onMounted(getModelos);
</script>

<template>
  <h2 class="text-h5 mb-0">Modelos de Contrato ({{ totalModelos ?? 0 }})</h2>
  <p class="text-sm">Gerencie modelos reutilizáveis para seus contratos.</p>

  <VCard class="mb-6">
    <VCardText class="d-flex flex-row gap-3 align-end">
      <VRow>
        <VCol cols="12">
          <AppTextField
            v-model="search"
            label="Pesquise um modelo"
            placeholder="Pesquisar por título..."
            clearable
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
        <VBtn prepend-icon="tabler-plus" @click="novoModelo">
          Novo Modelo
        </VBtn>
      </div>
    </VCardText>

    <VDivider />

    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :items="modelos"
      :items-length="totalModelos"
      :headers="headers"
      class="text-no-wrap"
      :loading="loading"
      loading-text="Carregando modelos..."
    >
      <template #item.titulo="{ item }">
        <span class="font-weight-medium">{{ item.titulo }}</span>
      </template>

      <template #item.created_at="{ item }">
        {{ moment(item.created_at).format("DD/MM/YYYY HH:mm") }}
      </template>

      <template #item.updated_at="{ item }">
        {{ moment(item.updated_at).format("DD/MM/YYYY HH:mm") }}
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex gap-2">
          <IconBtn
            variant="tonal"
            color="warning"
            title="Editar modelo"
            @click="editarModelo(item)"
          >
            <VIcon icon="tabler-edit" />
          </IconBtn>
          <IconBtn
            variant="tonal"
            color="error"
            title="Excluir modelo"
            @click="excluirModelo(item)"
          >
            <VIcon icon="tabler-trash" />
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
            {{ paginationMeta({ page, itemsPerPage }, totalModelos) }}
          </p>

          <VPagination
            v-model="page"
            :length="Math.ceil(totalModelos / itemsPerPage)"
            :total-visible="
              $vuetify.display.xs
                ? 1
                : totalModelos > 100
                ? 4
                : Math.ceil(totalModelos / itemsPerPage)
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

  <ModeloContratoDialog
    :isDrawerOpen="viewModeloDialog"
    @update:isDrawerOpen="viewModeloDialog = $event"
    :modeloData="modeloSelecionado"
    @saved="getModelos"
  />
</template>
