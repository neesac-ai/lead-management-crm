/**
 * Client-side utility to fetch menu names
 */

export interface MenuNames {
  [key: string]: {
    id: string | null
    label: string
  }
}

/**
 * Fetch menu names for the current organization
 */
export async function getMenuNames(): Promise<Record<string, string>> {
  try {
    const response = await fetch('/api/menu-names')
    if (!response.ok) {
      return {}
    }
    const data = await response.json()
    const namesMap: Record<string, string> = {}
    Object.keys(data.menuNames || {}).forEach(key => {
      namesMap[key] = data.menuNames[key].label
    })
    return namesMap
  } catch (error) {
    console.error('Error fetching menu names:', error)
    return {}
  }
}

/**
 * Get menu label (custom or default)
 */
export function getMenuLabel(
  menuNames: Record<string, string>,
  key: string,
  defaultLabel: string
): string {
  return menuNames[key] || defaultLabel
}
