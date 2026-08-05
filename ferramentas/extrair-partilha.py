import re, json
t = open("lc214.txt", encoding="utf-8").read()
linhas = t.split("\n")

ANEXOS = {"XVIII":1,"XIX":2,"XX":3,"XXI":4,"XXII":5}
# fatiar por anexo
marcas = []
for i,l in enumerate(linhas):
    m = re.search(r"ANEXO (XVIII|XIX|XX|XXI|XXII|XXIII)\s+Produção de efeitos", l)
    if m: marcas.append((i, m.group(1)))
blocos = {}
for k,(i,nome) in enumerate(marcas):
    fim = marcas[k+1][0] if k+1 < len(marcas) else len(linhas)
    if nome in ANEXOS: blocos[ANEXOS[nome]] = linhas[i:fim]

PCT = re.compile(r"(\d{1,2},\d{2})%")
FAIXA = re.compile(r"^\s*(\d)ª\s+Faixa\b")

def secoes(bl):
    """devolve [(rotulo_ano, header_cols, {faixa: [pcts]}), ...] na ordem"""
    out = []
    atual = None
    header = None
    for l in bl:
        ma = re.search(r"(?:Para os?|A partir do) anos?-calendário ([\d e]+)", l)
        if ma:
            atual = {"ano": ma.group(1).strip(), "linhas": [], "header": None}
            out.append(atual); header = None
            continue
        if "IRPJ" in l and "CSLL" in l and "CBS" in l:
            cols = re.findall(r"IRPJ|CSLL|CBS|CPP|IPI|ICMS|ISS|IBS", l)
            if atual is not None and atual["header"] is None:
                atual["header"] = cols
            continue
        mf = FAIXA.match(l)
        if mf and atual is not None:
            p = PCT.findall(l)
            if len(p) >= 3:
                atual["linhas"].append((int(mf.group(1)), [float(x.replace(",", ".")) for x in p]))
    return out

dados = {}
for anexo, bl in sorted(blocos.items()):
    for s in secoes(bl):
        if not s["linhas"] or not s["header"]: continue
        chave = (anexo, s["ano"])
        # a ÚLTIMA seção com o mesmo ano vence: é a redação da LC 227/2026
        d = {}
        for faixa, p in s["linhas"]:
            h = s["header"]
            if len(p) == len(h): mapa = dict(zip(h, p))
            elif len(p) == len(h) - 2 and faixa == 6:  # 6ª faixa sem ICMS/ISS e sem IBS
                mapa = dict(zip([c for c in h if c not in ("ICMS","ISS","IBS")], p))
            elif len(p) == len(h) - 1:
                mapa = dict(zip(h[:len(p)], p))
            else: mapa = {"?": p}
            d[faixa] = mapa
        dados.setdefault(chave, []).append(d)

saida = {}
for (anexo, ano), versoes in sorted(dados.items()):
    d = versoes[-1]
    ok = True
    for faixa, mapa in d.items():
        s = sum(v for k,v in mapa.items() if k != "?")
        if "?" in mapa or abs(s-100) > 0.02: ok = False
    saida[f"{anexo}|{ano}"] = {"soma_ok": ok, "faixas": d}
print(json.dumps(saida, ensure_ascii=False, indent=1))
