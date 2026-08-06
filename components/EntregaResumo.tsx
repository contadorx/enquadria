import { taxa, type Resumo } from "@/lib/entrega";

/**
 * ENTREGA E LEITURA — a seção que faltava na aba de e-mails.
 *
 * Apresentação pura: recebe os números já casados por `lib/entrega` e não
 * calcula nada. Ficou em componente próprio por dois motivos — a página de
 * e-mails já era longa demais, e uma seção isolada pode ser renderizada
 * sozinha numa prévia, que é como esta tela foi conferida antes de subir.
 */
export function EntregaResumo({
  geral,
  porRegra,
  nomeRegra,
  semWebhook,
  orfaos,
}: {
  geral: Resumo;
  porRegra: { regra: string; resumo: Resumo }[];
  nomeRegra: Record<string, string>;
  semWebhook: boolean;
  orfaos: number;
}) {
  /*
  ═══════════════════════════════════ ENTREGA E LEITURA (30 dias)
  "Enviado" só diz que o provedor aceitou. O que decide se o canal está
  vivo é o que vem depois — e esse dado já existia em `email_eventos`
  desde a 0050, alimentado pelos webhooks, sem aparecer em tela nenhuma.
  ABERTURA É PISO, NÃO MEDIDA: o pixel é bloqueado por padrão em boa
  parte dos clientes e o Apple Mail infla o contrário. O clique é o
  número em que se decide, e por isso ele tem coluna própria.
  */
  return (
    <section>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">Entrega e leitura</h2>
        <span className="text-[11.5px] text-muted">últimos 30 dias</span>
      </div>

      {semWebhook ? (
        <div className="rounded border border-amarelo/40 bg-amarelowash p-4 text-[12.5px] leading-relaxed">
          <b>Nenhum evento de entrega nos últimos 30 dias.</b> Ou nada saiu, ou o webhook não está
          chegando. Confira <b>EMAIL_WEBHOOK_SEGREDO</b> no ambiente e a URL cadastrada no provedor
          (<span className="font-mono">/api/email/evento?s=…</span>) — sem ela, todo envio fica
          parado em &quot;enviado&quot; para sempre, o que é indistinguível de campanha que ninguém abre.
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { r: "Enviados", v: geral.enviados, t: null as number | null, ajuda: "o provedor aceitou a mensagem" },
              { r: "Entregues", v: geral.entregues, t: taxa(geral.entregues, geral.enviados), ajuda: "chegou na caixa (quem abriu também conta: se abriu, recebeu)" },
              { r: "Abriram", v: geral.abertos, t: taxa(geral.abertos, geral.enviados), ajuda: "piso, não medida: o pixel é bloqueado em boa parte dos clientes" },
              { r: "Clicaram", v: geral.cliques, t: taxa(geral.cliques, geral.enviados), ajuda: "exige ação humana — é o número confiável" },
              { r: "Falhas", v: geral.falhas, t: taxa(geral.falhas, geral.enviados), ajuda: "bounce, spam ou recusa: endereço que não pode receber de novo" },
            ].map((c) => (
              <div key={c.r} className="rounded border border-line bg-surface px-3 py-2.5" title={c.ajuda}>
                <p className="text-[11px] uppercase tracking-wide text-muted">{c.r}</p>
                <p className="mt-0.5 font-mono text-[20px] font-semibold">
                  {c.v}
                  {c.t != null && <span className="ml-1.5 text-[12px] font-normal text-muted">{c.t}%</span>}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-2.5 overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Regra</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Enviados</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Entregues</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Abriram</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Clicaram</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Falhas</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Sem evento</th>
                </tr>
              </thead>
              <tbody>
                {porRegra.map(({ regra, resumo: r }) => (
                  <tr key={regra} className="border-b border-linesoft last:border-0">
                    <td className="px-3 py-2">{nomeRegra[regra] || regra}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.enviados}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.entregues}
                      <span className="ml-1 text-[11px] text-muted">{taxa(r.entregues, r.enviados)}%</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.abertos}
                      <span className="ml-1 text-[11px] text-muted">{taxa(r.abertos, r.enviados)}%</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${r.cliques > 0 ? "font-semibold text-accentdeep" : ""}`}>
                      {r.cliques}
                      <span className="ml-1 text-[11px] font-normal text-muted">{taxa(r.cliques, r.enviados)}%</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${r.falhas > 0 ? "text-vermelho" : "text-muted"}`}>
                      {r.falhas}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{r.sem_evento}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 max-w-[95ch] text-[11.5px] leading-relaxed text-muted">
            <b>Abertura é piso, não medida.</b> O pixel é bloqueado por padrão em boa parte dos
            clientes de e-mail, e o Apple Mail carrega todas as imagens — o erro existe nos dois
            sentidos. O <b>clique</b> exige ação e é onde se decide se o texto funcionou.
            {geral.sem_evento > 0 && (
              <>
                {" "}
                <b>{geral.sem_evento}</b> envios não geraram evento nenhum: ou o provedor não mandou
                webhook para eles, ou ainda não houve tempo.
              </>
            )}
            {orfaos > 0 && (
              <>
                {" "}
                {orfaos} eventos não casaram com nenhum envio dos últimos 30 dias — normal para
                e-mail antigo ou mandado fora daqui.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
