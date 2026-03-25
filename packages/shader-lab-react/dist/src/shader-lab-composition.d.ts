import { type CSSProperties } from "react";
import type { ShaderLabConfig } from "./types";
export interface ShaderLabCompositionProps {
    className?: string;
    config: ShaderLabConfig;
    onRuntimeError?: (message: string | null) => void;
    style?: CSSProperties;
}
export declare function ShaderLabComposition({ className, config, onRuntimeError, style, }: ShaderLabCompositionProps): import("react/jsx-runtime").JSX.Element;
