#define PI 3.141592653

uniform float uTime;
uniform sampler2D uNoiseTexture;

varying vec3 vColor;
varying vec2 vUv;
varying float vSunReflection;
varying float vFogIntensity;

void main()
{
    float noise = texture2D(uNoiseTexture, vUv * vec2(6., 3.) + uTime * 0.04).r * 2. - 1.;
    float noise2 = texture2D(uNoiseTexture, vUv * vec2(8., 3.) - vec2(uTime * 0.05, uTime * 0.04)).g * 2. - 1.;

    // float noise = sin(vUv.x * 400.0 * PI + vUv.y * 400.0 * PI + uTime * 5.) * 0.5 + 0.5;
    // noise = smoothstep(0.1, 1.0, noise * noise2);
    noise = (2. - abs(noise) - abs(noise2)) * 0.5;

    float highlightFac = mix(1.25, 1.5, vSunReflection); 
    vec3 highlightColor = clamp(vColor * highlightFac, vec3(0.0), vec3(1.0));
    vec3 color = mix(vColor, highlightColor, noise);

    // adjust opacity based on reflection
    float opacity = mix(0.7, 1.0, vSunReflection);
    
    // fog
    color = mix(color, vColor, vFogIntensity);
    
    gl_FragColor = vec4(color, opacity);
}
