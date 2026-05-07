<template>
  <div>
    <!-- Aviso Principal -->
    <VAlert type="info" variant="tonal" class="mb-4">
      <span class="text-subtitle-2 font-weight-bold d-flex align-center">
        <VIcon icon="tabler-robot" class="me-2" size="18" />
        Criação de Agendamento com IA
      </span>
      <p class="mb-0">
        A IA coletará automaticamente todas as informações necessárias (serviço, data, horário, endereço) 
        e criará o agendamento de forma inteligente, verificando disponibilidade e precificação.
      </p>
    </VAlert>

    <!-- Ativação da IA -->
    <VCard variant="outlined" class="mb-4">
      <VCardText>
        <VSwitch
          :model-value="config.useIA !== false"
          @update:model-value="updateUseIA"
          label="Usar IA para gerenciar agendamento"
          color="primary"
          :disabled="true"
        />
        <div class="text-caption mt-2">
          <VIcon icon="tabler-info-circle" size="14" class="me-1" />
          Este bloco funciona exclusivamente com IA. A IA gerenciará todo o processo de agendamento.
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
          placeholder="Ex: Priorize agendamentos pela manhã, sempre confirme o endereço duas vezes, ofereça desconto para agendamentos em dia de semana..."
          rows="4"
          auto-grow
          hint="Estas instruções complementam as configurações gerais do GPT AI"
          persistent-hint
        />
      </VCardText>
    </VCard>

    <BlockInfoSection
      :items="[
        { icon: 'tabler-robot', color: 'primary', text: 'A IA coleta automaticamente todas as informações necessárias' },
        { icon: 'tabler-calendar-plus', color: 'success', text: 'Verifica disponibilidade e cria o agendamento' },
        { icon: 'tabler-calculator', color: 'info', text: 'Calcula preço baseado nas regras de precificação configuradas' },
        { icon: 'tabler-settings', color: 'secondary', text: 'Usa as configurações definidas em Configurações > GPT AI' }
      ]"
      hint="Este bloco criará um novo agendamento para o cliente atual no fluxo, utilizando o contexto completo do cliente."
    />
  </div>
</template>

<script setup>
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true
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
