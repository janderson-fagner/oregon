<template>
  <div>
    <VRow>
      <VCol cols="12" md="6">
        <AppTextField
          v-model.number="config.delayValue"
          type="number"
          label="Tempo de espera"
          placeholder="0"
          hint="Tempo que o fluxo aguardará antes de continuar"
          persistent-hint
          min="0"
        />
      </VCol>
      <VCol cols="12" md="6">
        <AppSelect
          v-model="config.delayType"
          :items="timeTypes"
          label="Unidade de tempo"
          placeholder="Selecione"
        />
      </VCol>
    </VRow>

    <BlockInfoSection
      :items="[
        { icon: 'tabler-clock', color: 'primary', text: 'Pausa a execução do fluxo pelo tempo configurado' },
        { icon: 'tabler-hourglass', color: 'info', text: 'Útil para aguardar entre mensagens ou ações' },
        { icon: 'tabler-arrow-right', color: 'success', text: 'Após o tempo, continua automaticamente para o próximo bloco' }
      ]"
      hint="O delay é executado de forma assíncrona e não bloqueia outras execuções de fluxo"
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

const timeTypes = [
  { title: 'Segundos', value: 'seconds' },
  { title: 'Minutos', value: 'minutes' },
  { title: 'Horas', value: 'hours' },
  { title: 'Dias', value: 'days' }
];

// Inicializar config se estiver vazia
if (!props.config.delayValue && props.config.delayValue !== 0) {
  emit('update:config', {
    ...props.config,
    delayValue: 0,
    delayType: 'seconds'
  });
}

// Migrar formato antigo para novo
if (props.config.seconds !== undefined && props.config.delayValue === undefined) {
  emit('update:config', {
    ...props.config,
    delayValue: props.config.seconds,
    delayType: 'seconds'
  });
}
</script>

