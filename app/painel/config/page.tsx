"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { AbasEscritorio } from "@/components/AbasEscritorio";
import { NovaRodada } from "@/components/NovaRodada";
import { ZerarCarteira } from "@/components/ZerarCarteira";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import Link from "next/link";

export default function Config() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  /* só a conta declarada em NEXT_PUBLIC_CONTA_DEMO vê o botão de zerar — e a
     rota recusa qualquer outra, então esconder aqui é conveniência, não trava */
  const [ehContaDemo, setEhContaDemo] = useState(false);
  const [nome, setNome] = useState("");
  const [crc, setCrc] = useState("");
  /** nome da PESSOA — assina o laudo, aparece na indicação e na equipe */
  const [meuNome, setMeuNome] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  /** o logo já traz o nome escrito? então o documento não repete ao lado */
  const [logoComNome, setLogoComNome] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const inputFile = useRef<HTMLInputElement>(null);
  const [totalAnalises, setTotalAnalises] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const demo = (process.env.NEXT_PUBLIC_CONTA_DEMO ?? "").trim().toLowerCase();
      setEhContaDemo(!!demo && (user.email ?? "").trim().toLowerCase() === demo);
      const { data } = await supabase
        .from("profiles")
        .select(`tenant_id, nome, tenants(${COLUNAS_ESCRITORIO})`)
        .eq("id", user.id)
        .maybeSingle();
      const t = data?.tenants as Escritorio | null;
      setTenantId(data?.tenant_id ?? null);
      setMeuNome((data?.nome as string | null) ?? "");
      setNome(t?.nome ?? "");
      setCrc(t?.crc ?? "");
      setLogoUrl(t?.logo_url ?? null);
      setLogoComNome(!!t?.logo_com_nome);
      // a próxima rodada recalcula a carteira a partir das respostas já dadas
      const { count } = await supabase.from("analises").select("id", { count: "exact", head: true });
      setTotalAnalises(count ?? 0);
    })();
  }, []);

  async function salvar() {
    if (!tenantId) return;
    setSalvando(true);
    setOk(false);
    setErro(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("tenants")
      .update({ nome, crc: crc || null, logo_com_nome: logoComNome })
      .eq("id", tenantId);
    /* o nome pessoal mora no perfil, não no escritório: numa equipe, cada um
       tem o seu, e o do dono é o que assina o laudo */
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: erroPerfil } = user
      ? await supabase.from("profiles").update({ nome: meuNome.trim() || null }).eq("id", user.id)
      : { error: null };
    setSalvando(false);
    if (error || erroPerfil) {
      // engolir o erro aqui era pior do que parece: a pessoa sai da tela
      // convencida de que salvou e o passo 1 da trilha nunca fecha.
      setErro("Não consegui salvar. Tente de novo — se insistir, recarregue a página.");
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2500);
    // O /painel é server component: ele calculou `temEscritorio` no render
    // anterior e serve do cache. Sem invalidar, o passo 1 da trilha continua
    // aberto mesmo com nome e CRC já gravados — que foi exatamente o relato.
    router.refresh();
  }

  async function enviarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !tenantId) return;
    const supabase = createClient();
    const ext = arquivo.name.split(".").pop() ?? "png";
    const caminho = `${tenantId}/logo.${ext}`;
    setErro(null);
    setSubindoLogo(true);
    const { error } = await supabase.storage
      .from("logos")
      .upload(caminho, arquivo, { upsert: true, cacheControl: "3600" });
    if (error) {
      // subir imagem falha por motivo banal (tamanho, tipo, permissão do
      // bucket). Sair calado deixa a pessoa achando que o logo está lá.
      setSubindoLogo(false);
      setErro("Não consegui subir o logo. Verifique se é PNG ou JPG e tente de novo.");
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(caminho);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    const { error: erroBanco } = await supabase
      .from("tenants")
      .update({ logo_url: url })
      .eq("id", tenantId);
    setSubindoLogo(false);
    if (erroBanco) {
      setErro("O logo subiu mas não consegui vinculá-lo ao escritório. Tente de novo.");
      return;
    }
    setLogoUrl(url);
    router.refresh(); // o logo entra na capa do laudo, que é server component
  }

  return (
    <div>
      <AbasEscritorio />
      <h1 className="text-[19px] font-bold tracking-tight">Configurações do escritório</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Nome, CRC e logo aparecem na capa de cada laudo e termo. Nunca a marca do Enquadria.
      </p>

      <div className="mt-6 max-w-xl space-y-5">
        <div className="rounded border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Identidade
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Nome do escritório</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="mb-1 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Seu nome</span>
            <input
              value={meuNome}
              onChange={(e) => setMeuNome(e.target.value)}
              placeholder="Como você assina profissionalmente"
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <p className="mb-4 text-[11.5px] leading-relaxed text-muted">
            Assina o laudo e o termo (“{meuNome.trim() || "Seu nome"}
            {nome.trim() ? ` · ${nome.trim()}` : ""}
            {crc.trim() ? ` — ${crc.trim()}` : ""}”), aparece na equipe e é quem indica quando você
            recomenda o Enquadria a um colega. Sem ele, o documento é assinado só pela razão social.
          </p>

          <label className="mb-4 block">
            <span className="mb-1 block text-[12.5px] font-semibold">CRC</span>
            <input
              value={crc}
              onChange={(e) => setCrc(e.target.value)}
              placeholder="CRC 1SP 000.000/O-0"
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          {erro && (
            <p className="mb-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {salvando ? "Salvando…" : ok ? "Salvo ✓" : "Salvar"}
            </button>
            {/* A VOLTA PARA O TRABALHO — 08/08/2026.
                Esta tela é o passo 1 da trilha: a pessoa é MANDADA para cá pelo
                cockpit e, depois de salvar, ficava. Não havia link de volta,
                nenhuma indicação de que o passo tinha fechado, nada. O caminho
                que a trilha desenhou terminava num beco, e o próximo movimento
                dependia de a pessoa achar "Cockpit" no menu lateral. O botão só
                aparece DEPOIS de salvar, para não competir com o de salvar. */}
            {ok && (
              <Link
                href="/painel"
                className="rounded-sm border border-ink px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Voltar ao cockpit →
              </Link>
            )}
          </div>

          {/* o CRC não é enfeite: é o que fecha o passo 1 dos primeiros passos
              e o que dá credencial ao laudo. Dizer isso aqui evita a pessoa
              salvar só o nome e não entender por que a trilha não anda. */}
          {!crc.trim() && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Sem o <strong>CRC</strong> o laudo sai sem credencial profissional — e o
              primeiro passo dos “Primeiros passos” continua aberto.
            </p>
          )}
        </div>

        <div className="rounded border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Logo (white-label)
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-line bg-surface2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" className="max-h-16 max-w-16 object-contain" />
              ) : (
                <span className="text-[10px] text-muted">sem logo</span>
              )}
            </div>
            <button
              onClick={() => inputFile.current?.click()}
              disabled={subindoLogo}
              className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-slate2 disabled:opacity-50"
            >
              {subindoLogo ? "Enviando…" : logoUrl ? "Trocar logo" : "Enviar logo"}
            </button>
            <input
              ref={inputFile}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={enviarLogo}
              className="hidden"
            />
          </div>
          <p className="mt-3 text-[11.5px] text-muted">
            PNG ou SVG com fundo transparente, de preferência. Aparece no topo dos documentos.
          </p>

          {/*
            A maioria dos logos de escritório já tem o nome escrito dentro da
            imagem. O cabeçalho imprimia o logo e repetia o nome ao lado — e
            quando os dois textos não são idênticos, a capa parece montada por
            engano. Quem sabe se o logo tem nome é o dono dele.
          */}
          {logoUrl && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-sm border border-line bg-surface2 p-3">
              <input
                type="checkbox"
                checked={logoComNome}
                onChange={(e) => setLogoComNome(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[12.5px] leading-relaxed text-slate2">
                <b>Meu logo já traz o nome do escritório.</b> Marcando, os documentos mostram só a
                imagem — sem repetir o nome escrito ao lado dela. O CRC continua aparecendo.
                <span className="mt-1 block text-[11.5px] text-muted">
                  Lembre de salvar depois de marcar.
                </span>
              </span>
            </label>
          )}
        </div>
      </div>

      {/* A JANELA É SEMESTRAL — abrir a próxima é ato de administração, não de
          trabalho diário. Por isso vive aqui, e não no cockpit. */}
      <div className="mt-6 max-w-xl rounded border border-line bg-surface p-5 shadow-card">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          Próxima janela
        </div>
        <p className="mb-3 text-[12.5px] text-muted">
          A opção vale por semestre. Quando o período seguinte for publicado, abra a rodada nova: a
          carteira é recalculada a partir das respostas já dadas e as decisões anteriores ficam
          intactas.
        </p>
        <NovaRodada totalAnalises={totalAnalises} />
      </div>

      {/* GRAVAR UMA DEMONSTRAÇÃO EXIGE CARTEIRA VAZIA, VÁRIAS VEZES NO MESMO
          DIA (10/08/2026). Antes isso era `delete` à mão em oito tabelas no
          Supabase, na ordem certa — e no dia em que a ordem sai errada sobra
          órfão e a reimportação falha por chave única, no meio da gravação. */}
      <div className="max-w-xl">
        <ZerarCarteira visivel={ehContaDemo} />
      </div>
    </div>
  );
}
