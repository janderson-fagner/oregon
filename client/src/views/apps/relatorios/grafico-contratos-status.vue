<script setup>
import VueApexCharts from "vue3-apexcharts";
import { useTheme } from "vuetify";

const props = defineProps({ statusContratos: { type: Array, default: () => [] } });
const vuetifyTheme = useTheme();

const statusLabels = { rascunho: "Rascunho", assinado_empresa: "Assinado Empresa", assinado_cliente: "Assinado Cliente", ativo: "Ativo", cancelado: "Cancelado" };

const series = computed(() => props.statusContratos.map(s => s.quantidade));
const labels = computed(() => props.statusContratos.map(s => statusLabels[s.status] || s.status));

const chartOptions = computed(() => ({
  chart: { type: "donut" },
  labels: labels.value,
  colors: ["#A8AAAE", "#00CFE8", "#00CFE8", "#28C76F", "#EA5455"],
  legend: { position: "bottom", labels: { colors: vuetifyTheme.current.value.dark ? "#ddd" : "#333" } },
  plotOptions: { pie: { donut: { labels: { show: true, total: { show: true, label: "Total", formatter: (w) => w.globals.seriesTotals.reduce((a, b) => a + b, 0) } } } } },
  dataLabels: { enabled: true },
}));
</script>
<template>
  <VCard>
    <VCardText>
      <h5 class="text-h6 mb-4">Contratos por Status</h5>
      <VueApexCharts v-if="statusContratos.length > 0" type="donut" height="300" :options="chartOptions" :series="series" />
      <div v-else class="text-center py-8"><VIcon icon="tabler-chart-pie-off" size="40" color="disabled" /><p class="text-disabled mt-2 mb-0">Sem dados</p></div>
    </VCardText>
  </VCard>
</template>
