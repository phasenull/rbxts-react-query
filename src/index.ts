import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
} from "@rbxts/react";

// ============================================================
// SECTION 1: CORE TYPES
// ============================================================

export type keytype =
	| string
	| number
	| boolean
	| keytype[]
	| { [key: string]: keytype };

/** Internal per-key cache entry */
interface QueryCacheEntry {
	data: unknown;
	/** tick() timestamp when data was last successfully set; 0 if never */
	dataUpdatedAt: number;
	error: unknown;
	/** tick() timestamp when error was last set; 0 if never */
	errorUpdatedAt: number;
	status: "pending" | "error" | "success";
	isInvalidated: boolean;
	failureCount: number;
	failureReason: unknown;
}

export interface DefaultQueryOptions {
	/** Number of retry attempts on failure. `true` = infinite, `false` = none. Default: 3 */
	retry?: boolean | number | ((failureCount: number, error: unknown) => boolean);
	/** Delay in ms between retries, or a function returning the delay. Default: exponential backoff capped at 30s */
	retryDelay?: number | ((failureCount: number, error: unknown) => number);
	/** Time in ms after which data is considered stale. Default: 0 */
	staleTime?: number;
	/** Accepted for API compat; not actively GC'd in this implementation */
	gcTime?: number;
	/** Whether to refetch when the component mounts. Default: true */
	refetchOnMount?: boolean;
	/** Global success callback for all queries */
	onSuccess?: (data: unknown, queryKey: string) => void;
	/** Global error callback for all queries */
	onError?: (error: unknown, queryKey: string) => void;
	/** Global settled callback for all queries */
	onSettled?: (
		data: unknown | undefined,
		error: unknown | undefined,
		queryKey: string,
	) => void;
}

export interface DefaultMutationOptions {
	/** Number of retry attempts on failure. Default: 0 */
	retry?: boolean | number | ((failureCount: number, error: unknown) => boolean);
	/** Delay in ms between retries, or a function returning the delay */
	retryDelay?: number | ((failureCount: number, error: unknown) => number);
	/** Global success callback for all mutations */
	onSuccess?: (data: unknown, variables: unknown, mutationKey: string) => void;
	/** Global error callback for all mutations */
	onError?: (error: unknown, variables: unknown, mutationKey: string) => void;
	/** Global settled callback for all mutations */
	onSettled?: (
		data: unknown | undefined,
		error: unknown | undefined,
		variables: unknown,
		mutationKey: string,
	) => void;
}

export interface QueryClientOptions {
	defaultOptions?: {
		queries?: DefaultQueryOptions;
		mutations?: DefaultMutationOptions;
	};
}

/** The query state shape returned by getQueryState */
export interface QueryState<TData = unknown, TError = unknown> {
	data: TData | undefined;
	dataUpdatedAt: number;
	error: TError | undefined;
	errorUpdatedAt: number;
	status: "pending" | "error" | "success";
	isInvalidated: boolean;
	failureCount: number;
	failureReason: TError | undefined;
}

export interface UseQueryOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
> {
	/** Unique key identifying this query */
	queryKey: keytype;
	/** Function that fetches the data */
	queryFn: (context: { queryKey: string }) => Promise<TQueryFnData>;
	/** Set to false to disable automatic fetching. Default: true */
	enabled?: boolean;
	/** Time in ms after which cached data is considered stale. Default: 0 */
	staleTime?: number;
	/** Accepted for API compat; not actively GC'd in this implementation */
	gcTime?: number;
	/** Number of retry attempts. Default: from QueryClient (3) */
	retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
	/** Delay between retries in ms. Default: exponential backoff */
	retryDelay?: number | ((failureCount: number, error: TError) => number);
	/** If false, failed queries won't retry when remounted. Default: true */
	retryOnMount?: boolean;
	/** Interval in ms to automatically refetch. Omit to disable */
	refetchInterval?: number;
	/**
	 * Accepted for API compat; no-op in Roblox (no background/foreground distinction).
	 */
	refetchIntervalInBackground?: boolean;
	/** Whether to refetch on mount. Default: true */
	refetchOnMount?: boolean;
	/** Transform/select a subset of the fetched data */
	select?: (data: TQueryFnData) => TData;
	/** Initial data to populate the cache. Counted toward staleness. */
	initialData?: TData | (() => TData | undefined);
	/** tick() timestamp indicating when initialData was last fresh */
	initialDataUpdatedAt?: number;
	/** Like initialData but NOT persisted to cache; does not affect staleness */
	placeholderData?: TData | ((previousData: TData | undefined) => TData | undefined);
	/** Throw errors to nearest error boundary. Default: false */
	throwOnError?: boolean | ((error: TError) => boolean);
	/** Arbitrary metadata attached to this query */
	meta?: Record<string, unknown>;
}

export interface UseQueryResult<TData = unknown, TError = unknown> {
	data: TData | undefined;
	error: TError | undefined;
	/** "pending" = no data yet; "error" = last fetch failed; "success" = data available */
	status: "pending" | "error" | "success";
	/** "fetching" = queryFn running; "paused" = paused; "idle" = not running */
	fetchStatus: "fetching" | "paused" | "idle";
	/** status === "pending" */
	isPending: boolean;
	/** status === "error" */
	isError: boolean;
	/** status === "success" */
	isSuccess: boolean;
	/** fetchStatus === "fetching" */
	isFetching: boolean;
	/** fetchStatus === "paused" (always false in Roblox) */
	isPaused: boolean;
	/** isPending && isFetching — initial load in progress */
	isLoading: boolean;
	/** isFetching && !isPending — background refetch */
	isRefetching: boolean;
	/** isError && dataUpdatedAt === 0 */
	isLoadingError: boolean;
	/** isError && dataUpdatedAt > 0 */
	isRefetchError: boolean;
	/** true if data is past staleTime */
	isStale: boolean;
	/** true if current data came from placeholderData */
	isPlaceholderData: boolean;
	dataUpdatedAt: number;
	errorUpdatedAt: number;
	failureCount: number;
	failureReason: TError | undefined;
	refetch: () => Promise<void>;
}

export interface InfiniteData<TData, TPageParam = unknown> {
	pages: TData[];
	pageParams: TPageParam[];
}

export interface UseInfiniteQueryOptions<
	TQueryFnData = unknown,
	TError = unknown,
	// TData is kept for API compatibility but pages are always TQueryFnData[]
	// The select transform is not supported on infinite queries
	TData = TQueryFnData,
	TPageParam = unknown,
