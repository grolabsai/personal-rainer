#!/usr/bin/env python3
"""First-pass unification of exercises-dataset records into canonical exercises + variations.

    python3 tools/unify/classify.py [path/to/exercises.json]

Each dataset record becomes a *variation* of one canonical *exercise*, described by attribute values
(grip, bench angle, position, laterality, ...) and the equipment it needs. Stretches, cardio and mobility
records are typed but not broken into variations: each is its own exercise.

Rule: an exercise is one joint action + primary muscle. Anything that only changes how it is done
(grip, angle, stance, equipment, one arm) is a variation. Joint action differs -> different exercise
(wrist curl vs reverse wrist curl, crunch vs reverse crunch).

Writes tools/unify/proposal.json and prints a summary. Nothing here touches the database.
"""
import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, '..', 'exercises-dataset', 'data', 'exercises.json')

# ---------------------------------------------------------------------------------------------
# Name normalisation: fix the dataset's spelling variants before any rule reads the name.
FIXES = [
    (r'в°', '°'), (r'\brevers\b', 'reverse'), (r'\bsitted\b', 'seated'), (r'\bpeacher\b', 'preacher'),
    (r'\brollerout\b', 'rollout'), (r'\bflyes\b', 'fly'), (r'\bbicep\b', 'biceps'), (r'\btricep\b', 'triceps'),
    (r'\bpull up\b', 'pull-up'), (r'\bpush up\b', 'push-up'), (r'\bchin up\b', 'chin-up'), (r'\bpullup\b', 'pull-up'),
    (r'\bsquad\b', 'quad'), (r'\bcurls\b', 'curl'), (r'\bcrunches\b', 'crunch'), (r'\bdips\b', 'dip'),
    (r'\braises\b', 'raise'), (r'\bkickbacks\b', 'kickback'), (r'\btwists\b', 'twist'), (r'\bdumbbells\b', 'dumbbell'),
    (r'\bexercise ball\b', 'stability ball'), (r'\bwide-grip\b', 'wide grip'), (r'\bclose-grip\b', 'close grip'),
    (r'\breverse-grip\b', 'reverse grip'), (r'\bbent-over\b', 'bent over'), (r'\bez-bar(bell)?\b', 'ez barbell'),
    (r'\bez bar\b', 'ez barbell'), (r'\bpalms-in\b|\bpalm-in\b', 'palms in'), (r'\bsz-bar\b', 'ez barbell'),
]
# Suffixes that describe the media (camera angle, model, version), not the exercise.
MEDIA_NOTES = r'\((?:back|side) pov\)|\((?:fe)?male\)|\bv\. ?\d\b|\bmale$'


def normalise(name):
    n = name.lower().strip()
    for a, b in FIXES:
        n = re.sub(a, b, n)
    notes = re.findall(MEDIA_NOTES, n)
    n = re.sub(MEDIA_NOTES, '', n)
    return re.sub(r'\s+', ' ', n).strip(' -'), [x.strip('() ') for x in notes]


# ---------------------------------------------------------------------------------------------
# Exercise types that are not broken into variations.
TYPE_RULES = [
    ('stretch', r'\bstretch(?! lunge)|yoga|\bpose\b|sphinx|upward facing dog|hug keens|world greatest|rocking frog|'
                r'butterfly|back pec|one arm against wall|side lying floor|standing lateral|seated lower back|'
                r'standing calves$|^quads$|intermediate hip flexor'),
    ('mobility', r'circles|pelvic tilt|toe touch|arm slingers|spine twist|inchworm|overhead reach|balance board|'
                 r'flexor depresor|bent knee lying twist|isometric wipers|wrist circles'),
    ('cardio', r'burpee|jump rope|battling ropes|^run\b|stride run|wind sprints|stationary bike|elliptical|treadmill|stepmill|'
               r'ergometer|hands bike|high knee|bear crawl|skater hops|ski step|jumps\b|jump \(|star jump|'
               r'back and forth step|half knee bends|swing 360|wheel run|push to run|mountain climber|quick feet'),
]

