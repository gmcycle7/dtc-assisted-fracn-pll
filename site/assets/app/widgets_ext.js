/* widgets_ext.js — v3 interactive widgets, built on window.PLL (pll.js + pll_ext.js) + Plotly.
   Mount points (created by page fragments):
     #spur-explorer #pole-zero #lock-transient #evm-demo #dsm-explorer #jitter-hist #budget-optimizer
   Loaded after pll.js, pll_ext.js, plotly.min.js, widgets.js. */
(function () {
  function ready(fn){ document.readyState!=="loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  var P = window.PLL;
  var BG = { paper_bgcolor:"#fff", plot_bgcolor:"#fff" };

  function slider(c, label, min, max, step, val, unit, fmt, cb) {
    var id = "s" + Math.random().toString(36).slice(2, 8);
    var div = document.createElement("div"); div.className = "ctl";
    fmt = fmt || function (v){ return (+v).toFixed(2); };
    div.innerHTML = '<label><span>'+label+'</span><b id="'+id+'v">'+fmt(val)+(unit||"")+'</b></label>'+
      '<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'">';
    c.appendChild(div);
    var inp = div.querySelector("input"), out = div.querySelector("#"+id+"v");
    inp.addEventListener("input", function(){ out.textContent = fmt(inp.value)+(unit||""); cb(+inp.value); });
    return inp;
  }
  function checkbox(c, label, init, cb){
    var l = document.createElement("label"); l.style.cssText="cursor:pointer;font-size:13px";
    l.innerHTML = '<input type="checkbox" '+(init?"checked":"")+'> '+label;
    l.querySelector("input").addEventListener("change", function(e){ cb(e.target.checked); });
    c.appendChild(l);
  }
  function seg(c, opts, init, cb){
    opts.forEach(function(o){
      var b=document.createElement("button"); b.className="btn"+(o.v===init?"":" sec"); b.textContent=o.t;
      b.addEventListener("click", function(){ c.querySelectorAll("button").forEach(function(x){x.className="btn sec";}); b.className="btn"; cb(o.v); });
      c.appendChild(b);
    });
  }
  function scaffold(root){
    var w=document.createElement("div"); w.className="widget";
    var seg_=document.createElement("div"); seg_.className="toggles";
    var ctl=document.createElement("div"); ctl.className="controls";
    var tog=document.createElement("div"); tog.className="toggles";
    var plot=document.createElement("div"); plot.className="plot"; plot.style.height="400px";
    var read=document.createElement("div"); read.className="readout";
    w.appendChild(seg_); w.appendChild(ctl); w.appendChild(tog); w.appendChild(plot); w.appendChild(read);
    root.appendChild(w);
    return {seg:seg_, ctl:ctl, tog:tog, plot:plot, read:read};
  }
  function box(label, val){ return '<div class="b">'+label+' <b>'+val+'</b></div>'; }

  // ============ ① Fractional-spur explorer ============
  function spurExplorer(root){
    var s=scaffold(root); var o={alpha:0.02, g2:0.6, g3:0.1, redux:1, dutyErrPs:0, dutyCal:true, nlc:false};
    function draw(){
      var r=P.spurSpectrum(o);
      Plotly.react(s.plot,[{x:r.freq,y:r.dbc,mode:"lines",line:{color:"#c8442b",width:1}}],
        Object.assign({margin:{t:10,r:10,b:45,l:55},
          xaxis:{type:"log",title:"spur offset frequency [Hz]",gridcolor:"#eee"},
          yaxis:{title:"spur level [dBc]",range:[-130,-30],gridcolor:"#eee"}},BG),
        {displayModeBar:false,responsive:true});
      s.read.innerHTML = box("worst spur", r.maxSpur>-140 ? r.maxSpur.toFixed(1)+" dBc" : "cancelled")+
        box("measured (slide 41)", "&minus;70 to &minus;85 dBc")+
        box("range mode", o.redux===1?"full":o.redux===0.5?"½ (2 phases)":"1/8 (8 phases)");
    }
    slider(s.ctl,"Fractional offset α",0.002,0.49,0.002,o.alpha,"",function(v){return (+v).toFixed(3);},function(v){o.alpha=v;draw();});
    slider(s.ctl,"2nd-order INL g₂",0,1.5,0.05,o.g2," LSB",null,function(v){o.g2=v;draw();});
    slider(s.ctl,"3rd-order INL g₃",0,0.5,0.02,o.g3," LSB",null,function(v){o.g3=v;draw();});
    slider(s.ctl,"VCO duty error Δt",0,40,1,o.dutyErrPs," ps",function(v){return (+v).toFixed(0);},function(v){o.dutyErrPs=v;draw();});
    seg(s.seg,[{t:"full range",v:1},{t:"½ range (2φ)",v:0.5},{t:"1/8 range (8φ)",v:0.125}],1,function(v){o.redux=v;draw();});
    checkbox(s.tog,"DTC NLC (kill INL)",false,function(v){o.nlc=v;draw();});
    checkbox(s.tog,"VCO duty-cycle cal ON",true,function(v){o.dutyCal=v;draw();});
    draw();
  }

  // ============ ② Pole-zero / root locus ============
  function poleZero(root){
    var s=scaffold(root); var p=P.clone(P.DEFAULTS); var gain=1;
    function draw(){
      var d=P.design(p); var wc=2*Math.PI*p.f_c;
      var gains=[]; for(var g=0.1; g<=10.01; g*=1.15) gains.push(g);
      var loci=P.rootLocus(p,d,gains);
      var lx=[],ly=[];
      loci.forEach(function(L){ L.poles.forEach(function(r){ lx.push(r.re/wc); ly.push(r.im/wc); }); });
      var cur=P.closedLoopPoles(p,d,gain);
      var zw=P.loopZetaWn(p,d);
      var traces=[
        {x:lx,y:ly,mode:"markers",name:"locus (gain 0.1–10×)",marker:{color:"#ccc",size:3}},
        {x:cur.map(function(r){return r.re/wc;}),y:cur.map(function(r){return r.im/wc;}),mode:"markers",name:"closed-loop poles",marker:{color:"#c8442b",size:11,symbol:"x"}},
        {x:[-d.wz/wc],y:[0],mode:"markers",name:"zero (wz)",marker:{color:"#1f6feb",size:11,symbol:"circle-open"}},
      ];
      Plotly.react(s.plot,traces,Object.assign({margin:{t:10,r:10,b:45,l:55},
        xaxis:{title:"Re{s}/ω_c",gridcolor:"#eee",zeroline:true,range:[-7,1]},
        yaxis:{title:"Im{s}/ω_c",gridcolor:"#eee",zeroline:true,scaleanchor:"x"},
        legend:{orientation:"h",y:-0.22}},BG),{displayModeBar:false,responsive:true});
      var m=P.loopMetrics(p,d);
      s.read.innerHTML = box("ζ (2nd-order)",zw.zeta.toFixed(2))+box("ω_n",(zw.wn_hz/1e6).toFixed(2)+" MHz")+
        box("peaking",P.peakingDb(p,d).toFixed(2)+" dB")+box("PM",m.pm.toFixed(0)+"°")+
        box("poles",cur.map(function(r){return (r.re/1e6).toFixed(1)+(Math.abs(r.im)>1?("±"+(r.im/1e6).toFixed(1)+"j"):"");}).join(", ")+" Mrad/s");
    }
    slider(s.ctl,"Loop BW f_c",0.3,5,0.05,1.5," MHz",null,function(v){p.f_c=v*1e6;draw();});
    slider(s.ctl,"Phase margin",40,75,1,60,"°",function(v){return (+v).toFixed(0);},function(v){p.pm_deg=v;draw();});
    slider(s.ctl,"Loop-gain ×",0.1,10,0.1,1,"×",null,function(v){gain=v;draw();});
    draw();
  }

  // ============ ③ Lock / transient ============
  function lockTransient(root){
    var s=scaffold(root); var p=P.clone(P.DEFAULTS); var o={type:"phase",df:20};
    function draw(){
      var r=P.stepResponse(p,o.type,o.df*1e6,4000);
      var nshow=Math.min(r.t_us.length,2500);
      Plotly.react(s.plot,[
        {x:r.t_us.slice(0,nshow),y:r.y.slice(0,nshow),mode:"lines",line:{color:"#1f6feb",width:1.4},name:"response"},
        {x:[r.t_us[0],r.t_us[nshow-1]],y:[1,1],mode:"lines",line:{color:"#000",dash:"dash",width:1},name:"target"},
      ],Object.assign({margin:{t:10,r:10,b:45,l:55},
        xaxis:{title:"time [µs]",gridcolor:"#eee"},
        yaxis:{title:o.type==="phase"?"normalized phase":"normalized freq",gridcolor:"#eee"},
        legend:{orientation:"h",y:-0.22}},BG),{displayModeBar:false,responsive:true});
      s.read.innerHTML = box("overshoot",r.overshoot_pct.toFixed(1)+" %")+
        box("1% settling",r.settle_us.toFixed(2)+" µs")+
        box("≈ lock time","~"+(4.6/(2*Math.PI*p.f_c)*1e6/0.5).toFixed(1)+" µs (∝1/f_c)");
    }
    seg(s.seg,[{t:"phase step",v:"phase"},{t:"frequency step",v:"freq"}],"phase",function(v){o.type=v;draw();});
    slider(s.ctl,"Loop BW f_c",0.3,5,0.05,1.5," MHz",null,function(v){p.f_c=v*1e6;draw();});
    slider(s.ctl,"Phase margin",40,75,1,60,"°",function(v){return (+v).toFixed(0);},function(v){p.pm_deg=v;draw();});
    slider(s.ctl,"Freq step (VCO)",1,80,1,o.df," MHz",function(v){return (+v).toFixed(0);},function(v){o.df=v;draw();});
    draw();
  }

  // ============ ④ EVM / constellation ============
  function evmDemo(root){
    var s=scaffold(root); var p=P.clone(P.DEFAULTS); var o={order:256,snr:35};
    function sigmaPhi(){ var d=P.design(p); var b=P.budget(p,d,{dtcOn:true,calOn:true},1e3,100e6);
      // recover sigma_phi from total jitter: sigma_phi = 2*pi*f_out*sigma_t
      return 2*Math.PI*p.f_out*(b.total_fs*1e-15); }
    function draw(){
      var sp=sigmaPhi(); var r=P.evmScatter(sp,o.snr,o.order,700);
      Plotly.react(s.plot,[{x:r.I,y:r.Q,mode:"markers",marker:{color:"#1f6feb",size:3,opacity:0.5}}],
        Object.assign({margin:{t:10,r:10,b:45,l:45},
          xaxis:{title:"I",gridcolor:"#eee",zeroline:true},
          yaxis:{title:"Q",gridcolor:"#eee",zeroline:true,scaleanchor:"x"}},BG),
        {displayModeBar:false,responsive:true});
      s.read.innerHTML = box("σ_φ (from budget)",(sp*1e3).toFixed(2)+" mrad")+
        box("EVM",r.evm_pct.toFixed(2)+" %")+box("phase-noise SNR",(-20*Math.log10(sp)).toFixed(1)+" dB")+
        box("modulation",o.order+"-QAM");
    }
    seg(s.seg,[{t:"16-QAM",v:16},{t:"64-QAM",v:64},{t:"256-QAM",v:256},{t:"1024-QAM",v:1024}],256,function(v){o.order=v;draw();});
    slider(s.ctl,"Loop BW f_c (sets σ_φ)",0.3,5,0.05,1.5," MHz",null,function(v){p.f_c=v*1e6;draw();});
    slider(s.ctl,"VCO PN @1MHz",-126,-108,0.5,-116.5," dBc/Hz",function(v){return (+v).toFixed(1);},function(v){p.vco_dbc_at_1mhz=v;draw();});
    slider(s.ctl,"Additive SNR",20,45,1,o.snr," dB",function(v){return (+v).toFixed(0);},function(v){o.snr=v;draw();});
    draw();
  }

  // ============ ⑤ DSM / MASH explorer ============
  function dsmExplorer(root){
    var s=scaffold(root); s.plot.style.height="540px"; var o={order:2, frac:0.123};
    // moving-average in LINEAR power -> a "shaped floor" trend that exposes the NTF slope
    // while leaving the raw periodogram (with its discrete lines) visible underneath.
    function smooth(db){
      var lin=db.map(function(v){return Math.pow(10,v/10);}), w=11, half=(w-1)/2, out=[];
      for(var i=0;i<lin.length;i++){
        var a=Math.max(0,i-half), b=Math.min(lin.length-1,i+half), sum=0;
        for(var j=a;j<=b;j++) sum+=lin[j];
        out.push(10*Math.log10(sum/(b-a+1)+1e-300));
      }
      return out;
    }
    function draw(){
      var r=P.simMASH(o.frac,o.order,8192);
      var nshow=400;
      var t1={x:Array.from({length:nshow},function(_,i){return i;}),y:r.qe.slice(0,nshow),
        mode:"lines",line:{color:"#c8442b",width:1},name:"Φ_QE[n]",xaxis:"x",yaxis:"y"};
      var praw={x:r.psd.f,y:r.psd.db,mode:"lines",line:{color:"#b8c6d6",width:0.8},
        name:"PSD (raw)",xaxis:"x2",yaxis:"y2",hoverinfo:"skip"};
      var ptr={x:r.psd.f,y:smooth(r.psd.db),mode:"lines",line:{color:"#1f6feb",width:2},
        name:"shaped floor",xaxis:"x2",yaxis:"y2"};
      Plotly.react(s.plot,[t1,praw,ptr],Object.assign({margin:{t:10,r:10,b:44,l:58},
        xaxis:{domain:[0,1],anchor:"y",title:"reference cycle n",gridcolor:"#eee"},
        yaxis:{domain:[0.6,1.0],title:"accum. QE [T_vco]",gridcolor:"#eee"},
        xaxis2:{domain:[0,1],anchor:"y2",type:"log",title:"normalized frequency  f / f_ref  (Nyquist = 0.5)",gridcolor:"#eee"},
        yaxis2:{domain:[0,0.42],title:"modulus PSD [dB]",gridcolor:"#eee"},
        showlegend:false},BG),{displayModeBar:false,responsive:true});
      var ideal=o.order===1?1:o.order===2?2:4;
      s.read.innerHTML = box("MASH order",o.order)+
        box("QE range (p-p)",r.range_pp.toFixed(2)+" T_vco")+
        box("ideal (slide 6)","±"+(ideal/2)+" → "+ideal+" T_vco")+
        box("NTF slope","≈ "+(20*o.order)+" dB/dec (∝ f^"+o.order+")");
    }
    seg(s.seg,[{t:"MASH-1",v:1},{t:"MASH-1-1",v:2},{t:"MASH-1-1-1",v:3}],2,function(v){o.order=v;draw();});
    slider(s.ctl,"Fractional FCW",0.01,0.99,0.01,o.frac,"",function(v){return (+v).toFixed(2);},function(v){o.frac=v;draw();});
    draw();
  }

  // ============ ⑥ Jitter histogram (absolute / period / c2c) ============
  function jitterHist(root){
    var s=scaffold(root); var p=P.clone(P.DEFAULTS);
    function draw(){
      var d=P.design(p); var jd=P.jitterDecompose(p,d);
      var per=jd.per; // fs samples of period error
      Plotly.react(s.plot,[{x:per,type:"histogram",marker:{color:"#1f6feb"},nbinsx:60}],
        Object.assign({margin:{t:10,r:10,b:45,l:55},
          xaxis:{title:"period jitter [fs]",gridcolor:"#eee"},
          yaxis:{title:"count",gridcolor:"#eee"}},BG),{displayModeBar:false,responsive:true});
      s.read.innerHTML = box("absolute (long-term)",jd.abs_fs.toFixed(1)+" fs")+
        box("period",jd.period_fs.toFixed(1)+" fs")+box("cycle-to-cycle",jd.c2c_fs.toFixed(1)+" fs")+
        box("band","1 kHz–"+(jd.band[1]/1e6).toFixed(0)+" MHz");
    }
    slider(s.ctl,"Loop BW f_c",0.3,5,0.05,1.5," MHz",null,function(v){p.f_c=v*1e6;draw();});
    slider(s.ctl,"VCO PN @1MHz",-126,-108,0.5,-116.5," dBc/Hz",function(v){return (+v).toFixed(1);},function(v){p.vco_dbc_at_1mhz=v;draw();});
    draw();
  }

  // ============ ⑦ Budget optimizer (REF-vs-VCO U-curve) ============
  function budgetOptimizer(root){
    var s=scaffold(root); var p=P.clone(P.DEFAULTS); var target=80;
    function draw(){
      var o=P.optimizeBW(p,3e5,5e6,60);
      var fc=o.rows.map(function(r){return r.fc;});
      Plotly.react(s.plot,[
        {x:fc,y:o.rows.map(function(r){return r.total;}),mode:"lines",name:"total",line:{color:"#000",width:2.4}},
        {x:fc,y:o.rows.map(function(r){return r.vco;}),mode:"lines",name:"VCO (↓ with BW)",line:{color:"#d62728"}},
        {x:fc,y:o.rows.map(function(r){return r.refdtc;}),mode:"lines",name:"REF+DTC (↑ with BW)",line:{color:"#1f77b4"}},
        {x:[o.fc_opt,o.fc_opt],y:[0,200],mode:"lines",name:"optimum",line:{color:"#0a8f5b",dash:"dash"}},
      ],Object.assign({margin:{t:10,r:10,b:45,l:55},
        xaxis:{type:"log",title:"loop bandwidth f_c [Hz]",gridcolor:"#eee"},
        yaxis:{title:"RMS jitter [fs]",range:[0,200],gridcolor:"#eee"},
        legend:{orientation:"h",y:-0.22}},BG),{displayModeBar:false,responsive:true});
      s.read.innerHTML = box("optimal f_c",(o.fc_opt/1e6).toFixed(2)+" MHz")+
        box("min jitter",o.min_fs.toFixed(1)+" fs")+
        box("design uses","1.5 MHz → 87.6 fs")+
        box("target",target+" fs "+(o.min_fs<=target?"✓ reachable":"✗ tighten VCO"));
    }
    slider(s.ctl,"VCO PN @1MHz",-126,-108,0.5,-116.5," dBc/Hz",function(v){return (+v).toFixed(1);},function(v){p.vco_dbc_at_1mhz=v;draw();});
    slider(s.ctl,"REF flicker @10kHz",-152,-132,0.5,-143.5," dBc/Hz",function(v){return (+v).toFixed(1);},function(v){p.ref_flicker_dbc=v;draw();});
    slider(s.ctl,"Jitter target",50,150,5,target," fs",function(v){return (+v).toFixed(0);},function(v){target=v;draw();});
    draw();
  }

  // ============ Cal#1: residual gain error ε → in-band jitter floor ============
  function calResidualFloor(root){
    var s=scaffold(root); s.plot.style.height="520px"; var p=P.clone(P.DEFAULTS); var o={eps:1e-3};
    var epsAxis=P.logspace(1e-5,0.3,70);
    function draw(){
      var sweep=epsAxis.map(function(e){return P.residualFloorJitter(p,e);});
      var rf=P.residualFloorSpectrum(p,o.eps), cur=rf.jitter_fs;
      var psd={x:rf.f,y:rf.sphi.map(function(v){return 10*Math.log10(v+1e-300);}),mode:"lines",
        line:{color:"#c8442b",width:1.6},xaxis:"x",yaxis:"y"};
      var jline={x:epsAxis,y:sweep,mode:"lines",line:{color:"#1f6feb",width:2},xaxis:"x2",yaxis:"y2"};
      var budget={x:[1e-5,0.3],y:[87.6,87.6],mode:"lines",line:{color:"#0a8f5b",dash:"dash",width:1.4},xaxis:"x2",yaxis:"y2"};
      var mark={x:[o.eps],y:[cur],mode:"markers",marker:{color:"#1f6feb",size:11},xaxis:"x2",yaxis:"y2"};
      Plotly.react(s.plot,[psd,jline,budget,mark],Object.assign({margin:{t:14,r:10,b:44,l:62},showlegend:false,
        annotations:[{x:Math.log10(0.3),y:Math.log10(87.6),xref:"x2",yref:"y2",xanchor:"right",text:"87.6 fs budget",showarrow:false,font:{size:10,color:"#0a8f5b"}}],
        xaxis:{domain:[0,1],anchor:"y",type:"log",title:"offset frequency [Hz]",gridcolor:"#eee"},
        yaxis:{domain:[0.58,1],title:"leaked residual PSD [dBc/Hz]",gridcolor:"#eee"},
        xaxis2:{domain:[0,1],anchor:"y2",type:"log",title:"residual DTC-gain error ε",gridcolor:"#eee"},
        yaxis2:{domain:[0,0.42],type:"log",title:"added jitter [fs]",gridcolor:"#eee"}},BG),{displayModeBar:false,responsive:true});
      s.read.innerHTML=box("ε",(o.eps*100).toPrecision(2)+" %")+box("added jitter",cur.toFixed(cur<100?1:0)+" fs")+
        box("vs 87.6 fs",(cur/87.6).toFixed(2)+"×")+box("verdict",cur<10?"✓ negligible":cur<87.6?"⚠ significant":"✗ dominates");
    }
    slider(s.ctl,"residual gain error ε",-5,Math.log10(0.3),0.02,Math.log10(o.eps),"",function(v){return Math.pow(10,v).toPrecision(2);},function(v){o.eps=Math.pow(10,v);draw();});
    slider(s.ctl,"DSM order m",1,3,1,p.dsm_order,"",function(v){return (+v).toFixed(0);},function(v){p.dsm_order=v;draw();});
    slider(s.ctl,"loop BW f_c",0.3,5,0.05,p.f_c/1e6," MHz",null,function(v){p.f_c=v*1e6;draw();});
    draw();
  }

  // ============ Cal#4: why the OFFSET cal must converge first (co-adaptation) ============
  function calOffsetRace(root){
    var s=scaffold(root); var o={mode:"concurrent", offset:80, muOff:0.03};
    function draw(){
      var r=P.simOffsetRace({mode:o.mode, offset:o.offset, muOff:o.muOff, n:13000});
      var err=r.Khat.map(function(k){return 100*(k-r.Ktrue)/r.Ktrue;});
      var dec=function(a){var out=[],st=Math.ceil(a.length/700);for(var i=0;i<a.length;i+=st)out.push(a[i]);return out;};
      var t=dec(r.t_us), ke=dec(err), off=dec(r.effOffset.map(function(v){return v/o.offset*25;})); // scale offset trace into view
      var kt={x:t,y:ke,mode:"lines",line:{color:"#c8442b",width:1.8},name:"K_DTC error %"};
      var ot={x:t,y:off,mode:"lines",line:{color:"#9fb3c8",width:1.2,dash:"dot"},name:"residual offset (scaled)"};
      var zero={x:[0,t[t.length-1]],y:[0,0],mode:"lines",line:{color:"#0a8f5b",dash:"dash",width:1},name:"target"};
      Plotly.react(s.plot,[ot,zero,kt],Object.assign({margin:{t:10,r:10,b:44,l:58},
        xaxis:{title:"time [µs]",gridcolor:"#eee"},yaxis:{title:"K_DTC gain error [%]",gridcolor:"#eee",zeroline:false},
        legend:{orientation:"h",y:-0.22},
        shapes:[{type:"line",x0:30,x1:30,y0:0,y1:1,yref:"paper",line:{color:"#aaa",dash:"dot"}}]},BG),{displayModeBar:false,responsive:true});
      var pk=Math.max.apply(null,err);   // peak overshoot toward the wrong (+22.6%) basin
      s.read.innerHTML=box("mode",o.mode)+box("final K_DTC error",r.finalErrPct.toFixed(1)+" %")+
        box("peak overshoot",pk.toFixed(1)+" %")+
        box("note",o.mode==="off"?"locks to +22.6% (80 LSB) ✗":o.mode==="first"?"clean, fast ✓":"humped then recovers ⚠");
    }
    seg(s.seg,[{t:"offset cal OFF",v:"off"},{t:"concurrent",v:"concurrent"},{t:"offset FIRST",v:"first"}],"concurrent",function(v){o.mode=v;draw();});
    slider(s.ctl,"comparator offset",0,150,5,o.offset,"",function(v){return (+v).toFixed(0);},function(v){o.offset=v;draw();});
    slider(s.ctl,"offset-servo speed µ_off",0.01,0.1,0.005,o.muOff,"",function(v){return (+v).toFixed(3);},function(v){o.muOff=v;draw();});
    draw();
  }

  // ============ Cal#7: 4-loop calibration timeline dashboard ============
  function calDashboard(root){
    var s=scaffold(root); var o={scale:1, noise:0.05};
    function sm(a,w){var n=a.length,ps=new Array(n+1);ps[0]=0;for(var i=0;i<n;i++)ps[i+1]=ps[i]+a[i];var h=(w-1)/2,out=new Array(n);for(var j=0;j<n;j++){var lo=Math.max(0,j-h),hi=Math.min(n-1,j+h);out[j]=(ps[hi+1]-ps[lo])/(hi-lo+1);}return out;}
    // robust first-entry settle: time the smoothed loop first reaches & sustains the ±tol band
    function settle(norm,t,tol){var need=Math.floor(norm.length*0.04),run=0;for(var i=0;i<norm.length;i++){if(Math.abs(norm[i]-1)<tol){run++;if(run>=need)return t[i-need+1];}else run=0;}return t[t.length-1];}
    function dec(a){var out=[],st=Math.ceil(a.length/600);for(var i=0;i<a.length;i+=st)out.push(a[i]);return out;}
    function draw(){
      var dtc=P.simDtcGain({mu:0.5*o.scale,compNoise:o.noise*4,initErr:0.10});
      var vco=P.simVcoDcc({mu:0.02*o.scale,noise:o.noise});
      var ck =P.simCkrefDcc({mu:0.02*o.scale,noise:o.noise});
      var off=P.simOffsetCal({muMv:0.09*o.scale,pheNoise:0.005});  // locked-loop PHE jitter (~5 mrad, consistent with the in-band budget)
      var W=401;  // moving-average to read settling through the 1-bit limit-cycle dither (cf. Python _settle_time size=400)
      var nDtc=sm(dtc.Khat.map(function(v){return v/dtc.Ktrue;}),W);
      var nVco=sm(vco.val_ps.map(function(v){return v/vco.target_ps;}),W);
      var nCk =sm(ck.val_ns.map(function(v){return v/ck.target_ns;}),W);
      var nOff=sm(off.vref_mv.map(function(v){return v/off.target_mv;}),W);
      var mk=function(t,y,c,nm){return {x:dec(t),y:dec(y),mode:"lines",line:{color:c,width:1.8},name:nm};};
      Plotly.react(s.plot,[
        mk(off.t_us,nOff,"#7a3fb5","offset (DC servo)"),
        mk(dtc.t_us,nDtc,"#1f77b4","DTC gain"),
        mk(vco.t_us,nVco,"#d62728","VCO duty"),
        mk(ck.t_us,nCk,"#0a8f5b","CKREF duty"),
        {x:[0,30],y:[1,1],mode:"lines",line:{color:"#000",dash:"dash",width:1},name:"target"},
      ],Object.assign({margin:{t:10,r:10,b:44,l:55},
        xaxis:{title:"time [µs]",range:[0,40],gridcolor:"#eee"},
        yaxis:{title:"value / target",range:[-0.2,1.6],gridcolor:"#eee"},
        legend:{orientation:"h",y:-0.22},
        shapes:[{type:"line",x0:30,x1:30,y0:0,y1:1,yref:"paper",line:{color:"#aaa",dash:"dot"}},
                {type:"rect",x0:0,x1:40,y0:0.94,y1:1.06,yref:"y",fillcolor:"#0a8f5b",opacity:0.08,line:{width:0}}]},BG),{displayModeBar:false,responsive:true});
      var sD=settle(nDtc,dtc.t_us,0.05),sV=settle(nVco,vco.t_us,0.05),sC=settle(nCk,ck.t_us,0.05),sO=settle(nOff,off.t_us,0.08);
      var dut=Math.max(sV,sC), worst=Math.max(sD,sO,dut);
      s.read.innerHTML=box("offset",sO.toFixed(1)+" µs"+(sO<30?" ✓":" ✗"))+box("DTC gain",sD.toFixed(1)+" µs"+(sD<30?" ✓":" ✗"))+
        box("VCO/CKREF duty","~"+dut.toFixed(1)+" µs"+(dut<30?" ✓":" ✗"))+box("budget &lt;30 µs",worst<30?"MET ✓":"MISSED ✗");
    }
    slider(s.ctl,"step-size scale ×µ",0.25,4,0.25,o.scale,"×",function(v){return (+v).toFixed(2);},function(v){o.scale=v;draw();});
    slider(s.ctl,"comparator noise",0,0.3,0.01,o.noise,"",null,function(v){o.noise=v;draw();});
    draw();
  }

  // ============ Cal#8: DTC INL before/after NLC (welds INL shape to spur level) ============
  function nlcInl(root){
    var s=scaffold(root); var o={a2:0.18,a3:0.04,g2:0,g3:0,redux:1,alpha:0.02};
    function inl(D,b2,b3){return b2*D*D+b3*D*D*D;}
    function draw(){
      var D=[],before=[],after=[]; for(var i=0;i<=120;i++){var d=-1+2*i/120;D.push(d);before.push(inl(d,o.a2,o.a3));after.push(inl(d,o.a2-o.g2,o.a3-o.g3));}
      var tb={x:D,y:before,mode:"lines",line:{color:"#c8442b",width:2},name:"intrinsic INL"};
      var tn={x:D,y:D.map(function(d){return -inl(d,o.g2,o.g3);}),mode:"lines",line:{color:"#9fb3c8",width:1.2,dash:"dot"},name:"NLC pre-distort"};
      var ta={x:D,y:after,mode:"lines",line:{color:"#1f6feb",width:2},name:"residual (after NLC)"};
      Plotly.react(s.plot,[tn,tb,ta],Object.assign({margin:{t:10,r:10,b:44,l:58},
        xaxis:{title:"normalized DTC code D",gridcolor:"#eee"},yaxis:{title:"delay error [LSB]",gridcolor:"#eee"},
        legend:{orientation:"h",y:-0.22}},BG),{displayModeBar:false,responsive:true});
      var spurBefore=P.spurSpectrum({alpha:o.alpha,g2:o.a2,g3:o.a3,redux:o.redux}).maxSpur;
      var spurAfter =P.spurSpectrum({alpha:o.alpha,g2:o.a2-o.g2,g3:o.a3-o.g3,redux:o.redux}).maxSpur;
      var pkB=Math.max(Math.abs(inl(1,o.a2,o.a3)),Math.abs(inl(-1,o.a2,o.a3)));
      var pkA=Math.max(Math.abs(inl(1,o.a2-o.g2,o.a3-o.g3)),Math.abs(inl(-1,o.a2-o.g2,o.a3-o.g3)));
      s.read.innerHTML=box("peak |INL|",pkB.toFixed(2)+" → "+pkA.toFixed(2)+" LSB")+
        box("worst spur before",spurBefore.toFixed(1)+" dBc")+
        box("worst spur after",spurAfter<-135?"cancelled":spurAfter.toFixed(1)+" dBc")+
        box("match",(Math.abs(o.a2-o.g2)<0.01&&Math.abs(o.a3-o.g3)<0.01)?"g≈a ✓":"residual bend");
    }
    seg(s.seg,[{t:"full range",v:1},{t:"½ range",v:0.5},{t:"⅛ range",v:0.125}],1,function(v){o.redux=v;draw();});
    checkbox(s.tog,"auto-match NLC (g=a)",false,function(c){if(c){o.g2=o.a2;o.g3=o.a3;}else{o.g2=0;o.g3=0;}draw();});
    slider(s.ctl,"intrinsic INL a₂",0,0.4,0.01,o.a2,"",null,function(v){o.a2=v;draw();});
    slider(s.ctl,"intrinsic INL a₃",0,0.2,0.01,o.a3,"",null,function(v){o.a3=v;draw();});
    slider(s.ctl,"NLC g₂",0,0.4,0.01,o.g2,"",null,function(v){o.g2=v;draw();});
    slider(s.ctl,"NLC g₃",0,0.2,0.01,o.g3,"",null,function(v){o.g3=v;draw();});
    draw();
  }

  // ============ Other#1: live slide-42 jitter budget pie ============
  function budgetPie(root){
    var s=scaffold(root); var p=P.clone(P.DEFAULTS); var o={dtcOn:true,calOn:true};
    var COL={VCO:"#d62728",REF:"#1f77b4",DTC:"#2ca02c",MMD:"#ff7f0e",SPD:"#9467bd",DSM:"#8c564b"};
    function draw(){
      var d=P.design(p), b=P.budget(p,d,{dtcOn:o.dtcOn,calOn:o.calOn});
      var labels=b.rows.map(function(r){return r.name;}), vals=b.rows.map(function(r){return Math.max(r.pct,0.001);});
      Plotly.react(s.plot,[{type:"pie",labels:labels,values:vals,hole:0.5,sort:false,
        marker:{colors:labels.map(function(l){return COL[l];})},textinfo:"label+percent",
        texttemplate:"%{label} %{percent}",hovertemplate:"%{label}: %{value:.1f}%<extra></extra>"}],
        Object.assign({margin:{t:10,r:10,b:10,l:10},showlegend:false,
          annotations:[{text:(b.total_fs<1000?b.total_fs.toFixed(1):b.total_fs.toFixed(0))+" fs",x:0.5,y:0.5,font:{size:20},showarrow:false}]},BG),
        {displayModeBar:false,responsive:true});
      s.read.innerHTML=box("total jitter",b.total_fs.toFixed(1)+" fs")+box("IPN",b.ipn.toFixed(1)+" dBc")+
        box("DTC cancels DSM",o.dtcOn?"on":"OFF")+box("cals converged",o.calOn?"yes":"NO");
    }
    checkbox(s.tog,"DTC cancels DSM-QN",true,function(c){o.dtcOn=c;draw();});
    checkbox(s.tog,"calibrations converged",true,function(c){o.calOn=c;draw();});
    draw();
  }

  // ============ Other#5: PM → ζ → overshoot bridge ============
  function pmBridge(root){
    var s=scaffold(root); s.plot.style.height="520px"; var p=P.clone(P.DEFAULTS);
    function draw(){
      var d=P.design(p), f=P.logspace(1e3,1e8,400);
      var mag=f.map(function(ff){return 20*Math.log10(P.cabs(P.openLoop(ff,p,d)));});
      var lm=P.loopMetrics(p,d), zw=P.loopZetaWn(p,d), pk=P.peakingDb(p,d), st=P.stepResponse(p,"phase",0,4000);
      var dec=function(a){var out=[],sp=Math.ceil(a.length/600);for(var i=0;i<a.length;i+=sp)out.push(a[i]);return out;};
      var bode={x:f,y:mag,mode:"lines",line:{color:"#1f77b4",width:2},xaxis:"x",yaxis:"y"};
      var zerodb={x:[f[0],f[f.length-1]],y:[0,0],mode:"lines",line:{color:"#aaa",dash:"dash",width:1},xaxis:"x",yaxis:"y"};
      var step={x:dec(st.t_us),y:dec(st.y),mode:"lines",line:{color:"#c8442b",width:2},xaxis:"x2",yaxis:"y2"};
      var one={x:[0,st.t_us[st.t_us.length-1]],y:[1,1],mode:"lines",line:{color:"#aaa",dash:"dash",width:1},xaxis:"x2",yaxis:"y2"};
      Plotly.react(s.plot,[bode,zerodb,step,one],Object.assign({margin:{t:14,r:10,b:44,l:58},showlegend:false,
        annotations:[{x:Math.log10(lm.f_c),y:0,xref:"x",yref:"y",text:"f_c="+(lm.f_c/1e6).toFixed(2)+" MHz",showarrow:true,arrowhead:0,ay:-26,font:{size:10}}],
        xaxis:{domain:[0,1],anchor:"y",type:"log",title:"frequency [Hz]",gridcolor:"#eee"},
        yaxis:{domain:[0.58,1],title:"open-loop |G| [dB]",range:[-40,80],gridcolor:"#eee"},
        xaxis2:{domain:[0,1],anchor:"y2",title:"time [µs]",range:[0,3],gridcolor:"#eee"},
        yaxis2:{domain:[0,0.42],title:"phase-step resp.",gridcolor:"#eee"}},BG),{displayModeBar:false,responsive:true});
      s.read.innerHTML=box("phase margin",lm.pm.toFixed(0)+"°")+box("ζ (2nd-order)",zw.zeta.toFixed(2))+
        box("peaking",pk.toFixed(2)+" dB")+box("overshoot / settle",st.overshoot_pct.toFixed(0)+"% / "+st.settle_us.toFixed(2)+" µs");
    }
    slider(s.ctl,"phase margin PM",40,75,1,p.pm_deg,"°",function(v){return (+v).toFixed(0);},function(v){p.pm_deg=v;draw();});
    slider(s.ctl,"loop BW f_c",0.5,5,0.05,p.f_c/1e6," MHz",null,function(v){p.f_c=v*1e6;draw();});
    draw();
  }

  // ============ Other#9: DTC range-reduction ledger ============
  function rangeLedger(root){
    var s=scaffold(root); var o={a2:0.6,a3:0.1,alpha:0.02};
    var MODES=[{t:"full",r:1},{t:"½",r:0.5},{t:"⅛",r:0.125}];
    function draw(){
      var spurs=MODES.map(function(m){return P.spurSpectrum({alpha:o.alpha,g2:o.a2,g3:o.a3,redux:m.r}).maxSpur;});
      Plotly.react(s.plot,[{x:MODES.map(function(m){return m.t+" range";}),y:spurs,type:"bar",
        marker:{color:["#d62728","#ff7f0e","#0a8f5b"]},text:spurs.map(function(v){return v.toFixed(0)+" dBc";}),textposition:"outside"}],
        Object.assign({margin:{t:14,r:10,b:40,l:58},
          yaxis:{title:"worst fractional spur [dBc]",range:[Math.min.apply(null,spurs)-12,0],gridcolor:"#eee"},
          xaxis:{gridcolor:"#eee"}},BG),{displayModeBar:false,responsive:true});
      var dB=function(r){return (40*Math.log10(r)).toFixed(0);};   // 2nd-order spur scaling
      s.read.innerHTML=box("full → ½ → ⅛",spurs.map(function(v){return v.toFixed(0);}).join(" → ")+" dBc")+
        box("spur / halving","−12 dB (g₂u²)")+box("DTC power / halving","÷4 (∝DR²)")+box("QN / halving","−6 dB (∝t_res²)");
    }
    slider(s.ctl,"INL g₂",0,1.2,0.05,o.a2,"",null,function(v){o.a2=v;draw();});
    slider(s.ctl,"INL g₃",0,0.4,0.02,o.a3,"",null,function(v){o.a3=v;draw();});
    slider(s.ctl,"fractional offset α",0.005,0.2,0.005,o.alpha,"",function(v){return (+v).toFixed(3);},function(v){o.alpha=v;draw();});
    draw();
  }

  ready(function(){
    if(!window.Plotly||!P){ return; }
    var map={ "spur-explorer":spurExplorer, "pole-zero":poleZero, "lock-transient":lockTransient,
      "evm-demo":evmDemo, "dsm-explorer":dsmExplorer, "jitter-hist":jitterHist, "budget-optimizer":budgetOptimizer,
      "cal-residual-floor":calResidualFloor, "cal-offset-race":calOffsetRace, "cal-dashboard":calDashboard,
      "nlc-inl":nlcInl, "budget-pie":budgetPie, "pm-bridge":pmBridge, "range-ledger":rangeLedger };
    Object.keys(map).forEach(function(id){ var el=document.getElementById(id); if(el) map[id](el); });
  });
})();
