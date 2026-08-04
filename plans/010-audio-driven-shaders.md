# Finishing the audio-driven shaders PR

Working plan for PR #109 (`git-chad/audio-reactive-parameters`).

Audio-reactive parameters work and are shipped. What's left to call the feature
done:

- The timeline caps at 120s, so a real song doesn't fit.
- Exported video is silent.
- Export is slow enough that a full-length render is unpleasant.

**Requirements**

- Audio in export is **opt-in**, with a small disclaimer that it may take longer.
- **No time limit** on export.
- Duration is **driven by the audio by default**, but stays editable in the
  timeline panel and the export panel.

---

## Appendix: what the reference project actually does

`thecloners21/adobe-Premiere-Pro-clone` was suggested as a model for
"video + audio export that's quick and works". Read its `assets/js/export.js` and
`assets/js/webcodecs.js`. Findings:

**It has no WebCodecs encoder at all**, despite the filename. Both browser paths
use `MediaRecorder` on `canvas.captureStream()`. There is no `VideoEncoder`,
no `AudioEncoder`, no muxer library.

**Its two paths are:**

1. **Server-side ffmpeg** via PHP `shell_exec`, building a `filter_complex` from
   the EDL (`overlay` for video, `amix`/`adelay`/`volume` for audio). This is where
   "quick" comes from — and it needs a backend we don't have.
2. **Real-time `MediaRecorder` capture.** Not a frame loop at all: it seeks to 0,
   starts the recorder, and calls `play()`, letting the timeline advance naturally
   while the canvas is captured. So it is exactly real-time — a 4 minute song takes
   4 minutes — and can drop frames under load.

**Its audio trick is the one genuinely transferable thing**, and it is small:

```js
const aDest = audio.ctx.createMediaStreamDestination()
audio.master.connect(aDest)
const stream = new MediaStream([
  ...vStream.getVideoTracks(),
  ...aDest.stream.getAudioTracks(),
])
```

That is task 3.2, confirmed against their source rather than inferred.

**Conclusion: do not adopt its architecture.** Shader Lab's offline path is
already more capable — WebCodecs `VideoEncoder` plus `mp4-muxer`/`webm-muxer` with
deterministic frame stepping, which MediaRecorder cannot match for quality or
reproducibility. It is only slow because of the vsync bug in step 1. Once that is
fixed it should beat real time, which their browser path cannot do by
construction.

Two smaller things worth borrowing:

- A **stall-timeout safeguard** on the real-time path:
  `if (performance.now() - t0 > (dur + 5) * 1000 + 8000) stop()`. Worth adding to
  `recordLiveCanvasVideo`.
- Their choice to ship real-time-only in the browser is a signal that real-time
  capture is acceptable to many users — which supports keeping it as the fallback
  in task 3.2 rather than treating it as a stopgap.

They also buffer output in memory as Blob chunks, so they have the same memory
ceiling task 4.4 addresses. No help there.

---

## Step 1 — Export throughput

Export is not GPU-bound; it waits on vsync. `waitForRenderedFrame`
(`src/lib/editor/export.ts:645-656`) is awaited once per exported frame from
`renderFrameToCanvas` (`:510`) and is two nested `requestAnimationFrame`s ≈ 33ms
per frame with the GPU idle. It's a floor, not an average, so export can never
beat real time. In a **backgrounded tab** rAF is suspended, the 250ms fallback
timer takes over, and 14,400 frames becomes ~60 minutes.

| Export | Frames | Floor from this wait alone |
|---|---|---|
| 130s @ 30fps | 3,900 | ~130s (real time) |
| 4min @ 60fps | 14,400 | ~8 min |
| 4min @ 60fps, backgrounded tab | 14,400 | **~60 min** |

