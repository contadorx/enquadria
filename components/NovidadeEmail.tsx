"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { criticar, htmlNovidade, type Novidade } from "@/lib/novidade";

/**
 * A CAIXA DE NOVIDADES — o único e-mail do app que eu escrevo na hora.
 *
 * Tudo aqui existe para tornar difícil errar em massa:
 *
 *   · a PRÉVIA é o HTML de verdade, montado pela mesma função que o servidor
 *     usa no envio. Prévia aproximada é pior que prévia nenhuma: ela dá
 *     confiança sem dar garantia;
 *   · a CRÍTICA separa erro (trava o botão) de alerta (só avisa). Se tudo
 *     travasse eu acabaria contornando a validação;
 *   · o TESTE vai só para mim, e é o passo que antecede o disparo;
 *   · o DISPARO exige digitar ENVIAR. Um clique acidental num botão que fala
 *     com a base inteira é o tipo de acidente que não tem desfazer;
 *   · o envio acontece em LOTES, e a tela mostra o progresso. A trava contra
 *     duplicado é do servidor (chave única por novidade e e-mail) — aqui é só
 *     o laço que pede o próximo lote.
 */

const VAZIA: Novidade = {
  assunto: "",
  titulo: "",
  corpo: "",
  imagem_url: null,
  imagem_alt: null,
  link_url: null,
  link_texto: null,
};

