import type { Metadata } from "next";
import Link from "next/link";
import { CascaPublica } from "@/components/CascaPublica";
import { LaudoFolha } from "@/components/LaudoFolha";
import {
  analiseExemplo,
  carteiraTriada,
  contagemPorFaixa,
  ESCRITORIO_EXEMPLO,
  empresaDoLaudo,
} from "@/lib/exemplo";
import { formatarCnpj, limparCnpj } from "@/lib/cnpj";

/**
 * O EXEMPLO PÚBLICO — a página que a cadência fria linka.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE UM ENDEREÇO, E NÃO UM ANEXO.
 *
 * O pedido era mandar o relatório e o laudo de exemplo nos e-mails. Anexo em
 * e-mail frio é o caminho mais curto para a caixa de spam: PDF anexo dispara
 * filtro em quase todo provedor, e o e-mail que não chega não convence
 * ninguém. Pior: anexo é uma cópia congelada — no dia em que o laudo mudar,
 * quem tiver o PDF antigo compara com o produto e conclui que foi enganado.
 *
 * Um link resolve os dois: passa pelos filtros, e mostra sempre o documento de
 * hoje. E dá para medir quem abriu, que é justamente o sinal que a cadência
 * usa para marcar o contato como quente.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O EXEMPLO É GERADO PELO MOTOR DE VERDADE.
 *
 * O laudo abaixo não é uma imagem nem um HTML imitando o produto: é o
 * componente `LaudoFolha`, o mesmo que imprime o documento que o cliente
 * pagante recebe, alimentado por `decidir()` e pelas demais funções de
 * `lib/motor.ts`. Se o laudo mudar, esta página muda junto — não há versão de
 * marketing para envelhecer em paralelo.
 *
 * SEM LOGIN, e por isso fora do middleware. Pedir cadastro para ver o exemplo
 * inverteria a ordem das coisas: o exemplo existe para quem ainda não confia.
 */

export const metadata: Metadata = {
  title: "Exemplo: o mapa da carteira e o laudo | Enquadria",
  description:
    "Um exemplo real, gerado pelo mesmo motor do produto: a triagem de uma carteira de 12 empresas e o laudo completo de uma delas. Empresas fictícias.",
  alternates: { canonical: "https://enquadria.com.br/exemplo" },
};

/* o conteúdo é determinístico, mas o carimbo da alíquota imprime a data da
   consulta — uma hora de cache mantém a página estável para quem comparar */
export const revalidate = 3600;

const CORES: Record<string, string> = {
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
  C: "bg-accentwash text-accentdeep",
  D: "bg-neutrowash text-neutro",
  MEI: "bg-neutrowash text-neutro",
  FORA: "bg-surface2 text-muted",
};

const EXPLICA: Record<string, string> = {
  A: "precisa decidir até 30/09",
  B: "avaliar — depende do perfil de cliente",
  C: "provável permanência",
  D: "permanência documentada",
  MEI: "fora do regime híbrido",
  FORA: "fora da decisão",
};

