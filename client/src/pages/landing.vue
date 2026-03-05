<script setup>
import logoDaviot from "@images/daviot-logo.png";
import { isDaviot } from "@/utils/typeClient";
import logoOregon from "@images/logo.png";

const router = useRouter();
const currentLogo = isDaviot() ? logoDaviot : logoOregon;
const brandName = isDaviot() ? 'Daviot' : 'Oregon';

const mobileMenu = ref(false);
const scrollY = ref(0);
const activeFeature = ref(0);

const features = [
  {
    icon: 'tabler-calendar-event',
    title: 'Agendamentos',
    desc: 'Controle total da sua agenda. Horários, profissionais, serviços e subserviços com configurações flexíveis por profissional.',
    detail: 'Redução de 80% em conflitos de horário',
  },
  {
    icon: 'tabler-heart-handshake',
    title: 'CRM Completo',
    desc: 'Funis de venda, negócios, segmentações, campanhas de disparo e gestão completa do relacionamento com seus clientes.',
    detail: 'Pipeline visual drag-and-drop',
  },
  {
    icon: 'tabler-robot',
    title: 'IA no Atendimento',
    desc: 'Fluxos automatizados com inteligência artificial integrada. Atendimento 24h pelo WhatsApp com respostas contextuais.',
    detail: 'Respostas em segundos, não horas',
  },
  {
    icon: 'tabler-coin',
    title: 'Financeiro',
    desc: 'Contas a pagar, receber, despesas e comissionamento automático por serviço com percentuais personalizáveis.',
    detail: 'Zero planilhas, zero erro humano',
  },
  {
    icon: 'tabler-package',
    title: 'Estoque',
    desc: 'Controle de produtos, ordens de entrada e retirada, setores e movimentação completa do seu inventário.',
    detail: 'Rastreabilidade total',
  },
  {
    icon: 'tabler-chart-pie-2',
    title: 'Relatórios',
    desc: 'Dashboards com métricas financeiras, de serviços, agendamentos, CRM e atendimento. Decisões baseadas em dados.',
    detail: 'Visão 360 do seu negócio',
  },
];

const capabilities = [
  'Chat integrado ao WhatsApp',
  'Disparos em massa segmentados',
  'Contratos digitais com assinatura',
  'Calculadora de precificação',
  'Multi-usuários com permissões',
  'Lembretes automáticos',
  'Fluxos de automação visuais',
  'Multi-empresa (SaaS)',
];

const testimonials = [
  { name: 'Carolina M.', role: 'Dona de Clínica Estética', text: 'Antes eu perdia horas organizando agenda no papel. Agora levo 5 minutos no dia. O atendimento automático pelo WhatsApp mudou meu negócio.' },
  { name: 'Rafael S.', role: 'Gerente de Barbearia', text: 'O CRM me ajudou a recuperar clientes que tinham sumido. As campanhas de disparo trouxeram um retorno absurdo.' },
  { name: 'Juliana P.', role: 'Dona de Salão', text: 'O sistema de comissões acabou com toda confusão que eu tinha com meus profissionais. Agora cada um vê o que ganhou, sem discussão.' },
];

const handleScroll = () => {
  scrollY.value = window.scrollY;
};

const observeElements = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
  );

  document.querySelectorAll('.anim').forEach((el) => observer.observe(el));
};

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true });
  nextTick(() => observeElements());
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});

const goToSignup = () => {
  window.location.href = 'https://daviot.com.br/cadastro-empresa';
}
const goToLogin = () => {
  window.location.href = 'https://daviot.com.br/login';
}
</script>

