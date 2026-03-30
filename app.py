import os
import uuid
import time
import random
import threading
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, join_room, emit
from flask_cors import CORS

app = Flask(__name__, static_folder='public')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# ── ROOM STORE ──────────────────────────────────────────
# rooms[code] = { code, players:[{id,name,mark}], board, turn, scores, grid, win, active, mode }
rooms = {}

GRID_CFG = {
    'easy':   {'size': 3, 'win': 3},
    'medium': {'size': 5, 'win': 4},
    'hard':   {'size': 7, 'win': 5}
}

client_data = {}  # Tracks socket.id to room info

# ── BUILD WIN COMBOS ─────────────────────────────────────
def build_win_combos(N, W):
    combos = []
    # rows
    for r in range(N):
        for c in range(N - W + 1):
            combos.append([r * N + c + k for k in range(W)])
    # cols
    for c in range(N):
        for r in range(N - W + 1):
            combos.append([(r + k) * N + c for k in range(W)])
    # diag ↘
    for r in range(N - W + 1):
        for c in range(N - W + 1):
            combos.append([(r + k) * N + (c + k) for k in range(W)])
    # diag ↙
    for r in range(N - W + 1):
        for c in range(W - 1, N):
            combos.append([(r + k) * N + (c - k) for k in range(W)])
    return combos

def get_winner(board, combos):
    for combo in combos:
        first = board[combo[0]]
        if first != '' and all(board[i] == first for i in combo):
            return {'mark': first, 'combo': combo}
    return None

# ── GENERATE ROOM CODE ────────────────────────────────────
def make_code():
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    while True:
        code = ''.join(random.choice(chars) for _ in range(6))
        if code not in rooms:
            return code

def create_room(difficulty='easy', session_name='NEXUS GAME'):
    code = make_code()
    gc = GRID_CFG.get(difficulty, GRID_CFG['easy'])
    combos = build_win_combos(gc['size'], gc['win'])
    rooms[code] = {
        'code': code,
        'sessionName': session_name,
        'difficulty': difficulty,
        'gridN': gc['size'],
        'winN': gc['win'],
        'combos': combos,
        'players': [],
        'board': [''] * (gc['size'] * gc['size']),
        'turn': 'X',
        'scores': {'X': 0, 'O': 0, 'tie': 0},
        'active': False,
        'createdAt': time.time()
    }
    return rooms[code]

def sanitize_room(room):
    return {
        'code':        room['code'],
        'sessionName': room['sessionName'],
        'difficulty':  room['difficulty'],
        'gridN':       room['gridN'],
        'winN':        room['winN'],
        'players':     [{'name': p['name'], 'mark': p['mark']} for p in room['players']],
        'board':       list(room['board']),
        'turn':        room['turn'],
        'scores':      dict(room['scores']),
        'active':      room['active']
    }

# ── REST: CREATE ROOM ─────────────────────────────────────
@app.route('/api/room', methods=['POST'])
def api_create_room():
    data = request.json or {}
    difficulty = data.get('difficulty', 'easy')
    session_name = data.get('sessionName', 'NEXUS GAME')
    room = create_room(difficulty, session_name)
    return jsonify({'code': room['code'], 'gridN': room['gridN'], 'winN': room['winN']})

# ── REST: CHECK ROOM ──────────────────────────────────────
@app.route('/api/room/<code>', methods=['GET'])
def api_get_room(code):
    room = rooms.get(code.upper())
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    return jsonify({
        'code': room['code'],
        'sessionName': room['sessionName'],
        'difficulty': room['difficulty'],
        'gridN': room['gridN'],
        'winN': room['winN'],
        'playerCount': len(room['players']),
        'active': room['active']
    })

# ── SOCKET.IO ────────────────────────────────────────────
@socketio.on('join_room')
def handle_join(data):
    code = (data.get('code') or '').upper().strip()
    player_name = data.get('playerName')
    room = rooms.get(code)
    
    if not room:
        emit('error', {'msg': 'Room not found. Check the code.'})
        return
    if len(room['players']) >= 2:
        emit('error', {'msg': 'Room is full (2/2 players).'})
        return

    # Assign mark
    mark = 'X' if len(room['players']) == 0 else 'O'
    player_id = str(uuid.uuid4())
    player = {
        'id': player_id,
        'name': player_name or f"Player {mark}",
        'mark': mark,
        'socketId': request.sid
    }
    
    room['players'].append(player)
    join_room(code)
    
    client_data[request.sid] = {
        'roomCode': code,
        'playerId': player_id,
        'mark': mark
    }

    emit('joined', {
        'playerId': player_id,
        'mark': mark,
        'room': sanitize_room(room)
    })

    socketio.emit('room_update', sanitize_room(room), to=code)

    # Both players connected → start
    if len(room['players']) == 2:
        room['active'] = True
        room['board'] = [''] * (room['gridN'] * room['gridN'])
        room['turn'] = 'X'
        socketio.emit('game_start', sanitize_room(room), to=code)


