<script setup>
const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  contratoId: {
    type: Number,
    default: null,
  },
});

const emit = defineEmits(["update:isDrawerOpen", "created"]);

const { setAlert } = useAlert();

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
  resetForm();
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
  if (!val) resetForm();
};

const loading = ref(false);

const form = ref({
  valor: null,
  data_vencimento: null,
  forma_pagamento: "Todas",
  descricao: "",
});

const resetForm = () => {
  form.value = {
    valor: null,
    data_vencimento: null,
    forma_pagamento: "Todas",
    descricao: "",
  };
};

const criarCobranca = async () => {
  if (!props.contratoId) {
    setAlert("Salve o contrato antes de criar cobranças", "warning", "tabler-alert-triangle", 5000);
    return;
  }

  if (!form.value.valor || !form.value.data_vencimento) {
    setAlert("Valor e data de vencimento são obrigatórios", "warning", "tabler-alert-triangle", 5000);
    return;
  }

  loading.value = true;
  try {
    await $api(`/contratos/criar-cobranca/${props.contratoId}`, {
      method: "POST",
      body: form.value,
    });

    setAlert("Cobrança criada com sucesso!", "success", "tabler-check", 5000);
    emit("created");
    closeDrawer();
  } catch (err) {
    console.error("Erro ao criar cobrança:", err);
    setAlert(
      err?.response?._data?.message || "Erro ao criar cobrança. Tente novamente.",
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
          title="Nova Cobrança"
          @cancel="closeDrawer"
        />

        <VRow class="mt-2">
          <VCol cols="12" md="6">
            <Dinheiro
              v-model="form.valor"
              label="Valor"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model="form.data_vencimento"
              label="Data de Vencimento"
              type="date"
            />
          </VCol>

          <VCol cols="12">
            <AppSelect
              v-model="form.forma_pagamento"
              :items="['Todas', 'Boleto', 'Cartão', 'PIX']"
              label="Forma de Pagamento"
              placeholder="Forma de Pagamento"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="form.descricao"
              label="Descrição (opcional)"
              placeholder="Descrição da cobrança"
            />
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4">
          <VBtn
            variant="outlined"
            color="secondary"
            rounded="pill"
            :disabled="loading"
            @click="closeDrawer"
          >
            Cancelar
          </VBtn>

          <VBtn
            color="primary"
            rounded="pill"
            :loading="loading"
            @click="criarCobranca"
          >
            Criar Cobrança
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
