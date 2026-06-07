import * as React from "react"

/**
 * MOBILE_BREAKPOINT — must stay in sync with components/mobile/useIsMobile.
 *
 * Desktop: >= 768px  (includes large iPads)
 * Mobile:  <  768px  (phones only)
 *
 * No tablet tier. Large iPads always get the desktop sidebar.
 */
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return !!isMobile
}