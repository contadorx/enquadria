"use client";

import { useState, useTransition } from "react";

/**
 * APAGAR UMA CONTA — a tela do que não tem desfazer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE EM DOIS PASSOS.
 *
 * Um botão "excluir" com um `confirm()` do navegador é o desenho errado aqui,
 * porque a pergunta que ele faz ("tem certeza?") é a única que a pessoa nunca
 * responde com informação. A pergunta certa é OUTRA: "você sabe o que tem
 * dentro desta conta?" — e a resposta só existe do lado do banco.
 *
 * Então o primeiro passo não apaga nada: pergunta ao servidor o que o delete
 * faria e mostra a lista, tabela por tabela. Se a conta tiver 73 empresas e 28
 * laudos, isso aparece ANTES, não depois.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE DIGITAR O NOME.
 *
 * Não é cerimônia. Toda conta desta lista é um uuid parecido com o outro, e
 * três delas se chamam "ContabilTESTE". Clicar na linha errada é fácil; digitar
 * o nome errado inteiro, não.
 *
 * A conferência é EXATA — sem trim, sem minúsculas. Uma das contas do banco
 * termina com espaço, e por isso o nome é exibido aqui entre marcadores, com
 * aviso quando isso acontece. Afrouxar a comparação para "ser gentil" seria
 * afrouxar a única trava que existe.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE A TELA NÃO DECIDE.
 *
 * As três recusas (fatura paga, assinatura viva no Asaas, sua própria conta)
 * moram no banco, não aqui. Este componente só as exibe. Regra de negócio
 * escrita em dois lugares é regra que um dia diverge — e a que some é sempre a
 * do lado que ninguém testa.
 */

interface Previa {
  existe: boolean;
  nome?: string | null;
  criado_em?: string | null;
  status?: string | null;
  contagens?: Record<string, number>;
  total_linhas?: number;
  usuarios?: { id: string; email?: string | null; nome?: string | null }[];
  impedimentos?: string[];
  avisos?: string[];
  pode?: boolean;
}

interface Resultado {
  nome?: string | null;
  total_linhas?: number;
  logins_apagados?: string[];
  logins_mantidos?: string[];
  falhas?: string[];
}

/** rótulo legível para os nomes de tabela do banco */
const NOMES: Record<string, string> = {
  profiles: "usuários",
  empresas: "empresas",
  analises: "análises",
  laudos: "laudos",
  termos: "termos",
  importacoes: "importações",
  assinaturas: "assinaturas",
  faturas: "faturas",
  aberturas: "estudos de abertura",
  chamados: "chamados",
  coletas: "coletas",
  comparativos: "comparativos",
  convites: "convites",
  envios_cliente: "envios ao cliente",
  indicacoes: "indicações",
  nps_respostas: "respostas de NPS",
  plataforma_envios: "e-mails enviados",
  radar_leituras: "leituras do radar",
};

