/**
 * Generate a unique organization code
 * Format: First 4 chars from org name (uppercase) + 4 random alphanumeric chars
 * Example: "Acme Corp" -> "ACME7X9K"
 */
export function generateOrgCode(orgName: string): string {
  // Get first 4 chars, uppercase, alphanumeric only
  const prefix = orgName
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .substring(0, 4)
    .padEnd(4, 'X')

  // Generate 4 random alphanumeric characters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return prefix + suffix
}

/**
 * Generate a URL-friendly slug from organization name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}










