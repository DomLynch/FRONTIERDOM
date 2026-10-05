Below is the brief I would give Codex/dev. I’d make the first prototype **small enough to build quickly, but complete enough to answer: “Is managing this tiny inter-world business addictive?”**

# HEAVEN INC. — PlayCanvas Prototype Brief

## 1. High concept

Build a **3D browser-first strategy / trading / management game in PlayCanvas**.

The player does **not** directly control combat.

The player starts as an ordinary entrepreneur, smuggler or pirate with:

- one cheap ship
- a small amount of money/debt
- 2–4 crew
- access to one newly discovered interdimensional gate

Through trading, exploration, contracts, piracy and calculated risk, the player eventually grows into:

**independent operator → ship owner → small company → corporation → regional power → inter-world empire**

The long-term game can become an MMO with a persistent player economy.

For this prototype, prove the core loop first.

---

# 2. Story / universe

### Setting: ~2035

Humanity's early commercial space programme discovers an artificial gateway beyond the Moon.

It does not lead to normal space.

It leads to another habitable world.

Then humanity discovers that the gateway is part of an enormous ancient network containing **thousands of impossible worlds**.

Some resemble:

- paradise / Eden
- hell-like volcanic worlds
- ocean worlds
- living biological worlds
- worlds made almost entirely of machines
- permanent darkness
- strange light-based ecosystems
- abandoned civilisations
- worlds whose inhabitants resemble creatures from ancient human mythology

Nobody knows who constructed the network.

Nobody knows why some worlds resemble human ideas of Heaven, Hell, gods and monsters.

Governments initially control access.

Very quickly, corporations obtain exploration and extraction licences.

Prospectors, traders, mercenaries, scientists, smugglers and pirates follow.

The new frontier becomes humanity's biggest economic boom.

### Core thematic idea

> **Humanity discovered Heaven. Then somebody put a quarterly revenue target on it.**

The game should feel serious rather than comedic.

It is about:

**exploration + capitalism + risk + discovery + exploitation + politics + consequences**

---

# 3. Player fantasy

The player is NOT initially:

- CEO
- admiral
- governor
- chosen hero
- legendary commander

They are essentially a **small business owner with a spaceship**.

Think:

> “I have £40,000, a questionable ship, three employees and too much debt.”

Early decisions should feel small and personal.

Example:

Buy medical supplies for £8,000.

Transport them through the gate.

Sell them for £12,500.

Buy a strange mineral cheaply.

Risk carrying it back.

Get intercepted by pirates.

Decide whether to:

- surrender some cargo
- bluff
- run
- fight
- negotiate

This is the emotional foundation of the game.

---

# 4. Core game loop

The basic loop:

**Research market → buy goods → accept contract → travel → encounter risk → sell/deliver → make profit/loss → upgrade → repeat**

Later:

**discover → invest → hire → automate → trade → manipulate markets → defend → expand**

The player should constantly be deciding:

> “Do I risk more capital to make more money?”

---

# 5. Combat philosophy

There is **NO direct character or ship combat**.

Combat is simulated.

The player manages it like a football manager manages a match.

Before combat, choose tactical instructions.

Then watch the 3D battle play out.

### Pre-battle tactical options

#### Overall posture

- Avoid engagement
- Defensive
- Balanced
- Aggressive
- All-in

#### Fire discipline

- Conserve ammunition
- Normal expenditure
- Maximum firepower

#### Priorities

- Protect cargo
- Protect flagship
- Protect expensive units
- Attack transports
- Attack escorts
- Disable rather than destroy
- Target leadership

#### Retreat rules

- Retreat immediately if badly outmatched
- Retreat at 20% losses
- Retreat at 40% losses
- Fight until victory
- Never retreat

### During battle

Allow only strategic interventions.

Examples:

- RETREAT
- COMMIT RESERVES
- CHANGE TO AGGRESSIVE
- CONSERVE AMMO
- PROTECT TRANSPORT
- FOCUS ENEMY FLAGSHIP

Do NOT allow direct steering/shooting.

---

# 6. Battle viewer

This is an important part of the emotional experience.

The player should be able to:

**WATCH**

`1× | 2× | 5× | INSTANT RESULT`

The simulation should visually show:

