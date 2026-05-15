/**
 * FDAModalPortal — renders any modal at document.body level.
 *
 * WHY THIS EXISTS:
 *   .page-content has overflow-y:auto AND .fade-in runs a CSS animation.
 *   Both create new stacking contexts, which clip position:fixed children.
 *   Portal breaks out of those contexts so the overlay covers the full viewport.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function FDAModalPortal({ children }) {
  const el = useRef(document.createElement('div'))

  useEffect(() => {
    const node = el.current
    document.body.appendChild(node)
    // Prevent body scroll while modal is open
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.removeChild(node)
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(children, el.current)
}
