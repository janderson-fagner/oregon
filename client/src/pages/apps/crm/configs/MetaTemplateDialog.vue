<script setup>
  const props = defineProps({
    modelValue: {
      type: Boolean,
      default: false,
    },
    conversationId: {
      type: [Number, String],
      default: null,
    },
  });

  const emit = defineEmits(["update:modelValue", "sent"]);

  const { setAlert } = useAlert();

  const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit("update:modelValue", v),
  });

  // Templates carregados
  const templates = ref([]);
  const loadingTemplates = ref(false);
  const erroTemplates = ref(false);
  const selectedTemplate = ref(null);

  // Parâmetros do template selecionado
  const bodyParams = ref([]);

  // Estado de envio
  const loadingEnviar = ref(false);

  // Regex para detectar placeholders {{1}}, {{2}}, etc.
  const placeholderRegex = /\{\{(\d+)\}\}/g;

  const carregarTemplates = async () => {
    loadingTemplates.value = true;
    erroTemplates.value = false;
    try {
      const res = await $api("/whatsapp/templates", { method: "GET" });
      templates.value = res?.templates || [];
    } catch {
      erroTemplates.value = true;
    } finally {
      loadingTemplates.value = false;
    }
  };

  // Extrai texto do componente BODY do template
  const getBodyText = (template) => {
    if (!template) return "";
    const bodyComp = template.components?.find((c) => c.type === "BODY");
    return bodyComp?.text || "";
  };

  // Detecta quantos placeholders o BODY possui
  const detectarParams = (template) => {
    if (!template) return [];
    const bodyText = getBodyText(template);
    const matches = [...bodyText.matchAll(placeholderRegex)];
    const indexes = [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
    return indexes.map((i) => ({ index: i, value: "" }));
  };

  // Preview do body com parâmetros substituídos
  const previewBody = computed(() => {
    if (!selectedTemplate.value) return "";
    let text = getBodyText(selectedTemplate.value);
    bodyParams.value.forEach((p) => {
      text = text.replace(new RegExp(`\\{\\{${p.index}\\}\\}`, "g"), p.value || `{{${p.index}}}`);
    });
    return text;
  });

  const selecionarTemplate = (tpl) => {
    selectedTemplate.value = tpl;
    bodyParams.value = detectarParams(tpl);
  };

  const enviar = async () => {
    if (!selectedTemplate.value || !props.conversationId) return;

    // Valida que todos os parâmetros foram preenchidos
    const vazio = bodyParams.value.find((p) => !p.value || p.value.trim() === "");
    if (vazio) {
      setAlert(`Preencha o parâmetro {{${vazio.index}}} antes de enviar.`, "error", "tabler-alert-triangle", 3000);
      return;
    }

    loadingEnviar.value = true;

    try {
      const components = [];
      if (bodyParams.value.length > 0) {
        components.push({
          type: "body",
          parameters: bodyParams.value.map((p) => ({ type: "text", text: p.value })),
        });
      }

      await $api("/whatsapp/templates/send", {
        method: "POST",
        body: {
          conversationId: props.conversationId,
          templateName: selectedTemplate.value.name,
          languageCode: selectedTemplate.value.language,
          ...(components.length > 0 ? { components } : {}),
        },
      });

      setAlert("Template enviado com sucesso!", "success", "tabler-check", 3000);
      emit("sent");
      visible.value = false;
    } catch (e) {
      setAlert(
        e?.response?._data?.message || "Erro ao enviar template.",
        "error",
        "tabler-alert-triangle",
        4000
      );
    } finally {
      loadingEnviar.value = false;
    }
  };

  const fechar = () => {
    visible.value = false;
  };

  // Carrega templates ao abrir o dialog
  watch(visible, (v) => {
    if (v) {
      selectedTemplate.value = null;
      bodyParams.value = [];
      carregarTemplates();
    }
  });
</script>

<template>
  <VDialog v-model="visible" max-width="640" scrollable>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          title="Enviar Template"
          @cancel="fechar"
        />

        <!-- Loading -->
        <div v-if="loadingTemplates" class="d-flex justify-center py-6">
          <VProgressCircular indeterminate color="primary" size="40" />
        </div>

        <!-- Erro -->
        <VAlert
          v-else-if="erroTemplates"
          type="error"
          variant="tonal"
          density="compact"
          icon="tabler-alert-triangle"
          class="my-4"
        >
          Não foi possível carregar os templates. Verifique as credenciais da API.
        </VAlert>

        <!-- Sem templates -->
        <div
          v-else-if="!loadingTemplates && templates.length === 0"
          class="text-center py-6 text-disabled"
        >
          <VIcon icon="tabler-template" size="48" class="mb-2" />
          <p class="mb-0">Nenhum template disponível.</p>
          <p class="text-caption">Crie templates aprovados no Facebook Business Manager.</p>
        </div>

        <template v-else>
          <!-- Lista de templates -->
          <div v-if="!selectedTemplate">
            <p class="text-caption text-disabled mb-3 mt-4">Selecione um template para enviar:</p>
            <div class="d-flex flex-column gap-2">
              <VCard
                v-for="tpl in templates"
                :key="tpl.name + tpl.language"
                class="cursor-pointer template-card"
                variant="outlined"
                @click="selecionarTemplate(tpl)"
              >
                <VCardText class="pa-3">
                  <div class="d-flex align-center justify-space-between mb-1">
                    <span class="font-weight-medium text-body-2">{{ tpl.name }}</span>
                    <div class="d-flex gap-1">
                      <VChip size="x-small" color="primary" variant="tonal" label>{{ tpl.language }}</VChip>
                      <VChip size="x-small" color="secondary" variant="tonal" label>{{ tpl.category }}</VChip>
                    </div>
                  </div>
                  <p class="text-caption text-disabled mb-0 text-truncate">
                    {{ getBodyText(tpl) || "—" }}
                  </p>
                </VCardText>
              </VCard>
            </div>
          </div>

          <!-- Configuração do template selecionado -->
          <div v-else class="mt-4">
            <div class="d-flex align-center gap-2 mb-4">
              <IconBtn size="small" @click="selectedTemplate = null; bodyParams = []">
                <VIcon icon="tabler-arrow-left" />
              </IconBtn>
              <div>
                <p class="mb-0 font-weight-medium">{{ selectedTemplate.name }}</p>
                <p class="mb-0 text-caption text-disabled">{{ selectedTemplate.language }} · {{ selectedTemplate.category }}</p>
              </div>
            </div>

            <!-- Parâmetros do body -->
            <div v-if="bodyParams.length > 0" class="mb-4">
              <p class="text-caption text-disabled mb-2">Parâmetros do corpo da mensagem:</p>
              <VRow>
                <VCol
                  v-for="param in bodyParams"
                  :key="param.index"
                  cols="12"
                  sm="6"
                >
                  <AppTextField
                    v-model="param.value"
                    :label="`Parâmetro {{${param.index}}}`"
                    :placeholder="`Valor para {{${param.index}}}`"
                  />
                </VCol>
              </VRow>
            </div>

            <!-- Preview -->
            <p class="text-caption text-disabled mb-2">Preview:</p>
            <div class="preview-box mb-4">
              <p class="mb-0 text-body-2" style="white-space: pre-wrap; word-break: break-word;">{{ previewBody || "—" }}</p>
            </div>
          </div>
        </template>

        <!-- Ações -->
        <div class="d-flex flex-row align-center justify-end gap-2 mt-4" v-if="selectedTemplate">
          <VBtn variant="outlined" color="secondary" @click="fechar" :disabled="loadingEnviar">
            Cancelar
          </VBtn>
          <VBtn color="primary" @click="enviar" :loading="loadingEnviar">
            <VIcon icon="tabler-send" class="mr-1" />
            Enviar template
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.template-card:hover {
  border-color: rgb(var(--v-theme-primary)) !important;
  background: rgba(var(--v-theme-primary), 0.04);
}
.preview-box {
  background: rgba(var(--v-theme-surface-variant), 0.5);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  padding: 12px 16px;
  min-height: 48px;
}
</style>
