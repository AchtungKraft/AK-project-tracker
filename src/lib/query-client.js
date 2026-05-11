import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			retry: 1,
			staleTime: 30_000,       // 30s default — prevents refetch storms on rapid navigation
			gcTime: 10 * 60 * 1000,  // 10min — keep cache alive longer for back-navigation
		},
	},
});