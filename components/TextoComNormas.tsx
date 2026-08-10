import { partirPorNormas } from "@/lib/normas";

/**
 * O TEXTO DA MATÉRIA, COM AS NORMAS CLICÁVEIS — 10/08/2026.
 *
 * A regra de o QUE vira link mora em `lib/normas.ts`, sem React, para poder
 * ser testada sem navegador. Aqui só se decide como o link se apresenta.
 *
 * Duas diferenças que não são estéticas:
 *
 * · `rel` — os endereços da lista conferida (Planalto) vão sem `nofollow`:
 *   apontar para a fonte primária é o que dá lastro ao texto, e é um sinal
 *   honesto. A `fonte` digitada no painel é campo livre de terceiro e vai com
 *   `nofollow`, como já ia o botão do rodapé da matéria.
 *
 * · `title` — quem passa o mouse lê a ementa antes de sair da página. Numa
 *   matéria que existe para ser conferida, saber PARA ONDE se está indo é
 *   parte do argumento.
 */
export function TextoComNormas({
  texto,
  fonte,
  className,
}: {
  texto: string | null | undefined;
  fonte?: string | null;
  className?: string;
}) {
  const pedacos = partirPorNormas(texto, fonte);
  if (pedacos.length === 0) return null;

  return (
    <span className={className}>
      {pedacos.map((p, i) =>
        p.tipo === "texto" ? (
          <span key={i}>{p.texto}</span>
        ) : (
          <a
            key={i}
            href={p.url}
            title={p.titulo}
            target="_blank"
            rel={p.oficial ? "noopener noreferrer" : "noopener noreferrer nofollow"}
            style={{ color: "#0E7490", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}
          >
            {p.texto}
          </a>
        )
      )}
    </span>
  );
}
