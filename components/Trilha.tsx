"use client";

import Link from "next/link";
import { useState } from "react";
import { SegurancaDoDado } from "./SegurancaDoDado";

/**
 * O ASSISTENTE E A TRILHA — a mesma peça em dois momentos.
 *
 * Na primeira vez ela é um assistente de quatro passos com um objetivo
 * declarado: sair daqui com o primeiro laudo emitido. Depois vira uma faixa
 * discreta com o próximo passo da carteira, e some sozinha quando não há mais
 * passo nenhum.
 *
 * NÃO EXISTE FLAG DE ONBOARDING NO BANCO. O passo atual é DERIVADO do que já
 * existe: tem escritório? tem carteira? tem análise? tem laudo? Um flag salvo
 * mente na primeira vez que alguém apaga a carteira ou entra por outro
 * caminho — e mentir sobre "onde você está" é pior do que não guiar.
 */

export interface EstadoTrilha {
  temEscritorio: boolean;
  empresas: number;
  naFila: number;
  analises: number;
  laudos: number;
  assinados: number;
  /** a empresa de maior prioridade que ainda tem trabalho pendente */
  proxima: { id: string; nome: string } | null;
  /**
   * 08/08/2026: o tipo prometia cinco valores e a fila produz oito. `contato`
   * chegava aqui e não tinha rótulo — a frase saía sem verbo ("— próximo:
   * ACME LTDA") e o botão caía no "Continuar" que este arquivo diz ter
   * eliminado. Declarar a lista inteira é o que faz o compilador cobrar o
   * rótulo da próxima ação que alguém inventar.
   */
  proximaAcao: AcaoDaFila | null;
  /**
   * Se este escritório JÁ emitiu laudo alguma vez, contado na tabela e não na
   * fila. Sem isto, arquivar a carteira fazia o onboarding recomeçar para quem
   * já tinha trabalhado — ver `primeiroCiclo`.
   */
  jaEmitiuAlgumaVez?: boolean;
}

export type AcaoDaFila = "analisar" | "confirmar" | "emitir" | "contato" | "termo" | "cobrar";

const ROTULO: Record<AcaoDaFila, string> = {
  analisar: "Analisar",
  confirmar: "Confirmar as premissas de",
  emitir: "Emitir o laudo de",
  contato: "Cadastrar o contato de",
  termo: "Enviar o termo de",
  cobrar: "Cobrar a assinatura de",
};

/**
 * ONDE O CLIQUE CAI. O que falta em `contato` é nome e e-mail do responsável,
 * e isso mora no Dossiê — o botão levava à aba de Análise, que é a tela onde o
 * contador não tem nada a fazer. O Cockpit já acertava isso; a Trilha, não.
 */
const ABA_DA_ACAO: Record<AcaoDaFila, "decisao" | "dossie"> = {
  analisar: "decisao",
  confirmar: "decisao",
  emitir: "decisao",
  contato: "dossie",
  termo: "decisao",
  cobrar: "decisao",
};

