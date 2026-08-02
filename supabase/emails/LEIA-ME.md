# Templates de e-mail do Supabase Auth

Gerados por `node ferramentas/gerar-emails-supabase.mjs`. **Não edite os HTML à mão** —
edite o gerador e rode de novo, senão a próxima geração apaga a sua alteração.

Cole cada um em **Authentication → Emails** no painel do Supabase, no template de mesmo
nome, e copie o assunto da tabela.

## Autenticação — pedem uma ação

| arquivo | template no painel | assunto |
|---|---|---|
| `01-confirmar-cadastro.html` | Confirm signup | Confirme seu e-mail para ativar a conta |
| `02-convite.html` | Invite user | Você foi convidado para o Enquadria |
| `03-link-magico.html` | Magic Link | Seu link de acesso ao Enquadria |
| `04-trocar-email.html` | Change Email Address | Confirme o novo endereço de e-mail |
| `05-redefinir-senha.html` | Reset Password | Redefinir sua senha do Enquadria |
| `06-reautenticar.html` | Reauthentication | Código para confirmar a alteração |

## Avisos de segurança — não pedem nada, avisam

São os que quase todo mundo deixa em branco, e são os que protegem a conta: é o e-mail
que chega quando alguém trocou a senha do contador às três da manhã. Sem ele, a invasão
só aparece quando já é tarde.

| arquivo | template no painel | assunto |
|---|---|---|
| `07-senha-alterada.html` | Password changed | A senha da sua conta foi alterada |
| `08-email-alterado.html` | Email address changed | O e-mail da sua conta foi alterado |
| `09-telefone-alterado.html` | Phone number changed | O telefone da sua conta foi alterado |
| `10-login-ligado.html` | Sign-in method linked | Um novo jeito de entrar foi ligado na sua conta |
| `11-login-desligado.html` | Sign-in method removed | Um jeito de entrar foi desligado da sua conta |
| `12-verificacao-adicionada.html` | Verification method added | Verificação em duas etapas ativada |
| `13-verificacao-removida.html` | Verification method removed | Verificação em duas etapas removida |

## Variáveis usadas

`{{ .ConfirmationURL }}` `{{ .Token }}` `{{ .Email }}` `{{ .NewEmail }}` `{{ .OldEmail }}` `{{ .Phone }}` `{{ .OldPhone }}` `{{ .Provider }}` `{{ .FactorType }}`

## Antes de colar

A caixa **seguranca@enquadria.com.br** precisa existir: ela aparece em todos os avisos de segurança como
o canal de "não fui eu". Aviso de invasão que manda escrever para um endereço que devolve
erro é pior do que não avisar.
