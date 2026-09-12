import { createApi } from '@reduxjs/toolkit/query/react'
import { mockBaseQuery } from './mockBaseQuery'
import type { Message } from './types'

/** Server state lives here (RTK Query cache), never duplicated into a slice. */
export const chatApi = createApi({
  reducerPath: 'chatApi',
  baseQuery: mockBaseQuery,
  tagTypes: ['Messages'],
  endpoints: (build) => ({
    getMessages: build.query<Message[], void>({
      query: () => ({ url: '/messages', method: 'GET' }),
      providesTags: ['Messages'],
    }),

    sendMessage: build.mutation<Message[], string>({
      query: (text) => ({ url: '/messages', method: 'POST', body: { text } }),

      // Optimistic insert so the bubble appears instantly, then reconcile
      // with whatever the server actually stored.
      async onQueryStarted(text, { dispatch, queryFulfilled }) {
        const optimistic: Message = {
          id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          text,
          createdAt: Date.now(),
          pending: true,
        }

        const patch = dispatch(
          chatApi.util.updateQueryData('getMessages', undefined, (draft) => {
            draft.push(optimistic)
          }),
        )

        try {
          const { data } = await queryFulfilled
          dispatch(
            chatApi.util.updateQueryData('getMessages', undefined, (draft) => {
              const index = draft.findIndex((message) => message.id === optimistic.id)
              if (index === -1) draft.push(...data)
              else draft.splice(index, 1, ...data)
            }),
          )
        } catch {
          patch.undo()
        }
      },
    }),
  }),
})

export const { useGetMessagesQuery, useSendMessageMutation } = chatApi
