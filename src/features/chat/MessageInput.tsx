import type { FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useSendMessageMutation } from './chatApi'
import { draftChanged, draftCleared, selectCanSend, selectDraft, selectLastError, sendFailed } from './chatSlice'

export default function MessageInput() {
  const dispatch = useAppDispatch()
  const draft = useAppSelector(selectDraft)
  const canSend = useAppSelector(selectCanSend)
  const lastError = useAppSelector(selectLastError)
  const [sendMessage, { isLoading }] = useSendMessageMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isLoading) return

    dispatch(draftCleared())
    try {
      await sendMessage(text).unwrap()
    } catch {
      dispatch(sendFailed('Could not send that message. Try again.'))
      dispatch(draftChanged(text))
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {lastError && <p className="composer__error">{lastError}</p>}
      <div className="composer__row">
        <input
          value={draft}
          onChange={(event) => dispatch(draftChanged(event.target.value))}
          placeholder="Type a message…"
          aria-label="Message"
          autoComplete="off"
        />
        <button type="submit" disabled={!canSend || isLoading}>
          {isLoading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
