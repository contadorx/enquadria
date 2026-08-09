import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { COLUNAS_ESCRITORIO, mostrarNomeEscrito, type Escritorio } from "@/lib/escritorio";
import { comResponsavel } from "@/lib/escritorio-server";
import { CSS_IMPRESSAO } from "@/lib/impressao";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import {
  montarAnuario,
  aberturaDoAnuario,
  anoCivil,
  emReaisRedondos,
  RESSALVA_ANUARIO,
  type DocumentoDoAno,
  type PontoDoAno,
} from "@/lib/anuario";

export const dynamic = "force-dynamic";

/**
 * O ANUÁRIO DA EMPRESA — a peça de renovação.
 *
 * POR QUE ELE EXISTE. O produto vende a decisão de setembro, mas a assinatura
 * se renova em março, quando não há prazo nenhum na tela. A pergunta do
 * contador nessa hora não é sobre o Enquadria: é "o que eu ponho na mesa do meu
 * cliente para cobrar de novo?". Este é o papel.
 *
 * O QUE ELE PROVA, e é a parte que ninguém escreve: o trabalho INVISÍVEL. Todo
 * mês o monitor cruza as normas publicadas com a carteira; a maior parte dos
 * apontamentos termina em "analisado, não alcança esta empresa". Bem feito,
 * esse trabalho não deixa rastro nenhum — o cliente não recebe e-mail, não
 * assina nada, não vê nada, e conclui que o contador não fez nada. Aqui ele
 * vira linha datada com a norma ao lado.
 *
 * O QUE ELE NÃO FAZ: não projeta, não estima economia e não promete resultado.
 * Só relata o que aconteceu e o que o escritório declarou ter cobrado. Quem
 * assina embaixo é o contador.
 */
