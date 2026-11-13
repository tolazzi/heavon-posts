# Rotina diária — Instagram @agencia.heavon

Social media da **Heavon** (marketing digital: infoprodutos, sites de alta conversão, e-commerce,
tráfego pago, social media e criativos, dados/automação/CRM). Site: https://www.heavon.com.br
Público: empresas e donos de negócio (clientes potenciais). Idioma: português do Brasil.
Fuso: America/Sao_Paulo.

**Tom de voz:** direto, estratégico e confiante. Frases curtas, de impacto, sem jargão vazio.
Exemplos do site: "Tráfego sem estratégia queima dinheiro." / "Site bonito que não converte é vitrine vazia."

**Identidade visual** (já embutida em `tools/render.js`): fundo #050505, vermelho #E21525 com degradê
para laranja #F05A28, títulos em Sora, texto em Inter, marca "HEAVON" com o "O" em vermelho.
Use `**trecho**` no texto do slide para destacar em degradê.

## 05:00 — Pesquisa
1. Levante as tendências do dia:
   - Google Trends BR: `curl -sS "https://trends.google.com/trending/rss?geo=BR"`
   - Notícias 24h do nicho: `curl -sS "https://news.google.com/rss/search?q=<termo>+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419"`
     (termos: marketing digital, tráfego pago, e-commerce, Instagram, Meta Ads, Google Ads, inteligência artificial marketing, Black Friday etc.)
   - Ferramenta WebSearch: formatos/áudios de Reels em alta, memes e desafios virais, datas comemorativas de hoje,
     e o que perfis de referência do nicho estão postando.
2. Escolha as 3 tendências que mais combinam com o nicho e o público. Descarte tragédias, política partidária,
   polêmicas e qualquer assunto sensível.

## 06:00 — Criação
3. Para a melhor tendência, crie 1 post em `posts/AAAA-MM-DD/post.json` (formato em `tools/render.js`):
   - Carrossel de 5 a 7 slides (1080x1350). Slide 1 (`hook`): gancho de no máximo 8 palavras.
   - Slides do meio (`content`): valor real (dica, lista, antes/depois, curiosidade).
   - Último (`cta`): chamada para ação (salvar, compartilhar, comentar).
   - Gere com `node tools/render.js posts/AAAA-MM-DD/post.json` e OLHE cada imagem (texto cortado, sobreposição).
4. Legenda em `posts/AAAA-MM-DD/caption.txt`: 1ª linha com gancho, corpo curto com quebras de linha,
   CTA no fim, de 3 a 5 emojis no máximo, de 5 a 10 hashtags (grandes, médias e de nicho).
5. Revise: ortografia; nada de afirmação falsa ou promessa exagerada (sem "garantido", números inventados);
   nada de imagem ou marca de terceiros sem direito de uso; nada parecido com os posts dos últimos 7 dias
   (veja `historico.md` e os posts já publicados via API).
6. Commit e push dos arquivos do dia para `main` (as imagens precisam estar públicas para a publicação).

## 09:00 — Publicação
7. Confirme que `posts/AAAA-MM-DD/` está completo e revisado. Publique:
   `python3 tools/publish.py posts/AAAA-MM-DD https://raw.githubusercontent.com/tolazzi/heavon-posts/main/posts/AAAA-MM-DD`
8. Registre em `posts/AAAA-MM-DD/relatorio.md`: tendência escolhida e por quê, as 2 alternativas, a legenda,
   o link do post e qualquer erro. Adicione uma linha em `historico.md`. Commit e push.

## Falhas
Se qualquer etapa falhar (pesquisa sem resultado, slides com problema, erro na publicação), NÃO publique
nada pela metade: registre o erro no relatório do dia e avise o usuário na conversa.
Erro 190 da Graph API = token expirado/inválido: avise que é preciso gerar um token novo.
