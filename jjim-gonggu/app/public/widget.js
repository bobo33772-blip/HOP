/* 찜 공구 상품 페이지 위젯 (의존성 없음). 쇼핑몰 상품 상세에 스크립트 태그로 들어간다.
 * <script src="https://APP/widget.js?mall=MALL_ID" data-product-no="102" defer></script>
 * 고객 화면에는 진행률과 '결제 없는 참여 신청'만 보여 주고, 기존 구매 버튼은 건드리지 않는다. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var src = new URL(script.src, location.href);
  var API = src.origin;
  var MALL = src.searchParams.get('mall');
  var productNo = Number(script.getAttribute('data-product-no') || window.iProductNo || new URLSearchParams(location.search).get('product_no') || (location.pathname.match(/\/(\d+)\/?(?:category|display)?/) || [])[1]);
  if (!MALL || !productNo) return;

  var won = function (n) { return Math.round(n).toLocaleString('ko-KR') + '원'; };
  var when = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  };

  // 로그인 회원의 암호화 회원 ID. 쇼핑몰이 JJIM_MEMBER_TOKEN을 제공하면 그것을 쓴다.
  // VERIFY(P2): 카페24 Front SDK(CAFE24API.getEncryptedMemberId) 호출 방식은 테스트몰에서 확정한다.
  function memberToken() {
    if (typeof window.JJIM_MEMBER_TOKEN === 'function') return Promise.resolve(window.JJIM_MEMBER_TOKEN());
    return new Promise(function (resolve) {
      try {
        if (window.CAFE24API && window.CAFE24API.getEncryptedMemberId) {
          window.CAFE24API.getEncryptedMemberId(script.getAttribute('data-client-id'), function (err, res) { resolve(err ? null : (res && (res.member_id || res.id)) || null); });
        } else resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  var css = '.jjg{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#16233F;border:1.5px solid #2F5BEA;border-radius:14px;padding:14px;margin:14px 0;background:#F6F8FF;display:grid;gap:8px;max-width:520px}' +
    '.jjg *{box-sizing:border-box}.jjg-top{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12.5px}' +
    '.jjg-badge{font-weight:700;color:#2F5BEA}.jjg-badge.ok{color:#0B8A63}.jjg-badge.no{color:#C92A2A}.jjg-muted{color:#5B6680;font-size:12.5px}' +
    '.jjg-cnt{font:700 22px ui-monospace,Menlo,monospace}.jjg-cnt small{font:500 13px inherit;color:#5B6680}' +
    '.jjg-bar{height:10px;border-radius:5px;background:#DCE3F5;overflow:hidden}.jjg-bar i{display:block;height:100%;background:#2F5BEA;border-radius:5px}.jjg-bar.ok i{background:#12B886}' +
    '.jjg-btn{font:inherit;font-size:15px;font-weight:700;border:0;border-radius:12px;background:#2F5BEA;color:#fff;min-height:48px;cursor:pointer;width:100%}' +
    '.jjg-btn:disabled{background:#C9D0DD;cursor:not-allowed}.jjg-btn.ghost{background:#fff;color:#16233F;border:1.5px solid #C9D0DD;font-weight:600;min-height:42px}' +
    '.jjg-btn:focus-visible{outline:3px solid rgba(47,91,234,.45);outline-offset:2px}' +
    '.jjg-row{display:flex;justify-content:space-between;align-items:center;gap:8px}.jjg-step{display:flex;border:1.5px solid #C9D0DD;border-radius:10px;overflow:hidden;background:#fff}' +
    '.jjg-step button{font:inherit;font-size:18px;width:42px;height:40px;border:0;background:#EEF1F7;cursor:pointer}.jjg-step span{width:44px;display:grid;place-items:center;font-weight:700}' +
    '.jjg-list{margin:0;padding:10px 12px 10px 28px;background:#fff;border-radius:10px;font-size:13px;color:#3B4660}.jjg-err{color:#C92A2A;font-size:13px}' +
    '.jjg a{color:#2F5BEA;font-weight:600}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var root = document.createElement('div'); root.className = 'jjg'; root.setAttribute('aria-live', 'polite');
  var anchorSel = script.getAttribute('data-anchor');
  var anchor = (anchorSel && document.querySelector(anchorSel)) || document.getElementById('jjim-gonggu');
  if (anchor) anchor.appendChild(root); else script.parentNode.insertBefore(root, script.nextSibling);

  var state = { c: null, mine: null, qty: 1, step: 'view', err: '', busy: false, idem: null };

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

  function load() {
    return api('GET', '/api/public/malls/' + encodeURIComponent(MALL) + '/products/' + productNo + '/campaign')
      .then(function (j) { state.c = j.campaign; return memberToken(); })
      .then(function (t) { if (!t || !state.c) return null; return api('POST', '/api/public/campaigns/' + state.c.id + '/pledges/mine', { member_token: t }).then(function (j) { state.mine = j.pledge; }).catch(function () { }); })
      .then(render)
      .catch(function () { root.remove(); });
  }

  function render() {
    var c = state.c; root.textContent = '';
    if (!c) { root.remove(); return; }
    var ok = c.pledgedQty >= c.targetQty;
    var bar = el('div', { class: 'jjg-bar' + (ok ? ' ok' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(c.targetQty), 'aria-valuenow': String(c.pledgedQty) }, [el('i', { style: 'width:' + Math.min(100, c.pledgedQty / c.targetQty * 100) + '%' })]);
    var label = { open: ['공동구매 진행 중', ''], reached: ['목표 달성', 'ok'], settled: ['공동구매 종료', 'ok'], failed: ['진행 안 됨', 'no'] }[c.state];
    root.appendChild(el('div', { class: 'jjg-top' }, [el('span', { class: 'jjg-badge ' + label[1] }, ['● ' + label[0]]), el('span', { class: 'jjg-muted' }, [when(c.deadlineAt) + ' 마감'])]));
    root.appendChild(el('div', { class: 'jjg-cnt' }, [String(c.pledgedQty), el('small', null, [' / ' + c.targetQty + '개 모였어요'])]));
    root.appendChild(bar);

    if (c.state === 'open') {
      root.appendChild(el('div', { class: 'jjg-muted' }, [(ok ? '목표를 채웠어요. 마감 후 쿠폰을 드려요.' : (c.targetQty - c.pledgedQty) + '개 더 모이면 ' + won(c.dealPrice) + ' (정가 ' + won(c.listPrice) + ')') + ' · 지금은 결제하지 않아요 · 예상 출고 ' + c.shipEta]));
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
    if (state.err) root.appendChild(el('div', { class: 'jjg-err', role: 'alert' }, [state.err]));
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

  load();
  setInterval(function () {
    if (!state.c || state.c.state !== 'open' || state.step === 'form') return;
    api('GET', '/api/public/campaigns/' + state.c.id + '/progress').then(function (j) { state.c = j.campaign; render(); }).catch(function () { });
  }, 30000);
})();
