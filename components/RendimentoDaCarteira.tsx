import { createClient } from "@/lib/supabase-server";
import {
  montarAnuario,
  resumirCarteira,
  anoCivil,
  emReaisRedondos,
  type PontoDoAno,
} from "@/lib/anuario";

/**
 * QUANTO A CARTEIRA RENDEU DE REVISÃO NO ANO.
 *
 * Esta é literalmente a pergunta que o comentário de ApontamentosEmpresa.tsx
 * dizia que ninguém conseguia responder: "sem registrar isso ninguém sabe
 * quanto a carteira rendeu de revisão no ano". Estava certo — `virou_servico`
 * era só um rótulo, sem valor e sem data, e nenhuma tela somava nada.
 *
 * O número é do contador, não nosso: soma só o que ele declarou ter cobrado.
 * O produto não fatura por aqui, não estima e não promete receita — e por isso
 * a contagem de serviços sem valor aparece ao lado, em vez de ser escondida
 * num total que pareceria completo.
 *
 * Server component: uma consulta a mais numa tela que já é dinâmica, contra
 * mandar a carteira inteira para o navegador só para somar.
 */
export async function RendimentoDaCarteira({ ano }: { ano?: number }) {
  const supabase = createClient();
  const periodo = anoCivil(ano ?? new Date().getUTCFullYear());

  let linhas: (PontoDoAno & { empresa_id: string })[] = [];
  let nomes = new Map<string, string>();
  try {
    const { data } = await supabase
      .from("apontamentos")
      // schema-ok: apontamentos vem da 0063; honorario_centavos e virou_servico_em, da 0066
      .select(
        "id, empresa_id, status, nota, criado_em, tratado_em, virou_servico_em, honorario_centavos"
      )
      .limit(4000);
    linhas = ((data ?? []) as unknown as (PontoDoAno & { empresa_id: string })[]).map((p) => ({
      ...p,
      materia: null,
    }));

    const ids = Array.from(new Set(linhas.map((l) => l.empresa_id)));
    if (ids.length) {
      const { data: emps } = await supabase
        .from("empresas")
        .select("id, razao_social")
        .in("id", ids);
      nomes = new Map((emps ?? []).map((e) => [e.id as string, e.razao_social as string]));
    }
  } catch {
    /* migration não aplicada: o bloco simplesmente não aparece */
    return null;
  }

  if (linhas.length === 0) return null;

  const porEmpresa = new Map<string, (PontoDoAno & { empresa_id: string })[]>();
  for (const l of linhas) {
    const atual = porEmpresa.get(l.empresa_id);
    if (atual) atual.push(l);
    else porEmpresa.set(l.empresa_id, [l]);
  }

  const resumo = resumirCarteira(
    Array.from(porEmpresa.entries()).map(([empresa_id, pontos]) => ({
      empresa_id,
      nome: nomes.get(empresa_id) ?? "empresa da carteira",
      anuario: montarAnuario(pontos, [], periodo),
    })),
    periodo
  );

  if (resumo.pontos === 0) return null;

  return (
    <div className="mb-5 rounded border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-bold text-ink">
          O que a Reforma rendeu em {periodo.rotulo}
        </h2>
        <span className="font-mono text-[10.5px] text-muted">
          o valor é o que você informou ao registrar cada serviço
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { rot: "clientes alcançados por alguma norma", n: String(resumo.empresas_tocadas) },
          { rot: "analisados sem exigir providência", n: String(resumo.descartados) },
          { rot: "serviços prestados", n: String(resumo.servicos) },
          { rot: "honorários informados", n: emReaisRedondos(resumo.honorario_centavos) },
        ].map((c) => (
          <div key={c.rot} className="rounded-sm border border-linesoft bg-surface2 p-3">
            <div className="font-mono text-[9px] uppercase leading-tight tracking-[0.12em] text-muted">
              {c.rot}
            </div>
            <div className="mt-1 font-mono text-[18px] font-semibold text-ink">{c.n}</div>
          </div>
        ))}
      </div>

      {/* um total que ignora os serviços sem valor seria um total errado
          apresentado como certo — e este número vira conversa de honorário */}
      {resumo.servicos_sem_valor > 0 && (
        <p className="mt-2 text-[11.5px] text-amarelo">
          {resumo.servicos_sem_valor}{" "}
          {resumo.servicos_sem_valor === 1
            ? "serviço foi registrado sem valor e não entra"
            : "serviços foram registrados sem valor e não entram"}{" "}
          no total.
        </p>
      )}

      {resumo.destaques.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            onde o trabalho se concentrou
          </div>
          <ul className="mt-1.5 space-y-1">
            {resumo.destaques.slice(0, 5).map((d) => (
              <li key={d.empresa_id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <a
                  href={`/doc/anuario/${d.empresa_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-semibold text-accentdeep"
                >
                  {d.nome}
                </a>
                <span className="shrink-0 font-mono text-[11.5px] text-muted">
                  {d.pontos} {d.pontos === 1 ? "norma" : "normas"}
                  {d.honorario_centavos > 0 && ` · ${emReaisRedondos(d.honorario_centavos)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-muted">
            O nome abre o relatório do ano daquele cliente, com a sua marca — é a peça de
            renovação de honorário.
          </p>
        </div>
      )}
    </div>
  );
}