# ---------------------------------------------------------------------------------------------
# Canonical strength exercises: (id, en, es, regex). Order matters — first match wins, so specific
# patterns come before the general ones that contain them ("wrist curl" before "curl").
EXERCISES = [
    # Forearms and grip
    ('reverse-wrist-curl', 'Reverse wrist curl', 'Curl de muñeca invertido', r'(reverse|back|palms down) wrist curl|reverse wrist'),
    ('wrist-curl', 'Wrist curl', 'Curl de muñeca', r'wrist curl'),
    ('finger-curl', 'Finger curl', 'Curl de dedos', r'finger curl'),
    ('forearm-rotation', 'Forearm rotation', 'Rotación de antebrazo', r'pronation|supination|seated one arm rotate'),
    ('grip-squeeze', 'Grip squeeze', 'Apretón de agarre', r'gripper|hand squeeze'),
    ('wrist-roller', 'Wrist roller', 'Rodillo de muñeca', r'wrist roller'),
    # Specific names that would otherwise be caught by a broader rule below
    ('back-extension', 'Back extension', 'Extensión lumbar', r'hyperextension(?!.*reverse)|back extension|lower back curl|prone leg raise'),
    ('reverse-hyperextension', 'Reverse hyperextension', 'Hiperextensión inversa', r'reverse hyper'),
    ('hip-rotation', 'Hip rotation', 'Rotación de cadera', r'hip (internal|external) rotation|lower body rotation'),
    ('tibialis-raise', 'Tibialis raise', 'Elevación de puntas (tibial)', r'reverse calf raise|toe raise'),
    ('calf-raise', 'Calf raise', 'Elevación de talones', r'calf press'),
    ('leg-curl', 'Leg curl', 'Curl femoral', r'leg curl|glute-ham raise|lying femoral|hamstring curl'),
    ('leg-extension', 'Leg extension', 'Extensión de cuádriceps', r'leg extension'),
    ('chest-dip', 'Chest dip', 'Fondos de pecho', r'chest dip|korean dip|straight bar dip'),
    ('shoulder-raise', 'Scapular protraction', 'Protracción escapular', r'shoulder raise|scapula push|push-up plus'),
    ('overhead-press', 'Overhead press', 'Press de hombros', r'handstand push'),
    # Arms (before presses, lunges and squats, so combos like "biceps curl to press" stay with their target)
    ('pullover', 'Pullover', 'Pullover', r'pullover'),
    ('straight-arm-pulldown', 'Straight-arm pulldown', 'Jalón con brazos rectos', r'straight arm pulldown|pushdown \(straight arm\)|incline pushdown'),
    ('triceps-extension', 'Triceps extension', 'Extensión de tríceps', r'triceps extension|triceps press|skull ?crusher|skull press|face press|french press|'
                                                                     r'tate press|jm bench|elbow press|lying extension|lying .*extension|seated bench extension|'
                                                                     r'standing one arm extension|two arm extension|concentration extension|pronate-grip|'
                                                                     r'lying single extension|alternate extension'),
    ('triceps-pushdown', 'Triceps pushdown', 'Extensión de tríceps en polea (pushdown)', r'pushdown|rear drive'),
    ('triceps-kickback', 'Triceps kickback', 'Patada de tríceps', r'kickback'),
    ('biceps-curl', 'Biceps curl', 'Curl de bíceps', r'(?<!back )\bcurl\b(?!-up)'),
    # Shoulders and upper back
    ('rear-delt-fly', 'Rear delt fly', 'Pájaros (deltoides posterior)', r'reverse fly|rear fly|rear lateral raise|rear delt raise|deltoid rear|t-raise|lateral bent over'),
    ('rear-delt-row', 'Rear delt row', 'Remo para deltoides posterior', r'rear delt(oid)? row'),
    ('upright-row', 'Upright row', 'Remo al mentón', r'upright row|high pull|snatch pull'),
    ('shoulder-rotation', 'Shoulder rotation', 'Rotación de hombro', r'shoulder (internal|external) rotation|external shoulder rotation|cuban press'),
    ('lateral-raise', 'Lateral raise', 'Elevación lateral', r'lateral raise|full can|side lying one hand raise|incline raise|round arm'),
    ('front-raise', 'Front raise', 'Elevación frontal', r'front raise|forward raise|front shoulder raise|standing alternate raise|dumbbell raise$|around world'),
    ('y-raise', 'Y-raise', 'Elevación en Y', r'y-raise'),
    ('shrug', 'Shrug', 'Encogimiento de hombros', r'shrug|scapula dip'),
    # Back
    ('muscle-up', 'Muscle-up', 'Muscle-up', r'muscle[- ]up'),
    ('lat-pulldown', 'Lat pulldown', 'Jalón al pecho', r'pulldown|rocky pull-up'),
    ('pull-up', 'Pull-up / chin-up', 'Dominada', r'pull-up|chin-up|chin-ups|chin\b|sternum chin|l-pull|archer pull'),
    ('row', 'Row', 'Remo', r'\brow\b|renegade|kayak'),
    # Chest
    ('chest-fly', 'Chest fly', 'Aperturas de pecho', r'\bfly\b|cross-?over(?!.*pulldown)|crossovers|breeding|iron cross'),
    ('push-up', 'Push-up', 'Flexión', r'push-up'),
    ('bench-press', 'Bench press', 'Press de banca', r'bench press|chest press|floor press|press on floor|decline press|incline press|'
                                                   r'lying .*press|guillotine|svend|press on stability ball|hammer press|close grip press|'
                                                   r'palms in incline|reverse grip press|pin press|incline alternate press|'
                                                   r'one arm press|twisting bench|decline wide grip press|wide bench|wide reverse grip bench'),
    # Legs and hips
    ('calf-raise', 'Calf raise', 'Elevación de talones', r'calf raise|calf press|rotary calf'),
    ('leg-press', 'Leg press', 'Prensa de piernas', r'leg press|leg wide press|one leg press'),
    ('split-squat', 'Split squat', 'Sentadilla búlgara / dividida', r'split squat'),
    ('sissy-squat', 'Sissy squat', 'Sentadilla sissy', r'sissy squat'),
    ('squat-jump', 'Jump squat', 'Sentadilla con salto', r'jump squat|plyo squat|squat jump'),
    ('lunge', 'Lunge', 'Zancada', r'lunge|curtsey squat|cossack'),
    ('step-up', 'Step-up', 'Subida al cajón', r'step-up|step up'),
    ('hip-abduction', 'Hip abduction', 'Abducción de cadera', r'abduct|monster walk'),
    ('hip-adduction', 'Hip adduction', 'Aducción de cadera', r'adduction'),
    ('hip-thrust', 'Hip thrust / glute bridge', 'Hip thrust / puente de glúteos', r'glute bridge|hip thrust|hip lift|(?<!side )(?<!london )\bbridge\b(?! -)|lying lifting \(on hip\)'),
    ('hip-extension', 'Hip extension', 'Extensión de cadera', r'hip extension|flutter kicks|swimmer kicks'),
    ('good-morning', 'Good morning', 'Buenos días', r'good morning'),
    ('pull-through', 'Pull-through', 'Pull-through', r'pull through'),
    ('deadlift', 'Deadlift', 'Peso muerto', r'deadlift|rack pull'),
    ('squat', 'Squat', 'Sentadilla', r'squat|march sit'),
    # Shoulders (the broad press pattern goes after bench press so floor/chest presses are not caught)
    ('overhead-press', 'Overhead press', 'Press de hombros', r'shoulder press|military press|overhead press|arnold press|behind (neck|head).*press|'
                                                          r'push press|bradford|scott press|w-press|palms? in press|side press|seesaw press|'
                                                          r'alternate press|seated press|bench seated press|alternating press|anti gravity press|seated alternate shoulder'),
    ('triceps-dip', 'Triceps dip', 'Fondos de tríceps', r'\bdip\b|body-up'),
    # Core
    ('reverse-crunch', 'Reverse crunch', 'Crunch inverso', r'reverse crunch|tuck crunch|pull-in|leg pull in|butt-ups|bottoms-up'),
    ('crunch', 'Crunch', 'Crunch', r'crunch|curl-up|cocoons|elbow-to-knee|elbow to knee|heel touchers|air bike|otis up'),
    ('sit-up', 'Sit-up', 'Abdominal completo (sit-up)', r'sit-?up|sit up'),
    ('leg-raise', 'Leg raise', 'Elevación de piernas', r'leg raise|knee raise|hip raise|hanging pike|leg-hip raise|kick out sit'),
    ('v-up', 'V-up', 'V-up', r'v-up|jack knife|jackknife'),
    ('russian-twist', 'Rotational twist', 'Giro de tronco', r'twist(?!ing)|judo flip|landmine 180|standing lift|spell caster|figure 8'),
    ('side-bend', 'Side bend', 'Flexión lateral', r'side bend|side bent|side hip \(on parallel'),
    ('ab-rollout', 'Ab rollout', 'Rueda abdominal', r'rollout|fallout|body saw'),
    ('pallof-press', 'Pallof press', 'Press Pallof', r'pallof'),
    ('dead-bug', 'Dead bug', 'Dead bug', r'dead bug'),
    ('plank', 'Plank', 'Plancha', r'plank|side bridge|shoulder tap|power point|l-sit|v-sit'),
    ('windmill', 'Windmill', 'Molino', r'windmill|bent press'),
    # Olympic and kettlebell
    ('clean-and-jerk', 'Clean and jerk', 'Dos tiempos', r'clean and jerk|clean and press'),
    ('jerk', 'Jerk', 'Envión', r'\bjerk\b'),
    ('snatch', 'Snatch', 'Arrancada', r'snatch'),
    ('clean', 'Clean', 'Cargada', r'\bclean\b'),
    ('thruster', 'Thruster', 'Thruster', r'thruster'),
    ('kettlebell-swing', 'Swing', 'Swing', r'swing'),
    ('turkish-get-up', 'Turkish get-up', 'Levantamiento turco', r'turkish get up'),
    ('carry', 'Loaded carry', 'Paseo del granjero', r'carry|farmers walk'),
    ('slam', 'Slam / throw', 'Lanzamiento', r'slam|throw|chest pass|chest push|catch and overhead'),
    # Calisthenics skills
    ('planche', 'Planche', 'Plancha (planche)', r'planche'),
    ('front-lever', 'Front lever', 'Front lever', r'front lever'),
    ('back-lever', 'Back lever', 'Back lever', r'back lever|skin the cat'),
    ('maltese', 'Maltese', 'Maltesa', r'maltese'),
    ('human-flag', 'Human flag', 'Bandera humana', r'^flag$'),
    ('handstand', 'Handstand', 'Pino', r'handstand'),
]

