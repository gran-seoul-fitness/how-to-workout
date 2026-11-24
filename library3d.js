// 산타의 서고로 가는 길: 웅장한 원형 도서관을 위에서부터 훑으며 내려와 서재 문으로 들어가는 3D 연출
import * as THREE from 'three';
let R = null;
function build() {
  const cv = document.createElement('canvas'); cv.className = 'lib3d';
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .88;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd9b48a); scene.fog = new THREE.Fog(0xcf9f6e, 34, 80);
  const cam = new THREE.PerspectiveCamera(62, 1, .1, 200);
  scene.add(new THREE.HemisphereLight(0xffe2bd, 0x6a3a18, 1.1));
  const sun = new THREE.PointLight(0xffd59a, 260, 60, 1.6); sun.position.set(0, 26, 0); scene.add(sun);
  const wood = new THREE.TextureLoader().load('tex/oak.webp'); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.colorSpace = THREE.SRGBColorSpace;
  const woodM = new THREE.MeshStandardMaterial({ map: wood, color: 0xd9a777, roughness: .6, metalness: .02 });
  const darkM = new THREE.MeshStandardMaterial({ map: wood, color: 0xb7865a, roughness: .7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xf0d2a0, roughness: .3, metalness: .55, emissive: 0x4a3012, emissiveIntensity: .25 });
  const Rr = 14, TIERS = 4, TH = 6.2, BAYS = 40;
  // 층마다 서가(책) + 발코니 바닥 + 난간
  const pal = [0xc2552d, 0xe8742a, 0xd9a441, 0x5f7f6f, 0x4f6f94, 0x2d2a28, 0xf1e4cf, 0xa8432c, 0x8a5a3a, 0x7d8f5a, 0xe0b48a, 0x34495e].map(c => new THREE.Color(c));
  // 책등 무늬 4가지(둥근 음영 · 금박 띠 · 제목판 · 천 결): 흰 바탕에 그려 책 색이 곱해지게
  // 책등 무늬 4가지(모던 · 미니멀): 흰 바탕에 그려 책 색이 곱해지게. 은은한 둥근 음영 + 가는 선 · 색 띠 · 작은 표식
  const spine = k => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, '#d9d9d9'); g.addColorStop(.3, '#ffffff'); g.addColorStop(.75, '#f2f2f2'); g.addColorStop(1, '#cfcfcf'); x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * .035})`; x.fillRect(Math.random() * 64, Math.random() * 256, 1, 1); }
    if (k === 0) { x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(0, 26, 64, 2); x.fillRect(0, 228, 64, 2); }
    if (k === 1) { x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(0, 190, 64, 66); x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(16, 40, 32, 3); x.fillRect(22, 48, 20, 3); }
    if (k === 2) { x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(32, 214, 6, 0, Math.PI * 2); x.fill(); x.fillRect(29, 40, 6, 110); }
    if (k === 3) { x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, 0, 64, 34); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(20, 120, 24, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const bookG = new THREE.BoxGeometry(1, 1, 1);
  // 상자 면 중 책등(안쪽을 보는 면)만 무늬, 나머지는 종이·천 색
  const edgeM = new THREE.MeshStandardMaterial({ color: 0xfbf4e8, roughness: .9 });
  const MAX = TIERS * BAYS * 6 * 14, KINDS = 4;
  const sets = [...Array(KINDS)].map((_, k) => { const m = new THREE.MeshStandardMaterial({ map: spine(k), roughness: .78, metalness: 0 }); const side = new THREE.MeshStandardMaterial({ roughness: .8 });
    const im = new THREE.InstancedMesh(bookG, [side, side, edgeM, edgeM, m, m], Math.ceil(MAX / KINDS) + 50); im.count = 0; return im; });
  const books = { setMatrixAt() { }, setColorAt() { } }; let n = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let tr = 0; tr < TIERS; tr++) {
    const y0 = tr * TH, r = Rr - tr * .9;
    for (let b = 0; b < BAYS; b++) {
      const a0 = b / BAYS * Math.PI * 2, da = Math.PI * 2 / BAYS;
      if (tr === 0 && (b === 0 || b === 1)) continue;   // 1층 정면: 서재로 들어가는 문
      for (let row = 0; row < 6; row++) {
        const yb = y0 + .35 + row * .92; let a = a0 + da * .06;
        while (a < a0 + da * .94 && n < MAX) {
          const w = .1 + Math.random() * .12, h = .5 + Math.random() * .3, d = .45 + Math.random() * .15;
          const aw = w / r; const ac = a + aw / 2;
          q.setFromAxisAngle(up, -ac + Math.PI / 2 + (Math.random() < .06 ? .25 : 0));
          p3.set(Math.cos(ac) * (r - .3), yb + h / 2, Math.sin(ac) * (r - .3)); s3.set(w, h, d);
          m4.compose(p3, q, s3); { const im = sets[(Math.random() * KINDS) | 0], col = pal[(Math.random() * pal.length) | 0].clone().multiplyScalar(.85 + Math.random() * .2); im.setMatrixAt(im.count, m4); im.setColorAt(im.count, col); im.count++; } n++;
          a += aw + .002;
        }
        const shelf = new THREE.Mesh(new THREE.CylinderGeometry(r - .02, r - .02, .07, 8, 1, true, -a0 - da + Math.PI / 2, da), darkM); shelf.position.y = yb - .04; scene.add(shelf);
      }
      // 서가 기둥
      const post = new THREE.Mesh(new THREE.BoxGeometry(.22, TH - .4, .7), woodM); post.position.set(Math.cos(a0) * (r - .35), y0 + (TH - .4) / 2, Math.sin(a0) * (r - .35)); post.rotation.y = -a0; scene.add(post);
    }
    const back = new THREE.Mesh(new THREE.CylinderGeometry(r + .05, r + .05, TH, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfae88, side: THREE.BackSide, roughness: 1 })); back.position.y = y0 + TH / 2; scene.add(back);
    if (tr > 0) {   // 발코니 바닥(링) + 황동 난간
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 2.2, r + .9, 96), woodM); ring.rotation.x = -Math.PI / 2; ring.position.y = y0 - .05; ring.material.side = THREE.DoubleSide; scene.add(ring);
      const edge = new THREE.Mesh(new THREE.CylinderGeometry(r - 2.2, r - 2.2, .5, 96, 1, true), darkM); edge.position.y = y0 - .3; scene.add(edge);
      for (const hy of [.55, 1.05]) { const rail = new THREE.Mesh(new THREE.TorusGeometry(r - 2.15, .045, 6, 120), brass); rail.rotation.x = Math.PI / 2; rail.position.y = y0 + hy; scene.add(rail); }
      const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(.025, .025, 1.05, 5), brass, 120); for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (r - 2.15), y0 + .52, Math.sin(a) * (r - 2.15)); bal.setMatrixAt(i, m4); } scene.add(bal);
    }
  }
  for (const im of sets) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; scene.add(im); }
  // 바닥(원형 무늬) + 가운데 열람 책상
  const floorC = document.createElement('canvas'); floorC.width = floorC.height = 512; const fx = floorC.getContext('2d');
  const gr = fx.createRadialGradient(256, 256, 10, 256, 256, 256); gr.addColorStop(0, '#f3d9b4'); gr.addColorStop(.5, '#d9a874'); gr.addColorStop(1, '#a8703f'); fx.fillStyle = gr; fx.fillRect(0, 0, 512, 512);
  fx.strokeStyle = 'rgba(255,255,255,.55)'; fx.lineWidth = 3; for (let i = 1; i < 8; i++) { fx.beginPath(); fx.arc(256, 256, i * 32, 0, Math.PI * 2); fx.stroke(); } for (let i = 0; i < 16; i++) { fx.beginPath(); fx.moveTo(256, 256); fx.lineTo(256 + Math.cos(i / 16 * Math.PI * 2) * 256, 256 + Math.sin(i / 16 * Math.PI * 2) * 256); fx.stroke(); }
  const ft = new THREE.CanvasTexture(floorC); ft.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(Rr, 96), new THREE.MeshStandardMaterial({ map: ft, roughness: .45, metalness: .1 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const desk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1, 48), woodM); desk.position.y = .5; scene.add(desk);
  const deskTop = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, .12, 48), darkM); deskTop.position.y = 1.06; scene.add(deskTop);
  // 돔 + 천창 빛
  const topY = TIERS * TH;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(Rr - TIERS * .9 + .2, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf3dcbc, side: THREE.BackSide, roughness: .9, emissive: 0x6a4420, emissiveIntensity: .25 })); dome.position.y = topY; scene.add(dome);
  for (let i = 0; i < 16; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(Rr - TIERS * .9, .07, 6, 40, Math.PI / 2), brass); rib.position.y = topY; rib.rotation.set(0, i / 16 * Math.PI * 2, Math.PI / 2); scene.add(rib); }
  const ocu = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ color: 0xfff2d2 })); ocu.rotation.x = Math.PI / 2; ocu.position.y = topY + Rr - TIERS * .9 - .3; scene.add(ocu);
  // 등불(빛나는 구슬): 층마다 둘레에
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64; const gx = glowC.getContext('2d'); const g2 = gx.createRadialGradient(32, 32, 0, 32, 32, 32); g2.addColorStop(0, 'rgba(255,240,200,1)'); g2.addColorStop(.25, 'rgba(255,200,110,.85)'); g2.addColorStop(1, 'rgba(255,170,70,0)'); gx.fillStyle = g2; gx.fillRect(0, 0, 64, 64);
  const glowT = new THREE.CanvasTexture(glowC);
  for (let tr = 0; tr < TIERS; tr++) for (let i = 0; i < 12; i++) {
    const a = (i + .5 + tr * .3) / 12 * Math.PI * 2, r = Rr - tr * .9 - 2.6, y = tr * TH + 3.4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffd08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(Math.cos(a) * r, y, Math.sin(a) * r); sp.scale.setScalar(1.6); scene.add(sp);
    if (i % 3 === 0) { const pl = new THREE.PointLight(0xffb867, 14, 12, 2); pl.position.copy(sp.position); scene.add(pl); }
  }
  // 서재 문(1층 정면 아치, 안쪽에서 빛)
  const da = Math.PI * 2 / BAYS, ad = da; const door = new THREE.Group();
  const dr = Rr - .2; door.position.set(Math.cos(ad) * dr, 0, Math.sin(ad) * dr); door.lookAt(0, 0, 0);
  const arch = new THREE.Shape(); arch.moveTo(-1.5, 0); arch.lineTo(-1.5, 3.4); arch.absarc(0, 3.4, 1.5, Math.PI, 0, true); arch.lineTo(1.5, 0); arch.lineTo(-1.5, 0);
  const light = new THREE.Mesh(new THREE.ShapeGeometry(arch, 24), new THREE.MeshBasicMaterial({ color: 0xffd79a })); light.position.z = -.2; door.add(light);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.5, .14, 8, 32, Math.PI), brass); frame.position.y = 3.4; door.add(frame);
  for (const sx of [-1.5, 1.5]) { const jamb = new THREE.Mesh(new THREE.BoxGeometry(.28, 3.4, .3), brass); jamb.position.set(sx, 1.7, 0); door.add(jamb); }
  scene.add(door);
  const doorPos = door.position.clone();
  R = { cv, renderer, scene, cam, doorPos, topY };
}
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// 카메라 길: 돔 아래 높은 곳 → 나선으로 돌며 내려와 → 서재 문으로 직진
function camAt(t) {
  const { doorPos, topY } = R, c = R.cam;
  if (t < .72) {
    const u = ease(t / .72), ang = 2.4 - u * 3.9, rad = 3 + u * 4.2, y = topY + 2 - u * (topY - .6);
    c.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
    const look = new THREE.Vector3(Math.cos(ang - 1.3) * 10, y - 6 + u * 5.2, Math.sin(ang - 1.3) * 10).lerp(new THREE.Vector3(doorPos.x, 2.2, doorPos.z), Math.pow(u, 3));
    c.lookAt(look); c.fov = 70 - u * 8;
  } else {
    const u = ease((t - .72) / .28), s = camAt.s || (camAt.s = c.position.clone()), tgt = new THREE.Vector3(doorPos.x * 1.03, 2.2, doorPos.z * 1.03);
    c.position.lerpVectors(s, tgt, u); c.lookAt(doorPos.x * 1.3, 2.3, doorPos.z * 1.3); c.fov = 62 - u * 10;
  }
  c.updateProjectionMatrix();
}
export async function flyToLibrary(host, onArrive, ms = 3000) {
  if (!R) build();
  const { cv, renderer, scene, cam } = R; host.appendChild(cv);
  const size = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }; size();
  camAt.s = null; let t0 = null, done = false, skip = false;
  const onTap = () => { skip = true; }; cv.addEventListener('pointerdown', onTap);
  return new Promise(res => {
    const step = now => {
      if (t0 === null) t0 = now; let t = Math.min(1, (now - t0) / ms); if (skip) t = 1;
      if (t < .72) camAt.s = null; camAt(t); renderer.render(scene, cam);
      if (t >= .93 && !done) { done = true; onArrive && onArrive(); }
      if (t < 1) requestAnimationFrame(step); else { cv.removeEventListener('pointerdown', onTap); setTimeout(() => { cv.remove(); res(); }, 450); }
    };
    requestAnimationFrame(step);
  });
}
