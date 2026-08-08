/* ============================================================================
   CURSO "A DECISÃO DE SETEMBRO" — gate dos materiais, progresso e certificado.

   1) GATE — um campo, uma vez. Assistir nunca pede nada.
      REGRA: o download NUNCA fica refém do cadastro. Se a captura falhar
      (rede, CORS, endpoint fora), libera assim mesmo. Prometi o material em
      troca do e-mail; o e-mail veio.

   2) PROGRESSO — marcado pelo próprio participante, guardado no navegador.
      POR QUE localStorage AQUI: o site é estático e sem login. Não existe
      sessão para pendurar progresso, e exigir cadastro para marcar uma aula
      como vista seria justamente a fricção que este curso existe para evitar.
      O preço é honesto e está escrito na tela: o progresso é deste navegador.

   3) CERTIFICADO — só aparece com as nove aulas marcadas. A emissão é no
      servidor e devolve um CÓDIGO PÚBLICO, conferível por qualquer pessoa.
      Certificado que ninguém pode conferir é enfeite.

   CONFIGURAÇÃO — as três linhas abaixo.
   ========================================================================== */
(function () {
  var ENDPOINT = "https://app.enquadria.com.br/api/curso/lead";
  var VIDEOS = "https://app.enquadria.com.br/api/curso/videos";
  var CERTIFICADO = "https://app.enquadria.com.br/api/curso/certificado";
  var WEBHOOK = "https://contadorx.com.br/?fluentcrm=1&route=contact&hash=96322e91-7ccc-4c25-8e81-c5de08102a5f";

  var TOTAL_AULAS = 9;
  var K_LIBERADO = "enquadria_curso_liberado";
  var K_PROGRESSO = "enquadria_curso_progresso";
  var K_CERT = "enquadria_curso_certificado";

  /* ------------------------------------------------------------ guardados */
  function ler(chave, padrao) {
    try {
      var v = localStorage.getItem(chave);
      return v === null ? padrao : JSON.parse(v);
    } catch (e) {
      return padrao;
    }
  }
  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      /* navegação privada ou storage cheio: o curso segue, só não lembra */
    }
  }

  function concluidas() {
    var v = ler(K_PROGRESSO, []);
    return Array.isArray(v) ? v.filter(function (n) { return typeof n === "number"; }) : [];
  }
  function marcar(n, ligado) {
    var atual = concluidas().filter(function (x) { return x !== n; });
    if (ligado) atual.push(n);
    atual.sort(function (a, b) { return a - b; });
    gravar(K_PROGRESSO, atual);
    return atual;
  }

  /* ------------------------------------------------------------- gate */
  function liberarMateriais(raiz) {
    raiz.querySelectorAll("[data-gate-form]").forEach(function (f) { f.hidden = true; });
    raiz.querySelectorAll("[data-gate-ok]").forEach(function (o) { o.hidden = false; });
    raiz.querySelectorAll(".mat-link").forEach(function (a) { a.hidden = false; });
    raiz.querySelectorAll(".mat-lock").forEach(function (s) { s.hidden = true; });
  }

  function ligarGate() {
    var gates = document.querySelectorAll("[data-gate]");
    if (!gates.length) return;
    if (ler(K_LIBERADO, false)) gates.forEach(liberarMateriais);

    gates.forEach(function (gate) {
      var form = gate.querySelector("[data-gate-form]");
      var erro = gate.querySelector("[data-gate-erro]");
      if (!form) return;

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var campo = form.querySelector('input[type="email"]');
        var email = (campo.value || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          erro.textContent = "Confira o e-mail — parece incompleto.";
          erro.hidden = false;
          campo.focus();
          return;
        }
        erro.hidden = true;
        var botao = form.querySelector("button");
        botao.disabled = true;
        botao.textContent = "Liberando…";

        enviarLead(email).then(function () {
          gravar(K_LIBERADO, true);
          document.querySelectorAll("[data-gate]").forEach(liberarMateriais);
        });
      });
    });
  }

  function enviarLead(email) {
    var corpo = JSON.stringify({ email: email, origem: "site-curso" });
    var pedidos = [
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo
      })
    ];
    if (WEBHOOK) {
      // form-encoded de propósito: em modo no-cors o navegador só deixa passar
      // content-type simples, e application/json exigiria preflight.
      var form = new URLSearchParams();
      form.append("email", email);
      form.append("source", "site-curso-enquadria");
      form.append("tags", "Enquadria-Curso");
      pedidos.push(fetch(WEBHOOK, { method: "POST", mode: "no-cors", body: form }));
    }
    return Promise.allSettled(pedidos);
  }

  /* -------------------------------------------------------- progresso */
  function pintarProgresso() {
    var feitas = concluidas();
    var n = feitas.length;
    var pct = Math.round((n / TOTAL_AULAS) * 100);

    document.querySelectorAll("[data-prog-barra]").forEach(function (b) {
      b.style.width = pct + "%";
    });
    document.querySelectorAll("[data-prog-texto]").forEach(function (t) {
      t.textContent = n + " de " + TOTAL_AULAS + " aulas";
    });
    document.querySelectorAll("[data-prog-pct]").forEach(function (t) {
      t.textContent = pct + "%";
    });

    document.querySelectorAll("[data-aula]").forEach(function (linha) {
      var num = parseInt(linha.getAttribute("data-aula"), 10);
      var ok = feitas.indexOf(num) >= 0;
      linha.classList.toggle("feita", ok);
      var sel = linha.querySelector("[data-aula-check]");
      if (sel) sel.hidden = !ok;
    });

    document.querySelectorAll("[data-concluir]").forEach(function (b) {
      var num = parseInt(b.getAttribute("data-concluir"), 10);
      var ok = feitas.indexOf(num) >= 0;
      b.classList.toggle("feito", ok);
      b.textContent = ok ? "Aula concluída ✓" : "Marcar como concluída";
      b.setAttribute("aria-pressed", ok ? "true" : "false");
    });

    var completo = n >= TOTAL_AULAS;
    document.querySelectorAll("[data-cert-bloqueado]").forEach(function (e) { e.hidden = completo; });
    document.querySelectorAll("[data-cert-liberado]").forEach(function (e) { e.hidden = !completo; });
    document.querySelectorAll("[data-cert-faltam]").forEach(function (e) {
      e.textContent = String(TOTAL_AULAS - n);
    });

    return n;
  }

  function ligarProgresso() {
    document.querySelectorAll("[data-concluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var num = parseInt(b.getAttribute("data-concluir"), 10);
        var jaFeita = concluidas().indexOf(num) >= 0;
        marcar(num, !jaFeita);
        pintarProgresso();
      });
    });
    document.querySelectorAll("[data-limpar-progresso]").forEach(function (b) {
      b.addEventListener("click", function () {
        gravar(K_PROGRESSO, []);
        pintarProgresso();
      });
    });
  }

  /* ------------------------------------------------------- certificado */
  function mostrarCertificado(codigo, emitidoEm) {
    var url = "https://app.enquadria.com.br/certificado/" + codigo;
    document.querySelectorAll("[data-cert-form]").forEach(function (f) { f.hidden = true; });
    document.querySelectorAll("[data-cert-pronto]").forEach(function (e) { e.hidden = false; });
    document.querySelectorAll("[data-cert-codigo]").forEach(function (e) { e.textContent = codigo; });
    document.querySelectorAll("[data-cert-link]").forEach(function (a) { a.href = url; });

    // "Adicionar ao perfil" do LinkedIn: entra na seção Licenças e certificados,
    // com nome, data, código e link de verificação já preenchidos.
    // organizationName e organizationId não podem ir juntos — se um dia houver
    // página da empresa no LinkedIn, troque por organizationId=<id> e o logo aparece.
    // A DATA É A DA EMISSÃO, não a de hoje. Quem emitiu em agosto e volta aqui
    // em setembro para adicionar ao perfil levaria setembro — e o certificado
    // que a pessoa manda conferir diz agosto. Duas datas para o mesmo documento
    // é o tipo de detalhe que faz alguém duvidar do documento inteiro.
    // A queda para hoje só alcança quem guardou o código antes desta correção.
    var d = emitidoEm ? new Date(emitidoEm) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var q = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: "A decisão de setembro",
      organizationName: "Enquadria",
      issueYear: String(d.getFullYear()),
      issueMonth: String(d.getMonth() + 1),
      certId: codigo,
      certUrl: url
    });
    document.querySelectorAll("[data-cert-linkedin]").forEach(function (a) {
      a.href = "https://www.linkedin.com/profile/add?" + q.toString();
    });
  }

  function ligarCertificado() {
    var salvo = ler(K_CERT, null);
    if (salvo && salvo.codigo) mostrarCertificado(salvo.codigo, salvo.emitido_em);

    document.querySelectorAll("[data-cert-form]").forEach(function (form) {
      var erro = form.parentNode.querySelector("[data-cert-erro]");
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var nome = (form.querySelector('[name="nome"]').value || "").trim().replace(/\s+/g, " ");
        var email = (form.querySelector('[name="email"]').value || "").trim().toLowerCase();
        var crcEl = form.querySelector('[name="crc"]');
        var crc = crcEl ? (crcEl.value || "").trim() : "";

        if (nome.length < 3 || nome.indexOf(" ") < 0) {
          erro.textContent = "Informe o nome completo, como deve sair no certificado.";
          erro.hidden = false;
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          erro.textContent = "Confira o e-mail — parece incompleto.";
          erro.hidden = false;
          return;
        }
        erro.hidden = true;

        var botao = form.querySelector("button");
        botao.disabled = true;
        botao.textContent = "Emitindo…";

        fetch(CERTIFICADO, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nome, email: email, crc: crc })
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (res.ok && res.j.codigo) {
              gravar(K_CERT, { codigo: res.j.codigo, nome: nome, emitido_em: res.j.emitido_em || null });
              enviarLead(email);
              mostrarCertificado(res.j.codigo, res.j.emitido_em);
            } else {
              erro.textContent = res.j.erro || "Não consegui emitir agora. Tente de novo em instantes.";
              erro.hidden = false;
              botao.disabled = false;
              botao.textContent = "Emitir certificado";
            }
          })
          .catch(function () {
            erro.textContent = "Falha de rede. Tente de novo em instantes.";
            erro.hidden = false;
            botao.disabled = false;
            botao.textContent = "Emitir certificado";
          });
      });
    });
  }


  /* ==========================================================================
     4) OS VÍDEOS VÊM DO APP — publicar aula deixou de ser edição de HTML.

     ANTES: para colocar uma aula no ar era preciso abrir curso/aula-N.html,
     trocar um bloco comentado pelo iframe, editar o índice para virar "no ar",
     rodar o script de versão e subir por FTP. Cinco passos manuais, nove
     vezes, para colar uma URL — e cada passo é uma chance de subir o arquivo
     errado por cima do certo.

     AGORA: o link é cadastrado UMA VEZ no app (Negócio → Curso) e esta função
     pergunta ao app o que está no ar. O HTML do site não muda mais.

     REGRAS QUE VALEM A PENA CONHECER:

     · SE A CHAMADA FALHAR, NADA ACONTECE. A página continua exatamente como
       veio do servidor — com o aviso de "ainda não subiu". Um curso que fica
       em branco porque uma API caiu é pior que um curso sem vídeo.

     · O QUE ENTRA NO IFRAME VEM PRONTO DO APP, já convertido para endereço de
       player. O site não interpreta link nenhum: se o app não reconhecer o
       endereço, ele manda `embed: null` e a aula continua "em breve".
     ========================================================================== */
  function ligarVideos() {
    var player = document.querySelector(".player[data-aula]");
    var linhas = document.querySelectorAll(".aula-row[data-aula]");
    if (!player && !linhas.length) return;

    fetch(VIDEOS, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.aulas) return;

        var porNumero = {};
        j.aulas.forEach(function (a) { porNumero[String(a.numero)] = a; });

        /* a) a página da aula: troca o aviso pelo player */
        if (player) {
          var a = porNumero[player.getAttribute("data-aula")];
          if (a && a.embed) {
            var ratio = document.createElement("div");
            ratio.className = "ratio";
            var f = document.createElement("iframe");
            f.src = a.embed;
            f.title = a.titulo || "Aula";
            f.setAttribute("allowfullscreen", "");
            f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture");
            ratio.appendChild(f);
            player.innerHTML = "";
            player.appendChild(ratio);
          }
        }

        /* b) o índice: "onda 2" vira "no ar" sem ninguém editar o HTML */
        linhas.forEach(function (linha) {
          var b = porNumero[linha.getAttribute("data-aula")];
          if (!b || !b.no_ar) return;
          var selo = linha.querySelector(".s");
          if (selo) {
            selo.textContent = "no ar";
            selo.classList.add("no-ar");
          }
        });
      })
      .catch(function () {
        /* silêncio proposital: a página já mostra o estado "em breve" */
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    ligarVideos();
    ligarGate();
    ligarProgresso();
    ligarCertificado();
    pintarProgresso();
  });
})();
