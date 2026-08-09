"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * O FORMULÁRIO DA ALÍQUOTA.
 *
 * Duas decisões de tela que existem por causa do custo do erro:
 *
 * 1. O CAMPO É EM POR CENTO, o banco guarda em fração. Ninguém digita "0,088"
 *    naturalmente; digita "8,8". Aceitar fração aqui é convidar o erro de fator
 *    100 no número que decide a carteira inteira de todo escritório. A
 *    conversão é da tela, e o eco embaixo mostra a fração que vai ser gravada.
 *
 * 2. MARCAR "JÁ FIXADA" EXIGE ESCREVER A FONTE. Esse par governa o texto
 *    impresso no laudo: enquanto está em falso, o documento diz que é
 *    estimativa de trabalho com prazo até 31/10/2026; marcado, passa a afirmar
 *    que decorre de norma publicada. Afirmar isso sem citar a norma seria a
 *    pior linha possível num documento que o cliente verifica sozinho.
 */

interface Linha {
  exercicio: number;
  aliquota_cbs: number;
  aliquota_ibs: number;
  fronteira_min: number;
  fronteira_max: number;
  fixada: boolean | null;
  fonte: string | null;
  atualizado_em: string | null;
}

const pct = (v: number) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const paraFracao = (txt: string): number => {
  const n = Number(String(txt).replace(",", ".").trim());
  return Number.isFinite(n) ? n / 100 : NaN;
};

