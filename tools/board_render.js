// Renderizador do estilo "quadro-branco" (escolhido pelo usuário em 25/11): papel claro, traço de caneta sendo
// desenhado em tempo real, letra de mão, setas e círculos em vermelho. Menos "propaganda", mais "explicação".
// Uso interno (tools/reel.py chama quando reel.json tem "style": "board"):
//   node tools/board_render.js <timeline.json> <audio.wav> <saida.mp4> <capa.jpg>
// Tipos de cena ("kind"); em textos, "|" quebra linha e **x** destaca em vermelho:
//   title   {tag, text, size, circle:true|false, under:true|false, note}
//   flow    {tag, nodes:[{t, red, mark:"check"|"cross"}], note}           (caixas ligadas por setas, de cima para baixo)
//   compare {tag, top:{label, quote, items:[]}, bot:{label, quote, items:[]}}   (itens de cima com ✓, de baixo com ✗)
//   chart   {tag, label, from, to, fromLabel, toLabel, note}                (linha desenhada subindo ou descendo)
//   step    {tag, n, text, note, icon:"clock"|"chart"|"gift"|"chat"|"star"}
//   end     {text, sub, note}
const { chromium } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const FPS = 30, GAP = 1240;
const [, , tlFile, audio, outMp4, coverOut] = process.argv;
const TL = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="r">$1</span>');
const lines = (s, cls, extra = '') => String(s || '').split('|').map(l => `<div class="d txt ${cls}" ${extra}>${rich(l)}</div>`).join('');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Sora:wght@700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#f5f2ea}
#st{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Caveat;color:#17171b}
#cam{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:0 0}
#board{position:absolute;left:-600px;top:-400px;width:${GAP * 12}px;height:2800px;
  background:radial-gradient(ellipse at 50% 40%,rgba(255,255,255,.7),transparent 60%),
  repeating-linear-gradient(0deg,rgba(40,40,60,.045) 0 2px,transparent 2px 72px),
  repeating-linear-gradient(90deg,rgba(40,40,60,.045) 0 2px,transparent 2px 72px),#f5f2ea}
