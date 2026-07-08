/* global THREE */
const canvas = document.getElementById('game');
const ui = {
  blue: document.getElementById('blueScore'), red: document.getElementById('redScore'),
  clock: document.getElementById('clock'), stamina: document.getElementById('staminaBar'),
  start: document.getElementById('startScreen'), message: document.getElementById('message'), sprint: document.getElementById('sprintButton')
};

if (!window.THREE) {
  ui.start.querySelector('p:not(.kicker)').textContent = 'Não foi possível carregar o modo 3D. Verifique a conexão com a internet e atualize a página.';
  ui.start.querySelector('button').disabled = true;
  throw new Error('Three.js não carregou.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f);
scene.fog = new THREE.FogExp2(0x07110f, 0.0065);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 420);
const clock3d = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0.25);
const aimPoint = new THREE.Vector3(0, 0, -15);
const keys = {};
const cameraOrbit = { yaw: 0, pitch: .46, distance: 15 };

const FIELD = { halfW: 46, halfL: 72, goalHalf: 7, goalDepth: 4 };
let running = false, time = 120, blueScore = 0, redScore = 0, kickoff = 0, charge = 0, mouseDown = false;
let sprintButtonHeld = false;
let cameraShake = 0, goalGlow = 0;
const visualEffects = new THREE.Group();
scene.add(visualEffects);

const clamp = THREE.MathUtils.clamp;
const flatDistance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const flatDirection = (from, to) => new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
const cameraForward = () => new THREE.Vector3(-Math.sin(cameraOrbit.yaw), 0, -Math.cos(cameraOrbit.yaw));
const cameraRight = () => new THREE.Vector3(Math.cos(cameraOrbit.yaw), 0, -Math.sin(cameraOrbit.yaw));

function material(color, roughness = 0.72, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function createTurfTexture() {
  const size = 512, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, stripe = Math.floor(y / 43) % 2 ? 10 : 0, grain = Math.random() * 16;
    data[i] = 10 + grain; data[i + 1] = 58 + stripe + grain; data[i + 2] = 43 + stripe + grain * .55; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(6, 10); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
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
  scene.add(new THREE.HemisphereLight(0x9ad9ff, 0x07100d, 1.45));
  scene.add(new THREE.AmbientLight(0x6ca8a0, .34));
  const sun = new THREE.DirectionalLight(0xd9f7ff, 2.8);
  sun.position.set(-18, 38, 24); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90; sun.shadow.camera.far=220; sun.shadow.bias = -.00035; scene.add(sun);
  [[-(FIELD.halfW+5),-FIELD.halfL*.72],[FIELD.halfW+5,-FIELD.halfL*.72],[-(FIELD.halfW+5),FIELD.halfL*.72],[FIELD.halfW+5,FIELD.halfL*.72]].forEach(([x,z]) => {
    const light = new THREE.SpotLight(0xdffffb, 110, 140, Math.PI/4.5, .58, 1.2); light.position.set(x, 20, z); light.target.position.set(0,0,z*.25); scene.add(light, light.target);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,19,10), material(0x222c31,.35,.75)); pole.position.set(x,9.5,z); pole.castShadow=true; scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(4.2,1.2,.45), new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xdffffb,emissiveIntensity:5,roughness:.25})); lamp.position.set(x,19,z); lamp.lookAt(0,3,0); scene.add(lamp);
  });
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
    group.userData.netMaterial=netMat; scene.add(group);
  });
}

