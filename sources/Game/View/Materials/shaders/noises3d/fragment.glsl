varying vec2 vUv;

// Normalized Y position across all layers: layer / (yLevels - 1), range [0, 1].
uniform float uLayer;

#include ../partials/perlinWorley3dPeriodic.glsl;

void main()
{
    // UV tiling frequency
    const float freqUV = 1.0;

    // W frequency — scaled so cells are isotropic.
    const float freqW = 1.0;

    // 3D sample coordinate in UVW space:
    vec3 p   = vec3(vUv.x * freqUV, vUv.y * freqUV, uLayer * freqW);

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
