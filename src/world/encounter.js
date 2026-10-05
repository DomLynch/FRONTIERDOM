/** Presentation only. Never calculates hits, damage, cargo, money or results. */
export function createEncounterView() {
  let company = null, id = null, tick = -1, sequence = -1, snapshot = null;
  return {
    accept(projection, companyId) {
      if (!projection || !companyId || !projection.snapshot) {
        company = companyId ?? null; id = null; tick = -1; sequence = -1; snapshot = null;
        return { snapshot: null, events: [], reset: true };
      }
      const reset = company !== companyId || id !== projection.id;
      if (!reset && projection.tick < tick) return { snapshot, events: [], reset: false };
      if (reset) sequence = -1;
      const events = (projection.events ?? []).filter(e => Number.isInteger(e.sequence));
      const nextSequence = Math.max(sequence, (projection.cursor?.to ?? 0) - 1, ...events.map(e => e.sequence));
      const fresh = reset ? [] : events.filter(e => e.sequence > sequence);
      company = companyId; id = projection.id; tick = projection.tick;
      sequence = nextSequence; snapshot = projection;
      return { snapshot, events: fresh, reset };
    },
    clear() { company = null; id = null; tick = -1; sequence = -1; snapshot = null; }
  };
}
