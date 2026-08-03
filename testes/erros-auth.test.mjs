/**
 * O "{}" na tela de criar conta — o caso que originou este arquivo.
 *
 * Trava as duas regras: erro sem mensagem nunca vira texto cru na tela, e
 * 500 no cadastro é dito como falha do servidor (não como culpa da senha).
 */
import { traduzirErroAuth } from "./erros-auth.js";

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

process.exit(falhas ? 1 : 0);
