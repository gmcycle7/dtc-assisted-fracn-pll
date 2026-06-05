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
    var s=scaffold(root); var o={order:2, frac:0.123};
    function draw(){
      var r=P.simMASH(o.frac,o.order,8192);
      var nshow=400;
      var t1={x:Array.from({length:nshow},function(_,i){return i;}),y:r.qe.slice(0,nshow),mode:"lines",line:{color:"#c8442b",width:1},name:"Φ_QE[n] (cycles)"};
      Plotly.react(s.plot,[t1],Object.assign({margin:{t:10,r:10,b:45,l:55},
        xaxis:{title:"reference cycle n",gridcolor:"#eee"},
        yaxis:{title:"accumulated QE [T_vco]",gridcolor:"#eee"}},BG),{displayModeBar:false,responsive:true});
      var ideal=o.order===1?1:o.order===2?2:4;
      s.read.innerHTML = box("MASH order",o.order)+
        box("QE range (p-p)",r.range_pp.toFixed(2)+" T_vco")+
        box("ideal (slide 6)","±"+(ideal/2)+" → "+ideal+" T_vco")+
        box("DTC must span","this range");
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

  ready(function(){
    if(!window.Plotly||!P){ return; }
    var map={ "spur-explorer":spurExplorer, "pole-zero":poleZero, "lock-transient":lockTransient,
      "evm-demo":evmDemo, "dsm-explorer":dsmExplorer, "jitter-hist":jitterHist, "budget-optimizer":budgetOptimizer };
    Object.keys(map).forEach(function(id){ var el=document.getElementById(id); if(el) map[id](el); });
  });
})();
