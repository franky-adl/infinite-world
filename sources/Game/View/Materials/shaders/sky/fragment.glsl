uniform sampler3D uNoise3D;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uCameraWorldMatrix;

varying vec2 vUv;

#define MAX_STEPS         120   // at least 120 steps to not see significant banding artifacts
#define MIN_STEPS         8
#define MAX_DISTANCE      500.0
#define CLOUD_BOTTOM      100.0
#define CLOUD_TOP         250.0
#define CLOUD_THICKNESS   (CLOUD_TOP - CLOUD_BOTTOM)
#define UP_STEPS          30
#define LIGHT_STEP_SIZE   1.0   // world-units per upward light sample (4 steps spans full slab)
#define DENSITY_THRESHOLD 0.01
#define MAX_OPTICAL_DEPTH 60.0  // for early raymarch break; higher values → fewer early breaks but more potential overdraw
#define CLOUD_SCALE       500.0
#define ABSORPTION        0.05   // controls how quickly optical depth saturates to white
#define LIGHT_ABSORPTION  0.02   // absorption for upward light rays (stronger → darker undersides)
#define CLOUD_SPEED       15.0  // world-units per millisecond scrolled in x
#define M_THRES           0.01  // ray y-threshold: below this blends fully into sky, raymarching skipped
#define THRES_OFFSET      0.1   // range over which clouds fade into sky near horizon
#define SKY_BLUE          vec3(0.2, 0.2, 0.8)
#define CLOUD_WHITE       vec3(1.0, 1.0, 1.0)
#define CLOUD_SHADOW      vec3(0.55, 0.57, 0.68)  // blue-grey colour for unlit cloud undersides
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
    vec3 cloudShade = mix(skyColor, CLOUD_SHADOW, smoothstep(M_THRES, M_THRES + THRES_OFFSET, rayDir.y)); // cloud shadows also fade into sky near horizon
    
    // --- Intersect ray with horizontal cloud-layer slab ---
    float t_enter, t_exit;

    // adjust the threshold if needed
    if (rayDir.y < M_THRES) {
        gl_FragColor = vec4(skyColor, 1.0);
        return;
    } else {
        float t0 = (CLOUD_BOTTOM - rayOrigin.y) / rayDir.y;
        float t1 = (CLOUD_TOP    - rayOrigin.y) / rayDir.y;
        t_enter  = min(t0, t1);
        t_exit   = max(t0, t1);

        // Clamp: don't march behind the camera
        t_enter = max(t_enter, 0.0);

        // Ray misses the slab entirely
        if (t_exit <= 0.0 || t_enter >= t_exit) {
            gl_FragColor = vec4(skyColor, 1.0);
            return;
        }
    }

    // --- Raymarch through the cloud slab (max MAX_STEPS iterations) ---
    // Fewer steps near the horizon: distant clouds need less detail and are cheaper to approximate.
    int   steps       = max(MIN_STEPS, int(float(MAX_STEPS) * smoothstep(M_THRES, 0.2, rayDir.y)));
    float stepSize    = (t_exit - t_enter) / float(steps);
    float opticalDepth = 0.0;
    // This calculates how much light passes from sky to the bottommost layer of cloud
    float vertTransmittance     = 1.0;  // by default is fully transmitting
    float accDist = 0.0;

    for (int i = 0; i < steps; i++) {
        if (opticalDepth > MAX_OPTICAL_DEPTH) break; // early break for perf optimisation when ray is already very opaque
        accDist += stepSize;
        if (accDist > MAX_DISTANCE) break; // early break for perf optimisation

        vec3 samplePos = rayOrigin + (t_enter + float(i) * stepSize) * rayDir;
        float normY   = (samplePos.y - CLOUD_BOTTOM) / CLOUD_THICKNESS;
        float scroll  = uTime * CLOUD_SPEED;
        vec3  uvw     = vec3((samplePos.x + scroll) / CLOUD_SCALE, normY, (samplePos.z + scroll * 0.3) / CLOUD_SCALE);
        float density = texture(uNoise3D, uvw).r;
        if (density > DENSITY_THRESHOLD) {
            opticalDepth += density * stepSize;
        }

        // only do shade calculation for the first level (performance optimization + makes more sense to shade at the bottommost layer)
        if (i == 0) {
            // Cheap upward light march (toward the sky)
            // how much cloud density blocks sunlight before reaching this point.
            float accDensity = 0.0;
            for (int j = 1; j <= UP_STEPS; j++)
            {
                float lPosY = samplePos.y + float(j) * LIGHT_STEP_SIZE;
                float lnormY = (lPosY - CLOUD_BOTTOM) / CLOUD_THICKNESS;
                vec3  luvw   = vec3(uvw.x, lnormY, uvw.z);
                accDensity += texture(uNoise3D, luvw).g;
            }
            // Same Beer's law applied
            vertTransmittance = exp(-LIGHT_ABSORPTION * accDensity);
        }
    }

    // Beer's law: transmittance = exp(-absorption * opticalDepth)
    // 0 optical depth → fully transparent (sky color), high optical depth → fully opaque (cloud color)
    float transmittance = exp(-ABSORPTION * opticalDepth);

    vec3  shadedCloud = mix(cloudShade, cloudColor, vertTransmittance);
    vec3  color       = mix(shadedCloud, skyColor, transmittance);

    gl_FragColor = vec4(color, 1.0);
}
