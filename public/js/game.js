/* ══════════════════════════════════════════════════════
   NETWORKING / SOCKET.IO
══════════════════════════════════════════════════════ */
let socket = null;
let roomCode = null;
let myMark = null;

try {
  socket = io();
} catch(e){
  console.log("Socket.IO not found. Offline only.");
}

if(socket) {
  socket.on('error', (err) => {
    alert(err.msg || 'An error occurred');
    resetToCover();
  });

  socket.on('joined', (data) => {
    roomCode = data.room.code;
    myMark = data.mark;
    cfg.diff = data.room.difficulty;
    cfg.session = data.room.sessionName;
    GRID_N = data.room.gridN;
    WIN_N = data.room.winN;
    WIN_COMBOS = buildWinCombos(GRID_N, WIN_N);
    
    // update URL so link can be shared natively
    const url = new URL(window.location);
    url.searchParams.set('room', roomCode);
    window.history.pushState({}, '', url);

    document.getElementById('lobby-title').textContent = 'Waiting for Opponent';
    document.getElementById('lobby-subtitle').textContent = 'They can join by opening the link below:';
    document.getElementById('lobby-link').textContent = window.location.href;
    document.getElementById('lobby-link-wrap').style.display = 'block';
  });

  socket.on('room_update', (room) => {
    // If we're the only one, wait. Otherwise setup players.
    if(room.players.length === 2 && cfg.mode === 'online'){
      // Set names locally
      const pX = room.players.find(p => p.mark === 'X');
      const pO = room.players.find(p => p.mark === 'O');
      cfg.nameX = pX ? pX.name : 'Player X';
      cfg.nameO = pO ? pO.name : 'Player O';
      document.getElementById('disp-x').textContent = cfg.nameX;
      document.getElementById('disp-o').textContent = cfg.nameO;
      
      // Update ui based on who we are
      document.getElementById('ai-log-title').textContent = "Live Chat";
      document.getElementById('ai-av-icon').textContent = "💬";
    }
  });

  socket.on('game_start', (room) => {
    document.getElementById('lobby').style.display = 'none';
    board = room.board.slice();
    cur = room.turn;
    active = room.active;
    curRoomScores = room.scores;
    
    // Sync UI
    buildBoard();
    updateOnlineBoardUI();
    
    document.getElementById('score-x').textContent = room.scores.X;
    document.getElementById('score-o').textContent = room.scores.O;
    document.getElementById('score-tie').textContent = room.scores.tie;
    setTurnUI();
    showScreen('game');
    
    // Enable chat input
    document.getElementById('chat-input-container').style.display = 'block';
    hideBanner();
    
    // Clear chat log
    const container = document.getElementById('ai-msgs');
    container.innerHTML = '';
    pushMsg('Connection established. Good luck!');
  });

  socket.on('move_made', (data) => {
    board = data.board;
    cur = data.turn;
    updateOnlineBoardUI();
    setTurnUI();
  });

  socket.on('game_over', (data) => {
    board = data.board;
    active = false;
    updateOnlineBoardUI();
    curRoomScores = data.scores;
    document.getElementById('score-x').textContent = data.scores.X;
    document.getElementById('score-o').textContent = data.scores.O;
    document.getElementById('score-tie').textContent = data.scores.tie;

    if(data.result === 'win'){
      if(data.combo){
        data.combo.forEach(i => document.querySelector(`.cell[data-i="${i}"]`).classList.add('winner-cell'));
      }
      const mx = myMark === data.winner;
      const t = mx ? 'YOU WON!' : 'YOU LOST';
      const sm = (data.winnerName || data.winner) + ' takes the round';
      const c = data.winner === 'X' ? 'var(--p1)' : 'var(--p2)';
      setTimeout(() => showBanner(mx?'🏆':'😭', t, sm.toUpperCase(), data.winner), 500);
      if(mx) confettiBurst(c);
    } else {
      setTimeout(() => showBanner('🤝', 'DRAW!', 'No winner this round', 'tie'), 500);
    }
  });

  socket.on('chat_msg', (data) => {
    pushMsg(`${data.name} (${data.mark}): ${data.text}`);
  });

  socket.on('player_left', (data) => {
    pushMsg(`⚠️ ${data.name} disconnected.`);
    active = false;
  });
}

