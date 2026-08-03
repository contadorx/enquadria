/**
 * CENTRAL DE AJUDA — as regras que não dependem de tela nem de banco.
 *
 * Duas coisas moram aqui porque são onde o erro sai caro:
 *
 *  1. O RENDERIZADOR. O corpo do artigo é markdown escrito por uma pessoa e
 *     guardado no banco. Jogar isso em dangerouslySetInnerHTML sem tratar é
 *     injeção esperando acontecer. Aqui o texto é ESCAPADO primeiro e só
 *     depois recebe formatação — a ordem importa, e invertê-la é o bug.
 *
 *  2. O "HÁ NOVIDADE?". Um artigo corrigido depois de lido volta a ser novo.
 *     Numa reforma em transição isso não é capricho: a correção é justamente
 *     o que a pessoa precisa ver, e marcar "já li uma vez" a esconderia.
 */

export type CategoriaAjuda = "reforma" | "produto" | "comercial";

/**
 * DUAS SEÇÕES, porque são dois comportamentos.
 *
 * `ajuda` é PUXADA: a pessoa chega com dúvida, quer achar e sair. Ordem
 * estável, busca, destaque no topo.
 *
 * `noticia` é EMPURRADA: a pessoa não sabe que precisa saber. Cronologia,
 * mais recente primeiro, aviso de novidade.
 *
 * Uma lista só faria a ajuda encher de notícia velha e a notícia se perder
 * ordenada por relevância em vez de data.
 */
export type TipoAjuda = "ajuda" | "noticia";

export interface Artigo {
  id: string;
  slug: string;
  tipo: TipoAjuda;
  destaque: boolean;
  titulo: string;
  resumo: string | null;
  categoria: CategoriaAjuda;
  corpo: string;
  video_url: string | null;
  capa_url: string | null;
  publicado: boolean;
  publicado_em: string | null;
  ordem: number;
  atualizado_em: string;
}

export const CATEGORIAS: { chave: CategoriaAjuda; rotulo: string; descricao: string }[] = [
  {
    chave: "reforma",
    rotulo: "Reforma tributária",
    descricao: "O que muda, quando muda e o que fazer a respeito. Atualizado conforme a regulamentação sai.",
  },
  {
    chave: "produto",
    rotulo: "Usando o Enquadria",
    descricao: "Como importar, analisar, emitir e enviar. O passo a passo de cada tela.",
  },
  {
    chave: "comercial",
    rotulo: "Vendendo o serviço",
    descricao: "Como apresentar, precificar e fechar o trabalho de enquadramento.",
  },
];

export function rotuloCategoria(c: string): string {
  return CATEGORIAS.find((x) => x.chave === c)?.rotulo ?? c;
}

/**
 * ESTE ARTIGO É NOVIDADE PARA ESTA PESSOA?
 *
 * Nunca lido → sim. Lido ANTES da última atualização → sim de novo, porque o
 * que ela leu não é mais o que está lá.
 *
 * Comparação por instante, não por dia: publicar às 9h e corrigir às 11h no
 * mesmo dia é um caso real, e comparar datas truncadas o perderia.
 */
export function temNovidade(artigo: { atualizado_em: string }, lidoEm: string | null | undefined): boolean {
  if (!lidoEm) return true;
  const atualizado = Date.parse(artigo.atualizado_em);
  const lido = Date.parse(lidoEm);
  if (Number.isNaN(atualizado) || Number.isNaN(lido)) return true; // na dúvida, mostra
  return atualizado > lido;
}

/** Quantos artigos têm novidade para esta pessoa — vira o número do menu. */
export function contarNovidades(
  artigos: { id: string; atualizado_em: string }[],
  leituras: Record<string, string>
): number {
  return artigos.filter((a) => temNovidade(a, leituras[a.id])).length;
}

/**
 * O ENDEREÇO DE INCORPORAÇÃO DO VÍDEO.
 *
 * Quem edita cola o link que copiou da barra do navegador — não o de embed.
 * Exigir o formato certo seria transferir um detalhe técnico para quem está
 * escrevendo conteúdo, e o resultado seria vídeo que não aparece.
 *
 * Devolve null para qualquer coisa que não seja YouTube ou Vimeo: um iframe
 * apontando para domínio arbitrário é buraco de segurança, não recurso.
 */
