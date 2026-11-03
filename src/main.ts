import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

type Quality = 'low' | 'balanced' | 'high';
type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone';

const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
const loadingOverlay = document.querySelector<HTMLDivElement>('#loading-overlay')!;
const sceneList = document.querySelector<HTMLDivElement>('#scene-list')!;
const objectCount = document.querySelector<HTMLSpanElement>('#object-count')!;
const selectionStatus = document.querySelector<HTMLSpanElement>('#selection-status')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#171c26');

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
camera.position.set(6.5, 5.2, 8.5);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
  powerPreference: 'low-power',
  stencil: false,
  depth: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.domElement.className = 'scene-canvas';
viewport.prepend(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = false;
orbit.target.set(0, 0.8, 0);
orbit.update();

const ambient = new THREE.HemisphereLight(0xdce8ff, 0x34313a, 2.0);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xfff0dc, 2.2);
keyLight.position.set(5, 9, 6);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8bbcff, 0.65);
fillLight.position.set(-6, 4, -4);
scene.add(fillLight);

const grid = new THREE.GridHelper(20, 20, 0x53647c, 0x303b4d);
grid.position.y = -0.015;
scene.add(grid);
const axes = new THREE.AxesHelper(1.5);
axes.position.y = 0.01;
scene.add(axes);

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode('translate');
scene.add(transform.getHelper());

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const objects: THREE.Mesh[] = [];
let selected: THREE.Mesh | null = null;
let quality: Quality = 'balanced';
let renderQueued = false;
let toastTimer = 0;

function renderOnce() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderer.render(scene, camera);
  });
}

function notify(message: string) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

orbit.addEventListener('change', renderOnce);
transform.addEventListener('change', renderOnce);
transform.addEventListener('dragging-changed', (event) => {
  orbit.enabled = !(event as unknown as { value: boolean }).value;
});
transform.addEventListener('objectChange', () => {
  updateInspector();
  renderOnce();
});

function createGeometry(type: Primitive): THREE.BufferGeometry {
  switch (type) {
    case 'sphere': return new THREE.SphereGeometry(0.8, 32, 20);
    case 'cylinder': return new THREE.CylinderGeometry(0.55, 0.55, 1.5, 32, 1);
    case 'cone': return new THREE.ConeGeometry(0.7, 1.5, 32, 1);
    default: return new THREE.BoxGeometry(1.4, 1.4, 1.4, 1, 1, 1);
  }
}

