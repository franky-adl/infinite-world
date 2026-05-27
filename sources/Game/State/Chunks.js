import EventsEmitter from "events";
import { vec2 } from "gl-matrix";

import State from "@/State/State.js";
import Chunk from "./Chunk.js";

/**
 * Chunks — Quadtree LOD Manager (State layer)
 * ============================================
 *
 * OVERVIEW
 * --------
 * Chunks manages a dynamic quadtree of terrain tiles centred on the player.
 * It lives in the State layer and drives geometry creation purely through data
 * and events. The View layer (View/Chunks.js) listens to those events and
 * creates the corresponding Three.js meshes.
 *
 *
 * KEY PARAMETERS
 * --------------
 *
 *   minSize  (default: 128)
 *     The side length in world units of the smallest possible leaf chunk.
 *     All terrain meshes at maximum depth cover a square this size.
 *     Halving minSize doubles the number of leaf tiles and dramatically
 *     increases draw-call count and worker load. Doubling it makes terrain
 *     geometry coarser at close range.
 *
 *   maxDepth  (default: 3)
 *     How many times the quadtree can subdivide from a root chunk.
 *     Each extra level multiplies the number of leaf chunks by 4.
 *     Together with minSize it fixes the root (main) chunk size:
 *
 *       maxSize = minSize * 2^maxDepth   →   128 * 2³ = 1024 world units
 *
 *     With maxDepth = 3 and minSize = 128:
 *       depth 0  →  1024×1024  (root, never rendered directly)
 *       depth 1  →   512×512
 *       depth 2  →   256×256
 *       depth 3  →   128×128  ← leaf — terrain mesh is generated here
 *
 *     Increasing maxDepth adds finer tiles near the player but multiplies
 *     worker jobs and GPU memory. Decreasing it reduces resolution but also
 *     reduces overhead significantly.
 *
 *   splitRatioPerSize  (default: 1.3)
 *     Controls how aggressively the tree subdivides. A chunk of side `size`
 *     splits when the player is closer than `size * splitRatioPerSize`:
 *
 *       this.chunks.underSplitDistance(this.size, this.x, this.z)
 *       // → distance < size * splitRatioPerSize
 *
 *     Raising this value causes chunks to split earlier (more tiles active at
 *     any given time, higher detail further out, higher CPU/GPU cost).
 *     Lowering it creates a tighter LOD transition zone near the player.
 *
 *
 * MAIN CHUNK GRID
 * ---------------
 * On every `check()`, Chunks.getMainChunksCoordinates() builds a 3×3 grid of
 * root-level positions around the player's current maxSize-aligned cell:
 *
 *   [ NW ]  [ N ]  [ NE ]
 *   [  W ]  [ C ]  [  E ]
 *   [ SW ]  [ S ]  [ SE ]
 *
 * Each cell is a 1024×1024 root chunk stored in `this.mainChunks` keyed by
 * grid coordinate (e.g. "2,3"). Chunks that scroll out of this 3×3 window are
 * destroyed; new ones at the leading edge are created. This means the world
 * appears infinite as the player moves, while never having more than 9 root
 * chunks alive at once.
 *
 *
 * QUADTREE SUBDIVISION
 * --------------------
 * Each root chunk calls `chunk.check()`, which recursively decides whether to
 * split or unsplit based on player distance. A split replaces the current tile
 * with four children occupying its four quadrants:
 *
 *   parent (1024×1024)
 *     ├── ne  (512×512, x + quarterSize, z - quarterSize)
 *     ├── nw  (512×512, x - quarterSize, z - quarterSize)
 *     ├── sw  (512×512, x - quarterSize, z + quarterSize)
 *     └── se  (512×512, x + quarterSize, z + quarterSize)
 *
 * Splitting/unsplitting is staggered: a parent keeps its own mesh until all
 * four children are `ready` (terrain data computed), preventing visible holes.
 * The depth at which a chunk lives sets its `precision` (0 → 1), which is
 * passed to the terrain worker so closer tiles get higher-resolution meshes:
 *
 *   this.precision = this.depth / this.chunks.maxDepth   // e.g. 3/3 = 1.0 at leaf
 *
 *
 * TERRAIN CREATION
 * ----------------
 * Only chunks flagged as `final` request geometry. The `final` flag does not
 * simply mean "at maxDepth" — it tracks which chunk is currently the visible
 * leaf, and it changes dynamically as the tree splits and unsplits:
 *
 *   1. CONSTRUCTION — every new chunk calls `createFinal()` immediately after
 *      its first `check()`, provided `check()` did not split it right away:
 *
 *        if (!this.splitted) this.createFinal()   // Chunk constructor
 *
 *      A chunk at maxDepth (`maxSplit = true`) can never split, so it stays
 *      final for its entire lifetime.
 *
 *   2. SPLITTING — when a chunk splits, `final` remains true on the parent
 *      while the four children load. Only once all children are `ready` does
 *      `setReady()` call `destroyFinal()` on the parent, removing its terrain
 *      and handing responsibility to the children. This prevents holes.
 *
 *   3. UNSPLITTING — `unsplit()` immediately calls `createFinal()` on the
 *      parent again so it can start loading its own terrain while the children
 *      are still alive. The children are destroyed only after the parent's
 *      terrain is `ready`.
 *
 * Even after `final` is set, terrain is not requested immediately. The actual
 * worker job is deferred until the next `update()` tick where all four
 * neighbours have been assigned (i.e. `neighbours.size === 4`):
 *
 *   // Chunk.update()
 *   if (this.final && this.terrainNeedsUpdate && this.neighbours.size === 4) {
 *       this.createTerrain()
 *       this.terrainNeedsUpdate = false
 *   }
 *
 * This guard is important: without all four neighbours the terrain worker
 * cannot generate correctly stitched edge normals and index skirts. Because
 * `updateAllNeighbours()` runs at the end of every `Chunks.check()`, newly
 * created border tiles will always find their neighbours on the very next
 * frame. The worker call itself is:
 *
 *   this.terrain = this.state.terrains.create(this.size, this.x, this.z, this.precision)
 *
 * The worker returns position / normal / index buffers and a texture. When the
 * job finishes the terrain emits 'ready', which propagates up the tree so
 * parents know when they can hide themselves during a split/unsplit transition.
 *
 *
 * NEIGHBOUR STITCHING
 * -------------------
 * After every `check()`, `updateAllNeighbours()` traverses the entire tree and
 * assigns the four cardinal neighbours (n/e/s/w) for every chunk. This is used
 * by the terrain shader / mesh builder to stitch seams at LOD boundaries.
 * Neighbour resolution is order-dependent — main chunks are set first (from the
 * flat mainChunks map), then sub-chunks in ascending depth order so a child can
 * always look up its parent's already-assigned neighbour.
 *
 *
 * CONNECTION TO THE VIEW LAYER
 * ----------------------------
 * Chunks emits a 'create' event every time a new Chunk is instantiated:
 *
 *   // State/Chunks.js
 *   this.events.emit('create', chunk)
 *
 * View/Chunks.js subscribes to this stream and mirrors it with Three.js objects:
 *
 *   // View/Chunks.js
 *   this.state.chunks.events.on('create', (chunkState) => {
 *       const chunk = new Chunk(chunkState)          // View/Chunk.js
 *       chunkState.events.on('destroy', () => chunk.destroy())
 *   })
 *
 * This keeps State and View completely decoupled: the quadtree logic never
 * touches Three.js, and the View layer never drives chunk decisions.
 *
 *
 * PERFORMANCE RULES OF THUMB
 * --------------------------
 *   - Active leaf chunk count ≈ 9 root tiles × up to 4^maxDepth children
 *     that satisfy the split distance test. Worst case with default settings:
 *     9 × 4³ = 576 tiles, though in practice far fewer are within range.
 *   - Each leaf chunk spawns one async worker job and one draw call.
 *   - Halving minSize OR increasing maxDepth by 1 roughly quadruples the
 *     worst-case tile count in the vicinity of the player.
 *   - `check()` only runs when the player moves to a new minSize/2 grid cell
 *     (tracked via `playerChunkKey`), so the quadtree update cost is not
 *     paid every frame.
 */
