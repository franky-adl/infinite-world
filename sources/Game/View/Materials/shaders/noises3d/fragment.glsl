varying vec2 vUv;

// Normalized Y position across all layers: layer / (yLevels - 1), range [0, 1].
uniform float uLayer;

#include ../partials/perlinWorley3dPeriodic.glsl;

void main()
{
    // XZ tiling frequency
    const float freqXZ = 2.0;

    // Y frequency — scaled so cells are isotropic.
    const float freqY = 2.0;

    // 3D sample coordinate:
    //   x → vUv.x (world X), y → uLayer (world Y height), z → vUv.y (world Z)
    vec3 p   = vec3(vUv.x * freqXZ, uLayer * freqY, vUv.y * freqXZ);

    float noiseR = perlinfbm(p, 1., 5) * 0.5 + 0.5;
    float noiseG = 0.;
    float noiseB = 0.;
    float noiseA = 0.;

    gl_FragColor = vec4(noiseR, noiseG, noiseB, noiseA);
}
