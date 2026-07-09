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
- Segurar e soltar `Espaço`: passe direcionado carregado
- `E`: desarme com impulso
- Celular/tablet: joystick na esquerda, botões de chute, passe, desarme e correr na direita
- Celular/tablet: arraste o dedo na tela para girar a câmera

## Mecânicas implementadas

- Tela de escolha de atleta antes da partida
- Quatro perfis jogáveis: Vicente, Raio, Titã e Maestro
- Atributos diferentes por atleta, afetando velocidade, sprint, chute, passe e dividida
- Visual 3D renovado com arena neon, telões, luzes, contorno estilizado, auras e campo mais detalhado
- Jogadores com corpos, cabelos, números, chuteiras e proporções diferentes
- Partida 4 contra 4 com adversários, companheiros e goleiros controlados pelo computador
- Inteligência tática com funções, marcação, cobertura, apoio, passes e decisões sob pressão
- Companheiros do time azul procuram tocar a bola para o jogador principal quando ele está livre
- Campo com dimensões duplicadas em largura e comprimento
- Controle de um único atleta
- Sprint limitado por energia
- Chute carregado com direção livre
- Passe assistido para companheiros com força carregada no `Espaço`
- Controles mobile sensíveis ao toque
- Desarme com impulso e tempo de recarga
- Paredes com rebote e bola sempre em jogo
- Placar, cronômetro, reinício após gol e resultado da partida

Construído com HTML, CSS, JavaScript e Three.js carregado por CDN.
