<script setup>
  import { PerfectScrollbar } from "vue3-perfect-scrollbar";
  import { useCookieStore, useLayoutConfigStore } from "@layouts/stores/config";
  import { useAlert } from "@/composables/useAlert";
  import NavbarThemeSwitcher from "@/layouts/components/NavbarThemeSwitcher.vue";
  import { socket, disconnectSocket } from "@/composables/useSocket";

  const cookieStore = useCookieStore();
  const { setAlert } = useAlert();

  const router = useRouter();
  const ability = useAbility();

  const userData = useCookie("userData");
  const userAbilityRules = useCookie("userAbilityRules");
  const accessToken = useCookie("accessToken");

  const abilityCookieStore = cookieStore.userAbilityRules
    ? typeof cookieStore.userAbilityRules === "string"
      ? JSON.parse(cookieStore.userAbilityRules)
      : cookieStore.userAbilityRules
    : [];

  ability.update(abilityCookieStore);

  if (accessToken == "" || userData == "") {
    setAlert(
      "Ocorreu um erro com seu acesso. Faça login novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );

    router.push("/login");
  }

  watch(
    () => cookieStore.userData,
    (newValueUserData, oldValueUserData) => {
      if (newValueUserData) {
        userData.value = newValueUserData;
      }

      if (newValueUserData && oldValueUserData) {
        if (
          newValueUserData.id != oldValueUserData.id ||
          newValueUserData.email != oldValueUserData.email
        ) {
          useCookie("userAbilityRules").value = null;
          ability.update([]);
          useCookie("userData").value = null;
          useCookie("accessToken").value = null;

          setAlert(
            "Seu acesso expirou! Faça login novamente para continuar.",
            "error",
            "tabler-alert-triangle",
            3000
          );

          router.push("/login");
        }
      }
    },
    { deep: true }
  );

  const logout = async () => {
    disconnectSocket();
    useCookie("accessToken").value = null;
    userData.value = null;
    useCookie("userAbilityRules").value = null;
    ability.update([]);
    window.location.href = "/login";
  };

  // --- Notificações ---
  const notifications = ref([]);
  const showNotiMenu = ref(false);

  const getNotificacoes = async () => {
    try {
      const res = await $api("/noti/get-noti", { method: "GET" });
      notifications.value = res || [];
    } catch (e) {
      notifications.value = [];
    }
  };

  const unreadCount = computed(() => {
    return notifications.value.filter(
      (n) => n.visualizada === 0 || n.visualizada === false
    ).length;
  });

  onMounted(() => {
    getNotificacoes();
  });

  socket.on("newNotification", () => {
    getNotificacoes();
  });

  const removeNotification = (notificationId) => {
    notifications.value.forEach((item, index) => {
      if (notificationId === item.id_noti) {
        $api("/noti/delete-noti", {
          method: "POST",
          body: { id_notificacao: notificationId },
        }).then(() => {
          notifications.value.splice(index, 1);
        });
      }
    });
  };

  const markRead = (notificationIds) => {
    notifications.value.forEach((item) => {
      notificationIds.forEach((id) => {
        if (id === item.id_noti) {
          $api("/noti/marcar-noti", {
            method: "POST",
            body: { id_notificacao: id },
          }).then(() => {
            item.visualizada = true;
          });
        }
      });
    });
  };

  const markUnRead = (notificationIds) => {
    notifications.value.forEach((item) => {
      notificationIds.forEach((id) => {
        if (id === item.id_noti) {
          $api("/noti/desmarcar-noti", {
            method: "POST",
            body: { id_notificacao: id },
          }).then(() => {
            item.visualizada = false;
          });
        }
      });
    });
  };

  const handleNotificationClick = (notification) => {
    if (!notification.visualizada) {
      markRead([notification.id_noti]);
    } else {
      markUnRead([notification.id_noti]);
    }

    if (notification.params !== null && notification.params !== undefined) {
      window.location.href = notification.params;
    }
  };

  const isAllMarkRead = computed(() =>
    notifications.value.some((item) => item.visualizada === false || item.visualizada === 0)
  );

  const markAllReadOrUnread = () => {
    const allIds = notifications.value.map((item) => item.id_noti);
    if (!isAllMarkRead.value) {
      markUnRead(allIds);
    } else {
      markRead(allIds);
    }
  };

  // --- Menu items ---
  let title_item = "Meu Perfil";
  let link_item = "apps-user-view-id";

  const userProfileList = [
    { type: "divider" },
    {
      type: "tema",
    },
    { type: "divider" },
    {
      type: "navItem",
      icon: "tabler-user",
      title: title_item,
      to: {
        name: link_item,
        params: { id: userData.value.id },
      },
    },
    { type: "divider" },
    { type: "noti" },
    { type: "divider" },
    {
      type: "navItem",
      icon: "tabler-logout",
      title: "Sair",
      onClick: logout,
    },
  ];

  const configStore = useLayoutConfigStore();

  const menuCurto = ref(configStore.isVerticalNavCollapsed);

  watch(
    () => configStore.isVerticalNavCollapsed,
    (newValue) => {
      menuCurto.value = newValue;
    },
    { immediate: true }
  );
</script>

<template>
  <VList class="overflow-hidden mb-5" style="cursor: pointer">
    <VListItem>
      <template #prepend>
        <VListItemAction start>
          <VBadge
            :model-value="unreadCount > 0"
            :content="unreadCount"
            location="bottom right"
            offset-x="3"
            offset-y="3"
            color="error"
            bordered
          >
            <VAvatar
              :color="!(userData && userData.avatar) ? 'primary' : undefined"
              :variant="!(userData && userData.avatar) ? 'tonal' : undefined"
            >
              <VImg
                v-if="userData && userData.avatar"
                :src="userData.avatar"
                cover
              />
              <VIcon v-else icon="tabler-user" />
            </VAvatar>
          </VBadge>
        </VListItemAction>
      </template>

      <VListItemTitle class="font-weight-medium">
        {{ userData.fullName || userData.username }}
      </VListItemTitle>
      <VListItemSubtitle style="text-transform: capitalize">
        {{ userData.role }}
      </VListItemSubtitle>
    </VListItem>

    <!-- SECTION Menu -->
    <VMenu activator="parent" width="230" location="bottom end" offset="14px">
      <VList>
        <VListItem>
          <template #prepend>
            <VListItemAction start>
              <VBadge
                :model-value="unreadCount > 0"
                :content="unreadCount"
                location="bottom right"
                offset-x="3"
                offset-y="3"
                color="error"
                bordered
              >
                <VAvatar
                  :color="
                    !(userData && userData.avatar) ? 'primary' : undefined
                  "
                  :variant="
                    !(userData && userData.avatar) ? 'tonal' : undefined
                  "
                >
                  <VImg
                    v-if="userData && userData.avatar"
                    :src="userData.avatar"
                    cover
                  />
                  <VIcon v-else icon="tabler-user" />
                </VAvatar>
              </VBadge>
            </VListItemAction>
          </template>

          <VListItemTitle class="font-weight-medium">
            {{ userData.fullName || userData.username }}
          </VListItemTitle>
          <VListItemSubtitle>{{ userData.role }}</VListItemSubtitle>
        </VListItem>

        <PerfectScrollbar :options="{ wheelPropagation: false }">
          <template v-for="item in userProfileList" :key="item.title">
            <VListItem
              v-if="item.type === 'navItem' && item.type !== 'noti'"
              :to="item.to"
              @click="item.onClick && item.onClick()"
            >
              <template #prepend>
                <VIcon class="me-2" :icon="item.icon" size="22" />
              </template>

              <VListItemTitle>{{ item.title }}</VListItemTitle>

              <template v-if="item.badgeProps" #append>
                <VBadge v-bind="item.badgeProps" />
              </template>
            </VListItem>

            <VListItem @click.stop="showNotiMenu = !showNotiMenu" v-else-if="item.type === 'noti'">
              <template #prepend>
                <VIcon class="me-2" icon="tabler-bell" size="22" />
              </template>
              <VListItemTitle>Notificações</VListItemTitle>
              <template #append>
                <VBadge
                  v-if="unreadCount > 0"
                  color="error"
                  :content="unreadCount"
                  inline
                />
              </template>
            </VListItem>

            <NavbarThemeSwitcher v-else-if="item.type === 'tema'" />

            <VDivider v-else class="my-2" />
          </template>
        </PerfectScrollbar>
      </VList>
    </VMenu>
  </VList>
  <!-- !SECTION -->

  <!-- Dialog de Notificações -->
  <VDialog v-model="showNotiMenu" width="420" @click:outside="showNotiMenu = false">
    <VCard>
      <VCardText class="pa-0">
        <div class="d-flex align-center justify-space-between pa-4 pb-2">
          <p class="text-lg font-weight-medium mb-0">Notificações</p>
          <IconBtn
            v-show="notifications.length"
            @click="markAllReadOrUnread"
          >
            <VIcon :icon="!isAllMarkRead ? 'tabler-mail' : 'tabler-mail-opened'" />
            <VTooltip activator="parent" location="start">
              {{ !isAllMarkRead ? 'Marcar todas como não lidas' : 'Marcar todas como lidas' }}
            </VTooltip>
          </IconBtn>
        </div>

        <VDivider />

        <PerfectScrollbar
          :options="{ wheelPropagation: false }"
          style="max-block-size: 23.75rem;"
        >
          <VList class="py-0">
            <template
              v-for="(notification, index) in notifications"
              :key="notification.id_noti"
            >
              <VDivider v-if="index > 0" />
              <VListItem
                link
                lines="one"
                min-height="66px"
                class="list-item-hover-class"
              >
                <template #prepend>
                  <VListItemAction
                    start
                    @click="handleNotificationClick(notification)"
                  >
                    <VIcon size="30" icon="tabler-alert-circle" />
                  </VListItemAction>
                </template>

                <VListItemTitle
                  :class="notification.visualizada ? 'font-weight-medium' : 'font-weight-black'"
                  @click="handleNotificationClick(notification)"
                >
                  {{ notification.title }}
                </VListItemTitle>
                <VListItemSubtitle
                  :class="notification.visualizada ? 'font-weight-medium' : 'font-weight-black'"
                  @click="handleNotificationClick(notification)"
                >
                  {{ notification.subtitle }}
                </VListItemSubtitle>
                <span class="text-xs text-disabled">
                  {{ notification.time ? new Date(notification.time).toLocaleDateString('pt-BR') : 'Sem Data' }}
                </span>

                <template #append>
                  <div class="d-flex flex-column align-center gap-4">
                    <IconBtn
                      size="small"
                      class="visible-in-hover"
                      @click="notification.visualizada ? markUnRead([notification.id_noti]) : markRead([notification.id_noti])"
                    >
                      <VIcon
                        class="ma-2"
                        size="20"
                        :icon="notification.visualizada ? 'tabler-eye' : 'tabler-eye-off'"
                      />
                    </IconBtn>

                    <div style="block-size: 28px; inline-size: 28px;">
                      <IconBtn
                        size="small"
                        class="visible-in-hover"
                        @click="removeNotification(notification.id_noti)"
                      >
                        <VIcon size="20" icon="tabler-x" />
                      </IconBtn>
                    </div>
                  </div>
                </template>
              </VListItem>
            </template>

            <VListItem
              v-show="!notifications.length"
              class="text-center text-medium-emphasis"
              style="block-size: 56px;"
            >
              <VListItemTitle>Você não tem novas notificações!</VListItemTitle>
            </VListItem>
          </VList>
        </PerfectScrollbar>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style>
  .layout-vertical-nav-collapsed .icone-trocar {
    display: none !important;
  }

  .layout-vertical-nav.hovered .icone-trocar {
    display: block !important;
  }

  .list-item-hover-class {
    .visible-in-hover {
      display: none;
    }

    &:hover {
      .visible-in-hover {
        display: block;
      }
    }
  }
</style>
