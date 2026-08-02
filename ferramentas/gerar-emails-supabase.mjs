/**
 * GERA OS TEMPLATES DE E-MAIL DO SUPABASE AUTH.
 *
 *     node ferramentas/gerar-emails-supabase.mjs
 *
 * Escreve 13 arquivos HTML em `supabase/emails/`, prontos para colar no painel
 * do Supabase. São 13 porque o Supabase tem duas famílias:
 *
 *   · 6 de AUTENTICAÇÃO — pedem uma ação: confirmar conta, convite, link
 *     mágico, trocar e-mail, redefinir senha, reautenticar.
 *   · 7 de AVISO DE SEGURANÇA — não pedem nada, avisam que algo mudou: senha
 *     trocada, e-mail trocado, telefone trocado, método de login ligado ou
 *     desligado, verificação em duas etapas adicionada ou removida.
 *
 * A segunda família é a que quase todo mundo deixa em branco, e é justamente a
 * que protege a conta: é o e-mail que chega quando alguém trocou a senha do
 * contador às três da manhã. Sem ele, a invasão só aparece quando já é tarde.
 *
 * A MOLDURA É A MESMA dos transacionais do app (`lib/mailer/templates.ts`).
 * Um e-mail de senha com cara diferente do resto do produto é o que ensina o
 * usuário a não desconfiar de e-mail falso — a semelhança aqui é segurança,
 * não estética.
 *
 * As variáveis são as do Supabase e vão CRUAS no HTML: `{{ .ConfirmationURL }}`,
 * `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .OldEmail }}`,
 * `{{ .Phone }}`, `{{ .OldPhone }}`, `{{ .Provider }}`, `{{ .FactorType }}`.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = path.join(RAIZ, ".tmp-emails");
const SAIDA = path.join(RAIZ, "supabase", "emails");

/* compila só o que precisa: a moldura vem do MESMO arquivo que o app usa */
fs.rmSync(TMP, { recursive: true, force: true });
execSync(
  `npx tsc lib/mailer/templates.ts --outDir ${TMP} --module esnext --target es2020 ` +
    `--moduleResolution bundler --skipLibCheck`,
  { cwd: RAIZ, stdio: "pipe" }
);
fs.writeFileSync(path.join(TMP, "package.json"), '{"type":"module"}');
const { moldura, botao, MARCA } = await import(path.join(TMP, "templates.js"));

const CONTATO = "seguranca@enquadria.com.br";

/** bloco do código de 6 dígitos — grande, monoespaçado, fácil de copiar no celular */
function codigo(v) {
  return `<div style="margin:24px 0;padding:18px;background:#f1f5f9;border-radius:8px;text-align:center">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:8px">Seu código</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:.22em;color:${MARCA}">${v}</div>
  </div>`;
}

/** rodapé dos avisos de segurança: o que fazer quando NÃO foi você */
function naoFuiEu(acao) {
  return `<div style="margin-top:24px;padding:16px;background:#fef2f2;border-left:3px solid #b91c1c;border-radius:4px">
    <p style="margin:0;font-size:13.5px;line-height:1.6;color:#1a1a1a">
      <strong>Não foi você?</strong> ${acao} Depois escreva para
      <a href="mailto:${CONTATO}" style="color:#0e7490">${CONTATO}</a> contando o que aconteceu.
    </p>
  </div>`;
}

const QUANDO =
  `<p style="font-size:13px;color:#6b7280;margin-top:20px">Este aviso é automático e foi ` +
  `disparado no momento da alteração. Guarde-o: ele é o registro de quando a mudança aconteceu.</p>`;

/* ====================================================================== */
/* 6 DE AUTENTICAÇÃO                                                       */
/* ====================================================================== */

