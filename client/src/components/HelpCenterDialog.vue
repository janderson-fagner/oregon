<script setup>
import { useHelpCenter } from "@/composables/useHelpCenter";
import { useDisplay } from "vuetify";

const { helpDialogOpen, helpInitialTopic, closeHelp } = useHelpCenter();
const { mobile } = useDisplay();

// Estados: home, topic, post, search
const currentView = ref("home");
const topics = ref([]);
const loadingTopics = ref(false);
const posts = ref([]);
const loadingPosts = ref(false);
const currentPost = ref(null);
const loadingPost = ref(false);
const searchQuery = ref("");
const searchResults = ref([]);
const loadingSearch = ref(false);
const selectedTopicId = ref(null);
const selectedSubtopicId = ref(null);
const searchInputRef = ref(null);

// Debounce de busca
let searchTimeout = null;

// Breadcrumb
const breadcrumb = computed(() => {
  const items = [{ text: "Início", icon: "tabler-home", action: () => goHome() }];
  if (currentView.value === "topic" || currentView.value === "post") {
    const topic = topics.value.find((t) => t.id === selectedTopicId.value);
    if (topic) {
      items.push({ text: topic.nome, icon: topic.icone, action: () => selectTopic(topic.id) });
    }
    if (selectedSubtopicId.value) {
      const subtopic = topics.value
        .flatMap((t) => t.subtopics || [])
        .find((s) => s.id === selectedSubtopicId.value);
      if (subtopic) {
        items.push({ text: subtopic.nome, action: () => selectSubtopic(selectedTopicId.value, subtopic.id) });
      }
    }
  }
  if (currentView.value === "post" && currentPost.value) {
    items.push({ text: currentPost.value.titulo });
  }
  if (currentView.value === "search") {
    items.push({ text: `Resultados para "${searchQuery.value}"` });
  }
  return items;
});

// Computed: tópico selecionado
const selectedTopic = computed(() =>
  topics.value.find((t) => t.id === selectedTopicId.value)
);

// Carregar tópicos quando abre o dialog
watch(helpDialogOpen, async (open) => {
  if (open) {
    goHome();
    await fetchTopics();
    // Se veio com tópico inicial (contextual), navegar para ele
    if (helpInitialTopic.value && topics.value.length) {
      const match = topics.value.find(
        (t) => t.slug === helpInitialTopic.value
      );
      if (match) {
        selectTopic(match.id);
      }
    }
  }
});

const fetchTopics = async () => {
  loadingTopics.value = true;
  try {
    topics.value = await $api("/help-center/topics");
  } catch (err) {
    console.error("Erro ao buscar tópicos:", err);
  }
  loadingTopics.value = false;
};

const fetchPosts = async (topicId, subtopicId) => {
  loadingPosts.value = true;
  try {
    const query = {};
    if (topicId) query.topic_id = topicId;
    if (subtopicId) query.subtopic_id = subtopicId;
    posts.value = await $api("/help-center/posts", { query });
  } catch (err) {
    console.error("Erro ao buscar posts:", err);
  }
  loadingPosts.value = false;
};

const fetchPost = async (id) => {
  loadingPost.value = true;
  try {
    currentPost.value = await $api(`/help-center/posts/${id}`);
  } catch (err) {
    console.error("Erro ao buscar post:", err);
  }
  loadingPost.value = false;
};

const doSearch = async () => {
  const q = searchQuery.value?.trim();
  if (!q) {
    goHome();
    return;
  }
  currentView.value = "search";
  loadingSearch.value = true;
  try {
    searchResults.value = await $api("/help-center/search", {
      query: { q },
    });
  } catch (err) {
    console.error("Erro ao buscar:", err);
  }
  loadingSearch.value = false;
};

const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (searchQuery.value?.trim()) {
      doSearch();
    } else if (currentView.value === "search") {
      goHome();
    }
  }, 400);
};

const goHome = () => {
  currentView.value = "home";
  currentPost.value = null;
  posts.value = [];
  selectedTopicId.value = null;
  selectedSubtopicId.value = null;
  searchQuery.value = "";
  searchResults.value = [];
};

