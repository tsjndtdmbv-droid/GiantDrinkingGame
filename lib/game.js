'use strict';
/* Giant Tour de Sip game engine. One Game instance per room. No I/O in here: the
 * server calls act()/view() and gets notified through onChange(). */
const { BOARD, STAGES, BIKES, TILE_INFO, CARDS, RULES, VOTES, MEETINGS, OHNOS } = require('./content');

const MAX_PLAYERS = 8;
const MAX_HAND = 4;
const MAX_SIPS = 6; // cap for one hit of sips, keeps things friendly
const LAST = BOARD.length - 1;

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const plural = (n) => n + (n === 1 ? ' sip' : ' sips');
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

class Game {
  constructor(code, onChange, opts) {
    this.code = code;
    this.onChange = onChange || (() => {});
    this.speed = (opts && opts.speed) || 1; // <1 makes timers shorter (used by tests)
    this.players = [];
    this.phase = 'lobby';
    this.turnIdx = -1;
    this.seq = 0;
    this.toasts = [];
    this.rules = [];
    this.timer = null; this.timerFn = null; this.deadline = 0;
    this.roll = null; this.move = null; this.prompt = null; this.pending = null; this.result = null;
    this.winner = null; this.again = false; this.roundDone = false; this.custom = []; this.lastRoll = null;
    this.decks = {};
    this.touched = Date.now();
  }

