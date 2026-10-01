---
"@basementstudio/shader-lab": patch
---

Add isolated, nested group rendering to the internal renderer frame contract. Group children render against transparent targets before the combined result is blended into the parent. Existing flat public shader configs retain their behavior; editor grouping controls and persisted groups follow separately.