function updateOnlineBoardUI() {
  for(let i=0; i<GRID_N*GRID_N; i++) {
    const el = document.querySelector(`.cell[data-i="${i}"]`);
    if(board[i] !== ''){
      el.classList.add('taken');
      const markPct = GRID_N === 7 ? '62%' : GRID_N === 5 ? '58%' : '55%';
      el.innerHTML = board[i] === 'X' ? svgX(markPct) : svgO(markPct);
    } else {
      el.classList.remove('taken', 'winner-cell');
      el.innerHTML = '';
    }
  }
}

let curRoomScores = {X:0, O:0, tie:0};

/* ══════════════════════════════════════════════════════
   GRID CONFIG — Easy=3×3 | Medium=5×5 | Hard=7×7
══════════════════════════════════════════════════════ */
const GRID_CFG={
  easy:{size:3,win:3},
  medium:{size:5,win:4},
  hard:{size:7,win:5}
};

/* Build combos */
function buildWinCombos(N,W){
  const combos=[];
  for(let r=0;r<N;r++){
    for(let c=0;c<=N-W;c++){
      const row=[];for(let k=0;k<W;k++)row.push(r*N+c+k);
      combos.push(row);
    }
  }
  for(let c=0;c<N;c++){
    for(let r=0;r<=N-W;r++){
      const col=[];for(let k=0;k<W;k++)col.push((r+k)*N+c);
      combos.push(col);
    }
  }
  for(let r=0;r<=N-W;r++){
    for(let c=0;c<=N-W;c++){
      const d1=[];for(let k=0;k<W;k++)d1.push((r+k)*N+(c+k));
      combos.push(d1);
    }
  }
  for(let r=0;r<=N-W;r++){
    for(let c=W-1;c<N;c++){
      const d2=[];for(let k=0;k<W;k++)d2.push((r+k)*N+(c-k));
      combos.push(d2);
    }
  }
  return combos;
}

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let cfg={mode:'online',diff:'easy',first:'X',nameX:'Player X',nameO:'Player O',session:'NEXUS GAME',theme:'neon',darkMode:true};
let board=[],cur='X',active=false,aiThinking=false;
let scores={X:0,O:0,tie:0};
let WIN_COMBOS=[]; 
let GRID_N=3,WIN_N=3;

/* ══════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════ */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function resetToCover() {
  window.history.pushState({}, '', '/');
  roomCode = null;
  myMark = null;
  if(socket) socket.disconnect();
  setTimeout(()=> { if(socket) socket.connect(); }, 500); // refresh socket
  showScreen('cover');
}

/* ══════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════ */
function applyTheme(t){
  const body=document.body;
  body.classList.remove('theme-neon','theme-retro','theme-ice','theme-fire','theme-forest');
  if(t!=='neon')body.classList.add('theme-'+t);
  cfg.theme=t;
  document.querySelectorAll('.tswatch').forEach(s=>s.classList.toggle('picked',s.dataset.theme===t));
}
function pickTheme(t){
  applyTheme(t);
  const sbt=document.getElementById('sbar-theme');
  if(sbt)sbt.querySelector('.sbar-txt').textContent=t.charAt(0).toUpperCase()+t.slice(1);
}
function toggleThemePanel(){
  const p=document.getElementById('theme-panel');
  p.style.display=p.style.display==='none'?'block':'none';
}
function toggleMode(){
  cfg.darkMode=!cfg.darkMode;
  document.body.classList.toggle('light',!cfg.darkMode);
  const pill=document.getElementById('mode-pill');
  if(pill)pill.classList.toggle('on',!cfg.darkMode);
  document.getElementById('dm-dark').classList.toggle('sel',cfg.darkMode);
  document.getElementById('dm-light').classList.toggle('sel',!cfg.darkMode);
}
function pickDisplayMode(m){
  cfg.darkMode=(m==='dark');
  document.body.classList.toggle('light',!cfg.darkMode);
  const pill=document.getElementById('mode-pill');
  if(pill)pill.classList.toggle('on',!cfg.darkMode);
  ['dark','light'].forEach(x=>{document.getElementById('dm-'+x).classList.toggle('sel',x===m);});
}

