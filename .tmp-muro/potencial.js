/**
 * POTENCIAL DA CARTEIRA — o "aha" do primeiro clique.
 *
 * A estratégia inteira do produto se apoia em mostrar ao contador, em segundos,
 * QUANTO DINHEIRO existe na carteira dele. O mapa de risco sem cifrão é um
 * relatório; com cifrão, é uma proposta comercial.
 *
 * Honestidade embutida: o número é (empresas analisáveis × honorário de
 * referência). O honorário é PREMISSA do contador, editável na tela, e o texto
 * deixa claro que é potencial de serviço a vender — não receita garantida.
 */
export const HONORARIO_PADRAO = 600;
export const HONORARIO_CURTO_PADRAO = 150;
export function calcularPotencial(c, honorario = HONORARIO_PADRAO, honorarioCurto = HONORARIO_CURTO_PADRAO) {
    const analises = c.A + c.B;
    const curtos = c.C + c.D;
    const fora = c.MEI + c.FORA;
    const total = analises + curtos + fora;
    const valor_analises = analises * honorario;
    const valor_curtos = curtos * honorarioCurto;
    return {
        analises,
        curtos,
        fora,
        total,
        honorario,
        honorario_curto: honorarioCurto,
        valor_analises,
        valor_curtos,
        valor_total: valor_analises + valor_curtos,
        pct_eliminado: total > 0 ? (curtos + fora) / total : 0,
    };
}
/**
 * O QUE CADA FAIXA SIGNIFICA — a camada informativa que faltava.
 * O contador não deve precisar adivinhar por que uma empresa está onde está,
 * nem o que fazer com ela.
 */
export const EXPLICA_FAIXA = {
    A: {
        titulo: "Urgente",
        oQueE: "CNAE de perfil empresarial dominante: vende para outras empresas, que vão exigir crédito integral de IBS/CBS a partir de 2027.",
        oQueFazer: "Analisar antes de 30/09 e registrar a decisão com laudo e termo. Comece por estas.",
        cobravel: true,
    },
    B: {
        titulo: "Avaliar",
        oQueE: "Perfil misto, ou B2B com folha alta e pouco crédito de compras. A conta pode ir para qualquer lado.",
        oQueFazer: "Analisar depois das urgentes. Muitas viram 'não optar' — mas a decisão precisa estar registrada.",
        cobravel: true,
    },
    C: {
        titulo: "Baixo risco",
        oQueE: "Sem perfil empresarial dominante identificado no CNAE.",
        oQueFazer: "Laudo curto confirmando o descarte. Serve de proteção e custa pouco tempo.",
        cobravel: true,
    },
    D: {
        titulo: "Descarte documentado",
        oQueE: "Varejo, alimentação, saúde ou serviço a pessoa física — o cliente final não aproveita crédito.",
        oQueFazer: "Laudo curto e termo de ciência. Documente o descarte e siga em frente.",
        cobravel: true,
    },
    MEI: {
        titulo: "MEI — fora da regra",
        oQueE: "O regime híbrido alcança apenas ME e EPP. MEI segue com alíquota fixa.",
        oQueFazer: "Nada a fazer nesta janela.",
        cobravel: false,
    },
    FORA: {
        titulo: "Já fora do Simples",
        oQueE: "Empresa inativa, baixada ou já em outro regime tributário.",
        oQueFazer: "Fora desta janela. Se estiver no Presumido ou Real, use o comparativo de regimes.",
        cobravel: false,
    },
};
/** frase de impacto do mapa, adaptada ao tamanho da carteira */
export function fraseDoMapa(p) {
    if (p.total === 0)
        return "Importe a carteira para ver o mapa.";
    if (p.analises === 0)
        return `Nenhuma empresa desta carteira exige análise completa nesta janela. Os ${p.curtos} laudos curtos ainda documentam o descarte.`;
    const horas = Math.round(p.total * 0.25);
    return `A triagem eliminou ${Math.round(p.pct_eliminado * 100)}% da carteira e apontou ${p.analises} empresas que precisam decidir até 30 de setembro. O levantamento manual levaria cerca de ${horas} horas.`;
}
