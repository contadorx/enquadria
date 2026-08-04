import { createClient } from "@/lib/supabase-server";
import { carregarContexto, planejar, separarFila, VARIAVEIS, type Envio } from "@/lib/reguas";
import { ReguaCartao, RodarReguas, LiberarReenvio, ConfigChave, ConfigNumero, type RegraUI } from "@/components/NegocioUI";

export const dynamic = "force-dynamic";

const GRUPOS = [
  {
    chave: "ativacao",
    titulo: "Ativação",
    explica:
      "Quem não importa a carteira nos primeiros dias raramente importa depois. Estes e-mails existem para vencer o primeiro obstáculo — não para vender.",
  },
  {
    chave: "conversao",
    titulo: "Conversão",
    explica:
      "O freemium do Enquadria é generoso de propósito: a triagem inteira é grátis e o contador só esbarra no limite quando vai emitir o terceiro laudo. Esse esbarrão é o momento comercial — e essas réguas não dependem da idade da conta, e sim do que a pessoa fez.",
  },
  {
    chave: "janela",
    titulo: "Janela",
    explica:
      "A urgência é do calendário, não do marketing: 30 de setembro é lei. Só vai para quem tem carteira importada — avisar do prazo quem nunca subiu nada é ruído.",
  },
  {
    chave: "cobranca",
    titulo: "Cobrança",
    explica:
      "Uma escada, não um bombardeio: só o degrau mais alto atingido é enviado, e nunca dois avisos no mesmo dia para a mesma cobrança.",
  },
  {
    chave: "retencao",
    titulo: "Retenção",
    explica:
      "Assinante que parou de analisar é churn que ainda não foi assinado. O sinal aqui é a análise, não o login: entrar no sistema e não fazer nada não é uso.",
  },
];

