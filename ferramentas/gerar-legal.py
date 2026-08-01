#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera as páginas legais ESTÁTICAS do site (termos, privacidade, segurança e
políticas internas) a partir de lib/legal.json — o mesmo arquivo que o app
renderiza em /termos, /privacidade, /seguranca e /politicas.

POR QUE ISTO EXISTE
  Texto jurídico escrito duas vezes é texto jurídico que diverge. Aqui a fonte
  é uma só: editou o legal.json, roda este script e recoloca os quatro HTML no
  site. O app não precisa de nada — ele lê o JSON direto.

USO
  python3 ferramentas/gerar-legal.py /caminho/do/enquadria-site
"""
import html
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTE = os.path.join(AQUI, "..", "lib", "legal.json")
DESTINO = sys.argv[1] if len(sys.argv) > 1 else "../enquadria-site"

LOGO = ('<svg class="logo" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B1220"/>'
        '<path d="M20 16h24M20 16v32M20 48h24M20 32h16" stroke="#06B6D4" stroke-width="5" '
        'stroke-linecap="round" fill="none"/><circle cx="46" cy="32" r="4" fill="#06B6D4"/></svg>')


def negrito(txt: str) -> str:
    """**assim** vira <strong>. Escapa antes, para não abrir porta de HTML."""
    esc = html.escape(txt)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", esc)


def pagina(doc, empresa, todos):
    # sem backslash dentro da f-string: o Python 3.11 não aceita
    def item(d):
        cls = ' class="active"' if d["slug"] == doc["slug"] else ""
        return f'        <a href="{d["arquivo"]}"{cls}>{html.escape(d["titulo"])}</a>'

    nav_legal = "\n".join(item(d) for d in todos)

    secoes = []
    for s in doc["secoes"]:
        paras = "\n".join(f"      <p>{negrito(p)}</p>" for p in s["p"])
        secoes.append(f'''    <section class="legal-sec">
      <h2>{html.escape(s["t"])}</h2>
{paras}
    </section>''')

    outros = "\n".join(
        f'          <a href="{d["arquivo"]}" class="btn btn-ghost">{html.escape(d["titulo"])}</a>'
        for d in todos if d["slug"] != doc["slug"])

    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(doc["titulo"])} — Enquadria</title>
<meta name="description" content="{html.escape(doc["resumo"])}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<header class="site-header">
  <div class="container nav">
    <a class="brand" href="index.html">{LOGO} Enquadria</a>
    <nav class="nav-links">
      <a href="index.html">Início</a>
      <a href="curso/">Curso grátis</a>
      <a href="como-funciona.html">Como funciona</a>
      <a href="precos.html">Preços</a>
      <a href="faq.html">Dúvidas</a>
      <a href="https://app.enquadria.com.br" class="mob-cta">Fazer a triagem grátis</a>
    </nav>
    <div class="nav-cta">
      <a href="https://app.enquadria.com.br" class="btn btn-ghost">Entrar</a>
      <a href="https://app.enquadria.com.br" class="btn btn-primary">Fazer a triagem grátis</a>
    </div>
    <button class="nav-toggle" aria-label="Menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/></svg>
    </button>
  </div>
</header>

<section class="page-hero" style="padding:52px 0 56px">
  <div class="container">
    <span class="kicker kicker--ghost"><span class="dot"></span> Documentos</span>
    <h1 style="margin-top:14px">{html.escape(doc["titulo"])}</h1>
    <p class="lead">{html.escape(doc["resumo"])}</p>
    <p class="mono" style="margin-top:16px;font-size:12px;color:#93A4BC">
      Vigência: {html.escape(empresa["vigencia"])} · {html.escape(empresa["razao_social"])} · CNPJ {html.escape(empresa["cnpj"])}
    </p>
  </div>
</section>

<div class="legal-nav">
  <div class="container">
    <nav>
{nav_legal}
    </nav>
  </div>
</div>

<main class="section legal">
  <div class="container">
{chr(10).join(secoes)}

    <div class="note" style="margin-top:40px">
      <p class="tiny" style="margin-bottom:10px"><strong style="color:var(--ink)">Contato.</strong>
        Geral: {empresa["email_contato"]} · Privacidade: {empresa["email_privacidade"]} · Segurança: {empresa["email_seguranca"]}</p>
      <div class="cta-row">
{outros}
      </div>
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="container">
    <div class="foot-grid">
      <div>
        <div class="foot-brand">
          <svg class="logo" viewBox="0 0 64 64" width="28" height="28"><rect width="64" height="64" rx="14" fill="#111C33"/><path d="M20 16h24M20 16v32M20 48h24M20 32h16" stroke="#06B6D4" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="46" cy="32" r="4" fill="#06B6D4"/></svg>
          Enquadria
        </div>
        <p class="tiny" style="margin-top:14px;max-width:34ch;color:#93A4BC">O enquadramento de IBS/CBS da carteira do escritório contábil — com triagem, entregável e prova, em cada janela da transição.</p>
      </div>
      <div class="foot-col">
        <h4>Curso gratuito</h4>
        <a href="curso/">A decisão de setembro</a>
        <a href="curso/aula-1.html">Aula 1 — a decisão</a>
        <a href="curso/#materiais">Planilhas e modelos</a>
      </div>
      <div class="foot-col">
        <h4>Documentos</h4>
        <a href="termos.html">Termos de Uso</a>
        <a href="privacidade.html">Privacidade</a>
        <a href="seguranca.html">Segurança</a>
        <a href="politicas.html">Políticas internas</a>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© 2026 Enquadria. Todos os direitos reservados.</span>
      <span>* Estimativa de cenário — a decisão e a responsabilidade técnica são do contador que assina.</span>
    </div>
  </div>
</footer>

<script src="assets/app.js"></script>
</body>
</html>
'''


def main():
    legal = json.load(open(FONTE, encoding="utf-8"))
    empresa = legal["empresa"]
    docs = legal["documentos"]
    os.makedirs(DESTINO, exist_ok=True)
    for d in docs:
        caminho = os.path.join(DESTINO, d["arquivo"])
        with open(caminho, "w", encoding="utf-8") as f:
            f.write(pagina(d, empresa, docs))
        print("gerado:", caminho)


if __name__ == "__main__":
    main()
