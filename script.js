const PLATFORM_W = 78;
const PLATFORM_H = 20;
const PLAYER_W   = 48;
const PLAYER_H   = 48;
const CHUNK_H    = 900;
const BASELINE   = 100000;

// Фізика — прості значення як на 60fps.
// dt = реальний час кадру / (1000/60), жорстко обмежений до [0.5 .. 1.0].
// Так 120fps дає dt≈0.5 (вдвічі менший крок), 60fps → dt≈1.0, 30fps → 1.0 (обрізано).
const TARGET_FPS  = 60;
const GRAVITY     = 0.55;
const MOVE_SPD    = 7.5;
const JUMP_PWR    = 15.5;
const ACCEL       = 1.2;
const FRICTION    = 0.82;

// ─── STATE ─────────────────────────────────────────────────────────────────
let state='idle', score=0, frameId;
let record=parseInt(localStorage.getItem('swampRecord')||'0');
let sessionBest=[];
let px, py, pvx, pvy;
let moveDir=0;
let platforms=[], flowers=[];
let cameraOffset=0;
let maxHeight=0;
let diffLevel=0;
let topGenY=0;
let lastTime=0;   // для delta-time

// ─── DOM ───────────────────────────────────────────────────────────────────
const worldEl    = document.getElementById('world');
const playerEl   = document.getElementById('player');
const viewportEl = document.getElementById('viewport');
const scoreEl    = document.getElementById('scoreVal');
const recordEl   = document.getElementById('recordVal');
recordEl.textContent = record;

// ─── COORDINATES ───────────────────────────────────────────────────────────
function toCssTop(y, h){ return BASELINE - y - h; }

// ─── PLATFORM / FLOWER ─────────────────────────────────────────────────────
function makePlatform(x, y, moving){
  const el = document.createElement('div');
  el.className = 'platform' + (moving ? ' moving' : '');
  el.style.cssText = `position:absolute;width:${PLATFORM_W}px;height:${PLATFORM_H}px;left:${x}px;top:${toCssTop(y,PLATFORM_H)}px;`;
  worldEl.appendChild(el);
  return { x, y, w:PLATFORM_W, h:PLATFORM_H, el, moving,
           dir: moving ? (Math.random()<.5?1:-1) : 0,
           speed: 0.55 + Math.random()*0.85,
           range: 40 + Math.random()*50,
           originX: x };
}
function syncPlatformPos(p){
  p.el.style.left = p.x + 'px';
  p.el.style.top  = toCssTop(p.y, p.h) + 'px';
}
function makeFlower(p){
  const fx = p.x + PLATFORM_W/2 - 11, fy = p.y + PLATFORM_H + 2;
  const fe = document.createElement('div'); fe.className = 'flower';
  fe.textContent = ['🌸','🌺','🌼','🌻','🌷'][Math.floor(Math.random()*5)];
  fe.style.cssText = `position:absolute;font-size:20px;line-height:1;text-shadow:0 0 6px #fff8;animation:floatFlower 3s ease-in-out infinite;left:${fx}px;top:${toCssTop(fy,22)}px;`;
  worldEl.appendChild(fe);
  return {x:fx, y:fy, taken:false, el:fe};
}

// ─── INFINITE GENERATION ───────────────────────────────────────────────────
function generateUpTo(targetY){
  const viewW = viewportEl.offsetWidth || 380;
  while(topGenY < targetY){
    const gap = 88 + Math.random()*55 - Math.min(diffLevel*2, 22);
    topGenY += gap;
    diffLevel = Math.floor(topGenY / 600);
    const margin = 12;
    const x = margin + Math.random()*(viewW - PLATFORM_W - margin*2);
    const moving = diffLevel >= 2 && Math.random() < Math.min(0.08 + diffLevel*0.07, 0.45);
    const p = makePlatform(x, topGenY, moving);
    platforms.push(p);
    if(Math.random() > 0.35) flowers.push(makeFlower(p));
    if(Math.floor(topGenY/500) > Math.floor((topGenY-gap)/500)){
      const hv = Math.floor(topGenY/500)*500;
      const el = document.createElement('div'); el.className = 'height-marker';
      el.textContent = `↑ ${hv}`; el.style.top = toCssTop(hv,14)+'px';
      worldEl.appendChild(el);
    }
  }
}
function cullBelow(minY){
  platforms = platforms.filter(p=>{ if(p.y+p.h<minY){p.el.remove();return false;} return true; });
  flowers   = flowers.filter(f=>{ if(!f.taken&&f.y<minY){f.el.remove();return false;} return true; });
}

