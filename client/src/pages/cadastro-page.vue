<script setup>
import logoOregon from "@images/logo.png";
import logoDaviot from "@images/daviot-logo.png";
import { isDaviot } from "@/utils/typeClient";
import {
  cookieRef,
  namespaceConfig,
} from "@layouts/stores/config";
import { themeConfig } from "@themeConfig";
import { useTheme } from "vuetify";
import { useConfigStore } from "@core/stores/config";
import { useStorage } from "@vueuse/core";

const configStore = useConfigStore();
const vuetifyTheme = useTheme();

const setPrimaryColor = useDebounceFn((color) => {
  vuetifyTheme.themes.value[vuetifyTheme.name.value].colors.primary = color;
  cookieRef(`${vuetifyTheme.name.value}ThemePrimaryColor`, null).value = color;
  useStorage(namespaceConfig("initial-loader-color"), null).value = color;
}, 100);

//Forçar Claro
configStore.theme = "light";

const currentLogo = isDaviot() ? logoDaviot : logoOregon;
const brandName = isDaviot() ? "Daviot" : "Oregon";

const router = useRouter();
const { setAlert } = useAlert();
const ability = useAbility();
const loading = ref(false);

// Steps - agora são 4
const currentStep = ref(1);
const totalSteps = 4;

// Dados da Empresa (simplificado)
const empresa = ref({
  nome: "",
  documento: "",
});

// Dados do Usuário
const usuario = ref({
  nome: "",
  email: "",
  senha: "",
  confirmarSenha: "",
});

// Dados do Plano
const planos = ref([]);
const selectedPlano = ref(null);
const ciclo = ref("MONTHLY");

// Dados do Cartão de Crédito
const cartao = ref({
  holderName: "",
  number: "",
  expiryMonth: null,
  expiryYear: null,
  ccv: "",
  // Dados do titular
  postalCode: "",
  addressNumber: "",
  phone: "",
});

// Visibilidade da senha
const showPassword = ref(false);
const showConfirmPassword = ref(false);

// Buscar planos
const getPlanos = async () => {
  try {
    const res = await $api("/saas/planos", {
      method: "GET",
      query: { ativo: true },
    });

    console.log(res);
    
    planos.value = res || [];
  } catch (error) {
    console.error("Erro ao buscar planos:", error);
  }
};

// Validação matemática de CPF (algoritmo módulo 11)
const validarCPF = (cpf) => {
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(cpf[10]);
};

// Validação matemática de CNPJ (algoritmo módulo 11)
const validarCNPJ = (cnpj) => {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += parseInt(cnpj[i]) * pesos1[i];
  let resto = soma % 11;
  const dig1 = resto < 2 ? 0 : 11 - resto;
  if (dig1 !== parseInt(cnpj[12])) return false;
  soma = 0;
  for (let i = 0; i < 13; i++) soma += parseInt(cnpj[i]) * pesos2[i];
  resto = soma % 11;
  const dig2 = resto < 2 ? 0 : 11 - resto;
  return dig2 === parseInt(cnpj[13]);
};

