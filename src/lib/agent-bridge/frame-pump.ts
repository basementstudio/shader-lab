// Chrome pauses requestAnimationFrame in hidden tabs, which parks the editor
// render loop — and with it layer-param sync, shader compiles, and anything
// else driven per-frame. The render loop registers a pump here so bridge
// commands can tick exactly one frame on demand, no rAF required.

type FramePump = () => void

let activePump: FramePump | null = null

export function registerAgentFramePump(pump: FramePump): () => void {
  activePump = pump

  return () => {
    if (activePump === pump) {
      activePump = null
    }
  }
}

export function pumpAgentFrame(): void {
  activePump?.()
}
