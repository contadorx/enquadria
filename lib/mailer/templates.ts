/**
 * Templates transacionais do Enquadria.
 *
 * Regras que valem para todos:
 *  - HTML simples, uma coluna, sem imagem externa. Transacional com layout de
 *    newsletter cai em Promoções no Gmail.
 *  - Assunto sem promessa e sem exclamação. É aviso, não campanha.
 *  - Link em texto visível também, não só em botão: cliente de e-mail que bloqueia
 *    CSS deixa o botão invisível.
 */

// o mesmo navy do app e do site. Antes era #0f2a4a, um azul parecido mas
// diferente — e-mail com a marca de um tom e o produto de outro é o tipo de
// detalhe que ninguém nomeia e todo mundo sente.
export const MARCA = "#0B1220";
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.enquadria.com.br";

export function moldura(titulo: string, miolo: string, rodapeExtra = ""): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.55">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:32px">
    <div style="font-size:18px;font-weight:700;color:${MARCA};margin-bottom:24px">Enquadria</div>
    ${miolo}
  </div>
  <div style="max-width:560px;margin:16px auto 0;font-size:12px;color:#6b7280;text-align:center">
    Enquadria — enquadramento de IBS/CBS por carteira.<br>
    Este é um e-mail automático da sua conta. ${rodapeExtra}
  </div>
</body></html>`;
}

export function botao(url: string, texto: string): string {
  return `<p style="margin:24px 0">
    <a href="${url}" style="background:${MARCA};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">${escapar(texto)}</a>
  </p>
  <p style="font-size:13px;color:#6b7280;margin:0 0 8px">Se o botão não funcionar, copie este endereço:<br>
  <span style="word-break:break-all">${url}</span></p>`;
}

export function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type Template = { subject: string; html: string; tag: string };

/* ─────────────────────────── confirmação de conta ─────────────────────────── */

export function tplConfirmarConta(nome: string, link: string): Template {
  return {
    tag: "confirmar-conta",
    subject: "Confirme seu e-mail para ativar a conta",
    html: moldura(
      "Confirme seu e-mail",
      `<p>Olá, ${escapar(nome || "tudo bem")}.</p>
       <p>Sua conta no Enquadria foi criada. Falta confirmar este endereço para você
          conseguir subir a carteira e rodar a triagem.</p>
       ${botao(link, "Confirmar meu e-mail")}
       <p style="font-size:13px;color:#6b7280">O link vale por 24 horas. Se não foi você
          quem se cadastrou, pode ignorar esta mensagem.</p>`
    ),
  };
}

/* ─────────────────────────── recuperação de senha ─────────────────────────── */

export function tplRecuperarSenha(nome: string, link: string): Template {
  return {
    tag: "recuperar-senha",
    subject: "Redefinir sua senha do Enquadria",
    html: moldura(
      "Redefinir senha",
      `<p>Olá, ${escapar(nome || "tudo bem")}.</p>
       <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
       ${botao(link, "Criar nova senha")}
       <p style="font-size:13px;color:#6b7280">O link vale por 1 hora e só pode ser usado
          uma vez. Se você não pediu isso, ignore — sua senha atual continua valendo.</p>`
    ),
  };
}

/* ─────────────────────────── triagem concluída ─────────────────────────── */

export function tplTriagemPronta(
  nome: string,
  total: number,
  urgentes: number,
  link: string
): Template {
  return {
    tag: "triagem-pronta",
    subject: `Sua triagem: ${urgentes} de ${total} empresas exigem análise`,
    html: moldura(
      "Triagem concluída",
      `<p>Olá, ${escapar(nome || "tudo bem")}.</p>
       <p>A triagem da sua carteira terminou.</p>
       <table style="width:100%;border-collapse:collapse;margin:20px 0">
         <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Empresas analisadas</td>
             <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${total}</td></tr>
         <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Precisam de análise</td>
             <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#b45309">${urgentes}</td></tr>
         <tr><td style="padding:10px 0">Descartadas com critério</td>
             <td style="padding:10px 0;text-align:right;font-weight:700;color:#047857">${total - urgentes}</td></tr>
       </table>
       <p>As ${urgentes} da lista de atenção são as que valem uma análise cobrada antes
          da janela de 30 de setembro.</p>
       ${botao(link, "Ver a lista de atenção")}`
    ),
  };
}

/* ─────────────────────────── laudo emitido ─────────────────────────── */

export function tplLaudoPronto(nome: string, empresa: string, link: string): Template {
  return {
    tag: "laudo-pronto",
    subject: `Laudo de ${empresa} pronto`,
    html: moldura(
      "Laudo emitido",
      `<p>Olá, ${escapar(nome || "tudo bem")}.</p>
       <p>O laudo de enquadramento de <strong>${escapar(empresa)}</strong> foi gerado,
          com a premissa de alíquota carimbada e data de emissão.</p>
       ${botao(link, "Abrir o laudo")}
       <p style="font-size:13px;color:#6b7280">O laudo fica no dossiê da empresa e pode
          ser baixado quando você quiser.</p>`
    ),
  };
}

/* ─────────────────────────── aviso de janela ─────────────────────────── */

export function tplJanelaProxima(nome: string, dias: number, pendentes: number, link: string): Template {
  return {
    tag: "janela-proxima",
    subject: `Faltam ${dias} dias e você tem ${pendentes} empresas sem laudo`,
    html: moldura(
      "A janela está fechando",
      `<p>Olá, ${escapar(nome || "tudo bem")}.</p>
       <p>Faltam <strong>${dias} dias</strong> para 30 de setembro, e a sua lista de
          atenção ainda tem <strong>${pendentes} empresas</strong> sem laudo emitido.</p>
       ${botao(link, "Ver as pendentes")}
       <p style="font-size:13px;color:#6b7280">Depois da janela a decisão volta —
          mas quem decide agora decide com prazo, não com pressa.</p>`
    ),
  };
}
