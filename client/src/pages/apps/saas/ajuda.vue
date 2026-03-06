<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";
import HelpTopicDialog from "@/views/apps/saas/HelpTopicDialog.vue";
import HelpSubtopicDialog from "@/views/apps/saas/HelpSubtopicDialog.vue";
import HelpPostDialog from "@/views/apps/saas/HelpPostDialog.vue";
import moment from "moment";

const router = useRouter();
const { setAlert } = useAlert();

// Verificar permissão de admin
const userData = useCookie("userData").value;
if (userData?.role !== "admin") {
  setAlert("Acesso negado.", "error", "tabler-alert-triangle", 3000);
  router.push("/");
}

const activeTab = ref(0);

// ======== TÓPICOS ========
const topics = ref([]);
const loadingTopics = ref(false);
const dialogTopic = ref(false);
const selectedTopic = ref(null);

const topicHeaders = [
  { title: "Nome", key: "nome" },
  { title: "Ícone", key: "icone" },
  { title: "Ordem", key: "ordem", width: 80 },
  { title: "Ativo", key: "ativo", width: 80 },
  { title: "Ações", key: "actions", sortable: false, width: 120 },
];

const getTopics = async () => {
  loadingTopics.value = true;
  try {
    topics.value = await $api("/help-center/admin/topics");
  } catch (err) {
    console.error("Erro ao buscar tópicos:", err);
  }
  loadingTopics.value = false;
};

const editTopic = (item) => {
  selectedTopic.value = { ...item };
  dialogTopic.value = true;
};

const deleteTopic = async (item) => {
  if (!confirm("Deseja desativar este tópico?")) return;
  try {
    await $api(`/help-center/admin/topics/${item.id}`, { method: "DELETE" });
    setAlert("Tópico desativado!", "success", "tabler-check", 3000);
    getTopics();
  } catch (err) {
    console.error("Erro ao excluir tópico:", err);
  }
};

// ======== SUBTÓPICOS ========
const subtopics = ref([]);
const loadingSubtopics = ref(false);
const dialogSubtopic = ref(false);
const selectedSubtopic = ref(null);
const filterTopicId = ref(null);

const subtopicHeaders = [
  { title: "Nome", key: "nome" },
  { title: "Tópico Pai", key: "topic_nome" },
  { title: "Ordem", key: "ordem", width: 80 },
  { title: "Ativo", key: "ativo", width: 80 },
  { title: "Ações", key: "actions", sortable: false, width: 120 },
];

const getSubtopics = async () => {
  loadingSubtopics.value = true;
  try {
    const query = filterTopicId.value ? { topic_id: filterTopicId.value } : {};
    subtopics.value = await $api("/help-center/admin/subtopics", { query });
  } catch (err) {
    console.error("Erro ao buscar subtópicos:", err);
  }
  loadingSubtopics.value = false;
};

const editSubtopic = (item) => {
  selectedSubtopic.value = { ...item };
  dialogSubtopic.value = true;
};

const deleteSubtopic = async (item) => {
  if (!confirm("Deseja desativar este subtópico?")) return;
  try {
    await $api(`/help-center/admin/subtopics/${item.id}`, { method: "DELETE" });
    setAlert("Subtópico desativado!", "success", "tabler-check", 3000);
    getSubtopics();
  } catch (err) {
    console.error("Erro ao excluir subtópico:", err);
  }
};

watch(filterTopicId, () => getSubtopics());

// ======== POSTS ========
const posts = ref([]);
const totalPosts = ref(0);
const loadingPosts = ref(false);
const dialogPost = ref(false);
const selectedPost = ref(null);

const postFilterTopic = ref(null);
const postFilterSubtopic = ref(null);
const postFilterStatus = ref(null);
const postSearch = ref("");
const postPage = ref(1);
const postItemsPerPage = ref(10);

const postHeaders = [
  { title: "Título", key: "titulo" },
  { title: "Tópico", key: "topic_nome" },
  { title: "Status", key: "status", width: 120 },
  { title: "Views", key: "views", width: 80 },
  { title: "Ações", key: "actions", sortable: false, width: 120 },
];

const getPosts = async () => {
  loadingPosts.value = true;
  try {
    const query = {
      page: postPage.value,
      itemsPerPage: postItemsPerPage.value,
    };
    if (postFilterTopic.value) query.topic_id = postFilterTopic.value;
    if (postFilterSubtopic.value) query.subtopic_id = postFilterSubtopic.value;
    if (postFilterStatus.value) query.status = postFilterStatus.value;
    if (postSearch.value) query.q = postSearch.value;

    const res = await $api("/help-center/admin/posts", { query });
    posts.value = res.posts;
    totalPosts.value = res.total;
  } catch (err) {
    console.error("Erro ao buscar posts:", err);
  }
  loadingPosts.value = false;
};