/* ══════════════════════════════════════════════════════
   SETTINGS BAR
══════════════════════════════════════════════════════ */
function quickMode(m){
  cfg.mode=m;
  ['ai','2p', 'online'].forEach(x=>document.getElementById('sbar-'+x)?.classList.toggle('active',x===m));
  setupMode(m);
}
const diffCycle=['easy','medium','hard'];
const diffIcons={easy:'🟢',medium:'🟡',hard:'🔴'};
const diffGridLabel={easy:'3×3',medium:'5×5',hard:'7×7'};
function cycleDiff(){
  const idx=diffCycle.indexOf(cfg.diff);
  pickLevel(diffCycle[(idx+1)%3]);
}
function updateSbarDiff(){
  const el=document.getElementById('sbar-diff-icon');
  const tl=document.getElementById('sbar-diff-txt');
  if(el)el.textContent=diffIcons[cfg.diff];
  if(tl)tl.textContent=diffGridLabel[cfg.diff];
}

/* ══════════════════════════════════════════════════════
   SETUP LOGIC
══════════════════════════════════════════════════════ */
function setupMode(m){
  cfg.mode=m;
  const ai=document.getElementById('s-mode-ai');
  const tp=document.getElementById('s-mode-2p');
  const onl=document.getElementById('s-mode-on');
  
  [ai,tp,onl].forEach(b=>{if(b) b.classList.remove('sel','ca');});
  if(m==='ai') ai.classList.add('sel','ca');
  else if(m==='2p') tp.classList.add('sel','ca');
  else if(m==='online') onl.classList.add('sel','ca');
  
  const lblO=document.getElementById('lbl-o'),inO=document.getElementById('name-o');
  
  if(m==='ai'){
    lblO.textContent='○ Computer'; inO.placeholder='Computer'; 
    if(inO.value==='Player O' || inO.value==='') inO.value='Computer';
    document.getElementById('join-room-section').style.display='none';
    document.getElementById('pname-o-group').style.display='flex';
    document.getElementById('first-move-cfg').style.display='block';
    document.getElementById('lbl-x').textContent='✕ Player X';
  } else if(m==='2p'){
    lblO.textContent='○ Player O'; inO.placeholder='Player O';
    if(inO.value==='Computer' || inO.value==='') inO.value='Player O';
    document.getElementById('join-room-section').style.display='none';
    document.getElementById('pname-o-group').style.display='flex';
    document.getElementById('first-move-cfg').style.display='block';
    document.getElementById('lbl-x').textContent='✕ Player X';
  } else if(m==='online') {
    // Hide opponent name input since it comes from socket
    document.getElementById('pname-o-group').style.display='none';
    document.getElementById('join-room-section').style.display='block';
    document.getElementById('first-move-cfg').style.display='none';
    document.getElementById('lbl-x').textContent='Your Name';
  }
  
  const note=document.getElementById('diff-2p-note');
  if(note)note.style.display=(m==='2p' || m==='online')?'block':'none';
  ['ai','2p', 'online'].forEach(x=>document.getElementById('sbar-'+x)?.classList.toggle('active',x===m));
}

function pickLevel(l){
  cfg.diff=l;
  ['easy','medium','hard'].forEach(x=>document.getElementById('lvl-'+x)?.classList.toggle('picked',x===l));
  updateSbarDiff();
}
function pickFirst(p){
  cfg.first=p;
  ['X','O'].forEach(x=>{
    const b=document.getElementById('first-'+x.toLowerCase());
    b.classList.remove('sel','c1','c2');
    if(x===p){b.classList.add('sel');b.classList.add(x==='X'?'c1':'c2');}
  });
}

