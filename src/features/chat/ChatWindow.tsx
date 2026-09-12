import MessageInput from './MessageInput'
import MessageList from './MessageList'
import { useGetMessagesQuery } from './chatApi'

export default function ChatWindow() {
  const { data: messages, isLoading, isError, refetch } = useGetMessagesQuery()

  return (
    <section className="chat">
      <header className="chat__header">
        <h1>RTK Chat</h1>
        <span>Redux Toolkit + RTK Query</span>
      </header>

      {isLoading && <p className="chat__status">Loading conversation…</p>}

      {isError && (
        <p className="chat__status chat__status--error">
          Failed to load messages. <button onClick={() => refetch()}>Retry</button>
        </p>
      )}

      {messages && <MessageList messages={messages} />}

      <MessageInput />
    </section>
  )
}
