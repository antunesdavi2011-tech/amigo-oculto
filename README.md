# Amigo Oculto + Amigo da Onça

Projeto web completo para um Amigo Oculto com um segundo sorteio de Amigo da Onça.

## O que o site faz
- anfitrião cria uma sala e compartilha um link;
- anfitrião cadastra os participantes;
- cada participante escolhe o próprio nome e cria uma senha individual;
- cada pessoa recebe um nome para Amigo Oculto e outro, diferente, para Amigo da Onça;
- ninguém tira a si mesmo;
- cada participante só consegue ver o próprio resultado.

## Rodar localmente
Requer Node.js 18+.

```bash
npm install
npm start
```

Depois abra `http://localhost:3000`.

## Publicar na internet
Este projeto já está preparado para hospedagem Node.js. A variável `PORT` é usada pela hospedagem e a variável opcional `DB_PATH` permite apontar o SQLite para um armazenamento persistente.

Para o banco não ser perdido em reinicializações/deploys, configure um volume/disco persistente na hospedagem e defina `DB_PATH` para um arquivo dentro desse volume, por exemplo `/data/data.sqlite`.

Também é recomendado definir uma variável `SESSION_SECRET` com uma chave aleatória longa.

### Railway — caminho recomendado
1. Crie uma conta em Railway.
2. Crie um projeto a partir deste repositório no GitHub.
3. O Railway detectará o Node.js e executará `npm start`.
4. Adicione um volume persistente e monte-o, por exemplo, em `/data`.
5. Crie a variável `DB_PATH=/data/data.sqlite`.
6. Crie `SESSION_SECRET` com uma chave aleatória longa.
7. Gere o domínio público do serviço.

O link público gerado pelo Railway será o link que você enviará para os participantes.
