# First voyage world

`createWorld(app)` attaches visuals to the caller's existing PlayCanvas2.23.0 Application and returns `{setState,destroy}`. Only accepted `state.locationId` is read; simulation/auth/economy stay outside this module. Lead owns Application/start/canvas/DPR/resize. Destroy World before Application.

Horizon uses authored chamfered loft geometry, a keel/cockpit, oxidised cargo cassettes, engine pressure barrels/exhaust bells, landing skids, service patches and running lights. Earth has a textured original procedural planet, modular orbital habitat/solar arrays, docking collar and enormous ancient gate. Eden replaces orbital structures with luminous waterways, organic terraces, floating canopies and a distant living moon. The gate's familiar silhouette connects the two places.

All meshes, layouts, colours and 512x256 procedural planet maps are FRONTIERDOM-original code in geometry.js/index.js. Engine primitives/materials come from PlayCanvas(MIT). No third-party models/textures/assets or paid services. No GLB or Editor export is claimed; parked Editor pilot is unchanged.

Transit is cosmetic1.6seconds, starts only after a confirmed location differs from a prior snapshot, and never advances game state. Initial load/reload does not manufacture a trip. Repeated same-location snapshots do not restart transit. Reduced motion, hidden document, pagehide, context loss/restore and disposal cancel it. Subtle idle motion stops while hidden or reduced motion. Every external listener is removed with owned hierarchy/materials/textures; Engine-owned primitive caches remain caller-owned.

Performance choices: two shadow-free directional lights, no post-processing or external model downloads; shared palette and one star mesh. Both location hierarchies are allocated once and toggled. Initial scene/client download/frame pacing still need target-device measurement; source budgets are not hardware acceptance.

`transit.test.js` checks meaningful first-load/change/repeat/cancel behavior. `capture.mjs` is QA tooling for VPS only: captures the built actual candidate main/UI/World with intercepted deterministic API snapshots, writes scene and UI shots, and fails on page errors. It neither contacts production nor proves trade/authority. Integrated real-API and actual-phone acceptance remain Lead/UI responsibilities.
