import { useMemo, useState } from "@rbxts/react"

export function useQuery<T>(args: {
	queryKey: string[] | string
	queryFn: () => Promise<T>
	enabled?: boolean
}) {
	const query_key_joined = typeOf(args.queryKey) === "table"
		? (args.queryKey as string[]).join("|")
		: (args.queryKey as string)
	const [state, setState] = useState<{
		data: T | undefined
		isLoading: boolean
		err: unknown
	}>({
		data: undefined,
		isLoading: false,
		err: undefined,
	})

	async function fetchData() {
		setState((prev) => ({ ...prev, isLoading: true,data:undefined,err:undefined }))
		try {
			const result = await args.queryFn() as T
			if (result === undefined) {
				error("Data returned from queryFn cannot be undefined")
			}
			setState({ data: result, isLoading: false, err: undefined })
		} catch (err) {
			setState({ data: undefined, isLoading: false, err: err })
		}
	}
	useMemo(() => {
		if (args.enabled !== false) {
			fetchData()
		}
	}, [query_key_joined, args.enabled])

	return {...state, refetch: fetchData}
}

export function useMutation<TArgs extends unknown[], TData>(args: {
	mutationFn: (...args: TArgs) => Promise<TData>
}) {
	const [state, setState] = useState<{
		data: TData | undefined
		isLoading: boolean
		err: unknown
	}>({
		data: undefined,
		isLoading: false,
		err: undefined,
	})

	async function mutate(...mutationArgs: TArgs) {
		setState((prev) => ({ ...prev, isLoading: true,data:undefined,err:undefined }))
		try {
			const result = await args.mutationFn(...mutationArgs) as TData
			if (result === undefined) {
				error("Data returned from mutationFn cannot be undefined")
			}
			setState({ data: result, isLoading: false, err: undefined })
		} catch (err) {
			setState({ data: undefined, isLoading: false, err: err })
		}
	}

	return {...state, mutate}
}