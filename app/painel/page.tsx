import { createClient } from "@/lib/supabase-server";
import { Cockpit, type Aviso } from "@/components/Cockpit";
import { contarEsteira, montarFila, type AnaliseCru, type EmpresaCru, type Linha } from "@/lib/cockpit";
import { estadoDaJanela, faseDaJanela } from "@/lib/janela";
import { decidir, PARAMETROS_2027, type Respostas } from "@/lib/motor";
import { atingidas, ordenar, type EmpresaRadar, type ItemRadar } from "@/lib/radar";

/**
 * O COCKPIT — a única tela de trabalho do contador.
 *
 * Aqui só se BUSCA e se CALCULA; a interação inteira vive no componente de
 * cliente. Os avisos são montados neste servidor de propósito: eles nascem de
 * cruzamentos (radar × carteira, análise × parâmetros vigentes) que exigiriam
 * mandar a carteira inteira com respostas e parâmetros para o navegador.
 *
 * Regra do aviso, herdada do digest: aviso que não vira item de fila não entra.
 */

export const dynamic = "force-dynamic";

/** marcos da transição que atingem clientes desta carteira */
async function avisosDoRadar(
  supabase: ReturnType<typeof createClient>,
  linhas: Linha[],
  empresasRadar: EmpresaRadar[]
): Promise<Aviso[]> {
  const { data: itens, error } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true);
  // a tabela só existe a partir da migration 0011; sem ela o cockpit segue inteiro
  if (error || !itens?.length) return [];

  const { data: leituras } = await supabase.from("radar_leituras").select("item_id");
  const lidos = new Set((leituras ?? []).map((l) => l.item_id));

  const hoje = new Date().toISOString().slice(0, 10);
  const avisos: Aviso[] = [];
  for (const item of ordenar(itens as unknown as ItemRadar[], hoje)) {
    const alvo = atingidas(item, empresasRadar);
    if (alvo.length === 0) continue; // notícia sem cliente atingido é ruído
    if (lidos.has(item.id) && avisos.length >= 1) continue; // já lido não repete no topo
    avisos.push({
      id: item.id,
      tipo: "radar",
      titulo: `${alvo.length} ${alvo.length === 1 ? "cliente seu é atingido" : "clientes seus são atingidos"} por: ${item.titulo}`,
      detalhe: item.resumo,
      o_que_fazer: item.o_que_fazer,
      fonte: item.fonte,
      empresas: alvo.map((e) => e.id),
      nao_lido: !lidos.has(item.id),
    });
    if (avisos.length >= 3) break; // o topo da fila não é um feed de notícias
  }
  void linhas;
  return avisos;
}

export default async function Painel() {
  const supabase = createClient();

  // o escritório identificado é o passo 1 da trilha — e o que vai na capa do laudo
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("profiles").select("tenants(nome, crc)").eq("id", user.id).maybeSingle()
    : { data: null };
  const tt = perfil?.tenants as { nome?: string; crc?: string } | { nome?: string; crc?: string }[] | null;
  const tenant = Array.isArray(tt) ? tt[0] : tt;
  const temEscritorio = !!tenant?.nome && tenant.nome !== "Escritório" && !!tenant?.crc;

  const { data: empresas } = await supabase
    .from("empresas")
    .select(
      "id, cnpj, razao_social, cnae_principal, faixa, motivo_triagem, prioridade_maxima, rbt12, anexo, contato_nome, contato_email"
    )
    .is("arquivada_em", null)
    .limit(2000);

  const { data: analises } = await supabase
    .from("analises")
    .select("id, empresa_id, saida, re, prioridade, parametros, respostas, calculado_em")
    .limit(2000);

  const { data: laudos } = await supabase.from("laudos").select("id, analise_id, numero");
  const { data: termos } = await supabase
    .from("termos")
    .select("id, analise_id, token, assinatura_status, assinado_em");

  const linhas = montarFila(
    (empresas ?? []) as EmpresaCru[],
    (analises ?? []) as AnaliseCru[],
    laudos ?? [],
    termos ?? []
  );
  const esteira = contarEsteira(linhas);
  const janela = estadoDaJanela();
  const fase = faseDaJanela();

  // ---------------------------------------------------------------- avisos
  const empresasRadar: EmpresaRadar[] = linhas.map((l) => ({
    id: l.id,
    razao_social: l.razao_social,
    cnpj: l.cnpj,
    anexo: null,
    faixa: l.faixa,
    cnae_principal: l.cnae,
    saida: l.saida,
    tem_analise: !!l.analise_id,
  }));

  const avisos: Aviso[] = await avisosDoRadar(supabase, linhas, empresasRadar);

  // REVISÃO DA CARTEIRA — o que muda de recomendação com os parâmetros vigentes.
  // Era uma tela inteira; virou um aviso, porque só interessa quando gera trabalho.
  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, fronteira_min, fronteira_max")
    .eq("exercicio", 2027)
    .maybeSingle();

  if (param) {
    const vigentes = {
      aliquota: Number(param.aliquota_cbs) + Number(param.aliquota_ibs),
      fronteiraMin: Number(param.fronteira_min),
      fronteiraMax: Number(param.fronteira_max),
    };
    const mudaram: string[] = [];
    for (const a of analises ?? []) {
      const respostas = a.respostas as unknown as Respostas | null;
      const p = a.parametros as { das?: number } | null;
      if (!respostas || !a.saida) continue;
      const novo = decidir(respostas, {
        ...PARAMETROS_2027,
        ...vigentes,
        das: p?.das ?? PARAMETROS_2027.das,
      });
      if (novo.saida !== a.saida) mudaram.push(a.empresa_id);
    }
    if (mudaram.length > 0) {
      avisos.push({
        id: "revisao-parametros",
        tipo: "revisao",
        titulo: `${mudaram.length} ${
          mudaram.length === 1 ? "análise muda" : "análises mudam"
        } de recomendação com os parâmetros vigentes`,
        detalhe:
          "As análises foram gravadas com os parâmetros da época. Recalculando com os valores atuais do exercício, a saída do motor seria outra.",
        o_que_fazer:
          "Reabra cada empresa, confira as premissas e salve de novo. O laudo já emitido não muda sozinho — o documento entregue é imutável por desenho.",
        empresas: mudaram,
      });
    }
  }

  // laudo emitido e ninguém para assinar: trabalho parado por falta de cadastro
  const semContato = linhas.filter((l) => l.laudo_id && !l.termo_id && !l.tem_contato);
  if (semContato.length > 0) {
    avisos.push({
      id: "sem-contato",
      tipo: "contato",
      titulo: `${semContato.length} ${
        semContato.length === 1 ? "empresa tem laudo" : "empresas têm laudo"
      } e nenhum contato para assinar o termo`,
      detalhe: "Sem nome e e-mail do responsável o termo de ciência não sai — e a prova não fecha.",
      empresas: semContato.map((l) => l.id),
    });
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-[19px] font-bold tracking-tight">Cockpit da carteira</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {esteira.decidem > 0
            ? `${esteira.decidem} de ${esteira.importadas} clientes precisam decidir até 30 de setembro.`
            : `${esteira.importadas} clientes na carteira.`}
        </p>
      </div>

      <Cockpit
        linhas={linhas}
        esteira={esteira}
        dias={janela.dias}
        posPct={janela.posPct}
        fase={fase}
        avisos={avisos}
        totalCarteira={linhas.length}
        temEscritorio={temEscritorio}
      />
    </div>
  );
}
