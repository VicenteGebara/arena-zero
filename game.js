/* global THREE */
const canvas = document.getElementById('game');
const ui = {
  blue: document.getElementById('blueScore'), red: document.getElementById('redScore'),
  clock: document.getElementById('clock'), stamina: document.getElementById('staminaBar'),
  start: document.getElementById('startScreen'), message: document.getElementById('message'), sprint: document.getElementById('sprintButton'),
  camera: document.getElementById('cameraButton'),
  moveStick: document.getElementById('moveStick'), mobileShoot: document.getElementById('mobileShoot'),
  mobilePass: document.getElementById('mobilePass'), mobileTackle: document.getElementById('mobileTackle'),
  mobileSprint: document.getElementById('mobileSprint'), startButton: document.getElementById('startButton'),
  selectedAthlete: document.getElementById('selectedAthlete'), playerCards: [...document.querySelectorAll('[data-player]')]
};

if (!window.THREE) {
  ui.start.querySelector('p:not(.kicker)').textContent = 'Não foi possível carregar o modo 3D. Verifique a conexão com a internet e atualize a página.';
  ui.startButton.disabled = true;
  throw new Error('Three.js não carregou.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040b0f);
scene.fog = new THREE.FogExp2(0x061014, 0.0057);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.36;

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 420);
const clock3d = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0.25);
const aimPoint = new THREE.Vector3(0, 0, -15);
const keys = {};
const cameraOrbit = { yaw: 0, pitch: .46, distance: 15 };
const broadcastCamera = { yaw: -Math.PI * .58, pitch: .74, distance: 46 };
let cameraMode = 'follow';

const FIELD = { halfW: 46, halfL: 72, goalHalf: 7, goalDepth: 4 };
const TEAM_PALETTE = {
  blue: { main: 0x28d9e3, dark: 0x0c3d45, glow: 0x37e5e2, accent: 0xb9ffff },
  red: { main: 0xff534c, dark: 0x4d1517, glow: 0xff5c4d, accent: 0xffc0b7 }
};
const PLAYER_PROFILES = [
  { name: 'Vicente', tag: 'atleta equilibrado', number: 10, speed: 9.5, sprintSpeed: 14.25, staminaDrain: 28, staminaRegen: 18, shotPower: 1.03, passPower: 1.04, tacklePower: 1, height: 1, bulk: 1, skin: 0xc98b61, hair: 0x17100d, boot: 0xeaff65, accent: 0xeaff65, hairStyle: 'swept' },
  { name: 'Raio', tag: 'ponta explosivo', number: 7, speed: 10.45, sprintSpeed: 15.8, staminaDrain: 32, staminaRegen: 19, shotPower: .92, passPower: .95, tacklePower: .92, height: .96, bulk: .82, skin: 0xd79a70, hair: 0xf0e6b8, boot: 0x37e5e2, accent: 0xeaff65, hairStyle: 'mohawk' },
  { name: 'Titã', tag: 'finalizador forte', number: 9, speed: 8.35, sprintSpeed: 12.6, staminaDrain: 25, staminaRegen: 16, shotPower: 1.2, passPower: .92, tacklePower: 1.24, height: 1.08, bulk: 1.22, skin: 0x8f5b41, hair: 0x050505, boot: 0xff5c4d, accent: 0xffd36b, hairStyle: 'buzz' },
  { name: 'Maestro', tag: 'armador técnico', number: 8, speed: 9.05, sprintSpeed: 13.55, staminaDrain: 26, staminaRegen: 21, shotPower: .98, passPower: 1.22, tacklePower: .95, height: 1.01, bulk: .94, skin: 0xbf8058, hair: 0x201513, boot: 0x9b6cff, accent: 0xb9ffff, hairStyle: 'curly' }
];
const NPC_PROFILES = [
  { name: 'Ala', number: 11, speed: 9.2, sprintSpeed: 13.4, height: .98, bulk: .9, skin: 0xd49a72, hair: 0x23150e, boot: 0xeaff65, accent: 0xb9ffff, hairStyle: 'swept', shotPower: 1, passPower: 1, tacklePower: 1 },
  { name: 'Volante', number: 5, speed: 8.6, sprintSpeed: 12.6, height: 1.03, bulk: 1.08, skin: 0x9d6648, hair: 0x080808, boot: 0xffffff, accent: 0xeaff65, hairStyle: 'buzz', shotPower: 1, passPower: 1, tacklePower: 1.08 },
  { name: 'Meia', number: 6, speed: 8.85, sprintSpeed: 13.1, height: .99, bulk: .96, skin: 0xc98b61, hair: 0x2c1a11, boot: 0x37e5e2, accent: 0xffc0b7, hairStyle: 'curly', shotPower: 1, passPower: 1.06, tacklePower: 1 }
];
const GOALKEEPER_PROFILE = { name: 'Goleiro', number: 1, speed: 7.8, sprintSpeed: 11.4, height: 1.12, bulk: 1.18, skin: 0xb87554, hair: 0x101010, boot: 0xf4f7f3, accent: 0x171c20, hairStyle: 'buzz', shotPower: 1, passPower: 1, tacklePower: 1.15 };
let selectedPlayerIndex = 0;
let running = false, time = 120, blueScore = 0, redScore = 0, kickoff = 0, charge = 0, passCharge = 0, mouseDown = false;
let passCharging = false;
let sprintButtonHeld = false;
let cameraShake = 0, goalGlow = 0;
let lastOwnerNarrated = null;
let lastDribbleNarration = 0;
let lastGoalPressureNarration = 0;
const touchInput = { x: 0, y: 0, moveId: null, cameraId: null, cameraX: 0, cameraY: 0, shootHeld: false };
const visualEffects = new THREE.Group();
scene.add(visualEffects);

const clamp = THREE.MathUtils.clamp;
const flatDistance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const flatDirection = (from, to) => new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
const activeCameraRig = () => cameraMode === 'broadcast' ? broadcastCamera : cameraOrbit;
const activeCameraYaw = () => activeCameraRig().yaw;
const cameraForward = () => new THREE.Vector3(-Math.sin(activeCameraYaw()), 0, -Math.cos(activeCameraYaw()));
const cameraRight = () => new THREE.Vector3(Math.cos(activeCameraYaw()), 0, -Math.sin(activeCameraYaw()));
const coarsePointer = () => matchMedia('(pointer: coarse)').matches;
const touchPointer = e => e.pointerType === 'touch' || e.pointerType === 'pen';
const usePointerLock = () => !coarsePointer() && cameraMode === 'follow';
function requestPointerLockSafe(){
  try {
    const lock = canvas.requestPointerLock?.();
    lock?.catch?.(()=>{});
  } catch {}
}

function updateCameraButton(){
  if(!ui.camera)return;
  const broadcast = cameraMode === 'broadcast';
  ui.camera.classList.toggle('active', broadcast);
  ui.camera.querySelector('strong').textContent = broadcast ? 'TV ALTA' : '3ª PESSOA';
}

function toggleCameraMode(){
  cameraMode = cameraMode === 'follow' ? 'broadcast' : 'follow';
  if(cameraMode === 'broadcast') document.exitPointerLock?.();
  flash(cameraMode === 'broadcast' ? 'CÂMERA TV' : 'CÂMERA JOGADOR', cameraMode === 'broadcast' ? '#37e5e2' : '#eaff65');
  updateCameraButton();
}

const audio = {
  ctx:null, master:null, compressor:null, crowdGain:null, crowdFilter:null, crowdSource:null, rumble:null, rumbleGain:null,
  chantGain:null, fxGain:null, noiseBurstBuffer:null, enabled:false, lastSpeech:0, voice:null,
  currentSpeechPriority:0, lastSpeechType:'', speechId:0, crowdIntensity:.32, chantTimer:.4, clapTimer:.35, shoutTimer:.65, chantIndex:0
};

function initAudio(){
  if(audio.enabled)return;
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return;
  audio.ctx=audio.ctx||new AudioContext();
  if(audio.ctx.state==='suspended')audio.ctx.resume?.();
  audio.master=audio.ctx.createGain();audio.master.gain.value=.92;
  audio.compressor=audio.ctx.createDynamicsCompressor();
  audio.compressor.threshold.value=-18;audio.compressor.knee.value=22;audio.compressor.ratio.value=5;audio.compressor.attack.value=.006;audio.compressor.release.value=.2;
  audio.master.connect(audio.compressor);audio.compressor.connect(audio.ctx.destination);
  const duration=2.2, length=Math.floor(audio.ctx.sampleRate*duration), buffer=audio.ctx.createBuffer(1,length,audio.ctx.sampleRate), data=buffer.getChannelData(0);
  for(let i=0;i<length;i++){
    const wave=Math.sin(i*.011)*.08+Math.sin(i*.027)*.06+Math.sin(i*.004)*.09;
    data[i]=(Math.random()*2-1)*.26+wave;
  }
  const burstLength=Math.floor(audio.ctx.sampleRate*1.1);
  audio.noiseBurstBuffer=audio.ctx.createBuffer(1,burstLength,audio.ctx.sampleRate);
  const burst=audio.noiseBurstBuffer.getChannelData(0);
  for(let i=0;i<burstLength;i++)burst[i]=(Math.random()*2-1)*(1-i/burstLength);
  audio.crowdSource=audio.ctx.createBufferSource();audio.crowdSource.buffer=buffer;audio.crowdSource.loop=true;
  audio.crowdFilter=audio.ctx.createBiquadFilter();audio.crowdFilter.type='bandpass';audio.crowdFilter.frequency.value=620;audio.crowdFilter.Q.value=.62;
  audio.crowdGain=audio.ctx.createGain();audio.crowdGain.gain.value=.075;
  audio.crowdSource.connect(audio.crowdFilter);audio.crowdFilter.connect(audio.crowdGain);audio.crowdGain.connect(audio.master);audio.crowdSource.start();
  audio.chantGain=audio.ctx.createGain();audio.chantGain.gain.value=1.65;audio.chantGain.connect(audio.master);
  audio.fxGain=audio.ctx.createGain();audio.fxGain.gain.value=1.45;audio.fxGain.connect(audio.master);
  audio.rumble=audio.ctx.createOscillator();audio.rumble.type='sawtooth';audio.rumble.frequency.value=82;
  audio.rumbleGain=audio.ctx.createGain();audio.rumbleGain.gain.value=.013;
  audio.rumble.connect(audio.rumbleGain);audio.rumbleGain.connect(audio.master);audio.rumble.start();
  audio.enabled=true;
  chooseNarratorVoice();
  triggerCrowdReaction('kickoff', .95);
  narrateEvent('kickoff', {}, true, 0);
}

function chooseNarratorVoice(){
  if(!window.speechSynthesis)return;
  const voices=window.speechSynthesis.getVoices?.()||[];
  audio.voice=voices.find(v=>/pt-BR|Portuguese|Brasil/i.test(`${v.lang} ${v.name}`))||voices[0]||null;
}
window.speechSynthesis?.addEventListener?.('voiceschanged',chooseNarratorVoice);

