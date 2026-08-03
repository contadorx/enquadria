/**
 * O COCKPIT, em funções puras.
 *
 * O produto tinha sete telas que eram a mesma carteira vista de sete ângulos.
 * A unificação só é honesta se a REGRA de "em que pé está esta empresa e qual é
 * a próxima ação" viver num lugar só — senão a fila, a linha de produção e os
 * avisos voltam a divergir, que foi exatamente o que criou as sete telas.
 *
 * Nada aqui faz I/O: a mesma função roda no servidor, no cliente e no teste.
 */
import { ORIGEM_LOTE } from "./premissas-padrao.js";
const num = (x) => x == null || x === "" || !isFinite(Number(x)) ? null : Number(x);
/** faixas que exigem decisão nesta janela — o trabalho de verdade */
export const FAIXAS_TRABALHO = ["A", "B"];
export const FAIXAS_CURTAS = ["C", "D"];
export const FAIXAS_FORA = ["MEI", "FORA"];
/**
 * A próxima ação. A ordem dos testes É a esteira; ler de cima para baixo.
 *
 * "confirmar" existe porque emitir laudo em cima de premissa que o sistema
 * chutou pelo CNAE é o erro que não tem conserto: o papel sai assinado pelo
 * contador. Análise de lote não vira documento sem passar pela conferência.
 */
export function proximaAcao(l) {
    if (FAIXAS_FORA.includes(l.faixa))
        return "fora";
    if (!l.analise_id)
        return "analisar";
    if (l.estimada && !l.laudo_id)
        return "confirmar";
    if (!l.laudo_id)
        return "emitir";
    if (!l.termo_id)
        return l.tem_contato ? "termo" : "contato";
    if (!l.assinado)
        return "cobrar";
    return "pronto";
}
export function etapaDe(l) {
    if (l.assinado)
        return "assinado";
    if (l.laudo_id)
        return "laudo";
    if (l.analise_id)
        return "analisada";
    if (FAIXAS_TRABALHO.includes(l.faixa))
        return "decide";
    return "importada";
}
export function montarFila(empresas, analises, laudos, termos) {
    // uma análise por empresa na visão da fila: a mais recente manda
    const porEmpresa = new Map();
    for (const a of analises) {
        const atual = porEmpresa.get(a.empresa_id);
        if (!atual) {
            porEmpresa.set(a.empresa_id, a);
            continue;
        }
        const novaData = a.calculado_em ?? "";
        const atualData = atual.calculado_em ?? "";
        if (novaData > atualData)
            porEmpresa.set(a.empresa_id, a);
    }
    const laudoPorAnalise = new Map(laudos.map((l) => [l.analise_id, l]));
    const termoPorAnalise = new Map(termos.map((t) => [t.analise_id, t]));
    return empresas.map((e) => {
        const a = porEmpresa.get(e.id) ?? null;
        const laudo = a ? laudoPorAnalise.get(a.id) ?? null : null;
        const termo = a ? termoPorAnalise.get(a.id) ?? null : null;
        const parcial = {
            id: e.id,
            razao_social: e.razao_social,
            cnpj: e.cnpj,
            cnae: e.cnae_principal,
            faixa: (e.faixa ?? "C"),
            motivo: e.motivo_triagem,
            prioridade: !!e.prioridade_maxima || !!a?.prioridade,
            analise_id: a?.id ?? null,
            saida: a?.saida ?? null,
            re: num(a?.re ?? null),
            estimada: a?.parametros?.origem_premissas === ORIGEM_LOTE,
            laudo_id: laudo?.id ?? null,
            laudo_numero: laudo?.numero ?? null,
            termo_id: termo?.id ?? null,
            termo_token: termo?.token ?? null,
            assinado: !!termo && (termo.assinatura_status === "assinado" || !!termo.assinado_em),
            tem_contato: !!e.contato_email && !!e.contato_nome,
            rbt12: num(e.rbt12),
        };
        return { ...parcial, etapa: etapaDe(parcial), acao: proximaAcao(parcial) };
    });
}
const PESO_FAIXA = { A: 0, B: 1, C: 2, D: 3, MEI: 4, FORA: 5 };
/** o que ainda dá trabalho vem antes do que já está pronto */
const PESO_ACAO = {
    confirmar: 0,
    analisar: 1,
    emitir: 2,
    contato: 3,
    termo: 4,
    cobrar: 5,
    pronto: 6,
    fora: 7,
};
/** Prioridade máxima no topo, faixa A antes de B, pendência antes de pronto. */
export function ordenarFila(linhas) {
    return [...linhas].sort((x, y) => {
        if (x.prioridade !== y.prioridade)
            return x.prioridade ? -1 : 1;
        if (PESO_FAIXA[x.faixa] !== PESO_FAIXA[y.faixa])
            return PESO_FAIXA[x.faixa] - PESO_FAIXA[y.faixa];
        if (PESO_ACAO[x.acao] !== PESO_ACAO[y.acao])
            return PESO_ACAO[x.acao] - PESO_ACAO[y.acao];
        return x.razao_social.localeCompare(y.razao_social, "pt-BR");
    });
}
/** A linha de produção: cada número contém o seguinte. É um funil, não um menu. */
export function contarEsteira(linhas) {
    const decidem = linhas.filter((l) => FAIXAS_TRABALHO.includes(l.faixa));
    return {
        importadas: linhas.length,
        decidem: decidem.length,
        analisadas: linhas.filter((l) => l.analise_id).length,
        laudos: linhas.filter((l) => l.laudo_id).length,
        assinados: linhas.filter((l) => l.assinado).length,
    };
}
export const ETAPAS = [
    { chave: "importadas", rotulo: "importadas", ajuda: "toda a carteira que entrou no sistema" },
    { chave: "decidem", rotulo: "precisam decidir", ajuda: "faixas A e B — o que a triagem não descartou" },
    { chave: "analisadas", rotulo: "analisadas", ajuda: "com análise gravada, estimada ou confirmada" },
    { chave: "laudos", rotulo: "laudo emitido", ajuda: "documento numerado com a sua marca" },
    { chave: "assinados", rotulo: "termo assinado", ajuda: "prova de ciência do cliente, com verificação pública" },
];
/**
 * O QUE AINDA ESTÁ NA MESA — faixa A sem laudo × honorário de referência.
 *
 * Deliberadamente conservador: só a faixa A, só o que ainda não virou papel. O
 * honorário é premissa do contador, não promessa do sistema.
 */
