<template>
  <div>
    <VRow>
      <VCol cols="12" md="6">
        <AppTextField
          v-model.number="config.timeoutValue"
          type="number"
          label="Tempo máximo"
          placeholder="0 = sem timeout"
          hint="Deixe 0 para aguardar indefinidamente"
          persistent-hint
          min="0"
        />
      </VCol>
      <VCol cols="12" md="6">
        <AppSelect
          v-model="config.timeoutType"
          :items="timeTypes"
          label="Unidade de tempo"
          placeholder="Selecione"
        />
      </VCol>
    </VRow>

    <VDivider class="my-4" />
    
    <div class="mb-4">
      <h6 class="text-h6 mb-2">Capturar Variáveis da Resposta</h6>
      <p class="text-caption text-medium-emphasis mb-4">
        Configure quais informações devem ser extraídas da resposta do usuário
      </p>
    </div>

    <!-- Configuração manual de variáveis -->
    <div>
      <VRow>
        <VCol cols="12">
          <div class="d-flex justify-space-between align-center mb-3">
            <h6 class="text-h6 mb-0">Variáveis para Capturar</h6>
            <VBtn
              @click="addVariable"
              variant="tonal"
              color="primary"
              size="small"
              style="height: 30px"
            >
              <VIcon class="me-1" icon="tabler-plus" />
              Variável
            </VBtn>
          </div>
          
          <div
            v-for="(variable, index) in config.variables"
            :key="variable.id"
            class="v-row align-items-center mb-3"
          >
            <VCol cols="12" md="5">
              <AppTextField
                v-model="variable.name"
                label="Nome da Variável"
                placeholder="Ex: nome_cliente"
                required
                :rules="[requiredValidator]"
              />
            </VCol>
            
            <VCol cols="12" md="7" class="linha-flex align-end">
              <AppTextField
                v-model="variable.label"
                label="Rótulo (opcional)"
                placeholder="Ex: Nome do Cliente"
              />
         
              <IconBtn @click="removeVariable(index)" variant="tonal" color="error">
                <VIcon icon="tabler-trash" />
              </IconBtn>
            </VCol>
          </div>
          
          <div v-if="config.variables.length === 0" class="text-center py-4 text-medium-emphasis">
            <VIcon icon="tabler-info-circle" class="mb-2" size="48" />
            <p class="mb-0">Nenhuma variável configurada</p>
            <p class="text-caption mb-2">Adicione variáveis para capturar informações da resposta</p>
            <p class="text-caption font-weight-medium">
              Só adicione variáveis que tem certeza que o usuário irá responder corretamente
            </p>
          </div>
        </VCol>
      </VRow>
    </div>

    <VariablesSection :flow-variables="props.flowVariables || []" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-message-circle', color: 'primary', text: 'Aguarda uma resposta do usuário' },
        { icon: 'tabler-settings', color: 'info', text: 'Captura variáveis configuradas manualmente' },
        { icon: 'tabler-variable', color: 'success', text: 'Armazena as variáveis no contexto do fluxo' },
        { icon: 'tabler-arrow-right', color: 'primary', text: 'Continua o fluxo com as variáveis disponíveis' }
      ]"
      hint="As variáveis capturadas poderão ser usadas em blocos subsequentes como {{nome_cliente}}, etc."
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true
  },
  flowVariables: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:config']);

const timeTypes = [
  { title: 'Segundos', value: 'seconds' },
  { title: 'Minutos', value: 'minutes' },
  { title: 'Horas', value: 'hours' },
  { title: 'Dias', value: 'days' }
];

const addVariable = () => {
  const newVariable = {
    id: new Date().getTime(),
    name: '',
    label: ''
  };
  
  emit('update:config', {
    ...props.config,
    variables: [...(props.config.variables || []), newVariable]
  });
};

const removeVariable = (index) => {
  const newVariables = [...(props.config.variables || [])];
  newVariables.splice(index, 1);
  emit('update:config', {
    ...props.config,
    variables: newVariables
  });
};


// Inicializar config se estiver vazia
if (!props.config.timeoutValue && props.config.timeoutValue !== 0) {
  emit('update:config', {
    ...props.config,
    timeoutValue: 0,
    timeoutType: 'seconds',
    variables: []
  });
}

// Migrar formato antigo para novo
if (props.config.timeoutSeconds !== undefined && props.config.timeoutValue === undefined) {
  emit('update:config', {
    ...props.config,
    timeoutValue: props.config.timeoutSeconds,
    timeoutType: 'seconds',
    variables: props.config.variables || []
  });
}
</script>
