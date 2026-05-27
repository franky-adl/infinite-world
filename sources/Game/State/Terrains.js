import EventsEmitter from "events";
import seedrandom from "seedrandom";

import Game from "@/Game.js";
import State from "@/State/State.js";
import Debug from "@/Debug/Debug.js";
import TerrainWorker from "@/Workers/Terrain.js?worker";
import Terrain from "./Terrain.js";

/**
 * Terrains — State-Layer Terrain Manager
 * =======================================
 *
 * OVERVIEW
 * --------
 * Terrains is the authoritative data manager for every terrain tile that exists
 * in the world at any given moment. It lives in the State layer, meaning it owns
 * pure data (vertex positions, normals, UVs, texture buffers) and emits events;
 * it does not touch Three.js objects directly.
 *
 * The pipeline from a tile request to a visible mesh is:
 *
 *   1.  Chunks (State/Chunks.js) decides — based on the player's position and
 *       the quadtree LOD logic — that a new terrain tile is needed, and calls:
 *
 *         state.terrains.create(size, x, z, precision)
 *
 *   2.  `create()` allocates a new Terrain (State/Terrain.js) data object and
 *       immediately posts a message to the dedicated Web Worker (Workers/Terrain.js)
 *       with all noise parameters so geometry generation runs off the main thread.
 *
 *   3.  The worker runs fractal Brownian motion (fBm) over a `segments × segments`
 *       grid (segments = subdivisions + 1), producing typed arrays for positions,
 *       normals, UV coordinates, a skirt strip for seamless tile edges, and a
 *       per-vertex RGBA data texture that carries grass density and other attributes.
 *       It posts the result back via `worker.onmessage`.
 *
 *   4.  `worker.onmessage` looks up the Terrain by id and calls `terrain.create(data)`,
 *       which stores the typed arrays and emits the `'ready'` event:
 *
 *         terrain.events.emit('ready')
 *
 *   5.  View/Terrains.js listens to `state.terrains.events.on('create', ...)` and
 *       creates a View/Terrain.js wrapper. That wrapper listens to terrain.events
 *       `'ready'` and builds the actual THREE.BufferGeometry + THREE.Mesh, then
 *       adds it to the scene using the shared TerrainMaterial.
 *
 *
 * RELATIONSHIP WITH Terrain (State/Terrain.js)
 * --------------------------------------------
 * Each tile created by `terrains.create(...)` has a matching Terrain instance
 * stored in `this.terrains` (a Map keyed by auto-incremented id). The Terrain
 * object is a lightweight data container:
 *
 *   - Before the worker replies: `terrain.ready === false`, positions/normals are
 *     undefined. The View/Terrain wrapper is created but does not add a mesh yet.
 *   - After the worker replies:  `terrain.ready === true` and the typed arrays are
 *     populated. The View layer reacts to the `'ready'` event and builds the mesh.
 *   - `terrain.getElevationForPosition(x, z)` interpolates across the stored
 *     positions array — used by State/Player.js to sit the player on the ground.
 *
 * When Chunks decides a tile is no longer needed it calls:
 *
 *   state.terrains.destroyTerrain(id)
 *
 * which removes the Terrain from the map and emits `'destroy'` so View/Terrain
 * can remove and dispose its mesh.
 *
 *
 * KEY PARAMETERS AND THEIR IMPACT
 * --------------------------------
 *
 * subdivisions  (default: 80)
 *   Number of quads along each side of a tile. The vertex grid is:
 *     segments = subdivisions + 1   →   81 × 81 = 6 561 vertices per tile
 *   With a typical 9 visible leaf tiles that is ~59 000 vertices on the GPU.
 *   Raising to 160 quadruples the vertex count to ~236 000 and proportionally
 *   increases both worker computation time and GPU vertex-shader invocations.
 *   Lowering to 40 gives ~1 700 vertices per tile — much cheaper but terrain
 *   slopes become visibly faceted at close range. Also drives the resolution
 *   of the per-vertex data texture (segments × segments texels).
 *
 * lacunarity  (default: 2.05)
 *   Frequency multiplier applied between successive fBm octaves:
 *     frequency_i = baseFrequency * lacunarity^i
 *   A value of 2 means each octave is roughly twice as "zoomed in" as the
 *   previous one — standard fBm. Values above 2 push high-frequency detail
 *   in faster (more jagged detail layers). Values below 2 create octaves that
 *   are more spread out and less distinctly layered. Changing this does not
 *   affect performance but visibly alters how micro-detail accumulates.
 *
 * persistence  (default: 0.45)
 *   Amplitude multiplier between octaves:
 *     amplitude_i = persistence^i
 *   Values close to 1 give all octaves equal weight → very noisy, rough terrain.
 *   Values close to 0 let only the lowest-frequency octave matter → smooth, gentle
 *   hills. At 0.45 each octave contributes roughly half as much as the previous
 *   one, a common "natural" balance.
 *
 * maxIterations  (default: 6)
 *   Total number of fBm octave layers. Each extra octave adds one noise2D()
 *   call per vertex inside the worker, so the worker cost scales linearly with
 *   this value. Visually, octaves beyond 5–6 add very fine wrinkles that are
 *   only noticeable up close. Reducing to 3–4 is a fast way to cut worker time
 *   roughly in half with little perceptible change at mid or far distances.
 *
 * baseFrequency  (default: 0.003)
 *   World-space frequency of the first (largest) octave. Larger values shrink
 *   mountains — at 0.006 features are half the size. Smaller values spread the
 *   landscape over a bigger world area and make mountains feel more epic.
 *
 * baseAmplitude  (default: 180)
 *   Scales the final elevation value in world units (Y-axis). After the power
 *   function the normalised noise output is multiplied by this value, so it
 *   directly sets the maximum possible height of any mountain peak. Halving it
 *   to 90 produces a much flatter world; raising to 360 creates dramatic cliffs.
 *
 * power  (default: 2)
 *   Applied after all octaves are summed and normalised:
 *     elevation = Math.pow(Math.abs(elevation), power) * Math.sign(elevation)
 *   power = 1  → linear pass-through, rounded hills and valleys.
 *   power = 2  → valleys are squashed toward zero, peaks become sharper and more
 *                dramatic. This is what gives the terrain a "mountains rising from
 *                flat plains" character rather than a uniform undulation.
 *   power > 3  → very flat plains punctuated by extreme, spike-like peaks.
 *   Has no impact on worker performance; it is a single math op per vertex.
 *
 * elevationOffset  (default: 1)
 *   A constant added to the elevation after the power curve. Effectively raises
 *   or lowers the entire terrain relative to sea level. A value of 0 centres the
 *   world at Y = 0; positive values push terrain upward (more land above water).
 *
 *
 * PRECISION AND iterationsFormula
 * --------------------------------
 * Chunks passes a `precision` value (0–1) when requesting tiles; tiles further
 * from the player get a lower precision. `getIterationsForPrecision(precision)`
 * maps that 0–1 value to an integer octave count via one of four formulas:
 *
 *   ITERATIONS_FORMULA_MAX      → always use maxIterations (no LOD on octaves)
 *   ITERATIONS_FORMULA_MIN      → linearly scales from 1 to maxIterations
 *   ITERATIONS_FORMULA_MIX      → average of linear and max (gentle falloff)
 *   ITERATIONS_FORMULA_POWERMIX → (default) uses a 1-(1-t)² ease-out curve,
 *                                  so nearby tiles get nearly full detail but
 *                                  distant tiles drop octaves aggressively.
 *
 * This means a distant tile might only run 2–3 fBm octaves instead of 6,
 * significantly reducing worker load for the tiles that matter least visually.
 *
 *
 * SEED DETERMINISM
 * ----------------
 * All randomness in this class is seeded:
 *   this.seed = game.seed + 'b'
 * The `iterationsOffsets` array — random (x, z) translations applied per octave
 * to break up the obvious grid structure of the noise — is generated once from
 * this seed so the world is always identical for a given `game.seed`.
 *
 *
 * RECREATING TERRAIN (debug / parameter tweaks)
 * ----------------------------------------------
 * All debug controls call `this.recreate()` on change, which re-posts worker
 * messages for every currently live terrain using the updated parameters. The
 * View/Terrain `'ready'` listener then disposes the old BufferGeometry and
 * swaps in the newly computed one without destroying the mesh or material.
 */
