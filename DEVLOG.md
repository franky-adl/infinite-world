## Making of the Sky Shader(Volumetric Clouds)

- The first step is to create a 3D noise texture, for now simply perlin, but ideally we should use perlin-worley hybrid noise for more realistic cloud shapes.
- Next in the sky shader, we need to raymarch through the noise texture to find cloud density along the ray, and apply lighting to it.
- To obtain the ray direction in world space, you need to understand how the projection matrix works, and how to reverse it. By sampling the current point in NDC space, (z=-1 meaning on the frustum near plane), and applying the inverse projection matrix, you can get the corresponding point in view space. Then by applying the camera world matrix (or the inverse of the view matrix), you can get the ray direction in world space.
