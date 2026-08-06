import { Descadastrar } from "@/components/Descadastrar";

/**
 * A PORTA DE SAÍDA — pública, sem login, e de um clique.
 *
 * Quem chega aqui veio do rodapé de uma novidade. Duas decisões:
 *
 *   1. NÃO descadastra ao abrir a página. Cliente de e-mail e antivírus
 *      corporativo abrem TODOS os links da mensagem para escanear. Se o GET
 *      já removesse o endereço, metade da base sairia sozinha e ninguém
 *      entenderia por quê. Sai no clique, que é POST.
 *
 *   2. Diz, antes de qualquer coisa, o que NÃO vai parar de chegar. Muita
 *      gente clica achando que está cancelando a conta. Laudo, termo e
 *      cobrança são a conta da pessoa e continuam saindo.
 */

export const dynamic = "force-dynamic";

export default function DescadastroPage({
  searchParams,
}: {
  searchParams: { e?: string; t?: string };
}) {
  const email = (searchParams.e ?? "").trim();
  const token = (searchParams.t ?? "").trim();

  return (
    <main className="mx-auto flex min-h-screen max-w-[62ch] flex-col justify-center px-5 py-16">
      <div className="rounded border border-line bg-surface p-6 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Enquadria</p>
        <h1 className="mt-1 text-[19px] font-bold tracking-tight">Não receber mais novidades</h1>

        {!email || !token ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate2">
            Este endereço veio incompleto. Abra o link direto do rodapé do e-mail que você recebeu,
            ou responda àquela mensagem pedindo a remoção — eu faço na mão.
          </p>
        ) : (
          <>
            <p className="mt-3 text-[13.5px] leading-relaxed text-slate2">
              Você está prestes a remover <b>{email}</b> dos comunicados de produto do Enquadria.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Continuam chegando normalmente os e-mails da sua conta: laudo emitido, termo assinado,
              cobrança, recuperação de senha. Isso não cancela nem altera a sua assinatura.
            </p>
            <Descadastrar email={email} token={token} />
          </>
        )}
      </div>
    </main>
  );
}
