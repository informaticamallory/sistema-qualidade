# Mallory UI Kit

UI Kit reutilizavel aplicado ao sistema de qualidade a partir de `C:\Users\egoncalves\Downloads\ui-kit-standalone.html`.

## Base visual

- Marca: laranja Mallory `#ff6600`, ambar `#ffa40d`, ouro `#ffc737` e ink `#101921`.
- Fundo claro: off-white quente, superficies brancas e bordas sutis.
- Tema escuro: superficies frias sobre ink, mantendo a sidebar sempre escura.
- Tipografia: `Sora` para titulos/logomark, `Inter` para interface e `IBM Plex Mono` para numeros/IDs.
- Densidade padrao: `comfortable`, com tokens `--gap` e `--pad` preparados para `compact` e `spacious`.

## Arquivos principais

```text
src/styles/tokens.css          Tokens do design system e aliases legados
src/ui/theme/ui-kit.css        Classes globais de componentes e layout
src/ui/components/Button.jsx   Variantes de botao do kit
src/ui/components/Badge.jsx    Badges com tons e ponto opcional
src/components/Sidebar         Shell lateral Mallory
src/pages/Login                Entrada no mesmo padrao visual
```

## Tokens relevantes

- Cores: `--primary`, `--amber`, `--gold`, `--success`, `--warning`, `--danger`, `--info`.
- Texto: `--fg`, `--fg-muted`, `--fg-subtle` e aliases antigos `--text`, `--text-muted`.
- Superficies: `--bg`, `--bg-2`, `--surface`, `--surface-2`, `--border`.
- Raio: `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-2xl`, `--card-radius`.
- Layout: `--ui-sidebar-width`, `--ui-sidebar-collapsed-width`.

## Componentes

```jsx
import { Button, Badge, Card, PageHeader } from './ui';

<Button variant="primary">Salvar</Button>
<Button variant="ghost" size="sm">Filtrar</Button>
<Button variant="danger-soft">Cancelar</Button>

<Badge variant="success" dot>Aprovado</Badge>
<Badge variant="default">Em triagem</Badge>
```

Variantes de botao: `primary`, `secondary`, `outline`, `ghost`, `success`, `danger`, `danger-soft`.

Variantes de badge: `default`, `primary`, `success`, `warning`, `danger`, `info`.

## Observacoes

O CSS global continua preservando os nomes antigos usados pelas telas (`.btn`, `.badge`, `.stat-card`, `.chart-card`, `.table-card`, `.form-control`) para aplicar o novo visual sem reescrever todos os fluxos.
