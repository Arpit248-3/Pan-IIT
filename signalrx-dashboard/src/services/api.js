/**
 * Centralized API client for AyuScout V2
 * Wraps fetch with: base URL, error handling, JSON parsing, and toast notifications.
 */
import { API_BASE } from '../config'
import { toast } from 'sonner'

/**
 * Core fetch wrapper. Returns parsed JSON or throws an error.
 * @param {string} path - API path (e.g. '/api/settings')
 * @param {RequestInit} options - fetch options
 * @param {boolean} silent - if true, suppresses error toasts
 */
export async function apiFetch(path, options = {}, silent = false) {
  const url = `${API_BASE}${path}`
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  try {
    const res = await fetch(url, { ...options, headers })
    const data = await res.json()

    if (!res.ok) {
      const message = data?.detail || data?.message || `API error ${res.status}`
      if (!silent) toast.error(message)
      throw new Error(message)
    }
    return data
  } catch (err) {
    if (!silent && !(err instanceof TypeError && err.message === 'Failed to fetch')) {
      // Already toasted above for HTTP errors
    }
    if (err instanceof TypeError) {
      if (!silent) toast.error('Cannot reach server. Is the backend running?')
    }
    throw err
  }
}

export const api = {
  get:    (path, silent) => apiFetch(path, { method: 'GET' }, silent),
  post:   (path, body, silent) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, silent),
  put:    (path, body, silent) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }, silent),
  delete: (path, silent) => apiFetch(path, { method: 'DELETE' }, silent),
}

export default api