// ─── LIANA BUILDER ─────────────────────────────────────────────────────────
function buildLiana(side, viewW){
  // side: 0 = ліворуч, 1 = праворуч
  const TILE = 440;
  const H    = BASELINE + 2000;
  const sx   = side === 0 ? 0 : viewW - 36;

  const el = document.createElement('div');
  el.className = 'liana';
  // Фіксована ширина та позиція — НЕ трансформуємо, щоб не блимало
  el.style.cssText = `left:${sx}px;top:0;width:36px;height:${H}px;`;

  // SVG-тайл
  let s = `<svg viewBox="0 0 36 ${TILE}" xmlns="http://www.w3.org/2000/svg" width="36" height="${TILE}">`;
  // стебло
  s += `<path d="M18 0 Q26 110 18 220 Q10 330 18 440" stroke="#2a5e30" stroke-width="3.5" fill="none"/>`;
  s += `<path d="M18 0 Q25 110 18 220 Q11 330 18 440" stroke="#3d8a42" stroke-width="1.2" fill="none" opacity=".45"/>`;
  // листя — чергуємо сторони
  const leaves = [[80,1],[195,-1],[305,1],[405,-1]];
  for(const [ly, dir] of leaves){
    const lx = 18 + dir*4, ex = 18 + dir*20, ey = ly - 18;
    s += `<path d="M${lx} ${ly} Q${ex} ${ey} ${lx+dir*5} ${ly-30}" stroke="#2d7035" stroke-width="1.5" fill="#255c2b" fill-opacity=".78"/>`;
    s += `<path d="M${lx} ${ly} Q${ex-dir*3} ${ey+4} ${lx+dir*3} ${ly-26}" stroke="#3d9042" stroke-width=".7" fill="none" opacity=".5"/>`;
  }
  s += `</svg>`;

  const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  el.style.backgroundImage  = `url("${encoded}")`;
  el.style.backgroundRepeat = 'repeat-y';
  el.style.backgroundSize   = `36px ${TILE}px`;
  // Важливо: НЕ задаємо animation — це джерело блимання
  worldEl.appendChild(el);
}

