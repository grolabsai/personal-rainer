#!/usr/bin/env python3
"""Dump every public catalog table from the Supabase project to one JSON file.

    python3 tools/backup_catalog.py [output.json]

Uses the publishable key from .env: catalog tables are publicly readable, so no secret is needed.
User tables (profiles, workouts, ...) are not readable with that key and are not backed up here.
"""
import datetime
import json
import os
import sys
import subprocess

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLES = ['body_parts', 'equipment', 'exercises', 'muscles', 'muscle_paths', 'muscle_sets',
          'muscle_set_members', 'muscle_aliases', 'exercise_muscles', 'exercise_muscle_index']

env = {}
with open(os.path.join(REPO, '.env'), encoding='utf-8') as f:
    for line in f:
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v
url, key = env['SUPABASE_URL'], env['SUPABASE_ANON_KEY']


def fetch_all(table):
    rows, start = [], 0
    while True:
        # curl, not urllib: python.org builds on macOS ship without a CA bundle.
        out = subprocess.run(['curl', '-sf', f'{url}/rest/v1/{table}?select=*', '-H', f'apikey: {key}',
                              '-H', f'Authorization: Bearer {key}', '-H', 'Range-Unit: items',
                              '-H', f'Range: {start}-{start + 999}'], capture_output=True, text=True, check=True)
        page = json.loads(out.stdout)
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


today = datetime.date.today().isoformat()
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'supabase', 'backups', f'catalog-{today}.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
dump = {'project': url, 'taken_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tables': {}}
for t in TABLES:
    dump['tables'][t] = fetch_all(t)
    print(f'{t:24} {len(dump["tables"][t]):6} rows')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(dump, f, ensure_ascii=False, indent=1)
print(f'Wrote {os.path.relpath(out, REPO)} ({os.path.getsize(out) // 1024} KB)')
