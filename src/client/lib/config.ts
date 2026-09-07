/**
 * Client runtime configuration for API and Socket.io endpoints.
 *
 * Single-service deployment (default): the built frontend is served by Fastify
 * from the same origin, so the API and WebSocket keep the relative paths
 * "/api" and "/socket.io" — no configuration needed.
 *
 * Split deployment (frontend and API on different hosts): set these Vite env
 * vars at BUILD time. Vite bakes them into the static bundle:
 *   VITE_API_BASE_URL   e.g. "https://api.example.com"   (default: same origin)
 *   VITE_SOCKET_URL     e.g. "https://api.example.com"   (default: VITE_API_BASE_URL)
 */
const rawApiBaseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').trim();
const rawSocketUrl = ((import.meta.env.VITE_SOCKET_URL as string | undefined) ?? '').trim();

const trimTrailing = (value: string): string => value.replace(/\/+$/, '');
const trimLeading = (value: string): string => value.replace(/^\/+/, '');

export const apiBaseUrl = trimTrailing(rawApiBaseUrl);
export const socketUrl = trimTrailing(rawSocketUrl || rawApiBaseUrl);

/** Resolves an API path (e.g. "/api/health") against the configured base URL (same origin by default). */
export function apiUrl(path: string): string {
  const cleanPath = trimLeading(path);
  return apiBaseUrl ? `${apiBaseUrl}/${cleanPath}` : `/${cleanPath}`;
}