## Making of the Sky Shader(Volumetric Clouds)

- The first step is to create a 3D noise texture, following what most devs do for clouds thus using perlin worley noise.
- Next in the sky shader, we need to raymarch through the noise texture to find cloud density along the ray, and apply lighting(color) to it.
- To obtain the ray direction in world space, you need to understand how the projection matrix works, and how to reverse it. By sampling the current point in NDC space, (z=-1 meaning on the frustum near plane), and applying the inverse projection matrix, you can get the corresponding point in view space. Then by applying the camera world matrix (or the inverse of the view matrix), you can get the ray direction in world space.
- Initially I sampled both cloud coverage and density, generated from different noises. The coverage helps control the positions of the clouds, while density controls more of the cloud shape. Now I simply multiplied the 2 together to get the final density, saving one extra texture sample in the raymarching loop.
- Previously there are some repeating small white ellipses at the i=0 layer after I implemented the upward light march, spent quite a bit of time couldn't figure out why exactly. I thought it was because there were coincidentally some empty columns in the 3D noise texture, causing the vertical transmittance to be 1 and thus resulting in those very noticeable bright spots. Luckily after tweaking with the coverage noise a bit, the artifacts were gone.

### (Re)adding day cycle colors to the sky + clouds

- I was using a full screen quad to render the sky, but now I need to reintroduce the sky colors from Bruno's vertex shader, so I switched back to using a sphere, and turns out the ray direction calculation now is much simpler.
- the vDawnIntensity calculated from the vertex shader is useful for mixing the cloud colors with the dawn color during sunrise/sunset.

### Useful References

- SimonDev on "How Big Budget AAA Games Render Clouds" [https://www.youtube.com/watch?v=Qj_tK_mdRcA]
- uHawk on "Rendering volumetric clouds using signed distance fields" [https://blog.uhawkvr.com/rendering/rendering-volumetric-clouds-using-signed-distance-fields/]
- Frostbite's paper on "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite" [https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf]
- Fellow Threejser on "Efficient volumetric clouds" [https://discourse.threejs.org/t/efficient-volumetric-clouds/66067]
- Shadertoy "Tileable Perlin-Worley 3D" [https://www.shadertoy.com/view/3dVXDc]
