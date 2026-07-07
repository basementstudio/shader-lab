---
"@basementstudio/shader-lab": patch
---

`onRuntimeError` on `<ShaderLabComposition>` is no longer called with `null` after every successful renderer initialization. It now only fires with `null` once a previously reported error has been resolved, and consecutive identical messages are not repeated. Consumers that surfaced the message without a null check no longer show a false error state.
