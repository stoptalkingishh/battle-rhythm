#!/usr/bin/env python3
"""Render exercise plates for Battle Rhythm from a reviewed CC0 rig.

Run inside Blender:
  blender -b blender/source/reviewed-human.blend --python blender/scripts/render_plates.py -- --rig-object MHX_RIG --id s1-deadlift
  blender -b blender/source/reviewed-human.blend --python blender/scripts/render_plates.py -- --rig-object MHX_RIG --all

The manifest is blender/data/plates.json. This script is a scaffold for an
original, license-safe pipeline: it builds the studio, cameras, lighting, and
primitive props procedurally, and it will NOT render a figure unless a reviewed
rig object is supplied. Outputs are written to assets/plates/webp and
assets/plates/png. Never deploy source .blend files or working assets.
"""

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

PROJECT_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
)
MANIFEST_PATH = os.path.join(PROJECT_ROOT, "blender", "data", "plates.json")
DEFAULT_OUTPUT_ROOT = os.path.join(PROJECT_ROOT, "assets", "plates")

RESOLUTION_X = 1024
RESOLUTION_Y = 1536  # portrait, web-optimized plate

# MPFB's standard rig maps these broad review regions to its skin weights.
# They are a visual draft aid only: every mask needs an anatomy review before
# it can be delivered as a target-muscle plate.
TARGET_GROUPS = {
    "biceps": ("upperarm01", "upperarm02", "lowerarm01"),
    "calves": ("lowerleg01", "lowerleg02"),
    "chest": ("breast", "clavicle"),
    "core": ("pelvis", "spine01", "spine02", "spine03"),
    "glutes": ("pelvis",),
    "grip": ("lowerarm02", "wrist", "finger"),
    "hamstrings": ("upperleg01", "upperleg02"),
    "hip-flexors": ("pelvis", "upperleg01"),
    "lower-back": ("spine01", "spine02", "spine03", "spine04"),
    "obliques": ("spine01", "spine02", "spine03"),
    "quads": ("upperleg01", "upperleg02"),
    "shoulders": ("clavicle", "shoulder01", "upperarm01"),
    "triceps": ("upperarm01", "upperarm02", "lowerarm01"),
    "upper-back": ("spine03", "spine04", "spine05", "clavicle"),
}


def fail(message):
    print("[plates] ERROR: %s" % message, file=sys.stderr)
    raise SystemExit(1)