- ships approaching
- formations changing
- projectiles
- damage
- disabled vessels
- retreating units
- destroyed ships
- boarding if added later

But combat graphics should remain readable rather than flashy.

The player should understand:

**“My escorts held them back long enough for my freighter to escape.”**

That matters more than spectacular explosions.

---

# 7. Why watching is fun

The battle matters because the player owns what is fighting.

Example:

Player has spent hours building:

**Transport Horizon**
- cargo value: £87,000
- veteran captain
- rare engine
- insured for only 50%

Pirates intercept it.

The player chooses:

**Defensive**
**Protect Transport**
**Conserve Ammo OFF**
**Retreat at 30% losses**

Now watching the simulation is emotionally meaningful.

The important psychology is:

> **I made the decisions. Now I have to watch the consequences.**

Think Football Manager rather than Call of Duty.

---

# 8. Prototype scope

Do NOT build thousands of planets.

Do NOT build an MMO yet.

Build a **15–30 minute vertical slice**.

### Prototype universe

#### Earth / Gateway Station

Small 3D orbital trading station.

Functions:

- market
- contracts
- ship
- crew
- gate
- basic upgrade shop

#### World 1 — EDEN-01

Beautiful celestial world.

Primary export:

**Aurelia** — rare biological material used in advanced medicine.

Needs imports:

- food
- machinery
- medicine
- tools

#### World 2 — FORGE-03

Harsh industrial/volcanic world.

Exports:

- metals
- energy material

Needs:

- medicine
- food
- cooling equipment

That is enough to create a basic economy.

---

# 9. Prototype commodities

Only use around **6 commodities** initially:

- Food
- Medicine
- Machinery
- Fuel
- Aurelia
- Exotic Metal

Each location has:

**supply + demand + price**

Keep the economics understandable.

Example:

Earth:

Medicine = £100

Eden:

Medicine = £175

Player can therefore recognise:

> Buy here → sell there.

Don't build an economist's simulator yet.

---

# 10. Market simulation

Prices should change based on:

**base price**
+
**current supply**
+
**current demand**
+
**recent trade**

Simple formula is sufficient.

Example:

If many players eventually sell medicine on Eden:

medicine supply increases → price falls.

If pirates destroy incoming food shipments:

food supply falls → price rises.

That creates future emergent gameplay.

For prototype, simulated NPC traders can create movement in prices.

---

# 11. Contracts

Add only 4 contract types initially:

### Delivery
Transport X goods to Y.

### Procurement
Find and deliver X units of a commodity.

### Exploration
Travel through a route and survey a location.

### Risk contract
Carry valuable cargo through dangerous territory.

Contracts should expose players to the systems naturally.

---

# 12. Piracy

Player can choose a legitimate or illegal route.

Piracy should initially be simple.

Example encounter:

**UNKNOWN VESSEL INTERCEPTING**

Choices:

- PAY 20%
- DROP CARGO
- RUN
- FIGHT

If player chooses fight:

→ tactical setup  
→ battle simulation

Eventually the player can become the pirate.

Prototype does not need sophisticated piracy mechanics.

---

# 13. Ship progression

Start:

### Rustbucket / Light Freighter

Characteristics:

- small cargo
- weak weapons
- low durability
- cheap running cost

Upgrades:

- cargo hold
- engines
- armour
- weapons
- sensors

Do not create 50 ship classes.

Prototype:

**1 ship + 5 meaningful upgrades.**

---

# 14. Crew

Player begins with three crew roles:

### Captain
Improves escape/tactical performance.

### Engineer
Improves reliability / repairs.

### Trader
Improves buying/selling margins.

Give each simple:

**name**
**portrait**
**level**
**one stat**
**salary**

This starts creating Football Manager-style attachment.

If the ship is destroyed, crew can potentially die.

That makes risk meaningful.

---

# 15. Economy progression

Early:

**£20k → £30k → £60k**

Later prototype:

buy second ship.

The key moment we want to test is:

> **Does owning a second ship feel exciting?**

Player can eventually send:

Ship A → Eden

while personally managing:

Ship B → Forge

This starts becoming a management game.

---

# 16. Exploration / mystery

Worlds shouldn't only exist as markets.

Each world has a small storyline.

