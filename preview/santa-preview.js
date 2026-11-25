/* 산타의 운동 비법서 · 교환 미리보기 팝업
 * 12월 챌린지 사이트에 이 파일 하나만 넣고 아래처럼 부르면 돼요.
 *   <script src="https://gran-seoul-fitness.github.io/how-to-workout/preview/santa-preview.js"></script>
 *   openSantaPreview({ points: 1240, onExchange: () => { ...기존 500P 교환 처리... } });
 * points: 회원의 현재 포인트(모르면 생략). onExchange: '500P로 교환' 버튼을 눌렀을 때 할 일.
 */
(function () {
  const BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) || 'https://gran-seoul-fitness.github.io/how-to-workout/preview/';
  const COST = 500;
  const SLIDES = [
    ['ex3d', '3D로 보는 정확한 자세', '돌려 보고, 앞·옆·뒤로 보고, 관절 점까지 켜서 볼 수 있어요.'],
    ['today', '오늘 컨디션에 맞춘 운동', '쌩쌩·보통·피곤 중 고르면 세트 수와 운동이 알아서 바뀌어요.'],
    ['cues', '자세 체크와 쓰는 근육', '허리 중립, 골반 고정… 동작마다 확인할 것과 일하는 근육을 알려줘요.'],
    ['log', '기록과 오늘의 링', '세트를 체크하면 쉬는 시간 타이머가 돌고, 하루 링이 채워져요.'],
    ['lib', '산타의 서고', '8~12월 웰니스 레터 5권을 책장에서 꺼내 읽고, 이어지는 운동으로 바로 가요.'],
  ];
  const WEEKS = [['1주', '몸 깨우기', '2세트 · 자세 먼저'], ['2주', '기본 다지기', '3세트 · 쉬는 시간 지키기'], ['3주', '한 단계 더', '무게 한 칸 올리기'], ['4주', '나만의 루틴', '기록 보고 스스로 짜기']];
  const EXS = ['고블릿 스쿼트', '랫 풀다운', '체스트 프레스', '스미스 루마니안 데드리프트', '레그 프레스', '케이블 푸시다운', '힙 쓰러스트', '페이스 풀', '덤벨 숄더 프레스', '데드버그', '사이드 플랭크', '벽 천사'];

  const css = `
.sbp-dim{position:fixed;inset:0;z-index:9999;background:rgba(40,24,12,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s}
.sbp-dim.on{opacity:1}
.sbp{width:100%;max-width:440px;max-height:92vh;overflow:auto;-webkit-overflow-scrolling:touch;border-radius:26px 26px 0 0;background:linear-gradient(180deg,#f7ede2,#efe2d3);color:#2a1e16;font-family:'IBM Plex Sans KR','Pretendard',system-ui,sans-serif;box-shadow:0 -10px 40px rgba(60,30,10,.25);transform:translateY(30px);transition:transform .3s cubic-bezier(.2,.8,.2,1);position:relative}
.sbp-dim.on .sbp{transform:none}
@media(min-width:600px){.sbp-dim{align-items:center}.sbp{border-radius:26px}}
.sbp *{box-sizing:border-box}
.sbp-xw{position:sticky;top:0;height:0;z-index:3}.sbp-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.7);font-size:18px;color:#5a4636;cursor:pointer;z-index:2}
.sbp-hero{display:flex;gap:16px;align-items:center;padding:26px 50px 6px 22px;background:radial-gradient(120% 90% at 85% 0%,rgba(255,150,60,.35),transparent 60%)}
.sbp-hero img{width:92px;filter:drop-shadow(0 10px 16px rgba(90,30,10,.3));flex:none}
.sbp-tag{display:inline-block;font-size:10.5px;letter-spacing:.14em;color:#b4572a;border:1px solid rgba(180,87,42,.35);border-radius:99px;padding:3px 9px;margin-bottom:6px}
.sbp h2{margin:0;font-size:22px;line-height:1.25;font-weight:700}
.sbp-sub{margin:6px 0 0;font-size:13px;color:#6d5a4a;line-height:1.5}
.sbp-sec{padding:16px 22px 4px}
.sbp-h{font-size:13px;font-weight:700;color:#b4572a;margin:0 0 10px;letter-spacing:.02em}
.sbp-car{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 22px 8px;margin:0 -22px;scrollbar-width:none}
.sbp-car::-webkit-scrollbar{display:none}
.sbp-sl{flex:0 0 62%;scroll-snap-align:center}
.sbp-sl figure{margin:0;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 8px 22px rgba(90,50,20,.16);border:1px solid rgba(255,255,255,.8);aspect-ratio:480/855}
.sbp-sl img{width:100%;height:100%;object-fit:cover;display:block}
.sbp-sl b{display:block;font-size:14px;margin:10px 2px 3px}
.sbp-sl span{display:block;font-size:12px;color:#6d5a4a;line-height:1.45;padding:0 2px}
.sbp-dots{display:flex;gap:5px;justify-content:center;margin:6px 0 0}
.sbp-dots i{width:6px;height:6px;border-radius:9px;background:rgba(120,80,50,.25);transition:all .2s}
.sbp-dots i.on{width:18px;background:#e0702e}
.sbp-wk{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.sbp-wk div{background:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.9);border-radius:14px;padding:9px 6px;text-align:center}
.sbp-wk em{display:block;font-style:normal;font-size:11px;color:#b4572a;font-weight:700}
.sbp-wk b{display:block;font-size:12.5px;margin:3px 0 2px}
.sbp-wk span{display:block;font-size:10.5px;color:#7a6656;line-height:1.35}
.sbp-li{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sbp-li li{display:flex;gap:10px;align-items:flex-start;background:rgba(255,255,255,.55);border-radius:14px;padding:11px 12px;font-size:13px;line-height:1.5}
.sbp-li li>i{font-style:normal;font-size:17px;line-height:1.2}
.sbp-li b{display:block;font-size:13.5px}
.sbp-li span{color:#6d5a4a;font-size:12px}
.sbp-chips{display:flex;flex-wrap:wrap;gap:6px}
.sbp-chips span{font-size:12px;padding:6px 10px;border-radius:99px;background:rgba(255,255,255,.7);border:1px solid rgba(224,112,46,.18)}
.sbp-chips span.more{background:#2a1e16;color:#fff;border:0}
.sbp-note{margin:14px 22px 0;font-size:11.5px;color:#7a6656;line-height:1.55;background:rgba(255,255,255,.45);border-radius:12px;padding:10px 12px}
.sbp-foot{position:sticky;bottom:0;padding:14px 22px calc(16px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(239,226,211,0),#efe2d3 30%);margin-top:6px}
.sbp-pt{display:flex;justify-content:space-between;font-size:12.5px;color:#6d5a4a;margin-bottom:8px}
.sbp-pt b{color:#2a1e16}
.sbp-go{width:100%;height:54px;border:0;border-radius:18px;background:#2a1e16;color:#fff;font-size:16px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 10px 24px rgba(42,30,22,.3)}
.sbp-go:disabled{background:#b9a999;box-shadow:none;cursor:default}
.sbp-go small{font-weight:500;opacity:.75;margin-left:6px}
`;

  function el(h) { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; }

  window.openSantaPreview = function (opt = {}) {
    if (!document.getElementById('sbp-css')) { const s = document.createElement('style'); s.id = 'sbp-css'; s.textContent = css; document.head.appendChild(s); }
    const pts = typeof opt.points === 'number' ? opt.points : null;
    const enough = pts === null || pts >= COST;
    const dim = el(`<div class="sbp-dim" role="dialog" aria-modal="true" aria-label="산타의 운동 비법서 미리보기">
<div class="sbp">
  <div class="sbp-xw"><button class="sbp-x" aria-label="닫기">✕</button></div>
  <div class="sbp-hero">
    <img src="${BASE}../cover.webp" alt="산타의 운동 비법서 표지">
    <div><span class="sbp-tag">SANTA'S SECRET GIFT</span>
      <h2>산타의 운동 비법서</h2>
      <p class="sbp-sub">"새해부터는 자네 혼자서도 할 수 있다네."<br>그랑서울 피트니스 기구로 짠 <b>나만의 4주 운동 앱</b>이에요.</p></div>
  </div>

  <div class="sbp-sec"><p class="sbp-h">미리 살짝 보기</p>
    <div class="sbp-car">${SLIDES.map(([f, t, d]) => `<div class="sbp-sl"><figure><img loading="lazy" src="${BASE}${f}.webp" alt="${t} 화면"></figure><b>${t}</b><span>${d}</span></div>`).join('')}</div>
    <div class="sbp-dots">${SLIDES.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
  </div>

  <div class="sbp-sec"><p class="sbp-h">새해 4주 플랜</p>
    <div class="sbp-wk">${WEEKS.map(([n, t, d]) => `<div><em>${n}</em><b>${t}</b><span>${d}</span></div>`).join('')}</div>
  </div>

  <div class="sbp-sec"><p class="sbp-h">교환하면 이런 걸 얻어요</p>
    <ul class="sbp-li">
      <li><i>🧍</i><div><b>운동 46가지 · 그중 44가지는 3D 인체로 시연</b><span>손목·무릎·허리 각도까지 맞춘 동작이에요. 흔한 실수 동작과 나란히 비교해 볼 수 있어요.</span></div></li>
      <li><i>🔥</i><div><b>그날 컨디션에 맞춰 바뀌는 루틴</b><span>전신·상체·하체 A/B, 피곤한 날엔 걷기·스트레칭 위주로 가볍게 풀어요.</span></div></li>
      <li><i>🏋️</i><div><b>우리 헬스장 기구 중심으로</b><span>스미스 머신, 케이블, 레그 프레스, 덤벨… 우리 헬스장 기구 위주로 짰어요.</span></div></li>
      <li><i>⏱️</i><div><b>쉬는 시간 타이머 + 하루 링</b><span>운동마다 알맞은 휴식 시간이 자동으로 돌고, 세트·시간·주간 횟수가 링으로 채워져요.</span></div></li>
      <li><i>📚</i><div><b>산타의 서고</b><span>8~12월 웰니스 레터 5권을 다시 읽고, 레터마다 이어지는 운동으로 바로 넘어가요.</span></div></li>
    </ul>
  </div>

  <div class="sbp-sec"><p class="sbp-h">비법서에 담긴 운동 일부</p>
    <div class="sbp-chips">${EXS.map(e => `<span>${e}</span>`).join('')}<span class="more">외 34가지</span></div>
  </div>

  <p class="sbp-note">🎁 교환하면 코드가 나와요. 코드는 <b>처음 연 휴대폰 1대</b>에서만 쓸 수 있고, 다음부터는 코드 없이 바로 열려요. 휴대폰을 바꿨다면 데스크에 말해 주세요.</p>

  <div class="sbp-foot">
    ${pts === null ? '' : `<div class="sbp-pt"><span>내 포인트 <b>${pts.toLocaleString()}P</b></span><span>교환 후 <b>${Math.max(0, pts - COST).toLocaleString()}P</b></span></div>`}
    <button class="sbp-go" ${enough ? '' : 'disabled'}>${enough ? `${COST}P로 교환하기` : `포인트가 ${(COST - pts).toLocaleString()}P 모자라요`}</button>
  </div>
</div></div>`);
    document.body.appendChild(dim);
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dim.classList.add('on'));
    const close = () => { dim.classList.remove('on'); document.body.style.overflow = prevOverflow; setTimeout(() => dim.remove(), 250); };
    dim.querySelector('.sbp-x').onclick = close;
    dim.onclick = e => { if (e.target === dim) close(); };
    const car = dim.querySelector('.sbp-car'), dots = dim.querySelectorAll('.sbp-dots i');
    car.addEventListener('scroll', () => { const w = car.firstChild.offsetWidth + 12; const i = Math.round(car.scrollLeft / w); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
    const go = dim.querySelector('.sbp-go');
    go.onclick = () => { if (go.disabled) return; close(); opt.onExchange && opt.onExchange(); };
    return { close };
  };
})();
