import { vec3, quat2, mat4 } from "gl-matrix";

import State from "@/State/State.js";

export default class CameraThirdPerson {
    constructor(player) {
        this.state = State.getInstance();
        this.viewport = this.state.viewport;
        this.controls = this.state.controls;

        this.player = player;

        this.active = false;
        this.gameUp = vec3.fromValues(0, 1, 0);
        this.position = vec3.create();
        this.quaternion = quat2.create();
        this.distance = 30;
        this.phi = Math.PI * 0.45;
        this.theta = -Math.PI * 0.25;
        this.aboveOffset = 5;
        this.phiLimits = { min: 0.1, max: Math.PI - 0.1 };
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
    }

    update() {
        if (!this.active) return;

        // Determine the spherical angles based on pointer input
        // Phi is the polar angle from the polar axis (Y-axis) which is clamped between the phiLimits (0.1 - 3.04)
        // Theta is the azimuthal angle in the XZ plane around the polar axis
        if (this.controls.pointer.down || this.viewport.pointerLock.active) {
            const normalisedPointer = this.viewport.normalise(
                this.controls.pointer.delta,
            );
            this.phi -= normalisedPointer.y * 2;
            this.theta -= normalisedPointer.x * 2;

            if (this.phi < this.phiLimits.min) this.phi = this.phiLimits.min;
            if (this.phi > this.phiLimits.max) this.phi = this.phiLimits.max;
        }

        // Position
        const horzDist = Math.sin(this.phi) * this.distance;
        const sphericalPosition = vec3.fromValues(
            horzDist * Math.sin(this.theta),
            Math.cos(this.phi) * this.distance,
            horzDist * Math.cos(this.theta),
        );
        // The 3rdPerson Camera's position is the current player position
        // plus the relative spherical position offset away from the player
        vec3.add(
            this.position,
            this.player.position.current,
            sphericalPosition,
        );

        // Target
        const target = vec3.fromValues(
            this.player.position.current[0],
            this.player.position.current[1] + this.aboveOffset,
            this.player.position.current[2],
        );

        // Quaternion making the camera look at the target (player's position with offset)
        const toTargetMatrix = mat4.create();
        mat4.targetTo(toTargetMatrix, this.position, target, this.gameUp);
        quat2.fromMat4(this.quaternion, toTargetMatrix);

        // Clamp to ground so that camera does not see underground
        const chunks = this.state.chunks;
        const elevation = chunks.getElevationForPosition(
            this.position[0],
            this.position[2],
        );

        if (elevation && this.position[1] < elevation + 1)
            this.position[1] = elevation + 1;
    }
}