// Validar step atual
const validateStep = () => {
  if (currentStep.value === 1) {
    if (!empresa.value.nome.trim()) {
      setAlert(
        "Informe o nome da empresa",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return false;
    }
    const doc = empresa.value.documento?.replace(/\D/g, "") || "";
    if (!doc || (doc.length !== 11 && doc.length !== 14)) {
      setAlert("Informe um CPF ou CNPJ válido", "error", "tabler-alert-triangle", 3000);
      return false;
    }
    if (doc.length === 11 && !validarCPF(doc)) {
      setAlert("CPF inválido. Verifique os dígitos.", "error", "tabler-alert-triangle", 3000);
      return false;
    }
    if (doc.length === 14 && !validarCNPJ(doc)) {
      setAlert("CNPJ inválido. Verifique os dígitos.", "error", "tabler-alert-triangle", 3000);
      return false;
    }
  }

  if (currentStep.value === 2) {
    if (!usuario.value.nome.trim()) {
      setAlert("Informe seu nome", "error", "tabler-alert-triangle", 3000);
      return false;
    }
    if (!usuario.value.email.trim()) {
      setAlert("Informe seu email", "error", "tabler-alert-triangle", 3000);
      return false;
    }
    if (!usuario.value.senha || usuario.value.senha.length < 6) {
      setAlert(
        "A senha deve ter no mínimo 6 caracteres",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return false;
    }
    if (usuario.value.senha !== usuario.value.confirmarSenha) {
      setAlert(
        "As senhas não conferem",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return false;
    }
  }

  if (currentStep.value === 3) {
    if (!selectedPlano.value) {
      setAlert(
        "Selecione um plano para continuar",
        "error",
        "tabler-alert-triangle",
        3000
      );
      return false;
    }
  }

  return true;
};

const nextStep = () => {
  if (!validateStep()) return;
  currentStep.value++;
};

const prevStep = () => {
  currentStep.value--;
};

// Validar dados do cartão
const validateCard = () => {
  const c = cartao.value;
  if (!c.holderName.trim()) {
    setAlert("Informe o nome impresso no cartão", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  if (c.number.replace(/\D/g, "").length < 13) {
    setAlert("Número do cartão inválido", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  if (!c.expiryMonth || !c.expiryYear) {
    setAlert("Informe a validade do cartão", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  if (!c.ccv || c.ccv.length < 3) {
    setAlert("Informe o código de segurança (CVV)", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  if (!c.postalCode || c.postalCode.replace(/\D/g, "").length < 8) {
    setAlert("Informe o CEP do titular", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  if (!c.addressNumber.trim()) {
    setAlert("Informe o número do endereço", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  if (!c.phone || c.phone.replace(/\D/g, "").length < 10) {
    setAlert("Informe o telefone do titular", "error", "tabler-alert-triangle", 3000);
    return false;
  }
  return true;
};

// Finalizar cadastro
const finalizarCadastro = async () => {
  if (!validateCard()) return;

  loading.value = true;

  try {
    const c = cartao.value;
    const docLimpo = empresa.value.documento?.replace(/\D/g, "");

    const res = await $api("/saas/cadastro", {
      method: "POST",
      body: {
        empresa_nome: empresa.value.nome,
        empresa_documento: docLimpo,
        usuario_nome: usuario.value.nome,
        usuario_email: usuario.value.email,
        usuario_senha: usuario.value.senha,
        plano_id: selectedPlano.value.id,
        ciclo: ciclo.value,
        creditCard: {
          holderName: c.holderName,
          number: c.number.replace(/\D/g, ""),
          expiryMonth: c.expiryMonth,
          expiryYear: c.expiryYear,
          ccv: c.ccv,
        },
        creditCardHolderInfo: {
          name: c.holderName,
          email: usuario.value.email,
          cpfCnpj: docLimpo,
          postalCode: c.postalCode.replace(/\D/g, ""),
          addressNumber: c.addressNumber,
          phone: c.phone.replace(/\D/g, ""),
        },
      },
    });

    if (res.success) {
      // Auto-login: setar cookies e redirecionar para home
      if (res.accessToken && res.userData) {
        const cookieOptions = { maxAge: 8 * 24 * 60 * 60 };

        const userAbilityRulesJSON = JSON.parse(res.userAbilityRules || '[]');
        ability.update(userAbilityRulesJSON);

        useCookie("userData", cookieOptions).value = res.userData;
        useCookie("userAbilityRules", cookieOptions).value = res.userAbilityRules;
        useCookie("accessToken", cookieOptions).value = res.accessToken;

        setAlert("Cadastro realizado com sucesso! Bem-vindo!", "success", "tabler-check", 5000);
        router.push("/home");
      } else {
        setAlert("Cadastro realizado com sucesso!", "success", "tabler-check", 5000);
        router.push("/login");
      }
    }
  } catch (error) {
    console.error("Erro no cadastro:", error);
    setAlert(
      error?.response?._data?.error || "Erro ao realizar cadastro. Verifique os dados do cartão.",
      "error",
      "tabler-alert-triangle",
      5000
    );
  }

  loading.value = false;
};

// Formatar valor
const formatCurrency = (value) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
};

const calcularValor = (plano) => {
  if (!plano) return 0;
  return ciclo.value === "YEARLY"
    ? plano.valor_mensal * 12 * 0.9
    : plano.valor_mensal;
};

// Gerar opções de meses e anos para validade do cartão
const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, i) => String(currentYear + i));

// Steps info
const steps = [
  { icon: "tabler-building", label: "Empresa" },
  { icon: "tabler-user", label: "Seu acesso" },
  { icon: "tabler-rocket", label: "Plano" },
  { icon: "tabler-credit-card", label: "Pagamento" },
];

// Features helper
const getFeaturesList = (plano) => {
  if (!plano?.features) return [];
  const list = [];
  if (plano.features.qtdFuncionarios)
    list.push({
      icon: "tabler-users",
      text: `Até ${plano.features.qtdFuncionarios} funcionários`,
    });
  if (plano.features.gerenciamentoEstoque)
    list.push({ icon: "tabler-package", text: "Gestão de Estoque" });
  if (plano.features.acessoCRM)
    list.push({ icon: "tabler-heart-handshake", text: "CRM Completo" });
  if (plano.features.acessoCalculadora)
    list.push({ icon: "tabler-calculator", text: "Calculadora Avançada" });
  return list;
};

const confirmPasswordMatchValidator = (value) => {
  return value === usuario.value.senha || "As senhas não conferem";
};

onMounted(() => {
  getPlanos();
});
</script>

<template>
  <div class="cadastro-page">
    <!-- Background decorativo -->
    <div class="bg-decoration">
      <div class="bg-orb bg-orb-1" />
      <div class="bg-orb bg-orb-2" />
    </div>

    <div class="cadastro-container">
      <!-- Header -->
      <div class="cadastro-header">
        <img :src="currentLogo" :alt="brandName" class="cadastro-logo" />
        <p class="cadastro-subtitle">Crie sua conta em poucos passos</p>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar">
        <div class="progress-steps">
          <template v-for="(step, idx) in steps" :key="idx">
            <div
              class="progress-step"
              :class="{
                active: currentStep === idx + 1,
                done: currentStep > idx + 1,
              }"
            >
              <div class="step-circle">
                <VIcon
                  v-if="currentStep > idx + 1"
                  icon="tabler-check"
                  size="18"
                />
                <VIcon v-else :icon="step.icon" size="18" />
              </div>
              <span class="step-label">{{ step.label }}</span>
            </div>
            <div
              v-if="idx < steps.length - 1"
              class="step-connector"
              :class="{ filled: currentStep > idx + 1 }"
            />
          </template>
        </div>
      </div>

      <!-- Card principal -->
      <div class="cadastro-card" :class="{ 'card-wide': currentStep === 3 }">
        <!-- STEP 1: Empresa -->
        <Transition name="step-fade" mode="out-in">
          <div v-if="currentStep === 1" key="step1" class="step-content">
            <div class="step-header">
              <h2>Qual o nome da sua empresa?</h2>
              <p>Precisamos apenas dessas duas informações para começar.</p>
            </div>

            <div class="form-fields">
              <div class="field-group">
                <AppTextField
                  v-model="empresa.nome"
                  label="Nome da empresa"
                  placeholder="Ex: Barbearia do João, Clínica Estética Bella..."
                  :rules="[requiredValidator]"
                  autofocus
                />
              </div>

              <div class="field-group">
                <AppTextField
                  v-model="empresa.documento"
                  label="CPF ou CNPJ"
                  placeholder="Digite o CPF ou CNPJ"
                  :rules="[requiredValidator]"
                  v-mask="['###.###.###-##', '##.###.###/####-##']"
                />
                <span class="field-hint"
                  >Detectamos automaticamente se é CPF ou CNPJ</span
                >
              </div>
            </div>
          </div>
        </Transition>

        <!-- STEP 2: Usuário -->
        <Transition name="step-fade" mode="out-in">
          <div v-if="currentStep === 2" key="step2" class="step-content">
            <div class="step-header">
              <h2>Crie seu acesso</h2>
              <p>Esse será o login do administrador da conta.</p>
            </div>

            <div class="form-fields">
              <div class="field-group">
                <AppTextField
                  v-model="usuario.nome"
                  label="Seu nome"
                  placeholder="Nome completo"
                  :rules="[requiredValidator]"
                  autofocus
                />
              </div>

              <div class="field-group">
                <AppTextField
                  v-model="usuario.email"
                  label="Email"
                  placeholder="seu@email.com"
                  type="email"
                  :rules="[requiredValidator, emailValidator]"
                />
              </div>

              <div class="field-row">
                <div class="field-group">
                  <AppTextField
                    v-model="usuario.senha"
                    label="Senha"
                    placeholder="Mínimo 6 caracteres"
                    :type="showPassword ? 'text' : 'password'"
                    :append-inner-icon="
                      showPassword ? 'tabler-eye-off' : 'tabler-eye'
                    "
                    @click:append-inner="showPassword = !showPassword"
                    :rules="[requiredValidator]"
                  />
                </div>

                <div class="field-group">
                  <AppTextField
                    v-model="usuario.confirmarSenha"
                    label="Confirmar senha"
                    placeholder="Repita a senha"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    :append-inner-icon="
                      showConfirmPassword ? 'tabler-eye-off' : 'tabler-eye'
                    "
                    @click:append-inner="
                      showConfirmPassword = !showConfirmPassword
                    "
                    :rules="[requiredValidator, confirmPasswordMatchValidator]"
                  />
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- STEP 3: Plano -->
        <Transition name="step-fade" mode="out-in">
          <div v-if="currentStep === 3" key="step3" class="step-content">
            <div class="step-header">
              <h2>Escolha seu plano</h2>
              <p>Você pode trocar de plano a qualquer momento.</p>
            </div>

            <div class="planos-grid">
              <div
                v-for="plano in planos"
                :key="plano.id"
                class="plano-card"
                :class="{
                  selected: selectedPlano?.id === plano.id,
                  popular: plano.tags?.includes('popular'),
                }"
                @click="selectedPlano = plano"
              >
                <div v-if="plano.tags?.includes('popular')" class="plano-badge">
                  Mais popular
                </div>

                <div class="plano-header">
                  <h3>{{ plano.nome }}</h3>
                  <p v-if="plano.descricao" class="plano-desc">
                    {{ plano.descricao }}
                  </p>
                </div>

                <div class="plano-price">
                  <span class="price-value">{{
                    formatCurrency(calcularValor(plano))
                  }}</span>
                  <span class="price-period">/mês</span>
                </div>

                <div v-if="plano.dias_teste > 0" class="plano-trial">
                  <VIcon icon="tabler-gift" size="16" />
                  {{ plano.dias_teste }} dias grátis para testar
                </div>

                <div class="plano-features">
                  <div
                    v-for="(feat, fi) in getFeaturesList(plano)"
                    :key="fi"
                    class="plano-feature"
                  >
                    <VIcon :icon="feat.icon" size="18" />
                    <span>{{ feat.text }}</span>
                  </div>
                </div>

                <div class="plano-select-indicator">
                  <VIcon
                    :icon="
                      selectedPlano?.id === plano.id
                        ? 'tabler-circle-check-filled'
                        : 'tabler-circle'
                    "
                    :size="24"
                  />
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- STEP 4: Pagamento -->
        <Transition name="step-fade" mode="out-in">
          <div v-if="currentStep === 4" key="step4" class="step-content">
            <div class="step-header">
              <h2>Dados de pagamento</h2>
              <p>
                Informe os dados do cartão de crédito.
                <template v-if="selectedPlano?.dias_teste > 0">
                  Você não será cobrado durante o período de teste de {{ selectedPlano.dias_teste }} dias.
                </template>
              </p>
            </div>

            <div class="form-fields">
              <div class="field-group">
                <AppTextField
                  v-model="cartao.holderName"
                  label="Nome impresso no cartão"
                  placeholder="Como está no cartão"
                  :rules="[requiredValidator]"
                  autofocus
                />
              </div>

              <div class="field-group">
                <AppTextField
                  v-model="cartao.number"
                  label="Número do cartão"
                  placeholder="0000 0000 0000 0000"
                  :rules="[requiredValidator]"
                  v-mask="['#### #### #### ####']"
                />
              </div>

              <div class="field-row">
                <div class="field-group">
                  <AppSelect
                    v-model="cartao.expiryMonth"
                    label="Mês"
                    :items="months"
                    placeholder="MM"
                    :rules="[requiredValidator]"
                  />
                </div>
                <div class="field-group">
                  <AppSelect
                    v-model="cartao.expiryYear"
                    label="Ano"
                    :items="years"
                    placeholder="AAAA"
                    :rules="[requiredValidator]"
                  />
                </div>
                <div class="field-group">
                  <AppTextField
                    v-model="cartao.ccv"
                    label="CVV"
                    placeholder="123"
                    maxlength="4"
                    :rules="[requiredValidator]"
                    v-mask="['####']"
                  />
                </div>
              </div>

              <div class="field-row">
                <div class="field-group">
                  <AppTextField
                    v-model="cartao.postalCode"
                    label="CEP do titular"
                    placeholder="00000-000"
                    :rules="[requiredValidator]"
                    v-mask="['#####-###']"
                  />
                </div>
                <div class="field-group">
                  <AppTextField
                    v-model="cartao.addressNumber"
                    label="Número"
                    placeholder="123"
                    :rules="[requiredValidator]"
                  />
                </div>
              </div>

              <div class="field-group">
                <AppTextField
                  v-model="cartao.phone"
                  label="Telefone do titular"
                  placeholder="(00) 00000-0000"
                  :rules="[requiredValidator]"
                  v-mask="['(##) #####-####', '(##) ####-####']"
                />
              </div>
            </div>
          </div>
        </Transition>

        <!-- Navegação -->
        <div class="step-nav">
          <button
            v-if="currentStep > 1"
            class="nav-btn nav-btn-back"
            @click="prevStep"
          >
            <VIcon icon="tabler-arrow-left" size="18" />
            Voltar
          </button>
          <button
            v-else
            class="nav-btn nav-btn-back"
            @click="router.push('/login')"
          >
            <VIcon icon="tabler-arrow-left" size="18" />
            Já tenho conta
          </button>

          <button
            v-if="currentStep < totalSteps"
            class="nav-btn nav-btn-next"
            @click="nextStep"
          >
            Continuar
            <VIcon icon="tabler-arrow-right" size="18" />
          </button>
          <button
            v-else
            class="nav-btn nav-btn-finish"
            :disabled="loading"
            @click="finalizarCadastro"
          >
            <VProgressCircular
              v-if="loading"
              indeterminate
              size="18"
              width="2"
              color="white"
            />
            <template v-else>
              <VIcon icon="tabler-lock" size="18" />
              Finalizar cadastro
            </template>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$primary: #7c5ce0;
$primary-hover: #6a4bd0;
$primary-soft: rgba(124, 92, 224, 0.08);
$cyan: #38bcd8;
$gradient: linear-gradient(135deg, #7c5ce0 0%, #38bcd8 100%);
$ink: #1b1f3b;
$ink-light: #495072;
$ink-muted: #7b82a0;
$border: #e2e6f0;
$bg: #f4f6fb;
$green: #2db87a;
$green-soft: rgba(45, 184, 122, 0.06);
$radius: 16px;

.cadastro-page {
  min-height: 100vh;
  background: $bg;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  position: relative;
  overflow: hidden;
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
}

/* Background decorativo */
.bg-decoration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.15;

  &-1 {
    width: 600px;
    height: 600px;
    background: $primary;
    top: -200px;
    right: -100px;
  }

  &-2 {
    width: 500px;
    height: 500px;
    background: $cyan;
    bottom: -200px;
    left: -100px;
  }
}

.cadastro-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  transition: max-width 0.4s ease;
}

/* Quando está no step de planos, alarga */
.cadastro-container:has(.card-wide) {
  max-width: 900px;
}

/* Header */
.cadastro-header {
  text-align: center;

  .cadastro-logo {
    height: 40px;
    margin-bottom: 8px;
  }

  .cadastro-subtitle {
    font-size: 14px;
    color: $ink-muted;
    font-weight: 500;
  }
}

/* Progress bar */
.progress-bar {
  width: 100%;
  max-width: 520px;
}

.progress-steps {
  display: flex;
  align-items: center;
  gap: 0;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  .step-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border: 2px solid $border;
    color: $ink-muted;
    transition: all 0.3s ease;
  }

  .step-label {
    font-size: 12px;
    font-weight: 600;
    color: $ink-muted;
    transition: color 0.3s ease;
  }

  &.active {
    .step-circle {
      background: $primary;
      border-color: $primary;
      color: #fff;
      box-shadow: 0 4px 16px rgba(124, 92, 224, 0.3);
    }
    .step-label {
      color: $primary;
    }
  }

  &.done {
    .step-circle {
      background: $green;
      border-color: $green;
      color: #fff;
    }
    .step-label {
      color: $green;
    }
  }
}

.step-connector {
  flex: 1;
  height: 2px;
  background: $border;
  margin: 0 8px;
  margin-bottom: 22px;
  border-radius: 2px;
  transition: background 0.3s ease;

  &.filled {
    background: $green;
  }
}

/* Card principal */
.cadastro-card {
  width: 100%;
  background: #fff;
  border-radius: $radius;
  padding: 36px 32px;
  box-shadow: 0 4px 24px rgba(27, 31, 59, 0.06);
  transition: all 0.4s ease;
}

/* Step content */
.step-content {
  min-height: 200px;
}

.step-header {
  margin-bottom: 28px;

  h2 {
    font-size: 22px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }

  p {
    font-size: 15px;
    color: $ink-muted;
    line-height: 1.5;
  }
}

/* Form fields */
.form-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group {
  position: relative;
  flex: 1;
}

.field-row {
  display: flex;
  gap: 16px;

  @media (max-width: 600px) {
    flex-direction: column;
    gap: 8px;
  }
}

.field-hint {
  display: block;
  font-size: 12px;
  color: $ink-muted;
  margin-top: 2px;
  padding-left: 2px;
}

/* Step transition */
.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Planos */
.planos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.plano-card {
  position: relative;
  background: #fff;
  border: 2px solid $border;
  border-radius: 14px;
  padding: 28px 24px;
  cursor: pointer;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    border-color: rgba(124, 92, 224, 0.3);
    box-shadow: 0 4px 20px rgba(124, 92, 224, 0.08);
  }

  &.selected {
    border-color: $primary;
    background: $primary-soft;
    box-shadow: 0 4px 20px rgba(124, 92, 224, 0.12);
  }

  &.popular {
    border-color: rgba(124, 92, 224, 0.3);
  }
}

.plano-badge {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  background: $gradient;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 14px;
  border-radius: 20px;
  white-space: nowrap;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.plano-header {
  margin-bottom: 16px;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 4px;
  }

  .plano-desc {
    font-size: 13px;
    color: $ink-muted;
    line-height: 1.5;
  }
}

.plano-price {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 12px;

  .price-value {
    font-size: 28px;
    font-weight: 800;
    color: $ink;
    letter-spacing: -0.02em;
  }

  .price-period {
    font-size: 14px;
    color: $ink-muted;
    font-weight: 500;
  }
}

.plano-trial {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: $green-soft;
  color: $green;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  align-self: flex-start;
}

.plano-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.plano-feature {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: $ink-light;

  .v-icon {
    color: $primary;
    flex-shrink: 0;
  }
}

.plano-select-indicator {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  color: $border;

  .plano-card.selected & {
    color: $primary;
  }
}

/* Navegação */
.step-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid $border;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  font-family: inherit;

  &-back {
    background: transparent;
    color: $ink-muted;

    &:hover {
      background: rgba(0, 0, 0, 0.04);
      color: $ink;
    }
  }

  &-next {
    background: $primary;
    color: #fff;

    &:hover {
      background: $primary-hover;
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(124, 92, 224, 0.3);
    }
  }

  &-finish {
    background: $gradient;
    color: #fff;
    padding: 12px 28px;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 24px rgba(124, 92, 224, 0.3);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

/* Responsive */
@media (max-width: 600px) {
  .cadastro-card {
    padding: 28px 20px;
  }

  .step-header h2 {
    font-size: 20px;
  }

  .planos-grid {
    grid-template-columns: 1fr;
  }

  .nav-btn {
    padding: 10px 16px;
    font-size: 13px;
  }
}
</style>