# ---------------------------------------------------------------------------------------------
# Equipment: the dataset's single field, normalised, plus items the name reveals.
EQUIPMENT = {  # id: (en, es)
    'bodyweight': ('Bodyweight', 'Peso corporal'), 'dumbbell': ('Dumbbell', 'Mancuerna'), 'barbell': ('Barbell', 'Barra'),
    'ez-bar': ('EZ bar', 'Barra EZ'), 'trap-bar': ('Trap bar', 'Barra hexagonal'), 'cambered-bar': ('Cambered bar', 'Barra curva'),
    'kettlebell': ('Kettlebell', 'Pesa rusa'), 'cable': ('Cable machine', 'Polea'), 'band': ('Resistance band', 'Banda elástica'),
    'machine': ('Lever machine', 'Máquina de palanca'), 'smith-machine': ('Smith machine', 'Máquina Smith'),
    'sled-machine': ('Sled / leg press machine', 'Prensa / máquina de trineo'), 'medicine-ball': ('Medicine ball', 'Balón medicinal'),
    'stability-ball': ('Stability ball', 'Fitball'), 'bosu': ('Bosu ball', 'Bosu'), 'roller': ('Foam roller', 'Rodillo de espuma'),
    'ab-wheel': ('Ab wheel', 'Rueda abdominal'), 'rope': ('Rope', 'Cuerda'), 'bench': ('Bench', 'Banco'),
    'preacher-bench': ('Preacher bench', 'Banco Scott'), 'pull-up-bar': ('Pull-up bar', 'Barra de dominadas'),
    'dip-bars': ('Dip bars', 'Paralelas'), 'box': ('Box / step', 'Cajón / step'), 'wall': ('Wall', 'Pared'),
    'towel': ('Towel', 'Toalla'), 'suspension-trainer': ('Suspension trainer', 'Entrenador en suspensión'),
    'rings': ('Gymnastic rings', 'Anillas'), 'landmine': ('Landmine', 'Landmine'), 'sledgehammer': ('Sledgehammer', 'Mazo'),
    'tire': ('Tire', 'Neumático'), 'arm-blaster': ('Arm blaster', 'Arm blaster'), 'weight-plate': ('Weight plate / vest', 'Disco / chaleco lastrado'),
    'cardio-machine': ('Cardio machine', 'Máquina de cardio'), 'chair': ('Chair', 'Silla'),
}
FIELD_EQUIPMENT = {
    'body weight': ['bodyweight'], 'dumbbell': ['dumbbell'], 'barbell': ['barbell'], 'olympic barbell': ['barbell'],
    'ez barbell': ['ez-bar'], 'trap bar': ['trap-bar'], 'kettlebell': ['kettlebell'], 'cable': ['cable'], 'band': ['band'],
    'resistance band': ['band'], 'leverage machine': ['machine'], 'smith machine': ['smith-machine'],
    'sled machine': ['sled-machine'], 'medicine ball': ['medicine-ball'], 'stability ball': ['stability-ball'],
    'bosu ball': ['bosu'], 'roller': ['roller'], 'wheel roller': ['ab-wheel'], 'rope': ['rope'], 'hammer': ['sledgehammer'],
    'tire': ['tire'], 'weighted': ['bodyweight', 'weight-plate'], 'assisted': ['bodyweight'],
    'stationary bike': ['cardio-machine'], 'elliptical machine': ['cardio-machine'], 'stepmill machine': ['cardio-machine'],
    'skierg machine': ['cardio-machine'], 'upper body ergometer': ['cardio-machine'],
}
NAME_EQUIPMENT = [  # (regex on normalised name, equipment id)
    (r'stability ball', 'stability-ball'), (r'bosu', 'bosu'), (r'preacher', 'preacher-bench'), (r'arm blaster', 'arm-blaster'),
    (r'towel', 'towel'), (r'suspended|straps', 'suspension-trainer'), (r'ring dip', 'rings'), (r'landmine', 'landmine'),
    (r'cambered bar', 'cambered-bar'), (r'wall\b', 'wall'), (r'chair', 'chair'), (r'\bbox\b|step-up|step up|stepbox|staircase', 'box'),
    (r'medicine ball', 'medicine-ball'), (r'(pull-up|chin-up|chin\b|hanging|muscle-up|front lever|back lever|skin the cat|rope climb|l-pull)', 'pull-up-bar'),
    (r'parallel bars|dip cage|chest dip|triceps dip(?! \(bench)|straight bar dip|korean dip|impossible dip|elbow dip|one arm dip|vertical leg raise', 'dip-bars'),
    (r'bench|incline|decline|preacher|bench dip|three bench', 'bench'),
]