<template>
  <div class="lp">
    <!-- NAV -->
    <nav class="lp-nav" :class="{ scrolled: scrollY > 40 }">
      <div class="nav-wrap">
        <img :src="currentLogo" :alt="brandName" class="nav-logo" @click="window.scrollTo({top:0,behavior:'smooth'})" />
        <div class="nav-center hide-m">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#como">Como funciona</a>
          <a href="#depoimentos">Depoimentos</a>
        </div>
        <div class="nav-right hide-m">
          <button class="btn-text" @click="goToLogin">Entrar</button>
          <button class="btn-primary" @click="goToSignup">Começar grátis</button>
        </div>
        <button class="burger show-m" @click="mobileMenu = !mobileMenu" :class="{ open: mobileMenu }">
          <span /><span /><span />
        </button>
      </div>
      <Transition name="slide-down">
        <div v-if="mobileMenu" class="mobile-dropdown">
          <a href="#funcionalidades" @click="mobileMenu = false">Funcionalidades</a>
          <a href="#como" @click="mobileMenu = false">Como funciona</a>
          <a href="#depoimentos" @click="mobileMenu = false">Depoimentos</a>
          <hr />
          <button class="btn-text w-full" @click="goToLogin(); mobileMenu = false">Entrar</button>
          <button class="btn-primary w-full" @click="goToSignup(); mobileMenu = false">Começar grátis</button>
        </div>
      </Transition>
    </nav>

    <!-- HERO -->
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-left anim anim-up">
          <p class="hero-eyebrow">Plataforma de gestão para serviços</p>
          <h1>
            Pare de gerenciar<br />
            no improviso.<br />
            <span class="hero-accent">Comece a escalar.</span>
          </h1>
          <p class="hero-sub">
            Agendamentos, CRM, atendimento com inteligência artificial, financeiro e estoque.
            Uma plataforma. Nenhuma gambiarra.
          </p>
          <div class="hero-btns">
            <button class="btn-primary btn-lg" @click="goToSignup()">
              Criar conta gratuita
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </button>
            <button class="btn-secondary btn-lg" @click="goToLogin()">Já tenho conta</button>
          </div>
        </div>
        <div class="hero-right anim anim-scale">
          <div class="hero-card-stack">
            <div class="h-card h-card-1">
              <div class="h-card-icon"><i class="tabler-calendar-check" /></div>
              <div>
                <strong>14:30 - Corte + Barba</strong>
                <span>João Silva - Confirmado</span>
              </div>
            </div>
            <div class="h-card h-card-2">
              <div class="h-card-icon green"><i class="tabler-message-circle" /></div>
              <div>
                <strong>IA respondeu em 3s</strong>
                <span>"Seu horário está confirmado!"</span>
              </div>
            </div>
            <div class="h-card h-card-3">
              <div class="h-card-icon amber"><i class="tabler-chart-bar" /></div>
              <div>
                <strong>Faturamento +32%</strong>
                <span>Comparado ao mês anterior</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="hero-metrics anim anim-up" style="--d:400ms">
        <div class="metric">
          <span class="metric-num">+500</span>
          <span class="metric-label">Empresas ativas</span>
        </div>
        <div class="metric">
          <span class="metric-num">24/7</span>
          <span class="metric-label">Atendimento IA</span>
        </div>
        <div class="metric">
          <span class="metric-num">98%</span>
          <span class="metric-label">Satisfação</span>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section id="funcionalidades" class="section-feat">
      <div class="section-wrap">
        <div class="section-top anim anim-up">
          <p class="label">Funcionalidades</p>
          <h2>Tudo que seu negócio precisa.<br />Nada que não precisa.</h2>
        </div>
        <div class="feat-layout">
          <div class="feat-tabs anim anim-left">
            <button
              v-for="(f, i) in features"
              :key="i"
              class="feat-tab"
              :class="{ active: activeFeature === i }"
              @click="activeFeature = i"
            >
              <div class="feat-tab-icon"><i :class="f.icon" /></div>
              <span>{{ f.title }}</span>
            </button>
          </div>
          <div class="feat-detail anim anim-right">
            <Transition name="feat-switch" mode="out-in">
              <div :key="activeFeature" class="feat-content">
                <div class="feat-content-icon"><i :class="features[activeFeature].icon" /></div>
                <h3>{{ features[activeFeature].title }}</h3>
                <p>{{ features[activeFeature].desc }}</p>
                <div class="feat-badge">{{ features[activeFeature].detail }}</div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW -->
    <section id="como" class="section-how">
      <div class="section-wrap">
        <div class="section-top anim anim-up">
          <p class="label">Como funciona</p>
          <h2>Três passos. Sem complicação.</h2>
        </div>
        <div class="steps">
          <div class="step anim anim-up" style="--d:0ms">
            <div class="step-num">01</div>
            <h3>Cadastre sua empresa</h3>
            <p>Preencha os dados e crie sua conta de administrador em menos de 3 minutos.</p>
          </div>
          <div class="step-arrow anim anim-up" style="--d:100ms">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
          <div class="step anim anim-up" style="--d:200ms">
            <div class="step-num">02</div>
            <h3>Configure seus serviços</h3>
            <p>Adicione serviços, profissionais, horários e personalize tudo ao seu jeito.</p>
          </div>
          <div class="step-arrow anim anim-up" style="--d:300ms">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
          <div class="step anim anim-up" style="--d:400ms">
            <div class="step-num">03</div>
            <h3>Comece a operar</h3>
            <p>Agende, atenda, venda e gerencie. Tudo integrado em uma única plataforma.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CAPABILITIES -->
    <section class="section-caps">
      <div class="section-wrap">
        <div class="section-top anim anim-up">
          <p class="label">E tem mais</p>
          <h2>Recursos que fazem a diferença.</h2>
        </div>
        <div class="caps-marquee anim anim-up" style="--d:200ms">
          <div class="marquee-track">
            <span v-for="(c, i) in [...capabilities, ...capabilities]" :key="i" class="cap-pill">{{ c }}</span>
          </div>
        </div>
        <div class="caps-marquee caps-marquee-rev anim anim-up" style="--d:350ms">
          <div class="marquee-track-rev">
            <span v-for="(c, i) in [...capabilities, ...capabilities].reverse()" :key="'r'+i" class="cap-pill alt">{{ c }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- TESTIMONIALS -->
    <section id="depoimentos" class="section-test">
      <div class="section-wrap">
        <div class="section-top anim anim-up">
          <p class="label">Depoimentos</p>
          <h2>Quem usa, recomenda.</h2>
        </div>
        <div class="test-grid">
          <div v-for="(t, i) in testimonials" :key="i" class="test-card anim anim-up" :style="{ '--d': `${i * 120}ms` }">
            <p class="test-text">"{{ t.text }}"</p>
            <div class="test-author">
              <div class="test-avatar">{{ t.name.charAt(0) }}</div>
              <div>
                <strong>{{ t.name }}</strong>
                <span>{{ t.role }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="section-cta">
      <div class="cta-inner anim anim-scale">
        <h2>Pronto para transformar sua gestão?</h2>
        <p>Cadastre sua empresa agora e comece a usar em minutos. Sem cartão de crédito para começar.</p>
        <button class="btn-primary btn-lg btn-white" @click="goToSignup()">
          Criar conta gratuita
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="lp-footer">
      <div class="section-wrap">
        <div class="footer-top">
          <div class="footer-brand">
            <img :src="currentLogo" :alt="brandName" />
            <p>Plataforma completa para gestão de serviços, agendamentos e relacionamento com clientes.</p>
          </div>
          <div class="footer-cols">
            <div class="footer-col">
              <h4>Produto</h4>
              <a href="#funcionalidades">Funcionalidades</a>
              <a href="#como">Como funciona</a>
              <a href="#depoimentos">Depoimentos</a>
            </div>
            <div class="footer-col">
              <h4>Conta</h4>
              <a @click="goToSignup()" style="cursor:pointer">Cadastro</a>
              <a @click="goToLogin()" style="cursor:pointer">Login</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; {{ new Date().getFullYear() }} {{ brandName }}. Todos os direitos reservados.</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&display=swap');
</style>

<style lang="scss" scoped>
/* === TOKENS === */
$white: #F8FAFC;
$bg-cool: #F1F4F9;
$bg-feature: #F4F6FB;
$ink: #1B1F3B;
$ink-light: #495072;
$ink-muted: #7B82A0;
$border: #DEE3EF;
$primary: #7C5CE0;
$primary-hover: #6A4BD0;
$primary-soft: rgba(124, 92, 224, 0.08);
$cyan: #38BCD8;
$cyan-soft: rgba(56, 188, 216, 0.08);
$gradient: linear-gradient(135deg, #7C5CE0 0%, #38BCD8 100%);
$green: #2DB87A;
$green-soft: rgba(45, 184, 122, 0.08);
$radius: 12px;

h1, h2, h3, h4, h5, h6 {
  color: $ink !important;
}

/* === BASE === */
.lp {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background: $white;
  color: $ink;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  line-height: 1.6;
}

/* === ANIMATIONS === */
.anim {
  opacity: 0;
  transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
              transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--d, 0ms);

  &.anim-up { transform: translateY(40px); }
  &.anim-left { transform: translateX(-40px); }
  &.anim-right { transform: translateX(40px); }
  &.anim-scale { transform: scale(0.94); }

  &.visible {
    opacity: 1;
    transform: none;
  }
}

/* Feature switch transition */
.feat-switch-enter-active,
.feat-switch-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.feat-switch-enter-from { opacity: 0; transform: translateY(12px); }
.feat-switch-leave-to { opacity: 0; transform: translateY(-12px); }

/* Mobile menu transition */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* === NAV === */
.lp-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  transition: all 0.3s ease;

  &.scrolled {
    background: rgba(248, 250, 252, 0.92);
    backdrop-filter: blur(16px);
    box-shadow: 0 1px 0 $border;
  }
}

.nav-wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 28px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-logo {
  height: 32px;
  cursor: pointer;
}

.nav-center {
  display: flex;
  gap: 36px;

  a {
    color: $ink-light;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s;
    &:hover { color: $ink; }
  }
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* === BUTTONS === */
.btn-primary {
  background: $primary;
  color: #fff;
  border: none;
  padding: 10px 22px;
  border-radius: 10px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: $primary-hover;
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(124, 92, 224, 0.25);
  }
}

.btn-secondary {
  background: transparent;
  color: $ink;
  border: 1.5px solid $border;
  padding: 10px 22px;
  border-radius: 10px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: $primary;
    color: $primary;
    background: $primary-soft;
  }
}

