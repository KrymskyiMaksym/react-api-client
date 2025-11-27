import type { ApiClientConfig } from './types';

let globalConfig: ApiClientConfig | null = null;

/**
 * Configure the API client globally
 * @param config - API client configuration
 *
 * @example
 * import { configureApiClient } from '@krymskyimaksym/react-api-client';
 * import { router } from 'expo-router';
 *
 * configureApiClient({
 *   httpClient: myHttpClient,
 *   onUnauthorized: () => router.replace('/login')
 * });
 */
export function configureApiClient(config: ApiClientConfig): void {
  globalConfig = config;
}

/**
 * Get the current global configuration
 * @throws Error if configuration is not set
 */
export function getConfig(): ApiClientConfig {
  if (!globalConfig) {
    throw new Error(
      'API client is not configured. Call configureApiClient() first.',
    );
  }
  return globalConfig;
}

/**
 * Check if the API client is configured
 */
export function isConfigured(): boolean {
  return globalConfig !== null;
}