# ---------------------------------------------------------------------------------------------
# Variation dimensions. Each value: (en, es, regex on normalised name). Only strength records are parsed.
DIMENSIONS = {
    'bench_angle': ('Bench angle', 'Ángulo del banco', {
        'incline': ('Incline', 'Inclinado', r'\bincline\b'), 'decline': ('Decline', 'Declinado', r'\bdecline\b')}),
    'position': ('Body position', 'Posición', {
        'standing': ('Standing', 'De pie', r'\bstanding\b'), 'seated': ('Seated', 'Sentado', r'\bseated\b|\bsitting\b'),
        'lying': ('Lying', 'Tumbado', r'\blying\b|\bsupine\b'), 'prone': ('Prone', 'Boca abajo', r'\bprone\b'),
        'kneeling': ('Kneeling', 'De rodillas', r'\bkneeling\b|on knees'), 'bent-over': ('Bent over', 'Inclinado hacia delante', r'bent over'),
        'hanging': ('Hanging', 'Colgado', r'\bhanging\b'), 'side-lying': ('Side-lying', 'De lado', r'side lying')}),
    'grip': ('Grip', 'Agarre', {
        'supinated': ('Underhand grip', 'Agarre supino', r'underhand|palms? up|supinated|chin-?ups?\b(?!.*(parallel|neutral|mixed))'),
        'pronated': ('Overhand (reverse) grip', 'Agarre prono', r'reverse grip|overhand|pronated|pronate-grip|palms down|'
                                                              r'(biceps curl|preacher curl|spider curl|concentration curl) reverse|reverse (curl|preacher|spider|one arm curl|biceps)|'
                                                              r'standing (one arm )?reverse curl|reverse t-bar|t-bar reverse'),
        'neutral': ('Neutral (hammer) grip', 'Agarre neutro (martillo)', r'hammer|neutral|parallel grip|palms? in|v-bar|twin handle|rope'),
        'mixed': ('Mixed grip', 'Agarre mixto', r'mixed grip')}),
    'grip_width': ('Grip width', 'Anchura de agarre', {
        'close': ('Close grip', 'Agarre cerrado', r'close grip|narrow(?! stance)|diamond'),
        'wide': ('Wide grip', 'Agarre abierto', r'\bwide\b(?! stance| squat| angle)')}),
    'laterality': ('Arms / legs', 'Brazos / piernas', {
        'one-arm': ('One arm', 'A un brazo', r'one arm|single arm|one hand|unilateral'),
        'alternating': ('Alternating', 'Alterno', r'\balternat'),
        'single-leg': ('Single leg', 'A una pierna', r'one leg|single leg|pistol|stork stance')}),
    'stance': ('Stance', 'Postura', {
        'sumo': ('Sumo', 'Sumo', r'\bsumo\b'), 'narrow': ('Narrow stance', 'Postura estrecha', r'narrow stance'),
        'wide': ('Wide stance', 'Postura abierta', r'wide (stance|squat)')}),
    'style': ('Style', 'Estilo', {
        'concentration': ('Concentration', 'Concentrado', r'concentration'), 'preacher': ('Preacher', 'Scott (predicador)', r'preacher'),
        'drag': ('Drag', 'Arrastre', r'\bdrag\b'), 'zottman': ('Zottman', 'Zottman', r'zottman'), 'spider': ('Spider', 'Spider', r'\bspider\b'),
        'overhead': ('Overhead', 'Por encima de la cabeza', r'overhead|above head|over head'),
        'behind-neck': ('Behind the neck', 'Tras nuca', r'behind (neck|head)|back of the head'),
        'front': ('Front', 'Frontal', r'\bfront (squat|chest squat)|clean grip|clean-grip|zercher|goblet'),
        'romanian': ('Romanian', 'Rumano', r'romanian'), 'stiff-leg': ('Stiff / straight leg', 'Piernas rígidas', r'stiff leg|straight leg deadlift'),
        'hack': ('Hack', 'Hack', r'\bhack\b'), 'jump': ('Explosive / jump', 'Explosivo / con salto', r'\bjump|plyo|clap|drop push|depth jump|explosive'),
        'isometric': ('Isometric hold', 'Isométrico', r'isometric|hold\b'), 'twisting': ('With twist', 'Con giro', r'twisting|twisted|with twist|rotational'),
        'arnold': ('Arnold', 'Arnold', r'arnold'), 'push-press': ('Push press', 'Push press', r'push press'),
        'straight-arm': ('Straight arm', 'Brazos rectos', r'straight arm'), 'bent-arm': ('Bent arm', 'Brazos flexionados', r'bent arm|bent knee'),
        'high': ('High', 'Alto', r'\bhigh (bar|pulley|row|curl|reverse)'), 'low': ('Low', 'Bajo', r'\blow (bar|fly|seated|row)'),
        'deficit': ('Deficit / extended range', 'Déficit / rango ampliado', r'deep|extended range|full range'),
        'partial': ('Partial range', 'Rango parcial', r'half|quarter|3/4|semi|rack pull|pin press'),
        'weighted': ('Weighted', 'Con lastre', r'\bweighted\b'), 'assisted': ('Assisted', 'Asistido', r'assisted'),
    }),
}