export function Trilha({
  estado,
  aoAbrirEmpresa,
}: {
  estado: EstadoTrilha;
  aoAbrirEmpresa: (id: string, aba: "decisao" | "dossie") => void;
}) {
  const [oculta, setOculta] = useState(false);
  if (oculta) return null;

  /**
   * O ONBOARDING NÃO RENASCE — conserto de 08/08/2026.
   *
   * `estado.laudos` vem da FILA, e a fila exclui empresa arquivada. Um
   * escritório que arquivou a carteira depois de trabalhá-la (o caminho normal
   * de fim de janela, e o único permitido quando já existe documento) via o
   * contador voltar a zero — e o assistente de quatro passos reaparecia
   * mandando "adicione a primeira empresa" para quem já emitiu laudo numerado.
   * Pior: o menu, que lê a tabela `laudos` direto, continuava tratando a mesma
   * pessoa como veterana. Duas fontes discordando na mesma tela.
   *
   * `jaEmitiuAlgumaVez` vem da contagem da tabela, sem filtro de arquivamento:
   * emitir laudo é um fato do passado e não desacontece.
   */
  const primeiroCiclo = estado.laudos === 0 && !estado.jaEmitiuAlgumaVez;

  /* ------------------------------------------------ assistente da 1ª vez */
  if (primeiroCiclo) {
    const passos: {
      n: number;
      titulo: string;
      texto: string;
      feito: boolean;
      extra?: React.ReactNode;
      cta: React.ReactNode;
    }[] = [
      {
        n: 1,
        titulo: "Identifique o escritório",
        texto: "Nome, CRC e logo. É o que vai na capa de cada laudo e termo — sem isso o entregável não tem marca.",
        feito: estado.temEscritorio,
        cta: (
          <Link href="/painel/config" className="btn">
            Preencher o escritório
          </Link>
        ),
      },
      {
        /**
         * O PASSO MAIS CARO DA TRILHA — e por que ele mudou de tamanho.
         *
         * "Suba a carteira" pede, de uma vez, o ativo do escritório: a lista
         * de clientes. É o ponto onde a pessoa hesita, e quem hesita aqui não
         * escreve perguntando — fecha a aba. O abandono não vira chamado,
         * vira silêncio.
         *
         * Duas mudanças, e as duas atacam a mesma fricção:
         *
         *   · O PEDIDO ENCOLHEU. Uma empresa basta para ver a triagem
         *     funcionando de ponta a ponta. Compromisso pequeno primeiro,
         *     carteira inteira depois de o valor estar na tela — não antes.
         *
         *   · A RESPOSTA VEIO PARA CÁ. As políticas existem e moram no
         *     rodapé, e ninguém abre rodapé no meio de uma tarefa. A
         *     informação precisa estar onde a dúvida acontece.
         */
        n: 2,
        titulo: "Comece por uma empresa",
        texto:
          "Cole UM CNPJ e veja a triagem funcionar. A carteira inteira sobe depois, por CSV.",
        feito: estado.empresas > 0,
        extra: <SegurancaDoDado compacto />,
        cta: (
          <Link href="/painel/importar" className="btn">
            Adicionar a primeira
          </Link>
        ),
      },
      {
        n: 3,
        titulo: "Faça a primeira análise",
        /**
         * O BECO DA CARTEIRA SEM FILA — conserto de 08/08/2026.
         *
         * Quando a carteira inteira cai em MEI ou fora do Simples (acontece, e
         * acontecia muito mais quando a coluna de anexo era lida como regime),
         * não há próxima empresa: o passo virava o "faça agora" da trilha com
         * um texto genérico e NENHUM botão. A pessoa ficava olhando um passo
         * marcado como pendente, sem ação e sem explicação — e a conclusão
         * óbvia é que o produto travou.
         *
         * Não travou: não há o que analisar, e isso é um resultado. O texto
         * passa a dizer isso, e o passo deixa de cobrar o que não existe.
         */
        texto: estado.proxima
          ? `Comece pela empresa de maior prioridade: ${estado.proxima.nome}. Cada pergunta explica por que está sendo feita.`
          : estado.empresas > 0
            ? "Nenhuma empresa desta carteira tem decisão a tomar nesta janela: MEI e quem já saiu do Simples ficam de fora. O laudo curto documenta a permanência."
            : "Depois da triagem, o cockpit aponta por qual empresa começar.",
        /* sem fila o passo não é pendência: cobrar trabalho que não existe é o
           que fazia a trilha parecer travada */
        feito: estado.analises > 0 || (estado.empresas > 0 && !estado.proxima),
        cta: estado.proxima ? (
          <button onClick={() => aoAbrirEmpresa(estado.proxima!.id, "decisao")} className="btn">
            Analisar {estado.proxima.nome}
          </button>
        ) : null,
      },
      {
        n: 4,
        titulo: "Emita o primeiro laudo",
        texto:
          "O documento sai numerado, com a sua marca e um código de verificação pública. Na sequência dá para enviar o termo ao cliente.",
        feito: estado.laudos > 0,
        /* O RÓTULO MENTIA. O passo 4 é "emita o laudo" e o botão dizia "fazer a
           análise" — o mesmo texto do passo 3. Quem chegava aqui com a análise
           pronta clicava procurando o emitir, caía no formulário que já tinha
           preenchido, e concluía que o sistema não habilitou a emissão. O
           destino continua a aba Analisar, porque é lá que o botão de emitir
           vive — mas o rótulo agora diz o que se vai fazer. */
        cta: estado.proxima ? (
          <button onClick={() => aoAbrirEmpresa(estado.proxima!.id, "decisao")} className="btn">
            {estado.analises > 0 ? "Emitir o laudo" : "Fazer a análise"}
          </button>
        ) : null,
      },
    ];

    const atual = passos.find((p) => !p.feito) ?? passos[passos.length - 1];

    return (
      <div className="mb-3 rounded border border-accent bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
              Primeiros passos
            </div>
            <h2 className="mt-1 text-[15px] font-bold text-ink">
              O objetivo daqui é um só: o seu primeiro laudo emitido.
            </h2>
          </div>
          <button
            onClick={() => setOculta(true)}
            className="text-[12px] font-semibold text-muted underline underline-offset-2"
          >
            ocultar
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          {passos.map((p) => {
            const ehAtual = p.n === atual.n;
            return (
              <div
                key={p.n}
                className={`flex flex-wrap items-start gap-3 rounded-sm border px-3 py-2.5 ${
                  ehAtual ? "border-accent bg-accentwash" : "border-linesoft bg-surface2"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                    p.feito ? "bg-verde text-white" : ehAtual ? "bg-ink text-white" : "bg-line text-muted"
                  }`}
                >
                  {p.feito ? "✓" : p.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] font-semibold ${p.feito ? "text-muted line-through" : ""}`}>
                    {p.titulo}
                  </div>
                  {ehAtual && !p.feito && (
                    <>
                      <div className="mt-0.5 text-[12.5px] text-slate2">{p.texto}</div>
                      {p.extra}
                    </>
                  )}
                </div>
                {ehAtual && !p.feito && p.cta && <div className="shrink-0">{p.cta}</div>}
              </div>
            );
          })}
        </div>

        <p className="mt-2.5 text-[11.5px] text-muted">
          Pode pular qualquer passo e voltar depois — nada aqui trava o resto do sistema.
        </p>

        <style dangerouslySetInnerHTML={{ __html: `
          .btn { display: inline-block; border-radius: 6px; background: #0B1220; color: #fff;
                 padding: 8px 14px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
        ` }} />
      </div>
    );
  }

  /* -------------------------------------------- trilha permanente, discreta */
  if (!estado.proxima || !estado.proximaAcao) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-linesoft bg-surface2 px-3.5 py-2.5">
      <p className="text-[12.5px] text-slate2">
        <b className="font-mono">{estado.naFila}</b> na fila ·{" "}
        <b className="font-mono">{estado.analises}</b> analisadas ·{" "}
        <b className="font-mono">{estado.laudos}</b> com laudo ·{" "}
        <b className="font-mono">{estado.assinados}</b> assinados
        <span className="text-muted">
          {" "}
          — próximo: {ROTULO[estado.proximaAcao] ?? "Continuar em"} {estado.proxima.nome}
        </span>
      </p>
      {/* "Continuar" não diz o que vai acontecer — e botão que não promete nada
          não é clicado. O rótulo é a própria próxima ação, que a faixa já
          calculou: "Analisar", "Emitir o laudo de", "Cobrar a assinatura de".
          A guarda de reserva continua, mas agora é rede e não regra: o mapa
          cobre as seis ações que a fila produz, e o tipo obriga quem criar a
          sétima a escrever o rótulo dela aqui. */}
      <button
        onClick={() => aoAbrirEmpresa(estado.proxima!.id, ABA_DA_ACAO[estado.proximaAcao!] ?? "decisao")}
        className="shrink-0 rounded-sm border border-ink px-3 py-1.5 text-[12.5px] font-semibold text-ink"
      >
        {ROTULO[estado.proximaAcao]?.replace(/ de$/, "") ?? "Continuar"}
      </button>
    </div>
  );
}
