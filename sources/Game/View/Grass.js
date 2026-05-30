import * as THREE from "three";

import Game from "@/Game.js";
import View from "@/View/View.js";
import State from "@/State/State.js";
import GrassMaterial from "./Materials/GrassMaterial.js";

export default class Grass {
    constructor() {
        this.game = Game.getInstance();
        this.view = View.getInstance();
        this.state = State.getInstance();

        this.time = this.state.time;
        this.scene = this.view.scene;
        this.noises = this.view.noises;

        // The number of grass blades per row/column in the grass mesh.
        // Adjust this proportionally to the size below as 'fragmentSize' is size divided by details
        this.details = 200 * 4;
        // The size of the grass mesh.
        this.size = this.state.chunks.minSize * 1;
        this.count = this.details * this.details;
        // The size of a cell in the grid of grass blades.
        this.fragmentSize = this.size / this.details;
        this.bladeWidthRatio = 0.8;
        this.bladeHeightRatio = 4;
        this.bladeHeightRandomness = 0.7;
        this.positionRandomness = 0.5;
        this.curveRandomness = 0.2;
        this.noiseTexture = this.noises.create(128, 128);

        this.setGeometry();
        this.setMaterial();
        this.setMesh();
    }

    // Setting up center coordinates for each vertex of each blade - called within setGeometry
    setCenters(fragmentX, fragmentZ, centers, vertexCount, iX, iZ) {
        const centerX =
            fragmentX +
            (Math.random() - 0.5) * this.fragmentSize * this.positionRandomness;
        const centerZ =
            fragmentZ +
            (Math.random() - 0.5) * this.fragmentSize * this.positionRandomness;

        const iStride = (iX * this.details + iZ) * vertexCount * 2;
        for (let i = 0; i < vertexCount; i++) {
            centers[iStride + i * 2] = centerX;
            centers[iStride + i * 2 + 1] = centerZ;
        }
    }

    // Setting up positions coordinates for each vertex of each blade - called within setGeometry
    setPositions(
        fragmentX,
        fragmentZ,
        positions,
        tipness,
        vertexCount,
        iX,
        iZ,
    ) {
        const bladeWidth = this.fragmentSize * this.bladeWidthRatio;
        const bladeHalfWidth = bladeWidth * 0.5;
        const bladeHeight =
            this.fragmentSize *
            this.bladeHeightRatio *
            (1 -
                this.bladeHeightRandomness +
                Math.random() * this.bladeHeightRandomness);

        // Quadratic Bézier curve offset: offset(tipness) = curve * tipness²
        // Base is anchored at x=0, tip drifts by `curve` — left or right randomly.
        const curve =
            (Math.random() - 0.5) * 2 * bladeHeight * this.curveRandomness;
        const curveOffset05 = curve * 0.5 * 0.5; // tipness=0.50 → 0.25
        const curveOffset075 = curve * 0.75 * 0.75; // tipness=0.75 → 0.5625

        const iStride = (iX * this.details + iZ) * vertexCount * 3;
        const iStripeT = (iX * this.details + iZ) * vertexCount;

        // U0: Bottom-left
        positions[iStride] = -bladeHalfWidth;
        positions[iStride + 1] = 0;
        positions[iStride + 2] = 0;
        tipness[iStripeT] = 0;

        // U1: Bottom-right
        positions[iStride + 3] = bladeHalfWidth;
        positions[iStride + 4] = 0;
        positions[iStride + 5] = 0;
        tipness[iStripeT + 1] = 0;

        // U2: Mid-left 0.5
        positions[iStride + 6] = -bladeHalfWidth * 0.9 + curveOffset05;
        positions[iStride + 7] = bladeHeight * 0.5;
        positions[iStride + 8] = 0;
        tipness[iStripeT + 2] = 0.5;

        // U3: Mid-right 0.5
        positions[iStride + 9] = bladeHalfWidth * 0.9 + curveOffset05;
        positions[iStride + 10] = bladeHeight * 0.5;
        positions[iStride + 11] = 0;
        tipness[iStripeT + 3] = 0.5;

        // U4: Top-left 0.75
        positions[iStride + 12] = -bladeHalfWidth * 0.6 + curveOffset075;
        positions[iStride + 13] = bladeHeight * 0.75;
        positions[iStride + 14] = 0;
        tipness[iStripeT + 4] = 0.75;

        // U5: Top-right 0.75
        positions[iStride + 15] = bladeHalfWidth * 0.6 + curveOffset075;
        positions[iStride + 16] = bladeHeight * 0.75;
        positions[iStride + 17] = 0;
        tipness[iStripeT + 5] = 0.75;

        // U6: Tip
        positions[iStride + 18] = curve;
        positions[iStride + 19] = bladeHeight;
        positions[iStride + 20] = 0;
        tipness[iStripeT + 6] = 1;
    }

