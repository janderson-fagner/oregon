<script setup>
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import { VNodeRenderer } from './VNodeRenderer'
import { layoutConfig } from '@layouts'
import {
  VerticalNavGroup,
  VerticalNavLink,
  VerticalNavSectionTitle,
} from '@layouts/components'
import { useLayoutConfigStore } from '@layouts/stores/config'
import { injectionKeyIsVerticalNavHovered } from '@layouts/symbols'
import UserProfile from '@/layouts/components/UserProfile.vue'
import logoImg from '@images/logo.png'
import logoDaviotImg from '@images/daviot-logo.png'
import miniLogoImg from '@images/favicon.png'
import miniLogoDaviotImg from '@images/daviot-icon.png'
import { isDaviot } from '@/utils/typeClient'

const props = defineProps({
  tag: {
    type: [
      String,
      Object,
      Function,
    ],
    required: false,
    default: 'aside',
  },
  navItems: {
    type: null,
    required: true,
  },
  isOverlayNavActive: {
    type: Boolean,
    required: true,
  },
  toggleIsOverlayNavActive: {
    type: Function,
    required: true,
  },
})

const refNav = ref()
const isHovered = useElementHover(refNav)

provide(injectionKeyIsVerticalNavHovered, isHovered)

const configStore = useLayoutConfigStore()

const resolveNavItemComponent = item => {
  if ('heading' in item)
    return VerticalNavSectionTitle
  if ('children' in item)
    return VerticalNavGroup

  return VerticalNavLink
}

/*ℹ️ Close overlay side when route is changed
Close overlay vertical nav when link is clicked
*/
const route = useRoute()

watch(() => route.name, () => {
  props.toggleIsOverlayNavActive(false)
})

const isVerticalNavScrolled = ref(false)
const updateIsVerticalNavScrolled = val => isVerticalNavScrolled.value = val

const handleNavScroll = evt => {
  isVerticalNavScrolled.value = evt.target.scrollTop > 0
}

const hideTitleAndIcon = configStore.isVerticalNavMini(isHovered)

const toggleCookie = useCookie('vertical-nav-collapsed')

if(toggleCookie.value === '' || toggleCookie.value === undefined || toggleCookie.value === null) {
  toggleCookie.value = true
}

configStore.isVerticalNavCollapsed = toggleCookie.value

const toogleMenu = () => {
  configStore.isVerticalNavCollapsed = !configStore.isVerticalNavCollapsed
  toggleCookie.value = configStore.isVerticalNavCollapsed
}

//Se a largura da tela for menor que 800px, então isVerticalNavCollapsed = false
if (window.innerWidth < 600) {
  configStore.isVerticalNavCollapsed = false
}

</script>

