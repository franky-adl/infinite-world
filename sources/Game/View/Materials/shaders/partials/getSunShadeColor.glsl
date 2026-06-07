vec3 getSunShadeColor(vec3 baseColor, float sunShade)
{
    float dawnIntensity = getDawnCycleIntensity();
    vec3 shadeMult = mix(vec3(0.0, 0.5, 0.7), vec3(0.95, 0.65, 0.0), dawnIntensity);
    vec3 shadeColor = baseColor * shadeMult;
    return mix(baseColor, shadeColor, sunShade);
}