import { isAxiosError } from 'axios';

/**
 * Best-effort extraction of a human-readable message from an axios error.
 * Used for both credential validation feedback and generation/send errors —
 * neither needs more than "here's what the provider said".
 */
export function describeAxiosError(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.response) {
      const data = err.response.data;
      const nested =
        typeof data === 'object' && data !== null
          ? ((data as Record<string, unknown>)['error'] ?? (data as Record<string, unknown>)['description'])
          : undefined;
      const nestedMessage =
        typeof nested === 'object' && nested !== null ? (nested as Record<string, unknown>)['message'] : nested;

      return typeof nestedMessage === 'string' ? nestedMessage : `Request failed with status ${err.response.status}`;
    }

    if (err.code === 'ECONNABORTED') {
      return 'Request timed out';
    }

    return err.message;
  }

  return err instanceof Error ? err.message : 'Unknown error';
}
