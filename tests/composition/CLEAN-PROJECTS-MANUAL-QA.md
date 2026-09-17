# Neutral projects — focused acceptance

Dev server: http://localhost:55000/tools/shader-lab

1. Export your current composition if you want to keep it. Choose **Project → New blank project** (on mobile: **Actions → Project**). Expect no layers, no inherited color grading, and the “Add a layer to start” hint. Previous-project undo history is cleared.
2. Add a photograph. In **Scene settings**, expect **Global colors neutral**, Exposure/Brightness/Contrast/Hue/Temperature/Tint at zero, Saturation at 1, identity mixer/curves, no quantization or Color Map. The photo should not inherit the demo's bright/high-contrast treatment.
3. Choose **Project → Open demo**. Expect the familiar demo and **Global colors active**. Click that indicator to open Scene settings, then **Reset all global colors**. Expect neutral grading; background/canvas settings stay as they were. Undo restores the demo's color treatment; Redo neutralizes it again.
4. Choose **New blank project**, then reload. Expect the empty neutral project, not the older demo. Import an authored .lab, change its exposure, wait briefly for autosave and reload: expect its chosen exposure and layers restored.

A fresh browser profile with no autosave also starts blank. Existing saved projects keep their authored colors. This does not change shader algorithms, general masks, scene transparency, or the native video/thermal performance acceptance still required by roadmap 7.2.
