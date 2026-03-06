import { ref } from 'vue'

const helpDialogOpen = ref(false)
const helpInitialTopic = ref(null)

const openHelp = (topicSlug = null) => {
  helpInitialTopic.value = topicSlug || null
  helpDialogOpen.value = true
}

const closeHelp = () => {
  helpDialogOpen.value = false
  helpInitialTopic.value = null
}

export const useHelpCenter = () => ({
  helpDialogOpen,
  helpInitialTopic,
  openHelp,
  closeHelp,
})
