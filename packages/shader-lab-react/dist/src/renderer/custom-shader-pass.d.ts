import { type TSLNode } from "three/tsl";
import { PassNode } from "@/renderer/pass-node";
import type { LayerParameterValues } from "@/types/editor";
type Node = TSLNode;
export declare class CustomShaderPass extends PassNode {
    private readonly onRuntimeError;
    private compiledSketch;
    private compileRequestId;
    private lastCompileSignature;
    private readonly timeUniform;
    constructor(layerId: string, onRuntimeError?: (message: string | null) => void);
    needsContinuousRender(): boolean;
    updateParams(params: LayerParameterValues): void;
    protected beforeRender(time: number): void;
    protected buildEffectNode(): Node;
}
export {};
