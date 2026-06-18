import * as THREE from "three";

import Game from "@/Game.js";
import View from "@/View/View.js";
import State from "@/State/State.js";
import Terrain from "./Terrain.js";
import TerrainGradient from "./TerrainGradient.js";
import TerrainMaterial from "./Materials/TerrainMaterial.js";
import WaterMaterial from "./Materials/WaterMaterial.js";

export default class Terrains {
    constructor(noiseTexture) {
        this.game = Game.getInstance();
        this.state = State.getInstance();
        this.time = this.state.time;
        this.view = View.getInstance();
        this.debug = View.getInstance();

        this.viewport = this.state.viewport;
        this.sky = this.view.sky;
        // use the shared noiseTexture created from parent(need to sync with Terrain)
        this.noiseTexture = noiseTexture || this.noises.create(128, 128);

        this.setGradient();
        this.setMaterial();
        this.setDebug();

        // engine Terrain is the state Terrain.js instance
        this.state.terrains.events.on("create", (engineTerrain) => {
            const terrain = new Terrain(this, engineTerrain);

            engineTerrain.events.on("destroy", () => {
                terrain.destroy();
            });
        });
    }

    setGradient() {
        this.gradient = new TerrainGradient();
    }

    setMaterial() {
        this.material = new TerrainMaterial();
        this.material.uniforms.uTime.value = 0;
        this.material.uniforms.uPlayerPosition.value = new THREE.Vector3();
        this.material.uniforms.uGradientTexture.value = this.gradient.texture;
        this.material.uniforms.uLightnessSmoothness.value = 0.25;
        this.material.uniforms.uFresnelOffset.value = 0;
        this.material.uniforms.uFresnelScale.value = 0.5;
        this.material.uniforms.uFresnelPower.value = 2;
        this.material.uniforms.uNoiseTexture.value = this.noiseTexture;
        this.material.uniforms.uSunPosition.value = new THREE.Vector3(
            -0.5,
            -0.5,
            -0.5,
        );
        this.material.uniforms.uMoonPosition.value = new THREE.Vector3(
            0.5,
            0.5,
            0.5,
        );
        this.material.uniforms.uFogTexture.value =
            this.sky.customRender.texture;
        this.material.uniforms.uGrassDistance.value = this.state.chunks.minSize;
        this.material.uniforms.uDawnGrassColor.value = new THREE.Color(
            1.0,
            0.6,
            0.05,
        );
        this.material.uniforms.uWaterLevel.value =
            this.state.terrains.waterLevel;

        this.material.onBeforeRender = (
            renderer,
            scene,
            camera,
            geometry,
            mesh,
        ) => {
            this.material.uniforms.uTexture.value = mesh.userData.texture;
            this.material.uniformsNeedUpdate = true;
        };

        this.waterMaterial = new WaterMaterial();
        this.waterMaterial.uniforms.uTime.value = 0;
        this.waterMaterial.uniforms.uNoiseTexture.value = this.noiseTexture;
        this.waterMaterial.uniforms.uSunPosition.value = new THREE.Vector3(
            -0.5,
            -0.5,
            -0.5,
        );
        this.waterMaterial.uniforms.uMoonPosition.value = new THREE.Vector3(
            0.5,
            0.5,
            0.5,
        );
        this.waterMaterial.uniforms.uFogTexture.value =
            this.sky.customRender.texture;
        this.waterMaterial.uniforms.uDayCycleProgress.value = 0;
        this.waterMaterial.uniforms.uFresnelOffset.value = 0;
        this.waterMaterial.uniforms.uFresnelScale.value = 0.5;
        this.waterMaterial.uniforms.uFresnelPower.value = 2;

        // this.material.wireframe = true

        // const dummy = new THREE.Mesh(
        //     new THREE.SphereGeometry(30, 64, 32),
        //     this.material
        // )
        // dummy.position.y = 50
        // this.scene.add(dummy)
    }

    setDebug() {
        if (!this.debug.active) return;

        const folder = debug.ui.getFolder("view/terrains");

        folder.add(this.material, "wireframe");

        folder
            .add(this.material.uniforms.uLightnessSmoothness, "value")
            .min(0)
            .max(1)
            .step(0.001)
            .name("uLightnessSmoothness");

        folder
            .add(this.material.uniforms.uFresnelOffset, "value")
            .min(-1)
            .max(1)
            .step(0.001)
            .name("uFresnelOffset");

        folder
            .add(this.material.uniforms.uFresnelScale, "value")
            .min(0)
            .max(2)
            .step(0.001)
            .name("uFresnelScale");

        folder
            .add(this.material.uniforms.uFresnelPower, "value")
            .min(1)
            .max(10)
            .step(1)
            .name("uFresnelPower");

        const waterFolder = debug.ui.getFolder("view/water");

        waterFolder
            .add(this.waterMaterial.uniforms.uFresnelOffset, "value")
            .min(-1)
            .max(1)
            .step(0.001)
            .name("uFresnelOffset");

        waterFolder
            .add(this.waterMaterial.uniforms.uFresnelScale, "value")
            .min(0)
            .max(2)
            .step(0.001)
            .name("uFresnelScale");

        waterFolder
            .add(this.waterMaterial.uniforms.uFresnelPower, "value")
            .min(1)
            .max(10)
            .step(1)
            .name("uFresnelPower");
    }

    update() {
        const playerState = this.state.player;
        const playerPosition = playerState.position.current;
        const sunState = this.state.sun;
        const moonState = this.state.moon;

        this.material.uniforms.uTime.value = this.time.elapsed;
        this.material.uniforms.uPlayerPosition.value.set(
            playerPosition[0],
            playerPosition[1],
            playerPosition[2],
        );
        this.material.uniforms.uSunPosition.value.set(
            sunState.position.x,
            sunState.position.y,
            sunState.position.z,
        );
        this.material.uniforms.uMoonPosition.value.set(
            moonState.position.x,
            moonState.position.y,
            moonState.position.z,
        );
        this.material.uniforms.uDayCycleProgress.value =
            this.state.day.progress;

        this.waterMaterial.uniforms.uTime.value = this.time.elapsed;
        this.waterMaterial.uniforms.uSunPosition.value.set(
            sunState.position.x,
            sunState.position.y,
            sunState.position.z,
        );
        this.waterMaterial.uniforms.uMoonPosition.value.set(
            moonState.position.x,
            moonState.position.y,
            moonState.position.z,
        );
        this.waterMaterial.uniforms.uDayCycleProgress.value =
            this.state.day.progress;
    }

    resize() {}
}
