-- ===========================================================================
-- 0043 — A TELA DE CONTAS MOSTRAVA UMA CONTA SÓ
-- ===========================================================================
--
-- O SINTOMA: Negócio → Contas listava apenas o próprio escritório. A base tem
-- nove; a tela mostrava um.
--
-- ---------------------------------------------------------------------------
-- A CAUSA.
--
-- A tela lê `tenants` DIRETO, com o cliente do navegador — ou seja, pela
-- sessão do usuário, sujeita à RLS. E a RLS de `tenants` tinha exatamente uma
-- política:
--
--     tenants_self:  id = tenant_atual()
--
-- Uma linha. A sua. Não é bug de consulta nem de tela: o banco entregou tudo o
-- que podia entregar.
--
-- E o efeito ia além de listar. A mesma política vale para UPDATE, então
-- marcar OUTRA conta como teste ou cortesia também não funcionava — o
-- supabase-js devolve `{ error }` sem lançar, e a tela seguia como se tivesse
-- gravado. A tela inteira era inerte para todos menos você.
--
-- ---------------------------------------------------------------------------
-- POR QUE ISSO PASSOU DESPERCEBIDO.
--
-- Porque `tenants` é a ÚNICA exceção. Varrendo as tabelas que as telas de
-- plataforma consultam, todas as outras já tinham a política de gestor:
--
--     faturas            -> faturas_gestor          (superadmin, ALL)
--     chamados           -> chamados_gestor         (superadmin, ALL)
--     chamado_mensagens  -> chamado_msg_proprio     (dono OU superadmin)
--     indicacoes         -> indicacoes_gestor       (superadmin, SELECT)
--     nps_respostas      -> nps_gestor              (superadmin, SELECT)
--     ajuda_artigos      -> ajuda_artigos_escrita   (superadmin, ALL)
--     curso_videos       -> curso_videos_escrita    (superadmin, ALL)
--     assistente_config  -> assistente_escrita      (superadmin, ALL)
--
--     tenants            -> (nada)
--
-- O padrão existia e uma tabela ficou de fora. É o tipo de falta que nenhuma
-- tela acusa: ela não dá erro, ela dá MENOS.
--
-- ---------------------------------------------------------------------------
-- SELECT E UPDATE, NÃO "ALL" — e a diferença importa.
--
-- As outras políticas de gestor são `for all` por herança de escrita. Aqui não:
-- `tenants` é a raiz do grafo, e as chaves estrangeiras descem em CASCADE
-- (assinaturas, empresas, análises, laudos, termos). Um DELETE acidental na
-- tela de administração apagaria a operação inteira de um cliente, sem
-- confirmação e sem volta.
--
-- A tela precisa de ler e de marcar teste/cortesia/status. Isso é SELECT e
-- UPDATE. Apagar escritório é operação de banco, com backup na frente e
-- decisão de gente — não um botão que existe por descuido de política.
--
-- Idempotente.
-- ===========================================================================

drop policy if exists tenants_plataforma_le on public.tenants;
create policy tenants_plataforma_le on public.tenants
  for select to authenticated
  using (public.e_plataforma());

drop policy if exists tenants_plataforma_marca on public.tenants;
create policy tenants_plataforma_marca on public.tenants
  for update to authenticated
  using (public.e_plataforma())
  with check (public.e_plataforma());

comment on policy tenants_plataforma_le on public.tenants is
  'Dono da plataforma enxerga todos os escritórios (tela Negócio → Contas). Ver 0043.';
comment on policy tenants_plataforma_marca on public.tenants is
  'Marcar teste/cortesia/status de qualquer escritório. DELETE fica de fora de propósito: as FK descem em cascade. Ver 0043.';