.btn-text {
  background: none;
  border: none;
  color: $ink-light;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 500;
  font-size: 14px;
  padding: 10px 16px;
  cursor: pointer;
  transition: color 0.2s;
  &:hover { color: $primary; }
}

.btn-lg {
  padding: 14px 28px;
  font-size: 15px;
  border-radius: 12px;
}

.btn-white {
  background: #fff;
  color: $primary;
  &:hover {
    background: #f5f5f5;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  }
}

.w-full { width: 100%; justify-content: center; }

/* === MOBILE NAV === */
.show-m { display: none !important; }

.burger {
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;

  span {
    width: 20px;
    height: 2px;
    background: $ink;
    border-radius: 2px;
    transition: all 0.3s ease;
  }

  &.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  &.open span:nth-child(2) { opacity: 0; }
  &.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
}

.mobile-dropdown {
  padding: 8px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(248, 250, 252, 0.98);

  a {
    color: $ink-light;
    text-decoration: none;
    font-size: 15px;
    font-weight: 500;
    padding: 8px 0;
  }

  hr {
    border: none;
    border-top: 1px solid $border;
    margin: 4px 0;
  }
}

@media (max-width: 768px) {
  .hide-m { display: none !important; }
  .show-m { display: flex; }
}

/* === HERO === */
.hero {
  padding: 140px 28px 80px;
  max-width: 1200px;
  margin: 0 auto;
}

.hero-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
}

