<script setup>
const { setAlert } = useAlert();

const emit = defineEmits(["update:isDrawerOpen", "confirmed"]);

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
  negocios: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  moverEtapaId: { type: [Number, null], default: null },
});

const selecionados = ref([]);
const moverNegocios = ref(false);
const etapaSelecionada = ref(null);
const funis = ref([]);

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
};

watch(
  () => props.isDrawerOpen,
  (val) => {
    if (val) {
      selecionados.value = [...(props.selectedIds || [])];
      moverNegocios.value = !!props.moverEtapaId;
      etapaSelecionada.value = props.moverEtapaId || null;
      carregarFunis();
    }
  }
);

const carregarFunis = async () => {
  try {
    const res = await $api("/calculadora/funis", { method: "GET" });
    funis.value = (res || []).map((f) => ({
      title: f.nome,
      value: f.id,
    }));
  } catch (err) {
    console.error("Erro ao buscar funis:", err);
  }
};

const toggleNegocio = (id) => {
  const idx = selecionados.value.indexOf(id);
  if (idx >= 0) {
    selecionados.value.splice(idx, 1);
  } else {
    selecionados.value.push(id);
  }
};

const confirmar = () => {
  emit("confirmed", {
    negociosIds: selecionados.value,
    moverEtapaId: moverNegocios.value ? etapaSelecionada.value : null,
  });
  closeDrawer();
};

const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);
</script>

<template>
  <VDialog
    :modelValue="props.isDrawerOpen"
    @update:modelValue="handleDrawer"
    max-width="550"
    persistent
  >
    <VCard v-if="props.isDrawerOpen">
      <VCardText class="pa-4">
        <AppDrawerHeaderSection
          customClass="px-0 pb-0 pt-3"
          title="Vincular Negócios ao Orçamento"
          @cancel="closeDrawer"
        />

        <p class="text-body-2 text-disabled mt-2 mb-3">
          Selecione os negócios do CRM para vincular a este orçamento.
        </p>

        <div v-if="props.negocios.length === 0" class="text-center py-4">
          <VIcon icon="tabler-briefcase-off" size="40" color="disabled" />
          <p class="text-body-2 text-disabled mt-2">
            Nenhum negócio ativo encontrado para este cliente.
          </p>
        </div>

        <div v-else>
          <VList dense>
            <VListItem
              v-for="neg in props.negocios"
              :key="neg.id"
              @click="toggleNegocio(neg.id)"
              :class="{ 'bg-primary-lighten-5': selecionados.includes(neg.id) }"
              class="rounded mb-1"
            >
              <template #prepend>
                <VCheckbox
                  :modelValue="selecionados.includes(neg.id)"
                  @update:modelValue="toggleNegocio(neg.id)"
                  hide-details
                  density="compact"
                />
              </template>
              <VListItemTitle class="text-body-2 font-weight-medium">
                {{ neg.title }}
              </VListItemTitle>
              <VListItemSubtitle class="d-flex gap-2 align-center mt-1">
                <span>{{ fmt(neg.valor) }}</span>
                <VChip
                  size="x-small"
                  color="info"
                  variant="tonal"
                  label
                >
                  {{ neg.etapa_nome || "Sem etapa" }}
                </VChip>
              </VListItemSubtitle>
            </VListItem>
          </VList>

          <VDivider class="my-3" />

          <div class="d-flex align-center gap-3">
            <VSwitch
              v-model="moverNegocios"
              label="Mover negócios selecionados para etapa"
              hide-details
              density="compact"
            />
          </div>

          <AppSelect
            v-if="moverNegocios"
            v-model="etapaSelecionada"
            :items="funis"
            item-title="title"
            item-value="value"
            label="Etapa destino"
            class="mt-3"
          />
        </div>

        <div class="d-flex flex-row align-center justify-end gap-3 mt-4">
          <VBtn variant="outlined" color="secondary" @click="closeDrawer">
            Cancelar
          </VBtn>
          <VBtn
            color="primary"
            @click="confirmar"
            :disabled="selecionados.length === 0"
          >
            Confirmar ({{ selecionados.length }})
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