export function naMesa(linhas, honorario) {
    const empresas = linhas.filter((l) => l.faixa === "A" && !l.laudo_id).length;
    return { empresas, valor: empresas * honorario };
}
/** Filtro por etapa da linha de produção — o clique no número filtra a fila. */
export function filtrarPorEtapa(linhas, etapa) {
    if (!etapa || etapa === "importadas")
        return linhas;
    if (etapa === "decidem")
        return linhas.filter((l) => FAIXAS_TRABALHO.includes(l.faixa));
    if (etapa === "analisadas")
        return linhas.filter((l) => l.analise_id);
    if (etapa === "laudos")
        return linhas.filter((l) => l.laudo_id);
    return linhas.filter((l) => l.assinado);
}
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Busca por nome, CNPJ ou CNAE — o que o contador digita quando procura uma empresa. */
export function buscar(linhas, termo) {
    const t = termo.trim();
    if (!t)
        return linhas;
    const alvo = semAcento(t);
    const digitos = t.replace(/\D/g, "");
    const porNumero = digitos.length >= 2;
    return linhas.filter((l) => {
        if (semAcento(l.razao_social).includes(alvo))
            return true;
        if (!porNumero)
            return false;
        if (l.cnpj.replace(/\D/g, "").includes(digitos))
            return true;
        return (l.cnae ?? "").replace(/\D/g, "").includes(digitos);
    });
}
export const ROTULO_ACAO = {
    analisar: "Analisar",
    confirmar: "Confirmar premissas",
    emitir: "Emitir laudo",
    contato: "Cadastrar contato",
    termo: "Enviar termo",
    cobrar: "Cobrar assinatura",
    pronto: "Decidida",
    fora: "Fora da janela",
};
/** o que a ação faz quando o contador clica: no lugar, ou abrindo a gaveta */
export const ACAO_ABRE_GAVETA = {
    analisar: true,
    confirmar: true,
    emitir: false,
    contato: true,
    termo: false,
    cobrar: false,
    pronto: true,
    fora: true,
};
/** ações que fazem sentido em lote, com o rótulo do botão */
export const ACOES_LOTE = [
    {
        chave: "analisar",
        rotulo: "Analisar",
        ajuda: "aplica as premissas típicas do CNAE e grava a análise — marcada como estimada",
    },
    { chave: "emitir", rotulo: "Emitir laudos", ajuda: "gera o documento numerado de quem já tem análise" },
    { chave: "termo", rotulo: "Enviar termos", ajuda: "gera o termo e envia o link de assinatura a quem tem contato" },
];
