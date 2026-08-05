/**
 * MOTOR DE DECISÃO — IBS/CBS · regime híbrido do Simples Nacional
 *
 * Portado sem alteração da calculadora de validação (22/07/2026).
 * Toda regra fica aqui e é pura: sem I/O, sem Supabase, sem React.
 * Assim a mesma função roda no servidor, no cliente e no teste.
 *
 * PREMISSA CENTRAL, EM 2027-2028 — confirmada:
 *   CBS = alíquota de referência reduzida em 0,1 p.p. (LC 214/2025, art. 347)
 *   IBS = 0,05% estadual + 0,05% municipal (art. 344)
 *   → total efetivo ~8,8%, NÃO os 26,5% do regime pleno.
 *
 * QUANTO SAI DO DAS — ERA "A CONFIRMAR"; foi confirmado em 05/08/2026, e por um
 * caminho diferente do que este comentário supunha.
 *
 *   LC 214/2025, art. 519: os Anexos I a V da LC 123/2006 são SUBSTITUÍDOS pelos
 *   Anexos XVIII a XXII, com efeitos em 1º/01/2027. Nas tabelas novas as colunas
 *   "Cofins" e "PIS/Pasep" deixam de existir e entram "CBS" e "IBS" — com soma
 *   idêntica nas faixas 1 a 5 (Anexo I: 12,74 + 2,76 = 15,50 = 15,33 + 0,17;
 *   Anexo II: 11,51 + 2,49 = 14,00 = 13,85 + 0,15).
 *
 *   O dispositivo operativo é a LC 123/2006, art. 13, § 9º (redação da
 *   LC 227/2026): "as parcelas a eles relativas não serão cobradas pelo regime
 *   único". ICMS e ISS PERMANECEM no DAS em 2027-2028 — a saída em degraus
 *   começa em 2029 e a revogação plena é de 2033 (art. 543). Por isso eles não
 *   entram em `cl`: são pagos igual, optando ou não.
 *
 *   Consequência: `sharePC` está certo, e continua certo em 2027. O que mudou
 *   foi a fundamentação impressa no laudo — corrigida em lib/laudo.
 *
 * O QUE CONTINUA ABERTO — não implementar antes da resposta normativa:
 *   · faixas 6 dos Anexos XVIII-XXII: indício de renormalização (Anexo I com
 *     CBS 34,02% contra os 34,40% de hoje), fonte única e conta que não fecha;
 *   · teto de 5% do ISS (LC 123, art. 18, § 16): o excedente é redistribuído aos
 *     tributos federais, o que ELEVA a fatia que sai do DAS em serviço acima de
 *     ~1,9 mi de RBT12. Erro medido de até 16% no `das` (Anexo IV, faixa 5,
 *     RBT12 3,33 mi: 3,6258% → 4,2097%), com 2,7% das saídas trocando. Falta
 *     saber se a regra sobrevive aos Anexos novos e se alcança a coluna CBS.
 */
/** S4 e S5 são recomendações de OPTAR; diferem no motivo, não no destino. */
export function ehOptar(s) {
    return s === "S4" || s === "S5";
}
export const PARAMETROS_2027 = {
    aliquota: 0.088,
    das: 0.01473,
    fronteiraMin: 0.8,
    fronteiraMax: 1.2,
    rqMin: 0.3,
    sublimite: 3600000,
    bandaSublimite: 0.05,
    absorcaoMax: 0.01,
};
/**
 * CENÁRIO ALTERNATIVO DE ALÍQUOTA — 9,4%.
 *
 * A decisão de setembro é tomada ANTES de a alíquota existir: a referência de
 * IBS/CBS só é fixada por Resolução do Senado, e o prazo é 31/10/2026 — um mês
 * DEPOIS de a janela fechar. Um laudo que traz um número só esconde do
 * empresário o único risco que ele não pode controlar. Por isso todo laudo sai
 * com as duas contas.
 *
 * 9,4% não tem norma: é sensibilidade declarada, e o documento diz isso.
 */
