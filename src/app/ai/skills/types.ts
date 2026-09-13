export interface AISkill {
  id: string
  name: string
  displayName: string
  description: string
  version?: string
  author?: string
  sourceUrl: string
  tags?: string[]
  isDefault?: boolean
  enabled: boolean
  promptContent: string
}
