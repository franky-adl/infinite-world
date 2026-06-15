float getSunShade(vec3 normal)
{
    // max when normal faces away from sun
    float sunShade = dot(normal, - uSunPosition);
    float nightFactor = -1. * min(cos(uDayCycleProgress * 2.0 * M_PI), 0.);
    nightFactor = smoothstep(0.0, 0.2, nightFactor);
    // adjust to make terrain look less bright at night
    float adjustment = mix(0., 0.3, nightFactor);
    
    return sunShade * (0.5 - adjustment) + 0.5 + adjustment;
}