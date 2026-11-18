// Renderizador do formato "história" (motion graphics no estilo do vídeo de referência do usuário).
// Uso interno (chamado por tools/reel.py quando reel.json tem "style": "story"):
//   node tools/story_render.js <timeline.json> <audio.wav> <saida.mp4> <capa.jpg>
// Tipos de cena ("kind"):
//   phone     {tag, counter:{label,value}, notifs:[{h,t}], big, bigLabel}
//   dashboard {tag, spend:{label,from,to,prefix}, sales:{label,value}}
//   chat      {tag, title, msgs:["..."], seen}
//   rule      {tag, n, stamp, icon:"clock"|"tag"|"chart", iconText}
//   cliff     {tag, notif:{h,t}, part}
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const FPS = 30;
const [, , tlFile, audio, outMp4, coverOut] = process.argv;
const TL = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Sora:wght@600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;background:#07070a;overflow:hidden}
#st{position:relative;width:1080px;height:1920px;overflow:hidden;color:#fafafa;font-family:Inter}
#cam{position:absolute;inset:0;transform-origin:50% 45%}
.room{position:absolute;inset:-60px;background:radial-gradient(ellipse 900px 700px at 50% 55%,rgba(226,21,37,.22),transparent 70%),linear-gradient(180deg,#0d0d14 0%,#09090d 55%,#050507 100%)}
.wall{position:absolute;left:0;right:0;top:0;height:1240px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.02) 0 2px,transparent 2px 160px)}
.desk{position:absolute;left:-60px;right:-60px;top:1240px;height:800px;background:linear-gradient(180deg,#2a1714 0%,#160c0b 30%,#0a0606 100%);border-top:6px solid #3b1f1a}
.win{position:absolute;left:100px;top:380px;width:300px;height:430px;border-radius:14px;background:linear-gradient(180deg,#1b2340,#0d1226);border:10px solid #1a1a22;overflow:hidden}
.win:after{content:'';position:absolute;left:50%;top:0;bottom:0;width:10px;background:#1a1a22}
.city{position:absolute;left:0;right:0;bottom:0;height:140px;background:repeating-linear-gradient(90deg,#0a0d1c 0 38px,#0f1428 38px 70px)}
.sc{position:absolute;inset:0;opacity:0}
.brand{position:absolute;top:120px;left:80px;font-family:Sora;font-weight:800;font-size:30px;letter-spacing:.32em;z-index:5}.brand i{font-style:normal;color:#E21525}
#tag{position:absolute;top:230px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;padding:16px 28px;border-radius:999px;background:rgba(10,10,14,.88);border:1.5px solid rgba(255,255,255,.12);font-family:Sora;font-weight:700;font-size:30px;letter-spacing:.12em;white-space:nowrap;z-index:5}
#tag i{width:14px;height:14px;border-radius:50%;background:#E21525;box-shadow:0 0 14px #E21525}
.counter{position:absolute;top:360px;right:90px;text-align:center;background:rgba(10,10,14,.92);border:1.5px solid rgba(255,255,255,.1);border-radius:22px;padding:18px 40px}
.counter small{display:block;font-family:Sora;font-weight:700;font-size:24px;letter-spacing:.2em;color:#9a9aa6}
.counter b{font-family:Sora;font-weight:800;font-size:110px;line-height:1;color:#FF3B3B}
.phone{position:absolute;left:50%;top:700px;width:400px;height:780px;margin-left:-200px;border-radius:64px;background:#0b0b0f;border:12px solid #1d1d24;box-shadow:0 40px 120px rgba(0,0,0,.7),0 0 140px rgba(226,21,37,.25)}
.screen{position:absolute;inset:14px;border-radius:48px;background:linear-gradient(180deg,#141420,#0b0b12);overflow:hidden;padding:64px 22px}
.nt{background:rgba(255,255,255,.09);border-radius:22px;padding:16px 18px;margin-bottom:14px;font-size:23px;line-height:1.25;opacity:0}
.nt .h{font-weight:800;font-size:19px;letter-spacing:.08em;color:#FF6B4A;margin-bottom:5px}
.big{font-family:Sora;font-weight:800;font-size:120px;text-align:center;margin-top:24px}
.bl{text-align:center;color:#9a9aa6;font-weight:700;letter-spacing:.14em;font-size:22px}
.cards{position:absolute;left:80px;right:80px;top:400px;display:flex;flex-direction:column;gap:30px}
.card{background:rgba(14,14,20,.92);border:1.5px solid rgba(255,255,255,.1);border-radius:30px;padding:34px 40px}
.card small{font-family:Sora;font-weight:700;font-size:28px;letter-spacing:.18em;color:#9a9aa6}
.card b{display:block;font-family:Sora;font-weight:800;font-size:120px;line-height:1.05}
.card.up b{color:#FF3B3B}.card svg{width:100%;height:150px;margin-top:10px}
.bubble{max-width:300px;background:#262633;border-radius:24px 24px 24px 6px;padding:16px 20px;font-size:25px;margin-bottom:14px;opacity:0}
.seen{font-size:19px;color:#8a8a96;margin:-6px 0 16px 6px;opacity:0}
.badge{position:absolute;top:-22px;right:-22px;width:84px;height:84px;border-radius:50%;background:#E21525;font-family:Sora;font-weight:800;font-size:44px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(226,21,37,.7)}
.ctitle{position:absolute;top:360px;left:0;right:0;text-align:center;font-family:Sora;font-weight:800;font-size:60px}
.rule{position:absolute;top:400px;left:0;right:0;text-align:center}
.rule small{font-family:Sora;font-weight:800;font-size:44px;letter-spacing:.24em;color:#F05A28}
.rule h1{font-family:Sora;font-weight:800;font-size:250px;line-height:.9;letter-spacing:-.05em;background:linear-gradient(105deg,#FF2A3A,#F05A28);-webkit-background-clip:text;background-clip:text;color:transparent}
.stamp{position:absolute;left:50%;top:880px;border:12px solid #FF3B3B;color:#FF3B3B;border-radius:22px;padding:22px 40px;font-family:Sora;font-weight:800;font-size:78px;line-height:1.02;text-align:center;background:rgba(255,59,59,.07);box-shadow:0 0 60px rgba(255,59,59,.25);white-space:nowrap}
.icon{position:absolute;left:50%;top:1230px;width:240px;height:240px;margin-left:-120px}
.clock{border-radius:50%;border:10px solid #fafafa}
.clock .hh,.clock .mm{position:absolute;left:50%;top:50%;border-radius:4px;transform-origin:50% 100%}
.clock .mm{width:8px;height:86px;margin-left:-4px;margin-top:-86px;background:#fafafa}
.clock .hh{width:8px;height:60px;margin-left:-4px;margin-top:-60px;background:#E21525}
.ptag{width:330px;margin-left:-165px;height:200px;border-radius:24px 70px 70px 24px;background:linear-gradient(105deg,#E21525,#F05A28);display:flex;align-items:center;justify-content:center;font-family:Sora;font-weight:800;font-size:64px;transform-origin:10% 50%;box-shadow:0 20px 60px rgba(226,21,37,.45)}
.chart{width:520px;margin-left:-260px;height:260px}
.part{position:absolute;top:470px;left:0;right:0;text-align:center;font-family:Sora;font-weight:800;font-size:150px;letter-spacing:-.03em;opacity:0}
.part span{display:block;font-size:40px;letter-spacing:.3em;color:#F05A28;margin-bottom:10px}
.ring{position:absolute;left:50%;top:1090px;border-radius:50%;border:4px solid rgba(255,59,59,.5)}
.blur{filter:blur(9px)}
.card.good{border-color:rgba(61,220,132,.45)}
.note{font-size:24px;color:#8a8a96;font-weight:600;letter-spacing:.06em;text-align:center}
.endt{position:absolute;top:470px;left:70px;right:70px;text-align:center;font-family:Sora;font-weight:800;font-size:104px;line-height:1.04;letter-spacing:-.03em}
.hl2{background:linear-gradient(105deg,#FF2A3A,#F05A28);-webkit-background-clip:text;background-clip:text;color:transparent}
.ends{position:absolute;top:900px;left:90px;right:90px;text-align:center;font-size:40px;line-height:1.35;color:#c9c9d1;font-weight:600}
.endb{position:absolute;top:1080px;left:50%;margin-left:-260px;width:520px;text-align:center;padding:34px 0;border-radius:999px;background:linear-gradient(105deg,#E21525,#F05A28);font-family:Sora;font-weight:800;font-size:46px;box-shadow:0 20px 70px rgba(226,21,37,.5)}
.endlogo{position:absolute;top:1300px;left:0;right:0;text-align:center;font-family:Sora;font-weight:800;font-size:64px;letter-spacing:.36em}.endlogo i{font-style:normal;color:#E21525}
.half{position:absolute;left:70px;right:70px;border-radius:34px;padding:34px 40px;opacity:0}
.half.top{top:330px;height:560px;background:linear-gradient(160deg,rgba(61,220,132,.14),rgba(14,14,20,.92) 60%);border:2px solid rgba(61,220,132,.4)}
.half.bot{top:920px;height:560px;background:linear-gradient(160deg,rgba(226,21,37,.2),rgba(14,14,20,.92) 60%);border:2px solid rgba(226,21,37,.55)}
.hl3{font-family:Sora;font-weight:800;font-size:36px;letter-spacing:.22em}.top .hl3{color:#3DDC84}.bot .hl3{color:#FF5A4A}
.hq{font-family:Sora;font-weight:800;font-size:74px;line-height:1.06;margin:18px 0 30px}
.hi{display:flex;align-items:center;gap:20px;font-size:44px;font-weight:700;margin-bottom:20px;opacity:0}
.hi b{flex:none;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px}
.top .hi b{background:#3DDC84;color:#062}.bot .hi b{background:#E21525}
#cap{position:absolute;left:60px;right:60px;top:1560px;height:200px;display:flex;align-items:center;justify-content:center;text-align:center;z-index:6}
#capin{font-family:Sora;font-weight:800;font-size:76px;line-height:1.12;letter-spacing:-.02em;text-shadow:0 6px 24px rgba(0,0,0,.9)}
#capin .c{display:inline-block;padding:2px 14px;margin:4px 2px;border-radius:16px}
#capin .c.on{background:linear-gradient(105deg,#E21525,#F05A28);text-shadow:none}
#flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(255,80,60,.6),rgba(226,21,37,.15) 60%,transparent 80%);opacity:0;z-index:7}
.prog{position:absolute;left:80px;right:80px;bottom:120px;height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;z-index:6}.prog b{display:block;height:100%;width:0;background:linear-gradient(90deg,#E21525,#F05A28)}
`;

function sceneHTML(s, i) {
  const k = s.kind;
  let h = '';
  if (k === 'phone') h = `<div class="win"><div class="city"></div></div>
    ${s.counter ? `<div class="counter a-pop"><small>${esc(s.counter.label)}</small><b>${esc(s.counter.value)}</b></div>` : ''}
    <div class="phone a-phone"><div class="screen">${(s.notifs || []).map(n => `<div class="nt"><div class="h">${esc(n.h)}</div>${esc(n.t)}</div>`).join('')}
    ${s.big !== undefined ? `<div class="big a-big">${esc(s.big)}</div><div class="bl">${esc(s.bigLabel || '')}</div>` : ''}</div></div>`;
  else if (k === 'dashboard') h = `<div class="cards"><div class="card up a-pop"><small>${esc(s.spend.label)}</small><b><span class="num" data-from="${s.spend.from}" data-to="${s.spend.to}" data-prefix="${esc(s.spend.prefix || '')}">0</span> ↑</b>
      <svg viewBox="0 0 800 150"><polyline class="spark" fill="none" stroke="#FF3B3B" stroke-width="8" stroke-linecap="round" points="0,140 120,120 240,125 360,90 480,80 600,45 800,10"/></svg></div>
    ${s.sales.to !== undefined
      ? `<div class="card good a-pop"><small>${esc(s.sales.label)}</small><b style="color:#3DDC84"><span class="num" data-from="${s.sales.from || 0}" data-to="${s.sales.to}" data-prefix="${esc(s.sales.prefix || '')}">0</span> ↑</b>
         <svg viewBox="0 0 800 150"><polyline class="spark" fill="none" stroke="#3DDC84" stroke-width="8" stroke-linecap="round" points="0,145 150,135 300,110 450,95 600,55 800,8"/></svg></div>`
      : `<div class="card a-pop"><small>${esc(s.sales.label)}</small><b>${esc(s.sales.value)}</b>
         <svg viewBox="0 0 800 150"><polyline fill="none" stroke="#6f6f7a" stroke-width="8" stroke-dasharray="18 14" points="0,140 800,140"/></svg></div>`}
    ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}</div>`;
  else if (k === 'chat') h = `${s.title ? `<div class="ctitle">${esc(s.title)}</div>` : ''}<div class="phone a-phone" style="top:520px"><div class="badge"><span class="unread">0</span></div><div class="screen">
      ${(s.msgs || []).map(m => `<div class="bubble">${esc(m)}</div><div class="seen">${esc(s.seen || '')}</div>`).join('')}</div></div>`;
  else if (k === 'rule') {
    let icon = '';
    if (s.icon === 'clock') icon = `<div class="icon clock"><div class="mm"></div><div class="hh"></div></div>`;
    else if (s.icon === 'tag') icon = `<div class="icon ptag">${esc(s.iconText || 'PIX −5%')}</div>`;
    else icon = `<svg class="icon chart" viewBox="0 0 520 260"><rect x="20" y="170" width="70" height="80" rx="10" fill="#2a2a34"/><rect x="130" y="130" width="70" height="120" rx="10" fill="#2a2a34"/><rect x="240" y="90" width="70" height="160" rx="10" fill="#2a2a34"/><rect class="bar4" x="350" y="40" width="70" height="210" rx="10" fill="#E21525"/></svg>`;
    h = `<div class="rule"><small>REGRA Nº</small><h1 class="a-num">${esc(s.n)}</h1></div><div class="stamp">${esc(s.stamp).replace(/\|/g, '<br>')}</div>${icon}`;
  } else if (k === 'cliff') h = `<div class="ring" style="width:620px;height:620px;margin-left:-310px;margin-top:-310px"></div><div class="ring" style="width:900px;height:900px;margin-left:-450px;margin-top:-450px"></div>
    <div class="phone a-vib" style="top:700px"><div class="screen"><div class="nt" style="background:rgba(226,21,37,.28)"><div class="h">${esc(s.notif.h)}</div><div class="blur">${esc(s.notif.t)}</div></div></div></div>
    <div class="part"><span>CONTINUA NA</span>${esc(s.part || 'PARTE 2')}</div>`;
  else if (k === 'split') {
    const half = (lbl, quote, items, cls) => `<div class="half ${cls}"><div class="hl3">${esc(lbl)}</div><div class="hq">${esc(quote)}</div>
      ${(items || []).map(t => `<div class="hi"><b>${cls === 'top' ? '✓' : '✕'}</b>${esc(t)}</div>`).join('')}</div>`;
    h = half(s.topLabel, s.topQuote, s.topItems, 'top') + half(s.botLabel, s.botQuote, s.botItems, 'bot');
  }
  else if (k === 'end') h = `<div class="endt a-end">${String(esc(s.title)).replace(/\*\*(.+?)\*\*/g, '<span class="hl2">$1</span>').replace(/\|/g, '<br>')}</div>
    <div class="ends a-pop">${esc(s.sub || '')}</div><div class="endb a-pop">${esc(s.button || 'Fale com a Heavon')}</div>
    <div class="endlogo a-pop">HEAV<i>O</i>N</div>${s.note ? `<div class="note" style="position:absolute;left:0;right:0;top:1440px;text-align:center">${esc(s.note)}</div>` : ''}`;
  return `<div class="sc" id="s${i}" data-kind="${k}">${h}</div>`;
}

function chunks(ws) {
  const out = []; let cur = [];
  ws.forEach((w, i) => { cur.push(w); const nx = ws[i + 1];
    if (cur.length >= 3 || /[.,!?;:]$/.test(w.w) || !nx || nx.start - w.end > 0.35) { out.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } });
  return out;
}

const ANIM = `
const cl=x=>Math.min(Math.max(x,0),1), eo=x=>1-Math.pow(1-cl(x),3);
const back=x=>{x=cl(x);const c1=1.7,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
const fmt=n=>Math.round(n).toLocaleString('pt-BR');
window.render=function(t){
  const T=window.TL,S=T.scenes; document.querySelector('.prog b').style.width=(100*t/T.total)+'%';
  let flash=0, tag='', camS=1, camX=0, camR=0;
  S.forEach((s,i)=>{
    const el=document.getElementById('s'+i);
    if(t<s.start||t>=s.end){el.style.opacity=0;return;}
    const lt=t-s.start, d=s.end-s.start; tag=s.tag||'';
    const inn=eo(lt/0.3), out=eo((lt-(d-0.2))/0.2);
    flash=Math.max(flash,1-cl(lt/0.2));
    el.style.opacity=1-out;
    // transição tipo "whip": entra deslizando de lado e sai para o outro
    el.style.transform='translateX('+((1-inn)*(i%2?-160:160)+out*(i%2?160:-160))+'px)';
    camS=1.0+0.05*cl(lt/d); camR=(i%2?-1:1)*0.6*cl(lt/d);
    el.querySelectorAll('.a-pop').forEach((p,k)=>{const b=back((lt-0.1-k*0.25)/0.4);p.style.transform='scale('+(0.6+0.4*b)+')';p.style.opacity=cl((lt-0.1-k*0.25)/0.15);});
    el.querySelectorAll('.a-phone').forEach(p=>{const b=back((lt-0.05)/0.5);p.style.transform='translateY('+(300*(1-b))+'px) rotate('+(-4+Math.sin(t*1.3)*1.2)+'deg)';});
    el.querySelectorAll('.nt').forEach((n,k)=>{const p=back((lt-0.45-k*0.45)/0.35);n.style.opacity=cl((lt-0.45-k*0.45)/0.12);n.style.transform='translateY('+(-40*(1-p))+'px) scale('+(0.9+0.1*p)+')';});
    el.querySelectorAll('.a-big').forEach(b=>{const p=back((lt-1.2)/0.4);b.style.transform='scale('+(0.4+0.6*p)+')';b.style.opacity=cl((lt-1.2)/0.15);});
    el.querySelectorAll('.num').forEach(n=>{const f=+n.dataset.from,to=+n.dataset.to;n.textContent=n.dataset.prefix+fmt(f+(to-f)*eo((lt-0.3)/(d*0.8)));});
    el.querySelectorAll('.spark').forEach(p=>{const L=900;p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-eo((lt-0.3)/(d*0.8)));});
    el.querySelectorAll('.bubble').forEach((b,k)=>{const p=back((lt-0.3-k*0.6)/0.35);b.style.opacity=cl((lt-0.3-k*0.6)/0.12);b.style.transform='scale('+(0.7+0.3*p)+')';b.style.transformOrigin='0 100%';
      const sn=b.nextElementSibling; if(sn) sn.style.opacity=cl((lt-0.6-k*0.6)/0.2);});
    el.querySelectorAll('.unread').forEach(u=>{const n=el.querySelectorAll('.bubble').length;u.textContent=Math.min(n,Math.max(0,Math.floor((lt-0.3)/0.6)+1));});
    el.querySelectorAll('.a-num').forEach(h=>{const p=back(lt/0.35);h.style.transform='scale('+(2.2-1.2*p)+')';h.style.opacity=cl(lt/0.1);});
    el.querySelectorAll('.stamp').forEach(st=>{const a=lt-0.55;const p=cl(a/0.18);const sh=a>0.18&&a<0.5?Math.sin(a*90)*10*(1-(a-0.18)/0.32):0;
      st.style.opacity=cl(a/0.06);st.style.transform='translate(-50%,0) translate('+sh+'px,0) rotate(-8deg) scale('+(2.6-1.6*eo(p))+')';
      if(a>0.15&&a<0.35) flash=Math.max(flash,0.5*(1-(a-0.15)/0.2));});
    el.querySelectorAll('.clock .mm').forEach(m=>{m.style.transform='rotate('+(lt*220)+'deg)';});
    el.querySelectorAll('.clock .hh').forEach(m=>{m.style.transform='rotate('+(lt*18)+'deg)';});
    el.querySelectorAll('.icon').forEach(ic=>{ic.style.opacity=cl((lt-0.9)/0.2);});
    el.querySelectorAll('.ptag').forEach(p=>{p.style.transform='rotate('+(Math.sin(lt*3.2)*10*Math.exp(-lt*0.5))+'deg)';});
    el.querySelectorAll('.bar4').forEach(b=>{const p=eo((lt-1)/0.6);b.setAttribute('height',210*p);b.setAttribute('y',250-210*p);});
    el.querySelectorAll('.a-vib').forEach(p=>{const v=lt>0.4?Math.sin(lt*70)*7*(0.6+0.4*Math.sin(lt*3)):0;p.style.transform='translateX('+v+'px) rotate('+(3+v*0.15)+'deg)';});
    el.querySelectorAll('.ring').forEach((r,k)=>{const ph=((lt*0.9+k*0.5)%1);r.style.transform='scale('+(0.6+ph*0.8)+')';r.style.opacity=(1-ph)*0.8;});
    el.querySelectorAll('.half').forEach((hf,k)=>{const st=k?d*0.42:0.05;const p=back((lt-st)/0.45);hf.style.opacity=cl((lt-st)/0.15);
      hf.style.transform='translateX('+((1-p)*(k?400:-400))+'px)';
      hf.querySelectorAll('.hi').forEach((it,j)=>{it.style.opacity=cl((lt-st-0.4-j*0.35)/0.15);});});
    el.querySelectorAll('.a-end').forEach(e=>{const q=back((lt-0.1)/0.45);e.style.opacity=cl((lt-0.1)/0.15);e.style.transform='scale('+(0.75+0.25*q)+')';});
    el.querySelectorAll('.endb').forEach(e=>{e.style.boxShadow='0 20px '+(70+30*Math.sin(lt*5))+'px rgba(226,21,37,.55)';});
    el.querySelectorAll('.part').forEach(p=>{const q=back((lt-(d-2.2))/0.4);p.style.opacity=cl((lt-(d-2.2))/0.2);p.style.transform='scale('+(0.7+0.3*q)+')';});
  });
  document.getElementById('cam').style.transform='scale('+camS+') rotate('+camR+'deg)';
  document.getElementById('flash').style.opacity=0.6*flash;
  const tg=document.getElementById('tagt'); const shown=tag.slice(0,Math.max(0,Math.floor(((t-(S.find(s=>t>=s.start&&t<s.end)||{start:0}).start)/0.02))));
  tg.textContent=shown; document.getElementById('tag').style.visibility=tag?'visible':'hidden';
  const C=window.CH; let cur=null; for(const c of C){ if(t>=c.start-0.05&&t<c.end+0.25) cur=c; }
  const cap=document.getElementById('capin'); if(!cur){cap.innerHTML='';return;}
  const key=cur.start.toFixed(3); if(cap.dataset.k!==key){cap.dataset.k=key;cap.innerHTML=cur.words.map(w=>'<span class="c">'+w.h+'</span>').join(' ');}
  const p=back((t-cur.start+0.05)/0.18); cap.style.transform='scale('+(0.85+0.15*p)+')';
  cap.querySelectorAll('.c').forEach((el,k)=>{const w=cur.words[k];el.classList.toggle('on',t>=w.start-0.03&&t<(cur.words[k+1]?cur.words[k+1].start-0.03:cur.end+0.25));});
};`;

(async () => {
  const ch = chunks(TL.words).map(c => ({ ...c, words: c.words.map(w => ({ ...w, h: esc(w.w) })) }));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="st"><div id="cam">
    <div class="room"><div class="wall"></div><div class="desk"></div></div>${TL.scenes.map(sceneHTML).join('')}</div>
    <div class="brand">HEAV<i>O</i>N</div><div id="tag"><i></i><span id="tagt"></span></div>
    <div id="cap"><div id="capin"></div></div><div id="flash"></div><div class="prog"><b></b></div></div>
    <script>window.TL=${JSON.stringify({ total: TL.total, scenes: TL.scenes.map(s => ({ start: s.start, end: s.end, tag: s.tag || '' })) })};
    window.CH=${JSON.stringify(ch)};${ANIM}</script></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', outMp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(TL.total * FPS), coverF = Math.round(Math.min(TL.scenes[0].end - 0.3, 2.2) * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f === coverF) fs.writeFileSync(coverOut, buf);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await browser.close();
  console.log(outMp4, TL.total.toFixed(1) + 's', frames + ' quadros');
})();
