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

   A TAG NÃO MORA MAIS AQUI (08/08/2026).

   Ela morava — e junto com ela morava o endereço do CRM e o hash que
   identifica o formulário, escritos neste arquivo, que é público. Bastava
   abrir o código-fonte da página para ter a chave de escrever na lista: injetar
   contato, encher a base de endereços de terceiros que nunca pediram nada, e
   sem deixar registro nenhum do lado de cá. Além disso o disparo era `no-cors`,
   então o navegador não sabia dizer se tinha chegado — a captura parecia ter
   funcionado mesmo quando não funcionava.

   Agora este arquivo só fala com a nossa própria rota, e é ela que decide a
   tag a partir da `origem` e repassa ao CRM pelo servidor. A separação entre
   as duas cadências continua existindo; ela só deixou de ser declarada por
   quem visita a página.
   ========================================================================== */
(function () {
  var ENDPOINT = "https://app.enquadria.com.br/api/curso/lead";

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

  /* UM DESTINO SÓ, e é o nosso: a rota grava em `curso_leads` e repassa ao CRM
     pelo servidor. A `origem` é o que diz ao servidor qual cadência é esta —
     não mande tag daqui, porque daqui qualquer pessoa manda o que quiser. */
  function enviarLead(email) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, origem: "site-guia", material: "guia-janela-setembro" }),
    }).catch(function () { /* silêncio: o download não depende disto */ });
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

      /**
       * LIBERAR DEIXOU DE ESPERAR A CAPTURA (08/08/2026).
       *
       * Antes o `.then` era inofensivo: os dois disparos saíam do navegador em
       * paralelo e voltavam rápido. Com o CRM movido para o servidor, esta
       * chamada passou a carregar o salto até o CRM dentro dela — no pior caso
       * o timeout inteiro da rota. Esperar por isso é o gate ficando em
       * "Liberando…" por segundos, e o visitante concluindo que quebrou.
       *
       * O `fetch` segue voando; a página não navega, então ele termina. O que
       * mudou é que a liberação não depende mais de ele terminar — que é o que
       * esta página promete desde o primeiro dia.
       */
      enviarLead(email);
      gravar(K_LIBERADO, true);
      liberar(gate);
    });
  });
})();
