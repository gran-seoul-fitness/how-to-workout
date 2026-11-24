/* 3D 동작 엔진 — 관절 각도 → 자세, 무게중심 균형, 다리 IK(발 고정·무릎은 발끝 방향), 근육 색 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadHuman } from './rig.js';
import { EX } from './exercises.js';

const D2R = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ez = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const RC = { R: [0.835, 0.27, 0.231], B: [0.243, 0.357, 0.84], G: [0.243, 0.608, 0.325], T: [0.93, 0.12, 0.09] }; let PULSE = 0;
const VX = new THREE.Vector3(1, 0, 0), VY = new THREE.Vector3(0, 1, 0), VZ = new THREE.Vector3(0, 0, 1);
const STAND = { load: 'none', phases: [['', '', 1, 'rest']], pose: () => ({ knee: 0, ank: 0, L: 0, T: 0, C: 0, P: 0, hip: 0 }), roles: () => ({}) };

/* 골반 아래(엉덩이 사이·샅) 피부가 허리뼈(spine05)에 붙어 있어 고관절을 굽히면 튀어나오는 문제 보정:
   ① 고관절 높이 아래의 허리뼈 가중치 → 골반(root)으로 ② 엉덩이 사이·샅은 좌우 허벅지를 반씩 따라가게 */
function fixPelvisWeights(H) {
  const names = H.bonesData.map(b => b.n), idx = n => names.indexOf(n);
  const ROOT = idx('root'), LUMB = [idx('spine05'), idx('spine04'), idx('spine03')], TL = idx('upperleg01.L'), TR = idx('upperleg01.R');
  const hipY = H.bonesData[TL].h[1];
  const g = H.g, P = g.attributes.position.array, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let n = 0;
  for (let v = 0; v < H.nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (Math.abs(x) > 1.6 || y > hipY + .9 || y < hipY - 3) continue;
    const w = {};
    for (let k = 0; k < 4; k++) { const i = SI.getComponent(v, k), ww = SW.getComponent(v, k); if (ww > 0) w[i] = (w[i] || 0) + ww; }
    // ① 허리뼈 → 골반 (고관절 높이 아래일수록 많이)
    const toRoot = sst(hipY + .7, hipY - .1, y);
    for (const L of LUMB) if (w[L]) { const m = w[L] * toRoot; w[L] -= m; w[ROOT] = (w[ROOT] || 0) + m; }
    // ② 가운데(엉덩이 사이·샅): 좌우 허벅지를 반씩
    const mid = sst(.75, .2, Math.abs(x)) * sst(hipY + .1, hipY - .7, y);
    if (mid > 0) {
      const share = .55 * mid, l = share * Math.min(1, Math.max(0, .5 + x / .9));
      for (const k in w) w[k] *= (1 - share);
      w[TL] = (w[TL] || 0) + l; w[TR] = (w[TR] || 0) + (share - l);
    }
    const top = Object.entries(w).filter(([, a]) => a > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, b]) => a + b, 0);
    for (let k = 0; k < 4; k++) { const e = top[k]; SI.setComponent(v, k, e ? +e[0] : 0); SW.setComponent(v, k, e ? e[1] / sum : 0); }
    n++;
  }
  SI.needsUpdate = SW.needsUpdate = true;
  return n;
}