function narrate(text, urgent=false, minGap=2300, priority=1, type='normal'){
  if(!running&&!urgent)return;
  const now=performance.now();
  if(!urgent&&priority<=1&&now-audio.lastSpeech<minGap)return;
  if(!urgent&&priority===3&&now-audio.lastSpeech<650)return;
  if(window.speechSynthesis){
    const synth=window.speechSynthesis, busy=synth.speaking||synth.pending;
    if(busy&&priority<=1)return;
    synth.cancel();
    audio.lastSpeech=now;audio.currentSpeechPriority=priority;audio.lastSpeechType=type;const speechId=++audio.speechId;
    const utter=new SpeechSynthesisUtterance(text);
    utter.lang='pt-BR'; utter.rate=urgent?1.24:1.16+Math.random()*.05; utter.pitch=urgent?1.09:1.01+Math.random()*.08; utter.volume=.92;
    utter.onend=utter.onerror=()=>{if(audio.speechId===speechId)audio.currentSpeechPriority=0;};
    if(audio.voice)utter.voice=audio.voice;
    setTimeout(()=>{if(audio.speechId===speechId)synth.speak(utter);},25);
  }
}

function playTone(freq=440,duration=.12,type='sine',volume=.08){
  if(!audio.ctx||!audio.enabled)return;
  const osc=audio.ctx.createOscillator(), gain=audio.ctx.createGain(), now=audio.ctx.currentTime;
  osc.type=type;osc.frequency.setValueAtTime(freq,now);gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  osc.connect(gain);gain.connect(audio.master);osc.start(now);osc.stop(now+duration+.02);
}

function playerName(player){
  if(!player)return 'ninguém';
  if(player.user)return player.profile?.name||'Vicente';
  if(player.goalkeeper)return player.team==='blue'?'goleiro azul':'goleiro vermelho';
  const side=player.team==='blue'?'azul':'vermelho';
  return `${player.profile?.name||'jogador'} ${side}`;
}

function pick(list){return list[Math.floor(Math.random()*list.length)];}
function scorePhrase(){return blueScore===redScore?`${blueScore} a ${redScore}, tudo igual`:`${blueScore} a ${redScore}`;}
function attackingGoalDistance(player){
  if(!player)return 99;
  const attackZ=player.team==='blue'?-FIELD.halfL:FIELD.halfL;
  return Math.abs(player.position.z-attackZ);
}
function narrateEvent(type, data={}, urgent=false, minGap=2300){
  const player=data.player, name=playerName(player), strong=data.power>.78, veryStrong=data.power>.98, danger=player&&attackingGoalDistance(player)<28;
  const priorityByType={possession:1,dribble:3,pass:3,keeper:3,danger:4,shot:5,goal:6,kickoff:6};
  const priority=priorityByType[type]||1;
  let line='';
  if(type==='kickoff')line=pick([
    'Som na caixa, torcida acordada, a bola vai rolar na Arena Zero!',
    'Tudo pronto! Jogadores posicionados, e o estádio já empurra o jogo.',
    'Começa a partida! O clima está quente e a torcida quer espetáculo.'
  ]);
  if(type==='possession')line=player?.user?pick([
    `${name} domina, levanta a cabeça e procura a jogada.`,
    `${name} fica com ela. Tem espaço para pensar.`,
    `${name} pega na bola e chama a responsabilidade.`
  ]):pick([
    `${name} controla a posse e organiza o ataque.`,
    `${name} recebe, ajeita o corpo e olha para frente.`,
    `${name} fica com a bola, tentando acelerar a jogada.`
  ]);
  if(type==='shot')line=player?.user?pick([
    veryStrong?`${name} soltou uma bomba! A bola saiu viva!`:`${name} bateu para o gol!`,
    danger?`Olha o ${name}! Chute perigoso, a torcida levantou!`:`${name} arriscou de fora, pegou firme na bola.`,
    `${name} finaliza! Vamos ver o que acontece!`
  ]):pick([
    veryStrong?`${name} encheu o pé, que pancada!`:`${name} chutou para o gol.`,
    danger?`${name} apareceu na área e finalizou!`:`${name} tentou surpreender no chute.`,
    `${name} bateu buscando o canto.`
  ]);
  if(type==='pass')line=player?.user?pick([
    strong?`${name} carregou o passe e virou o jogo com força.`:`${name} toca e se movimenta para receber de volta.`,
    strong?`Passe forte do ${name}, tentando quebrar a linha.`:`Boa bola do ${name}, simples e rápido.`,
    `${name} escolhe o passe e acelera a construção.`
  ]):pick([
    strong?`${name} estica o passe, procurando o companheiro em velocidade.`:`${name} toca curto para manter a posse.`,
    `${name} solta a bola antes da pressão chegar.`,
    `${name} acha uma opção e faz a bola correr.`
  ]);
  if(type==='keeper')line=pick([
    `${name} repõe rápido e chama o time para sair jogando.`,
    `${name} segurou a pressão e devolveu a bola para o campo.`,
    `${name} faz a reposição, jogo seguindo.`
  ]);
  if(type==='dribble')line=player?.user?pick([
    `${name} chama a marcação para dançar e tenta passar no drible.`,
    `${name} prende, gira o corpo e acelera com a bola.`,
    `${name} vai conduzindo, do jeitinho de quem quer decidir.`
  ]):pick([
    data.pressure?`${name} protege a bola e tenta escapar da marcação.`:`${name} conduz com calma, esperando a abertura.`,
    `${name} segura a posse e procura o melhor caminho.`,
    `${name} prefere carregar antes de soltar o passe.`
  ]);
  if(type==='danger')line=ball.owner?.user?pick([
    `${playerName(ball.owner)} chegou perto do gol! O estádio sentiu o perigo.`,
    `Atenção, ${playerName(ball.owner)} vem chegando! A torcida aumentou o volume.`,
    `Pode pintar chance boa! ${playerName(ball.owner)} está na zona quente.`
  ]):pick([
    'Olha o perigo perto da área! A torcida percebeu a chance.',
    'A bola está rondando o gol, momento de tensão no estádio.',
    'Chegada perigosa! Todo mundo ficou de pé agora.'
  ]);
  if(type==='goal')line=data.team==='blue'?pick([
    `É goool do time azul! A Arena Zero explode, placar agora ${scorePhrase()}!`,
    `Bola na rede! O time azul marca e a torcida vai junto!`,
    `Golaço do azul! Finalização certeira, sem chance!`
  ]):pick([
    `Gol do time vermelho! O estádio sente o golpe e o jogo pega fogo.`,
    `Bola na rede do vermelho! Jogada rápida e conclusão forte.`,
    `Sai o gol vermelho! Agora é respirar e voltar para o jogo.`
  ]);
  if(line)narrate(line, urgent, minGap, priority, type);
}

function announcePossession(){
  if(!running||!ball.owner)return;
  if(ball.owner!==lastOwnerNarrated){
    lastOwnerNarrated=ball.owner;
    narrateEvent('possession', {player:ball.owner}, false, ball.owner.user?2300:3100);
  }
}

function playCrowdVoice(freq,start,duration,volume,formant=760,bend=0){
  if(!audio.enabled||!audio.ctx)return;
  const osc=audio.ctx.createOscillator(), filter=audio.ctx.createBiquadFilter(), gain=audio.ctx.createGain();
  osc.type='sawtooth';filter.type='bandpass';filter.frequency.setValueAtTime(formant,start);filter.Q.value=3.6+Math.random()*1.8;
  osc.frequency.setValueAtTime(freq,start);
  osc.frequency.linearRampToValueAtTime(freq*(1+bend),start+duration*.78);
  gain.gain.setValueAtTime(.001,start);
  gain.gain.linearRampToValueAtTime(volume,start+.05);
  gain.gain.setTargetAtTime(volume*.82,start+duration*.32,duration*.35);
  gain.gain.exponentialRampToValueAtTime(.001,start+duration);
  osc.connect(filter);filter.connect(gain);gain.connect(audio.chantGain||audio.master);osc.start(start);osc.stop(start+duration+.05);
}

function playNoiseHit(start,duration,volume,mode='clap'){
  if(!audio.enabled||!audio.ctx||!audio.noiseBurstBuffer)return;
  const source=audio.ctx.createBufferSource(), filter=audio.ctx.createBiquadFilter(), gain=audio.ctx.createGain();
  source.buffer=audio.noiseBurstBuffer;source.playbackRate.value=mode==='clap'?2.6+Math.random()*1.8:1.1+Math.random()*.9;
  filter.type=mode==='clap'?'highpass':'bandpass';
  filter.frequency.value=mode==='clap'?1200+Math.random()*1200:700+Math.random()*900;
  filter.Q.value=mode==='clap' ? .7 : 1.8;
  gain.gain.setValueAtTime(.001,start);
  gain.gain.linearRampToValueAtTime(volume,start+.01);
  gain.gain.exponentialRampToValueAtTime(.001,start+duration);
  source.connect(filter);filter.connect(gain);gain.connect(audio.fxGain||audio.master);
  source.start(start,Math.random()*.4,duration+.02);
}

function playClapBurst(count=4,intensity=.5){
  if(!audio.enabled||!audio.ctx)return;
  const now=audio.ctx.currentTime;
  for(let i=0;i<count;i++)playNoiseHit(now+i*(.055+Math.random()*.055)+Math.random()*.06,.08+Math.random()*.04,.04+intensity*.065,'clap');
}

function playWhistle(intensity=.6){
  if(!audio.enabled||!audio.ctx)return;
  const now=audio.ctx.currentTime, osc=audio.ctx.createOscillator(), gain=audio.ctx.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(1450+Math.random()*500,now);osc.frequency.linearRampToValueAtTime(2100+Math.random()*700,now+.18);
  gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.035+intensity*.05,now+.035);gain.gain.exponentialRampToValueAtTime(.001,now+.38);
  osc.connect(gain);gain.connect(audio.fxGain||audio.master);osc.start(now);osc.stop(now+.42);
}

function playCrowdShout(kind='normal',intensity=.45){
  if(!audio.enabled||!audio.ctx)return;
  const now=audio.ctx.currentTime;
  const count=kind==='goal'?18:kind==='shot'?11:Math.floor(5+intensity*8);
  for(let i=0;i<count;i++){
    const start=now+Math.random()*(kind==='goal' ? .85 : .38), duration=(kind==='goal' ? .42 : .24)+Math.random()*(kind==='goal' ? .62 : .32);
    const freq=115+Math.random()*150, formant=kind==='goal'?620+Math.random()*920:720+Math.random()*820;
    playCrowdVoice(freq,start,duration,.024+intensity*.032,formant,(Math.random()-.45)*.22);
  }
  if(kind==='shot'||kind==='goal')playNoiseHit(now+.06,.28,.08+intensity*.09,'roar');
  if(kind==='goal')playNoiseHit(now+.32,.75,.18,'roar');
}

