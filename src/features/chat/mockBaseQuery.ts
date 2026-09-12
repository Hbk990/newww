import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import type { ChatError, Message } from './types'

/**
 * Stand-in for a real server. Swap this out for
 *   fetchBaseQuery({ baseUrl: '/api' })
 * in chatApi.ts once a backend exists — no component has to change.
 */

const LATENCY_MS = 450

let seq = 0
const nextId = () => `m${++seq}`

const history: Message[] = [
  {
    id: nextId(),
    role: 'bot',
    text: 'Hey! This chat is wired to Redux Toolkit. Send something and watch the store update.',
    createdAt: Date.now(),
  },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const reply = (text: string) =>
  `You said "${text}" (${text.length} chars). I'm a mock server — replace mockBaseQuery with fetchBaseQuery to talk to a real one.`

export interface ChatRequest {
  url: '/messages'
  method: 'GET' | 'POST'
  body?: { text: string }
}

export const mockBaseQuery: BaseQueryFn<ChatRequest, unknown, ChatError> = async (request) => {
  await delay(LATENCY_MS)

  if (request.method === 'GET') {
    return { data: history.map((message) => ({ ...message })) }
  }

  const text = request.body?.text.trim()
  if (!text) {
    return { error: { status: 400, message: 'Message text is required.' } }
  }

  const now = Date.now()
  const userMessage: Message = { id: nextId(), role: 'user', text, createdAt: now }
  const botMessage: Message = { id: nextId(), role: 'bot', text: reply(text), createdAt: now + 1 }

  history.push(userMessage, botMessage)
  return { data: [userMessage, botMessage] }
}
