<script setup>
import modeloDialog from "@/views/apps/crm/modeloDialogEmail.vue";
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  email: {
    type: String,
    required: false,
    default: "",
  },
  modeloSelected: {
    type: Object,
    required: false,
    default: null,
  },
  flowVariables: {
    type: Array,
    default: () => []
  },
});

const emit = defineEmits(["update:email"]);

let refSelected = {
  name: "",
  content: {
    subject: "",
    html: null,
    json: null,
    css: null,
    inlinedHtml: null,
  },
};

const modelos = ref([]);
const loading = ref(false); 
const selectedModelo = ref(props.modeloSelected ?? refSelected);

const getTemplates = async () => {
  loading.value = true;

  try {
    const res = await $api("/templates", {
      method: "GET",
      query: {
        type: "email",
        itemsPerPage: 1000,
      },
    });

    if (!res) return;

    console.log("templates ress", res);

    modelos.value = res.templates;
  } catch (error) {
    console.error("Error fetching user data", error, error.response);

    modelos.value = [];
  }
  loading.value = false;
};

const viewModeloDialog = ref(false);

const openDialog = () => {
  viewModeloDialog.value = true;
  selectedModelo.value = refSelected;
};

const closeDialog = () => {
  viewModeloDialog.value = false;
  selectedModelo.value = refSelected;
};

watch(selectedModelo, (newVal) => {
  console.log("newVal", newVal);
  if(viewModeloDialog.value) return;
  emit("update:email", {
    content: newVal?.content,
    idModelo: newVal?.id,
  });
});

getTemplates();
</script>
<template>
  <div>
    <AppSelect
      v-model="selectedModelo"
      :items="modelos"
      item-value="id"
      item-title="name"
      label="Modelo de Email"
      placeholder="Selecione um modelo"
      return-object
    >
      <template #prepend-item>
        <div class="text-center">
          <VBtn
            variant="tonal"
            @click="openDialog"
            class="mx-2 mb-2"
            rounded="lg"
            style="width: 90%; height: 35px"
          >
            <VIcon icon="tabler-plus" />
            Novo Modelo
          </VBtn>
        </div>
      </template>
    </AppSelect>
  </div>

  <VDialog
    v-model="viewModeloDialog"
    persistent
    max-width="100%"
  >
    <VCard v-if="selectedModelo">
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pa-0"
          :title="selectedModelo?.id ? 'Editar Modelo' : 'Adicionar Modelo'"
          @cancel="closeDialog"
        />

        <VRow class="mt-3">
          <VCol cols="12">
            <AppTextField
              v-model="selectedModelo.name"
              label="Nome do modelo"
              placeholder="Ex.: Confirmação de pedido"
              :rules="[requiredValidator]"
              required
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="selectedModelo.content.subject"
              label="Assunto do email"
              placeholder="Ex.: Seu pedido foi confirmado"
              :rules="[requiredValidator]"
              required
            />
          </VCol>

          <VCol cols="12">
            <label
              class="v-label mb-1 text-body-2 text-high-emphasis"
              for="app-text-field-Nome do modelo-e601o"
            >
              Conteúdo do modelo
            </label>

            <VBtn
              class="ml-2"
              variant="tonal"
              color="primary"
              @click="selectedModelo.viewContent = !selectedModelo.viewContent"
            >
              {{
                selectedModelo.viewContent ? "Fechar editor" : "Abrir editor"
              }}
            </VBtn>
          </VCol>
        </VRow>

        <div class="d-flex flex-row gap-3 justify-center align-center mt-4">
          <VBtn
            color="primary"
            variant="tonal"
            @click="closeDialog"
            :disabled="loading"
          >
            <VIcon icon="tabler-x" class="me-2" />
            Cancelar
          </VBtn>

          <VBtn @click=" emit('update:email', {
            content: selectedModelo.content,
            idModelo: selectedModelo.id,
          });
          closeDialog();
          " 
          :loading="loading">
            <VIcon icon="tabler-check" class="me-2" />
            Salvar
          </VBtn>
        </div>
      </VCardText>
    </VCard>

    <modeloDialog
      v-if="selectedModelo?.viewContent"
      :variables="variaveisItens"
      :modelJson="selectedModelo.json"
      @save="
        selectedModelo.content = {
          ...selectedModelo.content,
          ...$event,
        };
        console.log($event);
        selectedModelo.viewContent = false;
      "
    />
  </VDialog>

  <!-- Variáveis Disponíveis -->
  <VariablesSection :flow-variables="props.flowVariables" />

  <!-- Informações -->
  <BlockInfoSection
    title="Como funciona"
    :items="[
      { icon: 'tabler-mail', color: 'primary', text: 'Envia um email ao cliente usando modelo pré-configurado' },
      { icon: 'tabler-template', color: 'info', text: 'Selecione ou crie modelos de email com editor visual' },
      { icon: 'tabler-variable', color: 'success', text: 'Suporta variáveis dinâmicas no assunto e conteúdo do email' },
      { icon: 'tabler-send', color: 'warning', text: 'O email é enviado automaticamente quando o fluxo chega neste bloco' },
    ]"
    hint="Configure os modelos de email em Configurações > Templates para reutilizá-los em diferentes fluxos."
  />
</template>