FILLER = (r'\b(dumbbells?|barbell|olympic|ez|lever|leverage|machine|smith|sled|cable|band|resistance|kettlebell|bodyweight|'
          r'body weight|stability ball|bosu ball|bosu|medicine ball|roller|with|on|the|a|an|of|to|and|over|arm blaster|'
          r'attachment|bench|two arm|two legs?|both legs|exercise|biceps|triceps|leg|legs|arms?)\b')


LABEL_STOP = {'ing', 'grip', 'press', 'raise', 'extension', 'ion', 'chest', 'reverse', 'lat', 'hip', 'squat', 'pulldown'}


def residual_label(name, rule, attrs):
    """Words the rules did not explain: named techniques (kipping, archer, pike) or combos (lunge with curl)."""
    s = re.sub(rule, ' ', name, count=1)
    for dim, vals in attrs.items():
        for v in vals:
            rx = DIMENSIONS[dim][2][v][2]
            s = re.sub(rx, ' ', s)
    s = re.sub(FILLER, ' ', s)
    s = re.sub(r'[()\[\],\-_.]', ' ', s)
    words = [w for w in s.split() if len(w) > 2 and w not in LABEL_STOP]
    return ' '.join(words) or None


def classify(rec):
    name, notes = normalise(rec['name'])
    etype = 'strength'
    if rec['target'] == 'cardiovascular system':
        etype = 'cardio'
    else:
        for t, rx in TYPE_RULES:
            if re.search(rx, name):
                etype = t
                break

    equipment = list(dict.fromkeys(FIELD_EQUIPMENT.get(rec['equipment'], [rec['equipment']])))
    for rx, eq in NAME_EQUIPMENT:
        if re.search(rx, name) and eq not in equipment:
            equipment.append(eq)
    if len(equipment) > 1 and 'bodyweight' in equipment and rec['equipment'] not in ('body weight', 'weighted', 'assisted'):
        equipment.remove('bodyweight')

    exercise, rule = None, None
    attrs = {}
    if etype == 'strength':
        for ex_id, en, es, rx in EXERCISES:
            if re.search(rx, name):
                exercise, rule = ex_id, rx
                break
        for dim, (_, _, values) in DIMENSIONS.items():
            hits = [v for v, (_, _, rx) in values.items() if re.search(rx, name)]
            if hits:
                attrs[dim] = hits
        if rec['equipment'] == 'weighted':
            attrs.setdefault('style', []).append('weighted') if 'weighted' not in attrs.get('style', []) else None
        if rec['equipment'] == 'assisted':
            attrs.setdefault('style', []).append('assisted') if 'assisted' not in attrs.get('style', []) else None
        # Bench presses with no angle word are flat.
        if exercise == 'bench-press' and 'bench_angle' not in attrs:
            attrs['bench_angle'] = ['flat']
    label = residual_label(name, rule, attrs) if etype == 'strength' and rule else None
    if exercise is None:
        exercise = 'x-' + re.sub(r'[^a-z0-9]+', '-', name).strip('-')   # singleton, one record = one exercise
    return {
        'id': rec['id'], 'source_name': rec['name'], 'clean_name': name, 'media_notes': notes, 'type': etype,
        'exercise_id': exercise, 'matched_rule': rule, 'equipment': equipment, 'attributes': attrs, 'variant_label': label,
        'target': rec['target'], 'body_part': rec['body_part'],
    }