- [ ] **1.1 Replace the vsync wait with a real GPU sync.** Add
  `waitForGpuIdle(): Promise<void>` to the `EditorRenderer` contract
  (`src/renderer/contracts.ts`), implement in
  `src/renderer/create-webgpu-renderer.ts` via
  `renderer.backend.device.queue.onSubmittedWorkDone()`. `Renderer.backend` is
  public (`three/src/renderers/common/Renderer.js:113`) and `WebGPUBackend.device`
  is a real `GPUDevice`. Keep the double-rAF as a fallback only when the device is
  unreachable, with a seconds-scale timeout. Note `renderAsync()` is deprecated in
  r181 and is not an option.
- [ ] **1.2 Pause the live preview loop during export.** Nothing does today, so a
  second `WebGPURenderer` renders the whole pass chain throughout the export —
  competing for the GPU *and* queueing ahead of the exact rAF callbacks the export
  waits on. `setFrozen` (`src/store/timeline-store.ts:370`) is dead code and won't
  help: the loop only uses `frozen` to zero the delta
  (`src/hooks/use-editor-renderer.ts:133`). Add a module-level guard shaped like
  `src/lib/agent-bridge/frame-pump.ts`, checked at the top of `renderFrame`.
- [ ] **1.3 Release that guard on the abort path**, or a cancelled export leaves
  the editor frozen.
- [ ] **1.4 Guard the per-frame resize.** `renderFrameToCanvas` calls
  `renderer.resize()` every frame with identical dimensions
  (`src/lib/editor/export.ts:473`). three.js has no early-out, so `updateSize()`
  destroys and rebuilds the `GPUCanvasContext` configuration every single frame.
  Only resize when dimensions actually differ.
- [ ] **1.5 Single render for frames 2..N.** The throwaway first pass exists only
  to populate `PipelineManager.passes` (filled by `syncLayers`, which only runs
  inside `render()`) so `prepareForExportFrame` has something to iterate — needed
  on frame 1 only. Keep the double pass in `prewarmExportFrame`.
- [ ] **1.6 Fix the dropped `delta` this exposes.** `PipelineManager.render`
  early-returns when not dirty, so for effects-only comps the *encoded* pixels
  currently come from the first pass, which is built with a hardcoded `delta: 0` —
  silently discarding the `options.delta` threaded in at `export.ts:389`.
- [ ] **1.7 Throttle `onProgress` to ~10Hz.** It's wired straight to a React
  `setState` (`src/components/editor/editor-export-dialog.tsx:573`), so 14,400
  frames means 14,400 synchronous dialog re-renders inside the loop.
- [ ] **1.8 Instrument and report real before/after ms-per-frame and total wall
  clock.** Numbers, not adjectives. Remove the instrumentation before merge.

**Explicitly out of scope for step 1:** the double pixel copy (`drawImage` then
`new VideoFrame`), the encoder watermark (`encodeQueueSize` sits at 0-1 — the
encoder is idle-starved, not saturated), and per-frame video seeks
(`src/renderer/media-texture.ts:297-317` seeks every frame and adds a third rAF via
`waitForSeek`; doing it properly means `WebCodecs VideoDecoder` instead of
`HTMLVideoElement`).

---

## Step 2 — Duration driven by audio, still editable

**Set it once, don't derive it continuously.** Video derives continuously
(`getLongestVideoLayerDuration` → `effectiveDuration` → a `setDuration` sync
effect) and that is exactly why it's buggy today: the derived value isn't clamped
while `setDuration` is, so a 3-minute video puts the ruler on 180s and the store
on 120s, and the sync effect re-dispatches forever because they can never agree
(`src/components/editor/editor-timeline-overlay.tsx:570-575, 663-669`). It also
forces the duration input read-only.

- [x] **2.1 One-shot sync from audio.** When the audio source changes and analysis
  completes, call `setDuration(audioDuration)` once, then leave it alone. Gives
  "driven by audio by default, freely editable after" and avoids the two-timebase
  problem because there is no ongoing derivation.
- [x] **2.2 Do not make the duration read-only for audio.** Unlike video, leave
  both the timeline panel and export panel inputs editable.
- [x] **2.3 Raise `MAX_DURATION`** (`src/store/timeline-store.ts:116`) from 120 to
  1800s. Keep a sanity clamp rather than removing it, so a malformed asset can't
  produce an absurd timeline.
