import * as THREE from "three";

import Game from "@/Game.js";
import View from "@/View/View.js";
import State from "@/State/State.js";
import Debug from "@/Debug/Debug.js";
import SkyBackgroundMaterial from "./Materials/SkyBackgroundMaterial.js";
import SkySphereMaterial from "./Materials/SkySphereMaterial.js";
import SkyMaterial from "./Materials/SkyMaterial.js";
import StarsMaterial from "./Materials/StarsMaterial.js";

/**
 * Sky rendering pipeline
 *
 * Rendered in two passes each frame:
 *
 * 1. Custom render target (10% resolution)
 *    - Only `this.sphere.mesh` is in `customRender.scene`.
 *    - The SkySphereMaterial vertex shader computes `vColor` from several layers:
 *        - Day base:   uColorDayCycleLow (horizon) → uColorDayCycleHigh (zenith)
 *        - Night base: uColorNightLow (horizon)    → uColorNightHigh (zenith)
 *        - Day/Night mix: dayIntensity = |uDayCycleProgress - 0.5| * 2
 *                         (0 = full night, 1 = full day, 0.5 = dusk/dawn transition)
 *        - Dawn glow:  additive uColorDawn band near horizon at sunrise/sunset,
 *                      driven by cos(progress * 4π + π) so it peaks twice per cycle
 *        - Sun glow:   additive uColorSun halo around the sun position
 *    - Low resolution is intentional — the gradient is smooth so upscaling is invisible,
 *      and it saves significant GPU cost.
 *
 * 2. Main scene render (full resolution)
 *    - `background.mesh`  — fullscreen quad that samples the render target (upscaled sky gradient)
 *    - `sun.mesh`         — white circle disc positioned in world space
 *    - `stars.points`     — point cloud at outerDistance, full-res for sharp single pixels
 *
 * Color uniforms are set in setSphere() and can be tweaked live via dat.GUI
 * (debug mode: add ?debug to the URL) under view/sky/sphere/material.
 */
export default class Sky {
    constructor() {
        this.game = Game.getInstance();
        this.view = View.getInstance();
        this.state = State.getInstance();
        this.debug = Debug.getInstance();

        this.viewport = this.state.viewport;
        this.renderer = this.view.renderer;
        this.scene = this.view.scene;

        this.outerDistance = 1000;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.setCustomRender();
        this.setBackground();
        this.setSky();
        // this.setSun();
        // this.setStars();
        this.setDebug();
    }

    setCustomRender() {
        this.customRender = {};
        this.customRender.scene = new THREE.Scene();
        this.customRender.camera = this.view.camera.instance.clone();
        this.customRender.resolutionRatio = 1;
        this.customRender.renderTarget = new THREE.WebGLRenderTarget(
            this.viewport.width * this.customRender.resolutionRatio,
            this.viewport.height * this.customRender.resolutionRatio,
            {
                generateMipmaps: false,
            },
        );
        this.customRender.texture = this.customRender.renderTarget.texture;
    }

    setBackground() {
        this.background = {};

        this.background.geometry = new THREE.PlaneGeometry(2, 2);

        // this.background.material = new THREE.MeshBasicMaterial({ wireframe: false, map: this.customRender.renderTarget.texture })
        this.background.material = new SkyBackgroundMaterial();
        this.background.material.uniforms.uTexture.value =
            this.customRender.renderTarget.texture;
        // this.background.material.wireframe = true
        this.background.material.depthTest = false;
        this.background.material.depthWrite = false;

        this.background.mesh = new THREE.Mesh(
            this.background.geometry,
            this.background.material,
        );
        this.background.mesh.frustumCulled = false;

        this.group.add(this.background.mesh);
    }