export default class Chunks {
    constructor() {
        this.state = State.getInstance();

        this.minSize = 256;
        this.maxDepth = 2;
        this.maxSize = this.minSize * Math.pow(2, this.maxDepth);
        this.splitRatioPerSize = 1.3;
        this.lastId = 0;

        this.events = new EventsEmitter();
        this.mainChunks = new Map();
        this.allChunks = new Map();
        this.playerChunkKey = null;

        this.check();
    }

    check() {
        // Set all children flag for check
        for (const [key, chunk] of this.allChunks) chunk.needsCheck = true;

        // Get the coordinates to main chunks around the player
        const mainChunksCoordinates = this.getMainChunksCoordinates();

        // Destroy main chunks not in proximity anymore
        for (const [key, chunk] of this.mainChunks) {
            if (
                !mainChunksCoordinates.find(
                    (coordinates) => coordinates.key === key,
                )
            ) {
                chunk.destroy();
                this.mainChunks.delete(key);
            }
        }

        // Create new main chunks
        for (const coordinates of mainChunksCoordinates) {
            if (!this.mainChunks.has(coordinates.key)) {
                const chunk = this.create(
                    null,
                    null,
                    this.maxSize,
                    coordinates.x,
                    coordinates.z,
                    0,
                );
                this.mainChunks.set(coordinates.key, chunk);
            }
        }

        // Check chunks
        for (const [key, chunk] of this.mainChunks) chunk.check();

        // Update neighbours
        this.updateAllNeighbours();
    }