export const ALIQUOTA_ALTERNATIVA = 0.094;
export function carimboAliquota(aliquota, consultadoEm) {
    return {
        aliquota,
        alternativa: ALIQUOTA_ALTERNATIVA,
        fixada: false,
        fixacao_ate: "31/10/2026",
        fonte: "Estimativa de trabalho para 2027: CBS na alíquota de referência reduzida em 0,1 ponto " +
            "percentual, somada ao IBS de 0,1% (0,05% estadual e 0,05% municipal), na forma da " +
            "EC 132/2023 e da LC 214/2025. A alíquota de referência é fixada por Resolução do Senado " +
            "Federal, com prazo até 31/10/2026 — depois do fechamento da janela de opção.",
        nota_alternativa: "O cenário de 9,4% não decorre de norma publicada: é sensibilidade declarada, para medir o " +
            "efeito de a alíquota de referência ser fixada acima da estimativa de trabalho.",
        consultado_em: consultadoEm,
    };
}
export const ANEXOS_SIMPLES = {
    // Anexo I — Comércio
    // Anexo XVIII (= I) — Comércio · sharePC = CBS + IBS
    1: [
        { teto: 180000, nominal: 0.04, deduzir: 0, sharePC: 0.155 }, // 15,33 + 0,17
        { teto: 360000, nominal: 0.073, deduzir: 5940, sharePC: 0.155 },
        { teto: 720000, nominal: 0.095, deduzir: 13860, sharePC: 0.155 },
        { teto: 1800000, nominal: 0.107, deduzir: 22500, sharePC: 0.155 },
        { teto: 3600000, nominal: 0.143, deduzir: 87300, sharePC: 0.155 },
        { teto: 4800000, nominal: 0.189, deduzir: 378000, sharePC: 0.3402 }, // 6ª: 18,90% · CBS 34,02, sem IBS
    ],
    // Anexo XIX (= II) — Indústria
    2: [
        { teto: 180000, nominal: 0.045, deduzir: 0, sharePC: 0.14 }, // 13,85 + 0,15
        { teto: 360000, nominal: 0.078, deduzir: 5940, sharePC: 0.14 },
        { teto: 720000, nominal: 0.1, deduzir: 13860, sharePC: 0.14 },
        { teto: 1800000, nominal: 0.112, deduzir: 22500, sharePC: 0.14 },
        { teto: 3600000, nominal: 0.147, deduzir: 85500, sharePC: 0.14 },
        { teto: 4800000, nominal: 0.299, deduzir: 720000, sharePC: 0.2522 }, // 6ª: 29,90% · CBS 25,22
    ],
    // Anexo XX (= III) — Serviços (fator R ≥ 28% e serviços do §5º-B)
    3: [
        { teto: 180000, nominal: 0.06, deduzir: 0, sharePC: 0.156, shareISS: 0.335 }, // 15,43 + 0,17
        { teto: 360000, nominal: 0.112, deduzir: 9360, sharePC: 0.171, shareISS: 0.32 }, // 16,91 + 0,19
        { teto: 720000, nominal: 0.135, deduzir: 17640, sharePC: 0.166, shareISS: 0.325 }, // 16,41 + 0,19 (redação da LC 227/2026)
        { teto: 1800000, nominal: 0.16, deduzir: 35640, sharePC: 0.166, shareISS: 0.325 },
        { teto: 3600000, nominal: 0.21, deduzir: 125640, sharePC: 0.156, shareISS: 0.335 },
        { teto: 4800000, nominal: 0.329, deduzir: 648000, sharePC: 0.1929 }, // 6ª: 32,90% · CBS 19,29, sem ISS
    ],
    // Anexo XXI (= IV) — Serviços (construção, limpeza, advocacia; sem CPP no DAS)
    4: [
        { teto: 180000, nominal: 0.045, deduzir: 0, sharePC: 0.215, shareISS: 0.445 }, // 21,26 + 0,24
        { teto: 360000, nominal: 0.09, deduzir: 8100, sharePC: 0.25, shareISS: 0.4 }, // 24,73 + 0,27
        { teto: 720000, nominal: 0.102, deduzir: 12420, sharePC: 0.24, shareISS: 0.4 },
        { teto: 1800000, nominal: 0.14, deduzir: 39780, sharePC: 0.23, shareISS: 0.4 },
        { teto: 3600000, nominal: 0.22, deduzir: 183780, sharePC: 0.22, shareISS: 0.4 },
        { teto: 4800000, nominal: 0.329, deduzir: 828000, sharePC: 0.247 }, // 6ª: 32,90% · CBS 24,70, sem ISS
    ],
    // Anexo XXII (= V) — Serviços intensivos em conhecimento (fator R < 28%)
    5: [
        { teto: 180000, nominal: 0.155, deduzir: 0, sharePC: 0.1715, shareISS: 0.14 }, // 16,96 + 0,19
        { teto: 360000, nominal: 0.18, deduzir: 4500, sharePC: 0.1715, shareISS: 0.17 },
        { teto: 720000, nominal: 0.195, deduzir: 9900, sharePC: 0.1815, shareISS: 0.19 }, // 17,95 + 0,20
        { teto: 1800000, nominal: 0.205, deduzir: 17100, sharePC: 0.1915, shareISS: 0.21 }, // 18,94 + 0,21
        { teto: 3600000, nominal: 0.23, deduzir: 62100, sharePC: 0.1715, shareISS: 0.235 },
        { teto: 4800000, nominal: 0.304, deduzir: 540000, sharePC: 0.1978 }, // 6ª: 30,40% · CBS 19,78, sem ISS
    ],
};
export const TETO_ISS = {
    // Anexo XX: CBS 23,20% + IBS 0,26%
    3: { gatilho: 0.1492537, sharePCredistribuido: 0.2346, faixa: 5 },
    // Anexo XXI: CBS 36,27% + IBS 0,40%
    4: { gatilho: 0.125, sharePCredistribuido: 0.3667, faixa: 5 },
};
/** normaliza o índice do anexo; cai no Anexo I quando ausente ou inválido */
function anexoValido(anexo) {
    return anexo && ANEXOS_SIMPLES[anexo] ? anexo : 1;
}
/** faixa (1–6) de uma empresa a partir da RBT12; null quando a RBT12 é inválida */
export function faixaDe(anexo, rbt12) {
    if (!(rbt12 > 0))
        return null;
    const tabela = ANEXOS_SIMPLES[anexoValido(anexo)];
    for (let i = 0; i < tabela.length; i++) {
        if (rbt12 <= tabela[i].teto)
            return i + 1;
    }
    return tabela.length; // acima do teto do Simples: última faixa (sublimite tratado à parte)
}
/**
 * Alíquota EFETIVA do Simples a partir da RBT12 real: (RBT12 × nominal − PD) / RBT12.
 * Retorna null se a RBT12 for inválida (sem valor não há efetiva — usa-se o fallback).
 */
export function aliquotaEfetivaSimples(anexo, rbt12) {
    const f = faixaDe(anexo, rbt12);
    if (f == null)
        return null;
    const faixa = ANEXOS_SIMPLES[anexoValido(anexo)][f - 1];
    return Math.max((rbt12 * faixa.nominal - faixa.deduzir) / rbt12, 0);
}
/**
 * O TETO DE 5% DO ISS aplicado a uma faixa — devolve null quando não morde.
 *
 * A conta da lei não é "reduzir o ISS e reescalar tudo": é literal —
 *   ISS = 5 pontos percentuais
 *   demais = (alíquota efetiva − 5%) × percentual da tabela de redistribuição
 *
 * Então `das` deixa de ser `efetiva × sharePC` e passa a ser
 * `(efetiva − 0,05) × sharePCredistribuido`.
 */
