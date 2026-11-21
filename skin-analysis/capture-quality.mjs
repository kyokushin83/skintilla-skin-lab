export const QUALITY_LABELS=['Not Good','OK','Good'];
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
const between=(v,a,b)=>v>=a&&v<=b;

// Pure state classification is shared by the live UI and boundary-condition tests.
export function classifyQuality(s) {
  if(s.faces!==1)return {lighting:0,straight:0,position:0,message:s.faces>1?'한 사람의 얼굴만 화면에 들어오게 해 주세요.':'얼굴 전체가 보이도록 원 안에 맞춰 주세요.'};
  const lighting=between(s.brightness,55,220)&&s.clipped<.08&&s.imbalance<.22?2:between(s.brightness,38,235)&&s.clipped<.22&&s.imbalance<.38?1:0;
  const straight=s.yaw<.12&&s.roll<.085&&between(s.pitch,.29,.62)&&s.eyeOpen>.14?2:s.yaw<.22&&s.roll<.16&&between(s.pitch,.20,.72)&&s.eyeOpen>.10?1:0;
  const {x,y,w,h}=s.box,cx=x+w/2,cy=y+h/2;
  const safe=x>.02&&y>.02&&x+w<.98&&y+h<.98;
  const position=safe&&Math.abs(cx-.5)<.065&&Math.abs(cy-.55)<.065&&between(w,.34,.66)&&between(h,.40,.67)?2:safe&&Math.abs(cx-.5)<.12&&Math.abs(cy-.55)<.12&&between(w,.25,.76)&&between(h,.32,.80)?1:0;
  let message='좋아요. 잠시 그대로 유지해 주세요.';
  if(position===0)message=w>.76||h>.80?'조금 뒤로 이동해 얼굴 전체를 원 안에 넣어 주세요.':w<.25||h<.32?'카메라에 조금 더 가까이 다가와 주세요.':'얼굴을 원의 중앙에 맞춰 주세요.';
  else if(straight===0)message='고개를 기울이지 말고, 눈을 뜬 채 카메라를 정면으로 봐 주세요.';
  else if(lighting===0)message=s.brightness>235||s.clipped>.22?'빛이 너무 강해요. 얼굴을 직접 비추는 조명을 피해 주세요.':s.imbalance>.38?'얼굴 양쪽에 고르게 빛이 닿게 해 주세요.':'조금 더 밝은 곳에서 촬영해 주세요.';
  else if([lighting,straight,position].includes(1))message='촬영할 수 있어요. 세 항목이 모두 Good이면 자동 촬영돼요.';
  return {lighting,straight,position,message};
}

export function qualityFromLandmarks(canvas,faces){
  if(faces.length!==1)return classifyQuality({faces:faces.length});
  const lm=faces[0],xs=lm.map(p=>p.x),ys=lm.map(p=>p.y);
  const box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  const context=canvas.getContext('2d',{willReadFrequently:true});
  function patch(cx,cy,rx,ry){const x=Math.max(0,Math.floor((cx-rx)*canvas.width)),y=Math.max(0,Math.floor((cy-ry)*canvas.height));const w=Math.min(canvas.width-x,Math.max(1,Math.round(rx*2*canvas.width))),h=Math.min(canvas.height-y,Math.max(1,Math.round(ry*2*canvas.height)));const data=context.getImageData(x,y,w,h).data;let sum=0,clipped=0;for(let i=0;i<data.length;i+=4){const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=l;if(l<12||l>245)clipped++;}return {value:sum/(data.length/4),clipped:clipped/(data.length/4)};}
  const left=patch(box.x+box.w*.25,box.y+box.h*.58,box.w*.07,box.h*.06),right=patch(box.x+box.w*.75,box.y+box.h*.58,box.w*.07,box.h*.06),forehead=patch(box.x+box.w*.5,box.y+box.h*.18,box.w*.12,box.h*.035);
  const l=lm[33],r=lm[263],nose=lm[1],eyeY=(l.y+r.y)/2;
  const eyeOpen=avg([[159,145,33,133],[386,374,362,263]].map(([a,b,c,d])=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y)/Math.max(.001,Math.hypot(lm[c].x-lm[d].x,lm[c].y-lm[d].y))));
  return classifyQuality({faces:1,box,brightness:avg([left.value,right.value,forehead.value]),clipped:avg([left.clipped,right.clipped,forehead.clipped]),imbalance:Math.abs(left.value-right.value)/Math.max(30,left.value,right.value),yaw:Math.abs(nose.x-(l.x+r.x)/2)/Math.max(.001,Math.abs(l.x-r.x)),roll:Math.abs(l.y-r.y)/Math.max(.001,Math.abs(l.x-r.x)),pitch:(nose.y-eyeY)/Math.max(.001,lm[152].y-eyeY),eyeOpen});
}

// Capture precisely the same center crop visible in the portrait camera viewport.
export function drawCameraFrame(video,canvas,width=360){
  if(!video.videoWidth||!video.videoHeight)return false;
  const ratio=3/4,sourceRatio=video.videoWidth/video.videoHeight;
  let sw=video.videoWidth,sh=video.videoHeight,sx=0,sy=0;
  if(sourceRatio>ratio){sw=sh*ratio;sx=(video.videoWidth-sw)/2;}else{sh=sw/ratio;sy=(video.videoHeight-sh)/2;}
  canvas.width=width;canvas.height=Math.round(width/ratio);
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);return true;
}

export class CaptureGate {
  constructor(){this.reset();}
  reset(){this.goodSince=null;this.acceptableSince=null;this.lastAt=null;}
  update(q,now){
    if(this.lastAt!==null&&now-this.lastAt>1000){this.goodSince=null;this.acceptableSince=null;}
    this.lastAt=now;
    const levels=[q.lighting,q.straight,q.position];
    if(levels.some(v=>v===0)){this.goodSince=null;this.acceptableSince=null;return {ready:false,countdown:null,auto:false};}
    this.acceptableSince??=now;
    if(levels.every(v=>v===2)){this.goodSince??=now;const elapsed=now-this.goodSince;return {ready:now-this.acceptableSince>=600,countdown:Math.max(1,Math.ceil((3000-elapsed)/1000)),auto:elapsed>=3000};}
    this.goodSince=null;return {ready:now-this.acceptableSince>=600,countdown:null,auto:false};
  }
}
