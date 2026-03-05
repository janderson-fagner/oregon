<script setup>
import VueApexCharts from "vue3-apexcharts";

const props = defineProps({
  funil: { type: Object, default: () => ({}) },
});

const chartOptions = computed(() => ({
  chart: { type: "bar", toolbar: { show: false } },
  plotOptions: { bar: { horizontal: true, barHeight: "50%", borderRadius: 4 } },
  dataLabels: { enabled: true, formatter: (v) => v },
  xaxis: { categories: ["Gerados", "Enviados", "Aceitos"] },
  colors: ["#2196F3", "#FF9800", "#4CAF50"],
  tooltip: { y: { formatter: (v) => `${v} orçamentos` } },
}));

const series = computed(() => [
  { name: "Orçamentos", data: [props.funil.gerados || 0, props.funil.enviados || 0, props.funil.aceitos || 0] },
]);
</script>

<template>
  <VCard>
    <VCardText>
      <h3 class="text-h6 mb-2">
        <VIcon icon="tabler-filter" class="mr-2" />
        Funil de Conversão
      </h3>
      <div class="d-flex gap-4 mb-3">
        <VChip size="small" color="info" variant="tonal">
          Gerado→Enviado: {{ funil.taxa_gerado_enviado || 0 }}%
        </VChip>
        <VChip size="small" color="success" variant="tonal">
          Enviado→Aceito: {{ funil.taxa_enviado_aceito || 0 }}%
        </VChip>
      </div>
      <VueApexCharts type="bar" height="200" :options="chartOptions" :series="series" />
    </VCardText>
  </VCard>
</template>
