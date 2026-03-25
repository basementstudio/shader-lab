import type { ShaderLabLayerConfig, ShaderLabParameterValue, ShaderLabTimelineTrack } from "./types";
export interface EvaluatedLayerState {
    layerId: string;
    params: Record<string, ShaderLabParameterValue>;
    properties: Partial<Record<"hue" | "opacity" | "saturation" | "visible", boolean | number>>;
}
export declare function evaluateTimelineForLayers(layers: ShaderLabLayerConfig[], tracks: ShaderLabTimelineTrack[], time: number): EvaluatedLayerState[];
export declare function resolveEvaluatedLayers(layers: ShaderLabLayerConfig[], tracks: ShaderLabTimelineTrack[], time: number): ShaderLabLayerConfig[];
