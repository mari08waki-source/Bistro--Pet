# Bistro Pet Admin

Painel administrativo isolado em `/admin`, autenticado pelo Supabase e limitado pelos mesmos controles RLS do Bistro Pet.

## Arquivos

- `index.html`: login visual, navegação e módulos administrativos.
- `styles.css`: estilos exclusivos da área administrativa.
- `admin.js`: autenticação, leitura, organização, exibição e exportação dos dados do usuário autenticado.

## Integração atual

### Autorização administrativa

- O painel exige uma sessão válida do Supabase e valida o token no backend em `/api/admin-access`.
- Somente contas com `app_metadata.role` igual a `admin` recebem acesso.
- `user_metadata` não concede permissão administrativa, pois pode ser alterado pelo próprio usuário.
- A promoção de uma conta deve ser feita por um operador autorizado no Supabase; o aplicativo nunca promove usuários.

- Funciona como Central Administrativa somente leitura para a sessão autenticada.
- Exibe totais disponíveis de perfis, receitas salvas e planos semanais.
- Exibe a última atividade quando existe uma data realmente armazenada.
- Trata receitas salvas manualmente como favoritas escolhidas pelo usuário.
- Mostra resumo do plano semanal atual e quantidade de refeições.
- Monta um log visual a partir dos últimos dados existentes, sem registrar eventos.
- Verifica dados válidos e possíveis inconsistências estruturais.
- Exibe Dashboard Operacional com status geral e data da última leitura.
- Lê os dados das seis tabelas do Supabase por meio da camada oficial do aplicativo.
- Diagnostica o estado das Seções 2, 3 e 4.
- Exibe os últimos eventos já existentes sem criar histórico novo.
- Exibe Perfil do Pet com Nome do Pet, Nome do Tutor, Idade, Peso, Porte, Perfil Personalizado e Observação.
- Separa Receita Personalizada e Sugestão do Chefe pelo campo `mode`, conforme o fluxo atual do aplicativo.
- Exibe Histórico salvo manualmente.
- Exibe Plano Semanal.
- Exibe configurações locais disponíveis.
- Mostra a chave de origem, o componente e a função que alimentam cada módulo.
- Exporta uma cópia JSON sem modificar os dados originais.

## Fontes lidas

- `pet_profiles`
- `pet_blocked_ingredients`
- `recipe_generations`
- `saved_recipes`
- `weekly_plans`
- `weekly_plan_days`

## Estrutura atual esperada

### Perfil do Pet

- `name`: Nome do Pet.
- `tutor`: Nome do Tutor.
- `age`: Idade.
- `weight`: Peso.
- `size`: Porte.
- `menuStyle`: `padrao` quando Perfil Personalizado está desligado, `personalizada` quando está ligado.
- `notes`: Observação preenchida apenas quando Perfil Personalizado está ligado.

### Receitas

- `mode: "personalizada"`: Receita Personalizada.
- `mode: "chef"`: Sugestão do Chefe.

### Plano Semanal

- Fluxos visuais atuais: Automático e Personalizado.
- Persistência atual: `weekly_plans` e 7 registros relacionados em `weekly_plan_days`.
- Cada item do plano contém `day`, `planMode`, `planModeLabel`, `title`, `ingredients`, `prep`, `note`, `image` e dados resumidos do perfil.

### Histórico

- `saved_recipes` armazena receitas salvas manualmente.
- Cada receita salva contém nome da receita (`title`), tipo (`mode`), data (`createdAt`) e modo de preparo (`steps`).

## Limitações preservadas

- Utiliza autenticação real do Supabase.
- Utiliza o banco de dados Supabase com RLS.
- Não possui APIs administrativas.
- Não possui acesso global a outros usuários; cada sessão vê somente seus próprios dados.
- Não coleta logs ou erros.
- Não utiliza `localStorage` como fonte de dados.
- Não modifica arquivos ou comportamentos da área do usuário.
- O botão `Atualizar leitura` apenas recarrega as leituras atuais.