function addWalls() {
  const glass = new THREE.MeshPhysicalMaterial({ color:0x9fffee, transparent:true, opacity:.09, roughness:.15, metalness:.1, side:THREE.DoubleSide });
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

function choosePassTarget(player,includeGoalkeeper=false){
  const attackZ=player.team==='blue'?-1:1;
  const candidates=players.filter(p=>p.team===player.team&&p!==player&&(includeGoalkeeper||!p.goalkeeper));
  return candidates.sort((a,b)=>{
    const score=c=>{
      const space=Math.min(...players.filter(p=>p.team!==player.team).map(p=>flatDistance(c,p)));
      const progress=(c.position.z-player.position.z)*attackZ;
      return space*1.5+progress*.72-flatDistance(player,c)*.12;
    };
    return score(b)-score(a);
  })[0];
}

function hasClearLane(from,to,opponents,width=2.6){
  const line=new THREE.Vector2(to.x-from.x,to.z-from.z),length=line.length();if(length<.1)return true;line.normalize();
  return !opponents.some(opponent=>{const rel=new THREE.Vector2(opponent.position.x-from.x,opponent.position.z-from.z),along=rel.dot(line);if(along<=0||along>=length)return false;const side=Math.abs(rel.x*line.y-rel.y*line.x);return side<width;});
}

class Player {
  constructor(x, z, team, user = false, goalkeeper = false, role = 'support') {
    this.team = team; this.user = user; this.goalkeeper = goalkeeper; this.role = role; this.velocity = new THREE.Vector3(); this.ballDirection = new THREE.Vector3(0,0,team==='blue'?-1:1); this.stamina = 100; this.cooldown = 0; this.releaseLock = 0; this.tackle = 0; this.decisionTimer=.2+Math.random()*.35; this.animTime = Math.random()*5;
    this.group = new THREE.Group(); this.group.position.set(x,0,z);
    const color = goalkeeper ? (team === 'blue' ? 0xffd83d : 0x9b6cff) : (team === 'blue' ? 0x28d9e3 : 0xff534c), accent = goalkeeper ? 0x171c20 : (team === 'blue' ? 0xb9ffff : 0xffc0b7);
    const jersey = new THREE.MeshStandardMaterial({color,roughness:.54,metalness:.06}), shorts=material(0x11171d,.78), skin=material(0xc98b61,.72), boot=material(0xe9ff61,.42,.18);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.58,.88,6,12),jersey); body.position.y=1.65;body.scale.set(1,.96,.72);body.castShadow=true;this.group.add(body);
    const chestBand=new THREE.Mesh(new THREE.BoxGeometry(1.05,.16,.05),new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.15,roughness:.5}));chestBand.position.set(0,1.72,.48);this.group.add(chestBand);
    const shortsMesh=new THREE.Mesh(new THREE.BoxGeometry(.95,.48,.72),shorts);shortsMesh.position.y=.93;shortsMesh.castShadow=true;this.group.add(shortsMesh);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,.26,10),skin);neck.position.y=2.35;this.group.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.36,20,14),skin);head.position.y=2.66;head.castShadow=true;this.group.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.37,18,10,0,Math.PI*2,0,Math.PI*.48),material(0x17100d,.88));hair.position.y=2.73;this.group.add(hair);
    this.legs=[];[-.27,.27].forEach((xp,index)=>{const limb=new THREE.Group();limb.position.set(xp,.83,0);const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.135,.48,4,8),skin);leg.position.y=-.34;leg.castShadow=true;limb.add(leg);const sock=new THREE.Mesh(new THREE.CapsuleGeometry(.15,.25,3,8),new THREE.MeshStandardMaterial({color:accent,roughness:.65}));sock.position.y=-.76;limb.add(sock);const shoe=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.58),boot);shoe.position.set(0,-1,.13);shoe.castShadow=true;limb.add(shoe);this.legs.push(limb);this.group.add(limb);});
    this.arms=[];[-.68,.68].forEach((xp,index)=>{const arm=new THREE.Group();arm.position.set(xp,2.02,0);const sleeve=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.25,3,8),jersey);sleeve.position.y=-.19;arm.add(sleeve);const forearm=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.38,3,8),skin);forearm.position.y=-.58;arm.add(forearm);if(goalkeeper){const glove=new THREE.Mesh(new THREE.BoxGeometry(.3,.25,.22),new THREE.MeshStandardMaterial({color:0xf2f5f2,roughness:.62}));glove.position.y=-.9;arm.add(glove);}this.arms.push(arm);this.group.add(arm);});
    const numberCanvas=document.createElement('canvas');numberCanvas.width=128;numberCanvas.height=128;const ng=numberCanvas.getContext('2d');ng.fillStyle='rgba(0,0,0,0)';ng.fillRect(0,0,128,128);ng.fillStyle='#ffffff';ng.font='900 74px Arial';ng.textAlign='center';ng.textBaseline='middle';ng.fillText(user?'10':goalkeeper?'1':String(2+Math.floor(Math.random()*8)),64,68);const numberTex=new THREE.CanvasTexture(numberCanvas);const number=new THREE.Mesh(new THREE.PlaneGeometry(.54,.54),new THREE.MeshBasicMaterial({map:numberTex,transparent:true,side:THREE.DoubleSide}));number.position.set(0,1.72,-.48);number.rotation.y=Math.PI;this.group.add(number);
    const glow=new THREE.Mesh(new THREE.CircleGeometry(.78,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.14,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.025;this.group.add(glow);
    if(user){
      const ring=new THREE.Mesh(new THREE.RingGeometry(.86,1.04,40),new THREE.MeshBasicMaterial({color:0xeaff65,side:THREE.DoubleSide,transparent:true,opacity:.95}));ring.rotation.x=-Math.PI/2;ring.position.y=.035;this.group.add(ring);this.userRing=ring;
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
    const forwardInput=(keys.KeyW?1:0)-(keys.KeyS?1:0), sideInput=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    const move=cameraForward().multiplyScalar(forwardInput).add(cameraRight().multiplyScalar(sideInput));
    const sprint=(keys.ShiftLeft||keys.ShiftRight||sprintButtonHeld)&&this.stamina>1&&move.lengthSq()>0, speed=sprint?14.25:9.5;
    if(move.lengthSq()){ move.normalize(); this.velocity.addScaledVector(move,speed*8*dt); }
    if(this.speedTrail)this.speedTrail.children.forEach((streak,index)=>{streak.material.opacity=sprint?.22-index*.045:0;});
    this.stamina=clamp(this.stamina+(sprint?-28:18)*dt,0,100); ui.stamina.style.width=`${this.stamina}%`;
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

    this.moveTactically(target,closest===this?9.2:7.4,dt,fieldMates);
    if(opponentHasBall&&flatDistance(this,ball.owner)<1.75&&this.cooldown<=0){const tackleDir=flatDirection(this.position,ball.owner.position);this.velocity.addScaledVector(tackleDir,15);this.tackle=.28;this.cooldown=1.15+Math.random()*.35;}
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

    if(this.decisionTimer<=0){
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
    this.ballDirection.copy(flatDirection(this.position,dribbleTarget));
    this.moveTactically(dribbleTarget,pressureDistance<4?8.5:7.8,dt,mates);
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
    const target=new THREE.Vector3(targetX,0,targetZ),dir=flatDirection(this.position,target);if(flatDistance(this,{position:target})>.35)this.velocity.addScaledVector(dir,(danger?10:7.5)*7*dt);
    if(danger&&movingTowardGoal&&flatDistance(this,ball)<5.5&&this.cooldown<=0){this.velocity.addScaledVector(flatDirection(this.position,predictedBallPosition(.12)),12);this.tackle=.25;this.cooldown=.7;}
  }
  touchBall(){
    if(this.goalkeeper&&this.releaseLock<=0&&ball.position.y<2.8){if(ball.owner!==this)this.cooldown=Math.max(this.cooldown,.3);ball.owner=this;ball.velocity.set(0,0,0);return;}
    if(ball.owner&&ball.owner!==this&&this.tackle<=0)return;if(ball.velocity.length()<17||this.tackle>0)ball.owner=this;
  }
}

const ball = {
  position:new THREE.Vector3(0,.48,0), velocity:new THREE.Vector3(), owner:null,
  mesh:new THREE.Mesh(new THREE.SphereGeometry(.48,32,24),new THREE.MeshStandardMaterial({map:createBallTexture(),roughness:.48,metalness:.03}))
};
ball.mesh.castShadow=true; scene.add(ball.mesh);
const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.52,24),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.28})); ballShadow.rotation.x=-Math.PI/2; ballShadow.position.y=.025; scene.add(ballShadow);
const trailCount=18,trailArray=new Float32Array(trailCount*3),trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailArray,3));
const ballTrail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xeaffd0,transparent:true,opacity:.35,depthWrite:false}));scene.add(ballTrail);
const effectParticles=[];

