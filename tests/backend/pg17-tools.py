#!/usr/bin/env python3
"""Prepare verified PGDG 17 tools in a queued job; no system/DB changes."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request

root = Path.cwd()
if root.parent.parent != Path('/srv/dev-jobs') or os.getuid() == 0:
    raise SystemExit('Run only as the isolated VPS queue user.')
out = root / 'artifacts/pg17'
out.mkdir(parents=True, exist_ok=False)

def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

key = out / 'pgdg.asc'
key.write_bytes(fetch('https://www.postgresql.org/media/keys/ACCC4CF8.asc'))
home = out / 'gnupg'
home.mkdir(mode=0o700)
gpg = ['gpg', '--homedir', str(home), '--batch']
subprocess.run(gpg + ['--import', str(key)], check=True, capture_output=True)
fingerprints = subprocess.check_output(gpg + ['--with-colons', '--fingerprint'], text=True)
if 'B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8' not in fingerprints:
    raise SystemExit('Unexpected official PGDG signing key.')
base = 'https://apt.postgresql.org/pub/repos/apt/'
release = out / 'InRelease'
release.write_bytes(fetch(base + 'dists/noble-pgdg/InRelease'))
subprocess.run(gpg + ['--verify', str(release)], check=True, capture_output=True)
expected = None
in_sha256 = False
for line in release.read_text().splitlines():
    if line == 'SHA256:':
        in_sha256 = True
    elif in_sha256 and line and not line.startswith(' '):
        in_sha256 = False
    elif in_sha256 and line.split()[-1:] == ['main/binary-amd64/Packages.gz']:
        expected = line.split()[0]
compressed = fetch(base + 'dists/noble-pgdg/main/binary-amd64/Packages.gz')
if not expected or hashlib.sha256(compressed).hexdigest() != expected:
    raise SystemExit('Package index does not match signed release.')
records = []
for stanza in gzip.decompress(compressed).decode().split('\n\n'):
    fields = dict(line.split(': ', 1) for line in stanza.splitlines() if ': ' in line and not line.startswith(' '))
    if fields.get('Package') in ['postgresql-client-17', 'postgresql-17', 'libpq5'] and fields.get('Architecture') == 'amd64':
        records.append(fields)
selected = []
for name in ['postgresql-client-17', 'postgresql-17', 'libpq5']:
    candidates = [r for r in records if r['Package'] == name]
    chosen = None
    for candidate in candidates:
        if chosen is None or subprocess.run(['dpkg', '--compare-versions', candidate['Version'], 'gt', chosen['Version']]).returncode == 0:
            chosen = candidate
    if chosen is None:
        raise SystemExit('Required package missing: ' + name)
    selected.append(chosen)
prefix = out / 'prefix'
for package in selected:
    data = fetch(base + package['Filename'])
    if hashlib.sha256(data).hexdigest() != package['SHA256']:
        raise SystemExit('Package checksum mismatch.')
    path = out / Path(package['Filename']).name
    path.write_bytes(data)
    subprocess.run(['dpkg-deb', '-x', str(path), str(prefix)], check=True)
manifest = {'release_sha256': hashlib.sha256(release.read_bytes()).hexdigest(),
            'packages': [{k: p[k] for k in ['Package', 'Version', 'SHA256', 'Filename']} for p in selected]}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
env = {**os.environ, 'LD_LIBRARY_PATH': str(prefix / 'usr/lib/x86_64-linux-gnu')}
bin_path = prefix / 'usr/lib/postgresql/17/bin'
for command in ['postgres', 'pg_dump', 'pg_restore']:
    print(subprocess.check_output([str(bin_path / command), '--version'], env=env, text=True).strip())
print(json.dumps({'tools': str(prefix), 'manifest': str(out / 'manifest.json')}))
