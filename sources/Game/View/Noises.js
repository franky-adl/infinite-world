import * as THREE from "three";

import View from "@/View/View.js";
import NoisesMaterial from "./Materials/NoisesMaterial.js";
import Noises3DMaterial from "./Materials/Noises3DMaterial.js";

export default class Noises {
    constructor() {
        this.view = View.getInstance();
        this.renderer = this.view.renderer;
        this.scene = this.view.scene;

        this.setCustomRender();
        this.setMaterial();
        this.setPlane();
        // this.setHelper()

        // const texture = this.createNoise(128, 128)
    }

    setCustomRender() {
        this.customRender = {};
        this.customRender.scene = new THREE.Scene();
        this.customRender.camera = new THREE.OrthographicCamera(
            -1,
            1,
            1,
            -1,
            0.1,
            10,
        );
    }

    setMaterial() {
        this.material = new NoisesMaterial();
    }

    setPlane() {
        this.plane = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            this.material,
        );
        this.plane.frustumCulled = false;
        this.customRender.scene.add(this.plane);
    }

    setHelper() {
        this.helper = {};
        this.helper.geometry = new THREE.PlaneGeometry(1, 1);
        this.helper.material = new THREE.MeshBasicMaterial();

        const meshA = new THREE.Mesh(
            this.helper.geometry,
            this.helper.material,
        );
        meshA.position.y = 5 + 1;
        meshA.position.x = -1;
        meshA.scale.set(2, 2, 2);

        const meshB = new THREE.Mesh(
            this.helper.geometry,
            this.helper.material,
        );
        meshB.position.y = 5 + 1;
        meshB.position.x = 1;
        meshB.scale.set(2, 2, 2);

        const meshC = new THREE.Mesh(
            this.helper.geometry,
            this.helper.material,
        );
        meshC.position.y = 5 - 1;
        meshC.position.x = -1;
        meshC.scale.set(2, 2, 2);

        const meshD = new THREE.Mesh(
            this.helper.geometry,
            this.helper.material,
        );
        meshD.position.y = 5 - 1;
        meshD.position.x = 1;
        meshD.scale.set(2, 2, 2);

        window.requestAnimationFrame(() => {
            this.scene.add(meshA);
            // this.scene.add(meshB)
            // this.scene.add(meshC)
            // this.scene.add(meshD)
        });
    }

    create(width, height) {
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            generateMipmaps: false,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping,
        });

        this.renderer.instance.setRenderTarget(renderTarget);
        this.renderer.instance.render(
            this.customRender.scene,
            this.customRender.camera,
        );
        this.renderer.instance.setRenderTarget(null);

        const texture = renderTarget.texture;
        // texture.wrapS = THREE.RepeatWrapping
        // texture.wrapT = THREE.RepeatWrapping

        if (this.helper) this.helper.material.map = texture;

        return texture;
    }

    /**
     * Bake a 128 × 32 × 128 Data3DTexture using 3-D periodic Perlin noise.
     *
     * The volume is built by rendering one XZ slice per Y level (32 passes).
     * Each 128×128 render is read back to the CPU and packed into the final
     * Uint8Array before being uploaded as a single Data3DTexture.
     *
     * GLSL sampling convention (sampler3D):
     *   texture(uNoise3D, vec3(worldX / period, worldZ / period, worldY / yRange))
     *   → s (width=xSize)  → world X
     *   → t (height=zSize) → world Z
     *   → r (depth=yLevels)→ world Y
     *
     * @param {number} xSize   - Texel count along world X (default 128)
     * @param {number} zSize   - Texel count along world Z (default 128)
     * @param {number} yLevels - Number of Y slices / depth layers (default 32)
     * @returns {THREE.Data3DTexture}
     */
    create3D(xSize = 128, zSize = 128, yLevels = 32) {
        // --- temporary scene: fullscreen quad + new material per call ---
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        const material = new Noises3DMaterial();
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        plane.frustumCulled = false;
        scene.add(plane);

        // Single render target reused for every slice
        const rt = new THREE.WebGLRenderTarget(xSize, zSize, {
            generateMipmaps: false,
        });

        const totalData = new Uint8Array(xSize * zSize * yLevels * 4);
        const sliceBuffer = new Uint8Array(xSize * zSize * 4);

        for (let layer = 0; layer < yLevels; layer++) {
            // uLayer: 0.0 (bottom Y level) → 1.0 (top Y level)
            material.uniforms.uLayer.value =
                yLevels > 1 ? layer / (yLevels - 1) : 0.0;

            this.renderer.instance.setRenderTarget(rt);
            this.renderer.instance.render(scene, camera);
            this.renderer.instance.setRenderTarget(null);

            // Readback: pixels are packed bottom-row-first, matching Data3DTexture layout
            this.renderer.instance.readRenderTargetPixels(
                rt,
                0,
                0,
                xSize,
                zSize,
                sliceBuffer,
            );

            // Each layer occupies xSize * zSize * 4 bytes starting at layer's offset
            totalData.set(sliceBuffer, layer * xSize * zSize * 4);
        }

        // Release temporary GPU resources
        rt.dispose();
        plane.geometry.dispose();
        material.dispose();

        // Assemble Data3DTexture — dimensions must match the data layout above:
        //   new THREE.Data3DTexture(data, width, height, depth)
        //   width=xSize, height=zSize, depth=yLevels
        const texture3D = new THREE.Data3DTexture(
            totalData,
            xSize,
            zSize,
            yLevels,
        );
        texture3D.format = THREE.RGBAFormat;
        texture3D.type = THREE.UnsignedByteType;
        texture3D.minFilter = THREE.LinearFilter;
        texture3D.magFilter = THREE.LinearFilter;
        texture3D.wrapS = THREE.RepeatWrapping;
        texture3D.wrapT = THREE.RepeatWrapping;
        texture3D.wrapR = THREE.RepeatWrapping;
        texture3D.needsUpdate = true;

        return texture3D;
    }
}