- [x] **2.4 De-duplicate the hardcoded `max={120}`** at
  `editor-timeline-overlay.tsx:424`, whose `min={1}` also disagrees with
  `MIN_DURATION = 0.25`.
- [x] **2.5 Stop shrinking the duration from destroying keyframes.** `setDuration`
  (`timeline-store.ts:402-420`) pins every keyframe past the new end onto the new
  end; they collapse onto identical times and the originals are unrecoverable.
  Leave keyframes where they are, as `replaceState` already does.
- [x] **2.6 Fix the video clamp bypass** — same code, and a live bug today
  independent of audio.
- [x] **2.7 Scale the ruler ticks.** A fixed 20s major step meant a 4 minute
  composition rendered ~360 tick nodes. Steps now scale with duration, labels read
  `m:ss` past a minute, and the appended endpoint tick is dropped when it would
  collide with the last regular one.

Landed in `422db87`. Bounds now live in `src/lib/editor/timeline-duration.ts`
(`MIN_DURATION`, `MAX_DURATION`, `clampDuration`) so the store, the ruler and the
input cannot disagree. Covered by `src/lib/editor/__tests__/timeline-duration.test.ts`
and `src/store/__tests__/timeline-duration.test.ts`.

---

## Step 3 — Audio in the exported file, opt-in

- [x] **3.1 "Include audio" toggle** in the video export panel. Default on when a
  project audio source exists. One-line note that it makes the export take longer.
  No duration limit.
- [ ] **3.2 Add an audio track to the real-time recorder.** `recordLiveCanvasVideo`
  (`src/lib/editor/live-video-recorder.ts:40`) is already `canvas.captureStream()` +
  `MediaRecorder` and never adds audio. Add it from an `AudioContext`
  `MediaStreamDestination`. Small, and it is the fallback for browsers without
  `AudioEncoder` — and the only path where a live mic could ever work.
- [x] **3.3 Teach the muxers about audio.** `mp4-muxer` and `webm-muxer` both
  support an `audio:` track and `addAudioChunk`; the internal `VideoMuxer` type
  (`src/lib/editor/video-export-encoder.ts:34-48`) needs it added.
- [x] **3.4 Add an `AudioEncoder` path.** None exists in the repo yet. Opus for
  WebM, AAC for MP4, following the existing `probeEncoderConfig` pattern
  (`video-export-encoder.ts:224-254`) for capability detection.
- [x] **3.5 Decode source audio for output.** Reuse
  `src/lib/editor/audio/decode.ts`, generalised to keep stereo rather than
  downmixing to mono (the mono downmix exists for analysis).
- [x] **3.6 Align audio to the rendered range.** Emit `AudioData` chunks whose
  timestamps match the frame timestamps the loop already computes (`frameStartUs`
  at `export.ts:398`), and respect the export in/out range from step 4.

3.2 is deliberately **not** done. The offline path landed cleanly, so the
real-time recorder is no longer needed as a fallback — it stays silent, which
matters only for the "Record Live Video" button used for fluid layers. Tracked as
a follow-up rather than dropped.

Landed in `eca25a4`. Two things worth remembering:

- **AAC needs priming compensation.** The AAC-LC encoder emits 2048 priming frames
  and `mp4-muxer` writes no edit list to skip them, so audio lands 45ms late.
  `getEncoderPrimingSeconds` plans the audio 2048 frames ahead to cancel it.
  Opus needs none — `webm-muxer` writes the pre-skip.
- **Timestamps come from the absolute sample index**, never an accumulator, which
  is what keeps a four minute export from drifting.

Measured with ffprobe plus envelope cross-correlation against the source track at
five points across a 30 second export: MP4 `+1.0ms` flat, WebM `0.0ms` flat,
silent exports carry no audio stream in either format.

---

## Step 4 — Long exports made bearable

