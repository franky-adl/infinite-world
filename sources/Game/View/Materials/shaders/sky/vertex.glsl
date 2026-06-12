#define M_PI 3.1415926535897932384626433832795

uniform vec3 uSunPosition;

uniform float uAtmosphereElevation;
uniform float uAtmospherePower;
uniform vec3 uColorDayCycleLow;
uniform vec3 uColorDayCycleHigh;
uniform vec3 uColorNightLow;
uniform vec3 uColorNightHigh;

uniform float uDawnAngleAmplitude;
uniform float uDawnElevationAmplitude;
uniform vec3 uColorDawn;

uniform float uSunAmplitude;
uniform float uSunMultiplier;
uniform vec3 uColorSun;

uniform float uDayCycleProgress;

varying vec3 vColor;
varying float vDawnIntensity;
varying vec3 vWorldPosition;

#include ../partials/getDawnCycleIntensity.glsl;
#include ../partials/inverseLerp.glsl;
#include ../partials/remapClamp.glsl;

vec3 blendAdd(vec3 base, vec3 blend)
{
	return min(base + blend, vec3(1.0));
}

vec3 blendAdd(vec3 base, vec3 blend, float opacity)
{
	return (blendAdd(base, blend) * opacity + base * (1.0 - opacity));
}

void main()
{
    // Vertex position
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = modelPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    vec3 normalizedPosition = normalize(position);

    /**
     * Sky and atmosphere
     */
    // Horizon intensity (1 at horizon, 0 at zenith)
    float horizonIntensity = (uv.y - 0.5) / uAtmosphereElevation;
    horizonIntensity = pow(1.0 - horizonIntensity, uAtmospherePower);

    // separate day night factors for more realistic mixing (mainly at horizon)
    float dayFactor = max(cos(uDayCycleProgress * 2.0 * M_PI), 0.);
    dayFactor = smoothstep(0.0, 0.35, dayFactor);
    float nightFactor = -1. * min(cos(uDayCycleProgress * 2.0 * M_PI), 0.);
    // hasten the nightFactor by smoothstep
    nightFactor = smoothstep(0.0, 0.5, nightFactor);

    vec3 colorDay = mix(uColorDayCycleHigh, uColorDayCycleLow, horizonIntensity);
    vec3 colorNight = mix(uColorNightHigh, uColorNightLow, horizonIntensity);
    
    // Sun Angle: 0 directly facing sun, PI directly opposite sun
    float sunAngle = acos(dot(normalize(uSunPosition), normalizedPosition));
    // Dawn angle intensity: 1 when facing the sun, 0 when facing away
    float sunAngleIntensity = exp(-sunAngle * 0.66) ;
    
    // my ideal dawn colors
    vec3 colorDawn = mix(vec3(0.85, 0.84, 0.80), vec3(0.96, 0.62, 0.30), remapClamp(horizonIntensity, 0.5, 1.0, 0.0, 1.0));
    colorDawn = mix(vec3(0.60, 0.60, 0.89), colorDawn, remapClamp(horizonIntensity, 0.0, 0.5, 0.0, 1.0));
    // Reduce light intensity over to the opposite side of the sun
    colorDawn = mix(colorDawn * (sunAngleIntensity * 0.5 + 0.5), colorDawn, dayFactor);

    // Final base sky color mix
    vec3 color = mix(colorDawn, colorDay, dayFactor);
    color = mix(color, colorNight, nightFactor);

    /**
     * TODO: review usage for the fragment shader
     */
    // Final dawn intensity and color
    float dawnIntensity = clamp(sunAngleIntensity * getDawnCycleIntensity(), 0.0, 1.0);
    vDawnIntensity = dawnIntensity;

    /**
     * Sun glow
     */
    // Distance to sun
    float distanceToSun = distance(normalizedPosition, uSunPosition);
    float sunIntensity = smoothstep(0.0, 1.0, clamp(1.0 - distanceToSun / uSunAmplitude, 0.0, 1.0)) * uSunMultiplier;
    vec3 colorSun = mix(uColorSun, uColorDawn, 1. - dayFactor); // sun color needs to stay uColorDawn after sunset
    color = blendAdd(color, colorSun, sunIntensity * exp(-nightFactor * 5.));

    float sunGlowStrength = pow(max(0.0, 1.0 + 0.05 - distanceToSun * 2.5), 2.0) * exp(-nightFactor * 10.);
    color = blendAdd(color, vec3(1.00, 0.94, 0.67), sunGlowStrength);

    vColor = vec3(color);
}