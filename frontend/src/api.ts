import type { AppConfig, Booking, HostSlot, NewSlotsInput, Slot } from './types';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    // NestJS errors look like { message: string | string[] }; show the first readable one.
    const data = await res.json().catch(() => null);
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(res.status, message ?? 'Something went wrong. Please try again.');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  config: () => request<AppConfig>('/config'),
  slots: () => request<Slot[]>('/slots'),
  book: (slotId: number, input: { name: string; email: string; topic?: string }) =>
    request<Booking>(`/slots/${slotId}/bookings`, 'POST', input),
  confirmationMessage: (bookingId: string) =>
    request<{ message: string; source: 'ai' | 'template' }>(`/bookings/${bookingId}/confirmation-message`, 'POST'),

  hostSlots: () => request<HostSlot[]>('/host/slots'),
  createSlots: (input: NewSlotsInput) => request<Slot[]>('/host/slots', 'POST', input),
  deleteSlot: (id: number) => request<void>(`/host/slots/${id}`, 'DELETE'),
};