function playCrowdChant(intensity=.45){
  if(!audio.enabled||!audio.ctx)return;
  const now=audio.ctx.currentTime, patterns=[[0,.34,.68,1.08],[0,.28,.56,.98,1.24],[0,.42,.84]];
  const pattern=patterns[audio.chantIndex++%patterns.length], voices=Math.floor(8+intensity*10);
  for(let v=0;v<voices;v++){
    const base=105+Math.random()*125, offset=Math.random()*.09, formant=560+Math.random()*520;
    pattern.forEach((beat,i)=>playCrowdVoice(base*(1+Math.random()*.08),now+beat+offset,.26+Math.random()*.22,.018+intensity*.026,formant+i*70,(Math.random()-.5)*.1));
  }
}

function triggerCrowdReaction(kind='normal',intensity=.5){
  if(!audio.enabled||!audio.ctx)return;
  if(kind==='goal'){
    playCrowdShout('goal',1);playClapBurst(24,1);playWhistle(.95);setTimeout(()=>playCrowdChant(.92),280);
    return;
  }
  if(kind==='shot'){playCrowdShout('shot',intensity);playClapBurst(8,intensity);if(intensity>.75)playWhistle(intensity);return;}
  if(kind==='danger'){playCrowdShout('danger',intensity);playClapBurst(5,intensity);return;}
  if(kind==='kickoff'){playCrowdChant(intensity);playClapBurst(10,intensity);return;}
  if(kind==='pass'){if(Math.random()<.55)playClapBurst(3,intensity*.55);return;}
  playCrowdShout('normal',intensity);
}

function updateCrowdAudio(dt){
  if(!audio.enabled||!audio.ctx||!audio.crowdGain)return;
  const goalProximity=clamp((Math.abs(ball.position.z)-(FIELD.halfL-36))/36,0,1);
  const velocityBoost=clamp(ball.velocity.length()/80,0,.45);
  const ownerBoost=ball.owner?.user ? .08 : 0;
  const targetIntensity=clamp((running ? .38 : .14)+Math.pow(goalProximity,1.45)*.58+velocityBoost*.34+goalGlow*.75+ownerBoost,0,1);
  audio.crowdIntensity+= (targetIntensity-audio.crowdIntensity)*(1-Math.pow(.03,dt));
  const target=.07+audio.crowdIntensity*.25+goalGlow*.16;
  const now=audio.ctx.currentTime;
  audio.crowdGain.gain.setTargetAtTime(target,now,.28);
  audio.crowdFilter.frequency.setTargetAtTime(560+goalProximity*820+velocityBoost*420,now,.35);
  audio.rumbleGain?.gain.setTargetAtTime(.009+audio.crowdIntensity*.03,now,.4);
  if(running){
    audio.chantTimer-=dt*(.65+audio.crowdIntensity*.55);
    audio.clapTimer-=dt*(.9+audio.crowdIntensity*.9);
    audio.shoutTimer-=dt*(.7+audio.crowdIntensity*.75);
    if(audio.chantTimer<=0){playCrowdChant(audio.crowdIntensity);audio.chantTimer=1.9+Math.random()*1.7-audio.crowdIntensity*.75;}
    if(audio.clapTimer<=0){playClapBurst(3+Math.floor(audio.crowdIntensity*6),audio.crowdIntensity);audio.clapTimer=.55+Math.random()*.85-audio.crowdIntensity*.25;}
    if(audio.shoutTimer<=0){playCrowdShout('normal',audio.crowdIntensity);audio.shoutTimer=.95+Math.random()*1.35-audio.crowdIntensity*.35;}
  }
  if(running&&goalProximity>.72&&performance.now()-lastGoalPressureNarration>7000){
    lastGoalPressureNarration=performance.now();
    triggerCrowdReaction('danger', audio.crowdIntensity);
    narrateEvent('danger', {}, false, 3200);
  }
}

function material(color, roughness = 0.72, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function selectedProfile(){
  return PLAYER_PROFILES[selectedPlayerIndex] || PLAYER_PROFILES[0];
}

function userPlayer(){
  return players.find(p => p.user) || players[0];
}

function addOutline(parent, source, scale = 1.045, opacity = .55) {
  const outline = new THREE.Mesh(source.geometry, new THREE.MeshBasicMaterial({ color: 0x020506, side: THREE.BackSide, transparent: true, opacity }));
  outline.position.copy(source.position); outline.rotation.copy(source.rotation); outline.scale.copy(source.scale).multiplyScalar(scale);
  parent.add(outline);
  return outline;
}

function addMesh(parent, mesh, outlineScale = 1.045) {
  addOutline(parent, mesh, outlineScale);
  parent.add(mesh);
  return mesh;
}

function createLabelTexture(title, subtitle = '', options = {}) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 384; const g = c.getContext('2d');
  const accent = options.accent || '#37e5e2', color = options.color || '#f4fff9';
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, 'rgba(55,229,226,.22)'); grad.addColorStop(.55, 'rgba(234,255,101,.08)'); grad.addColorStop(1, 'rgba(255,92,77,.18)');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = accent; g.lineWidth = 8; g.strokeRect(26, 26, c.width - 52, c.height - 52);
  g.fillStyle = color; g.font = '900 118px Archivo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(title, c.width / 2, subtitle ? 164 : 192);
  if (subtitle) {
    g.fillStyle = accent; g.font = '700 34px Space Mono, monospace'; g.fillText(subtitle.toUpperCase(), c.width / 2, 250);
  }
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function createNumberTexture(number, color = '#ffffff', accent = '#eaff65') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,.32)'; g.beginPath(); g.roundRect?.(12, 16, 104, 96, 18); g.fill();
  g.strokeStyle = accent; g.lineWidth = 5; g.strokeRect(18, 22, 92, 84);
  g.fillStyle = color; g.font = '900 70px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 64, 68);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function createNameSprite(profile) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(3,6,8,.72)'; g.beginPath(); g.roundRect?.(38, 30, 436, 68, 28); g.fill();
  g.strokeStyle = '#eaff65'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#f4f7f3'; g.font = '900 38px Archivo, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(profile.name.toUpperCase(), 256, 64);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.9, .72, 1); return sprite;
}

function createTurfTexture() {
  const size = 512, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, stripe = Math.floor(y / 38) % 2 ? 15 : 0, lane = Math.floor(x / 64) % 2 ? 5 : 0, grain = Math.random() * 20;
    data[i] = 8 + lane + grain * .65; data[i + 1] = 62 + stripe + lane + grain; data[i + 2] = 45 + stripe * .55 + grain * .5; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(7, 11); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}

function createBallTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 256); gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#cfd5d0'); g.fillStyle = gradient; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#7d8583'; g.lineWidth = 3;
  const spots = [[70,58,23],[210,36,20],[348,64,24],[465,42,18],[138,160,25],[290,178,23],[430,155,26],[18,205,19]];
  spots.forEach(([x,y,r], index) => {
    g.beginPath(); for (let p = 0; p < 5; p++) { const a = -Math.PI/2 + p*Math.PI*2/5, px=x+Math.cos(a)*r, py=y+Math.sin(a)*r; p ? g.lineTo(px,py) : g.moveTo(px,py); } g.closePath();
    g.fillStyle = index % 3 === 0 ? '#101719' : '#172326'; g.fill(); g.stroke();
  });
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function addAtmosphere() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 18), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { topColor: { value: new THREE.Color(0x071a2b) }, bottomColor: { value: new THREE.Color(0x102c28) }, glowColor: { value: new THREE.Color(0x37e5e2) } },
    vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vPos; uniform vec3 topColor; uniform vec3 bottomColor; uniform vec3 glowColor; void main(){float h=normalize(vPos).y*.5+.5; vec3 col=mix(bottomColor,topColor,smoothstep(.12,.85,h)); float glow=pow(1.0-max(h-.18,0.0),7.0)*.14; gl_FragColor=vec4(col+glowColor*glow,1.0);}'
  }));
  scene.add(sky);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshBasicMaterial({ color: 0x9ffff2, transparent: true, opacity: .045, depthWrite: false }));
  halo.position.set(-45, 35, -75); halo.lookAt(0, 8, 0); scene.add(halo);
  const outerGround = new THREE.Mesh(new THREE.CircleGeometry(175, 64), material(0x05090b, 1)); outerGround.rotation.x = -Math.PI / 2; outerGround.position.y = -.08; outerGround.receiveShadow = true; scene.add(outerGround);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xb9f4ff, 0x07100d, 1.65));
  scene.add(new THREE.AmbientLight(0x6ca8a0, .28));
  const sun = new THREE.DirectionalLight(0xd9f7ff, 3.15);
  sun.position.set(-18, 38, 24); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90; sun.shadow.camera.far=220; sun.shadow.bias = -.00035; scene.add(sun);
  [[-(FIELD.halfW+5),-FIELD.halfL*.72],[FIELD.halfW+5,-FIELD.halfL*.72],[-(FIELD.halfW+5),FIELD.halfL*.72],[FIELD.halfW+5,FIELD.halfL*.72]].forEach(([x,z]) => {
    const light = new THREE.SpotLight(0xdffffb, 138, 150, Math.PI/4.3, .55, 1.16); light.position.set(x, 20, z); light.target.position.set(0,0,z*.25); scene.add(light, light.target);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,19,10), material(0x222c31,.35,.75)); pole.position.set(x,9.5,z); pole.castShadow=true; scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(4.2,1.2,.45), new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xdffffb,emissiveIntensity:5,roughness:.25})); lamp.position.set(x,19,z); lamp.lookAt(0,3,0); scene.add(lamp);
  });
  const blueSide = new THREE.PointLight(0x37e5e2, 32, 95, 1.6); blueSide.position.set(-FIELD.halfW*.7, 5, FIELD.halfL*.38); scene.add(blueSide);
  const redSide = new THREE.PointLight(0xff5c4d, 28, 95, 1.7); redSide.position.set(FIELD.halfW*.7, 5, -FIELD.halfL*.38); scene.add(redSide);
}

