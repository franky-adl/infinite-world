#define M_PI 3.1415926535897932384626433832795

uniform vec3 uSunPosition;
uniform vec3 uMoonPosition;

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
varying vec3 vCloudBody;
varying vec3 vCloudShadow;
varying vec3 vWorldPosition;
varying vec3 vSunColor;

#define SUN_COLOR         vec3(1.0, 1.0, 1.0)
#define SUN_DAWN          vec3(1.0, 0.8, 0.1)
#define CLOUD_WHITE       vec3(1.0, 1.0, 1.0)
#define CLOUD_SHADOW      vec3(0.55, 0.57, 0.68)  // blue-grey colour for unlit cloud undersides
#define CLOUD_PREDAWN_CLR vec3(0.99, 0.93, 0.51) // warm light yellow for clouds before dawn
#define CLOUD_PREDAWN_SHA vec3(1.0, 0.3, 0.0)   // warm red for cloud shadows before dawn
#define CLOUD_DAWN_COLOR  vec3(0.47, 0.25, 0.34)  // warm orange for dawn clouds
#define CLOUD_DAWN_SHADE  vec3(0.96, 0.62, 0.30)  // warm orange for dawn clouds
#define CLOUD_NIGHT_COLOR vec3(0.06, 0.06, 0.08)  // near black for NIGHT clouds
#define CLOUD_NIGHT_SHADE vec3(0.02, 0.02, 0.02)  // near black for NIGHT clouds
#define CLOUD_LIGHT_COEF  vec3(0.1, 0.15, 0.55) 

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
    float sunDawnFactor = smoothstep(0.0, 0.15, dayFactor);
    dayFactor = smoothstep(0.0, 0.35, dayFactor);
    float nightFactor = -1. * min(cos(uDayCycleProgress * 2.0 * M_PI), 0.);
    float postDawnFactor = smoothstep(0.0, 0.35, nightFactor);
    float moonFactor = smoothstep(0.15, 1.0, nightFactor);
    // hasten the nightFactor by smoothstep
    nightFactor = smoothstep(0.0, 0.5, nightFactor);

    vec3 colorDay = mix(uColorDayCycleHigh, uColorDayCycleLow, horizonIntensity);
    vec3 colorNight = mix(uColorNightHigh, uColorNightLow, horizonIntensity);
    
    // Sun Angle: 0 directly facing sun, PI directly opposite sun
    float sunAngle = acos(dot(normalize(uSunPosition), normalizedPosition));
    // Dawn angle intensity: 1 when facing the sun, 0 when facing away
    float sunAngleIntensity = exp(-sunAngle * 0.66);
    // use a slower varying intensity for the clouds
    float cSunAngleIntensity = exp(-sunAngle * 0.5);
    
    // my ideal dawn colors
    vec3 colorDawn = mix(vec3(0.85, 0.84, 0.80), vec3(0.96, 0.62, 0.30), remapClamp(horizonIntensity, 0.5, 1.0, 0.0, 1.0));
    colorDawn = mix(vec3(0.60, 0.60, 0.89), colorDawn, remapClamp(horizonIntensity, 0.0, 0.5, 0.0, 1.0));
    // Reduce light intensity and redness over to the opposite side of the sun
    vec3 lightCoef = vec3(0.1, 0.15, 0.55);
    colorDawn = mix(colorDawn * mix(lightCoef, vec3(1.), sunAngleIntensity), colorDawn, dayFactor);

    // Final base sky color mix
    vec3 color = mix(colorDawn, colorDay, dayFactor);
    color = mix(color, colorNight, nightFactor);

    /**
     * Sun glow
     */
    // Distance to sun
    float distanceToSun = distance(normalizedPosition, uSunPosition);
    float sunIntensity = smoothstep(0.0, 1.0, clamp(1.0 - distanceToSun / uSunAmplitude, 0.0, 1.0)) * uSunMultiplier;
    vec3 colorSun = mix(uColorSun, uColorDawn, 1. - dayFactor); // sun color needs to stay uColorDawn after sunset
    color = blendAdd(color, colorSun, sunIntensity * exp(-nightFactor * 5.));

    float sunGlowStrength = pow(max(0.0, 1.05 - distanceToSun * 2.5), 2.0) * dayFactor;
    color = blendAdd(color, vec3(1.00, 0.94, 0.67), sunGlowStrength);

    /**
     * Moon glow
     */
    // Distance to moon
    float distanceToMoon = distance(normalizedPosition, uMoonPosition);
    float moonGlowStrength = pow(max(0.0, 1.05 - distanceToMoon * 1.5), 2.0) * moonFactor;
    color = blendAdd(color, vec3(0.6, 0.7, 0.87), moonGlowStrength);

    /**
     * Color Varyings for the fragment shader
     */
    vColor = vec3(color);

    // sun color
    vSunColor = mix(SUN_DAWN, SUN_COLOR, sunDawnFactor);

    // cloud colors (dawn color introduced for clouds as well, modulated by sun intensity so it only affects clouds near the sun)
    vCloudBody = mix(CLOUD_PREDAWN_CLR, CLOUD_WHITE, dayFactor);
    vCloudBody = mix(vCloudBody, CLOUD_DAWN_COLOR, postDawnFactor);
    vCloudBody = mix(vCloudBody * mix(CLOUD_LIGHT_COEF, vec3(1.), cSunAngleIntensity), vCloudBody, dayFactor);
    vCloudBody = mix(vCloudBody, CLOUD_NIGHT_COLOR, nightFactor);
    vCloudShadow = mix(CLOUD_PREDAWN_SHA, CLOUD_SHADOW, dayFactor);
    vCloudShadow = mix(vCloudShadow, CLOUD_DAWN_SHADE, postDawnFactor);
    vCloudShadow = mix(vCloudShadow * mix(CLOUD_LIGHT_COEF, vec3(1.), cSunAngleIntensity), vCloudShadow, dayFactor);
    vCloudShadow = mix(vCloudShadow, CLOUD_NIGHT_SHADE, nightFactor);
}