/* 맞춤 증량 — 출석 빈도 + 세트 완수 + 운동 후 체감(남은 반복 수)으로 다음 무게·횟수를 정함
   근거: ACSM 2009(초보 8~12RM, 목표보다 1~2회 더 하면 2~10% 증량, 주 2~3회),
        2-for-2 규칙(2회 연속 목표 +2회 이상이면 증량), RIR(남은 반복 수) 자기 평가의 신뢰도(초보자 포함),
        3주 휴식 후 초보자 근력 유지(Ogasawara 2011) */
export const RATING = {
  hard: { t: '힘들었어요', s: '한두 번도 더 못 하겠어요', rir: '0~1' },
  ok: { t: '조금 힘들지만 괜찮았어요', s: '두세 번은 더 할 수 있겠어요', rir: '2~3' },
  easy: { t: '쉬웠어요', s: '네 번 이상 더 할 수 있겠어요', rir: '4+' }
};
export const PACE = { auto: '자동', slow: '천천히', fast: '빠르게' };

const DAY = 864e5;
export const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / DAY);

export function newState() { return { start: null, days: [], pace: 'auto', step: 2, ratings: {}, ex: {} }; }
export function exState(S, id, range) { return S.ex[id] || (S.ex[id] = { w: null, reps: range ? range[0] + 2 : null, hist: [], bumps: 0 }); }

export function weekOf(S, today) { if (!S.start) return 1; return Math.min(4, Math.floor(daysBetween(S.start, today) / 7) + 1); }

/* 최근 14일 출석 → 꾸준(주 2회 이상) / 띄엄띄엄 */
export function mode(S, today) {
  if (S.pace === 'fast') return 'steady';
  if (S.pace === 'slow') return 'sparse';
  const n = S.days.filter(d => { const g = daysBetween(d, today); return g >= 0 && g < 14; }).length;
  const span = Math.max(7, Math.min(14, S.start ? daysBetween(S.start, today) + 1 : 14));
  return n / span * 7 >= 2 ? 'steady' : 'sparse';   // 주 2회 이상이면 꾸준
}

const qual = h => h && h.done && (h.rating === 'ok' || h.rating === 'easy');
const same = (a, b) => a && b && a.w === b.w && a.reps === b.reps;
const bad = h => h && (!h.done || h.rating === 'hard');

