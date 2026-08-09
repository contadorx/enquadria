/**
 * A TELA DO LINK QUE NÃO ABRE MAIS — 08/08/2026.
 *
 * Os documentos por token não tinham validade nenhuma: um link reencaminhado em
 * setembro de 2026 abria a razão social, o CNPJ e a RBT12 de um cliente de
 * terceiro em 2033. A migration 0068 deu validade a todos; esta é a página que
 * quem chega depois disso vê.
 *
 * TRÊS DECISÕES:
 *
 * 1. NÃO É `notFound()`. "Página não encontrada" faz o cliente achar que o
 *    documento sumiu, ou que o escritório apagou algo — e a primeira ligação
 *    que ele dá é para reclamar. Dizer "este link venceu, o documento continua
 *    existindo" custa uma tela e evita a conversa inteira.
 *
 * 2. O CAMINHO DE VOLTA VEM JUNTO. `/verificar` confere o documento pelo
 *    número e pelo CNPJ, sem login e sem link — é exatamente a via que não
 *    depende de token, e é ela que prova que o papel na mão dele é verdadeiro.
 *
 * 3. VENCIDO E REVOGADO SÃO FATOS DIFERENTES. Um é o tempo, o outro é uma
 *    decisão do escritório. Misturar os dois numa frase só faria o cliente
 *    perguntar a coisa errada para a pessoa errada.
 */
export function LinkEncerrado({
  motivo,
  tipo = "documento",
}: {
  motivo: "expirado" | "revogado";
  tipo?: string;
}) {
  const revogado = motivo === "revogado";
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <div className="rounded-lg border border-line bg-surface p-7">
        <h1 className="text-[19px] font-bold tracking-tight text-ink">
          {revogado ? `Este link foi encerrado pelo escritório` : `Este link venceu`}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-slate2">
          {revogado ? (
            <>
              O escritório responsável encerrou o acesso por este endereço. O {tipo} continua
              existindo e não foi alterado — fale com o seu contador para receber um link novo.
            </>
          ) : (
            <>
              Links de {tipo} têm prazo de validade, para que um endereço reencaminhado não fique
              aberto indefinidamente com dados da sua empresa. O {tipo} continua existindo e não foi
              alterado.
            </>
          )}
        </p>

        <div className="mt-5 rounded-sm border border-linesoft bg-surface2 p-4">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            o documento segue verificável
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate2">
            Se você tem o documento em mãos, confira a autenticidade dele em{" "}
            <a href="/verificar" className="font-semibold text-accentdeep">
              enquadria.com.br/verificar
            </a>
            , informando o número impresso no rodapé e o CNPJ da empresa. Essa conferência não
            depende deste link e não expira.
          </p>
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Para receber uma via nova, procure o escritório contábil que emitiu o documento — é ele
          que responde tecnicamente por ele.
        </p>
      </div>
    </div>
  );
}
