/**
 * CARIMBO DO TEMPO (Nível 3) — a data incontestável do aceite.
 *
 * Degrada como os outros adaptadores da casa:
 *   • Sem CARIMBO_URL → carimbo do SERVIDOR: hora UTC do momento do aceite,
 *     amarrada ao hash do documento. Suficiente para um termo de ciência.
 *   • Com CARIMBO_URL → delega a uma autoridade de carimbo do tempo (ACT)
 *     compatível com RFC 3161 / endpoint próprio, para data assinada por
 *     terceiro. É o "nível máximo": basta plugar uma ACT credenciada.
 *
 * O contrato do endpoint externo (POST) é minimalista para não travar em
 * detalhes de ASN.1 no app: recebe { hash } (hex SHA-256) e devolve
 * { token, carimbo_em } — o token opaco da ACT e o instante certificado.
 */

export interface Carimbo {
  fonte: "servidor" | "tsa";
  carimbo_em: string;
  hash: string;
  token?: string;
}

export async function carimbar(hashHex: string, agoraISO: string): Promise<Carimbo> {
  const url = process.env.CARIMBO_URL;
  if (!url) {
    return { fonte: "servidor", carimbo_em: agoraISO, hash: hashHex };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CARIMBO_TOKEN ? { Authorization: `Bearer ${process.env.CARIMBO_TOKEN}` } : {}),
      },
      body: JSON.stringify({ hash: hashHex }),
      cache: "no-store",
    });
    if (!resp.ok) return { fonte: "servidor", carimbo_em: agoraISO, hash: hashHex };
    const json = (await resp.json()) as { token?: string; carimbo_em?: string };
    return {
      fonte: "tsa",
      carimbo_em: json.carimbo_em ?? agoraISO,
      hash: hashHex,
      token: json.token,
    };
  } catch {
    return { fonte: "servidor", carimbo_em: agoraISO, hash: hashHex };
  }
}
