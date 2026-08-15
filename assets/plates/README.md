# Plate Delivery

Each approved plate is delivered as `assets/plates/webp/<id>.webp` with `assets/plates/png/<id>.png` as the fallback. Both formats use the same reviewed framing and dimensions; WebP is the preferred web delivery format.

The application should lazy-load the WebP when its exercise card approaches the viewport, reserve image dimensions to avoid layout shift, and use the PNG only through an image fallback mechanism. Do not preload all 46 plates.

`blender/` is source tooling. Never deploy source `.blend` files, MakeHuman exports, MPFB data, pose libraries, working textures, or render caches. Deploy only reviewed raster outputs and this provenance record when required.
