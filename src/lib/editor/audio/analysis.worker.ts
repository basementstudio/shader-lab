/// <reference lib="webworker" />

import {
  type AnalysisRequest,
  type AnalysisResponse,
  collectSpectrogramTransfers,
} from "@/lib/editor/audio/analysis-protocol"
import { analyzeSpectrogramStepwise } from "@/lib/editor/audio/spectrogram"

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: AnalysisResponse, transfer?: ArrayBuffer[]): void {
  if (transfer) {
    scope.postMessage(message, transfer)
    return
  }

  scope.postMessage(message)
}

scope.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data

  try {
    const iterator = analyzeSpectrogramStepwise(
      request.samples,
      request.sampleRate,
      {
        ...(request.bandCount === undefined
          ? {}
          : { bandCount: request.bandCount }),
        ...(request.envelopeRate === undefined
          ? {}
          : { envelopeRate: request.envelopeRate }),
        ...(request.fftSize === undefined ? {} : { fftSize: request.fftSize }),
      }
    )

    let step = iterator.next()
    while (!step.done) {
      post({ progress: step.value, type: "progress" })
      step = iterator.next()
    }

    post(
      { spectrogram: step.value, type: "done" },
      collectSpectrogramTransfers(step.value)
    )
  } catch (error) {
    post({
      message: error instanceof Error ? error.message : "Audio analysis failed",
      type: "error",
    })
  }
}