  // ---------- helpers ----------
  P(id) { return this.players.find(p => p.id === id); }
  get active() { return this.players[this.turnIdx] || null; }
  get host() { return this.players[0] || null; }
  has(rule) { return this.rules.includes(rule); }
  others(p, connectedOnly) {
    let o = this.players.filter(x => x.id !== p.id);
    if (connectedOnly && o.some(x => x.connected)) o = o.filter(x => x.connected);
    return o;
  }
  connected() { const c = this.players.filter(p => p.connected); return c.length ? c : this.players; }
  changed() { this.touched = Date.now(); this.onChange(this); }
  toast(text, icon) { this.toasts.push({ seq: ++this.seq, text, icon: icon || '' }); if (this.toasts.length > 8) this.toasts.shift(); }
  setTimer(ms, fn) {
    this.clearTimer();
    ms = Math.max(5, ms * this.speed);
    this.timerFn = fn; this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => { this.timer = null; this.timerFn = null; fn(); this.changed(); }, ms);
  }
  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.timerFn = null; this.deadline = 0; }
  fromDeck(name, list) { // shuffled, non-repeating prompts
    if (!this.decks[name] || !this.decks[name].length) this.decks[name] = list.slice().sort(() => Math.random() - 0.5);
    return this.decks[name].pop();
  }
  drawCard() {
    const ids = Object.keys(CARDS);
    let total = ids.reduce((s, id) => s + CARDS[id].weight, 0), r = Math.random() * total;
    for (const id of ids) { r -= CARDS[id].weight; if (r < 0) return id; }
    return ids[0];
  }
  giveCard(p) { p.hand.push(this.drawCard()); if (p.hand.length > MAX_HAND) p.hand.shift(); }
  resetPlayer(p) { p.pos = 0; p.hand = []; p.sips = 0; p.out = null; p.given = 0; p.cardsPlayed = 0; p.double = false; p.rolled = false; p.sixes = 0; }

  // ---------- players ----------
  addPlayer(name, avatar) {
    if (this.players.length >= MAX_PLAYERS) return { error: 'Room is full (8 players max).' };
    name = String(name || '').replace(/[<>]/g, '').trim().slice(0, 12) || 'Player';
    let base = name, i = 2;
    while (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) name = base.slice(0, 10) + ' ' + i++;
    const taken = this.players.map(p => p.avatar);
    avatar = parseInt(avatar, 10);
    if (!(avatar >= 0 && avatar < 8) || taken.includes(avatar)) avatar = [0, 1, 2, 3, 4, 5, 6, 7].find(a => !taken.includes(a));
    const p = {
      id: 'p' + (++this.seq) + Math.random().toString(36).slice(2, 6),
      token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      name, avatar, connected: false,
    };
    this.resetPlayer(p);
    if (this.phase !== 'lobby') this.giveCard(p);
    this.players.push(p);
    this.toast(p.name + ' joined!', 'join');
    this.changed();
    return { player: p };
  }
  removePlayer(p) { // lobby only
    if (this.phase !== 'lobby') return;
    this.players = this.players.filter(x => x !== p);
    this.changed();
  }
  setConnected(p, on) {
    if (p.connected === on) return;
    p.connected = on;
    if (on) {
      if (this.phase === 'roll' && !this.timer) this.armRollTimer();
    } else {
      if (this.phase === 'roll' && this.active === p) this.armRollTimer();
      if (this.phase === 'prompt') this.checkPrompt();
      if (this.phase === 'react') { this.pending.forEach(e => { if (e.to === p.id) e.done = true; }); this.checkReact(); }
    }
    this.changed();
  }

  // ---------- turn flow ----------
  start() {
    this.players.forEach(p => { this.resetPlayer(p); this.giveCard(p); });
    this.winner = null; this.turnIdx = -1; this.toasts = []; this.rules = []; this.custom = []; this.lastRoll = null; this.again = false; this.roundDone = false;
    this.phase = 'roll';
    this.nextTurn();
  }
  nextTurn() {
    if (this.phase === 'gameover') return;
    this.prompt = null; this.pending = null; this.result = null; this.roll = null; this.move = null;
    if (this.again) this.again = false; // "roll again": same rider goes once more
    else {
      for (let guard = 0; guard < this.players.length * 2 + 1; guard++) {
        const next = (this.turnIdx + 1) % this.players.length;
        if (next === 0 && this.turnIdx !== -1 && !this.roundDone) { // a full round has been played
          this.roundDone = true;
          this.roundStart();
          if (this.has('poll')) return this.setPrompt({ type: 'vote', poll: true, n: 1, by: this.players[0].id, text: 'Round poll! Who should drink a sip?', answers: {} }, 40000);
        }
        this.roundDone = false;
        this.turnIdx = next;
        const p = this.active;
        if (!p.out) break;
        this.toast(p.name + (p.out === 'cantine' ? ' is in the Cantine' : ' is on sick leave') + ' and misses this turn', 'cantine');
        p.out = null;
      }
    }
    this.phase = 'roll';
    this.armRollTimer();
  }
  roundStart() { // rules that trigger once per round
    if (this.has('yellow')) {
      const max = Math.max.apply(null, this.players.map(x => x.pos));
      this.players.filter(x => x.pos === max).forEach(x => { x.sips += 1; this.toast('Yellow Jersey! ' + x.name + ' is in front and drinks a sip.', 'rule'); });
    }
    if (this.has('broom')) {
      const min = Math.min.apply(null, this.players.map(x => x.pos));
      const t = pick(this.players.filter(x => x.pos === min));
      t.pos = Math.min(LAST - 1, t.pos + 2);
      this.toast('Broom Wagon! ' + t.name + ' is last and moves 2 houses forward.', 'rule');
    }
  }
  armRollTimer() {
    const p = this.active;
    if (!this.players.some(x => x.connected)) { this.clearTimer(); return; } // everyone away: pause
    if (p.connected) this.setTimer(60000, () => this.doRoll(p, 1 + rnd(6)));
    else this.setTimer(6000, () => { this.toast(p.name + ' is away, turn skipped', 'skip'); this.nextTurn(); });
  }
  doRoll(p, value, loaded) {
    const notes = [];
    if (!p.rolled) { p.rolled = true; p.sips += 1; notes.push(p.name + ' takes the opening sip before the first roll.'); }
    p.sixes = value === 6 ? p.sixes + 1 : 0;
    if (this.has('five') && value === 5) { p.sips += 1; notes.push('High Five! ' + p.name + ' rolled a 5 and drinks a sip.'); }
    if (this.has('tail') && value === 6) { this.others(p).forEach(x => { x.sips += 1; }); notes.push('Tailwind! ' + p.name + ' rolled a 6 and everybody else drinks a sip.'); }
    const prev = this.lastRoll && this.lastRoll.pid !== p.id && this.lastRoll.value === value ? this.P(this.lastRoll.pid) : null;
    if (this.has('chain') && prev) { p.sips += 1; prev.sips += 1; notes.push('Chain Gang! ' + p.name + ' and ' + prev.name + ' both rolled a ' + value + ' and drink a sip.'); }
    this.lastRoll = { pid: p.id, value };
    const from = p.pos;
    let to = Math.min(LAST, from + value), push = false;
    if (this.has('six3') && p.sixes >= 3) { p.sixes = 0; to = Math.max(0, from - 12); notes.push('Triple Six! ' + p.name + ' goes back 12 houses.'); }
    else if (this.has('one') && value === 1) { to = Math.max(0, from - 1); notes.push('Reverse Gear! ' + p.name + ' rolled a 1 and moves backwards.'); }
    else if (this.has('three') && value === 3) { to = from; push = true; notes.push('Lead-out! ' + p.name + ' must move someone else.'); }
    p.pos = to;
    notes.forEach(n => this.toast(n, 'rule'));
    this.roll = { value, loaded: !!loaded, pid: p.id, seq: ++this.seq, notes };
    this.move = { pid: p.id, from, to, seq: ++this.seq };
    this.phase = 'moving';
    const steps = to > from ? to - from : to < from ? 2 : 0;
    this.setTimer(2900 + steps * 680, () => {
      if (push) this.setPrompt({ type: 'push', by: p.id, text: p.name + ' rolled a 3 and picks who moves 3 houses forward.' }, 30000);
      else this.land(p, false);
    });
  }
  land(p, chained) {
    const tile = BOARD[p.pos];
    if (this.has('draft') && tile.type !== 'fwd' && tile.type !== 'back' && p.pos > 0 && p.pos < LAST) {
      const here = this.others(p).filter(x => x.pos === p.pos);
      if (here.length) { [p].concat(here).forEach(x => { x.sips += 1; }); this.toast('Slipstream! ' + [p].concat(here).map(x => x.name).join(' and ') + ' share a house and drink a sip.', 'rule'); }
    }
    switch (tile.type) {
      case 'fwd': case 'back': {
        if (chained) return this.showResult({ title: 'Safe!', icon: tile.type, text: p.name + ' catches a breath.' }, 3000);
        const from = p.pos, to = Math.max(0, Math.min(LAST, from + (tile.type === 'fwd' ? tile.n : -tile.n)));
        p.pos = to;
        this.move = { pid: p.id, from, to, seq: ++this.seq, jump: true };
        this.toast(tile.type === 'fwd' ? p.name + ' goes aero: +' + tile.n + '!' : 'Puncture! ' + p.name + ' slides back ' + tile.n, tile.type);
        return this.setTimer(1900, () => this.land(p, true));
      }
      case 'sip':
        return this.assign([{ to: p.id, n: tile.n, from: null }], { title: 'Bottoms up', icon: 'sip', text: p.name + ' grabs a bidon.' });
      case 'all':
        return this.assign(this.players.map(x => ({ to: x.id, n: tile.n, from: null })), { title: 'Peloton', icon: 'all', text: 'The whole peloton drinks ' + plural(tile.n) + '.' });
      case 'water':
        return this.showResult({ title: 'Feed zone', icon: 'water', text: 'Everyone takes a big sip of water. Yes, really.' }, 8000);
      case 'card':
        this.giveCard(p);
        return this.showResult({ title: 'Secret card', icon: 'card', text: p.name + ' draws a card. Check your phone, and keep it hidden!' }, 6000);
      case 'give': return this.startGive(p, tile.n);
      case 'meeting': case 'ohno': {
        const card = this.fromDeck(tile.type, tile.type === 'meeting' ? MEETINGS : OHNOS);
        return this.setPrompt({ type: 'deck', deck: tile.type, card, by: p.id, text: card.text }, 10000);
      }
      case 'least': {
        const pool = this.connected(), min = Math.min.apply(null, pool.map(x => x.sips));
        const t = pick(pool.filter(x => x.sips === min));
        return this.assign([{ to: t.id, n: 2, from: null }], { title: 'Lanterne rouge', icon: 'least', text: t.name + ' has the fewest sips (' + t.sips + ') and drinks 2 to catch up.' });
      }
      case 'rule': return this.startRule(p);
      case 'dicedrink':
        return this.setPrompt({ type: 'dicedrink', step: 'roll', by: p.id, dice: {}, text: p.name + ' rolls the dice and drinks the number.' }, 30000);
      case 'mystery':
        return this.setPrompt({ type: 'mystery', step: 'pick', by: p.id, cards: ['drink', 'give', 'again'].sort(() => Math.random() - 0.5), picked: null, outcome: null, text: p.name + ' picks one of three face-down cards.' }, 30000);
      case 'reflex':
        return this.setPrompt({ type: 'reflex', by: p.id, order: [], text: 'Tap the button on your phone. Last one drinks!' }, 12000);
      case 'vote':
        return this.setPrompt({ type: 'vote', by: p.id, n: 2, text: this.fromDeck('vote', VOTES), answers: {} }, 40000);
      case 'trust':
        return this.setPrompt({ type: 'trust', step: 'pick', by: p.id, opp: null, text: p.name + ' picks a breakaway partner.', answers: {} }, 30000);
      case 'rps':
        return this.setPrompt({ type: 'rps', step: 'pick', by: p.id, opp: null, text: p.name + ' picks a rival.', answers: {} }, 30000);
      case 'duel':
        return this.setPrompt({ type: 'duel', step: 'pick', by: p.id, opp: null, text: p.name + ' picks a rival.', dice: {} }, 30000);
      case 'number':
        return this.setPrompt({ type: 'number', step: 'pick', by: p.id, secret: 0, text: p.name + ' is choosing a secret gear, 1 to 5.', answers: {} }, 30000);
      case 'finish':
        this.clearTimer();
        this.players.forEach(x => { x.sips += 1; x.out = null; }); // the winner makes a toast and everybody drinks
        this.winner = p.id; this.phase = 'gameover'; this.prompt = null; this.pending = null; this.result = null;
        return;
      default:
        return this.showResult({ title: 'Safe!', icon: 'start', text: 'Nothing happens.' }, 3000);
    }
  }
  setPrompt(prompt, ms) {
    this.prompt = prompt; this.phase = 'prompt'; this.result = null; this.pending = null;
    this.setTimer(ms, () => this.promptTimeout());
    this.checkPrompt();
  }
  showResult(result, ms) {
    this.result = result; this.prompt = null; this.pending = null;
    this.phase = 'result';
    this.setTimer(ms || 9000, () => this.nextTurn());
  }

  // ---------- prompts (mini games) ----------
  reflexLeft() { const pr = this.prompt; return this.players.filter(p => p.connected && !pr.order.includes(p.id)).map(p => p.id); }
  promptNeed() { // who still has to answer
    const pr = this.prompt; if (!pr) return [];
    const conn = this.players.filter(p => p.connected).map(p => p.id);
    const missing = (ids, obj) => ids.filter(id => obj[id] === undefined);
    switch (pr.type) {
      case 'give': case 'rule': case 'push': case 'deck': case 'pair': return [pr.by];
      case 'vote': return missing(conn, pr.answers);
      case 'joke': return missing(conn.filter(id => id !== pr.by), pr.answers);
      case 'reflex': return this.reflexLeft();
      case 'trust': case 'rps': return pr.step === 'pick' ? [pr.by] : missing([pr.by, pr.opp], pr.answers);
      case 'duel': return pr.step === 'pick' ? [pr.by] : pr.step === 'roll' ? missing([pr.by, pr.opp], pr.dice) : [];
      case 'dicedrink': return pr.step === 'roll' ? missing([pr.by], pr.dice) : [];
      case 'mystery': return pr.step === 'show' ? [] : [pr.by];
      case 'number': return pr.step === 'pick' ? [pr.by] : missing(conn.filter(id => id !== pr.by), pr.answers);
    }
    return [];
  }
  checkPrompt() {
    const pr = this.prompt; if (!pr || this.phase !== 'prompt') return;
    if (pr.type === 'reflex') { if (this.reflexLeft().length <= 1) this.resolvePrompt(); return; }
    if (this.promptNeed().length) return;
    if (pr.type === 'vote' || pr.type === 'joke') return this.resolvePrompt();
    if ((pr.type === 'trust' || pr.type === 'rps') && pr.step === 'choose') return this.resolvePrompt();
    if (pr.type === 'number' && pr.step === 'guess') return this.resolvePrompt();
    if ((pr.type === 'duel' || pr.type === 'dicedrink') && pr.step === 'roll') { pr.step = 'show'; this.setTimer(2600, () => this.resolvePrompt()); }
  }
  promptTimeout() { // somebody was too slow: fill in for them and move on
    const pr = this.prompt; if (!pr) return this.nextTurn();
    const by = this.P(pr.by);
    const randomOther = () => pick(this.others(by, true)).id;
    switch (pr.type) {
      case 'give': {
        const alloc = {}; for (let i = 0; i < pr.n; i++) { const t = randomOther(); alloc[t] = (alloc[t] || 0) + 1; }
        return this.doGive(by, alloc);
      }
      case 'rule': return pr.options.length ? this.addRule(by, pick(pr.options)) : this.showResult({ title: 'Make a rule', icon: 'rule', text: by.name + ' ran out of time. No new rule.' }, 4000);
      case 'deck': return this.applyDeck();
      case 'pair': return this.doPair(by, randomOther());
      case 'push': return this.doPush(by, randomOther());
      case 'vote': case 'joke': case 'reflex': return this.resolvePrompt();
      case 'trust': case 'rps':
        if (pr.step === 'pick') return this.pickOpp(by, randomOther());
        [pr.by, pr.opp].forEach(id => { if (pr.answers[id] === undefined) pr.answers[id] = pr.type === 'trust' ? 'cheers' : pick(Object.keys(BEATS)); });
        return this.resolvePrompt();
      case 'duel':
        if (pr.step === 'pick') return this.pickOpp(by, randomOther());
        if (pr.step === 'roll') { [pr.by, pr.opp].forEach(id => { if (pr.dice[id] === undefined) pr.dice[id] = 1 + rnd(6); }); return this.checkPrompt(); }
        return this.resolvePrompt();
      case 'dicedrink':
        if (pr.step === 'roll') { pr.dice[pr.by] = 1 + rnd(6); return this.checkPrompt(); }
        return this.resolvePrompt();
      case 'mystery':
        if (pr.step === 'pick') return this.mysteryPick(by, rnd(3));
        if (pr.step === 'target') return this.mysteryGive(by, randomOther());
        return this.mysteryGo();
      case 'number':
        if (pr.step === 'pick') return this.pickNumber(by, 1 + rnd(5));
        return this.resolvePrompt();
    }
  }
  pickOpp(p, target) {
    const pr = this.prompt, opp = this.P(target);
    pr.opp = opp.id;
    if (pr.type === 'trust') { pr.step = 'choose'; pr.text = p.name + ' and ' + opp.name + ' are in a breakaway: ride together or attack? Choose in secret.'; }
    else if (pr.type === 'rps') { pr.step = 'choose'; pr.text = p.name + ' vs ' + opp.name + '. Rock, paper or scissors?'; }
    else { pr.step = 'roll'; pr.text = p.name + ' vs ' + opp.name + '. Lowest roll drinks the difference!'; }
    this.setTimer(30000, () => this.promptTimeout());
    this.checkPrompt();
  }
  pickNumber(p, n) {
    const pr = this.prompt;
    pr.secret = n; pr.step = 'guess';
    pr.text = 'Which gear is ' + p.name + ' riding in? Guess on your phone.';
    this.setTimer(30000, () => this.promptTimeout());
    this.checkPrompt();
  }
  doGive(p, alloc) {
    const list = Object.keys(alloc).filter(id => alloc[id] > 0).map(id => ({ to: id, n: alloc[id], from: p.id }));
    this.assign(list, { title: 'Special delivery', icon: 'give', text: p.name + ' handed out ' + plural(this.prompt.n) + '.' });
  }
  startGive(p, n) {
    const doubled = p.double; p.double = false;
    if (doubled) n *= 2;
    this.setPrompt({ type: 'give', by: p.id, n, doubled, text: p.name + ' hands out ' + plural(n) + (doubled ? ' (doubled!)' : '') + '.' }, 40000);
  }
  startRule(p) { // offer four of the rules that are not in play yet, plus "write your own"
    const options = Object.keys(RULES).filter(r => !this.has(r)).sort(() => Math.random() - 0.5).slice(0, 4);
    const canCustom = this.custom.length < 5;
    if (!options.length && !canCustom) return this.showResult({ title: 'Make a rule', icon: 'rule', text: 'Every rule is already in play. ' + p.name + ' is safe.' }, 5000);
    this.setPrompt({ type: 'rule', by: p.id, options, canCustom, text: p.name + ' is making a new rule for everyone.' }, 75000);
  }
  addCustom(p, text) {
    this.custom.push({ by: p.name, text });
    this.toast('New house rule by ' + p.name, 'rule');
    this.showResult({ title: 'New house rule', icon: 'rule', text, extra: ['Made by ' + p.name + '. It applies to everyone, and ' + p.name + ' is the referee.'] }, 10000);
  }
  // ----- Emergency Meeting and Oh No cards -----
  applyDeck() {
    const pr = this.prompt, p = this.P(pr.by), c = pr.card, fx = c.fx;
    const ctx = { title: pr.deck === 'meeting' ? 'Emergency meeting!' : 'Oh no!', icon: pr.deck, text: c.text, extra: [c.effect] };
    const bonus = () => { if (fx.card) { this.giveCard(p); ctx.extra.push(p.name + ' draws a secret card.'); } };
    switch (fx.k) {
      case 'others': return this.assign(this.others(p).map(x => ({ to: x.id, n: fx.n, from: null })), ctx);
      case 'all': bonus(); return this.assign(this.players.map(x => ({ to: x.id, n: fx.n, from: null })), ctx);
      case 'rule': return this.startRule(p);
      case 'give': return this.startGive(p, fx.n);
      case 'vote': return this.setPrompt({ type: 'vote', by: p.id, n: 2, text: 'In this meeting we decide who drinks. Start voting!', answers: {} }, 40000);
      case 'joke': return this.setPrompt({ type: 'joke', by: p.id, text: p.name + ', tell a joke! Everybody else: did you laugh?', answers: {} }, 60000);
      case 'roll': return this.setPrompt({ type: 'dicedrink', step: 'roll', by: p.id, dice: {}, half: !!fx.half, text: c.effect }, 30000);
      case 'pair': return this.setPrompt({ type: 'pair', by: p.id, n: fx.n, fx, ctx, text: p.name + ' picks a colleague to celebrate with.' }, 30000);
      case 'keep':
        p.hand.push(fx.card); if (p.hand.length > MAX_HAND) p.hand.shift();
        return this.showResult(Object.assign(ctx, { extra: [p.name + ' keeps this card. It is on your phone now.'] }), 7000);
      case 'move': return this.cardMove(p, fx.n, () => this.showResult(ctx, 6000));
      case 'self': {
        let n = fx.n;
        bonus();
        if (fx.lose) {
          if (p.hand.length) { p.hand.splice(rnd(p.hand.length), 1); ctx.extra.push(p.name + ' hands in a secret card.'); }
          else { n += 1; ctx.extra.push(p.name + ' has no card to hand in: one more sip.'); }
        }
        if (fx.cantine) ctx.extra.push(this.sendCantine(p));
        if (fx.out) { p.out = 'sick'; ctx.extra.push(p.name + ' misses the next turn.'); }
        const go = () => this.assign([{ to: p.id, n, from: null }], ctx);
        return fx.back ? this.cardMove(p, -fx.back, go) : go();
      }
    }
  }
  cardMove(p, n, then) { // a move caused by a card never triggers the house you end up on
    const from = p.pos, to = Math.max(0, Math.min(LAST - 1, from + n));
    p.pos = to; this.prompt = null;
    this.move = { pid: p.id, from, to, seq: ++this.seq, jump: true };
    this.phase = 'moving';
    this.setTimer(1900, then);
  }
  sendCantine(p) {
    const i = p.hand.indexOf('skip');
    if (i >= 0) { p.hand.splice(i, 1); p.cardsPlayed++; this.toast(p.name + ' plays SKIP THE CANTINE!', 'skip'); return p.name + ' plays Skip the Cantine and keeps riding!'; }
    p.out = 'cantine';
    return p.name + ' goes to the Cantine and misses the next turn.';
  }
  doPair(p, target) {
    const pr = this.prompt, t = this.P(target), ctx = pr.ctx;
    if (pr.fx.card) { this.giveCard(p); ctx.extra.push(p.name + ' draws a secret card.'); }
    if (pr.fx.again) { this.again = true; ctx.extra.push(p.name + ' rolls again after this.'); }
    ctx.extra.push(p.name + ' celebrates with ' + t.name + '.');
    this.assign([{ to: p.id, n: pr.n, from: null }, { to: t.id, n: pr.n, from: null }], ctx);
  }
  addRule(p, id) {
    this.rules.push(id);
    this.toast('New rule: ' + RULES[id].name, 'rule');
    this.showResult({ title: 'New rule: ' + RULES[id].name, icon: 'rule', text: RULES[id].text, extra: ['Chosen by ' + p.name + '. It applies to everyone.'] }, 9000);
  }
  doPush(p, target) { // Generous Three rule
    const t = this.P(target), from = t.pos, to = Math.max(from, Math.min(LAST - 1, from + 3)); // nobody gets pushed over the finish line
    t.pos = to; this.prompt = null;
    this.move = { pid: t.id, from, to, seq: ++this.seq, jump: true };
    this.phase = 'moving';
    this.setTimer(1900, () => this.showResult({ title: 'Lead-out', icon: 'fwd', text: p.name + ' moved ' + t.name + ' forward ' + (to - from) + ' houses.' }, 4000));
  }
  mysteryPick(p, i) {
    const pr = this.prompt;
    pr.picked = i; pr.outcome = pr.cards[i]; pr.step = 'show';
    pr.text = p.name + ' flipped: ' + { drink: 'DRINK 2 SIPS', give: 'MAKE SOMEONE DRINK', again: 'ROLL AGAIN' }[pr.outcome];
    this.setTimer(2800, () => this.mysteryGo());
  }
  mysteryGo() {
    const pr = this.prompt, p = this.P(pr.by);
    if (pr.outcome === 'drink') return this.assign([{ to: p.id, n: 2, from: null }], { title: 'Pick a card', icon: 'mystery', text: p.name + ' flipped the DRINK card.' });
    if (pr.outcome === 'again') { this.again = true; return this.showResult({ title: 'Roll again!', icon: 'mystery', text: p.name + ' flipped the ROLL AGAIN card and gets another turn.' }, 4000); }
    pr.step = 'target'; pr.text = p.name + ' flipped MAKE SOMEONE DRINK and is choosing...';
    this.setTimer(30000, () => this.promptTimeout());
  }
  mysteryGive(p, target) {
    const t = this.P(target);
    this.assign([{ to: t.id, n: 2, from: p.id }], { title: 'Pick a card', icon: 'mystery', text: p.name + ' flipped MAKE SOMEONE DRINK and chose ' + t.name + '.' });
  }
  resolvePrompt() {
    const pr = this.prompt, by = this.P(pr.by), opp = pr.opp && this.P(pr.opp);
    const name = id => this.P(id).name;
    switch (pr.type) {
      case 'vote': {
        const tally = {};
        Object.keys(pr.answers).forEach(v => { const t = pr.answers[v]; tally[t] = (tally[t] || 0) + 1; });
        const ids = Object.keys(tally);
        if (!ids.length) return this.showResult({ title: 'No votes', icon: 'vote', text: 'Nobody voted. Everyone is innocent.' }, 5000);
        const max = Math.max.apply(null, ids.map(id => tally[id]));
        const extra = ids.sort((a, b) => tally[b] - tally[a]).map(id => name(id) + ': ' + tally[id] + (tally[id] === 1 ? ' vote' : ' votes'));
        return this.assign(ids.filter(id => tally[id] === max).map(id => ({ to: id, n: pr.n || 2, from: null })),
          { title: pr.poll ? 'Round poll result' : 'The votes are in', icon: 'vote', text: pr.text, extra });
      }
      case 'joke': {
        const laughed = Object.keys(pr.answers).filter(id => pr.answers[id] === true);
        const ctx = { title: 'Tell a joke', icon: 'meeting', text: laughed.length ? 'Who laughs, drinks: ' + laughed.map(name).join(', ') + '.' : 'Nobody laughed. ' + by.name + ' drinks.' };
        return this.assign(laughed.length ? laughed.map(id => ({ to: id, n: 1, from: null })) : [{ to: by.id, n: 2, from: null }], ctx);
      }
      case 'reflex': {
        let losers = this.reflexLeft();
        if (!losers.length && pr.order.length) losers = [pr.order[pr.order.length - 1]];
        if (!losers.length) return this.showResult({ title: 'Bell lap', icon: 'reflex', text: 'Nobody was around to tap.' }, 4000);
        return this.assign(losers.map(id => ({ to: id, n: 2, from: null })), { title: 'Too slow!', icon: 'reflex', text: 'Slowest finger: ' + losers.map(name).join(', ') + '.' });
      }
      case 'trust': {
        const a = pr.answers[by.id], b = pr.answers[opp.id];
        const say = (x) => x === 'cheers' ? 'RIDE TOGETHER' : 'ATTACK';
        const ctx = { title: 'Breakaway', icon: 'trust', text: '', extra: [by.name + ' chose ' + say(a), opp.name + ' chose ' + say(b)] };
        if (a === 'cheers' && b === 'cheers') {
          ctx.text = 'Perfect teamwork! Everybody else drinks 1.';
          return this.assign(this.players.filter(x => x !== by && x !== opp).map(x => ({ to: x.id, n: 1, from: null })), ctx);
        }
        if (a === 'betray' && b === 'betray') {
          ctx.text = 'They both attacked and blew up! Both drink 2.';
          return this.assign([{ to: by.id, n: 2, from: null }, { to: opp.id, n: 2, from: null }], ctx);
        }
        const traitor = a === 'betray' ? by : opp, victim = a === 'betray' ? opp : by;
        ctx.text = traitor.name + ' attacked and dropped ' + victim.name + '!';
        return this.assign([{ to: victim.id, n: 3, from: traitor.id }], ctx);
      }
      case 'rps': {
        const a = pr.answers[by.id], b = pr.answers[opp.id];
        const ctx = { title: 'Rock paper scissors', icon: 'rps', text: by.name + ' played ' + a.toUpperCase() + ', ' + opp.name + ' played ' + b.toUpperCase() + '.' };
        if (a === b) return this.assign([{ to: by.id, n: 1, from: null }, { to: opp.id, n: 1, from: null }], Object.assign(ctx, { extra: ['A draw! Both drink.'] }));
        const win = BEATS[a] === b ? by : opp, lose = win === by ? opp : by;
        return this.assign([{ to: lose.id, n: 2, from: win.id }], Object.assign(ctx, { extra: [win.name + ' wins!'] }));
      }
      case 'duel': {
        const a = pr.dice[by.id], b = pr.dice[opp.id];
        const ctx = { title: 'Sprint duel', icon: 'duel', text: by.name + ' rolled ' + a + ', ' + opp.name + ' rolled ' + b + '.' };
        if (a === b) return this.assign([{ to: by.id, n: 1, from: null }, { to: opp.id, n: 1, from: null }], Object.assign(ctx, { extra: ['A tie! Both drink 1.'] }));
        const win = a > b ? by : opp, lose = a > b ? opp : by;
        return this.assign([{ to: lose.id, n: Math.min(4, Math.abs(a - b)), from: win.id }], Object.assign(ctx, { extra: [win.name + ' wins!'] }));
      }
      case 'dicedrink': {
        const v = pr.dice[by.id];
        return this.assign([{ to: by.id, n: pr.half ? Math.ceil(v / 2) : v, from: null }], { title: 'Roll and sip', icon: 'dicedrink', text: by.name + ' rolled a ' + v + '.' });
      }
      case 'number': {
        const right = Object.keys(pr.answers).filter(id => pr.answers[id] === pr.secret);
        const wrong = this.players.filter(x => x.id !== by.id && x.connected && !right.includes(x.id));
        const list = wrong.map(x => ({ to: x.id, n: 1, from: by.id }));
        if (right.length) list.push({ to: by.id, n: Math.min(4, right.length), from: null });
        return this.assign(list, { title: 'It was gear ' + pr.secret, icon: 'number', text: right.length ? 'Good guess: ' + right.map(name).join(', ') + '. ' + by.name + ' drinks 1 for each.' : 'Nobody guessed it!' });
      }
    }
  }

  // ---------- handing out sips, with a window to play defence cards ----------
  assign(list, ctx) {
    list = list.filter(e => e.n > 0);
    this.prompt = null;
    if (!list.length) return this.showResult(Object.assign({ drinks: [], safe: true }, ctx), 7000);
    this.pending = []; this.ctx = ctx; this.plays = [];
    this.phase = 'react';
    list.forEach(e => this.addPending(e.to, e.n, e.from));
    this.setTimer(25000, () => this.finalize());
    this.checkReact();
  }
  addPending(to, n, from) {
    const p = this.P(to);
    this.pending.push({ id: ++this.seq, to, n: Math.min(MAX_SIPS, n), from, done: !p.connected, passed: false, blocked: false });
  }
  checkReact() { if (this.phase === 'react' && this.pending.every(e => e.done)) this.finalize(); }
  finalize() {
    const total = {};
    this.pending.forEach(e => {
      if (e.passed || e.n <= 0) return;
      const t = total[e.to] || (total[e.to] = { pid: e.to, n: 0 });
      t.n += e.n; if (e.from) this.P(e.from).given += e.n;
    });
    const drinks = Object.keys(total).map(id => total[id]).sort((a, b) => b.n - a.n);
    drinks.forEach(d => { this.P(d.pid).sips += d.n; });
    this.showResult(Object.assign({ drinks, plays: this.plays, safe: !drinks.length }, this.ctx), drinks.length ? 10000 : 6000);
  }

  // ---------- actions coming from phones ----------
  act(p, m) {
    const err = (e) => ({ error: e });
    const isHost = p === this.host, isActive = p === this.active;
    switch (m.type) {
      case 'start':
        if (!isHost) return err('Only the host can start.');
        if (this.phase !== 'lobby' && this.phase !== 'gameover') return err('Game already running.');
        if (this.players.length < 2) return err('You need at least 2 players.');
        this.start(); break;
      case 'leave':
        if (this.phase !== 'lobby') return err('Game already running.');
        this.removePlayer(p); return {};
      case 'skip': // host safety valve: force whatever we are waiting on
        if (!isHost) return err('Only the host can skip.');
        if (this.timerFn) { const fn = this.timerFn; this.clearTimer(); fn(); }
        break;
      case 'lobby':
        if (!isHost || this.phase !== 'gameover') return err('Not now.');
        this.phase = 'lobby'; this.winner = null; this.rules = []; this.custom = []; this.players.forEach(x => this.resetPlayer(x)); break;
      case 'next':
        if (this.phase !== 'result' || !(isActive || isHost)) return err('Not now.');
        this.clearTimer(); this.nextTurn(); break;
      case 'roll':
        if (this.phase !== 'roll' || !isActive) return err('Not your turn.');
        this.doRoll(p, 1 + rnd(6)); break;
      case 'card': { const r = this.playCard(p, m); if (r) return r; break; }
      case 'accept': {
        if (this.phase !== 'react') return err('Too late.');
        this.pending.forEach(e => { if (e.to === p.id) e.done = true; });
        this.checkReact(); break;
      }
      case 'give': {
        const pr = this.prompt;
        if (this.phase !== 'prompt' || !pr || pr.type !== 'give' || pr.by !== p.id) return err('Not now.');
        const alloc = {}; let sum = 0;
        for (const id of Object.keys(m.alloc || {})) {
          const n = parseInt(m.alloc[id], 10), t = this.P(id);
          if (!t || t === p || !(n >= 0)) return err('Invalid choice.');
          alloc[id] = n; sum += n;
        }
        if (sum !== pr.n) return err('Hand out exactly ' + plural(pr.n) + '.');
        this.doGive(p, alloc); break;
      }
      case 'answer': { const r = this.answer(p, m); if (r) return r; break; }
      default: return err('Unknown action.');
    }
    this.changed();
    return {};
  }
  answer(p, m) {
    const pr = this.prompt, err = (e) => ({ error: e });
    if (this.phase !== 'prompt' || !pr) return err('Too late.');
    if (!this.promptNeed().includes(p.id)) return err('Nothing to answer right now.');
    const v = m.value, target = this.P(v);
    const needTarget = () => (!target || target === p) ? err('Pick another player.') : null;
    switch (pr.type) {
      case 'vote': { const e = needTarget(); if (e) return e; pr.answers[p.id] = target.id; break; }
      case 'joke': pr.answers[p.id] = v === true; break;
      case 'deck': this.applyDeck(); return;
      case 'pair': { const e = needTarget(); if (e) return e; this.doPair(p, target.id); return; }
      case 'reflex': pr.order.push(p.id); break;
      case 'rule':
        if (m.text !== undefined) {
          const text = String(m.text).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
          if (!pr.canCustom) return err('No more house rules allowed.');
          if (text.length < 4) return err('Write your rule first.');
          this.addCustom(p, text); return;
        }
        if (!pr.options.includes(v)) return err('Pick a rule.');
        this.addRule(p, v); return;
      case 'push': { const e = needTarget(); if (e) return e; this.doPush(p, target.id); return; }
      case 'mystery': {
        if (pr.step === 'target') { const e = needTarget(); if (e) return e; this.mysteryGive(p, target.id); return; }
        const i = parseInt(v, 10);
        if (!(i >= 0 && i <= 2)) return err('Pick a card.');
        this.mysteryPick(p, i); return;
      }
      case 'trust': case 'rps':
        if (pr.step === 'pick') { const e = needTarget(); if (e) return e; this.pickOpp(p, target.id); return; }
        if (pr.type === 'trust' ? (v !== 'cheers' && v !== 'betray') : !BEATS[v]) return err('Invalid choice.');
        pr.answers[p.id] = v; break;
      case 'duel':
        if (pr.step === 'pick') { const e = needTarget(); if (e) return e; this.pickOpp(p, target.id); return; }
        pr.dice[p.id] = 1 + rnd(6); break;
      case 'dicedrink': pr.dice[p.id] = 1 + rnd(6); break;
      case 'number': {
        const n = parseInt(v, 10);
        if (!(n >= 1 && n <= 5)) return err('Pick 1 to 5.');
        if (pr.step === 'pick') { this.pickNumber(p, n); return; }
        pr.answers[p.id] = n; break;
      }
      default: return err('Not now.');
    }
    this.checkPrompt();
  }
  playCard(p, m) {
    const err = (e) => ({ error: e });
    const card = CARDS[m.card], idx = p.hand.indexOf(m.card);
    if (!card || idx < 0) return err('You do not have that card.');
    const target = m.target ? this.P(m.target) : null;
    if (card.when === 'auto') return err('This card plays itself when you are sent to the Cantine.');
    if (card.target && (!target || target === p)) return err('Pick another player.');
    const use = () => { p.hand.splice(idx, 1); p.cardsPlayed++; };

    if (card.when === 'turn') {
      if (this.phase !== 'roll' || p !== this.active) return err('Play this on your turn, before rolling.');
      if (m.card === 'loaded') {
        const v = parseInt(m.value, 10);
        if (!(v >= 1 && v <= 6)) return err('Pick 1 to 6.');
        use(); this.toast(p.name + ' plays E+ BOOST!', 'loaded'); this.doRoll(p, v, true);
      } else if (m.card === 'swap') {
        use(); const t = p.pos; p.pos = target.pos; target.pos = t;
        this.toast(p.name + ' swaps places with ' + target.name + '!', 'swap');
      } else if (m.card === 'thief') {
        if (!target.hand.length) return err(target.name + ' has no cards to steal.');
        use(); const stolen = target.hand.splice(rnd(target.hand.length), 1)[0]; p.hand.push(stolen);
        this.toast(p.name + ' steals a card from ' + target.name + '!', 'thief');
      } else if (m.card === 'double') {
        if (p.double) return err('Already active.');
        use(); p.double = true; this.toast(p.name + ' plays OVERDRIVE!', 'double');
      }
      return;
    }
    // defence cards
    if (this.phase !== 'react') return err('Play this when sips land on you.');
    const mine = this.pending.filter(e => e.to === p.id && !e.done);
    if (!mine.length) return err('Nothing to defend against.');
    if (m.card === 'mirror' && !mine.some(e => e.from)) return err('U-Turn only works on sips given by a player.');
    use();
    const play = { pid: p.id, card: m.card, target: null };
    mine.forEach(e => {
      if (m.card === 'shield') { e.blocked = true; e.was = e.n; e.n = 0; e.done = true; }
      else if (m.card === 'half') { e.n = Math.floor(e.n / 2); e.done = true; }
      else if (m.card === 'potato') { e.done = true; e.passed = true; play.target = target.id; this.addPending(target.id, e.n, p.id); }
      else if (m.card === 'mirror' && e.from) { e.done = true; e.passed = true; play.target = e.from; this.addPending(e.from, e.n, p.id); }
    });
    this.plays.push(play);
    this.toast(p.name + ' plays ' + card.name.toUpperCase() + '!', m.card);
    this.setTimer(20000, () => this.finalize()); // give new targets time to react
    this.checkReact();
  }

  // ---------- what each screen gets to see ----------
  view(p) {
    const pr = this.prompt;
    const v = {
      code: this.code, phase: this.phase, seq: this.seq, rules: this.rules, custom: this.custom,
      players: this.players.map((x, i) => ({ id: x.id, name: x.name, avatar: x.avatar, pos: x.pos, cards: x.hand.length, sips: x.sips, out: x.out, given: x.given, played: x.cardsPlayed, connected: x.connected, host: i === 0, double: x.double, rolled: x.rolled })),
      activeId: this.active ? this.active.id : null,
      roll: this.roll, move: this.move, result: this.result, winner: this.winner, toasts: this.toasts,
      timeLeft: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      prompt: pr ? { type: pr.type, step: pr.step || null, text: pr.text, by: pr.by, opp: pr.opp || null, n: pr.n || 0, poll: !!pr.poll, need: this.promptNeed(), dice: pr.dice || null,
        options: pr.options || null, canCustom: !!pr.canCustom, half: !!pr.half, deck: pr.deck || null, card: pr.card ? { art: pr.card.art, text: pr.card.text, effect: pr.card.effect } : null, picked: pr.picked === undefined ? null : pr.picked, outcome: pr.outcome || null, doubled: !!pr.doubled } : null,
      pending: this.pending ? this.pending.map(e => ({ id: e.id, to: e.to, n: e.n, was: e.was || 0, from: e.from, done: e.done, passed: e.passed, blocked: e.blocked })) : null,
      ctx: this.phase === 'react' ? this.ctx : null,
    };
    if (p) {
      v.me = { id: p.id, hand: p.hand.slice(), double: p.double };
      if (pr && pr.type === 'number' && pr.by === p.id) v.me.secret = pr.secret;
      if (pr && pr.answers && pr.answers[p.id] !== undefined) v.me.answer = pr.answers[p.id];
    }
    return v;
  }
}

module.exports = { Game, BOARD, STAGES, BIKES, TILE_INFO, CARDS, RULES };
