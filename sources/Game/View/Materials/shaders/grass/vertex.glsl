#define M_PI 3.1415926535897932384626433832795

uniform float uTime;
uniform float uGrassDistance;
uniform vec3 uPlayerPosition;
uniform float uDayCycleProgress;
uniform float uTerrainSize;
uniform float uTerrainTextureSize;
uniform sampler2D uTerrainATexture;
uniform vec2 uTerrainAOffset;
uniform sampler2D uTerrainBTexture;
uniform vec2 uTerrainBOffset;
uniform sampler2D uTerrainCTexture;
uniform vec2 uTerrainCOffset;
uniform sampler2D uTerrainDTexture;
uniform vec2 uTerrainDOffset;
uniform sampler2D uNoiseTexture;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform vec3 uSunPosition;
uniform vec3 uMoonPosition;
uniform vec3 uDawnGrassColor;
uniform float uRustleScale;
uniform float uWindGustStrength;

attribute vec2 center;
attribute float tipness;
attribute float seed;

varying vec3 vColor;

#include ../partials/getDawnCycleIntensity.glsl;
#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/remapClamp.glsl
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunMoonReflection.glsl;
#include ../partials/getGrassAttenuation.glsl;
#include ../partials/getRotatePivot2d.glsl;

vec3 getReflectionColor(vec3 baseColor, float sunReflection, float tipness, float dawnIntensity)
{
    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 sunReflectionColor = mix(white, uDawnGrassColor, dawnIntensity);
    return mix(baseColor, sunReflectionColor, clamp(sunReflection, 0.0, 1.0) * (tipness * 0.5 + 0.5));
}

