# Rotina diária — Instagram @agencia.heavon

Social media da **Heavon** (marketing digital: infoprodutos, sites de alta conversão, e-commerce,
tráfego pago, social media e criativos, dados/automação/CRM). Site: https://www.heavon.com.br
Público: empresas e donos de negócio (clientes potenciais). Idioma: português do Brasil.
Fuso: America/Sao_Paulo. Repositório: /home/user/heavon-posts (tolazzi/heavon-posts). Sempre `git pull` antes.

**Tom de voz:** direto, estratégico e confiante. Frases curtas, de impacto, sem jargão vazio.
Exemplos do site: "Tráfego sem estratégia queima dinheiro." / "Site bonito que não converte é vitrine vazia."

**Identidade visual** (já embutida em `tools/render.js` e `tools/reel.js`): fundo #050505, vermelho #E21525
com degradê para laranja #F05A28, títulos em Sora, texto em Inter, marca "HEAVON" com o "O" em vermelho.
Use `**trecho**` no texto para destacar em degradê.

## Agenda
| Horário | Etapa |
|---|---|
| 05:00 | Pesquisa de vídeos virais do nicho + criação do **Reels** |
| 09:00 | Publicação do **Reels** |
| 14:00 | Pesquisa de tendências + criação do **carrossel** |
| 18:00 | Publicação do **carrossel** |

Pastas do dia: `posts/AAAA-MM-DD/reel/`, `posts/AAAA-MM-DD/carrossel/` e `posts/AAAA-MM-DD/relatorio.md`
(seções "Reels" e "Carrossel"). O Reels e o carrossel do mesmo dia devem ter temas diferentes.

## Regras gerais
- Descarte tragédias, política partidária, polêmicas e qualquer assunto sensível.
- Nada de afirmação falsa, número inventado ou promessa exagerada ("garantido", "fique rico").
- Nada de imagem, vídeo, áudio ou marca de terceiros sem direito de uso. NUNCA baixe nem reposte vídeo de
  outro perfil: o Reels é sempre original, inspirado no FORMATO que está viralizando, não no conteúdo.
- Nada parecido com posts dos últimos 7 dias (veja `historico.md`).
- Se qualquer etapa falhar, NÃO publique nada pela metade: registre o erro no relatório e avise o usuário na conversa.
- Erro 190 da Graph API = token expirado/inválido: avise que é preciso gerar um token novo.

## 05:00 — Reels: pesquisa de virais + criação
0. Se `posts/AAAA-MM-DD/reel/` já tiver `reel.mp4` e `caption.txt` aprovados pelo usuário (veja o relatório do dia),
   NÃO crie outro: só confirme que está no GitHub e encerre esta etapa.
1. Pesquise os vídeos virais do nicho (marketing digital, tráfego pago, e-commerce, empreendedorismo, vendas):
   - WebSearch (modo extended): Reels/TikToks virais da semana sobre marketing e negócios, formatos de Reels
     em alta, trends e memes do momento, datas comemorativas de hoje.
   - Notícias 24h: `curl -sS "https://news.google.com/rss/search?q=<termo>+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419"`
   - Google Trends BR: `curl -sS "https://trends.google.com/trending/rss?geo=BR"`
   (A API da Meta não permite ler vídeos de outros perfis sem aprovação do app; a pesquisa é pela web.)
2. Escolha as 3 ideias de vídeo que mais combinam com o nicho e o público; registre o formato viral de cada uma
   (ex.: "erro x acerto", "3 coisas que...", "POV", "pare de fazer X", lista rápida, mito x verdade).
