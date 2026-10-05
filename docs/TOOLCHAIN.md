# Toolchain and infrastructure

Checked 5 October 2026. This is setup guidance, not a game-runtime receipt.

## Mac → GitHub → VPS

Mac source: `/Users/domininclynch/Desktop/FRONTIERDOM`.
Origin: `https://github.com/DomLynch/FRONTIERDOM.git`.
VPS source mirror target: `/root/projects/FRONTIERDOM`, separate from any live site. Compute stages into unique job folders using the existing queue. Do not run heavy work directly in a live hosting folder.

Use the installed `/Users/domininclynch/.codex/skills/vps-heavy-jobs/SKILL.md`. Once real scripts exist, submit from Mac with the project's actual commands:

```sh
python3 "/Users/domininclynch/Desktop/Business/Vibe Coding Management/scripts/vps-run.py" --timeout 900 /Users/domininclynch/Desktop/FRONTIERDOM -- bash -lc 'npm ci && npm test && npm run build'
```

There is no `package.json` yet; this is the future submission shape, not a passing check. Existing shared capacity is three slots and five threads per job. CPU Blender uses the existing `blender-cpu` wrapper. Keep originals and recover GLB/previews/logs before cleaning only your own job directory.

HF **Spaces CPU Upgrade** currently lists 8 vCPU / 32 GB at $0.03/hour: https://huggingface.co/pricing. That is Spaces hardware, not a generic Jobs rate. Owner reports PRO access; account entitlement has not been checked. Use only for a bounded, budgeted task when needed; no paid resources were started during setup.

The supplied DNS screenshot shows `frontierdom.com` and `www` pointing to `49.12.7.18`. A screenshot does not establish current DNS, TLS or hosted game state. Future Deploy work verifies these and prepares an isolated immutable site package before public activation; no Nginx/live service changes during setup.

## PlayCanvas integration

Official Editor MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/.
It supports Codex and can inspect/edit scenes, assets, scripts and runtime. Node 22.18+ is required. Mac Node was v25.8.1 at setup.

Documented installation, not executed during assessment:

```sh
codex mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server
```

Open the intended PlayCanvas Editor project and connect its MCP toolbar to port 52000. Only one Editor instance connects at a time. Confirm project/scene read-only, then checkpoint before changes. No API key is required by this Editor-session workflow; any future REST automation uses separate credentials kept outside Git. No FRONTIERDOM account/project/scene is connected yet.

Official code-authoring skills: https://developer.playcanvas.com/user-manual/getting-started/use-playcanvas-skills/ and https://github.com/playcanvas/skills. They cover application setup, GLB inspection, scene/lighting/UI and runtime verification; they do not administer Editor projects.

For a future installation, select **Codex only**, one route, and preserve existing maintained skills. Do not use installers' all-agent option or write `.claude/` files. The official repository documents a Codex-native plugin route; inspect local CLI support first. No PlayCanvas plugin was returned by the connected plugin catalog search during setup; official upstream tooling still exists.

Use modern clean ES modules/TypeScript-compatible source and pin the engine/package version. Git is authoritative for economy/combat logic. Editor owns scene authoring; record checkpoints and exports with asset provenance. Lead must prove a single end-to-end engine/editor/export workflow before splitting implementation. Do not maintain two divergent game clients.

## Hosting and acceptance

PlayCanvas supports downloading a static application for self-hosting: https://developer.playcanvas.com/user-manual/editor/publishing/web/self-hosting/. VPS static HTTPS hosting is suitable for the prototype. No persistent MMO server is needed.

Each accepted release binds source commit + Editor checkpoint/export + package hash + served version. Browser and physical-phone checks remain distinct. Code-first modules, focused simulation tests, exported 3D scenes and a reversible immutable package are the first useful infrastructure; no speculative services.