function createObject(type: Primitive) {
  const material = new THREE.MeshStandardMaterial({
    color: type === 'box' ? '#758cae' : type === 'sphere' ? '#b17c62' : type === 'cylinder' ? '#6b9a8b' : '#b69b62',
    roughness: 0.65,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(createGeometry(type), material);
  mesh.name = `${type[0].toUpperCase()}${type.slice(1)}_${objects.length + 1}`;
  mesh.position.set((objects.length % 3) * 1.7 - 1.7, 0.8, Math.floor(objects.length / 3) * 1.7);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  objects.push(mesh);
  selectObject(mesh);
  renderSceneList();
  notify(`${mesh.name} created`);
}

function selectObject(mesh: THREE.Mesh | null) {
  selected = mesh;
  transform.detach();
  if (mesh) transform.attach(mesh);
  updateInspector();
  renderSceneList();
  renderOnce();
}

function renderSceneList() {
  objectCount.textContent = `${objects.length} OBJECT${objects.length === 1 ? '' : 'S'}`;
  if (!objects.length) {
    sceneList.innerHTML = '<div class="empty-list">Your scene is empty.<br/>Create an object to begin.</div>';
    return;
  }
  sceneList.replaceChildren();
  for (const mesh of objects) {
    const row = document.createElement('button');
    row.className = `scene-item${mesh === selected ? ' selected' : ''}`;
    row.type = 'button';
    const swatch = document.createElement('span');
    swatch.className = 'scene-swatch';
    swatch.style.background = `#${(mesh.material as THREE.MeshStandardMaterial).color.getHexString()}`;
    const name = document.createElement('span');
    name.className = 'scene-item-name';
    name.textContent = mesh.name;
    const kind = document.createElement('span');
    kind.className = 'scene-item-kind';
    kind.textContent = mesh.geometry.type.replace('Geometry', '').toUpperCase();
    row.append(swatch, name, kind);
    row.addEventListener('click', () => selectObject(mesh));
    sceneList.append(row);
  }
}

function setField(id: string, value: number, disabled: boolean) {
  const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = String(Number(value.toFixed(3)));
  input.disabled = disabled;
}

function updateInspector() {
  const nameInput = document.querySelector<HTMLInputElement>('#object-name')!;
  const colorInput = document.querySelector<HTMLInputElement>('#material-color')!;
  const roughnessInput = document.querySelector<HTMLInputElement>('#roughness')!;
  const metalnessInput = document.querySelector<HTMLInputElement>('#metalness')!;
  const enabled = Boolean(selected);
  nameInput.disabled = !enabled;
  colorInput.disabled = !enabled;
  roughnessInput.disabled = !enabled;
  metalnessInput.disabled = !enabled;
  for (const id of ['pos-x','pos-y','pos-z','rot-x','rot-y','rot-z','scale-x','scale-y','scale-z']) {
    document.querySelector<HTMLInputElement>(`#${id}`)!.disabled = !enabled;
  }
  if (!selected) {
    nameInput.value = '';
    nameInput.placeholder = 'No object selected';
    selectionStatus.textContent = 'No object selected';
    return;
  }
  nameInput.value = selected.name;
  nameInput.placeholder = '';
  setField('pos-x', selected.position.x, false);
  setField('pos-y', selected.position.y, false);
  setField('pos-z', selected.position.z, false);
  setField('rot-x', THREE.MathUtils.radToDeg(selected.rotation.x), false);
  setField('rot-y', THREE.MathUtils.radToDeg(selected.rotation.y), false);
  setField('rot-z', THREE.MathUtils.radToDeg(selected.rotation.z), false);
  setField('scale-x', selected.scale.x, false);
  setField('scale-y', selected.scale.y, false);
  setField('scale-z', selected.scale.z, false);
  const material = selected.material as THREE.MeshStandardMaterial;
  colorInput.value = `#${material.color.getHexString()}`;
  document.querySelector<HTMLSpanElement>('#material-hex')!.textContent = colorInput.value.toUpperCase();
  roughnessInput.value = String(material.roughness);
  metalnessInput.value = String(material.metalness);
  document.querySelector<HTMLSpanElement>('#roughness-value')!.textContent = material.roughness.toFixed(2);
  document.querySelector<HTMLSpanElement>('#metalness-value')!.textContent = material.metalness.toFixed(2);
  selectionStatus.textContent = selected.name;
}

function bindVectorInputs(prefix: 'pos' | 'rot' | 'scale') {
  for (const axis of ['x','y','z'] as const) {
    document.querySelector<HTMLInputElement>(`#${prefix}-${axis}`)!.addEventListener('change', (event) => {
      if (!selected) return;
      const value = Number((event.currentTarget as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      if (prefix === 'pos') selected.position[axis] = value;
      if (prefix === 'rot') selected.rotation[axis] = THREE.MathUtils.degToRad(value);
      if (prefix === 'scale') selected.scale[axis] = Math.max(0.001, value);
      updateInspector();
      renderOnce();
    });
  }
}
bindVectorInputs('pos');
bindVectorInputs('rot');
bindVectorInputs('scale');

document.querySelector<HTMLInputElement>('#object-name')!.addEventListener('change', (event) => {
  if (!selected) return;
  const value = (event.currentTarget as HTMLInputElement).value.trim();
  if (value) selected.name = value;
  updateInspector();
  renderSceneList();
});
document.querySelector<HTMLInputElement>('#material-color')!.addEventListener('input', (event) => {
  if (!selected) return;
  const color = (event.currentTarget as HTMLInputElement).value;
  (selected.material as THREE.MeshStandardMaterial).color.set(color);
  document.querySelector<HTMLSpanElement>('#material-hex')!.textContent = color.toUpperCase();
  renderSceneList();
  renderOnce();
});
for (const property of ['roughness', 'metalness'] as const) {
  document.querySelector<HTMLInputElement>(`#${property}`)!.addEventListener('input', (event) => {
    if (!selected) return;
    const value = Number((event.currentTarget as HTMLInputElement).value);
    (selected.material as THREE.MeshStandardMaterial)[property] = value;
    document.querySelector<HTMLSpanElement>(`#${property}-value`)!.textContent = value.toFixed(2);
    renderOnce();
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-create]')) {
  button.addEventListener('click', () => createObject(button.dataset.create as Primitive));
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as 'translate' | 'rotate' | 'scale';
    transform.setMode(mode);
    document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === button));
  });
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (transform.dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects, false);
  selectObject(hits.length ? hits[0].object as THREE.Mesh : null);
});

