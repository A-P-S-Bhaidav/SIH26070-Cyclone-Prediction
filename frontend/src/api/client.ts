/**
 * API client for the CycloneAI backend.
 * Handles all REST and SSE communication.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.set(key, String(value));
    });
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ── Cyclone API ────────────────────────────────────────────────────

export const cycloneApi = {
  listCyclones: (activeOnly = true) =>
    apiFetch<any[]>('/cyclones', { params: { active_only: activeOnly } }),

  getBulletin: (stormId: string) =>
    apiFetch<any>(`/cyclone/${stormId}`),

  getIntensity: (stormId: string) =>
    apiFetch<any>(`/cyclone/${stormId}/intensity`),

  getTrack: (stormId: string) =>
    apiFetch<any>(`/cyclone/${stormId}/track`),

  getDvorak: (stormId: string) =>
    apiFetch<any>(`/cyclone/${stormId}/dvorak`),

  getTimeline: (stormId: string, hoursBack = 72, hoursForward = 48) =>
    apiFetch<any>(`/cyclone/${stormId}/timeline`, {
      params: { hours_back: hoursBack, hours_forward: hoursForward },
    }),

  getGradCAM: (stormId: string, target = 'intensity') =>
    apiFetch<any>(`/cyclone/${stormId}/gradcam`, { params: { target } }),
};

// ── Genesis API ────────────────────────────────────────────────────

export const genesisApi = {
  getMap: (leadTime = 24) =>
    apiFetch<any>('/genesis', { params: { lead_time: leadTime } }),

  getZones: () =>
    apiFetch<any[]>('/genesis/zones'),
};

// ── Districts API ──────────────────────────────────────────────────

export const districtsApi = {
  getRisks: (stormId?: string, minProbability = 0) =>
    apiFetch<any[]>('/districts/risk', {
      params: { ...(stormId ? { storm_id: stormId } : {}), min_probability: minProbability },
    }),

  getGeoJSON: () =>
    apiFetch<any>('/districts/geojson'),
};

// ── Verification API ───────────────────────────────────────────────

export const verificationApi = {
  getMetrics: () =>
    apiFetch<any>('/verification'),

  getReliability: (target = 'intensity') =>
    apiFetch<any>('/verification/reliability', { params: { target } }),
};

// ── SSE Telemetry ──────────────────────────────────────────────────

export function connectTelemetry(
  onEvent: (event: any) => void,
  onError?: (error: Event) => void,
): EventSource {
  const url = `${API_BASE}/stream/telemetry`;
  const source = new EventSource(url);

  source.addEventListener('cyclone_telemetry', (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* noop */ }
  });

  source.addEventListener('track_update', (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* noop */ }
  });

  source.addEventListener('ri_alert', (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* noop */ }
  });

  source.onerror = onError || (() => {});

  return source;
}
