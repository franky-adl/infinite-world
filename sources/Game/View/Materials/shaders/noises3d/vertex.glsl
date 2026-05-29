varying vec2 vUv;

void main()
{
    // Fullscreen quad: positions are already in [-1, 1] clip space.
    // gl_Position.z = 0 → NDC depth 0.5 — always within [0, 1], camera
    // clip planes are intentionally bypassed.
    gl_Position = vec4(position, 1.0);

    vUv = uv;
}