export default class Terrains {
    static ITERATIONS_FORMULA_MAX = 1;
    static ITERATIONS_FORMULA_MIN = 2;
    static ITERATIONS_FORMULA_MIX = 3;
    static ITERATIONS_FORMULA_POWERMIX = 4;

    constructor() {
        this.game = Game.getInstance();
        this.state = State.getInstance();
        this.debug = Debug.getInstance();

        this.seed = this.game.seed + "b";
        this.random = new seedrandom(this.seed);
        this.subdivisions = 80;
        this.lacunarity = 2.05;
        this.persistence = 0.45;
        this.maxIterations = 6;
        this.baseFrequency = 0.003;
        this.baseAmplitude = 180;
        this.power = 2;
        this.elevationOffset = 1;

        this.segments = this.subdivisions + 1;
        this.iterationsFormula = Terrains.ITERATIONS_FORMULA_POWERMIX;

        this.lastId = 0;
        this.terrains = new Map();

        this.events = new EventsEmitter();

        // Iterations offsets
        this.iterationsOffsets = [];

        for (let i = 0; i < this.maxIterations; i++)
            this.iterationsOffsets.push([
                (this.random() - 0.5) * 200000,
                (this.random() - 0.5) * 200000,
            ]);

        this.setWorkers();
        this.setDebug();
    }

