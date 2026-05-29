uniform sampler3D uNoise3D;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uCameraWorldMatrix;

varying vec2 vUv;

#define MAX_STEPS         200
#define MIN_STEPS         1
#define CLOUD_BOTTOM      100.0
#define CLOUD_TOP         1000.0
#define CLOUD_THICKNESS   (CLOUD_TOP - CLOUD_BOTTOM)
#define DENSITY_THRESHOLD 0.7
#define CLOUD_SCALE       2000.0
#define ABSORPTION        0.05   // controls how quickly optical depth saturates to white
#define CLOUD_SPEED       20.  // world-units per millisecond scrolled in x
#define M_THRES           0.01  // ray y-threshold: below this blends fully into sky, raymarching skipped
#define THRES_OFFSET      0.1   // range over which clouds fade into sky near horizon
#define SKY_BLUE          vec3(0.2, 0.2, 0.8)
#define CLOUD_WHITE       vec3(1.0, 1.0, 1.0)
#define FOG_WHITE         vec3(0.92, 0.9, 0.96)

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

    vec3 skyColor   = mix(FOG_WHITE, SKY_BLUE, max(smoothstep(0., 0.4, rayDir.y), 0.)); // simple gradient sky based on ray direction
    vec3 cloudColor = mix(skyColor, CLOUD_WHITE, smoothstep(M_THRES, M_THRES + THRES_OFFSET, rayDir.y)); // clouds merge with skycolor(fog effect) near the horizon
    
    // --- Intersect ray with horizontal cloud-layer slab ---
    float t_enter, t_exit;

    // adjust the threshold if needed
    if (rayDir.y < M_THRES)
    {
        gl_FragColor = vec4(skyColor, 1.0);
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
            gl_FragColor = vec4(skyColor, 1.0);
            return;
        }
    }

    // --- Raymarch through the cloud slab (max MAX_STEPS iterations) ---
    // Fewer steps near the horizon: distant clouds need less detail and are cheaper to approximate.
    int   steps       = max(MIN_STEPS, int(float(MAX_STEPS) * smoothstep(M_THRES, 0.45, rayDir.y)));
    float stepSize    = (t_exit - t_enter) / float(steps);
    float opticalDepth = 0.0;

    for (int i = 0; i < steps; i++)
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
    vec3  color         = mix(cloudColor, skyColor, transmittance);

    gl_FragColor = vec4(color, 1.0);
}
