import type { ShaderLabTimelineConfig } from "./types";
export interface ShaderLabRuntimeClock {
    delta: number;
    duration: number;
    loop: boolean;
    time: number;
}
export declare function createRuntimeClock(timeline: Pick<ShaderLabTimelineConfig, "duration" | "loop">, time: number, delta: number): ShaderLabRuntimeClock;
export declare function advanceRuntimeClock(currentTime: number, timeline: Pick<ShaderLabTimelineConfig, "duration" | "loop">, delta: number): number;
