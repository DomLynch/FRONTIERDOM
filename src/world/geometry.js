import { Mesh, MeshInstance, Vec3 } from 'playcanvas';

// Purpose-built shapes for Horizon and the gate; all dimensions are metres.
export function meshFromTriangles(device, positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ab = new Vec3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
    const ac = new Vec3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
    const n = new Vec3().cross(ab, ac);
    for (const offset of [a, b, c]) { normals[offset] += n.x; normals[offset + 1] += n.y; normals[offset + 2] += n.z; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  const mesh = new Mesh(device);
  mesh.setPositions(positions); mesh.setNormals(normals); mesh.setIndices(indices); mesh.update();
  return mesh;
}

export function loft(device, sections) {
  // Clockwise-looking-along-Z bevelled cross-section, with solid end caps.
  const profile = [[-0.65, -1], [0.65, -1], [1, -0.65], [1, 0.65], [0.65, 1], [-0.65, 1], [-1, 0.65], [-1, -0.65]];
  const positions = [], indices = [];
  for (const [z, width, height, y = 0] of sections) {
    for (const [x, v] of profile) positions.push(x * width, v * height + y, z);
  }
  for (let s = 0; s < sections.length - 1; s++) for (let i = 0; i < 8; i++) {
    const a = s * 8 + i, b = s * 8 + (i + 1) % 8, c = b + 8, d = a + 8;
    indices.push(a, b, c, a, c, d);
  }
  for (let i = 1; i < 7; i++) {
    indices.push(0, i + 1, i);
    const n = (sections.length - 1) * 8;
    indices.push(n, n + i, n + i + 1);
  }
  return meshFromTriangles(device, positions, indices);
}

export function ring(device, radius, thickness, segments = 64, tubeSegments = 8, arc = Math.PI * 2) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * arc;
    for (let j = 0; j <= tubeSegments; j++) {
      const tube = j / tubeSegments * Math.PI * 2;
      const r = radius + Math.cos(tube) * thickness;
      positions.push(Math.cos(angle) * r, Math.sin(angle) * r, Math.sin(tube) * thickness);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < tubeSegments; j++) {
    const a = i * (tubeSegments + 1) + j, b = a + tubeSegments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return meshFromTriangles(device, positions, indices);
}

export function terrain(device, radius, height, seed = 0) {
  // Radial authored island footprint; irregular edges never form a square sheet.
  const positions = [0, height * 0.15, 0], indices = [];
  const rings = 12, segments = 64;
  for (let r = 1; r <= rings; r++) for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2, t = r / rings;
    const reach = radius * t * (1 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7));
    const x = Math.cos(a) * reach, z = Math.sin(a) * reach;
    const wave = Math.sin(x * 0.14 + seed) * Math.cos(z * 0.15 - seed);
    positions.push(x, -height * t * t + wave * height * (1 - t) * 0.5, z);
    const current = 1 + (r - 1) * segments + i, next = 1 + (r - 1) * segments + (i + 1) % segments;
    if (r === 1) indices.push(0, next, current);
    else {
      const inner = current - segments, innerNext = next - segments;
      indices.push(inner, next, current, inner, innerNext, next);
    }
  }
  return meshFromTriangles(device, positions, indices);
}

export function growth(device, height, radius, bend = 1) {
  const positions = [], indices = [], segments = 12, levels = 10;
  for (let j = 0; j <= levels; j++) for (let i = 0; i <= segments; i++) {
    const t = j / levels, a = i / segments * Math.PI * 2;
    const r = radius * (1 - t * 0.7) * (1 + 0.08 * Math.sin(a * 3 + t * 6));
    positions.push(Math.cos(a) * r + Math.sin(t * 2.5) * bend, t * height, Math.sin(a) * r + Math.sin(t * 4) * bend * 0.6);
  }
  for (let j = 0; j < levels; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return meshFromTriangles(device, positions, indices);
}

export function attachMesh(entity, mesh, material) {
  entity.addComponent('render', { meshInstances: [new MeshInstance(mesh, material, entity)], castShadows: false, receiveShadows: false });
}