export default async function Emails() {
  const supabase = createClient();

  const [{ data: regrasRaw }, { data: cfgRaw }, { data: logRaw }] = await Promise.all([
    supabase.from("plataforma_reguas").select("*").order("ordem", { ascending: true }),
    supabase.from("plataforma_config").select("chave, valor"),
    supabase
      .from("plataforma_envios")
      .select("id, regra, chave_unica, para, assunto, status, erro, criado_em")
      .order("criado_em", { ascending: false })
      .limit(60),
  ]);

  const regras = ((regrasRaw as RegraUI[]) || []);
  const cfg: Record<string, Record<string, unknown>> = {};
  for (const c of ((cfgRaw as { chave: string; valor: Record<string, unknown> }[]) || [])) cfg[c.chave] = c.valor;
  const log = (logRaw as { id: string; regra: string; chave_unica: string; para: string; assunto: string; status: string; erro: string | null; criado_em: string }[]) || [];

  if (!regras.length) {
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">As réguas ainda não existem no banco</p>
        <p className="mt-2 text-[13px]">
          Rode a migration <b>0020_negocio.sql</b> no Supabase. Ela cria as 17 réguas com o texto inicial.
        </p>
      </div>
    );
  }

  // Prévia real: o MESMO motor do cron, em modo planejamento.
  let previsao: Envio[] = [];
  let erroPrevisao: string | null = null;
  try {
    previsao = planejar(await carregarContexto(supabase));
  } catch (e) {
    erroPrevisao = e instanceof Error ? e.message : "não consegui montar a prévia";
  }

  /* o que VAI SAIR e o que está travado sem destinatário — ver separarFila */
  const { sairao, travados } = separarFila(previsao);

  /* a contagem por grupo passa a ser do que REALMENTE sai: "3 na fila agora"
     com os 3 travados era uma promessa que a régua não cumpria */
  const naFila: Record<string, number> = {};
  for (const p of sairao) naFila[p.categoria] = (naFila[p.categoria] || 0) + 1;

  const ultimaExec = (cfg.reguas_execucao ?? null) as Record<string, unknown> | null;

  const nomeRegra: Record<string, string> = {};
  for (const r of regras) nomeRegra[r.chave] = r.nome;

  const cfgReguas = cfg.reguas || {};
  const cfgCobranca = cfg.cobranca || {};

  return (
    <div className="space-y-7">
      <section className="rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[70ch]">
            <p className="text-[15px] font-bold">O motor</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Uma execução por dia, no cron das 11h UTC. Cada e-mail sai <b>uma única vez por alvo</b> — a trava é um
              índice único no banco, não uma checagem que pode falhar. Rodar duas vezes no mesmo dia não duplica nada.
            </p>
          </div>
          <RodarReguas />
        </div>

        <div className="mt-4 grid gap-4 border-t border-linesoft pt-4 md:grid-cols-4">
          <ConfigChave
            chave="reguas" campo="ativas" titulo="Réguas ligadas"
            ativo={cfgReguas.ativas !== false}
            ajuda="Desligando aqui, nenhum e-mail automático sai — nem cobrança."
            base={cfgReguas}
          />
          <ConfigNumero
            chave="reguas" campo="janela_dias" titulo="Janela de ativação"
            valor={Number(cfgReguas.janela_dias ?? 30)} sufixo="dias"
            ajuda="E-mail de ativação só vale para escritório mais novo que isso. É o que impede saudar a base antiga inteira no primeiro disparo."
            base={cfgReguas}
          />
          <ConfigNumero
            chave="reguas" campo="limite_por_execucao" titulo="Limite por execução"
            valor={Number(cfgReguas.limite_por_execucao ?? 200)} sufixo="e-mails"
            ajuda="Trava de segurança: se a lógica errar, no máximo isso sai."
            base={cfgReguas}
          />
          <ConfigNumero
            chave="cobranca" campo="dias_renovacao" titulo="Aviso de renovação"
            valor={Number(cfgCobranca.dias_renovacao ?? 10)} sufixo="dias antes"
            ajuda="Quantos dias antes do vencimento avisar quem já é assinante."
            base={cfgCobranca}
          />
        </div>
      </section>

      {/* ─────────────────────────────────────────── O CRON RODOU? QUANDO?
          A pergunta que não tinha onde ser respondida. A fila mostrava dezenas
          de "próximos disparos" e o log tinha UM envio de teste — sem como
          saber se o motor nunca rodou, se rodou fora do horário, ou se rodou e
          nada saiu. Agora cada execução deixa um batimento. */}
      <section
        className={`rounded border p-4 ${
          ultimaExec ? "border-line bg-surface" : "border-vermelho/40 bg-vermelhowash"
        }`}
      >
        <p className="text-[13px] font-bold">
          {ultimaExec ? "Última execução do motor" : "O motor nunca rodou"}
        </p>
        {ultimaExec ? (
          <p className="mt-1 max-w-[85ch] text-[12.5px] leading-relaxed text-muted">
            {new Date(String(ultimaExec.em)).toLocaleString("pt-BR")} · modo <b>{String(ultimaExec.modo)}</b> ·
            planejados <b>{Number(ultimaExec.planejados ?? 0)}</b>, enviados{" "}
            <b>{Number(ultimaExec.enviados ?? 0)}</b>, travados sem destinatário{" "}
            <b>{Number(ultimaExec.travados ?? 0)}</b>.
            {Number(ultimaExec.enviados ?? 0) === 0 && " Nenhum e-mail saiu nessa execução — o modo acima diz por quê."}
          </p>
        ) : (
          <p className="mt-1 max-w-[85ch] text-[12.5px] leading-relaxed">
            Nenhuma execução registrada. O cron roda de hora em hora e só envia em dia útil, das 9h
            às 18h — mas ele <b>precisa do CRON_SECRET</b> configurado na Vercel: sem a variável, a
            rota devolve 401 e nada acontece, sem nenhum aviso. Confira lá, ou usei o botão acima
            para rodar à mão.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[15px] font-bold">Próximos disparos</h2>
        <p className="mb-2 max-w-[85ch] text-[12.5px] text-muted">
          O que sairia se a régua rodasse agora. Não é estimativa: é o resultado do mesmo planejamento que o cron usa.
        </p>

        {erroPrevisao ? (
          <div className="rounded border border-line bg-surface p-4 text-[13px] text-amarelo">{erroPrevisao}</div>
        ) : !previsao.length ? (
          <div className="rounded border border-line bg-surface p-6 text-center text-[13px] text-muted">
            Nada a enviar agora. Todo mundo já recebeu o que devia, ou nenhuma condição foi atingida.
          </div>
        ) : !sairao.length ? (
          <div className="rounded border border-line bg-surface p-6 text-center text-[13px] text-muted">
            Nenhum vai sair agora: os {travados.length} planejados estão travados por falta de
            destinatário — a lista está logo abaixo.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Escritório</th>
                  <th className="px-3 py-2.5 font-semibold">Regra</th>
                  <th className="px-3 py-2.5 font-semibold">Por quê</th>
                  <th className="px-3 py-2.5 font-semibold">Para</th>
                </tr>
              </thead>
              <tbody>
                {sairao.slice(0, 40).map((p, i) => (
                  <tr key={i} className="border-b border-linesoft last:border-0">
                    <td className="px-3 py-2 font-semibold">{p.escritorio}</td>
                    <td className="px-3 py-2">{p.nome_regra}</td>
                    <td className="px-3 py-2 text-[11.5px] text-muted">{p.motivo}</td>
                    <td className="px-3 py-2 text-[11.5px]">{p.para}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sairao.length > 40 && <p className="px-3 py-2 text-[11.5px] text-muted">+{sairao.length - 40} outros.</p>}
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────── OS QUE NUNCA VÃO SAIR
          Estavam misturados na lista de cima, e era isso que fazia a fila
          parecer entupida: escritório sem NENHUM usuário planeja e-mail em toda
          execução, não tem destinatário, e volta amanhã igual. Não é falha do
          motor — é cadastro que morreu no meio, e tem conserto próprio. */}
      {travados.length > 0 && (
        <section>
          <h2 className="mb-1 text-[15px] font-bold text-amarelo">
            Travados — {travados.length} que nunca vão sair sozinhos
          </h2>
          <p className="mb-2 max-w-[85ch] text-[12.5px] leading-relaxed text-muted">
            Estes escritórios não têm nenhum e-mail cadastrado. A régua planeja o envio, não encontra
            destinatário e tenta de novo na execução seguinte — indefinidamente. Enquanto ficarem
            aqui, a fila de cima parece maior do que é. Resolva em <b>Negócio → Contas</b>: ou a
            conta de acesso é criada, ou o escritório sai da base.
          </p>
          <div className="overflow-x-auto rounded border border-amarelo/40 bg-amarelowash">
            <table className="w-full text-[13px]">
              <thead className="border-b border-amarelo/30 text-left text-[11px] uppercase tracking-wide text-amarelo">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Escritório</th>
                  <th className="px-3 py-2.5 font-semibold">Regra travada</th>
                  <th className="px-3 py-2.5 font-semibold">Por quê</th>
                </tr>
              </thead>
              <tbody>
                {travados.slice(0, 20).map((p, i) => (
                  <tr key={i} className="border-b border-amarelo/20 last:border-0">
                    <td className="px-3 py-2 font-semibold">{p.escritorio}</td>
                    <td className="px-3 py-2">{p.nome_regra}</td>
                    <td className="px-3 py-2 text-[11.5px]">sem nenhum usuário com e-mail</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {travados.length > 20 && <p className="px-3 py-2 text-[11.5px]">+{travados.length - 20} outros.</p>}
          </div>
        </section>
      )}

      {GRUPOS.map((g) => {
        const doGrupo = regras.filter((r) => r.categoria === g.chave);
        if (!doGrupo.length) return null;
        return (
          <section key={g.chave}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold">{g.titulo}</h2>
              <span className="text-[11.5px] text-muted">
                {doGrupo.filter((r) => r.ativa).length} de {doGrupo.length} ativa(s)
                {naFila[g.chave] ? ` · ${naFila[g.chave]} na fila agora` : ""}
              </span>
            </div>
            <p className="mb-2.5 max-w-[85ch] text-[12.5px] leading-relaxed text-muted">{g.explica}</p>
            <div className="space-y-2.5">
              {doGrupo.map((r) => <ReguaCartao key={r.chave} r={r} variaveis={VARIAVEIS} />)}
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="mb-1 text-[15px] font-bold">Últimos envios</h2>
        <p className="mb-2 max-w-[80ch] text-[12.5px] text-muted">
          Tudo o que a plataforma mandou para contadores — automático, manual e teste. É também a trava: enquanto a
          linha existir, aquela regra não vai de novo para aquele alvo.
        </p>
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Regra</th>
                <th className="px-3 py-2.5 font-semibold">Para</th>
                <th className="px-3 py-2.5 font-semibold">Assunto</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="border-b border-linesoft last:border-0">
                  <td className="px-3 py-2 text-[11.5px] text-muted">
                    {new Date(l.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-2">{nomeRegra[l.regra] || l.regra}</td>
                  <td className="px-3 py-2 text-[11.5px]">{l.para}</td>
                  <td className="px-3 py-2 text-[11.5px] text-muted">{l.assunto}</td>
                  <td className="px-3 py-2">
                    <span
                      title={l.erro || undefined}
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        l.status === "enviado" ? "bg-verdewash text-verde"
                          : l.status === "erro" ? "bg-vermelhowash text-vermelho"
                          : "bg-neutrowash text-neutro"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right"><LiberarReenvio chaveUnica={l.chave_unica} /></td>
                </tr>
              ))}
              {!log.length && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">Nenhum envio registrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11.5px] leading-relaxed text-muted">
        Os e-mails saem pela API do Brevo, do remetente{" "}
        <b>{process.env.BREVO_REMETENTE_EMAIL || "no-reply@enquadria.com.br"}</b>. Se um envio falhar, a linha fica
        marcada como erro e a regra <b>não</b> tenta de novo sozinha — reenvio é decisão sua, pelo botão. Endereço
        quebrado martelado todo dia queima domínio. Todo e-mail leva no rodapé o aviso de que os números são
        estimativa de cenário e a responsabilidade técnica é de quem assina.
      </p>
    </div>
  );
}
