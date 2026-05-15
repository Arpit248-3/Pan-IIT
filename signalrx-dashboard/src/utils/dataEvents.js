/**
 * AyuScout Global Data Refresh Event Bus
 * 
 * Usage — fire from Dashboard after analysis:
 *   import { fireDataUpdated } from '../utils/dataEvents'
 *   fireDataUpdated()
 *
 * Usage — listen in any tab component:
 *   import { useDataRefresh } from '../utils/dataEvents'
 *   useDataRefresh(fetchFn)   // re-calls fetchFn on every analysis
 */
import { useEffect } from 'react'

const EVENT_NAME = 'ayuscout:data-updated'

/** Dispatch a global refresh signal. Call after any data mutation. */
export function fireDataUpdated() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { ts: Date.now() } }))
}

/**
 * React hook: re-run `fetchFn` whenever a data-updated event fires.
 * Also re-runs when `page` becomes visible (visibility API).
 * @param {function} fetchFn - async function to re-invoke on refresh
 */
export function useDataRefresh(fetchFn) {
  useEffect(() => {
    const handler = () => { fetchFn() }
    window.addEventListener(EVENT_NAME, handler)
    // Also refresh when tab becomes visible (user switches back to browser)
    const visHandler = () => { if (!document.hidden) fetchFn() }
    document.addEventListener('visibilitychange', visHandler)
    return () => {
      window.removeEventListener(EVENT_NAME, handler)
      document.removeEventListener('visibilitychange', visHandler)
    }
  }, [fetchFn])
}
