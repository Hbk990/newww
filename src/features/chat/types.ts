export type Role = 'user' | 'bot'

export interface Message {
  id: string
  role: Role
  text: string
  createdAt: number
  /** True while an optimistic message is still in flight. */
  pending?: boolean
}

export interface ChatError {
  status: number
  message: string
}