    setGeometry() {
        const bladeVertexCount = 7;
        const centers = new Float32Array(this.count * bladeVertexCount * 2);
        const positions = new Float32Array(this.count * bladeVertexCount * 3);
        const tipness = new Float32Array(this.count * bladeVertexCount);
        const indices = new Uint32Array(this.count * 15);

        for (let iX = 0; iX < this.details; iX++) {
            const fragmentX =
                (iX / this.details - 0.5) * this.size + this.fragmentSize * 0.5;

            for (let iZ = 0; iZ < this.details; iZ++) {
                const fragmentZ =
                    (iZ / this.details - 0.5) * this.size +
                    this.fragmentSize * 0.5;

                // For each blade, set vertex attributes:
                // Center (for blade rotation)
                this.setCenters(
                    fragmentX,
                    fragmentZ,
                    centers,
                    bladeVertexCount,
                    iX,
                    iZ,
                );
                // Position + tipness
                this.setPositions(
                    fragmentX,
                    fragmentZ,
                    positions,
                    tipness,
                    bladeVertexCount,
                    iX,
                    iZ,
                );

                const iV = (iX * this.details + iZ) * bladeVertexCount;
                const iI = (iX * this.details + iZ) * 15;

                // T1: U0, U2, U1
                indices[iI] = iV + 0;
                indices[iI + 1] = iV + 2;
                indices[iI + 2] = iV + 1;

                // T2: U1, U2, U3
                indices[iI + 3] = iV + 1;
                indices[iI + 4] = iV + 2;
                indices[iI + 5] = iV + 3;

                // T3: U2, U4, U3
                indices[iI + 6] = iV + 2;
                indices[iI + 7] = iV + 4;
                indices[iI + 8] = iV + 3;

                // T4: U3, U4, U5
                indices[iI + 9] = iV + 3;
                indices[iI + 10] = iV + 4;
                indices[iI + 11] = iV + 5;

                // T5: U5, U4, U6
                indices[iI + 12] = iV + 5;
                indices[iI + 13] = iV + 4;
                indices[iI + 14] = iV + 6;
            }
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        this.geometry.setAttribute(
            "center",
            new THREE.Float32BufferAttribute(centers, 2),
        );
        this.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
        );
        this.geometry.setAttribute(
            "tipness",
            new THREE.Float32BufferAttribute(tipness, 1),
        );
    }

    setMaterial() {
        const engineChunks = this.state.chunks;
        const engineTerrains = this.state.terrains;

        // this.material = new THREE.MeshBasicMaterial({ wireframe: true, color: 'green' })
        this.material = new GrassMaterial();
        this.material.uniforms.uTime.value = 0;
        this.material.uniforms.uGrassDistance.value = this.size;
        this.material.uniforms.uPlayerPosition.value = new THREE.Vector3();
        this.material.uniforms.uTerrainSize.value = engineChunks.minSize;
        this.material.uniforms.uTerrainTextureSize.value =
            engineTerrains.segments;
        this.material.uniforms.uTerrainATexture.value = null;
        this.material.uniforms.uTerrainAOffset.value = new THREE.Vector2();
        this.material.uniforms.uTerrainBTexture.value = null;
        this.material.uniforms.uTerrainBOffset.value = new THREE.Vector2();
        this.material.uniforms.uTerrainCTexture.value = null;
        this.material.uniforms.uTerrainCOffset.value = new THREE.Vector2();
        this.material.uniforms.uTerrainDTexture.value = null;
        this.material.uniforms.uTerrainDOffset.value = new THREE.Vector2();
        this.material.uniforms.uNoiseTexture.value = this.noiseTexture;
        this.material.uniforms.uFresnelOffset.value = 0;
        this.material.uniforms.uFresnelScale.value = 0.5;
        this.material.uniforms.uFresnelPower.value = 2;
        this.material.uniforms.uSunPosition.value = new THREE.Vector3(
            -0.5,
            -0.5,
            -0.5,
        );
        // this.material.wireframe = true;
    }

