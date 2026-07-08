/* global THREE */
const canvas = document.getElementById('game');
const ui = {
  blue: document.getElementById('blueScore'), red: document.getElementById('redScore'),
  clock: document.getElementById('clock'), stamina: document.getElementById('staminaBar'),
  start: document.getElementById('startScreen'), message: document.getElementById('message')
};

if (!window.THREE) {
  ui.start.querySelector('p:not(.kicker)').textContent = 'Não foi possível carregar o modo 3D. Verifique a conexão com a internet e atualize a página.';
  ui.start.querySelector('button').disabled = true;
  throw new Error('Three.js não carregou.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f);
scene.fog = new THREE.FogExp2(0x07110f, 0.011);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 250);
const clock3d = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0.25);
const aimPoint = new THREE.Vector3(0, 0, -15);
const keys = {};
const cameraOrbit = { yaw: 0, pitch: .46, distance: 15, dragging: false, lastX: 0, lastY: 0 };

const FIELD = { halfW: 23, halfL: 36, goalHalf: 5.3, goalDepth: 2.6 };
let running = false, time = 120, blueScore = 0, redScore = 0, kickoff = 0, charge = 0, mouseDown = false;

const clamp = THREE.MathUtils.clamp;
const flatDistance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const flatDirection = (from, to) => new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
const cameraForward = () => new THREE.Vector3(-Math.sin(cameraOrbit.yaw), 0, -Math.cos(cameraOrbit.yaw));
const cameraRight = () => new THREE.Vector3(Math.cos(cameraOrbit.yaw), 0, -Math.sin(cameraOrbit.yaw));

function material(color, roughness = 0.72, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xbfffee, 0x08100e, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-18, 38, 24); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50; scene.add(sun);
  [[-26,-28],[26,-28],[-26,28],[26,28]].forEach(([x,z]) => {
    const light = new THREE.PointLight(0xbaffff, 16, 60, 2); light.position.set(x, 15, z); scene.add(light);
  });
}

function addPitch() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(52, 80), material(0x0d3028, 0.92));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  for (let z = -35; z < 36; z += 6) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(46, 3), new THREE.MeshBasicMaterial({ color: z % 12 ? 0x10372e : 0x123c32, transparent: true, opacity: .75 }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, .012, z); scene.add(stripe);
  }
  const lines = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xc9eee4, transparent: true, opacity: .65 });
  const rect = (w, h, x = 0, z = 0) => {
    const pts = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,-h/2]].map(([px,pz]) => new THREE.Vector3(px+x,.035,pz+z));
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  };
  rect(FIELD.halfW * 2, FIELD.halfL * 2); rect(16, 10, 0, -31); rect(16, 10, 0, 31);
  lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-FIELD.halfW,.035,0),new THREE.Vector3(FIELD.halfW,.035,0)]), lineMat));
  const circle = new THREE.EllipseCurve(0,0,5.2,5.2,0,Math.PI*2).getPoints(64).map(p => new THREE.Vector3(p.x,.035,p.y));
  lines.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle), lineMat)); scene.add(lines);
  addGoals(); addWalls(); addStadium();
}