async function launchGame(){
  cfg.nameX=document.getElementById('name-x').value.trim()||'Player X';
  cfg.nameO=document.getElementById('name-o').value.trim()||(cfg.mode==='ai'?'Computer':'Player O');
  cfg.session=document.getElementById('session-name').value.trim().toUpperCase()||'MY GAME';
  
  document.getElementById('g-session').textContent=cfg.session;
  
  if(cfg.mode === 'online') {
      const codeInput = document.getElementById('join-code').value.trim().toUpperCase();
      if(codeInput) {
        document.getElementById('lobby').style.display = 'flex';
        document.getElementById('lobby-title').textContent = 'Joining Room...';
        document.getElementById('lobby-subtitle').textContent = 'Connecting via code: ' + codeInput;
        socket.emit('join_room', { code: codeInput, playerName: cfg.nameX });
      } else {
        document.getElementById('lobby').style.display = 'flex';
        // Hit API to create
        try {
            const res = await fetch('/api/room', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ difficulty: cfg.diff, sessionName: cfg.session })
            });
            const data = await res.json();
            socket.emit('join_room', { code: data.code, playerName: cfg.nameX });
        } catch(e) {
            alert("Failed to connect to server!");
            document.getElementById('lobby').style.display = 'none';
        }
      }
      return; // Rest of game flow handled by socket events
  }

  // Local modes
  document.getElementById('ai-log-wrap').style.display=cfg.mode==='ai'?'':'none';
  document.getElementById('disp-x').textContent=cfg.nameX;
  document.getElementById('disp-o').textContent=cfg.nameO;
  
  if(cfg.mode === 'ai') {
    document.getElementById('ai-log-title').textContent = "AI Commentary";
    document.getElementById('ai-av-icon').textContent = "🤖";
    document.getElementById('chat-input-container').style.display = 'none';
  }

  const gc=GRID_CFG[cfg.diff];
  GRID_N=gc.size; WIN_N=gc.win;
  WIN_COMBOS=buildWinCombos(GRID_N,WIN_N);
  
  const gridLabel=`${GRID_N}×${GRID_N}`;
  document.getElementById('g-badge').textContent=
    cfg.mode==='2p'?`${cfg.diff.toUpperCase()} · ${gridLabel} · 2P`:
    `${cfg.diff.toUpperCase()} · ${gridLabel} · VS AI`;

  scores={X:0,O:0,tie:0};
  updateScoreUI();
  newRound();
  showScreen('game');
}

/* ══════════════════════════════════════════════════════
   GAME — dynamic grid
══════════════════════════════════════════════════════ */
function newRound(){
  board=Array(GRID_N*GRID_N).fill('');
  cur=cfg.first;
  active=true;
  aiThinking=false;
  hideBanner();
  buildBoard();
  setTurnUI();
  if(cfg.mode==='ai'&&cur==='O')scheduleAI();
}

function buildBoard(){
  const el=document.getElementById('board');
  el.innerHTML='';
  el.style.gridTemplateColumns=`repeat(${GRID_N},1fr)`;

  const vw=Math.min(window.innerWidth,640);
  const pad=28; 
  const gap=(GRID_N-1)*6;
  const cellPx=Math.floor((vw-pad-gap)/GRID_N);
  const clamped=Math.max(36,Math.min(cellPx,GRID_N===3?126:GRID_N===5?90:66));

  el.style.gap=GRID_N===7?'5px':GRID_N===5?'6px':'8px';

  for(let i=0;i<GRID_N*GRID_N;i++){
    const c=document.createElement('div');
    c.className='cell';
    c.dataset.i=i;
    c.style.width=clamped+'px';
    c.style.height=clamped+'px';
    c.style.borderRadius=GRID_N===7?'8px':GRID_N===5?'10px':'12px';
    c.addEventListener('click',()=>handleClick(i));
    el.appendChild(c);
  }
}

function handleClick(i){
  if(!active||board[i]||aiThinking)return;
  
  if(cfg.mode === 'online') {
    if(cur !== myMark) return; // not my turn
    socket.emit('make_move', {code: roomCode, index: i});
    return;
  }
  
  if(cfg.mode==='ai'&&cur==='O')return;
  place(i,cur);
}