    setMesh() {
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
    }

    update() {
        const playerState = this.state.player;
        const playerPosition = playerState.position.current;
        const engineChunks = this.state.chunks;
        const sunState = this.state.sun;

        this.material.uniforms.uTime.value = this.time.elapsed;
        this.material.uniforms.uSunPosition.value.set(
            sunState.position.x,
            sunState.position.y,
            sunState.position.z,
        );

        // The grass mesh always moves with the player
        this.mesh.position.set(playerPosition[0], 0, playerPosition[2]);
        // this.mesh.position.set(playerPosition[0], playerPosition[1], playerPosition[2])
        this.material.uniforms.uPlayerPosition.value.set(
            playerPosition[0],
            playerPosition[1],
            playerPosition[2],
        );

        // Get terrain data
        const aChunkState = engineChunks.getDeepestChunkForPosition(
            playerPosition[0],
            playerPosition[2],
        );

        if (
            aChunkState &&
            aChunkState.terrain &&
            aChunkState.terrain.renderInstance.texture
        ) {
            // Texture A
            this.material.uniforms.uTerrainATexture.value =
                aChunkState.terrain.renderInstance.texture;
            this.material.uniforms.uTerrainAOffset.value.set(
                aChunkState.x - aChunkState.size * 0.5,
                aChunkState.z - aChunkState.size * 0.5,
            );

            const chunkPositionRatioX =
                (playerPosition[0] - aChunkState.x + aChunkState.size * 0.5) /
                aChunkState.size;
            const chunkPositionRatioZ =
                (playerPosition[2] - aChunkState.z + aChunkState.size * 0.5) /
                aChunkState.size;

            // Texture B
            const bChunkSate = aChunkState.neighbours.get(
                chunkPositionRatioX < 0.5 ? "w" : "e",
            );

            if (
                bChunkSate &&
                bChunkSate.terrain &&
                bChunkSate.terrain.renderInstance.texture
            ) {
                this.material.uniforms.uTerrainBTexture.value =
                    bChunkSate.terrain.renderInstance.texture;
                this.material.uniforms.uTerrainBOffset.value.set(
                    bChunkSate.x - bChunkSate.size * 0.5,
                    bChunkSate.z - bChunkSate.size * 0.5,
                );
            }

            // Texture C
            const cChunkSate = aChunkState.neighbours.get(
                chunkPositionRatioZ < 0.5 ? "n" : "s",
            );

            if (
                cChunkSate &&
                cChunkSate.terrain &&
                cChunkSate.terrain.renderInstance.texture
            ) {
                this.material.uniforms.uTerrainCTexture.value =
                    cChunkSate.terrain.renderInstance.texture;
                this.material.uniforms.uTerrainCOffset.value.set(
                    cChunkSate.x - cChunkSate.size * 0.5,
                    cChunkSate.z - cChunkSate.size * 0.5,
                );
            }

            // Texture D
            const dChunkSate = bChunkSate.neighbours.get(
                chunkPositionRatioZ < 0.5 ? "n" : "s",
            );

            if (
                dChunkSate &&
                dChunkSate.terrain &&
                dChunkSate.terrain.renderInstance.texture
            ) {
                this.material.uniforms.uTerrainDTexture.value =
                    dChunkSate.terrain.renderInstance.texture;
                this.material.uniforms.uTerrainDOffset.value.set(
                    dChunkSate.x - dChunkSate.size * 0.5,
                    dChunkSate.z - dChunkSate.size * 0.5,
                );
            }
        }
    }
}