function addGoals() {
  const goalMat = material(0xe8fff9, .3, .4);
  [-1, 1].forEach(side => {
    const group = new THREE.Group(), z = side * FIELD.halfL;
    const postGeo = new THREE.CylinderGeometry(.13, .13, 3.2, 12);
    [-FIELD.goalHalf, FIELD.goalHalf].forEach(x => { const p = new THREE.Mesh(postGeo, goalMat); p.position.set(x,1.6,z); p.castShadow = true; group.add(p); });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,FIELD.goalHalf*2,12), goalMat); bar.rotation.z = Math.PI/2; bar.position.set(0,3.2,z); group.add(bar);
    const net = new THREE.Mesh(new THREE.BoxGeometry(FIELD.goalHalf*2,3.2,FIELD.goalDepth), new THREE.MeshBasicMaterial({color: side < 0 ? 0x37e5e2 : 0xff5c4d,wireframe:true,transparent:true,opacity:.16}));
    net.position.set(0,1.6,z + side * FIELD.goalDepth/2); group.add(net); scene.add(group);
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
  const standMat = material(0x10181c,.95); const crowdColors = [0x37e5e2,0xff5c4d,0xeaff65,0xd8e2df];
  [-1,1].forEach(side => {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(8,6,82),standMat); stand.position.set(side*29,2,0); scene.add(stand);
    for(let i=0;i<70;i++){ const fan=new THREE.Mesh(new THREE.BoxGeometry(.22,.45,.22),material(crowdColors[i%4])); fan.position.set(side*(25.5+Math.random()*3),3.5+Math.random()*2,-38+Math.random()*76); scene.add(fan); }
  });
}

class Player {
  constructor(x, z, team, user = false) {
    this.team = team; this.user = user; this.velocity = new THREE.Vector3(); this.stamina = 100; this.cooldown = 0; this.tackle = 0;
    this.group = new THREE.Group(); this.group.position.set(x,0,z);
    const color = team === 'blue' ? 0x37e5e2 : 0xff5c4d, jersey = material(color,.55,.12), dark = material(0x10161a,.8);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.62,1.05,5,10),jersey); body.position.y=1.45; body.castShadow=true; this.group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.38,16,10),material(0xd5a475,.8)); head.position.y=2.65; head.castShadow=true; this.group.add(head);
    [-.3,.3].forEach(xp=>{ const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.55,3,8),dark); leg.position.set(xp,.48,0); leg.castShadow=true; this.group.add(leg); });
    if(user){ const ring=new THREE.Mesh(new THREE.RingGeometry(.82,1.03,32),new THREE.MeshBasicMaterial({color:0xeaff65,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=.04; this.group.add(ring); }
    scene.add(this.group);
  }
  get position(){ return this.group.position; }
  update(dt){
    this.cooldown=Math.max(0,this.cooldown-dt); this.tackle=Math.max(0,this.tackle-dt);
    this.user ? this.userMove(dt) : this.aiMove(dt);
    this.position.addScaledVector(this.velocity,dt); this.position.x=clamp(this.position.x,-FIELD.halfW+.7,FIELD.halfW-.7); this.position.z=clamp(this.position.z,-FIELD.halfL+.7,FIELD.halfL-.7);
    this.velocity.multiplyScalar(Math.pow(.004,dt)); if(this.velocity.lengthSq()>.3) this.group.rotation.y=Math.atan2(this.velocity.x,this.velocity.z);
    if(flatDistance(this,ball)<1.25) this.touchBall();
  }
  userMove(dt){
    const forwardInput=(keys.KeyW?1:0)-(keys.KeyS?1:0), sideInput=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    const move=cameraForward().multiplyScalar(forwardInput).add(cameraRight().multiplyScalar(sideInput));
    const sprint=(keys.ShiftLeft||keys.ShiftRight)&&this.stamina>1&&move.lengthSq()>0, speed=sprint?19:12.5;
    if(move.lengthSq()){ move.normalize(); this.velocity.addScaledVector(move,speed*8*dt); }
    this.stamina=clamp(this.stamina+(sprint?-28:18)*dt,0,100); ui.stamina.style.width=`${this.stamina}%`;
  }
  aiMove(dt){
    const attackZ=this.team==='blue'?-1:1, mates=players.filter(p=>p.team===this.team), nearest=[...mates].sort((a,b)=>flatDistance(a,ball)-flatDistance(b,ball))[0];
    let target=new THREE.Vector3(this.team==='blue'?(players.indexOf(this)%2?9:-9):(players.indexOf(this)%2?-9:9),0,attackZ*-5);
    if(nearest===this||flatDistance(this,ball)<10) target.copy(ball.position);
    const dir=flatDirection(this.position,target); if(this.position.distanceTo(target)>.8)this.velocity.addScaledVector(dir,10.5*7*dt);
    if(flatDistance(this,ball)<1.45&&this.cooldown<=0){ const goal=new THREE.Vector3((Math.random()-.5)*5,0,attackZ*FIELD.halfL); kickBall(this,flatDirection(ball.position,goal),.55+Math.random()*.25); this.cooldown=.75; }
  }
  touchBall(){ if(ball.owner&&ball.owner!==this&&this.tackle<=0)return; if(ball.velocity.length()<17||this.tackle>0)ball.owner=this; }
}

const ball = {
  position:new THREE.Vector3(0,.48,0), velocity:new THREE.Vector3(), owner:null,
  mesh:new THREE.Mesh(new THREE.SphereGeometry(.48,24,16),material(0xf5f3df,.55,.08))
};
ball.mesh.castShadow=true; scene.add(ball.mesh);
const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.52,24),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.28})); ballShadow.rotation.x=-Math.PI/2; ballShadow.position.y=.025; scene.add(ballShadow);

