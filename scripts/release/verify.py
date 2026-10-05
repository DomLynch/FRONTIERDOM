#!/usr/bin/env python3
"""Verify every packaged file before installation or activation."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
manifest = json.loads((root / 'manifest.json').read_text())
paths = sorted(root.rglob('*'))
if any(p.is_symlink() for p in paths):
    raise SystemExit('FAIL: package contains symlinks')
actual = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in paths if p.is_file() and p != root / 'manifest.json'}
if actual != manifest['files']:
    raise SystemExit('FAIL: package inventory/hash mismatch')
identity = json.loads((root / 'client/release.json').read_text())
if identity != manifest['identity']:
    raise SystemExit('FAIL: served identity mismatch')
content = {k: v for k, v in actual.items() if k != 'client/release.json'}
digest = hashlib.sha256(json.dumps(content, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
if digest != identity['contentSha256']:
    raise SystemExit('FAIL: content identity mismatch')
print('PASS: inventory, content digest, and served identity match')
