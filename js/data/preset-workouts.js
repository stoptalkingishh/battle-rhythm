window.BR_PRESET_WORKOUTS = [
  {
    id: "pw-1-upper-strength",
    name: "Workout 1 (Upper Body Strength)",
    duration: 60,
    focus: "muscular-strength",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Pairing: group into 2-3 people. Superset (2 sets of 12): Barbell Military Press / Single Arm Dumbbell Row, Barbell Row / Single Arm Dumbbell Shoulder Press. Accessories (not superset, 2 sets of 12): Bench Press, Lat Pulldown, Tricep Extension. Plank (2 sets of 1:30).",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw1-pre-1", type: "exercise", ref: "", label: "Cardio Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" },
          { id: "pw1-pre-2", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Stretching", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw1-act-1", type: "exercise", ref: "s8-overhead-push-press", label: "Barbell Military Press", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw1-act-2", type: "exercise", ref: "s7-bent-over-row", label: "Single Arm Dumbbell Row", sets: "2", reps: "12", duration: "", rest: "60s", machine: "none" },
          { id: "pw1-act-3", type: "exercise", ref: "s7-bent-over-row", label: "Barbell Row", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw1-act-4", type: "exercise", ref: "m6-shoulder-press-machine", label: "Single Arm Dumbbell Shoulder Press", sets: "2", reps: "12", duration: "", rest: "60s", machine: "none" },
          { id: "pw1-act-5", type: "exercise", ref: "s3-bench-press", label: "Bench Press", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw1-act-6", type: "exercise", ref: "m1-lat-pulldown", label: "Lat Pulldown", sets: "2", reps: "12", duration: "", rest: "60s", machine: "lat-pulldown" },
          { id: "pw1-act-7", type: "exercise", ref: "c2-cable-triceps-pushdown", label: "Tricep Extension", sets: "2", reps: "12", duration: "", rest: "60s", machine: "cable" },
          { id: "pw1-act-8", type: "exercise", ref: "m3-plank", label: "Plank", sets: "2", reps: "", duration: "1:30", rest: "60s", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw1-rec-1", type: "exercise", ref: "", label: "Cooldown Cardio", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw1-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw1-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-2-zone2-cardio",
    name: "Workout 2 (Zone 2 Cardio Run)",
    duration: 42,
    focus: "aerobic-endurance",
    rpe: 5,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Weather alternate: move session to Gaffney Gym if raining.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw2-pre-1", type: "drill", ref: "pd", label: "Preparation Drill", sets: "", reps: "", duration: "5-10 reps", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw2-act-1", type: "exercise", ref: "a6-sustained-run", label: "Zone 2 Run", sets: "", reps: "", duration: "32 min", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw2-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw2-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-3-lower-strength",
    name: "Workout 3 (Lower Body Strength)",
    duration: 60,
    focus: "muscular-strength",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Pairing: group into 2-3 people. Superset (2 sets of 12, increase weight 5-10 lbs from previous week): Deadlift / Bodyweight Lunge, Squat (back or leg press) / Single Leg RDL. Accessories (not superset, 2 sets of 12): Front Squat, Leg Curls, KB Swings. Plank (2 sets of 1:30).",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw3-pre-1", type: "exercise", ref: "", label: "Cardio Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" },
          { id: "pw3-pre-2", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Stretching", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw3-act-1", type: "exercise", ref: "s1-deadlift", label: "Deadlift", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw3-act-2", type: "exercise", ref: "mb2-rear-lunge", label: "Bodyweight Lunge", sets: "2", reps: "12", duration: "", rest: "60s", machine: "none" },
          { id: "pw3-act-3", type: "exercise", ref: "s2-squat", label: "Squat (Back or Leg Press)", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw3-act-4", type: "exercise", ref: "s6-straight-leg-deadlift", label: "Single Leg RDL", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw3-act-5", type: "exercise", ref: "s2-squat", label: "Front Squat", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell" },
          { id: "pw3-act-6", type: "exercise", ref: "m5-seated-leg-curl", label: "Leg Curls", sets: "2", reps: "12", duration: "", rest: "60s", machine: "none" },
          { id: "pw3-act-7", type: "exercise", ref: "p5-kettlebell-swing", label: "KB Swings", sets: "2", reps: "12", duration: "", rest: "60s", machine: "none" },
          { id: "pw3-act-8", type: "exercise", ref: "m3-plank", label: "Plank", sets: "2", reps: "", duration: "1:30", rest: "60s", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw3-rec-1", type: "exercise", ref: "", label: "Cooldown", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw3-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw3-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-4-400m-sprints",
    name: "Workout 4 (400m Track Sprints)",
    duration: 35,
    focus: "anaerobic-endurance",
    rpe: 9,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Profile / weather alternate: dynamic warmup, 90 sec high intensity on cardio machine with 90 sec rest (6 rounds), then 10 min recovery.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw4-pre-1", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw4-act-1", type: "exercise", ref: "n7-sprint-intervals", label: "400m Sprints", sets: "6", reps: "", duration: "400m", rest: "2:00", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw4-rec-1", type: "exercise", ref: "", label: "Recovery Cardio", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw4-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw4-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-5-zone2-core",
    name: "Workout 5 (Zone 2 Run & Core)",
    duration: 55,
    focus: "aerobic-endurance",
    rpe: 5,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Profile alternate: replace run with 32 min on ETM (rower, bike, etc.).",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw5-pre-1", type: "drill", ref: "pd", label: "RAMP Warmup", sets: "", reps: "", duration: "10 min", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw5-act-1", type: "exercise", ref: "a6-sustained-run", label: "Zone 2 Run", sets: "", reps: "", duration: "32 min", rest: "", machine: "none" },
          { id: "pw5-act-2", type: "exercise", ref: "m3-plank", label: "Plank", sets: "2", reps: "", duration: "1:30", rest: "60s", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw5-rec-1", type: "exercise", ref: "", label: "Cooldown", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw5-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw5-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-6-ramp-recovery",
    name: "Workout 6 (RAMP Warmup & Recovery Standard)",
    duration: 25,
    focus: "mobility-stability",
    rpe: 3,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Raise: 5 min jog or 1 lap. Activate / Mobilize: 10m lunges, heel scoops, high knees, butt kicks. Potentiate: shuttle run. Recovery: 10 min minimum (5 min walk + 5 min static stretch) to return heart rate to normal zone.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw6-pre-1", type: "exercise", ref: "a6-sustained-run", label: "Raise: Jog", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" },
          { id: "pw6-pre-2", type: "exercise", ref: "mb2-rear-lunge", label: "Activate / Mobilize: 10m lunges, heel scoops, high knees, butt kicks", sets: "", reps: "10m", duration: "", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw6-act-1", type: "exercise", ref: "n4-shuttle-sprint", label: "Potentiate: Shuttle Run", sets: "", reps: "", duration: "per drill", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw6-rec-1", type: "exercise", ref: "", label: "Walk", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" },
          { id: "pw6-rec-2", type: "exercise", ref: "mb8-recovery-drill-stretches", label: "Static Stretch", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" },
          { id: "pw6-rec-3", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw6-rec-4", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-7-lower-emphasis",
    name: "Workout 7 (Lower Body Emphasis)",
    duration: 45,
    focus: "muscular-strength",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Back Squats 3x8-12; Deadlifts 3x3-6; Dumbbell Lunges 3x8-12; Calf Raises 3x10-15; Hamstring Curls 3x8-12.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw7-pre-1", type: "drill", ref: "pd", label: "Preparation Drill", sets: "", reps: "", duration: "5-10 reps", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw7-act-1", type: "exercise", ref: "s2-squat", label: "Back Squats", sets: "3", reps: "8-12", duration: "", rest: "90s", machine: "barbell" },
          { id: "pw7-act-2", type: "exercise", ref: "s1-deadlift", label: "Deadlifts", sets: "3", reps: "3-6", duration: "", rest: "90s", machine: "barbell" },
          { id: "pw7-act-3", type: "exercise", ref: "mb2-rear-lunge", label: "Dumbbell Lunges", sets: "3", reps: "8-12", duration: "", rest: "60s", machine: "none" },
          { id: "pw7-act-4", type: "exercise", ref: "", label: "Calf Raises", sets: "3", reps: "10-15", duration: "", rest: "60s", machine: "none" },
          { id: "pw7-act-5", type: "exercise", ref: "m5-seated-leg-curl", label: "Hamstring Curls", sets: "3", reps: "8-12", duration: "", rest: "60s", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw7-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw7-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-8-agr-rock-road",
    name: "Workout 8 (AGR Rock Road Route)",
    duration: 35,
    focus: "aerobic-endurance",
    rpe: 6,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Profile alternate: gym low-impact cardio.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw8-pre-1", type: "drill", ref: "pd", label: "Preparation Drill", sets: "", reps: "", duration: "5-10 reps", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw8-act-1", type: "exercise", ref: "a2-ability-group-run", label: "3-Mile Run (Rock Road / Graveyard Route)", sets: "", reps: "", duration: "3 miles", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw8-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw8-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-9-200m-8",
    name: "Workout 9 (Track 200m Sprints - 8 Sets)",
    duration: 30,
    focus: "anaerobic-endurance",
    rpe: 9,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Proper rest between sets.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw9-pre-1", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw9-act-1", type: "exercise", ref: "n7-sprint-intervals", label: "200m Sprints", sets: "8", reps: "", duration: "200m", rest: "proper rest", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw9-rec-1", type: "exercise", ref: "", label: "Recovery Cardio", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw9-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw9-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-10-200m-10",
    name: "Workout 10 (Track 200m Sprints - 10 Sets)",
    duration: 35,
    focus: "anaerobic-endurance",
    rpe: 9,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Rest duration set to 2x the time of each sprint interval.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw10-pre-1", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw10-act-1", type: "exercise", ref: "n7-sprint-intervals", label: "200m Sprints", sets: "10", reps: "", duration: "200m", rest: "2x sprint time", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw10-rec-1", type: "exercise", ref: "", label: "Recovery Cardio", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw10-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw10-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-11-3060",
    name: "Workout 11 (Track 30/60 Intervals)",
    duration: 30,
    focus: "anaerobic-endurance",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Weather alternate: move session to the gym if raining.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw11-pre-1", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw11-act-1", type: "exercise", ref: "n1-30-60s", label: "30/60 Interval Sprints", sets: "", reps: "", duration: "30s run / 60s rest", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw11-rec-1", type: "exercise", ref: "", label: "Recovery Cardio", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw11-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw11-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-12-hill-sprints",
    name: "Workout 12 (Hill Sprints)",
    duration: 30,
    focus: "anaerobic-endurance",
    rpe: 9,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Hill sprints at the outdoor incline area.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw12-pre-1", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw12-act-1", type: "exercise", ref: "n5-hill-repeats", label: "Hill Sprints", sets: "", reps: "", duration: "per interval", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw12-rec-1", type: "exercise", ref: "", label: "Recovery Cardio", sets: "", reps: "", duration: "10 min", rest: "", machine: "none" },
          { id: "pw12-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw12-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-13-etm-anaerobic",
    name: "Workout 13 (ETM Anaerobic Interval Protocol)",
    duration: 35,
    focus: "anaerobic-endurance",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Low-impact anaerobic intervals on ETM (rower, bike, or elliptical). Intervals: 90 sec active (high intensity), 3 min rest between sets. Intensity target: push capacity while keeping consistent pace; heavy breathing without feeling nauseous.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw13-pre-1", type: "exercise", ref: "a7-etm-session", label: "ETM Easy Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "erg-rower" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw13-act-1", type: "exercise", ref: "a7-etm-session", label: "ETM Anaerobic Intervals", sets: "", reps: "", duration: "90 sec on / 3 min rest", rest: "", machine: "erg-rower" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw13-rec-1", type: "exercise", ref: "a7-etm-session", label: "ETM Cooldown", sets: "", reps: "", duration: "10 min", rest: "", machine: "erg-rower" },
          { id: "pw13-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw13-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-14-treadmill-pace",
    name: "Workout 14 (Treadmill Pace Conditioning)",
    duration: 45,
    focus: "aerobic-endurance",
    rpe: 7,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Goal: set treadmill at target passing rate to condition the body to maintain speed.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw14-pre-1", type: "exercise", ref: "a6-sustained-run", label: "Easy Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "treadmill" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw14-act-1", type: "exercise", ref: "a6-sustained-run", label: "Pace Run (3-4 miles in 40 min)", sets: "", reps: "", duration: "40 min", rest: "", machine: "treadmill" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw14-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw14-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-15-prep-2mile",
    name: "Workout 15 (Prep Drills & 2-Mile Run)",
    duration: 40,
    focus: "aerobic-endurance",
    rpe: 7,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Army Prep Drills, MMD 1 & 2 (Movement Control Drills), then a 2-mile run.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw15-pre-1", type: "drill", ref: "pd", label: "Army Prep Drills", sets: "", reps: "", duration: "per drill", rest: "" },
          { id: "pw15-pre-2", type: "drill", ref: "mmd1", label: "MMD 1 (Movement Control Drills)", sets: "", reps: "", duration: "per drill", rest: "" },
          { id: "pw15-pre-3", type: "drill", ref: "mmd2", label: "MMD 2 (Movement Control Drills)", sets: "", reps: "", duration: "per drill", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw15-act-1", type: "exercise", ref: "a5-2-mile-run", label: "2-Mile Run", sets: "", reps: "", duration: "2 miles", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw15-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw15-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-16-cold-weather",
    name: "Workout 16 (Outdoor Cold-Weather Acclimation Run)",
    duration: 35,
    focus: "aerobic-endurance",
    rpe: 5,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Outdoor run at the parade field. Weather alternate: move to gym for long-distance machine cardio if routes are iced over.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw16-pre-1", type: "drill", ref: "pd", label: "Preparation Drill", sets: "", reps: "", duration: "5-10 reps", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw16-act-1", type: "exercise", ref: "a1-unit-formation-run", label: "Outdoor Acclimation Run (Parade Field)", sets: "", reps: "", duration: "25 min", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw16-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw16-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-17-gym-strength",
    name: "Workout 17 (Gaffney Gym Free Weights / Strength)",
    duration: 50,
    focus: "muscular-strength",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Self-directed or group strength training, alternating muscle groups weekly, including heavy deadlifts.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw17-pre-1", type: "exercise", ref: "", label: "Cardio Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" },
          { id: "pw17-pre-2", type: "exercise", ref: "mb1-bend-and-reach", label: "Dynamic Stretching", sets: "", reps: "", duration: "5 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw17-act-1", type: "exercise", ref: "s1-deadlift", label: "Heavy Deadlifts", sets: "3", reps: "3-6", duration: "", rest: "2 min", machine: "barbell" },
          { id: "pw17-act-2", type: "exercise", ref: "s2-squat", label: "Back Squats", sets: "3", reps: "8-12", duration: "", rest: "90s", machine: "barbell" },
          { id: "pw17-act-3", type: "exercise", ref: "s3-bench-press", label: "Bench Press", sets: "3", reps: "8-12", duration: "", rest: "90s", machine: "barbell" },
          { id: "pw17-act-4", type: "exercise", ref: "s4-pull-up", label: "Pull-Ups", sets: "3", reps: "max", duration: "", rest: "90s", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw17-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw17-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-18-pretest-stretch",
    name: "Workout 18 (Pre-Test Dynamic Stretch Routine)",
    duration: 20,
    focus: "mobility-stability",
    rpe: 2,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Dynamic stretches prior to testing: light walks, leg swings, torso twists, knee-to-chest pulls, ankle circles.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw18-pre-1", type: "exercise", ref: "a6-sustained-run", label: "Light Walks", sets: "", reps: "", duration: "3 min", rest: "", machine: "none" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw18-act-1", type: "exercise", ref: "mb2-rear-lunge", label: "Leg Swings / Knee-to-Chest Pulls", sets: "", reps: "10 each", duration: "", rest: "", machine: "none" },
          { id: "pw18-act-2", type: "exercise", ref: "mb4-windmill", label: "Torso Twists", sets: "", reps: "10", duration: "", rest: "", machine: "none" },
          { id: "pw18-act-3", type: "exercise", ref: "mb7-hip-stability-drill", label: "Ankle Circles", sets: "", reps: "10 each", duration: "", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw18-rec-1", type: "exercise", ref: "", label: "Easy Walk", sets: "", reps: "", duration: "3 min", rest: "", machine: "none" },
          { id: "pw18-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw18-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-19-combatives",
    name: "Workout 19 (Combatives Instruction)",
    duration: 45,
    focus: "power",
    rpe: 6,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "Multi-day morning hand-to-hand combatives training.",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw19-pre-1", type: "drill", ref: "pd", label: "Preparation Drill", sets: "", reps: "", duration: "5-10 reps", rest: "" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw19-act-1", type: "exercise", ref: "", label: "Combatives Instruction", sets: "", reps: "", duration: "per instruction", rest: "", machine: "none" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw19-rec-1", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw19-rec-2", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  },
  {
    id: "pw-20-profile-lowimpact",
    name: "Workout 20 (Profile Low-Impact Option)",
    duration: 45,
    focus: "aerobic-endurance",
    rpe: 3,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "40 min stationary bike or light PT protocol (no running or lifting over 20 lbs).",
    safetyConfirmed: true,
    phases: {
      prep: {
        name: "Preparation",
        items: [
          { id: "pw20-pre-1", type: "exercise", ref: "a7-etm-session", label: "Easy Bike Warmup", sets: "", reps: "", duration: "5 min", rest: "", machine: "stationary-bike" }
        ]
      },
      activity: {
        name: "Activity",
        items: [
          { id: "pw20-act-1", type: "exercise", ref: "a7-etm-session", label: "Stationary Bike", sets: "", reps: "", duration: "40 min", rest: "", machine: "stationary-bike" }
        ]
      },
      recovery: {
        name: "Recovery",
        items: [
          { id: "pw20-rec-1", type: "exercise", ref: "a7-etm-session", label: "Easy Bike Cooldown", sets: "", reps: "", duration: "5 min", rest: "", machine: "stationary-bike" },
          { id: "pw20-rec-2", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" },
          { id: "pw20-rec-3", type: "drill", ref: "pmcs", label: "PMCS Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }
        ]
      }
    }
  }
];
