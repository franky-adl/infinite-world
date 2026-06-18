import * as THREE from "three";

import View from "@/View/View.js";
import State from "@/State/State.js";

export default class Terrain {
    constructor(terrains, terrainState) {
        this.state = State.getInstance();
        this.view = View.getInstance();
        this.scene = this.view.scene;

        this.terrains = terrains;
        // terrainState is the state Terrain.js instance
        this.terrainState = terrainState;
        this.terrainState.renderInstance = this;

        this.created = false;

        this.terrainState.events.on("ready", () => {
            this.create();
        });
    }

    create() {
        const terrainsState = this.state.terrains;

        // Recreate
        if (this.created) {
            // Dispose of old geometry
            this.geometry.dispose();

            // Create new geometry
            this.geometry = new THREE.BufferGeometry();
            this.geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(this.terrainState.positions, 3),
            );
            this.geometry.index = new THREE.BufferAttribute(
                this.terrainState.indices,
                1,
                false,
            );

            this.mesh.geometry = this.geometry;

            // Water
            this.waterGeometry.dispose();
            this.waterGeometry = new THREE.BufferGeometry();
            this.waterGeometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(
                    this.terrainState.waterPositions,
                    3,
                ),
            );
            this.waterGeometry.setAttribute(
                "normal",
                new THREE.Float32BufferAttribute(
                    this.terrainState.waterNormals,
                    3,
                ),
            );
            this.waterGeometry.setAttribute(
                "uv",
                new THREE.Float32BufferAttribute(this.terrainState.waterUV, 2),
            );
            this.waterGeometry.index = new THREE.BufferAttribute(
                this.terrainState.waterIndices,
                1,
                false,
            );
            this.waterMesh.geometry = this.waterGeometry;
        }

        // Create
        else {
            // Create geometry
            this.geometry = new THREE.BufferGeometry();
            this.geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(
                    this.terrainState.positions,
                    3,
                ),
            );
            this.geometry.setAttribute(
                "uv",
                new THREE.Float32BufferAttribute(this.terrainState.uv, 2),
            );
            this.geometry.index = new THREE.BufferAttribute(
                this.terrainState.indices,
                1,
                false,
            );

            // Texture
            this.texture = new THREE.DataTexture(
                this.terrainState.texture,
                terrainsState.segments,
                terrainsState.segments,
                THREE.RGBAFormat,
                THREE.FloatType,
                THREE.UVMapping,
                THREE.ClampToEdgeWrapping,
                THREE.ClampToEdgeWrapping,
                THREE.LinearFilter,
                THREE.LinearFilter,
            );
            this.texture.flipY = false;
            this.texture.needsUpdate = true;

            // // Material
            // this.material = this.terrains.material.clone()
            // this.material.uniforms.uTexture.value = this.texture

            // Create mesh
            this.mesh = new THREE.Mesh(this.geometry, this.terrains.material);
            this.mesh.userData.texture = this.texture;
            // this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshNormalMaterial())
            this.scene.add(this.mesh);

            // Water mesh
            this.waterGeometry = new THREE.BufferGeometry();
            this.waterGeometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(
                    this.terrainState.waterPositions,
                    3,
                ),
            );
            this.waterGeometry.setAttribute(
                "normal",
                new THREE.Float32BufferAttribute(
                    this.terrainState.waterNormals,
                    3,
                ),
            );
            this.waterGeometry.setAttribute(
                "uv",
                new THREE.Float32BufferAttribute(this.terrainState.waterUV, 2),
            );
            this.waterGeometry.index = new THREE.BufferAttribute(
                this.terrainState.waterIndices,
                1,
                false,
            );

            this.waterMesh = new THREE.Mesh(
                this.waterGeometry,
                this.terrains.waterMaterial,
            );
            this.scene.add(this.waterMesh);

            this.created = true;
        }
    }

    update() {}

    destroy() {
        if (this.created) {
            this.geometry.dispose();
            this.scene.remove(this.mesh);

            this.waterGeometry.dispose();
            this.scene.remove(this.waterMesh);
        }
    }
}
