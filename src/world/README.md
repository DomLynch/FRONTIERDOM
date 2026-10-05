# Earth–Eden presentation

Import `createWorld` from `src/world/index.js`, call `createWorld(app)` after Lead creates the PlayCanvas Application, then call `world.setState(snapshot)` after accepted API snapshots. Only `snapshot.locationId` is read (`earth` or `eden`); the snapshot is never mutated. Earth is shown until the first snapshot. Call `world.destroy()` **before** Lead destroys the Application. Teardown is idempotent.

Lead owns start/resize/DPR/Application destruction. World listens to graphics-device resize events to reframe its camera; its composition raises the freighter above centre to leave room for lower-screen UI. Integration must inspect this against actual overlay dimensions in portrait and landscape. Lead currently caps DPR at 1.5. No duplicate application, canvas styling, input handlers, audio, network calls or state resolution lives here.

Earth uses a blue modular orbital terminal; Eden uses jade landforms, violet minerals and canopies. Both reuse a ceramic/oxidised cargo freighter and segmented gateway. Ship bob and star parallax are restrained, stop with reduced motion or hidden documents, and use elapsed frame time. Device-loss callbacks suspend movement until Engine restores its GPU resources; restoration reframes the camera. There is no travel timer: server travel resolves immediately.

Budget by construction: two directional lights, no shadows/post-processing/textures; fewer than 70 visible primitive mesh instances plus one 100-star mesh per location. No model downloads. Initial scene creation also constructs the inactive destination. This is a source budget, not a measured draw-call/frame-time receipt.

## Provenance

All geometry, palette, ship layout and star placement are authored directly in `index.js` for FRONTIERDOM. Primitives come from PlayCanvas Engine; stars use one deterministic quad mesh. No external models, images, textures or paid assets were imported. PlayCanvas is supplied by Lead's pinned dependency (2.23.0, MIT). This procedural ship is the first slice's freighter, not an exported GLB or an approved final asset.

## Validation scope

Local JavaScript syntax and whitespace checks; API names/signatures checked against published PlayCanvas 2.23.0 declarations. No runtime, capture, context-recovery or phone acceptance claim. Lead's integrated VPS checks should inspect Earth/Eden, portrait/landscape overlay framing, repeated state changes, reduced motion, context loss/restore and destroy/remount. Actual phone checks remain separate.