const editPost = async (item) => {
  try {
    const full = await $api(`/help-center/admin/posts/${item.id}`);
    selectedPost.value = full;
    dialogPost.value = true;
  } catch (err) {
    console.error("Erro ao buscar post:", err);
  }
};

const deletePost = async (item) => {
  if (!confirm("Deseja desativar este post?")) return;
  try {
    await $api(`/help-center/admin/posts/${item.id}`, { method: "DELETE" });
    setAlert("Post desativado!", "success", "tabler-check", 3000);
    getPosts();
  } catch (err) {
    console.error("Erro ao excluir post:", err);
  }
};

const updatePostOptions = (options) => {
  postPage.value = options.page;
  getPosts();
};

const topicSelectOptions = computed(() =>
  topics.value.map((t) => ({ title: t.nome, value: t.id }))
);

const postSubtopicOptions = computed(() => {
  if (!postFilterTopic.value) return [];
  return subtopics.value
    .filter((s) => s.topic_id === postFilterTopic.value)
    .map((s) => ({ title: s.nome, value: s.id }));
});

watch(postFilterTopic, () => {
  postFilterSubtopic.value = null;
  getPosts();
});
watch(postFilterStatus, () => getPosts());

// Carregar dados iniciais
getTopics();
getSubtopics();
getPosts();
</script>

