#!/usr/bin/env python3
"""Build data.js for the Exercise Explorer from a local clone of
https://github.com/hasaneyldrm/exercises-dataset.

    python3 tools/exercise-explorer/build.py [path/to/exercises-dataset]
    python3 tools/exercise-explorer/build.py --web      # deployable copy in tools/exercise-explorer/dist/

--web makes a private, password-protected site (web/middleware.js): English + Spanish text only,
thumbnails copied in, GIFs loaded from the dataset repo at the pinned commit.

The dataset path defaults to ../exercises-dataset next to this repo. The local build copies no media:
the page loads images and GIFs straight from the dataset clone. The media is (c) Gym visual; the web
build copies the 180x180 thumbnails for a private, attributed, password-protected site only.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
WEB = '--web' in sys.argv
args = [a for a in sys.argv[1:] if a != '--web']
dataset = os.path.abspath(args[0] if args else os.path.join(REPO, '..', 'exercises-dataset'))
DATASET_COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
WEB_LANGS = ('en', 'es')

src = os.path.join(dataset, 'data', 'exercises.json')
if not os.path.exists(src):
    sys.exit(f'Dataset not found at {src}\nClone it: git clone https://github.com/hasaneyldrm/exercises-dataset.git')

with open(src, encoding='utf-8') as f:
    exercises = json.load(f)

# The Taxonomy lens reads the live Supabase catalog with the public (publishable) key from .env.
env = {}
env_path = os.path.join(REPO, '.env')
if os.path.exists(env_path):
    with open(env_path, encoding='utf-8') as f:
        for line in f:
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.strip().split('=', 1)
                env[k] = v

payload = {
    'mediaRoot': os.path.relpath(dataset, HERE).replace(os.sep, '/'),
    'source': 'https://github.com/hasaneyldrm/exercises-dataset',
    'supabase': {'url': env.get('SUPABASE_URL', ''), 'key': env.get('SUPABASE_ANON_KEY', '')},
    'exercises': exercises,
}
def write_data(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('window.EXPLORER_DATA = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')


if not WEB:
    out = os.path.join(HERE, 'data.js')
    write_data(out, payload)
    print(f'Wrote {len(exercises)} exercises to {os.path.relpath(out, REPO)} (media root: {payload["mediaRoot"]})')
    sys.exit()

import shutil
dist = os.path.join(HERE, 'dist')
os.makedirs(dist, exist_ok=True)
for name in os.listdir(dist):                 # keep .vercel (the project link) between builds
    if name not in ('.vercel', '.vercelignore'):
        path = os.path.join(dist, name)
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
os.makedirs(os.path.join(dist, 'media', 'images'))
trimmed = [{**e, 'instructions': {l: e['instructions'][l] for l in WEB_LANGS},
            'instruction_steps': {l: e['instruction_steps'][l] for l in WEB_LANGS}} for e in exercises]
write_data(os.path.join(dist, 'data.js'), {
    **payload, 'exercises': trimmed, 'mediaRoot': 'media',
    'gifRoot': f'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/{DATASET_COMMIT}',
    'sourceLangs': sorted(exercises[0]['instructions']),
})
for e in exercises:
    shutil.copy2(os.path.join(dataset, e['image']), os.path.join(dist, 'media', 'images'))
shutil.copy2(os.path.join(HERE, 'index.html'), dist)
shutil.copy2(os.path.join(HERE, 'web', 'middleware.js'), dist)
with open(os.path.join(dist, '.vercelignore'), 'w') as f:   # never upload env files pulled by `vercel link`
    f.write('.env*\n')
with open(os.path.join(dist, 'package.json'), 'w') as f:   # marks the folder as an ES-module project for the middleware
    json.dump({'name': 'exercise-explorer', 'private': True, 'type': 'module'}, f, indent=1)
size = sum(os.path.getsize(os.path.join(r, n)) for r, _, fs in os.walk(dist) for n in fs)
print(f'Wrote {os.path.relpath(dist, REPO)}/ ({size // 1024 // 1024} MB): {len(exercises)} exercises, {len(WEB_LANGS)} languages, thumbnails copied, GIFs from the dataset repo')
