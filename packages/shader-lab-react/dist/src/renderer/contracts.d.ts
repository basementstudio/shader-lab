import type { ShaderLabConfig, ShaderLabLayerConfig } from "../types";
export interface ProjectClock {
    delta: number;
    duration: number;
    loop: boolean;
    time: number;
}
export interface RendererFrame {
    clock: ProjectClock;
    layers: ShaderLabLayerConfig[];
    logicalSize: ShaderLabConfig["composition"];
    outputSize: ShaderLabConfig["composition"];
    pixelRatio: number;
    viewportSize: ShaderLabConfig["composition"];
}
export interface RuntimeRenderer {
    dispose(): void;
    initialize(): Promise<void>;
    render(frame: RendererFrame): boolean;
    resize(size: ShaderLabConfig["composition"], pixelRatio: number): void;
}
export declare function buildRendererFrame(config: ShaderLabConfig, time: number, delta: number, pixelRatio: number): RendererFrame;
