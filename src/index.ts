import { createContext, useContext, useMemo, useState } from "@rbxts/react";
interface queryOptions {
	queries?: {
		/**Number of times to retry a failed query, or set to true to retry infinitely */
		retry?: boolean | number;
		/**
		 * Time in milliseconds to wait before retrying a failed query, or a function that receives the failure count and returns the time to wait
		 */
		retryDelay?: number | ((failureCount: number) => number);
		/**
		 * Time in milliseconds after data is considered stale, when a data is considered stale query will try to refetch when the component remounts or window refocuses
		 * If the data is considered fresh, it will **not** refetch
		 * */
		staleTime?: number;
		/**Global error handler for queries */
		onError?: (key: string, error: unknown) => void;
	};
	mutations?: {
		/**Global error handler for mutations */
		onError?: (key: string, error: unknown, variables: unknown) => void;
	};
}
export class QueryClient {
	constructor(args: queryOptions) {
		this.options = {
			mutations: {
				...this.options.mutations,
			},
			queries: {
				...this.options.queries,
			},
		};
	}
	public readonly options: queryOptions = {
		mutations: {
			onError: (key: string, err: unknown, _variables: unknown) => {
				warn(
					`Mutation error for key '${key}': ${tostring(err)}\nVariables:`,
					_variables,
				);
			},
		},
		queries: {
			retry: 3,
			retryDelay: (failureCount: number) =>
				math.min(1000 * 2 ** failureCount, 30000),
			staleTime: 0,
			onError: (key: string, err: unknown) => {
				warn(`Query error for key '${key}': ${tostring(err)}`);
			},
		},
	};
	public getQueryCacheFromKey<T>(key: keytype) {
		const joined_key = buildKey(key);
		return this.queryCache[joined_key] as
			| { data: T; created_at: number }
			| undefined;
	}
	public setQueryCacheForKey<T>(key: keytype, data: T) {
		const joined_key = buildKey(key);
		this.queryCache[joined_key] = {
			data: data,
			created_at: tick(),
		};
	}
	private queryCache: Record<string, { data: unknown; created_at: number }> =
		{};
}
const QueryContext = createContext<QueryClient | undefined>(undefined);
export const QueryClientProvider = QueryContext.Provider;
export function useQueryClient() {
	const client = useContext(QueryContext);
	if (!client) {
		error(
			"No QueryClient found in context, did you forget to wrap your app in a QueryClientProvider?",
		);
	}
	return client;
}
export function useQuery<T>(args: {
	queryKey: keytype;
	queryFn: () => Promise<T>;
	enabled?: boolean;
	/** Time in milliseconds after data is considered stale, when a data is considered stale query will try to refetch when the component remounts or window refocuses
	 * If the data is considered fresh, it will **not** refetch
	 * */
	refetchInterval?: number;
	staleTime?: number;
	onError?: (error: unknown) => void;
	onSuccess?: (data: T) => void;
	onSettled?: (data: T | undefined, error: unknown | undefined) => void;
}) {
	const query_client = useQueryClient();
	const query_key_joined = buildKey(args.queryKey);
	const [state, setState] = useState<{
		data: T | undefined;
		isLoading: boolean;
		isRefetching: boolean;
		err: unknown;
	}>({
		data: undefined,
		isLoading: false,
		isRefetching: false,
		err: undefined,
	});
	async function fetchData(is_refetch = false) {
		const cached_entry = query_client.getQueryCacheFromKey<T>(args.queryKey);
		// if we have a cached entry and we're not refetching, check if it's stale
		if (cached_entry && !is_refetch) {
			// check if it's stale
			if (
				tick() - cached_entry.created_at <
				(args.staleTime ?? query_client.options.queries?.staleTime ?? 0)
			) {
				const data = cached_entry.data;
				// if the data is not undefined, return it
				if (data !== undefined) {
					setState({
						data: cached_entry.data,
						isLoading: false,
						isRefetching: false,
						err: undefined,
					});
					return;
				}
			}
		}
		setState((prev) => ({
			isLoading: is_refetch ? false : true,
			isRefetching: is_refetch,
			data: is_refetch ? prev.data : undefined,
			err: undefined,
		}));
		try {
			const result = (await args.queryFn()) as T;
			if (result === undefined) {
				error("Data returned from queryFn cannot be undefined");
			}
			query_client.setQueryCacheForKey(args.queryKey, result);
			args.onSuccess?.(result);
			args.onSettled?.(result, undefined);
			setState({
				data: result,
				isLoading: false,
				isRefetching: false,
				err: undefined,
			});
		} catch (err) {
			const target_err = args.onError
				? () => args.onError?.(err)
				: () => query_client.options.queries?.onError?.(query_key_joined, err);
			target_err();
			args.onSettled?.(undefined, err);
			setState({
				data: undefined,
				isLoading: false,
				isRefetching: false,
				err: err,
			});
		}
	}
	useMemo(() => {
		if (args.enabled !== false) {
			fetchData();
		}
	}, [query_key_joined, args.enabled]);

	useMemo(() => {
		let thread: thread | undefined = undefined;
		if (args.refetchInterval !== undefined && args.enabled !== false) {
			thread = task.spawn(() => {
				while (true) {
					wait(args.refetchInterval! / 1000);
					if (args.enabled !== false) {
						fetchData(true);
					}
				}
			});
		}
		return () => {
			if (thread) {
				task.cancel(thread);
			}
		};
	}, [args.refetchInterval, args.enabled]);

	return { ...state, refetch: () => fetchData(true) };
}
type keytype =
	| string
	| number
	| boolean
	| keytype[]
	| { [key: string]: keytype };
function buildKey(args: keytype): string {
	if (
		typeOf(args) === "number" ||
		typeOf(args) === "string" ||
		typeOf(args) === "boolean"
	) {
		return tostring(args);
	}
	if (typeOf(args) === "table") {
		const arr = [] as string[];
		for (const [k, v] of pairs(args as { [key: string]: keytype })) {
			arr.push(`${k}:${buildKey(v)}`);
		}
		return arr.join("|");
	}
	error(`Invalid key type: ${typeOf(args)}`);
}
export function useMutation<TArgs extends unknown[], TData>(args: {
	mutationFn: (...args: TArgs) => Promise<TData>;
	queryKey?: keytype;
	onError?: (error: unknown) => void;
	onSuccess?: (data: TData) => void;
	onSettled?: (data: TData | undefined, error: unknown | undefined) => void;
}) {
	const query_client = useQueryClient();
	const query_key_joined = buildKey(args.queryKey ?? []);
	const [state, setState] = useState<{
		data: TData | undefined;
		isLoading: boolean;
		err: unknown;
	}>({
		data: undefined,
		isLoading: false,
		err: undefined,
	});

	async function mutate(...mutationArgs: TArgs) {
		setState((prev) => ({
			...prev,
			isLoading: true,
			data: undefined,
			err: undefined,
		}));
		try {
			const result = (await args.mutationFn(...mutationArgs)) as TData;
			args.onSuccess?.(result);
			setState({ data: result, isLoading: false, err: undefined });
		} catch (err) {
			query_client.options.mutations?.onError?.(
				query_key_joined,
				err,
				mutationArgs,
			);
			const target_err = args.onError
				? () => args.onError?.(err)
				: () =>
						query_client.options.mutations?.onError?.(
							query_key_joined,
							err,
							mutationArgs,
						);
			target_err();
			setState({ data: undefined, isLoading: false, err: err });
		}
		args.onSettled?.(state.data, state.err);
	}

	return { ...state, mutate };
}
