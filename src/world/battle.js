import { Vec3 } from 'playcanvas';
import { loft, ring } from './geometry.js';
import { createEncounterView } from './encounter.js';

/** Original cosmetic raider and accepted-event cues, on the caller's Application. */
export function createBattleScene({root, primitive, custom, material, device, horizon}) {
  const view = createEncounterView();
  const scene = root('Encounter space'); scene.enabled = false;
  const pirate = root('Boarding raider', scene);
  const armour = material('Raider blackened armour', [0.18, 0.13, 0.15], 0.55);
  const red = material('Raider salvage plating', [0.55, 0.16, 0.12], 0.4);
  const hot = material('Raider drive and weapon light', [0.98, 0.32, 0.09], 0, 1.5);
  const ice = material('Horizon weapon light', [0.2, 0.72, 0.94], 0, 1.5);
  custom(pirate, 'Raider wedge fuselage', loft(device,[[-4,1.6,0.8],[-2,1.8,1],[2,0.9,0.55],[5,0.15,0.18]]),[0,0,0],armour);
  for (const side of [-1,1]) {
    custom(pirate,'Forked boarding prow',loft(device,[[-2,0.65,0.35],[1,0.75,0.35],[5.6,0.15,0.12]]),[side*2.1,-0.35,0],red,[0,side*10,0]);
    primitive(pirate,'Exposed raider drive','cylinder',[side*2.1,0,-3.8],[1.3,2,1.3],armour,[90,0,0]);
    custom(pirate,'Hot drive mouth',ring(device,0.52,0.13,24),[side*2.1,0,-4.9],hot);
    primitive(pirate,'Forward cannon','cylinder',[side*1.4,0.7,2.6],[0.25,2.6,0.25],armour,[90,0,0]);
  }
  primitive(pirate,'Asymmetric salvage sail','box',[-3.4,1.7,-1.8],[2.4,0.2,4.2],red,[0,0,-30]);
  primitive(pirate,'Armoured command slit','box',[0,1.02,1.1],[1.1,0.12,1.2],hot);
  const beams = [ice,hot].map((m,i)=>{
    const e=root(i?'Accepted pirate salvo':'Accepted Horizon salvo',scene);
    const bolt=primitive(e,'Salvo trace','cylinder',[0,0,-0.5],[0.07,1,0.07],m,[90,0,0]);
    e.enabled=false;return {e,bolt,life:0};
  });
  const impacts=[ice,hot].map((m,i)=>{
    const e=primitive(scene,i?'Accepted raider impact':'Accepted Horizon impact','sphere',[0,0,0],[3,3,3],m);e.enabled=false;return {e,life:0};
  });
  const boarding=root('Accepted boarding tether',scene);
  const tether=primitive(boarding,'Boarding line','cylinder',[0,0,-0.5],[0.045,1,0.045],hot,[90,0,0]);boarding.enabled=false;
  let projection=null;
  const from=new Vec3(),to=new Vec3();
  function connect(e,bolt,actor,target,miss = false) {
    from.copy(actor.getPosition());to.copy(target.getPosition());
    if (miss) { to.y += 4; to.x += 3; }
    e.setPosition(from);e.lookAt(to);const length=from.distance(to);
    bolt.setLocalPosition(0,0,-length/2);bolt.setLocalScale(0.07,length,0.07);
  }
  function cancel() {
    for(const cue of [...beams,...impacts]){cue.life=0;cue.e.enabled=false;}
  }
  function place() {
    if(!projection)return;
    const {player,pirate:raider}=projection.snapshot;
    const retreat=ship=>Math.min(100,Math.max(0,ship.escapeProgress??0))/100;
    horizon.setPosition(-7-retreat(player)*8,2,2+retreat(player)*6);horizon.setEulerAngles(0,player.retreating?155:65,0);
    pirate.setPosition(7+retreat(raider)*8,7,-8-retreat(raider)*6);pirate.setEulerAngles(0,raider.retreating?-25:-115,0);
    pirate.enabled=raider.hull>0;
    boarding.enabled=projection.result?.outcome==='boarded';
    if(boarding.enabled)connect(boarding,tether,pirate,horizon);
  }
  return {
    get active(){return Boolean(projection);},
    accept(next,companyId,quiet) {
      const accepted=view.accept(next,companyId);projection=accepted.snapshot;scene.enabled=Boolean(projection);
      if(accepted.reset||quiet)cancel();
      place();
      if(!projection||quiet)return;
      // A bounded cue per actor/type summarizes a large accepted batch. UI owns
      // its complete event readout; visual traces never infer hit or damage.
      for(const event of accepted.events) {
        const actor=event.actorId===projection.snapshot.player.id?0:1;
        if(event.type==='weapon') {
          const cue=beams[actor];cue.life=0.45;cue.e.enabled=true;
          const miss=accepted.events.some(e=>e.type==='miss' && e.tick===event.tick && e.actorId===event.actorId);
          connect(cue.e,cue.bolt,actor?pirate:horizon,actor?horizon:pirate,miss);
        }
        if(event.type==='hit'||event.type==='damage') {
          const target=event.targetId===projection.snapshot.player.id?0:1;
          const cue=impacts[target];cue.life=0.3;cue.e.enabled=true;cue.e.setPosition(target?pirate.getPosition():horizon.getPosition());
        }
      }
    },
    update(dt) {
      for(const cue of [...beams,...impacts]){cue.life=Math.max(0,cue.life-dt);cue.e.enabled=cue.life>0;}
    },
    cancel,
    clear(){view.clear();projection=null;scene.enabled=false;boarding.enabled=false;cancel();}
  };
}
