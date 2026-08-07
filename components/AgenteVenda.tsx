"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { resumirAgente, type LinhaAgente } from "@/lib/venda";

/**
 * O AGENTE DA PÁGINA PÚBLICA, visto de dentro.
 *
 * Duas coisas moram aqui, e a segunda é a que interessa:
 *
 *  1. O INTERRUPTOR. Ele nasce desligado. Um agente que fala com desconhecido
 *     na internet precisa ser desligável em segundos, sem deploy.
 *
 *  2. A PAUTA. Toda pergunta que caiu em "não sei" é uma resposta que ainda
 *     não existe — e a mesma pergunta volta amanhã, com outra pessoa, que
 *     também vai embora. Esta lista é o que transforma o balão em produto que
 *     melhora sozinho: escreveu a resposta no roteiro, ela nunca mais falha.
 *
 * Por isso a tela mostra a taxa do ROTEIRO (o que sai pronto, de graça e sem
 * variação) em vez de "conversas atendidas": a métrica que se quer subir é a
 * de perguntas que já têm resposta escrita.
 */

interface Cfg {
  ativo: boolean;
  modelo: string;
  persona: string;
  teto_dia: number;
}

const DIAS = 30;

export function AgenteVenda() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [linhas, setLinhas] = useState<LinhaAgente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    setCarregando(true);
    const { data, error } = await supabase
      .from("venda_config")
      .select("ativo, modelo, persona, teto_dia")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      setErro(
        /venda_config/i.test(error.message)
          ? "A migration 0058 ainda não foi rodada neste banco — o balão do site responde pelo roteiro, mas nada é registrado aqui."
          : error.message
      );
      setCarregando(false);
      return;
    }
    setCfg(data as unknown as Cfg);

    const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { data: msgs, error: eM } = await supabase
      .from("venda_mensagens")
      .select("pergunta, fonte, chave, email, criado_em, sessao")
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(500);
    // erro de leitura e "ninguém perguntou ainda" são visualmente idênticos —
    // e as duas situações pedem ações opostas
    if (eM) setErro(`Não consegui ler as conversas: ${eM.message}`);
    setLinhas((msgs ?? []) as unknown as LinhaAgente[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gravar(campos: Record<string, unknown>) {
    setErro(null);
    const supabase = createClient();
    /* `.select()` no update: RLS que recusa escrita devolve ZERO LINHAS e não
       erro — sem pedir a linha de volta, a tela diz "Salvo ✓" tendo salvo nada */
    const { data: alterado, error } = await supabase
      .from("venda_config")
      // ux-ok: carregar() relê do banco logo abaixo; não há tela de servidor aqui
      .update({ ...campos, atualizado_em: new Date().toISOString() })
      .eq("id", 1)
      .select("id");
    if (error) {
      setErro(error.message);
      return;
    }
    if (!alterado?.length) {
      setErro("O banco não alterou nenhuma linha — provavelmente falta permissão para editar esta configuração.");
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2000);
    await carregar();
  }

  const r = resumirAgente(linhas);

  return (
    <div className="mt-8">
      <h2 className="text-[16px] font-bold tracking-tight">Agente da página pública</h2>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
        O balão que responde em enquadria.com.br, antes de existir conta. Ele responde primeiro pelo
        roteiro escrito (grátis, instantâneo, sempre igual); a IA só entra no que sobra, e o que ela
        também não souber pede o e-mail e vira a lista aqui embaixo.
      </p>

      {erro && <p className="mt-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}
      {ok && <p className="mt-3 rounded-sm bg-verdewash px-3 py-2 text-[12.5px] text-verde">Salvo ✓</p>}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-4">
        {[
          ["Conversas", carregando ? "…" : String(r.conversas), `últimos ${DIAS} dias`],
          ["Perguntas", carregando ? "…" : String(r.total), "mensagens recebidas"],
          [
            "Resposta pronta",
            carregando ? "…" : r.taxaRoteiro === null ? "—" : `${r.taxaRoteiro}%`,
            "saíram do roteiro",
          ],
          ["E-mails deixados", carregando ? "…" : String(r.emails.length), "no meio da conversa"],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded border border-line bg-surface p-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{t}</div>
            <div className="mt-1 text-[20px] font-bold">{v}</div>
            <div className="text-[11.5px] text-muted">{s}</div>
          </div>
        ))}
      </div>

      {cfg && (
        <div className="mt-4 rounded border border-line bg-surface p-5">
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input type="checkbox" checked={cfg.ativo} onChange={(e) => void gravar({ ativo: e.target.checked })} />
            IA ligada no balão do site
          </label>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Desligada, o balão continua funcionando pelo roteiro — e o que ele não souber pede o
            e-mail em vez de chamar a IA. Ligar custa dinheiro por pergunta de desconhecido: o teto
            diário abaixo é o freio.
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
              <span className="mt-1 block text-[11px] text-muted">
                Página pública é endereço aberto. Estourado o teto, a pergunta vira captura de e-mail
                — nunca erro na tela de quem perguntou.
              </span>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Persona</span>
            <textarea
              rows={8}
              defaultValue={cfg.persona}
              onBlur={(e) => void gravar({ persona: e.target.value })}
              className="w-full rounded-sm border border-line p-3 font-mono text-[12.5px] leading-relaxed"
            />
            <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
              Duas instruções não podem sair daqui: não decidir caso concreto (isso é laudo, com
              premissa e data) e não citar marca de terceiro. As duas também estão travadas no
              código — a persona é o cinto, o código é o suspensório.
            </span>
          </label>
        </div>
      )}

      {/* A PAUTA — o motivo desta tela existir */}
      <div className="mt-4 rounded border border-line bg-surface p-5">
        <h3 className="text-[13.5px] font-bold">O que ele não soube responder</h3>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
          Cada linha é uma resposta que falta escrever. Escrita uma vez no roteiro, ela passa a sair
          na hora, de graça, para todo mundo — e some desta lista. A ordem é por repetição: a
          pergunta que voltou três vezes vale mais que a inédita.
        </p>

        {carregando ? (
          <p className="mt-3 text-[12.5px] text-muted">Lendo as conversas…</p>
        ) : r.pauta.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">
            Nada pendente {r.total === 0 ? "— ninguém perguntou nada ainda." : "— o roteiro deu conta de tudo."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linesoft">
            {r.pauta.slice(0, 40).map((p) => (
              <li key={p.pergunta} className="flex items-start justify-between gap-3 py-2">
                <span className="text-[13px] leading-snug">{p.pergunta}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-muted">
                  {p.vezes > 1 ? `${p.vezes}×` : ""} {p.ultima.slice(0, 10).split("-").reverse().join("/")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {r.emails.length > 0 && (
          <div className="mt-4 border-t border-linesoft pt-3">
            <h4 className="text-[12.5px] font-bold">E-mails deixados no balão</h4>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Já entram na captura como origem <code>agente-site</code>. Estes pediram resposta sua.
            </p>
            <p className="mt-2 break-words font-mono text-[11.5px]">{r.emails.join(" · ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
