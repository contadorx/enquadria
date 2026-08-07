"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { calcularNps } from "@/lib/nps";
import { AgenteVenda } from "@/components/AgenteVenda";

/**
 * O INTERRUPTOR DO ASSISTENTE — e o placar do NPS, que mora ao lado porque as
 * duas coisas respondem à mesma pergunta: como está a relação com a base.
 *
 * O assistente nasce DESLIGADO. A chave da API é configuração de servidor e o
 * custo é real: ligar precisa ser decisão consciente, com a persona lida antes.
 */
export default function AssistenteAdmin() {
  const [cfg, setCfg] = useState<{ ativo: boolean; modelo: string; persona: string; teto_dia: number } | null>(null);
  const [notas, setNotas] = useState<number[]>([]);
  const [indicacoes, setIndicacoes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("assistente_config")
      .select("ativo, modelo, persona, teto_dia")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      setErro(/assistente_config/i.test(error.message)
        ? "A migration 0031 ainda não foi rodada neste banco." : error.message);
      return;
    }
    setCfg(data as never);
    /* NPS "—" e 0 indicações por FALHA de leitura são idênticos a "ninguém
       respondeu ainda" — e o placar é justamente o que diz se vale continuar */
    const { data: n, error: eN } = await supabase.from("nps_respostas").select("nota");
    if (eN) setErro(`Não consegui ler as respostas de NPS: ${eN.message}`);
    setNotas(((n ?? []) as { nota: number }[]).map((x) => x.nota));
    const { count, error: eI } = await supabase.from("indicacoes").select("id", { count: "exact", head: true });
    if (eI) setErro(`Não consegui ler as indicações: ${eI.message}`);
    setIndicacoes(count ?? 0);
  }

  useEffect(() => { void carregar(); }, []);

  async function gravar(campos: Record<string, unknown>) {
    setErro(null);
    // esta tela é client component e chama carregar() logo abaixo, que relê do
    // banco; não há tela de servidor mostrando estes valores
    const supabase = createClient();
    /* `.select()` no update: RLS que recusa escrita devolve ZERO LINHAS, não
       erro. Sem pedir a linha de volta, a tela mostra "Salvo ✓" tendo salvo
       nada — o mesmo padrão que a 0043 documenta e a tela de Contas já
       corrigiu. */
    const { data: alterado, error } = await supabase
      .from("assistente_config")
      // ux-ok: sem tela de servidor lendo isto — carregar() relê logo abaixo
      .update({ ...campos, atualizado_em: new Date().toISOString() })
      .eq("id", 1)
      .select("id");
    if (error) { setErro(error.message); return; }
    if (!alterado?.length) {
      setErro("O banco não alterou nenhuma linha — provavelmente falta permissão para editar esta configuração.");
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2000);
    await carregar();
  }

  const nps = calcularNps(notas);

  return (
    <div className="max-w-[76ch]">
      <h1 className="text-[19px] font-bold tracking-tight">Assistente e NPS</h1>

      {erro && <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}
      {ok && <p className="mt-4 rounded-sm bg-verdewash px-3 py-2 text-[12.5px] text-verde">Salvo ✓</p>}

      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {[
          ["NPS", nps === null ? "—" : String(nps), `${notas.length} resposta${notas.length === 1 ? "" : "s"}`],
          ["Promotores", String(notas.filter((n) => n >= 9).length), "notas 9 e 10"],
          ["Indicações", String(indicacoes), "vindas do NPS"],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded border border-line bg-surface p-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{t}</div>
            <div className="mt-1 text-[20px] font-bold">{v}</div>
            <div className="text-[11.5px] text-muted">{s}</div>
          </div>
        ))}
      </div>

      {cfg && (
        <div className="mt-5 rounded border border-line bg-surface p-5">
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={cfg.ativo}
              onChange={(e) => void gravar({ ativo: e.target.checked })}
            />
            Assistente ligado
          </label>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Desligado, nenhuma chamada de IA acontece e nada é cobrado. Ligar exige a chave da API
            configurada no servidor — sem ela o assistente não responde, mesmo marcado aqui.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Modelo</span>
              <input
                defaultValue={cfg.modelo}
                onBlur={(e) => void gravar({ modelo: e.target.value })}
                className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Teto de chamadas por dia</span>
              <input
                type="number"
                defaultValue={cfg.teto_dia}
                onBlur={(e) => void gravar({ teto_dia: Number(e.target.value) })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted">Assistente sem teto é fatura sem teto.</span>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Persona</span>
            <textarea
              rows={10}
              defaultValue={cfg.persona}
              onBlur={(e) => void gravar({ persona: e.target.value })}
              className="w-full rounded-sm border border-line p-3 font-mono text-[12.5px] leading-relaxed"
            />
            <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
              A instrução de não inventar número nem prazo não é formalidade: um número errado
              daqui vira laudo errado na mão de um cliente.
            </span>
          </label>
        </div>
      )}

      <AgenteVenda />
    </div>
  );
}
