const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = 800, HEIGHT = 600;
const BG = "#141414";
const DOT = "#b4b4b4";
const DOT_ACTIVE = "#50a0ff";
const LINE = "#50a0ff";
const BUTTON_BG = "#64c864";
const BUTTON_TEXT = "#ffffff";
const RADIUS = 22;
const scale = 0.3;

let audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// -----------------------------
// ドット配置
// -----------------------------
const grid_x = WIDTH / 12, grid_y = HEIGHT / 4;
const SPACING_X = 80, SPACING_Y = 80;
let dots = [];
for(let row=0; row<3; row++){
  for(let col=0; col<3; col++){
    if(row==0 && col==1) continue;
    if(row==1) continue;
    let x = grid_x + col*SPACING_X;
    let y = grid_y + row*SPACING_Y;
    dots.push({x:x, y:y});
  }
}

// -----------------------------
// キャラクター画像
// -----------------------------
let charImg = new Image();
charImg.src = "assets/chara.png";
let coverImg = new Image();
coverImg.src = "assets/cover.png";

// -----------------------------
// 辞書
// -----------------------------
let dictionary = {};
fetch("assets/dictionary.json")
  .then(resp=>resp.json())
  .then(json=>dictionary=json);

// -----------------------------
// パターン変数
// -----------------------------
let patterns = [];
let displayIndices = [];
let randomPatterns = [];
let randomDisplayIndices = [];
let selected = [];
let path = [];
let usedLines = new Set();
let currentPos = null;
let dragging = false;
let lastDotIndex = null;
let specialReentryUsed = false;
let matchedWords = [];
let nextVoice = true;

// -----------------------------
// PLAY / SAY ボタン
// -----------------------------
const playButton = {x:WIDTH-100, y:HEIGHT-60, w:80, h:40};
const sayButton = {x:WIDTH-200, y:HEIGHT-60, w:80, h:40};

// -----------------------------
// ユーティリティ関数
// -----------------------------
function distance(p1,p2){ return Math.hypot(p1.x-p2.x,p1.y-p2.y);}
function randomInDot(dot){ 
  let r=Math.random()*RADIUS;
  let theta=Math.random()*2*Math.PI;
  return {x:dot.x+r*Math.cos(theta), y:dot.y+r*Math.sin(theta)};
}
function patternToIndices(pattern){
  return pattern.map(pt=>{
    let best = 0, bestDist=Infinity;
    for(let i=0;i<dots.length;i++){
      let d = distance(pt,dots[i]);
      if(d<bestDist){best=i; bestDist=d;}
    }
    return best;
  });
}
function drawCircle(x,y,r,color){ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI); ctx.fill();}
function drawLine(p1,p2,color,width=3){ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();}

