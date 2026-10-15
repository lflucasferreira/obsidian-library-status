# Status Icons (File Explorer)

Plugin pessoal para o Obsidian: mostra ícones ao lado de cada nota no explorador de
arquivos, com base em dois campos de frontmatter — inspirado no modelo do Skoob
(status de leitura + etiquetas independentes).

- **Status** (campo escalar, por padrão `status`): um único ícone, à **esquerda** do
  nome do arquivo. Representa o estado de leitura — mutuamente exclusivo.
- **Etiquetas** (campo de lista, por padrão `etiquetas`): zero ou mais ícones, à
  **direita** do nome (mesmo lugar onde apareceria o marcador nativo de bookmark).
  Representam rótulos independentes que podem coexistir com qualquer status.

Pensado para o vault de livros, mas os campos e os mapeamentos são configuráveis —
funciona para qualquer frontmatter com valores fixos.

## Mapeamento padrão — Status

| Valor | Ícone |
|---|---|
| lendo | 📖 |
| planejado | 📌 |
| lido | ✅ |
| abandonado | ❌ |
| desejado | ⭐ |

## Mapeamento padrão — Etiquetas

```yaml
etiquetas: [favorito, tenho]
```

| Valor | Ícone |
|---|---|
| favorito | ❤️ |
| desejado | 🎁 |
| tenho | 🔖 |
| emprestei | ➡️ |

Edite em **Configurações → Status Icons (File Explorer)** — um valor por linha, no
formato `valor: ícone`, em blocos separados para Status e Etiquetas.

## Instalação (via BRAT, sem passar pelo diretório oficial)

1. Instale o plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat) pelo
   diretório de plugins da comunidade do Obsidian.
2. Em **Configurações → BRAT → Add Beta plugin**, cole:
   `lflucasferreira/obsidian-status-icons`
3. Ative o plugin "Status Icons (File Explorer)" em
   **Configurações → Plugins da comunidade**.

BRAT atualiza automaticamente a partir das releases deste repositório.

## Desenvolvimento

```bash
npm install
npm run dev    # build com watch
npm run build  # build de produção (gera main.js)
```
