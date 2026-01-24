import { useEffect, useMemo, useState } from "@rbxts/react"

export function useQuery<T>(args: {
	queryKey: string[] | string
	queryFn: () => T
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
			const result = args.queryFn()
			setState({ data: result, isLoading: false, err: undefined })
		} catch (err) {
			setState({ data: undefined, isLoading: false, err: err })
		}
	}
	useMemo(() => {
		fetchData()
	}, [query_key_joined])

	return {...state, refetch: fetchData}
}