function addPitch() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfW*2+6, FIELD.halfL*2+8, 1, 1), new THREE.MeshStandardMaterial({ map:createTurfTexture(), color:0xffffff, roughness:.91, metalness:0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  for (let z = -FIELD.halfL+1; z < FIELD.halfL; z += 6) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfW*2, 3), new THREE.MeshBasicMaterial({ color: Math.floor(z/6)%2 ? 0x57a579 : 0x183e32, transparent: true, opacity: .07, depthWrite:false }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, .012, z); scene.add(stripe);
  }
  const lines = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf0fff9, transparent: true, opacity: .88 });
  const rect = (w, h, x = 0, z = 0) => {
    const pts = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,-h/2]].map(([px,pz]) => new THREE.Vector3(px+x,.035,pz+z));
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  };
  rect(FIELD.halfW * 2, FIELD.halfL * 2); rect(26, 14, 0, -(FIELD.halfL-7)); rect(26, 14, 0, FIELD.halfL-7);
  lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-FIELD.halfW,.035,0),new THREE.Vector3(FIELD.halfW,.035,0)]), lineMat));
  const circle = new THREE.EllipseCurve(0,0,5.2,5.2,0,Math.PI*2).getPoints(64).map(p => new THREE.Vector3(p.x,.035,p.y));
  lines.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle), lineMat));
  const centerSpot = new THREE.Mesh(new THREE.CircleGeometry(.16,18),new THREE.MeshBasicMaterial({color:0xf0fff9})); centerSpot.rotation.x=-Math.PI/2;centerSpot.position.y=.04;scene.add(centerSpot);
  const centerLogo = new THREE.Mesh(new THREE.PlaneGeometry(14, 6.4), new THREE.MeshBasicMaterial({ map:createLabelTexture('AZ', 'ARENA ZERO', { accent:'#eaff65' }), transparent:true, opacity:.64, depthWrite:false, blending:THREE.AdditiveBlending }));
  centerLogo.rotation.x = -Math.PI / 2; centerLogo.position.y = .045; scene.add(centerLogo);
  const borderMat = new THREE.MeshBasicMaterial({ color:0x37e5e2, transparent:true, opacity:.22, depthWrite:false, blending:THREE.AdditiveBlending });
  const endMat = new THREE.MeshBasicMaterial({ color:0xff5c4d, transparent:true, opacity:.18, depthWrite:false, blending:THREE.AdditiveBlending });
  [-1,1].forEach(side => {
    const sideGlow = new THREE.Mesh(new THREE.PlaneGeometry(.42, FIELD.halfL * 2), borderMat);
    sideGlow.rotation.x = -Math.PI / 2; sideGlow.position.set(side * (FIELD.halfW - .15), .052, 0); scene.add(sideGlow);
    const endGlow = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfW * 2, .42), endMat);
    endGlow.rotation.x = -Math.PI / 2; endGlow.position.set(0, .053, side * (FIELD.halfL - .15)); scene.add(endGlow);
  });
  for (let z = -FIELD.halfL + 18; z <= FIELD.halfL - 18; z += 18) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfW * 1.55, .05), new THREE.MeshBasicMaterial({ color:0xeaff65, transparent:true, opacity:.16, depthWrite:false, blending:THREE.AdditiveBlending }));
    dash.rotation.x = -Math.PI / 2; dash.position.set(0, .056, z); scene.add(dash);
  }
  scene.add(lines);
  addGoals(); addWalls(); addStadium();
}

function addGoals() {
  const goalMat = new THREE.MeshStandardMaterial({color:0xf4ffff,roughness:.24,metalness:.72,emissive:0xbaffff,emissiveIntensity:.16});
  [-1, 1].forEach(side => {
    const group = new THREE.Group(), z = side * FIELD.halfL;
    const postGeo = new THREE.CylinderGeometry(.13, .13, 3.2, 12);
    [-FIELD.goalHalf, FIELD.goalHalf].forEach(x => { const p = new THREE.Mesh(postGeo, goalMat); p.position.set(x,1.6,z); p.castShadow = true; group.add(p); });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,FIELD.goalHalf*2,12), goalMat); bar.rotation.z = Math.PI/2; bar.position.set(0,3.2,z); group.add(bar);
    const netMat = new THREE.LineBasicMaterial({color:side<0?0x8ffff0:0xff9b91,transparent:true,opacity:.28});
    const netPositions=[];
    for(let x=-FIELD.goalHalf;x<=FIELD.goalHalf+.01;x+=.65){ netPositions.push(x,0,z,x,3.2,z,x,3.2,z,x,2.35,z+side*FIELD.goalDepth,x,2.35,z+side*FIELD.goalDepth,x,0,z+side*FIELD.goalDepth); }
    for(let y=0;y<=3.2+.01;y+=.48){ netPositions.push(-FIELD.goalHalf,y,z,FIELD.goalHalf,y,z); if(y<=2.4)netPositions.push(-FIELD.goalHalf,y,z+side*FIELD.goalDepth,FIELD.goalHalf,y,z+side*FIELD.goalDepth); }
    const netGeo=new THREE.BufferGeometry();netGeo.setAttribute('position',new THREE.Float32BufferAttribute(netPositions,3));group.add(new THREE.LineSegments(netGeo,netMat));
    const floorNet=new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalHalf*2,FIELD.goalDepth),new THREE.MeshBasicMaterial({color:side<0?0x37e5e2:0xff5c4d,transparent:true,opacity:.035,side:THREE.DoubleSide})); floorNet.rotation.x=-Math.PI/2;floorNet.position.set(0,.03,z+side*FIELD.goalDepth/2);group.add(floorNet);
    const mouthGlow = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalHalf*2.6, 4.2), new THREE.MeshBasicMaterial({ color:side<0?0x37e5e2:0xff5c4d, transparent:true, opacity:.11, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }));
    mouthGlow.position.set(0, 2, z + side * .05); group.add(mouthGlow);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(FIELD.goalHalf*2.25,.12,FIELD.goalDepth+.4), new THREE.MeshStandardMaterial({color:0x0b1114,roughness:.4,metalness:.62,emissive:side<0?0x123738:0x3a1718,emissiveIntensity:.55}));
    roof.position.set(0,3.38,z+side*FIELD.goalDepth/2); roof.castShadow=true; group.add(roof);
    group.userData.netMaterial=netMat; scene.add(group);
  });
}

function addWalls() {
  const glass = new THREE.MeshPhysicalMaterial({ color:0x9fffee, transparent:true, opacity:.12, roughness:.08, metalness:.18, transmission:.2, thickness:.4, side:THREE.DoubleSide });
  const sideGeo = new THREE.BoxGeometry(.25, 3.5, FIELD.halfL * 2 + 4);
  [-1,1].forEach(side => { const wall = new THREE.Mesh(sideGeo, glass); wall.position.set(side*(FIELD.halfW+.15),1.75,0); scene.add(wall); });
  const endGeo = new THREE.BoxGeometry(FIELD.halfW*2,3.5,.25);
  [-1,1].forEach(side => { const wall = new THREE.Mesh(endGeo, glass); wall.position.set(0,1.75,side*(FIELD.halfL+.15)); scene.add(wall); });
}