const AUTENTICACAO = [
  {
    arquivo: "01-confirmar-cadastro",
    painel: "Confirm signup",
    assunto: "Confirme seu e-mail para ativar a conta",
    html: moldura(
      "Confirme seu e-mail",
      `<p>Sua conta no Enquadria foi criada com o endereço
         <strong>{{ .Email }}</strong>.</p>
       <p>Falta confirmar que este e-mail é seu — é o que permite recuperar o acesso
          depois, se você perder a senha.</p>
       ${botao("{{ .ConfirmationURL }}", "Confirmar meu e-mail")}
       <p style="font-size:13px;color:#6b7280">O link vale por 24 horas e só funciona uma vez.
          Se não foi você quem se cadastrou, ignore esta mensagem: sem a confirmação a conta
          não é ativada.</p>`
    ),
  },
  {
    arquivo: "02-convite",
    painel: "Invite user",
    assunto: "Você foi convidado para o Enquadria",
    html: moldura(
      "Convite para o Enquadria",
      `<p>Alguém do seu escritório criou um acesso para <strong>{{ .Email }}</strong>
          no Enquadria — o sistema que decide o enquadramento de IBS/CBS da carteira e
          emite o laudo.</p>
       ${botao("{{ .ConfirmationURL }}", "Aceitar o convite e criar minha senha")}
       <p style="font-size:13px;color:#6b7280">Se você não esperava este convite, pode
          ignorar. O acesso só passa a existir depois que você criar a senha.</p>`
    ),
  },
  {
    arquivo: "03-link-magico",
    painel: "Magic Link",
    assunto: "Seu link de acesso ao Enquadria",
    html: moldura(
      "Entrar no Enquadria",
      `<p>Use o link abaixo para entrar sem digitar senha.</p>
       ${botao("{{ .ConfirmationURL }}", "Entrar no Enquadria")}
       <p>Se preferir digitar, o código é:</p>
       ${codigo("{{ .Token }}")}
       <p style="font-size:13px;color:#6b7280">Vale por 1 hora e só funciona uma vez.
          <strong>Ninguém do Enquadria vai pedir este código por telefone ou WhatsApp.</strong>
          Se alguém pedir, é golpe.</p>`
    ),
  },
  {
    arquivo: "04-trocar-email",
    painel: "Change Email Address",
    assunto: "Confirme o novo endereço de e-mail",
    html: moldura(
      "Confirmar troca de e-mail",
      `<p>Foi pedida a troca do e-mail da conta:</p>
       <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
         <tr><td style="padding:8px 0;color:#6b7280;width:42%">E-mail atual</td>
             <td style="padding:8px 0"><strong>{{ .Email }}</strong></td></tr>
         <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #eee">Novo e-mail</td>
             <td style="padding:8px 0;border-top:1px solid #eee"><strong>{{ .NewEmail }}</strong></td></tr>
       </table>
       ${botao("{{ .ConfirmationURL }}", "Confirmar o novo e-mail")}
       <p style="font-size:13px;color:#6b7280">Enquanto você não confirmar, o acesso continua
          pelo endereço atual.</p>
       ${naoFuiEu("Não clique no botão — sem a confirmação, nada muda.")}`
    ),
  },
  {
    arquivo: "05-redefinir-senha",
    painel: "Reset Password",
    assunto: "Redefinir sua senha do Enquadria",
    html: moldura(
      "Redefinir senha",
      `<p>Recebemos um pedido para redefinir a senha de <strong>{{ .Email }}</strong>.</p>
       ${botao("{{ .ConfirmationURL }}", "Criar nova senha")}
       <p style="font-size:13px;color:#6b7280">O link vale por 1 hora e só pode ser usado uma vez.</p>
       ${naoFuiEu("Ignore este e-mail — sua senha atual continua valendo e nada foi alterado.")}`
    ),
  },
  {
    arquivo: "06-reautenticar",
    painel: "Reauthentication",
    assunto: "Código para confirmar a alteração",
    html: moldura(
      "Confirme que é você",
      `<p>Para concluir uma alteração sensível na conta, digite o código abaixo na tela
          que está aberta.</p>
       ${codigo("{{ .Token }}")}
       <p style="font-size:13px;color:#6b7280">Vale por poucos minutos.
          <strong>Ninguém do Enquadria vai pedir este código por telefone ou WhatsApp.</strong></p>
       ${naoFuiEu("Não digite o código em lugar nenhum e troque sua senha agora.")}`
    ),
  },
];

/* ====================================================================== */
/* 7 DE AVISO DE SEGURANÇA                                                 */
/* ====================================================================== */