function aplicarTetoISS(anexo, faixa, efetiva, sharePCtabela, exercicio = 2027) {
    const regra = TETO_ISS[anexo];
    const shareISS = anexoNoExercicio(anexo, exercicio)?.[faixa - 1]?.shareISS;
    /**
     * `regra.faixa !== faixa` é REDUNDANTE hoje, e fica de propósito.
     *
     * Medido: desligar essa condição não muda nenhum resultado, porque o gatilho
     * de alíquota efetiva já sozinho impede que o teto morda fora da 5ª faixa
     * (Anexo III faixa 4, no topo: 14,02% contra gatilho de 14,92537%). Ou seja,
     * ela não detecta nada — hoje.
     *
     * Continua aqui porque a redundância é entre uma condição ESTRUTURAL (a nota
     * de rodapé fala da 5ª faixa) e uma NUMÉRICA (o gatilho). No dia em que a
     * tabela mudar — e ela muda em 2029 —, a numérica pode deixar de proteger e a
     * estrutural continua. Guarda barata contra mudança futura, não código morto.
     */
    if (!regra || regra.faixa !== faixa || shareISS == null)
        return null;
    const issSemTeto = efetiva * shareISS;
    if (!(issSemTeto > 0.05) || !(efetiva > regra.gatilho))
        return null;
    return {
        das: Math.max(efetiva - 0.05, 0) * regra.sharePCredistribuido,
        teto_iss: {
            gatilho: regra.gatilho,
            sharePC_tabela: sharePCtabela,
            /* o sharePC EQUIVALENTE, para o laudo poder mostrar um número comparável
               com o da tabela em vez de duas fórmulas diferentes */
            sharePC_aplicado: efetiva > 0 ? (Math.max(efetiva - 0.05, 0) * regra.sharePCredistribuido) / efetiva : 0,
            iss_sem_teto: issSemTeto,
        },
    };
}
/** nominal da 6ª faixa a partir de 2029 — sobe 0,10 p.p. e não volta a mudar */
const NOMINAL_6A_DE_2029 = { 1: 0.19, 2: 0.3, 3: 0.33, 4: 0.33, 5: 0.305 };
const PARTILHA_POR_EXERCICIO = {
    2029: {
        1: [{ sharePC: 0.189 }, { sharePC: 0.189 }, { sharePC: 0.1885 }, { sharePC: 0.1885 }, { sharePC: 0.1885 }, { sharePC: 0.344 }],
        2: [{ sharePC: 0.172 }, { sharePC: 0.172 }, { sharePC: 0.172 }, { sharePC: 0.172 }, { sharePC: 0.172 }, { sharePC: 0.255 }],
        3: [{ sharePC: 0.1895, shareISS: 0.3015 }, { sharePC: 0.203, shareISS: 0.288 }, { sharePC: 0.1985, shareISS: 0.2925 }, { sharePC: 0.1985, shareISS: 0.2925 }, { sharePC: 0.1895, shareISS: 0.3015 }, { sharePC: 0.195 }],
        4: [{ sharePC: 0.2595, shareISS: 0.4005 }, { sharePC: 0.29, shareISS: 0.36 }, { sharePC: 0.28, shareISS: 0.36 }, { sharePC: 0.27, shareISS: 0.36 }, { sharePC: 0.26, shareISS: 0.36 }, { sharePC: 0.25 }],
        5: [{ sharePC: 0.1855, shareISS: 0.126 }, { sharePC: 0.1885, shareISS: 0.153 }, { sharePC: 0.2005, shareISS: 0.171 }, { sharePC: 0.2125, shareISS: 0.189 }, { sharePC: 0.195, shareISS: 0.2115 }, { sharePC: 0.2 }],
    },
    2030: {
        1: [{ sharePC: 0.223 }, { sharePC: 0.223 }, { sharePC: 0.222 }, { sharePC: 0.222 }, { sharePC: 0.222 }, { sharePC: 0.344 }],
        2: [{ sharePC: 0.204 }, { sharePC: 0.204 }, { sharePC: 0.204 }, { sharePC: 0.204 }, { sharePC: 0.204 }, { sharePC: 0.255 }],
        3: [{ sharePC: 0.223, shareISS: 0.268 }, { sharePC: 0.235, shareISS: 0.256 }, { sharePC: 0.231, shareISS: 0.26 }, { sharePC: 0.231, shareISS: 0.26 }, { sharePC: 0.223, shareISS: 0.268 }, { sharePC: 0.195 }],
        4: [{ sharePC: 0.304, shareISS: 0.356 }, { sharePC: 0.33, shareISS: 0.32 }, { sharePC: 0.32, shareISS: 0.32 }, { sharePC: 0.31, shareISS: 0.32 }, { sharePC: 0.3, shareISS: 0.32 }, { sharePC: 0.25 }],
        5: [{ sharePC: 0.1995, shareISS: 0.112 }, { sharePC: 0.2055, shareISS: 0.136 }, { sharePC: 0.2195, shareISS: 0.152 }, { sharePC: 0.2335, shareISS: 0.168 }, { sharePC: 0.2185, shareISS: 0.188 }, { sharePC: 0.2 }],
    },
    2031: {
        1: [{ sharePC: 0.257 }, { sharePC: 0.257 }, { sharePC: 0.2555 }, { sharePC: 0.2555 }, { sharePC: 0.2555 }, { sharePC: 0.344 }],
        2: [{ sharePC: 0.236 }, { sharePC: 0.236 }, { sharePC: 0.236 }, { sharePC: 0.236 }, { sharePC: 0.236 }, { sharePC: 0.255 }],
        3: [{ sharePC: 0.2565, shareISS: 0.2345 }, { sharePC: 0.267, shareISS: 0.224 }, { sharePC: 0.2635, shareISS: 0.2275 }, { sharePC: 0.2635, shareISS: 0.2275 }, { sharePC: 0.2565, shareISS: 0.2345 }, { sharePC: 0.195 }],
        4: [{ sharePC: 0.3485, shareISS: 0.3115 }, { sharePC: 0.37, shareISS: 0.28 }, { sharePC: 0.36, shareISS: 0.28 }, { sharePC: 0.35, shareISS: 0.28 }, { sharePC: 0.34, shareISS: 0.28 }, { sharePC: 0.25 }],
        5: [{ sharePC: 0.2135, shareISS: 0.098 }, { sharePC: 0.2225, shareISS: 0.119 }, { sharePC: 0.2385, shareISS: 0.133 }, { sharePC: 0.2545, shareISS: 0.147 }, { sharePC: 0.242, shareISS: 0.1645 }, { sharePC: 0.2 }],
    },
    2032: {
        1: [{ sharePC: 0.291 }, { sharePC: 0.291 }, { sharePC: 0.289 }, { sharePC: 0.289 }, { sharePC: 0.289 }, { sharePC: 0.344 }],
        2: [{ sharePC: 0.268 }, { sharePC: 0.268 }, { sharePC: 0.268 }, { sharePC: 0.268 }, { sharePC: 0.268 }, { sharePC: 0.255 }],
        3: [{ sharePC: 0.29, shareISS: 0.201 }, { sharePC: 0.299, shareISS: 0.192 }, { sharePC: 0.296, shareISS: 0.195 }, { sharePC: 0.296, shareISS: 0.195 }, { sharePC: 0.29, shareISS: 0.201 }, { sharePC: 0.195 }],
        4: [{ sharePC: 0.393, shareISS: 0.267 }, { sharePC: 0.41, shareISS: 0.24 }, { sharePC: 0.4, shareISS: 0.24 }, { sharePC: 0.39, shareISS: 0.24 }, { sharePC: 0.38, shareISS: 0.24 }, { sharePC: 0.25 }],
        5: [{ sharePC: 0.2275, shareISS: 0.084 }, { sharePC: 0.2395, shareISS: 0.102 }, { sharePC: 0.2575, shareISS: 0.114 }, { sharePC: 0.2755, shareISS: 0.126 }, { sharePC: 0.2655, shareISS: 0.141 }, { sharePC: 0.2 }],
    },
    2033: {
        1: [{ sharePC: 0.495 }, { sharePC: 0.495 }, { sharePC: 0.49 }, { sharePC: 0.49 }, { sharePC: 0.49 }, { sharePC: 0.344 }],
        2: [{ sharePC: 0.46 }, { sharePC: 0.46 }, { sharePC: 0.46 }, { sharePC: 0.46 }, { sharePC: 0.46 }, { sharePC: 0.255 }],
        3: [{ sharePC: 0.491 }, { sharePC: 0.491 }, { sharePC: 0.491 }, { sharePC: 0.491 }, { sharePC: 0.491 }, { sharePC: 0.195 }],
        4: [{ sharePC: 0.66 }, { sharePC: 0.65 }, { sharePC: 0.64 }, { sharePC: 0.63 }, { sharePC: 0.62 }, { sharePC: 0.25 }],
        5: [{ sharePC: 0.3115 }, { sharePC: 0.3415 }, { sharePC: 0.3715 }, { sharePC: 0.4015 }, { sharePC: 0.4065 }, { sharePC: 0.2 }],
    },
};
/**
 * A tabela do anexo NO EXERCÍCIO pedido. 2027 e 2028 devolvem `ANEXOS_SIMPLES`
 * intacta — o caminho de produção de hoje não passa por nenhuma linha nova.
 */