function place(i,p){
  board[i]=p;
  const cell=document.querySelector(`.cell[data-i="${i}"]`);
  cell.classList.add('taken');
  const markPct=GRID_N===7?'62%':GRID_N===5?'58%':'55%';
  cell.innerHTML=p==='X'?svgX(markPct):svgO(markPct);
  
  const res=checkResult();
  if(res){endRound(res);return;}
  
  cur=cur==='X'?'O':'X';
  setTurnUI();
  if(cfg.mode==='ai'&&cur==='O'&&active)scheduleAI();
}

function setTurnUI(){
  const isX=cur==='X';
  document.getElementById('card-x').classList.toggle('active',isX);
  document.getElementById('card-o').classList.toggle('active',!isX);
  const dot=document.getElementById('sp-dot');
  const col=isX?'var(--p1)':'var(--p2)';
  dot.style.background=col;dot.style.boxShadow=`0 0 7px ${col}`;
  
  if(cfg.mode === 'online') {
    if(cur === myMark) document.getElementById('status-text').textContent = "YOUR TURN";
    else document.getElementById('status-text').textContent = "OPPONENT'S TURN";
    return;
  }
  
  const name=isX?cfg.nameX:cfg.nameO;
  const sfx=(cfg.mode==='ai'&&!isX)?" — THINKING":"'S TURN";
  document.getElementById('status-text').textContent=(name+sfx).toUpperCase();
}

/* ══════════════════════════════════════════════════════
   AI logic
══════════════════════════════════════════════════════ */
function scheduleAI(){
  aiThinking=true;
  document.getElementById('think-ov').classList.add('on');
  setTurnUI();
  const delay=GRID_N===3?550+Math.random()*600:700+Math.random()*800;
  setTimeout(()=>{
    let mv;
    if(GRID_N===3){
      mv=mmMove3();
    } else {
      mv=heuristicMove();
    }
    document.getElementById('think-ov').classList.remove('on');
    aiThinking=false;
    place(mv,'O');
    fetchComment();
  },delay);
}

function easyMove(){
  const e=board.map((v,i)=>v?-1:i).filter(i=>i!==-1);
  return e[Math.floor(Math.random()*e.length)];
}

function mmMove3(){
  let best=-Infinity,bm=-1;
  for(let i=0;i<9;i++)if(!board[i]){board[i]='O';const s=mm3(board,0,false,-Infinity,Infinity);board[i]='';if(s>best){best=s;bm=i;}}
  return bm;
}
function mm3(b,d,isMax,a,be){
  const w=getWinnerLocal(b);
  if(w==='O')return 10-d;if(w==='X')return d-10;if(b.every(c=>c))return 0;
  if(isMax){let best=-Infinity;for(let i=0;i<9;i++)if(!b[i]){b[i]='O';best=Math.max(best,mm3(b,d+1,false,a,be));b[i]='';a=Math.max(a,best);if(be<=a)break;}return best;}
  else{let best=Infinity;for(let i=0;i<9;i++)if(!b[i]){b[i]='X';best=Math.min(best,mm3(b,d+1,true,a,be));b[i]='';be=Math.min(be,best);if(be<=a)break;}return best;}
}

function heuristicMove(){
  const empty=board.map((v,i)=>v?-1:i).filter(i=>i!==-1);
  for(const i of empty){board[i]='O';if(getWinnerLocal(board)){board[i]='';return i;}board[i]='';}
  for(const i of empty){board[i]='X';if(getWinnerLocal(board)){board[i]='';return i;}board[i]='';}
  let bestScore=-Infinity,bestMove=empty[0];
  for(const i of empty){
    // We add the opponent's score instead of subtracting, because we WANT to block their best lines
    const score=scoreCell(i,'O') + scoreCell(i,'X')*0.9;
    if(score>bestScore){bestScore=score;bestMove=i;}
  }
  return bestMove;
}