function addStadium() {
  const concrete=material(0x11191e,.92,.08), seatColors=[0x37e5e2,0x1c7d84,0xff5c4d,0x8a302f,0xeaff65,0xdce9e5];
  [-1,1].forEach(side=>{
    for(let tier=0;tier<5;tier++){ const step=new THREE.Mesh(new THREE.BoxGeometry(3.2,1.05,FIELD.halfL*2+14),concrete);step.position.set(side*(FIELD.halfW+2.2+tier*1.45),.5+tier*.9,0);step.castShadow=step.receiveShadow=true;scene.add(step); }
  });
  const spectatorGeo=new THREE.CapsuleGeometry(.11,.24,2,5), spectatorMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8,vertexColors:true});
  const crowd=new THREE.InstancedMesh(spectatorGeo,spectatorMat,900), dummy=new THREE.Object3D(), color=new THREE.Color();
  for(let i=0;i<900;i++){
    const side=i%2?-1:1,tier=Math.floor(Math.random()*5);dummy.position.set(side*(FIELD.halfW+2.1+tier*1.45),1.3+tier*.9,-FIELD.halfL-3+Math.random()*(FIELD.halfL*2+6));dummy.rotation.y=side*Math.PI/2;dummy.scale.setScalar(.8+Math.random()*.55);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);color.setHex(seatColors[Math.floor(Math.random()*seatColors.length)]);crowd.setColorAt(i,color);
  }
  crowd.instanceMatrix.needsUpdate=true; crowd.instanceColor.needsUpdate=true; scene.add(crowd);
  const ledColors=[0x37e5e2,0xeaff65,0xff5c4d];
  [-1,1].forEach(side=>{ for(let z=-FIELD.halfL+4;z<=FIELD.halfL-4;z+=8){ const c=ledColors[(Math.abs(Math.round(z/8))+(side>0?1:0))%ledColors.length];const board=new THREE.Mesh(new THREE.BoxGeometry(.22,1.1,7.4),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:2.2,roughness:.3}));board.position.set(side*(FIELD.halfW+.65),.65,z);scene.add(board); } });
  [-1,1].forEach(side=>{ const screenZ=side*(FIELD.halfL+6.8);const screen=new THREE.Mesh(new THREE.BoxGeometry(16,5.5,.45),new THREE.MeshStandardMaterial({color:side<0?0x37e5e2:0xff5c4d,emissive:side<0?0x37e5e2:0xff5c4d,emissiveIntensity:.8,roughness:.35}));screen.position.set(0,8,screenZ-side*.2);scene.add(screen);const frame=new THREE.Mesh(new THREE.BoxGeometry(18,6.5,.7),material(0x0b1114,.3,.75));frame.position.set(0,8,screenZ+side*.2);scene.add(frame); });
  [-1,1].forEach(side=>{
    const screenZ=side*(FIELD.halfL+6.45), label=new THREE.Mesh(new THREE.PlaneGeometry(15.1,4.7),new THREE.MeshBasicMaterial({map:createLabelTexture(side<0?'BLUE SIDE':'RED SIDE','ARENA ZERO',{accent:side<0?'#37e5e2':'#ff5c4d'}),transparent:true,opacity:.92,side:THREE.DoubleSide}));
    label.position.set(0,8,screenZ-side*.55); label.lookAt(0,8,0); scene.add(label);
  });
  const trussMat=new THREE.MeshStandardMaterial({color:0x131e24,roughness:.38,metalness:.7,emissive:0x071a1c,emissiveIntensity:.25});
  for(let z=-FIELD.halfL-8;z<=FIELD.halfL+8;z+=18){
    const truss=new THREE.Mesh(new THREE.BoxGeometry(FIELD.halfW*2+34,.18,.18),trussMat);truss.position.set(0,15.4,z);truss.castShadow=true;scene.add(truss);
    [-1,1].forEach(side=>{const rib=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,16),trussMat);rib.position.set(side*(FIELD.halfW+13),15.4,z);rib.rotation.y=.42*side;scene.add(rib);});
  }
  [[-(FIELD.halfW+7),-FIELD.halfL*.58,0x37e5e2],[FIELD.halfW+7,-FIELD.halfL*.58,0xeaff65],[-(FIELD.halfW+7),FIELD.halfL*.58,0xff5c4d],[FIELD.halfW+7,FIELD.halfL*.58,0x9b6cff]].forEach(([x,z,c])=>{
    const beam=new THREE.Mesh(new THREE.ConeGeometry(9,26,28,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
    beam.position.set(x,9,z); beam.rotation.x=Math.PI; scene.add(beam);
  });
}

function predictedBallPosition(seconds=.22){
  return new THREE.Vector3(
    clamp(ball.position.x+ball.velocity.x*seconds,-FIELD.halfW+1,FIELD.halfW-1),
    0,
    clamp(ball.position.z+ball.velocity.z*seconds,-FIELD.halfL+1,FIELD.halfL-1)
  );
}

function nearestOpponent(player){
  return players.filter(p=>p.team!==player.team).sort((a,b)=>flatDistance(player,a)-flatDistance(player,b))[0];
}

function userReceiverFor(player){
  return players.find(p=>p.user&&p.team===player.team&&p!==player&&!p.goalkeeper);
}

function nearestOpponentDistanceTo(target,opponents){
  return Math.min(...opponents.map(p=>flatDistance(target,p)),99);
}

function choosePassTarget(player,includeGoalkeeper=false){
  const attackZ=player.team==='blue'?-1:1;
  const candidates=players.filter(p=>p.team===player.team&&p!==player&&(includeGoalkeeper||!p.goalkeeper));
  const opponents=players.filter(p=>p.team!==player.team);
  return candidates.sort((a,b)=>{
    const score=c=>{
      const space=nearestOpponentDistanceTo(c,opponents);
      const progress=(c.position.z-player.position.z)*attackZ;
      const clearLane=hasClearLane(player.position,c.position,opponents,2.2);
      const userBonus=c.user?18:0;
      return space*1.5+progress*.72-flatDistance(player,c)*.12+(clearLane?4.5:-5)+userBonus;
    };
    return score(b)-score(a);
  })[0];
}

function hasClearLane(from,to,opponents,width=2.6){
  const line=new THREE.Vector2(to.x-from.x,to.z-from.z),length=line.length();if(length<.1)return true;line.normalize();
  return !opponents.some(opponent=>{const rel=new THREE.Vector2(opponent.position.x-from.x,opponent.position.z-from.z),along=rel.dot(line);if(along<=0||along>=length)return false;const side=Math.abs(rel.x*line.y-rel.y*line.x);return side<width;});
}

class Player {
  constructor(x, z, team, user = false, goalkeeper = false, role = 'support', profile = null) {
    this.team = team; this.user = user; this.goalkeeper = goalkeeper; this.role = role; this.profile = profile || (goalkeeper ? GOALKEEPER_PROFILE : NPC_PROFILES[Math.floor(Math.random() * NPC_PROFILES.length)]);
    this.baseSpeed = this.profile.speed || 8.8; this.sprintSpeed = this.profile.sprintSpeed || 12.8; this.staminaDrain = this.profile.staminaDrain || 27; this.staminaRegen = this.profile.staminaRegen || 18;
    this.shotPower = this.profile.shotPower || 1; this.passPower = this.profile.passPower || 1; this.tacklePower = this.profile.tacklePower || 1;
    this.velocity = new THREE.Vector3(); this.ballDirection = new THREE.Vector3(0,0,team==='blue'?-1:1); this.stamina = 100; this.cooldown = 0; this.releaseLock = 0; this.tackle = 0; this.decisionTimer=.2+Math.random()*.35; this.animTime = Math.random()*5;
    this.group = new THREE.Group(); this.group.position.set(x,0,z);
    const palette = TEAM_PALETTE[team], h=this.profile.height||1, bulk=this.profile.bulk||1;
    const color = goalkeeper ? (team === 'blue' ? 0xffd83d : 0x9b6cff) : palette.main, accent = goalkeeper ? 0xf4f7f3 : (this.profile.accent || palette.accent);
    const jersey = new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.12,emissive:palette.glow,emissiveIntensity:goalkeeper ? .08 : .16});
    const jerseyDark = new THREE.MeshStandardMaterial({color:goalkeeper?0x171c20:palette.dark,roughness:.55,metalness:.18,emissive:palette.glow,emissiveIntensity:.04});
    const shorts=material(0x0a1117,.62,.18), skin=material(this.profile.skin||0xc98b61,.68), boot=new THREE.MeshStandardMaterial({color:this.profile.boot||0xe9ff61,roughness:.38,metalness:.22,emissive:this.profile.boot||0xeaff65,emissiveIntensity:.08});
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.58,.92,7,14),jersey); body.position.y=1.62*h;body.scale.set(.92*bulk,1.02*h,.68*bulk);body.castShadow=true;addMesh(this.group,body,1.038);
    const torsoPanel=new THREE.Mesh(new THREE.BoxGeometry(.56*bulk,.72*h,.055),jerseyDark);torsoPanel.position.set(0,1.62*h,.51*bulk);torsoPanel.castShadow=true;this.group.add(torsoPanel);
    const chestBand=new THREE.Mesh(new THREE.BoxGeometry(1.08*bulk,.13,.065),new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.32,roughness:.38,metalness:.12}));chestBand.position.set(0,1.85*h,.54*bulk);this.group.add(chestBand);
    [-.42,.42].forEach(xp=>{const stripe=new THREE.Mesh(new THREE.BoxGeometry(.09,.76*h,.06),new THREE.MeshStandardMaterial({color:0xf4f7f3,roughness:.5,metalness:.05,transparent:true,opacity:.68}));stripe.position.set(xp*bulk,1.58*h,.56*bulk);this.group.add(stripe);});
    [-.64,.64].forEach(xp=>{const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.2*bulk,12,8),jerseyDark);shoulder.position.set(xp*bulk,2.06*h,0);shoulder.scale.set(1.25,.62,.86);shoulder.castShadow=true;addMesh(this.group,shoulder,1.05);});
    const shortsMesh=new THREE.Mesh(new THREE.BoxGeometry(.98*bulk,.5,.76*bulk),shorts);shortsMesh.position.y=.92*h;shortsMesh.castShadow=true;addMesh(this.group,shortsMesh,1.035);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.18*bulk,.2*bulk,.26*h,10),skin);neck.position.y=2.35*h;addMesh(this.group,neck,1.035);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.36*bulk,22,16),skin);head.position.y=2.66*h;head.castShadow=true;addMesh(this.group,head,1.035);
    const hairMat=material(this.profile.hair||0x17100d,.82);
    if(this.profile.hairStyle==='mohawk'){
      const hair=new THREE.Mesh(new THREE.BoxGeometry(.18,.28,.62),hairMat);hair.position.set(0,2.91*h,.02);hair.castShadow=true;addMesh(this.group,hair,1.08);
    }else if(this.profile.hairStyle==='curly'){
      for(let i=0;i<7;i++){const a=i/7*Math.PI*2, curl=new THREE.Mesh(new THREE.SphereGeometry(.115*bulk,10,8),hairMat);curl.position.set(Math.cos(a)*.24*bulk,2.82*h+Math.sin(i)*.025,Math.sin(a)*.18*bulk);curl.castShadow=true;this.group.add(curl);}
    }else{
      const hair=new THREE.Mesh(new THREE.SphereGeometry(.37*bulk,18,10,0,Math.PI*2,0,Math.PI*(this.profile.hairStyle==='buzz'?.38:.5)),hairMat);hair.position.y=2.74*h;hair.castShadow=true;addMesh(this.group,hair,1.035);
      if(this.profile.hairStyle==='swept'){const quiff=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.3,4,8),hairMat);quiff.position.set(.12*bulk,2.98*h,.18*bulk);quiff.rotation.z=-.8;this.group.add(quiff);}
    }
    this.legs=[];[-.27,.27].forEach((xp,index)=>{const limb=new THREE.Group();limb.position.set(xp*bulk,.84*h,0);const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.14*bulk,.5*h,4,8),skin);leg.position.y=-.34*h;leg.castShadow=true;addMesh(limb,leg,1.04);const sock=new THREE.Mesh(new THREE.CapsuleGeometry(.155*bulk,.26*h,3,8),new THREE.MeshStandardMaterial({color:accent,roughness:.55,metalness:.05,emissive:accent,emissiveIntensity:.06}));sock.position.y=-.78*h;addMesh(limb,sock,1.04);const shoe=new THREE.Mesh(new THREE.BoxGeometry(.38*bulk,.17,.6*bulk),boot);shoe.position.set(0,-1.01*h,.15);shoe.castShadow=true;addMesh(limb,shoe,1.035);this.legs.push(limb);this.group.add(limb);});
    this.arms=[];[-.69,.69].forEach((xp,index)=>{const arm=new THREE.Group();arm.position.set(xp*bulk,2.03*h,0);const sleeve=new THREE.Mesh(new THREE.CapsuleGeometry(.15*bulk,.27*h,3,8),jersey);sleeve.position.y=-.2*h;addMesh(arm,sleeve,1.04);const forearm=new THREE.Mesh(new THREE.CapsuleGeometry(.115*bulk,.4*h,3,8),skin);forearm.position.y=-.6*h;addMesh(arm,forearm,1.035);if(goalkeeper){const glove=new THREE.Mesh(new THREE.BoxGeometry(.34*bulk,.27,.24*bulk),new THREE.MeshStandardMaterial({color:0xf2f5f2,roughness:.48,metalness:.08,emissive:0xffffff,emissiveIntensity:.04}));glove.position.y=-.93*h;addMesh(arm,glove,1.035);}this.arms.push(arm);this.group.add(arm);});
    const numberTex=createNumberTexture(this.profile.number || (user?10:goalkeeper?1:7),'#ffffff',`#${(accent).toString(16).padStart(6,'0')}`);const number=new THREE.Mesh(new THREE.PlaneGeometry(.62*bulk,.62*h),new THREE.MeshBasicMaterial({map:numberTex,transparent:true,side:THREE.DoubleSide}));number.position.set(0,1.73*h,-.52*bulk);number.rotation.y=Math.PI;this.group.add(number);
    const glow=new THREE.Mesh(new THREE.CircleGeometry(.82*bulk,34),new THREE.MeshBasicMaterial({color:palette.glow,transparent:true,opacity:goalkeeper ? .1 : .18,depthWrite:false,blending:THREE.AdditiveBlending}));glow.rotation.x=-Math.PI/2;glow.position.y=.025;this.group.add(glow);
    if(user){
      const ring=new THREE.Mesh(new THREE.RingGeometry(.94*bulk,1.14*bulk,48),new THREE.MeshBasicMaterial({color:0xeaff65,side:THREE.DoubleSide,transparent:true,opacity:.95,blending:THREE.AdditiveBlending}));ring.rotation.x=-Math.PI/2;ring.position.y=.035;this.group.add(ring);this.userRing=ring;
      const nameplate=createNameSprite(this.profile);nameplate.position.y=3.35*h;this.group.add(nameplate);
      this.speedTrail=new THREE.Group();[-.42,0,.42].forEach((xp,index)=>{const streak=new THREE.Mesh(new THREE.PlaneGeometry(.035,1.8+index*.45),new THREE.MeshBasicMaterial({color:0xeaff65,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));streak.rotation.x=Math.PI/2;streak.position.set(xp,.12,-1.25-index*.25);this.speedTrail.add(streak);});this.group.add(this.speedTrail);
    }
    scene.add(this.group);
  }
  get position(){ return this.group.position; }
  update(dt){
    this.cooldown=Math.max(0,this.cooldown-dt); this.releaseLock=Math.max(0,this.releaseLock-dt); this.tackle=Math.max(0,this.tackle-dt);
    this.user ? this.userMove(dt) : this.aiMove(dt);
    this.position.addScaledVector(this.velocity,dt); this.position.x=clamp(this.position.x,-FIELD.halfW+.7,FIELD.halfW-.7); this.position.z=clamp(this.position.z,-FIELD.halfL+.7,FIELD.halfL-.7);
    const speed=this.velocity.length();this.animTime+=dt*(2.5+speed*.65);const stride=Math.sin(this.animTime)*clamp(speed/13,0,.82);this.legs[0].rotation.x=stride;this.legs[1].rotation.x=-stride;this.arms[0].rotation.x=-stride*.72;this.arms[1].rotation.x=stride*.72;
    this.group.position.y=Math.abs(Math.sin(this.animTime*2))*.035*clamp(speed/8,0,1);if(this.userRing)this.userRing.rotation.z+=dt*.85;
    this.velocity.multiplyScalar(Math.pow(.004,dt)); if(this.velocity.lengthSq()>.3) this.group.rotation.y=Math.atan2(this.velocity.x,this.velocity.z);
    if(flatDistance(this,ball)<1.25) this.touchBall();
  }
  userMove(dt){
    const forwardInput=(keys.KeyW?1:0)-(keys.KeyS?1:0)+touchInput.y, sideInput=(keys.KeyD?1:0)-(keys.KeyA?1:0)+touchInput.x;
    const move=cameraForward().multiplyScalar(forwardInput).add(cameraRight().multiplyScalar(sideInput));
    const sprint=(keys.ShiftLeft||keys.ShiftRight||sprintButtonHeld)&&this.stamina>1&&move.lengthSq()>0, speed=sprint?this.sprintSpeed:this.baseSpeed;
    if(move.lengthSq()){ move.normalize(); this.velocity.addScaledVector(move,speed*8*dt); }
    if(this.speedTrail)this.speedTrail.children.forEach((streak,index)=>{streak.material.opacity=sprint ? .22-index*.045 : 0;});
    this.stamina=clamp(this.stamina+(sprint?-this.staminaDrain:this.staminaRegen)*dt,0,100); ui.stamina.style.width=`${this.stamina}%`;
  }
  aiMove(dt){
    if(this.goalkeeper){this.goalkeeperMove(dt);return;}
    this.decisionTimer-=dt;
    const attackZ=this.team==='blue'?-1:1,fieldMates=players.filter(p=>p.team===this.team&&!p.goalkeeper),opponents=players.filter(p=>p.team!==this.team);
    if(ball.owner===this){this.aiWithBall(dt,attackZ,fieldMates,opponents);return;}

    const closest=[...fieldMates].sort((a,b)=>flatDistance(a,ball)-flatDistance(b,ball))[0];
    const teamHasBall=ball.owner?.team===this.team,opponentHasBall=ball.owner&&ball.owner.team!==this.team;
    const roleX=this.role==='left'?-FIELD.halfW*.42:this.role==='right'?FIELD.halfW*.42:0;
    let target;

    if(teamHasBall){
      const advance=this.role==='defender'?10:this.role==='striker'?18:13;
      target=new THREE.Vector3(clamp(roleX+ball.position.x*.28,-FIELD.halfW+5,FIELD.halfW-5),0,clamp(ball.position.z+attackZ*advance,-FIELD.halfL+8,FIELD.halfL-8));
    }else if(closest===this||(!ball.owner&&flatDistance(this,ball)<18)){
      target=predictedBallPosition(.18+Math.min(ball.velocity.length()/100,.22));
    }else{
      const coverDepth=this.role==='defender'?19:13;
      target=new THREE.Vector3(clamp(roleX+ball.position.x*.18,-FIELD.halfW+5,FIELD.halfW-5),0,clamp(ball.position.z-attackZ*coverDepth,-FIELD.halfL+7,FIELD.halfL-7));
      if(opponentHasBall){
        const assigned=opponents.filter(p=>!p.goalkeeper).sort((a,b)=>Math.abs(a.position.x-roleX)-Math.abs(b.position.x-roleX))[0];
        if(assigned)target.lerp(new THREE.Vector3(assigned.position.x,0,assigned.position.z-attackZ*4),.36);
      }
    }

    this.moveTactically(target,closest===this?this.baseSpeed*.98:this.baseSpeed*.8,dt,fieldMates);
    if(opponentHasBall&&flatDistance(this,ball.owner)<1.75&&this.cooldown<=0){const tackleDir=flatDirection(this.position,ball.owner.position);this.velocity.addScaledVector(tackleDir,15*this.tacklePower);this.tackle=.28;this.cooldown=1.15+Math.random()*.35;}
  }
  moveTactically(target,speed,dt,mates){
    const desired=flatDirection(this.position,target),separation=new THREE.Vector3();
    mates.forEach(mate=>{if(mate===this)return;const distance=flatDistance(this,mate);if(distance>0&&distance<5.2)separation.addScaledVector(flatDirection(mate.position,this.position),(5.2-distance)/5.2);});
    desired.addScaledVector(separation,.75).normalize();
    if(flatDistance(this,{position:target})>.55)this.velocity.addScaledVector(desired,speed*7*dt);
  }
  aiWithBall(dt,attackZ,mates,opponents){
    const goal=new THREE.Vector3(0,0,attackZ*FIELD.halfL),goalDistance=flatDistance(this,{position:goal});
    const pressure=nearestOpponent(this),pressureDistance=pressure?flatDistance(this,pressure):99;
    const passTarget=choosePassTarget(this),shotLaneClear=hasClearLane(this.position,goal,opponents,3.1);
    const userReceiver=userReceiverFor(this);
    const userDistance=userReceiver?flatDistance(this,userReceiver):99;
    const userSpace=userReceiver?nearestOpponentDistanceTo(userReceiver,opponents):0;
    const userLaneClear=userReceiver?hasClearLane(this.position,userReceiver.position,opponents,2.25):false;
    const shouldPassToUser=userReceiver&&userDistance>4.2&&userDistance<58&&userLaneClear&&userSpace>2.7&&(pressureDistance<9||goalDistance>28||Math.random()<.48);

    if(this.decisionTimer<=0){
      if(goalDistance<24&&shotLaneClear){
        const aim=new THREE.Vector3((Math.random()-.5)*FIELD.goalHalf*.9,0,attackZ*FIELD.halfL);kickBall(this,flatDirection(ball.position,aim),.78+Math.random()*.22,.11,true);this.cooldown=.7;this.decisionTimer=.55;return;
      }
      if(shouldPassToUser){
        const lead=userReceiver.position.clone().addScaledVector(userReceiver.velocity,.32);
        kickBall(this,flatDirection(ball.position,lead),clamp(userDistance/34,.38,.86),.03,false);this.cooldown=.48;this.decisionTimer=.38+Math.random()*.22;return;
      }
      if(goalDistance<42&&shotLaneClear){
        const aim=new THREE.Vector3((Math.random()-.5)*FIELD.goalHalf*.9,0,attackZ*FIELD.halfL);kickBall(this,flatDirection(ball.position,aim),.78+Math.random()*.22,.11,true);this.cooldown=.7;this.decisionTimer=.55;return;
      }
      if(passTarget&&pressureDistance<5.2&&hasClearLane(this.position,passTarget.position,opponents,2.2)){
        const lead=passTarget.position.clone().addScaledVector(passTarget.velocity,.22);kickBall(this,flatDirection(ball.position,lead),clamp(flatDistance(this,passTarget)/36,.34,.75),.025,false);this.cooldown=.55;this.decisionTimer=.45+Math.random()*.3;return;
      }
      if(goalDistance<57&&shotLaneClear&&Math.random()<.34){kickBall(this,flatDirection(ball.position,goal),.7+Math.random()*.25,.1,true);this.cooldown=.75;this.decisionTimer=.6;return;}
      this.decisionTimer=.35+Math.random()*.45;
    }

    const dribbleTarget=goal.clone();
    if(pressure&&pressureDistance<7){const evade=flatDirection(pressure.position,this.position);dribbleTarget.x=clamp(this.position.x+evade.x*9,-FIELD.halfW+4,FIELD.halfW-4);dribbleTarget.z=this.position.z+attackZ*13;}
    if(performance.now()-lastDribbleNarration>5200&&flatDistance(this,ball)<2.2){
      lastDribbleNarration=performance.now();
      narrateEvent('dribble', {player:this, pressure:pressure&&pressureDistance<7}, false, 2600);
    }
    this.ballDirection.copy(flatDirection(this.position,dribbleTarget));
    this.moveTactically(dribbleTarget,pressureDistance<4?this.baseSpeed*.96:this.baseSpeed*.88,dt,mates);
  }
  goalkeeperMove(dt){
    const attackZ=this.team==='blue'?-1:1,ownGoalZ=this.team==='blue'?FIELD.halfL-2.1:-FIELD.halfL+2.1;
    this.decisionTimer-=dt;
    if(ball.owner===this&&this.cooldown<=0){const receiver=choosePassTarget(this),target=receiver?receiver.position.clone().addScaledVector(receiver.velocity,.35):new THREE.Vector3((Math.random()-.5)*FIELD.halfW*.7,0,attackZ*FIELD.halfL*.25);kickBall(this,flatDirection(ball.position,target),.66,.08,true);this.cooldown=1.1;this.decisionTimer=.7;return;}
    const danger=this.team==='blue'?ball.position.z>FIELD.halfL-23:ball.position.z<-FIELD.halfL+23;
    const movingTowardGoal=this.team==='blue'?ball.velocity.z>2:ball.velocity.z<-2;
    let anticipatedX=ball.position.x;
    if(movingTowardGoal){const travel=(ownGoalZ-ball.position.z)/(ball.velocity.z||.001);if(travel>0&&travel<3)anticipatedX=ball.position.x+ball.velocity.x*travel;}
    const targetX=clamp(anticipatedX,-FIELD.goalHalf+1,FIELD.goalHalf-1),targetZ=danger?ownGoalZ+attackZ*clamp(Math.abs(ball.position.z-ownGoalZ)*.28,0,7):ownGoalZ;
    const target=new THREE.Vector3(targetX,0,targetZ),dir=flatDirection(this.position,target);if(flatDistance(this,{position:target})>.35)this.velocity.addScaledVector(dir,(danger?this.baseSpeed*1.25:this.baseSpeed)*7*dt);
    if(danger&&movingTowardGoal&&flatDistance(this,ball)<5.5&&this.cooldown<=0){this.velocity.addScaledVector(flatDirection(this.position,predictedBallPosition(.12)),12);this.tackle=.25;this.cooldown=.7;}
  }
  touchBall(){
    if(this.goalkeeper&&this.releaseLock<=0&&ball.position.y<2.8){if(ball.owner!==this)this.cooldown=Math.max(this.cooldown,.3);ball.owner=this;ball.velocity.set(0,0,0);return;}
    if(ball.owner&&ball.owner!==this&&this.tackle<=0)return;if(ball.velocity.length()<17||this.tackle>0)ball.owner=this;
  }
}

