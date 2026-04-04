# Skill: Atualizar Documentação do Projeto

Analisa o que foi feito recentemente e atualiza `CLAUDE.md` e `CALCULOS.md` com novos padrões, preferências e decisões descobertas. Use `/atualizar-docs` após implementar algo novo.

## Como executar

Siga estes passos **na ordem**, sem pular:

### 1. Entender o contexto recente

Execute os comandos abaixo para ver o que mudou:

```bash
git log --oneline -15
```

```bash
git diff HEAD~5..HEAD --name-only --diff-filter=AM
```

Leia os arquivos modificados mais relevantes (pages, core/, scripts/) para entender o que foi implementado.

Se o usuário passou argumentos (`$ARGUMENTS`), use como contexto adicional sobre o que foi feito.

### 2. Ler os arquivos de documentação atuais

Leia os dois arquivos completos antes de qualquer edição:
- `/home/user/Meus-investimentos/CLAUDE.md`
- `/home/user/Meus-investimentos/CALCULOS.md`

### 3. Identificar o que deve ser documentado

Para cada arquivo modificado recentemente, identifique se há:

**Candidatos para CLAUDE.md (design e UX):**
- Novo tipo de card ou componente visual não documentado
- Nova cor de acento ou tema usado
- Novo padrão de CSS / glassmorphism
- Decisão de UX tomada ("usamos nav-card porque...", "expandable só quando...")
- Nova página criada (estrutura, padrão seguido)
- Override de Streamlit não documentado

**Candidatos para CALCULOS.md (lógica financeira):**
- Nova função de cálculo ou nova combinação de funções
- Novo padrão de parsing ou normalização de dados
- Nova fonte de dados (nova aba do Sheets, novo endpoint)
- Bug corrigido numa fórmula (documentar o "por que" da correção)
- Nova regra de negócio (ex: "RF em USD usa taxa 0", "filtro de ruído > 0.000001")
- Novo tipo de provento ou classificação

**Candidatos para nenhum dos dois (ignorar):**
- Mudanças de conteúdo sem impacto estrutural
- Correções triviais de texto ou layout
- Atualizações de dados

### 4. Escrever as atualizações

Para cada item identificado:

**Se for adição a CLAUDE.md:**
- Adicione na seção correta (Paleta, Tipografia, Tipos de Card, Decisões UX, etc.)
- Se não couber em nenhuma seção, crie uma nova ao final
- Siga o formato já existente no arquivo (tabelas, code blocks CSS, listas)
- Mantenha conciso — exemplos de código, não prosa

**Se for adição a CALCULOS.md:**
- Adicione como nova seção numerada OU dentro de uma seção existente
- Inclua: propósito, lógica central em código, armadilhas, referência ao arquivo/função
- Atualize a tabela "Referência Rápida" no final se uma nova função foi criada
- Siga o padrão: explicação curta → snippet de código → nota de uso

**Formato das adições:**
```markdown
<!-- Adicionado em YYYY-MM-DD: breve descrição do que motivou -->
```
Adicione este comentário HTML acima de cada bloco novo para rastreabilidade.

### 5. Aplicar as edições com cuidado

- Use `Edit` para modificar apenas os trechos necessários — nunca reescreva o arquivo inteiro
- Preserve todo o conteúdo existente
- Verifique que o markdown está correto (headers, code fences fechados, tabelas alinhadas)

### 6. Resumir o que foi feito

Ao final, liste para o usuário:
- O que foi adicionado em `CLAUDE.md` (se algo)
- O que foi adicionado em `CALCULOS.md` (se algo)
- O que foi encontrado mas **não** documentado (e por quê)

Se nada de relevante foi encontrado para documentar, diga claramente e não edite os arquivos.

---

## Regras

- **Não invente.** Documente apenas o que realmente existe no código analisado.
- **Não duplique.** Se o padrão já está documentado, não adicione de novo.
- **Não melhore o que já existe.** Só adicione entradas novas — não refatore seções antigas.
- **Seja específico.** "nav-card" é melhor que "card de navegação". Nomes de funções reais são melhores que descrições genéricas.
- **Código > prosa.** Um snippet de 5 linhas vale mais que um parágrafo explicativo.
