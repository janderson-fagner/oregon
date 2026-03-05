<script setup>
import { temaAtual } from "@core/stores/config";

const props = defineProps({
  modelValue: Boolean,
  plano: Object
});

const emit = defineEmits(['update:modelValue', 'save']);

// Dados do formulário
const formData = ref({
  id: null,
  nome: '',
  descricao: '',
  valor_mensal: 0,
  tags: [],
  features: {
    qtdFuncionarios: 5,
    gerenciamentoEstoque: false,
    acessoCRM: false,
    acessoCalculadora: false
  },
  dias_teste: 0,
  ativo: true,
  ordem: 0
});

const newTag = ref('');

// Dialog visibility
const isDialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

// Reset form
const resetForm = () => {
  formData.value = {
    id: null,
    nome: '',
    descricao: '',
    valor_mensal: 0,
    tags: [],
    features: {
      qtdFuncionarios: 5,
      gerenciamentoEstoque: false,
      acessoCRM: false,
      acessoCalculadora: false
    },
    dias_teste: 0,
    ativo: true,
    ordem: 0
  };
};


// Watch para preencher o form quando receber plano para edição
watch(() => props.plano, (newPlano) => {
  if (newPlano) {
    formData.value = {
      id: newPlano.id,
      nome: newPlano.nome || '',
      descricao: newPlano.descricao || '',
      valor_mensal: newPlano.valor_mensal || 0,
      tags: newPlano.tags || [],
      features: newPlano.features || {
        qtdFuncionarios: 5,
        gerenciamentoEstoque: false,
        acessoCRM: false,
        acessoCalculadora: false
      },
      dias_teste: newPlano.dias_teste || 0,
      ativo: newPlano.ativo !== undefined ? (newPlano.ativo === 1 || newPlano.ativo === true) : true,
      ordem: newPlano.ordem || 0
    };
  } else {
    resetForm();
  }
}, { immediate: true });

// Adicionar tag
const addTag = () => {
  const tag = newTag.value.trim();
  if (tag && !formData.value.tags.includes(tag)) {
    formData.value.tags.push(tag);
    newTag.value = '';
  }
};

// Remover tag
const removeTag = (index) => {
  formData.value.tags.splice(index, 1);
};

// Salvar
const save = () => {
  // Converte ativo para 1/0 para o backend
  const dataToSave = {
    ...formData.value,
    ativo: formData.value.ativo ? 1 : 0
  };
  emit('save', dataToSave);
};

// Fechar
const close = () => {
  isDialogVisible.value = false;
  resetForm();
};
</script>

<template>
  <VDialog v-model="isDialogVisible" max-width="600" persistent>
    <VCard v-if="isDialogVisible">
      <VCardText class="pa-4">
        <AppDrawerHeaderSection
          customClass="px-0 pb-0 pt-3"
          :title="formData.id ? 'Editar Plano' : 'Novo Plano'"
          @cancel="close"
        />

        <VRow class="mt-2">
          <!-- Nome do Plano -->
          <VCol cols="12">
            <AppTextField
              v-model="formData.nome"
              label="Nome do Plano *"
              placeholder="Ex: Plano Básico"
              :rules="[requiredValidator]"
              required
            />
          </VCol>

          <!-- Valor Mensal -->
          <VCol cols="12" md="6">
            <Dinheiro
              v-model="formData.valor_mensal"
              label="Valor Mensal *"
            />
          </VCol>

          <!-- Dias de Teste -->
          <VCol cols="12" md="6">
            <AppTextField
              v-model.number="formData.dias_teste"
              label="Dias de Teste Grátis"
              type="number"
              min="0"
            />
          </VCol>

          <!-- Descrição -->
          <VCol cols="12">
            <AppTextarea
              v-model="formData.descricao"
              label="Descrição"
              placeholder="Descrição do plano"
              rows="2"
              auto-grow
            />
          </VCol>

          <!-- Recursos do Plano -->
          <VCol cols="12">
            <VExpansionPanels>
              <VExpansionPanel
                title="Recursos do Plano"
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
              >
                <VExpansionPanelText class="pt-4">
                  <VRow>
                    <VCol cols="12" md="6">
                      <AppTextField
                        v-model.number="formData.features.qtdFuncionarios"
                        label="Qtd. Máxima de Funcionários"
                        type="number"
                        min="1"
                      />
                    </VCol>

                    <VCol cols="12" md="6">
                      <VSwitch
                        v-model="formData.features.gerenciamentoEstoque"
                        label="Gerenciamento de Estoque"
                        color="primary"
                      />
                    </VCol>

                    <VCol cols="12" md="6">
                      <VSwitch
                        v-model="formData.features.acessoCRM"
                        label="Acesso ao CRM"
                        color="primary"
                      />
                    </VCol>

                    <VCol cols="12" md="6">
                      <VSwitch
                        v-model="formData.features.acessoCalculadora"
                        label="Calculadora Avançada"
                        color="primary"
                      />
                    </VCol>
                  </VRow>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </VCol>

          <!-- Tags -->
          <VCol cols="12">
            <VExpansionPanels>
              <VExpansionPanel
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
              >
                <VExpansionPanelTitle>
                  Tags ({{ formData.tags?.length || 0 }})
                </VExpansionPanelTitle>
                <VExpansionPanelText class="pt-4">
                  <div class="d-flex gap-2 mb-3">
                    <AppTextField
                      v-model="newTag"
                      label="Adicionar Tag"
                      placeholder="Ex: Popular, Recomendado"
                      @keyup.enter="addTag"
                    />
                    <VBtn
                      color="primary"
                      variant="tonal"
                      @click="addTag"
                      class="align-self-end"
                      size="small"
                      style="height: 40px"
                    >
                      <VIcon icon="tabler-plus" />
                    </VBtn>
                  </div>
                  <div class="d-flex flex-wrap gap-2" v-if="formData.tags?.length">
                    <VChip
                      v-for="(tag, index) in formData.tags"
                      :key="index"
                      closable
                      color="primary"
                      variant="tonal"
                      @click:close="removeTag(index)"
                    >
                      {{ tag }}
                    </VChip>
                  </div>
                  <p v-else class="text-medium-emphasis text-sm mb-0">
                    Nenhuma tag adicionada
                  </p>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </VCol>

          <!-- Configurações -->
          <VCol cols="12" md="6">
            <AppTextField
              v-model.number="formData.ordem"
              label="Ordem de Exibição"
              type="number"
              min="0"
            />
          </VCol>

          <VCol cols="12" md="6" class="d-flex align-center">
            <VSwitch
              v-model="formData.ativo"
              :label="formData.ativo ? 'Plano Ativo' : 'Plano Inativo'"
              :color="formData.ativo ? 'success' : 'error'"
            />
          </VCol>
        </VRow>

        <div class="d-flex flex-row align-center justify-end gap-3 mt-4">
          <VBtn
            variant="outlined"
            color="secondary"
            rounded="pill"
            @click="close"
          >
            Cancelar
          </VBtn>
          <VBtn
            color="primary"
            rounded="pill"
            @click="save"
          >
            Salvar Plano
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
