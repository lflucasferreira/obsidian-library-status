# Status Icons (File Explorer)

Plugin pessoal para o Obsidian: mostra um ícone diferente ao lado de cada nota no
explorador de arquivos, com base no valor de um campo do frontmatter (por padrão,
`status`).

Pensado para o vault de livros (`status: lendo`, `planejado`, `lido`, `abandonado`,
`desejado`), mas o campo e o mapeamento são configuráveis — funciona para qualquer
frontmatter com valores fixos.

## Mapeamento padrão

| Valor | Ícone |
|---|---|
| lendo | 📖 |
| planejado | 🗓️ |
| lido | ✅ |
| abandonado | ⏸️ |
| desejado | 🛒 |

Edite em **Configurações → Status Icons (File Explorer)** — um valor por linha, no
formato `valor: ícone`.

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