DIMENSIONS.setdefault('bench_angle', DIMENSIONS['bench_angle'])[2]['flat'] = ('Flat', 'Plano', r'(?!)')
EX_META = {}
for _e in EXERCISES:
    EX_META.setdefault(_e[0], {'en': _e[1], 'es': _e[2]})


NAMES_ES = json.load(open(os.path.join(HERE, 'names_es.json'), encoding='utf-8'))


def main():
    with open(SRC, encoding='utf-8') as f:
        data = json.load(f)
    variants = [classify(r) for r in data]

    # Exercises: canonical rules + singletons. Primary muscle = most common target among its variations.
    by_ex = collections.defaultdict(list)
    for v in variants:
        by_ex[v['exercise_id']].append(v)
    exercises = []
    for ex_id, vs in by_ex.items():
        meta = EX_META.get(ex_id)
        if meta is None:  # singleton: name it after the cleaned record name; Spanish from names_es.json
            nm = vs[0]['clean_name']
            meta = {'en': nm[:1].upper() + nm[1:], 'es': NAMES_ES.get(ex_id)}
        types = collections.Counter(v['type'] for v in vs)
        exercises.append({
            'id': ex_id, 'names': meta, 'type': types.most_common(1)[0][0],
            'canonical': ex_id in EX_META, 'variation_count': len(vs),
            'primary_target': collections.Counter(v['target'] for v in vs).most_common(1)[0][0],
            'equipment': sorted({e for v in vs for e in v['equipment']}),
        })

    # Duplicates: same cleaned name and equipment — usually another camera angle or model of one movement.
    same = collections.defaultdict(list)
    for v in variants:
        same[(v['clean_name'], tuple(v['equipment']))].append(v['id'])
    duplicates = [ids for ids in same.values() if len(ids) > 1]
    for ids in duplicates:
        for i in ids[1:]:
            next(v for v in variants if v['id'] == i)['duplicate_of'] = ids[0]
    # Indistinct: different names that parse to the same exercise, equipment, attributes and label.
    sig = collections.defaultdict(list)
    for v in variants:
        if v['type'] == 'strength' and not v['exercise_id'].startswith('x-') and 'duplicate_of' not in v:
            key = (v['exercise_id'], tuple(v['equipment']), json.dumps(v['attributes'], sort_keys=True), v['variant_label'])
            sig[key].append(v['id'])
    indistinct = [ids for ids in sig.values() if len(ids) > 1]

    out = {
        'source': 'exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd',
        'equipment': {k: {'en': en, 'es': es} for k, (en, es) in EQUIPMENT.items()},
        'dimensions': {d: {'en': en, 'es': es, 'values': {v: {'en': a, 'es': b} for v, (a, b, _) in vals.items()}}
                       for d, (en, es, vals) in DIMENSIONS.items()},
        'exercises': sorted(exercises, key=lambda e: (-e['variation_count'], e['id'])),
        'variants': variants,
        'duplicates': duplicates,
        'indistinct': indistinct,
    }
    with open(os.path.join(HERE, 'proposal.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    types = collections.Counter(v['type'] for v in variants)
    strength = [v for v in variants if v['type'] == 'strength']
    unmatched = [v for v in strength if v['exercise_id'].startswith('x-')]
    canon = [e for e in exercises if e['canonical']]
    print('records by type:', dict(types))
    print(f'strength records: {len(strength)}  -> matched to {len(canon)} canonical exercises; {len(unmatched)} unmatched (singletons)')
    print(f'total exercises: {len(exercises)}  duplicate groups: {len(duplicates)} ({sum(len(d) for d in duplicates)} records)'
          f'  still indistinct: {len(indistinct)} groups ({sum(len(d) for d in indistinct)} records)')
    print('largest:', [(e['id'], e['variation_count']) for e in sorted(canon, key=lambda e: -e['variation_count'])[:15]])
    print('unmatched strength:', [v['clean_name'] for v in unmatched])
    missing_es = [e['id'] for e in exercises if not e['names'].get('es')]
    if missing_es:
        print('MISSING SPANISH NAME', missing_es)
    unknown_eq = {e for v in variants for e in v['equipment'] if e not in EQUIPMENT}
    if unknown_eq:
        print('UNKNOWN EQUIPMENT', unknown_eq)


if __name__ == '__main__':
    main()
