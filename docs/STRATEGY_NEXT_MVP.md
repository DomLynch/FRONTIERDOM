# FRONTIERDOM: make the frontier playable

Strategy guidance, 5 October 2026. Lead owns implementation planning, developer assignments and delivery.

## Decision and evidence

Treat live77948cc as the functioning trading foundation. The next milestone must deliver the original brief's player experience: discover a strange world, care about a ship and crew, take a risk, watch tactical consequences, and earn visible progress.

Dom's new feedback is the priority: the current game feels like squares without guidance, visual appeal or story; he expects spaceships, aliens, combat and eventual planetary conquest. This adds an explicit expectation of visible expansion. It does not require a galaxy-wide conquest system in the next release.

Sources inspected: original brief sections2/5–8/16/18–20/26/31; current SCOPE and FIRST_RELEASE_PLAN; actual released-build screenshot artifacts/lead/live-auth/trade-reload.jpg. The screenshot shows a dark geometric ship/gate behind a large slogan, cash metrics and commodity cards. It has some trade instructions, but lacks a persistent mission, narrative stakes and an evident path from trader to frontier power. This is a saved desktop capture, not a fresh phone assessment.

Three routes considered: art-only polish improves the first impression but leaves the fantasy absent; combat-only development adds a mechanic without context or guidance; a connected short adventure combines presentation, choices and progression. Choose the connected adventure, delivered in two usable checkpoints. Preserve working accounts, trade rules and saved companies.

## The next playable promise

“You own Horizon, an unreliable freighter with three crew. A medical contract takes you through humanity's new gate to Eden. A discovery and an interception force a choice. You return with consequences, improve your ship, and unlock a first foothold on the frontier.”

Use the established 2035 gateway setting and Eden's living Aurelia network. The mission wording, character names and foothold details below are proposed content, not previously approved canon. Lead can resolve these reversible choices without another setup-approval cycle.

Target a compelling first10minutes inside a15–30minute slice. These are player pacing targets, not delivery estimates.

## Opening mission copy for Lead

Working title: **The Other Side**. Suggested concise text; wire objectives to real mission state and actual prices.

**Opening:** “2035. Beyond the Moon, an ancient gate has opened onto Eden. Governments claimed the discovery. Corporations bought the licences. You bought Horizon: one battered freighter, three crew, and a chance to build something of your own.”

**Captain's first message:** “Eden's settlement needs medicine. Load supplies here, keep enough cash for the crossing, and I'll get us through the gate.”

**Objective sequence:** “Load medicine for Eden” → “Review the crossing cost” → “Launch for Eden” → “Deliver your medicine” → “Prepare a return cargo.” Show actual required/loaded quantities and costs. A suggested20-unit opening offer must be affordable and valid; existing companies get a suitable resumed objective, not fictitious completion or a cash reset.

**Arrival:** “EDEN-01. The lights beneath the forests move against the wind. Your instruments say the whole valley is breathing.”

**Discovery:** “Aurelia heals human tissue. A local envoy says it is also part of Eden's living memory. The company buying it calls that superstition.” The next offer makes extraction versus restraint affect a real reward/access relationship; explain the consequence before selection.

**Interception:** “Unregistered vessel on intercept. They want part of our cargo. Captain: ‘We can pay, jettison the load, try to outrun them—or hold our ground. Your call.’” Present actual demands, ship condition and approximate threat, followed by tactical setup if fighting.

**Aftermath:** “[Horizon escaped / The raider withdrew / We surrendered cargo]. [Actual damage and cargo consequence]. [Actual repair cost and net trip result].” Then offer one attainable upgrade and point to the next objective.

**Expansion hook:** “A relay above Eden has fallen silent. Whoever secures it will control a valuable approach to the gate.” The follow-on mission must change one site's status and a concrete benefit. Describe that site accurately; do not equate it with owning Eden.

## Checkpoint A: understandable, attractive first voyage

- Open on a clearly recognizable worn industrial freighter, orbital station and enormous gate. Give the world a clear, well-lit portion of the screen. Remove the full-scene dark veil and oversized marketing headline from active gameplay. Use a compact HUD and contextual bottom sheet on portrait; keep primary controls reachable and avoid a long page of cards before play.
- A short captain's briefing establishes who the player is, where they are and why Eden needs medicine. Show one persistent objective and one obvious next action. Offer a resumable, dismissible tutorial; never block an experienced player behind it.
- Guide inspect offer → buy medicine → choose Eden → review cost/risk → launch → arrive → deliver/sell. Explain quantity, cargo and net return at the moment of choice. Tutorial guidance reads actual authoritative state; it must not instruct a player with empty cargo to sell medicine or assume everyone's company is new.
- Distinguish physical location from remotely viewed market. The map shows Earth–Gate–Eden as a route with distance/travel cost and known risk. Locked future destinations can communicate ambition, but cannot imply playable content that is absent.
- Make departure, gate transit and arrival visually distinct, brief and skippable. Eden needs a recognizable planetary/landscape identity: an immense world, luminous living terrain and structures unlike human machinery. Use composition, scale, materials and lighting rather than more cubes or expensive effects. Never show a successful arrival before the travel command is confirmed.
- Introduce the three crew by name, role and a brief relevant line. Show ship condition/cargo and what the crew contributes; only display bonuses actually implemented. Include restrained engine/gate/UI audio with mute and mobile audio-unlock support.
- Finish the delivery with a clear receipt, a story discovery and the next goal. Keep realized profit distinct from cash change and avoid guaranteed fictional tutorial profit.

