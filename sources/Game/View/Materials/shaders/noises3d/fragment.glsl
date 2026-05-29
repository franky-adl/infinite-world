varying vec2 vUv;

// Normalized Y position across all layers: layer / (yLevels - 1), range [0, 1].
uniform float uLayer;

#include ../partials/perlin3dPeriodic.glsl;

void main()
{
    // XZ tiling frequency — 4 repetitions across the 128-texel XZ dimensions.
    // Each cell is 32 texels wide/deep.
    const float freqXZ = 4.0;

    // Y frequency — scaled so cells are isotropic (32 texels tall across 32 Y levels).
    // freqXZ * (yLevels / xzSize) = 4.0 * (32.0 / 128.0) = 1.0
    const float freqY = 4.0;

    // 3D sample coordinate:
    //   x → vUv.x (world X), y → uLayer (world Y height), z → vUv.y (world Z)
    vec3 p   = vec3(vUv.x * freqXZ, uLayer * freqY, vUv.y * freqXZ);
    vec3 rep = vec3(freqXZ, freqY, freqXZ);

    // Four decorrelated channels via integer cell-offset shifts.
    // Each offset component is non-zero mod its period, guaranteeing a
    // genuinely different region of the noise field per channel.
    //   R: (0, 0, 0) — base
    //   G: (+1 cell in X, +2 cells in Z)  → offsets (1 % 4 ≠ 0, 2 % 4 ≠ 0)
    //   B: (+2 cells in X, +3 cells in Z)  → offsets (2 % 4 ≠ 0, 3 % 4 ≠ 0)
    //   A: (+3 cells in X, +1 cell  in Z)  → offsets (3 % 4 ≠ 0, 1 % 4 ≠ 0)
    float noiseR = perlin3dPeriodic(p,                         rep) * 0.5 + 0.5;
    float noiseG = perlin3dPeriodic(p + vec3(1.0, 0.0, 2.0),  rep) * 0.5 + 0.5;
    float noiseB = perlin3dPeriodic(p + vec3(2.0, 0.0, 3.0),  rep) * 0.5 + 0.5;
    float noiseA = perlin3dPeriodic(p + vec3(3.0, 0.0, 1.0),  rep) * 0.5 + 0.5;

    gl_FragColor = vec4(noiseR, noiseG, noiseB, noiseA);
}
