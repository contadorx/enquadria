/**
 * A FRASE DO PRODUTO — uma, num lugar só. Decidida em 08/08/2026.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ESTAVA ERRADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O produto tinha SETE proposições de valor. A única frase idêntica nas seis
 * páginas públicas estava no RODAPÉ. O H1 da home, o de `/precos` ("uma análise
 * cobrada paga o ano") e o de `/como-funciona` ("da planilha ao laudo
 * assinado") vendiam três produtos diferentes — e a frase que de fato
 * diferenciava vivia no lead do hero e em nenhum outro lugar.
 *
 * Um contador decide em cinco segundos se aquilo é para ele. Sete versões
 * significam que nenhuma foi testada.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTA FRASE, E NÃO A DA TRIAGEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A frase segue o SERVIÇO, não o contrário. E a escolha do serviço saiu de uma
 * conta, não de gosto:
 *
 * Rodando a triagem do próprio produto sobre a distribuição setorial real dos
 * pequenos negócios brasileiros, a carteira típica se reparte em ~45% que
 * precisam decidir (faixas A e B) e ~54% de permanência a documentar (C e D).
 * Numa carteira de 200 clientes isso dá:
 *
 *   · laudo completo:  ~91 documentos · ~137 horas de trabalho
 *   · laudo curto:     ~108 documentos · ~27 horas
 *
 * Cento e trinta e sete horas são dezessete dias úteis — dentro de uma janela
 * de TRINTA DIAS em que o contador também entrega folha, DAS e obrigação
 * acessória. O mercado do laudo completo não é limitado por demanda: é limitado
 * pela agenda de quem compra.
 *
 * Liderar pela triagem era pior ainda: triagem não é entregável que alguém
 * paga. É como o contador DESCOBRE o trabalho. Vender o produto pela descoberta
 * é o motivo de a frase ter ficado vaga.
 *
 * O que cabe nas horas que existem, cobre 100% da carteira e o produto executa
 * quase sozinho — sem depender de reunião com o empresário sobre venda para PJ,
 * aproveitamento de crédito e poder de preço — é a DOCUMENTAÇÃO DA CARTEIRA
 * INTEIRA: laudo curto para quem não tem decisão, laudo completo para quem tem,
 * termo assinado para os dois. O completo vira o entregável de maior ticket
 * dentro do serviço, não o serviço.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COMO USAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `TITULO` é o H1 e o `<title>`. `LEAD` é o parágrafo abaixo dele. `CURTA` é
 * para onde não cabe frase — menu, e-mail, muro do plano, assunto.
 *
 * Se alguém precisar de uma variação, ela entra AQUI, com nome. Frase escrita
 * direto na página é como as sete nasceram.
 *
 * Nada aqui promete economia, receita ou resultado: o entregável é documento, e
 * quem decide e responde tecnicamente é o contador que assina.
 */

/** o H1 das páginas públicas e a espinha do `<title>` */
export const TITULO = "Saia da janela com a carteira inteira documentada";

/**
 * O parágrafo de apoio. Ele carrega o que a manchete não cabe: que a maioria
 * dos clientes NÃO tem decisão a tomar, e que isso também é entregável — que é
 * justamente a parte que o mercado não enxerga.
 */
export const LEAD =
  "De 1º a 30 de setembro de 2026, parte dos seus clientes do Simples precisa decidir sobre " +
  "IBS e CBS — e a maioria não precisa. O Enquadria separa os dois grupos, calcula a decisão " +
  "de quem tem uma a tomar e emite o documento dos dois: laudo com a sua marca, memória de " +
  "cálculo e termo de ciência assinado pelo cliente.";

/** onde não cabe frase: menu, assunto de e-mail, muro do plano */
export const CURTA = "A carteira inteira documentada na janela de IBS/CBS";

/**
 * A DISTINÇÃO, para quando a página tiver espaço para uma linha a mais.
 *
 * Ela nomeia o concorrente real — a planilha e o simulador —, que é contra o
 * que o contador compara na cabeça dele. Sem citar marca nenhuma: o que se
 * compara é a CATEGORIA de ferramenta, não um fornecedor.
 */
export const DISTINCAO =
  "Simulador calcula uma empresa. O Enquadria abre a sua carteira, diz quais precisam decidir " +
  "e documenta todas — inclusive as que ficam como estão.";

/**
 * As três provas que sustentam a frase, na ordem em que convencem. Usadas nas
 * páginas que têm espaço para lista.
 */
export const PROVAS = [
  {
    titulo: "Cobre a carteira inteira",
    texto:
      "Quem precisa decidir recebe laudo completo com memória de cálculo. Quem não precisa recebe laudo curto de permanência, com a mesma numeração e a mesma verificação pública.",
  },
  {
    titulo: "Cabe na janela",
    texto:
      "A triagem separa a carteira em segundos e o laudo curto sai sem depender de reunião com o cliente. O trabalho que sobra para você é o das empresas em que há decisão de verdade.",
  },
  {
    titulo: "Fica registrado",
    texto:
      "Cada documento sai numerado, com a marca do escritório e um código que o seu cliente confere sozinho. O termo de ciência registra quem decidiu o quê, e quando.",
  },
] as const;
