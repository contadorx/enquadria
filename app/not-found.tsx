import Link from "next/link";
import { CascaPublica } from "@/components/CascaPublica";

/**
 * A PÁGINA QUE O CLIENTE DO SEU CLIENTE VÊ.
 *
 * Sem este arquivo, todo `notFound()` das páginas públicas — laudo, termo,
 * assinar, coleta, comparativo, abertura — caía na tela padrão do Next: fundo
 * branco, "404 | This page could not be found", em inglês, sem marca e sem
 * saída. Quem vê isso é o empresário que recebeu um link vencido, e a conclusão
 * dele é que o contador mandou link quebrado.
 *
 * O texto fala com ELE, não com o contador: a causa mais provável de alguém
 * chegar aqui é um link de documento que expirou ou foi reemitido — e a saída é
 * pedir outro a quem enviou, não procurar no site.
 */
export default function NaoEncontrada() {
  return (
    <CascaPublica largura="max-w-[720px]">
      <div className="rounded border border-line bg-surface p-8 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Página não encontrada
        </div>
        <h1 className="mt-2 text-[22px] font-bold text-ink">
          Este endereço não existe mais.
        </h1>
        <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-slate2">
          Se você chegou aqui por um link de <b>laudo</b>, <b>termo</b> ou <b>formulário</b>{" "}
          enviado pela sua contabilidade, ele provavelmente expirou ou foi substituído por uma
          versão nova. <b>Peça o link atualizado a quem enviou</b> — ele leva um minuto para
          gerar outro.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Ir para a página inicial
          </Link>
          <Link
            href="/verificar"
            className="rounded-sm border border-line px-4 py-2.5 text-[13px] font-semibold text-slate2"
          >
            Verificar um documento
          </Link>
        </div>
      </div>
    </CascaPublica>
  );
}