export default function ExemploPage() {
  const linhas = carteiraTriada();
  const conta = contagemPorFaixa(linhas);
  /* a data do carimbo é a do build/revalidate, não a de cada visita */
  const agora = new Date().toISOString();
  const analise = analiseExemplo(agora);
  /* a empresa do laudo vem da TRIAGEM, não de um índice fixo: com `linhas[0]`
     a tabela mostrava faixa C e o texto dizia "a primeira da faixa A" */
  const primeira = empresaDoLaudo();

  return (
    <CascaPublica largura="max-w-[900px]">

      {/* ───────────────────────────────────────── o aviso vem PRIMEIRO
          Quem chega aqui é contador: se ele achar por um segundo que está
          vendo carteira de cliente de verdade numa página aberta, perdemos
          exatamente a confiança que a página existe para construir. */}
      <div className="rounded border border-amarelo/40 bg-amarelowash px-4 py-2.5">
        <p className="text-[12.5px] leading-relaxed">
          <b>Empresas fictícias.</b> Nenhum dado real de cliente aparece aqui — os CNPJs têm
          dígito verificador válido só para a triagem funcionar, e as empresas não existem. Os
          números são <b>estimativa de cenário</b>; a decisão e a responsabilidade técnica são de
          quem assina.
        </p>
      </div>

      <h1 className="mt-6 text-[26px] font-bold leading-tight tracking-tight text-ink">
        O que sai do Enquadria, sem precisar acreditar em mim
      </h1>
      <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-slate2">
        Duas coisas: o <b>mapa da carteira</b>, que separa quem precisa decidir até 30 de setembro
        de quem não precisa, e o <b>laudo completo</b> de uma dessas empresas — com memória de
        cálculo, cenários e condições de validade. Os dois foram gerados agora, pelo mesmo motor
        que atende quem já usa o sistema.
      </p>

      {/* ═══════════════════════════════════════════════ 1 · A CARTEIRA */}
      <section className="mt-8">
        <h2 className="text-[17px] font-bold text-ink">1. O mapa da carteira</h2>
        <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted">
          Entra um CSV com a coluna de CNPJ. Sai isto, em segundos. A conta que interessa não é
          quantas empresas você tem — é quantas <b>exigem decisão</b>, porque é só nelas que
          setembro cobra trabalho.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {["A", "B", "C", "D", "MEI", "FORA"].map((f) =>
            conta[f] ? (
              <div key={f} className={`rounded px-3 py-2 ${CORES[f]}`}>
                <div className="font-mono text-[19px] font-semibold leading-none">{conta[f]}</div>
                <div className="mt-1 text-[11px] font-semibold">
                  faixa {f} <span className="font-normal opacity-80">· {EXPLICA[f]}</span>
                </div>
              </div>
            ) : null
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Empresa</th>
                <th className="px-3 py-2.5 font-semibold">CNPJ</th>
                <th className="px-3 py-2.5 font-semibold">Faixa</th>
                <th className="px-3 py-2.5 font-semibold">Por quê</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.cnpj} className="border-b border-linesoft last:border-0">
                  <td className="px-3 py-2 font-semibold text-ink">{l.razao_social}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px] text-muted">
                    {formatarCnpj(limparCnpj(l.cnpj))}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CORES[l.faixa]}`}>
                      {l.faixa}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11.5px] leading-snug text-muted">{l.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Repare no que a triagem já resolveu sozinha: o MEI está fora porque o regime híbrido
          alcança só ME e EPP, a baixada saiu pela situação cadastral e o presumido não entra na
          decisão do Simples. São <b>{(conta.MEI ?? 0) + (conta.FORA ?? 0)}</b> empresas que você
          não precisa mais olhar — e a permanência delas fica documentada.
        </p>
      </section>

      {/* ═══════════════════════════════════════════════════ 2 · O LAUDO */}
      <section className="mt-10">
        <h2 className="text-[17px] font-bold text-ink">2. O laudo de uma delas</h2>
        <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted">
          Abaixo, o documento inteiro da <b>{primeira.razao_social}</b> — a primeira da faixa A. É
          este papel que sustenta o honorário: ele sai numerado, com a marca de quem assina, a
          memória de cálculo refazível e um código de verificação que o cliente confere sem login.
          A única vez em que o Enquadria aparece no documento é no endereço de verificação — e é
          justamente ele que permite ao seu cliente conferir o laudo por fora, sem depender de
          você nem de mim.
        </p>

        <div className="mt-4 overflow-hidden rounded border border-line bg-white shadow-card">
          <LaudoFolha
            publico
            dados={{
              numero: 1,
              emitido_em: agora,
              analise,
              empresa: {
                razao_social: primeira.razao_social,
                cnpj: primeira.cnpj,
                anexo: 2,
                regime: "Simples Nacional",
                faixa: primeira.faixa,
                motivo_triagem: primeira.motivo,
              },
              escritorio: ESCRITORIO_EXEMPLO,
            }}
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════ O CONVITE */}
      <section className="mt-10 rounded-lg border border-accent bg-accentwash p-5">
        <h2 className="text-[16px] font-bold text-ink">E na sua carteira?</h2>
        <p className="mt-1 max-w-[66ch] text-[13px] leading-relaxed text-slate2">
          A triagem é gratuita e não tem limite: você sobe a carteira, vê o mapa inteiro e só
          esbarra em alguma cobrança quando for emitir o terceiro laudo. Se preferir, comece com{" "}
          <b>uma empresa só</b> — um CNPJ basta para ver o caminho completo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Criar conta e subir uma empresa
          </Link>
          <Link
            href="/seguranca"
            className="rounded-sm border border-accentdeep px-4 py-2.5 text-[13px] font-semibold text-accentdeep"
          >
            Como os dados são protegidos
          </Link>
        </div>
      </section>
    </CascaPublica>
  );
}
