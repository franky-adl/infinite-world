import * as THREE from "three";

import vertexShader from "./shaders/sky/vertex.glsl";
import fragmentShader from "./shaders/sky/fragment.glsl";

export default function SkyMaterial() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uNoise3D: { value: null },
            uTime: { value: 0 },
            uCameraPosition: { value: new THREE.Vector3() },
            uInverseProjectionMatrix: { value: new THREE.Matrix4() },
            uCameraWorldMatrix: { value: new THREE.Matrix4() },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
    });

    return material;
}
