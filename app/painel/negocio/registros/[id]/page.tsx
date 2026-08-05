import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { formatarCnpj } from "@/lib/cnpj";
import { moeda, pct, SAIDAS, type Saida } from "@/lib/motor";
import { derivaDe, type AnaliseCrua } from "@/lib/deriva";

/**
 * A CONTA DO CLIENTE, VISTA DE FORA — e a palavra "vista" é o desenho inteiro.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO É IMPERSONAÇÃO DE VERDADE.
 *
 * "Entrar na conta" costuma significar emitir uma sessão em nome do usuário:
 * `auth.uid()` passa a ser o dele, a RLS abre, e a partir daí tudo o que o
 * suporte faz é indistinguível do que o cliente fez. Isso resolve um problema
 * de suporte criando três piores — o poder passa a valer para ESCRITA, o
 * rastro some, e um erro de quem está ajudando vira ação do cliente no banco.
 *
 * Aqui o dono da plataforma LÊ, por uma função que confere `e_plataforma()` no
 * servidor, e a leitura fica registrada antes de acontecer. É menos poder do
 * que "virar o usuário", e é a quantidade certa de poder para responder à
 * pergunta que motiva o acesso: o que exatamente tem nessa conta.
 *
 * Se um dia for preciso ESCREVER em nome do cliente, que seja uma ação
 * nomeada, com o efeito descrito e registrada — nunca uma sessão emprestada.
 */
export const dynamic = "force-dynamic";

const data = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

interface Conta {
  tenant: { id: string; nome: string; criado_em: string; crc: string | null; status: string | null; is_teste: boolean } | null;
  usuarios: { id: string; email: string; nome: string | null; role: string | null; is_superadmin: boolean; criado_em: string }[];
  empresas: { id: string; razao_social: string; cnpj: string; anexo: number | null; faixa: string | null; rbt12: number | null; analises: number }[];
  analises: (AnaliseCrua & { empresa: string | null })[];
  laudos: { id: string; numero: number; emitido_em: string; analise_id: string }[];
}

