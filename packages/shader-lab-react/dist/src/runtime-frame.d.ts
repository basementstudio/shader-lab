import { createRuntimeClock } from "./runtime-clock";
import type { ShaderLabConfig, ShaderLabLayerConfig } from "./types";
export interface ShaderLabRenderableLayer {
    layer: ShaderLabLayerConfig;
}
export interface ShaderLabRuntimeFrame {
    clock: ReturnType<typeof createRuntimeClock>;
    composition: ShaderLabConfig["composition"];
    layers: ShaderLabRenderableLayer[];
}
export declare function buildRuntimeFrame(config: ShaderLabConfig, time: number, delta: number): ShaderLabRuntimeFrame;