const selectTopic = (topicId) => {
  selectedTopicId.value = topicId;
  selectedSubtopicId.value = null;
  currentView.value = "topic";
  currentPost.value = null;
  searchQuery.value = "";
  fetchPosts(topicId, null);
};

const selectSubtopic = (topicId, subtopicId) => {
  selectedTopicId.value = topicId;
  selectedSubtopicId.value = subtopicId;
  currentView.value = "topic";
  currentPost.value = null;
  fetchPosts(topicId, subtopicId);
};

const openPost = (post) => {
  selectedTopicId.value = post.topic_id;
  selectedSubtopicId.value = post.subtopic_id;
  currentView.value = "post";
  fetchPost(post.id);
};

const goBack = () => {
  if (currentView.value === "post") {
    currentView.value = "topic";
    currentPost.value = null;
    fetchPosts(selectedTopicId.value, selectedSubtopicId.value);
  } else if (currentView.value === "topic" || currentView.value === "search") {
    goHome();
  }
};

// Total de artigos
const totalArticles = computed(() =>
  topics.value.reduce((sum, t) => sum + (t.post_count || 0), 0)
);
</script>

<template>
  <VDialog
    :modelValue="helpDialogOpen"
    @update:modelValue="(val) => { if (!val) closeHelp() }"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 960"
    scrollable
    content-class="help-dialog-content"
  >
    <VCard :height="mobile ? '100vh' : '85vh'" class="d-flex flex-column help-dialog-card overflow-hidden">
      <!-- ===== HEADER ===== -->
      <div class="help-header flex-shrink-0">
        <div class="help-header-bg" />
        <div class="help-header-content pa-5 pb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center gap-2">
              <VBtn
                v-if="currentView !== 'home'"
                icon
                variant="text"
                size="small"
                color="white"
                @click="goBack"
              >
                <VIcon icon="tabler-arrow-left" />
              </VBtn>
              <div>
                <h3 class="text-h6 font-weight-bold" style="color: white;">Centro de Ajuda</h3>
                <p v-if="currentView === 'home'" class="text-caption mb-0" style="color: rgba(255,255,255,0.75);">
                  {{ totalArticles }} artigos disponíveis
                </p>
              </div>
            </div>
            <VBtn icon variant="text" size="small" color="white" @click="closeHelp">
              <VIcon icon="tabler-x" size="20" />
            </VBtn>
          </div>
          <!-- Search -->
          <div class="help-search-wrapper">
            <VTextField
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="O que você precisa de ajuda?"
              prepend-inner-icon="tabler-search"
              density="comfortable"
              variant="solo"
              rounded="lg"
              hide-details
              bg-color="white"
              flat
              class="help-search-field"
              @input="onSearchInput"
              @keyup.enter="doSearch"
              clearable
              @click:clear="goHome"
            />
          </div>
        </div>
      </div>

      <!-- ===== BREADCRUMB ===== -->
      <div v-if="currentView !== 'home'" class="px-5 pt-3 pb-0 flex-shrink-0">
        <div class="d-flex align-center flex-wrap gap-1">
          <template v-for="(item, idx) in breadcrumb" :key="idx">
            <span
              :class="[
                'text-caption',
                idx < breadcrumb.length - 1 ? 'text-primary cursor-pointer help-breadcrumb-link' : 'text-disabled'
              ]"
              @click="item.action && idx < breadcrumb.length - 1 && item.action()"
            >
              <VIcon v-if="item.icon && idx === 0" :icon="item.icon" size="14" class="me-1" />
              {{ item.text }}
            </span>
            <VIcon
              v-if="idx < breadcrumb.length - 1"
              icon="tabler-chevron-right"
              size="12"
              color="disabled"
            />
          </template>
        </div>
      </div>

      <!-- ===== MAIN CONTENT ===== -->
      <div class="flex-grow-1 overflow-y-auto pa-5">
        <Transition name="help-fade" mode="out-in">
          <!-- ===== HOME: Grid de tópicos ===== -->
          <div v-if="currentView === 'home'" key="home">
            <div v-if="loadingTopics" class="d-flex justify-center pa-12">
              <VProgressCircular indeterminate color="primary" />
            </div>
            <template v-else-if="topics.length">
              <p class="text-body-2 text-medium-emphasis mb-4">Escolha uma categoria para encontrar o que precisa:</p>
              <VRow>
                <VCol
                  v-for="(topic, i) in topics"
                  :key="topic.id"
                  cols="12"
                  sm="6"
                  md="4"
                >
                  <VCard
                    class="help-topic-card cursor-pointer h-100"
                    variant="outlined"
                    rounded="lg"
                    @click="selectTopic(topic.id)"
                    :style="{ animationDelay: `${i * 60}ms` }"
                  >
                    <VCardText class="d-flex flex-column align-center text-center pa-5">
                      <div class="help-topic-icon-wrapper mb-3">
                        <VIcon
                          :icon="topic.icone || 'tabler-folder'"
                          size="28"
                          color="primary"
                        />
                      </div>
                      <h4 class="text-subtitle-1 font-weight-bold mb-1">{{ topic.nome }}</h4>
                      <p class="text-body-2 text-medium-emphasis mb-2" style="line-height: 1.4;">
                        {{ topic.descricao }}
                      </p>
                      <VChip
                        size="x-small"
                        color="primary"
                        variant="tonal"
                        label
                      >
                        {{ topic.post_count || 0 }} artigo{{ (topic.post_count || 0) !== 1 ? 's' : '' }}
                      </VChip>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </template>
            <div v-else class="text-center pa-12">
              <VIcon icon="tabler-help-circle" size="56" color="disabled" class="mb-3" />
              <p class="text-body-1 text-disabled">Nenhum tópico disponível ainda.</p>
              <p class="text-caption text-disabled">Os artigos de ajuda estão sendo criados.</p>
            </div>
          </div>

          <!-- ===== TOPIC: Subtópicos + Lista de posts ===== -->
          <div v-else-if="currentView === 'topic'" key="topic">
            <!-- Header do tópico -->
            <div v-if="selectedTopic" class="d-flex align-center gap-3 mb-4">
              <div class="help-topic-icon-wrapper-sm">
                <VIcon
                  :icon="selectedTopic.icone || 'tabler-folder'"
                  size="22"
                  color="primary"
                />
              </div>
              <div>
                <h3 class="text-h6 font-weight-bold mb-0">{{ selectedTopic.nome }}</h3>
                <p v-if="selectedTopic.descricao" class="text-caption text-medium-emphasis mb-0">
                  {{ selectedTopic.descricao }}
                </p>
              </div>
            </div>

            <!-- Chips de subtópicos -->
            <div v-if="selectedTopic?.subtopics?.length" class="d-flex flex-wrap gap-2 mb-4">
              <VChip
                :color="!selectedSubtopicId ? 'primary' : 'default'"
                :variant="!selectedSubtopicId ? 'flat' : 'tonal'"
                size="small"
                label
                class="help-chip-transition"
                @click="selectTopic(selectedTopicId)"
              >
                Todos
              </VChip>
              <VChip
                v-for="sub in selectedTopic.subtopics"
                :key="sub.id"
                :color="selectedSubtopicId === sub.id ? 'primary' : 'default'"
                :variant="selectedSubtopicId === sub.id ? 'flat' : 'tonal'"
                size="small"
                label
                class="help-chip-transition"
                @click="selectSubtopic(selectedTopicId, sub.id)"
              >
                {{ sub.nome }}
                <span v-if="sub.post_count" class="ms-1 text-caption">({{ sub.post_count }})</span>
              </VChip>
            </div>

            <VDivider class="mb-4" />

            <!-- Lista de posts -->
            <div v-if="loadingPosts" class="d-flex justify-center pa-8">
              <VProgressCircular indeterminate color="primary" />
            </div>
            <div v-else-if="posts.length" class="d-flex flex-column gap-2">
              <VCard
                v-for="(post, i) in posts"
                :key="post.id"
                variant="outlined"
                rounded="lg"
                class="help-post-item cursor-pointer"
                @click="openPost(post)"
                :style="{ animationDelay: `${i * 40}ms` }"
              >
                <VCardText class="d-flex align-center gap-3 pa-4">
                  <div class="help-post-icon flex-shrink-0">
                    <VIcon icon="tabler-file-text" size="20" color="primary" />
                  </div>
                  <div class="flex-grow-1 overflow-hidden">
                    <h4 class="text-subtitle-2 font-weight-bold mb-1 text-truncate">{{ post.titulo }}</h4>
                    <p class="text-caption text-medium-emphasis mb-0 help-post-resumo">
                      {{ post.resumo }}
                    </p>
                  </div>
                  <VIcon icon="tabler-chevron-right" size="18" color="disabled" class="flex-shrink-0" />
                </VCardText>
              </VCard>
            </div>
            <div v-else class="text-center pa-8">
              <VIcon icon="tabler-file-off" size="48" color="disabled" class="mb-3" />
              <p class="text-body-1 text-disabled mb-1">Nenhum artigo nesta categoria.</p>
              <p class="text-caption text-disabled">Em breve novos conteúdos serão adicionados.</p>
            </div>
          </div>

          <!-- ===== POST: Leitura ===== -->
          <div v-else-if="currentView === 'post'" key="post">
            <div v-if="loadingPost" class="d-flex justify-center pa-12">
              <VProgressCircular indeterminate color="primary" />
            </div>
            <template v-else-if="currentPost">
              <h2 class="text-h5 font-weight-bold mb-2">{{ currentPost.titulo }}</h2>
              <div class="d-flex align-center gap-3 mb-4">
                <VChip v-if="currentPost.topic_nome" size="x-small" color="primary" variant="tonal" label>
                  {{ currentPost.topic_nome }}
                </VChip>
                <VChip v-if="currentPost.subtopic_nome" size="x-small" color="secondary" variant="tonal" label>
                  {{ currentPost.subtopic_nome }}
                </VChip>
                <span class="text-caption text-disabled d-flex align-center gap-1">
                  <VIcon icon="tabler-eye" size="14" />
                  {{ currentPost.views }}
                </span>
              </div>
              <VDivider class="mb-5" />
              <div class="help-post-content" v-html="currentPost.conteudo_html" />
            </template>
          </div>

          <!-- ===== SEARCH: Resultados ===== -->
          <div v-else-if="currentView === 'search'" key="search">
            <div class="d-flex align-center gap-2 mb-4">
              <VIcon icon="tabler-search" size="20" color="primary" />
              <h3 class="text-subtitle-1 font-weight-bold mb-0">
                Resultados para "{{ searchQuery }}"
              </h3>
            </div>

            <div v-if="loadingSearch" class="d-flex justify-center pa-8">
              <VProgressCircular indeterminate color="primary" />
            </div>
            <div v-else-if="searchResults.length" class="d-flex flex-column gap-2">
              <VCard
                v-for="(post, i) in searchResults"
                :key="post.id"
                variant="outlined"
                rounded="lg"
                class="help-post-item cursor-pointer"
                @click="openPost(post)"
                :style="{ animationDelay: `${i * 40}ms` }"
              >
                <VCardText class="d-flex align-center gap-3 pa-4">
                  <div class="help-post-icon flex-shrink-0">
                    <VIcon icon="tabler-file-text" size="20" color="primary" />
                  </div>
                  <div class="flex-grow-1 overflow-hidden">
                    <h4 class="text-subtitle-2 font-weight-bold mb-1 text-truncate">{{ post.titulo }}</h4>
                    <div class="d-flex align-center gap-2 mb-1">
                      <VChip v-if="post.topic_nome" size="x-small" color="primary" variant="tonal" label>
                        {{ post.topic_nome }}
                      </VChip>
                    </div>
                    <p class="text-caption text-medium-emphasis mb-0 help-post-resumo">
                      {{ post.resumo }}
                    </p>
                  </div>
                  <VIcon icon="tabler-chevron-right" size="18" color="disabled" class="flex-shrink-0" />
                </VCardText>
              </VCard>
            </div>
            <div v-else class="text-center pa-8">
              <VIcon icon="tabler-search-off" size="48" color="disabled" class="mb-3" />
              <p class="text-body-1 text-disabled mb-1">Nenhum resultado encontrado.</p>
              <p class="text-caption text-disabled">Tente usar termos diferentes ou navegue pelas categorias.</p>
              <VBtn variant="tonal" color="primary" size="small" class="mt-3" @click="goHome">
                Ver todas as categorias
              </VBtn>
            </div>
          </div>
        </Transition>
      </div>
    </VCard>
  </VDialog>
