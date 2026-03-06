<script setup>
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { useAlert } from "@/composables/useAlert";

const { setAlert } = useAlert();
const loading = ref(false);
const quillRef = ref(null);

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true },
  postData: { type: Object, default: null },
  topics: { type: Array, default: () => [] },
  subtopics: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:isDrawerOpen", "saved"]);

const refData = {
  id: null,
  titulo: "",
  conteudo_html: "",
  topic_id: null,
  subtopic_id: null,
  status: "draft",
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
  () => props.postData,
  (newVal) => {
    if (newVal?.id) {
      form.value = {
        id: newVal.id,
        titulo: newVal.titulo,
        conteudo_html: newVal.conteudo_html,
        topic_id: newVal.topic_id,
        subtopic_id: newVal.subtopic_id,
        status: newVal.status,
        ordem: newVal.ordem,
      };
    } else {
      form.value = { ...refData };
    }
  },
  { immediate: true }
);

const topicOptions = computed(() =>
  props.topics.map((t) => ({ title: t.nome, value: t.id }))
);

const filteredSubtopics = computed(() => {
  if (!form.value.topic_id) return [];
  return props.subtopics
    .filter((s) => s.topic_id === form.value.topic_id)
    .map((s) => ({ title: s.nome, value: s.id }));
});

const statusOptions = [
  { title: "Rascunho", value: "draft" },
  { title: "Publicado", value: "published" },
];

// Handler customizado para upload de imagem no Quill
const imageHandler = () => {
  const input = document.createElement("input");
  input.setAttribute("type", "file");
  input.setAttribute("accept", "image/*");
  input.click();

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await $api("/help-center/admin/upload-image", {
        method: "POST",
        body: formData,
      });

      if (res?.url) {
        const quill = quillRef.value?.getQuill();
        if (quill) {
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, "image", res.url);
        }
      }
    } catch (err) {
      console.error("Erro ao fazer upload:", err);
      setAlert("Erro ao fazer upload da imagem", "error", "tabler-alert-triangle", 3000);
    }
  };
};

const toolbarOptions = {
  container: [
    [{ header: 1 }, { header: 2 }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["blockquote", "link", "image"],
    ["clean"],
  ],
  handlers: {
    image: imageHandler,
  },
};

// Limpar subtopic_id quando tópico muda
watch(() => form.value.topic_id, () => {
  form.value.subtopic_id = null;
});

const salvar = async () => {
  if (!form.value.titulo) {
    setAlert("Título é obrigatório", "warning", "tabler-alert-triangle", 3000);
    return;
  }
  loading.value = true;
  try {
    if (form.value.id) {
      await $api(`/help-center/admin/posts/${form.value.id}`, {
        method: "PUT",
        body: form.value,
      });
      setAlert("Post atualizado!", "success", "tabler-check", 3000);
    } else {
      await $api("/help-center/admin/posts", {
        method: "POST",
        body: form.value,
      });
      setAlert("Post criado!", "success", "tabler-check", 3000);
    }
    emit("saved");
    closeDrawer();
  } catch (err) {
    console.error("Erro ao salvar post:", err);
    setAlert("Erro ao salvar post", "error", "tabler-alert-triangle", 5000);
  }
  loading.value = false;
};
</script>

<template>
  <VDialog
    :modelValue="props.isDrawerOpen"
    @update:modelValue="handleDrawer"
    max-width="900"
    persistent
  >
    <VCard v-if="props.isDrawerOpen">
      <VCardText class="pa-4">
        <AppDrawerHeaderSection
          customClass="px-0 pb-0 pt-3"
          :title="form.id ? 'Editar Post' : 'Novo Post'"
          @cancel="closeDrawer"
        />

        <VRow class="mt-4">
          <VCol cols="12">
            <AppTextField
              v-model="form.titulo"
              label="Título"
              placeholder="Título do artigo"
            />
          </VCol>

          <VCol cols="12" md="4">
            <AppSelect
              v-model="form.topic_id"
              :items="topicOptions"
              label="Tópico"
              placeholder="Selecione"
              clearable
            />
          </VCol>

          <VCol cols="12" md="4">
            <AppSelect
              v-model="form.subtopic_id"
              :items="filteredSubtopics"
              label="Subtópico"
              placeholder="Selecione"
              clearable
              :disabled="!form.topic_id"
            />
          </VCol>

          <VCol cols="6" md="2">
            <AppSelect
              v-model="form.status"
              :items="statusOptions"
              label="Status"
            />
          </VCol>

          <VCol cols="6" md="2">
            <AppTextField
              v-model.number="form.ordem"
              label="Ordem"
              type="number"
              placeholder="0"
            />
          </VCol>

          <VCol cols="12">
            <p class="text-body-2 mb-2">Conteúdo</p>
            <QuillEditor
              ref="quillRef"
              v-model:content="form.conteudo_html"
              theme="snow"
              :toolbar="toolbarOptions"
              class="inputQuill"
              contentType="html"
              placeholder="Escreva o conteúdo do artigo aqui..."
              style="min-height: 300px;"
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