<template>
  <Component
    :is="props.tag"
    ref="refNav"
    class="layout-vertical-nav"
    :class="[
      {
        'overlay-nav': configStore.isLessThanOverlayNavBreakpoint,
        'hovered': isHovered,
        'visible': isOverlayNavActive,
        'scrolled': isVerticalNavScrolled,
      },
    ]"
  >
    <VHover
      v-slot="{ isHovering, props }"
      open-delay="200"
    >
      <div
        v-if="!isHovering"
        class="btn-expandir-container position-absolute d-none d-sm-flex"
        v-bind="props"
        @click="toogleMenu"
      >
        <div>
          <div
            class="lines-toggle"
            style="transform: translateY(0.15rem) rotate(0deg) translateZ(0px);"
          />
          <div
            class="lines-toggle"
            style="transform: translateY(-0.15rem) rotate(0deg) translateZ(0px);"
          />
        </div>
      </div>

      <div
        v-else
        class="btn-expandir-container position-absolute d-none d-sm-flex"
        v-bind="props"
        @click="toogleMenu"
      >
        <div v-if="!configStore.isVerticalNavCollapsed">
          <VTooltip
            text="Fechar menu lateral"
            activator="parent"
            location="end"
          />
          <div
            class="lines-toggle"
            style="transform: translateY(0.15rem) rotate(25deg) translateZ(0px);"
          />
          <div
            class="lines-toggle"
            style="transform: translateY(-0.15rem) rotate(-25deg) translateZ(0px);"
          />
        </div>
        <div v-else>
          <VTooltip
            text="Abrir menu lateral"
            activator="parent"
            location="end"
          />
          <div
            class="lines-toggle"
            style="transform: translateY(0.15rem) rotate(-25deg) translateZ(0px);"
          />
          <div
            class="lines-toggle"
            style="transform: translateY(-0.15rem) rotate(25deg) translateZ(0px);"
          />
        </div>
      </div>
    </VHover>

    <!-- 👉 Header -->
    <div class="nav-header">
      <slot name="nav-header">
        <RouterLink
          to="/"
          class="app-logo app-title-wrapper"
        >
          <img
            :src="!configStore.isVerticalNavCollapsed || isHovered ? (isDaviot() ? logoDaviotImg : logoImg) : (isDaviot() ? miniLogoDaviotImg : miniLogoImg)"
            alt="logo"
            class="mb-2"
            style="height: auto; transition: .6s;"
            :style="!configStore.isVerticalNavCollapsed || isHovered ? 'max-width: 10%; width: 55%; margin-left: 23px;' : !isDaviot() ? 'width: 40%' : 'width: 4%'"
          >

          <Transition name="vertical-nav-app-title" />
        </RouterLink>
      </slot>
    </div>
    <slot name="before-nav-items">
      <div class="vertical-nav-items-shadow" />
    </slot>
    <slot
      name="nav-items"
      :update-is-vertical-nav-scrolled="updateIsVerticalNavScrolled"
    >
      <PerfectScrollbar
        :key="configStore.isAppRTL"
        tag="ul"
        class="nav-items"
        :options="{ wheelPropagation: false }"
        @ps-scroll-y="handleNavScroll"
      >
        <Component
          :is="resolveNavItemComponent(item)"
          v-for="(item, index) in navItems"
          :key="index"
          :item="item"
        />
      </PerfectScrollbar>
    </slot>

    <UserProfile />
  </Component>
</template>

<style lang="scss" scoped>
.app-logo {
  display: flex;
  align-items: center;
  column-gap: 0.75rem;

  .app-logo-title {
    font-size: 1.375rem;
    font-weight: 700;
    line-height: 1.75rem;
    text-transform: capitalize;
  }
}

.btn-expandir-container {
  display: flex;
  right: -20px;
  width: 20px;
  top: 50vh;
  cursor: pointer;
  justify-content: center;
  transition: .4s;
}

.btn-expandir-container .lines-toggle {
  border-radius: 1000px;
  background: #b6b6b6;
  width: .25rem;
  height: .75rem;
  transition: .4s;
}

.btn-expandir-container:hover .lines-toggle {
  background: #a0a0a0;
  transition: .4s;
}
</style>

<style lang="scss">
@use "@configured-variables" as variables;
@use "@layouts/styles/mixins";

// 👉 Vertical Nav
.layout-vertical-nav {
  position: fixed;
  z-index: variables.$layout-vertical-nav-z-index;
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: variables.$layout-vertical-nav-width;
  inset-block-start: 0;
  inset-inline-start: 0;
  transition: inline-size 0.25s ease-in-out, box-shadow 0.25s ease-in-out;
  will-change: transform, inline-size;

  .nav-header {
    display: flex;
    align-items: center;

    .header-action {
      cursor: pointer;

      @at-root {
        #{variables.$selector-vertical-nav-mini} .nav-header .header-action {

          &.nav-pin,
          &.nav-unpin {
            display: none !important;
          }
        }
      }
    }
  }

  .app-title-wrapper {
    margin-inline-end: auto;
  }

  .nav-items {
    block-size: 100%;

    // ℹ️ We no loner needs this overflow styles as perfect scrollbar applies it
    // overflow-x: hidden;

    // // ℹ️ We used `overflow-y` instead of `overflow` to mitigate overflow x. Revert back if any issue found.
    // overflow-y: auto;
  }

  .nav-item-title {
    overflow: hidden;
    margin-inline-end: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 👉 Collapsed
  .layout-vertical-nav-collapsed & {
    &:not(.hovered) {
      inline-size: variables.$layout-vertical-nav-collapsed-width;
    }
  }
}

// Small screen vertical nav transition
@media (max-width:650px) {
  .layout-vertical-nav {
    &:not(.visible) {
      transform: translateX(-#{variables.$layout-vertical-nav-width});

      @include mixins.rtl {
        transform: translateX(variables.$layout-vertical-nav-width);
      }
    }

    transition: transform 0.25s ease-in-out;
  }
}
</style>
