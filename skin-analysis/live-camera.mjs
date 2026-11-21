import {loadModel} from './analyzer.mjs';
import {qualityFromLandmarks,QUALITY_LABELS,CaptureGate,drawCameraFrame} from './capture-quality.mjs';

export class LiveCameraQuality {
  constructor({onCapture,onError}){this.onCapture=onCapture;this.onError=onError;this.sample=document.createElement('canvas');this.gate=new CaptureGate();this.token=0;this.timer=null;this.ready=false;this.lastSample=0;}
  stop(){this.token++;clearTimeout(this.timer);this.timer=null;this.ready=false;this.gate.reset();document.querySelector('#quality-checks').hidden=true;document.querySelector('#capture-countdown').hidden=true;document.querySelector('.face-guide').removeAttribute('data-level');document.querySelector('#capture').disabled=true;}
  canCapture(){return this.ready&&performance.now()-this.lastSample<1000;}
  validate(){if(!this.model||!this.video||!drawCameraFrame(this.video,this.sample))return false;const q=qualityFromLandmarks(this.sample,this.model.detect(this.sample).faceLandmarks);this.render(q,performance.now());return [q.lighting,q.straight,q.position].every(v=>v>0);}
  render(q,now){
    const state=this.gate.update(q,now),autoEnabled=document.querySelector('#auto-capture').checked;
    this.ready=state.ready;this.lastSample=now;
    for(const key of ['lighting','straight','position']){const box=document.querySelector('[data-quality="'+key+'"]');box.dataset.level=q[key];box.querySelector('strong').textContent=QUALITY_LABELS[q[key]];}
    const worst=Math.min(q.lighting,q.straight,q.position);document.querySelector('.face-guide').dataset.level=worst;
    const countdown=document.querySelector('#capture-countdown');countdown.hidden=!(autoEnabled&&state.countdown!==null);countdown.textContent=state.countdown??'';
    const status=document.querySelector('#photo-status');const message=autoEnabled&&state.countdown!==null?'세 항목 모두 좋아요. '+state.countdown+'초 뒤 자동 촬영해요. 움직이면 다시 확인해요.':state.ready?'촬영할 수 있어요. 촬영 버튼을 눌러 주세요.':q.message;
    if(status.textContent!==message)status.textContent=message;
    document.querySelector('#capture').disabled=!state.ready;
    if(!autoEnabled)this.gate.goodSince=null;
    return autoEnabled&&state.auto;
  }
  async start(video){
    this.stop();const ticket=this.token;this.video=video;let lastVideoTime=-1,lastFrameAt=performance.now();
    const checks=document.querySelector('#quality-checks');checks.hidden=false;
    for(const box of checks.children){box.dataset.level='pending';box.querySelector('strong').textContent='확인 중';}
    document.querySelector('#photo-status').textContent='얼굴과 조명을 실시간으로 확인하고 있어요. 처음에는 잠시 걸릴 수 있어요.';
    try{this.model=await loadModel();if(ticket!==this.token)return;
      const tick=()=>{
        if(ticket!==this.token||video.hidden||document.hidden)return;
        try{
          if(video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;lastFrameAt=performance.now();}
          if(video.readyState<2||performance.now()-lastFrameAt>1000){
            this.render({lighting:0,straight:0,position:0,message:'카메라 영상을 기다리고 있어요. 잠시 후 다시 확인해 주세요.'},performance.now());
          }else if(drawCameraFrame(video,this.sample)){
            const q=qualityFromLandmarks(this.sample,this.model.detect(this.sample).faceLandmarks);
            if(this.render(q,performance.now()))this.onCapture();
          }
        }catch(error){this.stop();this.onError(error);return;}
        if(ticket===this.token)this.timer=setTimeout(tick,300);
      };tick();
    }catch(error){if(ticket===this.token){this.stop();this.onError(error);}}
  }
}
