import * as THREE from "three/webgpu";
import type { ShaderLabLayerConfig } from "../types";
export declare class PipelineManager {
    private readonly renderer;
    private readonly baseScene;
    private readonly baseCamera;
    private readonly blitScene;
    private readonly blitCamera;
    private readonly blitInputNode;
    private readonly blitMaterial;
    private readonly onRuntimeError;
    private passMap;
    private passes;
    private layerSignatures;
    private dirty;
    private width;
    private height;
    private logicalWidth;
    private logicalHeight;
    private rtA;
    private rtB;
    constructor(renderer: THREE.WebGPURenderer, size: {
        height: number;
        width: number;
    }, onRuntimeError?: (message: string | null) => void);
    syncLayers(layers: ShaderLabLayerConfig[]): void;
    render(time: number, delta: number): boolean;
    resize(size: {
        height: number;
        width: number;
    }): void;
    updateLogicalSize(size: {
        height: number;
        width: number;
    }): void;
    dispose(): void;
    private applyLayerState;
    private createPass;
}
