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

Installed in Codex global MCP configuration on 5 October, pinned to the verified official npm version:

```sh
codex mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server@0.7.1
```

A local MCP initialize/tools-list probe passed: server PlayCanvas 0.7.1, 125 tools advertised. This proves server startup/protocol, not an Editor connection. Open the intended PlayCanvas Editor project and connect its MCP toolbar to port 52000. Only one Editor instance connects at a time. Confirm project/scene read-only, then checkpoint before changes. No API key is required by this Editor-session workflow; any future REST automation uses separate credentials kept outside Git. Owner completed Google sign-in as `dom123dxb`. A new blank FRONTIERDOM project was created separately from the onboarding tutorial:

- Project `1613265`: https://playcanvas.com/project/1613265/overview/frontierdom
- Scene `2612405`: https://playcanvas.com/editor/scene/2612405
- Branch `main`, scene `Untitled`; default Camera, Light, Box, Plane and Skybox remain.
- Chrome Editor visibly showed **Connected**, port 52000, on 5 October. An established Chrome-to-MCP TCP connection was also observed.
- Safari stayed Connecting, matching the official open issue https://github.com/playcanvas/editor/issues/2210. Use Chrome for Editor MCP; Safari/iPhone remain runtime test targets.
- Current Strategy and Lead turns did not expose native PlayCanvas tool bindings. Refresh the tool catalog before the first read-only project/scene call; that call has not yet been verified. Do not start competing MCP server processes: the official server can replace the current listener.
- The free-plan Editor project is public. Only blank-project metadata was created; game source, credentials and private assets were not uploaded.

Official code-authoring skills: https://developer.playcanvas.com/user-manual/getting-started/use-playcanvas-skills/ and https://github.com/playcanvas/skills. They cover application setup, GLB inspection, scene/lighting/UI and runtime verification; they do not administer Editor projects.

Installed all 16 upstream skills with Codex's skill-installer helper into `~/.codex/skills/`, pinned to `playcanvas/skills` commit `0f175cfd9775c45b73fc36ad6943812cf629c7b1`: add-effects, apply-conventions, assemble-scene, bake-lighting, build-app, calibrate-model, configure-animation, find-examples, inspect-glb, inspect-runtime, light-scene, load-assets, override-shader-chunks, reduce-draw-calls, reuse-scripts, verify-pixels. Installation completed without overwriting existing directories. They become discoverable on the next turn. No duplicate native plugin route and no Claude changes. The app may need MCP configuration reload before Editor tools appear.

Use modern clean ES modules/TypeScript-compatible source and pin the engine/package version. Git is authoritative for economy/combat logic. Editor owns scene authoring; record checkpoints and exports with asset provenance. Lead must prove a single end-to-end engine/editor/export workflow before splitting implementation. Do not maintain two divergent game clients.

## Hosting and acceptance

PlayCanvas supports downloading a static application for self-hosting: https://developer.playcanvas.com/user-manual/editor/publishing/web/self-hosting/. VPS static HTTPS hosting is suitable for the client. The owner's later Backend request adds Supabase/Auth/Postgres and authoritative transaction/settlement services; hosting the client alone does not establish a trusted trading economy. Backend proposes the smallest dedicated development environment and cost before provisioning; no database has been created or modified during onboarding.

Each accepted release binds source commit + Editor checkpoint/export + package hash + served version. Browser and physical-phone checks remain distinct. Code-first modules, focused simulation tests, exported 3D scenes and a reversible immutable package are the first useful infrastructure; no speculative services.
