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

    float perlinVal = perlinfbm(p, 1., 4);
    float perlin2 = perlinfbm(p * 2., 2., 2);
    float worleyVal = worleyFbm(p, 3.);
    float perlinWorley = remap(perlinVal, 0., 1., worleyVal, 1.);
    float clouds = remap(perlinWorley, 0.6, 1., 0., 1.);

    float noiseR = perlinVal * 0.5 + 0.5;
    float noiseG = worleyVal;
    float noiseB = perlin2 * 0.7 + 0.3;
    float noiseA = clouds;

    gl_FragColor = vec4(noiseR, noiseG, noiseB, noiseA);
}
