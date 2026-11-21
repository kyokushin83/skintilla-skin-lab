import { FilesetResolver, FaceLandmarker } from './vendor/vision_bundle.mjs';

let modelPromise;
export function loadModel() {
  if (!modelPromise) modelPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', import.meta.url).href);
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: new URL('./vendor/face_landmarker.task', import.meta.url).href, delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 2, minFaceDetectionConfidence: .6, minFacePresenceConfidence: .6,
    });
  })().catch(e => { modelPromise = null; throw e; });
  return modelPromise;
}
const clamp = (v, a=0, b=1) => Math.min(b, Math.max(a,v));
const score = v => Math.round(clamp(v, 5, 98));
const mean = a => a.reduce((s,v)=>s+v,0)/a.length;

// All indices below are experimental appearance proxies, not validated biological measurements.
// Regions are normalized to an AI-detected face crop, so background pixels never enter the scores.
export function appearanceReport(canvas, landmarks) {
  const xs=landmarks.map(p=>p.x), ys=landmarks.map(p=>p.y);
  const box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  if(box.w<.2||box.h<.24) throw new Error('얼굴이 너무 작게 보여요. 카메라에 조금 더 가까이 다가와 주세요.');
  if(box.x<.015||box.y<.015||box.x+box.w>.985||box.y+box.h>.985) throw new Error('얼굴 전체가 화면 안에 들어오도록 거리를 조절해 주세요.');
  const nose=landmarks[1], l=landmarks[33], r=landmarks[263];
  if(Math.abs(l.y-r.y)/box.h>.12 || Math.abs(nose.x-(l.x+r.x)/2)/box.w>.15) throw new Error('얼굴을 기울이지 말고 카메라를 정면으로 바라봐 주세요.');
  const crop=document.createElement('canvas');crop.width=256;crop.height=320;
  const ctx=crop.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(canvas,box.x*canvas.width,box.y*canvas.height,box.w*canvas.width,box.h*canvas.height,0,0,256,320);
  const data=ctx.getImageData(0,0,256,320).data;
  const lum=(x,y)=>{const i=(y*256+x)*4;return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2]};
  function region(cx,cy,rx,ry) {
    const points=[];for(let y=Math.max(3,Math.floor((cy-ry)*320));y<Math.min(317,(cy+ry)*320);y++)for(let x=Math.max(3,Math.floor((cx-rx)*256));x<Math.min(253,(cx+rx)*256);x++){
      if(((x/256-cx)/rx)**2+((y/320-cy)/ry)**2>1)continue;
      const i=(y*256+x)*4,Y=lum(x,y);points.push({Y,red:(data[i]-data[i+1])/(data[i]+data[i+1]+1),sat:(Math.max(...data.slice(i,i+3))-Math.min(...data.slice(i,i+3)))/(Math.max(...data.slice(i,i+3))+1),x,y});
    }
    if(!points.length)throw new Error('얼굴 부위를 읽지 못했어요. 다시 촬영해 주세요.');
    const avg=mean(points.map(p=>p.Y));let rough=0,line=0,dark=0,red=0,shine=0,square=0;
    const redAvg=mean(points.map(p=>p.red));
    for(const p of points){const local=(lum(p.x-3,p.y)+lum(p.x+3,p.y)+lum(p.x,p.y-3)+lum(p.x,p.y+3))/4;
      rough+=Math.abs(p.Y-lum(p.x+1,p.y))+Math.abs(p.Y-lum(p.x,p.y+1));
      line+=Math.max(0,Math.abs(lum(p.x,p.y-2)-lum(p.x,p.y+2))-Math.abs(lum(p.x-2,p.y)-lum(p.x+2,p.y))*.4);
      dark+=p.Y<local-10?1:0;red+=p.red>redAvg+.055&&p.Y<local+7?1:0;
      shine+=p.Y>Math.max(avg*1.13,avg+17)&&p.sat<.28?1:0;square+=(p.Y-avg)**2;
    }
    const n=points.length;return {brightness:avg,rough:rough/n/(avg+30)*80,line:line/n/(avg+30)*80,dark:dark/n,red:red/n,redAvg,shine:shine/n,spread:Math.sqrt(square/n)/(avg+30)};
  }
  const cheeks=[region(.24,.55,.105,.13),region(.76,.55,.105,.13)];
  const cheek=Object.fromEntries(Object.keys(cheeks[0]).map(k=>[k,mean(cheeks.map(p=>p[k]))]));
  const forehead=region(.5,.19,.18,.065),noseRegion=region(.5,.49,.055,.09);
  const eyePoints=[landmarks[145],landmarks[374]].map(p=>({x:(p.x-box.x)/box.w,y:(p.y-box.y)/box.h}));
  const under=eyePoints.map(p=>region(p.x,p.y+.07,.085,.035));
  const eye=Object.fromEntries(Object.keys(under[0]).map(k=>[k,mean(under.map(p=>p[k]))]));
  const brightness=mean([cheek.brightness,forehead.brightness]);
  if(brightness<38)throw new Error('얼굴이 너무 어두워요. 밝은 조명에서 다시 촬영해 주세요.');
  if(brightness>238)throw new Error('빛이 너무 강해 피부가 하얗게 보여요. 직접 비추는 조명을 피해 주세요.');
  const contrast=mean([cheek.rough,forehead.rough]);
  const shine=mean([forehead.shine,noseRegion.shine]);
  const eyeShade=clamp((cheek.brightness-eye.brightness)/(cheek.brightness+1));
  const eyeOpen=mean([[159,145,33,133],[386,374,362,263]].map(([a,b,c,d])=>Math.hypot(landmarks[a].x-landmarks[b].x,landmarks[a].y-landmarks[b].y)/Math.hypot(landmarks[c].x-landmarks[d].x,landmarks[c].y-landmarks[d].y)));
  if(eyeOpen<.1)throw new Error('눈을 편안하게 뜨고 다시 촬영해 주세요.');
  const redness=Math.max(0,cheek.redAvg-forehead.redAvg)+cheek.red*.35;
  const lowerShape=Math.abs(landmarks[152].y-landmarks[1].y)/box.h;
  const raw={
    pores:100-cheek.dark*170-cheek.rough*2,
    texture:100-contrast*4,
    acne:100-cheek.red*210-cheek.dark*45,
    oil:100-shine*150,
    wrinkles:100-mean([forehead.line,eye.line])*4,
    moisture:96-contrast*3.2-shine*30,
    bags:98-eye.spread*75-eyeShade*80,
    tear:98-eyeShade*120-eye.line*1.6,
    firmness:98-Math.abs(lowerShape-.40)*110-cheek.line*2,
    upper:98-Math.abs(eyeOpen-.28)*120,
    lower:98-eyeShade*80-eye.line*2,
    spots:100-cheek.dark*140-cheek.spread*60,
    circles:100-eyeShade*170,
    radiance:98-cheek.spread*110-Math.abs(brightness-155)*.12,
    redness:100-redness*280,
  };
  const values=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,score(v)]));
  const zoneDifference=mean([forehead.shine,noseRegion.shine])-cheek.shine;
  const skinType=zoneDifference>.055?'복합성 경향':shine>.13?'유분이 도는 경향':values.moisture<70?'건조해 보이는 경향':'균형 잡혀 보이는 경향';
  return {values,skinType,overall:Math.round(mean(Object.values(values))),quality:Math.abs(cheeks[0].brightness-cheeks[1].brightness)>35?'양쪽 얼굴의 조명 차이가 커요. 결과가 왜곡될 수 있으니 고른 조명에서 재촬영을 권해요.':'정면 얼굴을 확인했어요. 조명·표정에 따라 참고 지수가 달라질 수 있어요.',box,signals:{brightness,contrast,shine,eyeShade}};
}
export async function analyzeCapture(canvas) {
  const model=await loadModel();const prediction=model.detect(canvas);
  if(prediction.faceLandmarks.length===0)throw new Error('얼굴을 찾지 못했어요. 안경과 머리카락을 정리하고 정면으로 다시 촬영해 주세요.');
  if(prediction.faceLandmarks.length>1)throw new Error('한 사람의 얼굴만 화면에 들어오도록 촬영해 주세요.');
  return appearanceReport(canvas,prediction.faceLandmarks[0]);
}

