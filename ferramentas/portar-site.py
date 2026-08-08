#!/usr/bin/env python3
"""
PORTAR O SITE ESTÁTICO PARA DENTRO DO NEXT.

Não reescreve o site: TRANSPORTA. O HTML aprovado entra como está, dentro de
rotas do App Router, com o CSS do site isolado num route group.

Reescrever 1.900 linhas de HTML em JSX no mesmo dia da troca de DNS seria
somar um risco de regressão visual a um risco de infraestrutura. O JSX pode
vir depois, página a página, com a tela no ar para comparar.
"""
import json, os, re, shutil

SITE = "/tmp/site"
APP = "/root/work/enquadria"
GRUPO = f"{APP}/app/(site)"

# páginas que JÁ existem no Next e ganham: não são portadas, viram redirect
JA_NO_NEXT = {"politicas.html", "privacidade.html", "seguranca.html", "termos.html"}

# arquivo html -> rota (None = raiz)
PAGINAS = {
    "index.html": "",
    "como-funciona.html": "como-funciona",
    "precos.html": "precos",
    "faq.html": "faq",
    "guia/index.html": "guia",
}

def ler(p):
    with open(os.path.join(SITE, p), encoding="utf-8") as f:
        return f.read()

def entre(tag, html):
    m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, re.S | re.I)
    return m.group(1) if m else ""

def meta_desc(html):
    m = re.search(r'<meta\s+name="description"\s+content="(.*?)"', html, re.S | re.I)
    return m.group(1).strip() if m else ""

def scripts_de(html):
    return ["/assets/" + os.path.basename(s.split("?")[0])
            for s in re.findall(r'<script[^>]*src="([^"]+)"', html)]

def limpar_links(corpo):
    """caminhos de arquivo viram rotas do Next"""
    trocas = [
        (r'href="index\.html"', 'href="/"'),
        (r'href="\.\./index\.html"', 'href="/"'),
        (r'href="\./index\.html"', 'href="/"'),
        (r'href="(?:\.\./)?como-funciona\.html"', 'href="/como-funciona"'),
        (r'href="(?:\.\./)?precos\.html"', 'href="/precos"'),
        (r'href="(?:\.\./)?faq\.html"', 'href="/faq"'),
        (r'href="(?:\.\./)?politicas\.html"', 'href="/politicas"'),
        (r'href="(?:\.\./)?privacidade\.html"', 'href="/privacidade"'),
        (r'href="(?:\.\./)?seguranca\.html"', 'href="/seguranca"'),
        (r'href="(?:\.\./)?termos\.html"', 'href="/termos"'),
        (r'href="(?:\.\./)?curso/"', 'href="/curso"'),
        (r'href="(?:\.\./)?curso/index\.html"', 'href="/curso"'),
        (r'href="(?:\.\./)?guia/"', 'href="/guia"'),
        (r'href="\.\./"', 'href="/"'),
        (r'(src|href)="\.\./assets/', r'\1="/assets/'),
        (r'(src|href)="assets/', r'\1="/assets/'),
        (r'(src|href)="\.\./favicon\.svg"', r'\1="/favicon.svg"'),
        (r'(src|href)="favicon\.svg"', r'\1="/favicon.svg"'),
        (r'href="(?:\.\./)?guia/([^"]+\.pdf)"', r'href="/guia/\1"'),
        (r'href="materiais/', 'href="/curso/materiais/'),
    ]
    for de, para in trocas:
        corpo = re.sub(de, para, corpo)
    # os <script src> saem do corpo: entram por next/script
    corpo = re.sub(r'<script[^>]*src="[^"]*"[^>]*>\s*</script>', "", corpo)
    return corpo.strip()

def escrever_pagina(rota, titulo, descricao, corpo, scripts):
    destino = GRUPO if rota == "" else f"{GRUPO}/{rota}"
    os.makedirs(destino, exist_ok=True)
    canonico = "/" + rota
    tsx = f'''import type {{ Metadata }} from "next";
import {{ FolhaDoSite }} from "@/components/FolhaDoSite";

/**
 * Página do site, transportada do HTML aprovado (ver ferramentas/portar.py).
 * O conteúdo é o mesmo byte a byte; o que mudou foi o endereço.
 */
export const metadata: Metadata = {{
  title: {json.dumps(titulo)},
  description: {json.dumps(descricao)},
  alternates: {{ canonical: {json.dumps(canonico)} }},
  openGraph: {{
    title: {json.dumps(titulo)},
    description: {json.dumps(descricao)},
    url: {json.dumps(canonico)},
    siteName: "Enquadria",
    locale: "pt_BR",
    type: "website",
  }},
}};

const HTML = {json.dumps(corpo)};

export default function Pagina() {{
  return <FolhaDoSite html={{HTML}} scripts={{{json.dumps(scripts)}}} />;
}}
'''
    with open(f"{destino}/page.tsx", "w", encoding="utf-8") as f:
        f.write(tsx)
    return f"{destino}/page.tsx"

feitos = []
for arq, rota in PAGINAS.items():
    html = ler(arq)
    titulo = re.sub(r"\s+", " ", entre("title", html)).strip()
    corpo = limpar_links(entre("body", html))
    feitos.append(escrever_pagina(rota, titulo, meta_desc(html), corpo, scripts_de(html)))

# ---- 404 -> not-found.tsx
h404 = ler("404.html")
corpo404 = limpar_links(entre("body", h404))
with open(f"{APP}/app/not-found.tsx", "w", encoding="utf-8") as f:
    f.write(f'''import {{ FolhaDoSite }} from "@/components/FolhaDoSite";

/**
 * A PÁGINA QUE O CLIENTE DO SEU CLIENTE VÊ.
 *
 * Sem este arquivo, todo `notFound()` das seis páginas públicas — laudo, termo,
 * assinar, coleta, comparativo, abertura — caía na tela padrão do Next: fundo
 * branco, "404 | This page could not be found", em inglês, sem marca e sem
 * saída. Quem vê isso é o empresário que recebeu um link vencido, e a conclusão
 * dele é que o contador mandou link quebrado.
 */
export default function NaoEncontrada() {{
  return <FolhaDoSite html={{{json.dumps(corpo404)}}} scripts={{[]}} />;
}}
''')

# ---- assets estáticos
os.makedirs(f"{APP}/public/assets", exist_ok=True)
for nome in os.listdir(f"{SITE}/assets"):
    if nome.endswith(".js"):
        shutil.copy(f"{SITE}/assets/{nome}", f"{APP}/public/assets/{nome}")
shutil.copy(f"{SITE}/favicon.svg", f"{APP}/public/favicon.svg")

# o CSS do site vira CSS do route group: carregado só nas páginas do site
os.makedirs(GRUPO, exist_ok=True)
shutil.copy(f"{SITE}/assets/style.css", f"{GRUPO}/site.css")

# PDFs e materiais, nos MESMOS caminhos: são links que já circulam por e-mail
os.makedirs(f"{APP}/public/guia", exist_ok=True)
for nome in os.listdir(f"{SITE}/guia"):
    if nome.endswith(".pdf"):
        shutil.copy(f"{SITE}/guia/{nome}", f"{APP}/public/guia/{nome}")
if os.path.isdir(f"{SITE}/curso/materiais"):
    os.makedirs(f"{APP}/public/curso/materiais", exist_ok=True)
    for nome in os.listdir(f"{SITE}/curso/materiais"):
        shutil.copy(f"{SITE}/curso/materiais/{nome}", f"{APP}/public/curso/materiais/{nome}")

print("páginas:", len(feitos))
for f_ in feitos:
    print("  ", f_.replace(APP + "/", ""))