def load_manifest():
    if not os.path.exists(MANIFEST_PATH):
        fail("manifest not found: %s" % MANIFEST_PATH)
    with open(MANIFEST_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    plates = data.get("plates", [])
    if not isinstance(plates, list) or len(plates) != 46:
        fail("manifest must contain exactly 46 plates, found %d" % len(plates))
    ids = [p["id"] for p in plates]
    if len(set(ids)) != len(ids):
        fail("manifest contains duplicate plate ids")
    return plates


def find_rig(rig_name):
    if not rig_name:
        fail(
            "no --rig-object supplied. A reviewed CC0 rig must be imported "
            "(see blender/README.md) before any human pose can render. "
            "Refusing to render an automated pose from primitives."
        )
    obj = bpy.data.objects.get(rig_name)
    if obj is None or obj.type != "ARMATURE":
        fail(
            "--rig-object '%s' is not an armature in this blend. Import the "
            "reviewed MakeHuman/MPFB rig and name it exactly (e.g. MHX_RIG)." % rig_name
        )
    return obj


def clear_scene(preserve=None):
    """Remove all scene objects except the reviewed rig (and its collection)."""
    preserve_ids = set()
    if preserve is not None:
        preserve_ids.add(preserve.name)
        preserve_ids.update(o.name for o in preserve.children_recursive)
    for obj in list(bpy.data.objects):
        if obj.name in preserve_ids:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def add_ground():
    bpy.ops.mesh.primitive_plane_add(size=40.0, location=(0, 0, 0))
    mat = bpy.data.materials.new("PlateFloor")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.06, 0.06, 0.06, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
    plane = bpy.context.object
    plane.name = "PlateFloor"
    plane.data.materials.append(mat)


def add_studio_lighting():
    target = (0.0, 0.0, 1.15)
    bpy.ops.object.select_all(action="DESELECT")
    key = bpy.data.lights.new("PlateKeyLight", "AREA")
    key.energy = 800.0
    key.size = 4.0
    key_obj = bpy.data.objects.new("PlateKeyLight", key)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = (-5.0, -5.0, 6.0)
    aim_at(key_obj, target)

    fill = bpy.data.lights.new("PlateFillLight", "AREA")
    fill.energy = 320.0
    fill.size = 6.0
    fill_obj = bpy.data.objects.new("PlateFillLight", fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (5.0, 4.0, 3.0)
    aim_at(fill_obj, target)


def aim_at(obj, target):
    direction = (Vector(target) - obj.location).normalized()
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(view):
    cam = bpy.data.cameras.new("PlateCamera")
    cam.lens = 70
    cam.shift_y = -0.13
    cam_obj = bpy.data.objects.new("PlateCamera", cam)
    bpy.context.collection.objects.link(cam_obj)
    aim = (0.0, 0.0, 1.15)
    if view == "front":
        cam_obj.location = (0.0, -6.0, 1.35)
    elif view == "back":
        cam_obj.location = (0.0, 6.0, 1.35)
    else:
        cam_obj.location = (-5.0, -4.5, 1.3)
    aim_at(cam_obj, aim)
    bpy.context.scene.camera = cam_obj


def set_engine():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RESOLUTION_X
    scene.render.resolution_y = RESOLUTION_Y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.015, 0.015, 0.015)


# --- Original primitive props (no external assets) ---------------------------


def _bare_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.4
    return mat


def apply_target_overlay(rig, plate):
    prefixes = []
    for target in plate.get("targetMuscles", []):
        prefixes.extend(TARGET_GROUPS.get(target, ()))
    if not prefixes:
        return

    neutral = _bare_material("PlateNeutralSkin", (0.42, 0.37, 0.31))
    gold = _bare_material("PlateTargetGold", (0.83, 0.62, 0.16))
    for obj in rig.children_recursive:
        if obj.type != "MESH":
            continue
        target_groups = {
            group.index for group in obj.vertex_groups
            if any(group.name.startswith(prefix) for prefix in prefixes)
        }
        if not target_groups:
            continue
        obj.data.materials.clear()
        obj.data.materials.append(neutral)
        obj.data.materials.append(gold)
        for polygon in obj.data.polygons:
            target_vertices = sum(
                any(weight.group in target_groups and weight.weight >= 0.25 for weight in obj.data.vertices[index].groups)
                for index in polygon.vertices
            )
            polygon.material_index = 1 if target_vertices * 2 >= len(polygon.vertices) else 0


def _bare_cylinder(name, radius, depth, location, rotation=(0, 0, 0), color=(0.5, 0.5, 0.5)):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(_bare_material(name + "Mat", color))
    return obj


def add_barbell(location=(0, -0.25, 0.17)):
    bar = _bare_cylinder(
        "PlateBarbell", 0.035, 2.2, location,
        rotation=(0, 1.5708, 0), color=(0.55, 0.55, 0.58)
    )
    for side in (-0.95, 0.95):
        _bare_cylinder(
            "PlateWeight", 0.16, 0.10, (side, 0, bar.location.z),
            rotation=(0, 1.5708, 0), color=(0.25, 0.25, 0.27)
        )
    return bar


def add_bench(location=(0, 0, 0.45)):
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0, 0, 0.5))
    top = bpy.context.object
    top.name = "PlateBenchTop"
    top.scale = (0.55, 1.8, 0.12)
    top.data.materials.append(_bare_material("PlateBenchTopMat", (0.12, 0.12, 0.14)))
    for x, z in ((0.2, 0.08), (-0.2, 0.08)):
        _bare_cylinder("PlateBenchLeg", 0.03, 0.16, (x, 0, z), color=(0.5, 0.5, 0.5))
    return top


def add_kettlebell(location=(0, 0, 0.1)):
    ball = _bare_cylinder("PlateKettleBellBody", 0.22, 0.30, (0, 0, 0.2), color=(0.2, 0.2, 0.22))
    bpy.ops.mesh.primitive_torus_add(
        location=(0, 0, 0.55), major_radius=0.10, minor_radius=0.035
    )
    handle = bpy.context.object
    handle.name = "PlateKettleBellHandle"
    handle.rotation_euler = (1.5708, 0, 0)
    handle.data.materials.append(_bare_material("PlateKettleBellHandleMat", (0.2, 0.2, 0.22)))
    return ball


def add_sled(location=(0, 0, 0)):
    _bare_cylinder("PlateSledPole", 0.05, 2.6, (0, 0.3, 0.6), rotation=(1.5708, 0, 0), color=(0.5, 0.5, 0.5))
    for x in (-0.25, 0.25):
        _bare_cylinder("PlateSledLeg", 0.08, 0.06, (x, -0.15, 0.03), color=(0.4, 0.4, 0.42))


