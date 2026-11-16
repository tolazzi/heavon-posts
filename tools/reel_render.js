// Renderiza o vídeo do Reels (1080x1920) a partir da linha do tempo gerada por tools/reel.py.
// Uso interno: node tools/reel_render.js <timeline.json> <audio.wav> <saida.mp4> <capa.jpg>
// timeline.json: { total, scenes:[{type,kicker,title,n,left,right,leftBody,rightBody,actions,start,end}],
//                  words:[{w,start,end}] }
const { chromium } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const FPS = 30;
const [, , tlFile, audio, outMp4, coverOut] = process.argv;
const TL = JSON.parse(fs.readFileSync(tlFile, 'utf8'));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function words(s) { // **x** = destaque em degradê; pontuação gruda na palavra anterior
  const out = [];
  String(s ?? '').split(/(\*\*.+?\*\*)/).forEach(part => {
    const hl = /^\*\*.+\*\*$/.test(part);
    (hl ? part.slice(2, -2) : part).split(/(\s+)/).forEach(w => {
      if (!w) return;
      if (/^\s+$/.test(w)) return out.push(' ');
      if (/^[.,!?;:…]+$/.test(w) && out.length && out[out.length - 1].endsWith('</span>'))
        return (out[out.length - 1] = out[out.length - 1].replace(/<\/span>$/, `${esc(w)}</span>`));
      out.push(`<span class="w${hl ? ' hl' : ''}">${esc(w)}</span>`);
    });
  });
  return out.join('');
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;background:#050505;overflow:hidden}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:#050505;color:#FAFAFA;font-family:Inter,sans-serif}
#bg{position:absolute;inset:-120px}
.blob{position:absolute;border-radius:50%}
#b1{width:1000px;height:1000px;background:radial-gradient(circle,rgba(226,21,37,.9) 0%,rgba(226,21,37,.35) 35%,rgba(226,21,37,0) 70%);opacity:.35;mix-blend-mode:screen}
#b2{width:900px;height:900px;background:radial-gradient(circle,rgba(240,90,40,.8) 0%,rgba(240,90,40,.3) 35%,rgba(240,90,40,0) 70%);opacity:.22;mix-blend-mode:screen}
#b3{display:none}
#grid{position:absolute;inset:-200px;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:120px 120px;
  -webkit-mask-image:radial-gradient(ellipse at 50% 45%,#000 0%,transparent 70%);mask-image:radial-gradient(ellipse at 50% 45%,#000 0%,transparent 70%)}
#vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.75) 100%)}
#bgv{position:absolute;inset:0;overflow:hidden}
#bgimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 45%}
#shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,5,5,.88) 0%,rgba(5,5,5,.55) 22%,rgba(5,5,5,.45) 45%,rgba(5,5,5,.62) 62%,rgba(5,5,5,.94) 82%,#050505 100%)}
#src{position:absolute;left:80px;right:80px;bottom:470px;font-family:Inter;font-weight:600;font-size:26px;color:#c9c9d1;letter-spacing:.02em}
.news{border-radius:28px;background:rgba(250,250,250,.97);color:#111;padding:40px 44px 44px;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.news .src{display:flex;align-items:center;gap:14px;font-family:Inter;font-weight:700;font-size:26px;color:#E21525;letter-spacing:.08em;text-transform:uppercase;margin-bottom:18px}
.news .src span{color:#666;font-weight:600;letter-spacing:0;text-transform:none}
.news .hd{font-family:Sora;font-weight:700;font-size:54px;line-height:1.12;letter-spacing:-.02em}
.big{font-family:Sora;font-weight:800;font-size:250px;line-height:.9;letter-spacing:-.06em}
.lbl{font-family:Sora;font-weight:700;font-size:58px;line-height:1.1;margin-top:18px}
.items{display:flex;flex-direction:column;gap:22px;margin-top:36px}
.item,.item.w{display:flex;align-items:center;gap:24px;font-family:Sora;font-weight:700;font-size:46px;line-height:1.12;background:rgba(10,10,12,.72);border:1.5px solid rgba(255,255,255,.12);border-radius:24px;padding:24px 30px}
.item b{flex:none;width:58px;height:58px;border-radius:50%;background:linear-gradient(105deg,#E21525,#F05A28);display:flex;align-items:center;justify-content:center;font-size:32px}
#grain{position:absolute;inset:-64px;opacity:.07;mix-blend-mode:overlay}
#flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(240,90,40,.55),rgba(226,21,37,.15) 60%,transparent 80%);opacity:0}
.top{position:absolute;top:230px;left:80px;right:80px;display:flex;justify-content:space-between;align-items:center}
.brand{font-family:Sora;font-weight:800;font-size:30px;letter-spacing:.32em}
.brand i{font-style:normal;color:#E21525}
#kick{font-family:Sora;font-weight:700;font-size:24px;letter-spacing:.16em;text-transform:uppercase;padding:12px 22px;border-radius:999px;border:1.5px solid rgba(240,90,40,.6);color:#F7A07F;background:rgba(240,90,40,.08)}
#layer{position:absolute;left:80px;right:80px;top:320px;height:680px;display:flex;align-items:center}
.scene{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;opacity:0}
.h1{font-family:Sora;font-weight:800;font-size:112px;line-height:1.0;letter-spacing:-.04em}
.h2{font-family:Sora;font-weight:800;font-size:84px;line-height:1.04;letter-spacing:-.03em}
.num{font-family:Sora;font-weight:800;font-size:300px;line-height:.82;letter-spacing:-.06em;margin-bottom:26px}
.hl,.num{background:linear-gradient(105deg,#FF2A3A 0%,#F05A28 70%,#FF8A50 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.w{display:inline-block;will-change:transform,opacity}
.vs{display:flex;flex-direction:column;gap:28px;margin-top:34px}
.card{border-radius:30px;padding:34px 40px;border:2px solid #24242c;background:rgba(16,16,20,.82);font-size:44px;line-height:1.3;font-weight:600}
.card .tag{font-family:Sora;font-weight:800;font-size:28px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}
.card.bad{color:#9a9aa4}.card.bad .tag{color:#6f6f78}
.card.good{border-color:#E21525;background:linear-gradient(150deg,rgba(226,21,37,.22),rgba(16,16,20,.9) 65%)}
.card.good .tag{color:#FF7A45}
.acts{display:flex;gap:20px;margin-top:46px;flex-wrap:wrap}
.act{font-family:Sora;font-weight:700;font-size:40px;padding:24px 40px;border-radius:999px;border:2.5px solid #E21525;background:rgba(5,5,5,.6)}
.act.f{background:linear-gradient(105deg,#E21525,#F05A28);border-color:transparent;box-shadow:0 10px 40px rgba(226,21,37,.45)}
#cap{position:absolute;left:60px;right:60px;top:1010px;height:300px;display:flex;align-items:center;justify-content:center;text-align:center}
#capin{font-family:Sora;font-weight:800;font-size:76px;line-height:1.12;letter-spacing:-.02em;text-shadow:0 6px 24px rgba(0,0,0,.85)}
#capin .c{display:inline-block;padding:2px 14px;margin:4px 2px;border-radius:16px}
#capin .c.on{background:linear-gradient(105deg,#E21525,#F05A28);box-shadow:0 8px 30px rgba(226,21,37,.5);text-shadow:none}
.handle{position:absolute;bottom:430px;left:80px;font-family:Sora;font-weight:600;font-size:26px;letter-spacing:.18em;color:#9b9ba6;text-transform:uppercase}
.prog{position:absolute;left:80px;right:80px;bottom:400px;height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}
.prog b{display:block;height:100%;width:0;background:linear-gradient(90deg,#E21525,#F05A28)}
`;

function sceneHTML(s, i) {
  let h = '';
  if (s.type === 'hook') h = `<div class="h1">${words(s.title)}</div>`;
  else if (s.type === 'noticia') h = `<div class="news w"><div class="src">● ${esc(s.source || '')}<span>${esc(s.date || '')}</span></div><div class="hd">${esc(s.headline)}</div></div>`;
  else if (s.type === 'dado') h = `<div class="big hl w">${esc(s.value)}</div><div class="lbl">${words(s.label)}</div>`;
  else if (s.type === 'lista') h = `<div class="h2" style="font-size:76px">${words(s.title)}</div><div class="items">${(s.items || []).map(t => `<div class="item w"><b>✓</b>${esc(t)}</div>`).join('')}</div>`;
  else if (s.type === 'point') h = `${s.n ? `<div class="num w">${esc(s.n)}</div>` : ''}<div class="h2">${words(s.title)}</div>`;
  else if (s.type === 'versus') h = `${s.title ? `<div class="h2" style="font-size:70px">${words(s.title)}</div>` : ''}<div class="vs">
      <div class="card bad w"><div class="tag">✕ ${esc(s.left || 'Antes')}</div>${esc(s.leftBody)}</div>
      <div class="card good w"><div class="tag">✓ ${esc(s.right || 'Depois')}</div>${words(s.rightBody)}</div></div>`;
  else {
    const acts = (s.actions || ['Salve', 'Comente', 'Siga']).map((a, k) => `<span class="act w${k === 0 ? ' f' : ''}">${esc(a)}</span>`).join('');
    h = `<div class="h2">${words(s.title)}</div><div class="acts">${acts}</div>`;
  }
  return `<div class="scene" id="s${i}">${h}</div>`;
}

// legendas: blocos de até 3 palavras (quebra também em pontuação ou pausa)
function chunks(ws) {
  const out = []; let cur = [];
  ws.forEach((w, i) => {
    cur.push(w);
    const next = ws[i + 1];
    const brk = cur.length >= 3 || /[.,!?;:]$/.test(w.w) || !next || next.start - w.end > 0.35;
    if (brk) { out.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; }
  });
  return out;
}

const ANIM = `
const cl=x=>Math.min(Math.max(x,0),1), eo=x=>1-Math.pow(1-cl(x),3);
const back=x=>{x=cl(x);const c1=1.6,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
function rnd(n){const x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x);}
window.render=function(t){
  const T=window.TL, S=T.scenes;
  document.querySelector('.prog b').style.width=(100*t/T.total)+'%';
  // fundo vivo
  const b1=document.getElementById('b1'),b2=document.getElementById('b2'),b3=document.getElementById('b3');
  b1.style.transform='translate('+(80+Math.sin(t*.45)*180)+'px,'+(200+Math.cos(t*.35)*220)+'px)';
  b2.style.transform='translate('+(420+Math.cos(t*.5)*200)+'px,'+(900+Math.sin(t*.4)*180)+'px)';
  b3.style.transform='translate('+(-200+Math.sin(t*.25)*120)+'px,'+(1100+Math.cos(t*.3)*120)+'px)';
  document.getElementById('grid').style.transform='perspective(900px) rotateX(18deg) translateY('+((t*40)%120)+'px)';
  document.getElementById('grain').style.backgroundPosition=Math.floor(rnd(Math.floor(t*30))*64)+'px '+Math.floor(rnd(Math.floor(t*30)+7)*64)+'px';
  let flash=0, kick='', src='';
  S.forEach((s,i)=>{
    const el=document.getElementById('s'+i);
    if(t<s.start||t>=s.end){el.style.opacity=0;return;}
    kick=s.kicker||''; src=s.src||'';

    const lt=t-s.start, dur=s.end-s.start, out=eo((lt-(dur-0.18))/0.18);
    flash=Math.max(flash,1-cl(lt/0.22));
    const punch=1+0.10*(1-eo(lt/0.35));
    el.style.opacity=1-out;
    el.style.transform='scale('+(punch*(1+0.012*lt)*(1-0.06*out))+') translateY('+(-30*out)+'px)';
    el.querySelectorAll('.w').forEach((w,k)=>{const p=(lt-0.05-k*0.055)/0.32;const b=back(p);
      w.style.opacity=cl(p*1.6);w.style.transform='translateY('+(60*(1-b))+'px) scale('+(0.7+0.3*b)+')';});
  });
  // câmera: cada corte de imagem ganha um movimento diferente (aproxima, afasta, desliza)
  const C2=T.cuts; let ci=0; for(let i=0;i<C2.length;i++){ if(t>=C2[i]) ci=i; }
  const cs=C2[ci], ce=(C2[ci+1]!==undefined?C2[ci+1]:T.total), u=cl((t-cs)/(ce-cs));
  const io=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2, cut=1-eo((t-cs)/0.25);
  const mv=[[1.04,1.16,0,0],[1.16,1.04,0,0],[1.12,1.12,-50,50],[1.12,1.12,50,-50]][ci%4];
  const sc=mv[0]+(mv[1]-mv[0])*io, tx=mv[2]+(mv[3]-mv[2])*io;
  document.getElementById('bgimg').style.transform='translateX('+tx+'px) scale('+(sc+0.06*cut)+')';
  if(!S.some(s=>Math.abs(s.start-cs)<0.01)) flash=Math.max(flash,0.45*(1-cl((t-cs)/0.16)));
  document.getElementById('flash').style.opacity=0.55*flash;
  document.getElementById('src').textContent=src;
  const kk=document.getElementById('kick'); kk.textContent=kick; kk.style.visibility=kick?'visible':'hidden';
  // legenda sincronizada
  const C=window.CH; let cur=null;
  for(const c of C){ if(t>=c.start-0.05 && t<c.end+0.25){cur=c;} }
  const cap=document.getElementById('capin');
  if(!cur){cap.innerHTML='';return;}
  const key=cur.start.toFixed(3);
  if(cap.dataset.k!==key){cap.dataset.k=key;cap.innerHTML=cur.words.map(w=>'<span class="c">'+w.h+'</span>').join(' ');}
  const p=back((t-cur.start+0.05)/0.18);
  cap.style.transform='scale('+(0.85+0.15*p)+')'; cap.style.opacity=cl((t-cur.start+0.05)/0.08);
  cap.querySelectorAll('.c').forEach((el,k)=>{const w=cur.words[k];el.classList.toggle('on',t>=w.start-0.03&&t<(cur.words[k+1]?cur.words[k+1].start-0.03:cur.end+0.25));});
};`;

(async () => {
  const ch = chunks(TL.words).map(c => ({ ...c, words: c.words.map(w => ({ ...w, h: esc(w.w) })) }));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="stage">
    <div id="bgv"><img id="bgimg"></div><div id="shade"></div><div id="bg"><div id="b3" class="blob"></div><div id="b1" class="blob"></div><div id="b2" class="blob"></div><div id="grid"></div></div>
    <div id="vig"></div><canvas id="gc" width="256" height="256" style="display:none"></canvas><div id="grain"></div><div id="flash"></div>
    <div class="top"><div class="brand">HEAV<i>O</i>N</div><div id="kick"></div></div>
    <div id="layer">${TL.scenes.map(sceneHTML).join('')}</div>
    <div id="cap"><div id="capin"></div></div><div id="src"></div>
    <div class="handle">@agencia.heavon</div><div class="prog"><b></b></div></div>
    <script>window.TL=${JSON.stringify({ total: TL.total, cuts: [...TL.scenes.map(s => s.start), ...(TL.cuts || [])].sort((a, b) => a - b), scenes: TL.scenes.map(s => ({ start: s.start, end: s.end, kicker: s.kicker || '', src: s.type === 'noticia' || s.type === 'dado' ? '' : (s.source || '') })) })};
    window.CH=${JSON.stringify(ch)};
    (function(){const c=document.getElementById('gc'),x=c.getContext('2d'),d=x.createImageData(256,256);
      let s=1;for(let i=0;i<d.data.length;i+=4){s=(s*16807)%2147483647;const v=s%255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}
      x.putImageData(d,0,0);document.getElementById('grain').style.backgroundImage='url('+c.toDataURL()+')';})();
    ${ANIM}</script></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const pageFile = TL.frames + '/_page.html';
  fs.writeFileSync(pageFile, html);
  await page.goto('file://' + pageFile, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', outMp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(TL.total * FPS);
  const nbg = fs.readdirSync(TL.frames).filter(f => f.endsWith('.jpg')).length;
  const coverF = Math.round(Math.min(TL.scenes[0].end - 0.3, 1.6) * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(async ([t, src]) => { const im = document.getElementById('bgimg'); im.src = src; await im.decode(); window.render(t); },
      [f / FPS, 'file://' + TL.frames + '/' + String(Math.min(f + 1, nbg)).padStart(5, '0') + '.jpg']);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f === coverF) fs.writeFileSync(coverOut, buf);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await browser.close();
  console.log(outMp4, TL.total.toFixed(1) + 's', frames + ' quadros');
})();