export function anexoNoExercicio(anexo, exercicio = 2027) {
    const a = anexoValido(anexo);
    const base = ANEXOS_SIMPLES[a];
    const ajuste = PARTILHA_POR_EXERCICIO[exercicio];
    if (!ajuste)
        return base;
    const linhas = ajuste[a];
    return base.map((f, i) => ({
        ...f,
        nominal: i === 5 ? (NOMINAL_6A_DE_2029[a] ?? f.nominal) : f.nominal,
        sharePC: linhas[i].sharePC,
        shareISS: linhas[i].shareISS,
    }));
}
/**
 * O TETO DE 5% DO ISS NÃO ESTÁ PARAMETRIZADO DE 2029 EM DIANTE — de propósito.
 *
 * A nota de rodapé dos Anexos XX e XXI muda de ESTRUTURA a cada ano: o piso do
 * ISS desce em degraus (5% → 4,5% → 4% → 3,5% → 3%) e a parcela que sobra passa
 * a ser dividida entre um ISS fixo e um IBS fixo, com fatores próprios. Pior: o
 * texto compilado traz DUAS redações para os mesmos anos (a original e a da LC
 * 227/2026), com fatores diferentes.
 *
 * Duas consultas normativas já foram reprovadas neste projeto por inventarem
 * exatamente este tipo de número. Aqui a resposta é: o motor calcula o `das`
 * SEM o teto — que é o valor MENOR, portanto o viés é contra optar — e MARCA a
 * análise como tendo teto de ISS indefinido, para o laudo dizer.
 *
 * Vale só onde o teto morderia: Anexos III e IV, 5ª faixa, acima do gatilho.
 */
export function tetoISSIndefinido(anexo, faixa, efetiva, exercicio) {
    if (exercicio < 2029)
        return false;
    const regra = TETO_ISS[anexo];
    return !!regra && regra.faixa === faixa && efetiva > regra.gatilho;
}
/**
 * dDAS EFETIVO por empresa — o número que entra no motor como `das`.
 *
 * Com RBT12 real → alíquota efetiva daquela RBT12 × sharePC da faixa, com o
 *                  teto de 5% do ISS aplicado quando ele morde.
 * Sem RBT12     → FALLBACK CONSERVADOR: alíquota nominal (topo da faixa) ×
 *                 sharePC, na faixa informada (ou faixa 1 se nada vier). Nunca
 *                 subestima o custo, e o laudo marca a premissa como estimada.
 */
export function dDASefetivo(anexo, rbt12, faixaFallback, 
/* o exercício da tabela. 2027 por padrão: o caminho de produção de hoje não
   muda de comportamento por causa do desbloqueio de 2029+. */
exercicio = 2027) {
    const a = anexoValido(anexo);
    const tabela = anexoNoExercicio(a, exercicio);
    if (rbt12 && rbt12 > 0) {
        const f = faixaDe(a, rbt12);
        const faixa = tabela[f - 1];
        const efetiva = Math.max((rbt12 * faixa.nominal - faixa.deduzir) / rbt12, 0);
        const acimaDoTeto = rbt12 > tabela[tabela.length - 1].teto;
        const indefinido = tetoISSIndefinido(a, f, efetiva, exercicio);
        const teto = indefinido ? null : aplicarTetoISS(a, f, efetiva, faixa.sharePC, exercicio);
        return {
            das: teto ? teto.das : efetiva * faixa.sharePC,
            faixa: f,
            anexo: a,
            exercicio,
            ...(indefinido ? { teto_iss_indefinido: true } : {}),
            aliquota: efetiva,
            /* o sharePC devolvido é o EFETIVAMENTE usado: quem imprime o laudo não
               pode receber um número e ver outro na conta */
            sharePC: teto ? teto.teto_iss.sharePC_aplicado : faixa.sharePC,
            rbt12,
            fonte: "efetiva",
            acimaDoTeto,
            ...(teto ? { teto_iss: teto.teto_iss } : {}),
        };
    }
    // FALLBACK — mudou em 26/07/2026, depois da validação externa.
    // Antes caía na faixa 3, e isso NÃO era conservador: um comércio realmente na
    // faixa 1 recebia `das` de 1,4725% em vez de 0,6200% — 2,4× o valor real. E
    // `das` maior significa `cl` menor, ou seja, o erro empurrava para OPTAR, que
    // é a direção perigosa. A faixa 1 é o menor `das` possível do anexo, portanto
    // o maior `cl`, portanto o viés contra optar. Melhor ainda é exigir a RBT12.
    const f = faixaFallback && tabela[faixaFallback - 1] ? faixaFallback : 1;
    const faixa = tabela[f - 1];
    return { das: faixa.nominal * faixa.sharePC, faixa: f, anexo: a, exercicio, aliquota: faixa.nominal, sharePC: faixa.sharePC, rbt12: null, fonte: "conservador" };
}
const TOLERANCIA_SOMA = 0.005;
/**
 * `segmentos` com um item só (ou vazio) cai no comportamento de sempre.
 * Participação zero ou negativa é descartada: linha em branco na tela não pode
 * virar peso na conta.
 */
export function dDASsegregado(segmentos, rbt12, faixaFallback) {
    const validos = (segmentos ?? []).filter((s) => s && s.share > 0 && anexoValido(s.anexo) === s.anexo);
    if (validos.length === 0)
        return dDASefetivo(null, rbt12, faixaFallback);
    if (validos.length === 1)
        return dDASefetivo(validos[0].anexo, rbt12, faixaFallback);
    const somaInformada = validos.reduce((t, s) => t + s.share, 0);
    const normalizado = Math.abs(somaInformada - 1) > TOLERANCIA_SOMA;
    const divisor = somaInformada > 0 ? somaInformada : 1;
    const calculados = validos.map((s) => {
        const base = dDASefetivo(s.anexo, rbt12, faixaFallback);
        const share = normalizado ? s.share / divisor : s.share;
        return { ...base, share, contribuicao: base.das * share };
    });
    const das = calculados.reduce((t, s) => t + s.contribuicao, 0);
    const aliquota = calculados.reduce((t, s) => t + s.aliquota * s.share, 0);
    const sharePC = das > 0 && aliquota > 0 ? das / aliquota : 0;
    // o anexo "da empresa" é o de maior receita — serve para rótulo e para o
    // alerta de fator R, nunca para a conta, que é sempre a soma acima
    const dominante = calculados.reduce((a, b) => (b.share > a.share ? b : a));
    return {
        das,
        faixa: dominante.faixa,
        anexo: dominante.anexo,
        aliquota,
        sharePC,
        rbt12: dominante.rbt12,
        fonte: calculados.every((s) => s.fonte === "efetiva") ? "efetiva" : "conservador",
        acimaDoTeto: calculados.some((s) => s.acimaDoTeto),
        segregado: true,
        segmentos: calculados,
        somaInformada,
        normalizado,
    };
}
/** discriminante para quem consome o resultado sem saber qual dos dois veio */
export function ehSegregado(d) {
    return d.segregado === true;
}
/**
 * ONDE O SERVIÇO FICA — III ou V, pelo fator R.
 *
 * `alertaFatorR` já cuida do caso de um anexo só. Com receita segregada a
 * pergunta muda de forma: não é "o anexo está certo?", é "a receita de serviço
 * está no anexo certo?". Devolve null quando não há serviço de fator R na
 * composição — construção e afins (Anexo IV) não entram nesta regra.
 */
