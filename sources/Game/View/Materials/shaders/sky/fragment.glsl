uniform sampler3D uNoise3D;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uCameraWorldMatrix;

varying vec2 vUv;

#define MAX_STEPS         100
#define CLOUD_BOTTOM      50.0
#define CLOUD_TOP         200.0
#define CLOUD_THICKNESS   (CLOUD_TOP - CLOUD_BOTTOM)
#define DENSITY_THRESHOLD 0.7
#define CLOUD_SCALE       640.0
#define ABSORPTION        0.05   // controls how quickly optical depth saturates to white
#define CLOUD_SPEED       20.  // world-units per millisecond scrolled in x

void main()
{
    // --- Reconstruct world-space ray direction from screen UV ---
    vec2 ndc     = vUv * 2.0 - 1.0;
    // Transforming from NDC back to view space point at the near plane (z = -1), 
    // w has to be 1.0 to specify it as a point not vector in the homogenous coordinates 
    vec4 viewPos = uInverseProjectionMatrix * vec4(ndc, -1.0, 1.0);
    // converting from homogenous coordinates to 3D coordinates by dividing by w (not sure if really needed though)
    viewPos.xyz /= viewPos.w;
    // CameraWorld matrix turns view space into world space, same as the inverse of view matrix.
    vec3 rayDir    = normalize((uCameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
    vec3 rayOrigin = uCameraPosition;

    // --- Skip below-horizon pixels ---
    if (rayDir.y < 0.0)
    {
        gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
        return;
    }

    // --- Intersect ray with horizontal cloud-layer slab ---
    float t_enter, t_exit;

    // adjust the threshold if needed
    if (abs(rayDir.y) < 0.01)
    {
        gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
        return;
    }
    else
    {
        float t0 = (CLOUD_BOTTOM - rayOrigin.y) / rayDir.y;
        float t1 = (CLOUD_TOP    - rayOrigin.y) / rayDir.y;
        t_enter  = min(t0, t1);
        t_exit   = max(t0, t1);

        // Clamp: don't march behind the camera
        t_enter = max(t_enter, 0.0);

        // Ray misses the slab entirely
        if (t_exit <= 0.0 || t_enter >= t_exit)
        {
            gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
            return;
        }
    }

    // --- Raymarch through the cloud slab (max MAX_STEPS iterations) ---
    float stepSize    = (t_exit - t_enter) / float(MAX_STEPS);
    float opticalDepth = 0.0;

    for (int i = 0; i < MAX_STEPS; i++)
    {
        vec3 samplePos = rayOrigin + (t_enter + float(i) * stepSize) * rayDir;

        // Texture convention from Noises.js: texture(uNoise3D, vec3(x, z, y))
        // x and z tile via RepeatWrapping; y is normalised to [0, 1] within the slab
        float normY   = (samplePos.y - CLOUD_BOTTOM) / CLOUD_THICKNESS;
        float scroll  = uTime * CLOUD_SPEED;
        vec3  uvw     = vec3((samplePos.x + scroll) / CLOUD_SCALE, samplePos.z / CLOUD_SCALE, normY);
        float density = texture(uNoise3D, uvw).r;

        if (density > DENSITY_THRESHOLD)
        {
            opticalDepth += stepSize;
        }
    }

    // Beer's law: transmittance = exp(-absorption * opticalDepth)
    // 0 optical depth → fully transparent (blue), high optical depth → fully opaque (white)
    float transmittance = exp(-ABSORPTION * opticalDepth);
    vec3  blue          = vec3(0.0, 0.0, 1.0);
    vec3  white         = vec3(1.0, 1.0, 1.0);
    vec3  color         = mix(white, blue, transmittance);

    gl_FragColor = vec4(color, 1.0);
}
