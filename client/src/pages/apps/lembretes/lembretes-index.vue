<script setup>
  import { VDataTableServer } from "vuetify/labs/VDataTable";
  import { paginationMeta } from "@api-utils/paginationMeta";
  import LembreteDialog from "@/views/apps/lembretes/lembreteDialog.vue";
  import { useAlert } from "@/composables/useAlert";

  const { setAlert } = useAlert();
  const loading = ref(true);

  onMounted(() => {
    getLembretes();
  });

  // Data table options
  const itemsPerPage = ref(10);
  const page = ref(1);
  const sortBy = ref();
  const orderBy = ref();

  const updateOptions = (options) => {
    page.value = options.page;
    sortBy.value = options.sortBy[0]?.key;
    orderBy.value = options.sortBy[0]?.order;

    getLembretes();
  };

  // Headers
  const headers = [
    {
      title: "Título",
      key: "title",
    },
    {
      title: "Data",
      key: "agendado_time",
    },
    {
      title: "Destinatários",
      key: "destinatarios",
      sortable: false,
    },
    {
      title: "Status",
      key: "status",
      sortable: false,
    },
    {
      title: "Repetir",
      key: "repeat",
    },
    {
      title: "Notificação",
      key: "notify_email",
    },
    {
      title: "Ações",
      key: "actions",
      sortable: false,
    },
  ];

  const lembretes = ref([]);
  const totalLembretes = ref(0);

  const getLembretes = async () => {
    loading.value = true;

    try {
      const res = await $api("/lembretes/list", {
        method: "GET",
        query: {
          itemsPerPage: itemsPerPage.value,
          page: page.value,
          sortBy: sortBy.value,
          orderBy: orderBy.value,
        },
      });

      lembretes.value = res.lembretes;
      totalLembretes.value = res.totalLembretes;
    } catch (err) {
      lembretes.value = [];
    }

    loading.value = false;
  };

  const isAddNewUserDrawerVisible = ref(false);
  const selectedLembreteData = ref({});

  const editUser = async (item) => {
    try {
      const res = await $api(`/lembretes/get/${item.id}`, {
        method: "GET",
      });

      if (!res) return;

      selectedLembreteData.value = res;
      isAddNewUserDrawerVisible.value = true;
    } catch (error) {
      console.error("Error fetching lembrete data", error);
    }
  };

  const deleteUser = async (id) => {
    const confirm = window.confirm(
      "Tem certeza que deseja excluir esse lembrete? Isso não poderá ser desfeito!"
    );

    if (!confirm) return;

    try {
      await $api(`/lembretes/delete/${id}`, {
        method: "GET",
      });

      setAlert(
        "Lembrete excluído com sucesso!",
        "success",
        "tabler-trash",
        3000
      );
      getLembretes();
    } catch (err) {
      setAlert(
        err?.response?._data?.message ||
          "Ocorreu um erro ao excluir o lembrete, tente novamente!",
        "error",
        "tabler-alert-triangle",
        3000
      );
    }
  };

  // Retorna o status do lembrete baseado no estado
  const getStatusLembrete = (item) => {
    if (item.concluido) return { text: "Concluído", color: "success" };
    const agendado = new Date(item.agendado_time);
    if (agendado < new Date()) return { text: "Atrasado", color: "error" };
    return { text: "Ativo", color: "info" };
  };

  // Formata a lista de destinatários para exibição
  const getDestinatariosLabel = (item) => {
    const funcoes = item.destinatarios_funcoes || [];
    const usuarios = item.destinatarios_usuarios || [];
    if (funcoes.length === 0 && usuarios.length === 0) return null;
    return { funcoes, usuariosCount: usuarios.length };
  };
</script>

