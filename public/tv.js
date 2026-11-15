/* Giant Tour de Sip - TV screen. Written in plain old ES5 on purpose so it runs on
 * smart TV browsers (Samsung Tizen, LG webOS, Android TV, Fire TV...). */
(function () {
  'use strict';
  var COLS = 13, X0 = 4.9, CW = 5.18, Y0 = 5.3, CH = 9.3; // 13 houses per stage, 4 stages
  var info = null, code = '', es = null, state = null;
  var shown = {};          // pid -> tile index currently drawn (for step animation)
  var lobbyCount = 0, overShown = false, modalKey = '', lastMoveSeq = 0, lastToastSeq = 0, animating = false, deadline = 0, firstState = true;
  var tileNames = { sip: 'SIP', give: 'GIVE', card: 'CARD', vote: 'VOTE', trust: 'BREAK', duel: 'DUEL', number: 'GEAR?', all: 'ALL', fwd: 'PROPEL', back: 'FLAT', water: 'WATER', start: 'START', finish: 'FINISH',
    rule: 'RULE', dicedrink: 'ROLL+SIP', mystery: 'PICK 1', reflex: 'BELL', rps: 'R-P-S', least: 'LAST', meeting: 'MEETING', ohno: 'OH NO!' };
  function amt(n) { return n + (n === 1 ? ' sip' : ' sips'); }
  function drinkTxt(d) { return amt(d.n); }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fit() { // 1rem = 1% of the largest 16:9 box that fits the screen
    var w = window.innerWidth, h = window.innerHeight;
    document.documentElement.style.fontSize = Math.min(w / 100, h / 56.25) + 'px';
  }
  window.onresize = fit; fit();

  function xhr(method, url, cb) {
    var r = new XMLHttpRequest();
    r.open(method, url, true);
    r.onreadystatechange = function () {
      if (r.readyState !== 4) return;
      var data = null; try { data = JSON.parse(r.responseText); } catch (e) {}
      cb(r.status, data);
    };
    r.send(method === 'POST' ? '{}' : null);
  }
  function P(id) { for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i]; return null; }
  function pic(p) { return '<div class="pic"><img class="av" src="/assets/avatar-' + p.avatar + '.svg"></div>'; }

  // ---------- boot ----------
  xhr('GET', '/api/info', function (st, data) {
    info = data; buildBoard();
    var want = (location.hash || '').replace('#', '').toUpperCase();
    if (want) xhr('GET', '/api/room?room=' + want, function (s) { if (s === 200) connect(want); else createRoom(); });
    else createRoom();
  });
  function createRoom() { xhr('POST', '/api/create', function (st, d) { if (d && d.code) connect(d.code); else setTimeout(createRoom, 2000); }); }
  function connect(c) {
    code = c; location.hash = c; firstState = true;
    var base = location.protocol + '//' + location.host;
    if (/^(localhost|127\.0\.0\.1)/.test(location.host) && info.lan) base = info.lan;
    var url = base + '/p?r=' + code;
    $('qr').src = $('qr2').src = '/api/qr?text=' + encodeURIComponent(url);
    $('joinurl').innerHTML = esc(base.replace(/^https?:\/\//, '') + '/p');
    $('rulesurl').innerHTML = esc(base.replace(/^https?:\/\//, '') + '/rules');
    $('code').innerHTML = $('code2').innerHTML = code;
    if (es) es.close();
    es = new EventSource('/api/stream?room=' + code);
    es.onopen = function () { $('offline').style.display = 'none'; };
    es.onmessage = function (e) { $('offline').style.display = 'none'; onState(JSON.parse(e.data)); };
    es.onerror = function () {
      $('offline').style.display = 'block';
      if (es.readyState === 2) setTimeout(function () { // closed for good: room may be gone (server restarted)
        xhr('GET', '/api/room?room=' + code, function (s) { if (s === 404) createRoom(); else if (s === 200) connect(code); else setTimeout(es.onerror, 2000); });
      }, 1500);
    };
  }

  // ---------- board ----------
  function tileXY(i) {
    var row = Math.floor(i / COLS), c = i % COLS, col = row % 2 === 0 ? c : COLS - 1 - c;
    return { x: X0 + col * CW, y: Y0 + row * CH };
  }
  function roadSvg() { // one continuous road under the houses, so the route is obvious
    var n = info.board.length, rows = Math.ceil(n / COLS), d = '', arrows = '', r, a, b;
    for (r = 0; r < rows; r++) {
      a = tileXY(r * COLS); b = tileXY(Math.min(n - 1, r * COLS + COLS - 1));
      d += (r === 0 ? 'M' + a.x * 10 + ' ' + a.y * 10 : '') + 'L' + b.x * 10 + ' ' + b.y * 10;
      if (r < rows - 1) {
        var nx = tileXY((r + 1) * COLS), out = (r % 2 === 0 ? 1 : -1) * 62, mx = b.x * 10 + out * 0.75, my = (b.y + nx.y) * 5;
        d += 'C' + (b.x * 10 + out) + ' ' + b.y * 10 + ' ' + (nx.x * 10 + out) + ' ' + nx.y * 10 + ' ' + nx.x * 10 + ' ' + nx.y * 10;
        arrows += '<path d="M' + (mx - 9) + ' ' + (my - 7) + 'L' + mx + ' ' + (my + 7) + 'L' + (mx + 9) + ' ' + (my - 7) + '" fill="none" stroke="#ffc857" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    }
    return '<svg id="road" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 372"><path d="' + d + '" fill="none" stroke="#2b3d62" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#1a2947" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#7fa3d9" stroke-width="2" stroke-dasharray="7 9"/>' + arrows + '</svg>';
  }
  function buildBoard() {
    var html = roadSvg(), i, rows = Math.ceil(info.board.length / COLS);
    for (i = 0; i < rows; i++) {
      var ltr = i % 2 === 0;
      html += '<div class="stage ' + (ltr ? 'ltr' : 'rtl') + '" style="top:' + (Y0 + i * CH - 4.75) + 'rem">' + (ltr ? '' : '<b>&laquo;&laquo;</b> ') + esc(info.stages[i] || '') + (ltr ? ' <b>&raquo;&raquo;</b>' : '') + '</div>';
    }
    for (i = 0; i < info.board.length; i++) {
      var t = info.board[i], xy = tileXY(i);
      html += '<div class="tile t-' + t.type + '" id="tile' + i + '" style="left:' + (xy.x - 2.25) + 'rem;top:' + (xy.y - 2.9) + 'rem">' +
        '<div class="num">' + (i || '') + '</div><div class="ic"><img src="/assets/icon-' + t.type + '.svg"></div><div class="lab">' + tileNames[t.type] + (t.n ? ' ' + (t.type === 'back' ? '-' : t.type === 'fwd' ? '+' : '') + t.n : '') + '</div></div>';
    }
    $('board').innerHTML = html + '<div id="tokens"></div><div id="stepn"></div>';
  }
  function setT(el, v) { el.style.webkitTransform = v; el.style.transform = v; }
  function restart(el, cls) { el.className = el.className.replace(' ' + cls, ''); void el.offsetWidth; el.className += ' ' + cls; }
  function placeTokens() {
    var groups = {}, i, p;
    for (i = 0; i < state.players.length; i++) { p = state.players[i]; if (shown[p.id] === undefined) shown[p.id] = p.pos; (groups[shown[p.id]] = groups[shown[p.id]] || []).push(p); }
    var box = $('tokens');
    for (i = 0; i < state.players.length; i++) {
      p = state.players[i];
      var el = $('tok' + p.id);
      if (!el) { el = document.createElement('div'); el.id = 'tok' + p.id; el.className = 'token'; el.innerHTML = '<img class="av" src="/assets/avatar-' + p.avatar + '.svg"><span class="tn">' + esc(p.name) + '</span>'; box.appendChild(el); }
      var g = groups[shown[p.id]], k = g.indexOf(p), xy = tileXY(shown[p.id]), dx = 0, dy = 0;
      if (g.length > 1) { var a = (Math.PI * 2 * k) / g.length - Math.PI / 2, rad = g.length > 4 ? 1.9 : 1.5; dx = Math.cos(a) * rad; dy = Math.sin(a) * rad; }
      el.style.left = (xy.x + dx) + 'rem'; el.style.top = (xy.y + dy) + 'rem';
      var keep = (el.className.indexOf(' hop') >= 0 ? ' hop' : '') + (el.className.indexOf(' jump') >= 0 ? ' jump' : '');
      el.className = 'token' + (g.length > 2 ? ' small' : '') + (p.id === state.activeId ? ' active' : '') + (p.connected ? '' : ' away') + (p.out ? ' out' : '') + keep;
    }
    var act = P(state.activeId), hereIdx = act && state.phase !== 'lobby' ? shown[act.id] : -1;
    for (i = 0; i < info.board.length; i++) {
      var te = $('tile' + i);
      var cn = 'tile t-' + info.board[i].type + (groups[i] ? ' occ' : '') + (i === hereIdx ? ' here' : '') + (te.className.indexOf(' land') >= 0 ? ' land' : '');
      if (te.className !== cn) te.className = cn;
    }
  }

  // ----- confetti for the winner -----
  var COLORS = ['#ffc857', '#7fb6ff', '#2f6fe0', '#c5cfe2', '#ffffff'];
  function confetti(n) {
    var fx = $('fx'), frag = document.createElement('div');
    for (var i = 0; i < n; i++) {
      var c = document.createElement('i'), d = 1.6 + Math.random() * 1.6;
      c.style.left = (Math.random() * 98) + 'rem'; c.style.background = COLORS[i % COLORS.length];
      c.style.width = (0.5 + Math.random() * 0.7) + 'rem'; c.style.height = (0.8 + Math.random() * 0.9) + 'rem';
      c.style.webkitAnimationDuration = d + 's'; c.style.animationDuration = d + 's';
      c.style.webkitAnimationDelay = (Math.random() * 0.5) + 's'; c.style.animationDelay = c.style.webkitAnimationDelay;
      frag.appendChild(c);
    }
    fx.appendChild(frag);
    setTimeout(function () { if (frag.parentNode) frag.parentNode.removeChild(frag); }, 4200);
  }
  setInterval(function () { if (state && state.phase === 'gameover') confetti(40); }, 2600);

  // ----- 3D dice -----
  var PIP = { 1: [[50, 50]], 2: [[27, 27], [73, 73]], 3: [[27, 27], [50, 50], [73, 73]], 4: [[27, 27], [73, 27], [27, 73], [73, 73]], 5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]], 6: [[27, 24], [73, 24], [27, 50], [73, 50], [27, 76], [73, 76]] };
  var FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  (function buildCube() {
    var html = '';
    for (var n = 1; n <= 6; n++) {
      html += '<div class="face f' + n + '">';
      for (var k = 0; k < PIP[n].length; k++) html += '<i style="left:' + PIP[n][k][0] + '%;top:' + PIP[n][k][1] + '%"' + (n === 1 ? ' class="one"' : '') + '></i>';
      html += '</div>';
    }
    $('cube').innerHTML = html;
  })();
  function rollCube(value, done) {
    var cube = $('cube'), box = $('dicebox'), r = FACE_ROT[value];
    cube.style.webkitTransition = 'none'; cube.style.transition = 'none';
    setT(cube, 'rotateX(' + (r[0] - 700 - Math.random() * 200) + 'deg) rotateY(' + (r[1] - 500 - Math.random() * 300) + 'deg) rotateZ(' + (Math.random() * 80 - 40) + 'deg)');
    restart(box, 'throw');
    setTimeout(function () {
      cube.style.webkitTransition = '-webkit-transform 1.3s cubic-bezier(0.15, 0.65, 0.2, 1)';
      cube.style.transition = 'transform 1.3s cubic-bezier(0.15, 0.65, 0.2, 1)';
      setT(cube, 'rotateX(' + r[0] + 'deg) rotateY(' + r[1] + 'deg) rotateZ(0deg)');
    }, 40);
    setTimeout(function () { restart(box, 'landed'); done(); }, 1400);
  }
  function animateMove(mv, withDie) {
    animating = true;
    var p = P(mv.pid), roll = state.roll || { value: mv.to - mv.from }, wrap = $('dicewrap'), label = $('dielabel');
    var tok = function () { return $('tok' + mv.pid); };
    function steps() {
      wrap.className = '';
      if (mv.to === mv.from) return done();
      if (mv.jump || mv.to < mv.from) {
        var el = tok(); if (el) el.className += ' jump';
        shown[mv.pid] = mv.to; placeTokens();
        setTimeout(function () { var e2 = tok(); if (e2) e2.className = e2.className.replace(' jump', ''); done(); }, 1000); return;
      }
      var cur = mv.from, n = 0, cnt = $('stepn');
      (function next() {
        if (cur >= mv.to) return setTimeout(done, 350);
        cur++; n++; shown[mv.pid] = cur; placeTokens();
        var el = tok(); if (el) restart(el, 'hop');
        var xy = tileXY(cur); cnt.style.left = xy.x + 'rem'; cnt.style.top = xy.y + 'rem'; cnt.innerHTML = n; cnt.style.display = 'block'; restart(cnt, 'pop');
        setTimeout(next, 650);
      })();
    }
    function done() {
      animating = false; $('stepn').style.display = 'none';
      var el = tok(); if (el) el.className = el.className.replace(' hop', '');
      var t = $('tile' + mv.to); if (t) { restart(t, 'land'); setTimeout(function () { t.className = t.className.replace(' land', ''); }, 700); }
      render();
    }
    if (!withDie) return steps();
    wrap.className = 'on';
    label.className = ''; label.innerHTML = esc(p.name) + (roll.loaded ? ' uses E+ BOOST' : ' rolls...');
    rollCube(roll.value, function () {
      label.innerHTML = esc(p.name) + ' rolled a <b>' + roll.value + '</b>!'; restart(label, 'pop');
      setTimeout(steps, 950);
    });
  }

  // ---------- state ----------
  function onState(s) {
    state = s;
    deadline = s.timeLeft ? Date.now() + s.timeLeft : 0;
    var i;
    if (firstState) { // just (re)connected: do not replay old animations
      firstState = false; shown = {};
      lastMoveSeq = s.move ? s.move.seq : 0;
      lastToastSeq = s.toasts.length ? s.toasts[s.toasts.length - 1].seq : 0;
    }
    for (i = 0; i < s.toasts.length; i++) if (s.toasts[i].seq > lastToastSeq) { lastToastSeq = s.toasts[i].seq; if (s.phase !== 'lobby' && s.phase !== 'gameover') { toast(s.toasts[i]); } }
    if (s.phase === 'lobby') shown = {};
    if (s.move && s.move.seq > lastMoveSeq) {
      var withDie = !s.move.jump;
      lastMoveSeq = s.move.seq;
      for (i = 0; i < s.players.length; i++) if (s.players[i].id !== s.move.pid) shown[s.players[i].id] = s.players[i].pos;
      shown[s.move.pid] = s.move.from;
      render();
      animateMove(s.move, withDie);
      return;
    }
    if (!animating) for (i = 0; i < s.players.length; i++) shown[s.players[i].id] = s.players[i].pos;
    render();
  }
  function toast(t) {
    var el = document.createElement('div');
    var cardIcons = { shield: 1, mirror: 1, potato: 1, half: 1, loaded: 1, swap: 1, thief: 1, double: 1, skip: 1 };
    var img = cardIcons[t.icon] ? '/assets/card-' + t.icon + '.svg' : t.icon === 'fwd' || t.icon === 'back' || t.icon === 'rule' || t.icon === 'cantine' ? '/assets/icon-' + t.icon + '.svg' : '/assets/logo.svg';
    el.innerHTML = '<div class="toast"><img src="' + img + '">' + esc(t.text) + '</div>';
    var box = $('toasts');
    while (box.childNodes.length >= 3) box.removeChild(box.firstChild);
    box.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4200);
  }
  setInterval(function () {
    var el = $('timer'); if (!el || !state) return;
    var left = Math.ceil((deadline - Date.now()) / 1000);
    el.innerHTML = (deadline && left > 0 && left <= 30 && (state.phase === 'prompt' || state.phase === 'react' || state.phase === 'roll')) ? left + 's' : '';
  }, 250);

  // ---------- rendering ----------
  function show(id) { var ids = ['lobby', 'game', 'over']; for (var i = 0; i < ids.length; i++) $(ids[i]).style.display = ids[i] === id ? 'block' : 'none'; }
  function render() {
    var s = state; if (!s) return;
    if (s.phase === 'lobby') { show('lobby'); return renderLobby(); }
    if (s.phase === 'gameover') { show('over'); $('toasts').innerHTML = ''; return renderOver(); }
    overShown = false;
    show('game');
    placeTokens(); renderScores(); renderBanner(); renderRules();
    var m = $('modal');
    if (animating || s.phase === 'roll' || s.phase === 'moving') { m.style.display = 'none'; modalKey = ''; return; }
    var html = s.phase === 'prompt' ? promptHtml() : s.phase === 'react' ? reactHtml() : s.phase === 'result' ? resultHtml() : '';
    var key = html ? s.phase + (s.prompt ? s.prompt.type + s.prompt.step : '') + (s.result ? s.result.title : '') : '';
    $('modalCard').innerHTML = html; m.style.display = html ? 'block' : 'none';
    if (key && key !== modalKey) { restart($('modalCard'), 'pop'); restart(m, 'fade'); }
    modalKey = key;
  }
  function renderLobby() {
    var s = state, html = '', i;
    for (i = 0; i < 8; i++) {
      var p = s.players[i];
      html += p ? '<div class="lp' + (i === s.players.length - 1 && s.players.length > lobbyCount ? ' new' : '') + '">' + pic(p) + esc(p.name) + (p.host ? '<span class="tagh">HOST</span>' : '') + '</div>' : '<div class="lp empty">waiting for player...</div>';
    }
    $('lobbyPlayers').innerHTML = html; lobbyCount = s.players.length;
    $('count').innerHTML = s.players.length + '/8';
    var host = s.players[0];
    $('lobbyHint').innerHTML = !host ? 'Grab your phone and scan the code!' : s.players.length < 2 ? 'One more player needed...' : esc(host.name) + ', press START on your phone when everyone is in!';
  }
  function renderScores() {
    var html = '', s = state;
    for (var i = 0; i < s.players.length; i++) {
      var p = s.players[i];
      html += '<div class="sc' + (p.id === s.activeId ? ' active' : '') + (p.connected ? '' : ' away') + '">' + pic(p) +
        '<div class="nm">' + esc(p.name) + '</div><div class="st">House <b>' + p.pos + '</b><img src="/assets/icon-sip.svg"><b>' + p.sips + '</b><img class="cb" src="/assets/card-back.svg"><b>' + p.cards + '</b>' + (p.out === 'cantine' ? ' <i>in the Cantine</i>' : p.out ? ' <i>sick leave</i>' : p.connected ? '' : ' away') + '</div></div>';
    }
    $('scores').innerHTML = html;
  }
  function renderRules() {
    var s = state, total = s.rules.length + s.custom.length, html = '<div class="rt">RULES IN PLAY' + (total ? ' (' + total + ')' : '') + '</div>', i;
    if (!total) html += '<div class="rnone">No rules yet. Land on a RULE house or draw a rule card to make one. It will apply to everyone.</div>';
    html += '<div class="' + (total > 6 ? 'rl tight' : 'rl') + '">';
    for (i = 0; i < s.rules.length; i++) { var r = info.rules[s.rules[i]]; html += '<div class="rule"><b>' + esc(r.name) + '</b>' + esc(r.text) + '</div>'; }
    for (i = 0; i < s.custom.length; i++) html += '<div class="rule own"><b>' + esc(s.custom[i].by) + '\'s rule</b>' + esc(s.custom[i].text) + '</div>';
    $('rules').innerHTML = html + '</div>';
  }
  function renderBanner() {
    var s = state, a = P(s.activeId); if (!a) return;
    var txt = '<b>' + esc(a.name) + '</b>';
    if (s.phase === 'roll') txt += a.connected ? ', your turn! <span>Roll the dice on your phone</span>' : ' <span>is away, skipping...</span>';
    else txt += '<span>is playing</span>';
    $('banner').innerHTML = pic(a) + txt;
  }
  function chips(ids, need) {
    var html = '<div class="chips">';
    for (var i = 0; i < ids.length; i++) {
      var p = P(ids[i]); if (!p) continue;
      var waiting = need.indexOf(p.id) >= 0;
      html += '<div class="chip' + (waiting ? ' wait' : '') + '">' + pic(p) + (waiting ? '' : '<div class="ok">&#10003;</div>') + esc(p.name) + '</div>';
    }
    return html + '</div>';
  }
  function head(icon, title, text, extra) {
    var h = '<img class="m-icon" src="/assets/icon-' + icon + '.svg"><div class="m-title">' + esc(title) + '</div>';
    if (text) h += '<div class="m-text' + (text.length > 60 ? ' long' : '') + '">' + esc(text) + '</div>';
    if (extra) for (var i = 0; i < extra.length; i++) h += '<div class="m-extra">' + esc(extra[i]) + '</div>';
    return h;
  }
  function promptHtml() {
    var s = state, pr = s.prompt, by = P(pr.by), all = [], i;
    for (i = 0; i < s.players.length; i++) if (s.players[i].connected) all.push(s.players[i].id);
    var title = info.tiles[pr.type].name;
    switch (pr.type) {
      case 'give': return head('give', title, pr.text) + '<div class="m-sub">' + esc(by.name) + ' is choosing victims in secret...</div>';
      case 'vote': return head('vote', pr.poll ? 'Round poll' : title, pr.text) + chips(all, pr.need) + '<div class="m-sub">Vote in secret on your phone. Most votes drinks ' + pr.n + '.</div>';
      case 'deck':
        var em = pr.deck === 'meeting';
        return '<div class="dwrap"><div class="dcard"><img class="dt" src="/assets/deck/title-' + (em ? 'em' : 'on') + '.jpg"><div class="dx">' + esc(pr.card.text) + '</div><img class="da" src="/assets/deck/' + pr.card.art + '.jpg"><div class="de">' + esc(pr.card.effect) + '</div></div>' +
          '<div class="dside">' + pic(by) + '<div class="m-title">' + esc(by.name) + '</div><div class="m-text long">draws ' + (em ? 'an Emergency Meeting' : 'an Oh No') + ' card</div><div class="m-sub">' + esc(by.name) + ', tap CONTINUE on your phone.</div></div></div>';
      case 'pair': return head('all', 'Celebrate', pr.text);
      case 'joke':
        var crowd = []; for (i = 0; i < all.length; i++) if (all[i] !== pr.by) crowd.push(all[i]);
        return head('meeting', 'Very boring meeting...', pr.text) + chips(crowd, pr.need) + '<div class="m-sub">Who laughs, drinks 1. If nobody laughs, ' + esc(by.name) + ' drinks 2.</div>';
      case 'push': return head('fwd', title, pr.text);
      case 'rule': return head('rule', title, pr.text) + '<div class="m-sub">Pick a rule or write your own. It applies to everybody, ' + esc(by.name) + ' included.</div>';
      case 'reflex': return head('reflex', title, pr.text) + chips(all, pr.need);
      case 'dicedrink':
        var dv = pr.dice[pr.by];
        return '<div class="m-title">' + esc(title) + '</div><div class="duel"><div class="d">' + pic(by) + esc(by.name) + (dv ? '<img class="dd" src="/assets/dice-' + dv + '.svg">' : '<div class="m-sub" style="margin-top:3rem">tap to roll...</div>') + '</div></div><div class="m-sub">' + (dv ? esc(by.name) + ' drinks ' + amt(pr.half ? Math.ceil(dv / 2) : dv) + '.' : esc(pr.half ? 'One sip for every two.' : 'Whatever comes up is what you drink.')) + '</div>';
      case 'mystery':
        var cards = '<div class="myst">', pics = { drink: 'icon-sip', give: 'icon-give', again: 'dice-5' };
        for (i = 0; i < 3; i++) cards += pr.picked === i ? '<div class="mc open"><img src="/assets/' + pics[pr.outcome] + '.svg"></div>' : '<div class="mc' + (pr.picked !== null ? ' dim' : '') + '"><img src="/assets/card-back.svg"></div>';
        return '<div class="m-title">' + esc(title) + '</div><div class="m-text long">' + esc(pr.text) + '</div>' + cards + '</div><div class="m-sub">One card says drink, one says make someone drink, one says roll again.</div>';
      case 'rps':
        if (pr.step === 'pick') return head('rps', title, pr.text);
        return head('rps', title, pr.text) + chips([pr.by, pr.opp], pr.need) + '<div class="m-sub">Loser drinks 2. A draw means both drink.</div>';
      case 'number':
        if (pr.step === 'pick') return head('number', title, pr.text) + '<div class="m-sub">Guess right and ' + esc(by.name) + ' drinks. Guess wrong and you drink.</div>';
        var guessers = []; for (i = 0; i < all.length; i++) if (all[i] !== pr.by) guessers.push(all[i]);
        return head('number', title, pr.text) + chips(guessers, pr.need);
      case 'trust':
        if (pr.step === 'pick') return head('trust', title, pr.text) + '<div class="m-sub">Both ride together: everyone else drinks. One attacks: the other drinks 3. Both attack: both drink 2.</div>';
        return head('trust', title, pr.text) + chips([pr.by, pr.opp], pr.need);
      case 'duel':
        if (pr.step === 'pick') return head('duel', title, pr.text);
        var d = function (id) { var p = P(id), v = pr.dice[id]; return '<div class="d">' + pic(p) + esc(p.name) + (v ? '<img class="dd" src="/assets/dice-' + v + '.svg">' : '<div class="m-sub" style="margin-top:3rem">tap to roll...</div>') + '</div>'; };
        return '<div class="m-title">Sprint duel</div><div class="duel">' + d(pr.by) + '<div class="vs">VS</div>' + d(pr.opp) + '</div><div class="m-sub">Lowest roll drinks the difference.</div>';
    }
    return '';
  }
  function reactHtml() {
    var s = state, c = s.ctx || {}, html = head(c.icon || 'sip', c.title || 'Sips incoming', c.text, c.extra) + '<div class="rows' + (s.pending.length > 3 ? ' many' : '') + '">';
    for (var i = 0; i < s.pending.length; i++) {
      var e = s.pending[i], p = P(e.to), from = e.from ? P(e.from) : null;
      var status = e.blocked ? 'BLOCKED!' : e.passed ? 'passed it on' : e.done ? 'accepted' : 'deciding...';
      html += '<div class="row' + (e.blocked ? ' block' : e.passed ? ' pass' : '') + '">' + pic(p) + esc(p.name) + ': <span class="n">' + amt(e.blocked ? e.was : e.n) + '</span>' +
        (from ? ' from ' + esc(from.name) : '') + '<span class="r">' + status + '</span></div>';
    }
    return html + '</div><div class="m-sub">Got a card? Now is the time to play it.</div>';
  }
  function resultHtml() {
    var s = state, r = s.result, html = head(r.icon || 'sip', r.title, r.text, r.extra), i;
    if (r.plays && r.plays.length) {
      for (i = 0; i < r.plays.length; i++) {
        var pl = r.plays[i], who = P(pl.pid), tg = pl.target ? P(pl.target) : null;
        html += '<div class="m-extra">' + esc(who.name) + ' played ' + esc(info.cards[pl.card].name) + (tg ? ' on ' + esc(tg.name) : '') + '</div>';
      }
    }
    if (r.drinks && r.drinks.length) {
      html += '<div class="rows' + (r.drinks.length > 3 ? ' many' : '') + '">';
      for (i = 0; i < r.drinks.length && i < 8; i++) { var d = r.drinks[i], p = P(d.pid); html += '<div class="row big">' + pic(p) + esc(p.name) + ' drinks <span class="n">' + drinkTxt(d) + '</span></div>'; }
      
      html += '</div>';
    } else if (r.safe) html += '<div class="safe">Nobody drinks this time.</div>';
    return html;
  }
  function renderOver() {
    var s = state, w = P(s.winner), ps = s.players.slice();
    function top(key, low) { var b = ps[0]; for (var i = 1; i < ps.length; i++) if (low ? ps[i][key] < b[key] : ps[i][key] > b[key]) b = ps[i]; return b; }
    function award(t, p, d) { return '<div class="award"><div class="t">' + t + '</div>' + pic(p) + '<div class="n">' + esc(p.name) + '</div><div class="d">' + d + '</div></div>'; }
    var a = top('sips'), b = top('given'), c = top('played'), d = top('sips', true);
    if (!overShown) confetti(90);
    overShown = true;
    $('over').innerHTML = '<img class="overlogo" src="/assets/logo.svg" alt=""><h1>STAGE WINNER</h1><div class="wpic"><img class="av" src="/assets/avatar-' + w.avatar + '.svg"></div><div class="wname">' + esc(w.name) + '</div>' +
      '<div class="wsub">' + esc(w.name) + ' makes a toast. Everybody raise your glass and drink!</div><div class="awards">' +
      award('Thirstiest rider', a, a.sips + ' sips') + award('Best domestique', b, b.given + ' sips handed out') + award('Card shark', c, c.played + ' cards played') + award('Untouchable', d, 'only ' + d.sips + ' sips') +
      '</div><div class="again">' + esc(s.players[0].name) + ' can start a new game from the phone.</div>';
  }
})();
