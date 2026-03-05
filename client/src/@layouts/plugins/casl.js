import { useAbility } from '@casl/vue'
import { getCurrentInstance } from 'vue'
import { ability } from '@/plugins/casl/ability'

export const can = (action, subject) => {
  if(!action || !subject) return true
  
  const vm = getCurrentInstance()
  const $can = vm?.proxy?.$can
  const canImpl = $can || ability.can.bind(ability)

  if (canImpl('manage', 'all')) return true

  if (subject) {
    //&& canImpl('manage', subject)) return true
    if (subject.includes('_')) {
      subject = subject.split('_')[0]
    }

    if (canImpl('manage', subject)) return true
  }

  return canImpl(action, subject)
}



/**
 * Check if user can view item based on it's ability
 * Based on item's action and subject & Hide group if all of it's children are hidden
 * @param {object} item navigation object item
 */
export const canViewNavMenuGroup = item => {
  const hasAnyVisibleChild = item.children.some(i => can(i.action, i.subject))

  // If subject and action is defined in item => Return based on children visibility (Hide group if no child is visible)
  // Else check for ability using provided subject and action along with checking if has any visible child
  if (!(item.action && item.subject))
    return hasAnyVisibleChild

  return can(item.action, item.subject) && hasAnyVisibleChild
}
export const canNavigate = to => {
  const ability = useAbility()

  return to.matched.some(route => can(route.meta.action, route.meta.subject))
}
