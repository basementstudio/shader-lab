export interface LayerTrigger {
  layers: unknown
  selectedLayerId: unknown
}

export interface TimelineTrigger {
  duration: unknown
  loop: unknown
  tracks: unknown
}

export interface AudioTrigger {
  bands: unknown
  links: unknown
  offsetSeconds: unknown
  source: unknown
}

export interface EditorTrigger {
  outputSize: unknown
  sceneConfig: unknown
}

export function layersChanged(a: LayerTrigger, b: LayerTrigger): boolean {
  return a.layers !== b.layers || a.selectedLayerId !== b.selectedLayerId
}

export function timelineChanged(
  a: TimelineTrigger,
  b: TimelineTrigger
): boolean {
  return a.tracks !== b.tracks || a.duration !== b.duration || a.loop !== b.loop
}

export function audioChanged(a: AudioTrigger, b: AudioTrigger): boolean {
  return (
    a.source !== b.source ||
    a.bands !== b.bands ||
    a.links !== b.links ||
    a.offsetSeconds !== b.offsetSeconds
  )
}

export function editorChanged(a: EditorTrigger, b: EditorTrigger): boolean {
  return a.sceneConfig !== b.sceneConfig || a.outputSize !== b.outputSize
}

export function releasedInteractiveEdit(
  next: { interactiveEditDepth: number },
  previous: { interactiveEditDepth: number }
): boolean {
  return previous.interactiveEditDepth > 0 && next.interactiveEditDepth === 0
}
