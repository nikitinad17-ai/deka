/* One clock controls tempo, three EQ bands and the crossfader of a Desktop fade. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DekaMixEnvelope=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function at(progress,outRate,outEQ,inRate,inEQ){
    var p=Math.max(0,Math.min(1,progress));
    outEQ=outEQ||[0,0,0];inEQ=inEQ||[-12,-12,-12];
    return {outRate:outRate*(1-2*p/3),inRate:(inRate===undefined?.92:inRate)+(1-(inRate===undefined?.92:inRate))*p,
      outEQ:outEQ.map(function(v){return v+(-12-v)*p;}),inEQ:inEQ.map(function(v){return v*(1-p);}),progress:p};
  }
  return {seconds:17,at:at};
});