    setSky() {
        this.sky = {};
        this.sky.widthSegments = 128;
        this.sky.heightSegments = 64;
        this.sky.material = new SkyMaterial();
        // create the 3D noise texture
        const noise3D = this.view.noises.create3D();
        this.sky.material.uniforms.uNoise3D.value = noise3D;

        this.sky.material.uniforms.uColorDayCycleLow.value.set("#f0fff9");
        this.sky.material.uniforms.uColorDayCycleHigh.value.set("#2e89ff");
        this.sky.material.uniforms.uColorNightLow.value.set("#004794");
        this.sky.material.uniforms.uColorNightHigh.value.set("#001624");
        this.sky.material.uniforms.uColorSun.value.set("#ff531a");
        this.sky.material.uniforms.uColorDawn.value.set("#ff5000");
        this.sky.material.uniforms.uDayCycleProgress.value = 0;
        this.sky.material.side = THREE.BackSide;

        this.sky.geometry = new THREE.SphereGeometry(
            10,
            this.sky.widthSegments,
            this.sky.heightSegments,
        );

        this.sky.mesh = new THREE.Mesh(this.sky.geometry, this.sky.material);
        this.sky.mesh.material.side = THREE.BackSide;
        this.sky.mesh.material.depthWrite = false;
        this.customRender.scene.add(this.sky.mesh);
    }

    setSun() {
        this.sun = {};
        this.sun.distance = this.outerDistance - 50;

        const geometry = new THREE.CircleGeometry(0.02 * this.sun.distance, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.sun.mesh = new THREE.Mesh(geometry, material);
        this.group.add(this.sun.mesh);
    }

    setStars() {
        this.stars = {};
        this.stars.count = 1000;
        this.stars.distance = this.outerDistance;

        this.stars.update = () => {
            // Create geometry
            const positionArray = new Float32Array(this.stars.count * 3);
            const sizeArray = new Float32Array(this.stars.count);
            const colorArray = new Float32Array(this.stars.count * 3);

            for (let i = 0; i < this.stars.count; i++) {
                const iStride3 = i * 3;

                // Position
                const position = new THREE.Vector3();
                position.setFromSphericalCoords(
                    this.stars.distance,
                    Math.acos(Math.random()),
                    2 * Math.PI * Math.random(),
                );

                positionArray[iStride3] = position.x;
                positionArray[iStride3 + 1] = position.y;
                positionArray[iStride3 + 2] = position.z;

                // Size
                sizeArray[i] = Math.pow(Math.random() * 0.9, 10) + 0.1;

                // Color
                const color = new THREE.Color();
                color.setHSL(Math.random(), 1, 0.5 + Math.random() * 0.5);
                colorArray[iStride3] = color.r;
                colorArray[iStride3 + 1] = color.g;
                colorArray[iStride3 + 2] = color.b;
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(positionArray, 3),
            );
            geometry.setAttribute(
                "aSize",
                new THREE.Float32BufferAttribute(sizeArray, 1),
            );
            geometry.setAttribute(
                "aColor",
                new THREE.Float32BufferAttribute(colorArray, 3),
            );

            // Dispose of old one
            if (this.stars.geometry) {
                this.stars.geometry.dispose();
                this.stars.points.geometry = this.stars.geometry;
            }

            this.stars.geometry = geometry;
        };

        // Geometry
        this.stars.update();

        // Material
        // this.stars.material = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false })
        this.stars.material = new StarsMaterial();
        this.stars.material.uniforms.uHeightFragments.value =
            this.viewport.height * this.viewport.clampedPixelRatio;

        // Points
        this.stars.points = new THREE.Points(
            this.stars.geometry,
            this.stars.material,
        );
        this.group.add(this.stars.points);
    }

    setDebug() {
        if (!this.debug.active) return;

        // Sky
        const skyMaterialFolder = this.debug.ui.getFolder(
            "view/sky/sky/material",
        );

        skyMaterialFolder
            .add(this.sky.material.uniforms.uAtmosphereElevation, "value")
            .min(0)
            .max(5)
            .step(0.01)
            .name("uAtmosphereElevation");
        skyMaterialFolder
            .add(this.sky.material.uniforms.uAtmospherePower, "value")
            .min(0)
            .max(20)
            .step(1)
            .name("uAtmospherePower");
        skyMaterialFolder
            .addColor(this.sky.material.uniforms.uColorDayCycleLow, "value")
            .name("uColorDayCycleLow");
        skyMaterialFolder
            .addColor(this.sky.material.uniforms.uColorDayCycleHigh, "value")
            .name("uColorDayCycleHigh");
        skyMaterialFolder
            .addColor(this.sky.material.uniforms.uColorNightLow, "value")
            .name("uColorNightLow");
        skyMaterialFolder
            .addColor(this.sky.material.uniforms.uColorNightHigh, "value")
            .name("uColorNightHigh");
        skyMaterialFolder
            .add(this.sky.material.uniforms.uDawnAngleAmplitude, "value")
            .min(0)
            .max(1)
            .step(0.001)
            .name("uDawnAngleAmplitude");
        skyMaterialFolder
            .add(this.sky.material.uniforms.uDawnElevationAmplitude, "value")
            .min(0)
            .max(1)
            .step(0.01)
            .name("uDawnElevationAmplitude");
        skyMaterialFolder
            .addColor(this.sky.material.uniforms.uColorDawn, "value")
            .name("uColorDawn");
        skyMaterialFolder
            .add(this.sky.material.uniforms.uSunAmplitude, "value")
            .min(0)
            .max(3)
            .step(0.01)
            .name("uSunAmplitude");
        skyMaterialFolder
            .add(this.sky.material.uniforms.uSunMultiplier, "value")
            .min(0)
            .max(1)
            .step(0.01)
            .name("uSunMultiplier");
        skyMaterialFolder
            .addColor(this.sky.material.uniforms.uColorSun, "value")
            .name("uColorSun");

        // // Stars
        // const starsFolder = this.debug.ui.getFolder("view/sky/stars");

        // starsFolder
        //     .add(this.stars, "count")
        //     .min(100)
        //     .max(50000)
        //     .step(100)
        //     .name("count")
        //     .onChange(() => {
        //         this.stars.update();
        //     });
        // starsFolder
        //     .add(this.stars.material.uniforms.uSize, "value")
        //     .min(0)
        //     .max(1)
        //     .step(0.0001)
        //     .name("uSize");
        // starsFolder
        //     .add(this.stars.material.uniforms.uBrightness, "value")
        //     .min(0)
        //     .max(1)
        //     .step(0.001)
        //     .name("uBrightness");
    }

    update() {
        const dayState = this.state.day;
        const sunState = this.state.sun;
        const playerState = this.state.player;

        // Group
        this.group.position.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2],
        );

