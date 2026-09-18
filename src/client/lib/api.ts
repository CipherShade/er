export type ApiError = Error & { code?: string };

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json() as { data?: T; error?: { message?: string; messageEn?: string; code?: string } };
  if (!response.ok) {
    const error = new Error(body.error?.message || body.error?.messageEn || 'Request failed') as ApiError;
    error.code = body.error?.code;
    throw error;
  }
  return body.data as T;
}

export const money = (value: number | null | undefined, locale = 'ar-EG') => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
};