> {
	queryKey: keytype;
	queryFn: (context: {
		queryKey: string;
		pageParam: TPageParam;
	}) => Promise<TQueryFnData>;
	/** REQUIRED: the pageParam used for the very first fetch */
	initialPageParam: TPageParam;
	/** Returns the next page param, or undefined/null to signal no next page */
	getNextPageParam: (
		lastPage: TQueryFnData,
		allPages: TQueryFnData[],
		lastPageParam: TPageParam,
		allPageParams: TPageParam[],
	) => TPageParam | undefined | undefined;
	/** Returns the previous page param, or undefined/null to signal no previous page */
	getPreviousPageParam?: (
		firstPage: TQueryFnData,
		allPages: TQueryFnData[],
		firstPageParam: TPageParam,
		allPageParams: TPageParam[],
	) => TPageParam | undefined | undefined;
	/** Max pages to keep in memory; oldest dropped when exceeded */
	maxPages?: number;
	enabled?: boolean;
	staleTime?: number;
	gcTime?: number;
	retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
	retryDelay?: number | ((failureCount: number, error: TError) => number);
	retryOnMount?: boolean;
	refetchInterval?: number;
	/** Accepted for API compat; no-op in Roblox */
	refetchIntervalInBackground?: boolean;
	refetchOnMount?: boolean;
	throwOnError?: boolean | ((error: TError) => boolean);
	meta?: Record<string, unknown>;
}

export interface UseInfiniteQueryResult<
	TData = unknown,
	TError = unknown,
	TPageParam = unknown,
> {
	data: InfiniteData<TData, TPageParam> | undefined;
	error: TError | undefined;
	status: "pending" | "error" | "success";
	fetchStatus: "fetching" | "paused" | "idle";
	isPending: boolean;
	isError: boolean;
	isSuccess: boolean;
	isFetching: boolean;
	isPaused: boolean;
	isLoading: boolean;
	isRefetching: boolean;
	isLoadingError: boolean;
	isRefetchError: boolean;
	isStale: boolean;
	dataUpdatedAt: number;
	errorUpdatedAt: number;
	failureCount: number;
	failureReason: TError | undefined;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	isFetchingNextPage: boolean;
	isFetchingPreviousPage: boolean;
	fetchNextPage: () => Promise<void>;
	fetchPreviousPage: () => Promise<void>;
	refetch: () => Promise<void>;
}

export interface MutateOptions<
	TData = unknown,
	TError = unknown,
	TVariables = unknown,
	TContext = unknown,
