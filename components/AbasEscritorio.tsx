"use client";

import { Abas } from "@/components/Abas";
import { ABAS_ESCRITORIO } from "@/lib/nav";

/**
 * Escritório é UM item de menu com quatro assuntos: configurações, equipe,
 * planos e indicação. Todos são coisas que a pessoa só abre quando já decidiu
 * mexer na administração — nunca no meio do trabalho.
 *
 * Virou um invólucro sobre `Abas` na reorganização de 03/08: eram três faixas
 * de abas iguais em arquivos diferentes, e a quarta seria a quarta cópia.
 */
export function AbasEscritorio() {
  return <Abas itens={ABAS_ESCRITORIO} />;
}
