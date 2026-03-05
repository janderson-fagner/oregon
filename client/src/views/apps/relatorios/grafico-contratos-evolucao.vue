<script setup>
import VueApexCharts from "vue3-apexcharts";
import { useTheme } from "vuetify";

const props = defineProps({ evolucao: { type: Array, default: () => [] } });
const vuetifyTheme = useTheme();

const categories = computed(() => props.evolucao.map(e => e.mes));
const series = computed(() => [
  { name: "Recebido", data: props.evolucao.map(e => e.recebido) },
  { name: "Pendente", data: props.evolucao.map(e => e.pendente) },
  { name: "Vencido", data: props.evolucao.map(e => e.vencido) },
]);

const chartOptions = computed(() => ({
  chart: { type: "bar", stacked: false, toolbar: { show: false } },
  plotOptions: { bar: { columnWidth: "50%", borderRadius: 4 } },
  colors: ["#28C76F", "#FF9F43", "#EA5455"],
  xaxis: { categories: categories.value, labels: { style: { colors: vuetifyTheme.current.value.dark ? "#ddd" : "#333" } } },
  yaxis: { labels: { formatter: (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0 }), style: { colors: vuetifyTheme.current.value.dark ? "#ddd" : "#333" } } },
  legend: { position: "top", labels: { colors: vuetifyTheme.current.value.dark ? "#ddd" : "#333" } },
  tooltip: { y: { formatter: (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) } },
  dataLabels: { enabled: false },
}));
</script>
<template>
  <VCard>
    <VCardText>
      <h5 class="text-h6 mb-4">Evolucao de Cobrancas</h5>
      <VueApexCharts v-if="evolucao.length > 0" type="bar" height="350" :options="chartOptions" :series="series" />
      <div v-else class="text-center py-8"><VIcon icon="tabler-chart-bar-off" size="40" color="disabled" /><p class="text-disabled mt-2 mb-0">Sem dados</p></div>
    </VCardText>
  </VCard>
</template>