<template>
  <div>
    <h2 class="text-h5 mb-4">Centro de Ajuda - Administração</h2>

    <VTabs v-model="activeTab" class="mb-4">
      <VTab :value="0">Tópicos</VTab>
      <VTab :value="1">Subtópicos</VTab>
      <VTab :value="2">Postagens</VTab>
    </VTabs>

    <VWindow v-model="activeTab">
      <!-- ========== ABA TÓPICOS ========== -->
      <VWindowItem :value="0">
        <VCard>
          <VCardText class="d-flex flex-wrap py-4 gap-4">
            <VSpacer />
            <VBtn prepend-icon="tabler-plus" @click="selectedTopic = null; dialogTopic = true">
              Adicionar Tópico
            </VBtn>
          </VCardText>
          <VDivider />
          <VDataTableServer
            :items="topics"
            :items-length="topics.length"
            :headers="topicHeaders"
            :loading="loadingTopics"
            :items-per-page="-1"
            class="text-no-wrap"
          >
            <template #item.icone="{ item }">
              <div class="d-flex align-center gap-2">
                <VIcon v-if="item.icone" :icon="item.icone" size="20" />
                <span class="text-caption">{{ item.icone }}</span>
              </div>
            </template>
            <template #item.ativo="{ item }">
              <VChip :color="item.ativo ? 'success' : 'error'" size="small" label>
                {{ item.ativo ? "Sim" : "Não" }}
              </VChip>
            </template>
            <template #item.actions="{ item }">
              <IconBtn color="warning" @click="editTopic(item)">
                <VIcon icon="tabler-pencil" />
              </IconBtn>
              <IconBtn color="error" @click="deleteTopic(item)">
                <VIcon icon="tabler-trash" />
              </IconBtn>
            </template>
            <template #bottom />
          </VDataTableServer>
        </VCard>
      </VWindowItem>

      <!-- ========== ABA SUBTÓPICOS ========== -->
      <VWindowItem :value="1">
        <VCard class="mb-4">
          <VCardText>
            <VRow>
              <VCol cols="12" md="4">
                <AppSelect
                  v-model="filterTopicId"
                  :items="topicSelectOptions"
                  label="Filtrar por Tópico"
                  placeholder="Todos"
                  clearable
                />
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
        <VCard>
          <VCardText class="d-flex flex-wrap py-4 gap-4">
            <VSpacer />
            <VBtn prepend-icon="tabler-plus" @click="selectedSubtopic = null; dialogSubtopic = true">
              Adicionar Subtópico
            </VBtn>
          </VCardText>
          <VDivider />
          <VDataTableServer
            :items="subtopics"
            :items-length="subtopics.length"
            :headers="subtopicHeaders"
            :loading="loadingSubtopics"
            :items-per-page="-1"
            class="text-no-wrap"
          >
            <template #item.ativo="{ item }">
              <VChip :color="item.ativo ? 'success' : 'error'" size="small" label>
                {{ item.ativo ? "Sim" : "Não" }}
              </VChip>
            </template>
            <template #item.actions="{ item }">
              <IconBtn color="warning" @click="editSubtopic(item)">
                <VIcon icon="tabler-pencil" />
              </IconBtn>
              <IconBtn color="error" @click="deleteSubtopic(item)">
                <VIcon icon="tabler-trash" />
              </IconBtn>
            </template>
            <template #bottom />
          </VDataTableServer>
        </VCard>
      </VWindowItem>

      <!-- ========== ABA POSTAGENS ========== -->
      <VWindowItem :value="2">
        <VCard class="mb-4">
          <VCardText>
            <VRow>
              <VCol cols="12" md="3">
                <AppSelect
                  v-model="postFilterTopic"
                  :items="topicSelectOptions"
                  label="Tópico"
                  placeholder="Todos"
                  clearable
                />
              </VCol>
              <VCol cols="12" md="3">
                <AppSelect
                  v-model="postFilterSubtopic"
                  :items="postSubtopicOptions"
                  label="Subtópico"
                  placeholder="Todos"
                  clearable
                  :disabled="!postFilterTopic"
                />
              </VCol>
              <VCol cols="12" md="2">
                <AppSelect
                  v-model="postFilterStatus"
                  :items="[
                    { title: 'Rascunho', value: 'draft' },
                    { title: 'Publicado', value: 'published' },
                  ]"
                  label="Status"
                  placeholder="Todos"
                  clearable
                />
              </VCol>
              <VCol cols="12" md="4">
                <AppTextField
                  v-model="postSearch"
                  label="Buscar"
                  placeholder="Buscar por título..."
                  @update:model-value="getPosts"
                  density="compact"
                />
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
        <VCard>
          <VCardText class="d-flex flex-wrap py-4 gap-4">
            <div class="me-3 d-flex gap-3">
              <AppSelect
                :model-value="postItemsPerPage"
                :items="[
                  { value: 10, title: '10' },
                  { value: 25, title: '25' },
                  { value: 50, title: '50' },
                ]"
                style="inline-size: 6.25rem"
                @update:model-value="postItemsPerPage = parseInt($event, 10)"
              />
            </div>
            <VSpacer />
            <VBtn prepend-icon="tabler-plus" @click="selectedPost = null; dialogPost = true">
              Nova Postagem
            </VBtn>
          </VCardText>
          <VDivider />
          <VDataTableServer
            v-model:items-per-page="postItemsPerPage"
            v-model:page="postPage"
            :items="posts"
            :items-length="totalPosts"
            :headers="postHeaders"
            :loading="loadingPosts"
            class="text-no-wrap"
            @update:options="updatePostOptions"
          >
            <template #item.status="{ item }">
              <VChip
                :color="item.status === 'published' ? 'success' : 'warning'"
                size="small"
                label
              >
                {{ item.status === "published" ? "Publicado" : "Rascunho" }}
              </VChip>
            </template>
            <template #item.actions="{ item }">
              <IconBtn color="warning" @click="editPost(item)">
                <VIcon icon="tabler-pencil" />
              </IconBtn>
              <IconBtn color="error" @click="deletePost(item)">
                <VIcon icon="tabler-trash" />
              </IconBtn>
            </template>
            <template #bottom>
              <VDivider />
              <div class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3">
                <p class="text-sm text-disabled mb-0">
                  {{ paginationMeta({ page: postPage, itemsPerPage: postItemsPerPage }, totalPosts) }}
                </p>
                <VPagination
                  v-model="postPage"
                  :length="Math.ceil(totalPosts / postItemsPerPage)"
                  :total-visible="$vuetify.display.xs ? 1 : 5"
                >
                  <template #prev="slotProps">
                    <VBtn variant="tonal" color="default" v-bind="slotProps" :icon="false">Anterior</VBtn>
                  </template>
                  <template #next="slotProps">
                    <VBtn variant="tonal" color="default" v-bind="slotProps" :icon="false">Próximo</VBtn>
                  </template>
                </VPagination>
              </div>
            </template>
          </VDataTableServer>
        </VCard>
      </VWindowItem>
    </VWindow>

    <!-- Dialogs -->
    <HelpTopicDialog
      :isDrawerOpen="dialogTopic"
      @update:isDrawerOpen="dialogTopic = $event"
      :topicData="selectedTopic"
      @saved="getTopics"
    />

    <HelpSubtopicDialog
      :isDrawerOpen="dialogSubtopic"
      @update:isDrawerOpen="dialogSubtopic = $event"
      :subtopicData="selectedSubtopic"
      :topics="topics"
      @saved="getSubtopics"
    />

    <HelpPostDialog
      :isDrawerOpen="dialogPost"
      @update:isDrawerOpen="dialogPost = $event"
      :postData="selectedPost"
      :topics="topics"
      :subtopics="subtopics"
      @saved="getPosts"
    />
  </div>
</template>
