import type { RuntimeRenderer } from "./contracts";
export declare function browserSupportsWebGPU(): boolean;
export declare function createWebGPURenderer(canvas: HTMLCanvasElement, onRuntimeError?: (message: string | null) => void): Promise<RuntimeRenderer>;