        // Sky
        this.sky.material.uniforms.uTime.value += this.state.time.delta;
        this.sky.material.uniforms.uSunPosition.value.set(
            sunState.position.x,
            sunState.position.y,
            sunState.position.z,
        );
        this.sky.material.uniforms.uDayCycleProgress.value = dayState.progress;

        // Update camera uniforms for raymarching
        const mainCamera = this.view.camera.instance;
        this.sky.material.uniforms.uCameraPosition.value.copy(
            mainCamera.position,
        );
        // This is the inverse of the projection matrix,
        // needed for getting the camera's near-plane frustum points, and thus ray directions in world space
        this.sky.material.uniforms.uInverseProjectionMatrix.value.copy(
            mainCamera.projectionMatrixInverse,
        );
        this.sky.material.uniforms.uCameraWorldMatrix.value.copy(
            mainCamera.matrixWorld,
        );

        // // Sun
        // this.sun.mesh.position.set(
        //     sunState.position.x * this.sun.distance,
        //     sunState.position.y * this.sun.distance,
        //     sunState.position.z * this.sun.distance,
        // );
        // this.sun.mesh.lookAt(
        //     playerState.position.current[0],
        //     playerState.position.current[1],
        //     playerState.position.current[2],
        // );

        // // Stars
        // this.stars.material.uniforms.uSunPosition.value.set(
        //     sunState.position.x,
        //     sunState.position.y,
        //     sunState.position.z,
        // );
        // this.stars.material.uniforms.uHeightFragments.value =
        //     this.viewport.height * this.viewport.clampedPixelRatio;

        // Render in render target
        this.customRender.camera.quaternion.copy(
            this.view.camera.instance.quaternion,
        );
        this.renderer.instance.setRenderTarget(this.customRender.renderTarget);
        this.renderer.instance.render(
            this.customRender.scene,
            this.customRender.camera,
        );
        this.renderer.instance.setRenderTarget(null);
    }

    resize() {
        this.customRender.renderTarget.width =
            this.viewport.width * this.customRender.resolutionRatio;
        this.customRender.renderTarget.height =
            this.viewport.height * this.customRender.resolutionRatio;
    }
}