export function fatorRSegregado(segmentos, folhaSobreReceita) {
    const f = folhaSobreReceita;
    if (f == null || !isFinite(f))
        return null;
    const servicos = (segmentos ?? []).filter((s) => (s.anexo === 3 || s.anexo === 5) && s.share > 0);
    if (servicos.length === 0)
        return null;
    const deveriaSer = f >= 0.28 ? 3 : 5;
    // sem spread de Set: o tsconfig do projeto compila para um alvo que não
    // itera Set sem downlevelIteration, e isto roda também nos testes compilados
    const declarados = servicos
        .map((s) => s.anexo)
        .filter((a, i, todos) => todos.indexOf(a) === i);
    const erradas = servicos.filter((s) => s.anexo !== deveriaSer);
    if (erradas.length === 0)
        return null;
    const total = erradas.reduce((t, s) => t + s.share, 0);
    return {
        fator: f,
        deveriaSer,
        declarado: declarados,
        texto: `Folha em ${pct(f)} da receita. Com fator R ${f >= 0.28 ? "igual ou acima" : "abaixo"} de 28%, ` +
            `a receita de serviço vai ao Anexo ${deveriaSer} — e ${pct(total)} da receita está declarada ` +
            `no Anexo ${erradas.map((s) => s.anexo).join(" e ")}. A alíquota do Simples muda, e com ela a ` +
            "parcela que sai do DAS. Confirme a segregação antes de emitir o laudo.",
    };
}
/** a participação tem de fechar 100% — usado pela tela para travar o salvamento */
export function somaSegmentos(segmentos) {
    return (segmentos ?? []).reduce((t, s) => t + (s.share > 0 ? s.share : 0), 0);
}
export function segmentosFechados(segmentos) {
    const s = somaSegmentos(segmentos);
    return Math.abs(s - 1) <= TOLERANCIA_SOMA;
}
/**
 * dDAS por anexo E faixa — espelho conservador (nominal × sharePC), derivado da
 * tabela oficial acima, para o modo demonstração e o `parametros_exercicio`.
 * A fonte única é ANEXOS_SIMPLES; aqui é só a projeção topo-da-faixa.
 */
export const DAS_POR_ANEXO_FAIXA = Object.fromEntries(Object.entries(ANEXOS_SIMPLES).map(([a, faixas]) => [
    Number(a),
    Object.fromEntries(faixas.map((f, i) => [i + 1, Math.round(f.nominal * f.sharePC * 1e5) / 1e5])),
]));
/** resolve o dDAS conservador de uma empresa; cai no anexo I faixa 1 se faltar dado */
export function dasDe(anexo, faixa) {
    return dDASefetivo(anexo, null, faixa).das;
}
/**
 * ÁRVORE DE DECISÃO — reordenada em 26/07/2026 após validação externa.
 *
 * A ordem anterior tinha três defeitos medidos num grid de 16.800 combinações:
 *
 *  1. `cl <= 0` decidia ANTES da qualificação. 12,9% dos casos caíam nessa regra
 *     e 4,5% recebiam "optar, condicionado a repasse" com `rq < 0,3` — empresa
 *     sem a quem transferir crédito, com repasse infinito no laudo, e que a
 *     triagem da carteira teria descartado. Agora a qualificação vem primeiro, e
 *     quem paga menos imposto sem depender de negociação tem saída PRÓPRIA (S5).
 *
 *  2. `preco` só era consultado quando `re < 0,8·fc`, ou seja, exatamente onde
 *     menos importava. Uma empresa SEM poder de renegociar e com a conta
 *     apertada (re/fc 0,85) recebia S3 "leve os dois cenários ao empresário",
 *     enquanto a mesma empresa com a conta mais FOLGADA (0,76) recebia S2 "a
 *     negociação não fecha". Economia melhor, recomendação pior. Agora o teste
 *     de `preco` vem antes da banda de fronteira: quem não consegue renegociar
 *     não está em fronteira nenhuma.
 *
 *  3. `corteS1` era inerte: com a banda capturando [0,8·fc ; 1,2·fc], tudo acima
 *     de 1,2 virava S1 com ou sem ele. O corte superior agora é o próprio
 *     `fronteiraMax`, que é o mesmo número com significado.
 *
 * A ordem abaixo é significativa. Ler de cima para baixo.
 */