    update() {
        // Check only if player coordinates changed to to another minimal chunk
        const player = this.state.player;
        const playerChunkKey = `${Math.round((player.position.current[0] / this.minSize) * 2 + 0.5)}${Math.round((player.position.current[2] / this.minSize) * 2 + 0.5)}`;

        if (playerChunkKey !== this.playerChunkKey) {
            this.playerChunkKey = playerChunkKey;
            this.check();
        }

        // Update main chunks
        for (const [key, chunk] of this.mainChunks) chunk.update();
    }

    create(parent, quadPosition, halfSize, x, z, depth) {
        const id = this.lastId++;
        const chunk = new Chunk(
            id,
            this,
            parent,
            quadPosition,
            halfSize,
            x,
            z,
            depth,
        );

        this.allChunks.set(id, chunk);

        this.events.emit("create", chunk);

        return chunk;
    }

    updateAllNeighbours() {
        // Update main chunks neighbours
        for (const [key, chunk] of this.mainChunks) {
            const coordinates = key.split(",");
            const x = parseFloat(coordinates[0]);
            const z = parseFloat(coordinates[1]);

            const nChunkKey = `${x},${z - 1}`;
            const eChunkKey = `${x + 1},${z}`;
            const sChunkKey = `${x},${z + 1}`;
            const wChunkKey = `${x - 1},${z}`;

            const nChunk = this.mainChunks.get(nChunkKey) ?? false;
            const eChunk = this.mainChunks.get(eChunkKey) ?? false;
            const sChunk = this.mainChunks.get(sChunkKey) ?? false;
            const wChunk = this.mainChunks.get(wChunkKey) ?? false;

            chunk.setNeighbours(nChunk, eChunk, sChunk, wChunk);
        }

        // All not main chunks in depth order
        const chunks = [...this.allChunks.values()]
            .filter((chunk) => chunk.depth > 0)
            .sort((a, b) => a.depth - b.depth);

        for (const chunk of chunks) {
            let nChunk = false;
            let eChunk = false;
            let sChunk = false;
            let wChunk = false;

            /**
             * North
             */
            // From quad
            if (chunk.quadPosition === "sw")
                nChunk = chunk.parent.children.get("nw");
            // From quad
            else if (chunk.quadPosition === "se")
                nChunk = chunk.parent.children.get("ne");
            // From parent neighbours
            else {
                const parentNeighbour = chunk.parent.neighbours.get("n");
                if (parentNeighbour) {
                    if (parentNeighbour.splitted)
                        nChunk = parentNeighbour.children.get(
                            chunk.quadPosition === "nw" ? "sw" : "se",
                        );
                    else nChunk = parentNeighbour;
                }
            }

            /**
             * East
             */
            // From quad
            if (chunk.quadPosition === "nw")
                eChunk = chunk.parent.children.get("ne");
            // From quad
            else if (chunk.quadPosition === "sw")
                eChunk = chunk.parent.children.get("se");
            // From parent neighbours
            else {
                const parentNeighbour = chunk.parent.neighbours.get("e");
                if (parentNeighbour) {
                    if (parentNeighbour.splitted)
                        eChunk = parentNeighbour.children.get(
                            chunk.quadPosition === "ne" ? "nw" : "sw",
                        );
                    else eChunk = parentNeighbour;
                }
            }

            /**
             * South
             */
            // From quad
            if (chunk.quadPosition === "nw")
                sChunk = chunk.parent.children.get("sw");
            // From quad
            else if (chunk.quadPosition === "ne")
                sChunk = chunk.parent.children.get("se");
            // From parent neighbours
            else {
                const parentNeighbour = chunk.parent.neighbours.get("s");
                if (parentNeighbour) {
                    if (parentNeighbour.splitted)
                        sChunk = parentNeighbour.children.get(
                            chunk.quadPosition === "sw" ? "nw" : "ne",
                        );
                    else sChunk = parentNeighbour;
                }
            }

            /**
             * West
             */
            // From quad
            if (chunk.quadPosition === "ne")
                wChunk = chunk.parent.children.get("nw");
            // From quad
            else if (chunk.quadPosition === "se")
                wChunk = chunk.parent.children.get("sw");
            // From parent neighbours
            else {
                const parentNeighbour = chunk.parent.neighbours.get("w");
                if (parentNeighbour) {
                    if (parentNeighbour.splitted)
                        wChunk = parentNeighbour.children.get(
                            chunk.quadPosition === "nw" ? "ne" : "se",
                        );
                    else wChunk = parentNeighbour;
                }
            }

            chunk.setNeighbours(nChunk, eChunk, sChunk, wChunk);
        }
    }

