<script setup>
  import moment from "moment";
  import "moment/dist/locale/pt-br";
  import draggable from "vuedraggable";
  import { useConfirm } from "@/utils/confirm.js";

  import newNegocio from "@/views/apps/crm/newNegocio.vue";

  import { can } from "@layouts/plugins/casl";

  if (!can("view", "crm_funil_vendas")) {
    setAlert(
      "Você não tem permissão para acessar esta página.",
      "error",
      "tabler-alert-triangle",
      3000
    );
    router.push("/");
  }

  const { setAlert } = useAlert();

  const userData = useCookie("userData").value;

  const router = useRouter();

  const route = useRoute();
  const loading = ref(false);
  const viewFilters = ref(false);

  const funis = ref([]);

  const getFunis = async () => {
    loading.value = true;

    try {
      const res = await $api("/crm/list/funil", {
        method: "GET",
        query: {
          negocios: true,
        },
      });

      if (!res) throw new Error("Erro ao buscar funis de vendas");

      console.log("Funis carregados:", res);

      funis.value = res;
    } catch (error) {
      console.error("Error fetching funis", error, error.response);
      setAlert(
        error?.response?._data?.message || "Erro ao buscar funis de vendas",
        "error",
        "tabler-alert-triangle",
        7000
      );
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    getFunis();
  });

  const selectedEtapa = ref(null);
  const viewDialogFunil = ref(false);
  const loadingSave = ref(false);
  const loadingDelete = ref(false);
  const viewNewNegocio = ref(false);
  const etapaNewNegocio = ref(null);

  const saveFunil = async (auto = false, getFs = true) => {
    if (!selectedEtapa.value.nome) {
      setAlert(
        "O nome da etapa é obrigatório.",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return;
    }

    loadingSave.value = true;

    try {
      const res = await $api("/crm/upsert/funil", {
        method: "POST",
        body: selectedEtapa.value,
      });

      if (!res) throw new Error("Erro ao salvar etapa do funil");

      viewDialogFunil.value = false;
      selectedEtapa.value = null;

      if (!auto) {
        setAlert(
          "Etapa do funil salva com sucesso.",
          "success",
          "tabler-check",
          3000
        );
      }

      if (getFs) {
        getFunis();
      }
    } catch (error) {
      console.error("Error saving funil", error, error.response);

      setAlert(
        error?.response?._data?.message || "Erro ao salvar etapa do funil",
        "error",
        "tabler-alert-triangle",
        7000
      );
    } finally {
      loadingSave.value = false;
    }
  };

  const deleteFunil = async () => {
    if (!selectedEtapa.value || !selectedEtapa.value.id) {
      setAlert(
        "Nenhuma etapa selecionada para exclusão.",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return;
    }

    let textConfirm = `Você tem certeza que deseja excluir a etapa "${selectedEtapa.value.nome}"? Essa ação não pode ser desfeita e todos os dados serão perdidos.`;

    const confirmar = await useConfirm({ message: textConfirm });

    if (!confirmar) {
      selectedEtapa.value = null;
      return;
    }

    loadingDelete.value = true;

    try {
      const res = await $api(`/crm/delete/funil/${selectedEtapa.value.id}`, {
        method: "DELETE",
      });

      if (!res) throw new Error("Erro ao excluir etapa do funil");

      setAlert(
        "Etapa do funil excluída com sucesso.",
        "success",
        "tabler-check",
        3000
      );

      viewDialogFunil.value = false;
      selectedEtapa.value = null;

      getFunis();
    } catch (error) {
      console.error("Error deleting funil", error, error.response);

      setAlert(
        error?.response?._data?.message || "Erro ao excluir etapa do funil",
        "error",
        "tabler-alert-triangle",
        7000
      );
    } finally {
      loadingDelete.value = false;
    }
  };

  const onEndColumn = async (e) => {
    const oldIndex = parseInt(e.oldIndex);
    const newIndex = parseInt(e.newIndex);

    e.item.style.opacity = "1";

    if (oldIndex === newIndex) {
      return;
    }

    // Atualizar a ordem de todas as etapas no backend
    try {
      const ordens = funis.value.map((f, index) => ({
        id: f.id,
        ordem: index + 1,
      }));

      await $api("/crm/update/funis/ordem", {
        method: "PUT",
        body: { ordens },
      });

      // Atualizar localmente
      funis.value.forEach((f, index) => {
        f.ordem = index + 1;
      });
    } catch (error) {
      console.error("Erro ao salvar ordem das etapas:", error);
      setAlert(
        "Erro ao salvar a ordem das etapas.",
        "error",
        "tabler-alert-triangle",
        3000
      );
      getFunis(); // Recarregar para reverter
    }
  };

  const onStartColumn = (e) => {
    e.item.style.opacity = "0.5";
  };

  const onEndNegocio = async (e) => {
    if (!can("edit", "crm_funil_vendas")) {
      setAlert(
        "Você não tem permissão para alterar a etapa do negócio.",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return;
    }

    const idNegocio = e.item.id;

    const novaEtapa = funis.value.find(
      (f) => f.negocios && f.negocios.some((n) => n.id == idNegocio)
    );

    const etapaAtual = e.item.dataset.etapakey;
    const etapaId = novaEtapa ? novaEtapa.id : null;

    if (etapaAtual == etapaId) {
      return;
    }
    
    if (!idNegocio || !etapaId) {
      console.error("ID do negócio ou etapaId não encontrado");
      return;
    }

    try {
      const res = await $api("/crm/update/negocio/etapa", {
        method: "PUT",
        body: {
          id: idNegocio,
          etapaId,
        },
      });

      if (!res) throw new Error("Erro ao alterar etapa do negócio");

      console.log("Negócio atualizado com sucesso:", res);

      setAlert(
        "Etapa do negócio alterada com sucesso.",
        "success",
        "tabler-check",
        3000
      );
    } catch (error) {
      console.error("Erro ao alterar etapa do negócio:", error, error.response);
      setAlert(
        error?.response?._data?.message ||
          "Erro ao alterar etapa do negócio. Tente novamente mais tarde.",
        "error",
        "tabler-alert-triangle",
        7000
      );
    }
  };

  const formatValue = (value) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };
</script>
<template>
  <div class="linha-flex w-100 justify-space-between mb-4">
    <div>
      <h2 class="text-h5 mb-0">Funil de Vendas</h2>
      <p class="text-sm mb-0">Gerencie as etapas e negócios do funil.</p>
    </div>

    <VBtn
      @click="
        selectedEtapa = {
          nome: '',
          probabilidade: null,
          instrucoesIa: '',
          ordem: funis.length + 1,
        };
        viewDialogFunil = true;
      "
    >
      <VIcon icon="tabler-plus" class="mr-2" />
      Nova Etapa
    </VBtn>
  </div>

  <div style="width: calc(100% + 24px)">
    <draggable
      v-model="funis"
      group="funis"
      @start="onStartColumn"
      @end="onEndColumn"
      class="kanban-board"
      item-key="name"
      :animation="50"
      :delay="20"
    >
      <template #item="{ element: etapa, index: indexEtapa }">
        <div
          class="kanban-column"
          :data-key="etapa.id"
          :data-index="indexEtapa"
        >
          <div
            class="kaban-header d-flex justify-space-between align-center position-sticky mb-3"
          >
            <div>
              <p class="kaban-title mb-0">
                {{ etapa?.nome }}
              </p>
              <p class="text-caption mb-0">
                {{ etapa?.negocios?.length || 0 }} negócio(s)
                <span v-if="etapa?.negocios?.length > 0">
                  -
                  {{
                    etapa?.probabilidade > 0
                      ? etapa?.probabilidade + "% de "
                      : ""
                  }}
                  {{
                    formatValue(
                      etapa?.negocios?.reduce(
                        (acc, negocio) => acc + (negocio.valor || 0),
                        0
                      )
                    )
                  }}
                </span>
              </p>
            </div>

            <div
              style="min-width: 40px"
              class="d-flex align-center justify-end cursor-pointer"
            >
              <VIcon icon="tabler-dots-vertical" />

              <VMenu activator="parent" offset-y>
                <VList>
                  <VListItem
                    @click="
                      etapaNewNegocio = etapa.id;
                      viewNewNegocio = true;
                    "
                  >
                    <VIcon icon="tabler-plus" class="mr-1" color="primary" />
                    Adicionar Negócio
                  </VListItem>

                  <VListItem
                    @click="
                      selectedEtapa = { ...etapa };
                      viewDialogFunil = true;
                    "
                  >
                    <VIcon icon="tabler-edit" class="mr-1" color="warning" />
                    Editar Etapa
                  </VListItem>

                  <VListItem
                    @click="
                      selectedEtapa = { ...etapa };
                      deleteFunil();
                    "
                  >
                    <VIcon icon="tabler-trash" class="mr-1" color="error" />
                    Excluir Etapa
                  </VListItem>
                </VList>
              </VMenu>
            </div>
          </div>

          <draggable
            v-model="etapa.negocios"
            class="item-drag"
            group="items"
            item-key="id"
            :style="
              etapa?.negocios?.length < 1
                ? 'height: 300px; min-height: 300px;'
                : ''
            "
            :scroll-sensitivity="250"
            :scroll-speed="20"
            :force-fallback="true"
            @end="onEndNegocio"
            :animation="150"
            :delay="50"
          >
            <template #item="{ element: negocio, index: indexNegocio }">
              <VCard
                v-if="negocio && negocio?.id"
                :id="negocio?.id"
                :data-etapaKey="etapa.id"
                class="kanban-item pa-3 mx-2"
                elevation="1"
                @click="router.push(`/crm/funis/negocio/${negocio.id}`)"
              >
                <VChip
                  size="small"
                  label
                  class="mb-1"
                  :color="
                    negocio?.status == 'Ganho'
                      ? 'success'
                      : negocio?.status == 'Perdido'
                      ? 'error'
                      : 'secondary'
                  "
                  variant="flat"
                  v-if="
                    negocio?.status == 'Ganho' || negocio?.status == 'Perdido'
                  "
                >
                  {{ negocio?.status }}
                </VChip>

                <p class="mb-1 text-truncate text-sm font-weight-medium">
                  {{ negocio?.title }}
                </p>

                <p class="mb-0 text-truncate text-caption">
                  <VIcon icon="tabler-user-circle" class="mr-1" />
                  {{ negocio?.cliente?.cli_nome || "-" }}
                </p>
              </VCard>
            </template>
          </draggable>
        </div>
      </template>
    </draggable>
  </div>

  <VDialog v-model="viewDialogFunil" width="600">
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pa-0"
          :title="
            selectedEtapa?.id
              ? `Editar Etapa - ${selectedEtapa?.nome}`
              : 'Nova Etapa'
          "
          @cancel="
            viewDialogFunil = false;
            selectedEtapa = null;
          "
        />

        <VRow class="mt-2" v-if="selectedEtapa">
          <VCol cols="12">
            <AppTextField
              v-model="selectedEtapa.nome"
              label="Nome da etapa"
              placeholder="Insira o nome da etapa"
              required
              :rules="[requiredValidator]"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="selectedEtapa.probabilidade"
              label="Probabilidade de Ganho (%)"
              placeholder="Ex: 70%"
              type="number"
              min="0"
              max="100"
              tooltip="Probabilidade de ganho: Isso representa a sua confiança em fechar o negócio na data estimada. A probabilidade é usada para projetar seu faturamento futuro."
            />
          </VCol>

          <VCol cols="12">
            <VDivider class="mt-1 mb-4" />

            <p class="mb-2 text-sm">
              Instruções do Atendente Virtual

              <VTooltip>
                <template v-slot:activator="{ props }">
                  <VIcon
                    v-bind="props"
                    icon="tabler-info-circle-filled"
                    size="16"
                    color="primary"
                    class="mr-1 cursor-pointer"
                  />
                </template>
                <span class="text-sm" style="max-width: 250px">
                  Insira instruções que o atendente virtual deve seguir ao
                  interagir com clientes nesta etapa do funil.<br />
                  Essas instruções ajudam a personalizar o atendimento e
                  melhorar a experiência do cliente, seja claro e objetivo.<br />
                  Facilitando o entendimento do contexto e das necessidades do
                  cliente pela IA.
                </span>
              </VTooltip>
            </p>

            <AppTextarea
              v-model="selectedEtapa.instrucoesIa"
              placeholder="Insira as instruções para o atendente virtual"
              rows="4"
              auto-grow
              active
            />
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4">
          <VBtn
            variant="outlined"
            color="error"
            rounded="pill"
            :disabled="loadingDelete"
            @click="deleteFunil()"
          >
            Excluir Etapa
          </VBtn>

          <VBtn
            variant="outlined"
            color="secondary"
            rounded="pill"
            :disabled="loadingSave"
            @click="
              viewDialogFunil = false;
              selectedEtapa = null;
            "
          >
            Cancelar
          </VBtn>

          <VBtn
            color="primary"
            rounded="pill"
            :loading="loadingSave"
            @click="saveFunil(false, true)"
          >
            Salvar Etapa
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

  <newNegocio
    :etapaId="etapaNewNegocio"
    :isDrawerOpen="viewNewNegocio"
    @update:isDrawerOpen="viewNewNegocio = $event"
    @negocioSaved="getFunis()"
  />
</template>