const aimMarker=new THREE.Group();
const aimRing=new THREE.Mesh(new THREE.RingGeometry(.42,.55,24),new THREE.MeshBasicMaterial({color:0xeaff65,side:THREE.DoubleSide,transparent:true,opacity:.8})); aimRing.rotation.x=-Math.PI/2; aimMarker.add(aimRing);
const aimLine=new THREE.Mesh(new THREE.BoxGeometry(.06,.02,3),new THREE.MeshBasicMaterial({color:0xeaff65,transparent:true,opacity:.55})); aimLine.position.z=1.5; aimMarker.add(aimLine); scene.add(aimMarker);

let players=[];
function reset(){
  players.forEach(p=>scene.remove(p.group));
  players=[new Player(0,43,'blue',true,false,'striker'),new Player(-18,27,'blue',false,false,'left'),new Player(18,27,'blue',false,false,'defender'),new Player(0,FIELD.halfL-3,'blue',false,true,'goalkeeper'),new Player(0,-43,'red',false,false,'striker'),new Player(-18,-27,'red',false,false,'left'),new Player(18,-27,'red',false,false,'defender'),new Player(0,-FIELD.halfL+3,'red',false,true,'goalkeeper')];
  ball.position.set(0,.48,0); ball.velocity.set(0,0,0); ball.owner=null; charge=0; kickoff=1.4;
  for(let i=0;i<trailCount;i++){trailArray[i*3]=0;trailArray[i*3+1]=.48;trailArray[i*3+2]=0;}trailGeometry.attributes.position.needsUpdate=true;
}

