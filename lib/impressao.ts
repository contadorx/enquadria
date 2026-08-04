/**
 * O CSS DE IMPRESSÃO — um só, para todos os documentos.
 *
 * Estava copiado em quatro lugares e já tinha divergido: o laudo com 18mm de
 * margem, o termo com 18/16, o relatório com 22, e só o laudo tinha as regras
 * que evitam os dois defeitos clássicos do PDF gerado pelo navegador —
 *
 *   · o cinza da interface impresso como fundo das sobras de página;
 *   · a linha de tabela partida no meio, entre uma página e outra.
 *
 * Isso importa porque o PDF do laudo vai para a mesa do cliente do contador.
 * Documento com margem diferente do termo da mesma empresa parece montado em
 * lugares diferentes — e é exatamente o que o white-label promete que não
 * acontece.
 *
 * A folha (`.sheet`) perde borda, sombra e canto arredondado na impressão: na
 * tela ela imita papel; no papel, ELA é o papel.
 */
export const CSS_IMPRESSAO = `
@media print {
  /* o cinza do app não é papel: sem isto o fundo sai impresso nas sobras */
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .doc { padding: 0 !important; max-width: none !important; }
  .sheet { border: none !important; border-radius: 0 !important; padding: 0 !important; box-shadow: none !important; }

  /* a LINHA não parte no meio; a TABELA pode continuar na página seguinte —
     travar a tabela inteira deixava meia página em branco */
  tr, li { page-break-inside: avoid; }
  thead { display: table-header-group; }
  /* título no pé da página, conteúdo na seguinte, é órfão */
  .sec, h1, h2 { page-break-after: avoid; }
  .quebra { page-break-before: always; }

  @page { margin: 18mm; }
}
`;
