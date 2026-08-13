---
"@basementstudio/shader-lab": patch
---

Retry a media load that failed instead of giving up for good. `MediaPass`
recorded the signature of the media it was about to load before awaiting the
load, so a failure left that signature committed and every later call with the
same source hit the "already loaded" early return. One transient failure — a
flaky network, a CORS response that arrived wrong once — disabled that layer's
image or video for the rest of the session, with an empty layer and no error to
explain it. The signature is now committed only after the load succeeds.