- [ ] **4.1 Export range (in/out).** `startTime` is a hardcoded
  `const startTime = 0` (`editor-export-dialog.tsx:565`). Rendering 20 seconds to
  check the look before committing to 4 minutes is the most useful addition here.
- [ ] **4.2 Frame count, elapsed and ETA.** None today; progress is only
  `Rendering frames i/total` (`export.ts:417-420`).
- [ ] **4.3 Persistent cancel.** Today it's the export button switching label
  (`editor-export-dialog.tsx:1401-1411`), so closing the dialog loses it.
  `LiveRecordingHud` (`:1074-1131`) already has the right pattern — outside the
  dialog, with cancel/stop and an elapsed/total readout.
- [ ] **4.4 Stream output to disk.** `fastStart: "in-memory"` with
  `ArrayBufferTarget` buffers the whole file in RAM
  (`video-export-encoder.ts:338-348`): ~300MB for 4min at `standard`, ~840MB at
  `ultra`, plus the Blob copy. With no time limit this is the real ceiling. Use
  `showSaveFilePicker()` + a `StreamTarget` (both muxers support it), falling back
  to in-memory where the File System Access API is unavailable.

---

## Step 5 — Loose ends

- [ ] **5.1 The last lag suspect.** The properties sidebar re-renders every frame
  during playback because `displayedLayerState` is a `useMemo` keyed on
  `currentTime` (`src/components/editor/properties-sidebar.tsx:164-205`) —
  pre-existing, but this PR added an `AudioLinkButton` to every row, and the
  sidebar renders its content twice for height measurement, so ~50 extra
  components per frame. Memoising needs stable props first: `control` is freshly
  allocated each render, as is `createParamTimelineBinding`'s result.
- [ ] **5.2 Warn when the published runtime can't reproduce a project.** A `.lab`
  with audio links renders static values in `@basementstudio/shader-lab` with no
  warning. Add a types-only `audio` field, one deduped `console.warn`, and a
  *warning* — not an `issues` entry, since `validateShaderExportSupport` throws on
  `issues[0]` — in `buildShaderExportConfig`
  (`src/lib/editor/shader-export.ts:168-196`).

---

## Deferred — timeline zoom

Ruler and lanes are positioned by percentage of duration inside an
`overflow-hidden` parent, so 300s in a 1200px pane is 4px/second. Deliberately
last: an audio-driven composition may have no keyframes at all, so this only bites
when hand-placing them on a long timeline.

- [ ] Horizontal zoom/scroll for the timeline.
- [ ] Tick labels from `toFixed(1)` to `m:ss`. The appended endpoint tick can land
  arbitrarily close to the last regular tick — already visible today with e.g. a
  67s video.

---

## Verification

- [ ] Per-frame export timing and total wall clock, before and after step 1.
- [ ] The **backgrounded tab** case specifically — that's the 60 minute path and
  the whole reason for removing the rAF dependency.
- [ ] Byte-compare two exports of the same range. The audio feature relies on
  deterministic export and step 1 must not break it.
- [ ] Export one comp with a video layer and one without, since only the former
  pays the per-frame seek.
- [ ] Load the 130s test track: timeline covers it, duration still editable in
  both panels, existing keyframes survive a duration change.
- [ ] Export with audio on: track present, correct length, and **check sync at the
  end of a 4 minute render** — drift is the failure mode and will not show up in a
  10 second test.
- [ ] Export with audio off: unchanged from today.
- [ ] `bun test && bun run typecheck:tsc && bun run lint` clean, existing 289 tests
  green.

Each step lands as its own commit so it can be tested one at a time.

---

## Risks

- `renderer.backend.device` isn't a documented three.js surface; a version bump
  could move it. Hence the fallback rather than a hard dependency.
- Skipping the throwaway first render may break passes relying on being rendered
  before `prepareForExportFrame`. `src/renderer/blob-tracking-pass.ts:305-312` has
  export-determinism logic worth reading first.
- `AudioEncoder` support and codec availability vary by browser; the real-time
  path is the fallback.
- Audio/video sync over several minutes is the likeliest subtle bug in step 3.