> {
	onSuccess?: (
		data: TData,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	onError?: (
		error: TError,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	onSettled?: (
		data: TData | undefined,
		error: TError | undefined,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
}

export interface UseMutationOptions<
	TData = unknown,
	TError = unknown,
	TVariables = unknown,
	TContext = unknown,
> {
	mutationFn: (variables: TVariables) => Promise<TData>;
	/** Key identifying this mutation (used for defaults lookup) */
	mutationKey?: keytype;
	retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
	retryDelay?: number | ((failureCount: number, error: TError) => number);
	gcTime?: number;
	/** Called before mutationFn. Return value becomes `context` for subsequent callbacks. */
	onMutate?: (
		variables: TVariables,
	) => Promise<TContext | undefined> | TContext | undefined;
	onSuccess?: (
		data: TData,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	onError?: (
		error: TError,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	onSettled?: (
		data: TData | undefined,
		error: TError | undefined,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	throwOnError?: boolean | ((error: TError) => boolean);
	meta?: Record<string, unknown>;
}

export interface UseMutationResult<
	TData = unknown,
	TError = unknown,
	TVariables = unknown,
	TContext = unknown,
> {
	data: TData | undefined;
	error: TError | undefined;
	status: "idle" | "pending" | "success" | "error";
	isIdle: boolean;
	isPending: boolean;
	isSuccess: boolean;
	isError: boolean;
	/** Always false in Roblox (no network pausing) */
	isPaused: boolean;
	failureCount: number;
	failureReason: TError | undefined;
	variables: TVariables | undefined;
	context: TContext | undefined;
	submittedAt: number;
	mutate: (
		variables: TVariables,
		options?: MutateOptions<TData, TError, TVariables, TContext>,
	) => void;
	mutateAsync: (
		variables: TVariables,
		options?: MutateOptions<TData, TError, TVariables, TContext>,
	) => Promise<TData>;
	reset: () => void;
}

// ============================================================
// SECTION 2: HELPERS
// ============================================================

/** Converts any keytype to a stable string representation */
function buildKey(args: keytype): string {
	if (
		typeOf(args) === "number" ||
		typeOf(args) === "string" ||
		typeOf(args) === "boolean"
	) {
		return tostring(args);
	}
	if (typeOf(args) === "table") {
		const arr: string[] = [];
		for (const [k, v] of pairs(args as { [key: string]: keytype })) {
			arr.push(`${tostring(k)}:${buildKey(v)}`);
		}
		return arr.join("|");
	}
	error(`Invalid key type: ${typeOf(args)}`);
}

function computeShouldRetry(
	retry:
		| boolean
		| number
		| ((failureCount: number, err: unknown) => boolean)
		| undefined,
	failureCount: number,
	err: unknown,
): boolean {
	if (retry === undefined || retry === false) return false;
	if (retry === true) return true;
	if (typeOf(retry) === "number") return failureCount < (retry as number);
	if (typeOf(retry) === "function")
		return (retry as (n: number, e: unknown) => boolean)(failureCount, err);
	return false;
}

function computeRetryDelay(
	retryDelay:
		| number
		| ((failureCount: number, err: unknown) => number)
		| undefined,
	failureCount: number,
	err: unknown,
): number {
	if (retryDelay === undefined)
		return math.min(1000 * 2 ** failureCount, 30000);
	if (typeOf(retryDelay) === "number") return retryDelay as number;
	if (typeOf(retryDelay) === "function")
		return (retryDelay as (n: number, e: unknown) => number)(failureCount, err);
	return math.min(1000 * 2 ** failureCount, 30000);
}

// ============================================================
// SECTION 3: QUERYCLIENT
// ============================================================

export class QueryClient {
	public readonly options: QueryClientOptions;

	private queryCache: Record<string, QueryCacheEntry> = {};
	private observers: Record<string, Array<() => void>> = {};
	private queryDefaultsMap: Record<string, Partial<UseQueryOptions>> = {};
	private mutationDefaultsMap: Record<string, Partial<UseMutationOptions>> =
		{};

	constructor(args?: QueryClientOptions) {
		// Properly merge args with hardcoded defaults
		this.options = {
			defaultOptions: {
				queries: {
					retry: 3,
					retryDelay: (failureCount: number) =>
						math.min(1000 * 2 ** failureCount, 30000),
					staleTime: 0,
					refetchOnMount: true,
					onError: (err: unknown, key: string) =>
						warn(`Query error for key '${key}': ${tostring(err)}`),
					...args?.defaultOptions?.queries,
				},
				mutations: {
					retry: 0,
					onError: (err: unknown, _variables: unknown, key: string) =>
						warn(`Mutation error for key '${key}': ${tostring(err)}`),
					...args?.defaultOptions?.mutations,
				},
			},
		};
	}

	/** Returns cached data for a query key, or undefined */
	public getQueryData<T>(queryKey: keytype): T | undefined {
		const entry = this.queryCache[buildKey(queryKey)];
		return entry?.data as T | undefined;
	}

	/**
	 * Synchronously sets/updates cached data for a query key.
	 * Notifies all active observers after updating.
	 */
	public setQueryData<T>(
		queryKey: keytype,
		updater: T | ((old: T | undefined) => T | undefined),
	): T | undefined {
		const joinedKey = buildKey(queryKey);
		const existing = this.queryCache[joinedKey];
		const oldData = existing?.data as T | undefined;
		const newData =
			typeOf(updater) === "function"
				? (updater as (old: T | undefined) => T | undefined)(oldData)
				: (updater as T);

		if (newData === undefined) {
			if (existing) {
				this.queryCache[joinedKey] = {
					...existing,
					data: undefined,
					status: "pending",
					isInvalidated: false,
				};
			}
		} else {
			this.queryCache[joinedKey] = {
				data: newData,
				dataUpdatedAt: tick(),
				error: undefined,
				errorUpdatedAt: existing?.errorUpdatedAt ?? 0,
				status: "success",
				isInvalidated: false,
				failureCount: 0,
				failureReason: undefined,
			};
		}
		this._notifyObservers(joinedKey);
		return newData;
	}

	/** Returns the full internal query state for a key */
	public getQueryState<TData = unknown, TError = unknown>(
		queryKey: keytype,
	): QueryState<TData, TError> | undefined {
		const entry = this.queryCache[buildKey(queryKey)];
		if (!entry) return undefined;
		return {
			data: entry.data as TData | undefined,
			dataUpdatedAt: entry.dataUpdatedAt,
			error: entry.error as TError | undefined,
			errorUpdatedAt: entry.errorUpdatedAt,
			status: entry.status,
			isInvalidated: entry.isInvalidated,
			failureCount: entry.failureCount,
			failureReason: entry.failureReason as TError | undefined,
		};
	}

	/**
	 * Marks matching queries as invalidated (stale) and notifies their observers.
	 * If no filter is given, all queries are invalidated.
	 */
	public invalidateQueries(filters?: {
		queryKey?: keytype;
		exact?: boolean;
	}): void {
		if (!filters || filters.queryKey === undefined) {
			for (const [k] of pairs(this.queryCache)) {
				this.queryCache[k as string].isInvalidated = true;
				this._notifyObservers(k as string);
			}
			return;
		}
		const filterKey = buildKey(filters.queryKey);
		for (const [k] of pairs(this.queryCache)) {
			const key = k as string;
			const matches = filters.exact
				? key === filterKey
				: key.find(filterKey, 1, true) !== undefined;
			if (matches) {
				this.queryCache[key].isInvalidated = true;
				this._notifyObservers(key);
			}
		}
	}

	/** Removes matching queries from the cache */
	public removeQueries(filters?: {
		queryKey?: keytype;
		exact?: boolean;
	}): void {
		if (!filters || filters.queryKey === undefined) {
			this.queryCache = {};
			return;
		}
		const filterKey = buildKey(filters.queryKey);
		const keysToDelete: string[] = [];
		for (const [k] of pairs(this.queryCache)) {
			const key = k as string;
			const matches = filters.exact
				? key === filterKey
				: key.find(filterKey, 1, true) !== undefined;
			if (matches) {
				keysToDelete.push(key);
			}
		}
		for (const key of keysToDelete) {
			delete this.queryCache[key];
		}
	}

	/** Removes all queries from the cache */
	public clear(): void {
		this.queryCache = {};
	}

	/** Set per-key query defaults (merged at lower priority than hook options) */
	public setQueryDefaults(
		queryKey: keytype,
		options: Partial<UseQueryOptions>,
	): void {
		this.queryDefaultsMap[buildKey(queryKey)] = options;
	}

	/** Get per-key query defaults */
	public getQueryDefaults(
		queryKey: keytype,
	): Partial<UseQueryOptions> | undefined {
		return this.queryDefaultsMap[buildKey(queryKey)];
	}

	/** Set per-key mutation defaults */
	public setMutationDefaults(
		mutationKey: keytype,
		options: Partial<UseMutationOptions>,
	): void {
		this.mutationDefaultsMap[buildKey(mutationKey)] = options;
	}

	/** Get per-key mutation defaults */
	public getMutationDefaults(
		mutationKey: keytype,
	): Partial<UseMutationOptions> | undefined {
		return this.mutationDefaultsMap[buildKey(mutationKey)];
	}

	/**
	 * Imperatively fetches a query. Returns cached data if still fresh.
	 * Throws on error.
	 */
	public async fetchQuery<T>(options: {
		queryKey: keytype;
		queryFn: (context: { queryKey: string }) => Promise<T>;
		staleTime?: number;
		retry?: boolean | number | ((failureCount: number, err: unknown) => boolean);
		retryDelay?: number | ((failureCount: number, err: unknown) => number);
	}): Promise<T> {
		const joinedKey = buildKey(options.queryKey);
		const staleTime =
			options.staleTime ??
			this.options.defaultOptions?.queries?.staleTime ??
			0;
		const entry = this.queryCache[joinedKey];
		if (
			entry &&
			entry.status === "success" &&
			!entry.isInvalidated &&
			tick() - entry.dataUpdatedAt < staleTime
		) {
			return entry.data as T;
		}

		const retry =
			options.retry ?? this.options.defaultOptions?.queries?.retry ?? 3;
		const retryDelay =
			options.retryDelay ??
			this.options.defaultOptions?.queries?.retryDelay;

		let failureCount = 0;
		while (true) {
			try {
				const result = await options.queryFn({ queryKey: joinedKey });
				this.queryCache[joinedKey] = {
					data: result,
					dataUpdatedAt: tick(),
					error: undefined,
					errorUpdatedAt: entry?.errorUpdatedAt ?? 0,
					status: "success",
					isInvalidated: false,
					failureCount: 0,
					failureReason: undefined,
				};
				this._notifyObservers(joinedKey);
				return result as T;
			} catch (err) {
				failureCount++;
				if (!computeShouldRetry(retry, failureCount, err)) {
					this.queryCache[joinedKey] = {
						data: entry?.data,
						dataUpdatedAt: entry?.dataUpdatedAt ?? 0,
						error: err,
						errorUpdatedAt: tick(),
						status: "error",
						isInvalidated: false,
						failureCount,
						failureReason: err,
					};
					this._notifyObservers(joinedKey);
					throw err;
				}
				wait(computeRetryDelay(retryDelay, failureCount, err) / 1000);
			}
		}
	}

	/**
	 * Like fetchQuery but never throws.
	 * Useful for prefetching data before a component mounts.
	 */
	public async prefetchQuery(options: {
		queryKey: keytype;
		queryFn: (context: { queryKey: string }) => Promise<unknown>;
		staleTime?: number;
		retry?: boolean | number | ((failureCount: number, err: unknown) => boolean);
		retryDelay?: number | ((failureCount: number, err: unknown) => number);
	}): Promise<void> {
		try {
			await this.fetchQuery(options);
		} catch {
			// swallow errors
		}
	}

	/** @internal - Register an observer callback for a joined key */
	public _registerObserver(joinedKey: string, cb: () => void): void {
		if (!this.observers[joinedKey]) {
			this.observers[joinedKey] = [];
		}
		this.observers[joinedKey].push(cb);
	}

	/** @internal - Unregister an observer callback */
	public _unregisterObserver(joinedKey: string, cb: () => void): void {
		const list = this.observers[joinedKey];
		if (!list) return;
		const idx = list.indexOf(cb);
		if (idx !== -1) {
			list.remove(idx);
		}
	}

	/** @internal - Notify all observers for a joined key */
	public _notifyObservers(joinedKey: string): void {
		const list = this.observers[joinedKey];
		if (!list) return;
		for (const cb of [...list]) {
			cb();
		}
	}

	/** @internal - Get raw cache entry */
	public _getCacheEntry(joinedKey: string): QueryCacheEntry | undefined {
		return this.queryCache[joinedKey];
	}

	/** @internal - Set raw cache entry (partial merge) */
	public _setCacheEntry(
		joinedKey: string,
		entry: Partial<QueryCacheEntry>,
	): void {
		this.queryCache[joinedKey] = {
			...(this.queryCache[joinedKey] ?? {
				data: undefined,
				dataUpdatedAt: 0,
				error: undefined,
				errorUpdatedAt: 0,
				status: "pending" as const,
				isInvalidated: false,
				failureCount: 0,
				failureReason: undefined,
			}),
			...entry,
		};
	}
}

// ============================================================
// SECTION 4: PROVIDER + useQueryClient
// ============================================================

const QueryContext = createContext<QueryClient | undefined>(undefined);

/** Wrap your app with this to provide a QueryClient to all child components */
export const QueryClientProvider = QueryContext.Provider;

/** Access the nearest QueryClient from React context */
export function useQueryClient(): QueryClient {
	const client = useContext(QueryContext);
	if (!client) {
		error(
			"No QueryClient found in context. Did you forget to wrap your app in <QueryClientProvider>?",
		);
	}
	return client;
}

// ============================================================
// SECTION 5: useQuery
// ============================================================

interface UseQueryInternalState<TData, TError> {
	data: TData | undefined;
	error: TError | undefined;
	status: "pending" | "error" | "success";
	fetchStatus: "fetching" | "paused" | "idle";
	dataUpdatedAt: number;
	errorUpdatedAt: number;
	failureCount: number;
	failureReason: TError | undefined;
	isPlaceholderData: boolean;
}

export function useQuery<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
>(
	options: UseQueryOptions<TQueryFnData, TError, TData>,
): UseQueryResult<TData, TError> {
	const client = useQueryClient();
	const joinedKey = buildKey(options.queryKey);

	// Resolve options: client defaults < key defaults < hook options
	const clientDefaults = client.options.defaultOptions?.queries ?? {};
	const keyDefaults = client.getQueryDefaults(options.queryKey) ?? {};
	const resolvedStaleTime =
		options.staleTime ??
		(keyDefaults as UseQueryOptions).staleTime ??
		clientDefaults.staleTime ??
		0;
	const resolvedRetry =
		options.retry ??
		(keyDefaults as UseQueryOptions).retry ??
		clientDefaults.retry ??
		3;
	const resolvedRetryDelay =
		options.retryDelay ??
		(keyDefaults as UseQueryOptions).retryDelay ??
		clientDefaults.retryDelay;
	const resolvedRefetchOnMount =
		(options.refetchOnMount ??
			(keyDefaults as UseQueryOptions).refetchOnMount ??
			clientDefaults.refetchOnMount) !== false;

	// Build initial state from cache or placeholderData
	const buildInitialState = (): UseQueryInternalState<TData, TError> => {
		const entry = client._getCacheEntry(joinedKey);
		if (
			entry &&
			entry.status === "success" &&
			!entry.isInvalidated &&
			tick() - entry.dataUpdatedAt < resolvedStaleTime
		) {
			return {
				data: (options.select
					? options.select(entry.data as TQueryFnData)
					: entry.data) as TData | undefined,
				error: undefined,
				status: "success",
				fetchStatus: "idle",
				dataUpdatedAt: entry.dataUpdatedAt,
				errorUpdatedAt: entry.errorUpdatedAt,
				failureCount: 0,
				failureReason: undefined,
				isPlaceholderData: false,
			};
		}

		// Check for initialData
		const initialDataValue =
			typeOf(options.initialData) === "function"
				? (options.initialData as () => TData | undefined)()
				: (options.initialData as TData | undefined);
		if (initialDataValue !== undefined) {
			const updatedAt = options.initialDataUpdatedAt ?? tick();
			client._setCacheEntry(joinedKey, {
				data: initialDataValue,
				dataUpdatedAt: updatedAt,
				error: undefined,
				errorUpdatedAt: 0,
				status: "success",
				isInvalidated: tick() - updatedAt >= resolvedStaleTime,
				failureCount: 0,
				failureReason: undefined,
			});
			return {
				data: initialDataValue,
				error: undefined,
				status: "success",
				fetchStatus: "idle",
				dataUpdatedAt: updatedAt,
				errorUpdatedAt: 0,
				failureCount: 0,
				failureReason: undefined,
				isPlaceholderData: false,
			};
		}

		// Check for placeholderData
		if (options.placeholderData !== undefined) {
			const ph =
				typeOf(options.placeholderData) === "function"
					? (
							options.placeholderData as (
								prev: TData | undefined,
							) => TData | undefined
						)(undefined)
					: (options.placeholderData as TData);
			if (ph !== undefined) {
				return {
					data: ph,
					error: undefined,
					status: "pending",
					fetchStatus: "idle",
					dataUpdatedAt: 0,
					errorUpdatedAt: 0,
					failureCount: 0,
					failureReason: undefined,
					isPlaceholderData: true,
				};
			}
		}

		return {
			data: undefined,
			error: undefined,
			status: "pending",
			fetchStatus: "idle",
			dataUpdatedAt: 0,
			errorUpdatedAt: 0,
			failureCount: 0,
			failureReason: undefined,
			isPlaceholderData: false,
		};
	};

	const [state, setState] = useState<UseQueryInternalState<TData, TError>>(
		buildInitialState,
	);

	// Ref to always have the latest runQuery without stale closure issues
	const runQueryRef = useRef<(isRefetch: boolean) => Promise<void>>(
		undefined!,
	);

	const runQuery = async (isRefetch: boolean): Promise<void> => {
		if (options.enabled === false) return;

		const currentEntry = client._getCacheEntry(joinedKey);

		// Freshness check: if fresh and not a forced refetch, load from cache
		if (
			!isRefetch &&
			currentEntry &&
			currentEntry.status === "success" &&
			!currentEntry.isInvalidated &&
			tick() - currentEntry.dataUpdatedAt < resolvedStaleTime
		) {
			const cachedData = (options.select
				? options.select(currentEntry.data as TQueryFnData)
				: currentEntry.data) as TData | undefined;
			setState({
				data: cachedData,
				error: undefined,
				status: "success",
				fetchStatus: "idle",
				dataUpdatedAt: currentEntry.dataUpdatedAt,
				errorUpdatedAt: currentEntry.errorUpdatedAt,
				failureCount: 0,
				failureReason: undefined,
				isPlaceholderData: false,
			});
			return;
		}

		// Mark as fetching
		setState((prev) => ({
			...prev,
			fetchStatus: "fetching" as const,
			status: (prev.status === "success" ? "success" : "pending") as
				| "pending"
				| "error"
				| "success",
			isPlaceholderData: false,
		}));

		let failureCount = 0;
		while (true) {
			try {
				const rawResult = await options.queryFn({ queryKey: joinedKey }) as TQueryFnData;
				const finalData = (options.select
					? options.select(rawResult)
					: rawResult) as TData;

				const now = tick();
				client._setCacheEntry(joinedKey, {
					data: finalData,
					dataUpdatedAt: now,
					error: undefined,
					errorUpdatedAt: currentEntry?.errorUpdatedAt ?? 0,
					status: "success",
					isInvalidated: false,
					failureCount: 0,
					failureReason: undefined,
				});

				setState((prev) => ({
					data: finalData,
					error: undefined,
					status: "success" as const,
					fetchStatus: "idle" as const,
					dataUpdatedAt: now,
					errorUpdatedAt: prev.errorUpdatedAt,
					failureCount: 0,
					failureReason: undefined,
					isPlaceholderData: false,
				}));

				clientDefaults.onSuccess?.(finalData, joinedKey);
				clientDefaults.onSettled?.(finalData, undefined, joinedKey);
				return;
			} catch (err) {
				failureCount++;
				if (!computeShouldRetry(resolvedRetry as boolean | number | ((failureCount: number, err: unknown) => boolean) | undefined, failureCount, err)) {
					const now = tick();
					client._setCacheEntry(joinedKey, {
						error: err,
						errorUpdatedAt: now,
						status: "error",
						isInvalidated: false,
						failureCount,
						failureReason: err,
					});

					setState((prev) => ({
						...prev,
						error: err as TError,
						errorUpdatedAt: now,
						status: "error" as const,
						fetchStatus: "idle" as const,
						failureCount,
						failureReason: err as TError,
					}));

					clientDefaults.onError?.(err, joinedKey);
					clientDefaults.onSettled?.(undefined, err, joinedKey);

					const throwOnError =
						options.throwOnError ??
						(clientDefaults as UseQueryOptions).throwOnError;
					if (
						throwOnError === true ||
						(typeOf(throwOnError) === "function" &&
							(throwOnError as (e: TError) => boolean)(err as TError))
					) {
						error(tostring(err));
					}
					return;
				}

				setState((prev) => ({
					...prev,
					failureCount,
					failureReason: err as TError,
				}));
				wait(
					computeRetryDelay(resolvedRetryDelay as number | ((failureCount: number, err: unknown) => number) | undefined, failureCount, err) / 1000,
				);
			}
		}
	};

	// Keep the ref up to date on every render
	runQueryRef.current = runQuery;

	// Effect: mount/key/enabled — triggers initial fetch or loads from cache
	useEffect(() => {
		if (options.enabled === false) return;

		const entry = client._getCacheEntry(joinedKey);
		const isFresh =
			entry &&
			entry.status === "success" &&
			!entry.isInvalidated &&
			tick() - entry.dataUpdatedAt < resolvedStaleTime;

		if (!resolvedRefetchOnMount && isFresh) {
			// Load from cache without refetching
			const cachedData = (options.select
				? options.select(entry!.data as TQueryFnData)
				: entry!.data) as TData | undefined;
			setState({
				data: cachedData,
				error: undefined,
				status: "success",
				fetchStatus: "idle",
				dataUpdatedAt: entry!.dataUpdatedAt,
				errorUpdatedAt: entry!.errorUpdatedAt,
				failureCount: 0,
				failureReason: undefined,
				isPlaceholderData: false,
			});
			return;
		}

		const thread = task.spawn(() => {
			runQueryRef.current(false).await();
		});
		return () => {
			task.cancel(thread);
		};
	}, [joinedKey, options.enabled]);

	// Effect: observer registration — receives invalidateQueries notifications
	useEffect(() => {
		const cb = () => {
			task.spawn(() => {
				runQueryRef.current(true).await();
			});
		};
		client._registerObserver(joinedKey, cb);
		return () => {
			client._unregisterObserver(joinedKey, cb);
		};
	}, [joinedKey]);

	// Effect: refetchInterval polling
	useEffect(() => {
		if (options.refetchInterval === undefined || options.enabled === false)
			return;
		const intervalSec = options.refetchInterval / 1000;
		const thread = task.spawn(() => {
			while (true) {
				wait(intervalSec);
				if (options.enabled !== false) {
					runQueryRef.current(true).await();
				}
			}
		});
		return () => {
			task.cancel(thread);
		};
	}, [options.refetchInterval, options.enabled]);

	// Compute derived values
	const isPending = state.status === "pending";
	const isError = state.status === "error";
	const isSuccess = state.status === "success";
	const isFetching = state.fetchStatus === "fetching";
	const isPaused = state.fetchStatus === "paused";
	const isLoading = isPending && isFetching;
	const isRefetching = isFetching && !isPending;
	const isLoadingError = isError && state.dataUpdatedAt === 0;
	const isRefetchError = isError && state.dataUpdatedAt > 0;
	const isStale =
		state.status === "success"
			? tick() - state.dataUpdatedAt >= resolvedStaleTime
			: true;

	return {
		data: state.data,
		error: state.error,
		status: state.status,
		fetchStatus: state.fetchStatus,
		isPending,
		isError,
		isSuccess,
		isFetching,
		isPaused,
		isLoading,
		isRefetching,
		isLoadingError,
		isRefetchError,
		isStale,
		isPlaceholderData: state.isPlaceholderData,
		dataUpdatedAt: state.dataUpdatedAt,
		errorUpdatedAt: state.errorUpdatedAt,
		failureCount: state.failureCount,
		failureReason: state.failureReason,
		refetch: () => runQuery(true),
	};
}

// ============================================================
// SECTION 6: useInfiniteQuery
// ============================================================

interface InfiniteQueryInternalState<TQueryFnData, TError, TPageParam> {
	pages: TQueryFnData[];
	pageParams: TPageParam[];
	status: "pending" | "error" | "success";
	fetchStatus: "fetching" | "paused" | "idle";
	error: TError | undefined;
	dataUpdatedAt: number;
	errorUpdatedAt: number;
	failureCount: number;
	failureReason: TError | undefined;
	isFetchingNextPage: boolean;
	isFetchingPreviousPage: boolean;
}

export function useInfiniteQuery<
	TQueryFnData extends defined = defined,
	TError = unknown,
	TData = TQueryFnData,
	TPageParam extends defined = defined,
>(
	options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TPageParam>,
): UseInfiniteQueryResult<TData, TError, TPageParam> {
	const client = useQueryClient();
	const joinedKey = buildKey(options.queryKey);

	const clientDefaults = client.options.defaultOptions?.queries ?? {};
	const keyDefaults = client.getQueryDefaults(options.queryKey) ?? {};
	const resolvedStaleTime =
		options.staleTime ??
		(keyDefaults as UseQueryOptions).staleTime ??
		clientDefaults.staleTime ??
		0;
	const resolvedRetry =
		options.retry ??
		(keyDefaults as UseQueryOptions).retry ??
		clientDefaults.retry ??
		3;
	const resolvedRetryDelay =
		options.retryDelay ??
		(keyDefaults as UseQueryOptions).retryDelay ??
		clientDefaults.retryDelay;
	const resolvedRefetchOnMount =
		(options.refetchOnMount ??
			(keyDefaults as UseQueryOptions).refetchOnMount ??
			clientDefaults.refetchOnMount) !== false;

	const buildInitialState = (): InfiniteQueryInternalState<
		TQueryFnData,
		TError,
		TPageParam
	> => {
		const entry = client._getCacheEntry(joinedKey);
		if (
			entry &&
			entry.status === "success" &&
			!entry.isInvalidated &&
			tick() - entry.dataUpdatedAt < resolvedStaleTime
		) {
			const cached = entry.data as InfiniteData<TQueryFnData, TPageParam>;
			return {
				pages: cached.pages,
				pageParams: cached.pageParams,
				status: "success",
				fetchStatus: "idle",
				error: undefined,
				dataUpdatedAt: entry.dataUpdatedAt,
				errorUpdatedAt: entry.errorUpdatedAt,
				failureCount: 0,
				failureReason: undefined,
				isFetchingNextPage: false,
				isFetchingPreviousPage: false,
			};
		}
		return {
			pages: [],
			pageParams: [options.initialPageParam],
			status: "pending",
			fetchStatus: "idle",
			error: undefined,
			dataUpdatedAt: 0,
			errorUpdatedAt: 0,
			failureCount: 0,
			failureReason: undefined,
			isFetchingNextPage: false,
			isFetchingPreviousPage: false,
		};
	};

	const [state, setState] = useState<
		InfiniteQueryInternalState<TQueryFnData, TError, TPageParam>
	>(buildInitialState);

	const runQueryRef = useRef<(isRefetch: boolean) => Promise<void>>(
		undefined!,
	);

	const runQuery = async (isRefetch: boolean): Promise<void> => {
		if (options.enabled === false) return;

		const entry = client._getCacheEntry(joinedKey);
		if (
			!isRefetch &&
			entry &&
			entry.status === "success" &&
			!entry.isInvalidated &&
			tick() - entry.dataUpdatedAt < resolvedStaleTime
		) {
			const cached = entry.data as InfiniteData<TQueryFnData, TPageParam>;
			setState((prev) => ({
				...prev,
				pages: cached.pages,
				pageParams: cached.pageParams,
				status: "success" as const,
				fetchStatus: "idle" as const,
				error: undefined,
				dataUpdatedAt: entry.dataUpdatedAt,
				errorUpdatedAt: entry.errorUpdatedAt,
				failureCount: 0,
				failureReason: undefined,
			}));
			return;
		}

		setState((prev) => ({
			...prev,
			fetchStatus: "fetching" as const,
			status: (prev.status === "success" ? "success" : "pending") as
				| "pending"
				| "error"
				| "success",
		}));

		let failureCount = 0;
		while (true) {
			try {
				const firstPage = await options.queryFn({
					queryKey: joinedKey,
					pageParam: options.initialPageParam,
				}) as TQueryFnData;
				const pages: TQueryFnData[] = [firstPage];
				const pageParams: TPageParam[] = [options.initialPageParam];

				const now = tick();
				const infiniteData: InfiniteData<TQueryFnData, TPageParam> = {
					pages,
					pageParams,
				};
				client._setCacheEntry(joinedKey, {
					data: infiniteData,
					dataUpdatedAt: now,
					error: undefined,
					errorUpdatedAt: 0,
					status: "success",
					isInvalidated: false,
					failureCount: 0,
					failureReason: undefined,
				});

				setState((prev) => ({
					...prev,
					pages,
					pageParams,
					status: "success" as const,
					fetchStatus: "idle" as const,
					error: undefined,
					dataUpdatedAt: now,
					failureCount: 0,
					failureReason: undefined,
				}));

				clientDefaults.onSuccess?.(infiniteData, joinedKey);
				clientDefaults.onSettled?.(infiniteData, undefined, joinedKey);
				return;
			} catch (err) {
				failureCount++;
				if (!computeShouldRetry(resolvedRetry as boolean | number | ((failureCount: number, err: unknown) => boolean) | undefined, failureCount, err)) {
					const now = tick();
					client._setCacheEntry(joinedKey, {
						error: err,
						errorUpdatedAt: now,
						status: "error",
						isInvalidated: false,
						failureCount,
						failureReason: err,
					});
					setState((prev) => ({
						...prev,
						error: err as TError,
						errorUpdatedAt: now,
						status: "error" as const,
						fetchStatus: "idle" as const,
						failureCount,
						failureReason: err as TError,
					}));
					clientDefaults.onError?.(err, joinedKey);
					clientDefaults.onSettled?.(undefined, err, joinedKey);

					const throwOnError =
						options.throwOnError ??
						(clientDefaults as UseQueryOptions).throwOnError;
					if (
						throwOnError === true ||
						(typeOf(throwOnError) === "function" &&
							(throwOnError as (e: TError) => boolean)(err as TError))
					) {
						error(tostring(err));
					}
					return;
				}
				setState((prev) => ({
					...prev,
					failureCount,
					failureReason: err as TError,
				}));
				wait(computeRetryDelay(resolvedRetryDelay as number | ((failureCount: number, err: unknown) => number) | undefined, failureCount, err) / 1000);
			}
		}
	};

	runQueryRef.current = runQuery;

	const fetchNextPage = async (): Promise<void> => {
		const { pages, pageParams } = state;
		if (pages.size() === 0) return;

		const lastPage = pages[pages.size() - 1];
		const lastPageParam = pageParams[pageParams.size() - 1];
		const nextPageParam = options.getNextPageParam(
			lastPage,
			pages,
			lastPageParam,
			pageParams,
		);
		if (nextPageParam === undefined || nextPageParam === undefined) return;

		setState((prev) => ({ ...prev, isFetchingNextPage: true }));

		let failureCount = 0;
		while (true) {
			try {
				const newPage = (await options.queryFn({
					queryKey: joinedKey,
					pageParam: nextPageParam,
				})) as TQueryFnData;

				const prevPages = state.pages;
				const prevParams = state.pageParams;
				let newPages: TQueryFnData[] = [...prevPages, newPage];
				let newPageParams: TPageParam[] = [...prevParams, nextPageParam];
				if (options.maxPages !== undefined && newPages.size() > options.maxPages) {
					const drop = newPages.size() - options.maxPages;
					const trimmedPages: TQueryFnData[] = [];
					const trimmedParams: TPageParam[] = [];
					for (let i = drop; i < newPages.size(); i++) {
						trimmedPages.push(newPages[i]);
						trimmedParams.push(newPageParams[i]);
					}
					newPages = trimmedPages;
					newPageParams = trimmedParams;
				}
				const now = tick();
				const infiniteData: InfiniteData<TQueryFnData, TPageParam> = {
					pages: newPages,
					pageParams: newPageParams,
				};
				client._setCacheEntry(joinedKey, {
					data: infiniteData,
					dataUpdatedAt: now,
					status: "success",
					isInvalidated: false,
				});
				setState((prev) => ({
					...prev,
					pages: newPages,
					pageParams: newPageParams,
					dataUpdatedAt: now,
					isFetchingNextPage: false,
				}));
				return;
			} catch (err) {
				failureCount++;
				if (!computeShouldRetry(resolvedRetry as boolean | number | ((failureCount: number, err: unknown) => boolean) | undefined, failureCount, err)) {
					setState((prev) => ({ ...prev, isFetchingNextPage: false }));
					return;
				}
				wait(computeRetryDelay(resolvedRetryDelay as number | ((failureCount: number, err: unknown) => number) | undefined, failureCount, err) / 1000);
			}
		}
	};

	const fetchPreviousPage = async (): Promise<void> => {
		if (!options.getPreviousPageParam) return;
		const { pages, pageParams } = state;
		if (pages.size() === 0) return;

		const firstPage = pages[0];
		const firstPageParam = pageParams[0];
		const prevPageParam = options.getPreviousPageParam(
			firstPage,
			pages,
			firstPageParam,
			pageParams,
		);
		if (prevPageParam === undefined || prevPageParam === undefined) return;

		setState((prev) => ({ ...prev, isFetchingPreviousPage: true }));

		let failureCount = 0;
		while (true) {
			try {
				const newPage = (await options.queryFn({
					queryKey: joinedKey,
					pageParam: prevPageParam,
				})) as TQueryFnData;

				const prevPages = state.pages;
				const prevParams = state.pageParams;
				let newPages: TQueryFnData[] = [newPage, ...prevPages];
				let newPageParams: TPageParam[] = [prevPageParam, ...prevParams];
				if (options.maxPages !== undefined && newPages.size() > options.maxPages) {
					const trimmedPages: TQueryFnData[] = [];
					const trimmedParams: TPageParam[] = [];
					for (let i = 0; i < (options.maxPages as number); i++) {
						trimmedPages.push(newPages[i]);
						trimmedParams.push(newPageParams[i]);
					}
					newPages = trimmedPages;
					newPageParams = trimmedParams;
				}
				const now = tick();
				const infiniteData: InfiniteData<TQueryFnData, TPageParam> = {
					pages: newPages,
					pageParams: newPageParams,
				};
				client._setCacheEntry(joinedKey, {
					data: infiniteData,
					dataUpdatedAt: now,
					status: "success",
					isInvalidated: false,
				});
				setState((prev) => ({
					...prev,
					pages: newPages,
					pageParams: newPageParams,
					dataUpdatedAt: now,
					isFetchingPreviousPage: false,
				}));
				return;
			} catch (err) {
				failureCount++;
				if (!computeShouldRetry(resolvedRetry as boolean | number | ((failureCount: number, err: unknown) => boolean) | undefined, failureCount, err)) {
					setState((prev) => ({ ...prev, isFetchingPreviousPage: false }));
					return;
				}
				wait(computeRetryDelay(resolvedRetryDelay as number | ((failureCount: number, err: unknown) => number) | undefined, failureCount, err) / 1000);
			}
		}
	};

	// Effects (same pattern as useQuery)
	useEffect(() => {
		if (options.enabled === false) return;

		const entry = client._getCacheEntry(joinedKey);
		const isFresh =
			entry &&
			entry.status === "success" &&
			!entry.isInvalidated &&
			tick() - entry.dataUpdatedAt < resolvedStaleTime;

		if (!resolvedRefetchOnMount && isFresh) {
			const cached = entry!.data as InfiniteData<TQueryFnData, TPageParam>;
			setState((prev) => ({
				...prev,
				pages: cached.pages,
				pageParams: cached.pageParams,
				status: "success" as const,
				fetchStatus: "idle" as const,
				dataUpdatedAt: entry!.dataUpdatedAt,
			}));
			return;
		}

		const thread = task.spawn(() => {
			runQueryRef.current(false).await();
		});
		return () => {
			task.cancel(thread);
		};
	}, [joinedKey, options.enabled]);

	useEffect(() => {
		const cb = () => {
			task.spawn(() => {
				runQueryRef.current(true).await();
			});
		};
		client._registerObserver(joinedKey, cb);
		return () => {
			client._unregisterObserver(joinedKey, cb);
		};
	}, [joinedKey]);

	useEffect(() => {
		if (options.refetchInterval === undefined || options.enabled === false)
			return;
		const intervalSec = options.refetchInterval / 1000;
		const thread = task.spawn(() => {
			while (true) {
				wait(intervalSec);
				if (options.enabled !== false) {
					runQueryRef.current(true).await();
				}
			}
		});
		return () => {
			task.cancel(thread);
		};
	}, [options.refetchInterval, options.enabled]);

	// Compute derived values
	const isPending = state.status === "pending";
	const isError = state.status === "error";
	const isSuccess = state.status === "success";
	const isFetching = state.fetchStatus === "fetching";
	const isPaused = state.fetchStatus === "paused";
	const isLoading = isPending && isFetching;
	const isRefetching = isFetching && !isPending;
	const isLoadingError = isError && state.dataUpdatedAt === 0;
	const isRefetchError = isError && state.dataUpdatedAt > 0;
	const isStale =
		state.status === "success"
			? tick() - state.dataUpdatedAt >= resolvedStaleTime
			: true;

	const { pages, pageParams } = state;
	const pagesSize = pages.size();
	const lastPage = pagesSize > 0 ? pages[pagesSize - 1] : undefined;
	const firstPage = pagesSize > 0 ? pages[0] : undefined;
	const lastPageParam =
		pageParams.size() > 0 ? pageParams[pageParams.size() - 1] : undefined;
	const firstPageParam = pageParams.size() > 0 ? pageParams[0] : undefined;

	const hasNextPage =
		lastPage !== undefined &&
		lastPageParam !== undefined &&
		options.getNextPageParam(lastPage, pages, lastPageParam, pageParams) !==
			undefined;

	const hasPreviousPage =
		options.getPreviousPageParam !== undefined &&
		firstPage !== undefined &&
		firstPageParam !== undefined &&
		options.getPreviousPageParam(
			firstPage,
			pages,
			firstPageParam,
			pageParams,
		) !== undefined;

	const data: InfiniteData<TData, TPageParam> | undefined = isSuccess
		? { pages: pages as unknown as TData[], pageParams }
		: undefined;

	return {
		data,
		error: state.error,
		status: state.status,
		fetchStatus: state.fetchStatus,
		isPending,
		isError,
		isSuccess,
		isFetching,
		isPaused,
		isLoading,
		isRefetching,
		isLoadingError,
		isRefetchError,
		isStale,
		dataUpdatedAt: state.dataUpdatedAt,
		errorUpdatedAt: state.errorUpdatedAt,
		failureCount: state.failureCount,
		failureReason: state.failureReason,
		hasNextPage,
		hasPreviousPage,
		isFetchingNextPage: state.isFetchingNextPage,
		isFetchingPreviousPage: state.isFetchingPreviousPage,
		fetchNextPage,
		fetchPreviousPage,
		refetch: () => runQuery(true),
	};
}

// ============================================================
// SECTION 7: useMutation
// ============================================================

interface UseMutationInternalState<TData, TError, TVariables, TContext> {
	data: TData | undefined;
	error: TError | undefined;
	status: "idle" | "pending" | "success" | "error";
	variables: TVariables | undefined;
	context: TContext | undefined;
	failureCount: number;
	failureReason: TError | undefined;
	submittedAt: number;
}

export function useMutation<
	TData = unknown,
	TError = unknown,
	TVariables = void,
	TContext = unknown,
>(
	options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
	const client = useQueryClient();
	const mutationKeyJoined = options.mutationKey
		? buildKey(options.mutationKey)
		: "";

	const clientDefaults = client.options.defaultOptions?.mutations ?? {};
	const keyDefaults = options.mutationKey
		? (client.getMutationDefaults(options.mutationKey) ?? {})
		: {};
	const resolvedRetry =
		options.retry ??
		(keyDefaults as UseMutationOptions).retry ??
		clientDefaults.retry ??
		0;
	const resolvedRetryDelay =
		options.retryDelay ??
		(keyDefaults as UseMutationOptions).retryDelay ??
		clientDefaults.retryDelay;

	const [state, setState] = useState<
		UseMutationInternalState<TData, TError, TVariables, TContext>
	>({
		data: undefined,
		error: undefined,
		status: "idle",
		variables: undefined,
		context: undefined,
		failureCount: 0,
		failureReason: undefined,
		submittedAt: 0,
	});

	// Ref so mutate always calls the latest mutateAsync
	const mutateAsyncRef = useRef<
		(
			variables: TVariables,
			callOptions?: MutateOptions<TData, TError, TVariables, TContext>,
		) => Promise<TData>
	>(undefined!);

	const mutateAsync = async (
		variables: TVariables,
		callOptions?: MutateOptions<TData, TError, TVariables, TContext>,
	): Promise<TData> => {
		const submittedAt = tick();

		setState({
			data: undefined,
			error: undefined,
			status: "pending",
			variables,
			context: undefined,
			failureCount: 0,
			failureReason: undefined,
			submittedAt,
		});

		// Run onMutate for optimistic updates; capture context as a local variable
		let context: TContext | undefined = undefined;
		if (options.onMutate) {
			try {
				const maybeContext = options.onMutate(variables);
				// Check if it's a Promise (has .await method in roblox-ts)
				if (
					typeOf(maybeContext) === "table" &&
					(maybeContext as { await?: unknown }).await !== undefined
				) {
					context = (await (maybeContext as Promise<TContext | undefined>)) as TContext | undefined;
				} else {
					context = maybeContext as TContext | undefined;
				}
				setState((prev) => ({ ...prev, context }));
			} catch (mutateErr) {
				setState((prev) => ({
					...prev,
					status: "error",
					error: mutateErr as TError,
				}));
				throw mutateErr;
			}
		}

		// Retry loop
		let failureCount = 0;
		while (true) {
			try {
				const result = await options.mutationFn(variables) as TData;

				// Capture in local vars before setState (fixes stale state read bug)
				const finalData = result;
				const finalContext = context;

				setState({
					data: finalData,
					error: undefined,
					status: "success",
					variables,
					context: finalContext,
					failureCount: 0,
					failureReason: undefined,
					submittedAt,
				});

				// Each handler called exactly once, in correct priority order
				options.onSuccess?.(finalData, variables, finalContext);
				callOptions?.onSuccess?.(finalData, variables, finalContext);
				(clientDefaults as DefaultMutationOptions).onSuccess?.(
					finalData,
					variables,
					mutationKeyJoined,
				);

				options.onSettled?.(finalData, undefined, variables, finalContext);
				callOptions?.onSettled?.(finalData, undefined, variables, finalContext);
				(clientDefaults as DefaultMutationOptions).onSettled?.(
					finalData,
					undefined,
					variables,
					mutationKeyJoined,
				);

				return finalData;
			} catch (err) {
				failureCount++;
				if (!computeShouldRetry(resolvedRetry as boolean | number | ((failureCount: number, err: unknown) => boolean) | undefined, failureCount, err)) {
					// Capture in local vars (fixes stale state read bug)
					const finalErr = err as TError;
					const finalContext = context;

					setState({
						data: undefined,
						error: finalErr,
						status: "error",
						variables,
						context: finalContext,
						failureCount,
						failureReason: finalErr,
						submittedAt,
					});

					// Each handler called exactly once (fixes double-call bug)
					options.onError?.(finalErr, variables, finalContext);
					callOptions?.onError?.(finalErr, variables, finalContext);
					(clientDefaults as DefaultMutationOptions).onError?.(
						finalErr,
						variables,
						mutationKeyJoined,
					);

					options.onSettled?.(undefined, finalErr, variables, finalContext);
					callOptions?.onSettled?.(
						undefined,
						finalErr,
						variables,
						finalContext,
					);
					(clientDefaults as DefaultMutationOptions).onSettled?.(
						undefined,
						finalErr,
						variables,
						mutationKeyJoined,
					);

					const throwOnError = options.throwOnError;
					if (
						throwOnError === true ||
						(typeOf(throwOnError) === "function" &&
							(throwOnError as (e: TError) => boolean)(finalErr))
					) {
						throw finalErr;
					}

					return undefined!;
				}

				setState((prev) => ({
					...prev,
					failureCount,
					failureReason: err as TError,
				}));
				wait(computeRetryDelay(resolvedRetryDelay as number | ((failureCount: number, err: unknown) => number) | undefined, failureCount, err) / 1000);
			}
		}
	};

	mutateAsyncRef.current = mutateAsync;

	const mutate = (
		variables: TVariables,
		callOptions?: MutateOptions<TData, TError, TVariables, TContext>,
	): void => {
		task.spawn(() => {
			pcall(() => {
				mutateAsyncRef.current(variables, callOptions).await();
			});
		});
	};

	const reset = (): void => {
		setState({
			data: undefined,
			error: undefined,
			status: "idle",
			variables: undefined,
			context: undefined,
			failureCount: 0,
			failureReason: undefined,
			submittedAt: 0,
		});
	};

	const isIdle = state.status === "idle";
	const isPending = state.status === "pending";
	const isSuccess = state.status === "success";
	const isError = state.status === "error";

	return {
		data: state.data,
		error: state.error,
		status: state.status,
		isIdle,
		isPending,
		isSuccess,
		isError,
		isPaused: false,
		failureCount: state.failureCount,
		failureReason: state.failureReason,
		variables: state.variables,
		context: state.context,
		submittedAt: state.submittedAt,
		mutate,
		mutateAsync: (vars, opts) => mutateAsyncRef.current(vars, opts),
		reset,
	};
}
