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
