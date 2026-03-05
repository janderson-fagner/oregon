<script setup>
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";

const toolbarOptions = [
  [{ header: 1 }, { header: 2 }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  ["blockquote"],
  ["clean"],
];

const tiposModelo = [
  { title: "Geral", value: "geral" },
  { title: "Limpeza", value: "limpeza" },
  { title: "Desinsetização", value: "desinsetizacao" },
  { title: "Higienização", value: "higienizacao" },
  { title: "Manutenção", value: "manutencao" },
  { title: "Outro", value: "outro" },
];

const { setAlert } = useAlert();

const emit = defineEmits(["update:isDrawerOpen", "saved"]);

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
  modeloData: { type: Object, default: null },
});

const refData = {
  id: null,
  titulo: null,
  descricao: null,
  tipo: "geral",
  conteudo_html: null,
};

const form = ref({ ...refData });
const loading = ref(false);

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
  form.value = { ...refData };
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
  if (!val) form.value = { ...refData };
};

watch(
  () => props.modeloData,
  (newVal) => {
    if (newVal?.id) {
      form.value = {
        id: newVal.id,
        titulo: newVal.titulo,
        descricao: newVal.descricao,
        tipo: newVal.tipo || "geral",
        conteudo_html: newVal.conteudo_html,
      };
    } else {
      form.value = { ...refData };
    }
  },
  { immediate: true }
);

const salvar = async () => {
  if (!form.value.titulo) {
    setAlert("Título é obrigatório", "warning", "tabler-alert-triangle", 3000);
    return;
  }
  loading.value = true;
  try {
    if (form.value.id) {
      await $api(`/orcamento-modelos/update/${form.value.id}`, {
        method: "PUT",
        body: form.value,
      });
      setAlert("Modelo atualizado!", "success", "tabler-check", 3000);
    } else {
      const res = await $api("/orcamento-modelos/create", {
        method: "POST",
        body: form.value,
      });
      form.value.id = res.id;
      setAlert("Modelo criado!", "success", "tabler-check", 3000);
    }
    emit("saved");
    closeDrawer();
  } catch (err) {
    console.error("Erro ao salvar modelo:", err);
    setAlert("Erro ao salvar modelo", "error", "tabler-alert-triangle", 5000);
  }
  loading.value = false;
};
</script>

<template>
  <VDialog
    :modelValue="props.isDrawerOpen"
    @update:modelValue="handleDrawer"
    max-width="750"
    persistent
  >
    <VCard v-if="props.isDrawerOpen">
      <VCardText class="pa-4">
        <AppDrawerHeaderSection
          customClass="px-0 pb-0 pt-3"
          :title="form.id ? 'Editar Modelo de Orçamento' : 'Novo Modelo de Orçamento'"
          @cancel="closeDrawer"
        />

        <VRow class="mt-4">
          <VCol cols="12" md="8">
            <AppTextField
              v-model="form.titulo"
              label="Título do Modelo"
              placeholder="Ex: Orçamento de Limpeza Residencial"
            />
          </VCol>

          <VCol cols="12" md="4">
            <AppSelect
              v-model="form.tipo"
              label="Tipo"
              :items="tiposModelo"
              item-title="title"
              item-value="value"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="form.descricao"
              label="Descrição (opcional)"
              placeholder="Breve descrição do modelo..."
            />
          </VCol>

          <VCol cols="12">
            <p class="text-body-2 mb-2">
              Conteúdo do Modelo
              <span class="text-disabled text-caption ml-2">
                Variáveis: &#123;&#123;cliente_nome&#125;&#125;, &#123;&#123;valor_total&#125;&#125;, &#123;&#123;data_hoje&#125;&#125;, &#123;&#123;validade_dias&#125;&#125;, &#123;&#123;orcamento_id&#125;&#125;
              </span>
            </p>
            <QuillEditor
              v-model:content="form.conteudo_html"
              theme="snow"
              :toolbar="toolbarOptions"
              class="inputQuill"
              contentType="html"
              placeholder="Escreva o conteúdo do modelo aqui. Use variáveis como {{cliente_nome}} para personalizar..."
              style="min-height: 300px;"
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
          <VBtn color="primary" :loading="loading" @click="salvar">
            {{ form.id ? "Atualizar" : "Salvar" }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
