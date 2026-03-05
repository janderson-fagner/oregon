<script setup>
const { setAlert } = useAlert();

const emit = defineEmits(["update:isDrawerOpen", "created"]);

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
  contratoId: { type: [Number, String], default: null },
});

const form = ref({
  valor: null,
  ciclo: "MONTHLY",
  billing_type: "Cartão",
  descricao: "",
  next_due_date: null,
});

const loading = ref(false);

const ciclosOptions = [
  { title: "Mensal", value: "MONTHLY" },
  { title: "Bimestral", value: "BIMONTHLY" },
  { title: "Trimestral", value: "QUARTERLY" },
  { title: "Semestral", value: "SEMIANNUALLY" },
  { title: "Anual", value: "YEARLY" },
];

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
  form.value = { valor: null, ciclo: "MONTHLY", billing_type: "Cartão", descricao: "", next_due_date: null };
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
  if (!val) closeDrawer();
};

const criar = async () => {
  if (!form.value.valor || !form.value.next_due_date) {
    setAlert("Valor e data do primeiro vencimento são obrigatórios", "warning", "tabler-alert-triangle", 3000);
    return;
  }
  loading.value = true;
  try {
    await $api(`/contratos/criar-assinatura/${props.contratoId}`, {
      method: "POST",
      body: form.value,
    });
    setAlert("Assinatura criada com sucesso!", "success", "tabler-check", 5000);
    emit("created");
    closeDrawer();
  } catch (err) {
    console.error("Erro ao criar assinatura:", err);
    setAlert(
      err?.response?._data?.message || "Erro ao criar assinatura",
      "error",
      "tabler-alert-triangle",
      5000
    );
  }
  loading.value = false;
};
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
          title="Nova Assinatura Recorrente"
          @cancel="closeDrawer"
        />

        <VRow class="mt-4" dense>
          <VCol cols="12">
            <Dinheiro v-model="form.valor" label="Valor da Parcela" />
          </VCol>

          <VCol cols="12">
            <AppSelect
              v-model="form.ciclo"
              :items="ciclosOptions"
              label="Ciclo de Cobrança"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="form.next_due_date"
              label="Data do Primeiro Vencimento"
              type="date"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="form.descricao"
              label="Descrição (opcional)"
              placeholder="Descrição da assinatura"
            />
          </VCol>
        </VRow>

        <div class="d-flex flex-row align-center justify-end gap-3 mt-4">
          <VBtn
            variant="outlined"
            color="secondary"
            :disabled="loading"
            @click="closeDrawer"
          >
            Cancelar
          </VBtn>
          <VBtn color="primary" :loading="loading" @click="criar">
            Criar Assinatura
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
