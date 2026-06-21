#define M_PI 3.1415926535897932384626433832795

uniform vec3 uPlayerPosition;
uniform float uLightnessSmoothness;
uniform float uTime;
uniform sampler2D uNoiseTexture;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform vec3 uSunPosition;
uniform vec3 uMoonPosition;
uniform float uGrassDistance;
uniform sampler2D uTexture;
uniform sampler2D uFogTexture;
uniform float uDayCycleProgress;
uniform vec3 uDawnGrassColor;
uniform float uWaterLevel;

varying vec3 vColor;

#include ../partials/getDawnCycleIntensity.glsl;
#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/remapClamp.glsl
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunMoonReflection.glsl;
#include ../partials/getFogColor.glsl;
#include ../partials/getGrassAttenuation.glsl;

vec3 getReflectionColor(vec3 baseColor, float sunReflection, float dawnIntensity)
{
    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 sunReflectionColor = mix(white, uDawnGrassColor, dawnIntensity);
    return mix(baseColor, sunReflectionColor, clamp(sunReflection, 0.0, 1.0));
}

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    float depth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    // Terrain data
    vec4 terrainData = texture2D(uTexture, uv);
    vec3 normal = terrainData.rgb;

    // Slope
    float slope = 1.0 - abs(dot(vec3(0.0, 1.0, 0.0), normal));

    // Color
    vec3 uGrassDefaultColor = vec3(0.52, 0.65, 0.26);
    vec3 uGrassShadedColor = vec3(0.52 / 1.3, 0.65 / 1.3, 0.26 / 1.3);
    
    // Grass distance attenuation
    // Terrain must match the bottom of the grass which is darker
    float grassDistanceAttenuation = getGrassAttenuation(modelPosition.xz);
    float grassSlopeAttenuation = smoothstep(remap(slope, 0.4, 0.5, 1.0, 0.0), 0.0, 1.0);
    float grassAttenuation = grassDistanceAttenuation * grassSlopeAttenuation;
    vec3 grassColor = mix(uGrassShadedColor, uGrassDefaultColor, 1.0 - grassAttenuation);

    vec3 color = grassColor;

    // Underwater color
    vec3 waterColor = vec3(0.05, 0.1, 0.2);
    float underwaterFactor = smoothstep(uWaterLevel, uWaterLevel - 5.0, modelPosition.y);
    color = mix(color, waterColor * 0.5, underwaterFactor);

    // Sun shade
    vec3 worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
    float sunShade = getSunShade(worldNormal);
    color = getSunShadeColor(color, sunShade);

    // Sun & Moon reflection
    float dawnIntensity = getDawnCycleIntensity();
    vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
    float sunReflection = getSunMoonReflection(viewDirection, worldNormal);
    color = getReflectionColor(color, sunReflection, dawnIntensity);

    // Simulate Cloud Shadows
    vec2 cloudUv = modelPosition.xz * 0.002 + uTime * 0.02;
    float cloudShadow = texture2D(uNoiseTexture, cloudUv).g;
    float adjustedShadow = mix(cloudShadow, 1.0, dawnIntensity); // no cloud shadows during dawn
    color *= mix(0.4, 1.0, adjustedShadow);

    // Fog
    vec2 screenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    color = getFogColor(color, depth, screenUv);

    // vec3 dirtColor = vec3(0.3, 0.2, 0.1);
    // vec3 color = mix(dirtColor, grassColor, terrainData.g);

    // Varyings
    vColor = color;
}