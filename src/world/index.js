import { Entity, Color, Vec3, StandardMaterial, Texture, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, TONEMAP_ACES, CULLFACE_NONE, BLEND_NORMAL } from 'playcanvas';
import { loft, ring, terrain, growth, attachMesh, meshFromTriangles } from './geometry.js';
import { createTransit } from './transit.js';
import { createBattleScene } from './battle.js';

/** One caller-owned Application. All simulation/state resolution stays outside the renderer. */
export function createWorld(app) {
  const canvas = app.graphicsDevice.canvas;
  const previousAmbient = app.scene.ambientLight.clone();
  const materials = [], textures = [], roots = [];
  const transit = createTransit();
  let disposed = false, lost = false, elapsed = 0, location = 'earth';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motion.matches;
  const root = (name, parent = app.root) => {
    const e = new Entity(name, app); parent.addChild(e);
    if (parent === app.root) roots.push(e);
    return e;
  };
  function material(name, rgb, metalness = 0, glow = 0) {
    const m = new StandardMaterial();
    m.name = name; m.diffuse = new Color(...rgb); m.useMetalness = true; m.metalness = metalness;
    m.gloss = metalness ? 0.48 : 0.2;
    if (glow) { m.emissive = new Color(...rgb); m.emissiveIntensity = glow; }
    m.update(); materials.push(m); return m;
  }
  const ivory = material('Horizon worn ceramic', [0.7, 0.73, 0.7], 0.35);
  const steel = material('Graphite rib structure', [0.18, 0.23, 0.27], 0.55);
  const cargo = material('Oxidised burnt-orange cargo', [0.58, 0.25, 0.1], 0.3);
  const yellow = material('Industrial safety paint', [0.85, 0.55, 0.17], 0.1);
  const glass = material('Blue cockpit glazing', [0.05, 0.28, 0.37], 0.4, 0.2);
  const cyan = material('Gate cold plasma', [0.18, 0.72, 0.88], 0, 1.5);
  const amber = material('Guidance lights', [0.96, 0.58, 0.18], 0, 1.2);
  const ancient = material('Ancient warm graphite', [0.29, 0.3, 0.31], 0.5);
  const paleStone = material('Eden ivory stone', [0.64, 0.67, 0.58], 0.05);
  const jade = material('Eden living canopy', [0.17, 0.43, 0.3]);
  const deepJade = material('Eden moss shadow', [0.08, 0.28, 0.22]);
  const violet = material('Eden memory glow', [0.57, 0.35, 0.79], 0, 1.4);
  const aqua = material('Aurelia waterways', [0.12, 0.64, 0.59], 0.05, 0.7);
  const mineral = material('Violet rock strata', [0.31, 0.24, 0.37], 0.15);
  function primitive(parent, name, type, position, scale, surface, rotation = [0, 0, 0]) {
    const e = root(name, parent); e.addComponent('render', { type, castShadows: false, receiveShadows: false });
    e.render.material = surface; e.setLocalPosition(...position); e.setLocalScale(...scale); e.setLocalEulerAngles(...rotation); return e;
  }
  function custom(parent, name, mesh, position, surface, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const e = root(name, parent); attachMesh(e, mesh, surface); e.setLocalPosition(...position); e.setLocalEulerAngles(...rotation); e.setLocalScale(...scale); return e;
  }
  const device = app.graphicsDevice;
  const camera = root('Frontier presentation camera');
  camera.addComponent('camera', { fov: 44, nearClip: 0.2, farClip: 400, clearColor: new Color(0.025, 0.047, 0.08), toneMapping: TONEMAP_ACES });
  const key = root('Sunlight'); key.addComponent('light', { type: 'directional', color: new Color(1, 0.9, 0.77), intensity: 2.3, castShadows: false }); key.setEulerAngles(35, -45, 0);
  const fill = root('Sky bounce'); fill.addComponent('light', { type: 'directional', color: new Color(0.45, 0.65, 0.83), intensity: 0.9, castShadows: false }); fill.setEulerAngles(-25, 145, 0);

  // Original procedural planet maps; 512px each, no external downloads or assets.
  function planetMap(eden) {
    const image = document.createElement('canvas'); image.width = 512; image.height = 256;
    const ctx = image.getContext('2d'); const pixels = ctx.createImageData(512, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
      const lon = x / 512 * Math.PI * 2, lat = y / 256 * Math.PI;
      const nx = Math.cos(lon) * Math.sin(lat), ny = Math.cos(lat), nz = Math.sin(lon) * Math.sin(lat);
      const noise = Math.sin(nx * 8 + nz * 3) * Math.cos(ny * 7 - nz * 4) + Math.sin(nx * 19 - ny * 13 + nz * 9) * 0.22;
      const cloud = Math.max(0, Math.sin(nx * 23 + ny * 4) * Math.sin(nz * 17 - ny * 12) - 0.45) * 0.6;
      const land = noise > 0.14;
      const base = eden ? (land ? [61, 126, 91] : [24, 84, 93]) : (land ? [99, 128, 104] : [27, 71, 121]);
      const ice = !eden ? Math.max(0, (Math.abs(ny) - 0.88) * 7) : 0;
      const i = (y * 512 + x) * 4;
      for (let c = 0; c < 3; c++) pixels.data[i + c] = Math.min(255, base[c] + cloud * 150 + ice * 140);
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new Texture(device, { name: eden ? 'Eden surface map' : 'Earth surface map', width: 512, height: 256, mipmaps: false, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
    texture.setSource(image); textures.push(texture); return texture;
  }
  const earth = root('Earth orbital port');
  const eden = root('Eden living valley');
  const earthSurface = material('Earth ocean and atmosphere', [0.9, 0.94, 1]); earthSurface.diffuseMap = planetMap(false); earthSurface.update();
  const edenSurface = material('Eden living world', [0.8, 0.92, 0.85]); edenSurface.diffuseMap = planetMap(true); edenSurface.update();
  primitive(earth, 'Earth horizon', 'sphere', [-35, -10, -110], [112, 112, 112], earthSurface, [8, 24, -20]);
  primitive(eden, 'Eden distant moon', 'sphere', [-45, 29, -130], [60, 60, 60], edenSurface, [0, -40, 0]);

  // One batched star mesh with deterministic positions.
  const starMaterial = material('Distant stars', [0.55, 0.65, 0.78], 0, 0.8); starMaterial.useLighting = false; starMaterial.cull = CULLFACE_NONE; starMaterial.update();
  const positions = [], indices = []; let seed = 101;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 130; i++) {
    const x = (random() - 0.5) * 260, y = (random() - 0.25) * 170, z = -180 - random() * 20, s = 0.05 + random() * 0.12, n = i * 4;
    positions.push(x - s, y - s, z, x + s, y - s, z, x + s, y + s, z, x - s, y + s, z); indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const stars = custom(app.root, 'Stars', meshFromTriangles(device, positions, indices), [0, 0, 0], starMaterial);

  // Humanity's modular orbital port sits in front of an impossibly large ancient ring.
  const station = root('Human orbital terminal', earth);
  custom(station, 'Circular docking collar', ring(device, 9, 0.55, 64), [0, -2, 1], steel, [90, 0, 0]);
  primitive(station, 'Landing pad', 'cylinder', [0, -2.075, 1], [18, 0.25, 18], ivory);
  custom(station, 'Pad perimeter lighting', ring(device, 8.6, 0.06, 64), [0, -1.91, 1], amber, [90, 0, 0]);
  for (let i = 0; i < 5; i++) primitive(station, 'Dock approach stripe', 'box', [0, -1.92, 7 - i], [2.2, 0.03, 0.1], yellow);
  const habitat = root('Orbital habitat', earth); habitat.setLocalPosition(-18, 4, -17);
  primitive(habitat, 'Pressure vessel', 'cylinder', [0, 0, 0], [5, 15, 5], ivory, [0, 0, 90]);
  custom(habitat, 'Habitat wheel', ring(device, 6, 0.65, 48), [0, 0, -2], steel);
  for (let i = 0; i < 4; i++) {
    primitive(habitat, 'Radiator array', 'box', [-9 + i * 6, -2, -4], [4.8, 0.12, 8], glass, [0, 0, -16]);
    primitive(habitat, 'Solar cell seam', 'box', [-9 + i * 6, -1.97, -4], [0.05, 0.03, 8], cyan, [0, 0, -16]);
  }
  primitive(earth, 'Terminal access truss', 'cylinder', [-8, -1, -8], [0.9, 21, 0.9], steel, [54, 0, -48]);
  const gate = root('Ancient gateway'); gate.setLocalPosition(1, 11, -28);
  custom(gate, 'Ancient outer ring', ring(device, 14, 0.9, 96, 10), [0, 0, 0], ancient);
  custom(gate, 'Inner plasma ring', ring(device, 12.9, 0.12, 96), [0, 0, 0.7], cyan);
  custom(gate, 'Outer inscriptions', ring(device, 14.8, 0.035, 96), [0, 0, 0.4], amber);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    primitive(gate, 'Ancient ring buttress', 'box', [Math.sin(a) * 14, Math.cos(a) * 14, 0], [1.5, 2.6, 2.2], ancient, [0, 0, -i * 30]);
    primitive(gate, 'Gateway rune', 'box', [Math.sin(a) * 14, Math.cos(a) * 14, 1.13], [0.13, 1.2, 0.025], cyan, [0, 0, -i * 30]);
  }

  // Horizon: narrowed cockpit, chamfered keel, cargo saddles and articulated twin engines.
  const ship = root('Horizon freighter'); ship.setLocalPosition(0, 0, -3); ship.setLocalEulerAngles(0, -30, 0);
  custom(ship, 'Chamfered pressure hull', loft(device, [[-5, 0.75, 0.6], [-3.7, 1.15, 0.8], [2.5, 1.1, 0.8], [4.1, 0.75, 0.5, 0.13], [4.7, 0.5, 0.32, 0.18]]), [0, 0.6, 0], ivory);
  custom(ship, 'Cockpit crown', loft(device, [[2.1, 0.8, 0.3], [3.3, 0.75, 0.5], [4.4, 0.44, 0.15]]), [0, 1.35, 0], steel);
  primitive(ship, 'Angled front window', 'box', [0, 1.63, 3.94], [0.85, 0.38, 0.06], glass, [-25, 0, 0]);
  custom(ship, 'Ventral keel', loft(device, [[-4.9, 0.5, 0.15], [2, 0.55, 0.3], [4.5, 0.22, 0.13]]), [0, -0.28, 0], steel);
  primitive(ship, 'Dorsal communications spine', 'box', [0, 1.45, -1.5], [0.23, 0.22, 5.8], steel);
  primitive(ship, 'Navigation aerial', 'cylinder', [0, 2.4, -2.5], [0.06, 1.7, 0.06], steel, [0, 0, -20]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = 1 - i * 1.75;
      custom(ship, 'Chamfered cargo cassette', loft(device, [[-0.73, 0.64, 0.62], [0.73, 0.64, 0.62]]), [side * 1.6, 0.55, z], cargo);
      for (const dz of [-0.52, 0.52]) primitive(ship, 'Cargo retaining ribs', 'box', [side * 1.6, 1.2, z + dz], [1.17, 0.08, 0.1], steel);
      primitive(ship, 'Worn identification strip', 'box', [side * 2.25, 0.63, z], [0.018, 0.12, 0.9], ivory);
    }
    primitive(ship, 'Engine outrigger', 'box', [side * 2, 0.1, -3.7], [2.8, 0.3, 0.5], steel);
    primitive(ship, 'Engine pressure barrel', 'cylinder', [side * 2.8, 0.35, -4.2], [1.35, 2.6, 1.35], ivory, [90, 0, 0]);
    primitive(ship, 'Exhaust bell', 'cone', [side * 2.8, 0.35, -5.8], [1.65, 1.1, 1.65], steel, [90, 0, 0]);
    custom(ship, 'Exhaust rim', ring(device, 0.78, 0.1, 24), [side * 2.8, 0.35, -6.32], steel);
    primitive(ship, 'Engine glow', 'sphere', [side * 2.8, 0.35, -6.29], [1.17, 1.17, 0.08], cyan);
    primitive(ship, 'Landing strut', 'cylinder', [side * 1.3, -1.13, -1], [0.17, 1.3, 0.17], steel, [0, 0, side * 20]);
    primitive(ship, 'Landing skid', 'capsule', [side * 1.7, -1.8, -1], [0.28, 3.1, 0.28], steel, [90, 0, 0]);
    primitive(ship, 'Ship running light', 'sphere', [side * 2.3, 0.85, 1.7], [0.1, 0.1, 0.1], amber);
  }
  // Small asymmetric service patches and heat-scarring make the reusable ship look worked.
  for (let i = 0; i < 7; i++) primitive(ship, 'Maintenance patch', 'box', [-0.5 + (i % 3) * 0.4, 1.42, -3 + i * 0.65], [0.24, 0.018, 0.28], i % 2 ? steel : yellow);

  const battle = createBattleScene({root, primitive, custom, material, device, horizon: ship});
  let stateCompany = null;

  // Eden is a living valley: branching waterways and floating organic terraces, not a green dock.
  custom(eden, 'Foreground living terrace', terrain(device, 17, 2.5, 1), [0, -2, 0], deepJade);
  custom(eden, 'Distant living terrace', terrain(device, 29, 6, 3), [0, -2, -44], jade);
  primitive(eden, 'Arrival platform', 'cylinder', [0, -2.1, -3], [12, 0.3, 12], paleStone);
  custom(eden, 'Platform Aurelia tracing', ring(device, 5.5, 0.08, 48), [0, -1.91, -3], aqua, [90, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const z = -8 - i * 5, x = Math.sin(i * 0.7) * 6;
    primitive(eden, 'Luminous river', 'capsule', [x, -1.5, z], [1.8, 7, 0.12], aqua, [90, 0, i * 14 - 30]);
    primitive(eden, 'Memory tributary', 'capsule', [x + 3.3, -1.6, z], [0.5, 8, 0.08], violet, [90, 0, 48]);
  }
  for (let i = 0; i < 9; i++) {
    const x = (i % 2 ? 1 : -1) * (12 + i % 3 * 6), z = -8 - i * 6;
    const height = 10 + i % 3 * 5;
    custom(eden, 'Curved living root', growth(device, height - 1, 1.1 + i % 3 * 0.3, i % 2 ? 2.2 : -1.5), [x, -4, z], mineral);
    custom(eden, 'Aurelia root vein', growth(device, height - 0.5, 0.05, i % 2 ? 2.2 : -1.5), [x + 0.85, -4, z + 0.5], aqua);
    primitive(eden, 'Floating canopy', 'sphere', [x, height - 3, z], [9 + i % 3 * 2, 3.4, 7], jade);
    custom(eden, 'Canopy luminous gills', ring(device, 3.9 + i % 3, 0.08, 32), [x, height - 3.6, z], violet, [90, 0, 0]);
  }
  const veil = material('Transit halo', [0.23, 0.68, 0.76], 0, 1.3); veil.useLighting = false; veil.blendType = BLEND_NORMAL; veil.opacity = 0.14; veil.depthWrite = false; veil.update();
  const crossing = root('Confirmed gate crossing');
  custom(crossing, 'Crossing corona', ring(device, 7.5, 0.2, 64), [0, 3, 4], veil);
  crossing.enabled = false;

  const aim = new Vec3();
  function resize() {
    if (disposed || lost || !canvas.clientWidth || !canvas.clientHeight) return;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    // Frame the whole gate at tall-phone widths; preserve a readable foreground ship.
    if (battle.active) {
      if (aspect < 0.85) { camera.setPosition(0, 24, 58); aim.set(0, -4, -5); }
      else { camera.setPosition(16, 22, 42); aim.set(-2, 4, -5); }
    } else if (aspect < 0.85) { camera.setPosition(10, 16, 72); aim.set(1, 3, -14); }
    else { camera.setPosition(22, 13, 30); aim.set(0, 4, -10); }
    camera.lookAt(aim);
  }
  function showLocation(next) {
    location = next; earth.enabled = !battle.active && next === 'earth'; eden.enabled = !battle.active && next === 'eden';
    gate.enabled = !battle.active;
    camera.camera.clearColor = next === 'earth' ? new Color(0.025, 0.047, 0.08) : new Color(0.075, 0.14, 0.17);
    app.scene.ambientLight.copy(next === 'earth' ? new Color(0.3, 0.35, 0.4) : new Color(0.32, 0.43, 0.39));
    if (battle.active) camera.camera.clearColor = new Color(0.025, 0.047, 0.08);
    key.light.color = next === 'earth' ? new Color(1, 0.9, 0.77) : new Color(0.94, 0.86, 1);
    fill.light.color = next === 'earth' ? new Color(0.45, 0.65, 0.83) : new Color(0.44, 0.78, 0.68);
  }
  function cancelMotion() { transit.cancel(); crossing.enabled = false; battle.cancel(); if (!battle.active) ship.setLocalPosition(0, 0, -3); }
  function update(dt) {
    if (disposed || lost || document.hidden || reducedMotion) return;
    if (battle.active) { battle.update(dt); return; }
    elapsed += dt;
    const progress = transit.advance(dt);
    crossing.enabled = transit.active;
    if (transit.active) {
      crossing.setLocalScale(1 + (1 - progress) * 3, 1 + (1 - progress) * 3, 1);
      ship.setLocalPosition(0, Math.sin(progress * Math.PI) * 0.3, -3 - Math.sin(progress * Math.PI) * 3);
    } else ship.setLocalPosition(0, Math.sin(elapsed * 0.7) * 0.035, -3);
    stars.setLocalPosition(Math.sin(elapsed * 0.04) * 0.7, 0, 0);
  }
  function motionChanged(event) { reducedMotion = event.matches; if (reducedMotion) cancelMotion(); }
  function visibilityChanged() { if (document.hidden) cancelMotion(); else resize(); }
  function lostContext() { lost = true; cancelMotion(); }
  function restoredContext() { lost = false; cancelMotion(); resize(); }
  function pageHidden() { cancelMotion(); }
  motion.addEventListener('change', motionChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pagehide', pageHidden);
  app.graphicsDevice.on('resizecanvas', resize);
  app.graphicsDevice.on('devicelost', lostContext);
  app.graphicsDevice.on('devicerestored', restoredContext);
  app.on('update', update);
  showLocation('earth'); resize();
  return {
    setState(state) {
      if (disposed) return;
      if (stateCompany !== (state?.companyId ?? null)) { battle.clear(); ship.setLocalEulerAngles(0, -30, 0); resize(); }
      stateCompany = state?.companyId ?? null;
      transit.accept(state?.locationId, reducedMotion || document.hidden || lost, state?.companyId ?? null);
      showLocation(state.locationId);
      if (!transit.active && !battle.active) { crossing.enabled = false; ship.setLocalPosition(0, 0, -3); }
    },
    setEncounter(encounter, companyId) {
      if (disposed) return;
      // The accepted UI state/session establishes the company before projection.
      if (companyId && companyId !== stateCompany) return;
      const wasActive = battle.active;
      battle.accept(encounter, companyId, reducedMotion || document.hidden || lost);
      // A null projection follows ordinary setState travel, including every sync.
      // Preserve that crossing unless an actual battle is entered or cleared.
      if (!wasActive && !battle.active) return;
      transit.cancel(); crossing.enabled = false;
      if (!battle.active) { ship.setLocalPosition(0, 0, -3); ship.setLocalEulerAngles(0, -30, 0); }
      showLocation(location); resize();
    },
    destroy() {
      if (disposed) return; disposed = true; battle.clear();
      motion.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', pageHidden);
      app.graphicsDevice.off('resizecanvas', resize); app.graphicsDevice.off('devicelost', lostContext); app.graphicsDevice.off('devicerestored', restoredContext); app.off('update', update);
      for (const e of roots) e.destroy();
      // Custom meshes are released by their mesh instances; Engine primitive caches belong to app.
      for (const m of materials) m.destroy(); for (const texture of textures) texture.destroy();
      app.scene.ambientLight.copy(previousAmbient);
    }
  };
}
