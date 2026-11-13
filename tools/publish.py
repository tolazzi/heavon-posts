"""Publica um carrossel (ou imagem única) no Instagram @agencia.heavon pela Graph API.

Uso: python3 publish.py <pasta_do_post> <url_base_publica_das_imagens>
  - a pasta precisa ter caption.txt e slide-1.jpg ... slide-N.jpg
  - as imagens já precisam estar acessíveis em <url_base>/slide-N.jpg
O token é injetado pelo proxy da sessão (nenhuma chave neste arquivo).
Sai com código != 0 e não publica nada se qualquer etapa falhar.
"""
import json, sys, time, glob, os, urllib.request, urllib.parse, urllib.error

IG = "17841421414831844"  # @agencia.heavon
API = "https://graph.facebook.com/v21.0"


def call(method, path, **params):
    data = urllib.parse.urlencode(params).encode() if method == "POST" else None
    url = f"{API}/{path}" + ("" if method == "POST" else "?" + urllib.parse.urlencode(params))
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read().decode()[:500]}")


def wait_ready(cid):
    for _ in range(30):
        st = call("GET", cid, fields="status_code,status").get("status_code")
        if st == "FINISHED":
            return
        if st in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"container {cid} falhou: {st}")
        time.sleep(5)
    raise RuntimeError(f"container {cid} não ficou pronto a tempo")


def main(folder, base):
    caption = open(os.path.join(folder, "caption.txt"), encoding="utf-8").read().strip()
    slides = sorted(glob.glob(os.path.join(folder, "slide-*.jpg")), key=lambda p: int(p.rsplit("-", 1)[1].split(".")[0]))
    if not slides:
        raise RuntimeError("nenhum slide encontrado")
    urls = [f"{base.rstrip('/')}/{os.path.basename(p)}" for p in slides]
    if len(urls) == 1:
        cid = call("POST", f"{IG}/media", image_url=urls[0], caption=caption)["id"]
    else:
        children = [call("POST", f"{IG}/media", image_url=u, is_carousel_item="true")["id"] for u in urls]
        for c in children:
            wait_ready(c)
        cid = call("POST", f"{IG}/media", media_type="CAROUSEL", children=",".join(children), caption=caption)["id"]
    wait_ready(cid)
    media_id = call("POST", f"{IG}/media_publish", creation_id=cid)["id"]
    link = call("GET", media_id, fields="permalink").get("permalink")
    print(json.dumps({"media_id": media_id, "permalink": link}))


if __name__ == "__main__":
    try:
        main(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
