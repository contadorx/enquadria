import { redirect } from "next/navigation";

/** Planos & Asaas viraram seção de Faturas & régua. Link antigo não vira 404. */
export default function PlanosRedirecionado() {
  redirect("/painel/negocio/cobrancas#planos");
}