const aimMarker=new THREE.Group();
const aimRing=new THREE.Mesh(new THREE.RingGeometry(.42,.55,24),new THREE.MeshBasicMaterial({color:0xeaff65,side:THREE.DoubleSide,transparent:true,opacity:.8})); aimRing.rotation.x=-Math.PI/2; aimMarker.add(aimRing);
const aimLine=new THREE.Mesh(new THREE.BoxGeometry(.06,.02,3),new THREE.MeshBasicMaterial({color:0xeaff65,transparent:true,opacity:.55})); aimLine.position.z=1.5; aimMarker.add(aimLine); scene.add(aimMarker);

let players=[];
function reset(){
  players.forEach(p=>scene.remove(p.group));
  players=[new Player(0,22,'blue',true),new Player(-9,12,'blue'),new Player(9,12,'blue'),new Player(0,-22,'red'),new Player(-9,-12,'red'),new Player(9,-12,'red')];
  ball.position.set(0,.48,0); ball.velocity.set(0,0,0); ball.owner=null; charge=0; kickoff=1.4;
}

function kickBall(player,dir,power,lift=.08){
  if(ball.owner!==player)return; ball.owner=null; const force=18+power*25; ball.velocity.set(dir.x*force,3+lift*force,dir.z*force); player.velocity.addScaledVector(dir,-2);
}
function shoot(){ const user=players[0]; if(ball.owner!==user||kickoff>0)return; kickBall(user,flatDirection(ball.position,aimPoint),charge,.13); }
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

function updateAim(){
  raycaster.setFromCamera(pointer,camera); const ray=raycaster.ray, t=-ray.origin.y/ray.direction.y;
  if(t>0) aimPoint.copy(ray.origin).addScaledVector(ray.direction,t);
  aimPoint.x=clamp(aimPoint.x,-FIELD.halfW,FIELD.halfW); aimPoint.z=clamp(aimPoint.z,-FIELD.halfL,FIELD.halfL); aimMarker.position.copy(aimPoint); aimMarker.position.y=.05;
  const user=players[0]; if(user){ const d=flatDirection(user.position,aimPoint); aimMarker.rotation.y=Math.atan2(d.x,d.z); }
}

