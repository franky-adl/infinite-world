#define M_PI 3.1415926535897932384626433832795

uniform float uTime;
uniform vec3 uSunPosition;
uniform vec3 uMoonPosition;
uniform sampler2D uNoiseTexture;
uniform sampler2D uFogTexture;
uniform float uDayCycleProgress;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;

varying vec3 vColor;
varying float vDepth;
varying vec2 vScreenUv;
varying vec2 vUv;
varying float vSunReflection;
varying float vFogIntensity;

#include ../partials/getDawnCycleIntensity.glsl;
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getFogColor.glsl;

float getSunMoonReflection(vec3 viewDirection, vec3 worldNormal)
{
    vec3 sunViewReflection = normalize(reflect(-uSunPosition, worldNormal));
    vec3 moonViewReflection = normalize(reflect(-uMoonPosition, worldNormal));

    float sunDot = dot(sunViewReflection, -viewDirection);
    float moonDot = dot(moonViewReflection, -viewDirection);

    // only start leaning into moon reflection after the sun is below horizon(to maintain nice dawn reflections)
    float nightFactor = -1. * min(cos(uDayCycleProgress * 2.0 * M_PI), 0.);
    float combinedDot = mix(sunDot, moonDot, nightFactor);
    float sunViewStrength = clamp(combinedDot, 0.0, 1.0);
    // viewDirection points from cam to world, so fresnel maxes at grazing angles
    float fresnel = uFresnelOffset + 0.5 * (1.0 + dot(viewDirection, worldNormal));
    float sunReflection = fresnel * sunViewStrength;
    sunReflection = pow(sunReflection, uFresnelPower);

    return sunReflection;
}
void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vDepth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    vScreenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    vUv = uv;

    vec3 normal = vec3(0.0, 1.0, 0.0);
    vec3 worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;

    // Base water color
    vec3 waterColor = vec3(0.05, 0.15, 0.24);
    float dawnIntensity = getDawnCycleIntensity();
    waterColor = mix(waterColor, vec3(0.15, 0.2, 0.2), dawnIntensity);

    // Sun shade
    float sunShade = getSunShade(worldNormal);
    vec3 color = getSunShadeColor(waterColor, sunShade);

    // Sun & Moon reflection
    vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
    float sunReflection = getSunMoonReflection(viewDirection, worldNormal);
    vec3 white = vec3(1.0, 1.0, 1.0);
    color = mix(color, white, sunReflection);
    vSunReflection = sunReflection;

    // Fog
    color = getFogColor(color, vDepth, vScreenUv);

    vColor = color;
    vFogIntensity = 1.0 - exp(- 0.0025 * 0.0025 * vDepth * vDepth );
}
