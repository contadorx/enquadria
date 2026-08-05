import { redirect } from "next/navigation";

/**
 * Contas virou a seção de baixo da Visão em 05/08/2026 — duas rotas para a
 * mesma leitura faziam a pessoa checar as duas sempre, porque nenhuma ficava
 * na memória como "a completa".
 *
 * A rota continua existindo e redireciona: link salvo, e-mail antigo e a memória
 * muscular de quem já usava não podem virar 404 por causa de uma reorganização
 * nossa.
 */
export default function ContasRedirecionada() {
  redirect("/painel/negocio#contas");
}
