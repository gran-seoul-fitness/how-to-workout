import { createEngine } from './engine.js';
import { EX, MUS, MUS_EN, ROLE, WEEKS, PLAN, POOL, ROUTINES, CONDS, SWAPS, FOCUS } from './exercises.js';
import * as P from './progression.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'santa-app-v1';
let S; try { S = JSON.parse(localStorage.getItem(KEY)) || P.newState(); } catch (e) { S = P.newState(); }
S.cond = S.cond || {}; S.rt = S.rt || {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
if (!S.gripV2) { if (S.grip) delete S.grip.chest; S.gripV2 = 1; save(); }   // 체스트 프레스 기본 = 가로 손잡이
const today = () => window.__today || P.ymd(Date.now());

let eng = null, bootP = null, cur = 'squat', screen = 'today';
const boot = () => bootP || (bootP = createEngine().then(e => { eng = e; eng.onFrame = onFrame; eng.onPick = k => { sel = k; renderSel(); }; return e; }));

/* ---------- 공통 ---------- */
const week = () => P.weekOf(S, today());
const W = () => WEEKS[week() - 1];
const cond = () => S.cond[today()];
const plus = () => !!(S.plus || {})[today()];   // 쌩쌩해요: 기본 3세트, 강도 높이기 → 4세트
const setsOf = id => EX[id].track !== 'weight' ? (EX[id].sets || 1) : cond() === 'fresh' ? 3 + (plus() ? 1 : 0) : Math.max(1, W().sets - (cond() === 'normal' ? 1 : 0));
const recOpt = () => ({ noUp: cond() === 'normal' });
const todayHist = id => S.ex[id] && S.ex[id].hist.find(h => h.d === today());
const doneCount = id => { const h = todayHist(id); return h ? h.checks.filter(Boolean).length : 0; };
const isDone = id => doneCount(id) >= setsOf(id);
const OLD_RT = { squat: 'fullA', hinge: 'fullB' };   // 예전 기록 호환
function focusToday() { return (S.fPick && S.fPick[today()]) || S.focusPref || 'full'; }
function nextOf(f) {   // 같은 초점에서 지난번에 A를 했으면 B, 아니면 A
  const past = Object.keys(S.rt).filter(d => d < today()).sort().map(d => OLD_RT[S.rt[d]] || S.rt[d]).filter(k => ROUTINES[k] && ROUTINES[k].f === f);
  const l = past[past.length - 1]; return l === f + 'A' ? f + 'B' : f + 'A';
}
function routineToday() { const c = cond(); if (c === 'tired') return 'easy'; const f = focusToday(), pk = S.rtPick && S.rtPick[today()]; return pk && ROUTINES[pk] && ROUTINES[pk].f === f ? pk : nextOf(f); }
const thisWeek = () => S.days.filter(d => { const g = P.daysBetween(d, today()); return g >= 0 && g < 7; }).length;

function header() {
  $('#weekPill').textContent = `${week()}주차 · ${W().title}`;
  $('#memo').textContent = W().memo;
}

/* ---------- 오늘 ---------- */
function renderToday() {
  header();
  const c = cond();
  $('#conds').innerHTML = Object.entries(CONDS).map(([k, v]) => `<button class="cond ${k === c ? 'on' : ''}" data-c="${k}"><span class="em">${v.em}</span><b>${v.t}</b><span class="lv">${'★'.repeat(v.lv)}<i>${'★'.repeat(3 - v.lv)}</i></span><small>${v.lvT}</small></button>`).join('');
  $$('#conds .cond').forEach(b => b.onclick = () => { S.cond[today()] = b.dataset.c; save(); renderToday(); });
  if (!c) { $('#rtBar').innerHTML = ''; $('#list').innerHTML = '<div class="pick">컨디션을 고르면 오늘 할 운동을 골라 주겠네.</div>'; $('#todayLead').textContent = '그날 몸 상태에 맞춰 운동해요'; $('#finishBtn').style.display = 'none'; return; }
  $('#finishBtn').style.display = '';
  const rk = routineToday(), R = ROUTINES[rk], C = CONDS[c], f = focusToday();
  $('#todayLead').textContent = rk === 'easy' ? '가볍게 걷고 풀어 주는 날 · 약 35분' : (c === 'normal' ? FOCUS[f].name + ' · 한 세트씩 덜어서 · 약 35분' : FOCUS[f].lead);
  const alt = rk === f + 'A' ? f + 'B' : f + 'A';
  $('#rtBar').innerHTML = (rk !== 'easy' ? `<div class="focus">${Object.entries(FOCUS).map(([k, v]) => `<button data-f="${k}" class="${k === f ? 'on' : ''}">${v.name}</button>`).join('')}</div>` : '') +
    `<div class="rt"><div class="t"><span style="color:var(--gold)">${'★'.repeat(C.lv)}</span>${R.name}<span class="wk">이번 주 ${thisWeek()}/3회</span></div><p>${R.focus} · ${C.d}</p>` +
    (rk !== 'easy' ? `<div class="sw2"><button id="altBtn">↻ 다른 구성으로 바꾸기</button><button id="mapBtn">부위별로 고르기 →</button></div>` : '') + '</div>';
  $$('#rtBar .focus button').forEach(b => b.onclick = () => { S.fPick = S.fPick || {}; S.fPick[today()] = b.dataset.f; S.focusPref = b.dataset.f; save(); renderToday(); });
  if ($('#altBtn')) $('#altBtn').onclick = () => { S.rtPick = S.rtPick || {}; S.rtPick[today()] = alt; save(); renderToday(); };
  if ($('#mapBtn')) $('#mapBtn').onclick = () => show('map');
  $('#list').innerHTML = R.items.map((row, i) => exRow(row, i)).join('') + (R.extra && c === 'fresh' ? `<div class="xtra"><b>＋ 여유 있으면 (선택)</b><span>안 해도 오늘 운동은 완료돼요</span></div>` + R.extra.map((k, i) => exRow([k], R.items.length + i)).join('') : '');
  bindEx($('#list'));
}
function exRow([k, meta, mus], i) {
  const e = EX[k];
  if (e) {
    const prim = Object.entries(e.roles(e.conc || (e.quad ? 'cat' : 'up'))).filter(([, r]) => r === 'R' || r === 'T').map(([m]) => m);
    const h = todayHist(k), dn = doneCount(k), ss = setsOf(k);
    const rx = e.track === 'weight' ? `${ss} × ${(h && h.reps) || (S.ex[k] && S.ex[k].reps) || 10}${(S.ex[k] && S.ex[k].w != null) ? ' · ' + S.ex[k].w + 'kg' : ''}` : `${ss}세트 × ${e.reps}`;
    return `<button class="ex" data-ex="${k}"><span class="num ${dn >= ss ? 'done' : ''}">${dn >= ss ? '✓' : i + 1}</span><span><div class="nm">${e.name}</div><div class="meta">${rx} · ${prim.map(m => `<span><i class="dot"></i>${MUS[m]}</span>`).join(' ')}${dn && dn < ss ? ` · <b style="color:var(--green)">${dn}/${ss}세트</b>` : ''}</div></span><span class="go">${e.guide ? '타이머' : '3D 동작'}</span></button>`;
  }
  return `<div class="ex soon"><span class="num">${i + 1}</span><span><div class="nm">${k}</div><div class="meta">${meta ? meta + ' · ' : ''}${(mus || []).map(m => `<span><i class="dot" style="background:var(--mute)"></i>${MUS[m]}</span>`).join(' ')}</div></span><span class="go soon">곧 추가</span></div>`;
}
function bindEx(root) { root.querySelectorAll('.ex[data-ex]').forEach(b => b.onclick = () => openEx(b.dataset.ex)); }
$('#finishBtn').onclick = () => openSheet();

/* ---------- 화면 전환 ---------- */
function show(s, noWarp) {
  if (s !== 'detail') stopGuide();
  if (s === 'lib' && !noWarp && screen !== 'lib' && screen !== 'read' && !matchMedia('(prefers-reduced-motion: reduce)').matches) { warp(() => show('lib', true)); return; }
  $('.phone').classList.toggle('night', s === 'lib' || s === 'read');
  $('.phone').classList.toggle('arrive', s === 'lib' && !!noWarp);
  screen = s;
  $$('.scr').forEach(x => x.classList.toggle('on', x.id === 's-' + s));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.s === (s === 'read' ? 'lib' : s)));
  if (s === 'lib') renderShelf();
  if (s === 'today') renderToday();
  if (s === 'map') boot().then(e => { $('#mapView .loading')?.remove(); e.mount($('#mapView'), 'map'); setRot($('#mapView'), false); e.setView($('#mapView .chip.on').dataset.mv); });
  if (s === 'detail' && !EX[cur].guide) boot().then(e => { $('#exView .loading')?.remove(); e.mount($('#exView'), 'ex'); setRot($('#exView'), false); if (e.S.ex !== cur || e.S.mode !== 'ex' || !e.__seen) { e.setEx(cur); e.setView(EX[cur].view || 'side'); e.__seen = true; } if ((S.grip || {})[cur]) e.setGrip(S.grip[cur]); e.setMistake(false); $('#mBtn').classList.remove('on'); $('#mcue').classList.remove('on'); syncChips(); });
  if (s === 'log') renderLog();
  window.scrollTo(0, 0);
}
$$('#tabs button').forEach(b => b.onclick = () => show(b.dataset.s));
$('#backBtn').onclick = () => show('today');
$('#open').onclick = () => { $('#cover').classList.add('hide'); boot(); };
/* ---------- 교환 코드: 12월 챌린지에서 받은 코드로 처음 한 번만 열기(처음 연 휴대폰에 묶임) ---------- */
const SANTA_API = 'https://script.google.com/macros/s/AKfycbwJ0iPLXn4fdekuz0tzj2RKMudeb2A9xVcnHEP6Vkmj2MCZS8dLU33nyo7Qefb17Rc/exec';   // Apps Script 웹 앱 주소(배포 후 넣기). 비어 있으면 코드 없이 열림(미리보기용)
const KEY_LS = 'santaKey';
const devId = () => { try { let d = localStorage.getItem('santaDev'); if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)); localStorage.setItem('santaDev', d); } return d; } catch (e) { return 'nodev'; } };
const unlocked = () => { try { return !SANTA_API || !!localStorage.getItem(KEY_LS); } catch (e) { return false; } };
const normCode = v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SANTA/, '').replace(/^(.{4})(.{0,4}).*$/, (m, a, b) => 'SANTA-' + a + (b ? '-' + b : ''));
function initGate() {
  if (unlocked()) return;
  $('#open').hidden = true; $('#gate').hidden = false;
  const inp = $('#gCode'), msg = $('#gMsg');
  const h = (location.hash.match(/code=([A-Za-z0-9-]+)/) || [])[1];   // 12월 사이트의 '비법서 열기' 버튼이 코드를 붙여 보내면 자동 입력
  if (h) { inp.value = normCode(h); history.replaceState(null, '', location.pathname + location.search); }
  $('#gPaste').onclick = async () => { try { inp.value = normCode(await navigator.clipboard.readText()); inp.focus(); } catch (e) { msg.textContent = '입력칸을 길게 눌러 붙여 넣어 주게.'; } };
  $('#gate').onsubmit = async ev => {
    ev.preventDefault(); const code = normCode(inp.value);
    if (!/^SANTA-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) { msg.textContent = '코드 모양이 다르다네. SANTA-XXXX-XXXX 형식이라네.'; return; }
    msg.className = 'gmsg'; msg.textContent = '산타가 확인하는 중…'; $('#gGo2').disabled = true;
    try {
      const call = async () => { const res = await fetch(SANTA_API, { method: 'POST', body: JSON.stringify({ action: 'activate', code, device: devId() }) }); const t = await res.text(); try { return JSON.parse(t); } catch (e) { throw new Error('응답이 JSON이 아님: ' + res.status + ' ' + t.slice(0, 120)); } };
      let r; for (let k = 0; ; k++) { try { r = await call(); break; } catch (e) { console.warn('[santa] activate 실패', k + 1, e); if (k >= 2) throw e; await new Promise(z => setTimeout(z, 900 * (k + 1))); } }
      if (r.ok) { localStorage.setItem(KEY_LS, code); msg.className = 'gmsg ok'; msg.textContent = '봉인이 풀렸다네!'; setTimeout(() => { $('#cover').classList.add('hide'); boot(); }, 600); }
      else msg.textContent = r.err === 'server' ? '산타의 장부를 못 열었다네. 데스크에 말해 주게.' : r.err === 'used' ? '이미 다른 휴대폰에서 연 코드라네. 휴대폰을 바꿨다면 데스크에 말해 주게.' : '없는 코드라네. 다시 확인해 주게.';
    } catch (e) { msg.textContent = '연결이 불안정하다네. 잠시 뒤 다시 눌러 주게.'; }
    $('#gGo2').disabled = false;
  };
}
initGate();

