# RTK Chat

A chat UI wired to **Redux Toolkit**. Server state lives in RTK Query's cache; client-only
UI state lives in a slice. Nothing is duplicated between the two.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit && vite build
```

## How the wiring works

| Piece | File | Role |
| --- | --- | --- |
| Store | `src/app/store.ts` | `configureStore` + `chatApi.middleware` + `setupListeners` |
| Typed hooks | `src/app/hooks.ts` | `useAppDispatch` / `useAppSelector` via `.withTypes<>()` |
| Server state | `src/features/chat/chatApi.ts` | `createApi` — `getMessages` query, `sendMessage` mutation |
| Transport | `src/features/chat/mockBaseQuery.ts` | Fake backend; swap for `fetchBaseQuery` |
| UI state | `src/features/chat/chatSlice.ts` | Draft text + last error, with colocated `selectors` |

`sendMessage` does an optimistic insert in `onQueryStarted`: the user's bubble renders
immediately with `pending: true`, then gets replaced by the server's real messages once
`queryFulfilled` resolves. A rejected request calls `patch.undo()` and restores the draft.

## Pointing it at a real backend

Only one file changes. In `chatApi.ts`:

```ts
import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'

baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
```

and adjust the two `query` builders to your routes (`GET /messages`, `POST /messages`).
Components, hooks, and the store stay as they are. `mockBaseQuery.ts` can then be deleted.
