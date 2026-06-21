import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import Game from "@/Game.js";
import View from "@/View/View.js";
import Debug from "@/Debug/Debug.js";
import State from "@/State/State.js";

export default class Player {
    constructor() {
        this.game = Game.getInstance();
        this.state = State.getInstance();
        this.view = View.getInstance();
        this.debug = Debug.getInstance();

        this.scene = this.view.scene;

        this.setGroup();
        this.setModel();
        this.setDebug();
    }

    setGroup() {
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }

    setModel() {
        this.loader = new GLTFLoader();
        this.materials = [];

        this.loader.load("/model/Michelle.glb", (gltf) => {
            this.model = gltf.scene;
            this.model.scale.set(3, 3, 3);
            this.group.add(this.model);

            this.model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Extend the material to fake directional lighting
                    const material = child.material;
                    this.materials.push(material);

                    material.onBeforeCompile = (shader) => {
                        shader.uniforms.uSunPosition = {
                            value: new THREE.Vector3(),
                        };
                        shader.uniforms.uMoonPosition = {
                            value: new THREE.Vector3(),
                        };
                        shader.uniforms.uDayCycleProgress = {
                            value: 0,
                        };

                        shader.fragmentShader = shader.fragmentShader.replace(
                            "#include <common>",
                            `
                            #include <common>
                            uniform vec3 uSunPosition;
                            uniform vec3 uMoonPosition;
                            uniform float uDayCycleProgress;

                            struct DirectionalLight {
                                vec3 direction;
                                vec3 color;
                            };

                            void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight directLight ) {
                                directLight.color = directionalLight.color;
                                directLight.direction = directionalLight.direction;
                                directLight.visible = true;
                            }
                            `,
                        );

                        shader.fragmentShader = shader.fragmentShader.replace(
                            "#include <lights_fragment_begin>",
                            `
                            #include <lights_fragment_begin>
                            
                            float nightFactor = -1. * min(cos(uDayCycleProgress * 2.0 * 3.14159265359), 0.0);
                            vec3 lightDirection = mix(normalize(uSunPosition), normalize(uMoonPosition), nightFactor);
                            vec3 lightColor = vec3(1.0);

                            DirectionalLight fakedLight;
                            fakedLight.direction = lightDirection;
                            fakedLight.color = lightColor;

                            IncidentLight fakedIncidentLight;
                            getDirectionalLightInfo( fakedLight, fakedIncidentLight );
                            
                            #if defined( RE_Direct )
                                RE_Direct( fakedIncidentLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
                            #elif defined( RE_Direct_Physical )
                                RE_Direct_Physical( fakedIncidentLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
                            #endif
                            
                            // Subtle ambient light to prevent pitch black areas
                            reflectedLight.indirectDiffuse += vec3(mix(0.2, 0.01, nightFactor)) * diffuseColor.rgb;
                            `,
                        );
                        material.userData.shader = shader;
                    };
                }
            });

            // Animations
            this.animations = gltf.animations;
            if (this.animations && this.animations.length > 0) {
                this.actions = {};
                this.mixer = new THREE.AnimationMixer(this.model);

                for (const animation of this.animations) {
                    const action = this.mixer.clipAction(animation);
                    this.actions[animation.name] = action;
                }

                this.currentAction =
                    this.actions["Idle"] || Object.values(this.actions)[0];
                this.currentAction.play();
            }
        });
    }

    setDebug() {
        if (!this.debug.active) return;

        // Sphere
        const playerFolder = this.debug.ui.getFolder("view/player");

        // playerFolder.addColor(this.helper.material.uniforms.uColor, 'value')
    }

    update() {
        const playerState = this.state.player;
        const sunState = this.state.sun;
        const moonState = this.state.moon;
        const dayState = this.state.day;

        this.group.position.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2],
        );

        if (this.model) {
            this.model.rotation.y = playerState.rotation + Math.PI;

            // Update faked lighting uniforms
            for (const material of this.materials) {
                if (material.userData.shader) {
                    material.userData.shader.uniforms.uSunPosition.value.set(
                        sunState.position.x,
                        sunState.position.y,
                        sunState.position.z,
                    );
                    material.userData.shader.uniforms.uMoonPosition.value.set(
                        moonState.position.x,
                        moonState.position.y,
                        moonState.position.z,
                    );
                    material.userData.shader.uniforms.uDayCycleProgress.value =
                        dayState.progress;
                }
            }
        }

        if (this.mixer) {
            let nextAction =
                this.actions["Idle"] || Object.values(this.actions)[0];

            if (playerState.speed > 0.01) {
                nextAction = this.actions["Running"] || nextAction;
            }

            if (playerState.position.current[1] <= playerState.swimmingLevel) {
                nextAction = this.actions["Swimming"] || nextAction;
            }

            if (nextAction !== this.currentAction) {
                this.currentAction.fadeOut(0.2);
                nextAction.reset().fadeIn(0.2).play();
                this.currentAction = nextAction;
            }

            this.mixer.update(this.state.time.delta);
        }
    }
}
