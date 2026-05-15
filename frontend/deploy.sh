#!/bin/bash

# Script deploy per Vercel
# Esegui: bash deploy.sh "messaggio del commit"

if [ -z "$1" ]; then
  echo "❌ Specifica il messaggio del commit"
  echo "Uso: bash deploy.sh \"messaggio del commit\""
  exit 1
fi

COMMIT_MSG="$1"

echo "📦 Inizio deploy su Vercel..."
echo ""

# Verifica che siamo in un repo git
if [ ! -d .git ]; then
  echo "❌ Errore: non è un repository git"
  exit 1
fi

# Controlla lo stato del repo
echo "📋 Stato del repo:"
git status

echo ""
echo "🔄 Aggiungendo file modificati..."
git add -A

echo ""
echo "💾 Creando commit: '$COMMIT_MSG'"
git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
  echo "❌ Errore nel commit"
  exit 1
fi

echo ""
echo "🚀 Pushing su GitHub..."
git push origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Deploy in corso! Vercel sta costruendo l'app..."
  echo "🌐 Controlla: https://fammy-flame.vercel.app"
else
  echo "❌ Errore nel push"
  exit 1
fi
