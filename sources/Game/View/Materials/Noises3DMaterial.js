import * as THREE from "three";

import vertexShader from "./shaders/noises3d/vertex.glsl";
import fragmentShader from "./shaders/noises3d/fragment.glsl";

export default function Noises3DMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uLayer: { value: 0.0 },
        },
        vertexShader,
        fragmentShader,
    });
}