export function NovidadeEmail({ appUrl }: { appUrl: string }) {
  const [n, setN] = useState<Novidade>(VAZIA);
  const [aberta, setAberta] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [alvos, setAlvos] = useState<{ total: number; motivos: Record<string, number> } | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [progresso, setProgresso] = useState<{ enviados: number; restantes: number } | null>(null);

  const campo = (k: keyof Novidade) => (v: string) =>
    setN((x) => ({ ...x, [k]: v === "" && k !== "assunto" && k !== "titulo" && k !== "corpo" ? null : v }));

  const critica = criticar(n);
  const prontaParaEnviar = critica.erros.length === 0;

  const html = htmlNovidade(n.assunto || n.titulo || n.corpo ? n : {
    ...VAZIA,
    titulo: "O título aparece aqui",
    corpo: "E o texto, aqui. Escreva do jeito que você falaria com um contador que já usa o produto — não com um lead.",
  }, {
    nome: "Leandro",
    base: appUrl,
    linkDescadastro: `${appUrl}/descadastro?e=exemplo%40escritorio.com.br&t=exemplo`,
  });

  async function chamar(acao: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/negocio/novidade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, ...n, ...extra }),
    });
    return (await r.json()) as Record<string, unknown>;
  }

  async function verPublico() {
    setOcupado("publico");
    setErro(null);
    setRecado(null);
    const j = await chamar("publico");
    setOcupado(null);
    if (j.erro) { setErro(String(j.erro)); return; }
    setAlvos({ total: Number(j.total ?? 0), motivos: (j.motivos as Record<string, number>) ?? {} });
  }

  async function enviarTeste() {
    setOcupado("teste");
    setErro(null);
    setRecado(null);
    const j = await chamar("teste");
    setOcupado(null);
    if (j.erro || !j.ok) { setErro(String(j.erro ?? j.motivo ?? "não consegui mandar o teste")); return; }
    setRecado(`Teste enviado para ${String(j.para)}. Abra no celular também — é onde a maioria lê.`);
  }

  /** dispara em lotes até zerar; o servidor pula quem já recebeu */
  async function disparar() {
    setOcupado("enviar");
    setErro(null);
    setRecado(null);
    let id: string | undefined;
    let total = 0;
    let falhas = 0;
    for (let volta = 0; volta < 60; volta++) {
      const j = await chamar("enviar", id ? { novidade_id: id } : {});
      if (j.erro) { setErro(String(j.erro)); setOcupado(null); return; }
      id = String(j.novidade_id);
      total += Number(j.enviados ?? 0);
      falhas += ((j.falhas as unknown[]) ?? []).length;
      const restantes = Number(j.restantes ?? 0);
      setProgresso({ enviados: total, restantes });
      if (restantes === 0) break;
      if (Number(j.enviados ?? 0) === 0) break; // nada saiu: não insistir em laço
    }
    setOcupado(null);
    setConfirmacao("");
    setRecado(
      `Disparo concluído: ${total} ${total === 1 ? "contador recebeu" : "contadores receberam"}` +
        (falhas ? `, ${falhas} ${falhas === 1 ? "falha" : "falhas"} (veja o log abaixo).` : ".")
    );
  }

  async function subirImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setOcupado("imagem");
    setErro(null);
    const supabase = createClient();
    const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "png";
    const caminho = `novidades/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("logos")
      .upload(caminho, arquivo, { upsert: true, cacheControl: "86400" });
    if (error) {
      setOcupado(null);
      setErro(
        "Não consegui subir a imagem. Suba onde você já hospeda (o site, por exemplo) e cole o endereço no campo ao lado."
      );
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(caminho);
    setN((x) => ({ ...x, imagem_url: data.publicUrl }));
    setOcupado(null);
    setRecado("Imagem no ar. Ela já aparece na prévia ao lado.");
  }

  if (!aberta) {
    return (
      <section className="rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-[70ch]">
            <p className="text-[15px] font-bold">Novidade para a base</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Um comunicado, no template do produto, para todos os contadores cadastrados — com
              imagem e link, se você quiser. Sai fora das réguas: não depende de comportamento
              nenhum, só da sua decisão de contar alguma coisa.
            </p>
          </div>
          <button
            onClick={() => setAberta(true)}
            className="rounded-sm bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white"
          >
            Escrever uma novidade
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[70ch]">
          <p className="text-[15px] font-bold">Novidade para a base</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Escreva à esquerda, confira à direita. Mande o teste para você antes — e só então
            dispare.
          </p>
        </div>
        <button
          onClick={() => setAberta(false)}
          className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
        >
          fechar
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* ─────────────────────────────────────────────────────── o formulário */}
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-slate2">Assunto</label>
            <input
              value={n.assunto}
              onChange={(e) => campo("assunto")(e.target.value)}
              placeholder="A aba Reforma agora mostra o que atinge a sua carteira"
              className="mt-1 w-full rounded-sm border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate2">Título dentro do e-mail</label>
            <input
              value={n.titulo}
              onChange={(e) => campo("titulo")(e.target.value)}
              placeholder="O que mudou nesta semana"
              className="mt-1 w-full rounded-sm border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate2">
              Texto <span className="font-normal text-muted">(linha em branco separa parágrafo)</span>
            </label>
            <textarea
              value={n.corpo}
              onChange={(e) => campo("corpo")(e.target.value)}
              rows={7}
              placeholder={"Escreva como quem conversa com um contador que já usa o produto.\n\nUm parágrafo por ideia. Um número, se houver."}
              className="mt-1 w-full rounded-sm border border-line bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-accent"
            />
          </div>

          <div className="rounded-sm border border-linesoft bg-surface2 p-3">
            <p className="text-[12px] font-semibold text-slate2">Imagem (opcional)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-sm border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate2">
                {ocupado === "imagem" ? "subindo…" : "Escolher arquivo"}
                <input type="file" accept="image/png,image/jpeg,image/gif" onChange={subirImagem} className="hidden" />
              </label>
              <input
                value={n.imagem_url ?? ""}
                onChange={(e) => campo("imagem_url")(e.target.value)}
                placeholder="ou cole um endereço https://…"
                className="min-w-[220px] flex-1 rounded-sm border border-line bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-accent"
              />
            </div>
            <input
              value={n.imagem_alt ?? ""}
              onChange={(e) => campo("imagem_alt")(e.target.value)}
              placeholder="Descreva a imagem em poucas palavras — quem bloqueia imagem lê isto"
              className="mt-2 w-full rounded-sm border border-line bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-accent"
            />
          </div>

          <div className="rounded-sm border border-linesoft bg-surface2 p-3">
            <p className="text-[12px] font-semibold text-slate2">Botão (opcional)</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                value={n.link_texto ?? ""}
                onChange={(e) => campo("link_texto")(e.target.value)}
                placeholder="Texto do botão"
                className="w-[180px] rounded-sm border border-line bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-accent"
              />
              <input
                value={n.link_url ?? ""}
                onChange={(e) => campo("link_url")(e.target.value)}
                placeholder="https://app.enquadria.com.br/painel/reforma"
                className="min-w-[220px] flex-1 rounded-sm border border-line bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* ── a crítica, colada nos campos que ela julga ── */}
          {critica.erros.map((e) => (
            <p key={e} className="text-[12.5px] font-semibold text-vermelho">· {e}</p>
          ))}
          {critica.alertas.map((a) => (
            <p key={a} className="text-[12.5px] text-amarelo">· {a}</p>
          ))}
        </div>

        {/* ────────────────────────────────────────────────────────── a prévia */}
        <div>
          <p className="text-[12px] font-semibold text-slate2">
            Prévia — é o HTML que sai, montado pela mesma função do envio
          </p>
          <iframe
            title="prévia da novidade"
            srcDoc={html}
            className="mt-1 h-[520px] w-full rounded-sm border border-line bg-white"
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────── as três ações, em ordem */}
      <div className="mt-4 border-t border-linesoft pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={verPublico}
            disabled={ocupado === "publico"}
            className="rounded-sm border border-line px-3 py-2 text-[12.5px] font-semibold text-slate2 disabled:opacity-40"
          >
            {ocupado === "publico" ? "contando…" : "1 · Ver quem recebe"}
          </button>

          <button
            onClick={enviarTeste}
            disabled={!prontaParaEnviar || ocupado === "teste"}
            title={prontaParaEnviar ? "" : "corrija os erros em vermelho para liberar"}
            className="rounded-sm border border-line px-3 py-2 text-[12.5px] font-semibold text-slate2 disabled:opacity-40"
          >
            {ocupado === "teste" ? "enviando…" : "2 · Enviar teste para mim"}
          </button>

          <span className="mx-1 text-muted">→</span>

          <input
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder="digite ENVIAR"
            className="w-[130px] rounded-sm border border-line bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-accent"
          />
          <button
            onClick={disparar}
            disabled={!prontaParaEnviar || confirmacao.trim().toUpperCase() !== "ENVIAR" || ocupado === "enviar"}
            title="digite ENVIAR ao lado para destravar — disparo em massa não tem desfazer"
            className="rounded-sm bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            {ocupado === "enviar"
              ? `enviando… ${progresso?.enviados ?? 0}`
              : `3 · Disparar${alvos ? ` para ${alvos.total}` : ""}`}
          </button>
        </div>

        {/* o resultado nasce aqui embaixo, colado nos botões */}
        {alvos && (
          <div className="mt-3 rounded-sm border border-line bg-surface2 px-3 py-2 text-[12.5px]">
            <b>{alvos.total}</b> {alvos.total === 1 ? "contador receberia" : "contadores receberiam"} agora.
            {Object.keys(alvos.motivos).length > 0 && (
              <span className="text-muted">
                {" "}Fora: {Object.entries(alvos.motivos).map(([m, q]) => `${q} ${m}`).join(", ")}.
              </span>
            )}
          </div>
        )}
        {progresso && ocupado === "enviar" && (
          <p className="mt-2 text-[12.5px] text-slate2">
            {progresso.enviados} enviados, {progresso.restantes} na fila. Pode deixar a aba aberta —
            se fechar, o que já saiu não sai de novo.
          </p>
        )}
        {recado && <p className="mt-2 text-[12.5px] font-semibold text-verde">{recado}</p>}
        {erro && <p className="mt-2 text-[12.5px] font-semibold text-vermelho">{erro}</p>}

        <p className="mt-3 max-w-[85ch] text-[11.5px] leading-relaxed text-muted">
          Quem já pediu para não receber novidades e quem teve bounce ou spam ficam de fora
          automaticamente. Todo e-mail leva o link de descadastro no rodapé — e o descadastro não
          alcança laudo, termo nem cobrança, que são a conta da pessoa.
        </p>
      </div>
    </section>
  );
}
