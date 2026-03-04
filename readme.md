# @rbxts/react-query

A full [@tanstack/react-query](https://tanstack.com/query/v5) v5 implementation for [roblox-ts](https://roblox-ts.com/). Provides `useQuery`, `useInfiniteQuery`, `useMutation`, and a complete `QueryClient` API.

## Installation

```sh
npm i @rbxts/react-query
```
```sh
bun i @rbxts/react-query
```

## Setup

Wrap your app with `QueryClientProvider` and pass a `QueryClient` instance.

```tsx
import React from "@rbxts/react"
import { QueryClient, QueryClientProvider } from "@rbxts/react-query"

const queryClient = new QueryClient()

export function App() {
    return (
        <QueryClientProvider value={queryClient}>
            <YourApp />
        </QueryClientProvider>
    )
}
```

---

## `useQuery`

Fetches and caches data. Automatically refetches when the component mounts, when the query key changes, or when the query is invalidated.

```tsx
import { useQuery } from "@rbxts/react-query"

function PlayerCard({ userId }: { userId: number }) {
    const { data, isLoading, isError, err, refetch } = useQuery({
        queryKey: ["player", userId],
        queryFn: () => Players.GetNameFromUserIdAsync(userId),
    })

    if (isLoading) return <textlabel Text="Loading..." />
    if (isError) return <textlabel Text={`Error: ${err}`} />

    return <textlabel Text={data} />
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queryKey` | `keytype` | required | Unique key for this query |
| `queryFn` | `(ctx) => Promise<T>` | required | Function that fetches data |
| `enabled` | `boolean` | `true` | Set to `false` to disable automatic fetching |
| `staleTime` | `number` | `0` | Time in ms before data is considered stale |
| `gcTime` | `number` | — | Accepted for API compat |
| `retry` | `boolean \| number \| (n, err) => boolean` | `3` | Retry attempts on failure |
| `retryDelay` | `number \| (n, err) => number` | exponential backoff | Delay in ms between retries |
| `retryOnMount` | `boolean` | `true` | Whether to retry failed queries on remount |
| `refetchInterval` | `number` | — | Interval in ms to poll automatically |
| `refetchOnMount` | `boolean` | `true` | Whether to refetch when component mounts |
| `select` | `(data: TQueryFnData) => TData` | — | Transform/select a subset of the fetched data |
| `initialData` | `TData \| () => TData` | — | Initial data; counts toward staleness |
| `initialDataUpdatedAt` | `number` | — | `tick()` timestamp for `initialData` freshness |
| `placeholderData` | `TData \| (prev) => TData` | — | Placeholder shown while loading; not persisted |
| `throwOnError` | `boolean \| (err) => boolean` | `false` | Throw errors to nearest error boundary |
| `meta` | `Record<string, unknown>` | — | Arbitrary metadata |

### Result

| Field | Type | Description |
|-------|------|-------------|
| `data` | `TData \| undefined` | The fetched data |
| `err` | `TError \| undefined` | The last error, if any |
| `status` | `"pending" \| "success" \| "error"` | Query status |
| `fetchStatus` | `"fetching" \| "paused" \| "idle"` | Whether the queryFn is currently running |
| `isPending` | `boolean` | `status === "pending"` |
| `isSuccess` | `boolean` | `status === "success"` |
| `isError` | `boolean` | `status === "error"` |
| `isFetching` | `boolean` | `fetchStatus === "fetching"` |
| `isLoading` | `boolean` | Initial load in progress (`isPending && isFetching`) |
| `isRefetching` | `boolean` | Background refetch in progress |
| `isLoadingError` | `boolean` | Failed with no previously successful data |
| `isRefetchError` | `boolean` | Failed while previously successful data exists |
| `isStale` | `boolean` | Data is past `staleTime` |
| `isPlaceholderData` | `boolean` | Current data came from `placeholderData` |
| `dataUpdatedAt` | `number` | `tick()` timestamp of last successful fetch |
| `errUpdatedAt` | `number` | `tick()` timestamp of last error |
| `failureCount` | `number` | Number of failed attempts in current retry cycle |
| `failureReason` | `TError \| undefined` | Error from the last failed attempt |
| `refetch` | `() => Promise<void>` | Manually trigger a refetch |

---

## `useInfiniteQuery`

Fetches paginated data. Manages a list of pages and exposes controls for fetching the next and previous pages.

```tsx
import { useInfiniteQuery } from "@rbxts/react-query"

function ItemList() {
    const {
        data,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ["items"],
        queryFn: ({ pageParam }) => fetchItemsPage(pageParam as number),
        initialPageParam: 1,
        getNextPageParam: (lastPage, _allPages, lastPageParam) => {
            return (lastPage as number[]).size() > 0
                ? (lastPageParam as number) + 1
                : undefined
        },
    })

    if (isLoading) return <textlabel Text="Loading..." />

    return (
        <frame>
            {data?.pages.map((page) =>
                (page as string[]).map((item) => (
                    <textlabel Text={item} />
                ))
            )}
            {hasNextPage && (
                <textbutton
                    Text={isFetchingNextPage ? "Loading..." : "Load More"}
                    Event={{ MouseButton1Click: fetchNextPage }}
                />
            )}
        </frame>
    )
}
```

### Options

Extends `useQuery` options with:

| Option | Type | Description |
|--------|------|-------------|
| `initialPageParam` | `TPageParam` | Required. The page param used for the first fetch |
| `getNextPageParam` | `(lastPage, allPages, lastPageParam, allPageParams) => TPageParam \| undefined` | Returns the next page param, or `undefined` to signal no more pages |
| `getPreviousPageParam` | `(firstPage, allPages, firstPageParam, allPageParams) => TPageParam \| undefined` | Returns the previous page param |
| `maxPages` | `number` | Maximum pages to keep; oldest are dropped when exceeded |

### Result

Extends `useQuery` result with:

| Field | Type | Description |
|-------|------|-------------|
| `data` | `InfiniteData<TData, TPageParam> \| undefined` | Object with `pages` and `pageParams` arrays |
| `hasNextPage` | `boolean` | `getNextPageParam` returned a value |
| `hasPreviousPage` | `boolean` | `getPreviousPageParam` returned a value |
| `isFetchingNextPage` | `boolean` | `fetchNextPage` is currently running |
| `isFetchingPreviousPage` | `boolean` | `fetchPreviousPage` is currently running |
| `fetchNextPage` | `() => Promise<void>` | Fetch the next page |
| `fetchPreviousPage` | `() => Promise<void>` | Fetch the previous page |

---

## `useMutation`

Runs an imperative async operation (create, update, delete). Does not cache results.

```tsx
import { useMutation, useQueryClient } from "@rbxts/react-query"

function SaveButton({ data }: { data: string }) {
    const queryClient = useQueryClient()

    const { mutate, isPending, isError, err } = useMutation({
        mutationFn: (value: string) => saveToServer(value),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["myData"] })
        },
    })

    return (
        <textbutton
            Text={isPending ? "Saving..." : "Save"}
            Event={{ MouseButton1Click: () => mutate(data) }}
        />
    )
}
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `mutationFn` | `(variables: TVariables) => Promise<TData>` | Required. The async function to run |
| `mutationKey` | `keytype` | Key used for defaults lookup via `setMutationDefaults` |
| `retry` | `boolean \| number \| (n, err) => boolean` | Retry attempts. Default: `0` |
| `retryDelay` | `number \| (n, err) => number` | Delay in ms between retries |
| `onMutate` | `(variables) => Promise<TContext> \| TContext` | Runs before `mutationFn`; return value becomes `context` |
| `onSuccess` | `(data, variables, context) => void` | Runs on success |
| `onError` | `(err, variables, context) => void` | Runs on error |
| `onSettled` | `(data, err, variables, context) => void` | Runs on both success and error |
| `throwOnError` | `boolean \| (err) => boolean` | Re-throw the error from `mutateAsync` |
| `meta` | `Record<string, unknown>` | Arbitrary metadata |

### Result

| Field | Type | Description |
|-------|------|-------------|
| `data` | `TData \| undefined` | The last successful result |
| `err` | `TError \| undefined` | The last error |
| `status` | `"idle" \| "pending" \| "success" \| "error"` | Mutation status |
| `isIdle` | `boolean` | Not yet called or after `reset()` |
| `isPending` | `boolean` | Currently running |
| `isSuccess` | `boolean` | Last call succeeded |
| `isError` | `boolean` | Last call failed |
| `variables` | `TVariables \| undefined` | Variables passed to the last `mutate` call |
| `context` | `TContext \| undefined` | Context returned by `onMutate` |
| `failureCount` | `number` | Number of failed attempts in current retry cycle |
| `failureReason` | `TError \| undefined` | Error from the last failed attempt |
| `submittedAt` | `number` | `tick()` timestamp when mutation was last called |
| `mutate` | `(variables, options?) => void` | Fire-and-forget call |
| `mutateAsync` | `(variables, options?) => Promise<TData>` | Awaitable call |
| `reset` | `() => void` | Reset state back to idle |

`mutate` and `mutateAsync` both accept per-call `onSuccess`, `onError`, and `onSettled` callbacks via `MutateOptions`.

---

## `QueryClient`

Manages the query cache and global defaults. Pass to `QueryClientProvider`.

```ts
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5000,
            retry: 2,
        },
        mutations: {
            retry: 1,
        },
    },
})
```

### Methods

#### Cache

| Method | Description |
|--------|-------------|
| `getQueryData<T>(queryKey)` | Returns cached data for a key |
| `setQueryData<T>(queryKey, updater)` | Synchronously set cached data; notifies observers |
| `getQueryState<TData, TError>(queryKey)` | Returns the full `QueryState` for a key |
| `removeQueries(filters?)` | Remove matching queries from cache |
| `clear()` | Remove all queries from cache |

#### Invalidation & Fetching

| Method | Description |
|--------|-------------|
| `invalidateQueries(filters?)` | Mark matching queries stale and refetch active ones |
| `fetchQuery(options)` | Imperatively fetch a query. Returns cached data if still fresh. Throws on error |
| `prefetchQuery(options)` | Like `fetchQuery` but never throws; useful for preloading |

#### Defaults

| Method | Description |
|--------|-------------|
| `setQueryDefaults(queryKey, options)` | Set default options for a specific query key |
| `getQueryDefaults(queryKey)` | Get default options for a specific query key |
| `setMutationDefaults(mutationKey, options)` | Set default options for a specific mutation key |
| `getMutationDefaults(mutationKey)` | Get default options for a specific mutation key |

### `invalidateQueries`

```ts
// Invalidate all queries
queryClient.invalidateQueries()