function kickBall(player,dir,power,lift=.08,isShot=false){
  if(ball.owner!==player)return; ball.owner=null;
  if(player.goalkeeper){ball.position.addScaledVector(dir,1.7);ball.position.y=.6;player.releaseLock=.45;}
  const force=isShot?36+power*60:16+power*18; ball.velocity.set(dir.x*force,3+lift*force,dir.z*force); player.velocity.addScaledVector(dir,-2);cameraShake=Math.max(cameraShake,.08+power*.16);spawnKickBurst(ball.position,player.team);
}
function shoot(){ const user=players[0]; if(ball.owner!==user||kickoff>0)return; kickBall(user,flatDirection(ball.position,aimPoint),charge,.13,true); }
function pass(){
  const user=players[0]; if(ball.owner!==user||kickoff>0)return; const mates=players.filter(p=>p.team==='blue'&&p!==user), aimDir=flatDirection(user.position,aimPoint);
  const target=[...mates].sort((a,b)=>flatDirection(user.position,b.position).dot(aimDir)-flatDirection(user.position,a.position).dot(aimDir))[0];
  const lead=target.position.clone().addScaledVector(target.velocity,.18); kickBall(user,flatDirection(ball.position,lead),.28,.03);
}
function tackle(){
  const user=players[0]; if(user.stamina<20||user.cooldown>0)return;
  const direction=user.velocity.lengthSq()>1?user.velocity.clone().setY(0).normalize():cameraForward();
  user.velocity.addScaledVector(direction,25); user.tackle=.38; user.cooldown=.9; user.stamina-=20;
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
  goalGlow=Math.max(0,goalGlow-dt*1.4);renderer.toneMappingExposure=1.28+goalGlow*.42;
}

function updateAim(){
  raycaster.setFromCamera(pointer,camera); const ray=raycaster.ray, t=-ray.origin.y/ray.direction.y;
  if(t>0) aimPoint.copy(ray.origin).addScaledVector(ray.direction,t);
  aimPoint.x=clamp(aimPoint.x,-FIELD.halfW,FIELD.halfW); aimPoint.z=clamp(aimPoint.z,-FIELD.halfL,FIELD.halfL); aimMarker.position.copy(aimPoint); aimMarker.position.y=.05;
  const user=players[0]; if(user){ const d=flatDirection(user.position,aimPoint); aimMarker.rotation.y=Math.atan2(d.x,d.z); }
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
  ballShadow.position.set(ball.position.x,.025,ball.position.z); ballShadow.scale.setScalar(clamp(1.25-ball.position.y*.08,.45,1));
  for(let i=trailCount-1;i>0;i--){trailArray[i*3]=trailArray[(i-1)*3];trailArray[i*3+1]=trailArray[(i-1)*3+1];trailArray[i*3+2]=trailArray[(i-1)*3+2];}
  trailArray[0]=ball.position.x;trailArray[1]=ball.position.y;trailArray[2]=ball.position.z;trailGeometry.attributes.position.needsUpdate=true;ballTrail.material.opacity=clamp((ball.velocity.length()-12)/42,0,.42);
}

function resolvePlayers(){
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){ const a=players[i],b=players[j],dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,d=Math.hypot(dx,dz); if(d<1.25&&d>0){const push=(1.25-d)/2;a.position.x-=dx/d*push;a.position.z-=dz/d*push;b.position.x+=dx/d*push;b.position.z+=dz/d*push;} }
}
function goal(team){ if(kickoff>0)return; team==='blue'?blueScore++:redScore++; ui.blue.textContent=blueScore;ui.red.textContent=redScore;spawnGoalCelebration(team);flash(team==='blue'?'GOLAÇO!':'GOL DELES!',team==='blue'?'#37e5e2':'#ff5c4d');reset(); }
function flash(text,color='#fff'){ui.message.textContent=text;ui.message.style.color=color;ui.message.classList.add('show');setTimeout(()=>ui.message.classList.remove('show'),1000);}
function endGame(){running=false;document.exitPointerLock?.();const result=blueScore===redScore?'EMPATE!':blueScore>redScore?'VITÓRIA!':'DERROTA';flash(result,blueScore>=redScore?'#eaff65':'#ff5c4d');setTimeout(()=>{ui.start.querySelector('h1').innerHTML=`${result}<br><em>${blueScore} × ${redScore}</em>`;ui.start.querySelector('button').innerHTML='JOGAR DE NOVO <span>→</span>';ui.start.classList.remove('hidden');},1200);}

