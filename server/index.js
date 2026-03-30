// ═══════════════════════════════════════════════════════════
//  NEXUS X·O — Multiplayer Server
//  Handles: shared-link rooms + Discord Activity mode
// ═══════════════════════════════════════════════════════════
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── ROOM STORE ──────────────────────────────────────────
// rooms[code] = { code, players:[{id,name,mark}], board, turn, scores, grid, win, active, mode }
const rooms = {};

const GRID_CFG = {
  easy:   { size: 3, win: 3 },
  medium: { size: 5, win: 4 },
  hard:   { size: 7, win: 5 }
};

// ── BUILD WIN COMBOS ─────────────────────────────────────
function buildWinCombos(N, W) {
  const combos = [];
  // rows
  for (let r = 0; r < N; r++)
    for (let c = 0; c <= N - W; c++) {
      const row = []; for (let k = 0; k < W; k++) row.push(r*N+c+k);
      combos.push(row);
    }
  // cols
  for (let c = 0; c < N; c++)
    for (let r = 0; r <= N - W; r++) {
      const col = []; for (let k = 0; k < W; k++) col.push((r+k)*N+c);
      combos.push(col);
    }
  // diag ↘
  for (let r = 0; r <= N - W; r++)
    for (let c = 0; c <= N - W; c++) {
      const d = []; for (let k = 0; k < W; k++) d.push((r+k)*N+(c+k));
      combos.push(d);
    }
  // diag ↙
  for (let r = 0; r <= N - W; r++)
    for (let c = W - 1; c < N; c++) {
      const d = []; for (let k = 0; k < W; k++) d.push((r+k)*N+(c-k));
      combos.push(d);
    }
  return combos;
}

function getWinner(board, combos) {
  for (const combo of combos) {
    const first = board[combo[0]];
    if (first && combo.every(i => board[i] === first)) return { mark: first, combo };
  }
  return null;
}

// ── GENERATE ROOM CODE ────────────────────────────────────
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(difficulty = 'easy', sessionName = 'NEXUS GAME') {
  let code;
  do { code = makeCode(); } while (rooms[code]);
  const gc = GRID_CFG[difficulty] || GRID_CFG.easy;
  const combos = buildWinCombos(gc.size, gc.win);
  rooms[code] = {
    code,
    sessionName,
    difficulty,
    gridN: gc.size,
    winN:  gc.win,
    combos,
    players: [],          // [{id, name, mark, socketId}]
    board: Array(gc.size * gc.size).fill(''),
    turn: 'X',            // whose mark's turn
    scores: { X: 0, O: 0, tie: 0 },
    active: false,        // game in progress
    createdAt: Date.now()
  };
  return rooms[code];
}

// ── REST: CREATE ROOM ─────────────────────────────────────
app.post('/api/room', (req, res) => {
  const { difficulty = 'easy', sessionName = 'NEXUS GAME' } = req.body;
  const room = createRoom(difficulty, sessionName);
  res.json({ code: room.code, gridN: room.gridN, winN: room.winN });
});

// ── REST: CHECK ROOM ──────────────────────────────────────
app.get('/api/room/:code', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    code: room.code,
    sessionName: room.sessionName,
    difficulty: room.difficulty,
    gridN: room.gridN,
    winN: room.winN,
    playerCount: room.players.length,
    active: room.active
  });
});

// ── SOCKET.IO ────────────────────────────────────────────
io.on('connection', (socket) => {

  // ── JOIN ROOM ──────────────────────────────────────────
  socket.on('join_room', ({ code, playerName }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('error', { msg: 'Room not found. Check the code.' });
    if (room.players.length >= 2) return socket.emit('error', { msg: 'Room is full (2/2 players).' });

    // Assign mark
    const mark = room.players.length === 0 ? 'X' : 'O';
    const player = { id: uuidv4(), name: playerName || `Player ${mark}`, mark, socketId: socket.id };
    room.players.push(player);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.data.mark = mark;

    socket.emit('joined', {
      playerId: player.id,
      mark,
      room: sanitizeRoom(room)
    });

    io.to(code).emit('room_update', sanitizeRoom(room));

    // Both players connected → start
    if (room.players.length === 2) {
      room.active = true;
      room.board  = Array(room.gridN * room.gridN).fill('');
      room.turn   = 'X';
      io.to(code).emit('game_start', sanitizeRoom(room));
    }
  });

  // ── MAKE MOVE ─────────────────────────────────────────
  socket.on('make_move', ({ code, index }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room || !room.active) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.mark !== room.turn) return socket.emit('error', { msg: "It's not your turn." });
    if (room.board[index]) return;

    room.board[index] = player.mark;

    // Check result
    const win = getWinner(room.board, room.combos);
    if (win) {
      room.scores[win.mark]++;
      room.active = false;
      io.to(code).emit('game_over', {
        result: 'win',
        winner: win.mark,
        winnerName: player.name,
        combo: win.combo,
        board: [...room.board],
        scores: { ...room.scores }
      });
    } else if (room.board.every(c => c)) {
      room.scores.tie++;
      room.active = false;
      io.to(code).emit('game_over', {
        result: 'draw',
        board: [...room.board],
        scores: { ...room.scores }
      });
    } else {
      room.turn = room.turn === 'X' ? 'O' : 'X';
      io.to(code).emit('move_made', {
        index,
        mark: player.mark,
        turn: room.turn,
        board: [...room.board]
      });
    }
  });

  // ── REQUEST REMATCH ────────────────────────────────────
  socket.on('rematch', ({ code }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room || room.players.length !== 2) return;
    room.board  = Array(room.gridN * room.gridN).fill('');
    room.turn   = 'X';
    room.active = true;
    io.to(code).emit('game_start', sanitizeRoom(room));
  });

  // ── SEND CHAT MESSAGE ──────────────────────────────────
  socket.on('chat', ({ code, msg }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const text = (msg || '').trim().slice(0, 120);
    if (!text) return;
    io.to(code).emit('chat_msg', { name: player.name, mark: player.mark, text });
  });

  // ── DISCONNECT ────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const idx  = room.players.findIndex(p => p.socketId === socket.id);
    const name = idx >= 0 ? room.players[idx].name : 'A player';
    if (idx >= 0) room.players.splice(idx, 1);
    room.active = false;
    io.to(code).emit('player_left', { name, room: sanitizeRoom(room) });
    // Clean up empty rooms after 10 min
    if (room.players.length === 0) {
      setTimeout(() => { if (rooms[code] && rooms[code].players.length === 0) delete rooms[code]; }, 600000);
    }
  });
});

function sanitizeRoom(room) {
  return {
    code:        room.code,
    sessionName: room.sessionName,
    difficulty:  room.difficulty,
    gridN:       room.gridN,
    winN:        room.winN,
    players:     room.players.map(p => ({ name: p.name, mark: p.mark })),
    board:       [...room.board],
    turn:        room.turn,
    scores:      { ...room.scores },
    active:      room.active
  };
}

// ── CATCH-ALL (SPA) ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── CLEANUP OLD ROOMS every hour ──────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const code of Object.keys(rooms)) {
    if (rooms[code].createdAt < cutoff) delete rooms[code];
  }
}, 3600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🎮 NEXUS X·O server running on port ${PORT}`));
