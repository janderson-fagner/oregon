<script setup>
// Aviso de "nova versão disponível". Aparece quando o useAppVersion detecta
// que o /version.json publicado difere do build atualmente carregado.
import { useAppVersion } from '@/composables/useAppVersion'

const { updateAvailable, iniciarMonitoramento, reloadApp } = useAppVersion()

// Permite o usuário dispensar o aviso (sem recarregar). Volta a aparecer no
// próximo ciclo só se ainda houver versão nova — mas como pausamos o polling
// após detectar, fica dispensado até a próxima sessão/checagem manual.
const dispensado = ref(false)

onMounted(() => {
  iniciarMonitoramento()
})
</script>

<template>
  <VSnackbar
    :model-value="updateAvailable && !dispensado"
    :timeout="-1"
    location="bottom"
    color="primary"
    variant="elevated"
    class="app-update-snackbar"
  >
    <div class="d-flex align-center gap-2">
      <VIcon icon="tabler-rocket" />
      <span>Uma nova versão do sistema está disponível.</span>
    </div>

    <template #actions>
      <VBtn variant="flat" color="white" class="text-primary" @click="reloadApp">
        Atualizar
      </VBtn>
      <IconBtn @click="dispensado = true">
        <VIcon icon="tabler-x" />
      </IconBtn>
    </template>
  </VSnackbar>
</template>
