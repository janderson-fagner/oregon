<script setup>
import { useAlert } from "@/composables/useAlert";
import IconPicker from "@/@core/components/IconPicker.vue";

const loading = ref(false);
const { setAlert } = useAlert();

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
  topicData: { type: Object, default: null },
});

const emit = defineEmits(["update:isDrawerOpen", "saved"]);

const refData = {
  id: null,
  nome: "",
  icone: "",
  descricao: "",
  ordem: 0,
};

const form = ref({ ...refData });

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
  form.value = { ...refData };
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
  if (!val) form.value = { ...refData };
};

watch(
  () => props.topicData,
  (newVal) => {
    if (newVal?.id) {
      form.value = { ...newVal };
      // Garante que icone está sem prefixo "tabler-" para o IconPicker
      if (form.value.icone && form.value.icone.startsWith('tabler-')) {
        form.value.icone = form.value.icone.replace('tabler-', '');
      }
    } else {
      form.value = { ...refData };
    }
  },
  { immediate: true }
);

const salvar = async () => {
  if (!form.value.nome) {
    setAlert("Nome é obrigatório", "warning", "tabler-alert-triangle", 3000);
    return;
  }
  loading.value = true;
  try {
    // Salva com prefixo tabler- para compatibilidade
    const payload = {
      ...form.value,
      icone: form.value.icone ? `tabler-${form.value.icone}` : '',
    };
    if (form.value.id) {
      await $api(`/help-center/admin/topics/${form.value.id}`, {
        method: "PUT",
        body: payload,
      });
      setAlert("Tópico atualizado!", "success", "tabler-check", 3000);
    } else {
      await $api("/help-center/admin/topics", {
        method: "POST",
        body: payload,
      });
      setAlert("Tópico criado!", "success", "tabler-check", 3000);
    }
    emit("saved");
    closeDrawer();
  } catch (err) {
    console.error("Erro ao salvar tópico:", err);
    setAlert("Erro ao salvar tópico", "error", "tabler-alert-triangle", 5000);
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
          :title="form.id ? 'Editar Tópico' : 'Novo Tópico'"
          @cancel="closeDrawer"
        />

        <VRow class="mt-4">
          <VCol cols="12">
            <AppTextField
              v-model="form.nome"
              label="Nome do Tópico"
              placeholder="Ex: Agendamentos"
            />
          </VCol>
          <VCol cols="12">
            <IconPicker v-model="form.icone" />
          </VCol>
          <VCol cols="12">
            <AppTextField
              v-model="form.descricao"
              label="Descrição"
              placeholder="Breve descrição do tópico"
            />
          </VCol>
          <VCol cols="6">
            <AppTextField
              v-model.number="form.ordem"
              label="Ordem"
              type="number"
              placeholder="0"
            />
          </VCol>
        </VRow>

        <div class="d-flex flex-row align-center justify-end gap-3 mt-4">
          <VBtn variant="outlined" color="secondary" :disabled="loading" @click="closeDrawer">
            Cancelar
          </VBtn>
          <VBtn color="primary" :loading="loading" @click="salvar">
            {{ form.id ? "Atualizar" : "Salvar" }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