.hero-eyebrow {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: $primary;
  margin-bottom: 20px;
}

.hero h1 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: clamp(36px, 5vw, 54px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.03em;
  margin-bottom: 24px;
}

.hero-accent {
  background: $gradient;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-sub {
  font-size: 17px;
  color: $ink-light;
  line-height: 1.7;
  max-width: 460px;
  margin-bottom: 36px;
}

.hero-btns {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

/* Hero cards */
.hero-card-stack {
  position: relative;
  height: 340px;
}

.h-card {
  position: absolute;
  background: #fff;
  border: 1px solid $border;
  border-radius: $radius;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(27, 31, 59, 0.06);
  width: 320px;
  transition: transform 0.3s ease;

  &:hover { transform: translateY(-4px) !important; }

  strong { display: block; font-size: 14px; color: $ink; }
  span { font-size: 13px; color: $ink-muted; }
}

.h-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: $primary-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  i { font-size: 20px; color: $primary; }

  &.green {
    background: $green-soft;
    i { color: $green; }
  }

  &.amber {
    background: $cyan-soft;
    i { color: $cyan; }
  }
}

.h-card-1 { top: 0; left: 10px; transform: rotate(-2deg); }
.h-card-2 { top: 120px; left: 50px; transform: rotate(1deg); }
.h-card-3 { top: 240px; left: 20px; transform: rotate(-1deg); }

/* Metrics */
.hero-metrics {
  display: flex;
  gap: 48px;
  margin-top: 72px;
  padding-top: 40px;
  border-top: 1px solid $border;
}

.metric-num {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 800;
  font-size: 32px;
  display: block;
  line-height: 1;
  margin-bottom: 6px;
  background: $gradient;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.metric-label {
  font-size: 13px;
  color: $ink-muted;
  font-weight: 500;
}

/* === FEATURES === */
.section-feat {
  padding: 120px 0;
  background: $bg-feature;
}

.section-wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 28px;
}

.section-top {
  margin-bottom: 56px;

  .label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: $primary;
    margin-bottom: 12px;
  }

  h2 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }
}

