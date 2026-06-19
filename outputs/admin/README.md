# Bistro Pet Admin

Painel administrativo isolado em `/admin`, integrado em modo somente leitura aos dados locais existentes do Bistro Pet.

## Arquivos

- `index.html`: login visual, navegação e módulos administrativos.
- `styles.css`: estilos exclusivos da área administrativa.
- `admin.js`: leitura, organização, exibição e exportação dos dados locais.

## Integração atual

- Funciona como Central Administrativa somente leitura.
- Exibe totais disponíveis de perfis, receitas salvas e planos semanais.
- Exibe a última atividade quando existe uma data realmente armazenada.
- Trata receitas salvas manualmente como favoritas escolhidas pelo usuário.
- Mostra resumo do plano semanal atual e quantidade de refeições.
- Monta um log visual a partir dos últimos dados existentes, sem registrar eventos.
- Verifica dados válidos e possíveis inconsistências estruturais.
- Exibe Dashboard Operacional com status geral e data da última leitura.
- Verifica a integridade das cinco chaves locais utilizadas pelo painel.
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

- `bistropet:pet-profile`
- `bistropet:last-recipe`
- `bistropet:manual-recipe-history`
- `bistropet:weekly-plan`
- `bistropet:image-client-id`

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
- Persistência local atual: array com 7 itens em `bistropet:weekly-plan`.
- Cada item do plano contém `day`, `planMode`, `planModeLabel`, `title`, `ingredients`, `prep`, `note`, `image` e dados resumidos do perfil.

### Histórico

- `bistropet:manual-recipe-history` armazena receitas salvas manualmente.
- Cada receita salva contém nome da receita (`title`), tipo (`mode`), data (`createdAt`) e modo de preparo (`steps`).

## Limitações preservadas

- Não possui autenticação real.
- Não possui banco de dados.
- Não possui APIs administrativas.
- Não possui dados de usuários cadastrados.
- Não coleta logs ou erros.
- Não altera, remove ou migra chaves existentes do `localStorage`.
- Não modifica arquivos ou comportamentos da área do usuário.
- O botão `Atualizar leitura` apenas recarrega as leituras atuais.