export default async function ContaDoCliente({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: bruto, error } = await supabase.rpc("plataforma_conta", { p_tenant: params.id });

  if (error) {
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">Não consegui abrir a conta</p>
        <p className="mt-2 text-[13px]">{error.message}</p>
        <p className="mt-2 text-[12.5px] text-muted">
          Se falar em função que não existe, falta rodar a migration
          <b> 0048_ver_a_conta_do_cliente.sql</b>.
        </p>
      </div>
    );
  }

  const c = (bruto as unknown as Conta) ?? null;
  if (!c?.tenant) {
    return <div className="rounded border border-line bg-surface p-5 text-[13px]">Conta não encontrada.</div>;
  }

  const laudoDe = new Map(c.laudos.map((l) => [l.analise_id, l]));

  return (
    <div>
      <Link href="/painel/negocio/registros" className="text-[12.5px] text-accentdeep hover:underline">
        ← Registros
      </Link>

      <h1 className="mt-2 text-[19px] font-bold tracking-tight">
        {c.tenant.nome}
        {c.tenant.is_teste && (
          <span className="ml-2 rounded-full bg-surface2 px-2 py-0.5 align-middle text-[11px] font-normal text-muted">
            conta de teste
          </span>
        )}
      </h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {c.tenant.crc ? `${c.tenant.crc} · ` : ""}conta desde {data(c.tenant.criado_em)}
        {c.tenant.status ? ` · ${c.tenant.status}` : ""}
      </p>

      {/**
        * O AVISO FICA NO TOPO E NÃO NO RODAPÉ, porque ele muda o que a pessoa
        * faz nos próximos trinta segundos — e um aviso que aparece depois da
        * ação é decoração.
        */}
      <p className="mt-3 rounded-sm border border-line bg-surface2 px-3 py-2 text-[12px] leading-relaxed text-muted">
        Esta abertura foi <b>registrada</b> com data, seu e-mail e o escritório. É leitura: nada
        aqui escreve na conta do cliente, e o sistema não assumiu a identidade de ninguém.
      </p>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Usuários", String(c.usuarios.length)],
          ["Empresas", String(c.empresas.length)],
          ["Análises", String(c.analises.length)],
          ["Laudos", String(c.laudos.length)],
        ].map(([t, v]) => (
          <div key={t} className="rounded border border-line bg-surface p-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{t}</div>
            <div className="mt-1 text-[20px] font-bold">{v}</div>
          </div>
        ))}
      </div>

      {/* ───────────────────────────────────────────────────── usuários */}
      <div className="mt-5 overflow-x-auto rounded border border-line bg-surface">
        <div className="border-b border-line px-3 py-2.5 text-[12.5px] font-bold">Quem tem acesso</div>
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            {c.usuarios.map((u) => (
              <tr key={u.id} className="border-b border-linesoft last:border-0">
                <td className="px-3 py-2">{u.nome ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[11.5px]">{u.email}</td>
                <td className="px-3 py-2 text-[11.5px] text-muted">{u.role ?? "—"}</td>
                <td className="px-3 py-2 text-[11.5px] text-muted">desde {data(u.criado_em)}</td>
              </tr>
            ))}
            {!c.usuarios.length && (
              <tr><td className="px-3 py-6 text-center text-muted">Nenhum usuário.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ───────────────────────────────────── análises, com a deriva por linha */}
      <div className="mt-5 overflow-x-auto rounded border border-line bg-surface">
        <div className="border-b border-line px-3 py-2.5 text-[12.5px] font-bold">
          As análises desta conta
          <span className="ml-2 font-normal text-muted">
            a coluna “hoje daria” recalcula com o motor atual, sem gravar nada
          </span>
        </div>
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Empresa</th>
              <th className="px-3 py-2.5 font-semibold">Calculada</th>
              <th className="px-3 py-2.5 font-semibold">Saída gravada</th>
              <th className="px-3 py-2.5 font-semibold">Hoje daria</th>
              <th className="px-3 py-2.5 font-semibold">re</th>
              <th className="px-3 py-2.5 font-semibold">fc</th>
              <th className="px-3 py-2.5 font-semibold">Laudo</th>
            </tr>
          </thead>
          <tbody>
            {c.analises.map((a) => {
              const l = laudoDe.get(a.id);
              const d = derivaDe({
                ...a,
                tenant_nome: c.tenant?.nome ?? null,
                empresa_nome: a.empresa ?? null,
                tem_laudo: !!l,
                laudo_numero: l?.numero ?? null,
                laudo_emitido_em: l?.emitido_em ?? null,
                termo_assinado: false,
              });
              return (
                <tr key={a.id} className={`border-b border-linesoft ${d.muda ? "bg-amarelowash" : ""}`}>
                  <td className="px-3 py-2.5">{a.empresa ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[11.5px] text-muted">{data(a.calculado_em)}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-bold">{a.saida}</span>
                    <div className="text-[10.5px] text-muted">
                      {a.saida ? SAIDAS[a.saida as Saida]?.titulo : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    {d.sem_base ? (
                      <span className="text-[11px] font-normal text-muted">{d.sem_base}</span>
                    ) : d.muda ? (
                      <b>{d.recalculada}</b>
                    ) : (
                      <span className="text-muted">igual</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px]">
                    {a.re != null ? pct(Number(a.re)) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px]">
                    {a.fc != null ? pct(Number(a.fc)) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px]">
                    {l ? (
                      <Link href={`/doc/laudo/${l.id}`} className="text-accentdeep hover:underline">
                        nº {String(l.numero).padStart(4, "0")}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!c.analises.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Nenhuma análise.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ───────────────────────────────────────────────────── empresas */}
      <div className="mt-5 overflow-x-auto rounded border border-line bg-surface">
        <div className="border-b border-line px-3 py-2.5 text-[12.5px] font-bold">A carteira</div>
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Empresa</th>
              <th className="px-3 py-2.5 font-semibold">CNPJ</th>
              <th className="px-3 py-2.5 font-semibold">Anexo</th>
              <th className="px-3 py-2.5 font-semibold">Triagem</th>
              <th className="px-3 py-2.5 font-semibold">RBT12</th>
              <th className="px-3 py-2.5 font-semibold">Análises</th>
            </tr>
          </thead>
          <tbody>
            {c.empresas.map((e) => (
              <tr key={e.id} className="border-b border-linesoft">
                <td className="px-3 py-2.5">{e.razao_social}</td>
                <td className="px-3 py-2.5 font-mono text-[11.5px]">
                  {e.cnpj ? formatarCnpj(e.cnpj) : "—"}
                </td>
                <td className="px-3 py-2.5 font-mono">{e.anexo ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono">{e.faixa ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono text-[11.5px]">
                  {e.rbt12 != null ? moeda(Number(e.rbt12)) : "—"}
                </td>
                <td className="px-3 py-2.5 font-mono">{e.analises}</td>
              </tr>
            ))}
            {!c.empresas.length && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">Nenhuma empresa.</td></tr>
            )}
          </tbody>
        </table>
        {c.empresas.length >= 300 && (
          <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted">
            Lista limitada às 300 mais recentes. O número do topo é o total real.
          </p>
        )}
      </div>
    </div>
  );
}