// -----------------------------
// Catmull-Rom 補間
// -----------------------------
function catmullRom(p0,p1,p2,p3,t){
  const t2=t*t, t3=t2*t;
  return {
    x:0.5*(2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y:0.5*(2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
  };
}

// -----------------------------
// パターン描画
// -----------------------------
function drawPattern(pattern, displayIndex, offsetX, offsetY, color=LINE, scale=1){
  let subPts = pattern.slice(0, displayIndex+1);
  if(subPts.length<2) return;
  let smoothPts=[];
  const res=20;
  for(let i=0;i<subPts.length-1;i++){
    let p0 = i-1>=0?subPts[i-1]:subPts[i];
    let p1 = subPts[i];
    let p2 = subPts[i+1];
    let p3 = i+2<subPts.length?subPts[i+2]:subPts[i+1];
    for(let j=0;j<res;j++){
      smoothPts.push(catmullRom(p0,p1,p2,p3,j/res));
    }
  }
  smoothPts.push(subPts[subPts.length-1]);
  let prev = null;
  for(let pt of smoothPts){
    let sx = offsetX+pt.x*scale;
    let sy = offsetY+pt.y*scale;
    if(prev){drawLine(prev,{x:sx,y:sy},color,3);}
    prev={x:sx,y:sy};
  }
  let last = subPts[subPts.length-1];
  drawCircle(offsetX+last.x*scale, offsetY+last.y*scale,3.5,color);
}

// -----------------------------
// 音声生成サンプル（Web Audio）
// -----------------------------
function playSine(frequency,duration=0.5){
  const osc=audioCtx.createOscillator();
  osc.type='sine';
  osc.frequency.value=frequency;
  const gain=audioCtx.createGain();
  gain.gain.setValueAtTime(0.5,audioCtx.currentTime);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime+duration);
}

// -----------------------------
// ランダムパターン生成（簡易版）
// -----------------------------
function generateRandomPattern(){
  let words = Object.keys(dictionary);
  if(words.length==0) return {word:"", path:[], usedLines:new Set()};
  let word = words[Math.floor(Math.random()*words.length)];
  let entry = dictionary[word][0];
  let code = entry[1];
  let edges=[];
  for(let c of code){
    let n = parseInt(c)||0;
    edges.push([0, n%dots.length]);
  }
  let pathVertices = edges.map(e=>e[1]);
  let pattern=pathVertices.map(v=>randomInDot(dots[v]));
  return {word:word, path:pattern, usedLines:new Set(edges.map(e=>[Math.min(...e),Math.max(...e)]))};
}
for(let i=0;i<5;i++){randomPatterns.push(generateRandomPattern()); randomDisplayIndices.push(0);}

// -----------------------------
// メインループ
// -----------------------------
canvas.addEventListener("mousedown",(e)=>{
  let rect = canvas.getBoundingClientRect();
  let mx=e.clientX-rect.left, my=e.clientY-rect.top;
  // PLAYボタン
  if(mx>playButton.x && mx<playButton.x+playButton.w && my>playButton.y && my<playButton.y+playButton.h){
    randomPatterns.forEach(p=>playSine(440)); // 簡易音
    return;
  }
  // SAYボタン
  if(mx>sayButton.x && mx<sayButton.x+sayButton.w && my>sayButton.y && my<sayButton.y+sayButton.h){
    patterns.forEach(p=>playSine(660));
    return;
  }
  // ドット選択
  for(let i=0;i<dots.length;i++){
    if(distance({x:mx,y:my},dots[i])<RADIUS){
      selected=[i]; path=[{x:mx,y:my}]; dragging=true; lastDotIndex=i;
      usedLines=new Set();
      break;
    }
  }
});
canvas.addEventListener("mouseup",(e)=>{dragging=false; selected=[]; path=[]; usedLines=new Set(); lastDotIndex=null;});
canvas.addEventListener("mousemove",(e)=>{
  if(!dragging) return;
  let rect = canvas.getBoundingClientRect();
  let mx=e.clientX-rect.left, my=e.clientY-rect.top;
  currentPos={x:mx,y:my};
  // 選択中の最後のドットと接続判定
  for(let i=0;i<dots.length;i++){
    if(distance({x:mx,y:my},dots[i])<RADIUS){
      let last = selected[selected.length-1];
      if(i!=last){selected.push(i); path.push(dots[i]); usedLines.add([Math.min(i,last),Math.max(i,last)]);}
      break;
    }
  }
});

// -----------------------------
// 描画ループ
// -----------------------------
function mainLoop(){
  ctx.fillStyle=BG;
  ctx.fillRect(0,0,WIDTH,HEIGHT);

  // キャラクター
  ctx.drawImage(charImg, WIDTH-500, 10, 200, 200);

  // ドットと線
  if(selected.length>1){
    for(let i=0;i<selected.length-1;i++){
      drawLine(dots[selected[i]],dots[selected[i+1]],LINE,6);
    }
    if(currentPos) drawLine(dots[selected[selected.length-1]],currentPos,LINE,3);
  }
  for(let i=0;i<dots.length;i++){
    drawCircle(dots[i].x,dots[i].y,RADIUS,selected.includes(i)?DOT_ACTIVE:DOT);
  }

  // ランダムパターン
  let xOffsetRandom=20;
  let topY=400;
  for(let idx=0;idx<randomPatterns.length;idx++){
    let pdata=randomPatterns[idx];
    drawPattern(pdata.path,randomDisplayIndices[idx],xOffsetRandom,topY,LINE,scale);
    xOffsetRandom+=70;
  }

  // ユーザーパターン
  let xOffsetUser=20;
  for(let idx=0;idx<patterns.length;idx++){
    drawPattern(patterns[idx].path,displayIndices[idx]||0,xOffsetUser,500,LINE,scale);
    xOffsetUser+=70;
  }

  // ボタン
  ctx.fillStyle=BUTTON_BG;
  ctx.fillRect(sayButton.x,sayButton.y,sayButton.w,sayButton.h);
  ctx.fillStyle="#fff"; ctx.fillText("SAY",sayButton.x+20,sayButton.y+25);
  ctx.fillStyle="#c86464";
  ctx.fillRect(playButton.x,playButton.y,playButton.w,playButton.h);
  ctx.fillStyle="#fff"; ctx.fillText("PLAY",playButton.x+10,playButton.y+25);

  requestAnimationFrame(mainLoop);
}
mainLoop();
