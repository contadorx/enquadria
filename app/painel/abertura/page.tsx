import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { EstudoDeAbertura } from "@/components/EstudoDeAbertura";
import { faseDaJanela } from "@/lib/janela";
import { Abas } from "@/components/Abas";
import { ABAS_ESTUDOS } from "@/lib/nav";

/**
 * ABERTURA DE EMPRESA — a pergunta que não fecha em 30 de setembro.
 *
 * Esta tela existe por um motivo de negócio, não de funcionalidade: em 01/10 a
 * janela de opção fecha e leva junto a razão que trouxe o contador para cá. Um
 * produto de um evento só é uma assinatura que não renova.
 *
 * "Em que regime esta empresa deve nascer?" chega ao escritório o ano inteiro,
 * quase sempre de quem ainda NÃO é cliente — e é por isso que o estudo é a
 * peça comercial mais valiosa do produto: ele não serve a carteira, ele
 * aumenta a carteira.
 */

export const dynamic = "force-dynamic";

export default async function Abertura() {
  const supabase = createClient();

  const { data: feitos } = await supabase
    .from("aberturas")
    .select("id, numero, nome_negocio, responsavel, emitido_em, token")
    .order("emitido_em", { ascending: false })
    .limit(20);

  const lista = feitos ?? [];
  /* depois que a janela fecha, a chamada da tela muda: o serviço deixa de ser
     "além da decisão" e passa a ser o carro-chefe */
  const posJanela = faseDaJanela().fase !== "antes" && faseDaJanela().fase !== "aberta";

  return (
    <div>
      <Abas itens={ABAS_ESTUDOS} />
      <h1 className="text-[19px] font-bold tracking-tight">Estudo de abertura</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Em que regime um negócio novo deve nascer — com três cenários de faturamento, porque quem
        está abrindo tem projeção, não histórico. {posJanela
          ? "Com a janela de setembro fechada, é este o serviço que mantém o escritório vendendo o ano inteiro."
          : "Serve para o prospecto que aparece perguntando “vale a pena abrir?” — e é o estudo que ganha o cliente."}
      </p>

      <div className="mt-5">
        <EstudoDeAbertura />
      </div>

      {lista.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-[15px] font-bold">
            Estudos emitidos <span className="font-normal text-muted">({lista.length})</span>
          </div>
          <div className="divide-y divide-linesoft overflow-hidden rounded border border-line bg-surface">
            {lista.map((a) => (
              <Link
                key={a.id as string}
                href={`/doc/abertura/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface2"
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">
                    nº {String(a.numero as number).padStart(4, "0")} · {a.nome_negocio as string}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted">
                    {a.responsavel ? `${a.responsavel as string} · ` : ""}
                    {new Date(a.emitido_em as string).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span aria-hidden className="shrink-0 text-muted">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
