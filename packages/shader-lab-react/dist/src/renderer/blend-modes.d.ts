import { type TSLNode } from "three/tsl";
type Node = TSLNode;
export declare function buildBlendNode(mode: string, base: Node, blend: Node, opacity: Node, compositeMode?: "filter" | "mask"): Node;
export {};
