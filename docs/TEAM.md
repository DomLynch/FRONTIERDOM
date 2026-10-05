# Development lanes

Adapt ARMAGEDOM's ownership and receipts, with a smaller team appropriate to this prototype. All lanes read canonical state and use one shared Codex handover. Onboarding means inspect and report readiness; it does not start game implementation.

| Chat | Requested model | Ownership / first task |
| --- | --- | --- |
| FRONTIERDOM - Strategy Dev | gpt-6-astra / high | Scope, priorities, player acceptance and Lead oversight; current chat |
| FRONTIERDOM - Lead Dev | gpt-6.1-sol / medium | Integration, bootstrap, package/lock and shared data/API contracts; propose the smallest first playable baseline |
| FRONTIERDOM - Economy & Simulation | gpt-6.1-sol / medium | Economy, cargo, contracts, travel, seeded encounters/battles and saves; propose pure simulation boundaries and meaningful invariants |
| FRONTIERDOM - Web & UI | gpt-6.1-sol / medium | Mobile HUD, trade/route flow, input/lifecycle and battle viewer UI; propose the first touch flow |
| FRONTIERDOM - World & Art | gpt-6.1-sol / medium | Station/Eden/Forge composition, cameras, ship art, lighting/audio and asset provenance; propose placeholder-first visual needs |
| FRONTIERDOM - Audit & Deploy | gpt-6.1-sol / medium | Independent milestone review plus reproducible private packaging/VPS hosting preparation; no implementation review of own changes and no initial public activation |

Audit and Deploy can share a chat initially: Lead accepts releases, and Auditor does not judge its own packaging edits. Split later only if actual workload warrants it. No backend lane for this local-save prototype.

## Created chats — 5 October 2026

All six chats are in the FRONTIERDOM custom sidebar section. Five developers were created with GPT 6.1 Sol medium and readiness-only prompts; this Strategy chat's requested Astra 6 high setting requires verification in the app selector.

| Lane | Chat ID |
| --- | --- |
| Strategy | `01a10bc3-744c-7723-9002-b47c5ea790ec` |
| Lead | `01a10bcc-c33a-7c12-89a9-ad2f7a35ea43` |
| Economy & Simulation | `01a10bcc-c52e-7ec0-aa55-a928a49de00f` |
| Web & UI | `01a10bcc-c7a0-7f20-94b2-4f01f10ac498` |
| World & Art | `01a10bcc-cb0c-7a80-a047-fca9fd8ac2c4` |
| Audit & Deploy | `01a10bcc-cfb6-7df3-b76a-cd2a7c617163` |

## Integration rules

Lead first commits a baseline, defines data contracts and assigns exact paths. Use isolated worktrees when implementations overlap. Default owner boundaries: Lead bootstrap/package and shared schema; simulation `src/sim/`; UI `src/ui/`; World/Art scene/assets; Audit/Deploy release scripts and receipts. These are proposed paths until Lead establishes the actual project layout.

Only one scene owner uses the connected Editor MCP at a time. Do not have multiple chats mutate the same Editor scene. Code/scene exports handed over must record the Git commit, Editor project/scene/checkpoint, selected engine version, export digest and known runtime gaps.

Readiness reports contain scope, exact proposed owned files, dependencies, success check and blockers. No code edits, builds, heavy art jobs, paid calls, pushes or deployments during onboarding. Strategy starts the first bounded implementation assignment after reviewing readiness.

For future implementation handoffs: base and component commit, exact file list, inputs/art provenance, focused validation and remaining phone risks. Lead integrates small deltas; public activation follows accepted gameplay evidence and existing owner authority.

## App limitation

The custom FRONTIERDOM section matches the supplied sidebar examples. Available app APIs cannot add a saved folder project or rebind this existing chat's working directory/model. Initial developer chats can be grouped here while explicitly targeting `/Users/domininclynch/Desktop/FRONTIERDOM`; a saved FRONTIERDOM folder project can later replace their Business association through the app UI. Do not claim that association has already changed.
