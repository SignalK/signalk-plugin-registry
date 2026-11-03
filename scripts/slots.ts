export type ServerSlot = 'stable' | 'master'

// Scores come from the primary Node version. Every other version is probed
// against the stable server only, under its own slot key, so it shows up
// next to the score without changing it.
export const PRIMARY_NODE = '24'
export const EXTRA_NODES = ['26']

export function slotKeyFor(server: ServerSlot, node: string): string {
  return node === PRIMARY_NODE ? `server@${server}` : `server@${server}-node${node}`
}
