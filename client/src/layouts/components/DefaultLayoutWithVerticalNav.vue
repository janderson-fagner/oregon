<script setup>
import navItems from "@/navigation/vertical";
import logo from "@images/logo.png";
import logoDaviot from "@images/daviot-logo.png";

import { isDaviot } from "@/utils/typeClient";

//Configurações do Tema
import { cookieRef, namespaceConfig } from "@layouts/stores/config";
import { useTheme } from "vuetify";
import { useStorage } from "@vueuse/core";
const vuetifyTheme = useTheme();

const setPrimaryColor = useDebounceFn((color) => {
  vuetifyTheme.themes.value[vuetifyTheme.name.value].colors.primary = color;
  cookieRef(`${vuetifyTheme.name.value}ThemePrimaryColor`, null).value = color;
  useStorage(namespaceConfig("initial-loader-color"), null).value = color;
}, 100);

//Configurações personalizadas para remover a personalização
setPrimaryColor("#3182CE");

const route = useRoute();

//Rota
const userData = useCookie("userData").value;
const userID = userData?.id;

const router = useRouter();

const rotaConta = () => {
  router.push("/apps/user/view/" + userID);
};

// Components
import Footer from "@/layouts/components/Footer.vue";
import HelpCenterDialog from "@/components/HelpCenterDialog.vue";
import { useHelpCenter } from "@/composables/useHelpCenter";
const { openHelp } = useHelpCenter();

const openHelpFromRoute = () => {
  const topicSlug = route.meta?.helpTopic || null;
  openHelp(topicSlug);
};

// @layouts plugin
import { VerticalNavLayout } from "@layouts";

// SECTION: Loading Indicator
const isFallbackStateActive = ref(false);
const refLoadingIndicator = ref(null);

watch(
  [isFallbackStateActive, refLoadingIndicator],
  () => {
    if (isFallbackStateActive.value && refLoadingIndicator.value)
      refLoadingIndicator.value.fallbackHandle();
    if (!isFallbackStateActive.value && refLoadingIndicator.value)
      refLoadingIndicator.value.resolveHandle();
  },
  { immediate: true }
);
// !SECTION

const isMobile = ref(window.innerWidth <= 768);

onMounted(() => {
  isMobile.value = window.innerWidth <= 768;
});

watch(
  () => route.name,
  () => {
    console.log("route.name: ", route.name, "isMobile: ", isMobile.value);

    if (route.name == "agendamento" && isMobile.value) {
      document.querySelector("body").style.overflow = "hidden";
      document.querySelector("body").classList.add("agendamento-mobile-body");
    } else {
      document.querySelector("body").style.overflow = "auto";
      document
        .querySelector("body")
        .classList.remove("agendamento-mobile-body");
    }
  },
  { immediate: true }
);
</script>

<template>
  <VerticalNavLayout :nav-items="navItems">
    <!-- 👉 navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <VRow class="align-center flex-nowrap">
        <VCol cols="2">
          <IconBtn
            id="vertical-nav-toggle-btn"
            class="ms-n3 d-lg-none"
            @click="toggleVerticalOverlayNavActive(true)"
          >
            <VIcon size="26" icon="tabler-menu-2" />
          </IconBtn>
        </VCol>

        <VCol cols="8" class="justify-center d-flex">
          <img
            :src="isDaviot() ? logoDaviot : logo"
            alt="logo"
            class="d-flex align-content-center"
            :style="!isMobile ? 'max-width: 100%;' : 'max-width: 40%;'"
          />
        </VCol>

        <VCol cols="2" class="justify-end d-flex pa-0">
          <IconBtn
            id="vertical-nav-toggle-btn"
            class="ms-n3 d-lg-none"
            @click="rotaConta"
          >
            <VIcon size="26" icon="tabler-user-circle" />
          </IconBtn>
        </VCol>
      </VRow>
    </template>

    <AppLoadingIndicator ref="refLoadingIndicator" />

    <!-- 👉 Pages -->
    <RouterView v-slot="{ Component }">
      <Suspense
        :timeout="0"
        @fallback="isFallbackStateActive = true"
        @resolve="isFallbackStateActive = false"
      >
        <Component :is="Component" />
      </Suspense>
    </RouterView>

    <!-- 👉 Footer -->
    <template #footer v-if="route.name != 'agendamento' || !isMobile">
      <Footer />
    </template>

    <!-- Centro de Ajuda FAB -->
    <VBtn
      v-if="route.name != 'crm-chat'"
      icon
      color="primary"
      size="large"
      class="help-fab"
      elevation="8"
      style="position: fixed; bottom: 24px; right: 24px; z-index: 1000"
      @click="openHelpFromRoute"
    >
      <VIcon icon="tabler-help" size="28" />
      <VTooltip activator="parent" location="start">Ajuda</VTooltip>
    </VBtn>
    <HelpCenterDialog />
  </VerticalNavLayout>
</template>