export const metrics=[
  {id:'pores',name:'모공',basis:'볼 부위의 작은 어두운 점과 국소 대비',group:'texture'},
  {id:'texture',name:'피부결',basis:'볼·이마의 인접 픽셀 밝기 차이',group:'texture'},
  {id:'acne',name:'여드름',basis:'볼 부위의 국소 붉은 점 비율. 여드름 병변 판별은 불가',group:'calm'},
  {id:'oil',name:'유분',basis:'코·이마의 밝고 채도가 낮은 광택. 실제 피지량 측정 불가',group:'oil'},
  {id:'wrinkles',name:'주름',basis:'이마·눈 아래의 방향성 명암 경계',group:'moisture'},
  {id:'moisture',name:'수분',basis:'피부결·광택을 이용한 간접 지수. 실제 수분 함량 측정 불가',group:'moisture'},
  {id:'bags',name:'눈 밑 지방',basis:'눈 아래 명암 변화. 지방의 존재·양을 판단하지 못함',group:'eye'},
  {id:'tear',name:'눈물 고랑',basis:'볼 대비 눈 아래의 어두운 정도. 구조적 깊이 측정 불가',group:'eye'},
  {id:'firmness',name:'탄력',basis:'하안면 윤곽 비율과 볼의 명암. 실제 탄력 측정 불가',group:'moisture'},
  {id:'upper',name:'위 눈꺼풀',basis:'눈의 가로·세로 비율. 처짐·안검하수 진단 불가',group:'eye'},
  {id:'lower',name:'아래 눈꺼풀',basis:'눈 아래 명암 경계. 실제 처짐 측정 불가',group:'eye'},
  {id:'spots',name:'잡티',basis:'볼 부위의 국소 어두운 점과 밝기 편차',group:'tone'},
  {id:'circles',name:'다크서클',basis:'볼 대비 눈 아래 밝기 차이',group:'eye'},
  {id:'radiance',name:'광채',basis:'볼 부위 밝기의 균일도. 조명의 영향이 큼',group:'tone'},
  {id:'redness',name:'붉은기',basis:'이마 대비 볼의 붉은 색 비율',group:'calm'},
];
