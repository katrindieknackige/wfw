/* global Chart */
(function(){
  // Kein IIFE in eurer Inline-CMS-Regel – hier ist es EXTERN, ok.
  // Wenn ihr auch extern ohne IIFE wollt: kann 1:1 umgebaut werden.

  function safeJsonParse(s, fallback){
    try{ return JSON.parse(s); } catch(e){ return fallback; }
  }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
  function valueToPct(v){ var vv = clamp(v,1,4); return ((vv-1)/3)*100; }

  function uuidv4(){
    // Client nonce (nicht personenbeziehbar)
    var t = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(16)) : null;
    if (!t){
      var r = String(Math.random()).slice(2) + String(Date.now());
      return "nonce-" + r;
    }
    t[6] = (t[6] & 0x0f) | 0x40;
    t[8] = (t[8] & 0x3f) | 0x80;
    var b = Array.prototype.map.call(t, function(x){ return ("00"+x.toString(16)).slice(-2); }).join("");
    return b.slice(0,8)+"-"+b.slice(8,12)+"-"+b.slice(12,16)+"-"+b.slice(16,20)+"-"+b.slice(20);
  }

  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){ reject(new Error("timeout")); }, ms);
      })
    ]);
  }

  function getApiBase(root){
    // Setzt das z.B. als data-Attribut am dpvibe-root:
    // <div id="dpvibe-root" data-api="https://script.google.com/macros/s/.../exec">
    var u = root.getAttribute("data-api") || "";
    return String(u || "").trim();
  }

  function cacheGet(key){
    try{ return safeJsonParse(localStorage.getItem(key), null); } catch(e){ return null; }
  }
  function cacheSet(key, obj){
    try{ localStorage.setItem(key, JSON.stringify(obj)); } catch(e){}
  }

  function computeOrderedItems(aggregate, userAnswers){
    var female = aggregate.female.mean;
    var male = aggregate.male.mean;
    var items = [];
    for (var i=0;i<8;i++){
      var f = Number(female[i] || 0);
      var m = Number(male[i] || 0);
      var d = Math.abs(f - m);
      items.push({ idx:i, diff:d, femaleMean:f, maleMean:m, user:userAnswers[i] });
    }
    items.sort(function(a,b){ return b.diff - a.diff; });
    return items;
  }

  function renderResultsBars(root, aggregate, questions, userAnswers){
    var list = root.querySelector("[data-dpvibe-resultslist]");
    if (!list) return;

    while(list.firstChild){ list.removeChild(list.firstChild); }

    var ordered = computeOrderedItems(aggregate, userAnswers);

    for (var r=0;r<ordered.length;r++){
      (function(item){
        var row = document.createElement("div");
        row.className = "dpvibe-qcard dpvibe-rrow";

        var head = document.createElement("div");
        head.className = "dpvibe-rhead";

        var t = document.createElement("div");
        t.className = "dpvibe-text";
        t.textContent = questions[item.idx] || ("Frage " + (item.idx+1));

        var diff = document.createElement("div");
        diff.className = "dpvibe-diff";
        diff.textContent = "Δ " + item.diff.toFixed(2);

        head.appendChild(t);
        head.appendChild(diff);

        var track = document.createElement("div");
        track.className = "dpvibe-track";

        var ticks = document.createElement("div");
        ticks.className = "dpvibe-ticks";
        for (var k=0;k<4;k++){
          var tk = document.createElement("div");
          tk.className = "dpvibe-tick";
          ticks.appendChild(tk);
        }
        track.appendChild(ticks);

        var b = document.createElement("div");
        b.className = "dpvibe-bracket";
        var left = valueToPct(Math.min(item.femaleMean, item.maleMean));
        var right = valueToPct(Math.max(item.femaleMean, item.maleMean));
        b.style.left = left.toFixed(2) + "%";
        b.style.width = Math.max(0, (right-left)).toFixed(2) + "%";
        track.appendChild(b);

        var mf = document.createElement("div");
        mf.className = "dpvibe-marker dpvibe-marker-female";
        mf.style.left = valueToPct(item.femaleMean).toFixed(2) + "%";
        mf.setAttribute("title", "Frauen: " + item.femaleMean.toFixed(2));
        track.appendChild(mf);

        var mm = document.createElement("div");
        mm.className = "dpvibe-marker dpvibe-marker-male";
        mm.style.left = valueToPct(item.maleMean).toFixed(2) + "%";
        mm.setAttribute("title", "Männer: " + item.maleMean.toFixed(2));
        track.appendChild(mm);

        var mu = document.createElement("div");
        mu.className = "dpvibe-marker dpvibe-marker-user";
        mu.style.left = valueToPct(item.user).toFixed(2) + "%";
        mu.setAttribute("title", "Sie: " + item.user);
        track.appendChild(mu);

        var tl = document.createElement("div");
        tl.className = "dpvibe-tracklabels dpvibe-ui dpvibe-subtle";
        var a = document.createElement("div"); a.textContent = "1";
        var c = document.createElement("div"); c.textContent = "4";
        tl.appendChild(a); tl.appendChild(c);

        row.appendChild(head);
        row.appendChild(track);
        row.appendChild(tl);

        list.appendChild(row);
      })(ordered[r]);
    }
  }

  function ensureRadar(root, questions, aggregate, userAnswers){
    var canvas = root.querySelector("[data-dpvibe-radar]");
    var fallback = root.querySelector("[data-dpvibe-radarfallback]");
    if (!canvas) return null;

    if (typeof Chart === "undefined"){
      if (fallback){ fallback.classList.remove("dpvibe-hidden"); fallback.textContent = "Radar-Chart nicht verfügbar."; }
      return null;
    }
    if (fallback){ fallback.classList.add("dpvibe-hidden"); }

    var ctx = canvas.getContext("2d");

    // Farben: primitive (dekorativ) + alpha via rgba
    var cFemale = "rgba(64,109,184,0.28)"; // fallback: var(--color-blue-vh06-c4)
    var cMale   = "rgba(184,74,74,0.24)";
    var cUser   = "rgba(45,140,90,0.22)";

    var chart = new Chart(ctx, {
      type: "radar",
      data: {
        labels: questions.map(function(q, i){ return "F" + (i+1); }),
        datasets: [
          { label: "Männer-Erwartung", data: aggregate.male.mean.slice(), backgroundColor: cMale, borderColor: "rgba(184,74,74,0.65)", pointRadius: 2, borderWidth: 2 },
          { label: "Frauen-Durchschnitt", data: aggregate.female.mean.slice(), backgroundColor: cFemale, borderColor: "rgba(64,109,184,0.75)", pointRadius: 2, borderWidth: 2 },
          { label: "Ihre Antwort", data: userAnswers.slice(), backgroundColor: cUser, borderColor: "rgba(45,140,90,0.75)", pointRadius: 3, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: function(items){
                var idx = items && items[0] ? items[0].dataIndex : 0;
                return questions[idx] || ("Frage " + (idx+1));
              }
            }
          }
        },
        scales: {
          r: {
            min: 1,
            max: 4,
            ticks: { stepSize: 1, showLabelBackdrop: false },
            angleLines: { display: true },
            grid: { display: true }
          }
        }
      }
    });

    return chart;
  }

  function buildPngFromShareCard(root, chart){
    // Primär: Chart canvas -> PNG. (share card ist im Embed schon „gerahmt“)
    // Optional: Ihr könnt später html2canvas ergänzen, wenn erlaubt.
    if (!chart || !chart.toBase64Image) return null;
    return chart.toBase64Image("image/png", 1);
  }

  async function webShareOrFallback(root, dataUrl){
    var shareBtn = root.querySelector("[data-dpvibe-share]");
    var hint = root.querySelector("[data-dpvibe-sharehint]");
    if (!dataUrl) return;

    if (navigator.share && navigator.canShare){
      try{
        var res = await fetch(dataUrl);
        var blob = await res.blob();
        var file = new File([blob], "wunsch-wirklichkeit.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })){
          await navigator.share({ files: [file], title: "Wunsch & Wirklichkeit" });
          return;
        }
      } catch(e){}
    }

    // Fallback: Link kopieren (nur wenn ihr eine URL habt) – hier: keine.
    if (shareBtn) shareBtn.disabled = true;
    if (hint) hint.textContent = "Teilen ist hier nicht verfügbar. Bitte Grafik speichern.";
  }

  async function fetchQuestions(apiBase, version){
    var url = apiBase.replace(/\/$/, "") + "?path=questions&version=" + encodeURIComponent(version);
    var res = await withTimeout(fetch(url, { method: "GET", credentials: "omit" }), 4000);
    if (!res.ok) throw new Error("questions http " + res.status);
    return await res.json();
  }

  async function fetchAggregate(apiBase, version){
    var url = apiBase.replace(/\/$/, "") + "?path=aggregate&version=" + encodeURIComponent(version);
    var res = await withTimeout(fetch(url, { method: "GET", credentials: "omit" }), 4000);
    if (!res.ok) throw new Error("aggregate http " + res.status);
    return await res.json();
  }

  async function postSubmit(apiBase, payload){
    var url = apiBase.replace(/\/$/, "") + "?path=submit";
    var res = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit"
    }), 5000);
    if (!res.ok) throw new Error("submit http " + res.status);
    return await res.json();
  }

  // Entry point called from inline snippet
  window.dpvibeQuizInit = function(root, cfg){
    var apiBase = getApiBase(root);
    var version = (cfg && cfg.version) ? cfg.version : 1;

    if (!apiBase){
      // Kein API-Base gesetzt -> Inline-Fallback bleibt aktiv
      return;
    }

    var liveHint = root.querySelector("[data-dpvibe-livehint]");
    var stamp = root.querySelector("[data-dpvibe-stamp]");
    var radarFallback = root.querySelector("[data-dpvibe-radarfallback]");
    var downloadBtn = root.querySelector("[data-dpvibe-download]");
    var shareBtn = root.querySelector("[data-dpvibe-share]");

    // User State aus DOM ableiten (aus dem Inline-Flow)
    // Wir lesen gender + answers aus den aktivierten Buttons.
    // (Das Inline-Snippet hält STATE intern; deshalb DOM-Scan als robuste Brücke.)
    var gender = null;
    // gender steht nicht im results DOM; wir nehmen localStorage state, falls vorhanden
    var lsState = cacheGet("dpvibe_quiz_state_v" + version) || null;
    if (lsState && lsState.gender) gender = lsState.gender;

    var answers = [];
    var qCards = root.querySelectorAll("[data-dpvibe-form] .dpvibe-qcard");
    if (qCards && qCards.length === 8){
      for (var i=0;i<8;i++){
        var active = qCards[i].querySelector('.dpvibe-scaleBtn[data-active="1"]');
        answers.push(active ? Number(active.textContent) : null);
      }
    } else if (lsState && lsState.answers && lsState.answers.length === 8){
      answers = lsState.answers.slice();
    }

    // duration: best effort
    var startedAt = (lsState && lsState.startedAt) ? Number(lsState.startedAt) : 0;
    var durationMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;

    // honeypot
    var hp = root.querySelector("[data-dpvibe-honeypot]");
    if (hp && String(hp.value||"").trim() !== ""){
      return; // bot-like; inline already handled messaging
    }

    // Cache keys
    var kAgg = "dpvibe_quiz_agg_v" + version;
    var kQ = "dpvibe_quiz_questions_v" + version;
    var kNonce = "dpvibe_quiz_nonce_v" + version;
    var kLastSubmit = "dpvibe_quiz_lastsubmit_v" + version;

    // nonce for dedupe
    var clientNonce = cacheGet(kNonce);
    if (!clientNonce){
      clientNonce = uuidv4();
      cacheSet(kNonce, clientNonce);
    }

    // store state for later (share reload etc.)
    cacheSet("dpvibe_quiz_state_v" + version, { gender: gender, answers: answers, startedAt: startedAt });

    // Parallel: submit + live fetch + render
    (async function(){
      // 1) Try live data (fallback to cache)
      var questions = (cacheGet(kQ) && cacheGet(kQ).questions) ? cacheGet(kQ).questions : null;
      var aggregate = cacheGet(kAgg);

      var liveOk = true;

      try{
        var qRes = await fetchQuestions(apiBase, version);
        if (qRes && qRes.questions && qRes.questions.length === 8){
          questions = qRes.questions;
          cacheSet(kQ, qRes);
        }
      } catch(e){ /* keep cached */ }

      try{
        var aRes = await fetchAggregate(apiBase, version);
        if (aRes && aRes.female && aRes.male){
          aggregate = aRes;
          cacheSet(kAgg, aRes);
        } else {
          liveOk = false;
        }
      } catch(e){
        liveOk = false;
      }

      if (!questions){
        // If nothing cached, keep minimal labels
        questions = ["Frage 1","Frage 2","Frage 3","Frage 4","Frage 5","Frage 6","Frage 7","Frage 8"];
      }
      if (!aggregate){
        liveOk = false;
        aggregate = { female:{ mean:[3,3,3,3,3,3,3,3], count:0 }, male:{ mean:[3,3,3,3,3,3,3,3], count:0 }, nTotal:0, lastUpdated:"" };
      }

      if (liveHint){
        if (liveOk){ liveHint.classList.add("dpvibe-hidden"); }
        else { liveHint.classList.remove("dpvibe-hidden"); }
      }
      if (stamp){
        var stampText = aggregate.lastUpdated ? ("Stand: " + String(aggregate.lastUpdated).slice(0,10)) : ("Stand: " + (new Date()).toLocaleDateString());
        stamp.textContent = stampText;
      }

      // 2) Re-render bars sorted by diff
      renderResultsBars(root, aggregate, questions, answers);

      // 3) Radar chart
      if (radarFallback){ radarFallback.classList.remove("dpvibe-hidden"); radarFallback.textContent = "Radar-Chart wird geladen …"; }
      var chart = ensureRadar(root, questions, aggregate, answers);

      // 4) Enable download/share (PNG)
      var dataUrl = null;
      if (chart){
        dataUrl = buildPngFromShareCard(root, chart);
      }
      if (downloadBtn){
        downloadBtn.disabled = !dataUrl;
        downloadBtn.onclick = function(){
          if (!dataUrl) return;
          var a = document.createElement("a");
          a.href = dataUrl;
          a.download = "wunsch-wirklichkeit.png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };
      }
      if (shareBtn){
        shareBtn.disabled = !dataUrl;
        shareBtn.onclick = function(){
          webShareOrFallback(root, dataUrl);
        };
      }

      // 5) Submit in parallel (dedupe)
      // Prevent repeat submit on reload within this session
      var last = cacheGet(kLastSubmit);
      if (last && last.clientNonce === clientNonce && last.version === version){
        return;
      }

      if (!gender){
        // wenn gender nicht rekonstruierbar ist, submit weglassen
        return;
      }

      var payload = {
        gender: gender,
        answers: answers,
        durationMs: durationMs,
        clientNonce: clientNonce,
        version: version,
        website: "" // honeypot mirror
      };

      try{
        var submitRes = await postSubmit(apiBase, payload);
        cacheSet(kLastSubmit, { clientNonce: clientNonce, version: version, ok: true, at: Date.now(), res: submitRes });
      } catch(e){
        // kein Blocking: Auswertung ist bereits sichtbar
        cacheSet(kLastSubmit, { clientNonce: clientNonce, version: version, ok: false, at: Date.now() });
      }
    })();
  };
})();