function scoreCell(idx,player){
  const N=GRID_N,W=WIN_N;
  let score=0;
  for(const combo of WIN_COMBOS){
    if(!combo.includes(idx))continue;
    const cells=combo.map(i=>board[i]);
    if(cells.some(v=>v&&v!==player))continue;
    const filled=cells.filter(v=>v===player).length;
    score+=Math.pow(10,filled);
    const r=Math.floor(idx/N),c=idx%N,mid=(N-1)/2;
    score+=(W-Math.abs(r-mid)-Math.abs(c-mid))*2;
  }
  return score;
}

/* ══════════════════════════════════════════════════════
   RESULT CHECK
══════════════════════════════════════════════════════ */
function checkResult(){
  const w=getWinnerLocal(board);
  if(w)return{type:'win',player:w};
  if(board.every(c=>c))return{type:'draw'};
  return null;
}
function getWinnerLocal(b){
  for(const combo of WIN_COMBOS){
    const first=b[combo[0]];
    if(first&&combo.every(i=>b[i]===first))return first;
  }
  return null;
}
function getWinCombo(b){
  for(const combo of WIN_COMBOS){
    const first=b[combo[0]];
    if(first&&combo.every(i=>b[i]===first))return combo;
  }
  return null;
}

function endRound(res){
  active=false;
  if(res.type==='win'){
    scores[res.player]++;
    const combo=getWinCombo(board);
    combo&&combo.forEach(i=>document.querySelector(`.cell[data-i="${i}"]`).classList.add('winner-cell'));
    updateScoreUI();
    const isAI=cfg.mode==='ai'&&res.player==='O';
    const name=res.player==='X'?cfg.nameX:cfg.nameO;
    setTimeout(()=>showBanner(isAI?'🤖':'🏆',isAI?'AI WINS!':'WINNER!',(name+' takes the round').toUpperCase(),res.player),900);
    confettiBurst(res.player==='X'?'var(--p1)':'var(--p2)');
  }else{
    scores.tie++;updateScoreUI();
    setTimeout(()=>showBanner('🤝','DRAW!','No winner this round','tie'),800);
  }
}

function updateScoreUI(){
  document.getElementById('score-x').textContent=scores.X;
  document.getElementById('score-o').textContent=scores.O;
  document.getElementById('score-tie').textContent=scores.tie;
  document.getElementById('wb-sx').textContent=scores.X;
  document.getElementById('wb-so').textContent=scores.O;
  document.getElementById('wb-st').textContent=scores.tie;
  document.getElementById('wb-lx').textContent=cfg.nameX;
  document.getElementById('wb-lo').textContent=cfg.nameO;
}
function resetAll(){
  if(cfg.mode === 'online') return;
  scores={X:0,O:0,tie:0};updateScoreUI();newRound();
}

function requestRematch() {
  if(cfg.mode === 'online') {
    socket.emit('rematch', {code: roomCode});
    document.getElementById('win-banner').classList.remove('show');
  } else {
    newRound();
    document.getElementById('win-banner').classList.remove('show');
  }
}

/* ══════════════════════════════════════════════════════
   BANNER / MODAL / EXTRAS
══════════════════════════════════════════════════════ */
function showBanner(emoji,title,sub,player){
  document.getElementById('wb-emoji').textContent=emoji;
  document.getElementById('wb-title').textContent=title;
  document.getElementById('wb-sub').textContent=sub;
  const c={X:'var(--p1)',O:'var(--p2)',tie:'var(--acc)'};
  document.getElementById('wb-title').style.color=c[player]||'var(--text)';
  document.getElementById('win-banner').classList.add('show');
}
function hideBanner(){document.getElementById('win-banner').classList.remove('show');}
function openHowTo(){document.getElementById('htp-modal').classList.add('open');}
function closeHowTo(){document.getElementById('htp-modal').classList.remove('open');}