const GC = { L: new THREE.Vector3(.32, -.63, .77), R: new THREE.Vector3(-.32, -.63, .77) };   // 주먹 중심(손잡이가 지나는 곳)
export async function createEngine() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  const cv = renderer.domElement;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, 4 / 5, 1, 300);
  const ctl = new OrbitControls(cam, cv); ctl.enableDamping = true; ctl.enablePan = false; ctl.enableZoom = false; ctl.enabled = false;   // 기본은 잠금: 스크롤할 때 몸이 돌아가지 않게
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c0cc, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-10, 18, 14); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); key.shadow.radius = 5; scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, .9); rim.position.set(12, 6, -14); scene.add(rim);
  const GROUND = -8.02;
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: .13 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = GROUND; gnd.receiveShadow = true; scene.add(gnd);

  const H = await loadHuman('human.json');
  fixPelvisWeights(H);
  try {   // 손 쥐기(그립) 모프: 기구·덤벨을 잡을 때 손가락을 말아 쥠
    const gj = await (await fetch('grip.json')).json();
    const bin = Uint8Array.from(atob(gj.grip), c => c.charCodeAt(0));
    H.g.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(bin.buffer), 3)];
    H.g.morphTargetsRelative = true; H.mesh.updateMorphTargets(); H.mesh.morphTargetInfluences[0] = 0;
    for (const s of ['L', 'R']) GC[s] = new THREE.Vector3(...gj.info[s].grip_center);
  } catch (e) { console.warn('grip', e); }
  scene.add(H.mesh);
  const B = H.B, root = B.root;
  const wp = n => B[n].getWorldPosition(new THREE.Vector3());
  const wq = n => B[n].getWorldQuaternion(new THREE.Quaternion());
  H.mesh.updateMatrixWorld(true);
  const BIND = {}; for (const n in B) BIND[n] = wp(n);
  const rootPos0 = root.position.clone();
  const ARMLEN = BIND['upperarm01.L'].distanceTo(BIND['lowerarm01.L']) + BIND['lowerarm01.L'].distanceTo(BIND['wrist.L']) + .75;

  /* 팔 */
  const ARM = {};
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const u0 = BIND['upperarm02.' + s].clone().sub(BIND['upperarm01.' + s]).add(BIND['lowerarm01.' + s].clone().sub(BIND['upperarm02.' + s])).normalize();
    const f0 = BIND['wrist.' + s].clone().sub(BIND['lowerarm01.' + s]).normalize();
    const q1 = new THREE.Quaternion().setFromUnitVectors(u0, new THREE.Vector3(.16 * sx, -1, -.02).normalize());
    const fh = f0.clone().applyQuaternion(q1), uh = new THREE.Vector3(.16 * sx, -1, -.02).normalize();
    const a0 = fh.angleTo(uh), axis = new THREE.Vector3().crossVectors(uh, fh).normalize();
    ARM[s] = { q1, a0, axis: axis.applyQuaternion(q1.clone().invert()) };
  }
  /* 손바닥: 손 메시 정점 분석으로 구한 바인드 방향 (손목→손 중심 = 손가락 쪽, 가장 얇은 축 = 손바닥 법선) */
  const HAND = {}, HANDN = {};
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const d0 = new THREE.Vector3(.293 * sx, -.717, .809).normalize();
    // 손바닥 = 엄지가 앞쪽에 오는 면(해부학적 확인). 손 길이 방향과 직교하게 정리
    const n0 = new THREE.Vector3(-.785 * sx, -.22, -.579); n0.sub(d0.clone().multiplyScalar(n0.dot(d0))).normalize();
    const z0 = new THREE.Vector3().crossVectors(d0, n0);
    HAND[s] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d0, n0, z0)); HANDN[s] = n0.clone();
  }
  const HAND_T = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0))));
  const ARMQ = BIND['upperarm01.L'].distanceTo(BIND['lowerarm01.L']) + BIND['lowerarm01.L'].distanceTo(BIND['wrist.L']) + .28;
  /* 팔 IK: 네발 자세에서 손바닥을 바닥 한 점에 고정 */
  const ARMK = {};
  for (const s of ['L', 'R']) {
    const a = BIND['upperarm01.' + s], e = BIND['lowerarm01.' + s], w = BIND['wrist.' + s], NZ = new THREE.Vector3(0, 0, -1);
    const frame = y => { const x = new THREE.Vector3().crossVectors(y, NZ).normalize(); const z = new THREE.Vector3().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
    ARMK[s] = { l1: a.distanceTo(e), l2: e.distanceTo(w), qbU: frame(e.clone().sub(a).normalize()), qbF: frame(w.clone().sub(e).normalize()) };
  }
  const HANDPIN = {};   // 운동별 손 고정 위치(중립 자세에서 한 번 계산)
  function armIK(pins, poleOf) {
    for (const s of ['L', 'R']) {
      const K = ARMK[s], Sh = wp('upperarm01.' + s), T = pins[s];
      const v = T.clone().sub(Sh); const d = Math.min(v.length(), (K.l1 + K.l2) * .9995); const u = v.normalize();
      const pole = poleOf ? poleOf(s) : new THREE.Vector3(0, 0, -1); const w = pole.sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
      const a = (K.l1 * K.l1 - K.l2 * K.l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, K.l1 * K.l1 - a * a));
      const E = Sh.clone().add(u.clone().multiplyScalar(a)).add(w.clone().multiplyScalar(h));
      const x = new THREE.Vector3().crossVectors(u, w).normalize();
      const mk = y => { const z = new THREE.Vector3().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
      const qU = mk(E.clone().sub(Sh).normalize()).multiply(K.qbU.clone().invert());
      const qF = mk(T.clone().sub(E).normalize()).multiply(K.qbF.clone().invert());
      const pq = B['upperarm01.' + s].parent.getWorldQuaternion(new THREE.Quaternion());
      B['upperarm01.' + s].quaternion.copy(pq.invert().multiply(qU));
      B['lowerarm01.' + s].quaternion.copy(qU.clone().invert().multiply(qF));
      H.mesh.updateMatrixWorld(true);
    }
  }
  function handQ(s, x, palm) {
    const y = palm.clone().sub(x.clone().multiplyScalar(palm.dot(x))).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y))).multiply(HAND[s].clone().invert());
  }
  function gripTo(targets) {   // targets[s] = { H: 주먹 중심 위치, x: 손가락 방향, palm: 손바닥이 향할 방향 }
    const Q = {}, pins = {};
    for (const s of ['L', 'R']) { const t = targets[s]; Q[s] = handQ(s, t.x, t.palm); pins[s] = t.H.clone().sub(GC[s].clone().applyQuaternion(Q[s])); }
    return { Q, pins };
  }
  function twistTo(s, palm) {   // 손목은 전완과 일직선(꺾임 0), 손바닥 방향은 전완 비틀기로만
    const la2 = B['lowerarm02.' + s], wr = B['wrist.' + s];
    la2.quaternion.identity(); wr.quaternion.identity(); H.mesh.updateMatrixWorld(true);
    const a = wp('wrist.' + s).sub(wp('lowerarm01.' + s)).normalize();
    const cur = HANDN[s].clone().applyQuaternion(wq('wrist.' + s)), des = palm.clone();
    cur.sub(a.clone().multiplyScalar(cur.dot(a))).normalize(); des.sub(a.clone().multiplyScalar(des.dot(a))).normalize();
    const th = Math.atan2(new THREE.Vector3().crossVectors(cur, des).dot(a), cur.dot(des)); (api.__tw = api.__tw || {})[s] = Math.round(th * 180 / Math.PI);
    for (const [b, f] of [[la2, .65], [wr, .35]]) {   // 비틀림은 전완(65%)과 손목(35%)에 나눠서
      const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(a, th * f)).multiply(pq));
      H.mesh.updateMatrixWorld(true);
    }
  }
  function solveGrip(tg, poleOf) {
    const pins = gripTo(tg).pins;
    for (let it = 0; it < 6; it++) {
      armIK(pins, poleOf);
      for (const s of ['L', 'R']) twistTo(s, tg[s].palm);
      for (const s of ['L', 'R']) { const F = wp('wrist.' + s).add(GC[s].clone().applyQuaternion(wq('wrist.' + s))); pins[s].add(tg[s].H.clone().sub(F)); }
    }
    armIK(pins, poleOf); for (const s of ['L', 'R']) twistTo(s, tg[s].palm);
  }
  function setHands(Q) {
    for (const s of ['L', 'R']) { const pq = B['wrist.' + s].parent.getWorldQuaternion(new THREE.Quaternion()); B['wrist.' + s].quaternion.copy(pq.invert().multiply(Q[s])); }
    H.mesh.updateMatrixWorld(true);
  }
  /* RDL: 덤벨이 허벅지·무릎·정강이 앞면을 스치며 내려가도록 손 위치를 다리 표면에 맞춤 */
  const THIGH_R = [1.05, 1.12, 1.08, .9, .58], SHIN_R = [.55, .32, .27, .3, .38];
  const lerpArr = (A, u) => { const f = u * (A.length - 1), i = Math.min(A.length - 2, Math.floor(f)); return A[i] + (A[i + 1] - A[i]) * (f - i); };
  const HANDC = .8;
  function legHands() {
    const out = {}, tg = {};
    for (const s of ['L', 'R']) {
      const Hp = wp('upperleg01.' + s), Kp = wp('lowerleg01.' + s), Ap = wp('foot.' + s), Sh = wp('upperarm01.' + s);
      const R = ARMK[s].l1 + ARMK[s].l2 + GC[s].length() * .97; let Q = null, N = null, prev = null;
      for (let i = 0; i <= 120; i++) {
        const g = i / 120, thigh = g < .5, u = thigh ? g * 2 : (g - .5) * 2;
        const a = thigh ? Hp : Kp, b = thigh ? Kp : Ap, dir = b.clone().sub(a).normalize();
        const p = a.clone().lerp(b, u), n = VZ.clone().sub(dir.clone().multiplyScalar(VZ.dot(dir))).normalize();
        const q = p.add(n.clone().multiplyScalar((thigh ? lerpArr(THIGH_R, u) : lerpArr(SHIN_R, u)) + .34));
        if (q.distanceTo(Sh) >= R) { Q = prev && prev.q.distanceTo(Sh) < R ? prev.q.clone().lerp(q, (R - prev.q.distanceTo(Sh)) / Math.max(1e-6, q.distanceTo(Sh) - prev.q.distanceTo(Sh))) : q; N = n; break; }
        prev = { q, n }; Q = q; N = n;
      }
      out[s] = { Q, N }; tg[s] = { H: Q, x: Q.clone().sub(Sh).normalize(), palm: N.clone().negate() };   // 손등은 앞, 손바닥은 허벅지 쪽
    }
    solveGrip(tg);
    return out;
  }
  /* 랫 풀다운: 바는 기구에 고정된 경로(머리 위 → 윗가슴), 손은 어깨너비보다 조금 넓게 */
  const BARP = {};
  const avg2 = n => wp(n + '.L').add(wp(n + '.R')).multiplyScalar(.5);
  function initBar(ex) {
    // 바 끝 위치(쇄골 앞)를 먼저 정하고, 도르래는 그보다 앞·위에 둠 → 케이블이 도르래에서 몸통 쪽(뒤·아래)으로 당겨짐
    const R = (ARMK.L.l1 + ARMK.L.l2) * .985, gx = 2.35;
    const q1 = ex.pose(1, false); q1.noBar = true; applyPose(q1, ex);
    const fwd = VZ.clone().applyQuaternion(wq('spine01'));
    // 끝 위치: 팔꿈치가 옆구리 선(몸통 옆, 등 뒤로 넘어가지 않음)에 오고 전완이 케이블 쪽으로 약 25° 기울 때 바가 닿는 곳 = 쇄골 아래 윗가슴 바로 앞
    const S1 = wp('upperarm01.L'), ybot = S1.y + .5, zbot = S1.z + 2.0; window.__bar = [S1.toArray(), ybot, zbot];
    const kn = avg2('lowerleg01'), seatY = wp('upperleg01.L').y - .95, hipZ = wp('upperleg01.L').z;
    const q0 = ex.pose(0, false); q0.noBar = true; applyPose(q0, ex);
    const sh = wp('upperarm01.L');
    const ztop = zbot + 1.6;                                   // 시작 위치(=도르래 바로 아래)는 쇄골보다 앞
    const topOf = x => sh.y + Math.sqrt(Math.max(0, R * R - (x - sh.x) ** 2 - (ztop - .3 - sh.z) ** 2)) + .75;   // 팔을 다 편 높이(그립 너비마다 다름)
    BARP[S.ex] = { gx, ytop: topOf(gx), ztop, ybot, zbot, kn, seatY, hipZ, topOf };
    buildMachine(BARP[S.ex]);
  }
  function barArms(q, ex) {
    const P = BARP[S.ex]; if (!P) return null;
    const t = q.t || 0, low = q.low || 0, G = gripOf(ex), k = G ? G.k : 'over';
    const gx = k === 'under' ? 1.6 : k === 'vbar' ? .62 : 2.3;          // 와이드 오버 ≈ 어깨뼈 너비 1.5배 / 언더 ≈ 1배 / V바 손잡이 간격
    const ytop = P.topOf(gx), ybot = P.ybot - (k === 'vbar' ? .35 : 0);   // V바는 가슴뼈 위쪽까지
    const by = ytop + (ybot - low - ytop) * t, bz = P.ztop + (P.zbot + low * .15 - P.ztop) * t;
    const tg = {};
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, Hn = new THREE.Vector3(sg * gx, by, bz), Sh = wp('upperarm01.' + s);
      const cab = new THREE.Vector3(0, MACH ? MACH.topY - .55 - by : 6, P.ztop - bz).normalize().lerp(new THREE.Vector3(0, .9, .44), .5).normalize();   // 끝: 전완·손 = 케이블 방향(사선 앞·위)
      const dir = Hn.clone().sub(Sh).normalize().lerp(cab, Math.min(1, t * 1.2)).normalize();
      const palm = k === 'under' ? VZ.clone().negate() : k === 'vbar' ? new THREE.Vector3(-sg, 0, 0) : VZ.clone();   // 오버: 손바닥 앞 / 언더: 손바닥 몸 쪽 / V바: 마주 봄
      tg[s] = { H: Hn, x: dir, palm };
    }
    const p0 = k === 'under' ? [.35, -1, -.1] : k === 'vbar' ? [.22, -1, -.6] : [.55, -1, -.45];   // 위: 팔꿈치 옆·살짝 뒤
    const p1 = k === 'under' ? [.12, -.9, .42] : k === 'vbar' ? [.08, -.9, .42] : [.25, -.9, .38];  // 끝: 팔꿈치가 옆구리 선(몸통 앞뒤 가운데쯤)으로, 등 뒤로 넘어가지 않게
    const pt = Math.min(1, t * 1.1), pole = p0.map((v, i) => v + (p1[i] - v) * pt);
    solveGrip(tg, s => new THREE.Vector3((s === 'L' ? 1 : -1) * pole[0], pole[1], pole[2]).normalize());
    return { y: by, z: bz, k };
  }
  /* 체스트 프레스: 손잡이는 가슴 중간 높이에서 몸통에 수직(앞)으로 곧게 밀림, 전완은 미는 방향과 일직선 */
  const PRESSP = {};
  const gripOf = ex => ex.grips ? (ex.grips.find(g => g.k === S.grip[S.ex]) || ex.grips[0]) : null;
  let MACHP = null;
  function initPress(ex) {
    const q0 = ex.pose(0, false); q0.noBar = true; applyPose(q0, ex);
    const fwd = VZ.clone().applyQuaternion(wq('spine01'));
    const sh = wp('upperarm01.L'), shM = avg2('upperarm01');
    const chestY = shM.y - 1.35;                                 // 가슴 중간(가슴뼈 한가운데 높이)
    const chestZ = avg2('clavicle').add(fwd.clone().multiplyScalar(1.0)).z;
    const back = wp('spine02').add(fwd.clone().multiplyScalar(-1.05));
    const gx = 1.85, R = (ARMK.L.l1 + ARMK.L.l2) * .93;          // 끝에서 팔꿈치 살짝 여유
    const zEnd = sh.z + Math.sqrt(Math.max(0, R * R - (gx - sh.x) ** 2 - (chestY - sh.y) ** 2));
    const kn = avg2('lowerleg01'), seatY = wp('upperleg01.L').y - .95, hipZ = wp('upperleg01.L').z;
    PRESSP[S.ex] = { gx, y: chestY, z0: chestZ + .15, z1: zEnd, back, kn, seatY, hipZ, lean: q0.lean || 0, shY: shM.y };
    buildPress(PRESSP[S.ex]);
  }
  function pressArms(q, ex) {
    const P = PRESSP[S.ex]; if (!P) return null;
    const t = q.t || 0, y = P.y + (q.high || 0) * 1.25, z = P.z0 + (P.z1 + (q.lock ? .35 : 0) - P.z0) * t;
    const tg = {};
    const G = gripOf(ex), hz = G && G.handle === 'h', gx = P.gx + (hz ? .95 : 0);   // 가로 손잡이: 어깨너비 약 1.3~1.5배
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, Hn = new THREE.Vector3(sg * (gx + (q.flare || 0) * .35), y, z), Sh = wp('upperarm01.' + s);
      const d = VZ.clone().lerp(Hn.clone().sub(Sh).normalize(), t).normalize();   // 전완 = 미는 방향
      tg[s] = { H: Hn, x: d, palm: hz ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(-sg, 0, 0) };   // 가로: 손등 위(손바닥 아래) / 세로: 손바닥 마주
    }
    const fl = (q.flare || 0) + (hz ? .3 : 0);   // 가로 그립은 팔꿈치가 조금 더 벌어짐(어깨보다 살짝 아래)   // 정상: 팔꿈치 몸통과 약 45° / 실수: 어깨 높이로 벌어짐
    solveGrip(tg, s => { const sg = s === 'L' ? 1 : -1; return new THREE.Vector3(sg * (.75 + fl * 1.2), -(1 - fl * .9), -.55).normalize(); });
    return { y, z, x: gx + (q.flare || 0) * .35, hz };
  }
  function buildPress(P) {
    if (MACHP) scene.remove(MACHP.g);
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }),
      pad = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: .8 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: .3, metalness: .7 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    box(3.0, .45, 3.0, pad, 0, P.seatY - .22, P.hipZ - .2);                        // 의자
    box(.5, P.seatY - .45 - GROUND, .5, frame, 0, (P.seatY - .45 + GROUND) / 2, P.hipZ - .2);
    const bh = P.shY + 1.6 - P.seatY;                                              // 등받이
    const br = box(2.6, bh, .45, pad, 0, P.seatY + bh / 2, P.back.z - .22); br.rotation.x = -P.lean * D2R;
    box(.6, P.shY + 2.4 - GROUND, .6, frame, 0, (P.shY + 2.4 + GROUND) / 2, P.back.z - 1.0);   // 뒤 기둥
    box(1.6, 2.6, .9, frame, 0, GROUND + 1.5, P.back.z - 1.9);                    // 무게 원판
    const piv = [];
    for (const sg of [-1, 1]) {   // 좌우 레버 팔: 뒤쪽 위 축 → 손잡이
      const pv = new THREE.Vector3(sg * 3.1, P.shY + 1.9, P.back.z - .6); piv.push(pv);
      box(.5, .5, .5, frame, pv.x, pv.y, pv.z);
    }
    const lev = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 1, 12), frame); m.castShadow = true; g.add(m); return m; });
    const hnd = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.0, 16), pad); m.castShadow = true; g.add(m); return m; });
    scene.add(g); MACHP = { g, piv, lev, hnd, P, stack: g.children[5] };
  }
  function updPress(b) {
    if (!MACHP) return;
    [-1, 1].forEach((sg, i) => {
      const h = new THREE.Vector3(sg * b.x, b.y, b.z); MACHP.hnd[i].position.copy(h); MACHP.hnd[i].rotation.set(0, 0, b.hz ? Math.PI / 2 : 0);
      const top = h.clone().add(new THREE.Vector3(0, .55, 0)), pv = MACHP.piv[i], d = pv.clone().sub(top);
      MACHP.lev[i].position.copy(top.clone().add(pv).multiplyScalar(.5)); MACHP.lev[i].scale.set(1, d.length(), 1); MACHP.lev[i].quaternion.setFromUnitVectors(VY, d.normalize());
    });
    const P = MACHP.P; MACHP.stack.position.y = GROUND + 1.5 + (b.z - P.z0) * .5;
  }
  /* 시티드 케이블 로우: 낮은 벤치, 무릎 살짝 굽혀 발판, 도르래는 손잡이 끝 높이(아래 갈비뼈) → 케이블이 수평으로 몸통 쪽 */
  const ROW_SEAT = GROUND + 4.2, ROWP = {}; let MACHW = null;
  function initRow(ex) {
    const q1 = ex.pose(1, false); q1.noBar = true; applyPose(q1, ex);
    const fwd = VZ.clone().applyQuaternion(wq('spine01')), rib = wp('spine02');
    const yEnd = rib.y - .3, zEnd = rib.z + 1.75;                 // 끝: 아래 갈비뼈~명치 앞(몸통에 닿기 직전)
    const q0 = ex.pose(0, false); q0.noBar = true; applyPose(q0, ex);
    const sh = wp('upperarm01.L'), R = (ARMK.L.l1 + ARMK.L.l2) * .975 + GC.L.length() * .9, gx = .62;   // 주먹 중심까지 거리, 팔꿈치 살짝 여유
    const zStart = sh.z + Math.sqrt(Math.max(0, R * R - (gx - sh.x) ** 2 - (yEnd - sh.y) ** 2));   // 시작: 팔꿈치 살짝 여유로 쭉 뻗은 곳
    const ft = avg2('foot'), hipZ = wp('upperleg01.L').z;
    window.__row = { R, sh: sh.toArray(), yEnd, zEnd, zStart };
    ROWP[S.ex] = { gx, y: yEnd, z0: zStart, z1: zEnd, ft, hipZ, colZ: Math.max(ft.z + 2.2, zStart + 2.6) };
    buildRow(ROWP[S.ex]);
  }
  function rowArms(q, ex) {
    const P = ROWP[S.ex]; if (!P) return null;
    const t = q.t || 0, y = P.y + (q.rise || 0), z = P.z0 + (P.z1 - P.z0) * t, tg = {};
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, Hn = new THREE.Vector3(sg * P.gx, y, z), Sh = wp('upperarm01.' + s);
      const d = Hn.clone().sub(Sh).normalize().lerp(VZ, Math.min(1, t * 1.15)).normalize();   // 전완 = 케이블 선(수평)
      tg[s] = { H: Hn, x: d, palm: new THREE.Vector3(-sg, 0, 0) };    // V핸들: 손바닥 마주 봄
    }
    const fl = q.flare || 0;   // 정상: 팔꿈치 옆구리에 붙여 뒤로 / 실수: 옆으로 벌어짐
    solveGrip(tg, s => { const sg = s === 'L' ? 1 : -1; return new THREE.Vector3(sg * (.3 + fl), -1 + fl * .6, -.55).normalize(); });
    return { y, z };
  }
  function buildRow(P) {
    if (MACHW) scene.remove(MACHW.g);
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }),
      pad = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: .8 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: .3, metalness: .7 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    box(2.4, .45, 7.5, pad, 0, ROW_SEAT - .22, P.hipZ + .6);                       // 긴 벤치
    box(.5, ROW_SEAT - .45 - GROUND, .5, frame, 0, (ROW_SEAT - .45 + GROUND) / 2, P.hipZ - 1.8);
    box(.5, ROW_SEAT - .45 - GROUND, .5, frame, 0, (ROW_SEAT - .45 + GROUND) / 2, P.hipZ + 3.6);
    const fp = box(4.0, 3.0, .3, frame, 0, P.ft.y + .55, P.ft.z + 1.0); fp.rotation.x = .3;   // 발판(살짝 기울어짐)
    box(.4, P.ft.y - .6 - GROUND, .4, frame, 0, (P.ft.y - .6 + GROUND) / 2, P.ft.z + 1.5);
    box(1.0, P.y + 2.2 - GROUND, 1.0, frame, 0, (P.y + 2.2 + GROUND) / 2, P.colZ);            // 기둥
    const pul = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .25, 24), steel); pul.rotation.z = Math.PI / 2; pul.position.set(0, P.y, P.colZ - .6); g.add(pul);
    const stack = box(1.6, 2.6, .9, frame, 0, GROUND + 1.5, P.colZ + .95);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1, 8), steel); g.add(cable);
    const vh = new THREE.Group();   // 삼각(V) 핸들: 세로 손잡이 두 개 + 앞으로 모이는 V
    for (const sg of [-1, 1]) {
      const hd = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 1.0, 16), pad); hd.position.set(sg * P.gx, 0, 0); vh.add(hd);
      for (const yy of [.5, -.5]) {
        const a = new THREE.Vector3(sg * P.gx, yy, 0), b2 = new THREE.Vector3(0, 0, 1.0), d = b2.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1, 10), steel);
        m.position.copy(a.clone().add(b2).multiplyScalar(.5)); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(VY, d.normalize()); vh.add(m);
      }
    }
    vh.traverse(o => o.castShadow = true); g.add(vh);
    scene.add(g); MACHW = { g, cable, vh, stack, P };
  }
  function updRow(b) {
    if (!MACHW) return; const P = MACHW.P;
    MACHW.vh.position.set(0, b.y, b.z);
    const a = new THREE.Vector3(0, b.y, b.z + 1.0), c = new THREE.Vector3(0, P.y, P.colZ - .6), d = c.clone().sub(a);
    MACHW.cable.position.copy(a.clone().add(c).multiplyScalar(.5)); MACHW.cable.scale.set(1, d.length(), 1); MACHW.cable.quaternion.setFromUnitVectors(VY, d.normalize());
    MACHW.stack.position.y = GROUND + 1.5 + (b.z - P.z0) * -.45;
  }
  /* 시티드 로우 머신(가슴 패드): 가슴 중간은 패드에 고정, 손잡이는 가슴 높이에서 수평으로 몸 쪽 */
  const MROWP = {}; let MACHM = null;
  function initMrow(ex) {
    const q1 = ex.pose(1, false); q1.noBar = true; applyPose(q1, ex);
    const fwd = VZ.clone().applyQuaternion(wq('spine01')), shM = avg2('upperarm01');
    const padY = shM.y - 1.5; let cz = -1e9; const v = new THREE.Vector3();
    for (let i = 0; i < H.nv; i++) { H.mesh.getVertexPosition(i, v); H.mesh.localToWorld(v); if (Math.abs(v.x) < .6 && Math.abs(v.y - padY) < .5 && v.z > cz) cz = v.z; }   // 가슴뼈 앞 피부 표면
    const padC = new THREE.Vector3(0, padY, cz + .02);   // 패드 면이 가슴 중간(가슴뼈)에 가볍게 닿게
    const q0 = ex.pose(0, false); q0.noBar = true; applyPose(q0, ex);
    const sh = wp('upperarm01.L'), y = shM.y - 1.35;                                        // 손잡이: 가슴 높이(어깨보다 조금 아래)
    const R = (ARMK.L.l1 + ARMK.L.l2) * .975 + GC.L.length() * .9;
    const zOf = gx => sh.z + Math.sqrt(Math.max(0, R * R - (gx - sh.x) ** 2 - (y - sh.y) ** 2));
    const seatY = wp('upperleg01.L').y - .95, hipZ = wp('upperleg01.L').z, ft = avg2('foot');
    MROWP[S.ex] = { ft, y, zOf, z1: padC.z + .7, padC, seatY, hipZ, lean: q0.lean || 0 };
    buildMrow(MROWP[S.ex]);
  }
  function mrowArms(q, ex) {
    const P = MROWP[S.ex]; if (!P) return null;
    const G = gripOf(ex), hz = G && G.handle === 'h', gx = hz ? 2.15 : 1.55;   // 세로: 어깨너비쯤 / 가로: 조금 더 넓게
    const t = q.t || 0, z0 = P.zOf(gx), y = P.y + (q.rise || 0), z = z0 + (P.z1 + (q.lb || 0) - z0) * t, tg = {};
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, Hn = new THREE.Vector3(sg * gx, y, z), Sh = wp('upperarm01.' + s);
      const d = Hn.clone().sub(Sh).normalize().lerp(VZ, Math.min(1, t * 1.15)).normalize();   // 전완 = 당기는 선(수평)
      tg[s] = { H: Hn, x: d, palm: hz ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(-sg, 0, 0) };
    }
    const fl = (q.flare || 0) + (hz ? .55 : 0);   // 세로: 팔꿈치 옆구리 / 가로: 팔꿈치 약 45° 벌려 뒤로
    solveGrip(tg, s => { const sg = s === 'L' ? 1 : -1; return new THREE.Vector3(sg * (.12 + fl), -.8 + fl * .6, -.6).normalize(); });
    return { y, z, x: gx, hz };
  }
  function buildMrow(P) {
    if (MACHM) scene.remove(MACHM.g);
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }),
      pad = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: .8 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: .3, metalness: .7 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    box(3.0, .45, 3.0, pad, 0, P.seatY - .22, P.hipZ - .2);                                    // 의자
    box(.5, P.seatY - .45 - GROUND, .5, frame, 0, (P.seatY - .45 + GROUND) / 2, P.hipZ - .2);
    box(.4, .4, P.padC.z + 3.2 - (P.hipZ - .2), frame, 0, GROUND + .3, (P.padC.z + 3.2 + P.hipZ - .2) / 2);   // 바닥 프레임
    box(2.0, 3.4, .55, pad, 0, P.padC.y - .3, P.padC.z + .275);                                   // 가슴 패드(가슴~명치까지 길게)
    const colZ = P.padC.z + 3.2;
    box(.45, .45, colZ - P.padC.z - .5, frame, 0, P.padC.y, (colZ + P.padC.z + .5) / 2);         // 패드 앞뒤 조절 봉
    const postZ = P.padC.z + 1.1;
    box(.45, P.padC.y - GROUND, .45, frame, 0, (P.padC.y + GROUND) / 2, postZ);                 // 패드 아래 기둥
    const fy = P.ft.y - .62;                                                                    // 발받침(발바닥 아래)
    box(4.4, .22, 1.6, frame, 0, fy, P.ft.z + .3);
    box(.4, fy - GROUND, .4, frame, 0, (fy + GROUND) / 2, P.ft.z + .3);
    box(1.0, P.y + 3.4 - GROUND, 1.0, frame, 0, (P.y + 3.4 + GROUND) / 2, colZ);                // 앞 기둥
    const stack = box(1.6, 2.6, .9, frame, 0, GROUND + 1.5, colZ + .95);
    const piv = [];
    for (const sg of [-1, 1]) { const pv = new THREE.Vector3(sg * 2.6, P.y + 3.2, colZ - .6); piv.push(pv); box(.5, .5, .5, frame, pv.x, pv.y, pv.z); }
    const lev = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 1, 12), frame); m.castShadow = true; g.add(m); return m; });
    const hnd = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.0, 16), pad); m.castShadow = true; g.add(m); return m; });
    scene.add(g); MACHM = { g, piv, lev, hnd, stack, P };
  }
  function updMrow(b) {
    if (!MACHM) return;
    [-1, 1].forEach((sg, i) => {
      const h = new THREE.Vector3(sg * b.x, b.y, b.z); MACHM.hnd[i].position.copy(h); MACHM.hnd[i].rotation.set(0, 0, b.hz ? Math.PI / 2 : 0);
      const top = h.clone().add(new THREE.Vector3(0, .55, .15)), pv = MACHM.piv[i], d = pv.clone().sub(top);
      MACHM.lev[i].position.copy(top.clone().add(pv).multiplyScalar(.5)); MACHM.lev[i].scale.set(1, d.length(), 1); MACHM.lev[i].quaternion.setFromUnitVectors(VY, d.normalize());
    });
    MACHM.stack.position.y = GROUND + 1.5 + (MACHM.P.zOf(b.x) - b.z) * .45;
  }
  /* 스미스 머신: 바는 레일을 따라 수직으로만 움직임. 바 위치 = 상부 승모근(목 아래, C7 바로 아래 뒤쪽) */
  let MACHS = null;
  function barPt() {
    const sm = EX[S.ex] && EX[S.ex].smith;
    if (sm && sm.hang) { const sh = avg2('upperarm01'); const r = (ARMK.L.l1 + ARMK.L.l2 + GC.L.length()) * .97, bk = sm.back || 0; return sh.add(new THREE.Vector3(0, -Math.sqrt(r * r - bk * bk), -bk)); }   // back: 바가 어깨보다 뒤(엉덩이 쪽)   // 팔을 늘어뜨린 손(바) 위치
    const n = wp('neck01'), sp = wp('spine01'), up = n.clone().sub(sp).normalize();
    const fwd = VZ.clone().applyQuaternion(wq('spine01')); fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize();
    const r = n.add(fwd.multiplyScalar(-(window.__bk ?? .95))).add(up.multiplyScalar(-(window.__bd ?? .25))); window.__BP = r.toArray(); return r;
  }
  function smithArms(q, ex) {   // 전완이 거의 수직(팔꿈치가 손 바로 아래)이 되도록 전완 방향을 찾아 팔꿈치를 놓음
    const Bp = barPt(), gx = ex.smith.gx, pins = {}, E = {}, palm = VZ.clone();
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, Hn = new THREE.Vector3(sg * gx, Bp.y, Bp.z), Sh = wp('upperarm01.' + s), K = ARMK[s];
      let best = null;
      for (let a = -40; a <= 30; a += 2) for (let b = -40; b <= 50; b += 2) {   // a: 전완 바깥(+)/안쪽 기울기, b: 앞(+)/뒤 기울기
        const d = new THREE.Vector3(sg * Math.sin(a * D2R), Math.cos(a * D2R) * Math.cos(b * D2R), Math.sin(b * D2R)).normalize();
        const pin = Hn.clone().sub(GC[s].clone().applyQuaternion(handQ(s, d, palm)));
        const e = pin.clone().sub(d.clone().multiplyScalar(K.l2)), r = e.distanceTo(Sh) - K.l1;
        const fwdE = Math.max(0, e.z - (Sh.z - .45)), inE = Math.max(0, sg * (Sh.x - e.x) + .35);   // 팔꿈치는 어깨보다 뒤·바깥(바 아래로 내려 등 위쪽을 조이는 자세)
        const c = (r > 0 ? r * r * 40 : r * r * 6) + fwdE * fwdE * 8 + inE * inE * 8 + (a / 30) ** 2 * .15 + (b / 40) ** 2 * .15;
        if (!best || c < best.c) best = { c, pin, e, a, b, r };
      }
      pins[s] = best.pin; E[s] = best.e.clone().sub(Sh); (window.__sm = window.__sm || {})[s] = [best.a, best.b, +best.r.toFixed(2), best.e.toArray().map(v => +v.toFixed(2))];
    }
    armIK(pins, s => E[s].clone().normalize());
    for (const s of ['L', 'R']) twistTo(s, palm);
    return Bp;
  }
  function buildSmith(zb) {
    if (MACHS) scene.remove(MACHS.g);
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }),
      steel = new THREE.MeshStandardMaterial({ color: 0xb4bac4, roughness: .25, metalness: .8 }), plate = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: .7 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const H2 = 21, top = GROUND + H2;
    for (const sg of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, H2, 12), steel); r.position.set(sg * 5.4, GROUND + H2 / 2, zb); g.add(r);   // 레일
      box(.55, H2, .55, frame, sg * 6.3, GROUND + H2 / 2, zb - 2.2); box(.55, H2, .55, frame, sg * 6.3, GROUND + H2 / 2, zb + 2.2);
      box(.5, .4, 5.0, frame, sg * 6.3, GROUND + .2, zb); box(.5, .4, 5.0, frame, sg * 6.3, top, zb);
      box(1.3, .25, .25, frame, sg * 5.85, top - .4, zb); box(1.3, .25, .25, frame, sg * 5.85, GROUND + .6, zb);
    }
    box(13.2, .4, .5, frame, 0, top, zb - 2.2); box(13.2, .4, .5, frame, 0, top, zb + 2.2);
    const bar = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 12.4, 16), steel.clone()); shaft.rotation.z = Math.PI / 2; shaft.userData.keep = true; bar.add(shaft);   // 바는 항상 진하게
    for (const sg of [-1, 1]) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(.5, .7, .55), frame); sl.position.set(sg * 5.4, 0, 0); bar.add(sl);      // 레일 슬리브(후크)
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, .32, 28), plate); pl.rotation.z = Math.PI / 2; pl.position.set(sg * 4.6, 0, 0); bar.add(pl);
    }
    bar.traverse(o => o.castShadow = true); g.add(bar);
    const safe = []; for (const sg of [-1, 1]) safe.push(box(.7, .3, .7, frame, sg * 5.4, GROUND + 6, zb));   // 안전 스토퍼
    scene.add(g); MACHS = { g, bar, safe, zb };
  }
  /* 페이스 풀: 눈높이 도르래 → 얼굴 쪽으로 수평 당김, 팔꿈치는 어깨 높이로 벌리고 끝에서 주먹이 귀 옆(바깥 회전) */
  const ROPEP = {}; let MACHR = null;
  function initRope(ex) {
    const q0 = ex.pose(0, false); q0.noBar = true; applyPose(q0, ex); legIK(q0, ex);
    const sh = wp('upperarm01.L'), R = (ARMK.L.l1 + ARMK.L.l2) * .96 + GC.L.length() * .9;
    const ys = sh.y + .75, xs = .5, zs = sh.z + Math.sqrt(Math.max(0, R * R - (xs - sh.x) ** 2 - (ys - sh.y) ** 2));
    const ropeL = 1.9, colZ = zs + ropeL + 1.6, py = sh.y + 1.85;
    ROPEP[S.ex] = { s: new THREE.Vector3(xs, ys, zs), e: new THREE.Vector3(1.75, sh.y + 1.55, sh.z + .25), m: new THREE.Vector3(1.0, sh.y + .1, sh.z + 1.7), ropeL, colZ, py };
    buildRope(ROPEP[S.ex]);
  }
  function ropeArms(q, ex) {
    const P = ROPEP[S.ex]; if (!P) return null;
    const t = q.t || 0, mk = !!q.drop, E = mk ? P.m : P.e;
    const tg = {}, hand = {};
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, Sh = wp('upperarm01.' + s);
      const Hn = new THREE.Vector3(sg * (P.s.x + (E.x - P.s.x) * t), P.s.y + (E.y - P.s.y) * t, P.s.z + (E.z - P.s.z) * t);
      const fx = Hn.clone().sub(Sh).normalize().lerp(mk ? VZ : new THREE.Vector3(0, 1, .25).normalize(), Math.min(1, t * 1.1)).normalize();
      const palm = new THREE.Vector3(-sg * .5, -.85, 0).lerp(mk ? new THREE.Vector3(-sg, -.3, 0) : new THREE.Vector3(-sg * .35, 0, 1), t).normalize();   // 처음 손바닥 아래·안쪽 → 끝에 앞(바깥 회전)
      tg[s] = { H: Hn, x: fx, palm }; hand[s] = Hn;
    }
    solveGrip(tg, s => { const sg = s === 'L' ? 1 : -1; return mk ? new THREE.Vector3(sg * .45, -1, -.4).normalize() : new THREE.Vector3(sg, -.08, -.35).normalize(); });
    // 로프: 케이블 끝(가운데)에서 양손으로
    const mid = hand.L.clone().add(hand.R).multiplyScalar(.5), pul = new THREE.Vector3(0, P.py, P.colZ - .5);
    const dir = pul.clone().sub(mid).normalize(), half = hand.L.distanceTo(hand.R) / 2;
    const c = mid.clone().add(dir.multiplyScalar(Math.sqrt(Math.max(.05, P.ropeL * P.ropeL - half * half))));
    return { L: hand.L, R: hand.R, c, pul };
  }
  function buildRope(P) {
    if (MACHR) scene.remove(MACHR.g);
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: .3, metalness: .7 }); let rope = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: .9 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const band = !!EX[S.ex].band, red = new THREE.MeshStandardMaterial({ color: 0xE8322A, roughness: .7 });
    box(band ? .45 : 1.0, P.py + 2 - GROUND, band ? .45 : 1.0, frame, 0, (P.py + 2 + GROUND) / 2, P.colZ);   // 밴드: 기둥(랙)에 묶음
    const pul = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .25, 24), steel); pul.rotation.z = Math.PI / 2; pul.position.set(0, P.py, P.colZ - .5); pul.visible = !band; g.add(pul);
    const stack = box(1.6, 2.6, .9, frame, 0, GROUND + 1.5, P.colZ + .95); stack.visible = !band;
    if (band) rope = red;
    const seg = m => { const c = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), m); c.castShadow = true; g.add(c); return c; };
    scene.add(g); MACHR = { g, cable: seg(steel), rL: seg(rope), rR: seg(rope), stack, P, band };
  }
  let CAB = null;   // 케이블 타워(위 도르래) + 손잡이: 일자바 · V바 · 로프
  function buildCab(c) {
    if (CAB) scene.remove(CAB.g);
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }), steel = new THREE.MeshStandardMaterial({ color: 0xa9afb8, roughness: .28, metalness: .8 }), grip = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: .8 }), ropeM = new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: .95 });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const top = c.pul.y + 1.2, cz = c.pul.z + 1.7;
    box(1.0, top - GROUND, 1.0, frame, 0, (top + GROUND) / 2, cz + .6); box(1.0, .5, 2.6, frame, 0, c.pul.y + .55, cz - .9);
    const pul = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .26, 24), steel); pul.rotation.z = Math.PI / 2; pul.position.copy(c.pul); g.add(pul);
    const stack = box(1.6, 2.6, .9, frame, 0, GROUND + 1.5, cz + 1.4);
    const seg = (m, rad = 1) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 1, 12), m); o.castShadow = true; g.add(o); return o; };
    const knob = () => { const o = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 10), ropeM); g.add(o); return o; };
    scene.add(g); CAB = { g, ex: S.ex, cable: seg(steel), a: seg(steel), b: seg(steel), sl: seg(grip), sr: seg(grip), kL: knob(), kR: knob(), stack, ropeM, steel, grip, y0: GROUND + 1.5 };
  }
  function updCab(c) {
    if (!CAB || CAB.ex !== S.ex) buildCab(c);
    const { L, R, att, pul, type } = c, K = CAB; K.g.visible = true;
    line(K.cable, pul, att, .035);
    const show = (m, v) => { m.visible = v; };
    if (type === 'bar') {   // 일자바: 양손 바깥으로 조금 더, 가운데에 케이블
      const d = R.clone().sub(L).normalize(), a0 = L.clone().add(d.clone().multiplyScalar(-.5)), a1 = R.clone().add(d.clone().multiplyScalar(.5));
      K.a.material = K.steel; line(K.a, a0, a1, .09); show(K.a, true); show(K.b, false);
      K.sl.material = K.grip; line(K.sl, L.clone().add(d.clone().multiplyScalar(-.35)), L.clone().add(d.clone().multiplyScalar(.35)), .12); line(K.sr, R.clone().add(d.clone().multiplyScalar(-.35)), R.clone().add(d.clone().multiplyScalar(.35)), .12); show(K.sl, true); show(K.sr, true); show(K.kL, false); show(K.kR, false);
    } else if (type === 'v') {   // V바(ㅅ자): 꼭짓점에 케이블, 양 끝을 손으로
      K.a.material = K.b.material = K.steel; line(K.a, att, L, .08); line(K.b, att, R, .08); show(K.a, true); show(K.b, true);
      const dl = L.clone().sub(att).normalize(), dr = R.clone().sub(att).normalize();
      line(K.sl, L.clone().add(dl.clone().multiplyScalar(-.35)), L.clone().add(dl.clone().multiplyScalar(.3)), .12); line(K.sr, R.clone().add(dr.clone().multiplyScalar(-.35)), R.clone().add(dr.clone().multiplyScalar(.3)), .12); show(K.sl, true); show(K.sr, true); show(K.kL, false); show(K.kR, false);
    } else {   // 로프: 매듭(케이블 끝)에서 두 가닥, 손 아래에 매듭 공
      K.a.material = K.b.material = K.ropeM; const eL = L.clone().add(L.clone().sub(att).normalize().multiplyScalar(.32)), eR = R.clone().add(R.clone().sub(att).normalize().multiplyScalar(.32));
      line(K.a, att, eL, .085); line(K.b, att, eR, .085); show(K.a, true); show(K.b, true); show(K.sl, false); show(K.sr, false);
      K.kL.position.copy(eL); K.kR.position.copy(eR); show(K.kL, true); show(K.kR, true);
    }
    K.stack.position.y = K.y0 + Math.max(0, (pul.distanceTo(att) - c.len0)) * .5;
  }
  function line(m, a, b, r) { const d = b.clone().sub(a); m.position.copy(a.clone().add(b).multiplyScalar(.5)); m.scale.set(r, d.length(), r); m.quaternion.setFromUnitVectors(VY, d.normalize()); }
  function updRope(b) {
    if (!MACHR) return;
    if (MACHR.band) { const a = new THREE.Vector3(0, MACHR.P.py, MACHR.P.colZ - .25); MACHR.cable.visible = false; line(MACHR.rL, a, b.L, .07); line(MACHR.rR, a, b.R, .07); return; }   // 밴드: 기둥에서 양손으로
    line(MACHR.cable, b.pul, b.c, .04); line(MACHR.rL, b.c, b.L, .08); line(MACHR.rR, b.c, b.R, .08);
    MACHR.stack.position.y = GROUND + 1.5 + (MACHR.P.s.z - (b.L.z + b.R.z) / 2) * .4;
  }
  /* 기구(일반형 랫 풀다운 머신) */
  let MACH = null;
  function buildMachine(P) {
    if (MACH) { scene.remove(MACH.g); }
    const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }),
      pad = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: .8 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: .3, metalness: .7 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const colZ = P.kn.z + 2.6, topY = P.ytop + 2.6;
    box(3.0, .45, 3.0, pad, 0, P.seatY - .22, P.hipZ - .2);                       // 의자
    box(.5, P.seatY - .45 - GROUND, .5, frame, 0, (P.seatY - .45 + GROUND) / 2, P.hipZ - .2);
    const kp = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 3.6, 24), pad); kp.rotation.z = Math.PI / 2; kp.position.set(0, P.kn.y + 1.5, P.kn.z - 1.0); kp.castShadow = true; g.add(kp);   // 허벅지 패드
    box(.35, .35, colZ - (P.kn.z - 1.0), frame, 0, P.kn.y + 1.5, (colZ + P.kn.z - 1.0) / 2);
    box(1.0, topY - GROUND, 1.0, frame, 0, (topY + GROUND) / 2, colZ);           // 기둥
    box(.6, .6, colZ - P.ztop + .6, frame, 0, topY, (colZ + P.ztop) / 2);        // 위쪽 빔
    const pul = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .25, 24), steel); pul.rotation.z = Math.PI / 2; pul.position.set(0, topY - .55, P.ztop); g.add(pul);
    const stack = box(1.6, 2.6, .9, frame, 0, GROUND + 1.5, colZ + .95);          // 무게 원판
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1, 8), steel); g.add(cable);
    const bar = new THREE.Group(); const bm = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 4.4, 16), steel); bm.rotation.z = Math.PI / 2; bar.add(bm);
    for (const sg of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.1, 16), pad); e.rotation.z = Math.PI / 2 - sg * .35; e.position.set(sg * 2.6, -.18, 0); bar.add(e); }
    bar.traverse(o => o.castShadow = true); g.add(bar);
    const vb = new THREE.Group();   // V바: 손잡이 두 개(앞뒤 방향) + 위로 모이는 V
    for (const sg of [-1, 1]) {
      const hd = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 1.0, 16), pad); hd.rotation.x = Math.PI / 2; hd.position.set(sg * .62, 0, 0); vb.add(hd);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1.0, 10), steel); const a = new THREE.Vector3(sg * .62, .05, 0), b2 = new THREE.Vector3(0, .95, 0), d = b2.clone().sub(a);
      arm.position.copy(a.clone().add(b2).multiplyScalar(.5)); arm.scale.set(1, d.length(), 1); arm.quaternion.setFromUnitVectors(VY, d.normalize()); vb.add(arm);
    }
    vb.traverse(o => o.castShadow = true); vb.visible = false; g.add(vb);
    scene.add(g); MACH = { g, cable, bar, vb, stack, topY, P };
  }
  function updMachine(b) {
    if (!MACH) return; const P = MACH.P;
    const v = b.k === 'vbar'; MACH.bar.visible = !v; MACH.vb.visible = v;
    MACH.bar.position.set(0, b.y, b.z); MACH.vb.position.set(0, b.y, b.z);
    const top = new THREE.Vector3(0, MACH.topY - .55, P.ztop), bot = new THREE.Vector3(0, b.y + (v ? .95 : 0), b.z), d = top.clone().sub(bot);
    MACH.cable.position.copy(bot.clone().add(top).multiplyScalar(.5)); MACH.cable.scale.set(1, d.length(), 1); MACH.cable.quaternion.setFromUnitVectors(VY, d.normalize());
    MACH.stack.position.y = GROUND + 1.5 + (P.ytop - b.y) * .5;
  }
  function palmsDown() {
    for (const s of ['L', 'R']) {
      const pq = B['wrist.' + s].parent.getWorldQuaternion(new THREE.Quaternion());
      B['wrist.' + s].quaternion.copy(pq.invert().multiply(HAND_T.clone().multiply(HAND[s].clone().invert())));
    }
    H.mesh.updateMatrixWorld(true);
  }

  /* 다리 IK용 바인드 프레임 */
  const LEG = {};
  for (const s of ['L', 'R']) {
    const h = BIND['upperleg01.' + s], k = BIND['lowerleg01.' + s], a = BIND['foot.' + s];
    const frame = y => { const x = new THREE.Vector3().crossVectors(y, VZ).normalize(); const z = new THREE.Vector3().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
    const yT = k.clone().sub(h).normalize(), yS = a.clone().sub(k).normalize();
    LEG[s] = { l1: h.distanceTo(k), l2: k.distanceTo(a), qbT: frame(yT), qbS: frame(yS) };
  }

  /* 관절 표시 */
  const JM = [];
  const jmat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: .95 });
  const JCOL = { C: 0x8B5CF6, T: 0xF59E0B, L: 0xEC4899, P: 0x14171c, X: 0x14171c };
  const JLIST = [['root', 'P', .2], ['spine05', 'L', .16], ['spine04', 'L', .16], ['spine03', 'L', .16], ['spine02', 'T', .16], ['spine01', 'T', .16], ['neck01', 'C', .14], ['neck02', 'C', .13], ['neck03', 'C', .13], ['head', 'C', .13]];
  for (const s of ['L', 'R']) JLIST.push(['upperleg01.' + s, 'X', .2], ['lowerleg01.' + s, 'X', .2], ['foot.' + s, 'X', .17], ['upperarm01.' + s, 'X', .17], ['lowerarm01.' + s, 'X', .15], ['wrist.' + s, 'X', .12]);
  for (const [n, k, r] of JLIST) {
    const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), jmat(JCOL[k])); m.renderOrder = 20;
    const ring = new THREE.Mesh(new THREE.SphereGeometry(r * 1.55, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: .85 })); ring.renderOrder = 19;
    g.add(ring, m); B[n].add(g); JM.push(g);
  }
  const spineIds = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head'];
  const sLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(spineIds.map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0x14171c, depthTest: false, transparent: true, opacity: .55 }));
  sLine.renderOrder = 18; scene.add(sLine);

  /* 덤벨 */
  const dbMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: .5, metalness: .3 });
  function dumbbell() { const g = new THREE.Group(); const bar = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.3, 16), dbMat); bar.rotation.z = Math.PI / 2; g.add(bar);
    for (const x of [-.55, .55]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .32, 24), dbMat); p.rotation.z = Math.PI / 2; p.position.x = x; g.add(p); } g.traverse(o => o.castShadow = true); return g; }
  const dbL = dumbbell(), dbR = dumbbell(), dbG = dumbbell(); scene.add(dbL, dbR, dbG); dbG.rotation.z = Math.PI / 2;
  const BAND = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1, 10), new THREE.MeshStandardMaterial({ color: 0xE8322A, roughness: .7 })); BAND.visible = false; scene.add(BAND);   // 밴드
  const BOX = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .6 })); BOX.visible = false; BOX.castShadow = BOX.receiveShadow = true; scene.add(BOX);   // 박스(의자)
  const BENCH = new THREE.Group(); { const m1 = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: .8 }), m2 = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }); for (const m of [m1, m2, m2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m); b.castShadow = b.receiveShadow = true; BENCH.add(b); } } BENCH.visible = false; scene.add(BENCH);
  const BL = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: 0xE8322A, roughness: .7 })); m.visible = false; scene.add(m); return m; });
  const PUB = new THREE.Group(); { const st = new THREE.MeshStandardMaterial({ color: 0xb4bac4, roughness: .25, metalness: .8 }), fr = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 8, 16), st); b.rotation.z = Math.PI / 2; PUB.add(b);
    for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.5, 30, .5), fr); p.position.set(sg * 4.2, -15 + .2, .5); PUB.add(p); } PUB.traverse(o => o.castShadow = true); } PUB.visible = false; scene.add(PUB);   // 풀업 바
  const LP = new THREE.Group(); { const fr = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .5, metalness: .4 }), pad = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: .8 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.4, .35), fr); LP.add(plate); const back = new THREE.Mesh(new THREE.BoxGeometry(3, 7, .5), pad); LP.add(back); const seat = new THREE.Mesh(new THREE.BoxGeometry(3, .5, 3.2), pad); LP.add(seat);
    const rail = [-1, 1].map(sg => { const r = new THREE.Mesh(new THREE.BoxGeometry(.35, .35, 1), fr); LP.add(r); return r; }); const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 2.2), fr); LP.add(base); const legs = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(.4, 1, .4), fr); LP.add(m); return m; }); LP.userData = { plate, back, seat, rail, base, legs }; LP.traverse(o => { o.castShadow = o.receiveShadow = true; }); } LP.visible = false; scene.add(LP);   // 레그 프레스
  function updSled(b) {   // b = { c: 발판 중심, dir: 미는 방향, back: 등받이 중심, backQ, seatY, hipZ }
    const U = LP.userData; U.plate.position.copy(b.c); U.plate.quaternion.setFromUnitVectors(VZ, b.dir.clone().negate());
    U.back.position.copy(b.back); U.back.quaternion.copy(b.backQ); U.seat.position.set(0, b.seatY, b.hipZ);
    const n = new THREE.Vector3(0, -b.dir.z, b.dir.y);   // 발판 아래쪽(레일 방향)
    U.base.scale.set(1, b.seatY - .25 - GROUND, 1); U.base.position.set(0, (b.seatY - .25 + GROUND) / 2, b.hipZ);   // 의자 받침
    if (!U.r0) U.r0 = b.c.clone();   // 레일은 맨 위 자세 기준으로 고정
    U.rail.forEach((r, i) => { const sg = i ? 1 : -1, o = new THREE.Vector3(sg * 2.85, 0, 0).add(b.dir.clone().multiplyScalar(.4)), a = U.r0.clone().add(o).add(b.dir.clone().multiplyScalar(-4.5)), e = U.r0.clone().add(o).add(b.dir.clone().multiplyScalar(1.2)); const d = e.clone().sub(a); r.position.copy(a.clone().add(e).multiplyScalar(.5)); r.scale.set(1, 1, d.length()); r.quaternion.setFromUnitVectors(VZ, d.normalize());
      const L = U.legs[i]; L.scale.set(1, e.y - GROUND, 1); L.position.set(e.x, (e.y + GROUND) / 2, e.z); });
  }
  const BARPIN = {};
  function barPins() {   // 고정된 바(손 짚는 곳): 발 위치 기준 높이·거리
    if (BARPIN[S.ex]) return BARPIN[S.ex]; const c = EX[S.ex].bar; if (!c) return null;
    const fz = (BIND['foot.L'].z + BIND['foot.R'].z) / 2, gx = Math.abs(BIND['upperarm01.L'] ? BIND['upperarm01.L'].x : 1.6) + (c.gx ?? .5);
    return BARPIN[S.ex] = { L: new THREE.Vector3(gx, GROUND + c.y, fz + c.dz), R: new THREE.Vector3(-gx, GROUND + c.y, fz + c.dz) };
  }
  const HX = { grip: () => gripOf(EX[S.ex]), arm: s => ({ l1: ARMK[s].l1, l2: ARMK[s].l2, gc: GC[s].length() }), get ground() { return GROUND; }, bind: n => BIND[n].clone(), legLen: BIND['upperleg01.L'].distanceTo(BIND['foot.L']), get smithZ() { return MACHS && MACHS.ex === S.ex ? MACHS.zb : null; }, get bar() { return barPins(); }, quatUp: v => new THREE.Quaternion().setFromUnitVectors(VY, v.clone().normalize()), quatX: d => new THREE.Quaternion().setFromAxisAngle(VX, d * D2R), V: (x, y, z) => new THREE.Vector3(x, y, z), wp: n => wp(n), reach: s => (ARMK[s].l1 + ARMK[s].l2) + GC[s].length(), fwd: () => VZ.clone().applyQuaternion(wq('spine01')), up: () => wp('neck01').sub(wp('spine01')).normalize() };

  /* 상태 */
  const S = { mode: 'ex', ex: 'squat', mk: false, slow: false, paused: false, showJ: false, clock: 0, sel: null, view: 'side', grip: {} };
  const E = () => S.mode === 'map' ? STAND : EX[S.ex];

  const qx = (b, deg) => b.quaternion.setFromAxisAngle(VX, deg * D2R);
  const SPLIT = { L: [['spine05', .3], ['spine04', .4], ['spine03', .3]], T: [['spine02', .5], ['spine01', .5]], C: [['neck01', .3], ['neck02', .25], ['neck03', .25], ['head', .2]] };
  function setArm(s, flexDeg, elbowDeg, clavQ) {
    const A = ARM[s]; const qf = new THREE.Quaternion().setFromAxisAngle(VX, -flexDeg * D2R);
    const q = qf.multiply(A.q1); if (clavQ) q.premultiply(clavQ.clone().invert());
    B['upperarm01.' + s].quaternion.copy(q);
    B['lowerarm01.' + s].quaternion.setFromAxisAngle(A.axis, -(A.a0 - elbowDeg * D2R));
  }
  function applyPose(q, ex, lag) {
    if (H.mesh.userData.rolled) { H.mesh.quaternion.identity(); H.mesh.position.set(0, 0, 0); H.mesh.userData.rolled = false; H.mesh.updateMatrixWorld(true); }
    let pelvisW;
    if (ex.quad) { pelvisW = 90 + q.P + (q.dq || 0); q.hip = pelvisW; }
    else if (ex.seated) { pelvisW = -(q.lean || 0) + (q.P || 0); q.hip = pelvisW + 90 - (q.P || 0) - (ex.thighDrop || 0); q.knee = ex.seatKnee ?? 90; q.ank = ex.seatAnk ?? 0; }
    else if (ex.supine) { pelvisW = -90 + (q.P || 0); q.hip = 0; q.knee = 0; q.ank = 0; }
    else if (ex.free) { pelvisW = q.pw; q.hip = 0; q.knee = 0; q.ank = 0; }   // 자유 자세: 골반 각도·다리 관절을 직접
    else if (ex.thrust) { pelvisW = -90 + (q.th || 0) + (q.P || 0); q.hip = 0; q.knee = 0; q.ank = 0; }   // 힙 쓰러스트: 몸통 기울기 th(0 = 바닥과 평행)
    else pelvisW = q.ank - q.knee + q.hip + q.P;
    qx(root, pelvisW);
    for (const r of ['L', 'T', 'C']) for (const [n, f] of SPLIT[r]) qx(B[n], (lag ? lag(n, r) : q[r]) * f);
    if (q.rot) for (const [n, f] of [['spine03', .15], ['spine02', .4], ['spine01', .35], ['neck01', .1]]) B[n].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(VY, q.rot * f * D2R));   // 몸통 비틀기(흉추 회전)
    const hipLocal = ex.quad ? q.hip : q.hip + q.P;
    for (const s of ['L', 'R']) {
      const per = ex.supine || ex.free, qd = ex.quad && q.hipS;   // 버드독: 네발 자세에서 한쪽 다리만 따로(기본 자세에 더하는 값)
      const hl = qd ? hipLocal + q.hipS[s] : per ? q.hipS[s] + (ex.supine ? (q.P || 0) : 0) : hipLocal, kn = qd ? q.kneeS[s] : per ? q.kneeS[s] : q.knee, an = qd ? q.ank : per ? (q.ankS ? q.ankS[s] : 10) : q.ank;
      qx(B['upperleg01.' + s], -hl); qx(B['lowerleg01.' + s], kn); qx(B['foot.' + s], -an);
    }
    // 날개뼈(쇄골) 내밀기/모으기: 몸통 긴 축 기준 회전
    const scap = lag ? lag('spine01', 'scap') : (q.scap || 0);
    const clav = {};
    const elev = q.elev || 0;   // + 어깨 올림(으쓱), − 내림
    for (const s of ['L', 'R']) { const sg = s === 'L' ? 1 : -1; clav[s] = new THREE.Quaternion().setFromAxisAngle(VZ, sg * elev * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(VY, -sg * scap * D2R)); B['clavicle.' + s].quaternion.copy(clav[s]); }
    const thor = pelvisW + q.L + q.T;
    if (ex.load === 'goblet') for (const s of ['L', 'R']) setArm(s, thor + q.sh, q.el);
    else if (ex.load === 'hang') for (const s of ['L', 'R']) setArm(s, thor, 4);
    else if (ex.supine) for (const s of ['L', 'R']) setArm(s, thor - q.armS[s], 3, scap ? clav[s] : null);   // armS = 팔의 월드 각도(180 = 천장, 90 = 머리 위 바닥 쪽)
    else for (const s of ['L', 'R']) setArm(s, ex.quad ? thor : 0, ex.quad ? 0 : 6, scap ? clav[s] : null);
    root.position.copy(rootPos0); H.mesh.updateMatrixWorld(true);
    if (ex.quad) {
      const k = q.lift ? wp('lowerleg01.' + q.lift) : wp('lowerleg01.L').add(wp('lowerleg01.R')).multiplyScalar(.5);   // 버드독: 바닥에 남은 무릎(뻗는 팔과 같은 쪽) 기준
      root.position.y += GROUND + .42 - k.y; root.position.z += -3 - k.z; H.mesh.updateMatrixWorld(true);
      B['lowerarm02.L'].quaternion.identity(); B['lowerarm02.R'].quaternion.identity();
      if (HANDPIN[S.ex]) armIK(HANDPIN[S.ex]);
      palmsDown();
      if (q.lift) {   // 뻗는 팔: 바닥 → 앞으로(몸통과 일직선), 엄지가 위
        const s2 = q.lift; for (const n of ['wrist.' + s2, 'lowerarm02.' + s2]) B[n].quaternion.identity();
        setArm(s2, thor + (q.armF || 0), 2); H.mesh.updateMatrixWorld(true);
        twistTo(s2, new THREE.Vector3(s2 === 'L' ? -1 : 1, 0, 0).lerp(new THREE.Vector3(0, -1, 0), 1 - Math.min(1, (q.armF || 0) / 90)).normalize());
        const w = Math.max(0, 1 - (q.armF || 0) / 60);   // 팔을 막 들 때·내려놓을 때: 손은 바닥에 평평하게(손가락이 바닥을 뚫지 않게)
        if (w > 0) { H.mesh.updateMatrixWorld(true); const fa = wp('wrist.' + s2).sub(wp('lowerarm01.' + s2)).normalize(), cur = HANDN[s2].clone().applyQuaternion(wq('wrist.' + s2));
          const F = fa.clone().lerp(new THREE.Vector3(0, 0, 1), w).normalize(), N0 = cur.clone().lerp(new THREE.Vector3(0, -1, 0), w), N = N0.sub(F.clone().multiplyScalar(N0.dot(F))).normalize(), Z = new THREE.Vector3().crossVectors(F, N);
          const wqN = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, Z)).multiply(HAND[s2].clone().invert()), pw = B['wrist.' + s2].parent.getWorldQuaternion(new THREE.Quaternion());
          B['wrist.' + s2].quaternion.copy(pw.invert().multiply(wqN)); H.mesh.updateMatrixWorld(true); }
      }
      if (ex.headHand && HANDPIN[S.ex]) {   // 한 손은 머리 뒤(흉추 회전): 손바닥이 머리 옆을 감싸고 팔꿈치는 옆으로
        const s2 = ex.headHand, sg = s2 === 'L' ? 1 : -1; for (const n of ['wrist.' + s2, 'lowerarm02.' + s2]) B[n].quaternion.identity(); H.mesh.updateMatrixWorld(true);
        const hq = wq('head'), side = VX.clone().applyQuaternion(hq).multiplyScalar(sg), fw = VZ.clone().applyQuaternion(hq), hd = wp('head');
        const pins = { L: HANDPIN[S.ex].L, R: HANDPIN[S.ex].R }; pins[s2] = hd.clone().add(side.clone().multiplyScalar(.75)).add(fw.clone().multiplyScalar(-.55));
        armIK(pins, s => s === s2 ? side.clone().add(fw.clone().multiplyScalar(.3)) : new THREE.Vector3(0, 0, -1)); H.mesh.updateMatrixWorld(true);
        palmsDown(); twistTo(s2, side.clone().negate());
      }
    } else if (ex.free) {   // 운동별 위치 고정(무릎을 바닥에, 엉덩이를 바닥에 등)
      for (const n of ['wrist.L', 'wrist.R', 'lowerarm02.L', 'lowerarm02.R']) B[n].quaternion.identity();
      H.mesh.updateMatrixWorld(true); const pl = ex.place(q, HX); root.position.add(pl.to.clone().sub(pl.pt)); H.mesh.updateMatrixWorld(true);
    } else if (ex.thrust) {   // 날개뼈 아래쪽(등 위쪽)이 벤치 모서리에 고정
      const fw = VZ.clone().applyQuaternion(wq('spine01')), up = wp('neck01').sub(wp('spine01')).normalize(); fw.sub(up.clone().multiplyScalar(fw.dot(up))).normalize();
      const c = wp('spine01').add(fw.multiplyScalar(-1.05)).add(up.multiplyScalar(-.2));
      root.position.add(new THREE.Vector3(0, GROUND + ex.thrust.h, ex.thrust.z).sub(c)); H.mesh.updateMatrixWorld(true);
    } else if (ex.supine) {
      for (const n of ['wrist.L', 'wrist.R', 'lowerarm02.L', 'lowerarm02.R']) B[n].quaternion.identity();
      const back = Math.min(wp('spine03').y, wp('spine02').y);   // 등이 바닥(또는 벤치 윗면)에 닿게
      root.position.y += GROUND + (ex.bench || 0) + 1.0 - back; H.mesh.updateMatrixWorld(true);
      for (const s of ['L', 'R']) twistTo(s, new THREE.Vector3(s === 'L' ? -1 : 1, 0, 0));   // 손바닥은 서로 마주 보게, 손목 곧게
    } else if (ex.seated) {
      for (const n of ['wrist.L', 'wrist.R', 'lowerarm02.L', 'lowerarm02.R']) B[n].quaternion.identity();
      if (ex.load === 'row') {   // 낮은 벤치 위 골반 고정(엉덩이 아래 = 벤치 윗면), 다리는 앞 발판으로
        root.position.y += ROW_SEAT - (wp('upperleg01.L').y - .95); H.mesh.updateMatrixWorld(true);
      } else {
        const a = wp('foot.L').add(wp('foot.R')).multiplyScalar(.5);
        root.position.y += BIND['foot.L'].y + (ex.footY || 0) - a.y; H.mesh.updateMatrixWorld(true);   // 골반은 의자 위 고정, 발은 바닥(또는 발받침 위)
      }
      if (ex.load === 'row' && !q.noBar) q.row = rowArms(q, ex);
      if (ex.load === 'mrow' && !q.noBar) q.mrow = mrowArms(q, ex);
      if (ex.load === 'bar' && !q.noBar) q.bar = barArms(q, ex);
      if (ex.load === 'press' && !q.noBar) q.press = pressArms(q, ex);
    } else {
      for (const n of ['wrist.L', 'wrist.R', 'lowerarm02.L', 'lowerarm02.R']) B[n].quaternion.identity();
      const a = wp('foot.L').add(wp('foot.R')).multiplyScalar(.5), a0 = BIND['foot.L'].clone().add(BIND['foot.R']).multiplyScalar(.5);
      root.position.add(a0.sub(a)); H.mesh.updateMatrixWorld(true);
    }
  }
  /* 다리 IK: 발은 바닥에 고정, 무릎은 발끝 방향(kneeIn이면 안쪽으로 무너짐) */
  const FOOTT = {};
  function initThrust(ex) {   // 맨 위(몸통 평행)에서 정강이가 수직이 되도록 발 위치를 정함
    const q1 = ex.pose(1, false); applyPose(q1, ex);
    const hp = wp('upperleg01.L'); FOOTT[S.ex] = hp.z + LEG.L.l1 * .98;
  }
  function heelOff(s, deg) {   // 뒤꿈치 들기: 발 앞쪽(볼)은 그대로, 발목만 볼을 축으로 회전 → 발목 이동량
    const v = BIND['toe1-1.' + s].clone().sub(BIND['foot.' + s]).add(new THREE.Vector3(0, 0, .7)), h = deg * D2R, c = Math.cos(h), n = Math.sin(h);
    return { y: v.y - (v.y * c - v.z * n), z: v.z - (v.z * c + v.y * n) };
  }
  function legIK(q, ex) {
    const st = ex.stance; if (!st) return;
    const tgt = {}; let excess = 0;
    const plat = q.plat || 0, hr = q.heelRise ? heelOff('L', q.heel || 0).y : 0;   // 발판 위에 서기 + 뒤꿈치 들 때 몸 전체가 위로
    if (plat || hr) { root.position.y += plat + hr; H.mesh.updateMatrixWorld(true); }
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, b = BIND['foot.' + s];
      tgt[s] = ex.footFn ? ex.footFn(q, HX, s) : ex.footT ? new THREE.Vector3(sg * st.x, b.y, FOOTT[S.ex] ?? b.z) : new THREE.Vector3(sg * st.x, b.y + plat, b.z);
      const hl = q.heelS ? q.heelS[s] : q.heel; if (hl && !ex.footFn) { const o = heelOff(s, hl); tgt[s].y += o.y; tgt[s].z += o.z; }   // 뒤꿈치 들기: 발 앞쪽(볼)을 축으로
      const d = wp('upperleg01.' + s).distanceTo(tgt[s]); excess = Math.max(excess, d - (LEG[s].l1 + LEG[s].l2) * .999);
    }
    if (excess > 0 && !ex.footT && !ex.footFn) { root.position.y -= excess; H.mesh.updateMatrixWorld(true); }
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, L = LEG[s], Hp = wp('upperleg01.' + s), A = tgt[s];
      const v = A.clone().sub(Hp); let d = Math.min(v.length(), (L.l1 + L.l2) * .9995); const u = v.normalize();
      const knRot = (st.rot - (q.kneeIn || 0)) * D2R;
      const pole = ex.kneeUp ? new THREE.Vector3(sg * .35, 1, .3) : ex.footT ? new THREE.Vector3(sg * Math.sin(knRot), 1, 0) : new THREE.Vector3(sg * Math.sin(knRot), 0, Math.cos(knRot));   // 힙 쓰러스트: 무릎은 위·바깥
      const w = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
      const a = (L.l1 * L.l1 - L.l2 * L.l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L.l1 * L.l1 - a * a));
      const K = Hp.clone().add(u.clone().multiplyScalar(a)).add(w.clone().multiplyScalar(h));
      const x = new THREE.Vector3().crossVectors(u, w).normalize();
      const mk = y => { const z = new THREE.Vector3().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
      const qT = mk(K.clone().sub(Hp).normalize()).multiply(L.qbT.clone().invert());
      const qS = mk(A.clone().sub(K).normalize()).multiply(L.qbS.clone().invert());
      const pT = B['upperleg01.' + s].parent.getWorldQuaternion(new THREE.Quaternion());
      B['upperleg01.' + s].quaternion.copy(pT.invert().multiply(qT));
      B['lowerleg01.' + s].quaternion.copy(qT.clone().invert().multiply(qS));
      const qF = new THREE.Quaternion().setFromAxisAngle(VY, sg * st.rot * D2R); { const hl = q.heelS ? q.heelS[s] : q.heel; if (hl) qF.multiply(new THREE.Quaternion().setFromAxisAngle(VX, hl * D2R)); } if (ex.footPitch) qF.premultiply(new THREE.Quaternion().setFromAxisAngle(VX, -ex.footPitch * D2R));   // 레그 프레스: 발판 기울기만큼
      B['foot.' + s].quaternion.copy(qS.clone().invert().multiply(qF));
      { const hl = q.heelS ? q.heelS[s] : q.heel; B['toe1-1.' + s].quaternion.setFromAxisAngle(VX, -Math.max(0, hl || 0) * D2R); }   // 발가락은 바닥에 평평하게(발가락 관절이 꺾임)
    }
    H.mesh.updateMatrixWorld(true);
  }
  function com(load) {
    const P = [[wp('head'), .08], [wp('spine01'), .2], [wp('spine03'), .16], [wp('root'), .14]];
    for (const s of ['L', 'R']) { P.push([wp('upperleg02.' + s), .1], [wp('lowerleg02.' + s), .045], [wp('upperarm02.' + s), .028], [wp('wrist.' + s), .022]); if (load) P.push([wp('wrist.' + s), .06]); }
    let z = 0, m = 0; for (const [p, w] of P) { z += p.z * w; m += w; } return z / m;
  }
  const footMidZ = () => (wp('foot.L').z + wp('foot.R').z) / 2 + .2;
  function solve(q, ex, lag) {
    if (ex.quad) {
      if (!HANDPIN[S.ex]) {   // 중립(평평한 등)에서 손 위치를 정해 바닥에 고정
        const q0 = ex.pose(0, false); let lo = -35, hi = 35;
        for (let i = 0; i < 16; i++) { q0.dq = (lo + hi) / 2; applyPose(q0, ex); const y = (wp('upperarm01.L').y + wp('upperarm01.R').y) / 2 - (GROUND + .15); if (y > ARMQ) lo = q0.dq; else hi = q0.dq; }
        q0.dq = (lo + hi) / 2; applyPose(q0, ex);
        const pin = {}; for (const s of ['L', 'R']) { const sh = wp('upperarm01.' + s); pin[s] = new THREE.Vector3(sh.x, GROUND + .43, sh.z); }
        HANDPIN[S.ex] = pin;
      }
      const P = HANDPIN[S.ex], reach = (ARMK.L.l1 + ARMK.L.l2) * .985;
      const sup = q.lift ? (q.lift === 'L' ? ['R'] : ['L']) : ['L', 'R'];   // 버드독: 바닥을 짚은 손만으로 맞춤
      let lo = -35, hi = 35; for (let i = 0; i < 16; i++) { q.dq = (lo + hi) / 2; applyPose(q, ex, lag); const d = sup.reduce((a, s) => a + wp('upperarm01.' + s).distanceTo(P[s]), 0) / sup.length; if (d > reach) lo = q.dq; else hi = q.dq; }
      q.dq = (lo + hi) / 2; applyPose(q, ex, lag); return q;
    }
    if (ex.bis) {   // 운동별 1변수 맞추기(예: 손이 바에 닿는 몸 기울기)
      let [lo, hi] = ex.bis.range; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; q[ex.bis.key] = m; applyPose(q, ex, lag); if (ex.bis.err(q, HX) > 0) hi = m; else lo = m; }
      q[ex.bis.key] = (lo + hi) / 2; applyPose(q, ex, lag); return q;
    }
    const k = q.hip === 'solve' ? 'hip' : q.ank === 'solve' ? 'ank' : null;
    if (!k) { applyPose(q, ex); return q; }
    let [lo, hi] = k === 'hip' ? q.hipRange : q.ankRange;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; q[k] = mid; applyPose(q, ex); const e = ex.smith ? barPt().z - footMidZ() - ex.smith.off : com(ex.load !== 'none') - footMidZ() - (q.comOff || 0); if (e > 0) hi = mid; else lo = mid; }   // comOff: 박스에 앉을 때처럼 체중 일부가 뒤(박스)로   // 스미스: 바는 레일 따라 수직으로만 → 바(승모근)의 앞뒤 위치가 고정
    q[k] = (lo + hi) / 2; applyPose(q, ex); return q;
  }

  /* 근육 색 */
  const base = [0.79, 0.81, 0.845], shorts = [0.21, 0.23, 0.27];
  function paint(roles, act) {
    const c = H.col, M = H.masks, nv = H.nv, sh = M.shorts;
    for (let i = 0; i < nv; i++) { const s = clamp((sh[i] - .3) / .3, 0, 1); c[i * 3] = base[0] + (shorts[0] - base[0]) * s; c[i * 3 + 1] = base[1] + (shorts[1] - base[1]) * s; c[i * 3 + 2] = base[2] + (shorts[2] - base[2]) * s; }
    for (const k in roles) { const m = M[k]; if (!m) continue; const rc = RC[roles[k]], a = roles[k] === 'R' ? .75 + .25 * act : roles[k] === 'B' ? .85 : .8;
      const T = roles[k] === 'T', glow = T ? PULSE : 0, aa = T ? .82 + .18 * PULSE : a;
      const tc = T ? [rc[0] + (1 - rc[0]) * glow * .55, rc[1] + (.55 - rc[1]) * glow * .55, rc[2] + (.5 - rc[2]) * glow * .55] : rc;   // 반짝반짝: 빨강 ↔ 밝은 빨강
      for (let i = 0; i < nv; i++) { const w = Math.min(1, m[i] * 1.6) * aa; if (w < .01) continue; const j = i * 3; c[j] += (tc[0] - c[j]) * w; c[j + 1] += (tc[1] - c[j + 1]) * w; c[j + 2] += (tc[2] - c[j + 2]) * w; } }
    H.g.attributes.color.needsUpdate = true;
  }

  /* 화면 */
  function resize() { const p = cv.parentElement; if (!p) return; const r = p.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize);
  function setView(v) {
    S.view = v; const ex = E(); const map = S.mode === 'map';
    const t = ex.quad ? new THREE.Vector3(0, -4.8, -1) : new THREE.Vector3(0, map ? -1.6 : (ex.camY ?? -1.6), map ? 0 : (ex.camZ ?? .5)), D = map ? 42 : (ex.camD || 52);
    const off = { side: [-D, 2, 0], front: [0, 2, D], back: [0, 2, -D], q: [-D * .72, D * .2, D * .68], top: [0, D, .01], sideR: [D, 2, 0] }[v];
    ctl.target.copy(t); cam.position.set(t.x + off[0], t.y + off[1], t.z + off[2]); ctl.update();
  }
  function setRotate(on) { ctl.enabled = !!on; cv.style.touchAction = on ? 'none' : 'pan-y'; S.rot = !!on; }
  function mount(host, mode) {
    S.mode = mode; host.prepend(cv); cv.style.cssText = 'width:100%;height:100%;display:block'; setRotate(false); resize();
    paintKey = ''; setView(mode === 'map' ? (S.mapView || 'front') : S.view);
  }
  /* 부위 고르기 */
  const ray = new THREE.Raycaster(); let down = null;
  cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', e => {
    if (S.mode !== 'map' || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = cv.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
    const hit = ray.intersectObject(H.mesh)[0]; if (!hit) return;
    const vs = [hit.face.a, hit.face.b, hit.face.c]; let best = null, bv = .12;
    for (const k in H.masks) { if (k === 'shorts') continue; const v = Math.max(...vs.map(i => H.masks[k][i])); if (v > bv) { bv = v; best = k; } }
    S.sel = best; api.onPick && api.onPick(best);
  });

  function timeline(ex, c) {
    const tot = ex.phases.reduce((a, p) => a + p[2], 0); let e = c % tot, i = 0, a = 0; for (; i < ex.phases.length; i++) { if (e < a + ex.phases[i][2]) break; a += ex.phases[i][2]; }
    i = Math.min(i, ex.phases.length - 1);
    const x = (e - a) / ex.phases[i][2], k = ex.phases[i][3]; let t;
    if (ex.quad) { const kk = ex.sided ? k.replace(/2$/, '') : k; t = kk === 'cat' ? ez(x) : kk === 'hold' ? 1 : kk === 'back' ? 1 - ez(x) : kk === 'cow' ? 1 - 2 * ez(x) : kk === 'hold2' ? -1 : kk === 'rest0' ? 0 : -1 + ez(x); }
    else t = (k === 'down' || k === 'down2') ? ez(x) : (k === 'hold' || k === 'hold2') ? 1 : (k === 'up' || k === 'up2') ? 1 - ez(x) : 0;
    return { t, i, x, k, side: /2$/.test(k) ? 'R' : 'L' };
  }

  let last = performance.now(), paintKey = '', frameN = 0;
  const api = {
    S, mount, setView, resize, setRotate, onPick: null, onFrame: null,
    setEx(id) { S.ex = id; S.clock = 0; S.mk = false; paintKey = ''; setView(S.view); },
    setJoints(v) { S.showJ = v; }, setMistake(v) { S.mk = v; }, setGrip(k) { S.grip[S.ex] = k; }, setSlow(v) { S.slow = v; }, setPaused(v) { S.paused = v; },
    setSel(k) { S.sel = k; paintKey = ''; }
  };
  function frame(now) {
    requestAnimationFrame(frame);
    if (!cv.isConnected) { last = now; return; }
    const dt = Math.min((now - last) / 1000, .05); last = now; if (!S.paused) S.clock += dt / (S.slow ? 2 : 1);
    const ex = E();
    if (S.mode === 'map') {
      const q = { knee: 0, ank: 0, L: 0, T: 0, C: 0, P: 0, hip: 0 }; applyPose(q, ex);
      if (H.mesh.morphTargetInfluences) H.mesh.morphTargetInfluences[0] = window.__grip || 0;
      const pk = 'map' + S.sel; if (pk !== paintKey) { paintKey = pk; paint(S.sel ? { [S.sel]: 'R' } : {}, 1); }
      dbL.visible = dbR.visible = dbG.visible = false; BENCH.visible = BOX.visible = BAND.visible = LP.visible = PUB.visible = false; if (CAB) CAB.g.visible = false; BL.forEach(m => m.visible = false); if (MACH) MACH.g.visible = false; if (MACHP) MACHP.g.visible = false; if (MACHR) MACHR.g.visible = false; if (MACHW) MACHW.g.visible = false; if (MACHM) MACHM.g.visible = false; if (MACHS) MACHS.g.visible = false; JM.forEach(g => g.visible = false); sLine.visible = false;
      ctl.update(); renderer.render(scene, cam); return;
    }
    const tl = timeline(ex, S.clock);
    let lag = null;
    if (ex.quad) {   // 꼬리뼈 → 머리 순서로 한 마디씩 시간차(분절)
      const ord = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head'];
      lag = (n, r) => ex.pose(timeline(ex, Math.max(0, S.clock - (ord.indexOf(n) + 1) * .09)).t, S.mk)[r] || 0;
    }
    if (ex.load === 'bar' && !BARP[S.ex]) initBar(ex);
    if (ex.load === 'press' && !PRESSP[S.ex]) initPress(ex);
    if (ex.load === 'rope' && !ROPEP[S.ex]) initRope(ex);
    if (ex.load === 'row' && !ROWP[S.ex]) initRow(ex);
    if (ex.load === 'mrow' && !MROWP[S.ex]) initMrow(ex);
    if (ex.thrust && FOOTT[S.ex] === undefined) initThrust(ex);
    if (ex.smith && (!MACHS || MACHS.ex !== S.ex)) {   // 바 레일 위치(발 중앙보다 off만큼 뒤)와 안전 스토퍼 높이(가장 낮은 바 높이 바로 아래)
      const qb = solve(Object.assign(ex.pose(1, false), { t: 1 }), ex); legIK(qb, ex); const yb = barPt().y;
      buildSmith(ex.free ? barPt().z : footMidZ() + ex.smith.off); MACHS.ex = S.ex; MACHS.safe.forEach(b => b.position.y = yb - .9);
    }
    const q0 = ex.pose(tl.t, S.mk, tl.side); q0.t = tl.t; q0.ph = ex.phases[tl.i][3];
    const q = solve(q0, ex, lag);
    if (!ex.quad) legIK(q, ex);
    let handPath = null;
    if (ex.load === 'hang' && !S.mk) handPath = legHands();
    if (ex.load === 'rope') q.rope = ropeArms(q, ex);
    if (ex.hands) {   // 운동별 손 목표(주먹 중심·손가락 방향·손바닥 방향) → 손목 곧게 팔 IK
      for (const n of ['wrist.L', 'wrist.R', 'lowerarm02.L', 'lowerarm02.R']) B[n].quaternion.identity(); H.mesh.updateMatrixWorld(true);
      const tg = ex.hands(q, HX), tgt = {};
      for (const s of ['L', 'R']) tgt[s] = { H: tg[s].H, x: tg[s].x.normalize(), palm: tg[s].palm.normalize() };
      solveGrip(tgt, s => tg.pole(s).normalize()); q.handT = tgt;
      if (tg.post) { H.mesh.updateMatrixWorld(true); for (const s of ['L', 'R']) { const P = tg.post[s]; if (!P) continue; const F = P.F.clone().normalize(), N = P.N.clone().sub(F.clone().multiplyScalar(P.N.dot(F))).normalize(), Z = new THREE.Vector3().crossVectors(F, N);   // 손목 꺾기(받쳐 드는 그립): 손가락 방향 F, 손바닥 방향 N
        const wqN = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, Z)).multiply(HAND[s].clone().invert()), pw = B['wrist.' + s].parent.getWorldQuaternion(new THREE.Quaternion());
        B['wrist.' + s].quaternion.copy(pw.invert().multiply(wqN)); } H.mesh.updateMatrixWorld(true); }
      if (tg.db) q.dbAt = tg.db;
      if (tg.cable) q.cab = tg.cable;
    }
    if (ex.roll) {   // 옆으로 눕기(사이드 플랭크): 서 있는 자세로 만든 뒤 몸 전체를 앞뒤 축으로 굴려 팔꿈치와 발을 바닥에
      const rr = ex.roll(q, HX), Q = THREE.Quaternion;
      for (const s of ['L', 'R']) { const ab = rr.ab && rr.ab[s]; if (!ab) continue; const b = B['upperleg01.' + s], qw = b.getWorldQuaternion(new Q()), pw = b.parent.getWorldQuaternion(new Q()); qw.premultiply(new Q().setFromAxisAngle(VZ, ab * D2R)); b.quaternion.copy(pw.invert().multiply(qw)); }
      H.mesh.updateMatrixWorld(true);
      const E = wp(rr.a), F = wp(rr.b), d = E.clone().sub(F), th = -Math.atan2(d.y, d.x), R = new Q().setFromAxisAngle(VZ, th);
      const M = E.clone().add(F).multiplyScalar(.5), Mr = M.clone().applyQuaternion(R);
      H.mesh.quaternion.copy(R); H.mesh.position.set(-Mr.x, GROUND + (rr.h ?? .45) - Mr.y, 0); H.mesh.userData.rolled = true; H.mesh.updateMatrixWorld(true);
      if (q.handT) for (const s of ['L', 'R']) q.handT[s].H.applyQuaternion(R).add(H.mesh.position);
    }
    if (ex.smith) { let bp; if (ex.hands) bp = q.handT.L.H; else { for (const n of ['wrist.L', 'wrist.R', 'lowerarm02.L', 'lowerarm02.R']) B[n].quaternion.identity(); bp = smithArms(q, ex); } MACHS.bar.position.set(0, bp.y, MACHS.zb); q.barZ = bp.z - MACHS.zb; }
    q.drift = ex.load === 'hang' && S.mk ? 1 : 0;
    const wl = wp('wrist.L'), wr = wp('wrist.R');
    dbL.visible = ex.load === 'hang' || ex.prop === 'dbs' || ex.prop === 'dbs1' || ex.prop === 'dbv'; dbR.visible = ex.load === 'hang' || ex.prop === 'dbs'; dbG.visible = ex.load === 'goblet';
    if ((ex.prop === 'dbs' || ex.prop === 'dbs1') && q.handT) for (const [d, s] of ex.prop === 'dbs1' ? [[dbL, 'L']] : [[dbL, 'L'], [dbR, 'R']]) { const t = q.handT[s], ax = new THREE.Vector3().crossVectors(t.x, t.palm).normalize(); d.position.copy(t.H); d.quaternion.setFromUnitVectors(VX, ax); }   // 덤벨 손잡이 = 손바닥을 가로지르는 방향
    if (ex.prop === 'dbv' && q.dbAt) { dbL.position.copy(q.dbAt); dbL.quaternion.setFromUnitVectors(VX, VY); }   // 덤벨 하나를 세로로(위 원판을 두 손바닥으로 받침)
    BAND.visible = ex.prop === 'band' && !!q.handT;
    if (BAND.visible) { const a = q.handT.L.H, b = q.handT.R.H, d = b.clone().sub(a); BAND.position.copy(a.clone().add(b).multiplyScalar(.5)); BAND.scale.set(1, d.length() + .6, 1); BAND.quaternion.setFromUnitVectors(VY, d.normalize()); }
    if (ex.ubench) {   // 등받이 있는 의자(벤치 80~85°): 엉덩이 아래 의자 + 등 뒤 등받이
      BENCH.visible = true;
      if (BENCH.userData.ex !== S.ex) { const hp = avg2('upperleg01'), fw = VZ.clone().applyQuaternion(wq('spine02')), up = wp('neck01').sub(wp('spine02')).normalize(), sp = wp('spine02');
        const top = hp.y - .95; BENCH.children[0].scale.set(3, .5, 3.2); BENCH.children[0].quaternion.identity(); BENCH.children[0].position.set(0, top - .25, hp.z + .4);
        const bh = ex.backH || 7.5; BENCH.children[1].scale.set(2.6, bh, .5); BENCH.children[1].quaternion.setFromUnitVectors(VY, up); BENCH.children[1].position.copy(sp.clone().add(fw.clone().multiplyScalar(-1.45)).add(up.clone().multiplyScalar(1.3 - (7.5 - bh) / 2)));   // backH: 등받이 높이(머리 뒤로 덤벨이 내려가는 운동은 낮게)
        BENCH.children[2].scale.set(.5, top - .5 - GROUND, .5); BENCH.children[2].quaternion.identity(); BENCH.children[2].position.set(0, (top - .5 + GROUND) / 2, hp.z + .4); BENCH.userData.ex = S.ex; }
    } else if (ex.thrust) {   // 가로로 놓인 벤치(등 뒤) + 골반 위 덤벨
      BENCH.visible = true;
      if (BENCH.userData.ex !== S.ex) { const top = GROUND + ex.thrust.h, z = ex.thrust.z - 1.4;
        BENCH.children[0].scale.set(9, .55, 2.8); BENCH.children[0].position.set(0, top - .275, z);
        BENCH.children[1].scale.set(.5, top - .55 - GROUND, 1.6); BENCH.children[1].position.set(-3.6, (top - .55 + GROUND) / 2, z);
        BENCH.children[2].scale.set(.5, top - .55 - GROUND, 1.6); BENCH.children[2].position.set(3.6, (top - .55 + GROUND) / 2, z); BENCH.userData.ex = S.ex; }
      const hc = wp('upperleg01.L').add(wp('upperleg01.R')).multiplyScalar(.5), fw = VZ.clone().applyQuaternion(wq('root'));
      dbG.visible = true; dbG.position.copy(hc.add(fw.multiplyScalar(1.15))); dbG.rotation.set(0, 0, 0);
    } else BENCH.visible = !!ex.bench;
    if (!ex.ubench) BENCH.children.forEach(c => c.quaternion.identity());
    if (ex.bench && !ex.thrust && BENCH.userData.ex !== S.ex) {   // 벤치: 머리~엉덩이 아래, 윗면 높이 = ex.bench
      const hz = wp('upperleg01.L').z, nz = wp('head').z, top = GROUND + ex.bench;
      BENCH.children[0].scale.set(2.6, .55, hz - nz + 3.0); BENCH.children[0].position.set(0, top - .275, (hz + nz) / 2 - .5);
      BENCH.children[1].scale.set(1.6, top - .55 - GROUND, .5); BENCH.children[1].position.set(0, (top - .55 + GROUND) / 2, nz + 1.5);
      BENCH.children[2].scale.set(1.6, top - .55 - GROUND, .5); BENCH.children[2].position.set(0, (top - .55 + GROUND) / 2, hz - .8);
      BENCH.userData.ex = S.ex;
    }
    if (ex.smithB) {   // 스미스 벤치: 바는 레일 따라 수직, 레일 위치 = 손(바)의 앞뒤 위치
      if (!MACHS || MACHS.ex !== S.ex) { buildSmith(q.handT.L.H.z); MACHS.ex = S.ex; MACHS.safe.forEach(b => b.position.y = GROUND + (ex.bench || 0) + 2.0); }
      MACHS.bar.position.set(0, q.handT.L.H.y, MACHS.zb);
    }
    BOX.visible = !!ex.box;
    const bl = ex.bandLines ? ex.bandLines(q, HX) : [];   // 밴드 선(발·앵커 → 손)
    BL.forEach((m, i) => { m.visible = i < bl.length; if (m.visible) line(m, bl[i][0], bl[i][1], .07); });
    PUB.visible = !!ex.pubar; if (ex.pubar) { const P = barPins(); PUB.position.set(0, P.L.y, P.L.z); PUB.children.slice(1).forEach(p => { p.scale.y = (P.L.y - GROUND) / 30; p.position.y = -(P.L.y - GROUND) / 2; }); }
    LP.visible = !!ex.sled; if (ex.sled) updSled(ex.sled(q, HX));
    if (ex.box && ex.box.follow) { const b = ex.box.at(HX); BOX.scale.set(b.w, b.h ?? (b.top - GROUND), b.d); BOX.position.set(b.x, b.cy ?? (b.top - (b.h ?? (b.top - GROUND)) / 2), b.z); BOX.rotation.set((b.rx || 0) * D2R, 0, 0); BOX.userData.ex = S.ex; }   // 몸 따라 움직이는 패드
    else if (ex.box && BOX.userData.ex !== S.ex) { BOX.rotation.set(0, 0, 0);   // 박스 높이 = 가장 낮은 자세에서 엉덩이 바로 아래
      const qb = solve(Object.assign(ex.pose(1, false), { t: 1 }), ex); legIK(qb, ex);
      if (ex.box.at) { const b = ex.box.at(HX); BOX.scale.set(b.w, b.top - GROUND, b.d); BOX.position.set(b.x, (b.top + GROUND) / 2, b.z); BOX.userData.ex = S.ex; }   // 손 짚는 벤치 등
      else { const hp = wp('upperleg01.L').add(wp('upperleg01.R')).multiplyScalar(.5), top = hp.y - .9;
      BOX.scale.set(4, top - GROUND, 3.2); BOX.position.set(0, (top + GROUND) / 2, hp.z + (ex.box.dz ?? -1.2)); BOX.userData.ex = S.ex; }
      const q2 = ex.pose(tl.t, S.mk, tl.side); q2.t = tl.t; q2.ph = ex.phases[tl.i][3]; const q3 = solve(q2, ex, lag); legIK(q3, ex); if (ex.hands) { const tg = ex.hands(q3, HX), tgt = {}; for (const s of ['L', 'R']) tgt[s] = { H: tg[s].H, x: tg[s].x.normalize(), palm: tg[s].palm.normalize() }; solveGrip(tgt, s => tg.pole(s).normalize()); }
    }
    if (ex.load === 'hang') {
      if (handPath) { dbL.position.copy(handPath.L.Q); dbR.position.copy(handPath.R.Q); }
      else { dbL.position.copy(wl).add(new THREE.Vector3(0, -.75, .15)); dbR.position.copy(wr).add(new THREE.Vector3(0, -.75, .15)); }
      dbL.rotation.set(0, 0, 0); dbR.rotation.set(0, 0, 0);
    }
    if (ex.load === 'goblet') dbG.position.copy(wl).add(wr).multiplyScalar(.5).add(new THREE.Vector3(0, .5, .2));
    if (H.mesh.morphTargetInfluences) H.mesh.morphTargetInfluences[0] = ex.grip ?? (ex.load === 'none' ? 0 : ex.load === 'goblet' ? .85 : 1);
    const ph = ex.phases[tl.i], roles = ex.roles(ph[3]);
    if (MACH) MACH.g.visible = ex.load === 'bar';
    for (const M of [MACH, MACHP, MACHR, MACHW, MACHM, MACHS]) { if (!M) continue; const fr = M === MACHS ? (EX[S.ex] && EX[S.ex].smithB ? S.view === 'front' || S.view === 'back' : S.view !== 'q') : S.view === 'front'; if (M.fr !== fr) { M.fr = fr; M.g.traverse(o => { if (o.material && !o.userData.keep) { o.material.transparent = fr; o.material.opacity = fr ? .22 : 1; o.material.depthWrite = !fr; } }); } }
    if (ex.load === 'bar' && q.bar) updMachine(q.bar);
    if (MACHP) MACHP.g.visible = ex.load === 'press';
    if (ex.load === 'press' && q.press) updPress(q.press);
    if (MACHR) MACHR.g.visible = ex.load === 'rope';
    if (CAB) CAB.g.visible = false; if (ex.cpush && q.cab) updCab(q.cab);
    if (ex.load === 'rope' && q.rope) updRope(q.rope);
    if (MACHW) MACHW.g.visible = ex.load === 'row';
    if (MACHM) MACHM.g.visible = ex.load === 'mrow';
    if (MACHS) MACHS.g.visible = !!(ex.smith || ex.smithB);
    if (ex.load === 'mrow' && q.mrow) updMrow(q.mrow);
    if (ex.load === 'row' && q.row) updRow(q.row);
    const act = ph[3] === (ex.conc || 'up') || ph[3] === 'down2' || ph[3] === 'cat' || ph[3] === 'cow' ? Math.sin(Math.PI * Math.min(tl.x, 1)) : .4;
    PULSE = .5 + .5 * Math.sin(now * .0065); paint(roles, act);
    JM.forEach(g => g.visible = S.showJ); sLine.visible = S.showJ;
    if (S.showJ) { const p = sLine.geometry.attributes.position; spineIds.forEach((n, i) => { const v = wp(n); p.setXYZ(i, v.x, v.y, v.z); }); p.needsUpdate = true; }
    ctl.update(); renderer.render(scene, cam);
    if (api.onFrame && (frameN++ % 4 === 0)) api.onFrame({ ex, ph, i: tl.i, roles, q });
    window.__ready = true;
  }
  requestAnimationFrame(frame);
  window.__eng = api; api._v = i => { const v = new THREE.Vector3(); H.mesh.getVertexPosition(i, v); H.mesh.localToWorld(v); return v.toArray(); }; api._wp = n => wp(n).toArray(); api._fa = s => wp('wrist.' + s).sub(wp('lowerarm01.' + s)).normalize().toArray(); api._palm = s => HANDN[s].clone().applyQuaternion(wq('wrist.' + s)).toArray(); api._wristBend = () => ['L', 'R'].map(s => {   // 손목 꺾임(굽힘·젖힘·옆 꺾임) 각도, 비틀림 제외
    const pq = B['wrist.' + s].parent.getWorldQuaternion(new THREE.Quaternion()), wqq = B['wrist.' + s].getWorldQuaternion(new THREE.Quaternion());
    const rel = pq.clone().invert().multiply(wqq), ax = BIND['wrist.' + s].clone().sub(BIND['lowerarm01.' + s]).normalize();
    const p = new THREE.Vector3(rel.x, rel.y, rel.z), proj = ax.clone().multiplyScalar(p.dot(ax));
    const tw = new THREE.Quaternion(proj.x, proj.y, proj.z, rel.w).normalize(), sw = rel.clone().multiply(tw.clone().invert());
    return +(2 * Math.acos(Math.min(1, Math.abs(sw.w))) * 180 / Math.PI).toFixed(1); }); api._scr = n => { const v = wp(n).project(cam), r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }; api._dbg = () => ({ pin: HANDPIN.catcow && HANDPIN.catcow.L.toArray(), sh: wp('upperarm01.L').toArray(), wr: wp('wrist.L').toArray(), el: wp('lowerarm01.L').toArray(), reach: ARMK.L.l1 + ARMK.L.l2 }); api._wrist = () => ['L', 'R'].map(s => wp('wrist.' + s).toArray().map(v => +v.toFixed(3))); api._knee = () => ['L', 'R'].map(s => wp('lowerleg01.' + s).toArray().map(v => +v.toFixed(3)));
  return api;
}
