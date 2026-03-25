import * as THREE from "three/webgpu";
export interface VideoHandle {
    dispose: () => void;
    texture: THREE.VideoTexture;
    video: HTMLVideoElement;
}
export declare function loadImageTexture(url: string): Promise<THREE.Texture>;
export declare function createVideoTexture(url: string): Promise<VideoHandle>;
