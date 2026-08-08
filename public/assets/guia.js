/* ============================================================================
   GUIA "A JANELA DE SETEMBRO" — o gate do download.

   Mesmo desenho do gate do curso, e de propósito: um campo, uma vez, e o
   download NUNCA fica refém do cadastro. Se a captura falhar — rede, CORS,
   endpoint fora, bloqueador — o arquivo libera assim mesmo. Prometi o guia em
   troca do e-mail; o e-mail veio. Perder um lead é ruim; quebrar a promessa da
   página é pior, e é irreversível.

   POR QUE UM ARQUIVO SEPARADO DO curso.js.

   Porque a TAG é diferente, e é ela que decide qual cadência a pessoa entra.
   Quem baixa o guia ainda pode não saber que existe um prazo; quem baixa os
   materiais do curso já declarou que sabe e quer executar. Se as duas
   capturas gravassem a mesma tag, as duas cairiam na mesma sequência — e a
   sequência erraria com metade delas.

   Enquadria-Guia  → o topo: descobriu que existe uma decisão
   Enquadria-Curso → já sabe, quer o método e a planilha

   Reaproveita a chave de liberação do curso? NÃO. Quem já baixou a planilha
   não deve receber o guia liberado sem deixar o e-mail: são dois materiais e
   dois momentos, e a segunda captura é o sinal de que o interesse continuou.
   ========================================================================== */
(function () {
  var ENDPOINT = "https://app.enquadria.com.br/api/curso/lead";
  var WEBHOOK = "https://contadorx.com.br/?fluentcrm=1&route=contact&hash=96322e91-7ccc-4c25-8e81-c5de08102a5f";

  var K_LIBERADO = "enquadria_guia_liberado";

  function ler(chave, padrao) {
    try {
      var v = localStorage.getItem(chave);
      return v === null ? padrao : JSON.parse(v);
    } catch (e) { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* navegação privada */ }
  }

  function liberar(raiz) {
    raiz.querySelectorAll(".mat-link").forEach(function (a) { a.hidden = false; });
    raiz.querySelectorAll(".mat-lock").forEach(function (s) { s.hidden = true; });
    raiz.querySelectorAll("[data-gate-form]").forEach(function (f) { f.hidden = true; });
    var ok = raiz.querySelector("[data-gate-ok]");
    if (ok) ok.hidden = false;
  }

  function enviarLead(email) {
    var pedidos = [];

    /* o banco do app — origem separada, para o painel saber de onde veio */
    pedidos.push(
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, origem: "site-guia", material: "guia-janela-setembro" }),
      }).catch(function () { /* silêncio: o download não depende disto */ })
    );

    /* o CRM — form-encoded e no-cors, igual ao curso: em modo no-cors o
       navegador só deixa passar este content-type */
    var form = new URLSearchParams();
    form.append("email", email);
    form.append("source", "site-guia-enquadria");
    form.append("tags", "Enquadria-Guia");
    pedidos.push(
      fetch(WEBHOOK, { method: "POST", mode: "no-cors", body: form })
        .catch(function () { /* idem */ })
    );

    return Promise.all(pedidos);
  }

  document.querySelectorAll("[data-gate]").forEach(function (gate) {
    if (ler(K_LIBERADO, false)) { liberar(gate); return; }

    var form = gate.querySelector("[data-gate-form]");
    var erro = gate.querySelector("[data-gate-erro]");
    if (!form) return;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var campo = form.querySelector('input[type="email"]');
      var email = (campo.value || "").trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        if (erro) { erro.textContent = "Confira o e-mail — faltou alguma coisa."; erro.hidden = false; }
        campo.focus();
        return;
      }
      if (erro) erro.hidden = true;

      var botao = form.querySelector("button");
      if (botao) { botao.disabled = true; botao.textContent = "Liberando…"; }

      /* libera SEMPRE, dê no que der na captura */
      enviarLead(email).then(function () {
        gravar(K_LIBERADO, true);
        liberar(gate);
      });
    });
  });
})();
