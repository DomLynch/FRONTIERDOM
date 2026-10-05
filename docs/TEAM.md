# Development lanes

Adapt ARMAGEDOM's ownership and receipts, with a smaller team appropriate to this prototype. All lanes read canonical state and use one shared Codex handover. Onboarding means inspect and report readiness; it does not start game implementation.

| Chat | Requested model | Ownership / first task |
| --- | --- | --- |
| FRONTIERDOM - Strategy Dev | gpt-6-astra / high | Scope, priorities, player acceptance and Lead oversight; current chat |
| FRONTIERDOM - Lead Dev | gpt-6.1-sol / medium | Integration, bootstrap, package/lock and shared data/API contracts; propose the smallest first playable baseline |
| FRONTIERDOM - Economy & Simulation | gpt-6.1-sol / medium | Market/price rules, cargo, contracts, travel/encounter generation and company progression; defines economic consequences with Backend |
| FRONTIERDOM - Combat | gpt-6.1-sol / medium | Seeded tactical battle calculations, targeting, accuracy/damage/armour/ammo/crew, retreat/escape, balance and battle event/result schema |
| FRONTIERDOM - Backend | gpt-6.1-sol / medium | Supabase/Auth/Postgres, persistent company/ship/crew/cargo data, authoritative atomic transactions/settlement, idempotency/concurrency, permissions/RLS, migrations and recovery |
| FRONTIERDOM - Web & UI | gpt-6.1-sol / medium | Mobile HUD, trade/route flow, input/lifecycle and battle viewer UI; propose the first touch flow |
| FRONTIERDOM - World & Art | gpt-6.1-sol / medium | Station/Eden/Forge composition, cameras, ship art, lighting/audio and asset provenance; propose placeholder-first visual needs |
| FRONTIERDOM - Auditor | gpt-6.1-sol / medium | Independent code quality, correctness, maintainability, regression risk, scope discipline and milestone evidence review |
| FRONTIERDOM - Deploy | gpt-6.1-sol / medium | Reproducible packaging/manifests, private previews, VPS hosting, DNS/TLS, served identity and rollback; Lead accepts integration |

Owner explicitly separated Auditor/Deploy and added Combat/Backend on 5 October. The old combined chat is preserved and renamed Auditor. These are distinct permanent ownership lanes; onboarding remains read-only. Backend starts with a small authoritative trading transaction foundation, growing with game requirements.

## Created chats — 5 October 2026

All nine chats belong in the FRONTIERDOM custom sidebar section. Eight developer chats use GPT 6.1 Sol medium and readiness-only prompts; Strategy's requested model is Astra 6 high.

| Lane | Chat ID |
| --- | --- |
| Strategy | `01a10bc3-744c-7723-9002-b47c5ea790ec` |
| Lead | `01a10bcc-c33a-7c12-89a9-ad2f7a35ea43` |
| Economy & Simulation | `01a10bcc-c52e-7ec0-aa55-a928a49de00f` |
| Web & UI | `01a10bcc-c7a0-7f20-94b2-4f01f10ac498` |
| World & Art | `01a10bcc-cb0c-7a80-a047-fca9fd8ac2c4` |
| Auditor | `01a10bcc-cfb6-7df3-b76a-cd2a7c617163` |
| Deploy | `01a10bd3-636e-7920-bff4-fc4585f573ef` |
| Combat | `01a10bd3-664f-7c23-88d0-3e0fb00d8353` |
| Backend | `01a10bd4-fe6c-73e1-9e51-d05e7d07a6b2` |

## Integration rules

Lead first commits a baseline, defines data contracts and assigns exact paths. Use isolated worktrees when implementations overlap. Proposed boundaries: Lead bootstrap/package/shared contracts; Economy `src/sim/economy/`; Combat `src/sim/combat/`; Backend `supabase/` and server transaction/settlement boundary; UI `src/ui/`; World/Art scene/assets; Deploy release scripts/manifests; Auditor review receipts, not implementation. Lead confirms actual paths before edits.

Economy provides pricing/cargo/travel rules; Combat produces deterministic battle events/results; Backend runs or validates these from trusted state and commits results atomically. Web/UI consumes snapshots/events and submits player intentions. Exactly one owner implements each rule and settlement path. Client-only simulation can be a development fixture, never a trusted persistent economy.

Combat evaluates discrete simulation ticks versus explicit player turns against the original watchable-battle brief; the owner's emphasis on tactical calculations does not itself settle that presentation choice. Keep the same resolver for replay/playback/instant result.

Compared with ARMAGEDOM, FRONTIERDOM now has separate Strategy, Lead, Economy, Combat, Backend, Web/UI, World/Art, Auditor and Deploy. World/Art currently includes audio, ships and crew portraits. Separate Ships & Art or World & Audio becomes useful when asset production is substantial; it is not a missing owner today. Player/device QA sits with Web/UI and Strategy, with independent evidence review by Auditor.

Only one scene owner uses the connected Editor MCP at a time. Do not have multiple chats mutate the same Editor scene. Code/scene exports handed over must record the Git commit, Editor project/scene/checkpoint, selected engine version, export digest and known runtime gaps.

Readiness reports contain scope, exact proposed owned files, dependencies, success check and blockers. No code edits, builds, heavy art jobs, paid calls, pushes or deployments during onboarding. Strategy starts the first bounded implementation assignment after reviewing readiness.

For future implementation handoffs: base and component commit, exact file list, inputs/art provenance, focused validation and remaining phone risks. Lead integrates small deltas; public activation follows accepted gameplay evidence and existing owner authority.

## App limitation

The custom FRONTIERDOM section matches the supplied sidebar examples. Available app APIs cannot add a saved folder project or rebind this existing chat's working directory/model. Initial developer chats can be grouped here while explicitly targeting `/Users/domininclynch/Desktop/FRONTIERDOM`; a saved FRONTIERDOM folder project can later replace their Business association through the app UI. Do not claim that association has already changed.