<template>
  <div class="d-flex align-center justify-space-between mb-4">
    <div>
      <h2 class="text-h5 mb-0">
        <VIcon icon="tabler-bell-ringing" class="me-2" size="28" />
        Lembretes
      </h2>
      <p class="text-sm text-disabled mb-0">Gerencie os lembretes do sistema.</p>
    </div>
  </div>

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
        <VBtn
          prepend-icon="tabler-plus"
          @click="isAddNewUserDrawerVisible = true"
        >
          Cadastrar Lembrete
        </VBtn>
      </div>
    </VCardText>

    <VDivider />

    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :items="lembretes"
      :items-length="totalLembretes"
      :headers="headers"
      class="text-no-wrap"
      @update:options="updateOptions"
      :loading="loading"
      loading-text="Carregando lembretes..."
    >
      <template #item.title="{ item }">
        <p
          class="mb-0 text-truncate"
          :class="{ 'text-decoration-line-through': item.concluido }"
        >
          <VIcon
            icon="tabler-circle-check-filled"
            color="success"
            v-if="item.concluido"
            class="me-1"
            size="16"
          />
          {{ item.title }}
        </p>

        <p
          class="mb-0 text-caption text-disabled cursor-pointer text-truncate"
          :class="{ 'text-decoration-line-through': item.concluido }"
        >
          {{ item.subtitle }}
          <VTooltip activator="parent" :text="item.subtitle" />
        </p>
      </template>

      <template #item.agendado_time="{ item }">
        <p class="mb-0">
          {{ new Date(item.agendado_time).toLocaleString("pt-BR") }}
        </p>
      </template>

      <template #item.destinatarios="{ item }">
        <div class="d-flex flex-wrap gap-1">
          <template v-if="getDestinatariosLabel(item)">
            <VChip
              v-for="funcao in getDestinatariosLabel(item).funcoes"
              :key="funcao"
              size="small"
              color="primary"
              variant="tonal"
              label
            >
              {{ funcao }}
            </VChip>
            <VChip
              v-if="getDestinatariosLabel(item).usuariosCount > 0"
              size="small"
              color="info"
              variant="tonal"
              label
            >
              {{ getDestinatariosLabel(item).usuariosCount }} usuário(s)
            </VChip>
          </template>
          <VChip v-else size="small" color="secondary" variant="tonal" label>
            Admin / Gerente
          </VChip>
        </div>
      </template>

      <template #item.status="{ item }">
        <VChip
          :color="getStatusLembrete(item).color"
          size="small"
          label
        >
          {{ getStatusLembrete(item).text }}
        </VChip>
      </template>

      <template #item.repeat="{ item }">
        <VChip :color="item.repeat ? 'success' : 'warning'" size="small" label>
          {{ item.repeat ? "Sim" : "Não" }}
        </VChip>
      </template>

      <template #item.notify_email="{ item }">
        <div class="d-flex flex-row gap-2">
          <VIcon
            icon="tabler-mail"
            :color="item.notify_email ? 'primary' : 'secondary'"
            size="20"
          />
          <VIcon
            icon="tabler-brand-whatsapp"
            :color="item.notify_zap ? 'primary' : 'secondary'"
            size="20"
          />
        </div>
      </template>

      <!-- Actions -->
      <template #item.actions="{ item }">
        <div class="d-flex flex-row gap-1">
          <IconBtn
            title="Editar Lembrete"
            @click="editUser(item)"
            color="warning"
            variant="tonal"
            size="small"
          >
            <VIcon icon="tabler-edit" size="18" />
          </IconBtn>

          <IconBtn
            title="Excluir Lembrete"
            @click="deleteUser(item.id)"
            color="error"
            variant="tonal"
            size="small"
          >
            <VIcon icon="tabler-trash" size="18" />
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
            {{ paginationMeta({ page, itemsPerPage }, totalLembretes) }}
          </p>

          <VPagination
            v-model="page"
            :length="Math.ceil(totalLembretes / itemsPerPage)"
            :total-visible="
              $vuetify.display.xs
                ? 1
                : totalLembretes > 100
                ? 4
                : Math.ceil(totalLembretes / itemsPerPage)
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

  <LembreteDialog
    :isDrawerOpen="isAddNewUserDrawerVisible"
    @update:isDrawerOpen="isAddNewUserDrawerVisible = $event"
    :lembreteData="selectedLembreteData"
    @updateLembretes="getLembretes"
  />
</template>