Example:

### EDEN-01

Humans discover Aurelia regenerates damaged tissue.

Initially it appears to grow naturally.

Then scientists discover:

**Aurelia is part of a living network underneath the planet.**

Mining it may be equivalent to harvesting organs.

The native inhabitants begin reacting.

This presents choices:

- continue extraction
- reduce extraction
- negotiate
- conceal evidence
- sell information
- support locals
- support corporation

For prototype, this can mostly be text/events rather than elaborate cinematic quests.

---

# 17. Events

Use short strategic events.

Example:

> **EDEN-01 MEDICAL CRISIS**
>
> Native disease outbreak.
>
> Medicine demand +80%.
>
> Transport medicines now?

Or:

> **PIRATE ACTIVITY INCREASED**
>
> Route Earth → Eden risk rises from 12% to 31%.

Or:

> **CORPORATE EXTRACTION ACCIDENT**
>
> Aurelia supply temporarily falls.

Events make the economy feel alive.

---

# 18. Visual style

This should NOT look like:

- generic sci-fi mobile game
- colourful Asian MMO
- cartoon space game
- Warhammer
- Destiny

Human technology should feel plausibly **2035–2050**.

Think:

- SpaceX-like engineering
- practical industrial design
- worn ships
- shipping containers
- modular habitats
- mining machinery
- corporate branding

Then contrast that with:

**beautiful, impossible celestial worlds.**

Human equipment should look almost crude beside them.

---

# 19. Camera / presentation

Use **real 3D PlayCanvas environments**.

Different screens can use different cameras.

### Station
Closer cinematic 3D view.

### Worlds
Elevated / isometric exploratory view.

### Strategic map
Zoomed-out system/gate view.

### Combat
Cinematic elevated camera following the battle.

There is no requirement that the entire game use one camera style.

That's one reason PlayCanvas suits the concept.

---

# 20. PlayCanvas implementation

Use:

**PlayCanvas Engine + PlayCanvas Editor**

Prefer:

**JavaScript/TypeScript-compatible clean modules**

Keep code-first systems in Git.

Use the visual editor primarily for:

- scene layout
- cameras
- lighting
- assets
- ships
- battle environments
- world composition

Do not bury important game logic inside complicated Editor objects.

---

# 21. Architecture

KEEP THIS VERY SMALL.

Suggested modules:

```text
GameState
Economy
Market
PlayerCompany
Ship
Crew
Contracts
Travel
Encounter
BattleSimulation
BattleViewer
Events
UI
SaveSystem
```

Do not create 100 microclasses.

Prefer data-driven objects.

Example:

```text
Ship
  id
  cargoCapacity
  armour
  firepower
  speed
  cargo
  crew
```

Keep the simulation independent from rendering where practical.

That allows:

**same combat simulation → instant result OR 3D visual playback**

Very important.

---

# 22. Combat architecture

Battle outcome should NOT depend on graphics.

First calculate/simulate:

```text
ship A
ship B
tactics
crew
equipment
ammo
randomness
```

Produce battle events:

```text
00:03 Pirate attacks transport
00:08 Escort intercepts
00:14 Transport takes engine damage
00:22 Player changes posture
00:35 Pirate retreats
```

Then PlayCanvas **visualises those events**.

This gives:

- reproducibility
- instant resolve
- 1×
- 2×
- 5×
- replay
- server-side MMO simulation later

This architecture is important.

---

# 23. Future MMO architecture

Do NOT implement yet, but don't make it impossible.

Eventually backend owns:

- accounts
- money
- ships
- commodities
- markets
- contracts
- corporations
- player assets
- world ownership
- battle results

Client should never be authoritative over valuable economic outcomes.

But prototype:

**local simulation/save is completely acceptable.**

Do not waste prototype time building distributed infrastructure.

---

# 24. AI

Do not use an LLM everywhere initially.

Possible future uses:

### World governors
Generate negotiation responses.

### Corporate competitors
High-level economic strategy.

### Native civilisations
React to exploitation.

### Pirates
Decide targets/risk.

### Story director
Select world events.

But deterministic game rules must validate all AI decisions.

Prototype can use normal logic.

---

# 25. Prototype UI

Keep it elegant and minimal.

Main interface:

