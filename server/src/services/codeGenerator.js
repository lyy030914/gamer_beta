const { chat } = require('./openaiClient');
const vm = require('vm');

const SYSTEM_PROMPT = `You are an expert Game Developer Agent specializing in creating complete, polished single-file HTML5 games. 

Your task: Generate a COMPLETE, FULLY FUNCTIONAL HTML file that implements the game design specification provided.

CRITICAL REQUIREMENTS:
1. The entire game MUST be a SINGLE self-contained HTML file with all CSS and JS inline
2. Use HTML5 Canvas for rendering the game
3. Implement ALL features listed in the design spec
4. The game must be FULLY PLAYABLE - no placeholder code, no TODOs, no "implement later"
5. Include proper game loop (requestAnimationFrame)
6. Handle keyboard AND mouse/touch input appropriately
7. Include score tracking, game states (start, playing, game over)
8. Add responsive design that works on different screen sizes
9. Use vibrant colors and smooth animations
10. Include sound effects via Web Audio API (simple beeps/tones)
11. Add particle effects for visual polish
12. The game canvas should adapt to the container size
13. Include a clean UI overlay with score, lives/health, and controls info
14. Add a start screen and game over screen with restart functionality
15. If uploaded image assets are provided, preload them with JavaScript Image objects and draw them on the Canvas as visible game art
16. Use plain ASCII text for all labels and JavaScript strings. Do not use emoji or non-ASCII symbols in HTML, CSS, or JS.
17. The Start button must be clickable and must transition the game from menu/start state to playing state.
18. Bind Start/Restart/Pause event listeners after DOM elements exist, or place the script after the DOM markup.
19. Keep the full HTML concise, preferably under 900 lines, so the response is not truncated.

CODE QUALITY:
- Clean, well-structured JavaScript
- Meaningful variable names
- Proper game loop with deltaTime
- Collision detection where applicable
- Smooth 60fps performance

OUTPUT FORMAT:
Output ONLY the complete HTML file content. Start with <!DOCTYPE html>.
Do NOT include any markdown code fences, explanations, or additional text.
The output must be directly savable as an .html file and immediately playable.`;

function extractScripts(html) {
  const scripts = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  return scripts;
}

