<script setup>
const { setAlert } = useAlert();

const emit = defineEmits(["update:isDrawerOpen", "selected"]);

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
});

const modelos = ref([]);
const loading = ref(false);
const search = ref("");

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
};

const getModelos = async () => {
  loading.value = true;
  try {
    const res = await $api("/contrato-modelos/list", {
      query: { q: search.value },
    });
    modelos.value = res;
  } catch (err) {
    console.error("Erro ao buscar modelos:", err);
  }
  loading.value = false;
};

const selecionarModelo = async (modelo) => {
  try {
    const res = await $api(`/contrato-modelos/get/${modelo.id}`);
    emit("selected", res.conteudo_html);
    closeDrawer();
  } catch (err) {
    console.error("Erro ao buscar modelo:", err);
    setAlert("Erro ao carregar modelo", "error", "tabler-alert-triangle", 3000);
  }
};

let searchTimeout = null;
watch(search, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(getModelos, 400);
});

watch(
  () => props.isDrawerOpen,
  (val) => {
    if (val) getModelos();
  }
);
</script>

<template>
  <VDialog
    :modelValue="props.isDrawerOpen"
    @update:modelValue="handleDrawer"
    max-width="500"
    persistent
  >
    <VCard v-if="props.isDrawerOpen">
      <VCardText class="pa-4">
        <AppDrawerHeaderSection
          customClass="px-0 pb-0 pt-3"
          title="Importar Modelo"
          @cancel="closeDrawer"
        />

        <AppTextField
          v-model="search"
          placeholder="Buscar modelo..."
          class="mt-4 mb-4"
          clearable
        >
          <template #prepend-inner>
            <VIcon icon="tabler-search" size="20" />
          </template>
        </AppTextField>

        <div v-if="loading" class="text-center py-4">
          <VProgressCircular indeterminate color="primary" />
        </div>

        <VList v-else-if="modelos.length > 0" lines="two" density="compact">
          <VListItem
            v-for="modelo in modelos"
            :key="modelo.id"
            @click="selecionarModelo(modelo)"
            class="rounded mb-1"
          >
            <template #prepend>
              <VAvatar color="primary" variant="tonal" size="36">
                <VIcon icon="tabler-file-text" size="20" />
              </VAvatar>
            </template>

            <VListItemTitle class="font-weight-medium">
              {{ modelo.titulo }}
            </VListItemTitle>
            <VListItemSubtitle>
              Atualizado em {{ new Date(modelo.updated_at).toLocaleDateString("pt-BR") }}
            </VListItemSubtitle>

            <template #append>
              <VBtn
                variant="tonal"
                color="primary"
                size="small"
              >
                Usar
              </VBtn>
            </template>
          </VListItem>
        </VList>

        <div v-else class="text-center py-6">
          <VIcon icon="tabler-file-off" size="40" color="disabled" class="mb-2" />
          <p class="text-disabled mb-0">Nenhum modelo encontrado.</p>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
