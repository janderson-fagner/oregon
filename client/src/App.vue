<script setup>
import { useTheme } from 'vuetify'
import ScrollToTop from '@core/components/ScrollToTop.vue'
import AppUpdateNotification from '@/components/AppUpdateNotification.vue'
import initCore from '@core/initCore'
import {
  initConfigStore,
  useConfigStore,
} from '@core/stores/config'
import { hexToRgb } from '@layouts/utils'
import { useAlert } from '@/composables/useAlert'

const { alert, setAlert } = useAlert()
const { global } = useTheme()

// ℹ️ Sync current theme with initial loader theme
initCore()
initConfigStore()

const configStore = useConfigStore()
</script>

<template>
  <VLocaleProvider :rtl="configStore.isAppRTL">
    <!-- ℹ️ This is required to set the background color of active nav link based on currently active global theme's primary -->
    <VApp :style="`--v-global-theme-primary: ${hexToRgb('#3182ce')}`">
      <!-- Alert -->
      <Transition name="slide-right">
        <VAlert
          v-if="alert.show"
          :color="alert.color"
          :max-width="400"
          :icon="alert.icon"
          style="position: fixed; top: 80px; right: 15px; z-index: 99999999999;"
          :text="alert.message"
        />
      </Transition>

      <RouterView />
      <ScrollToTop />

      <!-- Aviso de nova versão publicada (build) -->
      <AppUpdateNotification />
    </VApp>
  </VLocaleProvider>
</template>

<style>
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.slide-right-enter-to,
.slide-right-leave-from {
  transform: translateX(0);
}

@media(min-width: 800px) {
  header.layout-navbar.navbar-blur {
      display: none;
  }
}
</style>
