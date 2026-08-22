/* Deliberately dependency-free: the bridge client drags the renderer and
 * export graph with it, so the enabled probe must not import it. */
export function isAgentBridgeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  if (process.env.NEXT_PUBLIC_AGENT_BRIDGE === "1") {
    return true
  }

  return new URLSearchParams(window.location.search).get("agent") === "1"
}
