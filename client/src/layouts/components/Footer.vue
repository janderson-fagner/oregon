<script setup>
import { isDaviot } from '@/utils/typeClient'
const brandName = isDaviot() ? 'Daviot' : 'Oregon Serviços'
</script>

<template>
  <div class="h-100 d-flex align-center justify-space-between">
      <p class="text-sm mb-0">Copyright {{ new Date().getFullYear() }} © {{ brandName }} - Todos os direitos reservados.</p>

      <p class="text-sm mb-0 text-primary">
        Ajuda
      </p>
  </div>
</template>
