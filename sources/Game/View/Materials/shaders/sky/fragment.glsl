uniform sampler3D uNoise3D;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform float uDayCycleProgress;
uniform vec3 uColorDawn;

varying vec3 vWorldPosition;
varying vec3 vColor;
varying float vDawnIntensity;

#define MAX_STEPS         150   // at least 120 steps to not see significant banding artifacts
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
#define THRES_OFFSET      0.12   // range over which clouds fade into sky near horizon
#define CLOUD_WHITE       vec3(1.0, 1.0, 1.0)
#define CLOUD_SHADOW      vec3(0.55, 0.57, 0.68)  // blue-grey colour for unlit cloud undersides

void main()
{
    // gl_FragColor = vec4(vColor, 1.0);
    // return;

    // --- Reconstruct world-space ray direction from vertex position ---
    vec3 rayDir    = normalize(vWorldPosition);
    vec3 rayOrigin = uCameraPosition;

    vec3 skyColor   = vColor;
    float mixFactor = abs(uDayCycleProgress - 0.5) * 1.5 + 0.25;
    vec3 mixedCloud = mix(CLOUD_WHITE, uColorDawn, vDawnIntensity * 0.3);
    vec3 cloudWhite = mix(skyColor, mixedCloud, mixFactor);
    vec3 mixedShadow = mix(CLOUD_SHADOW, uColorDawn * 1.2, vDawnIntensity);
    vec3 cloudShadow = mix(skyColor, mixedShadow, mixFactor);
    vec3 cloudColor = mix(skyColor, cloudWhite, smoothstep(M_THRES, M_THRES + THRES_OFFSET, rayDir.y)); // clouds merge with skycolor(fog effect) near the horizon
    vec3 cloudShade = mix(skyColor, cloudShadow, smoothstep(M_THRES, M_THRES + THRES_OFFSET, rayDir.y)); // cloud shadows also fade into sky near horizon
    
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