@socketio.on('make_move')
def handle_move(data):
    code = (data.get('code') or '').upper().strip()
    index = data.get('index')
    room = rooms.get(code)
    if not room or not room.get('active'):
        return

    player = next((p for p in room['players'] if p['socketId'] == request.sid), None)
    if not player:
        return
    if player['mark'] != room['turn']:
        emit('error', {'msg': "It's not your turn."})
        return
    if room['board'][index] != '':
        return

    room['board'][index] = player['mark']

    # Check result
    win = get_winner(room['board'], room['combos'])
    if win:
        room['scores'][win['mark']] += 1
        room['active'] = False
        socketio.emit('game_over', {
            'result': 'win',
            'winner': win['mark'],
            'winnerName': player['name'],
            'combo': win['combo'],
            'board': list(room['board']),
            'scores': dict(room['scores'])
        }, to=code)
    elif all(c != '' for c in room['board']):
        room['scores']['tie'] += 1
        room['active'] = False
        socketio.emit('game_over', {
            'result': 'draw',
            'board': list(room['board']),
            'scores': dict(room['scores'])
        }, to=code)
    else:
        room['turn'] = 'O' if room['turn'] == 'X' else 'X'
        socketio.emit('move_made', {
            'index': index,
            'mark': player['mark'],
            'turn': room['turn'],
            'board': list(room['board'])
        }, to=code)


@socketio.on('rematch')
def handle_rematch(data):
    code = (data.get('code') or '').upper().strip()
    room = rooms.get(code)
    if not room or len(room['players']) != 2:
        return
    room['board'] = [''] * (room['gridN'] * room['gridN'])
    room['turn'] = 'X'
    room['active'] = True
    socketio.emit('game_start', sanitize_room(room), to=code)


@socketio.on('chat')
def handle_chat(data):
    code = (data.get('code') or '').upper().strip()
    msg = data.get('msg')
    room = rooms.get(code)
    if not room:
        return
    player = next((p for p in room['players'] if p['socketId'] == request.sid), None)
    if not player:
        return
    text = str(msg or '').strip()[:120]
    if not text:
        return
    socketio.emit('chat_msg', {'name': player['name'], 'mark': player['mark'], 'text': text}, to=code)


@socketio.on('disconnect')
def handle_disconnect():
    sid_data = client_data.get(request.sid)
    if not sid_data:
        return
    code = sid_data['roomCode']
    room = rooms.get(code)
    if not room:
        return

    idx = next((i for i, p in enumerate(room['players']) if p['socketId'] == request.sid), -1)
    name = room['players'][idx]['name'] if idx >= 0 else 'A player'
    if idx >= 0:
        room['players'].pop(idx)
    
    room['active'] = False
    socketio.emit('player_left', {'name': name, 'room': sanitize_room(room)}, to=code)
    
    # Clean up empty rooms after 10 min
    if len(room['players']) == 0:
        def delayed_remove():
            time.sleep(600)
            r = rooms.get(code)
            if r and len(r['players']) == 0:
                rooms.pop(code, None)
        threading.Thread(target=delayed_remove, daemon=True).start()
        
    client_data.pop(request.sid, None)

# ── CATCH-ALL (SPA) ───────────────────────────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory('public', path)
    return send_from_directory('public', 'index.html')

# ── CLEANUP OLD ROOMS every hour ──────────────────────────
def hourly_cleanup():
    while True:
        time.sleep(3600)
        cutoff = time.time() - 3600
        keys_to_delete = [c for c, r in rooms.items() if r['createdAt'] < cutoff]
        for c in keys_to_delete:
            rooms.pop(c, None)

threading.Thread(target=hourly_cleanup, daemon=True).start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"🎮 NEXUS X·O server running on port {port}")
    socketio.run(app, host='0.0.0.0', port=port)