export default async function AnuarioDaEmpresa({
  params,
  searchParams,
}: {
  params: { empresa: string };
  searchParams?: { ano?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("profiles")
    .select(`tenant_id, tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const t = await comResponsavel(
    supabase,
    (perfil?.tenants as Escritorio | null) ?? null,
    (perfil?.tenant_id as string | null) ?? null
  );

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj")
    .eq("id", params.empresa)
    .maybeSingle();

  if (!empresa) {
    return (
      <div className="doc">
        <p className="text-[13px] text-muted">Empresa não encontrada nesta carteira.</p>
      </div>
    );
  }

  /* o ano vem da URL para o contador conseguir imprimir o de 2026 em 2027 —
     relatório anual que só sabe falar do ano corrente é inútil em janeiro */
  const anoPedido = Number(searchParams?.ano);
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2026 && anoPedido <= 2033
    ? anoPedido
    : new Date().getUTCFullYear();
  const periodo = anoCivil(ano);

  /**
   * A MIGRATION PODE NÃO TER RODADO. Mesma decisão do dossiê: falha aqui não
   * derruba a página, produz um relatório honesto de zero pontos. Um documento
   * a menos é incômodo; erro 500 na frente do cliente é outra coisa.
   */
  let pontos: PontoDoAno[] = [];
  try {
    const { data } = await supabase
      .from("apontamentos")
      // schema-ok: apontamentos vem da 0063; honorario_centavos e virou_servico_em, da 0066
      .select(
        "id, status, nota, criado_em, tratado_em, virou_servico_em, honorario_centavos, radar_itens(titulo, resumo, o_que_fazer, fonte, severidade, publicado_em, vigencia_em)"
      )
      .eq("empresa_id", empresa.id)
      .limit(500);
    pontos = ((data ?? []) as unknown as (Omit<PontoDoAno, "materia"> & {
      radar_itens: PontoDoAno["materia"];
    })[]).map((p) => ({ ...p, materia: p.radar_itens }));
  } catch {
    /* sem a tabela, o anuário mostra só os documentos do período */
  }

  /* os documentos do ano entram porque são a prova material do serviço: o
     apontamento diz o que foi feito, o laudo e o termo mostram o que foi
     entregue e assinado */
  const { data: analises } = await supabase
    .from("analises")
    .select("id")
    .eq("empresa_id", empresa.id);
  const ids = (analises ?? []).map((a) => a.id);

  const { data: laudos } = ids.length
    ? await supabase.from("laudos").select("numero, emitido_em").in("analise_id", ids)
    : { data: [] as { numero: number; emitido_em: string }[] };
  const { data: termos } = ids.length
    ? await supabase
        .from("termos")
        .select("criado_em, assinado_em, assinatura_status")
        .in("analise_id", ids)
    : { data: [] as { criado_em: string; assinado_em: string | null; assinatura_status: string | null }[] };

  const documentos: DocumentoDoAno[] = [
    ...(laudos ?? []).map((l) => ({
      tipo: "laudo" as const,
      numero: l.numero,
      em: l.emitido_em,
    })),
    ...(termos ?? []).map((x) => ({
      tipo: "termo" as const,
      numero: null,
      em: x.assinado_em ?? x.criado_em,
      assinado: x.assinatura_status === "assinado" || !!x.assinado_em,
    })),
  ];

  const a = montarAnuario(pontos, documentos, periodo);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const dataBR = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/painel/empresa/${empresa.id}`} className="text-sm text-accentdeep">
          ← voltar para a empresa
        </Link>
        <BotaoImprimir rotulo="Salvar em PDF / imprimir" />
      </div>

      <div className="sheet">
        <div className="brand">
          <div className="firmwrap">
            {t?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo_url} alt="" className="logo" />
            )}
            <div>
              {mostrarNomeEscrito(t) && <div className="firm">{t?.nome ?? "Escritório"}</div>}
              {t?.crc && <div className="crc">{t.crc}</div>}
            </div>
          </div>
          <div className="wm">
            ACOMPANHAMENTO DA REFORMA
            <br />
            {periodo.rotulo} · emitido em {hoje}
          </div>
        </div>

        <h1>O que a Reforma exigiu da sua empresa em {periodo.rotulo}</h1>
        <div className="meta">
          {empresa.razao_social} · {formatarCnpj(empresa.cnpj)}
        </div>

        <p className="lead">{aberturaDoAnuario(a, empresa.razao_social)}</p>

        <div className="sec">O ano em números</div>
        <div className="grade">
          <div className="cel">
            <div className="rot">normas que alcançaram a empresa</div>
            <div className="n">{a.pontos}</div>
          </div>
          <div className="cel">
            <div className="rot">analisadas sem exigir providência</div>
            <div className="n">{a.descartados}</div>
          </div>
          <div className="cel">
            <div className="rot">serviços prestados</div>
            <div className="n">{a.servicos}</div>
          </div>
          <div className="cel">
            <div className="rot">honorários informados no período</div>
            <div className="n">{emReaisRedondos(a.honorario_centavos)}</div>
          </div>
        </div>

        {/* HONESTIDADE DO NÚMERO. Um total que ignora os serviços sem valor
            informado seria um total errado apresentado como certo — e este
            papel vai para a mesa do cliente. */}
        {a.servicos_sem_valor > 0 && (
          <p className="aviso">
            {a.servicos_sem_valor}{" "}
            {a.servicos_sem_valor === 1
              ? "serviço foi registrado sem valor informado e não entra"
              : "serviços foram registrados sem valor informado e não entram"}{" "}
            no total acima.
          </p>
        )}

        {a.linhas.length > 0 && (
          <>
            <div className="sec">O que aconteceu, na ordem</div>
            <table className="linhas">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Norma</th>
                  <th>O que foi feito</th>
                  <th className="r">Honorário</th>
                </tr>
              </thead>
              <tbody>
                {a.linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="mono">{dataBR(l.quando)}</td>
                    <td>
                      <b>{l.titulo}</b>
                      {l.fonte && <div className="fonte">{l.fonte}</div>}
                    </td>
                    <td>
                      {l.desfecho}
                      {l.detalhe && <div className="detalhe">{l.detalhe}</div>}
                    </td>
                    <td className="r mono">
                      {l.honorario_centavos != null
                        ? emReaisRedondos(l.honorario_centavos)
                        : l.cobravel
                          ? "—"
                          : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {a.documentos.length > 0 && (
          <>
            <div className="sec">Documentos emitidos no período</div>
            <table className="tbl">
              <tbody>
                {a.documentos.map((d, i) => (
                  <tr key={i}>
                    <td>
                      {d.tipo === "laudo"
                        ? `Laudo nº ${String(d.numero ?? 0).padStart(4, "0")}`
                        : d.assinado
                          ? "Termo de ciência assinado"
                          : "Termo de ciência emitido"}
                    </td>
                    <td className="n mono">{dataBR(d.em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="verif">
              Os laudos listados podem ser conferidos por qualquer pessoa em{" "}
              <b>enquadria.com.br/verificar</b>, com o número do documento e o CNPJ da empresa.
            </p>
          </>
        )}

        {/* O ACOMPANHAMENTO CONTINUA — a frase que transforma um retrospecto em
            argumento de renovação. Sem ela, o documento fecha o ano e fecha a
            conversa junto. A transição vai até 2033 e é fato, não promessa. */}
        <div className="sec">O que vem em {ano + 1}</div>
        <p className="txt">
          A transição para IBS e CBS segue em etapas até 2033, com mudanças de alíquota e de
          obrigação a cada exercício. O acompanhamento desta empresa continua: cada norma
          publicada é cruzada com o cadastro e a atividade dela, e o que exigir providência
          entra na mesma lista acima.
        </p>

        <div className="foot">{RESSALVA_ANUARIO}</div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .doc { max-width: 820px; margin: 0 auto; padding: 24px; }
        .sheet { background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 44px 46px; color: #334155; font-size: 12.5px; line-height: 1.6; }
        .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B1220; padding-bottom: 12px; margin-bottom: 22px; }
        .firmwrap { display: flex; align-items: center; gap: 12px; }
        .logo { max-height: 40px; max-width: 140px; object-fit: contain; }
        .firm { font-weight: 800; font-size: 17px; color: #0F172A; letter-spacing: -.01em; }
        .crc { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; }
        .wm { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #94A3B8; text-align: right; letter-spacing: .08em; line-height: 1.5; }
        h1 { font-size: 19px; color: #0F172A; letter-spacing: -.02em; margin: 0 0 4px; }
        .meta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #64748B; margin-bottom: 16px; }
        .lead { font-size: 13.5px; line-height: 1.65; color: #0F172A; margin: 0 0 4px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 22px 0 8px; border-bottom: 1px solid #EEF2F7; padding-bottom: 3px; }
        .txt { margin: 0 0 8px; }
        .grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #EEF2F7; border: 1px solid #EEF2F7; border-radius: 6px; overflow: hidden; }
        .cel { background: #fff; padding: 11px 12px; }
        .rot { font-family: 'IBM Plex Mono', monospace; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: #64748B; line-height: 1.4; }
        .cel .n { font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 600; color: #0F172A; margin-top: 4px; }
        .aviso { font-size: 11px; color: #B45309; margin: 7px 0 0; }
        table { width: 100%; border-collapse: collapse; }
        .linhas th { text-align: left; font-family: 'IBM Plex Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #64748B; border-bottom: 1px solid #CBD5E1; padding: 3px 8px 4px 0; font-weight: 500; }
        .linhas td { border-bottom: 1px solid #EEF2F7; padding: 8px 8px 8px 0; vertical-align: top; }
        .linhas .r, .tbl .n { text-align: right; }
        .mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        .fonte { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #94A3B8; margin-top: 2px; }
        .detalhe { font-size: 11.5px; color: #64748B; margin-top: 3px; }
        .tbl td { padding: 7px 0; border-bottom: 1px solid #EEF2F7; }
        .verif { font-size: 11px; color: #64748B; margin-top: 8px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        @media print { .grade { break-inside: avoid; } .linhas tr { break-inside: avoid; } }
        ${CSS_IMPRESSAO}
      ` }} />
    </div>
  );
}