.feat-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 40px;
  align-items: start;
}

.feat-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.feat-tab {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border: none;
  background: transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  font-family: 'Plus Jakarta Sans', sans-serif;

  span {
    font-size: 15px;
    font-weight: 500;
    color: $ink-light;
    transition: color 0.2s;
  }

  .feat-tab-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    i { font-size: 18px; color: $ink-muted; transition: color 0.2s; }
  }

  &:hover {
    background: rgba(124, 92, 224, 0.04);
  }

  &.active {
    background: #fff;
    box-shadow: 0 2px 12px rgba(124, 92, 224, 0.08);

    span { color: $ink; font-weight: 700; }
    .feat-tab-icon {
      background: $primary-soft;
      i { color: $primary; }
    }
  }
}

.feat-detail {
  background: #fff;
  border-radius: 20px;
  padding: 48px;
  box-shadow: 0 2px 16px rgba(27, 31, 59, 0.04);
  min-height: 280px;
  display: flex;
  align-items: center;
}

.feat-content {
  .feat-content-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: $primary-soft;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;

    i { font-size: 26px; color: $primary; }
  }

  h3 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 24px;
    margin-bottom: 14px;
    font-weight: 700;
  }

  p {
    color: $ink-light;
    font-size: 16px;
    line-height: 1.7;
    margin-bottom: 20px;
    max-width: 440px;
  }
}

.feat-badge {
  display: inline-block;
  padding: 6px 14px;
  background: $green-soft;
  color: $green;
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
}

/* === HOW === */
.section-how {
  padding: 120px 0;
}

.steps {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.step {
  flex: 1;
  padding: 32px 28px;
  background: $bg-cool;
  border-radius: 20px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(27, 31, 59, 0.06);
  }

  .step-num {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 44px;
    font-weight: 800;
    background: $gradient;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    opacity: 0.3;
    line-height: 1;
    margin-bottom: 16px;
  }

  h3 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 10px;
  }

  p {
    font-size: 15px;
    color: $ink-light;
    line-height: 1.65;
  }
}

.step-arrow {
  display: flex;
  align-items: center;
  padding-top: 52px;
  color: $border;
  flex-shrink: 0;
}