// Invalidate queries whose key starts with "player"
queryClient.invalidateQueries({ queryKey: "player" })

// Invalidate only the exact key ["player", 123]
queryClient.invalidateQueries({ queryKey: ["player", 123], exact: true })
```

### `setQueryData`

```ts
// Set directly
queryClient.setQueryData(["player", 123], { name: "Builderman" })

// Update via function
queryClient.setQueryData<{ name: string }>(["player", 123], (old) => ({
    ...old!,
    name: "Roblox",
}))
```

---

## `useQueryClient`

Access the `QueryClient` from any component inside `QueryClientProvider`.

```ts
import { useQueryClient } from "@rbxts/react-query"

function MyComponent() {
    const queryClient = useQueryClient()
    // ...
}
```

---

## Type Reference

```ts
type keytype = string | number | boolean | keytype[] | { [key: string]: keytype }

interface QueryState<TData, TError> {
    data: TData | undefined
    dataUpdatedAt: number
    err: TError | undefined
    errUpdatedAt: number
    status: "pending" | "success" | "error"
    isInvalidated: boolean
    failureCount: number
    failureReason: TError | undefined
}

interface InfiniteData<TData, TPageParam> {
    pages: TData[]
    pageParams: TPageParam[]
}
```

---

## Differences from `@tanstack/react-query`

- **`error` is `err`** — the error field on all results is named `err` instead of `error`
- **No network pausing** — `isPaused` is always `false`; `refetchIntervalInBackground` is accepted but a no-op
- **Roblox runtime** — uses `task.spawn`, `task.cancel`, `tick()`, `wait()`, and `pcall()` internally
- **`useInfiniteQuery` type constraint** — `TQueryFnData` and `TPageParam` must extend `defined` due to roblox-ts array method limitations
