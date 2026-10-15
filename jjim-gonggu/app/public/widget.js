/* 찜꽁 상품 페이지 위젯 (의존성 없음). 쇼핑몰 상품 상세에 스크립트 태그로 들어간다.
 * 설치 시 서버가 카페24 스크립트태그로 넣는다: <script src="https://APP/widget.js?mall=MALL_ID&client_id=CLIENT_ID"></script>
 * 고객 화면에는 진행률과 '결제 없는 참여 신청'만 보여 주고, 기존 구매 버튼은 바꾸지 않는다 (쿠폰 받은 회원을 그 버튼으로 안내만 한다).
 * 진행 중인 공구가 없는 품절 상품에는 '재입고 · 공구 알림 받기'를 보여 준다 (카페24 찜 조회 권한 없이 수요를 모으는 경로).
 * 재고가 있는 상품에는 알림 버튼을 두지 않는다 (#67): 지금 정가로 살 고객에게 할인을 기다리라고 권하게 된다. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var src = new URL(script.src, location.href);
  var API = src.origin;
  var CLIENT_ID = src.searchParams.get('client_id') || script.getAttribute('data-client-id');
  var MALL = src.searchParams.get('mall') || (window.CAFE24API && window.CAFE24API.MALL_ID);
  var productNo = Number(script.getAttribute('data-product-no') || window.iProductNo || new URLSearchParams(location.search).get('product_no') || (location.pathname.match(/\/(\d+)\/?(?:category|display)?/) || [])[1]);
  if (!MALL || !productNo) return;

  var won = function (n) { return Math.round(n).toLocaleString('ko-KR') + '원'; };
  // 한국 시간 '10/17(토) 14:00' (DESIGN.md #34, 앱의 lib/time.ts fmtKst와 같은 모양)
  var when = function (iso) {
    if (!iso) return '';
    var k = new Date(new Date(iso).getTime() + 9 * 3600000);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (k.getUTCMonth() + 1) + '/' + k.getUTCDate() + '(' + '일월화수목금토'.charAt(k.getUTCDay()) + ') ' + pad(k.getUTCHours()) + ':' + pad(k.getUTCMinutes());
  };

  // 로그인 회원의 암호화 회원 ID(JWT). 카페24 Front SDK: CAFE24API.init({client_id, version}) → getEncryptedMemberId(client_id, cb).
  // 비회원이면 null (res.guest_id만 온다). 데모 쇼핑몰은 JJIM_MEMBER_TOKEN으로 대신 준다.
  // VERIFY(P2): 테스트몰에서 실제 응답 형식 확인
  var sdk = null;
  function cafe24() {
    if (sdk) return sdk;
    try { if (window.CAFE24API && CLIENT_ID) sdk = window.CAFE24API.init({ client_id: CLIENT_ID, version: '2026-09-01' }); } catch (e) { sdk = null; }
    return sdk;
  }
  function memberToken() {
    if (typeof window.JJIM_MEMBER_TOKEN === 'function') return Promise.resolve(window.JJIM_MEMBER_TOKEN());
    return new Promise(function (resolve) {
      try {
        var c = cafe24();
        if (!c || !c.getEncryptedMemberId) return resolve(null);
        c.getEncryptedMemberId(CLIENT_ID, function (err, res) { resolve(err ? null : (res && res.member_id) || null); });
      } catch (e) { resolve(null); }
    });
  }

  // 쇼핑몰 스킨과 어울리도록 흰 바탕 · 얇은 테두리 · 그림자 없음(판매자 화면과 같은 DashLite풍 화이트). 포인트색 #E94162는 진행 막대에만, 흰 글씨를 얹는 주 버튼은 한 단계 진한 #D63556(대비 4.66:1)
  // 작은 글씨는 바탕 대비 4.5:1 이상(WCAG AA): 글자는 슬레이트 #364A63, 보조 글씨는 #526484 하나, 작은 분홍 글씨는 #C22D4D(연분홍 바탕 #FDECF0), 배지 글자는 배지 바탕보다 진한 같은 계열 색. 한글은 단어 단위로 줄을 바꾼다
  var css = '.jjg{font:14px/1.55 "Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;letter-spacing:-.01em;color:#364A63;border:1px solid #DBDFEA;border-radius:6px;padding:16px;margin:14px 0;background:#fff;display:grid;gap:10px;max-width:520px;box-shadow:none;text-align:left;word-break:keep-all;overflow-wrap:break-word;grid-template-columns:minmax(0,1fr)}' +
    '.jjg *{box-sizing:border-box}.jjg-top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 8px;align-items:center;font-size:12.5px}.jjg-top>.jjg-muted{min-width:0;margin-left:auto;text-align:right}' +
    '.jjg-badge{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#C22D4D;background:#FDECF0;border-radius:4px;padding:3px 10px 3px 8px;flex:none;white-space:nowrap}.jjg-badge svg{width:13px;height:13px}' +
    '.jjg-badge.ok{color:#0B7A55;background:#E3F6EE}.jjg-badge.no{color:#526484;background:#EEF0F5}.jjg-muted{color:#526484;font-size:12.5px}' +
    '.jjg-cnt{font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.15}.jjg-cnt small{font-size:13.5px;font-weight:500;color:#526484}' +
    '.jjg-price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.jjg-price b{font-size:17px;color:#C22D4D;white-space:nowrap}.jjg-price s{color:#526484;font-size:13px;white-space:nowrap}' +
    '.jjg-bar{height:8px;border-radius:99px;background:#EEF0F5;overflow:hidden}.jjg-bar i{display:block;height:100%;min-width:8px;background:#E94162;border-radius:99px;transition:width .5s}.jjg-bar.ok i{background:#0F9F6E}' +
    '.jjg-others{border-top:1px solid #DBDFEA;padding-top:12px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.jjg-others:first-child{border-top:0;padding-top:0}.jjg-others>b{font-size:13.5px}' +
    '.jjg a.jjg-other{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #DBDFEA;border-radius:6px;color:#364A63;font-weight:600;text-decoration:none}' +
    '.jjg a.jjg-other:focus-visible{outline:3px solid rgba(233,65,98,.35);outline-offset:2px}.jjg-other>div{flex:1;min-width:0;display:grid;gap:4px}' +
    '.jjg-other small{color:#526484;font-size:12.5px;font-weight:500}.jjg-other small.due{color:#C22D4D;font-weight:700}.jjg-other .jjg-bar{height:5px}.jjg-other>span{color:#526484;font-size:20px;font-weight:400}' +
    '.jjg-btn{font:inherit;font-size:15px;font-weight:700;border:0;border-radius:4px;background:#D63556;color:#fff;min-height:50px;cursor:pointer;width:100%}' +
    '.jjg-btn:not(.ghost):not(:disabled):hover{background:#C22D4D}.jjg-btn:disabled{opacity:.45;cursor:not-allowed}.jjg-btn.ghost{background:#fff;color:#364A63;border:1px solid #DBDFEA;font-weight:600;min-height:40px;font-size:14px}' +
    '.jjg-btn:focus-visible,.jjg-step button:focus-visible{outline:3px solid rgba(233,65,98,.35);outline-offset:2px}' +
    '.jjg-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 8px}.jjg-step{display:flex;border:1px solid #DBDFEA;border-radius:4px;overflow:hidden;background:#fff}' +
    '.jjg-step button{font:inherit;font-size:18px;width:42px;height:40px;border:0;background:#F5F6FA;cursor:pointer;color:#364A63}.jjg-step span{width:44px;display:grid;place-items:center;font-weight:700}' +
    '.jjg-list{margin:0;padding:10px 12px 10px 28px;background:#F5F6FA;border-radius:4px;font-size:13px;color:#526484;display:grid;gap:2px}.jjg-err{color:#D4380D;font-size:13px}' +
    '.jjg-foot{font-size:11px;color:#526484;text-align:right}.jjg a{color:#C22D4D;font-weight:600}.jjg a:not(.jjg-other){display:inline-flex;align-items:center;min-height:44px}.jjg-other>div>span{overflow-wrap:anywhere}' +
    '.jjg-due{background:#FDECF0;color:#C22D4D;border-radius:4px;padding:10px 12px;font-weight:700}' +
    '.jjg-pulse{outline:3px solid #E94162!important;outline-offset:3px;border-radius:6px}';
  var HEART = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21c-.4 0-.7-.1-1-.4C7.4 17.5 3 14 3 9.5 3 6.9 5 5 7.4 5c1.8 0 3.3 1 4.1 2.3h1C13.3 6 14.8 5 16.6 5 19 5 21 6.9 21 9.5 21 14 16.6 17.5 13 20.6c-.3.3-.6.4-1 .4z"/></svg>';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var root = document.createElement('div'); root.className = 'jjg'; root.setAttribute('aria-live', 'polite');
  var anchorSel = script.getAttribute('data-anchor');
  var anchor = (anchorSel && document.querySelector(anchorSel)) || document.getElementById('jjim-gonggu');
  // 카페24 기본 스킨: 구매 버튼 영역(.xans-product-action) 바로 아래. 없으면 스크립트 자리(보통 페이지 끝)
  var actions = null;
  ['.xans-product-action', '.action_button', '#orderFixArea'].some(function (sel) { return !anchor && (actions = document.querySelector(sel)); });
  if (anchor) anchor.appendChild(root);
  else if (actions) actions.parentNode.insertBefore(root, actions.nextSibling);
  else script.parentNode.insertBefore(root, script.nextSibling);

  // a: '공구 열리면 알림 받기' (진행 중 공구가 없거나 지난 공구가 끝난 상품). 카페24 찜 대신 고객이 직접 신청한다. soldOut: 품절 상품만 알림 버튼 (#67)
  // others: 이 회원이 장바구니 · 찜 · 알림으로 초대받았거나 신청한 다른 상품의 공구 (#60)
  var state = { c: null, mine: null, qty: 1, step: 'view', err: '', busy: false, idem: null, a: null, soldOut: false, others: [] };
  var ALERTS = '/api/public/malls/' + encodeURIComponent(MALL) + '/products/' + productNo + '/alerts';

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (x) { if (x != null) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    return e;
  }
  function api(method, path, body, headers) {
    return fetch(API + path, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }

  var alertable = function () { return !state.c || state.c.state === 'failed' || state.c.state === 'settled' || state.c.state === 'cancelled'; };
  // 판매자가 취소한 공구(#65)는 신청했던 회원에게만 취소 안내로 보여 준다. 그 밖의 고객에게는 공구가 없는 상품처럼 보인다
  var shownCampaign = function () {
    var c = state.c, m = state.mine;
    return c && c.state === 'cancelled' && !(m && (m.state === 'campaign_cancelled' || m.state === 'pledged')) ? null : c;
  };
  // 알림 칸을 보여 줄지: 품절 상품이거나, 재고가 다시 생겼어도 이미 신청해 둔 회원(취소할 수 있게)
  var alertShown = function () { return !!state.a && (state.soldOut || state.a.mine); };

  // 로그인하고 돌아오면 하던 신청을 이어서 한다 (#15). 로그인 링크를 누를 때 같은 탭의 sessionStorage에 남기고, 돌아와 한 번 읽으면 지운다.
  // 카페24 로그인 페이지는 같은 쇼핑몰 주소라 같은 탭이면 남아 있다. 저장소가 막힌 브라우저에서는 지금처럼 처음 화면부터 보여 준다
  var RESUME = 'jjg-resume';
  function loginLink(what) {
    return el('a', { href: '/member/login.html?returnUrl=' + encodeURIComponent(location.pathname + location.search), onclick: function () {
      try { sessionStorage.setItem(RESUME, JSON.stringify({ mall: MALL, no: productNo, what: what, at: Date.now() })); } catch (e) { }
    } }, ['로그인하고 계속하기']);
  }
  function takeResume() {
    try {
      var r = JSON.parse(sessionStorage.getItem(RESUME) || 'null');
      sessionStorage.removeItem(RESUME);
      return r && r.mall === MALL && r.no === productNo && Date.now() - r.at < 30 * 60000 ? r.what : null;
    } catch (e) { return null; }
  }

  function load() {
    return api('GET', '/api/public/malls/' + encodeURIComponent(MALL) + '/products/' + productNo + '/campaign')
      .then(function (j) { state.c = j.campaign; }, function (e) { if (!e || e.error !== 'none') throw e; state.c = null; })
      .then(function () { return alertable() ? api('GET', ALERTS).then(function (j) { state.a = { waiting: j.waiting, mine: false }; state.soldOut = !!j.soldOut; }) : null; })
      .then(memberToken)
      .then(function (t) {
        var resume = takeResume();
        if (!t) return null;
        var jobs = [];
        if (state.a) jobs.push(api('POST', ALERTS + '/mine', { member_token: t }).then(function (j) { state.a = { waiting: j.waiting, mine: !!j.alert }; }).catch(function () { }));
        // 미달 공구도 '그래도 살래요'를 정할 수 있는 동안은 내 신청을 읽는다
        if (state.c && (!state.a || state.c.proceedOpen || state.c.state === 'cancelled')) jobs.push(api('POST', '/api/public/campaigns/' + state.c.id + '/pledges/mine', { member_token: t }).then(function (j) { state.mine = j.pledge; state.mineFailed = false; }).catch(function () { state.mineFailed = true; }));
        return Promise.all(jobs).then(function () { return resume; });
      })
      .then(function (resume) {
        // 이어서 하기: 아직 모집 중이고 신청 전이면 수량 폼을, 알림은 아직 신청 전이면 바로 신청한다. 이미 했거나 마감됐으면 상태만 보여 준다
        var form = resume === 'pledge' && state.c && state.c.state === 'open' && !(state.mine && state.mine.state === 'pledged');
        var notify = resume === 'alert' && state.a && state.soldOut && !state.a.mine;
        if (form) state.step = 'form';
        render();
        if (notify) alertOn();
        if (form || notify) root.scrollIntoView({ block: 'center' });
      })
      .catch(function () { root.remove(); });
  }

  // 공구 알림: 진행 중 공구가 없으면 이것만, 지난 공구가 끝났으면 결과 아래에 '다음 공구' 알림으로 붙인다.
  // 품절 상품에서는 재입고 알림처럼 말한다 (#67). 재고가 다시 생긴 상품은 이미 신청한 회원에게만 보인다(신청 완료 · 취소)
  function renderAlert(after) {
    var a = state.a;
    if (!after) {
      var badge = el('span', { class: 'jjg-badge' }, ['공구 알림']); badge.insertAdjacentHTML('afterbegin', HEART);
      root.appendChild(el('div', { class: 'jjg-top' }, [badge, a.waiting ? el('span', { class: 'jjg-muted' }, [a.waiting + '명이 기다리고 있어요']) : null]));
      root.appendChild(el('div', null, [el('b', null, [state.soldOut ? '품절된 상품이에요. 다시 만들 때 알려 드릴게요' : '공구 알림을 신청해 두셨어요'])]));
    }
    root.appendChild(el('div', { class: 'jjg-muted' }, [(after ? '다음 공동구매가 열리면' : '알림을 신청한 분이 모이면 판매자가 공동구매로 다시 만들 수 있어요. 열리면') + ' 할인가와 마감일을 문자로 알려 드려요. 지금 결제하지 않아요.']));
    if (a.mine) {
      root.appendChild(el('div', { class: 'jjg-row' }, [el('b', null, ['알림 신청 완료']), el('button', { class: 'jjg-btn ghost', style: 'width:auto;padding:0 14px', onclick: alertOff }, ['신청 취소'])]));
      root.appendChild(el('div', { class: 'jjg-muted' }, ['쇼핑몰 문자 수신을 거부해 두셨다면 알림을 받지 못할 수 있어요.']));
    } else if (state.step === 'login') {
      root.appendChild(el('div', null, ['회원만 신청할 수 있어요. ', loginLink('alert')]));
    } else {
      root.appendChild(el('button', { class: 'jjg-btn' + (after ? ' ghost' : ''), onclick: alertOn, disabled: state.busy ? '' : null }, [state.busy ? '신청 중…' : after ? '다음 공구 알림 받기' : '재입고 · 공구 알림 받기']));
    }
  }

  // 담아 둔 다른 상품의 공구 (#60): 모집 중이면 진행률 · 공구가, 쿠폰을 받았으면 결제 마감. 누르면 그 상품 페이지로
  function renderOthers() {
    var list = state.others;
    if (!list.length) return;
    var cart = list.every(function (x) { return x.source === 'cart' || x.source === 'both'; });
    var box = el('div', { class: 'jjg-others' }, [el('b', null, [(cart ? '장바구니에 담은' : '관심 두신') + ' 다른 상품도 공구 중이에요'])]);
    list.forEach(function (x) {
      var coupon = x.mine && x.mine.state === 'coupon_issued', pledged = x.mine && x.mine.state === 'pledged';
      var line = coupon ? '쿠폰 받음 · ' + when(x.payUntil) + '까지 결제'
        : (pledged ? '신청 완료 · ' : '') + x.pledgedQty + ' / ' + x.targetQty + '개 모임 · 공구가 ' + won(x.dealPrice);
      box.appendChild(el('a', { class: 'jjg-other', href: x.path }, [
        el('div', null, [el('span', null, [x.productName]), el('small', { class: coupon ? 'due' : null }, [line]),
          coupon ? null : el('div', { class: 'jjg-bar' }, [el('i', { style: 'width:' + Math.min(100, x.pledgedQty / x.targetQty * 100) + '%' })])]),
        el('span', { 'aria-hidden': 'true' }, ['›'])]));
    });
    root.appendChild(box);
  }

  function render() {
    var c = shownCampaign(), showAlert = alertShown(); root.textContent = ''; root.style.display = '';
    if (!c) {
      // 재고 있는 상품(공구 없음)에는 알림 버튼이 없다 (#67). 담아 둔 다른 상품의 공구가 있으면 그것만 보여 준다
      if (!showAlert && !state.others.length) { root.style.display = 'none'; return; }
      if (showAlert) renderAlert(false);
      renderOthers();
      if (state.err) root.appendChild(el('div', { class: 'jjg-err', role: 'alert' }, [state.err]));
      root.appendChild(el('div', { class: 'jjg-foot' }, ['찜꽁 예약 공동구매']));
      return;
    }
    var ok = c.pledgedQty >= c.targetQty;
    var bar = el('div', { class: 'jjg-bar' + (ok ? ' ok' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(c.targetQty), 'aria-valuenow': String(c.pledgedQty) }, [el('i', { style: 'width:' + Math.min(100, c.pledgedQty / c.targetQty * 100) + '%' })]);
    // 상태 이름표 (#10). 위젯은 앱 코드를 불러올 수 없어 이름표를 따로 둔다. 판매자 화면과 다르게 쓰는 것:
    // 목표 달성(초록) — 고객에게는 "쿠폰을 받았다"가 핵심이라 '달성 · 결제 기간' 대신 / 진행 안 됨(회색) — 고객을 놀라게 하지 않게 판매자 화면의 빨강 대신 /
    // 공동구매 종료 — 고객 입장의 말로 '확정 완료' 대신 / 그래도 진행 — 미달 뒤 판매자가 진행한 공구(#24) / 공동구매 취소(회색) — 판매자가 모집 중에 취소한 공구(#65)
    var label = c.proceeded && c.state === 'reached' ? ['그래도 진행', 'ok'] : { open: ['공동구매 모집 중', ''], reached: ['목표 달성', 'ok'], settled: ['공동구매 종료', 'ok'], failed: ['진행 안 됨', 'no'], cancelled: ['공동구매 취소', 'no'] }[c.state];
    var badge = el('span', { class: 'jjg-badge ' + label[1] }, [label[0]]); badge.insertAdjacentHTML('afterbegin', HEART);
    // 결제 기간에는 이미 지난 모집 마감 대신 결제 마감을 보여 준다
    var paying = c.state === 'reached' && c.payUntil;
    root.appendChild(el('div', { class: 'jjg-top' }, [badge, el('span', { class: 'jjg-muted' }, [paying ? '결제 마감 ' + when(c.payUntil) : c.state === 'cancelled' ? '' : when(c.deadlineAt) + ' 마감'])]));
    if (c.state === 'cancelled') {
      // 취소한 공구는 진행률 · 가격 없이 안내만. 품절 상품이면 다음 공구 알림을 붙인다
      root.appendChild(el('div', null, ['판매자 사정으로 공동구매가 취소됐어요. 결제된 금액은 없어요. 신청해 주셔서 감사해요.']));
      if (showAlert) renderAlert(true);
      renderOthers();
      if (state.err) root.appendChild(el('div', { class: 'jjg-err', role: 'alert' }, [state.err]));
      root.appendChild(el('div', { class: 'jjg-foot' }, ['찜꽁 예약 공동구매']));
      return;
    }
    root.appendChild(el('div', { class: 'jjg-row' }, [el('div', { class: 'jjg-cnt' }, [String(c.pledgedQty), el('small', null, [' / ' + c.targetQty + '개 모였어요'])]),
      el('div', { class: 'jjg-price' }, [el('s', null, [won(c.listPrice)]), el('b', null, [won(c.dealPrice)])])]));
    root.appendChild(bar);

    if (c.state === 'open') {
      root.appendChild(el('div', { class: 'jjg-muted' }, [(ok ? '목표를 채웠어요! 마감 후 ' + won(c.listPrice - c.dealPrice) + ' 할인 쿠폰을 드려요.' : (c.targetQty - c.pledgedQty) + '개 더 모이면 공구가로 살 수 있어요.') + ' 지금은 결제하지 않아요 · 예상 출고 ' + c.shipEta]));
      if (state.mine && state.mine.state === 'pledged') {
        root.appendChild(el('div', { class: 'jjg-row' }, [el('b', null, ['신청 완료 · ' + state.mine.qty + '개']), el('button', { class: 'jjg-btn ghost', style: 'width:auto;padding:0 14px', onclick: cancel }, ['신청 취소'])]));
        root.appendChild(el('div', { class: 'jjg-muted' }, ['마감 후 결과를 알려 드려요. 마감 전까지 언제든 취소할 수 있어요.']));
      } else if (state.mineFailed) {
        // 내 신청 조회가 실패하면(요청 제한 등) 신청 버튼 대신 다시 불러오기: 이미 신청한 고객에게 신청 버튼이 다시 보이지 않게 (#69)
        root.appendChild(el('div', { class: 'jjg-muted' }, ['내 신청 내역을 불러오지 못했어요. 잠시 뒤 다시 불러와 주세요.']));
        root.appendChild(el('button', { class: 'jjg-btn ghost', onclick: reloadMine, disabled: state.busy ? '' : null }, [state.busy ? '불러오는 중…' : '다시 불러오기']));
      } else if (state.step === 'login') {
        root.appendChild(el('div', null, ['회원만 참여할 수 있어요. ', loginLink('pledge')]));
      } else if (state.step === 'form') {
        root.appendChild(el('div', { class: 'jjg-row' }, [el('span', { class: 'jjg-muted' }, ['수량 (1인 최대 ' + c.perMemberLimit + '개)']),
          el('div', { class: 'jjg-step' }, [el('button', { 'aria-label': '수량 줄이기', onclick: function () { state.qty = Math.max(1, state.qty - 1); render(); } }, ['−']), el('span', null, [String(state.qty)]), el('button', { 'aria-label': '수량 늘리기', onclick: function () { state.qty = Math.min(c.perMemberLimit, state.qty + 1); render(); } }, ['+'])])]));
        root.appendChild(el('ul', { class: 'jjg-list' }, [el('li', null, [el('b', null, ['지금은 결제하지 않아요'])]), el('li', null, [c.targetQty + '개가 모이면 ' + won(c.listPrice - c.dealPrice) + ' 할인 쿠폰을 드려요. 쿠폰을 쓰면 ' + won(c.dealPrice) + '이에요']), el('li', null, ['쿠폰을 받은 뒤 ' + c.payWindowHours + '시간 안에 결제해 주세요']),el('li', null, ['못 모이면 진행 안 됨 안내만 드려요']), el('li', null, ['예상 출고 ' + c.shipEta])]));
        root.appendChild(el('button', { class: 'jjg-btn', onclick: submit, disabled: state.busy ? '' : null }, [state.busy ? '신청 중…' : state.qty + '개 신청하기']));
      } else {
        root.appendChild(el('button', { class: 'jjg-btn', onclick: start }, ['참여 신청 · 지금 결제 없음']));
      }
    } else if (c.state === 'reached') {
      var mine = state.mine;
      if (mine && mine.state === 'coupon_issued') {
        // 쿠폰 받은 회원: 기한을 강조하고, 쇼핑몰 구매 버튼으로 데려간다 (구매 버튼 자체는 바꾸지 않는다)
        var buy = buyButton();
        root.appendChild(el('div', null, ['회원님 계정에 ' + won(c.listPrice - c.dealPrice) + ' 할인 쿠폰을 넣어 드렸어요.']));
        root.appendChild(el('div', { class: 'jjg-due' }, [when(c.payUntil) + '까지 결제해 주세요']));
        if (buy) root.appendChild(el('button', { class: 'jjg-btn', onclick: function () { goBuy(buy); } }, ['쿠폰 쓰고 결제하러 가기']));
        root.appendChild(el('div', { class: 'jjg-muted' }, [(buy ? '구매 버튼' : '이 페이지의 구매 버튼') + '으로 주문하고, 주문서에서 ' + won(c.listPrice - c.dealPrice) + ' 할인 쿠폰을 골라 주세요.']));
      } else {
        root.appendChild(el('div', null, [mine && mine.state === 'paid' ? '결제를 마쳤어요. 예상 출고는 ' + c.shipEta + '이에요.'
          : c.proceeded ? '판매자가 그래도 진행하기로 해서, 원하신 분들께 쿠폰을 드렸어요.' : '목표를 달성해 신청하신 분들께 쿠폰을 드렸어요.']));
      }
    } else if (c.state === 'failed') {
      root.appendChild(el('div', null, ['목표에 못 미쳐 진행되지 않았어요. 결제된 금액은 없어요.']));
      // 미달 뒤 '그래도 살래요': 이 공구에 신청했던 회원만, 판매자가 정할 수 있는 동안만
      var m = state.mine;
      if (c.proceedOpen && m && m.state === 'still_wanted') {
        root.appendChild(el('div', { class: 'jjg-row' }, [el('b', null, ['그래도 살래요 · ' + m.qty + '개']), el('button', { class: 'jjg-btn ghost', style: 'width:auto;padding:0 14px', onclick: function () { stillWanted(false); } }, ['취소'])]));
        root.appendChild(el('div', { class: 'jjg-muted' }, ['판매자가 ' + when(c.proceedUntil) + '까지 진행 여부를 정해요. 진행하기로 하면 문자로 알려 드려요.']));
      } else if (c.proceedOpen && m && m.state === 'not_reached') {
        root.appendChild(el('div', { class: 'jjg-muted' }, ['수량이 적어도 사고 싶으시면 알려 주세요. 판매자가 보고 ' + when(c.proceedUntil) + '까지 진행 여부를 정해요. 지금은 결제하지 않아요.']));
        root.appendChild(el('button', { class: 'jjg-btn', onclick: function () { stillWanted(true); }, disabled: state.busy ? '' : null }, [state.busy ? '보내는 중…' : '그래도 살래요 · ' + m.qty + '개']));
      }
    } else {
      root.appendChild(el('div', null, ['공동구매가 끝났어요. 참여해 주셔서 감사합니다.']));
    }
    if (showAlert && !(c.state === 'failed' && c.proceedOpen && state.mine)) renderAlert(true); // '그래도 살래요'를 고르는 동안은 다음 공구 알림을 미룬다
    renderOthers();
    if (state.err) root.appendChild(el('div', { class: 'jjg-err', role: 'alert' }, [state.err]));
    root.appendChild(el('div', { class: 'jjg-foot' }, ['찜꽁 예약 공동구매']));
  }

  // 쇼핑몰 구매 버튼: 직접 표시(data-jjg-buy, 데모 · 직접 꾸민 스킨) → 카페24 기본 스킨 구매 버튼 → 구매 버튼 영역. 화면에 보이는 것만
  // VERIFY(P2): 테스트몰 기본 스킨의 구매 버튼 id · class 확인
  var BUY = ['[data-jjg-buy]', '#actionBuy', '.xans-product-action .btnSubmit', '.action_button .btnSubmit', '#orderFixArea .btnSubmit', '.xans-product-action', '.action_button'];
  function buyButton() {
    for (var i = 0; i < BUY.length; i++) {
      var b = document.querySelector(BUY[i]);
      if (b && !root.contains(b) && b.getClientRects().length) return b;
    }
    return null;
  }
  function goBuy(b) {
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    b.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    b.classList.add('jjg-pulse');
    setTimeout(function () { b.classList.remove('jjg-pulse'); }, 2400);
    try { b.focus({ preventScroll: true }); } catch (e) { }
  }

  function start() { memberToken().then(function (t) { state.step = t ? 'form' : 'login'; state.err = ''; render(); }); }
  function submit() {
    if (state.busy) return;
    state.busy = true; state.err = ''; state.idem = state.idem || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    render();
    memberToken().then(function (t) {
      return api('POST', '/api/public/campaigns/' + state.c.id + '/pledges', { member_token: t, qty: state.qty }, { 'Idempotency-Key': state.idem });
    }).then(function (j) { state.c = j.campaign; state.mine = j.pledge; state.step = 'view'; state.idem = null; })
      .catch(function (e) { state.err = (e && e.message) || '신청하지 못했어요. 다시 시도해 주세요.'; })
      .then(function () { state.busy = false; render(); });
  }
  function cancel() {
    memberToken().then(function (t) { return api('DELETE', '/api/public/campaigns/' + state.c.id + '/pledges/mine', { member_token: t }); })
      .then(function (j) { state.c = j.campaign; state.mine = null; state.step = 'view'; })
      .catch(function (e) { state.err = (e && e.message) || '취소하지 못했어요.'; })
      .then(render);
  }
  function reloadMine() {
    if (state.busy) return;
    state.busy = true; state.err = ''; render();
    memberToken().then(function (t) { return api('POST', '/api/public/campaigns/' + state.c.id + '/pledges/mine', { member_token: t }); })
      .then(function (j) { state.c = j.campaign; state.mine = j.pledge; state.mineFailed = false; })
      .catch(function (e) { state.err = (e && e.message) || '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'; })
      .then(function () { state.busy = false; render(); });
  }

  function stillWanted(want) {
    if (state.busy) return;
    state.busy = true; state.err = ''; render();
    memberToken().then(function (t) { return api(want ? 'POST' : 'DELETE', '/api/public/campaigns/' + state.c.id + '/still-wanted', { member_token: t }); })
      .then(function (j) { state.c = j.campaign; state.mine = j.pledge; })
      .catch(function (e) { state.err = (e && e.message) || (want ? '보내지 못했어요. 다시 시도해 주세요.' : '취소하지 못했어요.'); })
      .then(function () { state.busy = false; render(); });
  }

  function alertOn() {
    if (state.busy) return;
    state.busy = true; state.err = ''; render();
    memberToken().then(function (t) {
      if (!t) { state.step = 'login'; return; }
      return api('POST', ALERTS, { member_token: t }).then(function (j) { state.a = { waiting: j.waiting, mine: !!j.alert }; state.step = 'view'; });
    }).catch(function (e) { state.err = (e && e.message) || '신청하지 못했어요. 다시 시도해 주세요.'; })
      .then(function () { state.busy = false; render(); });
  }
  function alertOff() {
    memberToken().then(function (t) { return api('DELETE', ALERTS + '/mine', { member_token: t }); })
      .then(function (j) { state.a = { waiting: j.waiting, mine: false }; })
      .catch(function (e) { state.err = (e && e.message) || '취소하지 못했어요.'; })
      .then(render);
  }

  // 담아 둔 다른 상품의 공구 (#60): 위젯을 그린 뒤 로그인 회원만 한 번 묻는다. 실패하면 이 칸만 안 보인다
  function loadOthers() {
    return memberToken().then(function (t) {
      if (!t || !root.isConnected) return;
      return api('POST', '/api/public/malls/' + encodeURIComponent(MALL) + '/campaigns/mine', { member_token: t, exclude: productNo })
        .then(function (j) { state.others = j.campaigns || []; render(); });
    }).catch(function () { });
  }

  load().then(loadOthers);
  setInterval(function () {
    if (!state.c || state.c.state !== 'open' || state.step === 'form') return;
    api('GET', '/api/public/campaigns/' + state.c.id + '/progress').then(function (j) { state.c = j.campaign; render(); }).catch(function () { });
  }, 30000);
})();
