<script setup>
  import { VForm } from "vuetify/components/VForm";
  import bklogin from "@images/pages/login-bk.jpg";
  import logoOregon from "@images/logo.png";
  import logoDaviot from "@images/daviot-logo.png";
  import { isDaviot } from "@/utils/typeClient";
  import { themeConfig } from "@themeConfig";
  import { useAlert } from "@/composables/useAlert";
  import { temaAtual } from "@/@core/stores/config";
  import { connectSocket } from "@/composables/useSocket";
  const { setAlert } = useAlert();

  const currentLogo = isDaviot() ? logoDaviot : logoOregon;
  const canRegister = computed(() => isDaviot() || import.meta.env.DEV);

  definePage({
    meta: {
      layout: "blank",
      unauthenticatedOnly: true,
    },
  });

  const loading = ref(true);

  const isPasswordVisible = ref(false);
  const route = useRoute();
  const router = useRouter();
  const ability = useAbility();

  //Verificar se tá logado
  const userData = useCookie("userData").value;
  if (userData) {
    setAlert(
      "Você já está logado! Você será redirecionado...",
      "info",
      "tabler-info",
      3000
    );
    router.push({ name: "index" });
  } else {
    loading.value = false;
  }

  const errors = ref({
    email: undefined,
    password: undefined,
  });

  const refVForm = ref();

  const credentials = ref({
    email: "",
    password: "",
  });

  const rememberMe = ref(false);

  const login = async () => {
    try {
      const res = await $api("/conta/login", {
        method: "POST",
        body: {
          email: credentials.value.email,
          password: credentials.value.password,
          rememberMe: rememberMe.value,
        },
      }).catch((error) => {
        if (error.response && error.response.status === 401) {
          setAlert(
            "Email ou senha incorretos. Verifique suas credenciais e tente novamente.",
            "error",
            "tabler-alert-triangle",
            4000
          );
        } else if (error.response && error.response.status === 402) {
          setAlert(
            "Sua senha ainda não foi gerada, gere através do email de confirmação ou entre em contato com o seu administrador.",
            "error",
            "tabler-alert-triangle",
            8000
          );
        } else if (error.response && error.response.status === 403) {
          setAlert(
            "Sua conta está desativada ou foi excluída. Entre em contato com o seu administrador.",
            "error",
            "tabler-alert-triangle",
            5000
          );
        } else if (error.response && error.response.status === 404) {
          setAlert(
            "Usuário não encontrado. Verifique suas credenciais e tente novamente.",
            "error",
            "tabler-alert-triangle",
            4000
          );
        } else if (error.response && error.response.status === 405) {
          setAlert(
            "A assinatura da empresa que você faz parte não está ativa, entre em contato com seu administrador.",
            "error",
            "tabler-alert-triangle",
            5000
          );
        } else if (
          (error.response && error.response.status === 406) ||
          (error.response && error.response.status === 407)
        ) {
          setAlert(
            "A Empresa que você faz parte não está ativa ou não foi encontrada, entre em contato com seu administrador.",
            "error",
            "tabler-alert-triangle",
            8000
          );
        } else {
          setAlert(
            "Erro ao fazer login. Tente novamente mais tarde.",
            "error",
            "tabler-alert-triangle",
            3000
          );
        }
      });

      if (!res) return;

      const { accessToken, userData, userAbilityRules } = res.response;

      const cookieOptions = {
        maxAge: (rememberMe.value ? 24 : 8) * 24 * 60 * 60,
      };

      const userAbilityRulesJSON = JSON.parse(userAbilityRules);

      ability.update(userAbilityRulesJSON);

      useCookie("userData", cookieOptions).value = userData;
      useCookie("userAbilityRules", cookieOptions).value = userAbilityRules;
      useCookie("accessToken", cookieOptions).value = accessToken;

      // Conecta o socket com o novo token de autenticação
      connectSocket();

      setAlert(
        "Login realizado com sucesso! Você será redirecionado...",
        "success",
        "tabler-check",
        5000
      );

      await nextTick(() => {
        router.replace(route.query.to ? String(route.query.to) : "/");
      });
    } catch (err) {
      console.error("Login Erro", err, " - ", err.response);
      setAlert(
        "Erro ao fazer login. Tente novamente mais tarde.",
        "error",
        "tabler-alert-triangle",
        3000
      );
    }
  };

  const onSubmit = () => {
    refVForm.value?.validate().then(({ valid: isValid }) => {
      if (isValid) login();
    });
  };

  const esqueceuSenha = () => {
    router.push({ name: "esqueci-senha" });
  };
