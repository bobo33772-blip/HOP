/* 찜꽁 상품 페이지 위젯 (의존성 없음). 쇼핑몰 상품 상세에 스크립트 태그로 들어간다.
 * 설치 시 서버가 카페24 스크립트태그로 넣는다: <script src="https://APP/widget.js?mall=MALL_ID&client_id=CLIENT_ID"></script>
 * 고객 화면에는 진행률과 '결제 없는 참여 신청'만 보여 주고, 기존 구매 버튼은 건드리지 않는다.
 * 진행 중인 공구가 없으면 '공구 열리면 알림 받기'를 보여 준다 (카페24 찜 조회 권한 없이 수요를 모으는 경로). */
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
  var when = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
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

  // 쇼핑몰 스킨과 어울리도록 흰 바탕 · 얇은 테두리, 브랜드 로즈는 하트·진행률에만
  var css = '.jjg{font:14px/1.55 "Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;letter-spacing:-.01em;color:#17171C;border:1px solid #E6E3DD;border-radius:16px;padding:16px;margin:14px 0;background:#fff;display:grid;gap:10px;max-width:520px;box-shadow:0 1px 2px rgba(23,23,28,.04),0 6px 20px rgba(23,23,28,.06);text-align:left}' +
    '.jjg *{box-sizing:border-box}.jjg-top{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12.5px}' +
    '.jjg-badge{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#E0245E;background:#FDEAF0;border-radius:99px;padding:3px 10px 3px 8px}.jjg-badge svg{width:13px;height:13px}' +
    '.jjg-badge.ok{color:#0F9F6E;background:#E3F6EE}.jjg-badge.no{color:#8A8791;background:#F0EEE9}.jjg-muted{color:#6B6973;font-size:12.5px}' +
    '.jjg-cnt{font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.15}.jjg-cnt small{font-size:13.5px;font-weight:500;color:#6B6973}' +
    '.jjg-price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.jjg-price b{font-size:17px;color:#E0245E}.jjg-price s{color:#8A8791;font-size:13px}' +
    '.jjg-bar{height:8px;border-radius:99px;background:#F0EEE9;overflow:hidden}.jjg-bar i{display:block;height:100%;min-width:8px;background:linear-gradient(90deg,#FF5C7A,#E0245E);border-radius:99px;transition:width .5s}.jjg-bar.ok i{background:#0F9F6E}' +
    '.jjg-btn{font:inherit;font-size:15px;font-weight:700;border:0;border-radius:12px;background:#17171C;color:#fff;min-height:50px;cursor:pointer;width:100%}' +
    '.jjg-btn:disabled{opacity:.45;cursor:not-allowed}.jjg-btn.ghost{background:#fff;color:#17171C;border:1px solid #E6E3DD;font-weight:600;min-height:40px;font-size:14px}' +
    '.jjg-btn:focus-visible,.jjg-step button:focus-visible{outline:3px solid rgba(224,36,94,.35);outline-offset:2px}' +
    '.jjg-row{display:flex;justify-content:space-between;align-items:center;gap:8px}.jjg-step{display:flex;border:1px solid #E6E3DD;border-radius:10px;overflow:hidden;background:#fff}' +
    '.jjg-step button{font:inherit;font-size:18px;width:42px;height:40px;border:0;background:#F6F5F2;cursor:pointer;color:#17171C}.jjg-step span{width:44px;display:grid;place-items:center;font-weight:700}' +
    '.jjg-list{margin:0;padding:10px 12px 10px 28px;background:#F6F5F2;border-radius:12px;font-size:13px;color:#55535C;display:grid;gap:2px}.jjg-err{color:#D4380D;font-size:13px}' +
    '.jjg-foot{font-size:11px;color:#A3A1A9;text-align:right}.jjg a{color:#E0245E;font-weight:600}';
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

  // a: '공구 열리면 알림 받기' (진행 중 공구가 없거나 지난 공구가 끝난 상품). 카페24 찜 대신 고객이 직접 신청한다
  var state = { c: null, mine: null, qty: 1, step: 'view', err: '', busy: false, idem: null, a: null };
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

  var alertable = function () { return !state.c || state.c.state === 'failed' || state.c.state === 'settled'; };

  function load() {
    return api('GET', '/api/public/malls/' + encodeURIComponent(MALL) + '/products/' + productNo + '/campaign')
      .then(function (j) { state.c = j.campaign; }, function (e) { if (!e || e.error !== 'none') throw e; state.c = null; })
      .then(function () { return alertable() ? api('GET', ALERTS).then(function (j) { state.a = { waiting: j.waiting, mine: false }; }) : null; })
      .then(memberToken)
      .then(function (t) {
        if (!t) return null;
        if (state.a) return api('POST', ALERTS + '/mine', { member_token: t }).then(function (j) { state.a = { waiting: j.waiting, mine: !!j.alert }; }).catch(function () { });
        return api('POST', '/api/public/campaigns/' + state.c.id + '/pledges/mine', { member_token: t }).then(function (j) { state.mine = j.pledge; }).catch(function () { });
      })
      .then(render)
      .catch(function () { root.remove(); });
  }

  // 공구 알림: 진행 중 공구가 없으면 이것만, 지난 공구가 끝났으면 결과 아래에 '다음 공구' 알림으로 붙인다
  function renderAlert(after) {
    var a = state.a;
    if (!after) {
      var badge = el('span', { class: 'jjg-badge' }, ['공구 알림']); badge.insertAdjacentHTML('afterbegin', HEART);
      root.appendChild(el('div', { class: 'jjg-top' }, [badge, a.waiting ? el('span', { class: 'jjg-muted' }, [a.waiting + '명이 기다리고 있어요']) : null]));
      root.appendChild(el('div', null, [el('b', null, ['이 상품, 공동구매 할인가로 사고 싶다면'])]));
    }
    root.appendChild(el('div', { class: 'jjg-muted' }, [(after ? '다음 공동구매가 열리면' : '알림을 신청해 두면 공동구매가 열릴 때') + ' 할인가와 마감일을 문자로 알려 드려요. 지금 결제하지 않아요.']));
    if (a.mine) {
      root.appendChild(el('div', { class: 'jjg-row' }, [el('b', null, ['알림 신청 완료']), el('button', { class: 'jjg-btn ghost', style: 'width:auto;padding:0 14px', onclick: alertOff }, ['신청 취소'])]));
      root.appendChild(el('div', { class: 'jjg-muted' }, ['쇼핑몰 문자 수신을 거부해 두셨다면 알림을 받지 못할 수 있어요.']));
    } else if (state.step === 'login') {
      root.appendChild(el('div', null, ['회원만 신청할 수 있어요. ', el('a', { href: '/member/login.html?returnUrl=' + encodeURIComponent(location.pathname + location.search) }, ['로그인하고 계속하기'])]));
    } else {
      root.appendChild(el('button', { class: 'jjg-btn' + (after ? ' ghost' : ''), onclick: alertOn, disabled: state.busy ? '' : null }, [state.busy ? '신청 중…' : after ? '다음 공구 알림 받기' : '공구 열리면 알림 받기']));
    }
  }

  function render() {
    var c = state.c; root.textContent = '';
    if (!c && !state.a) { root.remove(); return; }
    if (!c) {
      renderAlert(false);
      if (state.err) root.appendChild(el('div', { class: 'jjg-err', role: 'alert' }, [state.err]));
      root.appendChild(el('div', { class: 'jjg-foot' }, ['찜꽁 예약 공동구매']));
      return;
    }
    var ok = c.pledgedQty >= c.targetQty;
    var bar = el('div', { class: 'jjg-bar' + (ok ? ' ok' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(c.targetQty), 'aria-valuenow': String(c.pledgedQty) }, [el('i', { style: 'width:' + Math.min(100, c.pledgedQty / c.targetQty * 100) + '%' })]);
    var label = { open: ['공동구매 진행 중', ''], reached: ['목표 달성', 'ok'], settled: ['공동구매 종료', 'ok'], failed: ['진행 안 됨', 'no'] }[c.state];
    var badge = el('span', { class: 'jjg-badge ' + label[1] }, [label[0]]); badge.insertAdjacentHTML('afterbegin', HEART);
    root.appendChild(el('div', { class: 'jjg-top' }, [badge, el('span', { class: 'jjg-muted' }, [when(c.deadlineAt) + ' 마감'])]));
    root.appendChild(el('div', { class: 'jjg-row' }, [el('div', { class: 'jjg-cnt' }, [String(c.pledgedQty), el('small', null, [' / ' + c.targetQty + '개 모였어요'])]),
      el('div', { class: 'jjg-price' }, [el('s', null, [won(c.listPrice)]), el('b', null, [won(c.dealPrice)])])]));
    root.appendChild(bar);

    if (c.state === 'open') {
      root.appendChild(el('div', { class: 'jjg-muted' }, [(ok ? '목표를 채웠어요! 마감 후 공구가 쿠폰을 드려요.' : (c.targetQty - c.pledgedQty) + '개 더 모이면 공구가로 살 수 있어요.') + ' 지금은 결제하지 않아요 · 예상 출고 ' + c.shipEta]));
      if (state.mine && state.mine.state === 'pledged') {
        root.appendChild(el('div', { class: 'jjg-row' }, [el('b', null, ['신청 완료 · ' + state.mine.qty + '개']), el('button', { class: 'jjg-btn ghost', style: 'width:auto;padding:0 14px', onclick: cancel }, ['신청 취소'])]));
        root.appendChild(el('div', { class: 'jjg-muted' }, ['마감 후 결과를 알려 드려요. 마감 전까지 언제든 취소할 수 있어요.']));
      } else if (state.step === 'login') {
        root.appendChild(el('div', null, ['회원만 참여할 수 있어요. ', el('a', { href: '/member/login.html?returnUrl=' + encodeURIComponent(location.pathname + location.search) }, ['로그인하고 계속하기'])]));
      } else if (state.step === 'form') {
        root.appendChild(el('div', { class: 'jjg-row' }, [el('span', { class: 'jjg-muted' }, ['수량 (1인 최대 ' + c.perMemberLimit + '개)']),
          el('div', { class: 'jjg-step' }, [el('button', { 'aria-label': '수량 줄이기', onclick: function () { state.qty = Math.max(1, state.qty - 1); render(); } }, ['−']), el('span', null, [String(state.qty)]), el('button', { 'aria-label': '수량 늘리기', onclick: function () { state.qty = Math.min(c.perMemberLimit, state.qty + 1); render(); } }, ['+'])])]));
        root.appendChild(el('ul', { class: 'jjg-list' }, [el('li', null, [el('b', null, ['지금은 결제하지 않아요'])]), el('li', null, [c.targetQty + '개가 모이면 ' + won(c.dealPrice) + ' 쿠폰을 드려요. 쿠폰을 받으면 정해진 기간 안에 결제해 주세요']), el('li', null, ['못 모이면 진행 안 됨 안내만 드려요']), el('li', null, ['예상 출고 ' + c.shipEta])]));
        root.appendChild(el('button', { class: 'jjg-btn', onclick: submit, disabled: state.busy ? '' : null }, [state.busy ? '신청 중…' : state.qty + '개 신청하기']));
      } else {
        root.appendChild(el('button', { class: 'jjg-btn', onclick: start }, ['참여 신청 · 지금 결제 없음']));
      }
    } else if (c.state === 'reached') {
      var mine = state.mine;
      root.appendChild(el('div', null, [mine && mine.state === 'paid' ? '결제를 마쳤어요. 예상 출고는 ' + c.shipEta + '이에요.'
        : mine && mine.state === 'coupon_issued' ? '회원님 계정에 ' + won(c.listPrice - c.dealPrice) + ' 할인 쿠폰을 넣어 드렸어요. ' + when(c.payUntil) + '까지 결제해 주세요.'
        : '목표를 달성해 신청하신 분들께 쿠폰을 드렸어요.']));
    } else if (c.state === 'failed') {
      root.appendChild(el('div', null, ['목표에 못 미쳐 진행되지 않았어요. 결제된 금액은 없어요.']));
    } else {
      root.appendChild(el('div', null, ['공동구매가 끝났어요. 참여해 주셔서 감사합니다.']));
    }
    if (state.a) renderAlert(true);
    if (state.err) root.appendChild(el('div', { class: 'jjg-err', role: 'alert' }, [state.err]));
    root.appendChild(el('div', { class: 'jjg-foot' }, ['찜꽁 예약 공동구매']));
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

  load();
  setInterval(function () {
    if (!state.c || state.c.state !== 'open' || state.step === 'form') return;
    api('GET', '/api/public/campaigns/' + state.c.id + '/progress').then(function (j) { state.c = j.campaign; render(); }).catch(function () { });
  }, 30000);
})();
