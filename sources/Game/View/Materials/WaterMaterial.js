import * as THREE from "three";

import vertexShader from "./shaders/water/vertex.glsl";
import fragmentShader from "./shaders/water/fragment.glsl";

export default function WaterMaterial() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: null },
            uNoiseTexture: { value: null },
            uFogTexture: { value: null },
            uSunPosition: { value: null },
            uMoonPosition: { value: null },
            uDayCycleProgress: { value: null },
            uFresnelOffset: { value: null },
            uFresnelScale: { value: null },
            uFresnelPower: { value: null },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        // depthWrite: false, // Usually water should not write to depth for transparency issues
    });

    return material;
}
