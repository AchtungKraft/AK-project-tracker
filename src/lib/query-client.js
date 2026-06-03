import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			// 429-aware retry: back off on rate limits, skip on 404
			retry: (failureCount, error) => {
				if (error?.status === 404 || error?.response?.status === 404) return false;
				if (error?.status === 429 || error?.response?.status === 429) return failureCount < 2;
				return failureCount < 1;
			},
			retryDelay: (attempt, error) => {
				// If 429, use longer exponential backoff
				if (error?.status === 429 || error?.response?.status === 429) {
					return Math.min(3000 * Math.pow(2, attempt), 30000);
				}
				return Math.min(1000 * Math.pow(2, attempt), 8000);
			},
			staleTime: 30_000,       // 30s default — prevents refetch storms on rapid navigation
			gcTime: 10 * 60 * 1000,  // 10min — keep cache alive longer for back-navigation
		},
	},
});