/* === CAPABILITIES === */
.section-caps {
  padding: 100px 0;
  background: $bg-feature;
  overflow: hidden;
}

.caps-marquee {
  overflow: hidden;
  margin-top: 24px;
}

.marquee-track {
  display: flex;
  gap: 12px;
  animation: marquee 30s linear infinite;
  width: max-content;
}

.marquee-track-rev {
  display: flex;
  gap: 12px;
  animation: marquee-rev 35s linear infinite;
  width: max-content;
}

.cap-pill {
  padding: 12px 24px;
  background: #fff;
  border: 1px solid $border;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 500;
  color: $ink;
  white-space: nowrap;
  transition: all 0.2s;

  &.alt {
    background: transparent;
    border-color: darken($border, 5%);
    color: $ink-light;
  }
}

@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes marquee-rev {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}

/* === TESTIMONIALS === */
.section-test {
  padding: 120px 0;
}

.test-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.test-card {
  background: $bg-cool;
  border-radius: 20px;
  padding: 36px 32px;
  transition: transform 0.3s ease;

  &:hover { transform: translateY(-4px); }

  &:nth-child(2) { transform: translateY(24px); &:hover { transform: translateY(20px); } }
}

.test-text {
  font-size: 16px;
  line-height: 1.7;
  margin-bottom: 28px;
  color: $ink-light;
}

.test-author {
  display: flex;
  align-items: center;
  gap: 12px;

  strong { display: block; font-size: 14px; }
  span { font-size: 13px; color: $ink-muted; }
}

.test-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: $gradient;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}

/* === CTA === */
.section-cta {
  padding: 40px 28px 100px;
}

.cta-inner {
  max-width: 900px;
  margin: 0 auto;
  background: $gradient;
  border-radius: 28px;
  padding: 80px 60px;
  text-align: center;
  color: #fff;

  h2 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: clamp(28px, 4vw, 38px);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
    color: #fff !important;
  }

  p {
    font-size: 17px;
    opacity: 0.85;
    max-width: 420px;
    margin: 0 auto 32px;
    line-height: 1.65;
  }
}

/* === FOOTER === */
.lp-footer {
  padding: 60px 0 32px;
  border-top: 1px solid $border;
}

.footer-top {
  display: flex;
  justify-content: space-between;
  gap: 48px;
  flex-wrap: wrap;
  margin-bottom: 48px;
}

.footer-brand {
  max-width: 300px;
  img { height: 30px; margin-bottom: 14px; }
  p { font-size: 14px; color: $ink-muted; line-height: 1.65; }
}

.footer-cols {
  display: flex;
  gap: 56px;
}

.footer-col {
  h4 {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 14px;
    color: $ink;
  }

  a {
    display: block;
    color: $ink-muted;
    text-decoration: none;
    font-size: 14px;
    margin-bottom: 10px;
    transition: color 0.2s;
    &:hover { color: $primary; }
  }
}

.footer-bottom {
  border-top: 1px solid $border;
  padding-top: 24px;
  span { font-size: 13px; color: $ink-muted; }
}

/* === RESPONSIVE === */
@media (max-width: 900px) {
  .hero-inner { grid-template-columns: 1fr; gap: 48px; }
  .hero-right { display: none; }
  .hero h1 { font-size: 36px; }
  .hero-metrics { flex-wrap: wrap; gap: 32px; }
  .feat-layout { grid-template-columns: 1fr; }
  .feat-tabs { flex-direction: row; overflow-x: auto; gap: 8px; padding-bottom: 8px; }
  .feat-tab { white-space: nowrap; }
  .steps { flex-direction: column; }
  .step-arrow {
    transform: rotate(90deg);
    padding-top: 0;
    justify-content: center;
    width: 100%;
  }
  .test-grid { grid-template-columns: 1fr; }
  .test-card:nth-child(2) { transform: none; &:hover { transform: translateY(-4px); } }
  .cta-inner { padding: 48px 28px; }
}
</style>
