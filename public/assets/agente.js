/* ===========================================================================
   ENQUADRIA — o balão de dúvidas da página pública.

   Por que ele existe: a maior perda medida do funil não é no produto, é entre
   a pessoa se interessar e criar a conta. Quem tem uma dúvida numa página de
   preço não manda e-mail — fecha a aba. Este arquivo é a única chance de
   perguntar antes de ir embora.

   Três decisões de comportamento, e o motivo de cada uma:

   1. ELE FALA PRIMEIRO, UMA VEZ SÓ. Depois de 25 segundos na página, uma vez
      por sessão do navegador, e nunca se a pessoa já abriu o balão. Pop-up que
      insiste é motivo para sair da página, não para ficar.

   2. AS PERGUNTAS APARECEM PRONTAS. Quem não sabe o que perguntar não digita —
      clica. As quatro sugestões cobrem as dúvidas que mais aparecem.

   3. SE O SERVIDOR CAIR, ELE NÃO EMUDECE. Falha de rede vira uma resposta com
      os caminhos (dúvidas, e-mail). Silêncio depois de uma pergunta é a pior
      coisa que esta caixa pode fazer.

   Sem dependência, sem framework, sem cookie: só sessionStorage para não
   repetir o convite. Um arquivo, incluído em todas as páginas.
   =========================================================================== */
