# Blender Plate Pipeline

This directory is a source-only render pipeline for exercise plates. It produces no plate until a human rig and each pose have passed manual review. No source watermarked reference art was copied, traced, or used as a texture in this pipeline.

## License-safe source policy

Use Blender 5.2 or later and a manually reviewed MakeHuman character with the MakeHuman Plug-in For Blender (MPFB). Do not add stock models, stock textures, marketplace assets, reference images, logos, or other commercial assets. The script creates its equipment and studio from Blender primitives.

Official sources:

- MakeHuman download: <https://www.makehumancommunity.org/content/downloads.html>
- MakeHuman license and asset licensing: <https://www.makehumancommunity.org/content/license.html>
- MakeHuman FAQ, including generated-character rights: <https://static.makehumancommunity.org/faq.html>
- MPFB project and documentation: <https://static.makehumancommunity.org/mpfb.html>
- MPFB source license: <https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md>
- CC0 1.0 Universal legal code: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>

The relevant MakeHuman asset license is **CC0 1.0 Universal (CC0 1.0) Public Domain Dedication**. CC0 states: "No Copyright. The person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide under copyright law, including all related and neighboring rights, to the extent allowed by law." Verify the applicable current MakeHuman and MPFB license pages above before each asset intake. MakeHuman software and MPFB may have their own software licenses; this pipeline relies on the documented CC0 status of the generated character/assets, not an assumption that all software code is CC0.

## Setup

1. Install Blender 5.2+ from <https://www.blender.org/download/>.
2. Download MakeHuman only from its official download page and install MPFB only from its official project/documentation page.
3. In MakeHuman, create a neutral adult human with no branded clothing, no purchased textures, and no third-party add-ons. Use a plain neutral material. Export through MPFB or import with MPFB into a new Blender file.
4. In Blender, inspect the imported armature and mesh. Remove or replace any non-CC0 or uncertain material, texture, clothing, hair, and accessory. Save the reviewed source `.blend` outside deployable web assets, for example `blender/source/reviewed-human.blend`.
5. Name the reviewed rig object, for example `MHX_RIG`. Create and manually review one action per manifest ID; actions may be named exactly as the IDs. Save that pose library with the source blend.
6. Review `data/plates.json`, then run from the project root:

   ```bash
   blender -b blender/source/reviewed-human.blend --python blender/scripts/render_plates.py -- --rig-object MHX_RIG --id s1-deadlift
   ```

   Use `--all` only after all 46 reviewed actions exist. The script intentionally exits before rendering if `--rig-object` is not supplied or does not identify an armature.

## Manual review gates

1. **Provenance gate:** record MakeHuman/MPFB versions, source URLs, license check date, and any retained asset identifiers in `assets/plates/ATTRIBUTION.md`.
2. **Rig gate:** confirm the imported character is neutral, rigged, free of watermarks/branding, and contains only allowed CC0/original content.
3. **Pose gate:** a qualified reviewer checks every action against its manifest context and guide targets. Targets are display metadata, not anatomical, medical, safety, or doctrine claims.
4. **Frame gate:** check camera framing, occlusion, hand/equipment contact, floor intersections, left/right orientation, and that no pose overstates a movement instruction.
5. **Delivery gate:** inspect WebP and PNG at target size, complete the per-plate record, and deploy raster outputs only. Never deploy the source `.blend`, MakeHuman files, pose library, or working textures.

The manifest describes requested visual context, not a substitute for movement instruction or a claim that an unreviewed pose is correct.
