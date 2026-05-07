<template>
  <div>
    <VRow>
      <VCol cols="12">
        <label class="v-label mb-1 text-body-2 text-high-emphasis">
          Instruções para a IA

          <VIcon
            icon="tabler-info-circle-filled"
            class="ml-1"
            color="primary"
          />

          <VTooltip activator="parent">
            <p
              class="text-sm mb-0 text-center"
              style="max-width: 400px"
            >
              Dê instruções claras para a IA decidir entre SIM ou NÃO baseado nas últimas 50 mensagens do cliente.
              <br />
              <br />
              Exemplos:
              <br />
              • "Se o cliente demonstrou interesse em agendar, responda SIM"
              <br />
              • "Se o cliente está reclamando ou insatisfeito, responda NÃO"
              <br />
              • "Se o cliente perguntou sobre preços, responda SIM"
            </p>
          </VTooltip>
        </label>
        
        <AppTextarea
          v-model="config.instructions"
          placeholder="Ex: Se o cliente demonstrou interesse em agendar um serviço ou fez perguntas sobre preços, responda SIM. Se o cliente está reclamando, cancelando ou demonstrou desinteresse, responda NÃO."
          active
          rows="4"
          auto-grow
          required
          :rules="[requiredValidator]"
        />
      </VCol>
    </VRow>

    <!-- Variáveis Disponíveis -->
    <VariablesSection :flow-variables="props.flowVariables" />

    <!-- Informações -->
    <BlockInfoSection
      title="Como funciona a Decisão IA"
      :items="[
        { icon: 'tabler-message-circle', color: 'primary', text: 'Analisa as últimas 50 mensagens do cliente' },
        { icon: 'tabler-brain', color: 'warning', text: 'Usa IA para entender o contexto e sentimento' },
        { icon: 'tabler-git-branch', color: 'success', text: 'Direciona o fluxo para SIM ou NÃO baseado na decisão' },
      ]"
      hint="A IA irá analisar o histórico de mensagens e decidir qual caminho seguir no fluxo."
    />
  </div>
</template>

<script setup>
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

// Inicializar config se estiver vazia
if (!props.config.instructions) {
  emit('update:config', {
    ...props.config,
    instructions: ''
  });
}
</script>
