import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { derivaDe, resumirDeriva, leituraDaDeriva, type AnaliseCrua } from "@/lib/deriva";
import { pct } from "@/lib/motor";

/**
 * OS REGISTROS — o que existe dentro das contas, e o que o motor fez com isso.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A PERGUNTA QUE ORIGINOU ESTA TELA: "eu mexi no motor; isso muda a análise
 * salva do cliente?"
 *
 * A resposta é NÃO para o que está gravado e SIM para o que é derivado na hora
 * de mostrar — e as duas metades dessa resposta precisam ser visíveis, porque
 * a segunda metade é a que produz a ligação do contador dizendo que o número
 * mudou sozinho.
 *
 * O bloco de cima conta o estoque. O de baixo mostra a DERIVA: quais análises
 * teriam outra saída se fossem recalculadas com o motor de hoje, e quais delas
 * já viraram documento assinado.
 *
 * NÃO EXISTE BOTÃO DE REPROCESSAR, e é decisão, não falta. Um botão que
 * recalcula tudo reescreve em silêncio recomendações entregues — algumas com
 * termo assinado — e faz isso no lugar do profissional que assinou. A tela
 * informa; quem decide é gente.
 */
export const dynamic = "force-dynamic";

const data = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const pp = (x: number | null) =>
  x == null ? "—" : `${(x * 100).toFixed(2).replace(".", ",")} p.p.`;