export function decidir(r, p = PARAMETROS_2027) {
    const fMin = p.fronteiraMin ?? 0.8;
    const fMax = p.fronteiraMax ?? 1.2;
    const rqMin = p.rqMin ?? 0.3;
    const absorcaoMax = p.absorcaoMax ?? 0.01;
    const rq = r.b2b * r.qual;
    const ch = p.aliquota * (1 - r.cred);
    const cl = ch - p.das;
    const re = rq > 0 ? cl / rq : Number.POSITIVE_INFINITY;
    const fc = p.aliquota - p.das;
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * O REPASSE COMO O COMPRADOR SENTE — corrigido em 05/08/2026.
     *
     * A comparação era `re` contra `fc`, e ela ignorava um fato simples: quando
     * o preço sobe, o IBS/CBS incide sobre o preço MAIOR, e o comprador credita
     * esse valor maior. Parte do reajuste volta para ele como crédito — ele não
     * sente o aumento inteiro.
     *
     * A conta do comprador, escrita por extenso: ele paga `re` a mais e ganha
     * `a(1 + re) − das` de crédito adicional. Fecha quando
     *
     *     a(1 + re) − das  ≥  re      ⟺      re(1 − a)  ≤  a − das  =  fc
     *
     * Ou seja: basta comparar `re × (1 − a)` com `fc`. Não há iteração e não há
     * número novo — a correção é uma constante, porque a alíquota é constante.
     * Com a de 8,8%, dá 9,65% de folga a mais em toda a árvore.
     *
     * As bandas continuam sendo 0,8 e 1,2 vez o ganho do comprador, e o `re`
     * impresso no laudo continua sendo o reajuste de preço que a empresa precisa
     * negociar. O que mudou foi COM O QUE ele é comparado.
     * ═══════════════════════════════════════════════════════════════════════
     */
    const reLiquido = isFinite(re) ? re * (1 - p.aliquota) : re;
    /**
     * O REPASSE COM TABELA ÚNICA — é o próprio `cl`.
     *
     * `re = cl / rq` supõe preço diferenciado. Com uma tabela só, o custo se
     * espalha por toda a receita e o reajuste necessário passa a ser `cl` —
     * sempre menor, porque `rq < 1`. Não entra na decisão: o motor decide pelo
     * cenário mais difícil. Vai para o laudo, porque em boa parte dos casos
     * recusados pelo repasse diferenciado a tabela única fecharia.
     */
    const reUnico = cl;
    let saida;
    let motivo;
    let absorcaoCabe = false;
    if (rq < rqMin) {
        // Sem receita qualificada não há a quem transferir crédito. Vale inclusive
        // quando o híbrido sairia mais barato: o ganho não compensa a apuração por
        // fora numa empresa que vende para consumidor final ou para o Simples.
        saida = "S1";
        motivo = `Receita qualificada de ${pct(rq)} — abaixo do piso de ${pct(rqMin)}. Não há a quem transferir crédito em volume que justifique apurar por fora.`;
    }
    else if (cl <= 0) {
        // O híbrido custa MENOS em termos absolutos. Optar não depende de
        // renegociar preço nenhum — e por isso não é o mesmo conselho que o S4.
        saida = "S5";
        motivo = `Custo líquido negativo (${pct(cl)}): no regime regular a empresa paga menos pelos créditos das próprias compras, sem depender de renegociar preço.`;
    }
    else if (fc <= 0) {
        // Guarda para exercícios futuros: se o que sai do DAS alcançar a alíquota,
        // o comprador não ganha crédito extra e as bandas de fronteira se invertem.
        saida = "S1";
        motivo = "O que sai do DAS alcança a alíquota do regime regular: o comprador não teria crédito adicional a ganhar.";
    }
    else if (reLiquido > fc * fMax) {
        // O repasse necessário estoura o ganho do comprador. Não fecha para ninguém.
        saida = "S1";
        motivo =
            `Repasse necessário de ${pct(re)} no preço. Descontado o crédito que o próprio reajuste gera ` +
                `para o comprador, ele sente ${pct(reLiquido)} — ainda acima do ganho de ${pct(fc)} que teria. ` +
                "A conta não fecha para nenhum dos dois lados.";
    }
    else if (r.preco <= 1 && cl > absorcaoMax) {
        // A conta fecha, a negociação não, e o custo de simplesmente engolir é
        // grande demais. Preparar a janela seguinte.
        saida = "S2";
        motivo =
            `Sem poder de renegociar preço, o cenário realista é absorver ${pct(cl, 2)} da receita — ` +
                `acima do teto de ${pct(absorcaoMax, 2)} que este laudo trata como absorvível. ` +
                "A conta fecha, a negociação não acontece a tempo desta janela.";
    }
    else if (r.preco <= 1) {
        /**
         * ═══════════════════════════════════════════════════════════════════════
         * C8 — O VETO DO `preco` DEIXOU DE SER ABSOLUTO (05/08/2026).
         *
         * O QUE ESTAVA ERRADO. `preco <= 1` mandava tudo para S2 — "não optar
         * nesta janela, preparar março" — inclusive quando o custo de não negociar
         * NADA era de três décimos de ponto da receita. Medido na grade: S2 era
         * 31,7% dos casos, e em 682 deles a absorção mediana era 0,371% e a máxima
         * 0,981%. O laudo mandava esperar seis meses para não pagar 0,4%.
         *
         * E o que se perdia esperando não era pequeno: ao optar, o comprador passa
         * a receber ${fc} de crédito SEM aumento de preço nenhum. É o único
         * cenário do produto em que a empresa entrega vantagem comercial sem
         * precisar de conversa difícil.
         *
         * O QUE MUDOU. Quando a absorção cabe no teto, a saída passa a ser S3 —
         * "Zona de fronteira, decisão do empresário" —, NÃO S4. O motor não
         * recomenda absorver custo: ele não conhece a margem. Um ponto da RECEITA
         * pode ser um terço do LUCRO, e essa conta é do empresário.
         *
         * POR QUE UM PISO ABSOLUTO E NÃO O `parte_minima` DA PRESSÃO. O
         * `parte_minima` mede quanto da faixa de negociação a empresa precisa — é
         * a pergunta certa para quem VAI negociar. Quem se declarou travado não
         * vai. A pergunta dele é outra e é absoluta: "cabe na minha margem?". Por
         * isso o corte é em pontos de receita, e por isso o laudo é obrigado a
         * dizer que não conhece a margem.
         * ═══════════════════════════════════════════════════════════════════════
         */
        saida = "S3";
        absorcaoCabe = true;
        motivo =
            `Sem poder de renegociar preço, o cenário realista é ABSORVER ${pct(cl, 2)} da receita — ` +
                `dentro do teto de ${pct(absorcaoMax, 2)} deste laudo. Em troca, o comprador passa a receber ` +
                `${pct(fc)} de crédito sem nenhum aumento de preço. Quanto ${pct(cl, 2)} da receita pesa na ` +
                "margem é conta que este laudo não faz: a decisão é do empresário.";
    }
    else if (reLiquido >= fc * fMin) {
        // Cabe, mas por pouco: o motor não decide, o empresário decide.
        saida = "S3";
        motivo =
            `Repasse de ${pct(re)} no preço — ${pct(reLiquido)} depois de descontado o crédito que ele ` +
                `gera para o comprador, contra ganho de ${pct(fc)}. Fica dentro da banda de fronteira ` +
                `(${fMin}× a ${fMax}× o ganho do comprador): a conta cabe, mas por pouco.`;
    }
    else {
        saida = "S4";
        motivo =
            `Repasse de ${pct(re)} no preço, que o comprador sente como ${pct(reLiquido)} porque parte volta ` +
                `como crédito. Contra ganho de ${pct(fc)}, sobra folga de ` +
                `${((fc - reLiquido) * 100).toFixed(1).replace(".", ",")} pontos para a negociação.`;
    }
    /**
     * BANDA DO SUBLIMITE — R$ 3,6 milhões.
     *
     * Perto do sublimite, ICMS e ISS saem do DAS por força do próprio Simples, e
     * a comparação entre ficar dentro e apurar por fora muda de natureza no meio
     * do exercício. O motor não tem como saber de que lado a empresa vai fechar o
     * ano — então devolve a decisão a quem tem: o empresário.
     *
     * Não vale para quem já caiu em S1 por falta de receita qualificada: ali não
     * há decisão a tomar, o sublimite não cria uma.
     */
    const sublimite = p.sublimite ?? 0;
    const banda = p.bandaSublimite ?? 0;
    const rbt12 = p.rbt12 ?? null;
    let bandaSublimite = false;
    if (sublimite > 0 &&
        banda > 0 &&
        rbt12 != null &&
        rbt12 > 0 &&
        Math.abs(rbt12 - sublimite) <= sublimite * banda &&
        rq >= rqMin) {
        bandaSublimite = true;
        saida = "S3";
        motivo =
            `RBT12 de ${moeda(rbt12)}, dentro da faixa de ${moeda(sublimite * (1 - banda))} a ` +
                `${moeda(sublimite * (1 + banda))} em torno do sublimite de ${moeda(sublimite)}. ` +
                "Ultrapassar o sublimite no curso do ano muda o que já sai do DAS e desloca a conta — " +
                "a decisão é do empresário, com os dois cenários à vista.";
    }
    // Prioridade é um SELO, não uma saída: uma empresa pode ser prioridade
    // e ainda assim receber "não optar". Descoberta da validação de 22/07.
    const prioridade = r.exig === 1 || (r.conc === 1 && rq > 0.7);
    /* a folga é medida na MESMA escala da decisão: sobre o repasse líquido. É ela
       que vira `ganho_anual` em reais, e o ganho real inclui o crédito que o
       reajuste gera. */
    return {
        rq, ch, cl, re,
        re_liquido: reLiquido,
        fc,
        folga: fc - reLiquido,
        re_unico: reUnico,
        saida, prioridade, motivo,
        banda_sublimite: bandaSublimite,
        absorcao_cabe: absorcaoCabe,
    };
}
/**
 * A TABELA ÚNICA FECHARIA ONDE A DIFERENCIADA NÃO FECHA?
 *
 * Medido em 1.694 combinações: em 636 delas sim, e em NENHUMA o inverso —
 * porque `re_unico = cl = re × rq` e `rq < 1`, então o repasse com tabela única
 * é sempre menor. O motor decide pelo cenário difícil de propósito; esta função
 * existe para o laudo poder dizer quando o outro caminho existe.
 *
 * O QUE ELA NÃO DIZ, e o laudo precisa dizer: com tabela única quem não credita
 * paga o aumento sem receber nada em troca. O ganho aparece na conta do
 * comprador PJ; a perda aparece na demanda do consumidor final, que nenhuma
 * fórmula deste motor enxerga. É decisão do empresário, com os dois números à
 * vista — não é conclusão do sistema.
 */