function updateBall(dt){
  if(ball.owner){
    const p=ball.owner, d=p.user?flatDirection(p.position,aimPoint):new THREE.Vector3(0,0,p.team==='blue'?-1:1);
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
}

function resolvePlayers(){
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){ const a=players[i],b=players[j],dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,d=Math.hypot(dx,dz); if(d<1.25&&d>0){const push=(1.25-d)/2;a.position.x-=dx/d*push;a.position.z-=dz/d*push;b.position.x+=dx/d*push;b.position.z+=dz/d*push;} }
}
function goal(team){ if(kickoff>0)return; team==='blue'?blueScore++:redScore++; ui.blue.textContent=blueScore;ui.red.textContent=redScore;flash(team==='blue'?'GOLAÇO!':'GOL DELES!',team==='blue'?'#37e5e2':'#ff5c4d');reset(); }
function flash(text,color='#fff'){ui.message.textContent=text;ui.message.style.color=color;ui.message.classList.add('show');setTimeout(()=>ui.message.classList.remove('show'),1000);}
function endGame(){running=false;const result=blueScore===redScore?'EMPATE!':blueScore>redScore?'VITÓRIA!':'DERROTA';flash(result,blueScore>=redScore?'#eaff65':'#ff5c4d');setTimeout(()=>{ui.start.querySelector('h1').innerHTML=`${result}<br><em>${blueScore} × ${redScore}</em>`;ui.start.querySelector('button').innerHTML='JOGAR DE NOVO <span>→</span>';ui.start.classList.remove('hidden');},1200);}

function updateCamera(dt){
  const user=players[0]; if(!user)return;
  const horizontalInput=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0);
  const verticalInput=(keys.ArrowDown?1:0)-(keys.ArrowUp?1:0);
  cameraOrbit.yaw-=horizontalInput*1.9*dt;
  cameraOrbit.pitch=clamp(cameraOrbit.pitch+verticalInput*1.15*dt,.2,.82);
  const horizontal=Math.cos(cameraOrbit.pitch)*cameraOrbit.distance;
  const desired=new THREE.Vector3(
    user.position.x+Math.sin(cameraOrbit.yaw)*horizontal,
    2.2+Math.sin(cameraOrbit.pitch)*cameraOrbit.distance,
    user.position.z+Math.cos(cameraOrbit.yaw)*horizontal
  );
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  camera.lookAt(user.position.x,1.25,user.position.z);
}
function resize(){
  const wrap=canvas.parentElement, w=wrap.clientWidth, h=wrap.clientHeight;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
}
function update(dt){
  updateCamera(dt); updateAim(); if(!running)return;
  if(kickoff>0)kickoff-=dt;else time=Math.max(0,time-dt);
  if(mouseDown&&ball.owner===players[0])charge=clamp(charge+dt*.7,0,1);
  players.forEach(p=>p.update(dt)); resolvePlayers(); updateBall(dt);
  const mins=Math.floor(time/60),secs=Math.floor(time%60);ui.clock.textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;if(time<=0)endGame();
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock3d.getDelta(),.033);resize();update(dt);aimRing.material.color.set(charge>.82?0xff5c4d:0xeaff65);renderer.render(scene,camera);}

canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;
  if(cameraOrbit.dragging){
    cameraOrbit.yaw-=(e.clientX-cameraOrbit.lastX)*.007;
    cameraOrbit.pitch=clamp(cameraOrbit.pitch+(e.clientY-cameraOrbit.lastY)*.005,.2,.82);
    cameraOrbit.lastX=e.clientX;cameraOrbit.lastY=e.clientY;
  }
});
canvas.addEventListener('pointerdown',e=>{
  if(e.button===0)mouseDown=true;
  if(e.button===2){cameraOrbit.dragging=true;cameraOrbit.lastX=e.clientX;cameraOrbit.lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);}
});
window.addEventListener('pointerup',e=>{if(e.button===0&&mouseDown){mouseDown=false;shoot();charge=0;}if(e.button===2)cameraOrbit.dragging=false;});
canvas.addEventListener('wheel',e=>{e.preventDefault();cameraOrbit.distance=clamp(cameraOrbit.distance+e.deltaY*.012,9,23);},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&!e.repeat)pass();if(e.code==='KeyE'&&!e.repeat)tackle();});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
document.getElementById('startButton').addEventListener('click',()=>{blueScore=redScore=0;time=120;ui.blue.textContent=ui.red.textContent='0';reset();running=true;ui.start.classList.add('hidden');});

addLights();addPitch();reset();camera.position.set(0,10,35);animate();
