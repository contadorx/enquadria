"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { CATEGORIAS, urlDeEmbed, renderizarCorpo, type Artigo, type CategoriaAjuda } from "@/lib/ajuda";

/**
 * O EDITOR DA CENTRAL DE AJUDA — só superadmin chega aqui (o layout de
 * /painel/negocio já barra o resto).
 *
 * DECISÃO CENTRAL: publicar não pode depender de deploy. A Reforma muda em
 * semanas onde a correção vale dinheiro; se publicar exigisse passar por um
 * desenvolvedor, a atualização sairia tarde ou não sairia.
 *
 * A PRÉVIA usa a MESMA função que a tela do contador (`renderizarCorpo`).
 * Prévia com renderizador próprio é a maneira mais confiável de publicar algo
 * que parecia certo na edição e sai quebrado para quem lê.
 */

const VAZIO = {
  slug: "",
  titulo: "",
  resumo: "",
  categoria: "produto" as CategoriaAjuda,
  tipo: "ajuda" as "ajuda" | "noticia",
  destaque: false,
  corpo: "",
  video_url: "",
  capa_url: "",
  publicado: false,
  ordem: 100,
};

export default function AjudaAdmin() {
  const router = useRouter();
  const [lista, setLista] = useState<Artigo[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [f, setF] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [previa, setPrevia] = useState(false);

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ajuda_artigos")
      .select("id, slug, titulo, resumo, categoria, corpo, video_url, capa_url, publicado, publicado_em, ordem, atualizado_em")
      .order("categoria")
      .order("ordem");
    if (error) {
      setErro(
        /ajuda_artigos/i.test(error.message)
          ? "A migration 0029 ainda não foi rodada neste banco."
          : error.message
      );
      return;
    }
    setLista((data ?? []) as unknown as Artigo[]);
  }

  useEffect(() => {
    void carregar();
  }, []);

  function abrir(a: Artigo) {
    setSel(a.id);
    setErro(null);
    setOk(false);
    setF({
      slug: a.slug,
      titulo: a.titulo,
      resumo: a.resumo ?? "",
      categoria: a.categoria,
      tipo: a.tipo ?? "ajuda",
      destaque: a.destaque ?? false,
      corpo: a.corpo,
      video_url: a.video_url ?? "",
      capa_url: a.capa_url ?? "",
      publicado: a.publicado,
      ordem: a.ordem,
    });
  }

  function novo() {
    setSel(null);
    setErro(null);
    setOk(false);
    setF({ ...VAZIO });
  }

  async function salvar() {
    setErro(null);
    setOk(false);
    if (!f.titulo.trim()) return setErro("O artigo precisa de um título.");
    const slug =
      f.slug.trim() ||
      f.titulo
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (!slug) return setErro("Não consegui derivar um endereço do título. Preencha o campo endereço.");

    setSalvando(true);
    const supabase = createClient();
    const corpo = {
      slug,
      titulo: f.titulo.trim(),
      resumo: f.resumo.trim() || null,
      categoria: f.categoria,
      tipo: f.tipo,
      destaque: f.destaque,
      corpo: f.corpo,
      video_url: f.video_url.trim() || null,
      capa_url: f.capa_url.trim() || null,
      publicado: f.publicado,
      ordem: Number(f.ordem) || 100,
      // publicado_em marca a PRIMEIRA publicação; atualizado_em é do gatilho
      ...(f.publicado ? { publicado_em: new Date().toISOString() } : {}),
    };

    const { error } = sel
      ? await supabase.from("ajuda_artigos").update(corpo).eq("id", sel)
      : await supabase.from("ajuda_artigos").insert(corpo);

    setSalvando(false);
    if (error) {
      setErro(
        /duplicate key/i.test(error.message)
          ? `Já existe um artigo com o endereço "${slug}".`
          : error.message
      );
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2500);
    await carregar();
    // a lista do contador é server component: sem isto, o artigo novo só
    // apareceria para ele depois de o cache expirar
    router.refresh();
  }

  async function apagar() {
    if (!sel) return;
    if (!confirm("Apagar este artigo? Quem já leu perde o registro junto.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("ajuda_artigos").delete().eq("id", sel);
    if (error) return setErro(error.message);
    novo();
    await carregar();
    router.refresh();
  }

  const embed = urlDeEmbed(f.video_url);

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Central de ajuda — edição</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Publicar não passa por deploy. Ao salvar um artigo já lido, ele volta a aparecer como
        novidade para todo mundo — é assim que a correção da Reforma chega em quem precisa.
      </p>

      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
        <div>
          <button
            onClick={novo}
            className="w-full rounded-sm bg-ink px-3 py-2 text-[13px] font-semibold text-white"
          >
            + Novo artigo
          </button>
          <div className="mt-3 divide-y divide-linesoft overflow-hidden rounded border border-line bg-surface">
            {lista.map((a) => (
              <button
                key={a.id}
                onClick={() => abrir(a)}
                className={`block w-full px-3 py-2 text-left text-[12.5px] ${
                  sel === a.id ? "bg-surface2 font-semibold" : ""
                }`}
              >
                <span className={a.publicado ? "" : "text-muted"}>{a.titulo}</span>
                {!a.publicado && <span className="ml-1 text-[10px] text-muted">(rascunho)</span>}
              </button>
            ))}
            {lista.length === 0 && (
              <p className="px-3 py-3 text-[12px] text-muted">Nenhum artigo ainda.</p>
            )}
          </div>
        </div>

        <div className="rounded border border-line bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12.5px] font-semibold">Título</span>
              <input
                value={f.titulo}
                onChange={(e) => setF({ ...f, titulo: e.target.value })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12.5px] font-semibold">Resumo</span>
              <input
                value={f.resumo}
                onChange={(e) => setF({ ...f, resumo: e.target.value })}
                placeholder="Uma linha: o que a pessoa ganha lendo isto."
                className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Seção</span>
              <select
                value={f.tipo}
                onChange={(e) => setF({ ...f, tipo: e.target.value as "ajuda" | "noticia" })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                <option value="ajuda">Ajuda do sistema (consultada sob demanda)</option>
                <option value="noticia">Quadro da Reforma (empurrada, por data)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Categoria</span>
              <select
                value={f.categoria}
                onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaAjuda })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Ordem</span>
              <input
                type="number"
                value={f.ordem}
                onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Endereço (slug)</span>
              <input
                value={f.slug}
                onChange={(e) => setF({ ...f, slug: e.target.value })}
                placeholder="derivado do título se vazio"
                className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Imagem de capa (URL)</span>
              <input
                value={f.capa_url}
                onChange={(e) => setF({ ...f, capa_url: e.target.value })}
                className="w-full rounded-sm border border-line px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12.5px] font-semibold">Vídeo (YouTube ou Vimeo)</span>
              <input
                value={f.video_url}
                onChange={(e) => setF({ ...f, video_url: e.target.value })}
                placeholder="cole o link normal do vídeo — eu converto"
                className="w-full rounded-sm border border-line px-3 py-2 text-[13px]"
              />
              {f.video_url.trim() && !embed && (
                <span className="mt-1 block text-[11.5px] text-vermelho">
                  Só aceito YouTube e Vimeo. Outro domínio num iframe é risco de segurança.
                </span>
              )}
              {embed && <span className="mt-1 block text-[11.5px] text-verde">Vídeo reconhecido ✓</span>}
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">Corpo (markdown)</span>
            <button
              onClick={() => setPrevia(!previa)}
              className="text-[12px] font-semibold text-accentdeep"
            >
              {previa ? "voltar a editar" : "ver a prévia"}
            </button>
          </div>

          {previa ? (
            <div
              className="mt-2 min-h-[240px] rounded-sm border border-line bg-surface2 p-4 text-[14px]"
              dangerouslySetInnerHTML={{ __html: renderizarCorpo(f.corpo) }}
            />
          ) : (
            <textarea
              value={f.corpo}
              onChange={(e) => setF({ ...f, corpo: e.target.value })}
              rows={16}
              placeholder={"## Um subtítulo\n\nUm parágrafo.\n\n- item\n- outro item\n\n**negrito**, [link](https://...) e ![figura](https://.../img.png)"}
              className="mt-2 w-full rounded-sm border border-line p-3 font-mono text-[13px] leading-relaxed"
            />
          )}

          <label className="mt-3 flex items-center gap-2 text-[13px] font-semibold">
            <input
              type="checkbox"
              checked={f.destaque}
              onChange={(e) => setF({ ...f, destaque: e.target.checked })}
            />
            Destaque (sobe para o topo da ajuda)
          </label>

          <label className="mt-2 flex items-center gap-2 text-[13px] font-semibold">
            <input
              type="checkbox"
              checked={f.publicado}
              onChange={(e) => setF({ ...f, publicado: e.target.checked })}
            />
            Publicado (visível para os contadores)
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {/* ux-ok: a confirmação não é a lista à esquerda — é o próprio
                rótulo do botão virando "Salvo ✓" sob o cursor, mais o erro
                que aparece três linhas acima dele. O efeito distante (a lista
                recarregada) é consequência, não o sinal. */}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {salvando ? "Salvando…" : ok ? "Salvo ✓" : sel ? "Salvar alterações" : "Criar artigo"}
            </button>
            {sel && (
              <button
                onClick={apagar}
                className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-vermelho"
              >
                Apagar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