// ─── BUILD WORLD ───────────────────────────────────────────────────────────
function buildWorld(){
  Array.from(worldEl.children).forEach(c=>{ if(c.id !== 'player') c.remove(); });
  platforms=[]; flowers=[];
  topGenY=0; cameraOffset=0; diffLevel=0; maxHeight=0; pvx=0; pvy=0; lastTime=0;

  const H = BASELINE + 2000;
  worldEl.style.cssText = `position:absolute;top:0;left:0;width:100%;height:${H}px;will-change:transform;`;
  worldEl.style.transform = 'translateY(0)';

  const viewW = viewportEl.offsetWidth || 380;

  // ліани — без sway анімації
  buildLiana(0, viewW);
  buildLiana(1, viewW);

  // бульбашки
  for(let i=0; i<12; i++){
    const b = document.createElement('div'); b.className = 'bubble';
    const sz = 4 + Math.random()*8;
    b.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*96}%;top:${BASELINE - Math.random()*300}px;animation-duration:${4+Math.random()*6}s;animation-delay:${Math.random()*6}s;`;
    worldEl.appendChild(b);
  }

  // перша платформа
  const fp = makePlatform(viewW/2 - PLATFORM_W/2, 60, false);
  platforms.push(fp); topGenY = 60;
  generateUpTo(CHUNK_H * 3);

  px = fp.x + PLATFORM_W/2 - PLAYER_W/2;
  py = fp.y + PLATFORM_H;
  score = 0; scoreEl.textContent = 0;
  playerEl.style.display = 'block';
}

// ─── CONTROLS ──────────────────────────────────────────────────────────────
function startMove(dir){ moveDir = dir; }
function stopMove()    { moveDir = 0;   }
document.addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') startMove(-1); if(e.key==='ArrowRight') startMove(1); });
document.addEventListener('keyup',   e=>{ if(e.key==='ArrowLeft'||e.key==='ArrowRight') stopMove(); });

// ─── GAME ──────────────────────────────────────────────────────────────────
function startGame(){
  document.getElementById('startScreen').style.display  = 'none';
  document.getElementById('gameOverScreen').style.display = 'none';
  buildWorld(); state = 'play';
  if(frameId) cancelAnimationFrame(frameId);
  lastTime = performance.now();
  loop(lastTime);
}

function triggerDead(){
  state = 'dead';
  playerEl.classList.add('flash');
  sessionBest.push(score); sessionBest.sort((a,b)=>b-a);
  if(sessionBest.length > 5) sessionBest.length = 5;
  if(score > record){ record = score; localStorage.setItem('swampRecord', record); recordEl.textContent = record; }
  document.getElementById('goScore').textContent  = score;
  document.getElementById('goRecord').textContent = record;
  document.getElementById('newRecordBadge').style.display = (score >= record && score > 0) ? 'block' : 'none';
  const tbl = document.getElementById('topList'); tbl.innerHTML = '';
  sessionBest.forEach((s,i)=>{ const r=tbl.insertRow(); r.insertCell().textContent=['🥇','🥈','🥉','4️⃣','5️⃣'][i]; r.insertCell().textContent=s+' квіток'; });
  document.getElementById('gameOverScreen').style.display = 'flex';
}

function loop(ts){
  if(state !== 'play') return;
  frameId = requestAnimationFrame(loop);

  // ── delta time ──────────────────────────────────────────────────────────
  // Нормалізований dt: 60fps→1.0, 120fps→0.5, 30fps→1.0 (обрізано знизу і зверху)
  // Це виключає "флеш" на 120fps і "повільно" на 30fps
  const rawDt = (ts - lastTime) / (1000 / TARGET_FPS);
  const dt = Math.min(Math.max(rawDt, 0.3), 1.0);
  lastTime = ts;

  const viewW = viewportEl.offsetWidth || 380;
  const vpH   = viewportEl.offsetHeight;

  // ── рух ─────────────────────────────────────────────────────────────────
  if(moveDir !== 0){
    pvx += moveDir * ACCEL * dt;
    pvx  = Math.max(-MOVE_SPD, Math.min(MOVE_SPD, pvx));
  } else {
    pvx *= Math.pow(FRICTION, dt);
  }

  px += pvx * dt;
  if(px < -PLAYER_W) px = viewW;
  if(px > viewW)     px = -PLAYER_W;

  // ── гравітація ──────────────────────────────────────────────────────────
  pvy -= GRAVITY * dt;
  py  += pvy * dt;

  // ── платформи ───────────────────────────────────────────────────────────
  platforms.forEach(p => {
    if(p.moving){
      p.x += p.dir * p.speed * dt;
      if(Math.abs(p.x - p.originX) > p.range) p.dir *= -1;
      syncPlatformPos(p);
    }
    if(pvy <= 0 && px+PLAYER_W > p.x+8 && px < p.x+p.w-8 &&
       py >= p.y && py <= p.y + p.h + Math.abs(pvy) * dt + 4){
      py  = p.y + p.h;
      pvy = JUMP_PWR;
    }
  });

  if(py > maxHeight) maxHeight = py;

  // ── квіти ───────────────────────────────────────────────────────────────
  flowers.forEach(f => {
    if(!f.taken && px+PLAYER_W>f.x && px<f.x+24 && py+PLAYER_H>f.y && py<f.y+24){
      f.taken = true; f.el.remove();
      score++; scoreEl.textContent = score;
      scoreEl.style.transform = 'scale(1.3)';
      setTimeout(()=>scoreEl.style.transform='', 150);
    }
  });

  // ── смерть ──────────────────────────────────────────────────────────────
  if(py < maxHeight - 520 || py < -150){ triggerDead(); return; }

  // ── нескінченна генерація ───────────────────────────────────────────────
  generateUpTo(py + CHUNK_H*3);
  cullBelow(py - CHUNK_H*2);

  // ── flip ────────────────────────────────────────────────────────────────
  const img = document.getElementById('playerImg');
  if(pvx > 0.3)       img.style.transform = 'scaleX(1)';
  else if(pvx < -0.3) img.style.transform = 'scaleX(-1)';

  // ── камера ──────────────────────────────────────────────────────────────
  const playerCssTop = toCssTop(py, PLAYER_H);
  const targetOffset = -(playerCssTop - vpH * 0.45);
  cameraOffset += (targetOffset - cameraOffset) * (1 - Math.pow(0.9, dt));

  worldEl.style.transform = `translateY(${cameraOffset}px)`;
  playerEl.style.left = px + 'px';
  playerEl.style.top  = playerCssTop + 'px';
}