(function () {
  "use strict";

  var API = "https://app.enquadria.com.br/api/venda";
  var ESPERA_CONVITE = 25000;
  var CHAVE_SESSAO = "enq_agente_sessao";
  var CHAVE_CONVITE = "enq_agente_convite";

  var SUGESTOES = [
    "O que o Enquadria faz?",
    "Quanto custa?",
    "Serve para a minha carteira?",
    "Por onde eu começo?",
  ];

  var ABERTURA =
    "Oi! Sou o atendimento do Enquadria. Pergunta o que quiser sobre a decisão de setembro, o sistema ou os planos — respondo na hora. O que eu não souber, vai direto para o Leandro.";

  var FALHA =
    "Não consegui responder agora (pode ser a minha conexão). As dúvidas mais comuns estão em enquadria.com.br/faq.html — ou me deixa seu e-mail aqui que eu respondo pessoalmente.";

  /* ------------------------------------------------------------- utilidades */
  function guardar(chave, valor) {
    try { sessionStorage.setItem(chave, valor); } catch (e) { /* modo privado */ }
  }
  function ler(chave) {
    try { return sessionStorage.getItem(chave); } catch (e) { return null; }
  }
  function sessao() {
    var s = ler(CHAVE_SESSAO);
    if (!s) {
      s = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "s" + Date.now() + Math.random().toString(36).slice(2);
      guardar(CHAVE_SESSAO, s);
    }
    return s;
  }
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  /* ------------------------------------------------------------------ estilo
     Inline de propósito: o balão precisa funcionar mesmo numa página que
     esqueceu de incluir o style.css, e ele não pode herdar regra de layout. */
  var CSS =
    '.enqA{position:fixed;right:18px;bottom:18px;z-index:9999;font-family:"Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.enqA *{box-sizing:border-box}' +
    '.enqA-btn{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;background:#0B1220;color:#fff;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;box-shadow:0 12px 30px -10px rgba(11,18,32,.45)}' +
    '.enqA-btn:hover{background:#111C33}' +
    '.enqA-btn i{width:8px;height:8px;border-radius:50%;background:#06B6D4;display:inline-block}' +
    '.enqA-convite{position:absolute;right:0;bottom:60px;width:250px;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:12px 14px;font-size:13.5px;line-height:1.45;color:#334155;box-shadow:0 24px 50px -20px rgba(11,18,32,.35);cursor:pointer}' +
    '.enqA-convite b{color:#0B1220}' +
    '.enqA-convite span{position:absolute;top:6px;right:8px;color:#94A3B8;font-size:15px;line-height:1}' +
    '.enqA-painel{position:absolute;right:0;bottom:60px;width:370px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #E2E8F0;border-radius:16px;box-shadow:0 30px 60px -20px rgba(11,18,32,.34);overflow:hidden;display:flex;flex-direction:column}' +
    '.enqA-topo{background:#0B1220;color:#fff;padding:13px 16px}' +
    // o `color` aqui não é enfeite: sem ele o h4 herda a cor de título do site
    // (navy) e some contra o fundo navy do cabeçalho. Aconteceu na verificação.
    '.enqA-topo h4{margin:0;font-size:14.5px;font-weight:700;color:#fff;letter-spacing:0;font-family:inherit}' +
    '.enqA-topo p{margin:3px 0 0;font-size:12px;color:#94A3B8;line-height:1.4}' +
    '.enqA-fechar{position:absolute;top:10px;right:12px;background:none;border:0;color:#94A3B8;font-size:20px;line-height:1;cursor:pointer}' +
    '.enqA-corpo{padding:14px;overflow-y:auto;max-height:min(56vh,430px);background:#F6F9FC}' +
    '.enqA-msg{margin:0 0 10px;padding:11px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;white-space:pre-wrap}' +
    '.enqA-msg.bot{background:#fff;border:1px solid #E2E8F0;color:#1A2740}' +
    '.enqA-msg.eu{background:#0B1220;color:#fff;margin-left:38px}' +
    '.enqA-msg.aguarde{color:#64748B;font-style:italic}' +
    '.enqA-cta{display:inline-block;margin:-2px 0 12px;background:#06B6D4;color:#04222b;text-decoration:none;font-size:13px;font-weight:700;padding:9px 14px;border-radius:9px}' +
    '.enqA-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}' +
    '.enqA-chip{background:#fff;border:1px solid #CBD5E1;color:#334155;border-radius:999px;padding:7px 12px;font-size:12.5px;cursor:pointer}' +
    '.enqA-chip:hover{border-color:#06B6D4;color:#0E7490}' +
    '.enqA-pe{display:flex;gap:8px;border-top:1px solid #E2E8F0;padding:10px;background:#fff}' +
    '.enqA-pe input{flex:1;border:1px solid #CBD5E1;border-radius:9px;padding:10px 12px;font-size:13.5px;font-family:inherit;color:#0B1220}' +
    '.enqA-pe input:focus{outline:2px solid #CFFAFE;border-color:#06B6D4}' +
    '.enqA-pe button{border:0;background:#0B1220;color:#fff;border-radius:9px;padding:0 15px;font-size:13.5px;font-weight:600;cursor:pointer}' +
    '.enqA-pe button[disabled]{opacity:.5;cursor:default}' +
    '.enqA-nota{font-size:11px;color:#94A3B8;text-align:center;padding:0 10px 9px;background:#fff;line-height:1.4}' +
    '@media (max-width:520px){.enqA{right:12px;bottom:12px}.enqA-painel{width:calc(100vw - 24px)}.enqA-btn span{display:none}.enqA-btn{padding:13px 15px}}';

  /* ------------------------------------------------------------------ montar */
  var raiz = el("div", "enqA");
  var botao = el("button", "enqA-btn");
  botao.type = "button";
  botao.setAttribute("aria-label", "Abrir o atendimento do Enquadria");
  botao.appendChild(el("i"));
  botao.appendChild(el("span", null, "Tirar uma dúvida"));

  var painel = null;
  var corpo = null;
  var entrada = null;
  var enviar = null;
  var aberto = false;
  var ocupado = false;

  function estilo() {
    var s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function rolar() {
    if (corpo) corpo.scrollTop = corpo.scrollHeight;
  }

  function fala(texto, quem) {
    var m = el("div", "enqA-msg " + (quem || "bot"), texto);
    corpo.appendChild(m);
    rolar();
    return m;
  }

  function botaoCta(cta) {
    var a = el("a", "enqA-cta", cta.rotulo);
    a.href = cta.url;
    a.rel = "noopener";
    corpo.appendChild(a);
    rolar();
  }

  function chips(lista) {
    var caixa = el("div", "enqA-chips");
    lista.forEach(function (t) {
      var c = el("button", "enqA-chip", t);
      c.type = "button";
      c.addEventListener("click", function () {
        caixa.remove();
        perguntar(t);
      });
      caixa.appendChild(c);
    });
    corpo.appendChild(caixa);
    rolar();
  }

  function montarPainel() {
    painel = el("div", "enqA-painel");
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-label", "Atendimento do Enquadria");

    var topo = el("div", "enqA-topo");
    topo.style.position = "relative";
    topo.appendChild(el("h4", null, "Enquadria — tire sua dúvida"));
    topo.appendChild(
      el("p", null, "Respondo na hora. O que eu não souber vai direto para o Leandro, contador que fez o sistema.")
    );
    var fechar = el("button", "enqA-fechar", "×");
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar");
    fechar.addEventListener("click", alternar);
    topo.appendChild(fechar);

    corpo = el("div", "enqA-corpo");

    var pe = el("form", "enqA-pe");
    entrada = el("input");
    entrada.type = "text";
    entrada.placeholder = "Escreva sua dúvida…";
    entrada.setAttribute("aria-label", "Sua dúvida");
    entrada.maxLength = 500;
    enviar = el("button", null, "Enviar");
    enviar.type = "submit";
    pe.appendChild(entrada);
    pe.appendChild(enviar);
    pe.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = entrada.value.trim();
      if (!t || ocupado) return;
      entrada.value = "";
      perguntar(t);
    });

    var nota = el(
      "div",
      "enqA-nota",
      "Conteúdo educativo — não substitui a análise do contador responsável. O laudo é você quem assina."
    );

    painel.appendChild(topo);
    painel.appendChild(corpo);
    painel.appendChild(pe);
    painel.appendChild(nota);
    raiz.appendChild(painel);

    fala(ABERTURA);
    chips(SUGESTOES);
  }

  function alternar() {
    aberto = !aberto;
    guardar(CHAVE_CONVITE, "1"); // abriu: o convite automático não faz mais sentido
    tirarConvite();
    if (aberto) {
      if (!painel) montarPainel();
      painel.style.display = "flex";
      botao.setAttribute("aria-expanded", "true");
      setTimeout(function () { if (entrada) entrada.focus(); }, 60);
    } else if (painel) {
      painel.style.display = "none";
      botao.setAttribute("aria-expanded", "false");
    }
  }

  /* ------------------------------------------------------------- a pergunta */
  function perguntar(texto) {
    fala(texto, "eu");
    ocupado = true;
    enviar.disabled = true;
    var esperando = fala("escrevendo…", "bot aguarde");

    var controle = new AbortController();
    var relogio = setTimeout(function () { controle.abort(); }, 22000);

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: texto, sessao: sessao() }),
      signal: controle.signal,
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        esperando.remove();
        fala(d && d.resposta ? d.resposta : FALHA);
        if (d && d.cta && d.cta.url) botaoCta(d.cta);
        if (d && d.pedirEmail) {
          setTimeout(function () {
            if (entrada) {
              entrada.placeholder = "Escreva seu e-mail aqui…";
              entrada.focus();
            }
          }, 100);
        }
        if (d && d.sugestoes && d.sugestoes.length) chips(d.sugestoes);
      })
      .catch(function () {
        esperando.remove();
        fala(FALHA);
      })
      .then(function () {
        clearTimeout(relogio);
        ocupado = false;
        enviar.disabled = false;
        rolar();
      });
  }

  /* --------------------------------------------------------------- o convite */
  var convite = null;
  function tirarConvite() {
    if (convite) { convite.remove(); convite = null; }
  }
  function mostrarConvite() {
    if (aberto || ler(CHAVE_CONVITE)) return;
    guardar(CHAVE_CONVITE, "1");
    convite = el("div", "enqA-convite");
    convite.innerHTML =
      "<b>Alguma dúvida sobre a janela de setembro?</b><br>Pergunte aqui — respondo na hora.<span aria-hidden='true'>×</span>";
    convite.addEventListener("click", function (e) {
      if (e.target.tagName === "SPAN") { tirarConvite(); return; }
      alternar();
    });
    raiz.appendChild(convite);
  }

  /* ------------------------------------------------------------------ início */
  function iniciar() {
    estilo();
    botao.addEventListener("click", alternar);
    raiz.appendChild(botao);
    document.body.appendChild(raiz);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && aberto) alternar();
    });
    setTimeout(mostrarConvite, ESPERA_CONVITE);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