3. Crie o Reels em `posts/AAAA-MM-DD/reel/reel.json` (formato no topo de `tools/reel.py`) — padrão v2, aprovado em 16/11:
   - Antes de gerar (uma vez por máquina): `bash tools/setup_reel.sh` (voz Kokoro, legenda Whisper, trilhas Mixkit).
   - Gere: `HF_HUB_DISABLE_XET=1 python3 tools/reel.py posts/AAAA-MM-DD/reel/reel.json` (~2 a 3 min).
   - 15 a 25 segundos, 5 a 7 cenas. Cena 1 (`hook`) = gancho de até 8 palavras na tela, que prenda nos 2 primeiros s.
     Cenas do meio (`point` com "n", ou `versus`) com valor real; última (`cta`) com chamada para ação.
   - O "title" de cada cena é a manchete curta na tela (até ~8 palavras). O conteúdo detalhado vai no "voz":
     a narração vira legenda sincronizada palavra por palavra automaticamente. A duração da cena = tempo da fala.
   - Narração: voz "pm_alex" (padrão), velocidade 1.12. Tom dinâmico e sério, de locutor de negócios; frases curtas
     e afirmativas, sem "e aí, pessoal". Cada "voz" com 6 a 16 palavras. Números e siglas por extenso ("vinte por cento").
   - Trilha: faixa real da Mixkit (licença gratuita, uso comercial, sem atribuição), campo "mood": "tensao" para
     alertas/opiniões fortes, "grave" para dicas e conteúdo reflexivo, "energia" para listas rápidas — ou "music": <id>
     de `tools/audio/faixas.txt`. Alterne ao longo da semana. A música abaixa sozinha quando a voz entra; whoosh nas
     trocas de cena. NUNCA versione os mp3 (a licença proíbe redistribuir). Áudios em alta do Instagram não entram pela API.
   - Confira o vídeo extraindo quadros (`ffmpeg -ss <t> -i reel.mp4 -frames:v 1 x.jpg`) de cada cena: texto cortado,
     sobreposição, legenda errada, erro de digitação. Confira também a capa (cover.jpg).
   - Os geradores antigos (`tools/reel.js`, `tools/trilha.py`, voz Piper) foram REPROVADOS pelo usuário: não use.
4. Legenda em `posts/AAAA-MM-DD/reel/caption.txt`: gancho na 1ª linha, corpo curto com quebras de linha,
   CTA no fim, de 3 a 5 emojis, de 5 a 10 hashtags (grandes, médias e de nicho).
5. Revise (regras gerais), escreva a seção "Reels" do relatório (ideia escolhida, formato viral de referência
   e por quê, as 2 alternativas, a legenda) e faça commit + push para `main`. NÃO publique nesta etapa.

## 09:00 — Reels: publicação
6. `python3 tools/publish.py posts/AAAA-MM-DD/reel https://raw.githubusercontent.com/tolazzi/heavon-posts/main/posts/AAAA-MM-DD/reel`
7. Registre o link e qualquer erro no relatório, adicione uma linha em `historico.md`, commit + push.

## 14:00 — Carrossel: pesquisa + criação
8. Levante as tendências do dia: Google Trends BR, notícias das últimas 24h do nicho, memes e assuntos do
   momento (WebSearch), datas comemorativas. Escolha as 3 que mais combinam (tema diferente do Reels de hoje).
9. Crie o carrossel em `posts/AAAA-MM-DD/carrossel/post.json` (formato em `tools/render.js`):
   5 a 7 slides 1080x1350; slide 1 (`hook`) com gancho de até 8 palavras; slides do meio (`content`) com valor
   real; último (`cta`) com chamada para ação. Gere com `node tools/render.js ...` e OLHE cada imagem.
10. Legenda em `posts/AAAA-MM-DD/carrossel/caption.txt` (mesmas regras da legenda do Reels).
11. Revise, escreva a seção "Carrossel" do relatório (tendência e por quê, 2 alternativas, legenda),
    commit + push. NÃO publique nesta etapa.

## 18:00 — Carrossel: publicação
12. `python3 tools/publish.py posts/AAAA-MM-DD/carrossel https://raw.githubusercontent.com/tolazzi/heavon-posts/main/posts/AAAA-MM-DD/carrossel`
13. Registre o link e qualquer erro no relatório, adicione uma linha em `historico.md`, commit + push.

Teste sem publicar: acrescente `--dry-run` ao comando do `publish.py`.
