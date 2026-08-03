"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { AbasEscritorio } from "@/components/AbasEscritorio";
import { NovaRodada } from "@/components/NovaRodada";

export default function Config() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [crc, setCrc] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
      const { data } = await supabase
        .from("profiles")
        .select("tenant_id, tenants(nome, crc, logo_url)")
        .eq("id", user.id)
        .maybeSingle();
      const t = data?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
      setTenantId(data?.tenant_id ?? null);
      setNome(t?.nome ?? "");
      setCrc(t?.crc ?? "");
      setLogoUrl(t?.logo_url ?? null);
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
      .update({ nome, crc: crc || null })
      .eq("id", tenantId);
    setSalvando(false);
    if (error) {
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

          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {salvando ? "Salvando…" : ok ? "Salvo ✓" : "Salvar"}
          </button>

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
    </div>
  );
}
