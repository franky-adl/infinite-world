varying vec2 vUv;

// Normalized Y position across all layers: layer / (yLevels - 1), range [0, 1].
uniform float uLayer;

#include ../partials/perlinWorley3dPeriodic.glsl;

void main()
{
    // XZ tiling frequency
    const float freqXZ = 1.0;

    // Y frequency — scaled so cells are isotropic.
    const float freqY = 1.0;

    // 3D sample coordinate:
    //   x → vUv.x (world X), y → uLayer (world Y height), z → vUv.y (world Z)
    vec3 p   = vec3(vUv.x * freqXZ, uLayer * freqY, vUv.y * freqXZ);

    float perlin = perlinfbm(p, 1., 4);
    float worley = worleyFbm(p, 3.);
    float perlinWorley = remap(perlin, 0., 1., worley, 1.);

    float perlinCoverage = perlinfbm(p * 2., 2., 2);
    // basic cloud pattern by a remapped perlinWorley noise
    float baseClouds = remap(perlinWorley, 0.6, 1., 0., 1.);
    // further modulated by a coverage multiplier for more sparsely distributed clouds
    float clouds = (perlinCoverage * 0.7 + 0.35) * baseClouds;

    // todo: use a slimmer texture ie RG16 if you're not using other slots
    float noiseR = clouds;
    // also passing over the baseClouds for a better visual for bottom cloud shading
    float noiseG = baseClouds;
    float noiseB = 0.;
    float noiseA = 0.;

    gl_FragColor = vec4(noiseR, noiseG, noiseB, noiseA);
}