export function fechaComPrecoUnico(res, p = PARAMETROS_2027) {
    const fMax = p.fronteiraMax ?? 1.2;
    /**
     * O PISO DE RECEITA QUALIFICADA VALE AQUI TAMBÉM — e a primeira versão desta
     * função esquecia disso.
     *
     * Com `rq` de 10%, a tabela única "fecha" na aritmética: o reajuste é 4,2% e
     * o comprador ganha 7,3%. Só que 90% da receita paga o aumento sem receber
     * nada, e o motor já recusou o caso por VOLUME, não por preço. Oferecer no
     * laudo um caminho que a árvore descartou é fazer o documento contradizer a
     * própria recomendação — pego pelo teste, não pela leitura.
     */
    if (res.rq < (p.rqMin ?? 0.3))
        return false;
    if (res.cl <= 0 || res.fc <= 0)
        return false;
    /* o comprador sente o reajuste único descontado do crédito que ele gera —
       a mesma correção do repasse diferenciado */
    return res.re_unico * (1 - p.aliquota) <= res.fc * fMax;
}
export function pressaoComercial(res, p = PARAMETROS_2027) {
    /**
     * QUANDO NÃO HÁ NEGOCIAÇÃO, A SEÇÃO NÃO SAI. Três casos, e os três são
     * silêncio honesto em vez de tabela sem sentido:
     *
     *  · custo líquido negativo — a empresa já paga menos sozinha, não há o que
     *    pedir a ninguém;
     *  · receita qualificada abaixo do piso — não há com quem negociar, e a
     *    árvore já recusou por VOLUME. Imprimir uma faixa aqui daria à empresa um
     *    caminho que a recomendação nega duas páginas antes;
     *  · piso acima do teto — o repasse necessário é maior do que o crédito do
     *    comprador cobre. Não existe preço que sirva aos dois, e o motivo do S1
     *    já diz isso com todas as letras.
     *
     * A primeira versão devolvia um objeto degenerado no terceiro caso (faixa de
     * 42,5% a 8,0%, excedente zero). Uma tabela dessas no laudo é pior que
     * nenhuma: parece número, e não é. Pego pelo teste.
     */
    if (!isFinite(res.re) || res.cl <= 0 || res.fc <= 0)
        return null;
    if (res.rq < (p.rqMin ?? 0.3))
        return null;
    /* o comprador paga `p` a mais e ganha `a(1+p) − das`; zera em p = fc/(1−a) */
    const teto = res.fc / (1 - p.aliquota);
    const piso = res.re;
    const excedente = teto - piso;
    if (!(excedente > 0))
        return null;
    const parte = Math.min(piso / teto, 1);
    return {
        piso,
        teto,
        excedente,
        parte_minima: parte,
        /* os cortes são de LEITURA, não de decisão: nenhuma saída depende deles.
           Servem para o laudo escolher entre três frases. */
        nivel: parte >= 0.75 ? "apertada" : parte >= 0.5 ? "media" : "folgada",
        absorve: res.cl,
    };
}
export const SAIDAS = {
    S1: {
        titulo: "Não optar",
        descricao: "Perfil sem contrapartida comercial que justifique o custo. O híbrido aumentaria a carga sem retorno.",
        cor: "vermelho",
    },
    S2: {
        titulo: "Não optar nesta janela — preparar março",
        descricao: "A conta fecha, a negociação não. Plano de renegociação nos próximos meses e decisão na janela seguinte.",
        cor: "amarelo",
    },
    S3: {
        titulo: "Zona de fronteira — decisão do empresário",
        descricao: "O motor não decide. Apresente os dois cenários em reunião e registre a escolha com termo assinado.",
        cor: "neutro",
    },
    S4: {
        titulo: "Optar, condicionado a repasse",
        descricao: "Optar é vantajoso para os dois lados desde que o preço seja renegociado antes do fim da janela.",
        cor: "verde",
    },
    S5: {
        titulo: "Optar por vantagem direta",
        descricao: "No regime regular a empresa paga menos, pelos créditos das próprias compras — sem depender de renegociar preço com ninguém. Confirme se o custo de apurar por fora cabe no ganho.",
        cor: "verde",
    },
};
export const pct = (x, casas = 1) => !isFinite(x) ? "—" : `${(x * 100).toFixed(casas).replace(".", ",")}%`;
export const moeda = (x) => x == null || !isFinite(x)
    ? "—"
    : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/**
 * OS DOIS CENÁRIOS. A decisão é tomada antes de a alíquota existir; um laudo
 * com um número só esconde do empresário o risco que ele não controla.
 */
export function cenarios(r, p = PARAMETROS_2027) {
    return [
        {
            rotulo: `Estimativa de trabalho — ${pct(p.aliquota)}`,
            aliquota: p.aliquota,
            resultado: decidir(r, p),
            principal: true,
        },
        {
            rotulo: `Sensibilidade — ${pct(ALIQUOTA_ALTERNATIVA)}`,
            aliquota: ALIQUOTA_ALTERNATIVA,
            resultado: decidir(r, { ...p, aliquota: ALIQUOTA_ALTERNATIVA }),
            principal: false,
        },
    ];
}
/**
 * O NÚMERO EM REAIS.
 *
 * O laudo dava percentual, e percentual não se compara com honorário nem com
 * custo de apuração. Aqui vira R$/ano ao lado do custo de apurar por fora.
 *
 * HONESTIDADE EMBUTIDA: sem RBT12 não há receita, e sem receita não há R$ —
 * devolve null em vez de estimar. Sem custo declarado, não há payback: o laudo
 * omite a seção em vez de inventar a premissa.
 */