</template>

<style>
/* ===== Header com gradiente ===== */
.help-header {
  position: relative;
  overflow: hidden;
}

.help-header-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-primary), 0.85) 100%);
  z-index: 0;
}

.help-header-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 60%);
}

.help-header-content {
  position: relative;
  z-index: 1;
}

/* ===== Search ===== */
.help-search-wrapper {
  max-width: 100%;
}

.help-search-field .v-field {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
}

/* ===== Breadcrumb ===== */
.help-breadcrumb-link:hover {
  text-decoration: underline;
}

/* ===== Topic cards ===== */
.help-topic-card {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  animation: helpFadeUp 0.35s ease-out both;
}

.help-topic-card:hover {
  border-color: rgb(var(--v-theme-primary)) !important;
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(var(--v-theme-primary), 0.12);
}

.help-topic-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(var(--v-theme-primary), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s ease;
}

.help-topic-card:hover .help-topic-icon-wrapper {
  background: rgba(var(--v-theme-primary), 0.14);
  transform: scale(1.05);
}

.help-topic-icon-wrapper-sm {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ===== Post items ===== */
.help-post-item {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  animation: helpFadeUp 0.3s ease-out both;
}

.help-post-item:hover {
  border-color: rgb(var(--v-theme-primary)) !important;
  background: rgba(var(--v-theme-primary), 0.02);
  transform: translateX(4px);
}

.help-post-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-post-resumo {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

/* ===== Chip transition ===== */
.help-chip-transition {
  transition: all 0.2s ease;
}

/* ===== Post content ===== */
.help-post-content img {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  margin: 12px 0;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.help-post-content h1,
.help-post-content h2 {
  margin-top: 1.8em;
  margin-bottom: 0.6em;
  font-weight: 700;
}

.help-post-content h3 {
  margin-top: 1.4em;
  margin-bottom: 0.5em;
  font-weight: 600;
}

.help-post-content p {
  margin-bottom: 1em;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.help-post-content ul,
.help-post-content ol {
  padding-left: 1.5em;
  margin-bottom: 1em;
}

.help-post-content li {
  margin-bottom: 0.4em;
  line-height: 1.6;
}

.help-post-content blockquote {
  border-left: 4px solid rgb(var(--v-theme-primary));
  padding: 12px 16px;
  margin: 16px 0;
  background: rgba(var(--v-theme-primary), 0.04);
  border-radius: 0 8px 8px 0;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.help-post-content pre,
.help-post-content code {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.9em;
}

.help-post-content pre {
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0;
}

.help-post-content a {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.help-post-content a:hover {
  text-decoration: underline;
}

/* ===== Animations ===== */
@keyframes helpFadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.help-fade-enter-active,
.help-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.help-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.help-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ===== Dialog ===== */
.help-dialog-card {
  border-radius: 16px !important;
}

/* ===== FAB pulse ===== */
.help-fab {
  box-shadow: 0 4px 16px rgba(var(--v-theme-primary), 0.3) !important;
  transition: all 0.3s ease;
}

.help-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(var(--v-theme-primary), 0.4) !important;
}
</style>
