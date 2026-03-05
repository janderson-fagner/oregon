<script setup>
import VueApexCharts from "vue3-apexcharts";

const props = defineProps({
  evolucao: { type: Array, default: () => [] },
});

const chartOptions = computed(() => ({
  chart: { type: "area", toolbar: { show: false }, zoom: { enabled: false } },
  dataLabels: { enabled: false },
  stroke: { curve: "smooth", width: 2 },
  xaxis: {
    categories: props.evolucao.map((e) => {
      const d = new Date(e.data + "T00:00:00");
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }),
  },
  yaxis: [
    { title: { text: "Quantidade" }, min: 0 },
    { opposite: true, title: { text: "Valor (R$)" }, min: 0,
      labels: { formatter: (v) => `R$ ${(v || 0).toFixed(0)}` } },
  ],
  tooltip: {
    y: { formatter: (v, { seriesIndex }) => seriesIndex === 1 ? `R$ ${(v || 0).toFixed(2)}` : v },
  },
  colors: ["#2196F3", "#4CAF50"],
  fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } },
}));

const series = computed(() => [
  { name: "Orçamentos", data: props.evolucao.map((e) => e.quantidade) },
  { name: "Valor (R$)", data: props.evolucao.map((e) => parseFloat(e.valor) || 0) },
]);
</script>

<template>
  <VCard>
    <VCardText>
      <h3 class="text-h6 mb-4">
        <VIcon icon="tabler-chart-line" class="mr-2" />
        Evolução de Orçamentos
      </h3>
      <VueApexCharts
        v-if="evolucao.length > 0"
        type="area"
        height="300"
        :options="chartOptions"
        :series="series"
      />
      <p v-else class="text-center text-disabled py-6">Sem dados para o período</p>
    </VCardText>
  </VCard>
</template>
