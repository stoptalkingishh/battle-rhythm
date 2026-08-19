#!/usr/bin/env python3
"""Generate js/data/exercises-atp.js — the full ATP 7-22.02 exercise roster.
Source is a public-domain U.S. Government publication (17 U.S.C. 105).
Each entry carries the schema used by the library/coach. This generator is a
convenience; the emitted file is committed as the source of truth.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
cat = json.load(open(os.path.join(ROOT, "assets/plates/atp/atp-catalog.json")))["figures"]
fig_name = {f["id"]: f["name"] for f in cat}

# figure id -> (id, name, component, equipment, drill, muscles, cues)
# cues are concise form cues; programming/safety supplied by chapter templates.
D = {}

def ex(rid, fig, comp, equip, drill, muscles, cues):
    D[rid] = {
        "fig": fig, "comp": comp, "equip": equip, "drill": drill,
        "muscles": muscles, "cues": cues,
    }

C = "Conditioning Drill"
CL = "Climbing Drill"
GD = "Guerilla Drill"
RUD = "Running Drill"
MMD = "Military Movement Drill"
MB = "Medicine Ball Drill"
ST = "Suspension Training Drill"
LM = "Landmine Drill"
STC = "Strength Training Circuit"
FW = "Free Weight"
SM = "Strength Machine"
RD = "Recovery Drill"

# ---- Chapter 4: Stability Drills ----
for rid,fig,musc in [
    ("atp-hsd1-lateral-leg-raise","4-1","Hip abductors, glutes, core"),
    ("atp-hsd2-medial-leg-raise","4-2","Hip adductors, core"),
    ("atp-hsd3-bent-leg-lateral-raise","4-3","Hips, obliques, core"),
    ("atp-hsd4-single-leg-tuck","4-4","Hips, core, lower abs"),
    ("atp-hsd5-single-leg-over","4-5","Hips, core"),
    ("atp-ssd1-i-raise","4-6","Shoulders, upper back, core"),
    ("atp-ssd2-t-raise","4-7","Shoulders, upper back"),
    ("atp-ssd3-y-raise","4-8","Shoulders, upper back"),
    ("atp-ssd4-l-raise","4-9","Shoulders, upper back"),
    ("atp-ssd5-w-raise","4-11","Shoulders, upper back"),
]:
    drilln = "Hip Stability Drill" if "hsd" in rid else "Shoulder Stability Drill"
    ex(rid, fig, "mobility-stability", "Bodyweight", drilln, musc,
       ["Maintain a controlled, pain-free range", "Keep the core braced", "Move slowly through the full motion"])

# ---- Chapter 5: Conditioning Drills ----
ex("atp-cd1-leg-tuck-twist", "5-4", "muscular-endurance", "Bodyweight", C+" 1",
   "Core, hip flexors, shoulders", ["From supine, raise legs and hips", "Twist knees to one side at the top", "Control the descent"])
ex("atp-cd1-single-leg-push-up", "5-5", "muscular-endurance", "Bodyweight", C+" 1",
   "Chest, shoulders, core, quads", ["Start in front-leaning rest", "Lift one leg, lower the chest", "Push back up, switching legs"])
ex("atp-cd2-turn-lunge", "5-11", "muscular-endurance", "Bodyweight", C+" 2",
   "Quads, glutes, core", ["From straddle stance turn and lunge", "Lower to a deep lunge", "Drive back to the starting position"])
ex("atp-cd2-supine-bicycle", "5-12", "muscular-endurance", "Bodyweight", C+" 2",
   "Core, hip flexors", ["Supine with legs raised", "Alternate pedaling motion", "Keep shoulders lightly off the floor"])
ex("atp-cd2-half-jack", "5-13", "muscular-endurance", "Bodyweight", C+" 2",
   "Legs, shoulders, core", ["Start in a squat position", "Jump and clap overhead", "Return to the squat"])
ex("atp-cd2-swimmer", "5-14", "muscular-endurance", "Bodyweight", C+" 2",
   "Lower back, glutes, shoulders", ["Prone with arms extended", "Alternate raising opposite arm and leg", "Keep belly on the floor"])
ex("atp-cd3-y-squat", "5-16", "muscular-strength", "Bodyweight", C+" 3",
   "Quads, glutes, shoulders", ["Squat to full depth", "Extend arms into a Y overhead", "Return to the squat"])
ex("atp-cd3-single-leg-deadlift", "5-17", "muscular-strength", "Bodyweight", C+" 3",
   "Hamstrings, glutes, lower back", ["Balance on one leg", "Hinge, extending the free leg behind", "Keep hips square and return"])
ex("atp-cd3-side-side-knee-lifts", "5-18", "muscular-endurance", "Bodyweight", C+" 3",
   "Core, obliques, hip flexors", ["Stand with feet wide", "Lift one knee toward the opposite elbow", "Alternate sides with control"])
ex("atp-cd3-front-kick-toe-touch", "5-19", "muscular-endurance", "Bodyweight", C+" 3",
   "Core, hamstrings, shoulders", ["Alternate high front kicks", "Touch the opposite toe", "Keep a tall posture"])
ex("atp-cd3-straddle-run", "5-21", "muscular-endurance", "Bodyweight", C+" 3",
   "Legs, core", ["From straddle stance", "Run in place lifting the knees", "Drive the arms overhead and back"])
ex("atp-cd3-half-squat-laterals", "5-22", "muscular-endurance", "Bodyweight", C+" 3",
   "Quads, glutes, shoulders", ["From half squat", "Sweep arms side to side overhead", "Stay low and balanced"])
ex("atp-cd3-frog-jumps", "5-23", "power", "Bodyweight", C+" 3",
   "Quads, glutes, calves", ["From a crouch", "Jump forward swinging arms", "Land soft and repeat"])
ex("atp-cd3-alternate-quarter-turn-jump", "5-24", "power", "Bodyweight", C+" 3",
   "Quads, calves, core", ["Jump and rotate a quarter turn", "Land soft on the balls of the feet", "Alternate direction"])
ex("atp-cd3-alternate-staggered-squat-jump", "5-25", "power", "Bodyweight", C+" 3",
   "Quads, glutes, calves", ["Start in an offset-split squat", "Jump and switch foot position", "Land soft and repeat"])

# ---- Chapter 6: Climbing / Guerilla ----
ex("atp-cl1-straight-arm-pull", "6-1", "muscular-endurance", "Pull-up bar", CL + " 1",
   "Lats, shoulders, grip", ["Hang with straight arms", "Pull the bar down to the chest", "Slowly return to the hang"])
ex("atp-cl1-heel-hook", "6-2", "muscular-endurance", "Pull-up bar", CL + " 1",
   "Lats, core, hip flexors", ["Hang from the bar", "Hook the heels to the bar", "Pull the body up toward the bar"])
ex("atp-cl1-alternating-grip-pull-up", "6-6", "muscular-strength", "Pull-up bar", CL + " 1",
   "Lats, biceps, grip", ["Hang with one over, one under grip", "Pull the chin over the bar", "Lower with control and switch grip"])
ex("atp-cl2-flexed-arm-hang", "6-7", "muscular-endurance", "Pull-up bar", CL + " 2",
   "Lats, biceps, grip", ["Hold at the top of a pull-up", "Chin over the bar", "Hold without dropping"])
ex("atp-gd1-shoulder-roll", "6-10", "muscular-strength", "Bodyweight", GD + " 1",
   "Shoulders, core", ["Form a shoulder bridge on the floor", "Roll from one shoulder to the other", "Keep feet in contact"])
ex("atp-gd2-lunge-walk", "6-11", "muscular-endurance", "Bodyweight", GD + " 2",
   "Quads, glutes, core", ["Step forward into a deep lunge", "Drive through the front heel", "Walk forward alternating legs"])
ex("atp-gd3-soldier-carry", "6-12", "muscular-strength", "Bodyweight", GD + " 3",
   "Full body, grip", ["Pair up with a partner", "Carry a partner across the shoulders", "Move with a steady step"])

# ---- Chapter 7: Running Drills ----
ex("atp-rud1-heel-strike", "7-1", "mobility-stability", "Bodyweight", RUD + " 1",
   "Feet, calves", ["Land on the heels", "Rocks forward to the balls of the feet", "Maintain cadence"])
ex("atp-rud1-heel-run", "7-2", "mobility-stability", "Bodyweight", RUD + " 1",
   "Feet, calves, lower legs", ["Run in place landing on the heels", "Drive through the balls", "Keep a steady rhythm"])
ex("atp-rud1-8-count-foot-strike", "7-3", "mobility-stability", "Bodyweight", RUD + " 1",
   "Feet, lower legs", ["Follow the 8-count foot pattern", "Emphasize cushioned foot strikes", "Keep knees slightly bent"])
ex("atp-rud1-run-in-place-1", "7-4", "mobility-stability", "Bodyweight", RUD + " 1",
   "Legs, calves", ["Run in place at light cadence", "Stay on the balls of the feet", "Swing arms naturally"])
ex("atp-rud1-run-in-place-2", "7-5", "mobility-stability", "Bodyweight", RUD + " 1",
   "Legs, calves", ["Run in place lifting knees higher", "Add arm drive", "Keep posture tall"])
ex("atp-rud2-double-leg-hop", "7-6", "power", "Bodyweight", RUD + " 2",
   "Calves, ankles, quads", ["Hop in place on both feet", "Push through the balls of the feet", "Land soft"])
ex("atp-rud2-single-leg-hop", "7-7", "power", "Bodyweight", RUD + " 2",
   "Calves, ankles, quads, balance", ["Hop in place on one foot", "Keep the knee soft", "Switch legs"])
ex("atp-rud2-skip", "7-8", "mobility-stability", "Bodyweight", RUD + " 2",
   "Legs, coordination", ["Skip in place", "Drive the knees and arms", "Keep a rhythm"])
ex("atp-rud2-criss-cross", "7-10", "mobility-stability", "Bodyweight", RUD + " 2",
   "Hips, legs, coordination", ["Cross the feet alternately", "Keep a light bounding step", "Move with control"])
ex("atp-rud2-pendulum", "7-11", "mobility-stability", "Bodyweight", RUD + " 2",
   "Hips, core", ["Swing the leg from side to side", "Keep the hips still", "Support on a steady base"])
ex("atp-rud2-alternate-twist-jump", "7-12", "power", "Bodyweight", RUD + " 2",
   "Legs, core", ["Jump and twist the lower body", "Keep the shoulders facing forward", "Land soft"])
ex("atp-rud2-hip-raise-push-up", "7-13", "muscular-endurance", "Bodyweight", RUD + " 2",
   "Chest, triceps, core", ["From front-leaning rest", "Lower, then raise the hips skyward", "Return to the start"])
ex("atp-rud2-single-leg-hip-raise-push-up", "7-14", "muscular-endurance", "Bodyweight", RUD + " 2",
   "Chest, triceps, core", ["From front-leaning rest with one leg raised", "Lower and push up", "Switch legs"])
ex("atp-rud2-single-leg-out-hip-raise-push-up", "7-15", "muscular-endurance", "Bodyweight", RUD + " 2",
   "Chest, triceps, core, glutes", ["From front-leaning rest", "Raise one leg out to the side", "Lower and push up, switch legs"])
ex("atp-rud3-alternating-foot-strike", "7-16", "mobility-stability", "Bodyweight", RUD + " 3",
   "Feet, lower legs", ["Strike the ground with an alternating foot", "Keep a light quick pace", "Maintain posture"])
ex("atp-rud3-hop-in-place", "7-17", "mobility-stability", "Bodyweight", RUD + " 3",
   "Calves, ankles", ["Hop in place with both feet", "Land soft", "Keep knees soft"])
ex("atp-rud3-hop-forward", "7-18", "mobility-stability", "Bodyweight", RUD + " 3",
   "Calves, quads", ["Hop forward a short distance", "Land soft and immediately rebound", "Repeat"])
ex("atp-rud3-backwards-run", "7-19", "mobility-stability", "Bodyweight", RUD + " 3",
   "Hamstrings, calves, coordination", ["Run backwards at a controlled pace", "Look over the shoulder", "Keep a short stride"])
ex("atp-rud4-hands-in-front", "7-20", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Legs, shoulders, core", ["Run in place with hands in front", "Drive knees, keep hands placed", "Keep rhythm"])
ex("atp-rud4-hands-behind", "7-21", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Legs, core", ["Run in place with hands behind", "Drive knees up", "Keep torso tall"])
ex("atp-rud4-hands-on-back", "7-22", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Legs, core", ["Run in place with hands on the back", "Drive knees", "Keep a steady cadence"])
ex("atp-rud4-hands-on-belly", "7-23", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Legs, core", ["Run in place with hands on the belly", "Keep knees driving", "Stay relaxed"])
ex("atp-rud4-shin-burn", "7-24", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Shins, calves", ["Run in place emphasizing the shins", "Keep a quick, light step", "Do not heel-strike hard"])
ex("atp-rud4-infantry-run", "7-25", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Legs, core", ["Run in place with an exaggerated rhythm", "Drive knees and pump arms", "Maintain cadence"])
ex("atp-rud4-battle-buddy", "7-26", "muscular-endurance", "Bodyweight", RUD + " 4",
   "Legs, coordination", ["Run in place with a partner in rhythm", "Match cadence", "Keep spacing"])

# ---- Chapter 8: Military Movement ----
ex("atp-mmd1-vertical", "8-1", "mobility-stability", "Bodyweight", MMD + " 1",
   "Ankles, calves", ["Spring up and down in place", "Stay tall through the torso", "Land soft"])
ex("atp-mmd1-lateral", "8-2", "mobility-stability", "Bodyweight", MMD + " 1",
   "Ankles, quads, coordination", ["Bound side to side", "Push off the outside foot", "Keep the hips level"])
ex("atp-mmd2-power-skip", "8-4", "power", "Bodyweight", MMD + " 2",
   "Legs, glutes, calves", ["Skip with an explosive knee drive", "Pump the arms", "Land soft and repeat"])
ex("atp-mmd2-crossover", "8-5", "mobility-stability", "Bodyweight", MMD + " 2",
   "Hips, legs, coordination", ["Step the feet alternately across the midline", "Keep the hips facing forward", "Move with control"])
ex("atp-mmd2-crouch-run", "8-6", "anaerobic-endurance", "Bodyweight", MMD + " 2",
   "Legs, core", ["Run in a low crouch", "Drive the knees", "Keep the chest up"])

# ---- Chapter 9: Medicine Ball ----
ex("atp-mb1-chest-pass-lateral", "9-1", "power", "Medicine ball", MB + " 1",
   "Chest, shoulders, core", ["Hold the ball at the chest", "Pass laterally and catch", "Alternate sides"])
ex("atp-mb1-alternating-side-arm-throw", "9-2", "power", "Medicine ball", MB + " 1",
   "Shoulders, core", ["Swing the ball to one side", "Throw overhead to the partner", "Alternate sides"])
ex("atp-mb1-diagonal-chop", "9-3", "power", "Medicine ball", MB + " 1",
   "Core, shoulders", ["Hold the ball overhead to one side", "Chop diagonally down", "Reverse the motion"])
ex("atp-mb1-underhand-wall-throw", "9-5", "power", "Medicine ball", MB + " 1",
   "Legs, shoulders, core", ["Squat with the ball low", "Drive through the legs to throw underhand", "Catch and repeat"])
ex("atp-mb2-diagonal-chop-throw", "9-6", "power", "Medicine ball", MB + " 2",
   "Core, shoulders", ["Chop the ball diagonally and release", "Catch and reverse", "Alternate directions"])
ex("atp-mb2-kneeling-side-arm-throw", "9-7", "power", "Medicine ball", MB + " 2",
   "Shoulders, core", ["Kneel in a half-kneeling stance", "Throw the ball side arm", "Alternate sides"])
ex("atp-mb2-sumo-wall-throw", "9-8", "power", "Medicine ball", MB + " 2",
   "Legs, glutes, chest", ["Stand in a wide sumo stance", "Push the ball against the wall", "Catch and repeat"])
ex("atp-mb2-sit-up-throw", "9-9", "power", "Medicine ball", MB + " 2",
   "Core, shoulders", ["From supine, sit up and throw", "Catch and return with control", "Keep slow, controlled sit-ups"])
ex("atp-mb2-rainbow-slam", "9-10", "power", "Medicine ball", MB + " 2",
   "Core, lats, shoulders", ["Raise the ball overhead to one side", "Slam it down to the opposite side", "Bend at the waist with control"])

# ---- Chapter 10: Suspension ----
for rid,fig,extra in [
    ("atp-st1-suspension-push-up","10-1",""),
    ("atp-st1-incline-calf-raise","10-2",""),
    ("atp-st1-decline-ity-raise","10-3",""),
    ("atp-st1-assisted-squat","10-4",""),
    ("atp-st1-decline-biceps-curl","10-5",""),
    ("atp-st2-assisted-lateral-lunge","10-6",""),
    ("atp-st2-leg-tuck-pike","10-7",""),
    ("atp-st2-decline-pull-up","10-8",""),
    ("atp-st2-suspension-hamstring-curl","10-9",""),
    ("atp-st2-assisted-single-leg-squat","10-10",""),
    ("atp-st2-straight-arm-pull","10-12",""),
    ("atp-st2-suspended-heel-hook","10-13",""),
    ("atp-st2-suspended-leg-tuck","10-14",""),
    ("atp-st2-suspended-pull-up","10-15",""),
    ("atp-st2-suspended-alternating-grip","10-16",""),
    ("atp-st2-suspended-flexed-arm-hang","10-17",""),
]:
    n = int(fig.split("-")[1])
    drilln = ST + " 1" if n <= 5 else ST + " 2"
    nm = fig_name.get(fig, "").replace("ST1.","").replace("ST2.","").replace("Suspension","Suspension").strip()
    ex(rid, fig, "muscular-strength", "Suspension straps", drilln,
       "Full body, core", ["Set feet/straps at the right angle", "Keep a braced, straight body line", "Move through full range with control"])

# ---- Chapter 11: Landmine ----
for rid,fig,musc in [
    ("atp-lm1-straight-leg-deadlift","11-1","Hamstrings, glutes, lower back"),
    ("atp-lm1-diagonal-press","11-2","Shoulders, chest, core"),
    ("atp-lm1-rear-lunge","11-3","Quads, glutes, hip flexors"),
    ("atp-lm1-180-landmine","11-4","Shoulders, core"),
    ("atp-lm1-lateral-lunge","11-5","Quads, adductors, glutes"),
    ("atp-lm2-diagonal-lift-press","11-6","Shoulders, core, legs"),
    ("atp-lm2-single-arm-chest-press","11-7","Chest, shoulders, triceps"),
    ("atp-lm2-180-kneeling","11-8","Shoulders, core"),
    ("atp-lm2-bent-over-row","11-9","Back, lats, biceps"),
    ("atp-lm2-rear-lunge-press","11-10","Quads, glutes, shoulders"),
]:
    n = int(fig.split("-")[1])
    drilln = LM + " 1" if n <= 5 else LM + " 2"
    ex(rid, fig, "muscular-strength", "Landmine bar", drilln, musc,
       ["Anchor the landmine bar", "Keep a braced core", "Move with control through the working range"])

# ---- Chapter 13: STC ----
ex("atp-stc-sumo-squat","13-1","muscular-strength","Bodyweight",STC,"Quads, adductors, glutes",
   ["Wide stance, toes out", "Descend between the feet", "Knees track over toes"])
ex("atp-stc-straight-leg-deadlift","13-2","muscular-strength","Bodyweight",STC,"Hamstrings, glutes, lower back",
   ["Hinge at the hips", "Keep a flat back", "Return with control"])
ex("atp-stc-forward-lunge","13-3","muscular-strength","Bodyweight",STC,"Quads, glutes, hip flexors",
   ["Step forward into a lunge", "Front knee over the ankle", "Drive back to standing"])
ex("atp-stc-8-count-step-up","13-4","muscular-endurance","Bodyweight",STC,"Quads, glutes, cardio",
   ["Step up onto a platform", "Drive through the lead leg", "Alternate the leading leg"])
ex("atp-stc-pull-up","13-5","muscular-strength","Pull-up bar",STC,"Lats, biceps, grip",
   ["From a dead hang", "Pull the chin over the bar", "Lower with control"])
ex("atp-stc-straight-arm-pull","13-6","muscular-endurance","Pull-up bar",STC,"Lats, shoulders",
   ["Hang with straight arms", "Pull the bar to the chest", "Return slowly"])
ex("atp-stc-supine-chest-press","13-7","muscular-strength","Bodyweight",STC,"Chest, triceps, shoulders",
   ["Supine on a bench or floor", "Press the bar/load up", "Lower to the chest with control"])
ex("atp-stc-bent-over-row","13-8","muscular-strength","Bodyweight",STC,"Back, lats, biceps",
   ["Hinge to a flat back", "Row the load to the ribs", "Squeeze the shoulder blades"])
ex("atp-stc-overhead-push-press","13-9","muscular-strength","Bodyweight",STC,"Shoulders, legs, core",
   ["Dip and drive the legs", "Press the load overhead", "Lock out and lower with control"])
ex("atp-stc-supine-body-twist","13-10","muscular-endurance","Bodyweight",STC,"Core, obliques",
   ["Supine with legs bent", "Rotate the knees side to side", "Keep shoulders pinned"])
ex("atp-stc-leg-tuck","13-11","muscular-endurance","Pull-up bar",STC,"Core, hip flexors, lats",
   ["Hang from the bar", "Tuck the knees to the chest", "Lower with control"])

# ---- Chapter 14: Free Weight ----
ex("atp-fw1-front-squat","14-1","muscular-strength","Barbell",FW,"Quads, glutes, core",
   ["Rack the bar on the front shoulders", "Descend with a tall chest", "Drive up through the midfoot"])
ex("atp-fw-deadlift-kettlebells","14-4","muscular-strength","Kettlebell",FW,"Hamstrings, glutes, back",
   ["Hinge with kettlebells at the sides", "Keep a flat back", "Drive through the heels"])
ex("atp-fw4-bench-dumbbell","14-7","muscular-strength","Dumbbell",FW,"Chest, triceps, shoulders",
   ["Press dumbbells from the chest", "Keep shoulder blades set", "Control the descent"])
ex("atp-fw4-bench-kettlebell","14-8","muscular-strength","Kettlebell",FW,"Chest, triceps",
   ["Press kettlebells from the chest", "Stabilize the load", "Lower with control"])
ex("atp-fw4-bench-decline","14-9","muscular-strength","Barbell",FW,"Lower chest, triceps",
   ["Set the bench to a decline", "Lower the bar to the lower chest", "Press and lock"])
ex("atp-fw5-incline-bench","14-10","muscular-strength","Barbell",FW,"Upper chest, shoulders",
   ["Set the bench to an incline", "Lower the bar to the upper chest", "Press and lock"])
ex("atp-fw6-sumo-deadlift","14-11","muscular-strength","Barbell",FW,"Hamstrings, glutes, adductors",
   ["Take a wide stance", "Grip inside the legs", "Drive up with a flat back"])
ex("atp-fw7-heel-raise","14-12","muscular-strength","Bodyweight",FW,"Calves",
   ["Stand with feet hip-width", "Rise onto the balls of the feet", "Lower with control"])
ex("atp-fw9-single-arm-bent-over-row","14-14","muscular-strength","Dumbbell",FW,"Back, lats, biceps",
   ["Hinge to a flat back", "Row one dumbbell to the hip", "Alternate arms"])
ex("atp-fw10-upright-row-straight-bar","14-15","muscular-strength","Barbell",FW,"Shoulders, traps",
   ["Lift the bar to the chest", "Keep elbows above the wrists", "Lower with control"])
ex("atp-fw10-upright-row-kettlebell","14-16","muscular-strength","Kettlebell",FW,"Shoulders, traps",
   ["Lift the kettlebell to the chest", "Keep elbows high", "Lower with control"])
ex("atp-fw12-bent-arm-lateral-raise","14-18","muscular-strength","Dumbbell",FW,"Shoulders",
   ["Start with elbows bent", "Raise the arms out to the sides", "Lower with control"])
ex("atp-fw13-shrug","14-19","muscular-strength","Barbell",FW,"Traps",
   ["Hold the bar at the thighs", "Shrug the shoulders up", "Hold briefly and lower"])
ex("atp-fw14-pull-over-single","14-20","muscular-strength","Dumbbell",FW,"Lats, chest, triceps",
   ["Lie supine with a dumbbell", "Lower the dumbbell behind the head", "Pull it back over the chest"])
ex("atp-fw14-pull-over-double","14-21","muscular-strength","Dumbbell",FW,"Lats, chest",
   ["Lie supine with two dumbbells", "Lower them behind the head", "Pull back over the chest"])
ex("atp-fw15-overhead-triceps-extension","14-22","muscular-strength","Dumbbell",FW,"Triceps",
   ["Hold a dumbbell overhead", "Lower behind the head", "Extend to lock"])
ex("atp-fw16-biceps-curl","14-23","muscular-strength","Barbell",FW,"Biceps",
   ["Hold the bar at the thighs", "Curl to the shoulders", "Lower with control"])
ex("atp-fw17-weighted-trunk-flexion","14-24","muscular-strength","Barbell",FW,"Core",
   ["Hold a load on the chest", "Flex the trunk forward", "Return with control"])
ex("atp-fw18-weighted-trunk-extension","14-25","muscular-strength","Barbell",FW,"Lower back, glutes",
   ["Hold a load on the back", "Extend from a hip hinge", "Return with control"])

# ---- Chapter 15: Machines ----
for rid,fig,musc,equip in [
    ("atp-stm-single-leg-press","15-2","Quads, glutes","Leg Press Machine"),
    ("atp-stm-single-leg-curl","15-4","Hamstrings","Leg Curl Machine"),
    ("atp-stm-lateral-raise","15-5","Shoulders","Machine"),
    ("atp-stm-single-arm-lateral-raise","15-6","Shoulders","Machine"),
    ("atp-stm-single-arm-overhead-press","15-8","Shoulders","Shoulder Press Machine"),
    ("atp-stm-single-arm-lat-pulldown","15-10","Lats, biceps","Lat Pulldown Machine"),
    ("atp-stm-single-arm-seated-row","15-12","Back, lats, biceps","Cable Machine"),
    ("atp-stm-trunk-extension","15-13","Lower back, glutes","Machine"),
    ("atp-stm-triceps-extension","15-14","Triceps","Machine"),
    ("atp-stm-single-arm-triceps-extension","15-15","Triceps","Machine"),
    ("atp-stm-chest-press","15-16","Chest, triceps, shoulders","Machine"),
    ("atp-stm-single-arm-chest-press","15-17","Chest, triceps","Machine"),
    ("atp-stm-trunk-flexion","15-18","Core","Machine"),
]:
    ex(rid, fig, "muscular-strength", equip, SM, musc,
       ["Set the machine to the correct start", "Keep a controlled tempo", "Move through full range with control"])

# ---- Chapter 16: Recovery Drill ----
ex("atp-rd1-overhead-arm-pull","16-1","mobility-stability","Bodyweight",RD,"Shoulders, lats, core",
   ["Stand tall with arms overhead", "Interlace the fingers", "Pull the arms down and across"])
ex("atp-rd2-rear-lunge","16-2","mobility-stability","Bodyweight",RD,"Hip flexors, quads",
   ["Step back into a lunge", "Lower until a stretch is felt", "Return and alternate"])
ex("atp-rd3-extend-and-flex","16-3","mobility-stability","Bodyweight",RD,"Shoulders, torso",
   ["Reach the arms overhead", "Reach down to the toes", "Slow bend and reach"])
ex("atp-rd4-thigh-stretch","16-4","mobility-stability","Bodyweight",RD,"Quads, hip flexors",
   ["Pull one foot toward the glute", "Keep the knees together", "Hold and switch legs"])
ex("atp-rd5-single-leg-over","16-5","mobility-stability","Bodyweight",RD,"Lower back, hips",
   ["Lie supine with one leg crossed", "Pull the knee across the body", "Hold and switch"])
ex("atp-rd6-groin-stretch","16-6","mobility-stability","Bodyweight",RD,"Adductors, hips",
   ["Sit with the soles together", "Gently press the knees down", "Hold"])
ex("atp-rd7-calf-stretch","16-7","mobility-stability","Bodyweight",RD,"Calves",
   ["Step one leg back", "Press the heel down", "Hold and switch legs"])
ex("atp-rd8-hamstring-stretch","16-8","mobility-stability","Bodyweight",RD,"Hamstrings",
   ["Extend one leg forward", "Reach toward the toes with a flat back", "Hold and switch legs"])

# ---- Chapter 17: PMCS ----
for rid,fig,musc in [
    ("atp-pmcs-spine-neck","17-1","Neck, spine"),
    ("atp-pmcs-spine-midback-seated","17-2","Mid-back"),
    ("atp-pmcs-spine-midback-standing","17-3","Mid-back"),
    ("atp-pmcs-spine-midback-prone","17-4","Mid-back"),
    ("atp-pmcs-spine-lowback-prone","17-5","Low back"),
    ("atp-pmcs-spine-lowback-standing","17-6","Low back"),
    ("atp-pmcs-ankle","17-7","Ankles"),
    ("atp-pmcs-ankle-kneeling","17-8","Ankles"),
    ("atp-pmcs-knee","17-9","Knees"),
    ("atp-pmcs-hip","17-10","Hips"),
    ("atp-pmcs-hip-supine","17-11","Hips"),
    ("atp-pmcs-shoulder-partner","17-12","Shoulders"),
    ("atp-pmcs-shoulder","17-13","Shoulders"),
    ("atp-pmcs-arm","17-14","Arms"),
    ("atp-pmcs-elbow-wrist","17-15","Elbows, wrists"),
]:
    ex(rid, fig, "mobility-stability", "Bodyweight", "PMCS Drill", musc,
       ["Move slowly and smoothly", "Stop at any sharp pain", "Keep within a pain-free range"])

# ---- Chapter templates for programming/safety/source ----
PROG = {
  "muscular-strength": "2-6 sets x 3-6 reps @ 85-100% 1RM, or 8-12 reps for hypertrophy (Table 6-4)",
  "muscular-endurance": "2-3 sets x 15-25 reps, or per drill cadence (slow-to-moderate); rest 30-60 sec",
  "power": "3-5 sets x 3-8 reps, explosive, rest 60-120 sec",
  "aerobic-endurance": "steady 20-40 min at conversational effort (RPE 3-5)",
  "anaerobic-endurance": "intervals with full recovery, e.g. 30s on / 60-120s off, 5-10 rounds",
  "mobility-stability": "2-3 sets x 5-10 slow reps or hold 20-30 sec per side; per drill cadence",
}
SAFETY = {
  "muscular-strength": "Apply risk management (ATP 5-19); use spotters/racks at near-max loads; respect profiles (DA 3349/DD 689) and environmental guidance (TB MED 507/508).",
  "muscular-endurance": "Maintain form as fatigue builds; stop on sharp pain or loss of technique; respect profiles and environmental guidance (TB MED 507/508).",
  "power": "Land softly and with control; progress load/speed gradually; warm up thoroughly; respect profiles (TB MED 507/508).",
  "anaerobic-endurance": "Warm up before maximal intervals; start conservatively; respect heat/cold guidance (TB MED 507/508) and profiles.",
  "aerobic-endurance": "Stop if dizzy, nauseous, or in chest pain; hydrate; respect environmental guidance (TB MED 507/508) and profiles.",
  "mobility-stability": "Move within a pain-free range; do not force or bounce; respect profiles (DA 3349/DD 689).",
}

lines = []
lines.append("/* ATP 7-22.02, Holistic Health and Fitness Drills and Exercises — full official exercise roster.")
lines.append(" * U.S. Government work in the public domain (17 U.S.C. 105). Data generated by")
lines.append(" * scripts/generate-atp-exercises.py from the figure catalog. Each record matches the")
lines.append(" * library/coach schema; the 'fig' field maps to the official figure webp under assets/plates/atp/. */")
lines.append("window.BR_ATP_EXERCISES = [")
for rid in sorted(D):
    r = D[rid]
    figname = fig_name.get(r["fig"], rid)
    # strip the figure code prefix like "14-3. " so we keep the human name
    nm = figname.split(". ", 1)[-1] if ". " in figname else figname
    cues = ",\n".join("      " + json.dumps(c) for c in r["cues"])
    lines.append("  {")
    lines.append("    id: " + json.dumps(rid) + ",")
    lines.append("    name: " + json.dumps(nm) + ",")
    lines.append("    component: " + json.dumps(r["comp"]) + ",")
    lines.append("    equipment: " + json.dumps(r["equip"]) + ",")
    lines.append("    muscles: " + json.dumps(r["muscles"]) + ",")
    lines.append("    cues: [")
    lines.append(cues)
    lines.append("    ],")
    lines.append("    programming: " + json.dumps(PROG[r["comp"]]) + ",")
    lines.append("    safety: " + json.dumps(SAFETY[r["comp"]]) + ",")
    lines.append("    source: " + json.dumps("ATP 7-22.02 " + r["drill"] + " (figure " + r["fig"] + ")") + ",")
    lines.append("    drill: " + json.dumps(r["drill"]) + ",")
    lines.append("    fig: " + json.dumps(r["fig"]))
    lines.append("  },")
lines.append("];")
out = "\n".join(lines) + "\n"
os.makedirs(os.path.join(ROOT, "js", "data"), exist_ok=True)
open(os.path.join(ROOT, "js", "data", "exercises-atp.js"), "w").write(out)
print("wrote", os.path.join(ROOT, "js", "data", "exercises-atp.js"), "entries:", len(D))
