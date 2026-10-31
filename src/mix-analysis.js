/* Bounded, local-only rhythm/loudness analysis for the Desktop automatic transition. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(null);
  else root.DekaMixAnalysis=factory(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(win){
  'use strict';
  function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
  function analyzePCM(data,sampleRate){
    var hop=Math.max(64,Math.round(sampleRate/50)), envelope=[], bands=[0,0,0], square=0,peak=0,lo=0,hi=0,count=0;
    var al=1-Math.exp(-2*Math.PI*180/sampleRate),ah=1-Math.exp(-2*Math.PI*2500/sampleRate),block=0;
    // At most the first two minutes; no PCM is retained after analysis.
    var max=Math.min(data.length,Math.round(sampleRate*120));
    for(var i=0;i<max;i++){
      var x=data[i];lo+=al*(x-lo);hi+=ah*(x-hi);
      var low=lo,mid=hi-lo,high=x-hi;
      bands[0]+=low*low;bands[1]+=mid*mid;bands[2]+=high*high;square+=x*x;peak=Math.max(peak,Math.abs(x));
      block+=low*low+.3*mid*mid;count++;
      if(count===hop){envelope.push(Math.sqrt(block/hop));count=0;block=0;}
    }
    var rms=Math.sqrt(square/Math.max(1,max));bands=bands.map(function(v){return v/Math.max(1,max);});
    var flux=[],slow=0;
    for(i=0;i<envelope.length;i++){slow=.9*slow+.1*envelope[i];flux.push(Math.max(0,envelope[i]-slow));}
    var stable=envelope.slice(Math.min(50,Math.floor(envelope.length/4))),mean=stable.reduce(function(a,b){return a+b;},0)/Math.max(1,stable.length);
    var variance=stable.reduce(function(a,b){return a+(b-mean)*(b-mean);},0)/Math.max(1,stable.length),variation=Math.sqrt(variance)/Math.max(1e-9,mean);
    var sum=flux.reduce(function(s,v){return s+v*v;},0),fps=sampleRate/hop,best=null;
    if(rms>.0005&&variation>.08&&sum>1e-7&&envelope.length>150){
      var scores=[];
      for(var lag=Math.floor(fps*60/180);lag<=Math.ceil(fps*60/70);lag++){
        var cross=0,left=0,right=0;
        for(i=lag;i<flux.length;i++){cross+=flux[i]*flux[i-lag];left+=flux[i]*flux[i];right+=flux[i-lag]*flux[i-lag];}
        var correlation=cross/Math.sqrt(Math.max(1e-20,left*right)),bpm=60*fps/lag;
        // Prefer a musically plausible main beat over an equally strong half-time alias.
        var prior=1-.08*Math.abs(Math.log2(bpm/120));
        scores.push({lag:lag,score:correlation*prior,correlation:correlation});
      }
      best=scores.reduce(function(a,b){return !a||b.score>a.score?b:a;},null);
      if(best&&best.correlation>.32){
        var lag0=best.lag,idx=scores.indexOf(best),l=scores[idx-1],r=scores[idx+1],refine=0;
        if(l&&r){var den=l.score-2*best.score+r.score;if(Math.abs(den)>1e-9)refine=clamp(.5*(l.score-r.score)/den,-.5,.5);}
        var bpm0=60*fps/(lag0+refine),period=60/bpm0,energyByPhase=new Float64Array(100);
        for(i=0;i<flux.length;i++){var phase=Math.round(((i*hop/sampleRate)%period)/period*100)%100;energyByPhase[phase]+=flux[i];}
        var phaseIndex=0;for(i=1;i<100;i++)if(energyByPhase[i]>energyByPhase[phaseIndex])phaseIndex=i;
        return {bpm:Math.round(bpm0*10)/10,confidence:clamp(best.correlation,0,1),beatOffset:phaseIndex/100*period,rms:rms,peak:peak,bands:bands};
      }
    }
    return {bpm:null,confidence:0,beatOffset:0,rms:rms,peak:peak,bands:bands};
  }
  function plan(a,b,outRate){
    var rate=1,matched=false,target=a&&a.bpm?a.bpm*outRate:null;
    if(target&&b&&b.bpm&&a.confidence>.32&&b.confidence>.32){
      var candidates=[b.bpm/2,b.bpm,b.bpm*2],best=candidates.reduce(function(x,y){return Math.abs(Math.log(target/y))<Math.abs(Math.log(target/x))?y:x;});
      var wanted=target/best;
      rate=clamp(wanted,.92,1.08);matched=wanted>=.92&&wanted<=1.08;
    }
    var gain=a&&b&&b.rms>.0005?clamp(a.rms/b.rms,.35,1.5):1;
    var eq=[0,0,0];
    if(a&&b&&a.rms>.0005&&b.rms>.0005)eq=eq.map(function(_,i){
      return clamp(10*Math.log10(Math.max(1e-10,a.bands[i]/(a.rms*a.rms))/Math.max(1e-10,b.bands[i]/(b.rms*b.rms))),-3,3);
    });
    return {rate:rate,matched:matched,gain:gain,eq:eq,targetBPM:target};
  }
  function create(){
    var cache=new Map(),tail=Promise.resolve();
    function analyze(track,duration){
      if(!track||track.kind!=='file'||duration<=0||duration>1200||track.size>100*1024*1024)return Promise.resolve(null);
      if(cache.has(track.url))return cache.get(track.url);
      var result=tail.catch(function(){}).then(async function(){
        if(!cache.has(track.url))return null;
        var bytes=track.file?await track.file.arrayBuffer():await (await win.fetch(track.url)).arrayBuffer();
        var ctx=new (win.OfflineAudioContext||win.webkitOfflineAudioContext)(1,1,12000);
        var buffer=await ctx.decodeAudioData(bytes),channels=buffer.numberOfChannels,length=buffer.length;
        if(length*channels*4>128*1024*1024)throw Error('Трек слишком длинный для анализа');
        var mono=new Float32Array(Math.min(length,12000*120));
        for(var ch=0;ch<channels;ch++){var data=buffer.getChannelData(ch);for(var i=0;i<mono.length;i++)mono[i]+=data[i]/channels;}
        return analyzePCM(mono,buffer.sampleRate);
      }).catch(function(){return null;});
      tail=result;cache.set(track.url,result);
      while(cache.size>6)cache.delete(cache.keys().next().value);
      return result;
    }
    return {analyze:analyze,plan:plan,clear:function(){cache.clear();}};
  }
  return {analyzePCM:analyzePCM,plan:plan,create:create};
});