const ball = {
  position:new THREE.Vector3(0,.48,0), velocity:new THREE.Vector3(), owner:null,
  mesh:new THREE.Mesh(new THREE.SphereGeometry(.48,36,26),new THREE.MeshStandardMaterial({map:createBallTexture(),roughness:.38,metalness:.08,emissive:0x111a14,emissiveIntensity:.18}))
};
ball.mesh.castShadow=true; scene.add(ball.mesh);
const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.52,24),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.28})); ballShadow.rotation.x=-Math.PI/2; ballShadow.position.y=.025; scene.add(ballShadow);
const ballAura=new THREE.Mesh(new THREE.SphereGeometry(.62,24,16),new THREE.MeshBasicMaterial({color:0xeaff65,transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(ballAura);
const trailCount=18,trailArray=new Float32Array(trailCount*3),trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailArray,3));
const ballTrail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xeaffd0,transparent:true,opacity:.35,depthWrite:false}));scene.add(ballTrail);
const effectParticles=[];

const aimMarker=new THREE.Group();
const aimRing=new THREE.Mesh(new THREE.RingGeometry(.42,.55,24),new THREE.MeshBasicMaterial({color:0xeaff65,side:THREE.DoubleSide,transparent:true,opacity:.8})); aimRing.rotation.x=-Math.PI/2; aimMarker.add(aimRing);
const aimLine=new THREE.Mesh(new THREE.BoxGeometry(.06,.02,3),new THREE.MeshBasicMaterial({color:0xeaff65,transparent:true,opacity:.55})); aimLine.position.z=1.5; aimMarker.add(aimLine); scene.add(aimMarker);

