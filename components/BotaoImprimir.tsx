"use client";

/**
 * O BOTÃO QUE VIRA PDF.
 *
 * Ele chama a impressão do navegador, e é ali que mora o problema: a janela
 * que abre imprime, por padrão, com CABEÇALHO E RODAPÉ do navegador — a URL
 * do sistema, a data e "1/4" no pé de cada página. Num laudo que leva a marca
 * do escritório e vai para a mesa do cliente, isso denuncia a ferramenta e
 * estraga o documento; e ninguém desmarca uma opção que não sabe que existe.
 *
 * Duas linhas de texto resolvem o que nenhum CSS resolve: `@page` controla a
 * margem do conteúdo, mas não apaga o cabeçalho do navegador — só a caixinha
 * "Cabeçalhos e rodapés", que é do usuário, apaga.
 *
 * A dica pode ser desligada onde ela não cabe (o certificado, que é enfeite e
 * não peça técnica).
 */
export function BotaoImprimir({
  rotulo = "Baixar PDF",
  dica = true,
}: {
  rotulo?: string;
  dica?: boolean;
}) {
  return (
    <div className="no-print flex flex-col items-end gap-1">
      <button
        onClick={() => window.print()}
        className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-white"
      >
        {rotulo}
      </button>
      {dica && (
        <p className="max-w-[40ch] text-right text-[10.5px] leading-snug text-muted">
          Na janela que abrir, escolha <b>Salvar como PDF</b> e desmarque{" "}
          <b>Cabeçalhos e rodapés</b> — senão o PDF sai com a data e o endereço do sistema. Em{" "}
          <b>Margens</b>, deixe <b>Padrão</b>: o documento já tem a margem dele, e “Nenhuma”
          aperta o texto contra a borda.
        </p>
      )}
    </div>
  );
}