    setWorkers() {
        this.worker = TerrainWorker();

        this.worker.onmessage = (event) => {
            // console.timeEnd(`terrains: worker (${event.data.id})`)

            const terrain = this.terrains.get(event.data.id);

            if (terrain) {
                terrain.create(event.data);
            }
        };
    }

    getIterationsForPrecision(precision) {
        if (this.iterationsFormula === Terrains.ITERATIONS_FORMULA_MAX)
            return this.maxIterations;

        if (this.iterationsFormula === Terrains.ITERATIONS_FORMULA_MIN)
            return Math.floor((this.maxIterations - 1) * precision) + 1;

        if (this.iterationsFormula === Terrains.ITERATIONS_FORMULA_MIX)
            return Math.round(
                (this.maxIterations * precision + this.maxIterations) / 2,
            );

        if (this.iterationsFormula === Terrains.ITERATIONS_FORMULA_POWERMIX)
            return Math.round(
                (this.maxIterations *
                    (precision, 1 - Math.pow(1 - precision, 2)) +
                    this.maxIterations) /
                    2,
            );
    }

    create(size, x, z, precision) {
        // Create id
        const id = this.lastId++;

        // Create terrain
        const iterations = this.getIterationsForPrecision(precision);
        const terrain = new Terrain(this, id, size, x, z, precision);
        this.terrains.set(terrain.id, terrain);

        // Post to worker
        // console.time(`terrains: worker (${terrain.id})`)
        this.worker.postMessage({
            id: terrain.id,
            x,
            z,
            seed: this.seed,
            subdivisions: this.subdivisions,
            size: size,
            lacunarity: this.lacunarity,
            persistence: this.persistence,
            iterations: iterations,
            baseFrequency: this.baseFrequency,
            baseAmplitude: this.baseAmplitude,
            power: this.power,
            elevationOffset: this.elevationOffset,
            iterationsOffsets: this.iterationsOffsets,
        });

        this.events.emit("create", terrain);

        return terrain;
    }

    destroyTerrain(id) {
        const terrain = this.terrains.get(id);

        if (terrain) {
            terrain.destroy();
            this.terrains.delete(id);
        }
    }

    recreate() {
        for (const [key, terrain] of this.terrains) {
            // this.create(terrain.size, terrain.x, terrain.z)

            // console.time(`terrains: worker (${terrain.id})`)
            const iterations = this.getIterationsForPrecision(
                terrain.precision,
            );
            this.worker.postMessage({
                id: terrain.id,
                size: terrain.size,
                x: terrain.x,
                z: terrain.z,
                seed: this.seed,
                subdivisions: this.subdivisions,
                lacunarity: this.lacunarity,
                persistence: this.persistence,
                iterations: iterations,
                baseFrequency: this.baseFrequency,
                baseAmplitude: this.baseAmplitude,
                power: this.power,
                elevationOffset: this.elevationOffset,
                iterationsOffsets: this.iterationsOffsets,
            });
        }
    }

    setDebug() {
        if (!this.debug.active) return;

        const folder = this.debug.ui.getFolder("state/terrains");

        folder
            .add(this, "subdivisions")
            .min(1)
            .max(400)
            .step(1)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "lacunarity")
            .min(1)
            .max(5)
            .step(0.01)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "persistence")
            .min(0)
            .max(1)
            .step(0.01)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "maxIterations")
            .min(1)
            .max(10)
            .step(1)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "baseFrequency")
            .min(0)
            .max(0.01)
            .step(0.0001)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "baseAmplitude")
            .min(0)
            .max(500)
            .step(0.1)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "power")
            .min(1)
            .max(10)
            .step(1)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "elevationOffset")
            .min(-10)
            .max(10)
            .step(1)
            .onFinishChange(() => this.recreate());

        folder
            .add(this, "iterationsFormula", {
                max: Terrains.ITERATIONS_FORMULA_MAX,
                min: Terrains.ITERATIONS_FORMULA_MIN,
                mix: Terrains.ITERATIONS_FORMULA_MIX,
                powerMix: Terrains.ITERATIONS_FORMULA_POWERMIX,
            })
            .onFinishChange(() => this.recreate());

        // this.material.uniforms.uFresnelOffset.value = 0
        // this.material.uniforms.uFresnelScale.value = 0.5
        // this.material.uniforms.uFresnelPower.value = 2
    }
}