def add_ruck(location=(0, 0, 0.5)):
    bpy.ops.mesh.primitive_cube_add(size=0.4, location=(0, 0, 0.55))
    pack = bpy.context.object
    pack.name = "PlateRuck"
    pack.scale = (1.0, 0.7, 1.4)
    pack.data.materials.append(_bare_material("PlateRuckMat", (0.35, 0.33, 0.28)))


def add_pullup_bar(location=(0, 0, 2.4)):
    _bare_cylinder("PlatePullUpBar", 0.04, 1.4, location, color=(0.5, 0.5, 0.5))


def add_lane_markers():
    for i in range(4):
        _bare_cylinder("PlateLaneMarker", 0.05, 0.2, (0, 0.5 + i * 0.8, 0.1), color=(0.9, 0.55, 0.12))


PROP_BUILDERS = {
    "barbell": add_barbell,
    "bench": add_bench,
    "kettlebell": add_kettlebell,
    "sled": add_sled,
    "ruck": add_ruck,
    "pull-up-bar": add_pullup_bar,
    "lane-markers": add_lane_markers,
}


def build_props(plate):
    for prop in plate.get("props", []):
        builder = PROP_BUILDERS.get(prop)
        if builder is None:
            fail("unknown prop '%s' in manifest for %s" % (prop, plate["id"]))
        print("[plates]   prop: %s" % prop)
        builder()


def pose_action_exists(rig, plate_id):
    action = bpy.data.actions.get(plate_id)
    if action is None:
        fail(
            "no reviewed action named '%s' for plate %s. Create and review one "
            "action per manifest ID (see blender/README.md pose gate)." % (plate_id, plate_id)
        )
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = action
    bpy.context.scene.frame_set(int(action.frame_range[0]))
    return action


def render_plate(plate, rig, output_root, action_frame=None):
    out_id = plate["id"]
    print("[plates] rendering %s (%s) view=%s" % (out_id, plate["poseFamily"], plate.get("view", "both")))
    clear_scene(preserve=rig)
    add_ground()
    add_studio_lighting()
    build_props(plate)
    add_camera(plate.get("view", "front"))
    set_engine()
    bpy.ops.object.select_all(action="DESELECT")
    rig.hide_set(False)
    rig.hide_render = False
    pose_action_exists(rig, out_id)
    apply_target_overlay(rig, plate)
    if action_frame is not None:
        bpy.context.scene.frame_set(action_frame)

    webp_dir = os.path.join(output_root, "webp")
    png_dir = os.path.join(output_root, "png")
    os.makedirs(webp_dir, exist_ok=True)
    os.makedirs(png_dir, exist_ok=True)

    scene = bpy.context.scene
    scene.render.filepath = os.path.join(png_dir, out_id + ".png")
    scene.render.image_settings.file_format = "PNG"
    print("[plates]   PNG -> %s" % scene.render.filepath)
    bpy.ops.render.render(write_still=True)

    scene.render.filepath = os.path.join(webp_dir, out_id + ".webp")
    scene.render.image_settings.file_format = "WEBP"
    print("[plates]   WEBP -> %s" % scene.render.filepath)
    bpy.ops.render.render(write_still=True)


def parse_args():
    argv = sys.argv[:]
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = argv[1:]
    parser = argparse.ArgumentParser(description="Render Battle Rhythm plates")
    parser.add_argument("--rig-object", default=None, help="Name of the reviewed armature in the blend")
    parser.add_argument("--id", default=None, help="Render a single plate by exercise id")
    parser.add_argument("--all", action="store_true", help="Render every plate in the manifest")
    parser.add_argument("--frame", type=int, default=None, help="Optional action frame to render")
    parser.add_argument(
        "--output-root", default=DEFAULT_OUTPUT_ROOT,
        help="Output directory containing webp/ and png/ (use a temporary path for unreviewed renders)"
    )
    return parser.parse_args(argv)


def main():
    args = parse_args()
    if not args.id and not args.all:
        fail("supply --id <exercise-id> or --all")
    plates = load_manifest()
    rig = find_rig(args.rig_object)

    selected = plates if args.all else [p for p in plates if p["id"] == args.id]
    if not selected:
        fail("no manifest entry for id '%s'" % args.id)

    for plate in selected:
        render_plate(plate, rig, os.path.abspath(args.output_root), action_frame=args.frame)

    print("[plates] done. Review WebP/PNG per assets/plates/ATTRIBUTION.md before deploy.")


if __name__ == "__main__":
    main()