export function urlDeEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();

  const yt =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(u);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(u);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;

  return null;
}

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** só http(s) — `javascript:` num href é o vetor clássico */
function urlSegura(u: string): string | null {
  const t = u.trim();
  return /^https?:\/\//i.test(t) || t.startsWith("/") ? t : null;
}

/**
 * MARKDOWN → HTML, com um subconjunto deliberadamente pequeno.
 *
 * Títulos, parágrafos, listas, negrito, itálico, código, links e imagens.
 * Nada além disso: cada construção a mais é superfície de ataque e um jeito
 * novo de o artigo sair quebrado.
 *
 * O texto é escapado ANTES de qualquer formatação. Depois disso, nenhuma tag
 * escrita por quem edita sobrevive — só as que este código gera.
 */
export function renderizarCorpo(md: string): string {
  const linhas = escapar(md ?? "").split("\n");
  const saida: string[] = [];
  let emLista = false;

  const inline = (t: string): string =>
    t
      // imagem antes do link: a sintaxe do link é prefixo da da imagem
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
        const s = urlSegura(src);
        return s ? `<img src="${s}" alt="${alt}" class="my-3 max-w-full rounded border border-line" />` : alt;
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, txt: string, href: string) => {
        const h = urlSegura(href);
        return h
          ? `<a href="${h}" target="_blank" rel="noreferrer" class="text-accentdeep underline underline-offset-2">${txt}</a>`
          : txt;
      })
      .replace(/`([^`]+)`/g, '<code class="rounded bg-surface2 px-1 py-0.5 font-mono text-[0.9em]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  const fecharLista = () => {
    if (emLista) {
      saida.push("</ul>");
      emLista = false;
    }
  };

  for (const bruta of linhas) {
    const l = bruta.trimEnd();

    if (!l.trim()) {
      fecharLista();
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(l);
    if (item) {
      if (!emLista) {
        saida.push('<ul class="my-2 list-disc pl-5">');
        emLista = true;
      }
      saida.push(`<li class="mb-1">${inline(item[1])}</li>`);
      continue;
    }
    fecharLista();

    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      const n = h[1].length;
      const cls =
        n === 1
          ? "mt-6 mb-2 text-[19px] font-bold"
          : n === 2
            ? "mt-5 mb-2 text-[16px] font-bold"
            : "mt-4 mb-1.5 text-[14px] font-bold";
      saida.push(`<h${n + 1} class="${cls}">${inline(h[2])}</h${n + 1}>`);
      continue;
    }
    saida.push(`<p class="mb-3 leading-relaxed">${inline(l)}</p>`);
  }
  fecharLista();
  return saida.join("\n");
}

/**
 * BUSCA NA AJUDA — com acento normalizado.
 *
 * Quem procura "credito" não deve ficar sem resposta porque o artigo escreveu
 * "crédito". É o erro mais comum de busca em português e o mais fácil de
 * evitar: normaliza os dois lados e compara.
 *
 * Procura no título, no resumo e no corpo. O corpo importa: a pessoa lembra de
 * um termo que apareceu no meio do texto, não do título que alguém escolheu.
 */
export function normalizar(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buscar<T extends { titulo: string; resumo?: string | null; corpo?: string }>(
  itens: T[],
  termo: string
): T[] {
  const q = normalizar(termo).trim();
  if (!q) return itens;
  // todas as palavras precisam aparecer, em qualquer campo: buscar "credito
  // presumido" não pode devolver todo artigo que cite crédito
  const partes = q.split(/\s+/);
  return itens.filter((i) => {
    const alvo = normalizar(`${i.titulo} ${i.resumo ?? ""} ${i.corpo ?? ""}`);
    return partes.every((p) => alvo.includes(p));
  });
}

/** Destaques primeiro, depois a ordem manual — o que resolve rápido fica em cima. */
export function ordenarAjuda<T extends { destaque: boolean; ordem: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) =>
    a.destaque === b.destaque ? a.ordem - b.ordem : a.destaque ? -1 : 1
  );
}
