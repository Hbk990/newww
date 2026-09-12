import { useEffect, useRef } from 'react'
import type { Message } from './types'

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <ol className="messages">
      {messages.map((message) => (
        <li key={message.id} className={`message message--${message.role}`}>
          <div className={`bubble${message.pending ? ' bubble--pending' : ''}`}>
            <p>{message.text}</p>
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {message.pending ? 'sending…' : formatTime(message.createdAt)}
            </time>
          </div>
        </li>
      ))}
      <div ref={bottomRef} />
    </ol>
  )
}
