const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// -----------------------------
// ドット設定
// -----------------------------
const RADIUS = 22;
const dots = [];
const SPACING_X = 80;
const SPACING_Y = 80;
const grid_x = WIDTH/12, grid_y = HEIGHT/4;

for(let row=0; row<3; row++){
  for(let col=0; col<3; col++){
    if(row==0 && col==1) continue;
    if(row==1) continue;
    dots.push({x:grid_x+col*SPACING_X, y:grid_y+row*SPACING_Y});
  }
}

// -----------------------------
// 状態変数
// -----------------------------
let path = [];
let selected = [];
let dragging = false;
let currentPos = null;
let usedLines = new Set();

let patterns = [];
let randomPatterns = [];
let matchedWords = [];

// -----------------------------
// サウンド生成
// -----------------------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq=440, dur=0.3, type='sine'){
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function generateLineSound(line){
  const [a,b] = line;
  const freqs = [300, 400, 500, 600, 700, 800];
  const type = ['sine','sawtooth','triangle','square'][Math.floor(Math.random()*4)];
  playTone(freqs[(a+b)%freqs.length], 0.25, type);
}

// -----------------------------
// ランダムパターン生成
// -----------------------------
function randomPointInDot(dot){
  const theta = Math.random()*Math.PI*2;
  const r = Math.random()*RADIUS;
  return {x:dot.x + r*Math.cos(theta), y:dot.y + r*Math.sin(theta)};
}

function generateRandomPattern(){
  const word = "あ"; // 今回簡易化
  const pathVertices = Array.from({length:Math.floor(Math.random()*dots.length)+2}, ()=>Math.floor(Math.random()*dots.length));
  const pathPoints = pathVertices.map(i=>randomPointInDot(dots[i]));
  const usedLinesLocal = new Set();
  for(let i=0;i<pathVertices.length-1;i++){
    usedLinesLocal.add([Math.min(pathVertices[i], pathVertices[i+1]), Math.max(pathVertices[i], pathVertices[i+1])].toString());
  }
  return {word: word, path: pathPoints, usedLines: usedLinesLocal};
}

for(let i=0;i<5;i++) randomPatterns.push(generateRandomPattern());

// -----------------------------
// 描画関数
// -----------------------------
function drawPattern(pattern, color='cyan', scale=1.0){
  const pts = pattern;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  pts.forEach((pt,i)=>{
    const x = pt.x*scale;
    const y = pt.y*scale;
    if(i==0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // ドット
  pts.forEach(pt=>{
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.arc(pt.x*scale, pt.y*scale, 4, 0, Math.PI*2);
    ctx.fill();
  });
}

// -----------------------------
// メインループ
// -----------------------------
function draw(){
  ctx.fillStyle = '#141414';
  ctx.fillRect(0,0,WIDTH,HEIGHT);

  // ドット
  dots.forEach((d,i)=>{
    ctx.fillStyle = selected.includes(i) ? '#50a0ff' : '#b4b4b4';
    ctx.beginPath();
    ctx.arc(d.x, d.y, RADIUS, 0, Math.PI*2);
    ctx.fill();
  });

  // ユーザーパターン
  if(path.length>0){
    ctx.strokeStyle='cyan';
    ctx.lineWidth=6;
    ctx.beginPath();
    path.forEach((p,i)=>{
      const x = p.x, y=p.y;
      if(i==0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    });
    if(currentPos) ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();
  }

  // ランダムパターン
  let xOffset = 20, yOffset = HEIGHT-150;
  randomPatterns.forEach(p=>{
    drawPattern(p.path.map(pt=>({x:pt.x*0.3+xOffset, y:pt.y*0.3+yOffset})), '#ffaa00',1);
    xOffset+=70;
  });

  requestAnimationFrame(draw);
}
draw();

// -----------------------------
// マウス操作
// -----------------------------
canvas.addEventListener('mousedown', e=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  for(let i=0;i<dots.length;i++){
    const d = dots[i];
    if(Math.hypot(mx-d.x,my-d.y)<RADIUS){
      selected.push(i);
      path.push({x:d.x,y:d.y});
      dragging=true;
      break;
    }
  }
});

canvas.addEventListener('mousemove', e=>{
  if(dragging){
    const rect = canvas.getBoundingClientRect();
    currentPos = {x:e.clientX-rect.left, y:e.clientY-rect.top};
  }
});

canvas.addEventListener('mouseup', e=>{
  dragging=false;
  currentPos=null;
  if(path.length>1){
    patterns.push({path:[...path], usedLines:new Set(usedLines)});
    // 線音
    for(let i=0;i<path.length-1;i++){
      generateLineSound([i,i+1]);
    }
  }
  path=[];
  selected=[];
  usedLines.clear();
});

// -----------------------------
// ボタン
// -----------------------------
document.getElementById('playBtn').addEventListener('click', ()=>{
  randomPatterns.forEach(p=>{
    for(let i=0;i<p.path.length-1;i++){
      generateLineSound([i,i+1]);
    }
  });
});

document.getElementById('sayBtn').addEventListener('click', ()=>{
  patterns.forEach(p=>{
    for(let i=0;i<p.path.length-1;i++){
      generateLineSound([i,i+1]);
    }
  });
});
