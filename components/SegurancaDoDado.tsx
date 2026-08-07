import Link from "next/link";

/**
 * A RESPOSTA À PERGUNTA QUE NINGUÉM FAZ EM VOZ ALTA.
 *
 * O momento mais caro do produto é este: pedimos ao contador a CARTEIRA DELE,
 * dez minutos depois de ele conhecer o sistema. Quem hesita não pergunta —
 * fecha a aba. A resposta tem que estar onde a hesitação acontece.
 *
 * ENCOLHIDO EM 07/08/2026, a pedido de quem usa: quatro afirmações de uma
 * linha, verificáveis, e os links para os documentos completos. A versão
 * anterior explicava cada afirmação em um parágrafo e terminava apontando a
 * lista do que ainda não temos — no primeiro uso real, virou muro de texto na
 * frente do botão de importar. Quem quer o detalhe clica; o documento É o
 * detalhe.
 *
 * REGRA QUE FICA: cada linha aqui sai do documento de Segurança e é
 * verificável. Se deixar de ser verdade, sai daqui ANTES de sair de lá.
 *
 * Os links aparecem inlineados NAS DUAS variantes de propósito: o teste da
 * suíte confere cada uma em separado, para ninguém remover o link de uma e a
 * outra continuar mascarando a falta.
 */

const PONTOS = [
  "A carteira é sua e o controlador é você — não usamos os dados para treinar modelo.",
  "Nenhum outro escritório enxerga a sua lista: a separação é regra no banco de dados.",
  "Nenhuma IA processa a carteira — as regras são matemáticas, não de julgamento.",
  "Você tira a carteira quando quiser, pela própria interface.",
];

export function SegurancaDoDado({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate2">
        <b>Antes de subir a lista dos seus clientes:</b> a separação entre escritórios é regra no
        banco, nenhuma IA processa a carteira, e você exporta quando quiser.{" "}
        <Link href="/seguranca" className="underline underline-offset-2 hover:text-accentdeep">
          Segurança
        </Link>{" "}
        ·{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-accentdeep">
          Privacidade
        </Link>{" "}
        ·{" "}
        <Link href="/termos" className="underline underline-offset-2 hover:text-accentdeep">
          Termos
        </Link>
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold text-ink">Antes de subir a lista dos seus clientes</h2>
        <p className="text-[11.5px] text-muted">
          <Link href="/seguranca" className="underline underline-offset-2 hover:text-accentdeep">
            Segurança
          </Link>{" "}
          ·{" "}
          <Link href="/privacidade" className="underline underline-offset-2 hover:text-accentdeep">
            Privacidade
          </Link>{" "}
          ·{" "}
          <Link href="/termos" className="underline underline-offset-2 hover:text-accentdeep">
            Termos
          </Link>
        </p>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {PONTOS.map((p) => (
          <li key={p} className="text-[12px] leading-relaxed text-slate2">
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
