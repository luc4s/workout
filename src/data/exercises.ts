import type { ExerciseGuide, ExerciseId } from './types';

export const EXERCISES: Record<ExerciseId, ExerciseGuide> = {
  'joint-circles': {
    id: 'joint-circles',
    name: 'Joint Circles',
    summary:
      'A short head-to-toe sequence of slow, controlled circles that takes each joint through its comfortable range before calisthenics. It should warm you up, not tire you out.',
    muscles: {
      primary: ['Neck', 'Shoulders', 'Elbows', 'Wrists', 'Hips', 'Knees', 'Ankles'],
      secondary: ['Rotator cuff', 'Forearms', 'Core stabilizers'],
    },
    equipment: ['None'],
    setup: [
      'Stand tall with feet about hip-width apart and knees soft.',
      'Clear some space so arms and legs can move freely.',
      'Plan to work from the top down: neck → shoulders → elbows → wrists → hips → knees → ankles.',
    ],
    execution: [
      'Neck: slow half-circles or gentle ear-to-shoulder and chin-to-chest movements, about 5 each way.',
      'Shoulders and arms: start with small arm circles and let them grow larger, 8–10 forward then 8–10 backward.',
      'Elbows and wrists: circle the forearms around the elbows, then interlace fingers and roll the wrists in both directions.',
      'Hips: hands on hips, draw big slow circles with the pelvis, then lift each knee and circle it outward and inward.',
      'Knees and ankles: feet together, hands on knees, make small circles; then lift one foot and roll the ankle both ways.',
      'Start each joint with a small range and only enlarge it once the motion feels smooth.',
    ],
    cues: [
      'Slow and controlled, never forced',
      'Small circles first, then bigger',
      'Both directions, every joint',
      'Top to bottom',
    ],
    mistakes: [
      {
        title: 'Rushing',
        fix: 'Move slowly enough that you can feel the whole circle, roughly 8–10 reps per direction.',
      },
      {
        title: 'Forcing end range',
        fix: 'Stay in a comfortable range and stop any movement that causes sharp or pinching pain.',
      },
      {
        title: 'Skipping joints',
        fix: 'Follow the same top-down order every session so wrists, elbows and ankles are not forgotten.',
      },
      {
        title: 'Turning it into a workout',
        fix: 'Keep the effort very low; the goal is warmth and mobility, not fatigue.',
      },
    ],
    breathing: 'Breathe relaxed and continuously; do not hold your breath during the circles.',
    regressions: [
      'Seated version for neck, shoulders, wrists and ankles',
      'Hold a wall or chair for hip and ankle circles',
      'Smaller circles with fewer reps',
    ],
    progressions: [
      'Add shoulder pass-throughs with a band or stick',
      'Controlled articular rotations (slow, maximal-range circles)',
      'Follow with exercise-specific ramp-up sets',
    ],
    sources: [
      {
        title: 'Joint Warm-Up Routine – Calisthenics.com',
        url: 'https://calisthenics.com/exercise/joint-warm-up-routine/',
      },
      {
        title: 'Get More Out of Your Training With an Upper-Body Warm Up – BarBend',
        url: 'https://barbend.com/upper-body-warm-up/',
      },
      {
        title: 'Dynamic Warm-Ups for the Land-Based Athlete – NSCA Coach',
        url: 'https://www.nsca.com/contentassets/11647622285541019ee8ed532743cce5/coach-5.1.4-dynamic-warm-ups-for-the-land-based-athlete.pdf',
      },
    ],
  },

  pullup: {
    id: 'pullup',
    name: 'Pull-Up',
    summary:
      'A vertical pull from a dead hang until the chin clears the bar, using a pronated (palms-away) grip. Pull explosively, lower under control in about 2 seconds, and use the full range every rep.',
    muscles: {
      primary: ['Latissimus dorsi', 'Biceps'],
      secondary: ['Lower and middle trapezius', 'Rhomboids', 'Rear deltoids', 'Forearms / grip', 'Core'],
    },
    equipment: ['Pull-up bar'],
    setup: [
      'Grip the bar palms-away, hands slightly wider than shoulders, thumbs wrapped around.',
      'Hang with arms fully straight and head between the arms.',
      'Brace the abs, squeeze glutes and keep legs together (or lightly crossed) so the body stays still.',
      'Pull the shoulders slightly down and back to set the shoulder blades before the first rep.',
    ],
    execution: [
      'Drive the elbows down toward your back pockets and pull explosively.',
      'Keep the body vertical and quiet; no kicking or swinging.',
      'Continue until the chin is clearly over the bar.',
      'Lower under control in about 2 seconds, keeping tension in the back.',
      'Finish each rep at full arm extension before starting the next.',
      'For grease-the-groove practice sets, stop well before any grinding – every rep should feel crisp and easy.',
    ],
    cues: [
      'Shoulders down, then pull',
      'Elbows to back pockets',
      'Explode up, 2 s down',
      'Chin over, arms fully straight',
      'No swing',
    ],
    mistakes: [
      {
        title: 'Half reps',
        fix: 'Return to straight arms at the bottom and get the chin over the bar at the top on every rep.',
      },
      {
        title: 'Kipping / swinging',
        fix: 'Brace the core and squeeze the glutes and legs together to keep the body still.',
      },
      {
        title: 'Shrugged shoulders',
        fix: 'Set the shoulder blades down and back before pulling and hold that position throughout.',
      },
      {
        title: 'Dropping on the way down',
        fix: 'Count about 2 seconds on the lowering phase instead of falling into the hang.',
      },
      {
        title: 'Grinding practice sets',
        fix: 'End grease-the-groove sets several reps short of failure so they stay fresh and technical.',
      },
    ],
    breathing: 'Exhale as you pull up, inhale as you lower back to the hang.',
    regressions: [
      'Band-assisted or foot-assisted pull-up',
      'Slow negatives (4–5 s lowering)',
      'Inverted row',
      'Dead hang and scapular pulls',
    ],
    progressions: [
      'Pause with chin over the bar',
      'Weighted pull-up (belt or backpack)',
      'Chest-to-bar pull-up',
      'Archer pull-up',
    ],
    sources: [
      {
        title: 'Pull-ups – ACE Exercise Library',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/191/pull-ups/',
      },
      {
        title: 'Master the Pull-Up for Back Muscle, Strength, and Full-Body Control – BarBend',
        url: 'https://barbend.com/pull-up-guide/',
      },
    ],
  },

  'assisted-pullup': {
    id: 'assisted-pullup',
    name: 'Assisted Pull-Up / Negatives',
    summary:
      'A pull-up made easier with a resistance band or light foot support on a chair, so you can train the full pattern with good form. Slow 4–5 s negatives are an alternative that builds strength through the lowering phase.',
    muscles: {
      primary: ['Latissimus dorsi', 'Biceps'],
      secondary: ['Lower and middle trapezius', 'Rhomboids', 'Rear deltoids', 'Forearms / grip', 'Core'],
    },
    equipment: ['Pull-up bar', 'Resistance band or sturdy chair/box'],
    setup: [
      'Band: loop the band over the bar and place one foot or knee in it; thicker bands give more help.',
      'Chair: place a stable chair behind or below you and rest one or both feet on it, using the legs only as much as needed.',
      'Negatives: use a box or chair to step or jump to the top, chin over the bar.',
      'Grip palms-away, slightly wider than shoulders, and set the shoulder blades down.',
    ],
    execution: [
      'Assisted rep: start from straight arms, pull elbows down to the sides until the chin clears the bar.',
      'Let the band or feet only fill in what the back cannot do; keep the pull coming from the arms and back.',
      'Lower under control to full extension, about 2 seconds.',
      'Negative rep: from the top, lower yourself steadily over 4–5 seconds until the arms are straight.',
      'Step back up to the top for each negative instead of pulling up; reduce assistance gradually over weeks.',
    ],
    cues: [
      'Full hang to chin over bar',
      'Use only needed assistance',
      'Negatives: 4–5 s, steady',
      'Shoulders down, chest up',
    ],
    mistakes: [
      {
        title: 'Too much assistance',
        fix: 'Pick the lightest band or least foot push that still lets you finish the reps with clean form.',
      },
      {
        title: 'Bouncing out of the band',
        fix: 'Pause briefly at the bottom with straight arms so the band does not catapult you up.',
      },
      {
        title: 'Rushed negatives',
        fix: 'Count the full 4–5 seconds and stop the set when you can no longer control the descent.',
      },
      {
        title: 'Partial range',
        fix: 'Reach straight arms at the bottom and chin over the bar at the top each rep.',
      },
    ],
    breathing: 'Exhale on the pull, inhale while lowering; on negatives breathe steadily rather than holding your breath.',
    regressions: [
      'Thicker band or more foot support',
      'Inverted row at a steeper (easier) angle',
      'Flexed-arm hang at the top',
      'Scapular pulls from a dead hang',
    ],
    progressions: [
      'Thinner band or less foot support',
      'Longer negatives, then fewer assisted reps',
      'Single unassisted pull-up plus negatives',
      'Full bodyweight pull-up',
    ],
    sources: [
      {
        title: '4 Moves to Help You Master the Pull-up – ACE',
        url: 'https://www.acefitness.org/resources/pros/expert-articles/5565/4-moves-to-help-you-master-the-pull-up/',
      },
      {
        title: "A Ladies' Guide to Your First Pull-Up – BarBend",
        url: 'https://barbend.com/women-pull-up-guide/',
      },
    ],
  },

  dip: {
    id: 'dip',
    name: 'Parallel-Bar Dip',
    summary:
      'A bodyweight press on parallel bars that lowers until the upper arms are about parallel to the floor, with a slight forward lean. Load it with a dip belt or backpack once bodyweight reps are easy.',
    muscles: {
      primary: ['Triceps', 'Pectoralis major (lower)'],
      secondary: ['Anterior deltoids', 'Serratus anterior', 'Core'],
    },
    equipment: ['Parallel dip bars', 'Dip belt or backpack (optional load)'],
    setup: [
      'Grip bars that are roughly shoulder-width or a little wider.',
      'Jump or press up to the top with arms locked and shoulders pushed down away from the ears.',
      'Brace the core, squeeze the glutes and keep the legs together or lightly crossed.',
      'If weighted, hang the load from a belt or wear a snug backpack so it does not swing.',
    ],
    execution: [
      'Lean the torso slightly forward and let the elbows bend, tracking back rather than flaring wide.',
      'Lower in about 2 seconds until the upper arms are roughly parallel to the floor.',
      'Keep the shoulders down and chest open at the bottom; do not sink into the shoulders.',
      'Press explosively through the palms back to straight arms.',
      'Finish tall with shoulders depressed before the next rep.',
    ],
    cues: [
      'Shoulders away from ears',
      'Slight lean, elbows back',
      'Upper arm to parallel',
      'Press the bars away',
    ],
    mistakes: [
      {
        title: 'Going too deep',
        fix: 'Stop when the upper arms reach about parallel to protect the front of the shoulder.',
      },
      {
        title: 'Shallow reps',
        fix: 'Lower until the upper arm is near parallel instead of bouncing in the top half.',
      },
      {
        title: 'Shrugging',
        fix: 'Actively push the bars down to keep the shoulders away from the ears throughout.',
      },
      {
        title: 'Excessive forward lean',
        fix: 'Keep the lean slight; a large lean shifts stress onto the shoulders.',
      },
      {
        title: 'Swinging load',
        fix: 'Use a short chain or tight backpack and control the bottom so the weight stays still.',
      },
    ],
    breathing: 'Inhale on the way down, exhale as you press back up.',
    regressions: [
      'Band-assisted or feet-assisted dips',
      'Top support hold on the bars',
      'Slow negatives only',
      'Elevated archer push-ups (if no bars)',
    ],
    progressions: [
      'Add load via dip belt or backpack',
      'Pause at the bottom position',
      'Ring dips (strict, controlled)',
    ],
    sources: [
      {
        title: 'How to Do Dips: Proper Form & Variations – BarBend',
        url: 'https://barbend.com/dips/',
      },
      {
        title: 'The 15 Best Bodyweight Chest Exercises – BarBend',
        url: 'https://barbend.com/best-bodyweight-chest-exercises/',
      },
      {
        title: 'Ring Dips Progressions – BarBend',
        url: 'https://barbend.com/ring-dips-progressions/',
      },
      {
        title: 'Weighted Chest Dip – ExRx.net',
        url: 'https://exrx.net/WeightExercises/PectoralSternal/WtChestDip',
      },
    ],
  },

  'bulgarian-split-squat': {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    summary:
      'A single-leg squat with the rear foot elevated on a bench, loaded with dumbbells or a backpack. Train the weaker leg first and match that rep count on the stronger leg.',
    muscles: {
      primary: ['Quadriceps', 'Gluteus maximus'],
      secondary: ['Adductors', 'Hamstrings', 'Calves', 'Core'],
    },
    equipment: ['Bench, box or chair (about knee height)', 'Dumbbells or loaded backpack'],
    setup: [
      'Stand a couple of feet in front of a knee-height bench and rest the top of the rear foot on it.',
      'Adjust the front foot so that at the bottom the knee sits roughly over the middle of the foot.',
      'Hold dumbbells at your sides or wear the backpack; brace the core.',
      'Start with your weaker leg in front.',
    ],
    execution: [
      'Shift most of your weight (about 80–90%) onto the front leg; the back leg is only a kickstand.',
      'Lower down and slightly back in about 2 seconds until the front thigh is near parallel or the back knee nearly touches the floor.',
      'Keep the front heel planted and let the torso lean slightly forward if that feels natural.',
      'Drive through the whole front foot to stand up powerfully.',
      'Finish all reps on the weaker leg, then match that number on the stronger leg.',
    ],
    cues: [
      'Weight on the front leg',
      'Front heel stays down',
      'Down and slightly back',
      'Weaker leg first, match reps',
    ],
    mistakes: [
      {
        title: 'Pushing with the back leg',
        fix: 'Keep the rear foot relaxed and drive the rep only through the front leg.',
      },
      {
        title: 'Heel lifting',
        fix: 'Move the front foot a little further forward and press through the heel and midfoot.',
      },
      {
        title: 'Losing balance',
        fix: 'Widen the stance slightly side-to-side and bring the front foot a touch closer if you wobble.',
      },
      {
        title: 'Knee caving in',
        fix: 'Keep the front knee tracking in line with the toes throughout the rep.',
      },
      {
        title: 'Uneven sides',
        fix: 'Start with the weaker leg and never do more reps on the stronger leg.',
      },
    ],
    breathing: 'Breathe in and brace at the top, lower, then exhale as you drive up.',
    regressions: [
      'Bodyweight only',
      'Lower rear-foot elevation',
      'Split squat with rear foot on the floor',
      'Hold a support with one hand',
    ],
    progressions: [
      'Heavier dumbbells or backpack',
      'Pause at the bottom',
      'Slower 3 s lowering',
      'Front foot on a small plate for deeper range',
    ],
    sources: [
      {
        title: 'Bulgarian Split Squat – ACE Exercise Library',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/366/bulgarian-split-squat/',
      },
      {
        title: 'Do the Bulgarian Split Squat for Brutal Leg Gains – BarBend',
        url: 'https://barbend.com/bulgarian-split-squat/',
      },
    ],
  },

  'inverted-row': {
    id: 'inverted-row',
    name: 'Inverted Row',
    summary:
      'A horizontal pull where you hang under a bar, rings or sturdy table and row your chest up while the body stays rigid as a plank. Raise the feet or add load to make it harder; use a more upright angle with a 1 s squeeze to make it easier.',
    muscles: {
      primary: ['Latissimus dorsi', 'Middle trapezius', 'Rhomboids'],
      secondary: ['Rear deltoids', 'Biceps', 'Forearms / grip', 'Glutes and core'],
    },
    equipment: ['Low bar, rings or sturdy table', 'Bench/box for feet (optional)', 'Weight vest or plate (optional)'],
    setup: [
      'Set the bar or rings so your arms are fully straight while hanging underneath.',
      'Grip slightly wider than shoulders and walk the feet out (or put them on a box for the harder version).',
      'Squeeze the glutes and brace the abs so there is a straight line from head to heels.',
      'For a table, confirm it is heavy and stable enough before loading it.',
    ],
    execution: [
      'Start by pulling the shoulder blades together, then drive the elbows back.',
      'Row explosively until the chest touches or nearly touches the bar.',
      'Squeeze the shoulder blades hard at the top (hold 1 s on the easier variation).',
      'Lower under control in about 2 seconds to straight arms.',
      'Keep hips in line with shoulders for the entire set.',
    ],
    cues: [
      'Body rigid, hips up',
      'Chest to bar',
      'Squeeze shoulder blades together',
      'Explode up, 2 s down',
    ],
    mistakes: [
      {
        title: 'Sagging hips',
        fix: 'Squeeze glutes and abs so hips stay level with shoulders from bottom to top.',
      },
      {
        title: 'Arm-only pulling',
        fix: 'Begin each rep by retracting the shoulder blades before the elbows bend.',
      },
      {
        title: 'Short range',
        fix: 'Reach full arm extension at the bottom and bring the chest to the bar at the top.',
      },
      {
        title: 'Rushed reps',
        fix: 'Control the lowering and pause briefly at the top to keep tension on the back.',
      },
      {
        title: 'Unstable setup',
        fix: 'Test that the bar, rings or table cannot slip or tip before starting the set.',
      },
    ],
    breathing: 'Exhale as you row up, inhale as you lower.',
    regressions: [
      'Bent-knee inverted row',
      'More upright body angle',
      'Standard angle with 1 s squeeze at the top',
    ],
    progressions: [
      'Feet elevated on a box or bench',
      'Weighted (vest or plate on the hips)',
      'Ring rows with feet elevated',
      'Slow tempo with pause at top',
    ],
    sources: [
      {
        title: 'How to Do the Inverted Row – BarBend',
        url: 'https://barbend.com/inverted-row-guide/',
      },
      {
        title: 'Inverted Rows At Home/Bodyweight Options – BarBend',
        url: 'https://barbend.com/inverted-rows-home-bodyweight/',
      },
      {
        title: 'Inverted Row (feet elevated) – ExRx.net',
        url: 'https://exrx.net/WeightExercises/BackGeneral/BWSupineRowFeetElevated',
      },
    ],
  },

  'ab-wheel-rollout': {
    id: 'ab-wheel-rollout',
    name: 'Ab Wheel Rollout (Kneeling)',
    summary:
      'An anti-extension core exercise where you roll a wheel forward from the knees while keeping the pelvis tucked and ribs down. Extend the range gradually, using a wall as a depth stop.',
    muscles: {
      primary: ['Rectus abdominis', 'Transverse abdominis'],
      secondary: ['Obliques', 'Latissimus dorsi', 'Hip flexors', 'Glutes', 'Shoulders'],
    },
    equipment: ['Ab wheel', 'Mat or knee pad', 'Wall (depth stop)'],
    setup: [
      'Kneel on a mat with the wheel on the floor under your shoulders, arms straight.',
      'Tuck the pelvis slightly (tailbone under) and squeeze the glutes.',
      'Pull the ribs down toward the hips so the back is flat, not arched.',
      'Optional: face a wall at a distance so the wheel stops at your current safe depth.',
    ],
    execution: [
      'Keep arms nearly straight and slowly roll the wheel forward, letting hips and shoulders travel together.',
      'Go only as far as you can without the low back beginning to sag – or until the wheel meets the wall.',
      'Hold briefly at the end range while keeping lats and abs tight.',
      'Pull the wheel back toward the knees by contracting the abs, not by pushing hips back first.',
      'Move the wall further away only when every rep at the current depth is clean.',
    ],
    cues: [
      'Tuck pelvis, ribs down',
      'No low-back sag',
      'Roll out slowly',
      'Pull back with abs',
    ],
    mistakes: [
      {
        title: 'Low-back sag',
        fix: 'Shorten the range and keep the pelvis tucked and glutes squeezed throughout.',
      },
      {
        title: 'Rolling too far too soon',
        fix: 'Use a wall as a hard stop and only increase the distance in small steps.',
      },
      {
        title: 'Hips lead the return',
        fix: 'Pull the wheel back with the abs so hips and shoulders return together.',
      },
      {
        title: 'Bent arms',
        fix: 'Keep elbows straight or nearly straight so the core, not the arms, does the work.',
      },
      {
        title: 'Rushing',
        fix: 'Roll out slowly and under control to avoid the trunk twisting or arching.',
      },
    ],
    breathing: 'Take a breath and brace before rolling out, then exhale as you pull the wheel back.',
    regressions: [
      'Shorter range with wall stop close',
      'Stability ball rollout',
      'Plank or long-lever plank hold',
    ],
    progressions: [
      'Gradually longer range toward full extension',
      'Pause at end range',
      'Standing ab wheel rollout',
    ],
    sources: [
      {
        title: 'The Best Ab Wheel Workouts You Can Do at Any Experience Level – BarBend',
        url: 'https://barbend.com/ab-wheel-workouts/',
      },
      {
        title: 'The Benefits of Ab Rollouts and Progressions to Perform Them – BarBend',
        url: 'https://barbend.com/ab-rollouts/',
      },
      {
        title: 'Wheel Rollout – ExRx.net',
        url: 'https://exrx.net/WeightExercises/HipFlexors/BWKneelingWheelRollout',
      },
    ],
  },

  pushup: {
    id: 'pushup',
    name: 'Push-Up',
    summary:
      'The foundational horizontal press from a rigid plank: lower the chest to the floor under control and press explosively back up. It is the base for all push-up variations in the program.',
    muscles: {
      primary: ['Pectoralis major', 'Triceps', 'Anterior deltoids'],
      secondary: ['Serratus anterior', 'Core', 'Glutes', 'Quadriceps'],
    },
    equipment: ['None (floor)'],
    setup: [
      'Place hands flat about shoulder-width apart with shoulders stacked over wrists.',
      'Step the feet back into a straight-arm plank, feet together or hip-width.',
      'Squeeze glutes and thighs, brace the abs, and keep the head neutral, gaze just ahead of the hands.',
    ],
    execution: [
      'Lower the body as one unit in about 2 seconds, elbows angled roughly 45 degrees from the torso.',
      'Descend until the chest is just above or lightly touching the floor.',
      'Keep a straight line from head to heels the whole way.',
      'Press the floor away explosively until the arms are straight.',
      'Finish each rep with shoulders pushed away from the floor slightly before the next.',
    ],
    cues: [
      'Plank body, glutes tight',
      'Elbows about 45 degrees',
      'Chest to floor',
      'Explode up, 2 s down',
    ],
    mistakes: [
      {
        title: 'Low-back sag',
        fix: 'Squeeze glutes and tuck the pelvis slightly so hips stay in line.',
      },
      {
        title: 'Hips piked up',
        fix: 'Lower the hips until shoulders, hips and ankles form one line.',
      },
      {
        title: 'Elbows flared wide',
        fix: 'Point the elbows back toward the feet at about 45 degrees from the body.',
      },
      {
        title: 'Partial range',
        fix: 'Bring the chest close to the floor and finish with straight arms each rep.',
      },
      {
        title: 'Head dropping',
        fix: 'Keep the neck neutral and look slightly ahead of the hands.',
      },
    ],
    breathing: 'Inhale on the way down, exhale as you press up.',
    regressions: [
      'Incline push-up (hands on bench)',
      'Knee push-up',
      'Slow negatives from the top',
    ],
    progressions: [
      'Deficit push-up',
      'Archer push-up',
      'Pike push-up',
      'Weighted push-up (backpack)',
    ],
    sources: [
      {
        title: 'Push-Ups – ACE Exercise Library',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/',
      },
      {
        title: 'How to Perform the Push-Up – BarBend',
        url: 'https://barbend.com/push-up/',
      },
      {
        title: 'Perfecting the Push-up for All Levels – ACE',
        url: 'https://www.acefitness.org/resources/pros/expert-articles/7265/perfecting-the-push-up-for-all-levels/',
      },
    ],
  },

  'archer-pushup': {
    id: 'archer-pushup',
    name: 'Archer Push-Up',
    summary:
      'A wide push-up where you shift your weight toward one hand while the other arm straightens out to the side like drawing a bow. It loads one arm much more heavily and builds toward the one-arm push-up.',
    muscles: {
      primary: ['Pectoralis major', 'Triceps', 'Anterior deltoids'],
      secondary: ['Serratus anterior', 'Obliques', 'Core', 'Glutes'],
    },
    equipment: ['None (floor)', 'Bench/box to elevate hands (regression)'],
    setup: [
      'Start in a push-up plank with hands much wider than shoulders.',
      'Turn the fingers slightly outward and grip the floor.',
      'Brace the core and squeeze glutes so the body is one straight line.',
    ],
    execution: [
      'Shift toward the right hand and bend the right elbow while the left arm straightens out to the side.',
      'Lower in about 2 seconds until the chest is near the right hand; the straight arm only assists.',
      'Keep hips and shoulders square to the floor – do not twist.',
      'Press explosively back to the center with both arms straight.',
      'Repeat to the other side, alternating or completing all reps per side.',
    ],
    cues: [
      'Wide hands, fingers out',
      'Chest toward the working hand',
      'Other arm stays straight',
      'Hips square, body rigid',
    ],
    mistakes: [
      {
        title: 'Hips rotating',
        fix: 'Brace the abs and glutes so hips stay level and square to the floor.',
      },
      {
        title: 'Pushing with the straight arm',
        fix: 'Treat the straight arm as a light support and let the bent arm do most of the work.',
      },
      {
        title: 'Low-back sag',
        fix: 'Squeeze glutes and keep the pelvis slightly tucked as in a regular push-up.',
      },
      {
        title: 'Shallow reps',
        fix: 'Lower until the chest is close to the working hand; elevate the hands if you cannot.',
      },
    ],
    breathing: 'Inhale as you shift and lower, exhale as you press back to center.',
    regressions: [
      'Elevated archer push-up (hands on bench)',
      'Keep the assisting elbow slightly bent',
      'Wide push-up with a side shift',
    ],
    progressions: [
      'Lower elevation until on the floor',
      'Slower 3 s lowering on the working side',
      'Assisted one-arm push-up',
    ],
    sources: [
      {
        title: 'The 15 Best Bodyweight Chest Exercises – BarBend',
        url: 'https://barbend.com/best-bodyweight-chest-exercises/',
      },
      {
        title: 'Archer Push-up – ExRx.net',
        url: 'https://exrx.net/WeightExercises/PectoralSternal/BWArcherPushup',
      },
    ],
  },

  'deficit-pushup': {
    id: 'deficit-pushup',
    name: 'Deficit Push-Up',
    summary:
      'A push-up with hands on blocks, plates or parallettes so the chest can drop below hand level for a deeper stretch. Only use as much depth as you can control.',
    muscles: {
      primary: ['Pectoralis major', 'Triceps', 'Anterior deltoids'],
      secondary: ['Serratus anterior', 'Core', 'Glutes'],
    },
    equipment: ['Parallettes, push-up handles or stable blocks'],
    setup: [
      'Place two stable blocks or parallettes about shoulder-width apart; make sure they cannot slide.',
      'Grip the handles or place hands on the blocks and walk back into a straight-arm plank.',
      'Brace abs and glutes so the body forms a straight line from head to heels.',
    ],
    execution: [
      'Lower in about 2 seconds with elbows about 45 degrees from the torso.',
      'Let the chest sink slightly below the level of the hands, stopping at a depth you can own.',
      'Keep the shoulders from collapsing forward or shrugging at the bottom.',
      'Press explosively back to straight arms.',
      'Increase block height only when the current depth feels solid.',
    ],
    cues: [
      'Chest below the hands',
      'Controlled depth only',
      'Elbows about 45 degrees',
      'Plank body, explode up',
    ],
    mistakes: [
      {
        title: 'Too much depth',
        fix: 'Start with a low deficit and add height only when the bottom position feels stable.',
      },
      {
        title: 'Unstable blocks',
        fix: 'Use parallettes or blocks that cannot tip or slide before loading them.',
      },
      {
        title: 'Low-back sag',
        fix: 'Squeeze glutes and brace the abs to keep the body in one line.',
      },
      {
        title: 'Diving too fast',
        fix: 'Control the lowering phase and do not bounce out of the bottom.',
      },
    ],
    breathing: 'Inhale as you lower into the deficit, exhale as you press up.',
    regressions: [
      'Standard push-up from the floor',
      'Lower blocks for a small deficit',
      'Deficit push-up from the knees',
    ],
    progressions: [
      'Higher deficit',
      'Pause at the bottom',
      'Slower 3 s lowering',
      'Weighted deficit push-up (backpack)',
    ],
    sources: [
      {
        title: 'Push Ups on Parallettes: Technique, Benefits & Progressions – Xtenia',
        url: 'https://www.xtenia.com/blogs/calisthenics-lifestyle/push-ups-on-parallettes-technique-benefits-progressions',
      },
      {
        title: 'Push-Ups – ACE Exercise Library',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/',
      },
    ],
  },

  'pistol-squat': {
    id: 'pistol-squat',
    name: 'Pistol Squat',
    summary:
      'A full-depth single-leg squat with the free leg held straight out in front. Build up through box pistols and assisted pistols before full and then weighted versions.',
    muscles: {
      primary: ['Quadriceps', 'Gluteus maximus'],
      secondary: ['Adductors', 'Hamstrings', 'Calves', 'Hip flexors (free leg)', 'Core'],
    },
    equipment: ['Box or bench (box pistol)', 'Doorframe, pole or rack (assisted)', 'Dumbbell or kettlebell (weighted)'],
    setup: [
      'Stand on one leg with the foot flat, weight over the midfoot and heel.',
      'Lift the other leg straight out in front of you.',
      'For box pistols, stand just in front of a box; for assisted pistols, hold a sturdy support at arm length.',
      'Reach the arms forward (or hold a light weight out front) to counterbalance.',
    ],
    execution: [
      'Sit the hips back and down in about 2 seconds, keeping the heel planted and knee tracking over the toes.',
      'Box pistol: touch the box lightly without relaxing onto it; assisted: use only as much pull on the support as needed.',
      'Full pistol: descend until the hamstring rests on the calf while keeping the free leg off the floor.',
      'Lean the torso forward enough to stay balanced.',
      'Drive through the whole foot to stand up explosively, then switch legs.',
    ],
    cues: [
      'Heel down, knee over toes',
      'Arms forward to balance',
      'Free leg long and lifted',
      'Touch box, do not sit',
    ],
    mistakes: [
      {
        title: 'Knee caving in',
        fix: 'Push the knee out over the toes; regress to a higher box if it keeps collapsing.',
      },
      {
        title: 'Heel lifting',
        fix: 'Keep weight over the heel and midfoot, and work on ankle mobility or use a small heel lift.',
      },
      {
        title: 'Falling backward',
        fix: 'Reach the arms further forward or hold a light counterweight in front.',
      },
      {
        title: 'Plopping onto the box',
        fix: 'Lower slowly and only touch the box before standing back up.',
      },
      {
        title: 'Relying on the support',
        fix: 'Gradually lighten your grip on the support so the leg does more of the work.',
      },
    ],
    breathing: 'Inhale and brace at the top, lower, then exhale as you stand up.',
    regressions: [
      'Box pistol (higher box)',
      'Assisted pistol holding a support',
      'Slow lowering to a box',
      'Deep bodyweight squat',
    ],
    progressions: [
      'Lower box, then full pistol',
      'Pause at the bottom',
      'Weighted pistol (counterweight held in front)',
    ],
    sources: [
      {
        title: 'Pistol Squat Progression For Beginners – BarBend',
        url: 'https://barbend.com/pistol-squat-progression-for-beginners/',
      },
      {
        title: 'How to Do a Pistol Squat – ACE Exercise Library',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/308/pistol-squat/',
      },
      {
        title: 'Single Leg Box Squat (pistol) – ExRx.net',
        url: 'https://exrx.net/WeightExercises/Quadriceps/BWSingleLegBoxSquat',
      },
    ],
  },

  'archer-squat': {
    id: 'archer-squat',
    name: 'Archer Squat',
    summary:
      'From a wide stance, squat deep over one leg while the other leg stays straight out to the side. A side-to-side single-leg squat that builds strength and depth on the way to the full pistol.',
    muscles: {
      primary: ['Quadriceps', 'Gluteus maximus', 'Adductors'],
      secondary: ['Hamstrings (straight leg)', 'Calves', 'Core'],
    },
    equipment: ['None', 'Door frame or pole to hold (assisted)', 'Light dumbbell held at the chest (counterweight)'],
    setup: [
      'Stand with feet very wide — roughly twice shoulder width — toes pointing forward or slightly out.',
      'Brace the core and reach the arms forward (or hold a light weight at the chest) to counterbalance.',
    ],
    execution: [
      'Shift your weight over one foot and sit down and back over it in about 2 seconds.',
      'Keep the working heel flat and the knee tracking over the toes.',
      'The other leg straightens out to the side; its foot stays on the floor (flat, or on the heel with toes up if mobility is short).',
      'Go as deep as you control — thigh at least parallel, hip near the heel at full depth.',
      'Drive through the working heel back to centre, then switch sides. Count reps per side.',
    ],
    cues: ['Wide stance, sit over one leg', 'Working heel stays down', 'Other leg long and straight', 'Chest up, arms forward'],
    mistakes: [
      {
        title: 'Working heel lifts',
        fix: 'Sit back more, reach the arms further forward, or reduce the depth until ankle mobility catches up.',
      },
      {
        title: 'Knee caving in',
        fix: 'Push the working knee out over the toes; turn the toes out slightly if needed.',
      },
      {
        title: 'Bending the straight leg',
        fix: 'Keep it long — if you cannot, narrow the stance a little or use less depth.',
      },
      {
        title: 'Torso folding forward',
        fix: 'Keep the chest up and use a light counterweight held at the chest.',
      },
    ],
    breathing: 'Inhale and brace before you shift, exhale as you drive back to centre.',
    regressions: ['Hold a door frame or pole for balance', 'Shallower depth (thigh just above parallel)', 'Side lunge'],
    progressions: [
      'Full depth with no support',
      'Pause 2 s at the bottom',
      'Put less weight on the straight leg until it barely touches (toward the pistol)',
      'Full pistol squat',
    ],
    sources: [
      {
        title: 'How to Do the Cossack Squat (closely related side squat) – BarBend',
        url: 'https://barbend.com/cossack-squat/',
      },
      {
        title: 'Cossack Squat Exercise Guide – Fitness Volt',
        url: 'https://fitnessvolt.com/cossack-squat-guide/',
      },
    ],
  },

  'step-up': {
    id: 'step-up',
    name: 'High Box Step-Up',
    summary:
      'A single-leg step onto a high, stable box while wearing a weighted backpack, driving up only through the top leg. A knee-friendly alternative to deep single-leg squats.',
    muscles: {
      primary: ['Quadriceps', 'Gluteus maximus'],
      secondary: ['Hamstrings', 'Adductors', 'Calves', 'Core'],
    },
    equipment: ['Sturdy box, bench or step (about knee height or higher)', 'Loaded backpack'],
    setup: [
      'Put on a snug, loaded backpack and stand facing a stable box.',
      'Place the entire working foot on the box, knee aligned over the second toe.',
      'Stand tall, brace the core and shift most of your weight onto the top foot.',
    ],
    execution: [
      'Drive through the heel and midfoot of the top leg to stand up explosively; do not push off the bottom foot.',
      'Keep the torso mostly upright, allowing only a slight forward lean.',
      'Lock out the hip and knee at the top, bringing the trailing foot up lightly beside or just behind.',
      'Lower back down in about 2 seconds, controlling with the top leg until the trailing foot touches the floor.',
      'Complete all reps on one leg, then switch.',
    ],
    cues: [
      'Whole foot on the box',
      'Drive with the top leg',
      'Back foot is passive',
      'Lower slowly, 2 s',
    ],
    mistakes: [
      {
        title: 'Pushing off the back foot',
        fix: 'Lift the toes of the trailing foot so the working leg has to do the work.',
      },
      {
        title: 'Knee collapsing inward',
        fix: 'Keep the knee tracking over the second toe throughout the step.',
      },
      {
        title: 'Dropping down',
        fix: 'Control the descent with the top leg instead of falling back to the floor.',
      },
      {
        title: 'Only half the foot on the box',
        fix: 'Place the whole foot on the surface for balance and to protect the shins.',
      },
      {
        title: 'Excessive forward lean',
        fix: 'Keep the chest up and use a lower box if you have to fold forward to get up.',
      },
    ],
    breathing: 'Exhale as you step up, inhale as you lower back down.',
    regressions: [
      'Lower box',
      'Bodyweight only',
      'Light hand support on a wall',
    ],
    progressions: [
      'Heavier backpack',
      'Higher box',
      'Slower 3 s lowering',
    ],
    sources: [
      {
        title: 'Step-Up – ACE Exercise Library',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/28/step-up/',
      },
      {
        title: 'How to Do the Step-Up for Next-Level Leg Gains – BarBend',
        url: 'https://barbend.com/step-up/',
      },
    ],
  },

  'pike-pushup': {
    id: 'pike-pushup',
    name: 'Pike Push-Up',
    summary:
      'A vertical-leaning push-up in an inverted V: hips high, lower the head to the floor between the hands, and press back up. Elevate the feet to shift more load to the shoulders.',
    muscles: {
      primary: ['Anterior deltoids', 'Triceps'],
      secondary: ['Upper pectoralis', 'Upper trapezius', 'Serratus anterior', 'Core'],
    },
    equipment: ['None (floor)', 'Box or bench to elevate feet (progression)'],
    setup: [
      'Start in a push-up position with hands slightly wider than shoulders.',
      'Walk the feet in and lift the hips high into an inverted V (like downward dog).',
      'Keep legs as straight as your hamstrings allow; a slightly rounded back is acceptable.',
    ],
    execution: [
      'Bend the elbows and lower the head forward and down in about 2 seconds.',
      'Aim for the top of the head to land just in front of the hands, forming a triangle with them.',
      'Keep elbows angled back roughly 45 degrees, not flared straight out.',
      'Keep hips high throughout – do not let them drop toward a regular push-up.',
      'Press explosively back up to straight arms.',
    ],
    cues: [
      'Hips high',
      'Head to floor between hands',
      'Hands and head form triangle',
      'Elbows back, not out',
    ],
    mistakes: [
      {
        title: 'Hips dropping',
        fix: 'Walk the feet closer and keep pushing the hips toward the ceiling.',
      },
      {
        title: 'Elbows flaring',
        fix: 'Point the elbows back at about 45 degrees to protect the shoulders.',
      },
      {
        title: 'Head landing on the hand line',
        fix: 'Lower the head slightly forward of the hands so it forms a triangle with them.',
      },
      {
        title: 'Short range',
        fix: 'Lower until the head nearly touches the floor on every rep.',
      },
    ],
    breathing: 'Inhale as you lower the head, exhale as you press up.',
    regressions: [
      'Pike push-up with bent knees',
      'Partial range (to a cushion)',
      'Incline or standard push-up',
    ],
    progressions: [
      'Feet elevated on a box',
      'Higher box for a more vertical body',
      'Deficit pike push-up on parallettes',
      'Wall handstand push-up',
    ],
    sources: [
      {
        title: 'Pike Push-Up – NASM Exercise Library',
        url: 'https://www.nasm.org/resource-center/exercise-library/pike-push-up',
      },
      {
        title: 'Pike Push-up – ExRx.net',
        url: 'https://exrx.net/WeightExercises/PectoralClavicular/BWPikePushup',
      },
    ],
  },

  'hanging-leg-raise': {
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    summary:
      'Hanging from a bar, raise the legs by curling the pelvis up with the abs, then lower slowly without swinging. Progress from bent knees to straight legs at horizontal, then toes-to-bar.',
    muscles: {
      primary: ['Rectus abdominis', 'Hip flexors'],
      secondary: ['Obliques', 'Transverse abdominis', 'Latissimus dorsi', 'Forearms / grip'],
    },
    equipment: ['Pull-up bar'],
    setup: [
      'Hang from the bar with an overhand, shoulder-width grip and feet clear of the floor.',
      'Pull the shoulders down slightly and engage the lats so you are not hanging loosely.',
      'Squeeze the legs together, tighten the glutes and brace the abs into a slight hollow.',
      'Wait until the body is completely still before starting.',
    ],
    execution: [
      'Tilt the pelvis back and raise the legs (bent knees or straight, depending on level) using the abs.',
      'Bent-knee: bring knees above hip height toward the chest. Straight-leg: lift until legs are horizontal.',
      'Toes-to-bar: keep curling the hips up until the feet touch the bar.',
      'Lower slowly, taking at least 2 seconds, and stop any swing before the next rep.',
      'Keep the upper body quiet; the movement comes from the hips and trunk.',
    ],
    cues: [
      'Dead still before each rep',
      'Curl pelvis up',
      'Slow lowering, no swing',
      'Lats on, shoulders down',
    ],
    mistakes: [
      {
        title: 'Swinging',
        fix: 'Pause at the bottom, re-brace and only start when the body is still.',
      },
      {
        title: 'Hip-flexor-only lift',
        fix: 'Think about rolling the pelvis up toward the ribs instead of just lifting the legs.',
      },
      {
        title: 'Dropping the legs',
        fix: 'Lower the legs slowly under control rather than letting them fall.',
      },
      {
        title: 'Progressing too early',
        fix: 'Master strict bent-knee raises before straightening the legs or going to toes-to-bar.',
      },
      {
        title: 'Grip gives out first',
        fix: 'Build grip with dead hangs or use straps so the abs remain the limiting factor.',
      },
    ],
    breathing: 'Exhale as you raise the legs, inhale as you lower them.',
    regressions: [
      'Hanging knee raise (bent knee)',
      'Captain chair / Roman chair knee raise',
      'Lying leg raise on the floor',
    ],
    progressions: [
      'Straight legs to horizontal',
      'Toes-to-bar (strict)',
      'Ankle weights on straight-leg raises',
    ],
    sources: [
      {
        title: 'How to Do Hanging Leg Raises for a Rock Solid Core – BarBend',
        url: 'https://barbend.com/hanging-leg-raises/',
      },
      {
        title: 'Lift Up Your Ab Workouts with the Hanging Knee Raise – BarBend',
        url: 'https://barbend.com/hanging-knee-raises/',
      },
      {
        title: 'Hanging Leg Raise – ExRx.net',
        url: 'https://exrx.net/WeightExercises/HipFlexors/BWHangingLegRaise',
      },
    ],
  },

  'rowing-stroke': {
    id: 'rowing-stroke',
    name: 'Rowing Stroke (Erg)',
    summary:
      'The indoor rowing stroke in four phases: catch, drive (legs → body → arms), finish, and recovery (arms → body → legs). Power comes from the legs, the low back stays neutral, and the recovery takes about twice as long as the drive.',
    muscles: {
      primary: ['Quadriceps', 'Gluteus maximus', 'Hamstrings', 'Latissimus dorsi'],
      secondary: ['Erector spinae', 'Core', 'Rhomboids and trapezius', 'Biceps', 'Forearms', 'Calves'],
    },
    equipment: ['Rowing machine (Concept2 RowErg or similar)'],
    setup: [
      'Strap the feet in so the strap crosses the widest part of the foot.',
      'Set the damper to about 3–5 – a higher number is not a harder workout, it just feels heavier.',
      'Hold the handle lightly with fingers wrapped around it and wrists flat.',
      'Start at the catch: arms straight, shins near vertical, body leaning slightly forward from the hips, back neutral.',
    ],
    execution: [
      'Drive: push hard with the legs first while arms stay straight and the back holds its angle.',
      'As the legs near straight, swing the body back past vertical by opening the hips, then pull the arms in last.',
      "Finish: legs long, slight lean back (about 11 o'clock) supported by the core, handle just below the ribs, shoulders low.",
      'Recovery: arms extend first, then lean the body forward from the hips, then bend the knees and slide forward once the hands pass the knees.',
      'Keep the recovery relaxed – about twice as long as the drive (1:2 rhythm).',
      'Intervals: use about 24–30 spm for most work; hard intervals may go up to about 28–32 spm, but raise rate only if power and stroke length stay.',
    ],
    cues: [
      'Legs, body, arms',
      'Arms, body, legs back',
      'Neutral back, relaxed shoulders',
      'Quick drive, slow recovery',
      'Damper 3–5',
    ],
    mistakes: [
      {
        title: 'Arms bending too early',
        fix: 'Keep the arms straight until the legs are almost fully extended.',
      },
      {
        title: 'Rounded low back',
        fix: 'Hinge forward from the hips with a tall spine instead of slumping at the catch.',
      },
      {
        title: 'Knees bending too early',
        fix: 'On the recovery let the hands clear the knees before the knees bend.',
      },
      {
        title: 'Rushing the slide',
        fix: 'Slow down the recovery so it lasts about twice as long as the drive.',
      },
      {
        title: 'Damper set to 10',
        fix: 'Row at damper 3–5 and create intensity by pushing harder with the legs.',
      },
    ],
    breathing:
      'Exhale during the drive and inhale during the recovery; at high rates you may take an extra breath per stroke.',
    regressions: [
      'Arms-only, then arms-and-body drill',
      'Pause drill at arms-away position',
      'Low stroke rate (18–22 spm) steady rowing',
    ],
    progressions: [
      'Higher intensity at the same stroke rate',
      'Harder intervals at 28–32 spm',
      'Longer or more interval repeats',
    ],
    sources: [
      {
        title: 'Indoor Rowing Technique on the Concept2 RowErg',
        url: 'https://www.concept2.com/training/rowing-technique',
      },
      {
        title: 'Improve Your Rowing Technique – Concept2',
        url: 'https://www.concept2.com/training/improve-your-rowing-technique',
      },
      {
        title: 'What is the Best Damper Setting for Me? – Concept2',
        url: 'https://www.concept2.com/blog/what-is-the-best-damper-setting-for-me',
      },
      {
        title: 'Rowing Stroke Rate Explained – Concept2',
        url: 'https://www.concept2.com/blog/rowing-stroke-rate-explained',
      },
      {
        title: 'Debunking the Myths: Damper Setting, Stroke Rate and Intensity – Concept2',
        url: 'https://www.concept2.com/blog/debunking-the-myths-damper-setting-stroke-rate-and-intensity',
      },
    ],
  },
};
