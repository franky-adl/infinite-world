## Making of the Sky Shader(Volumetric Clouds)

- The first step is to create a 3D noise texture, following what most devs do for clouds thus using perlin worley noise.
- Next in the sky shader, we need to raymarch through the noise texture to find cloud density along the ray, and apply lighting(color) to it.
- To obtain the ray direction in world space, you need to understand how the projection matrix works, and how to reverse it. By sampling the current point in NDC space, (z=-1 meaning on the frustum near plane), and applying the inverse projection matrix, you can get the corresponding point in view space. Then by applying the camera world matrix (or the inverse of the view matrix), you can get the ray direction in world space.
- Initially I sampled both cloud coverage and density, generated from different noises. The coverage helps control the positions of the clouds, while density controls more of the cloud shape. Now I simply multiplied the 2 together to get the final density, saving one extra texture sample in the raymarching loop.
- Previously there are some repeating small white ellipses at the i=0 layer after I implemented the upward light march, spent quite a bit of time couldn't figure out why exactly. I thought it was because there were coincidentally some empty columns in the 3D noise texture, causing the vertical transmittance to be 1 and thus resulting in those very noticeable bright spots. Luckily after tweaking with the coverage noise a bit, the artifacts were gone.

### (Re)adding day cycle colors to the sky + clouds

- I was using a full screen quad to render the sky, but now I need to reintroduce the sky colors from Bruno's vertex shader, so I switched back to using a sphere, and turns out the ray direction calculation now is much simpler.
- the vDawnIntensity calculated from the vertex shader is useful for mixing the cloud colors with the dawn color during sunrise/sunset.

### Fixing the stretched clouds issue

- After adding the axesHelper, the clouds look stretched in the z axis in particular and initially I had no idea
- Then I looked into the player camera to understand it completely, and confirmed that the raymarching vectors are correctly calculated, I suspected something wrong with the texture
- Looking further into how the 3D noise texture should be correctly sampled, I realized I've mixed up the one of the axis. Initially I thought the worldspace y-axis is the same as in the v in uvw of the texture space, but that was kinda wrong. There isn't a single correct answer in how you map the axes, but you need to know what you're doing to map them correctly for you.
- So I treated the depth(W) axis in the 3D texture as the worldspace y-axis and renamed variables to make this clear, such that in the raymarching, I need to put the normalized y value in the w slot to correctly sample the texture. This way, the stretching issue is resolved and the clouds look normal again.

### Adding more dramatic dawn colors to the grass and terrain

- For a start, I introduced the dayProgress uniform to the grass and tweaked the getSunReflectionColor function to mix in more golden/dawny colors. But I recognized that it's relying too much of the sun reflection strength like the surface is shiny, but in reality the grass is more like a rough surface, so I should also see the golden colors even if my camera isn't facing the sun.
- So I updated the getSunShadeColor function to also mix in the dawn colors, such that the grass+terrain get more of a red tint during dawn/dusk.
- I also adjusted the fresnelScale to be higher during dawn, and by that I skipped the original uFresnelScale uniform. Could remove later if confirmed not needed.
- Note that the sky colors now a bit too red/pink compared to the terrain, which I need to adjust later on. But I'm content with the terrain dawn colors for now.

### Fine tuning the sky colors

- Currently there are several issues:
-   1. sky color is too bright around the sun during sunset
-   2. dayCycleLow should be a bit more darker during sunset, but only at the other end of the horizon, not the whole horizon
-   3. The afterglow session is weird, the sky should darken more significantly after sun is down but right now the afterglow is way too bright and the colors don't look right(should be a darkened orange/red)
- New approach for solving above issues:
-   1. Infuse your ideal dawn colors into the colorHigh -> low transitions
       a. When noon, just simple colorHigh -> low
       b. when dawn, apply the 3 colors transition + lower brightness opposite the sun (using sunAngleIntensity: derived from angle from vertex to sun [0..PI])
       c. when night, just simple colorHigh -> low
    2. Then just blendAdd your sun glow, no need extra step for dawn colors adjusting
- I've also added remapClamp function to fix the issue of the previous remap function that produces weird out of bounds colors when mixing.
- Initially I thought the hexcode of the uColorDawn is the same in the fragment shader, but I was wrong: With ColorManagement.enabled = true set (recommended), certain conversions are made automatically. Because hexadecimal and CSS colors are generally sRGB, Color methods will automatically convert these inputs from sRGB to Linear-sRGB in setters, or convert from Linear-sRGB to sRGB when returning hexadecimal or CSS output from getters.
- Also for optimization purposes, I moved the cloud color mixing mostly to the vertex shader.

### Making the grass feel more alive

- Main reference comes from SimonDev's thread on X: https://x.com/iced_coffee_dev/status/2062582405269991638
- Main idea is that the movements comes from smaller individual rustles and the bigger gusts of wind causing the whole patch of grass to sway. And you can use the same noise texture for both, just with different UV scales and time speeds.

### Useful References

- SimonDev on "How Big Budget AAA Games Render Clouds" [https://www.youtube.com/watch?v=Qj_tK_mdRcA]
- uHawk on "Rendering volumetric clouds using signed distance fields" [https://blog.uhawkvr.com/rendering/rendering-volumetric-clouds-using-signed-distance-fields/]
- Frostbite's paper on "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite" [https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf]
- Fellow Threejser on "Efficient volumetric clouds" [https://discourse.threejs.org/t/efficient-volumetric-clouds/66067]
- Shadertoy "Tileable Perlin-Worley 3D" [https://www.shadertoy.com/view/3dVXDc]