let players=[];
function reset(){
  players.forEach(p=>scene.remove(p.group));
  players=[
    new Player(0,43,'blue',true,false,'striker',selectedProfile()),
    new Player(-18,27,'blue',false,false,'left',NPC_PROFILES[0]),
    new Player(18,27,'blue',false,false,'defender',NPC_PROFILES[1]),
    new Player(0,FIELD.halfL-3,'blue',false,true,'goalkeeper',GOALKEEPER_PROFILE),
    new Player(0,-43,'red',false,false,'striker',PLAYER_PROFILES[2]),
    new Player(-18,-27,'red',false,false,'left',PLAYER_PROFILES[1]),
    new Player(18,-27,'red',false,false,'defender',PLAYER_PROFILES[3]),
    new Player(0,-FIELD.halfL+3,'red',false,true,'goalkeeper',GOALKEEPER_PROFILE)
  ];
  ball.position.set(0,.48,0); ball.velocity.set(0,0,0); ball.owner=null; lastOwnerNarrated=null; charge=0; passCharge=0; passCharging=false; kickoff=1.4;
  for(let i=0;i<trailCount;i++){trailArray[i*3]=0;trailArray[i*3+1]=.48;trailArray[i*3+2]=0;}trailGeometry.attributes.position.needsUpdate=true;
}

function kickBall(player,dir,power,lift=.08,isShot=false){
  if(ball.owner!==player)return; ball.owner=null;
  if(player.goalkeeper){ball.position.addScaledVector(dir,1.7);ball.position.y=.6;player.releaseLock=.45;}
  const force=isShot?36+power*60:16+power*18; ball.velocity.set(dir.x*force,3+lift*force,dir.z*force); player.velocity.addScaledVector(dir,-2);cameraShake=Math.max(cameraShake,.08+power*.16);spawnKickBurst(ball.position,player.team);
  lastOwnerNarrated=null;
  if(isShot){playTone(220+power*170,.14,'square',.075);triggerCrowdReaction('shot',clamp(power,.45,1));narrateEvent('shot',{player,power}, player.user, player.user?900:1600);}
  else if(player.goalkeeper){playTone(160,.12,'sawtooth',.05);triggerCrowdReaction('pass',.45);narrateEvent('keeper',{player}, false, 2300);}
  else {playTone(360+power*80,.08,'triangle',.045);triggerCrowdReaction('pass',clamp(power,.25,.85));narrateEvent('pass',{player,power}, false, player.user?1200:1800);}
}
function shoot(){ const user=userPlayer(); if(ball.owner!==user||kickoff>0)return; kickBall(user,flatDirection(ball.position,aimPoint),clamp(charge*user.shotPower+.03,0,1.25),.13,true); }
function pass(power = .22){
  const user=userPlayer(); if(ball.owner!==user||kickoff>0)return; const mates=players.filter(p=>p.team==='blue'&&p!==user), aimDir=flatDirection(user.position,aimPoint);
  const target=[...mates].sort((a,b)=>flatDirection(user.position,b.position).dot(aimDir)-flatDirection(user.position,a.position).dot(aimDir))[0];
  if(!target)return;
  const passStrength=clamp(power, .18, 1.15)*user.passPower;
  const lead=target.position.clone().addScaledVector(target.velocity,.14+passStrength*.24);
  kickBall(user,flatDirection(ball.position,lead),passStrength,.035);
}
function tackle(){
  const user=userPlayer(); if(user.stamina<20||user.cooldown>0)return;
  const direction=user.velocity.lengthSq()>1?user.velocity.clone().setY(0).normalize():cameraForward();
  user.velocity.addScaledVector(direction,25*user.tacklePower); user.tackle=.38; user.cooldown=.9; user.stamina-=20;
}

function spawnKickBurst(position,team){
  const color=team==='blue'?0x37e5e2:0xff5c4d;
  for(let i=0;i<9;i++){const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.045+Math.random()*.06,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}));mesh.position.copy(position);mesh.userData.velocity=new THREE.Vector3((Math.random()-.5)*4,Math.random()*2.2,(Math.random()-.5)*4);mesh.userData.life=.28+Math.random()*.25;visualEffects.add(mesh);effectParticles.push(mesh);}
}

function spawnGoalCelebration(team){
  const main=team==='blue'?0x37e5e2:0xff5c4d,secondary=0xeaff65;
  for(let i=0;i<58;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.08+Math.random()*.12,.08+Math.random()*.18,.03),new THREE.MeshBasicMaterial({color:i%3?main:secondary,transparent:true,opacity:1,side:THREE.DoubleSide}));mesh.position.set((Math.random()-.5)*11,1+Math.random()*2,team==='blue'?-FIELD.halfL+1:FIELD.halfL-1);mesh.userData.velocity=new THREE.Vector3((Math.random()-.5)*12,5+Math.random()*9,(team==='blue'?1:-1)*(2+Math.random()*6));mesh.userData.life=1.6+Math.random()*1.1;mesh.userData.spin=new THREE.Vector3(Math.random()*7,Math.random()*7,Math.random()*7);visualEffects.add(mesh);effectParticles.push(mesh);}
  goalGlow=1;cameraShake=.42;
}

function updateVisualEffects(dt){
  for(let i=effectParticles.length-1;i>=0;i--){const p=effectParticles[i];p.userData.life-=dt;p.userData.velocity.y-=9*dt;p.position.addScaledVector(p.userData.velocity,dt);if(p.userData.spin){p.rotation.x+=p.userData.spin.x*dt;p.rotation.y+=p.userData.spin.y*dt;p.rotation.z+=p.userData.spin.z*dt;}p.material.opacity=clamp(p.userData.life*1.5,0,1);if(p.userData.life<=0){visualEffects.remove(p);p.geometry.dispose();p.material.dispose();effectParticles.splice(i,1);}}
  goalGlow=Math.max(0,goalGlow-dt*1.4);renderer.toneMappingExposure=1.36+goalGlow*.48;
  updateCrowdAudio(dt);
}

function updateAim(){
  raycaster.setFromCamera(pointer,camera); const ray=raycaster.ray, t=-ray.origin.y/ray.direction.y;
  if(t>0) aimPoint.copy(ray.origin).addScaledVector(ray.direction,t);
  aimPoint.x=clamp(aimPoint.x,-FIELD.halfW,FIELD.halfW); aimPoint.z=clamp(aimPoint.z,-FIELD.halfL,FIELD.halfL); aimMarker.position.copy(aimPoint); aimMarker.position.y=.05;
  const user=userPlayer(); if(user){ const d=flatDirection(user.position,aimPoint); aimMarker.rotation.y=Math.atan2(d.x,d.z); }
}

function updateBall(dt){
  if(ball.owner){
    const p=ball.owner, d=p.user?flatDirection(p.position,aimPoint):(p.ballDirection?.clone()||new THREE.Vector3(0,0,p.team==='blue'?-1:1));
    const target=p.position.clone().addScaledVector(d,1.05); target.y=.48; ball.position.lerp(target,Math.min(1,dt*16)); ball.velocity.copy(p.velocity);
  }else{
    ball.velocity.y-=15*dt; ball.position.addScaledVector(ball.velocity,dt); ball.velocity.x*=Math.pow(.55,dt); ball.velocity.z*=Math.pow(.55,dt);
    if(ball.position.y<.48){ ball.position.y=.48; if(Math.abs(ball.velocity.y)>2)ball.velocity.y=Math.abs(ball.velocity.y)*.46; else ball.velocity.y=0; ball.velocity.x*=.985; ball.velocity.z*=.985; }
  }
  const inGoal=Math.abs(ball.position.x)<FIELD.goalHalf;
  if(Math.abs(ball.position.x)>.0+FIELD.halfW-.48){ ball.position.x=clamp(ball.position.x,-FIELD.halfW+.48,FIELD.halfW-.48); ball.velocity.x*=-.78; ball.owner=null; }
  if(ball.position.z<-FIELD.halfL+.48){ if(inGoal)goal('blue'); else{ball.position.z=-FIELD.halfL+.48;ball.velocity.z=Math.abs(ball.velocity.z)*.78;ball.owner=null;} }
  if(ball.position.z>FIELD.halfL-.48){ if(inGoal)goal('red'); else{ball.position.z=FIELD.halfL-.48;ball.velocity.z=-Math.abs(ball.velocity.z)*.78;ball.owner=null;} }
  ball.mesh.position.copy(ball.position); ball.mesh.rotation.x+=ball.velocity.z*dt*.6; ball.mesh.rotation.z-=ball.velocity.x*dt*.6;
  ballAura.position.copy(ball.position); ballAura.scale.setScalar(1+clamp(ball.velocity.length()/60,0,.6)); ballAura.material.opacity=.055+clamp(ball.velocity.length()/120,0,.12);
  ballShadow.position.set(ball.position.x,.025,ball.position.z); ballShadow.scale.setScalar(clamp(1.25-ball.position.y*.08,.45,1));
  for(let i=trailCount-1;i>0;i--){trailArray[i*3]=trailArray[(i-1)*3];trailArray[i*3+1]=trailArray[(i-1)*3+1];trailArray[i*3+2]=trailArray[(i-1)*3+2];}
  trailArray[0]=ball.position.x;trailArray[1]=ball.position.y;trailArray[2]=ball.position.z;trailGeometry.attributes.position.needsUpdate=true;ballTrail.material.opacity=clamp((ball.velocity.length()-12)/42,0,.42);
}