export function emReais(res, receita, custoAnual) {
    const r = receita != null && isFinite(receita) && receita > 0 ? receita : null;
    const c = custoAnual != null && isFinite(custoAnual) && custoAnual > 0 ? custoAnual : null;
    const ganho = r != null && isFinite(res.folga) ? res.folga * res.rq * r : null;
    const absorvido = r != null ? res.cl * r : null;
    const payback = ganho != null && c != null && ganho > 0 ? (c / ganho) * 12 : null;
    return {
        receita: r,
        ganho_anual: ganho,
        custo_anual: c,
        payback_meses: payback,
        absorvido_anual: absorvido,
    };
}
/**
 * TRÊS LINHAS, não um estudo. O que muda se a premissa mais frágil ceder.
 */
export function sensibilidade(r, p = PARAMETROS_2027, dinheiro) {
    const base = decidir(r, p);
    const linhas = [];
    // 1) receita qualificada 10 pontos menor
    const rqBase = r.b2b * r.qual;
    const rqMenor = Math.max(rqBase - 0.1, 0);
    const qualMenor = r.b2b > 0 ? rqMenor / r.b2b : 0;
    const cenarioRq = decidir({ ...r, qual: qualMenor }, p);
    linhas.push({
        titulo: "Receita qualificada 10 pontos menor",
        pergunta: `E se, em vez de ${pct(rqBase)}, apenas ${pct(rqMenor)} da receita for vendida a quem aproveita crédito?`,
        saida: cenarioRq.saida,
        re: isFinite(cenarioRq.re) ? cenarioRq.re : null,
        fc: cenarioRq.fc,
        folga: isFinite(cenarioRq.folga) ? cenarioRq.folga : null,
        efeito: cenarioRq.saida === base.saida
            ? "A recomendação não muda."
            : `A recomendação muda de ${base.saida} para ${cenarioRq.saida}.`,
    });
    // 2) o repasse não é aceito
    linhas.push({
        titulo: "O repasse de preço não é aceito",
        pergunta: "E se o cliente não aceitar o reajuste que equilibra a conta?",
        saida: null,
        re: null,
        fc: null,
        folga: null,
        efeito: `A empresa absorve o custo líquido de ${pct(base.cl)} da receita` +
            (dinheiro?.absorvido_anual != null
                ? `, o que representa ${moeda(dinheiro.absorvido_anual)} por ano na receita informada.`
                : ". Informe a RBT12 para converter em reais.") +
            " Sem repasse, a opção deixa de ser vantajosa.",
    });
    // 3) alíquota fixada acima da estimativa de trabalho
    const alt = decidir(r, { ...p, aliquota: ALIQUOTA_ALTERNATIVA });
    linhas.push({
        titulo: `Alíquota fixada em ${pct(ALIQUOTA_ALTERNATIVA)}`,
        pergunta: "E se a Resolução do Senado fixar a referência acima da estimativa de trabalho?",
        saida: alt.saida,
        re: isFinite(alt.re) ? alt.re : null,
        fc: alt.fc,
        folga: isFinite(alt.folga) ? alt.folga : null,
        efeito: alt.saida === base.saida
            ? "A recomendação não muda."
            : `A recomendação muda de ${base.saida} para ${alt.saida}.`,
    });
    return linhas;
}
/* ==========================================================================
 * FATIA 7 — precisão
 * ========================================================================== */
/**
 * PARTILHA PIS/COFINS POR EXERCÍCIO.
 *
 * `sharePC` estava fixo na tabela do anexo, e isso é verdade em 2027 e 2028 —
 * só a fatia federal migra para a CBS. De 2029 em diante ICMS e ISS começam a
 * sair do DAS em degraus anuais, e a fatia que deixa o DAS deixa de ser a
 * mesma. Não há partilha publicada para esses exercícios, então a função
 * RECUSA calcular em vez de projetar: número inventado em documento assinado
 * por contador não tem conserto.
 */
export const EXERCICIOS_PARAMETRIZADOS = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
export function sharePCDe(anexo, faixa, exercicio = 2027) {
    const tabela = anexoNoExercicio(anexo, exercicio);
    const f = tabela[faixa - 1];
    if (!f)
        return { valor: null, motivo: `Faixa ${faixa} inexistente no Anexo ${anexoValido(anexo)}.` };
    if (!EXERCICIOS_PARAMETRIZADOS.includes(exercicio)) {
        return {
            valor: null,
            motivo: `A partilha do DAS do exercício ${exercicio} não está parametrizada. As tabelas dos ` +
                "Anexos XVIII a XXII da LC 214/2025 vão de 2027 a 2033; fora desse intervalo o valor " +
                "precisa vir de norma, não de projeção.",
        };
    }
    return { valor: f.sharePC, motivo: `Partilha PIS/Cofins da faixa ${faixa} do Anexo ${anexoValido(anexo)}, vigente em ${exercicio}.` };
}
/** fator R = folha de 12 meses ÷ receita bruta de 12 meses */
export function fatorR(folha, receita) {
    if (!(receita > 0))
        return null;
    return folha / receita;
}
/**
 * ALERTA DE FATOR R — avisa, nunca bloqueia.
 *
 * A pergunta da folha é uma FAIXA ("15 a 30%"), não um número apurado: bloquear
 * a emissão com base nela travaria laudo legítimo. O aviso pede confirmação
 * explícita do anexo e segue; a confirmação fica registrada nos parâmetros.
 */
export function alertaFatorR(anexoDeclarado, folhaSobreReceita) {
    const a = anexoDeclarado ?? 0;
    const f = folhaSobreReceita;
    if (f == null || !isFinite(f))
        return null;
    if (a !== 3 && a !== 5)
        return null;
    if (a === 5 && f >= 0.28) {
        return {
            fator: f,
            anexoDeclarado: 5,
            anexoSugerido: 3,
            texto: `Folha declarada em ${pct(f)} da receita. Com fator R igual ou acima de 28% a atividade ` +
                "vai ao Anexo III, e a alíquota do Simples — logo, a parcela que sai do DAS — muda. " +
                "Confirme o anexo antes de emitir o laudo.",
        };
    }
    if (a === 3 && f < 0.28) {
        return {
            fator: f,
            anexoDeclarado: 3,
            anexoSugerido: 5,
            texto: `Folha declarada em ${pct(f)} da receita. Com fator R abaixo de 28% a atividade cai no ` +
                "Anexo V, com alíquota mais alta e outra parcela saindo do DAS. Confirme o anexo antes " +
                "de emitir o laudo.",
        };
    }
    return null;
}
export function derivarQual(d) {
    return Math.min(Math.max(d.fora_simples * (1 - d.sem_aproveitamento), 0), 1);
}
export function derivarCred(d) {
    return Math.min(Math.max(d.insumos + d.servicos + d.outros, 0), 1);
}