export function ExcluirConta({
  tenantId,
  nome,
  onExcluida,
}: {
  tenantId: string;
  nome: string | null;
  onExcluida: () => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [digitado, setDigitado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [pend, start] = useTransition();

  async function chamar(corpo: Record<string, unknown>) {
    const r = await fetch("/api/negocio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return (await r.json()) as Record<string, unknown>;
  }

  /* o nome exato que o servidor vai exigir vem da PRÉVIA, não da lista — se a
     tela estiver com dado velho, é o do servidor que vale */
  const exato = previa?.nome ?? nome ?? "";
  const temEspaco = exato !== exato.trim();
  const confere = digitado === exato;

  if (feito) {
    return (
      <div className="mt-4 rounded-sm border border-verde/40 bg-verdewash p-3.5">
        <p className="text-[13px] font-semibold text-verde">
          Conta “{feito.nome}” apagada — {feito.total_linhas ?? 0} registro(s) foram junto.
        </p>
        {!!feito.logins_apagados?.length && (
          <p className="mt-1 text-[11.5px] text-verde">
            Login apagado: {feito.logins_apagados.join(", ")}.
          </p>
        )}
        {!!feito.logins_mantidos?.length && (
          <p className="mt-1 text-[11.5px] text-muted">
            Mantido (pertence a outro escritório): {feito.logins_mantidos.join(", ")}.
          </p>
        )}
        {!!feito.falhas?.length && (
          <p className="mt-1 text-[11.5px] font-semibold text-vermelho">
            A conta foi apagada, mas o login não: {feito.falhas.join(" · ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-sm border border-vermelho/30 bg-vermelhowash/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-bold text-vermelho">Apagar esta conta</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
            Não tem desfazer. O que fica é uma linha de auditoria com o retrato do que existia.
          </p>
        </div>
        {!previa && (
          <button
            className="rounded-sm border border-vermelho/50 px-3 py-1.5 text-[11.5px] font-semibold text-vermelho disabled:opacity-40"
            disabled={pend}
            onClick={() =>
              start(async () => {
                setErro(null);
                const r = await chamar({ acao: "previa_exclusao", tenant_id: tenantId });
                if (r.erro) { setErro(String(r.erro)); return; }
                setPrevia(r as unknown as Previa);
              })
            }
          >
            {pend ? "Conferindo…" : "Ver o que será apagado"}
          </button>
        )}
      </div>

      {erro && (
        <p className="mt-2.5 rounded-sm bg-vermelhowash px-2.5 py-1.5 text-[12px] font-semibold text-vermelho">
          {erro}
        </p>
      )}

      {previa && !previa.existe && (
        <p className="mt-2.5 text-[12px] text-muted">Esta conta já não existe. Recarregue a lista.</p>
      )}

      {previa?.existe && (
        <div className="mt-3 space-y-3">
          {/* o inventário */}
          <div className="rounded-sm border border-line bg-surface p-3">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              vai embora junto — {previa.total_linhas ?? 0} registro(s)
            </div>
            {Object.keys(previa.contagens ?? {}).length === 0 ? (
              <p className="mt-1.5 text-[12px] text-muted">
                Nada. Esta conta está vazia — foi criada e nunca usada.
              </p>
            ) : (
              <ul className="mt-1.5 grid gap-x-5 gap-y-0.5 text-[12px] sm:grid-cols-2">
                {Object.entries(previa.contagens ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([tabela, n]) => (
                    <li key={tabela} className="flex justify-between border-b border-linesoft py-0.5">
                      <span>{NOMES[tabela] ?? tabela}</span>
                      <span className="font-mono font-semibold">{n}</span>
                    </li>
                  ))}
              </ul>
            )}
            {!!previa.usuarios?.length && (
              <p className="mt-2 text-[11.5px] text-muted">
                Login que deixa de existir:{" "}
                {previa.usuarios.map((u) => u.email || u.id).join(", ")}
              </p>
            )}
          </div>

          {!!previa.avisos?.length && (
            <ul className="space-y-1">
              {previa.avisos.map((a, i) => (
                <li key={i} className="rounded-sm bg-amarelowash px-2.5 py-1.5 text-[11.5px] text-slate2">
                  {a}
                </li>
              ))}
            </ul>
          )}

          {/* as recusas */}
          {!previa.pode && (
            <div className="rounded-sm border border-vermelho/40 bg-surface p-3">
              <div className="text-[12px] font-bold text-vermelho">O banco recusa apagar:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-slate2">
                {(previa.impedimentos ?? []).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {/* a confirmação */}
          {previa.pode && (
            <div className="rounded-sm border border-line bg-surface p-3">
              <p className="text-[12px] text-slate2">
                Para confirmar, digite o nome da conta exatamente como está gravado:
              </p>
              <p className="mt-1.5 font-mono text-[12.5px]">
                <span className="text-muted">[</span>
                <span className="font-bold">{exato}</span>
                <span className="text-muted">]</span>
              </p>
              {temEspaco && (
                <p className="mt-1 text-[11px] font-semibold text-vermelho">
                  Atenção: este nome tem espaço na ponta, dentro dos colchetes. Ele faz parte do
                  nome e precisa ser digitado.
                </p>
              )}
              <input
                className="mt-2 w-full rounded-sm border border-line px-3 py-2 text-[13px]"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                placeholder="nome da conta"
                autoComplete="off"
              />
              <input
                className="mt-2 w-full rounded-sm border border-line px-3 py-2 text-[13px]"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="motivo (fica na auditoria — ex.: conta de teste do cadastro)"
              />
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  className="rounded-sm bg-vermelho px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                  disabled={pend || !confere}
                  title={confere ? "" : "Digite o nome exato para liberar"}
                  onClick={() =>
                    start(async () => {
                      setErro(null);
                      const r = await chamar({
                        acao: "excluir_conta",
                        tenant_id: tenantId,
                        confirmacao: digitado,
                        motivo,
                      });
                      if (r.erro) { setErro(String(r.erro)); return; }
                      setFeito(r as unknown as Resultado);
                      onExcluida();
                    })
                  }
                >
                  {pend ? "Apagando…" : "Apagar definitivamente"}
                </button>
                <button
                  className="rounded-sm border border-line px-3.5 py-2 text-[12px] font-semibold text-slate2"
                  onClick={() => { setPrevia(null); setDigitado(""); setErro(null); }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
