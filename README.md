# Arena Zero

Protótipo original de futebol arcade 3D para navegador, inspirado em princípios de partidas rápidas e controle individual de jogos como REMATCH, sem usar marcas, personagens ou recursos do jogo original.

## Como jogar

Abra `index.html` em um navegador moderno.

- `WASD`: movimento
- `Shift`: sprint
- Botão **CORRER +50%**: mantenha pressionado para correr
- Movimento do mouse: girar a câmera durante a partida
- `J` e `L`: girar a câmera pelo teclado
- `I` e `K`: inclinar a câmera pelo teclado
- Rodinha do mouse: aproximar ou afastar a câmera
- Segurar e soltar o clique: chute carregado
- `Espaço`: passe direcionado
- `E`: desarme com impulso

## Mecânicas implementadas

- Partida 4 contra 4 com adversários, companheiros e goleiros controlados pelo computador
- Campo com dimensões duplicadas em largura e comprimento
- Controle de um único atleta
- Sprint limitado por energia
- Chute carregado com direção livre
- Passe assistido para companheiros
- Desarme com impulso e tempo de recarga
- Paredes com rebote e bola sempre em jogo
- Placar, cronômetro, reinício após gol e resultado da partida

Construído com HTML, CSS, JavaScript e Three.js carregado por CDN.
