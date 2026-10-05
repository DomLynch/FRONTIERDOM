# Prototype scope

Owner direction, 5 October 2026. Full reference: `../briefs/ORIGINAL-BRIEF.md`.

## Core promise

An ordinary entrepreneur with a cheap ship, three employees and limited capital makes consequential trading decisions. Plausible 2035–2050 human machinery contrasts with impossible celestial worlds. Serious tone; elegant, touch-friendly interface.

The loop is market research → buy → contract/travel → risk → sell/deliver → profit or loss → upgrade → repeat. Combat is managerial: choose tactics, watch, and give limited strategic interventions.

## Staged delivery

1. **Trade loop:** PlayCanvas station plus Eden, £25,000, one freighter, commodity stock/cargo capacity, buy/sell, travel/fuel and a clear trip profit/loss receipt. Simple 3D first; no elaborate art dependency. Prove a return trip is understandable and worth repeating.
2. **Risk:** one delivery contract, one pirate encounter, pay/drop/run/fight, tactical setup and seeded instant battle result. Loss, damage and escape matter economically. Save/load should arrive as soon as repeat play needs it rather than be held until final polish.
3. **Watch consequences:** PlayCanvas battle viewer with 1×/2×/5×/instant, readable damage/retreat events and strategic commands. Same seed, inputs and commands produce the same result regardless of playback speed. Commands take effect at simulation time; instant resolve finishes the current state.
4. **Complete the slice:** Forge, six commodities, four contract types, five meaningful upgrades, named Captain/Engineer/Trader, short economic/story events and a second instance of the existing ship archetype. Test simple concurrent route assignment without adding ship classes or an automation framework.
5. **Phone acceptance:** full 15–30 minute loop on the actual phone, readable portrait/landscape presentation, usable touch targets, lifecycle recovery, bounded initial download and frame pacing measured on target hardware. Dom judges the desire for another run.

Prices respond to stock/demand and recent trades with simple understandable rules. NPC activity is bounded and deterministic where useful. Prevent negative cash/stock, over-capacity cargo, duplicate contract rewards and invalid save state.

## Scope interpretations

- “One ship + five upgrades” means one starting ship archetype; earning a second ship reuses that archetype.
- The £25k → £39k tutorial example is an illustrative tuning target, not a guaranteed return from a random fight. Tutorial encounters should teach risk without manufacturing profits.
- Multiple camera styles are supported, but only build the views needed for each checkpoint.
- Roughly 2,000–3,500 original logic lines is a guideline; readability and fun take priority.

No MMO accounts/economy/backend, direct combat, walking character, procedural planets, factories, base building, stock market, elaborate diplomacy or runtime LLM dependency in the prototype. Do not add worlds to compensate for an uninteresting trade loop.
