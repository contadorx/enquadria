import { createAdminClient } from "@/lib/supabase-admin";

/**
 * A IMAGEM DO CERTIFICADO — o que o LinkedIn mostra, e o que a pessoa posta.
 *
 * Um certificado que só existe como página vira link cinza no feed. Aqui ele
 * vira imagem: 1200×630 para a prévia do link e para o post, 1080×1080 para
 * quem prefere o quadrado do Instagram.
 *
 * O desenho fica NUMA função só, usada pela imagem de prévia e pela de
 * download. Dois desenhos separados divergiriam no primeiro ajuste — e aí a
 * pessoa posta uma coisa e o link mostra outra.
 *
 * Feito com JSX que o Satori entende: só flex, sem grid, sem sombra, sem
 * pseudo-elemento. Toda camada que parece decoração aqui é um <div> honesto.
 */

export interface DadosImagem {
  nome: string;
  codigo: string;
  data: string;
  aulas: number;
  minutos: number;
}

export async function buscarCertificado(codigo: string): Promise<DadosImagem | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("curso_certificados")
    .select("codigo, nome, aulas, minutos, emitido_em")
    .eq("codigo", codigo.toUpperCase().trim())
    .maybeSingle();
  if (!data) return null;
  return {
    nome: data.nome as string,
    codigo: data.codigo as string,
    aulas: (data.aulas as number) ?? 9,
    minutos: (data.minutos as number) ?? 0,
    data: new Date(data.emitido_em as string).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    }),
  };
}

/**
 * A FONTE DA IMAGEM.
 *
 * O gerador de imagem só embute uma fonte regular. Sem isto, "A decisão de
 * setembro" e o nome de quem concluiu saem em peso normal — e a identidade da
 * casa é tipografia pesada. Aqui buscamos a Plus Jakarta Sans de verdade.
 *
 * COM QUEDA: se o Google Fonts não responder, devolve `undefined` e a imagem
 * sai na fonte padrão do gerador.
 *
 * ATENÇÃO — armadilha real, pega no teste: passar `fonts: []` NÃO cai no
 * padrão. O gerador entende a lista vazia como "não há fonte nenhuma" e
 * derruba a renderização inteira com "No fonts are loaded". Por isso esta
 * função devolve `undefined`, e quem chama OMITE a chave. Feia é melhor que
 * quebrada; quebrada aqui é link sem prévia no LinkedIn, sem ninguém saber
 * por quê.
 *
 * O resultado fica em cache no processo: a segunda imagem não busca de novo.
 */
type Fonte = { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" };
let cacheFontes: Fonte[] | null = null;

async function baixarTtf(peso: 400 | 800): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@${peso}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "force-cache" }
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url, { cache: "force-cache" }).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function fontes(): Promise<Fonte[] | undefined> {
  if (cacheFontes) return cacheFontes.length ? cacheFontes : undefined;
  const [normal, forte] = await Promise.all([baixarTtf(400), baixarTtf(800)]);
  const lista: Fonte[] = [];
  if (normal) lista.push({ name: "Jakarta", data: normal, weight: 400, style: "normal" });
  if (forte) lista.push({ name: "Jakarta", data: forte, weight: 800, style: "normal" });
  cacheFontes = lista;
  return lista.length ? lista : undefined;
}

/** monta as opções sem a chave `fonts` quando não há fonte — ver o aviso acima */
export async function opcoesImagem(size: { width: number; height: number }) {
  const f = await fontes();
  return f ? { ...size, fonts: f } : size;
}

const NAVY = "#0B1220";
const CYAN = "#06B6D4";
const CINZA = "#94A3B8";

export function desenho(d: DadosImagem, quadrado: boolean) {
  const carga =
    d.minutos >= 60
      ? `${Math.floor(d.minutos / 60)}h${String(d.minutos % 60).padStart(2, "0")}`
      : `${d.minutos} min`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: NAVY,
        padding: quadrado ? 72 : 64,
        color: "#fff",
        fontFamily: "Jakarta, sans-serif",
      }}
    >
      {/* faixa superior */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: CYAN,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: NAVY,
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            E
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>ENQUADRIA</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ fontSize: 13, color: CINZA, letterSpacing: 3 }}>CERTIFICADO</div>
          <div style={{ fontSize: 18, color: CYAN, fontWeight: 700 }}>{d.codigo}</div>
        </div>
      </div>

      {/* miolo — cresce para ocupar a sobra; no quadrado, sem isto, fica um
          buraco no meio da imagem */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          gap: quadrado ? 18 : 12,
          paddingTop: quadrado ? 30 : 10,
          paddingBottom: quadrado ? 30 : 10,
        }}
      >
        <div style={{ fontSize: 15, color: CYAN, letterSpacing: 5 }}>CONCLUIU O CURSO</div>
        <div
          style={{
            fontSize: quadrado ? 62 : 58,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: quadrado ? 900 : 1000,
          }}
        >
          A decisão de setembro
        </div>
        <div style={{ fontSize: quadrado ? 26 : 24, color: "#CBD5E1", maxWidth: 900, lineHeight: 1.4 }}>
          Quem da sua carteira precisa optar pelo IBS/CBS fora do DAS — e como cobrar por isso.
        </div>
        {/* a imagem postada carrega a própria verificação: quem vê o post
            confere o certificado sem pedir link a ninguém */}
        <div
          style={{
            display: "flex",
            marginTop: quadrado ? 20 : 12,
            fontSize: quadrado ? 18 : 16,
            color: "#64748B",
          }}
        >
          confira em app.enquadria.com.br/certificado/{d.codigo}
        </div>
      </div>

      {/* faixa inferior: quem concluiu */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ width: "100%", height: 2, background: "#1E293B", display: "flex" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 30,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 14, color: CINZA, letterSpacing: 2 }}>CONCLUÍDO POR</div>
            <div style={{ fontSize: quadrado ? 40 : 36, fontWeight: 700, letterSpacing: -1 }}>
              {d.nome}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
              fontSize: 17,
              color: CINZA,
            }}
          >
            <div style={{ display: "flex" }}>
              {d.aulas} aulas · {carga}
            </div>
            <div style={{ display: "flex" }}>{d.data}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
