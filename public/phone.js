/* Giant Tour de Sip - phone controller */
(function () {
  'use strict';
  const app = document.getElementById('app'), sheet = document.getElementById('sheet'), errBox = document.getElementById('err');
  const qs = new URLSearchParams(location.search);
  let info = null, state = null, es = null, session = null;
  let join = { room: (qs.get('r') || '').toUpperCase().slice(0, 4), name: '', avatar: -1, taken: [] };
  let local = { key: '', alloc: {} };   // unsent choices for the current prompt
  let openCard = null, menuOpen = false, lastBuzz = '', ownRule = '', lastKey = '';

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const av = (p) => `<img src="/assets/avatar-${p.avatar}.svg" alt="">`;
  const P = (id) => state.players.find(p => p.id === id);
  const me = () => P(state.me.id);
  const sips = (n) => n + (n === 1 ? ' sip' : ' sips');
  const others = () => state.players.filter(p => p.id !== state.me.id);
  const hitBody = (n) => `<div class="n">${n}</div><div>${n === 1 ? 'sip' : 'sips'}</div>`;
  const deckCard = (pr) => `<div class="dcard"><img class="dt" src="/assets/deck/title-${pr.deck === 'meeting' ? 'em' : 'on'}.jpg" alt=""><div class="dx">${esc(pr.card.text)}</div><img class="da" src="/assets/deck/${pr.card.art}.jpg" alt=""><div class="de">${esc(pr.card.effect)}</div></div>`;

  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })));
  }
  function showErr(msg) { errBox.textContent = msg; errBox.hidden = false; clearTimeout(showErr.t); showErr.t = setTimeout(() => { errBox.hidden = true; }, 2600); }
  function act(m) {
    if (navigator.vibrate) navigator.vibrate(15);
    api('/api/act', Object.assign({ room: session.room, token: session.token }, m)).then(r => { if (!r.ok) showErr(r.d.error || 'Oops'); }).catch(() => showErr('No connection'));
  }
  function saveSession(s) { session = s; try { s ? localStorage.setItem('giantsip', JSON.stringify(s)) : localStorage.removeItem('giantsip'); } catch (e) {} }

  // ---------- boot ----------
  api('/api/info').then(r => {
    info = r.d;
    let saved = null; try { saved = JSON.parse(localStorage.getItem('giantsip')); } catch (e) {}
    if (saved && (!join.room || join.room === saved.room)) { session = saved; connect(); } else renderJoin();
  });
  function connect() {
    if (es) es.close();
    es = new EventSource(`/api/stream?room=${session.room}&token=${session.token}`);
    es.onmessage = (e) => { state = JSON.parse(e.data); render(); };
    es.onerror = () => {
      if (es.readyState !== 2) return; // browser retries on its own
      api(`/api/me?room=${session.room}&token=${session.token}`).then(r => {
        if (r.status === 404 || r.status === 403) { join.room = r.status === 403 ? session.room : ''; saveSession(null); state = null; renderJoin(); }
        else setTimeout(connect, 1500);
      }).catch(() => setTimeout(connect, 2000));
    };
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session && es && es.readyState === 2) connect(); });

  // ---------- join screen ----------
  function refreshTaken() {
    if (join.room.length !== 4) return;
    api('/api/room?room=' + join.room).then(r => { join.taken = r.ok ? r.d.taken : []; if (join.taken.includes(join.avatar)) join.avatar = -1; if (!state) paintAvatars(); });
  }
  function paintAvatars() {
    const box = document.getElementById('avs'); if (!box) return;
    if (join.avatar < 0) join.avatar = [0, 1, 2, 3, 4, 5, 6, 7].filter(a => !join.taken.includes(a))[0];
    box.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map(a => `<button data-a="avatar" data-v="${a}" class="${a === join.avatar ? 'sel' : ''} ${join.taken.includes(a) ? 'taken' : ''}">${av({ avatar: a })}${esc(info.bikes[a])}</button>`).join('');
  }
  function renderJoin() {
    app.innerHTML = `<div class="join">
      <img class="logo" src="/assets/logo.svg" alt=""><h1>GIANT <span>TOUR DE SIP</span></h1>
      <label>Room code (on the TV)</label><input id="room" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(join.room)}" placeholder="ABCD">
      <label>Your name</label><input id="name" maxlength="12" autocomplete="off" value="${esc(join.name)}" placeholder="Nickname">
      <label>Pick your rider</label><div class="avs" id="avs"></div>
      <button class="btn pink" data-a="join">JOIN THE RIDE</button>
      <p class="fine">For adults of legal drinking age. A sip can be any drink, water included. Skip a sip whenever you want. <a href="/rules">Read the rules</a></p></div>`;
    paintAvatars(); refreshTaken();
    document.getElementById('room').oninput = (e) => { join.room = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); e.target.value = join.room; refreshTaken(); };
    document.getElementById('name').oninput = (e) => { join.name = e.target.value; };
  }
  function doJoin() {
    if (join.room.length !== 4) return showErr('Enter the 4-letter room code from the TV');
    if (!join.name.trim()) return showErr('Enter your name');
    api('/api/join', { room: join.room, name: join.name, avatar: join.avatar }).then(r => {
      if (!r.ok) return showErr(r.d.error || 'Could not join');
      saveSession({ room: r.d.code, token: r.d.token });
      history.replaceState(null, '', '/p?r=' + r.d.code);
      connect();
      try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
    }).catch(() => showErr('No connection'));
  }

  // ---------- game screens ----------
  function buzz(key, pattern) { if (key !== lastBuzz) { lastBuzz = key; if (navigator.vibrate) navigator.vibrate(pattern); } }
  function turnKey() { return (state.move ? state.move.seq : 0) + ':' + (state.prompt ? state.prompt.type + state.prompt.step : state.phase); }
  function myPending() { return (state.pending || []).filter(e => e.to === state.me.id && !e.done); }
  function canPlay(cardId) {
    const c = info.cards[cardId];
    if (c.when === 'auto') return false;
    if (c.when === 'turn') return state.phase === 'roll' && state.activeId === state.me.id && !(cardId === 'double' && state.me.double);
    const mine = myPending();
    return state.phase === 'react' && mine.length > 0 && (cardId !== 'mirror' || mine.some(e => e.from));
  }
  const pickList = (action, extra) => others().map(p => `<button class="btn pl" data-a="${action}" data-v="${p.id}" ${extra || ''}>${av(p)}<span>${esc(p.name)}</span></button>`).join('');
  const locked = (txt) => `<img class="icon" src="/assets/card-back.svg" style="width:54px;height:76px"><h2>${txt}</h2><p>Your answer is hidden. Watch the TV!</p>`;
  const watch = (title, sub) => `<h2>${title}</h2><p>${sub || 'Watch the TV.'}</p>`;

  function panel() {
    const s = state, m = me(), active = P(s.activeId), mine = s.activeId === m.id, host = s.players[0];
    switch (s.phase) {
      case 'lobby':
        return `<img class="bigav" src="/assets/avatar-${m.avatar}.svg"><h2 class="yl">You're in, ${esc(m.name)}!</h2>
          <div class="plist">${s.players.map(p => `<div>${av(p)}${esc(p.name)}</div>`).join('')}</div>` +
          (m.host ? `<button class="btn pink" data-a="start" ${s.players.length < 2 ? 'disabled' : ''}>${s.players.length < 2 ? 'WAITING FOR PLAYERS...' : 'START THE GAME'}</button>` : `<p>Waiting for ${esc(host.name)} to start the game.</p>`) +
          `<button class="btn ghost small" data-a="leave">Leave</button>`;
      case 'roll':
        if (mine) { buzz('turn' + turnKey(), [80, 60, 80]); return `<h2 class="yl">Your turn!</h2><button class="rollbtn" data-a="roll"><img src="/assets/dice-5.svg">ROLL</button>${m.rolled ? '' : '<div class="secret">First roll: take a sip before you roll!</div>'}${m.double ? '<div class="secret">OverDrive is armed</div>' : ''}<p>Or play a glowing card first.</p>`; }
        return `<img class="bigav" src="/assets/avatar-${active.avatar}.svg">` + watch(esc(active.name) + "'s turn", 'Get your drink ready.') + (m.out ? `<div><span class="out">${m.out === 'cantine' ? 'You are in the Cantine' : 'You are on sick leave'}: you miss your next turn</span></div>` : '');
      case 'moving':
        return `<img class="icon" src="/assets/dice-${s.roll ? s.roll.value : 1}.svg">` + watch(esc(active.name) + ' rolled ' + (s.roll ? s.roll.value : ''), s.roll && s.roll.notes && s.roll.notes.length ? esc(s.roll.notes.join(' ')) : undefined);
      case 'prompt': return promptPanel();
      case 'react': {
        const mineP = myPending();
        if (!mineP.length) return watch('Sips are flying...', 'Waiting for the others to decide.');
        const n = mineP.reduce((a, e) => a + e.n, 0), from = mineP.map(e => e.from && P(e.from).name).filter(Boolean);
        buzz('hit' + mineP.map(e => e.id).join(), [150, 80, 150]);
        const react = s.me.hand.filter((c, i) => s.me.hand.indexOf(c) === i && canPlay(c));
        return `<div class="hit"><div>INCOMING${from.length ? ' from ' + esc(from.join(' & ')) : ''}</div>${hitBody(n)}</div>
          <button class="btn" data-a="accept">OK, I'LL DRINK</button>` +
          (react.length ? `<p>...or save yourself:</p>` + react.map(c => `<button class="btn teal small" data-a="open" data-v="${s.me.hand.indexOf(c)}">Play ${esc(info.cards[c].name)}</button>`).join('') : '');
      }
      case 'result': {
        const r = s.result, d = (r.drinks || []).find(x => x.pid === m.id);
        const next = (mine || m.host) ? `<button class="btn ghost" data-a="next">NEXT TURN</button>` : '';
        if (d) return `<div class="hit"><div>DRINK</div>${hitBody(d.n)}</div><p>${esc(r.text || '')}</p>` + next;
        if (r.drinks && r.drinks.length) return `<div class="hit safe"><div class="n" style="font-size:40px">SAFE</div><div>Not you this time</div></div>` + next;
        return `<img class="icon" src="/assets/icon-${r.icon || 'start'}.svg">` + watch(esc(r.title || ''), esc(r.text || '')) + next;
      }
      case 'gameover': {
        const w = P(s.winner);
        return `<img class="bigav" src="/assets/avatar-${w.avatar}.svg"><h2 class="yl">${w.id === m.id ? 'YOU WIN!' : esc(w.name) + ' wins!'}</h2>
          <div class="secret">${w.id === m.id ? 'Make a toast!' : esc(w.name) + ' makes a toast.'} Everybody drinks!</div>
          <p>You took ${sips(m.sips)}, handed out ${m.given} and played ${m.played} card${m.played === 1 ? '' : 's'}.</p>` +
          (m.host ? `<button class="btn pink" data-a="start">PLAY AGAIN</button><button class="btn ghost small" data-a="lobby">Back to lobby</button>` : `<p>${esc(host.name)} can start a new game.</p>`);
      }
    }
    return '';
  }
  function promptPanel() {
    const s = state, pr = s.prompt, m = me(), by = P(pr.by), need = pr.need.includes(m.id);
    const icon = `<img class="icon" src="/assets/icon-${pr.type}.svg">`;
    const nums = (n, a) => `<div class="nums">${Array.from({ length: n }, (_, i) => `<button data-a="${a}" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    if (need) buzz('p' + turnKey(), 60);
    switch (pr.type) {
      case 'give': {
        if (!need) return icon + watch(esc(by.name) + ' is handing out ' + sips(pr.n), 'Look innocent.');
        const key = turnKey(); if (local.key !== key) local = { key, alloc: {} };
        const left = pr.n - Object.values(local.alloc).reduce((a, b) => a + b, 0);
        return `<h2 class="yl">Hand out ${sips(pr.n)}${pr.doubled ? ' (doubled!)' : ''}</h2><p>${left ? left + ' left to give. Nobody sees until you send.' : 'All set!'}</p>` +
          others().map(p => `<div class="give">${av(p)}<span>${esc(p.name)}</span><button data-a="alloc" data-v="${p.id}" data-d="-1">&minus;</button><b>${local.alloc[p.id] || 0}</b><button data-a="alloc" data-v="${p.id}" data-d="1">+</button></div>`).join('') +
          `<button class="btn pink" data-a="sendgive" ${left ? 'disabled' : ''}>SEND THE SIPS</button>`;
      }
      case 'vote':
        if (!need) return locked('Vote locked in');
        return `${icon}<div class="q">${esc(pr.text)}</div><p>Secret vote. Most votes drinks ${pr.n}.</p>` + pickList('answer');
      case 'deck':
        return deckCard(pr) + (need ? `<button class="btn pink" data-a="answer">CONTINUE</button>` : `<p>${esc(by.name)} drew this card.</p>`);
      case 'pair':
        if (!need) return icon + watch(esc(by.name) + ' is picking a colleague', 'To celebrate with a drink.');
        return `${icon}<h2 class="yl">Celebrate!</h2><p>Pick one colleague. You both drink ${sips(pr.n)}.</p>` + pickList('answer');
      case 'joke':
        if (pr.by === m.id) return `<img class="icon" src="/assets/icon-meeting.svg"><h2 class="yl">Tell a joke!</h2><p>Out loud, now. If nobody laughs you drink 2. Everyone who laughs drinks 1.</p>`;
        if (!need) return locked('Answer locked in');
        return `<img class="icon" src="/assets/icon-meeting.svg"><div class="q">${esc(by.name)} is telling a joke. Did you laugh?</div><div class="two"><button class="btn pink" data-a="answer" data-b="1">I LAUGHED</button><button class="btn teal" data-a="answer" data-b="0">NOT FUNNY</button></div><p>Who laughs, drinks 1. Be honest!</p>`;
      case 'push':
        if (!need) return `<img class="icon" src="/assets/icon-fwd.svg">` + watch('Lead-out', esc(pr.text));
        return `<img class="icon" src="/assets/icon-fwd.svg"><h2 class="yl">You rolled a 3</h2><p>Rule: you stay put. Who moves 3 houses forward?</p>` + pickList('answer');
      case 'rule':
        if (!need) return icon + watch(esc(by.name) + ' is making a rule', 'It will apply to everyone.');
        return `${icon}<h2 class="yl">Make a rule</h2><p>It applies to everyone, you included.</p>` +
          pr.options.map(r => `<button class="btn rulebtn" data-a="answer" data-v="${r}"><b>${esc(info.rules[r].name)}</b><small>${esc(info.rules[r].text)}</small></button>`).join('') +
          (pr.canCustom ? `<div class="own"><p>...or write your own house rule:</p><input id="ownrule" maxlength="80" autocomplete="off" placeholder="e.g. Drink with your left hand" value="${esc(ownRule)}"><button class="btn pink small" data-a="ownrule">MAKE MY RULE</button></div>` : '');
      case 'dicedrink':
        if (need) return `<h2 class="yl">Roll and sip</h2><p>${pr.half ? 'One sip for every two you roll.' : 'You drink whatever you roll.'}</p><button class="rollbtn" data-a="answer"><img src="/assets/dice-3.svg">ROLL</button>`;
        return icon + watch('Roll and sip', pr.dice && pr.dice[pr.by] ? esc(by.name) + ' rolled ' + pr.dice[pr.by] + '.' : esc(pr.text));
      case 'mystery':
        if (pr.step === 'pick' && need) return `<h2 class="yl">Pick a card</h2><p>One makes you drink, one lets you choose who drinks, one gives you another roll.</p>
          <div class="three">${[0, 1, 2].map(i => `<button data-a="answer" data-v="${i}"><img src="/assets/card-back.svg" alt=""></button>`).join('')}</div>`;
        if (pr.step === 'target' && need) return `${icon}<h2 class="yl">Make someone drink</h2><p>Who takes 2 sips?</p>` + pickList('answer');
        return icon + watch('Pick a card', esc(pr.text));
      case 'reflex':
        if (need) return `<h2 class="yl">BELL LAP!</h2><button class="rollbtn tap" data-a="answer">TAP!</button><p>Last one to tap drinks 2.</p>`;
        return icon + watch('Phew, you made it', 'Waiting for the slowest finger...');
      case 'rps':
        if (pr.step === 'pick') return need ? `${icon}<h2 class="yl">Rock Paper Scissors</h2><p>Pick your rival. Loser drinks 2, a draw means you both drink.</p>` + pickList('answer') : icon + watch(esc(by.name) + ' is picking a rival');
        if (!need) return (pr.by === m.id || pr.opp === m.id) ? locked('Choice locked in') : icon + watch('Rock paper scissors', esc(pr.text));
        return `<h2 class="yl">Choose!</h2><div class="three">${['rock', 'paper', 'scissors'].map(c => `<button class="rps" data-a="answer" data-v="${c}"><img src="/assets/rps-${c}.svg" alt="">${c.toUpperCase()}</button>`).join('')}</div>`;
      case 'trust':
        if (pr.step === 'pick') return need ? `${icon}<h2 class="yl">Breakaway</h2><p>Pick a partner. You will both choose in secret: ride together or attack.</p>` + pickList('answer') : icon + watch(esc(by.name) + ' is picking a partner');
        if (!need) return (pr.by === m.id || pr.opp === m.id) ? locked('Choice locked in') : icon + watch('Breakaway', esc(pr.text));
        return `${icon}<h2 class="yl">Ride together or attack?</h2><p>Both ride together: everyone else drinks 1.<br>You attack alone: your partner drinks 3.<br>Both attack: you both drink 2.</p>
          <div class="two"><button class="btn green" data-a="answer" data-v="cheers">RIDE TOGETHER</button><button class="btn red" data-a="answer" data-v="betray">ATTACK</button></div>`;
      case 'duel':
        if (pr.step === 'pick') return need ? `${icon}<h2 class="yl">Sprint Duel</h2><p>Pick your rival. Lowest roll drinks the difference.</p>` + pickList('answer') : icon + watch(esc(by.name) + ' is picking a rival');
        if (need) return `<h2 class="yl">Duel!</h2><button class="rollbtn" data-a="answer"><img src="/assets/dice-6.svg">ROLL</button>`;
        return icon + watch('Sprint duel', esc(pr.text));
      case 'number':
        if (pr.step === 'pick') return need ? `${icon}<h2 class="yl">Pick a secret gear</h2><p>The others will try to guess it. Each right guess costs you a sip, each wrong guess costs them one.</p>` + nums(5, 'answer') : icon + watch(esc(by.name) + ' is choosing a gear...');
        if (pr.by === m.id) return `${icon}<h2>They are guessing...</h2><div class="secret">Your secret gear: <b>${s.me.secret}</b></div>`;
        if (!need) return locked('Guess locked in');
        return `${icon}<h2 class="yl">Which gear is ${esc(by.name)} in?</h2><p>Guess, 1 to 5.</p>` + nums(5, 'answer');
    }
    return watch('Watch the TV');
  }
  function handHtml() {
    const s = state;
    if (s.phase === 'lobby' || s.phase === 'gameover') return '';
    const cards = s.me.hand.map((c, i) => `<button data-a="open" data-v="${i}" class="${canPlay(c) ? 'can' : ''}"><img src="/assets/card-${c}.svg" alt="">${esc(info.cards[c].name)}</button>`).join('');
    return `<div class="handwrap"><div class="t"><span>Your secret cards</span><span>${s.me.hand.length}/4</span></div><div class="hand">${cards || '<div class="none">No cards yet. Land on a CARD house!</div>'}</div></div>`;
  }
  function sheetHtml() {
    const s = state;
    if (menuOpen) return `<div class="box"><h3>Room ${esc(s.code)}</h3><p>Stuck waiting on someone? The host can force the game forward.</p>
      ${me().host ? '<button class="btn" data-a="skip">FORCE SKIP</button>' : ''}<a class="btn teal" href="/rules" target="_blank">RULES</a><button class="btn ghost" data-a="close">CLOSE</button></div>`;
    if (openCard === null || !s.me.hand[openCard]) { openCard = null; return ''; }
    const id = s.me.hand[openCard], c = info.cards[id], ok = canPlay(id);
    let controls = '';
    if (!ok) controls = `<p class="when">${c.when === 'auto' ? 'Plays itself when you are sent to the Cantine' : c.when === 'turn' ? 'Play on your turn, before you roll' : id === 'mirror' ? 'Play when another player gives you sips' : 'Play when sips land on you'}</p>`;
    else if (id === 'loaded') controls = `<p class="when">Choose your roll</p><div class="nums">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="play" data-n="${n}"><img src="/assets/dice-${n}.svg"></button>`).join('')}</div>`;
    else if (c.target) controls = `<p class="when">Choose a player</p>` + others().filter(p => id !== 'thief' || p.cards > 0).map(p => `<button class="btn pl" data-a="play" data-v="${p.id}">${av(p)}<span>${esc(p.name)}${id === 'swap' ? ' (house ' + p.pos + ')' : id === 'thief' ? ' (' + p.cards + ' cards)' : ''}</span></button>`).join('') || '<p>No one to target.</p>';
    else controls = `<button class="btn pink" data-a="play">PLAY IT</button>`;
    return `<div class="box"><img class="art" src="/assets/card-${id}.svg" alt=""><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p>${controls}<button class="btn ghost" data-a="close">CLOSE</button></div>`;
  }
  function render() {
    if (!state || !state.me) return;
    const m = me(); if (!m) { saveSession(null); state = null; return renderJoin(); }
    const key = turnKey(), typing = document.activeElement && document.activeElement.id === 'ownrule';
    if (key !== lastKey) ownRule = '';
    else if (typing) return; // do not redraw under someone typing their own rule
    lastKey = key;
    app.innerHTML = `<div class="top"><div class="me">${av(m)}</div><div class="nm">${esc(m.name)}<small>Room ${esc(state.code)}${m.host ? ' &middot; host' : ''}</small></div>
      <div class="stat">${m.pos}<small>house</small></div><div class="stat">${m.sips}<small>sips</small></div><div class="stat">${state.me.hand.length}<small>cards</small></div><button class="menu" data-a="menu">&#8942;</button></div>
      <div class="panel">${panel()}</div>${handHtml()}`;
    const sh = sheetHtml();
    sheet.innerHTML = sh; sheet.hidden = !sh;
  }

  document.addEventListener('input', (e) => { if (e.target.id === 'ownrule') ownRule = e.target.value; });
  // ---------- taps ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) { if (e.target === sheet) { openCard = null; menuOpen = false; render(); } return; }
    const a = el.dataset.a, v = el.dataset.v;
    switch (a) {
      case 'avatar': join.avatar = +v; paintAvatars(); break;
      case 'join': doJoin(); break;
      case 'start': case 'roll': case 'accept': case 'next': case 'lobby': act({ type: a }); break;
      case 'leave': act({ type: 'leave' }); saveSession(null); if (es) es.close(); state = null; renderJoin(); break;
      case 'skip': act({ type: 'skip' }); menuOpen = false; render(); break;
      case 'answer': act({ type: 'answer', value: el.dataset.b !== undefined ? el.dataset.b === '1' : v }); break;
      case 'alloc': {
        const pr = state.prompt, cur = local.alloc[v] || 0, sum = Object.values(local.alloc).reduce((x, y) => x + y, 0), d = +el.dataset.d;
        if ((d > 0 && sum < pr.n) || (d < 0 && cur > 0)) local.alloc[v] = cur + d;
        render(); break;
      }
      case 'sendgive': act({ type: 'give', alloc: local.alloc }); break;
      case 'ownrule': { const inp = document.getElementById('ownrule'); ownRule = inp ? inp.value : ownRule; if (ownRule.trim().length < 4) showErr('Write your rule first'); else { if (inp) inp.blur(); act({ type: 'answer', text: ownRule }); } break; }
      case 'open': openCard = +v; menuOpen = false; render(); break;
      case 'menu': menuOpen = true; openCard = null; render(); break;
      case 'close': openCard = null; menuOpen = false; render(); break;
      case 'play': act({ type: 'card', card: state.me.hand[openCard], target: v, value: el.dataset.n }); openCard = null; render(); break;
    }
  });
})();
