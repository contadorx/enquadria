/**
 * TESTE DO NÚCLEO DO COCKPIT — funções puras, sem banco, sem React.
 *
 * A regra "em que pé está esta empresa e qual é a próxima ação" é a única coisa
 * que o cockpit inteiro consulta. Se ela quebrar, a fila, a linha de produção e
 * os avisos mentem juntos — e mentem em documento assinado por contador.
 *
 * Como rodar (o projeto não tem runner; isto é TypeScript compilado na hora):
 *
 *   npx tsc lib/cockpit.ts lib/triagem.ts lib/motor.ts lib/premissas-padrao.ts \
 *     --outDir .tmp-testes --module esnext --target es2020 \
 *     --moduleResolution bundler --skipLibCheck
 *   node --input-type=module -e "
 *     import('./testes/cockpit.test.mjs')" # ou: copie este arquivo para .tmp-testes
 *
 * Mais simples, do jeito que foi validado:
 *   npx tsc ... --outDir .tmp-testes   (linha acima)
 *   cp testes/cockpit.test.mjs .tmp-testes/ && cd .tmp-testes
 *   sed -i 's|"./cockpit.js"|"./cockpit.js"|' cockpit.test.mjs && node cockpit.test.mjs
 */

import {
  montarFila,
  contarEsteira,
  ordenarFila,
  naMesa,
  filtrarPorEtapa,
  buscar,
} from "./cockpit.js";

const empresas = [
  { id: "1", cnpj: "11222333000181", razao_social: "Alfa Atacado Ltda", cnae_principal: "4611-7/00", faixa: "A", motivo_triagem: "B2B", prioridade_maxima: true, rbt12: 1200000, anexo: 1, contato_nome: "Ana", contato_email: "a@a.com" },
  { id: "2", cnpj: "22333444000192", razao_social: "Beta Serviços ME", cnae_principal: "6201-5/01", faixa: "B", motivo_triagem: "misto", prioridade_maxima: false, rbt12: null, anexo: 3, contato_nome: null, contato_email: null },
  { id: "3", cnpj: "33444555000103", razao_social: "Gama Padaria", cnae_principal: "5611-2/01", faixa: "D", motivo_triagem: "B2C", prioridade_maxima: false, rbt12: null, anexo: 1, contato_nome: null, contato_email: null },
  { id: "4", cnpj: "44555666000114", razao_social: "Delta MEI", cnae_principal: "4711-3/02", faixa: "MEI", motivo_triagem: "MEI", prioridade_maxima: false, rbt12: null, anexo: 1, contato_nome: null, contato_email: null },
];
const analises = [
  { id: "an1", empresa_id: "1", saida: "S4", re: 0.06, prioridade: true, parametros: {}, calculado_em: "2026-07-20T10:00:00Z" },
  { id: "an2", empresa_id: "2", saida: "S1", re: 0.2, prioridade: false, parametros: { origem_premissas: "lote_cnae" }, calculado_em: "2026-07-21T10:00:00Z" },
];
const laudos = [{ id: "l1", analise_id: "an1", numero: 7 }];
const termos = [];

const linhas = montarFila(empresas, analises, laudos, termos);
const por = Object.fromEntries(linhas.map((l) => [l.id, l]));

let falhas = 0;
const ok = (cond, msg) => {
  if (!cond) {
    falhas++;
    console.log("FALHOU:", msg);
  } else console.log("ok:", msg);
};

ok(por["1"].acao === "termo", "empresa com laudo e contato -> enviar termo");
ok(por["2"].acao === "confirmar", "análise de lote não emite laudo sem confirmar premissas");
ok(por["3"].acao === "analisar", "faixa D sem análise -> analisar");
ok(por["4"].acao === "fora", "MEI fica fora da janela");
ok(por["1"].laudo_numero === 7, "laudo casado por analise_id");
ok(por["2"].estimada === true, "premissa estimada detectada");

const e = contarEsteira(linhas);
ok(
  e.importadas === 4 && e.decidem === 2 && e.analisadas === 2 && e.laudos === 1 && e.assinados === 0,
  "esteira: " + JSON.stringify(e)
);

ok(naMesa(linhas, 600).valor === 0, "faixa A já com laudo sai da mesa");
ok(naMesa(montarFila(empresas, analises, [], []), 600).valor === 600, "faixa A sem laudo entra na mesa");

ok(ordenarFila(linhas)[0].id === "1", "prioridade máxima no topo");
ok(filtrarPorEtapa(linhas, "laudos").length === 1, "filtro por etapa laudo");
ok(buscar(linhas, "gama").length === 1, "busca por nome sem acento");
ok(buscar(linhas, "22333444").length === 1, "busca por CNPJ");
ok(buscar(linhas, "6201").length === 1, "busca por CNAE");

const antes = linhas.map((l) => l.id).join();
ordenarFila(linhas);
ok(antes === linhas.map((l) => l.id).join(), "ordenarFila não muta a lista original");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHAS`);
process.exit(falhas ? 1 : 0);
