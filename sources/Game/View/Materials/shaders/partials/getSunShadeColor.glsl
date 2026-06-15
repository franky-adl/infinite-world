vec3 getSunShadeColor(vec3 baseColor, float sunShade)
{
    vec3 shadeMult = vec3(0.1, 0.1, 0.2);
    vec3 shadeColor = baseColor * shadeMult;
    return mix(baseColor, shadeColor, sunShade);
}