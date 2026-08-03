"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Abre a próxima janela sem apagar a anterior.
 *
 * A opção vale por semestre: quando o período seguinte for publicado, o
 * contador cria a rodada nova aqui e a carteira é recalculada partindo das
 * respostas já dadas. As decisões e os laudos anteriores continuam intactos.
 */
export function NovaRodada({ totalAnalises }: { totalAnalises: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [abre, setAbre] = useState("");
  const [fecha, setFecha] = useState("");
  const [exercicio, setExercicio] = useState("2027");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ criadas: number; ja_existiam: number } | null>(null);

  async function criar() {
    if (!codigo.trim() || !nome.trim()) {
      setErro("Informe o código e o nome da janela.");
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/janela", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          janela_codigo: codigo.trim().toLowerCase().replace(/\s+/g, "-"),
          nome: nome.trim(),
          abre: abre || null,
          fecha: fecha || null,
          exercicio: Number(exercicio) || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao abrir a rodada");
      setFeito({ criadas: json.criadas, ja_existiam: json.ja_existiam });
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setOcupado(false);
    }
  }

  if (feito) {
    return (
      <div className="mt-5 rounded border border-verde bg-verdewash px-4 py-3.5">
        <div className="text-[13.5px] font-semibold text-verde">
          ✓ {feito.criadas} análises criadas na nova janela
        </div>
        <p className="mt-1 text-[12.5px] text-slate2">
          As decisões e os laudos da janela anterior continuam preservados no dossiê de cada
          empresa. Revise a carteira e emita os novos documentos quando estiver pronto.
        </p>
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-surface px-4 py-3.5">
        <p className="max-w-[62ch] text-[13px] text-slate2">
          <b className="text-ink">Quando a próxima janela for publicada</b>, abra uma nova rodada:
          a carteira é recalculada partindo das respostas já dadas, e o histórico desta janela fica
          preservado.
        </p>
        <button
          onClick={() => setAberto(true)}
          title={
            totalAnalises === 0
              ? "Ainda não há análise nenhuma para recalcular — analise ao menos uma empresa"
              : undefined
          }
          disabled={totalAnalises === 0}
          className="whitespace-nowrap rounded-sm border border-accentdeep px-3.5 py-2 text-[13px] font-semibold text-accentdeep disabled:opacity-40"
        >
          Abrir nova rodada
        </button>
        {totalAnalises === 0 && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Nada a recalcular ainda: uma nova rodada parte das análises já feitas, e não há
            nenhuma nesta carteira.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded border border-line bg-surface p-4">
      <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
        Nova rodada de decisão
      </div>
      {erro && (
        <p className="mb-2.5 rounded-sm bg-vermelhowash px-2.5 py-1.5 text-[12px] text-vermelho">
          {erro}
        </p>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">Código</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="mar-2027"
            className="w-full rounded-sm border border-line px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div className="sm:col-span-1 lg:col-span-2">
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Janela do 2º semestre de 2027"
            className="w-full rounded-sm border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">Abre em</label>
          <input
            type="date"
            value={abre}
            onChange={(e) => setAbre(e.target.value)}
            className="w-full rounded-sm border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">Fecha em</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-sm border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">Exercício</label>
          <input
            value={exercicio}
            onChange={(e) => setExercicio(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-sm border border-line px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
          />
        </div>
      </div>
      <p className="mt-2.5 text-[11.5px] text-muted">
        Use as datas oficiais quando a norma da próxima janela for publicada. Enquanto isso, o
        Enquadria não inventa prazos.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          // ux-ok: ao concluir, `feito` substitui o componente inteiro pelo
          // cartão verde de sucesso — a tela toda muda, não um trecho distante
          onClick={criar}
          disabled={ocupado}
          className="rounded-sm bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          {ocupado ? "Criando…" : `Criar rodada e recalcular ${totalAnalises} empresas`}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-sm border border-line px-3.5 py-2 text-[12.5px] font-semibold text-slate2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