function validateHtmlGame(code) {
  if (!code.includes('<canvas')) {
    throw new Error('Generated HTML is missing a canvas element.');
  }
  if (!/start/i.test(code)) {
    throw new Error('Generated HTML is missing a start control.');
  }
  if (!/<\/script>/i.test(code) || !/<\/html>/i.test(code)) {
    throw new Error('Generated HTML is incomplete or truncated.');
  }

  const scripts = extractScripts(code);
  if (scripts.length === 0) {
    throw new Error('Generated HTML is missing JavaScript.');
  }

  for (const script of scripts) {
    new vm.Script(script);
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function fallbackGameTemplate(gameDesign, attachments = []) {
  const imageAssets = attachments
    .filter(attachment => attachment.kind === 'image' && attachment.url)
    .map(attachment => ({
      url: attachment.url,
      name: attachment.name || attachment.filename || 'image'
    }));
  const title = escapeHtml(gameDesign.title || 'Asset Dash');
  const description = escapeHtml(gameDesign.description || 'Collect the items and avoid enemies.');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111827;color:#f8fafc;font-family:Arial,sans-serif}
#wrap{position:relative;width:100vw;height:100vh;background:#0f172a}
canvas{width:100%;height:100%;display:block}
#hud{position:absolute;top:12px;left:12px;right:12px;display:flex;gap:12px;align-items:center;justify-content:space-between;pointer-events:none}
.pill{background:rgba(15,23,42,.78);border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:8px 10px;font-weight:700}
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(2,6,23,.82);padding:24px}
.hidden{display:none}.panel{max-width:560px}.panel h1{margin:0 0 10px;font-size:42px}.panel p{color:#cbd5e1;line-height:1.5}
button{border:0;border-radius:8px;background:#22c55e;color:#052e16;font-weight:800;font-size:18px;padding:12px 22px;cursor:pointer}
button:hover{filter:brightness(1.08)}
</style>
</head>
<body>
<div id="wrap">
<canvas id="game"></canvas>
<div id="hud"><div class="pill">Score: <span id="score">0</span></div><div class="pill">Lives: <span id="lives">3</span></div><div class="pill">Move: WASD / Arrows</div></div>
<div id="start" class="overlay"><div class="panel"><h1>${title}</h1><p>${description}</p><p>Uploaded images are used as game art when available.</p><button id="startBtn">Start Game</button></div></div>
<div id="over" class="overlay hidden"><div class="panel"><h1>Game Over</h1><p>Final score: <span id="finalScore">0</span></p><button id="restartBtn">Play Again</button></div></div>
</div>
<script>
const ASSETS=${JSON.stringify(imageAssets)};
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const scoreEl=document.getElementById('score'),livesEl=document.getElementById('lives');
const startEl=document.getElementById('start'),overEl=document.getElementById('over'),finalScoreEl=document.getElementById('finalScore');
const images=[]; ASSETS.forEach((a,i)=>{const img=new Image(); img.onload=()=>img.ok=true; img.onerror=()=>img.ok=false; img.src=a.url; images[i]=img;});
let W=0,H=0,playing=false,last=0,score=0,lives=3,spawn=0,items=[],enemies=[],keys={};
const player={x:160,y:160,r:24,speed:280};
function resize(){const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(dpr,0,0,dpr,0,0);W=innerWidth;H=innerHeight}
function rand(a,b){return Math.random()*(b-a)+a}
function reset(){score=0;lives=3;items=[];enemies=[];spawn=0;player.x=W/2;player.y=H/2;for(let i=0;i<8;i++)items.push(makeThing('item'));scoreEl.textContent=score;livesEl.textContent=lives}
function makeThing(type){return{x:rand(50,W-50),y:rand(70,H-50),r:type==='enemy'?28:22,vx:rand(-90,90),vy:rand(-90,90),type}}
function startGame(){reset();playing=true;startEl.classList.add('hidden');overEl.classList.add('hidden');last=performance.now();requestAnimationFrame(loop)}
function endGame(){playing=false;finalScoreEl.textContent=score;overEl.classList.remove('hidden')}
function drawImg(img,x,y,w,h){if(img&&img.ok)ctx.drawImage(img,x-w/2,y-h/2,w,h);else{ctx.beginPath();ctx.arc(x,y,w/2,0,Math.PI*2);ctx.fill()}}
function update(dt){let dx=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0),dy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0);let len=Math.hypot(dx,dy)||1;player.x=Math.max(24,Math.min(W-24,player.x+dx/len*player.speed*dt));player.y=Math.max(56,Math.min(H-24,player.y+dy/len*player.speed*dt));spawn-=dt;if(spawn<=0){spawn=Math.max(.45,1.4-score*.01);enemies.push(makeThing('enemy'))}
for(const e of enemies){e.x+=e.vx*dt;e.y+=e.vy*dt;if(e.x<25||e.x>W-25)e.vx*=-1;if(e.y<60||e.y>H-25)e.vy*=-1}
for(let i=items.length-1;i>=0;i--){const it=items[i];if(Math.hypot(player.x-it.x,player.y-it.y)<player.r+it.r){items.splice(i,1);items.push(makeThing('item'));score+=10;scoreEl.textContent=score}}
for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(Math.hypot(player.x-e.x,player.y-e.y)<player.r+e.r){enemies.splice(i,1);lives--;livesEl.textContent=lives;if(lives<=0)endGame()}}
}
function draw(){ctx.clearRect(0,0,W,H);let bg=images.find((img,i)=>img.ok&&/background|forest|neon/i.test(ASSETS[i].name))||images[0];if(bg&&bg.ok)ctx.drawImage(bg,0,0,W,H);else{let g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#164e63');g.addColorStop(1,'#312e81');ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
ctx.fillStyle='rgba(15,23,42,.45)';ctx.fillRect(0,0,W,H);
const playerImg=images.find((img,i)=>img.ok&&/hero|ship|player/i.test(ASSETS[i].name))||images[0];const enemyImg=images.find((img,i)=>img.ok&&/enemy|bug/i.test(ASSETS[i].name))||images[1];const itemImg=images.find((img,i)=>img.ok&&/coin|power|item/i.test(ASSETS[i].name))||images[2];
ctx.fillStyle='#facc15';for(const it of items)drawImg(itemImg,it.x,it.y,it.r*2,it.r*2);
ctx.fillStyle='#ef4444';for(const e of enemies)drawImg(enemyImg,e.x,e.y,e.r*2,e.r*2);
ctx.fillStyle='#38bdf8';drawImg(playerImg,player.x,player.y,player.r*2.4,player.r*2.4)}
function loop(t){if(!playing)return;const dt=Math.min((t-last)/1000,.033);last=t;update(dt);draw();requestAnimationFrame(loop)}
addEventListener('resize',resize);addEventListener('keydown',e=>{keys[e.key]=true});addEventListener('keyup',e=>{keys[e.key]=false});
canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;player.x=e.clientX;player.y=e.clientY});
document.getElementById('startBtn').addEventListener('click',startGame);document.getElementById('restartBtn').addEventListener('click',startGame);
resize();draw();
</script>
</body>
</html>`;
}

async function repairGameCode(code, validationError) {
  const repairPrompt = `
