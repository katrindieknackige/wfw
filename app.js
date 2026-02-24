// Cue-stabile Komplettversion

(function(){

function ready(fn){
  if(document.readyState !== "loading"){ fn(); }
  else document.addEventListener("DOMContentLoaded", fn);
}

ready(function(){

  const root = document.getElementById("dpvibe-root");
  if(!root) return;

  const API = root.dataset.api;
  const VERSION = 1;

  const QUESTIONS = [
    "dass Männer öfter über ihre Gefühle sprechen",
    "dass Männer mir die Tür aufhalten",
    "dass Männer öfter und länger in Karenz gehen",
    "dass Männer für die finanzielle Sicherheit der Familie sorgen",
    "dass Männer sexistische Witze offen kritisieren",
    "dass Männer beim ersten Date die Rechnung zahlen",
    "dass Männer über 'Frauenthemen' Bescheid wissen",
    "dass Männer sich aktiv für Gleichberechtigung einsetzen"
  ];

  let state = {
    gender:null,
    answers:new Array(8).fill(null),
    startTime:0,
    aggregate:null
  };

  function renderIntro(){
    root.innerHTML = `
      <div style="font-family:sans-serif">
        <h2>8 kurze Fragen</h2>
        <p>Danach sehen Sie Ihre Antworten im Vergleich.</p>
        <button id="g-female">Ich bin eine Frau</button>
        <button id="g-male">Ich bin ein Mann</button>
      </div>
    `;

    document.getElementById("g-female").onclick = ()=>start("female");
    document.getElementById("g-male").onclick = ()=>start("male");
  }

  function start(g){
    state.gender = g;
    state.startTime = Date.now();
    renderForm();
  }

  function renderForm(){
    let html = `<div style="font-family:sans-serif"><h3>Fragen</h3>`;
    QUESTIONS.forEach((q,i)=>{
      html+=`
        <div style="margin-bottom:15px">
          <div>${i+1}. ${q}</div>
          ${[1,2,3,4].map(v=>
            `<button data-q="${i}" data-v="${v}">${v}</button>`
          ).join("")}
        </div>
      `;
    });
    html+=`<button id="submitBtn" disabled>Auswerten</button></div>`;
    root.innerHTML = html;

    root.querySelectorAll("button[data-q]").forEach(btn=>{
      btn.onclick = ()=>{
        const q = +btn.dataset.q;
        const v = +btn.dataset.v;
        state.answers[q]=v;
        updateButtons();
      };
    });

    document.getElementById("submitBtn").onclick = submit;
  }

  function updateButtons(){
    root.querySelectorAll("button[data-q]").forEach(btn=>{
      const q=+btn.dataset.q;
      const v=+btn.dataset.v;
      btn.style.background = state.answers[q]===v ? "#ddd":"";
    });

    const done = state.answers.every(a=>a!==null);
    document.getElementById("submitBtn").disabled = !done;
  }

  async function submit(){
    const duration = Date.now()-state.startTime;

    fetch(API+"?path=submit",{
      method:"POST",
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        gender:state.gender,
        answers:state.answers,
        durationMs:duration,
        clientNonce:crypto.randomUUID(),
        version:VERSION
      })
    }).catch(()=>{});

    const res = await fetch(API+"?path=aggregate&version=1");
    state.aggregate = await res.json();

    renderResults();
  }

  function renderResults(){
    const agg = state.aggregate;
    const female = agg.female.mean;
    const male = agg.male.mean;

    const items = QUESTIONS.map((q,i)=>({
      q,i,
      f:female[i],
      m:male[i],
      diff:Math.abs(female[i]-male[i])
    })).sort((a,b)=>b.diff-a.diff);

    let html = `<div style="font-family:sans-serif">
      <h3>Wunsch & Wirklichkeit</h3>
      <canvas id="radar"></canvas>
    `;

    items.forEach(item=>{
      html+=`
        <div style="margin:10px 0">
          <div>${item.q}</div>
          <div>Δ ${item.diff.toFixed(2)}</div>
        </div>
      `;
    });

    html+=`</div>`;
    root.innerHTML = html;

    new Chart(document.getElementById("radar"),{
      type:"radar",
      data:{
        labels:QUESTIONS.map((_,i)=>"F"+(i+1)),
        datasets:[
          {label:"Männer",data:male},
          {label:"Frauen",data:female},
          {label:"Sie",data:state.answers}
        ]
      },
      options:{scales:{r:{min:1,max:4}}}
    });
  }

  renderIntro();

});

})();
