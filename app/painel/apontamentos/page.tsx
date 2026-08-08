import { ABAS_APRENDER } from "@/lib/nav";
import { Abas } from "@/components/Abas";
import { PainelApontamentos } from "@/components/PainelApontamentos";

export const dynamic = "force-dynamic";

/**
 * A TELA DO MONITOR.
 *
 * A Reforma mostra O QUE SAIU — uma linha do tempo, para ler. Esta mostra O QUE
 * FAZER: as mesmas normas cruzadas com a carteira, com a decisão de cada uma
 * registrada e o histórico do que já foi tratado.
 *
 * São duas telas e não uma porque são dois estados mentais: quem abre a Reforma
 * está se informando; quem abre esta está trabalhando. Misturar as duas faria a
 * leitura competir com a fila — e a fila sempre ganha, até o dia em que ninguém
 * mais lê nada.
 *
 * Sem item de menu novo: entra pelas mesmas abas de Aprender, ao lado da
 * Reforma e do Curso. O menu tem seis itens e já foi quinze.
 */
export default function ApontamentosPage() {
  return (
    <div>
      <Abas itens={ABAS_APRENDER} />

      <div className="mb-4">
        <h1 className="text-[19px] font-bold text-ink">Apontamentos da Reforma</h1>
        <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-slate2">
          Cada norma publicada é cruzada com a sua carteira todo dia às 5h. Aqui elas aparecem
          agrupadas: leia uma vez, decida em bloco, e abra só quem foge da regra.
        </p>
      </div>

      <PainelApontamentos />
    </div>
  );
}
