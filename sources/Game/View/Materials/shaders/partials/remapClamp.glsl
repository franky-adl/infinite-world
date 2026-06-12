float remapClamp(float v, float inMin, float inMax, float outMin, float outMax)
{
    float t = clamp(inverseLerp(v, inMin, inMax), 0.0, 1.0);
    return mix(outMin, outMax, t);
}