void main()
{
    // Recalculate center and keep around player
    vec2 newCenter = center;
    // Since the whole grass mesh moves with the player,
    // Each grass blade needs to move in the opposite direction of the player to maintain its correct world position
    newCenter -= uPlayerPosition.xz;
    float halfSize = uGrassDistance * 0.5;
    // Use a centered modulo to create the repeating pattern mapped to -halfSize ~ halfSize
    newCenter.x = mod(newCenter.x + halfSize, uGrassDistance) - halfSize;
    newCenter.y = mod(newCenter.y + halfSize, uGrassDistance) - halfSize; // Y considered as Z
    vec4 modelCenter = modelMatrix * vec4(newCenter.x, 0.0, newCenter.y, 1.0);

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    // Apply the reverse translation of the grass to the original world position
    modelPosition.xz += newCenter; // Y considered as Z

    // Rotate blade to face camera
    float angleToCamera = atan(modelCenter.x - cameraPosition.x, modelCenter.z - cameraPosition.z);
    modelPosition.xz = getRotatePivot2d(modelPosition.xz, angleToCamera, modelCenter.xz);

    // Terrains data
    // Sample at the blade center (not the per-vertex rotated position) so that all vertices
    // of a blade share the same terrain height, preventing height discontinuities.
    vec2 terrainAUv = (modelCenter.xz - uTerrainAOffset.xy) / uTerrainSize;
    vec2 terrainBUv = (modelCenter.xz - uTerrainBOffset.xy) / uTerrainSize;
    vec2 terrainCUv = (modelCenter.xz - uTerrainCOffset.xy) / uTerrainSize;
    vec2 terrainDUv = (modelCenter.xz - uTerrainDOffset.xy) / uTerrainSize;

    float fragmentSize = 1.0 / uTerrainTextureSize;
    vec4 terrainAColor = texture2D(uTerrainATexture, terrainAUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
    vec4 terrainBColor = texture2D(uTerrainBTexture, terrainBUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
    vec4 terrainCColor = texture2D(uTerrainCTexture, terrainCUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
    vec4 terrainDColor = texture2D(uTerrainDTexture, terrainDUv * (1.0 - fragmentSize) + fragmentSize * 0.5);

    vec4 terrainData = vec4(0);
    terrainData += step(0.0, terrainAUv.x) * step(terrainAUv.x, 1.0) * step(0.0, terrainAUv.y) * step(terrainAUv.y, 1.0) * terrainAColor;
    terrainData += step(0.0, terrainBUv.x) * step(terrainBUv.x, 1.0) * step(0.0, terrainBUv.y) * step(terrainBUv.y, 1.0) * terrainBColor;
    terrainData += step(0.0, terrainCUv.x) * step(terrainCUv.x, 1.0) * step(0.0, terrainCUv.y) * step(terrainCUv.y, 1.0) * terrainCColor;
    terrainData += step(0.0, terrainDUv.x) * step(terrainDUv.x, 1.0) * step(0.0, terrainDUv.y) * step(terrainDUv.y, 1.0) * terrainDColor;

    vec3 normal = terrainData.rgb;

    modelPosition.y += terrainData.a;
    modelCenter.y += terrainData.a;

    // Slope (0: flat, 1: vertical)
    // float slope = 1.0 - abs(dot(vec3(0.0, 1.0, 0.0), normal));

    // Attenuation - shrink in scale as it gets farther or on steeper slope
    float distanceScale = getGrassAttenuation(modelCenter.xz); // starts from 1, starts to drop if grass if farther than 30% of the half size
    float scale = distanceScale;
    modelPosition.xyz = mix(modelCenter.xyz, modelPosition.xyz, scale);

    // Individual Rustles
    vec2 rustleUv = modelCenter.xz * seed + uTime * 0.15;
    // The noise texture has each channel fitted with a different periodic perlin noise
    vec4 noiseColor = texture2D(uNoiseTexture, rustleUv);
    modelPosition.x += (noiseColor.x - 0.5) * tipness * scale * uRustleScale;
    modelPosition.y += (noiseColor.y - 0.5) * tipness * scale * uRustleScale;
    modelPosition.z += (noiseColor.z - 0.5) * tipness * scale * uRustleScale;

    // Larger scale wind effect
    vec2 noiseUv = modelPosition.xz * 0.01 + uTime * 0.1;
    vec4 largeNoiseColor = texture2D(uNoiseTexture, noiseUv);

    // Wind bending logic
    // Define a fixed wind direction in the XZ plane
    vec2 windDirection = normalize(vec2(0.2, 1.0));
    // Use the noise to determine the strength/offset of the bend
    float windStrength = (largeNoiseColor.r - 0.5) * 2.0;
    // Calculate the bending angle based on tipness (0 at root, 1 at tip)
    float windAngle = windStrength * tipness * uWindGustStrength;

    // Rotate the vertex around its root (modelCenter) to maintain its length
    // Get the relative position of the vertex to its root
    vec3 relativePosition = modelPosition.xyz - modelCenter.xyz;
    float currentHeight = relativePosition.y;

    // Calculate the new height and the displacement along the wind direction using circular rotation
    relativePosition.y = currentHeight * cos(windAngle);
    float displacement = currentHeight * sin(windAngle);

    relativePosition.x += windDirection.x * displacement;
    relativePosition.z += windDirection.y * displacement;

    // Update the model position with the rotated relative position
    modelPosition.xyz = modelCenter.xyz + relativePosition;
    
    // Final position
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
    
    // Grass color - default color is used as the terrain color
    vec3 uGrassDefaultColor = vec3(0.52, 0.65, 0.26);
    vec3 uGrassShadedColor = vec3(0.52 / 1.3, 0.65 / 1.3, 0.26 / 1.3);
    // The further away, the closer lowColor is to the terrain color
    vec3 lowColor = mix(uGrassShadedColor, uGrassDefaultColor, 1.0 - scale); // Match the terrain
    vec3 color = mix(lowColor, uGrassDefaultColor, tipness);

    // Sun shade - 0 at midday when sun is above, 1 at midnight when sun is below
    vec3 worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
    float sunShade = getSunShade(worldNormal);
    // Gets mixed to the shaded color during midnight
    color = getSunShadeColor(color, sunShade);

    // Sun & Moon reflection - lerps to white based on sun reflection and fresnel amount
    float dawnIntensity = getDawnCycleIntensity();
    vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
    vec3 viewNormal = normalize(normalMatrix * normal);
    float sunReflection = getSunMoonReflection(viewDirection, worldNormal, viewNormal);
    color = getReflectionColor(color, sunReflection, tipness, dawnIntensity);

    // Simulate Cloud Shadows
    vec2 cloudUv = modelCenter.xz * 0.002 + uTime * 0.02;
    float cloudShadow = texture2D(uNoiseTexture, cloudUv).g;
    float adjustedShadow = mix(cloudShadow, 1.0, dawnIntensity); // no cloud shadows during dawn
    color *= mix(0.4, 1.0, adjustedShadow);

    vColor = color;
    // vColor = vec3(slope);
}