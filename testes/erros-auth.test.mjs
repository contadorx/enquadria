/**
 * O "{}" na tela de criar conta — o caso que originou este arquivo.
 *
 * Trava as duas regras: erro sem mensagem nunca vira texto cru na tela, e
 * 500 no cadastro é dito como falha do servidor (não como culpa da senha).
 */
import { traduzirErroAuth, interpretarCadastro } from "./erros-auth.js";
import fsE from "node:fs";
import pathE from "node:path";

// a raiz é descoberta: o executor roda a suíte de dentro de .tmp-rodar
const acharRaiz = (d) => {
  for (let i = 0; i < 6; i++) {
    if (fsE.existsSync(pathE.join(d, "app/login/page.tsx"))) return d;
    d = pathE.dirname(d);
  }
  return null;
};
const RAIZ_E = acharRaiz(process.cwd());

let falhas = 0;
// o executor conta as asserções pelas linhas que começam com "ok:"
const ok = (c, m) => { if (c) console.log("ok:", m); else { console.log("FALHOU:", m); falhas++; } };

const semRuido = (fn) => { const o = console.error; console.error = () => {}; try { return fn(); } finally { console.error = o; } };

// o caso real: corpo vazio virou a string "{}"
const r = semRuido(() => traduzirErroAuth({ message: "{}", status: 500 }, "criar"));
ok(!r.texto.includes("{}"), 'o texto "{}" nunca chega na tela');
ok(r.culpaDoServidor, "500 é apontado como falha do servidor");
ok(/conta não foi criada/i.test(r.texto), "diz que a conta NÃO foi criada");
ok(/smtp/i.test(r.texto), "aponta o SMTP, que é a causa comum");

// sem status nenhum e sem mensagem
const s = semRuido(() => traduzirErroAuth({}, "entrar"));
ok(s.texto.length > 0, "sempre existe um texto");
ok(!s.texto.includes("{}"), "nem no caso totalmente vazio");

// erros normais continuam legíveis e SEM alarme falso de servidor
const c = semRuido(() => traduzirErroAuth({ message: "Invalid login credentials", status: 400 }, "entrar"));
ok(/senha incorret/i.test(c.texto), "credencial errada é traduzida");
ok(!c.culpaDoServidor, "e não é culpa do servidor");

const d = semRuido(() => traduzirErroAuth({ message: "User already registered", status: 422 }, "criar"));
ok(/já existe uma conta/i.test(d.texto), "e-mail duplicado é traduzido");

// falha no envio do e-mail: a informação decisiva é que a conta não existe
const m = semRuido(() => traduzirErroAuth({ message: "Error sending confirmation email", status: 500 }, "criar"));
ok(/NÃO foi criada/.test(m.texto), "falha de e-mail avisa que a conta não existe");

// 500 ao ENTRAR não pode sugerir senha errada
const q = semRuido(() => traduzirErroAuth({ message: "{}", status: 500 }, "entrar"));
ok(/não é a sua senha/i.test(q.texto), "500 ao entrar inocenta a senha");

// mensagem desconhecida porém legível é mostrada, não engolida
const u = semRuido(() => traduzirErroAuth({ message: "Captcha verification failed", status: 400 }, "entrar"));
ok(u.texto === "Captcha verification failed", "mensagem desconhecida é preservada");



/* ── a tela travada: cadastro sem sessão ─────────────────────────────── */
/**
 * A conta era criada, o e-mail saía, e a tela não mexia um pixel. Com
 * confirmação de e-mail ligada o signUp volta SEM sessão, e o código
 * empurrava para /painel — que devolvia para o login. Nada visível.
 */
const semSessao = interpretarCadastro(
  { session: null, user: { id: "u1", identities: [{ id: "i1" }] } }, "leandro@x.com");
ok(semSessao.tipo === "confirmar", "sem sessão => pede confirmação, não navega");
ok(semSessao.tipo === "confirmar" && semSessao.email === "leandro@x.com",
   "e leva o e-mail para a tela mostrar");

const comSessao = interpretarCadastro(
  { session: { access_token: "t" }, user: { id: "u1", identities: [{ id: "i1" }] } }, "a@b.com");
ok(comSessao.tipo === "entrou", "com sessão => segue para o painel");

// o Supabase esconde o e-mail duplicado para não permitir descobrir cadastrados;
// devolve identities vazio e NENHUM erro. Sem tratar, a tela trava de novo.
const dup = interpretarCadastro({ session: null, user: { id: "u1", identities: [] } }, "a@b.com");
ok(dup.tipo === "jaExiste", "identities vazio => e-mail já cadastrado");

ok(interpretarCadastro(null, "a@b.com").tipo === "confirmar",
   "resposta vazia não quebra: cai no caso seguro");

/* ── a tela precisa falar de spam ────────────────────────────────────── */
// enquanto o domínio não tiver DKIM/SPF, a caixa de spam é o destino
// PROVÁVEL da primeira mensagem — o aviso não pode ser rodapé opcional.
if (RAIZ_E) {
  const pag = fsE.readFileSync(pathE.join(RAIZ_E, "app/login/page.tsx"), "utf8");
  ok(/spam/i.test(pag), "a tela de confirmação avisa sobre a caixa de spam");
  ok(/lixo eletr/i.test(pag), "e usa também o nome que o Outlook dá");
  ok(/n\u00e3o \u00e9 spam|não é spam/i.test(pag), "ensina a marcar como não-spam");
}

process.exit(falhas ? 1 : 0);
