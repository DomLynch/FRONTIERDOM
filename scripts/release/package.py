#!/usr/bin/env python3
"""Freeze prebuilt release inputs; never build, deploy, or modify source."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('artifact', type=Path, help='contains client/ and optional server/')
    p.add_argument('output', type=Path, help='new immutable package directory')
    p.add_argument('--source', required=True, help='full tested Git commit')
    p.add_argument('--engine', required=True, help='exact pinned PlayCanvas version')
    p.add_argument('--editor-mode', required=True, choices=['code-first', 'export'])
    p.add_argument('--editor-project', default='1613265')
    p.add_argument('--editor-scene', default='2612405')
    p.add_argument('--checkpoint')
    p.add_argument('--export-sha256')
    a = p.parse_args()
    src, dst = a.artifact.resolve(), a.output.resolve()
    if not re.fullmatch(r'[0-9a-f]{40}', a.source):
        p.error('--source must be a full Git SHA')
    if not (src / 'client/index.html').is_file():
        p.error('artifact must contain the real built client/index.html')
    if dst.exists() or dst == src or src in dst.parents:
        p.error('output must be a new directory outside artifact')
    if a.editor_mode == 'export' and (not a.checkpoint or not re.fullmatch(r'[0-9a-f]{64}', a.export_sha256 or '')):
        p.error('Editor exports require checkpoint and SHA-256')
    files = sorted(src.rglob('*'))
    if any(f.is_symlink() for f in files):
        p.error('symlinks are not permitted in packages')
    if any(f.name.startswith('.env') for f in files):
        p.error('environment files must remain outside release packages')
    if (src / 'client/release.json').exists() or (src / 'manifest.json').exists():
        p.error('artifact already contains release identity files')
    inventory = {f.relative_to(src).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
                 for f in files if f.is_file()}
    digest = hashlib.sha256(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    identity = {'sourceCommit': a.source, 'engineVersion': a.engine,
                'contentSha256': digest, 'editor': {
                    'mode': a.editor_mode, 'project': a.editor_project,
                    'scene': a.editor_scene, 'checkpoint': a.checkpoint,
                    'exportSha256': a.export_sha256}}
    shutil.copytree(src, dst)
    (dst / 'client/release.json').write_text(json.dumps(identity, indent=2) + '\n')
    inventory['client/release.json'] = hashlib.sha256((dst / 'client/release.json').read_bytes()).hexdigest()
    (dst / 'manifest.json').write_text(json.dumps({'identity': identity, 'files': inventory}, indent=2) + '\n')
    print(json.dumps({'package': str(dst), 'identity': identity}))


if __name__ == '__main__':
    main()