    getMainChunksCoordinates() {
        const player = this.state.player;
        const currentX = Math.round(player.position.current[0] / this.maxSize);
        const currentZ = Math.round(player.position.current[2] / this.maxSize);

        // Find normalize neighbours
        const mainChunksCoordinates = [
            { x: currentX, z: currentZ }, // Current
            { x: currentX, z: currentZ + 1 }, // Up
            { x: currentX + 1, z: currentZ + 1 }, // Up right
            { x: currentX + 1, z: currentZ }, // Right
            { x: currentX + 1, z: currentZ - 1 }, // Down right
            { x: currentX, z: currentZ - 1 }, // Down
            { x: currentX - 1, z: currentZ - 1 }, // Down left
            { x: currentX - 1, z: currentZ }, // Left
            { x: currentX - 1, z: currentZ + 1 }, // Up left
        ];

        // Create key and multiply by max size of chunks
        for (const coordinates of mainChunksCoordinates) {
            coordinates.coordinatesX = coordinates.x;
            coordinates.coordinatesZ = coordinates.z;
            coordinates.key = `${coordinates.x},${coordinates.z}`;
            coordinates.x *= this.maxSize;
            coordinates.z *= this.maxSize;
        }

        return mainChunksCoordinates;
    }

    underSplitDistance(size, chunkX, chunkY) {
        const player = this.state.player;
        const distance = Math.hypot(
            player.position.current[0] - chunkX,
            player.position.current[2] - chunkY,
        );
        return distance < size * this.splitRatioPerSize;
    }

    getChildChunkForPosition(x, z) {
        for (const [key, chunk] of this.mainChunks) {
            if (chunk.isInside(x, z)) {
                return chunk;
            }
        }
    }

    getDeepestChunkForPosition(x, z) {
        const baseChunk = this.getChildChunkForPosition(x, z);
        if (!baseChunk) return false;

        const chunk = baseChunk.getChildChunkForPosition(x, z);
        return chunk;
    }

    getElevationForPosition(x, z) {
        const currentChunk = this.getDeepestChunkForPosition(x, z);

        if (!currentChunk || !currentChunk.terrain) return false;

        const elevation = currentChunk.terrain.getElevationForPosition(x, z);
        return elevation;
    }
}
