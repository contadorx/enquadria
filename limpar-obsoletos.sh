#!/usr/bin/env bash
# Remove os arquivos que foram APAGADOS do projeto e que sobrevivem quando um
# zip novo é extraído por cima de uma pasta antiga.
#
# Extrair sobrescreve o que mudou e ACRESCENTA o que é novo — mas não apaga
# nada. O resultado é uma árvore misturada que compila localmente e quebra no
# build, porque um arquivo morto ainda importa funções que já não existem.
#
# Rode na raiz do projeto. É seguro repetir.
set -e

OBSOLETOS=(
  # motores de régua paralelos, removidos na consolidação de 03/08
  "lib/cobranca-executar.ts"
  "lib/onboarding-executar.ts"
  "lib/onboarding.ts"
  "testes/onboarding.test.mjs"
  "app/api/cobranca"
  # caixa do assistente dentro da página de ajuda, substituída pelo botão flutuante
  "components/AssistenteAjuda.tsx"
)

echo "Limpando arquivos obsoletos…"
for alvo in "${OBSOLETOS[@]}"; do
  if [ -e "$alvo" ]; then
    rm -rf "$alvo"
    echo "  removido: $alvo"
    # se for repositório git, registra a remoção para o commit
    git rm -r --cached --quiet "$alvo" 2>/dev/null || true
  fi
done

echo
echo "Pronto. Agora rode: npm run build"