document.querySelector<HTMLButtonElement>('#toggle-grid')!.addEventListener('click', (event) => {
  grid.visible = !grid.visible;
  (event.currentTarget as HTMLButtonElement).classList.toggle('active', grid.visible);
  renderOnce();
});
document.querySelector<HTMLButtonElement>('#toggle-axes')!.addEventListener('click', (event) => {
  axes.visible = !axes.visible;
  (event.currentTarget as HTMLButtonElement).classList.toggle('active', axes.visible);
  renderOnce();
});
document.querySelector<HTMLButtonElement>('#reset-view')!.addEventListener('click', () => {
  camera.position.set(6.5, 5.2, 8.5);
  orbit.target.set(0, 0.8, 0);
  orbit.update();
  renderOnce();
});

document.querySelector<HTMLSelectElement>('#quality-select')!.addEventListener('change', (event) => {
  quality = (event.currentTarget as HTMLSelectElement).value as Quality;
  const ratio = quality === 'low' ? 0.8 : quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1.1);
  renderer.setPixelRatio(ratio);
  resize();
  notify(`${quality.toUpperCase()} viewport quality`);
});

document.querySelector<HTMLButtonElement>('#export-glb')!.addEventListener('click', async () => {
  if (!objects.length) {
    notify('Create an object before exporting');
    return;
  }
  const button = document.querySelector<HTMLButtonElement>('#export-glb')!;
  button.disabled = true;
  button.textContent = 'Exporting…';
  try {
    const exporter = new GLTFExporter();
    const exportScene = new THREE.Scene();
    for (const object of objects) exportScene.add(object.clone(true));
    const result = await exporter.parseAsync(exportScene, { binary: true, onlyVisible: true });
    const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'electron-asset.glb';
    anchor.click();
    URL.revokeObjectURL(url);
    notify('GLB exported successfully');
  } catch (error) {
    console.error(error);
    notify('Export failed — check browser console');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>↓</span> Export GLB';
  }
});

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return;
  if (event.key.toLowerCase() === 'g') transform.setMode('translate');
  if (event.key.toLowerCase() === 'r') transform.setMode('rotate');
  if (event.key.toLowerCase() === 's') transform.setMode('scale');
  if (event.key === 'Escape') selectObject(null);
  if (event.key === 'Delete' && selected) {
    const removed = selected;
    selectObject(null);
    scene.remove(removed);
    removed.geometry.dispose();
    const material = removed.material as THREE.Material;
    material.dispose();
    objects.splice(objects.indexOf(removed), 1);
    renderSceneList();
    renderOnce();
    notify('Object deleted');
  }
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === transform.getMode());
  });
});

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderOnce();
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(viewport);
resize();
renderOnce();
loadingOverlay.classList.add('hidden');
document.querySelector<HTMLSpanElement>('#renderer-status')!.textContent = 'WEBGL 2 · ON-DEMAND RENDER';
notify('ELECTRON viewport initialized');
