# @rbxts/react-query
Exremely simple implementation for @tanstack/react-query for roblox-ts.

# installation
```sh
npm i @rbxts/react-query
```
or
```sh
bun i @rbxts/react-query
```
## query usage
```typescript
import React from "@rbxts/react"
import { Players } from "@rbxts/services"
import { useQuery } from "@rbxts/react-query"

export function UserProfile(props: { user_name: string }) {
	const { data, isLoading, err, refetch } = useQuery({
		queryKey: ["userProfile", props.user_name],
		queryFn: () => {
			print("Fetching user profile for", props.user_name)
			task.wait(1) // Simulate network delay
			const player_id = Players.GetUserIdFromNameAsync(props.user_name)
			const [headshot] = Players.GetUserThumbnailAsync(
				player_id,
				Enum.ThumbnailType.HeadShot,
				Enum.ThumbnailSize.Size420x420
			)
			return {
				user_id: player_id,
				img: headshot
			}
		}
	})
	if (isLoading) {
		return (
			<frame Size={new UDim2(0.2, 0, 0.2, 0)} BackgroundTransparency={1}>
				<uiaspectratioconstraint AspectRatio={5} />
				<textlabel Text="Loading..." Size={new UDim2(1, 0, 1, 0)} />
			</frame>
		)
	}
	if (err || !data) {
		return (
			<frame Size={new UDim2(0.2, 0, 0.2, 0)} BackgroundTransparency={1}>
				<uiaspectratioconstraint AspectRatio={5} />
				<textbutton
					Event={{
						MouseButton1Click: refetch
					}}
					TextColor3={Color3.fromRGB(255, 0, 0)}
					Text={`Couldn't load user data: ${err}`}
					Size={new UDim2(1, 0, 1, 0)}
					TextScaled={true}
				/>
			</frame>
		)
	}
	return (
		<frame Size={new UDim2(0.2, 0, 0.2, 0)} BackgroundTransparency={1}>
			<uiaspectratioconstraint AspectRatio={5} />
			<imagelabel Size={new UDim2(1, 0, 1, 0)} Image={data.img}>
				<uiaspectratioconstraint AspectRatio={1} />
			</imagelabel>
			<textbutton
				Event={{
					MouseButton1Click: refetch
				}}
				Text={`ID:${data.user_id}`}
				Visible={true}
				Position={new UDim2(0.2, 0, 0, 0)}
				Size={new UDim2(0.8, 0, 1, 0)}
				BackgroundColor3={new Color3(1, 1, 1)}
				TextColor3={new Color3(0, 0, 0)}
			/>
		</frame>
	)
}
```

## mutations usage