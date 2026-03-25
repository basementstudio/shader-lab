import type { TSLNode } from "three/tsl";
type CompiledShaderModule = {
    buildNode: () => TSLNode;
};
export declare function formatCustomShaderSource({ fileName, sourceCode, }: {
    fileName?: string;
    sourceCode: string;
}): Promise<string>;
export declare function compileCustomShaderModule({ entryExport, extraScope, fileName, force, sourceCode, }: {
    entryExport: string;
    extraScope?: Record<string, unknown>;
    fileName?: string;
    force?: boolean;
    sourceCode: string;
}): Promise<CompiledShaderModule>;
export {};