/* ---------- 운동 상세 ---------- */
/* 그립 그림: 위에서 본 어깨·손 너비 + 미는 방향 화살표 + 손목 일직선 */
function gripSVG(g) {
  const cx = 110, sh = 34, gw = sh * g.wMul, hy = 34, by = 92;
  const hand = x => g.handle === 'h'
    ? `<rect x="${x - 13}" y="${hy - 5}" width="26" height="10" rx="5" fill="#2b2f36"/><circle cx="${x}" cy="${hy}" r="8" fill="#f2c9a8" stroke="#c99577"/>`
    : `<rect x="${x - 5}" y="${hy - 13}" width="10" height="26" rx="5" fill="#2b2f36"/><circle cx="${x}" cy="${hy}" r="8" fill="#f2c9a8" stroke="#c99577"/>`;
  const arr = g.push === 'pull' ? `<path d="M204 28 V84" stroke="#E8322A" stroke-width="3" marker-end="url(#ah)"/><text x="198" y="104" font-size="10" text-anchor="end" fill="#E8322A" font-weight="700">팔꿈치를 몸 쪽으로</text>` : g.push === 'fwd' ? `<path d="M${cx} 74 V30" stroke="#E8322A" stroke-width="3" marker-end="url(#ah)"/><text x="${cx + 7}" y="40" font-size="10" fill="#E8322A" font-weight="700">정면으로 밀기</text>` : '';
  return `<svg viewBox="0 0 220 128" class="gsvg" aria-label="그립 너비와 미는 방향">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#E8322A"/></marker></defs>
  <ellipse cx="${cx}" cy="${by}" rx="${sh + 8}" ry="16" fill="#e9ecf2"/><circle cx="${cx}" cy="${by + 2}" r="11" fill="#d6dae3"/>
  <line x1="${cx - sh}" y1="${by}" x2="${cx - gw}" y2="${hy}" stroke="#9aa3b2" stroke-width="7" stroke-linecap="round"/><line x1="${cx + sh}" y1="${by}" x2="${cx + gw}" y2="${hy}" stroke="#9aa3b2" stroke-width="7" stroke-linecap="round"/>
  ${hand(cx - gw)}${hand(cx + gw)}${arr}
  <path d="M${cx - sh} 116 v-4 M${cx - sh} 114 H${cx + sh} M${cx + sh} 116 v-4" stroke="#7a8496" stroke-width="1.5" fill="none"/><text x="${cx}" y="126" font-size="9" text-anchor="middle" fill="#7a8496">어깨너비</text>
  <text x="4" y="12" font-size="9.5" fill="#7a8496">위에서 본 모습</text><text x="216" y="12" font-size="9.5" text-anchor="end" fill="#3b4250" font-weight="700">${g.wTxt || ''}</text></svg>`;
}
function renderHold(id, e) {
  const gs = e.grips, k = gs && ((S.grip || {})[id] || gs[0].k), g = gs ? gs.find(x => x.k === k) || gs[0] : e.hold;
  if (!g) { $('#hold').innerHTML = ''; return; }
  const chips = gs && gs.length > 1 ? `<div class="gchips">${gs.map(x => `<button class="gchip${x.k === g.k ? ' on' : ''}" data-g="${x.k}">${x.name}</button>`).join('')}</div>` : '';
  $('#hold').innerHTML = `${chips}<span class="ht">${g.t}</span>${g.wMul ? gripSVG(g) : ''}<ul>${g.how.map(h => `<li>${h}</li>`).join('')}</ul><div class="hb">✕ ${g.bad}</div>`;
  $('#hold').querySelectorAll('.gchip').forEach(b => b.onclick = () => {
    S.grip = S.grip || {}; S.grip[id] = b.dataset.g; save();
    eng && eng.setGrip(b.dataset.g); renderHold(id, e);
  });
}
function openEx(id) {
  cur = id; const e = EX[id];
  $('#dName').textContent = e.name;
  $('#s-detail').classList.toggle('guide', !!e.guide); stopGuide();
  if (e.guide) renderGuide(e);
  else { $('#tempo').innerHTML = e.phases.map(() => '<i></i>').join(''); renderHold(id, e); }
  $('#setupWrap').hidden = !e.setup; if (e.setup) $('#setupT').textContent = e.setup.title || '머신 세팅';
  $('#setup').innerHTML = e.setup ? `<ol>${e.setup.steps.map(x => `<li><b>${x[0]}</b><span>${x[1]}</span></li>`).join('')}</ol>${e.setup.tip ? `<div class="tip">💡 ${e.setup.tip}</div>` : ''}` : '';
  $('#cues').innerHTML = e.cues.map((c, i) => `<div class="cue"><b>${i + 1}</b><span>${c}</span></div>`).join('');
  $('#swap').innerHTML = e.swap.map(s => { const w = SWAPS[s] || {}; return `<button class="chip swapc" data-s="${s}">${s}${w.to ? ' <b>3D ›</b>' : ' <b>방법 ›</b>'}</button>`; }).join('');
  $$('#swap .swapc').forEach(b => b.onclick = () => openSwap(b.dataset.s)); $('#swapSec').hidden = $('#swap').hidden = !e.swap.length;
  $('#mBtn').classList.remove('on'); $('#mcue').classList.remove('on'); $('#mcue').textContent = '✕ ' + (e.mcue || '');
  legendKey = '';
  if (eng && eng.S.ex !== id) eng.__seen = false;
  save(); renderLogbox(); show('detail');
}
/* 가이드 카드(3D 없이 타이머로): 횡격막 호흡, 인클라인 걷기 */
let gT = null, gLeft = 0, gRun = false, gBreath = null;
function stopGuide() { clearInterval(gT); clearTimeout(gBreath); gT = null; gRun = false; }
const mmss = v => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
function renderGuide(e) {
  const g = e.guide; gLeft = g.count ? 0 : g.min * 60;
  const top = g.kind === 'breath' ? `<div class="orb" id="orb">준비</div>` : `<div class="walker">🚶</div><div class="info">${g.info.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
  $('#guideWrap').innerHTML = `<div class="gcard">${top}<div class="tm" id="gTm">${g.count ? `0 / ${g.count}<small style="font-size:15px;font-weight:600;color:var(--mute)"> 호흡</small>` : mmss(gLeft)}</div><div class="row"><button class="pri" id="gGo">시작</button><button id="gRe">다시</button></div></div>`;
  $('#gGo').onclick = () => { if (gRun) { stopGuide(); $('#gGo').textContent = '이어서'; return; } gRun = true; $('#gGo').textContent = '잠깐 멈춤'; if (g.count) breathe(g.pace, g.count); else gT = setInterval(tick, 1000); };
  $('#gRe').onclick = () => { stopGuide(); renderGuide(e); };
}
function breathe([inn, out], n) {   // n번 숨쉬기: 원이 커지면 들이마시기, 작아지면 내쉬기
  const o = $('#orb'); if (!o || !gRun) return;
  o.style.transitionDuration = inn + 's'; o.classList.add('in'); o.textContent = '들이마시기';
  gBreath = setTimeout(() => { if (!gRun) return; o.style.transitionDuration = out + 's'; o.classList.remove('in'); o.textContent = '내쉬기';
    gBreath = setTimeout(() => { gLeft++; const t = $('#gTm'); if (t) t.firstChild.textContent = `${gLeft} / ${n}`;
      if (gLeft >= n) { stopGuide(); o.textContent = '잘했어요'; $('#gGo').textContent = '끝!'; const b = $('#logbox .ck:not(.on)'); if (b) b.click(); return; }
      breathe([inn, out], n); }, out * 1000); }, inn * 1000);
}
function tick() {
  gLeft = Math.max(0, gLeft - 1); const t = $('#gTm'); if (t) t.textContent = mmss(gLeft);
  if (!gLeft) { stopGuide(); $('#gGo').textContent = '끝!'; const b = $('#logbox .ck:not(.on)'); if (b) b.click(); }
}
/* ---------- 산타의 서고 ---------- */
const LETTERS = [
  { v: 'Vol.01', m: '2026. 08', s: '목은 뇌로 가는 길', t: '목은 뇌로 가는 길', bk: '#5f7f6f', fg: '#fff', h: 214, img: 'letters/vol1.webp', stamp: 86,
    note: '목뼈 안에는 뇌와 온몸을 잇는 <b>척수</b>가 지나간다네. 목이 굳으면 어깨·등·허리·골반까지 <b>도미노</b>처럼 무너지지. 담은 근육이 놀라서 생긴 반응이니, 굳히지 말고 <b>부드럽게 자주 움직여</b> 주게.', links: ['catcow', 'tspine', 'wallang'] },
  { v: 'Vol.02', m: '2026. 09', s: '눈 · 턱 · 귀', t: '목이 안 돌아가는 진짜 이유', bk: '#4f6f94', fg: '#fff', h: 226, img: 'letters/vol2.webp', stamp: 93,
    note: '목을 돌리는 힘의 절반은 <b>위쪽 목뼈(C1·C2)</b>가 맡고, 그 신호는 <b>눈·턱·귀</b>로 뻗어 있다네. 목이 뻐근할 땐 억지로 꺾지 말고 눈동자, 턱, 귀부터 풀어 주게. 그다음에 등을 돌려 주면 목이 한결 가볍지.', links: ['tspine', 'catcow', 'wallang'] },
  { v: 'Vol.03', m: '2026. 10', s: '라운드 숄더', t: '내가 정말 라운드 숄더일까?', bk: '#e2c89c', fg: '#2a2520', h: 206, img: 'letters/vol3.webp', stamp: 94,
    note: '라운드 숄더는 느낌이 아니라 <b>구조</b>의 문제라네. 등(흉추)이 굽으면 그 위의 어깨뼈가 앞으로 밀리고, 쇄골 아래·소흉근 밑 <b>좁은 통로</b>가 눌리지. 등을 펴고 날개뼈를 제자리로 돌려놓는 운동부터 시작하게.', links: ['wallang', 'tspine', 'facepull', 'rdfly'] },
  { v: 'Vol.04', m: '2026. 11', s: '호흡', t: '나는 호흡을 제대로 하고 있을까?', bk: '#e8742a', fg: '#fff', h: 232, img: 'letters/vol4.webp', stamp: 95,
    note: '<b>횡격막</b>이 제대로 내려가지 않으면 목과 어깨가 대신 숨을 쉬느라 뻐근해진다네. 숨은 앞뒤가 아니라 <b>360°</b>로. 무거운 걸 들 땐 버티는 구간에 들이마시고, 힘쓰는 순간에 내쉬게.', links: ['breath', 'squat', 'latpd'] },
  { v: 'Vol.05', m: '2026. 12', s: '무릎', t: '무릎이 아파 보신 적 있나요?', bk: '#b4573a', fg: '#fff', h: 200, img: 'letters/vol5.webp', stamp: 95, stampFrom: '2027-01-01',
    note: '무릎은 <b>뼈는 기둥, 연골은 쿠션, 인대는 밧줄</b>처럼 한 덩어리로 움직인다네. 앉고 설 땐 무릎이 <b>안으로 꺾이지 않게</b> 엉덩이 힘으로 잡아 주고, 서 있을 땐 <b>뒤로 쫙 펴지 말게</b>. 연골은 스펀지라 걸을 때 영양을 받으니, 트레드밀에선 <b>보폭은 짧게, 발걸음은 빠르게</b> 걸어 보게.', links: ['boxsq', 'rlunge', 'hipthrust', 'incwalk'] }
];
function renderShelf() {
  const FB = ['#e0a77c', '#c7cdb9', '#a9bccd', '#ead6bc', '#f4ece0', '#2d2a28', '#d27b52', '#8fa39a', '#f6c08e', '#e8dccb'];
  const fb = (c, w, h, cls = '') => `<span class="fb ${cls}" style="--bk:${c};width:${w}px;height:${h}px"><i style="top:${Math.round(h * .16)}px"></i><i style="bottom:${Math.round(h * .16)}px"></i></span>`;
  $('#shelf').innerHTML = `<div class="row">${fb('#8a5a3a', 12, 150)}${LETTERS.map((L, i) => `<button class="book ${L.lock ? 'lock' : ''} l${i + 1}" data-i="${i}" style="--bk:${L.bk};--fg:${L.fg};--h:${L.h}px;--i:${i}" aria-label="${L.v} ${L.t}"><span class="band b1"></span><span class="band b2"></span><span class="band b3"></span><span class="band b4"></span><span class="v">${L.v.replace('Vol.0', '')}</span><span class="lbl"><span class="t">${L.s}</span></span>${L.lock ? '<span class="seal">🔒</span>' : `<span class="m">${L.m.slice(6)}월</span>`}</button>`).join('')}<span class="bookend"></span></div><div class="tag">8월 ─ 12월 · 그랑서울 피트니스 웰니스 레터</div>`;
  $$('#shelf .book').forEach(b => b.onclick = () => { const L = LETTERS[+b.dataset.i]; if (L.lock) { b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 300 }); toastLock(b); return; } b.style.transform = 'translateY(-40px)'; setTimeout(() => openLetter(+b.dataset.i), 260); });
}
function toastLock(b) { const t = document.createElement('div'); t.className = 'tag'; t.textContent = '🎅 12월 호는 아직 산타가 쓰는 중이라네. 곧 꽂아 두지!'; const old = $('#shelf .tag'); old.replaceWith(t); setTimeout(() => renderShelf(), 2600); }
function openLetter(i) {
  const L = LETTERS[i];
  $('#rVol').textContent = `${L.m} — ${L.v}`; $('#rTitle').textContent = L.t;
  $('#letter').innerHTML = `<img src="${L.img}" alt="${L.t} 웰니스 레터" loading="lazy">${L.stamp && !(L.stampFrom && today() < L.stampFrom) ? `<div class="stamp" style="top:${L.stamp}%">지난 호 · 마감<small>QR 참여는 끝났어요</small></div>` : ''}`;
  $('#rNote').innerHTML = `🎅 <b>산타의 한 줄</b><br>${L.note}`;
  $('#rLinks').innerHTML = L.links.map((k, j) => exRow([k], j)).join(''); bindEx($('#rLinks'));
  $('#rKeepMsg').textContent = ''; $('#rKeep').onclick = () => keepLetter(L);
  show('read');
}
$('#libBack').onclick = () => show('lib', true);
$('#libGo').onclick = () => show('lib');
let warping = false;
async function warp(done) {   // 촤라라락 종이가 흩날리고 → 웅장한 원형 도서관을 위에서부터 훑어 내려와 → 서재 문으로 들어가기
  if (warping) return; warping = true; const w = $('#warp'); w.className = ''; void w.offsetWidth; w.classList.add('go');
  try { navigator.vibrate && navigator.vibrate(10); } catch (e) { }
  let arrived = false; const arrive = () => { if (arrived) return; arrived = true; w.classList.add('flash'); setTimeout(done, 260); };
  const end = () => { w.classList.add('flash'); setTimeout(() => { w.className = ''; warping = false; }, 520); };
  $('#warpSkip').onclick = () => { arrive(); end(); };
  try {
    const m = await import('./library3d.js');
    setTimeout(() => w.classList.add('on3d'), 120);
    await m.flyToLibrary($('#stage3d'), arrive, window.__warpMs || 3200);
  } catch (e) { console.error('warp', e); arrive(); }
  end();
}
async function keepLetter(L) {   // 레터 이미지를 휴대폰에 저장(앱 안에서는 저장 확인창, 일반 웹에서는 바로 내려받기)
  const name = `그랑서울_웰니스레터_${L.v}.webp`, msg = $('#rKeepMsg');
  try {
    const blob = await (await fetch(L.img)).blob();
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({ filename: name, data: blob }); msg.textContent = '🎅 서재에서 한 권 챙겨 갔구먼!'; return; }
    const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch (e) { if (e && e.code === 'declined') return; msg.textContent = '저장이 안 되면 레터 이미지를 길게 눌러 저장해 주세요.'; }
}
function subLine() {
  const e = EX[cur], h = todayHist(cur), ss = setsOf(cur);
  return e.guide ? `${e.desc} · ${e.reps}` : e.track === 'weight' ? `${e.desc} · ${ss}세트 × ${h ? h.reps : 10}회 · 휴식 ${restOf(cur, 0) >= 120 ? '2분' : restOf(cur, 0) + '초'}` : `${e.desc} · ${ss}세트 × ${e.reps} · 천천히`;
}
function syncChips() {
  if (!eng) return;
  $$('#exView [data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === eng.S.view));
  $('#jBtn').classList.toggle('on', eng.S.showJ); $('#sBtn').classList.toggle('on', eng.S.slow);
}
$$('#exView [data-v]').forEach(b => b.onclick = () => { eng && eng.setView(b.dataset.v); syncChips(); setRot($('#exView'), b.dataset.v === 'q'); });   // 3D를 누르면 바로 돌려볼 수 있게
$$('#mapView [data-mv]').forEach(b => b.onclick = () => { $$('#mapView [data-mv]').forEach(x => x.classList.toggle('on', x === b)); if (eng) { eng.S.mapView = b.dataset.mv; eng.setView(b.dataset.mv); } });
$('#jBtn').onclick = () => { if (!eng) return; eng.setJoints(!eng.S.showJ); syncChips(); };
$('#sBtn').onclick = () => { if (!eng) return; eng.setSlow(!eng.S.slow); syncChips(); };
$('#mBtn').onclick = () => { if (!eng) return; const v = !eng.S.mk; eng.setMistake(v); $('#mBtn').classList.toggle('on', v); $('#mcue').classList.toggle('on', v); };

let legendKey = '';
function onFrame({ ex, ph, i, roles, q }) {
  if (screen !== 'detail' || EX[cur].guide) return;
  $('#phTxt').textContent = ph[0]; $('#phSub').textContent = ph[1];
  $$('#tempo i').forEach((x, j) => x.classList.toggle('on', j === i));
  $('#checks').innerHTML = ex.checks.map(([lb, ok, badTxt]) => { const g = ok(q); return `<div class="ck2 ${g ? '' : 'bad'}"><i>${g ? '✓' : '!'}</i><span>${g ? lb : badTxt}</span></div>`; }).join('');
  const k = JSON.stringify(roles);
  if (k !== legendKey) {
    legendKey = k;
    $('#legend').innerHTML = ['T', 'R', 'B', 'G'].map(r => { const ms = Object.entries(roles).filter(([, x]) => x === r).map(([m]) => m); return ms.length ? `<div class="row"><span class="tagc" style="background:${ROLE[r].c}">${ROLE[r].t}</span><span>${ms.map(m => MUS[m]).join(' · ')}<br><small>${ms.map(m => MUS_EN[m]).join(' / ')}</small></span></div>` : ''; }).join('');
  }
}

/* 기록 + 추천 */
function renderLogbox() {
  const e = EX[cur], id = cur, h = P.startToday(S, id, e, today(), recOpt()), ss = setsOf(id);
  $('#dSub').textContent = subLine();
  let html = '';
  if (e.track === 'weight' && cond() === 'fresh') html += `<div class="setpick"><span>오늘 세트</span><button data-p="0" class="${plus() ? '' : 'on'}">3세트 · 기본</button><button data-p="1" class="${plus() ? 'on' : ''}">4세트 · 강도 높이기</button></div>`;
  if (e.track === 'weight') html += `<div class="wrow">오늘 무게 <input inputmode="decimal" id="wIn" value="${h.w ?? ''}" placeholder="kg"> kg<span class="tg">목표 ${h.reps}회 × ${ss}세트</span></div>`;
  html += '<div class="sets">' + Array.from({ length: ss }, (_, i) => `<div class="set"><span>${i + 1}세트</span><em>${e.track === 'weight' ? (h.w ?? '-') + 'kg × ' + h.reps + '회' : e.reps}</em><button class="ck ${h.checks[i] ? 'on' : ''}" data-i="${i}" aria-label="${i + 1}세트 완료">✓</button></div>`).join('') + '</div>';
  $('#logbox').innerHTML = html;
  $('#logbox').querySelectorAll('.setpick button').forEach(b => b.onclick = () => { S.plus = S.plus || {}; S.plus[today()] = b.dataset.p === '1'; save(); renderLogbox(); });
  const wIn = $('#wIn');
  if (wIn) wIn.onchange = () => { const v = parseFloat(wIn.value); h.w = isNaN(v) ? null : v; S.ex[id].w = h.w; save(); renderLogbox(); };
  $$('#logbox .ck').forEach(b => b.onclick = () => {
    const i = +b.dataset.i; h.checks[i] = !h.checks[i]; P.markDay(S, today()); if (cond()) S.rt[today()] = routineToday();
    if (h.checks[i]) { S.sess = S.sess || {}; const t = today(), n = Date.now(), o = S.sess[t]; S.sess[t] = o ? { a: Math.min(o.a, n), b: Math.max(o.b, n) } : { a: n, b: n }; }
    h.done = h.checks.filter(Boolean).length >= ss; save(); renderLogbox();
    if (!h.checks[i]) return;
    if (allDoneToday() && !S.ratings[today()]) { stopRest(); setTimeout(openSheet, 500); return; }
    const left = ss - h.checks.filter(Boolean).length;
    if (left > 0) startRest(restOf(id, i), `다음 ${Array.from({ length: ss }, (_, k) => k).find(k => !h.checks[k]) + 1}세트`);
    else showNext(id);
  });
  rxBox();
}
function rxBox() {
  const e = EX[cur], h = todayHist(cur);
  if (e.track !== 'weight') { $('#rx').innerHTML = '🎅 무게 없이 하는 동작이라네. 아프지 않은 범위에서 매일 해도 좋다네.'; return; }
  if (h.w == null) { $('#rx').innerHTML = '🎅 처음이라면 <b>편하게 15번은 될 무게</b>를 찾아 적어 두게. 오늘은 그 무게로 10번씩이라네.'; return; }
  if (h.rated) { const r = P.recommend(S, cur, e, P.ymd(Date.now() + 864e5)); $('#rx').innerHTML = '🎅 다음 번: ' + r.msg; return; }
  $('#rx').innerHTML = h.done ? '🎅 다 해냈구먼! <b>오늘 운동 마치기</b>에서 어땠는지 알려 주면 다음 무게를 정해 주겠네.' : `🎅 오늘은 <b>${h.w}kg × ${h.reps}회</b>를 ${setsOf(cur)}세트라네. 자세가 무너지면 바로 멈추게.`;
}
/* ---------- 쉬는 시간 타이머: 세트를 체크하면 아래에 살짝 떠요 ---------- */
// 쉬는 시간(ACSM 권고 기반): 큰 하체·전신 다관절 2분, 상체 다관절 90초, 작은 근육 고립 60초, 코어·스트레칭 30초. 4세트째 전엔 +30초
const REST_BIG = ['squat', 'smsquat', 'boxsq', 'rdl', 'smrdl', 'legpress', 'hipthrust', 'rlunge', 'smsplit', 'goodam'], REST_SMALL = ['dbcurl', 'dboh', 'smcalf', 'bwcalf', 'facepull', 'bandfp', 'rdfly', 'bandpa', 'backext'];
const restOf = (id, i) => { const e = EX[id]; if (e.rest) return e.rest; if (e.track !== 'weight') return 30;
  const base = REST_BIG.includes(id) ? 120 : REST_SMALL.includes(id) ? 60 : 90; return base + (cond() === 'fresh' && plus() && i >= 2 ? 30 : 0); };
let rEnd = 0, rTot = 0, rT = null;
function restUI(html) { let el = $('#rest'); if (!el) { el = document.createElement('div'); el.id = 'rest'; document.body.appendChild(el); } el.innerHTML = html; el.classList.add('on'); return el; }
function stopRest() { clearInterval(rT); rT = null; const el = $('#rest'); if (el) el.classList.remove('on'); }
function startRest(sec, nextLbl) {
  clearInterval(rT); rTot = sec; rEnd = Date.now() + sec * 1000;
  const el = restUI(`<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><circle class="pg" cx="22" cy="22" r="19"/></svg><div class="rtx"><small>숨 고르기 · ${nextLbl}</small><b id="rTm">${mmss(sec)}</b></div><button id="rAdd">+30초</button><button id="rSkip" class="sk">건너뛰기</button>`);
  $('#rAdd').onclick = () => { rEnd += 30000; rTot += 30; tickRest(); };
  $('#rSkip').onclick = stopRest;
  tickRest(); rT = setInterval(tickRest, 250);
}
function tickRest() {
  const left = Math.max(0, Math.ceil((rEnd - Date.now()) / 1000)), t = $('#rTm'), pg = $('#rest .pg');
  if (t) t.textContent = mmss(left); if (pg) pg.style.strokeDashoffset = String(119.4 * (1 - left / rTot));
  if (!left) { clearInterval(rT); rT = null; try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { }
    restUI('<div class="rtx go"><b>다음 세트 시작!</b><small>자세부터 다시 잡고 천천히</small></div>'); setTimeout(stopRest, 2200); }
}
function showNext(id) {
  clearInterval(rT); rT = null; const list = trackables(), nx = list.find(k => k !== id && !isDone(k));
  if (!nx) { stopRest(); return; }
  const el = restUI(`<div class="rtx nx"><small>${EX[id].name} 끝! 1~2분 쉬고</small><b>다음: ${EX[nx].name}</b></div><button id="rGo" class="gob">가기</button><button id="rX" class="sk" aria-label="닫기">✕</button>`);
  $('#rGo').onclick = () => { stopRest(); openEx(nx); }; $('#rX').onclick = stopRest;
  clearTimeout(showNext.t); showNext.t = setTimeout(() => { if (el.querySelector('#rGo')) stopRest(); }, 12000);
}
function trackables() { return ROUTINES[routineToday()].items.map(r => r[0]).filter(k => EX[k]); }
function allDoneToday() { return trackables().every(isDone); }

/* ---------- 운동 후 질문 ---------- */
function openSheet() {
  const done = Object.keys(S.ex).filter(id => { const h = todayHist(id); return h && h.checks.some(Boolean); });
  const box = $('#sheetIn');
  if (!done.length) {
    box.innerHTML = `<h3>아직 체크한 세트가 없다네</h3><p class="s">운동 카드에서 세트를 끝낼 때마다 ✓를 눌러 주게. 그래야 다음 무게를 맞춰 줄 수 있다네.</p><button class="btn dark" id="sx">알겠어요</button>`;
    $('#sheet').classList.add('on'); $('#sx').onclick = closeSheet; return;
  }
  const opts = [['hard', '😮‍💨'], ['ok', '🙂'], ['easy', '😌']];
  box.innerHTML = `<h3>오늘 운동, 어땠나?</h3><p class="s">마지막 세트를 끝냈을 때를 떠올려 보게. 몇 번이나 더 할 수 있었을 것 같은가?</p>` +
    opts.map(([k, em]) => `<button class="opt" data-r="${k}"><span class="em">${em}</span><span><b>${P.RATING[k].t}</b><small>${P.RATING[k].s}</small></span></button>`).join('') +
    `<button class="btn ghost" id="sx" style="margin-top:4px">나중에</button>`;
  $('#sheet').classList.add('on');
  $('#sx').onclick = closeSheet;
  $$('#sheetIn .opt').forEach(b => b.onclick = () => { P.rateDay(S, today(), b.dataset.r); save(); afterRate(b.dataset.r, done); });
}
function afterRate(r, done) {
  const tm = P.ymd(Date.now() + 864e5);
  const lines = done.filter(id => EX[id].track === 'weight' && S.ex[id].w != null).map(id => `<div><b>${EX[id].name}</b><br>${P.recommend(S, id, EX[id], tm).msg}</div>`);
  const head = { hard: '수고했네. 버거운 날도 있는 법이라네.', ok: '좋구먼. 딱 알맞게 했다네.', easy: '허허, 여유가 있었구먼!' }[r];
  const sub = S.days.length < 3 ? '처음 몇 번은 몸이 익숙해지는 기간이라네. 느낌을 쌓아 가며 맞춰 주겠네.' : P.mode(S, today()) === 'steady' ? '요즘 꾸준히 오고 있으니 조금 빠르게 올려도 된다네.' : '띄엄띄엄 와도 괜찮다네. 대신 무게는 천천히 올리세.';
  $('#sheetIn').innerHTML = `<h3>${head}</h3><p class="s">${sub}</p>` +
    (lines.length ? `<div class="nextbox">${lines.join('')}</div>` : '') + `<button class="btn dark" id="sx">확인</button>`;
  $('#sx').onclick = () => { closeSheet(); if (screen === 'detail') rxBox(); renderToday(); };
}
/* 대체 운동: 3D 동작이 있으면 그 운동으로, 없으면 방법 카드 */
function openSwap(name) {
  const w = SWAPS[name];
  if (w && w.to) { if (w.grip) { S.grip = S.grip || {}; S.grip[w.to] = w.grip; save(); } openEx(w.to); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const box = $('#sheetIn');
  box.innerHTML = w ? `<h3>${name}</h3><p class="s">${w.what}</p>
    ${w.mus ? `<div class="swmus">${w.mus.map(m => `<span>${MUS[m]}</span>`).join('')}</div>` : ''}
    <ol class="swhow">${w.how.map(h => `<li>${h}</li>`).join('')}</ol>
    <div class="hb">✕ ${w.bad}</div>
    <p class="s" style="margin-top:12px">${w.soon ? '3D 동작은 곧 추가돼요.' : '이 운동은 방법만 안내해요.'}</p>
    <button class="btn dark" id="sx" style="width:100%">닫기</button>`
    : `<h3>${name}</h3><p class="s">방법을 준비 중이에요.</p><button class="btn dark" id="sx" style="width:100%">닫기</button>`;
  $('#sheet').classList.add('on'); $('#sx').onclick = closeSheet;
}
function closeSheet() { $('#sheet').classList.remove('on'); }
$('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };

/* ---------- 부위 ---------- */
let sel = null;
function renderSel() {
  const b = $('#selbox'); if (!sel) { b.innerHTML = ''; return; }
  const list = POOL.filter(([, ms]) => ms.includes(sel));
  b.innerHTML = `<div class="ttl"><b>${MUS[sel] || sel}</b><small>${MUS_EN[sel] || ''}</small></div>` + (list.length ? list.map(([k, ms], i) => exRow([k, '', ms], i)).join('') : '<p class="lead">이 부위 운동은 곧 추가될 거라네.</p>');
  bindEx(b);
}

/* ---------- 기록 ---------- */
/* ---------- 하루 운동 정리: 세 개의 링 + 숫자 ---------- */
let sumDay = null;
function daySummary(d) {
  let sets = 0, vol = 0; const mus = {}, names = [];
  for (const id in S.ex) for (const h of S.ex[id].hist) {
    if (h.d !== d || !EX[id]) continue; const n = h.checks.filter(Boolean).length; if (!n) continue;
    sets += n; names.push(EX[id].name); if (EX[id].track === 'weight' && h.w) vol += h.w * (h.reps || 10) * n;
    const r = EX[id].roles ? EX[id].roles(EX[id].conc || 'up') : {}; for (const k in r) if (r[k] === 'T' || r[k] === 'R') mus[k] = (mus[k] || 0) + n * (r[k] === 'T' ? 1 : .6);
  }
  const ses = (S.sess || {})[d]; let min = ses ? Math.round((ses.b - ses.a) / 60000) + 2 : Math.round(sets * 2.5);
  if (!sets) min = 0; min = Math.min(min, 150);
  const rt = S.rt[d] || (d === today() && cond() ? routineToday() : null);
  const plan = rt && ROUTINES[rt] ? ROUTINES[rt].items.map(r => r[0]).filter(k => EX[k]).reduce((a, k) => a + (d === today() ? setsOf(k) : (EX[k].track === 'weight' ? 3 : (EX[k].sets || 1))), 0) : 0;
  const c = (S.cond || {})[d] || (d === today() ? cond() : null), met = c === 'fresh' ? 5 : c === 'tired' ? 2.8 : 3.5;
  const kcal = S.bw && min ? Math.round(met * S.bw * min / 60) : null;
  const top = Object.entries(mus).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => MUS[k].replace(/\(.*\)/, ''));
  return { sets, plan: Math.max(plan, sets), vol: Math.round(vol), min, kcal, top, names };
}
function renderDaySum() {
  const t = today(); if (!sumDay) sumDay = t;
  const days = Array.from({ length: 7 }, (_, i) => P.ymd(Date.now() - (6 - i) * 864e5));
  const D = daySummary(sumDay), wk = S.days.filter(x => { const g = P.daysBetween(x, sumDay); return g >= 0 && g < 7; }).length;
  const R = [[52, '#ff7a1a', D.plan ? D.sets / D.plan : 0], [38, '#e8a93a', D.min / 40], [24, '#5f7f6f', wk / 3]];
  const ring = ([r, col, v]) => { const L = 2 * Math.PI * r, off = L * (1 - Math.min(1, v)); return `<circle class="bg" cx="70" cy="70" r="${r}" stroke="${col}"/><circle class="fg" cx="70" cy="70" r="${r}" stroke="${col}" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${L.toFixed(1)}" data-off="${off.toFixed(1)}"/>`; };
  const wd = ['일', '월', '화', '수', '목', '금', '토'], lbl = d => d === t ? '오늘' : `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const has = d => Object.values(S.ex).some(x => x.hist.some(h => h.d === d && h.checks.some(Boolean)));
  $('#daySum').innerHTML = `<div class="dh"><b>${sumDay === t ? '오늘의 운동 정리' : lbl(sumDay) + ' 운동 정리'}</b><span>${D.names.length ? D.names.length + '가지 운동' : '아직 기록이 없어요'}</span></div>
  <div class="days">${days.map(d => `<button data-d="${d}" class="${d === sumDay ? 'on' : ''}"><b>${+d.slice(8)}</b>${wd[new Date(d + 'T12:00').getDay()]}<i class="${has(d) ? '' : 'no'}"></i></button>`).join('')}</div>
  <div class="rings"><svg viewBox="0 0 140 140" role="img" aria-label="세트 ${D.sets}/${D.plan}, 운동 ${D.min}분, 이번 주 ${wk}일">${R.map(ring).join('')}</svg>
  <div class="lg"><div><small><i style="background:#ff7a1a"></i>세트</small><b>${D.sets}<em> / ${D.plan || '-'}세트</em></b></div><div><small><i style="background:#e8a93a"></i>운동 시간</small><b>${D.min}<em> / 40분</em></b></div><div><small><i style="background:#5f7f6f"></i>이번 주</small><b>${wk}<em> / 3일</em></b></div></div></div>
  <div class="tiles"><div><small>들어 올린 무게(총합)</small>${D.vol || !D.sets ? `<b>${D.vol.toLocaleString()}<em> kg</em></b>` : '<div class="bw">운동 화면에서 무게를 적으면 계산돼요</div>'}</div>
  <div><small>소모 칼로리(추정)</small>${S.bw ? `<b>${D.kcal ?? 0}<em> kcal</em></b><button class="bwx" id="bwX">${S.bw}kg 기준 · 바꾸기</button>` : `<div class="bw">몸무게 <input id="bwIn" inputmode="decimal" placeholder="kg" aria-label="몸무게"> kg</div>`}</div>
  <div class="wide"><small>오늘 가장 많이 일한 근육</small><div class="mus">${D.top.length ? D.top.map(m => `<span>${m}</span>`).join('') : '<span>세트를 체크하면 보여요</span>'}</div></div></div>
  <p class="fine">칼로리는 운동 강도(MET)×몸무게×운동 시간으로 계산한 대략값이에요. 근육이 몇 kg 늘었는지는 하루 운동으로 잴 수 없어서, 대신 오늘 자극한 근육을 보여 드려요. 근육량 변화는 테크노짐 체크업으로 확인해 보세요.</p>`;
  $$('#daySum .days button').forEach(b => b.onclick = () => { sumDay = b.dataset.d; renderDaySum(); });
  const bx = $('#bwX'); if (bx) bx.onclick = () => { S.bw = null; save(); renderDaySum(); setTimeout(() => $('#bwIn') && $('#bwIn').focus(), 50); };
  const bw = $('#bwIn'); if (bw) bw.onchange = () => { const v = parseFloat(bw.value); if (v > 25 && v < 250) { S.bw = v; save(); renderDaySum(); } };
  requestAnimationFrame(() => requestAnimationFrame(() => $$('#daySum .fg').forEach(c => c.style.strokeDashoffset = c.dataset.off)));
}
function renderLog() {
  header(); renderDaySum();
  const t = today(), wk = S.days.filter(d => { const g = P.daysBetween(d, t); return g >= 0 && g < 7; }).length;
  let sets = 0; for (const id in S.ex) for (const h of S.ex[id].hist) sets += h.checks.filter(Boolean).length;
  const sq = S.ex.squat ? Math.max(0, ...S.ex.squat.hist.filter(h => h.done && h.w).map(h => h.w)) : 0;
  $('#stW').textContent = wk + '일'; $('#stS').textContent = sets; $('#stK').textContent = sq || '-';
  const md = P.mode(S, t);
  $('#modeNote').innerHTML = (S.pace === 'auto' ? `최근 2주 출석을 보니 <b>${md === 'steady' ? '꾸준 모드' : '천천히 모드'}</b>라네. ` : `직접 고른 <b>${P.PACE[S.pace]}</b> 속도라네. `) +
    (md === 'steady' ? '같은 무게로 두 번 연속 깔끔하게 해내거나, "쉬웠어요"가 나오면 바로 올려 주겠네.' : '같은 무게로 두 번 연속 해내고 여유가 있을 때, 또는 3주 차에 한 단계 올리겠네.') +
    ' 올릴 땐 <b>횟수 먼저(+2회), 12회가 되면 무게 한 단계</b>라네.';
  $('#paceSeg').innerHTML = Object.entries(P.PACE).map(([k, v]) => `<button data-k="${k}" class="${S.pace === k ? 'on' : ''}">${v}</button>`).join('');
  $('#paceHint').textContent = { auto: '출석 빈도와 운동 후 느낌을 보고 알아서 정해요. (추천)', slow: '띄엄띄엄 오는 분께. 여유가 확실할 때나 3주 차에만 올려요.', fast: '자주 오는 분께. 깔끔하게 해내면 바로 올려요.' }[S.pace];
  $$('#paceSeg button').forEach(b => b.onclick = () => { S.pace = b.dataset.k; save(); renderLog(); });
  $('#stepSeg').innerHTML = [1, 2, 2.5].map(v => `<button data-v="${v}" class="${S.step === v ? 'on' : ''}">${v}kg</button>`).join('');
  $$('#stepSeg button').forEach(b => b.onclick = () => { S.step = +b.dataset.v; save(); renderLog(); });
  const rows = [];
  for (const id in S.ex) for (const h of S.ex[id].hist) if (h.checks.some(Boolean)) rows.push([h.d, id, h]);
  rows.sort((a, b) => b[0].localeCompare(a[0]));
  $('#hist').innerHTML = rows.slice(0, 12).map(([d, id, h]) => `<div><b>${d.slice(5).replace('-', '/')}</b><span>${EX[id].name}</span><small>${EX[id].track === 'weight' ? `${h.w ?? '-'}kg × ${h.reps}회 · ` : ''}${h.checks.filter(Boolean).length}세트${h.rating ? ' · ' + P.RATING[h.rating].t : ''}</small></div>`).join('') || '<p class="lead">아직 기록이 없다네.</p>';
}

header(); renderToday();
window.__app = { S, openEx, show, openSheet, save };
window.__openEx = openEx;
/* 3D 화면 잠금: 기본은 고정(스크롤해도 안 돌아감), 버튼을 누르면 손가락으로 돌려보기 */
function setRot(view, on) {
  const b = view.querySelector('.rotbtn'); if (!b) return;
  b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.textContent = on ? '🔓 돌리는 중' : '🔒 고정';
  view.classList.toggle('rot', on); eng && eng.setRotate(on);
}
document.querySelectorAll('.rotbtn').forEach(b => b.onclick = ev => { ev.stopPropagation(); const v = b.closest('.viewer'); setRot(v, !v.classList.contains('rot')); });
