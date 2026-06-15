float getSunMoonReflection(vec3 viewDirection, vec3 worldNormal, vec3 viewNormal)
{
    vec3 sunViewReflection = reflect(uSunPosition, viewNormal);
    vec3 moonViewReflection = reflect(uMoonPosition, viewNormal);

    float sunDot = dot(sunViewReflection, viewDirection);
    float moonDot = dot(moonViewReflection, viewDirection);

    // only start leaning into moon reflection after the sun is below horizon(to maintain nice dawn reflections)
    float nightFactor = -1. * min(cos(uDayCycleProgress * 2.0 * M_PI), 0.);
    float combinedDot = mix(sunDot, moonDot, nightFactor);
    float sunViewStrength = max(0.0, combinedDot);
    // increase fresnel effect at dawn
    float fresnelScale = mix(0.3, 1.0, getDawnCycleIntensity());
    // viewDirection points from cam to world, so fresnel maxes at grazing angles
    float fresnel = uFresnelOffset + fresnelScale * (1.0 + dot(viewDirection, worldNormal));
    float sunReflection = fresnel * sunViewStrength;
    sunReflection = pow(sunReflection, uFresnelPower);

    return sunReflection;
}