function resolvePlayers(){
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){ const a=players[i],b=players[j],dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,d=Math.hypot(dx,dz); if(d<1.25&&d>0){const push=(1.25-d)/2;a.position.x-=dx/d*push;a.position.z-=dz/d*push;b.position.x+=dx/d*push;b.position.z+=dz/d*push;} }
}
function goal(team){ if(kickoff>0)return; team==='blue'?blueScore++:redScore++; ui.blue.textContent=blueScore;ui.red.textContent=redScore;spawnGoalCelebration(team);playTone(540,.32,'sawtooth',.12);triggerCrowdReaction('goal',1);narrateEvent('goal',{team},true,0);flash(team==='blue'?'GOLAÇO!':'GOL DELES!',team==='blue'?'#37e5e2':'#ff5c4d');reset(); }
function flash(text,color='#fff'){ui.message.textContent=text;ui.message.style.color=color;ui.message.classList.add('show');setTimeout(()=>ui.message.classList.remove('show'),1000);}
function endGame(){running=false;document.exitPointerLock?.();const result=blueScore===redScore?'EMPATE!':blueScore>redScore?'VITÓRIA!':'DERROTA';flash(result,blueScore>=redScore?'#eaff65':'#ff5c4d');setTimeout(()=>{ui.start.querySelector('h1').innerHTML=`${result}<br><em>${blueScore} × ${redScore}</em>`;ui.start.querySelector('button').innerHTML='JOGAR DE NOVO <span>→</span>';ui.start.classList.remove('hidden');},1200);}

function updateCamera(dt){
  const user=userPlayer(); if(!user)return;
  const rig=activeCameraRig();
  const horizontalInput=(keys.KeyL?1:0)-(keys.KeyJ?1:0);
  const verticalInput=(keys.KeyK?1:0)-(keys.KeyI?1:0);
  rig.yaw-=horizontalInput*(cameraMode==='broadcast'?1.25:1.9)*dt;
  rig.pitch=clamp(rig.pitch+verticalInput*(cameraMode==='broadcast' ? .75 : 1.15)*dt,cameraMode==='broadcast' ? .55 : .2,cameraMode==='broadcast' ? .88 : .82);
  const focus=cameraMode==='broadcast'
    ? user.position.clone().lerp(ball.position,.38).addScaledVector(user.velocity,.06)
    : user.position;
  const horizontal=Math.cos(rig.pitch)*rig.distance;
  const desired=new THREE.Vector3(
    focus.x+Math.sin(rig.yaw)*horizontal,
    (cameraMode==='broadcast'?4.8:2.2)+Math.sin(rig.pitch)*rig.distance,
    focus.z+Math.cos(rig.yaw)*horizontal
  );
  camera.position.lerp(desired,1-Math.pow(cameraMode==='broadcast' ? .015 : .001,dt));
  if(cameraShake>0){camera.position.x+=(Math.random()-.5)*cameraShake;camera.position.y+=(Math.random()-.5)*cameraShake*.5;camera.position.z+=(Math.random()-.5)*cameraShake;cameraShake=Math.max(0,cameraShake-dt*1.8);}
  camera.lookAt(focus.x,cameraMode==='broadcast'?1.4:1.25,focus.z);
}
function resize(){
  const wrap=canvas.parentElement, w=wrap.clientWidth, h=wrap.clientHeight;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
}
function update(dt){
  updateCamera(dt); updateAim(); updateVisualEffects(dt); if(!running)return;
  if(kickoff>0)kickoff-=dt;else time=Math.max(0,time-dt);
  if((mouseDown||touchInput.shootHeld)&&ball.owner===userPlayer())charge=clamp(charge+dt*.7,0,1);
  if(passCharging&&ball.owner===userPlayer())passCharge=clamp(passCharge+dt*1.05,0,1);
  players.forEach(p=>p.update(dt)); resolvePlayers(); updateBall(dt);
  announcePossession();
  if(ball.owner?.user&&ball.owner.velocity.length()>5&&performance.now()-lastDribbleNarration>5200){
    lastDribbleNarration=performance.now();
    narrateEvent('dribble', {player:ball.owner, pressure:false}, false, 2600);
  }
  const mins=Math.floor(time/60),secs=Math.floor(time%60);ui.clock.textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;if(time<=0)endGame();
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock3d.getDelta(),.033);resize();update(dt);const aimCharge=passCharging?passCharge:charge;aimRing.material.color.set(passCharging?0x37e5e2:charge>.82?0xff5c4d:0xeaff65);aimLine.material.color.set(passCharging?0x37e5e2:0xeaff65);const aimPulse=1+Math.sin(clock3d.elapsedTime*5)*.08+aimCharge*.32;aimMarker.scale.setScalar(aimPulse);renderer.render(scene,camera);}

function setStickFromPointer(e){
  const rect=ui.moveStick.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,r=rect.width*.38;
  const dx=clamp((e.clientX-cx)/r,-1,1),dy=clamp((e.clientY-cy)/r,-1,1),len=Math.hypot(dx,dy),scale=len>1?1/len:1;
  touchInput.x=dx*scale; touchInput.y=-dy*scale;
  ui.moveStick.querySelector('span').style.transform=`translate(${touchInput.x*r*.58}px,${-touchInput.y*r*.58}px)`;
}
function clearStick(){
  touchInput.x=0; touchInput.y=0; touchInput.moveId=null;
  ui.moveStick?.querySelector('span')?.style.setProperty('transform','translate(0,0)');
}
function bindTapButton(button,action){
  if(!button)return;
  button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();action();button.classList.add('active');button.setPointerCapture?.(e.pointerId);});
  const release=()=>button.classList.remove('active');
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function bindSprintButton(button){
  if(!button)return;
  button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();sprintButtonHeld=true;button.classList.add('active');button.setPointerCapture?.(e.pointerId);});
  const release=()=>{sprintButtonHeld=false;button.classList.remove('active');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function bindShootButton(button){
  if(!button)return;
  button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();touchInput.shootHeld=true;button.classList.add('active');button.setPointerCapture?.(e.pointerId);});
  const release=()=>{if(touchInput.shootHeld){touchInput.shootHeld=false;shoot();charge=0;}button.classList.remove('active');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}

function applyPlayerSelection(index){
  selectedPlayerIndex = clamp(Number(index) || 0, 0, PLAYER_PROFILES.length - 1);
  const profile = selectedProfile();
  ui.playerCards.forEach(card=>{
    const selected = Number(card.dataset.player) === selectedPlayerIndex;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-selected', String(selected));
  });
  if(ui.selectedAthlete) ui.selectedAthlete.textContent = `Selecionado: ${profile.name} · ${profile.tag}`;
}

ui.playerCards.forEach(card=>{
  card.addEventListener('click', e=>{
    e.preventDefault();
    applyPlayerSelection(card.dataset.player);
    flash(`${selectedProfile().name.toUpperCase()} ESCOLHIDO`, '#eaff65');
  });
});
applyPlayerSelection(0);

canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;
  if(touchInput.cameraId===e.pointerId){
    const dx=e.clientX-touchInput.cameraX,dy=e.clientY-touchInput.cameraY;
    const rig=activeCameraRig();
    rig.yaw-=dx*(cameraMode==='broadcast' ? .0036 : .006);
    rig.pitch=clamp(rig.pitch+dy*(cameraMode==='broadcast' ? .0028 : .0048),cameraMode==='broadcast' ? .55 : .2,cameraMode==='broadcast' ? .88 : .82);
    touchInput.cameraX=e.clientX;touchInput.cameraY=e.clientY;pointer.set(0,0);e.preventDefault();
  }
});
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===canvas){const rig=activeCameraRig();rig.yaw-=e.movementX*.0028;rig.pitch=clamp(rig.pitch+e.movementY*.0022,.2,.82);pointer.set(0,0);}
});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas)pointer.set(0,0);});
canvas.addEventListener('pointerdown',e=>{
  if(touchPointer(e)){touchInput.cameraId=e.pointerId;touchInput.cameraX=e.clientX;touchInput.cameraY=e.clientY;pointer.set(0,0);canvas.setPointerCapture?.(e.pointerId);e.preventDefault();return;}
  if(e.button===0){mouseDown=true;if(running&&usePointerLock()&&document.pointerLockElement!==canvas)requestPointerLockSafe();}
});
window.addEventListener('pointerup',e=>{
  if(e.pointerId===touchInput.cameraId){touchInput.cameraId=null;return;}
  if(e.button===0&&mouseDown){mouseDown=false;shoot();charge=0;}
});
window.addEventListener('pointercancel',e=>{if(e.pointerId===touchInput.cameraId)touchInput.cameraId=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const rig=activeCameraRig();rig.distance=clamp(rig.distance+e.deltaY*(cameraMode==='broadcast' ? .02 : .012),cameraMode==='broadcast'?32:9,cameraMode==='broadcast'?62:23);},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','KeyE','KeyI','KeyJ','KeyK','KeyL','KeyC'].includes(e.code))e.preventDefault();if(e.code==='Space'&&!e.repeat){passCharging=true;passCharge=.18;}if(e.code==='KeyE'&&!e.repeat)tackle();if(e.code==='KeyC'&&!e.repeat)toggleCameraMode();});
window.addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space'&&passCharging){pass(passCharge);passCharging=false;passCharge=0;}});
ui.sprint.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();sprintButtonHeld=true;ui.sprint.classList.add('active');ui.sprint.setPointerCapture?.(e.pointerId);});
const releaseSprint=()=>{sprintButtonHeld=false;ui.sprint.classList.remove('active');};
ui.sprint.addEventListener('pointerup',releaseSprint);ui.sprint.addEventListener('pointercancel',releaseSprint);ui.sprint.addEventListener('lostpointercapture',releaseSprint);
ui.camera?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleCameraMode();});
if(ui.moveStick){
  ui.moveStick.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();touchInput.moveId=e.pointerId;setStickFromPointer(e);ui.moveStick.setPointerCapture?.(e.pointerId);});
  ui.moveStick.addEventListener('pointermove',e=>{if(e.pointerId===touchInput.moveId){e.preventDefault();setStickFromPointer(e);}});
  ui.moveStick.addEventListener('pointerup',e=>{if(e.pointerId===touchInput.moveId)clearStick();});
  ui.moveStick.addEventListener('pointercancel',e=>{if(e.pointerId===touchInput.moveId)clearStick();});
  ui.moveStick.addEventListener('lostpointercapture',clearStick);
}
bindShootButton(ui.mobileShoot);
bindTapButton(ui.mobilePass,pass);
bindTapButton(ui.mobileTackle,tackle);
bindSprintButton(ui.mobileSprint);
ui.startButton.addEventListener('click',()=>{initAudio();blueScore=redScore=0;time=120;ui.blue.textContent=ui.red.textContent='0';reset();running=true;ui.start.classList.add('hidden');if(usePointerLock())requestPointerLockSafe();});

updateCameraButton();addAtmosphere();addLights();addPitch();reset();camera.position.set(0,10,35);animate();
