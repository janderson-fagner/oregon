<script setup>
import { useAlert } from "@/composables/useAlert";

const loading = ref(false);
const { setAlert } = useAlert();

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
  subtopicData: { type: Object, default: null },
  topics: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:isDrawerOpen", "saved"]);

const refData = {
  id: null,
  nome: "",
  topic_id: null,
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
  () => props.subtopicData,
  (newVal) => {
    if (newVal?.id) {
      form.value = { ...newVal };
    } else {
      form.value = { ...refData };
    }
  },
  { immediate: true }
);

const topicOptions = computed(() =>
  props.topics.map((t) => ({ title: t.nome, value: t.id }))
);

const salvar = async () => {
  if (!form.value.nome) {
    setAlert("Nome é obrigatório", "warning", "tabler-alert-triangle", 3000);
    return;
  }
  if (!form.value.topic_id) {
    setAlert("Tópico pai é obrigatório", "warning", "tabler-alert-triangle", 3000);
    return;
  }
  loading.value = true;
  try {
    if (form.value.id) {
      await $api(`/help-center/admin/subtopics/${form.value.id}`, {
        method: "PUT",
        body: form.value,
      });
      setAlert("Subtópico atualizado!", "success", "tabler-check", 3000);
    } else {
      await $api("/help-center/admin/subtopics", {
        method: "POST",
        body: form.value,
      });
      setAlert("Subtópico criado!", "success", "tabler-check", 3000);
    }
    emit("saved");
    closeDrawer();
  } catch (err) {
    console.error("Erro ao salvar subtópico:", err);
    setAlert("Erro ao salvar subtópico", "error", "tabler-alert-triangle", 5000);
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
          :title="form.id ? 'Editar Subtópico' : 'Novo Subtópico'"
          @cancel="closeDrawer"
        />

        <VRow class="mt-4">
          <VCol cols="12">
            <AppTextField
              v-model="form.nome"
              label="Nome do Subtópico"
              placeholder="Ex: Como agendar um serviço"
            />
          </VCol>
          <VCol cols="12">
            <AppSelect
              v-model="form.topic_id"
              :items="topicOptions"
              label="Tópico Pai"
              placeholder="Selecione o tópico"
            />
          </VCol>
          <VCol cols="12">
            <AppTextField
              v-model="form.descricao"
              label="Descrição"
              placeholder="Breve descrição do subtópico"
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
