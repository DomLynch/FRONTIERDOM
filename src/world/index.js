import {
  Entity, Color, Vec3, StandardMaterial, Mesh, MeshInstance,
  TONEMAP_ACES, CULLFACE_NONE
} from 'playcanvas';

/** Presentation only. This module never advances travel or economic state. */
export function createWorld(app) {
  const canvas = app.graphicsDevice.canvas;
  const roots = [];
  const previousAmbient = app.scene.ambientLight.clone();
  const materials = [];
  let disposed = false;
  let lost = false;
  let location = 'earth';
  let elapsed = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motion.matches;

  function material(name, rgb, metalness = 0, glow = false) {
    const value = new StandardMaterial();
    value.name = name;
    value.diffuse = new Color(...rgb);
    value.useMetalness = true;
    value.metalness = metalness;
    value.gloss = metalness ? 0.42 : 0.18;
    if (glow) {
      value.useLighting = false;
      value.emissive = new Color(...rgb);
      value.diffuse = new Color(0, 0, 0);
    }
    value.update();
    materials.push(value);
    return value;
  }
  const hull = material('Ceramic aluminium', [0.53, 0.58, 0.57], 0.65);
  const dark = material('Graphite steel', [0.09, 0.14, 0.18], 0.6);
  const rust = material('Oxidised cargo paint', [0.49, 0.23, 0.12], 0.25);
  const blue = material('Orbital steel', [0.19, 0.31, 0.4], 0.6);
  const jade = material('Eden stone', [0.12, 0.36, 0.29]);
  const purple = material('Violet mineral', [0.29, 0.19, 0.39], 0.15);
  const vegetation = material('Canopy', [0.16, 0.48, 0.32]);
  const cyan = material('Gate cyan', [0.18, 0.73, 0.85], 0, true);
  const amber = material('Dock amber', [0.95, 0.46, 0.16], 0, true);
  const violet = material('Eden lumen', [0.65, 0.42, 0.87], 0, true);
  const earthSurface = material('Earth ocean', [0.06, 0.24, 0.43]);
  const edenSurface = material('Eden horizon', [0.1, 0.34, 0.28]);
  const starMaterial = material('Starlight', [0.45, 0.61, 0.7], 0, true);
  starMaterial.cull = CULLFACE_NONE;
  starMaterial.update();

  function root(name, parent = app.root) {
    const entity = new Entity(name);
    parent.addChild(entity);
    if (parent === app.root) roots.push(entity);
    return entity;
  }
  function shape(parent, name, type, position, scale, surface, rotation) {
    const entity = root(name, parent);
    entity.addComponent('render', { type, castShadows: false, receiveShadows: false });
    entity.render.material = surface;
    entity.setLocalPosition(...position);
    entity.setLocalScale(...scale);
    if (rotation) entity.setLocalEulerAngles(...rotation);
    return entity;
  }

  const camera = root('Presentation camera');
  camera.addComponent('camera', {
    fov: 42, nearClip: 0.2, farClip: 180,
    clearColor: new Color(0.018, 0.035, 0.06), toneMapping: TONEMAP_ACES
  });
  const key = root('Sun');
  key.addComponent('light', { type: 'directional', color: new Color(0.79, 0.87, 1), intensity: 2.1, castShadows: false });
  key.setLocalEulerAngles(42, -28, 0);
  const fill = root('Dock bounce');
  fill.addComponent('light', { type: 'directional', color: new Color(0.22, 0.52, 0.65), intensity: 0.6, castShadows: false });
  fill.setLocalEulerAngles(-28, 145, 0);

  // One deterministic mesh, rather than a draw call per star. No textures/downloads.
  const starPositions = [], starIndices = [];
  let seed = 731;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 100; i++) {
    const x = (random() - 0.5) * 130;
    const y = (random() - 0.3) * 90;
    const z = -65 - random() * 20;
    const s = 0.025 + random() * 0.065;
    const n = i * 4;
    starPositions.push(x - s, y - s, z, x + s, y - s, z, x + s, y + s, z, x - s, y + s, z);
    starIndices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const starMesh = new Mesh(app.graphicsDevice);
  starMesh.setPositions(starPositions);
  starMesh.setIndices(starIndices);
  starMesh.update();
  const stars = root('Starfield');
  stars.addComponent('render', { meshInstances: [new MeshInstance(starMesh, starMaterial, stars)] });

  const earth = root('Earth orbital terminal');
  const eden = root('Eden arrival');
  shape(earth, 'Ocean limb', 'sphere', [-20, -12, -35], [45, 45, 45], earthSurface);
  shape(earth, 'Far orbital mast', 'box', [-9, 2, -14], [1.3, 13, 1.3], blue);
  shape(earth, 'Habitat crossbeam', 'box', [-9, 5, -14], [10, 1.4, 2.4], hull);
  for (let i = 0; i < 3; i++) {
    shape(earth, `Solar wing ${i}`, 'box', [-13 + i * 4, 2, -14], [2.8, 0.12, 5], dark, [0, 0, -18]);
  }
  shape(eden, 'Jade moon', 'sphere', [-18, -14, -38], [48, 48, 48], edenSurface);
  for (let i = 0; i < 6; i++) {
    const x = -13 + i * 5;
    const height = 4 + (i % 3) * 2.7;
    shape(eden, `Basalt spire ${i}`, 'cone', [x, height / 2 - 2, -12 - (i % 2) * 5], [3.5, height, 3.5], i % 2 ? jade : purple, [0, i * 29, i % 2 ? 8 : -6]);
    shape(eden, `Canopy ${i}`, 'sphere', [x, height - 1.6, -12 - (i % 2) * 5], [4.4, 1.5, 3.2], vegetation);
  }

  function dock(parent, surface, light) {
    shape(parent, 'Landing deck', 'box', [0, -1.4, 0], [13, 0.5, 12], surface);
    shape(parent, 'Dock spine', 'box', [0, -2.3, 0], [3, 1.5, 10], dark);
    for (const x of [-5.8, 5.8]) {
      shape(parent, 'Landing rail', 'box', [x, -1.06, 0], [0.14, 0.08, 10.5], light);
    }
    for (let i = 0; i < 3; i++) {
      shape(parent, 'Deck approach marker', 'box', [0, -1.1, 3.5 + i * 0.8], [1.8, 0.08, 0.12], light);
    }
    const gate = root('Gateway', parent);
    gate.setLocalPosition(0, 4, -7);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      shape(gate, 'Gateway segment', 'box', [Math.sin(angle) * 4.6, Math.cos(angle) * 4.6, 0], [2.48, 0.5, 0.7], dark, [0, 0, -i * 30]);
      shape(gate, 'Gateway lumen', 'box', [Math.sin(angle) * 4.25, Math.cos(angle) * 4.25, 0.41], [1.85, 0.12, 0.08], light, [0, 0, -i * 30]);
    }
  }
  dock(earth, blue, cyan);
  dock(eden, jade, violet);

  const ship = root('Rustbucket light freighter');
  shape(ship, 'Pressure hull', 'box', [0, 0, 0], [1.5, 1.3, 5.2], hull);
  shape(ship, 'Forward cockpit', 'box', [0, 0.4, 2.5], [1.4, 1, 1.2], dark, [-12, 0, 0]);
  shape(ship, 'Cockpit glass', 'box', [0, 0.7, 3.05], [1.05, 0.24, 0.06], cyan);
  shape(ship, 'Backbone', 'box', [0, 0.85, -0.5], [0.45, 0.3, 4.2], dark);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      shape(ship, 'Cargo pod', 'box', [side * 1.3, -0.05, 0.9 - i * 2.1], [1, 1.2, 1.8], rust);
      shape(ship, 'Cargo strap', 'box', [side * 1.3, 0.57, 0.9 - i * 2.1], [1.04, 0.08, 0.22], hull);
    }
    shape(ship, 'Drive housing', 'cylinder', [side * 1.12, 0, -2.5], [0.85, 1.6, 0.85], dark, [90, 0, 0]);
    shape(ship, 'Thruster nozzle', 'cylinder', [side * 1.12, 0, -3.33], [0.6, 0.09, 0.6], cyan, [90, 0, 0]);
    shape(ship, 'Landing foot', 'box', [side * 1.3, -0.9, 0], [0.55, 0.35, 3], dark);
    shape(ship, 'Navigation lamp', 'box', [side * 1.87, 0.4, -0.6], [0.1, 0.12, 0.4], amber);
  }
  ship.setLocalEulerAngles(0, -18, 0);
  const aim = new Vec3(0, 1.1, -1);

  function resize() {
    if (disposed || lost) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const portrait = width / height < 0.85;
    camera.setPosition(portrait ? 14 : 11, portrait ? 12 : 9, portrait ? 24 : 19);
    // Aim below the hull to reserve the lower screen for the trading overlay.
    aim.set(0, portrait ? -4 : -2.5, -1);
    camera.lookAt(aim);
  }
  function setLocation(next) {
    if (disposed) return;
    if (next !== 'earth' && next !== 'eden') throw new RangeError('World location must be earth or eden');
    location = next;
    earth.enabled = next === 'earth';
    eden.enabled = next === 'eden';
    camera.camera.clearColor = next === 'earth' ? new Color(0.018, 0.035, 0.06) : new Color(0.035, 0.025, 0.065);
    app.scene.ambientLight = next === 'earth' ? new Color(0.19, 0.24, 0.3) : new Color(0.22, 0.3, 0.27);
    key.light.color = next === 'earth' ? new Color(0.79, 0.87, 1) : new Color(0.94, 0.79, 1);
  }
  function update(dt) {
    if (disposed || lost || document.hidden || reducedMotion) return;
    elapsed += dt;
    ship.setLocalPosition(0, Math.sin(elapsed * 0.6) * 0.025, 0);
    stars.setLocalPosition(Math.sin(elapsed * 0.035) * 0.8, 0, 0);
  }
  function motionChanged(event) {
    reducedMotion = event.matches;
    if (reducedMotion) {
      stars.setLocalPosition(0, 0, 0);
      ship.setLocalPosition(0, 0, 0);
    }
  }
  function contextLost() { lost = true; }
  function contextRestored() { lost = false; resize(); }
  function visibilityChanged() { if (!document.hidden) resize(); }
  app.graphicsDevice.on('resizecanvas', resize);
  document.addEventListener('visibilitychange', visibilityChanged);
  motion.addEventListener('change', motionChanged);
  app.graphicsDevice.on('devicelost', contextLost);
  app.graphicsDevice.on('devicerestored', contextRestored);
  app.on('update', update);
  setLocation('earth');
  resize();

  return {
    setState(state) {
      if (disposed) return;
      if (!state || (state.locationId !== 'earth' && state.locationId !== 'eden')) {
        throw new RangeError('World state requires locationId earth or eden');
      }
      if (state.locationId !== location) setLocation(state.locationId);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      app.graphicsDevice.off('resizecanvas', resize);
      document.removeEventListener('visibilitychange', visibilityChanged);
      motion.removeEventListener('change', motionChanged);
      app.graphicsDevice.off('devicelost', contextLost);
      app.graphicsDevice.off('devicerestored', contextRestored);
      app.off('update', update);
      for (const entity of roots) entity.destroy();
      app.scene.ambientLight.copy(previousAmbient);
      for (const value of materials) value.destroy();
    }
  };
}
