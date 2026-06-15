// uDayCycleProgress is expected to be in the range of [0, 1], where 0 and 1 is bright day, and 0.5 is midnight
// when cycle starts at 0, phase at PI which means bottom of cos function
// when cycle is at 0.25(dusk), phase at 2PI which means top of cos function
// when cycle is at 0.5, phase at 3PI which means bottom of cos function
// when cycle is at 0.75(dawn), phase at 4PI which means top of cos function
// when cycle is at 1, phase at 5PI which means bottom of cos function again
float getDawnCycleIntensity()
{
    float intensity = cos(uDayCycleProgress * 4.0 * M_PI + M_PI) * 0.5 + 0.5;
    intensity = smoothstep(0.9, 1.0, intensity); // tune the sharpness of dawn/dusk transition
    return intensity;
}