export default async function Registros() {
  const supabase = createClient();

  const [{ data: contas, error: eContas }, { data: cruas, error: eCruas }] = await Promise.all([
    supabase.rpc("plataforma_registros"),
    supabase.rpc("plataforma_analises_cruas"),
  ]);

  if (eContas || eCruas) {
    const msg = eContas?.message ?? eCruas?.message ?? "";
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">Não consegui ler os registros</p>
        <p className="mt-2 text-[13px]">{msg}</p>
        <p className="mt-2 text-[12.5px] text-muted">
          Se a mensagem falar em função que não existe, falta rodar a migration
          <b> 0048_ver_a_conta_do_cliente.sql</b>.
        </p>
      </div>
    );
  }

  const linhas = ((cruas as AnaliseCrua[]) ?? []).map(derivaDe);
  const resumo = resumirDeriva(linhas);
  const mudam = linhas.filter((l) => l.muda).sort((a, b) => Number(b.critica) - Number(a.critica));
  const lista = (contas as Record<string, number | string | boolean | null>[]) ?? [];

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Registros</h1>
      <p className="mt-0.5 max-w-[80ch] text-[13px] leading-relaxed text-muted">
        O que existe dentro de cada conta, e o que as correções do motor fizeram com o que já estava
        salvo. Os números gravados <b>não</b> mudam sozinhos — nada é reprocessado. O que muda é o
        que o sistema calcularia hoje, e é essa diferença que está medida aqui.
      </p>

      {/* ─────────────────────────────────────────────────────── a deriva */}
      <div className="mt-5 rounded border border-line bg-surface p-4">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          Deriva do motor
        </div>
        <p className="mt-1.5 max-w-[80ch] text-[13.5px] leading-relaxed">
          {leituraDaDeriva(resumo)}
        </p>

        <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Análises", String(resumo.total), `${resumo.recalculadas} recalculáveis`],
            [
              "Mudariam de saída",
              String(resumo.mudam),
              resumo.total ? `${((resumo.mudam / resumo.total) * 100).toFixed(0)}% da base` : "—",
            ],
            [
              "Já viraram documento",
              String(resumo.criticas),
              "laudo emitido ou termo assinado",
            ],
            [
              "Maior mudança na folga",
              pp(resumo.maior_diferenca_folga),
              "impressa no laudo (fc − re → fc − re líquido)",
            ],
          ].map(([t, v, sub]) => (
            <div key={t} className="rounded border border-line bg-surface2 p-3.5">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{t}</div>
              <div className="mt-1 text-[20px] font-bold">{v}</div>
              <div className="text-[11.5px] text-muted">{sub}</div>
            </div>
          ))}
        </div>

        {(resumo.em_teste > 0 || resumo.divergem_do_pdf > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {resumo.em_teste > 0 && (
              <span className="rounded-sm border border-line bg-surface2 px-2.5 py-1 text-[11.5px] text-muted">
                {resumo.em_teste} de contas de teste, fora da conta
              </span>
            )}
            {resumo.divergem_do_pdf > 0 && (
              <span className="rounded-sm border border-amarelo/40 bg-amarelowash px-2.5 py-1 text-[11.5px] text-slate2">
                <b>{resumo.divergem_do_pdf}</b> revisada(s) depois do laudo — não bate com o PDF do
                cliente
              </span>
            )}
          </div>
        )}

        {resumo.sem_base > 0 && (
          <p className="mt-2.5 text-[12px] text-muted">
            {resumo.sem_base} análise{resumo.sem_base === 1 ? "" : "s"} não pôde ser recalculada por
            falta de parâmetro congelado ou premissa. Elas ficam de fora dos números acima em vez de
            entrar como “não mudou” — não saber é diferente de não mudar.
          </p>
        )}

        {!!resumo.transicoes.length && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {resumo.transicoes.map((t) => (
              <span
                key={`${t.de}${t.para}`}
                className="rounded-sm border border-line bg-surface2 px-2.5 py-1 font-mono text-[11.5px]"
              >
                {t.de} → {t.para} · {t.n}
                {t.comDocumento > 0 && (
                  <b className="ml-1 text-vermelho">({t.comDocumento} com documento)</b>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ───────────────────────────────── as linhas que exigem decisão */}
      {!!mudam.length && (
        <div className="mt-5 overflow-x-auto rounded border border-line bg-surface">
          <div className="border-b border-line px-3 py-2.5 text-[12.5px] font-bold">
            As análises que mudariam — as de documento emitido vêm primeiro
          </div>
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Empresa</th>
                <th className="px-3 py-2.5 font-semibold">Calculada</th>
                <th className="px-3 py-2.5 font-semibold">Motor</th>
                <th className="px-3 py-2.5 font-semibold">No PDF</th>
                <th className="px-3 py-2.5 font-semibold">Gravada</th>
                <th className="px-3 py-2.5 font-semibold">Hoje daria</th>
                <th className="px-3 py-2.5 font-semibold">Folga impressa</th>
                <th className="px-3 py-2.5 font-semibold">Documento</th>
              </tr>
            </thead>
            <tbody>
              {mudam.map((l) => (
                <tr key={l.id} className={`border-b border-linesoft ${l.critica ? "bg-amarelowash" : ""}`}>
                  <td className="px-3 py-2.5">{l.tenant_nome ?? "—"}</td>
                  <td className="px-3 py-2.5">{l.empresa_nome ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{data(l.calculado_em)}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {l.motor ?? "sem carimbo"}
                  </td>
                  <td className={`px-3 py-2.5 font-mono ${l.divergiu_do_pdf ? "font-bold text-vermelho" : "text-muted"}`}>
                    {l.pdf_saida ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{l.gravada}</td>
                  <td className="px-3 py-2.5 font-mono font-bold">
                    {l.recalculada}
                    {l.absorcao_cabe && (
                      <span className="ml-1 text-[10px] font-normal text-muted">absorção</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted">
                    {pp(l.folga_antes)} → {pp(l.folga_agora)}
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px]">
                    {l.laudo_numero ? (
                      <b>laudo {String(l.laudo_numero).padStart(4, "0")}</b>
                    ) : l.tem_laudo ? (
                      <b>laudo emitido</b>
                    ) : (
                      <span className="text-muted">nenhum</span>
                    )}
                    {l.termo_assinado && <div className="text-vermelho">termo assinado</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <b>Não há botão de reprocessar, e é de propósito.</b> O laudo entregue guarda snapshot e
            continua o que era — refazer a análise não o reescreve. Mas trocar a recomendação de uma
            empresa cujo dono já assinou um termo é conversa de contador com cliente, não de sistema
            com banco de dados. Use esta lista para ligar, não para clicar.
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────── o estoque por conta */}
      <div className="mt-6 overflow-x-auto rounded border border-line bg-surface">
        <div className="border-b border-line px-3 py-2.5 text-[12.5px] font-bold">
          O que existe em cada conta
        </div>
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Escritório</th>
              <th className="px-3 py-2.5 font-semibold">Usuários</th>
              <th className="px-3 py-2.5 font-semibold">Empresas</th>
              <th className="px-3 py-2.5 font-semibold">Análises</th>
              <th className="px-3 py-2.5 font-semibold">Laudos</th>
              <th className="px-3 py-2.5 font-semibold">Assinados</th>
              <th className="px-3 py-2.5 font-semibold">Termos</th>
              <th className="px-3 py-2.5 font-semibold">Saídas</th>
              <th className="px-3 py-2.5 font-semibold">Último trabalho</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const total = Number(c.analises ?? 0);
              return (
                <tr key={String(c.tenant_id)} className="border-b border-linesoft">
                  <td className="px-3 py-2.5">
                    {String(c.nome ?? "(sem nome)")}
                    {c.is_teste ? (
                      <span className="ml-1.5 rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                        teste
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{String(c.usuarios ?? 0)}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {String(c.empresas ?? 0)}
                    <span className="ml-1 text-[10.5px] text-muted">
                      {Number(c.empresas_faixa_a ?? 0)} na faixa A
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    {total}
                    {Number(c.sem_laudo ?? 0) > 0 && (
                      <span className="ml-1 text-[10.5px] text-muted">
                        {Number(c.sem_laudo)} sem laudo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{String(c.laudos ?? 0)}</td>
                  {/* LAUDO EMITIDO e LAUDO ASSINADO são negócios diferentes: o
                      primeiro é produção, o segundo é decisão fechada. Mostrar
                      só o primeiro faz o painel parecer melhor do que está. */}
                  <td className="px-3 py-2.5 font-mono">
                    {String(c.laudos_assinados ?? 0)}
                    {Number(c.laudos ?? 0) > 0 && (
                      <span className="ml-1 text-[10.5px] text-muted">
                        {Math.round((Number(c.laudos_assinados ?? 0) / Number(c.laudos)) * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    {String(c.termos_assinados ?? 0)}/{String(c.termos ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {total === 0
                      ? "—"
                      : (["s1", "s2", "s3", "s4", "s5"] as const)
                          .map((k) => `${k.toUpperCase()} ${Number(c[k] ?? 0)}`)
                          .filter((_, i) => Number(c[(["s1", "s2", "s3", "s4", "s5"] as const)[i]] ?? 0) > 0)
                          .join(" · ")}
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] text-muted">
                    {data(c.ultima_analise as string)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/painel/negocio/registros/${String(c.tenant_id)}`}
                      className="text-[12px] font-semibold text-accentdeep hover:underline"
                    >
                      abrir a conta
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">
                  Nenhuma conta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-[80ch] text-[12px] leading-relaxed text-muted">
        Abrir a conta é <b>leitura</b>, não impersonação: o sistema não assume a identidade do
        usuário e não escreve nada em nome dele. Cada abertura fica registrada com data, e-mail e
        escritório em <span className="font-mono">acessos_plataforma</span> — para que “eu só olhei”
        seja verificável, inclusive contra mim. A base de cálculo do repasse aparece com {pct(0.088)}{" "}
        ou o que estiver congelado em cada análise.
      </p>
    </div>
  );
}
