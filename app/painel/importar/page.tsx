import { Importador } from "@/components/Importador";

export default function ImportarPage() {
  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Importar carteira</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Um CSV com a carteira do Simples. A triagem separa quem precisa decidir.
      </p>
      <div className="mt-5">
        <Importador />
      </div>
    </div>
  );
}