</script>

<template>
  <!--Dialog de carregamento circular enquanto verifica se o usuário está logado-->
  <VDialog
    v-model="loading"
    persistent
    max-width="300"
    class="d-flex align-center justify-center"
  >
    <VCardText class="text-center d-lg-flex align-center justify-center">
      <VProgressCircular indeterminate color="primary" :size="58" :width="6" />
    </VCardText>
  </VDialog>

  <VRow
    no-gutters
    class="auth-wrapper bg-surface justify-center align-center"
    :style="`background-image: url(${bklogin}); 
    background-size: 100%; 
    background-repeat: no-repeat;
    background-position: center center;
    ${temaAtual() == 'dark' ? 'background-blend-mode: soft-light;' : ''}`"
  >
    <VCol
      v-if="!loading"
      cols="12"
      lg="4"
      class="auth-card-v2 d-flex align-center justify-center flex-wrap"
    >
      <VCardText class="text-center d-lg-flex align-center justify-center">
        <img
          :src="currentLogo"
          alt="logo"
          style="width: 35%; max-width: 100%; height: auto"
        />
      </VCardText>
      <VCard flat :max-width="500" class="mt-12 mt-sm-0 pa-4" rounded="xl">
        <VCardText>
          <h3 class="text-h3 mb-5">
            Bem vindo ao
            <span class="text-capitalize"> {{ themeConfig.app.title }} </span>!
            👋🏻
          </h3>
          <p class="mb-0">Faça login para continuar:</p>
        </VCardText>

        <VCardText>
          <VForm ref="refVForm" @submit.prevent="onSubmit">
            <VRow>
              <!-- email -->
              <VCol cols="12">
                <AppTextField
                  v-model="credentials.email"
                  label="Email"
                  placeholder="seuemail@email.com"
                  type="email"
                  autofocus
                  :rules="[requiredValidator, emailValidator]"
                  :error-messages="errors.email"
                />
              </VCol>

              <!-- password -->
              <VCol cols="12">
                <AppTextField
                  v-model="credentials.password"
                  label="Senha"
                  placeholder="············"
                  :rules="[requiredValidator]"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  :error-messages="errors.password"
                  :append-inner-icon="
                    isPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'
                  "
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />

                <div
                  class="d-flex align-center flex-wrap justify-space-between mt-1 mb-4"
                >
                  <VCheckbox v-model="rememberMe" label="Lembrar-me" />
                  <a
                    class="text-primary ms-2 mb-1"
                    style="cursor: pointer"
                    @click="esqueceuSenha"
                  >
                    Esqueceu sua senha?
                  </a>
                </div>

                <VBtn block type="submit"> Login </VBtn>
              </VCol>
            </VRow>
          </VForm>

          <div v-if="canRegister" class="d-flex flex-column align-center mt-5 gap-2">
            <VBtn
              variant="outlined"
              color="primary"
              block
              to="/cadastro-empresa"
              prepend-icon="tabler-user-plus"
            >
              Criar conta
            </VBtn>
            <RouterLink
              class="text-primary text-sm mt-1"
              style="cursor: pointer; font-size: 13px"
              to="/conheca"
            >
              Conhecer a plataforma 
            </RouterLink>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style lang="scss">
  @use "@core/scss/template/pages/page-auth.scss";
</style>
