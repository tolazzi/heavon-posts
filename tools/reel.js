// Gera um Reels 1080x1920 (MP4 H.264 + AAC) com a identidade da Heavon.
// Uso: node tools/reel.js posts/AAAA-MM-DD/reel/reel.json
// reel.json:
// { "scenes": [
//     {"type":"hook","kicker":"...","title":"Texto com **destaque**","dur":3},
//     {"type":"point","n":"01","title":"...","body":"...","dur":3.5},
//     {"type":"versus","left":"Errado","right":"Certo","leftBody":"...","rightBody":"...","dur":4},
//     {"type":"cta","title":"...","body":"...","dur":3}
//   ],
//   "audio": "tools/audio/arquivo.mp3"   (opcional; sem isso gera uma trilha própria e livre de direitos)
//   "music": "drive"                      (estilo da trilha própria: drive, phonk ou suave)
//   "voice": "cadu"                       (opcional; narração com voz neural Piper: cadu, faber ou jeff)
//   "voiceStyle": {"length":0.82}         (opcional; menor = fala mais rápida)
// }
// Com "voice", cada cena pode ter "voz": "texto falado". A cena mantém o "dur" planejado e a fala é ajustada a ele,
// e a música de fundo fica mais baixa para a voz aparecer.
// Texto fica na área segura (longe do topo e da parte de baixo, onde o Instagram põe botões e legenda).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const FPS = 30;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// cada palavra vira um <span class="w"> para animar; **x** marca destaque
function words(s) {
  const out = [];
  String(s ?? '').split(/(\*\*.+?\*\*)/).forEach(part => {
    const hl = /^\*\*.+\*\*$/.test(part);
    const txt = hl ? part.slice(2, -2) : part;
    txt.split(/(\s+|\n)/).forEach(w => {
      if (w === '\n') out.push('<br>');
      else if (/^\s+$/.test(w)) out.push(' ');
      else if (w) out.push(`<span class="w${hl ? ' hl' : ''}">${esc(w)}</span>`);
    });
  });
  return out.join('');
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;background:#050505;overflow:hidden}
#stage{position:relative;width:1080px;height:1920px;background:#050505;color:#FAFAFA;font-family:Inter,sans-serif;overflow:hidden}
.grid{position:absolute;inset:-100px;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:90px 90px}
.glow{position:absolute;width:1100px;height:1100px;border-radius:50%;filter:blur(150px);opacity:.30;background:radial-gradient(circle,#E21525 0%,#F05A28 45%,transparent 70%)}
.brand{position:absolute;top:250px;left:90px;font-family:Sora;font-weight:800;font-size:30px;letter-spacing:.3em}
.brand i{font-style:normal;color:#E21525}
.handle{position:absolute;bottom:430px;left:90px;font-family:Sora;font-size:26px;letter-spacing:.18em;color:#A6A6B0;text-transform:uppercase}
.prog{position:absolute;left:90px;right:90px;bottom:400px;height:6px;border-radius:3px;background:#1d1d23;overflow:hidden}
.prog b{display:block;height:100%;width:0;background:linear-gradient(90deg,#E21525,#F05A28)}
.scene{position:absolute;left:90px;right:90px;top:360px;bottom:500px;display:flex;flex-direction:column;justify-content:center;opacity:0}
.kicker{font-family:Sora;font-weight:600;font-size:36px;letter-spacing:.2em;text-transform:uppercase;color:#F05A28;margin-bottom:40px}
.h1{font-family:Sora;font-weight:800;font-size:118px;line-height:1.03;letter-spacing:-.035em}
.h2{font-family:Sora;font-weight:700;font-size:84px;line-height:1.08;letter-spacing:-.025em;margin-bottom:44px}
.body{font-size:48px;line-height:1.42;color:#C9C9D1}
.num{font-family:Sora;font-weight:800;font-size:260px;line-height:.9;letter-spacing:-.05em;margin-bottom:30px}
.hl,.num{background:linear-gradient(110deg,#E21525,#F05A28);-webkit-background-clip:text;background-clip:text;color:transparent}
.w{display:inline-block;will-change:transform,opacity}
.vs{display:flex;flex-direction:column;gap:36px}
.col{border-radius:32px;padding:44px 48px;border:2px solid #23232B;background:#101014}
.col.bad{border-color:#3a1517}.col.good{border-color:#E21525;background:linear-gradient(160deg,rgba(226,21,37,.16),#101014 60%)}
.tag{font-family:Sora;font-weight:700;font-size:34px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:18px}
.bad .tag{color:#8a8a94}.good .tag{color:#F05A28}
.acts{display:flex;gap:22px;margin-top:60px;flex-wrap:wrap}
.act{font-family:Sora;font-weight:600;font-size:38px;padding:24px 38px;border-radius:999px;border:2px solid #E21525}
.act.f{background:linear-gradient(110deg,#E21525,#F05A28);border-color:transparent}
`;

function sceneHTML(s, i) {
  let h = '';
  if (s.type === 'hook') h = `${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}<div class="h1">${words(s.title)}</div>${s.body ? `<div class="body" style="margin-top:44px">${words(s.body)}</div>` : ''}`;
  else if (s.type === 'point') h = `${s.n ? `<div class="num">${esc(s.n)}</div>` : ''}<div class="h2">${words(s.title)}</div><div class="body">${words(s.body)}</div>`;
  else if (s.type === 'versus') h = `${s.title ? `<div class="h2">${words(s.title)}</div>` : ''}<div class="vs"><div class="col bad"><div class="tag">✕ ${esc(s.left || 'Errado')}</div><div class="body">${words(s.leftBody)}</div></div><div class="col good"><div class="tag">✓ ${esc(s.right || 'Certo')}</div><div class="body">${words(s.rightBody)}</div></div></div>`;
  else {
    const acts = (s.actions || ['Salve', 'Compartilhe', 'Comente']).map((a, k) => `<span class="act w${k === 0 ? ' f' : ''}">${esc(a)}</span>`).join('');
    h = `<div class="h2">${words(s.title)}</div><div class="body">${words(s.body)}</div><div class="acts">${acts}</div>`;
  }
  return `<div class="scene" id="s${i}">${h}</div>`;
}

// animação determinística: tudo é calculado a partir do tempo t (segundos)
const ANIM = `
const ease=x=>1-Math.pow(1-Math.min(Math.max(x,0),1),3);
window.render=function(t){
  const S=window.SC;let acc=0;
  document.querySelector('.prog b').style.width=(100*t/window.TOTAL)+'%';
  document.querySelector('.glow').style.transform='translate('+(Math.sin(t*.5)*120)+'px,'+(Math.cos(t*.4)*160)+'px)';
  document.querySelector('.grid').style.transform='translateY('+(-(t*12)%90)+'px)';
  S.forEach((s,i)=>{
    const el=document.getElementById('s'+i),st=acc,en=acc+s.dur;acc=en;
    if(t<st-0.001||t>=en){el.style.opacity=0;return;}
    const lt=t-st,out=ease((lt-(s.dur-0.25))/0.25);
    el.style.opacity=1-out;
    el.style.transform='translateY('+(-40*out)+'px) scale('+(1+0.015*lt)+')';
    const ws=el.querySelectorAll('.w,.num,.col,.kicker');
    ws.forEach((w,k)=>{const p=ease((lt-0.08-k*0.06)/0.35);w.style.opacity=p;w.style.transform='translateY('+(50*(1-p))+'px)';});
  });
};`;

function beat(total, out, style, starts) {
  // trilha própria, sem direitos de terceiros (ver tools/trilha.py)
  execFileSync('python3', [path.join(__dirname, 'trilha.py'), out, total.toFixed(3), style, starts.join(',')]);
}

(async () => {
  const file = process.argv[2];
  const reel = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(file);
  const S = reel.scenes;
  S.forEach(s => (s.dur = s.dur || 3));
  const voices = [];
  if (reel.voice) {
    // Voz: ritmo rápido e firme. Mais variação de entonação (noise) soa menos robótico.
    // A cena mantém a duração planejada; se a fala não couber, ela é acelerada (até 1,2x)
    // e só em último caso a cena é estendida.
    const model = path.join(__dirname, 'voz', `pt_BR-${reel.voice}-medium.onnx`);
    const V = Object.assign({ length: 0.82, noise: 0.75, noiseW: 0.9, gap: 0.08 }, reel.voiceStyle || {});
    S.forEach((s, i) => {
      if (!s.voz) return;
      const raw = path.join(dir, `voz-${i}-raw.wav`), w = path.join(dir, `voz-${i}.wav`);
      execFileSync('python3', ['-m', 'piper', '-m', model, '--length-scale', String(V.length), '--noise-scale', String(V.noise),
        '--noise-w-scale', String(V.noiseW), '--sentence-silence', String(V.gap), '-f', raw], { input: s.voz });
      const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
      // corta silêncio do início/fim para a fala entrar seca, no tempo da cena
      const trim = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
      const fit = Math.max(0.6, s.dur - 0.35);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', trim, path.join(dir, `voz-${i}-t.wav`)]);
      const d = dur(path.join(dir, `voz-${i}-t.wav`));
      const tempo = Math.min(1.2, Math.max(1, d / fit));
      // voz mais "de locutor": tira grave embolado, dá presença, comprime e põe um ambiente bem leve
      const fx = `atempo=${tempo.toFixed(3)},highpass=f=90,equalizer=f=200:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,` +
        `acompressor=threshold=-20dB:ratio=3:attack=5:release=60:makeup=3,aecho=0.85:0.4:18|35:0.12|0.07`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, `voz-${i}-t.wav`), '-af', fx, '-ar', '44100', w]);
      const d2 = dur(w);
      if (d2 > fit) s.dur = Math.ceil((d2 + 0.35) * 10) / 10;
      for (const f of [raw, path.join(dir, `voz-${i}-t.wav`)]) fs.unlinkSync(f);
      voices.push({ w, i, d: d2, tempo });
    });
    console.log('voz:', voices.map(v => `cena ${v.i + 1} ${v.d.toFixed(1)}s/${S[v.i].dur}s x${v.tempo.toFixed(2)}`).join(' | '));
  }
  const total = S.reduce((a, s) => a + s.dur, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="stage"><div class="grid"></div><div class="glow" style="left:-200px;top:300px"></div>
    <div class="brand">HEAV<i>O</i>N</div>${S.map(sceneHTML).join('')}<div class="handle">@agencia.heavon</div><div class="prog"><b></b></div></div>
    <script>window.SC=${JSON.stringify(S.map(s => ({ dur: s.dur })))};window.TOTAL=${total};${ANIM}</script></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const wav = path.join(dir, 'audio.wav');
  let audio = reel.audio;
  const starts = []; { let acc = 0; S.forEach(s => { starts.push(acc); acc += s.dur; }); }
  if (!audio) { beat(total, wav, reel.music || 'drive', starts); audio = wav; }
  if (voices.length) {
    // mistura: cada fala no início da sua cena; a música "abaixa" sozinha quando a voz entra (ducking)
    const mix = path.join(dir, 'mix.wav');
    const args = ['-y', '-loglevel', 'error', '-i', audio];
    voices.forEach(v => args.push('-i', v.w));
    const f = [`[0:a]volume=0.6,atrim=0:${total}[m]`];
    voices.forEach((v, k) => { const ms = Math.round((starts[v.i] + 0.12) * 1000); f.push(`[${k + 1}:a]aresample=44100,volume=1.6,adelay=${ms}|${ms}[v${k}]`); });
    f.push(`${voices.map((_, k) => `[v${k}]`).join('')}amix=inputs=${voices.length}:normalize=0,apad,atrim=0:${total},asplit[vk][vo]`);
    f.push(`[m][vk]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=300[md]`);
    f.push(`[md][vo]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]`);
    execFileSync('ffmpeg', [...args, '-filter_complex', f.join(';'), '-map', '[out]', '-ar', '44100', mix]);
    audio = mix;
  }
  const outMp4 = path.join(dir, 'reel.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', '-movflags', '+faststart', outMp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    // capa: meio da primeira cena
    if (f === Math.round(Math.min(S[0].dur * 0.75, 2.5) * FPS)) fs.writeFileSync(path.join(dir, 'cover.jpg'), buf);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await browser.close();
  for (const f of [wav, path.join(dir, 'mix.wav'), ...voices.map(v => v.w)]) if (fs.existsSync(f)) fs.unlinkSync(f);
  console.log(outMp4, `${total}s`, `${frames} frames`);
})();