.pg{position:absolute;top:0;width:1080px;height:1920px}
.d{opacity:0}
.txt{position:absolute;left:80px;right:80px;text-align:center;line-height:1.02;white-space:nowrap}
.r{color:#E21525}
.tag{font-size:58px;font-weight:700;color:#5a5a66;top:250px}
.big{font-weight:700}
.mid{font-size:92px;font-weight:700}
.sm{font-size:60px;font-weight:600;color:#3a3a44}
.box{position:absolute;left:0;right:0;margin:0 auto;width:fit-content;font-size:84px;font-weight:700;padding:6px 46px;text-align:center;white-space:nowrap;line-height:1.1}
.lab{position:absolute;left:110px;font-family:Sora;font-weight:800;font-size:34px;letter-spacing:.2em}
.it{position:absolute;left:200px;font-size:72px;font-weight:600;white-space:nowrap}
.num{position:absolute;text-align:center;font-size:330px;font-weight:700;color:#E21525;line-height:1}
.mk{position:absolute;font-size:64px;font-weight:700;white-space:nowrap}
svg.ov{position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:visible;pointer-events:none}
svg.ov path{fill:none;stroke-linecap:round;stroke-linejoin:round}
#brand{position:absolute;top:110px;left:80px;font-family:Sora;font-weight:800;font-size:30px;letter-spacing:.32em;color:#17171b;z-index:5}#brand i{font-style:normal;color:#E21525}
#pen{position:absolute;left:0;top:0;width:150px;height:150px;z-index:6;opacity:0;transform-origin:0 0}
#cap{position:absolute;left:50px;right:50px;top:1570px;height:200px;display:flex;align-items:center;justify-content:center;text-align:center;z-index:6}
#capin{font-family:Sora;font-weight:800;font-size:70px;line-height:1.15;letter-spacing:-.02em;color:#17171b}
#capin .c{display:inline-block;padding:2px 12px;margin:4px 2px;border-radius:12px}
#capin .c.on{background:#E21525;color:#fff}
.prog{position:absolute;left:80px;right:80px;bottom:110px;height:6px;border-radius:3px;background:rgba(0,0,0,.08);overflow:hidden;z-index:6}.prog b{display:block;height:100%;width:0;background:#E21525}
`;

function page(s, i) {
  const k = s.kind; let h = s.tag ? lines(s.tag, 'tag') : '';
  if (k === 'title') {
    const n = String(s.text || '').split('|').length, size = s.size || (n > 2 ? 120 : 150), y0 = 900 - (n * size * 1.02) / 2;
    h += String(s.text || '').split('|').map((l, j) => `<div class="d txt big" style="top:${y0 + j * size * 1.02}px;font-size:${size}px" ${j === n - 1 && (s.circle || s.under) ? `data-deco="${s.circle ? 'circle' : 'under'}"` : ''}>${rich(l)}</div>`).join('');
    if (s.note) h += `<div class="d txt sm" style="top:${y0 + n * size * 1.02 + 90}px">${rich(s.note)}</div>`;
  } else if (k === 'flow') {
    const N = s.nodes.length, step = Math.min(300, 1000 / N), y0 = 860 - ((N - 1) * step) / 2 - 50;
    s.nodes.forEach((nd, j) => {
      h += `<div class="d box${nd.red ? ' r' : ''}" style="top:${y0 + j * step}px" data-deco="box" ${j ? 'data-arrow="1"' : ''} ${nd.mark ? `data-mark="${nd.mark}"` : ''}>${rich(nd.t)}</div>`;
    });
    if (s.note) h += `<div class="d txt sm" style="top:${y0 + N * step + 10}px">${rich(s.note)}</div>`;
  } else if (k === 'compare') {
    [['top', 380, 'check'], ['bot', 980, 'cross']].forEach(([key, y, mk]) => {
      const b = s[key];
      h += `<div class="d lab" style="top:${y}px;color:${key === 'top' ? '#2f7d4f' : '#E21525'}">${esc(b.label)}</div>`;
      h += `<div class="d txt mid" style="top:${y + 60}px;text-align:left;left:110px">${rich(b.quote)}</div>`;
      (b.items || []).forEach((it, j) => { h += `<div class="d it" style="top:${y + 190 + j * 95}px" data-mark="${mk}" data-markleft="1">${rich(it)}</div>`; });
    });
    h += `<div class="d" data-line="110,930,970,930"></div>`;
  } else if (k === 'chart') {
    h += lines(s.label, 'mid', 'style="top:400px"');
    h += `<div class="d" data-line="170,560,170,1280"></div><div class="d" data-line="170,1280,930,1280"></div>`;
    const down = +s.to < +s.from;
    h += `<div class="d" data-curve="${down ? 'down' : 'up'}"></div>`;
    h += `<div class="d mk" style="left:200px;top:${down ? 520 : 1120}px">${rich(s.fromLabel || s.from)}</div>`;
    h += `<div class="d mk r" style="left:${down ? 840 : 700}px;top:${down ? 1150 : 520}px" data-deco="circle">${rich(s.toLabel || s.to)}</div>`;
    if (s.note) h += `<div class="d txt sm" style="top:1340px">${rich(s.note)}</div>`;
  } else if (k === 'step') {
    h += `<div class="d txt num" style="top:370px" data-deco="circle">${esc(s.n)}</div>`;
    const n = String(s.text || '').split('|').length;
    h += String(s.text || '').split('|').map((l, j) => `<div class="d txt big" style="top:${760 + j * 112}px;font-size:110px">${rich(l)}</div>`).join('');
    if (s.icon) h += `<div class="d" data-icon="${s.icon}" data-y="${780 + n * 112 + 40}"></div>`;
    if (s.note) h += `<div class="d txt sm" style="top:${780 + n * 112 + 300}px">${rich(s.note)}</div>`;
  } else if (k === 'end') {
    const L = String(s.text || '').split('|');
    h += L.map((l, j) => `<div class="d txt big" style="top:${560 + j * 150}px;font-size:${l.length > 18 ? 118 : 140}px" ${j === L.length - 1 ? 'data-deco="under"' : ''}>${rich(l)}</div>`).join('');
    if (s.sub) h += `<div class="d txt sm" style="top:${560 + L.length * 150 + 120}px">${rich(s.sub)}</div>`;
    h += `<div class="d txt" style="top:${560 + L.length * 150 + 260}px;font-family:Sora;font-weight:800;font-size:44px;letter-spacing:.34em">HEAV<span class="r">O</span>N</div>`;
    if (s.note) h += `<div class="d txt" style="top:${560 + L.length * 150 + 340}px;font-family:Sora;font-weight:700;font-size:22px;letter-spacing:.12em;color:#8a8a96">${esc(s.note.toUpperCase())}</div>`;
  }
  return `<div class="pg" id="p${i}" style="left:${600 + i * GAP}px;top:400px">${h}<svg class="ov"></svg></div>`;
}

function chunks(ws) {
  const out = []; let cur = [];
  ws.forEach((w, i) => { cur.push(w); const nx = ws[i + 1];
    if (cur.length >= 3 || /[.,!?;:]$/.test(w.w) || !nx || nx.start - w.end > 0.35) { out.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } });
  return out;
}

// roda no navegador: mede os elementos, cria os traços (caixas, círculos, setas, ícones) e agenda o desenho
const SETUP = `
const NS='http://www.w3.org/2000/svg';
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}; const j=a=>(rnd()-0.5)*2*a;
function P(svg,d,color,w){const p=document.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('stroke',color);p.setAttribute('stroke-width',w);p.classList.add('d','pth');svg.appendChild(p);return p;}
const ellipse=(cx,cy,rx,ry)=>{let d='';const n=40,turn=1.12,a0=-2.2;for(let i=0;i<=n;i++){const a=a0+turn*2*Math.PI*i/n,k=1+0.04*Math.sin(i*0.7);d+=(i?'L':'M')+(cx+rx*k*Math.cos(a)+j(3)).toFixed(1)+','+(cy+ry*k*Math.sin(a)+j(3)).toFixed(1);}return d;};
const rect=(x,y,w,h)=>'M'+(x+j(4))+','+(y+j(4))+' L'+(x+w+j(6))+','+(y+j(5))+' L'+(x+w+j(5))+','+(y+h+j(6))+' L'+(x+j(6))+','+(y+h+j(4))+' Z';
const line=(x1,y1,x2,y2)=>'M'+x1+','+y1+' Q'+((x1+x2)/2+j(10))+','+((y1+y2)/2+j(10))+' '+x2+','+y2;
const arrow=(x,y1,y2)=>line(x,y1,x,y2)+' M'+(x-26)+','+(y2-30)+' L'+x+','+y2+' L'+(x+26)+','+(y2-30);
const check=(x,y)=>'M'+x+','+(y+10)+' L'+(x+20)+','+(y+34)+' L'+(x+58)+','+(y-22);
const cross=(x,y)=>'M'+x+','+(y-18)+' L'+(x+46)+','+(y+30)+' M'+(x+46)+','+(y-18)+' L'+x+','+(y+30);
const icons={
 clock:(cx,cy)=>[ellipse(cx,cy,110,110),'M'+cx+','+cy+' L'+cx+','+(cy-75)+' M'+cx+','+cy+' L'+(cx+55)+','+(cy+20)],
 chart:(cx,cy)=>['M'+(cx-140)+','+(cy+100)+' L'+(cx+150)+','+(cy+100),rect(cx-120,cy+20,50,80),rect(cx-40,cy-20,50,120),rect(cx+40,cy-80,50,180)],
 gift:(cx,cy)=>[rect(cx-110,cy-40,220,150),rect(cx-130,cy-90,260,50),'M'+cx+','+(cy-90)+' L'+cx+','+(cy+110),'M'+cx+','+(cy-90)+' C'+(cx-80)+','+(cy-200)+' '+(cx-120)+','+(cy-90)+' '+cx+','+(cy-90)+' C'+(cx+80)+','+(cy-200)+' '+(cx+120)+','+(cy-90)+' '+cx+','+(cy-90)],
 chat:(cx,cy)=>['M'+(cx-150)+','+(cy-80)+' L'+(cx+150)+','+(cy-80)+' L'+(cx+150)+','+(cy+50)+' L'+(cx-40)+','+(cy+50)+' L'+(cx-90)+','+(cy+110)+' L'+(cx-90)+','+(cy+50)+' L'+(cx-150)+','+(cy+50)+' Z','M'+(cx-90)+','+(cy-25)+' L'+(cx+90)+','+(cy-25),'M'+(cx-90)+','+(cy+10)+' L'+(cx+40)+','+(cy+10)],
 star:(cx,cy)=>{let d='';for(let i=0;i<=10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?50:120;d+=(i?'L':'M')+(cx+r*Math.cos(a)).toFixed(1)+','+(cy+r*Math.sin(a)).toFixed(1);}return [d];}
};
window.setup=function(){
  const T=window.TL; window.ITEMS=[];
  T.scenes.forEach((s,i)=>{
    const pg=document.getElementById('p'+i), svg=pg.querySelector('svg.ov'), px=pg.offsetLeft, py=pg.offsetTop;
    const seq=[]; let prevBox=null;
    const rel=el=>({x:el.offsetLeft,y:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight});
    pg.querySelectorAll(':scope > .d').forEach(el=>{
      if(el.dataset.line){const [a,b,c,d]=el.dataset.line.split(',').map(Number);seq.push(P(svg,line(a,b,c,d),'#17171b',7));return;}
      if(el.dataset.curve){const up=el.dataset.curve==='up';seq.push(P(svg,up?'M200,1220 C380,1200 460,1000 560,940 S760,700 900,600':'M200,640 C380,660 460,860 540,920 S700,1150 800,1210','#E21525',12));return;}
      if(el.dataset.icon){const f=icons[el.dataset.icon]||icons.star;(f(540,+el.dataset.y+120)).forEach((d,k)=>seq.push(P(svg,d,k?'#E21525':'#17171b',9)));return;}
      seq.push(el);
      let r=rel(el);
      if(el.classList.contains('txt')){const sp=document.createElement('span');sp.style.display='inline-block';sp.innerHTML=el.innerHTML;el.innerHTML='';el.appendChild(sp);el._clip=sp;const w=sp.offsetWidth;r={x:el.offsetLeft+(el.offsetWidth-w)/2,y:el.offsetTop,w:w,h:el.offsetHeight};if(el.style.textAlign==='left')r.x=el.offsetLeft;}
      el._r=r;
      if(el.dataset.deco==='box'){ if(el.dataset.arrow&&prevBox) seq.push(P(svg,arrow(540,prevBox.y+prevBox.h+14,r.y-12),'#17171b',8));
        seq.push(P(svg,rect(r.x,r.y,r.w,r.h),el.classList.contains('r')?'#E21525':'#17171b',8)); prevBox=r; }
      if(el.dataset.deco==='circle') seq.push(P(svg,ellipse(r.x+r.w/2,r.y+r.h/2,r.w/2+50,r.h/2+24),'#E21525',10));
      if(el.dataset.deco==='under') seq.push(P(svg,'M'+(r.x-10)+','+(r.y+r.h+8)+' Q'+(r.x+r.w/2)+','+(r.y+r.h+26+j(6))+' '+(r.x+r.w+16)+','+(r.y+r.h+2),'#E21525',12));
      if(el.dataset.mark){const mx=el.dataset.markleft?r.x-90:r.x+r.w+40,my=r.y+r.h/2;seq.push(P(svg,el.dataset.mark==='check'?check(mx,my):cross(mx,my),el.dataset.mark==='check'?'#2f7d4f':'#E21525',10));}
    });
    const d=s.end-s.start, n=seq.length, gap=Math.min(1.5,(d-0.7)/Math.max(n,1));
    seq.forEach((el,k)=>{
      const isP=el.tagName.toLowerCase()==='path', L=isP?el.getTotalLength():0;
      const chars=isP?0:el.textContent.length, dur=Math.max(0.28,Math.min(gap*0.92,isP?0.25+L/2600:0.2+chars*0.035));
      const r=isP?(()=>{const b=el.getBBox();return {x:b.x,y:b.y,w:b.width,h:b.height};})():el._r;
      if(isP){el.style.strokeDasharray=L;el.style.strokeDashoffset=L;el.style.opacity=1;}
      window.ITEMS.push({el,isP,L,scene:i,t0:s.start+0.25+k*gap,dur,px,py,r,cx:px+r.x+r.w/2,cy:py+r.y+r.h/2});
    });
  });
};`;

const ANIM = `
const cl=x=>Math.min(Math.max(x,0),1), eo=x=>1-Math.pow(1-cl(x),3), sm=x=>{x=cl(x);return x*x*(3-2*x);};
window.render=function(t){
  const T=window.TL,S=T.scenes,I=window.ITEMS; document.querySelector('.prog b').style.width=(100*t/T.total)+'%';
  let pen=null;
  I.forEach(it=>{const p=cl((t-it.t0)/it.dur);
    if(it.isP){it.el.style.strokeDashoffset=it.L*(1-p);if(p>0&&p<1){const q=it.el.getPointAtLength(it.L*p);pen={x:it.px+q.x,y:it.py+q.y};}}
    else{it.el.style.opacity=p>0?1:0;(it.el._clip||it.el).style.clipPath=p>=1?'none':'inset(-40px '+(100-100*p)+'% -40px -40px)';
      if(p>0&&p<1){const rx=it.r.x+it.r.w*p;pen={x:it.px+rx,y:it.py+it.r.y+it.r.h*(0.55+0.18*Math.sin(t*38))};}}});
  // câmera: anda pelo quadro de uma página para a outra e acompanha o que está sendo desenhado
  let si=S.findIndex(s=>t>=s.start&&t<s.end); if(si<0) si=t<S[0].start?0:S.length-1;
  const sc=S[si], lt=t-sc.start;
  const base=i=>({x:600+i*${GAP}, y:400});
  const st=I.filter(it=>it.scene===si&&t>=it.t0);
  const fo=k=>{if(k<0)return {x:base(si).x+540,y:base(si).y+900};const it=st[k];return {x:base(si).x+540+(it.cx-base(si).x-540)*0.2,y:base(si).y+900+(it.cy-base(si).y-900)*0.2};};
  const k=st.length-1, a=fo(k-1), b=fo(k), q=k>=0?sm((t-st[k].t0)/0.7):1;
  let fx=a.x+(b.x-a.x)*q, fy=a.y+(b.y-a.y)*q, zs=1.01+0.03*Math.sin(lt*0.6);
  if(si>0&&lt<0.55){const pv=base(si-1),e=sm(lt/0.55);fx=pv.x+540+(fx-pv.x-540)*e;fy=pv.y+900+(fy-pv.y-900)*e;zs=zs-0.12*Math.sin(Math.PI*e);}
  const tx=540-fx*zs, ty=880-fy*zs;
  document.getElementById('cam').style.transform='translate('+tx+'px,'+ty+'px) scale('+zs+')';
  const pe=document.getElementById('pen');
  if(pen){pe.style.opacity=1;pe.style.transform='translate('+(tx+pen.x*zs-10)+'px,'+(ty+pen.y*zs-20)+'px)';}else{pe.style.opacity=0;}
  const C=window.CH; let cur=null; for(const c of C){ if(t>=c.start-0.05&&t<c.end+0.25) cur=c; }
  const cap=document.getElementById('capin'); if(!cur){cap.innerHTML='';return;}
  const key=cur.start.toFixed(3); if(cap.dataset.k!==key){cap.dataset.k=key;cap.innerHTML=cur.words.map(w=>'<span class="c">'+w.h+'</span>').join(' ');}
  cap.querySelectorAll('.c').forEach((el,k)=>{const w=cur.words[k];el.classList.toggle('on',t>=w.start-0.03&&t<(cur.words[k+1]?cur.words[k+1].start-0.03:cur.end+0.25));});
};`;

const PEN = `<svg id="pen" viewBox="-10 -20 170 140" style="width:170px;height:140px"><g transform="rotate(40 0 0)"><path d="M0,0 L14,-8 L14,8 Z" fill="#E21525"/><rect x="14" y="-12" width="22" height="24" fill="#cfcfd6"/><rect x="36" y="-14" width="110" height="28" rx="6" fill="#17171b"/><rect x="128" y="-15" width="18" height="30" rx="5" fill="#E21525"/></g></svg>`;

(async () => {
  const ch = chunks(TL.words).map(c => ({ ...c, words: c.words.map(w => ({ ...w, h: esc(w.w) })) }));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="st"><div id="cam"><div id="board"></div>
    ${TL.scenes.map(page).join('')}</div>${PEN}
    <div id="brand">HEAV<i>O</i>N</div><div id="cap"><div id="capin"></div></div><div class="prog"><b></b></div></div>
    <script>window.TL=${JSON.stringify({ total: TL.total, scenes: TL.scenes.map(s => ({ start: s.start, end: s.end })) })};
    window.CH=${JSON.stringify(ch)};${SETUP}${ANIM}</script></body></html>`;
  const browser = await chromium.launch();
  const page_ = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page_.setContent(html, { waitUntil: 'networkidle' });
  await page_.evaluate(() => document.fonts.ready);
  await page_.evaluate(() => window.setup());
  if (process.env.BOARD_TEST) { // quadros de teste: BOARD_TEST="3,9,20"
    for (const t of process.env.BOARD_TEST.split(',').map(Number)) { await page_.evaluate(x => window.render(x), t); await page_.screenshot({ path: `${outMp4}.t${t}.jpg`, type: 'jpeg', quality: 80 }); }
    await browser.close(); return;
  }
  await page_.evaluate(t => window.render(t), Math.max(0.1, TL.scenes[0].end - 0.3));
  fs.writeFileSync(coverOut, await page_.screenshot({ type: 'jpeg', quality: 92 }));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', outMp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(TL.total * FPS);
  for (let f = 0; f < frames; f++) {
    await page_.evaluate(t => window.render(t), f / FPS);
    const buf = await page_.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await browser.close();
  console.log(outMp4, TL.total.toFixed(1) + 's', frames + ' quadros');
})();