export function ParametrosExercicio({
  linhas,
  padrao,
}: {
  linhas: Linha[];
  padrao: { aliquota: number; fronteiraMin: number; fronteiraMax: number };
}) {
  const router = useRouter();
  const vigente = linhas.find((l) => l.exercicio === 2027) ?? null;

  const [exercicio, setExercicio] = useState("2027");
  const [cbs, setCbs] = useState(pct(vigente ? Number(vigente.aliquota_cbs) : padrao.aliquota - 0.001));
  const [ibs, setIbs] = useState(pct(vigente ? Number(vigente.aliquota_ibs) : 0.001));
  const [fmin, setFmin] = useState(
    String(vigente ? Number(vigente.fronteira_min) : padrao.fronteiraMin).replace(".", ",")
  );
  const [fmax, setFmax] = useState(
    String(vigente ? Number(vigente.fronteira_max) : padrao.fronteiraMax).replace(".", ",")
  );
  const [fixada, setFixada] = useState(!!vigente?.fixada);
  const [fonte, setFonte] = useState(vigente?.fonte ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  const fCbs = paraFracao(cbs);
  const fIbs = paraFracao(ibs);
  const soma = fCbs + fIbs;
  const somaOk = Number.isFinite(soma) && soma > 0 && soma <= 0.5;
  const mudou = !!vigente && Math.abs(soma - (Number(vigente.aliquota_cbs) + Number(vigente.aliquota_ibs))) > 1e-9;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setFeito(null);
    try {
      const resp = await fetch("/api/negocio/parametros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercicio: Number(exercicio),
          aliquota_cbs: fCbs,
          aliquota_ibs: fIbs,
          fronteira_min: Number(fmin.replace(",", ".")),
          fronteira_max: Number(fmax.replace(",", ".")),
          fixada,
          fonte,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.erro ?? "não foi possível gravar");
      setFeito(
        `Alíquota de ${exercicio} publicada em ${pct(json.aliquota)}%. ` +
          `${json.analises_com_numero_anterior} análises foram calculadas com o número anterior — ` +
          `elas continuam como estão até alguém pedir uma rodada nova.`
      );
      router.refresh();
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : "não foi possível falar com o servidor — nada foi gravado."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-6">
      {linhas.length > 0 && (
        <div className="mb-5 overflow-x-auto rounded border border-line">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-surface2 text-left font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                <th className="px-3 py-2">Exercício</th>
                <th className="px-3 py-2">CBS + IBS</th>
                <th className="px-3 py-2">Banda</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.exercicio} className="border-b border-linesoft last:border-0">
                  <td className="px-3 py-2 font-mono">{l.exercicio}</td>
                  <td className="px-3 py-2 font-mono">
                    {pct(Number(l.aliquota_cbs) + Number(l.aliquota_ibs))}%
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {Number(l.fronteira_min)}× a {Number(l.fronteira_max)}×
                  </td>
                  <td className="px-3 py-2">
                    {l.fixada ? (
                      <span className="font-semibold text-verde">fixada por norma</span>
                    ) : (
                      <span className="text-muted">estimativa de trabalho</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {l.atualizado_em ? new Date(l.atualizado_em).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="text-[14px] font-bold text-ink">Publicar valor</div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-slate2">Exercício</span>
            <input
              value={exercicio}
              onChange={(e) => setExercicio(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-slate2">CBS (%)</span>
            <input
              value={cbs}
              onChange={(e) => setCbs(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="8,7"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-slate2">IBS (%)</span>
            <input
              value={ibs}
              onChange={(e) => setIbs(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="0,1"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
            />
          </label>
        </div>

        {/* O ECO. Sem ele, digitar "0,088" achando que é por cento grava 0,00088
            e ninguém percebe até um laudo sair com a conta errada. */}
        <p className="mt-2 font-mono text-[11.5px] text-muted">
          {somaOk ? (
            <>
              soma: <b className="text-ink">{pct(soma)}%</b> · grava como{" "}
              <b className="text-ink">{soma.toFixed(5)}</b>
              {mudou && (
                <span className="text-amarelo">
                  {" "}
                  · muda o valor vigente (era {pct(Number(vigente!.aliquota_cbs) + Number(vigente!.aliquota_ibs))}%)
                </span>
              )}
            </>
          ) : (
            <span className="text-amarelo">
              informe CBS e IBS em por cento (ex.: 8,7 e 0,1) — a soma precisa ficar entre 0 e 50%
            </span>
          )}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-slate2">
              Banda de fronteira — mínimo (multiplicador)
            </span>
            <input
              value={fmin}
              onChange={(e) => setFmin(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-slate2">
              Banda de fronteira — máximo (multiplicador)
            </span>
            <input
              value={fmax}
              onChange={(e) => setFmax(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
            />
          </label>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          São multiplicadores do ganho do comprador (0,8× e 1,2×), não pontos percentuais. Quem
          ler como “0,8%” inverte a banda inteira.
        </p>

        <label className="mt-4 flex items-start gap-2.5 rounded-sm border border-line bg-surface2 px-3 py-3 text-[13px] text-slate2">
          <input
            type="checkbox"
            checked={fixada}
            onChange={(e) => setFixada(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <b>A Resolução do Senado já foi publicada.</b> Marcar isto muda o texto impresso em
            todo laudo novo: ele deixa de dizer “estimativa de trabalho, com prazo até 31/10/2026”
            e passa a afirmar que o número decorre de norma. Só marque com a norma na mão.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[11.5px] font-semibold text-slate2">
            Fonte do número {fixada && <b className="text-amarelo">— obrigatória</b>}
          </span>
          <textarea
            value={fonte}
            onChange={(e) => setFonte(e.target.value)}
            rows={3}
            placeholder="Resolução do Senado Federal nº …/2026, art. …"
            className="w-full rounded-sm border border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed outline-none focus:border-accent"
          />
          <span className="mt-1 block text-[11px] text-muted">
            Este texto vai impresso no carimbo da alíquota, dentro do laudo, ao lado das premissas.
          </span>
        </label>

        {erro && <p className="mt-3 text-[12.5px] text-vermelho">{erro}</p>}
        {feito && <p className="mt-3 text-[12.5px] text-verde">{feito}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={salvar}
            disabled={salvando || !somaOk || (fixada && fonte.trim().length < 15)}
            className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {salvando ? "…" : "Publicar alíquota"}
          </button>
          {!somaOk && (
            <span className="text-[11.5px] text-muted">
              corrija a soma de CBS + IBS para liberar
            </span>
          )}
          {somaOk && fixada && fonte.trim().length < 15 && (
            <span className="text-[11.5px] text-muted">
              escreva a fonte para poder marcar como fixada
            </span>
          )}
        </div>

        <p className="mt-4 max-w-[76ch] text-[11.5px] leading-relaxed text-muted">
          Depois de publicar, os laudos já emitidos continuam como estão — são prova, e prova que
          se reescreve sozinha não é prova. Para pôr a carteira no número novo, cada escritório
          cria uma <b>rodada nova</b> em Configurações: ela recalcula sobre as mesmas respostas e
          preserva a rodada anterior inteira.
        </p>
      </div>
    </div>
  );
}
