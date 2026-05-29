## Making of the Sky Shader(Volumetric Clouds)

- The first step is to create a 3D noise texture, for now simply perlin, but ideally we should use perlin-worley hybrid noise for more realistic cloud shapes.
- Next in the sky shader, we need to raymarch through the noise texture to find cloud density along the ray, and apply lighting to it.
- To obtain the ray direction in world space, you need to understand how the projection matrix works, and how to reverse it. By sampling the current point in NDC space, (z=-1 meaning on the frustum near plane), and applying the inverse projection matrix, you can get the corresponding point in view space. Then by applying the camera world matrix (or the inverse of the view matrix), you can get the ray direction in world space.

### Useful References

- SimonDev on "How Big Budget AAA Games Render Clouds" [https://www.youtube.com/watch?v=Qj_tK_mdRcA]
- uHawk on "Rendering volumetric clouds using signed distance fields" [https://blog.uhawkvr.com/rendering/rendering-volumetric-clouds-using-signed-distance-fields/]
- Frostbite's paper on "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite" [https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf]
- Fellow Threejser on "Efficient volumetric clouds" [https://discourse.threejs.org/t/efficient-volumetric-clouds/66067]
- Shadertoy "Tileable Perlin-Worley 3D" [https://www.shadertoy.com/view/3dVXDc]
