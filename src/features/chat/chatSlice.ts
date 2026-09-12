import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/** Client-only UI state. Anything the server owns belongs in chatApi. */
interface ChatState {
  draft: string
  lastError: string | null
}

const initialState: ChatState = {
  draft: '',
  lastError: null,
}

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    draftChanged(state, action: PayloadAction<string>) {
      state.draft = action.payload
      state.lastError = null
    },
    draftCleared(state) {
      state.draft = ''
    },
    sendFailed(state, action: PayloadAction<string>) {
      state.lastError = action.payload
    },
  },
  selectors: {
    selectDraft: (state) => state.draft,
    selectLastError: (state) => state.lastError,
    selectCanSend: (state) => state.draft.trim().length > 0,
  },
})

export const { draftChanged, draftCleared, sendFailed } = chatSlice.actions
export const { selectDraft, selectLastError, selectCanSend } = chatSlice.selectors
export default chatSlice.reducer
