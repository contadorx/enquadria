/**
 * O MESMO WEBHOOK, NO ENDEREÇO QUE JÁ FOI CADASTRADO.
 *
 * O que aconteceu, 04/08/2026: a rota vive em `/api/asaas`, o painel do Asaas
 * foi configurado com `/api/webhooks/asaas` — que é o caminho mais natural de
 * escrever e o que a maioria dos SaaS usa. Resultado: 404 em todo evento,
 * penalização automática do Asaas e a fila de eventos suspensa. A cobrança foi
 * gerada, o pagamento existia, e do lado de cá não havia fatura, nem e-mail,
 * nem acesso liberado.
 *
 * POR QUE UM ALIAS E NÃO SÓ "CORRIGE A URL LÁ": porque o endereço já está
 * digitado num painel de terceiro, e um dia vai ser digitado de novo — por
 * mim, por você, num ambiente novo. Endereço de webhook que já existe no mundo
 * é fato consumado; sustentar os dois custa este arquivo, e um 404 aqui custa
 * receita que ninguém vê sumir.
 *
 * NÃO HÁ CÓPIA DE LÓGICA: os dois caminhos entram na MESMA função. Duas
 * implementações do mesmo webhook divergiriam na primeira correção, e a que
 * ficasse para trás seria justamente a que ninguém está olhando.
 */
export { POST } from "@/app/api/asaas/route";