const SEGURANCA = [
  {
    arquivo: "07-senha-alterada",
    painel: "Password changed",
    assunto: "A senha da sua conta foi alterada",
    html: moldura(
      "Senha alterada",
      `<p>A senha da conta <strong>{{ .Email }}</strong> acabou de ser alterada.</p>
       <p>Se foi você, não precisa fazer nada.</p>
       ${naoFuiEu("Redefina a senha imediatamente pela tela de acesso do Enquadria.")}
       ${QUANDO}`
    ),
  },
  {
    arquivo: "08-email-alterado",
    painel: "Email address changed",
    assunto: "O e-mail da sua conta foi alterado",
    html: moldura(
      "E-mail alterado",
      `<p>O endereço de e-mail da sua conta foi alterado.</p>
       <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
         <tr><td style="padding:8px 0;color:#6b7280;width:42%">Antes</td>
             <td style="padding:8px 0"><strong>{{ .OldEmail }}</strong></td></tr>
         <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #eee">Agora</td>
             <td style="padding:8px 0;border-top:1px solid #eee"><strong>{{ .NewEmail }}</strong></td></tr>
       </table>
       ${naoFuiEu("Quem controla o e-mail controla a recuperação de senha — trate como urgente.")}
       ${QUANDO}`
    ),
  },
  {
    arquivo: "09-telefone-alterado",
    painel: "Phone number changed",
    assunto: "O telefone da sua conta foi alterado",
    html: moldura(
      "Telefone alterado",
      `<p>O telefone da sua conta foi alterado.</p>
       <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
         <tr><td style="padding:8px 0;color:#6b7280;width:42%">Antes</td>
             <td style="padding:8px 0"><strong>{{ .OldPhone }}</strong></td></tr>
         <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #eee">Agora</td>
             <td style="padding:8px 0;border-top:1px solid #eee"><strong>{{ .Phone }}</strong></td></tr>
       </table>
       ${naoFuiEu("Redefina a senha e desfaça a alteração do telefone.")}
       ${QUANDO}`
    ),
  },
  {
    arquivo: "10-login-ligado",
    painel: "Sign-in method linked",
    assunto: "Um novo jeito de entrar foi ligado na sua conta",
    html: moldura(
      "Novo método de acesso",
      `<p>A conta <strong>{{ .Email }}</strong> passou a aceitar entrada por
          <strong>{{ .Provider }}</strong>.</p>
       <p>A partir de agora, quem tiver acesso a esse método entra na sua conta.</p>
       ${naoFuiEu("Desligue esse método nas configurações da conta e troque sua senha.")}
       ${QUANDO}`
    ),
  },
  {
    arquivo: "11-login-desligado",
    painel: "Sign-in method removed",
    assunto: "Um jeito de entrar foi desligado da sua conta",
    html: moldura(
      "Método de acesso removido",
      `<p>A entrada por <strong>{{ .Provider }}</strong> foi desligada da conta
          <strong>{{ .Email }}</strong>.</p>
       <p>Se esse era o seu jeito habitual de entrar, use a senha ou o link de acesso.</p>
       ${naoFuiEu("Isso pode ser tentativa de te trancar para fora — redefina a senha agora.")}
       ${QUANDO}`
    ),
  },
  {
    arquivo: "12-verificacao-adicionada",
    painel: "Verification method added",
    assunto: "Verificação em duas etapas ativada",
    html: moldura(
      "Verificação em duas etapas ativada",
      `<p>Foi adicionada uma verificação do tipo <strong>{{ .FactorType }}</strong> à conta
          <strong>{{ .Email }}</strong>.</p>
       <p>A partir da próxima entrada, além da senha, será pedido esse segundo fator.</p>
       ${naoFuiEu("Alguém pode estar tentando prender a sua conta a um aparelho que não é o seu.")}
       ${QUANDO}`
    ),
  },
  {
    arquivo: "13-verificacao-removida",
    painel: "Verification method removed",
    assunto: "Verificação em duas etapas removida",
    html: moldura(
      "Verificação em duas etapas removida",
      `<p>A verificação do tipo <strong>{{ .FactorType }}</strong> foi removida da conta
          <strong>{{ .Email }}</strong>.</p>
       <p>A conta voltou a depender só da senha.</p>
       ${naoFuiEu("Reative a verificação em duas etapas e troque a senha — nessa ordem.")}
       ${QUANDO}`
    ),
  },
];

/* ====================================================================== */

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });

const todos = [...AUTENTICACAO, ...SEGURANCA];
for (const t of todos) {
  fs.writeFileSync(path.join(SAIDA, `${t.arquivo}.html`), t.html);
}

const indice =
  `# Templates de e-mail do Supabase Auth\n\n` +
  `Gerados por \`node ferramentas/gerar-emails-supabase.mjs\`. **Não edite os HTML à mão** —\n` +
  `edite o gerador e rode de novo, senão a próxima geração apaga a sua alteração.\n\n` +
  `Cole cada um em **Authentication → Emails** no painel do Supabase, no template de mesmo\n` +
  `nome, e copie o assunto da tabela.\n\n` +
  `## Autenticação — pedem uma ação\n\n` +
  `| arquivo | template no painel | assunto |\n|---|---|---|\n` +
  AUTENTICACAO.map((t) => `| \`${t.arquivo}.html\` | ${t.painel} | ${t.assunto} |`).join("\n") +
  `\n\n## Avisos de segurança — não pedem nada, avisam\n\n` +
  `São os que quase todo mundo deixa em branco, e são os que protegem a conta: é o e-mail\n` +
  `que chega quando alguém trocou a senha do contador às três da manhã. Sem ele, a invasão\n` +
  `só aparece quando já é tarde.\n\n` +
  `| arquivo | template no painel | assunto |\n|---|---|---|\n` +
  SEGURANCA.map((t) => `| \`${t.arquivo}.html\` | ${t.painel} | ${t.assunto} |`).join("\n") +
  `\n\n## Variáveis usadas\n\n` +
  "`{{ .ConfirmationURL }}` `{{ .Token }}` `{{ .Email }}` `{{ .NewEmail }}` `{{ .OldEmail }}` " +
  "`{{ .Phone }}` `{{ .OldPhone }}` `{{ .Provider }}` `{{ .FactorType }}`\n\n" +
  `## Antes de colar\n\n` +
  `A caixa **${CONTATO}** precisa existir: ela aparece em todos os avisos de segurança como\n` +
  `o canal de "não fui eu". Aviso de invasão que manda escrever para um endereço que devolve\n` +
  `erro é pior do que não avisar.\n`;

fs.writeFileSync(path.join(SAIDA, "LEIA-ME.md"), indice);
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`${todos.length} templates em supabase/emails/`);
for (const t of todos) console.log(`  ${t.arquivo}.html  ·  ${t.painel}`);
console.log(`\nÍndice com os assuntos em supabase/emails/LEIA-ME.md`);
