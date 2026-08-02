/**
 * Rota de teste do mailer.  GET /api/dev/testar-email?para=voce@gmail.com&tpl=triagem
 *
 * Protegida por segredo — NÃO deixe aberta em produção sem MAILER_TEST_SECRET.
 * Header:  x-mailer-secret: <MAILER_TEST_SECRET>
 * ou query: &secret=<MAILER_TEST_SECRET>
 */

import { NextResponse } from "next/server";
import {
  enviarConfirmacaoConta,
  enviarRecuperacaoSenha,
  enviarTriagemPronta,
  enviarLaudoPronto,
  enviarJanelaProxima,
  postalConfigurado,
} from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segredo = process.env.MAILER_TEST_SECRET;
  const fornecido = req.headers.get("x-mailer-secret") ?? url.searchParams.get("secret");

  if (!segredo || fornecido !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const para = url.searchParams.get("para");
  if (!para || !para.includes("@")) {
    return NextResponse.json({ erro: "informe ?para=email@valido" }, { status: 400 });
  }

  if (!postalConfigurado()) {
    return NextResponse.json(
      { erro: "POSTAL_URL / POSTAL_API_KEY ausentes no ambiente" },
      { status: 500 }
    );
  }

  const tpl = url.searchParams.get("tpl") ?? "confirmar";
  const dest = { email: para, nome: url.searchParams.get("nome") ?? "Leandro" };
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.enquadria.com.br";

  let ok = false;
  switch (tpl) {
    case "confirmar":
      ok = await enviarConfirmacaoConta(dest, `${app}/confirmar?token=TESTE`);
      break;
    case "senha":
      ok = await enviarRecuperacaoSenha(dest, `${app}/nova-senha?token=TESTE`);
      break;
    case "triagem":
      ok = await enviarTriagemPronta(dest, { total: 143, urgentes: 19, link: `${app}/carteira` });
      break;
    case "laudo":
      ok = await enviarLaudoPronto(dest, {
        empresa: "Comércio Exemplo Ltda",
        link: `${app}/laudos/TESTE`,
      });
      break;
    case "janela":
      ok = await enviarJanelaProxima(dest, { dias: 21, pendentes: 12, link: `${app}/carteira` });
      break;
    default:
      return NextResponse.json(
        { erro: "tpl inválido", validos: ["confirmar", "senha", "triagem", "laudo", "janela"] },
        { status: 400 }
      );
  }

  return NextResponse.json({
    enviado: ok,
    template: tpl,
    para,
    nota: ok
      ? "Aceito pelo Postal. Confira em Messages no painel — 'aceito' não é 'entregue'."
      : "Falhou. Veja os logs da função na Vercel.",
  });
}
