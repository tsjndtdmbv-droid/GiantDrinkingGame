'use strict';
/*
 * Giant Tour de Sip server. Zero dependencies: just run `node server.js`.
 *   TV / big screen : http://<host>:3000/
 *   Phones          : http://<host>:3000/p   (or scan the QR code on the TV)
 * Live updates use Server-Sent Events (works on smart TV browsers and through
 * any hosting proxy); phones send actions with plain HTTP POSTs.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const qr = require('./lib/qr');
const { Game, BOARD, STAGES, BIKES, TILE_INFO, CARDS, RULES } = require('./lib/game');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map(); // code -> { game, clients:Set<{res, player}> }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) for (const n of nets[name]) if (n.family === 'IPv4' && !n.internal) return n.address;
  return null;
}

function newRoom() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, easier to read from the sofa
  let code;
  do { code = ''; for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)]; } while (rooms.has(code));
  const room = { clients: new Set() };
  room.game = new Game(code, () => broadcast(room), { speed: Number(process.env.GAME_SPEED) || 1 });
  rooms.set(code, room);
  return room;
}

function send(client, game) {
  client.res.write('data: ' + JSON.stringify(game.view(client.player)) + '\n\n');
}
function broadcast(room) { room.clients.forEach(c => send(c, room.game)); }

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let data = '';
  req.on('data', c => { data += c; if (data.length > 1e5) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(data || '{}')); } catch (e) { cb({}); } });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname;
  const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());

  // ----- API -----
  if (route === '/api/info') {
    const lan = lanAddress();
    return json(res, 200, { lan: lan ? 'http://' + lan + ':' + PORT : null, board: BOARD, stages: STAGES, bikes: BIKES, tiles: TILE_INFO, cards: CARDS, rules: RULES });
  }
  if (route === '/api/create' && req.method === 'POST') return json(res, 200, { code: newRoom().game.code });
  if (route === '/api/qr') {
    try {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      return res.end(qr.svg(url.searchParams.get('text') || ''));
    } catch (e) { return json(res, 400, { error: 'Bad QR text' }); }
  }
  if (route === '/api/stream') {
    if (!room) return json(res, 404, { error: 'Room not found' });
    const token = url.searchParams.get('token');
    const player = token ? room.game.players.find(p => p.token === token) : null;
    if (token && !player) return json(res, 403, { error: 'Unknown player' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    const client = { res, player };
    room.clients.add(client);
    if (player) room.game.setConnected(player, true);
    send(client, room.game);
    req.on('close', () => {
      room.clients.delete(client);
      if (player && ![...room.clients].some(c => c.player === player)) {
        // small grace period so a page refresh or phone lock does not count as leaving
        setTimeout(() => { if (![...room.clients].some(c => c.player === player)) room.game.setConnected(player, false); }, 4000);
      }
    });
    return;
  }
  if (route === '/api/join' && req.method === 'POST') {
    return readBody(req, (b) => {
      const r = rooms.get(String(b.room || '').toUpperCase());
      if (!r) return json(res, 404, { error: 'Room not found. Check the code on the TV.' });
      const out = r.game.addPlayer(b.name, b.avatar);
      if (out.error) return json(res, 400, out);
      json(res, 200, { token: out.player.token, id: out.player.id, code: r.game.code });
    });
  }
  if (route === '/api/act' && req.method === 'POST') {
    return readBody(req, (b) => {
      const r = rooms.get(String(b.room || '').toUpperCase());
      const p = r && r.game.players.find(x => x.token === b.token);
      if (!p) return json(res, 403, { error: 'Not in this room.' });
      let out;
      try { out = r.game.act(p, b); } catch (e) { console.error(e); out = { error: 'Something went wrong.' }; }
      json(res, out && out.error ? 400 : 200, out || {});
    });
  }
  if (route === '/api/me') {
    if (!room) return json(res, 404, { error: 'Room not found' });
    return room.game.players.some(p => p.token === url.searchParams.get('token')) ? json(res, 200, { ok: true }) : json(res, 403, { error: 'Unknown player' });
  }
  if (route === '/api/room') return json(res, room ? 200 : 404, room ? { ok: true, taken: room.game.players.map(p => p.avatar), phase: room.game.phase } : { error: 'Room not found' });

  // ----- static files -----
  let file = route === '/' ? '/tv.html' : route === '/p' ? '/phone.html' : route === '/rules' ? '/rules.html' : route;
  file = path.normalize(path.join(PUBLIC, file));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.svg' || ext === '.jpg' ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
});

// keep SSE connections alive and clean up rooms nobody has touched for 6 hours
setInterval(() => {
  rooms.forEach((room, code) => {
    room.clients.forEach(c => c.res.write(': ping\n\n'));
    if (Date.now() - room.game.touched > 6 * 3600 * 1000 && !room.clients.size) { room.game.clearTimer(); rooms.delete(code); }
  });
}, 15000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    const lan = lanAddress();
    console.log('\n  Giant Tour de Sip is running!\n');
    console.log('  Open on the TV:   http://localhost:' + PORT + (lan ? '   or   http://' + lan + ':' + PORT : ''));
    console.log('  Phones join by scanning the QR code shown on the TV.\n');
  });
}
module.exports = { server, rooms };