Acceptance: a new player can explain their role, destination and next action within30seconds, and complete the first voyage without verbal coaching. The ship/gate and Earth/Eden are visually distinguishable in both orientations. A returning company gets a sensible next objective without a reset, duplicate reward or forced new purchase. Show actual in-game portrait and landscape captures before calling the visual work complete.

## Checkpoint B: risk, tactical spectacle and first expansion

- Add one authored encounter tied to the first return voyage, with previewed stakes and pay/drop cargo/run/fight choices. The introductory encounter is designed to be recoverable; costs and risks are honest, with no secretly guaranteed victory or permanent tutorial dead end.
- Start tactical choices small: defensive/balanced/aggressive, cargo protection and a clear retreat rule. Show what those choices change. During battle, allow a bounded retreat/posture intervention; do not add steering or direct shooting.
- Deliver a readable PlayCanvas battle: distinguishable player/enemy silhouettes, approaches, weapon fire, hit response, damage and escape. The camera must let players see why their choice mattered. Provide1×/2×/5×/instant using the same seeded authoritative simulation. Explain loss, ammunition/repair expense and cargo consequence in the result. Playback speed cannot change the result for identical simulation-time commands.
- Give Eden a visible native presence and a short dilemma about the living Aurelia network. One understandable choice affects a recorded relationship or offer; it must do more than display flavor text. Do not build elaborate diplomacy or procedural lore.
- Award an affordable, meaningful ship upgrade after the opening run. Show its effect in the ship view and the next route/combat decision. Tune acquisition against actual receipts; do not promise a £39k ending simply because the original brief used an illustration.
- Give expansion an honest playable seed: one contested site/relay at Eden, visible on the map. A short follow-on objective lets the player secure that site through a tactical win or an agreement, with a stated cost and one concrete benefit such as route access or a trade concession. Persist and visibly change its control/status. Label this a first foothold, not conquest of an entire planet. Keep larger planetary campaigns, fleets and empire systems on the roadmap.

Acceptance: one complete persistent sequence connects trade → encounter → tactics/battle or alternate resolution → outcome → upgrade → first foothold. At the end a player can say what they risked, why they won/escaped/lost, what changed, and why another run would help. Tactical and noncombat choices must have real tradeoffs. Reload/relogin preserves encounter settlement, mission progress, upgrade and site state without duplicate costs/rewards. Validate full behavior in the actual client/server, and retain separate physical-phone acceptance.

## Delivery ownership and ordering

Lead should turn this into a short dependency plan with bounded assignments to existing lanes. Start A's visual/onboarding work while Combat develops B's resolver; avoid making art wait for every backend feature.

| Owner | Concrete next contribution |
| --- | --- |
| Lead | Own the opening mission script, integration and shared state/action contracts; choose one coherent visual reference and resolve reversible content choices. Record next reviewable deliverable and estimates by checkpoint after sizing. |
| Web/UI | Persistent objective, tutorial/resume states, compact mobile HUD/context sheets, route/risk review, event choices and battle/result controls. |
| World & Art | Recognizable freighter and Earth/Eden compositions, gate transition, readable battle staging, native visual identity and restrained audio. Use the existing Editor workflow for a real authored scene. |
| Economy | Delivery incentive, encounter costs, repairs, one achievable upgrade and the foothold's single benefit; demonstrate a viable route with an understandable downside. |
| Combat | One bounded seeded encounter with events, tactics, retreat and replay/instant consistency; supply the event contract early. |
| Backend | Persist mission/encounter/upgrade/site changes and settle costs/rewards exactly once; preserve ownership isolation and existing saves. |
| Auditor | Review the changed authority/settlement paths and actual player-flow evidence, not a duplicate whole-repository scan. |
| Deploy | Publish integrated reviewed checkpoints with compatible migrations, exact identities and rollback. |

Use the accepted Editor pilot as a starting workflow, not as proof the live scene has improved. Its frozen export guard means changed exports need an intentional reviewed rebaseline. One Editor operator; one runtime Application. Blender is appropriate for a small number of strong reusable models, not a prerequisite for mission/UI work. Use existing VPS capacity for heavy work; no paid asset/compute commitment is implied.

No new engine, authentication rebuild, competing client, MMO framework or generic importer project. Reuse unchanged release evidence. Code tests establish correctness; recognizable visuals and an unassisted playthrough establish the product improvement. Lead's next demonstration should show the first voyage in-game, followed by the integrated encounter—not another backend-only completion report. Dom's latest feedback is sufficient to start this next iteration; no request to approve the same direction again.