function svgX(sz='55%'){return `<svg class="mark" style="width:${sz};height:${sz}" viewBox="0 0 80 80" fill="none"><defs><filter id="gfx"><feGaussianBlur stdDeviation="3"/></filter></defs><line x1="16" y1="16" x2="64" y2="64" stroke="var(--p1)" stroke-width="9" stroke-linecap="round"/><line x1="64" y1="16" x2="16" y2="64" stroke="var(--p1)" stroke-width="9" stroke-linecap="round"/><line x1="16" y1="16" x2="64" y2="64" stroke="var(--p1)" stroke-width="5" filter="url(#gfx)" opacity="0.5"/><line x1="64" y1="16" x2="16" y2="64" stroke="var(--p1)" stroke-width="5" filter="url(#gfx)" opacity="0.5"/></svg>`;}
function svgO(sz='55%'){return `<svg class="mark" style="width:${sz};height:${sz}" viewBox="0 0 80 80" fill="none"><defs><filter id="gfo"><feGaussianBlur stdDeviation="3"/></filter></defs><circle cx="40" cy="40" r="23" stroke="var(--p2)" stroke-width="9"/><circle cx="40" cy="40" r="23" stroke="var(--p2)" stroke-width="5" filter="url(#gfo)" opacity="0.5"/></svg>`;}

async function fetchComment(){
  if(cfg.mode!=='ai')return;
  const gridInfo=`${GRID_N}×${GRID_N} grid, need ${WIN_N} in a row`;
  const prompt=`You are a sharp AI playing ${gridInfo} Tic Tac Toe as O against ${cfg.nameX}. Give a clever cocky one-liner about your move — max 12 words. No quotes.`;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:60,messages:[{role:'user',content:prompt}]})});
    const d=await r.json();const msg=d.content?.[0]?.text?.trim();
    if(msg)pushMsg(msg);
  }catch{
    const fb=['Calculating your downfall...','The bigger the board, the bigger my victory.','You never stood a chance.','My heuristics see all possible futures.'];
    pushMsg(fb[Math.floor(Math.random()*fb.length)]);
  }
}
function pushMsg(t){
  const c=document.getElementById('ai-msgs');
  const m=document.createElement('div');m.className='ai-m';m.textContent=t;
  c.appendChild(m);c.scrollTop=c.scrollHeight;
  while(c.children.length>4)c.removeChild(c.firstChild);
}

function sendChat() {
  const input = document.getElementById('chat-input');
  if(!input.value.trim() || !socket || !roomCode) return;
  socket.emit('chat', { code: roomCode, msg: input.value.trim() });
  input.value = '';
}
document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

function copyLink() {
  const t = document.getElementById('lobby-link').textContent;
  navigator.clipboard.writeText(t).then(() => {
    document.getElementById('copy-status').textContent = 'Copied to clipboard!';
    setTimeout(() => document.getElementById('copy-status').textContent = 'Click to Copy!', 2000);
  });
}

function confettiBurst(color){
  const cx=window.innerWidth/2,cy=window.innerHeight/2;
  for(let i=0;i<26;i++){
    const p=document.createElement('div');p.className='conf';
    const ang=(i/26)*360,dist=80+Math.random()*160;
    const tx=Math.cos(ang*Math.PI/180)*dist,ty=Math.sin(ang*Math.PI/180)*dist;
    const sz=5+Math.random()*8;
    p.style.cssText=`left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;background:${color};box-shadow:0 0 9px ${color};--tx:${tx}px;--ty:${ty}px;animation-duration:${0.6+Math.random()*0.5}s`;
    document.body.appendChild(p);setTimeout(()=>p.remove(),1300);
  }
}

const HC=[['hx','he','ho','he','hx','he','ho','he','hx'],['hx','ho','hx','ho','he','hx','he','hx','ho'],['he','hx','he','ho','he','hx','he','ho','hx']];
let hci=0;
function cycleHero(){
  const cells=document.querySelectorAll('.hcell');
  if(!cells.length) return;
  const st=HC[hci++%HC.length];
  cells.forEach((c,i)=>{c.className='hcell '+st[i];c.textContent=st[i]==='hx'?('X'):(st[i]==='ho'?'O':'·');});
}
setInterval(cycleHero,2600);

/* Init */
WIN_COMBOS=buildWinCombos(3,3); 
quickMode('online');
updateSbarDiff();

// Check if URL has ?room=XYZ
window.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('room');
    if(r) {
        showScreen('setup');
        quickMode('online');
        document.getElementById('join-code').value = r.toUpperCase();
    }
});
