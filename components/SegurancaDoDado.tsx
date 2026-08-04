import Link from "next/link";

/**
 * A RESPOSTA À PERGUNTA QUE NINGUÉM FAZ EM VOZ ALTA.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O momento mais caro do produto é este: pedimos ao contador a CARTEIRA DELE.
 * Não é um e-mail nem um CNPJ avulso — é a lista de clientes, que é o ativo do
 * escritório. E pedimos isso a alguém que conheceu o sistema há dez minutos.
 *
 * Quem hesita aí raramente escreve perguntando. Ele fecha a aba. O abandono
 * não vira chamado, vira silêncio — e a métrica só mostra "importaram a
 * carteira: 44%", sem dizer por que os outros 56% pararam.
 *
 * Ter a política publicada não resolve: política mora no rodapé, e ninguém
 * abre rodapé no meio de uma tarefa. A informação tem que estar ONDE a
 * hesitação acontece, no instante em que ela acontece.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * REGRA DESTE COMPONENTE: cada linha aqui é verificável e sai do documento de
 * Segurança — não é marketing de confiança. "Seus dados estão seguros" não diz
 * nada; "a separação é feita no banco com RLS, não por filtro de tela" diz, e
 * pode ser conferido. Se alguma afirmação daqui deixar de ser verdade, ela sai
 * daqui ANTES de sair do documento.
 *
 * E o link para a lista honesta do que ainda NÃO temos fica junto, de
 * propósito: quem desconfia procura o que foi escondido, e não achar nada
 * escondido é o que convence.
 */

const PONTOS = [
  {
    t: "A carteira é sua, e o controlador é você",
    p: "Sobre os dados dos seus clientes, você é o controlador e nós somos operador. Não usamos conteúdo de conta para treinar modelo, não revendemos e não abrimos para terceiros.",
  },
  {
    t: "Nenhum outro escritório enxerga a sua lista",
    p: "A separação é feita no banco de dados, com Row Level Security do PostgreSQL — não é filtro de tela. Filtro de tela é aparência de segurança: quem chama a API direto passa por cima. Regra no banco não.",
  },
  {
    t: "Nenhuma IA processa a sua carteira",
    p: "A triagem e o cálculo são determinísticos, feitos aqui. Nenhum provedor de inteligência artificial recebe os dados dos seus clientes.",
  },
  {
    t: "Você tira quando quiser",
    p: "Exporta a carteira e os documentos pela própria interface, a qualquer momento. Tráfego em TLS e dados cifrados em repouso.",
  },
];

export function SegurancaDoDado({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate2">
        <b>Antes de subir a lista dos seus clientes:</b> a separação entre escritórios é feita no
        banco (RLS), nenhuma IA processa a sua carteira, e você exporta ou apaga quando quiser.{" "}
        <Link href="/seguranca" className="underline underline-offset-2 hover:text-accentdeep">
          Como protegemos
        </Link>{" "}
        ·{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-accentdeep">
          Privacidade
        </Link>
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13.5px] font-bold text-ink">
          Antes de subir a lista dos seus clientes
        </h2>
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

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {PONTOS.map((x) => (
          <div key={x.t}>
            <div className="text-[12.5px] font-semibold text-slate1">{x.t}</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{x.p}</p>
          </div>
        ))}
      </div>

      {/* o link para o que NÃO temos vem junto de propósito: quem desconfia
          procura o que foi escondido, e não achar nada é o que convence */}
      <p className="mt-3 border-t border-linesoft pt-2.5 text-[11.5px] leading-relaxed text-muted">
        O documento de Segurança termina com a lista do que ainda <b>não</b> temos — está lá de
        propósito. E você não precisa decidir isso agora:{" "}
        <b className="text-slate2">comece com uma empresa só</b> e veja o resultado antes de subir
        a carteira inteira.
      </p>
    </section>
  );
}
