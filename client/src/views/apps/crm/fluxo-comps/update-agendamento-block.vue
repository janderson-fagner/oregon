<template>
  <div>
    <!-- Aviso Principal -->
    <VAlert type="info" variant="tonal" class="mb-4">
      <span class="text-subtitle-2 font-weight-bold d-flex align-center">
        <VIcon icon="tabler-robot" class="me-2" size="18" />
        Atualização de Agendamento com IA
      </span>
      <p class="mb-0">
        A IA identificará automaticamente qual agendamento o cliente deseja atualizar e coletará 
        as informações necessárias para realizar as alterações (reagendamento, mudança de serviço, etc).
      </p>
    </VAlert>

    <!-- Ativação da IA -->
    <VCard variant="outlined" class="mb-4">
      <VCardText>
        <VSwitch
          :model-value="config.useIA !== false"
          @update:model-value="updateUseIA"
          label="Usar IA para gerenciar atualização"
          color="primary"
          :disabled="true"
        />
        <div class="text-caption mt-2">
          <VIcon icon="tabler-info-circle" size="14" class="me-1" />
          Este bloco funciona exclusivamente com IA. A IA gerenciará todo o processo de atualização.
        </div>
      </VCardText>
    </VCard>

    <!-- Instruções Específicas -->
    <VCard variant="outlined" class="mb-4">
      <VCardText>
        <h6 class="text-subtitle-1 mb-3">
          <VIcon icon="tabler-message-cog" class="me-1" />
          Instruções Específicas para a IA
        </h6>
        
        <AppTextarea
          :model-value="config.instrucoesIA || ''"
          @update:model-value="updateInstrucoesIA"
          label="Instruções Adicionais"
          placeholder="Ex: Sempre verifique se há taxas de remarcação, confirme a disponibilidade antes de sugerir nova data..."
          rows="4"
          auto-grow
          hint="Estas instruções complementam as configurações gerais do GPT AI"
          persistent-hint
        />
      </VCardText>
    </VCard>

    <!-- Variáveis Disponíveis -->
    <VariablesSection :flow-variables="props.flowVariables" />

    <!-- Informações -->
    <BlockInfoSection
      title="Como funciona"
      :items="[
        { icon: 'tabler-search', color: 'primary', text: 'Identifica automaticamente o agendamento do cliente no contexto' },
        { icon: 'tabler-edit', color: 'info', text: 'Coleta as mudanças desejadas (reagendar, mudar serviço, alterar endereço, cancelar)' },
        { icon: 'tabler-calendar-event', color: 'warning', text: 'Verifica disponibilidade e recalcula preço se necessário' },
        { icon: 'tabler-check', color: 'success', text: 'Confirma alterações com o cliente antes de atualizar' },
        { icon: 'tabler-refresh', color: 'success', text: 'Atualiza o agendamento após confirmação do cliente' },
      ]"
      hint="Este bloco atualizará um agendamento existente do cliente no fluxo, utilizando o contexto completo (agendamentos ativos, histórico, disponibilidade)."
    />
  </div>
</template>

<script setup>
import VariablesSection from './VariablesSection.vue'
import BlockInfoSection from './BlockInfoSection.vue'

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

// Sempre forçar useIA como true
const updateUseIA = (value) => {
  emit('update:config', {
    ...props.config,
    useIA: true // Sempre true
  });
};

const updateInstrucoesIA = (value) => {
  emit('update:config', {
    ...props.config,
    instrucoesIA: value
  });
};

// Inicializar config se estiver vazia ou forçar useIA
if (!props.config.useIA) {
  emit('update:config', {
    ...props.config,
    useIA: true,
    instrucoesIA: props.config.instrucoesIA || ''
  });
}
</script>
