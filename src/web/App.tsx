import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { FeedScreen } from "./screens/FeedScreen.tsx";
import { LibraryScreen } from "./screens/LibraryScreen.tsx";
import { NotFoundScreen } from "./screens/NotFoundScreen.tsx";
import { ProfileScreen } from "./screens/ProfileScreen.tsx";

const client = new QueryClient({
	defaultOptions: {
		queries: {
			// The archive on disk does not change while you look at it, and a refetch on window
			// focus would restart the feed's query mid-scroll. Rescanning is explicit instead.
			staleTime: 5 * 60_000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

export function App() {
	return (
		<QueryClientProvider client={client}>
			<Switch>
				<Route path="/" component={LibraryScreen} />
				<Route path="/a/:archiveId" component={ProfileScreen} />
				<Route path="/a/:archiveId/feed/:postId" component={FeedScreen} />
				<Route component={NotFoundScreen} />
			</Switch>
		</QueryClientProvider>
	);
}