The following generated single-file HTML5 Canvas game has a JavaScript/HTML defect that prevents it from starting.

Validation error:
${validationError.message}

Repair requirements:
- Return the complete corrected HTML file only.
- Preserve the game design and uploaded image URLs.
- Use only plain ASCII text in UI labels and JavaScript strings.
- Fix all JavaScript syntax errors.
- Ensure the Start button is visible, clickable, and changes the game state to playing.
- Ensure Restart and Pause buttons cannot break script parsing.
- Do not include markdown fences or explanations.

Broken HTML:
${code}
`;

  const result = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: repairPrompt }
  ], { temperature: 0.2, max_tokens: 8192 });

  let repaired = cleanHtml(result.content);
  validateHtmlGame(repaired);
  return repaired;
}

function cleanHtml(response) {
  let code = response;
  code = code.replace(/^```html?\n?/i, '').replace(/^```\n?/i, '').replace(/```\n?$/i, '').trim();

  if (!code.startsWith('<!DOCTYPE html>') && !code.startsWith('<html')) {
    code = code.replace(/^[\s\S]*?(<!DOCTYPE html>)/, '$1');
  }

  return code;
}

function buildAssetPrompt(attachments = []) {
  const imageAssets = attachments.filter(attachment => attachment.kind === 'image');
  if (!imageAssets.length) return '';

  const assetLines = imageAssets.map((asset, index) => {
    const label = asset.name || asset.filename || `image-${index + 1}`;
    return `  ${index + 1}. ${label}: ${asset.url}`;
  });

  return `

UPLOADED IMAGE ASSETS:
${assetLines.join('\n')}

Asset integration requirements:
- Use these exact image URLs in the generated HTML. Do not invent different asset paths.
- Create a small asset loader, for example const img = new Image(); img.src = "/uploads/...";
- Draw at least one uploaded image prominently in normal gameplay.
- If multiple images are supplied, assign them by likely filename meaning: background/forest/neon as scene backdrop, hero/ship/player as player, enemy/bug as enemies, coin/powerup as collectible, platform/tile as terrain.
- Preserve gameplay if an image fails to load by drawing a simple shape fallback, but prefer the uploaded image whenever loaded.
- Do not embed the images as base64. Reference the URLs directly so the browser loads them from the server.
- Because the game file is served from the same Express app as /uploads, root-relative URLs like /uploads/covers/example.png are valid.
`;
}

async function generateGameCode(gameDesign, attachments = []) {
  const assetPrompt = buildAssetPrompt(attachments);
  const designPrompt = `
GAME DESIGN SPECIFICATION:
- Title: ${gameDesign.title}
- Genre: ${gameDesign.genre}
- Description: ${gameDesign.description}
- Mechanics: ${gameDesign.mechanics}
- Controls: ${gameDesign.controls}
- Win Condition: ${gameDesign.winCondition}
- Lose Condition: ${gameDesign.loseCondition}
- Visual Style: ${gameDesign.visualStyle}
- Features: ${(gameDesign.features || []).join(', ')}
${assetPrompt}

Generate a complete, playable HTML5 game implementing this design.
Make sure it's FUN, POLISHED, and FULLY FUNCTIONAL.
The game should be immediately enjoyable and have good replay value.`;

  const result = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: designPrompt }
  ], { temperature: 0.7, max_tokens: 8192 });

  let code = cleanHtml(result.content);

  try {
    validateHtmlGame(code);
  } catch (e) {
    console.warn('[CodeGenerator] Generated game failed validation, requesting repair:', e.message);
    try {
      code = await repairGameCode(code, e);
    } catch (repairError) {
      console.warn('[CodeGenerator] Repair failed, using fallback template:', repairError.message);
      code = fallbackGameTemplate(gameDesign, attachments);
      validateHtmlGame(code);
    }
  }

  return code;
}

module.exports = { generateGameCode, fallbackGameTemplate, validateHtmlGame };