```text
CASH
SHIP
CARGO
CREW
CURRENT LOCATION
```

Primary tabs:

**MARKET**
**CONTRACTS**
**SHIP**
**CREW**
**MAP**

Travel should take very few clicks.

Example:

**Buy Medicine → select Eden → Launch**

Do not make the interface look like enterprise software.

---

# 26. First playable sequence

The first 10 minutes should be:

### Minute 0–2
Player has:

£25,000  
small freighter  
three crew

Tutorial says:

> A newly opened settlement on Eden needs medical supplies.

### Minute 2
Player buys medicine.

### Minute 3
Player enters gate.

Beautiful visual transition.

### Minute 4
Arrives Eden.

Sees enormous celestial landscape.

### Minute 5
Sells medicine.

Makes first profit.

### Minute 6
Buys Aurelia cheaply.

### Minute 7
Travels home.

### Minute 8
Pirates intercept.

Player chooses:

**Fight**

Selects:

**Defensive**
**Protect Cargo**
**Maximum Firepower**
**Retreat at 40%**

### Minute 9
Player watches first 3D battle.

### Minute 10
Survives.

Returns to Earth.

Sells Aurelia.

Cash:

**£25,000 → £39,000**

Now the player thinks:

> **I'll do one more run.**

That is the entire prototype objective.

---

# 27. Definition of success

The prototype succeeds if I naturally start thinking:

- What's cheap here?
- What's expensive there?
- Can I risk carrying more?
- Should I upgrade my cargo hold?
- Can I afford another ship?
- What happens if I attack instead of paying the pirates?
- What is through the next gate?

If I want to play **one more trade run**, continue development.

If not, do not add more worlds to fix it.

---

# 28. Explicitly DO NOT build yet

Do NOT build:

- full MMO backend
- manual combat
- walking character controller
- huge galaxy
- hundreds of commodities
- procedural planets
- detailed diplomacy
- stock market
- complex taxation
- guild wars
- base building
- factories
- player-owned planets
- blockchain
- 50 ship classes
- hundreds of NPCs
- elaborate skill trees

Those come only after the core is addictive.

---

# 29. Development constraints

### Priority

**Fun > architecture > scale**

### Keep custom code lean

Target roughly:

**2,000–3,500 lines of original game logic for MVP if practical**, excluding engine/library code, generated data and tests.

This is a guideline, not permission to compress unreadable code.

### Rules

- no speculative systems
- no duplicate logic
- no unnecessary wrappers
- no dependency-injection framework
- no ECS unless clearly necessary
- no premature MMO architecture
- no giant state-management framework
- no feature without a playable reason

Before adding anything, ask:

> **Does the prototype need this to test the core idea?**

If no:

**do not build it.**

---

# 30. Build order for Codex

Build vertically:

1. PlayCanvas project loads.
2. Basic station scene.
3. Player money.
4. Two markets.
5. Buy/sell commodity.
6. Travel between Earth and Eden.
7. Profit/loss.
8. Cargo capacity.
9. Contracts.
10. Random pirate encounter.
11. Tactical combat simulation.
12. Instant combat resolution.
13. 3D combat viewer.
14. 1× / 2× / 5×.
15. Ship upgrades.
16. Basic crew.
17. Forge second world.
18. Simple world events.
19. Save/load.
20. Polish.

Game must remain playable after every major stage.

---

# 31. Definition of done

I open the browser.

Within seconds I can:

**buy cargo → travel → sell → make money → encounter pirates → choose tactics → watch battle → survive/lose → upgrade → make another run.**

The entire prototype should be understandable without reading a manual.

Target:

**15–30 minutes of compelling gameplay.**

No need for the final MMO.

No need for perfect graphics.

But:

**the core trading/economic/tactical loop must feel real.**

---

## One strategic addition I would make

Give the player **three starting backgrounds** eventually, but not three separate classes:

**Trader**  
Small loan + better market information.

**Prospector**  
Better discovery opportunities.

**Smuggler**  
Black-market access + slightly better ship.

They all use exactly the same underlying systems.

That gives the player an immediate identity while still allowing them to evolve into anything later.

For the actual first prototype, however, I would start everyone as **the same small independent operator** and prove the loop before adding even that choice.