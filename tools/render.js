// Renderiza os slides de um post da Heavon em PNG 1080x1350.
// Uso: node render.js posts/AAAA-MM-DD/post.json
// post.json: { "slides": [ {"type":"hook","kicker":"...","title":"...","sub":"..."},
//                          {"type":"content","n":"01","title":"...","body":"..."},
//                          {"type":"cta","title":"...","body":"...","actions":["Salve","Compartilhe","Comente"]} ] }
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// **texto** vira destaque em degradê
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>').replace(/\n/g, '<br>');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;background:#050505}
.s{position:relative;width:1080px;height:1350px;overflow:hidden;background:#050505;color:#FAFAFA;font-family:Inter,sans-serif;padding:96px 88px}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;filter:blur(140px);opacity:.28;background:radial-gradient(circle,#E21525 0%,#F05A28 45%,transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:90px 90px}
.top,.bot{position:absolute;left:88px;right:88px;display:flex;justify-content:space-between;align-items:center;font-family:Sora;font-size:24px;letter-spacing:.18em;color:#A6A6B0;text-transform:uppercase}
.top{top:72px}.bot{bottom:72px;font-size:22px}
.brand{font-weight:800;color:#FAFAFA;letter-spacing:.28em}
.brand i{font-style:normal;color:#E21525}
.hl{background:linear-gradient(110deg,#E21525,#F05A28);-webkit-background-clip:text;background-clip:text;color:transparent}
.bar{width:120px;height:8px;border-radius:4px;background:linear-gradient(110deg,#E21525,#F05A28);margin-bottom:44px}
.kicker{font-family:Sora;font-weight:600;font-size:30px;letter-spacing:.2em;text-transform:uppercase;color:#F05A28;margin-bottom:36px}
.center{position:absolute;left:88px;right:88px;top:50%;transform:translateY(-50%)}
h1{font-family:Sora;font-weight:800;font-size:112px;line-height:1.02;letter-spacing:-.035em}
h2{font-family:Sora;font-weight:700;font-size:72px;line-height:1.08;letter-spacing:-.025em;margin-bottom:40px}
.sub{font-size:38px;line-height:1.4;color:#B8B8C2;margin-top:44px}
.body{font-size:40px;line-height:1.45;color:#C9C9D1}
.num{font-family:Sora;font-weight:800;font-size:220px;line-height:.9;letter-spacing:-.05em;margin-bottom:28px;background:linear-gradient(110deg,#E21525,#F05A28);-webkit-background-clip:text;background-clip:text;color:transparent}
.card{background:#101014;border:1px solid #23232B;border-radius:28px;padding:48px 52px;margin-top:20px}
.acts{display:flex;gap:22px;margin-top:56px;flex-wrap:wrap}
.act{font-family:Sora;font-weight:600;font-size:32px;padding:22px 34px;border-radius:999px;border:2px solid #E21525;color:#FAFAFA}
.act.f{background:linear-gradient(110deg,#E21525,#F05A28);border-color:transparent}
.swipe{color:#FAFAFA}
`;

function slideHTML(sl, i, total) {
  const top = `<div class="top"><span class="brand">HEAV<i>O</i>N</span><span>${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></div>`;
  const last = i === total - 1;
  const bot = `<div class="bot"><span>@agencia.heavon</span><span class="swipe">${last ? 'heavon.com.br' : 'arraste →'}</span></div>`;
  let inner = '';
  if (sl.type === 'hook') {
    inner = `<div class="glow" style="right:-300px;top:-250px"></div>
      <div class="center">${sl.kicker ? `<div class="kicker">${esc(sl.kicker)}</div>` : '<div class="bar"></div>'}
      <h1>${rich(sl.title)}</h1>${sl.sub ? `<div class="sub">${rich(sl.sub)}</div>` : ''}</div>`;
  } else if (sl.type === 'content') {
    inner = `<div class="glow" style="left:-450px;bottom:-500px;opacity:.18"></div>
      <div class="center">${sl.n ? `<div class="num">${esc(sl.n)}</div>` : '<div class="bar"></div>'}
      <h2>${rich(sl.title)}</h2><div class="body">${rich(sl.body)}</div>
      ${sl.card ? `<div class="card body">${rich(sl.card)}</div>` : ''}</div>`;
  } else {
    const acts = (sl.actions || ['Salve', 'Compartilhe', 'Comente']).map((a, k) => `<span class="act${k === 0 ? ' f' : ''}">${esc(a)}</span>`).join('');
    inner = `<div class="glow" style="left:50%;top:50%;transform:translate(-50%,-50%);opacity:.32"></div>
      <div class="center"><div class="bar"></div><h2>${rich(sl.title)}</h2><div class="body">${rich(sl.body)}</div><div class="acts">${acts}</div></div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s"><div class="grid"></div>${inner}${top}${bot}</div></body></html>`;
}

(async () => {
  const file = process.argv[2];
  const post = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(file);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const out = [];
  for (let i = 0; i < post.slides.length; i++) {
    await page.setContent(slideHTML(post.slides[i], i, post.slides.length), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const f = path.join(dir, `slide-${i + 1}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
    out.push(f);
  }
  await browser.close();
  // Instagram aceita apenas JPEG via API
  console.log(out.join('\n'));
})();