function updateCamera(dt){
  const user=players[0]; if(!user)return;
  const horizontalInput=(keys.KeyL?1:0)-(keys.KeyJ?1:0);
  const verticalInput=(keys.KeyK?1:0)-(keys.KeyI?1:0);
  cameraOrbit.yaw-=horizontalInput*1.9*dt;
  cameraOrbit.pitch=clamp(cameraOrbit.pitch+verticalInput*1.15*dt,.2,.82);
  const horizontal=Math.cos(cameraOrbit.pitch)*cameraOrbit.distance;
  const desired=new THREE.Vector3(
    user.position.x+Math.sin(cameraOrbit.yaw)*horizontal,
    2.2+Math.sin(cameraOrbit.pitch)*cameraOrbit.distance,
    user.position.z+Math.cos(cameraOrbit.yaw)*horizontal
  );
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  if(cameraShake>0){camera.position.x+=(Math.random()-.5)*cameraShake;camera.position.y+=(Math.random()-.5)*cameraShake*.5;camera.position.z+=(Math.random()-.5)*cameraShake;cameraShake=Math.max(0,cameraShake-dt*1.8);}
  camera.lookAt(user.position.x,1.25,user.position.z);
}
function resize(){
  const wrap=canvas.parentElement, w=wrap.clientWidth, h=wrap.clientHeight;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
}
function update(dt){
  updateCamera(dt); updateAim(); updateVisualEffects(dt); if(!running)return;
  if(kickoff>0)kickoff-=dt;else time=Math.max(0,time-dt);
  if(mouseDown&&ball.owner===players[0])charge=clamp(charge+dt*.7,0,1);
  players.forEach(p=>p.update(dt)); resolvePlayers(); updateBall(dt);
  const mins=Math.floor(time/60),secs=Math.floor(time%60);ui.clock.textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;if(time<=0)endGame();
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock3d.getDelta(),.033);resize();update(dt);aimRing.material.color.set(charge>.82?0xff5c4d:0xeaff65);const aimPulse=1+Math.sin(clock3d.elapsedTime*5)*.08+charge*.32;aimMarker.scale.setScalar(aimPulse);renderer.render(scene,camera);}

canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;
});
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===canvas){cameraOrbit.yaw-=e.movementX*.0028;cameraOrbit.pitch=clamp(cameraOrbit.pitch+e.movementY*.0022,.2,.82);pointer.set(0,0);}
});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas)pointer.set(0,0);});
canvas.addEventListener('pointerdown',e=>{if(e.button===0){mouseDown=true;if(running&&document.pointerLockElement!==canvas)canvas.requestPointerLock?.();}});
window.addEventListener('pointerup',e=>{if(e.button===0&&mouseDown){mouseDown=false;shoot();charge=0;}});
canvas.addEventListener('wheel',e=>{e.preventDefault();cameraOrbit.distance=clamp(cameraOrbit.distance+e.deltaY*.012,9,23);},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','KeyE','KeyI','KeyJ','KeyK','KeyL'].includes(e.code))e.preventDefault();if(e.code==='Space'&&!e.repeat)pass();if(e.code==='KeyE'&&!e.repeat)tackle();});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
ui.sprint.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();sprintButtonHeld=true;ui.sprint.classList.add('active');ui.sprint.setPointerCapture?.(e.pointerId);});
const releaseSprint=()=>{sprintButtonHeld=false;ui.sprint.classList.remove('active');};
ui.sprint.addEventListener('pointerup',releaseSprint);ui.sprint.addEventListener('pointercancel',releaseSprint);ui.sprint.addEventListener('lostpointercapture',releaseSprint);
document.getElementById('startButton').addEventListener('click',()=>{blueScore=redScore=0;time=120;ui.blue.textContent=ui.red.textContent='0';reset();running=true;ui.start.classList.add('hidden');canvas.requestPointerLock?.();});

addAtmosphere();addLights();addPitch();reset();camera.position.set(0,10,35);animate();
