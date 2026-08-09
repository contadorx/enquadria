import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Regua } from "@/components/Regua";
import { BotaoSair } from "@/components/BotaoSair";
import { NavMobile } from "@/components/NavMobile";
import { navDe } from "@/lib/nav";
import { CamadaGlobal } from "@/components/CamadaGlobal";
import { contarNovidades } from "@/lib/ajuda";
import { JANELA, estadoDaJanela, faseDaJanela } from "@/lib/janela";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let escritorio = "Escritório";
  let ehSuperadmin = false;
  if (user) {
    // Tentativa 1: com is_superadmin (existe a partir da migration 0020).
    //
    // O erro é CAPTURADO de propósito. Se a coluna ainda não existir, o
    // Postgres derruba a consulta INTEIRA — e o layout perderia junto o nome do
    // escritório, sem dizer por quê. Já aconteceu neste app com a coluna de
    // impersonação; aqui a lição está aplicada: a segunda tentativa pede só o
    // essencial, e o app segue funcionando sem a aba de plataforma.
    const comFlag = await supabase
      .from("profiles")
      .select("tenant_id, is_superadmin, tenants(nome)")
      .eq("id", user.id)
      .maybeSingle();

    let perfil = comFlag.data as { tenant_id?: string; is_superadmin?: boolean; tenants?: unknown } | null;

    if (comFlag.error) {
      const semFlag = await supabase
        .from("profiles")
        .select("tenant_id, tenants(nome)")
        .eq("id", user.id)
        .maybeSingle();
      perfil = semFlag.data as typeof perfil;
    }

    const t = perfil?.tenants as { nome?: string } | { nome?: string }[] | null;
    const nome = Array.isArray(t) ? t[0]?.nome : t?.nome;
    if (nome) escritorio = nome;
    ehSuperadmin = !!perfil?.is_superadmin;
  }
  const menu = navDe(ehSuperadmin);

  /**
   * O que a camada global precisa saber, buscado aqui porque o layout já é
   * server component e já consultou o perfil — evita duas idas ao banco em
   * toda navegação.
   *
   * Falha em qualquer uma destas consultas NÃO pode derrubar o painel: o
   * assistente e o NPS são acessórios, e uma tabela que ainda não existe (a
   * migration não rodada) não pode impedir alguém de trabalhar.
   */
  let assistenteAtivo = false;
  let laudosDoEscritorio = 0;
  let npsRespondidoEm: string | null = null;
  /**
   * Quantas notícias da Reforma esta pessoa ainda não leu.
   *
   * Vira a bolinha ao lado do menu. Conteúdo empurrado sem aviso é conteúdo não
   * lido: a pessoa só descobre que saiu regulamentação nova se algo na tela
   * disser que saiu.
   */
  let reformaNaoLidas = 0;
  /**
   * Apontamentos em aberto na carteira — a bolinha que faltava.
   *
   * O monitor roda todo dia e grava o que cada norma nova exige de cada
   * empresa. Sem um número no menu, o contador só chega lá por acidente: a
   * tela vive numa sub-aba dentro de "Aprender". É o único motivo recorrente
   * de abrir o produto depois que a janela fecha, e ele não tinha aviso.
   */
  let apontamentosAbertos = 0;
  /**
   * A SITUAÇÃO DO ESCRITÓRIO — cinco contagens baratas (head: true, sem trazer
   * linha) que o assistente usa para saber qual é o próximo passo de quem está
   * na tela. Sem isso ele só sabe responder quando perguntado, e quem está
   * perdido não sabe o que perguntar.
   */
  let situacao = {
    temEscritorio: false, empresas: 0, analises: 0, laudos: 0, termos: 0, assinados: 0,
  };
  try {
    const [cfg, laudos, nps] = await Promise.all([
      supabase.from("assistente_config").select("ativo").eq("id", 1).maybeSingle(),
      supabase.from("laudos").select("id", { count: "exact", head: true }),
      supabase.from("nps_respostas").select("criado_em").order("criado_em", { ascending: false }).limit(1),
    ]);
    assistenteAtivo = !!cfg.data?.ativo;
    laudosDoEscritorio = laudos.count ?? 0;
    const ultima = (nps.data ?? [])[0] as { criado_em?: string } | undefined;
    npsRespondidoEm = ultima?.criado_em ? ultima.criado_em.slice(0, 10) : null;

    const [noticias, lidos] = await Promise.all([
      supabase
        .from("ajuda_artigos")
        .select("id, atualizado_em")
        .eq("tipo", "noticia")
        .eq("publicado", true),
      supabase.from("ajuda_leituras").select("artigo_id, lido_em"),
    ]);
    const leituras = Object.fromEntries(
      (lidos.data ?? []).map((l) => [l.artigo_id as string, l.lido_em as string])
    );
    reformaNaoLidas = contarNovidades(
      (noticias.data ?? []) as { id: string; atualizado_em: string }[],
      leituras
    );

    /* contagem barata, sem trazer linha. `in` cobre os dois estados abertos —
       a mesma regra de `estaAberto()` em lib/apontamentos.ts */
    const abertos = await supabase
      .from("apontamentos")
      .select("id", { count: "exact", head: true })
      .in("status", ["novo", "tratado"]);
    apontamentosAbertos = abertos.count ?? 0;

    const [empresas, analises, termos, assinados, escritorioCfg] = await Promise.all([
      supabase.from("empresas").select("id", { count: "exact", head: true }).is("arquivada_em", null),
      supabase.from("analises").select("id", { count: "exact", head: true }),
      supabase.from("termos").select("id", { count: "exact", head: true }),
      supabase.from("termos").select("id", { count: "exact", head: true }).not("assinado_em", "is", null),
      supabase.from("profiles").select("tenants(nome, crc)").eq("id", user?.id ?? "").maybeSingle(),
    ]);
    const tt = escritorioCfg.data?.tenants as { nome?: string; crc?: string } | { nome?: string; crc?: string }[] | null;
    const dono = Array.isArray(tt) ? tt[0] : tt;
    situacao = {
      /* "Escritório" é o nome que o cadastro nasce tendo: contá-lo como
         preenchido faria a trilha pular o passo que ela existe para cobrar */
      temEscritorio: !!dono?.nome && dono.nome !== "Escritório" && !!dono?.crc,
      empresas: empresas.count ?? 0,
      analises: analises.count ?? 0,
      laudos: laudosDoEscritorio,
      termos: termos.count ?? 0,
      assinados: assinados.count ?? 0,
    };
  } catch {
    /* migrations não rodadas: painel funciona, os acessórios não aparecem */
  }

  // calculado aqui, no servidor: o NavMobile é componente de cliente e usar
  // Date lá dentro faria servidor e navegador renderizarem valores diferentes
  const { dias: diasRestantes, posPct: posDaJanela } = estadoDaJanela();
  /* a fase é calculada uma vez e serve as duas barras: a régua do desktop já a
     usava, o celular recebia só `estadoDaJanela()` — que conhece a janela de
     setembro e nada mais — e por isso imprimia "fim" de 01/10/2026 em diante,
     para sempre. Metade dos acessos é celular. */
  const faseAtual = faseDaJanela();

  return (
    <div className="min-h-screen">
      {/* No desktop, marca + régua. No celular essa barra some inteira: a régua
          não cabe em 390px e duas faixas escuras empilhadas comiam 90px de tela.
          O celular ganha uma barra única e fixa, montada no NavMobile. */}
      <header className="hidden bg-ink text-white md:block">
        <div className="flex items-center gap-5 px-5 py-3">
          <div className="text-[15px] font-extrabold tracking-tight">
            ENQUADRIA<span className="text-accentbright">.</span>
          </div>
          <div className="min-w-0 flex-1">
            <Regua abre={JANELA.abre} fecha={JANELA.fecha} fase={faseAtual} />
          </div>
        </div>
      </header>

      <NavMobile
        escritorio={escritorio}
        email={user?.email}
        dias={diasRestantes}
        posPct={posDaJanela}
        selo={faseAtual.selo}
        ehSuperadmin={ehSuperadmin}
      />

      <div className="grid grid-cols-1 md:grid-cols-[186px_1fr]">
        <aside className="hidden border-r border-linesoft bg-surface2 py-4 md:block">
          {menu.map((g) => (
            <div key={g.grupo}>
              <div className="px-[18px] py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                {g.grupo}
              </div>
              {g.itens.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="flex items-center justify-between gap-2 px-[18px] py-2 text-[13.5px] text-slate2 hover:bg-accentwash hover:text-accentdeep"
                >
                  <span>{i.label}</span>
                  {/* TRABALHO VENCE NOTÍCIA (08/08/2026). O marcador contava só
                      novidade não lida. Apontamento aberto é outra coisa: é a
                      norma já cruzada com a carteira, empresa por empresa —
                      trabalho cobrável esperando. Quando existe, é ele que
                      aparece, em âmbar; a contagem de leitura fica de reserva.
                      Duas bolinhas lado a lado só ensinariam a ignorar as
                      duas. */}
                  {i.marcador === "reforma" && apontamentosAbertos > 0 && (
                    <span
                      title={`${apontamentosAbertos} ponto(s) da Reforma em aberto na sua carteira`}
                      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amarelo px-1 font-mono text-[10px] font-bold text-white"
                    >
                      {apontamentosAbertos}
                    </span>
                  )}
                  {i.marcador === "reforma" && apontamentosAbertos === 0 && reformaNaoLidas > 0 && (
                    <span
                      title={`${reformaNaoLidas} novidade(s) na Reforma`}
                      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold text-white"
                    >
                      {reformaNaoLidas}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
          <div className="mt-6 border-t border-linesoft px-[18px] pt-4">
            <p className="text-[12px] font-semibold leading-tight">{escritorio}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{user?.email}</p>
            <BotaoSair />
          </div>
        </aside>

        {/* pb-20 no celular: a barra inferior não pode cobrir o fim do conteúdo */}
        <main className="min-w-0 px-4 pb-20 pt-5 md:px-6 md:pb-6 md:pt-6">{children}</main>
      </div>

      {/* Flutuam por cima de qualquer tela: dúvida aparece no meio da tarefa,
          e NPS que espera visita não é NPS. */}
      <CamadaGlobal
        assistenteAtivo={assistenteAtivo}
        laudos={laudosDoEscritorio}
        respondidoEm={npsRespondidoEm}
        situacao={situacao}
      />
    </div>
  );
}