/* 다음에 할 무게·횟수 추천 */
export function recommend(S, id, ex, today, opt = {}) {
  const E = exState(S, id, ex.range), [lo, hi] = ex.range, step = S.step || 2;
  const hist = E.hist.filter(h => h.d < today && h.rated);
  const L = hist[hist.length - 1], P = hist[hist.length - 2];
  const wk = weekOf(S, today), md = mode(S, today);
  const base = { w: E.w, reps: E.reps, mode: md, kind: 'hold' };
  if (E.w == null) return { ...base, kind: 'first', msg: '처음이라면 <b>편하게 15번은 될 무게</b>를 찾아 적어 두게. 오늘은 그 무게로 10번씩이라네.' };
  if (!L) return { ...base, msg: `오늘은 <b>${E.w}kg × ${E.reps}회</b>라네. 다 끝나면 어땠는지 알려 주게.` };
  const gap = daysBetween(L.d, today);
  if (gap > 28) return { ...base, kind: 'down', w: Math.max(0, E.w - step), reps: lo + 2, msg: `한 달 넘게 쉬었구먼. <b>${Math.max(0, E.w - step)}kg × ${lo + 2}회</b>로 한 단계 가볍게 다시 시작하세.` };
  if (gap > 14) return { ...base, msg: `2주 넘게 쉬었지만 힘은 그대로일 걸세. <b>${E.w}kg × ${E.reps}회</b> 그대로 하게.` };
  if (bad(L) && bad(P)) return { ...base, kind: 'down', w: Math.max(0, E.w - step), msg: `두 번 연속 버거웠구먼. <b>${Math.max(0, E.w - step)}kg</b>으로 한 단계 내려 자세를 다지세. 부끄러운 게 아니라네.` };
  if (bad(L)) return { ...base, msg: `지난번엔 버거웠지. <b>${E.w}kg × ${E.reps}회</b> 그대로 한 번 더 하세.` };
  let up = false, why = '';
  if (md === 'steady') {
    if (L.rating === 'easy') { up = true; why = '지난번이 쉬웠다니'; }
    else if (qual(L) && qual(P) && same(L, P)) { up = true; why = '같은 무게로 두 번 연속 해냈으니'; }
  } else {
    if (qual(L) && qual(P) && same(L, P) && (L.rating === 'easy' || P.rating === 'easy')) { up = true; why = '두 번 연속 해냈고 여유도 있었으니'; }
    else if (wk >= 3 && !E.bumps) { up = true; why = '3주 차, 한 단계 올라갈 때가 됐으니'; }
  }
  if (!up && hist.length < 2) return { ...base, msg: `처음 몇 번은 같은 무게로 자세를 익히세. <b>${E.w}kg × ${E.reps}회</b> 한 번 더.` };
  if (!up) return { ...base, msg: md === 'steady' ? `<b>${E.w}kg × ${E.reps}회</b> 한 번 더. 이번에도 깔끔하면 올려 주겠네.` : `띄엄띄엄 올 땐 서두르지 않는 게 비법이라네. <b>${E.w}kg × ${E.reps}회</b> 그대로.` };
  if (opt.noUp) return { ...base, msg: `오늘은 컨디션이 보통이니 올리지 않고 <b>${E.w}kg × ${E.reps}회</b> 그대로 하세.` };
  // 이중 증량: 횟수 먼저(+2), 범위 끝이면 무게 한 단계 + 횟수 처음으로
  if (wk >= 3 && !E.bumps && md === 'sparse') return { ...base, kind: 'up', w: E.w + step, reps: lo, msg: `${why} <b>${E.w + step}kg × ${lo}회</b>로 올려 보게.` };
  if (E.reps < hi) return { ...base, kind: 'up', reps: Math.min(hi, E.reps + 2), msg: `${why} 무게는 그대로, <b>${E.w}kg × ${Math.min(hi, E.reps + 2)}회</b>로 늘려 보게.` };
  return { ...base, kind: 'up', w: E.w + step, reps: lo, msg: `${why} <b>${E.w + step}kg × ${lo}회</b>로 올려 보게. 자세가 무너지면 바로 내리게.` };
}

/* 오늘 기록 시작 시 추천을 확정 */
export function startToday(S, id, ex, today, opt = {}) {
  const E = exState(S, id, ex.range);
  let h = E.hist.find(x => x.d === today);
  if (!h) {
    if (ex.track === 'weight' && E.w != null) {
      const r = recommend(S, id, ex, today, opt);
      if (r.kind === 'up' && r.w !== E.w) E.bumps++;
      if (r.kind === 'down' && r.reps !== E.reps) E.bumps = 0;   // 긴 휴식 후 다시 시작
      E.w = r.w; E.reps = r.reps;
    }
    h = { d: today, w: E.w, reps: E.reps, checks: [], done: false, rated: false, rating: null };
    E.hist.push(h); if (E.hist.length > 60) E.hist.shift();
  }
  return h;
}

export function markDay(S, today) {
  const last = S.days[S.days.length - 1];
  if (!S.start || (last && daysBetween(last, today) > 28)) S.start = today;   // 한 달 넘게 쉬면 1주 차부터
  if (!S.days.includes(today)) S.days.push(today);
  S.days = S.days.slice(-90);
}

export function rateDay(S, today, rating) {
  S.ratings[today] = rating;
  for (const id in S.ex) { const h = S.ex[id].hist.find(x => x.d === today); if (h) { h.rating = rating; h.rated = true; } }
}
