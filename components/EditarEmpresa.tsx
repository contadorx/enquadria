"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moeda } from "@/lib/motor";

/**
 * Edição do que o contador precisa corrigir sem reimportar a carteira:
 * o contato que recebe o termo e a RBT12 que torna a alíquota efetiva.
 */
export function EditarEmpresa({
  empresaId,
  contatoNome,
  contatoEmail,
  contatoTelefone,
  rbt12,
}: {
  empresaId: string;
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  rbt12: number | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(contatoNome ?? "");
  const [email, setEmail] = useState(contatoEmail ?? "");
  const [tel, setTel] = useState(contatoTelefone ?? "");
  const [rbt, setRbt] = useState(rbt12 != null ? String(rbt12) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const faltaContato = !contatoEmail || !contatoNome;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/empresa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          contato_nome: nome,
          contato_email: email,
          contato_telefone: tel,
          rbt12: rbt.replace(/\D/g, "") || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao salvar");
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
      setAberto(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAberto(true)}
          className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
        >
          {faltaContato || rbt12 == null ? "Completar dados" : "Editar dados"}
        </button>
        {salvo && <span className="font-mono text-[11.5px] text-verde">salvo ✓</span>}
        {faltaContato && (
          <span className="text-[11.5px] text-amarelo">
            sem contato, o termo não pode ser enviado em lote
          </span>
        )}
        {!faltaContato && rbt12 == null && (
          <span className="text-[11.5px] text-amarelo">
            sem RBT12, a alíquota do laudo sai estimada
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-sm border border-line bg-surface2 p-3.5">
      {erro && (
        <p className="mb-2.5 rounded-sm bg-vermelhowash px-2.5 py-1.5 text-[12px] text-vermelho">
          {erro}
        </p>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">
            Quem assina o termo
          </label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do sócio ou responsável"
            className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">E-mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="email@empresa.com.br"
            className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">
            Telefone <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="(11) 90000-0000"
            className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-slate2">
            RBT12 (receita dos 12 meses)
          </label>
          <div className="flex items-center rounded-sm border border-line bg-surface px-2.5 focus-within:border-accent">
            <span className="font-mono text-[11px] text-muted">R$</span>
            <input
              value={rbt}
              onChange={(e) => setRbt(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="480000"
              className="w-full bg-transparent px-1.5 py-1.5 font-mono text-[13px] outline-none"
            />
          </div>
          {rbt && (
            <p className="mt-0.5 font-mono text-[10.5px] text-muted">{moeda(Number(rbt))}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-sm bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          {salvando ? "Salvando…" : "Salvar"}
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
