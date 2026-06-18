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

#include ../partials/getDawnCycleIntensity.glsl;
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunMoonReflection.glsl;
#include ../partials/getFogColor.glsl;

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
    vec3 waterColor = vec3(0.05, 0.15, 0.3);
    float dawnIntensity = getDawnCycleIntensity();
    waterColor = mix(waterColor, vec3(0.1, 0.05, 0.02), dawnIntensity);

    // Sun shade
    float sunShade = getSunShade(worldNormal);
    vec3 color = getSunShadeColor(waterColor, sunShade);

    // Sun & Moon reflection
    vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
    vec3 viewNormal = normalize(normalMatrix * normal);
    float sunReflection = getSunMoonReflection(viewDirection, worldNormal, viewNormal);
    vSunReflection = clamp(sunReflection, 0.0, 1.0);
    vec3 white = vec3(1.0, 1.0, 1.0);
    color = mix(color, white, vSunReflection);

    // Fog
    color = getFogColor(color, vDepth, vScreenUv);

    vColor = color;
}
