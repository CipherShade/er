import { vi } from 'vitest';

export function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

export type RouteHandler = (init?: RequestInit) => Response;

export function stubFetch(routes: Array<{ match: RegExp; handle: RouteHandler }>): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(_input);
    const route = routes.find((r) => r.match.test(url));
    if (!route) throw new Error(`[test] Unhandled fetch to ${url}`);
    return route.handle(init);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

export function parseBody(init?: RequestInit): unknown {
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}