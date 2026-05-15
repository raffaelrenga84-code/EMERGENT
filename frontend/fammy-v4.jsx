import { useState } from "react";

const SCREENS = {
  ONBOARDING:"ob", LOGIN:"login", WELCOME:"welcome", HOME:"home",
  TASK_DETAIL:"td", FAMILY:"fam", MEMBER:"mem",
  AGENDA:"agenda", SPESE:"spese", BETA:"beta", PROFILE:"profile",
};

// ── I18N (Welcome Hub) ──
const T = {
  it:{
    hi:"Ciao, Raffael 👋", welcome_h:"Da dove iniziamo?",
    welcome_s:"Scegli cosa fare per primo. Puoi sempre cambiare idea.",
    a_card1_t:"Crea la tua famiglia", a_card1_s:"Aggiungi i membri e invitali",
    a_card2_t:"Aggiungi un incarico", a_card2_s:"Da fare, da pagare, da ricordare",
    a_card3_t:"Crea un evento",       a_card3_s:"Medico, cena, compleanno…",
    a_card4_t:"Dai un'occhiata prima",a_card4_s:"Vedi com'è fatta l'app",
    tut_q:"Non sai da dove iniziare?", tut_btn:"🧭 Fai il tour guidato",
    skip_later:"Decido dopo →",
    d_step:"Passo", d_of:"di",
    d_s1_h:"Come si chiama la tua famiglia?", d_s1_s:"Potrai averne anche più di una. Esempi: Famiglia Rossi, Casa al mare.", d_s1_ph:"es. Famiglia Renga",
    d_s2_h:"Chi ne fa parte?", d_s2_s:"Aggiungi una persona per iniziare. Potrai invitarla dopo.", d_s2_ph:"Nome (es. Maria)", d_s2_rel:"Relazione",
    d_s3_h:"Qual è la prima cosa da coordinare?", d_s3_s:"Un incarico concreto. È meglio di mille chat.", d_s3_ph:"es. Portare nonno dal medico",
    d_next:"Avanti →", d_back:"← Indietro", d_finish:"✓ Entra in FAMMY", d_skip_all:"Salta il tour", d_close:"Chiudi",
    done_h:"Tutto pronto!", done_s:"Ecco la tua bacheca — abbiamo aggiunto la famiglia e il primo incarico.",
    done_cta:"Vai alla bacheca →", done_restart:"↻ Rivedi il flusso",
    rels:["nonna","nonno","mamma","papà","figlio","figlia","fratello","sorella"],
  },
  en:{
    hi:"Hi, Raffael 👋", welcome_h:"Where do we start?",
    welcome_s:"Pick what to do first. You can always change your mind.",
    a_card1_t:"Set up your family", a_card1_s:"Add members and invite them",
    a_card2_t:"Add a task",         a_card2_s:"To do, to pay, to remember",
    a_card3_t:"Create an event",    a_card3_s:"Doctor, dinner, birthday…",
    a_card4_t:"Take a look first",  a_card4_s:"See how the app works",
    tut_q:"Not sure where to start?", tut_btn:"🧭 Take the guided tour",
    skip_later:"Decide later →",
    d_step:"Step", d_of:"of",
    d_s1_h:"What's your family called?", d_s1_s:"You can have more than one later. Examples: Smith Family, Beach House.", d_s1_ph:"e.g. Smith Family",
    d_s2_h:"Who's in it?", d_s2_s:"Add one person to start. You can invite them later.", d_s2_ph:"Name (e.g. Mary)", d_s2_rel:"Relationship",
    d_s3_h:"What's the first thing to coordinate?", d_s3_s:"A concrete task. Better than a thousand chats.", d_s3_ph:"e.g. Take grandpa to the doctor",
    d_next:"Next →", d_back:"← Back", d_finish:"✓ Enter FAMMY", d_skip_all:"Skip the tour", d_close:"Close",
    done_h:"All set!", done_s:"Here's your board — we added the family and the first task.",
    done_cta:"Go to the board →", done_restart:"↻ Replay the flow",
    rels:["grandma","grandpa","mom","dad","son","daughter","brother","sister"],
  },
  fr:{
    hi:"Salut, Raffael 👋", welcome_h:"Par où commencer ?",
    welcome_s:"Choisis par quoi commencer. Tu peux toujours changer d'avis.",
    a_card1_t:"Crée ta famille", a_card1_s:"Ajoute les membres et invite-les",
    a_card2_t:"Ajoute une tâche", a_card2_s:"À faire, à payer, à retenir",
    a_card3_t:"Crée un événement", a_card3_s:"Médecin, dîner, anniversaire…",
    a_card4_t:"Jette un œil d'abord", a_card4_s:"Vois comment l'app marche",
    tut_q:"Tu ne sais pas par où commencer ?", tut_btn:"🧭 Fais la visite guidée",
    skip_later:"Je décide plus tard →",
    d_step:"Étape", d_of:"sur",
    d_s1_h:"Comment s'appelle ta famille ?", d_s1_s:"Tu pourras en avoir plusieurs. Exemples : Famille Dupont, Maison de vacances.", d_s1_ph:"ex. Famille Dupont",
    d_s2_h:"Qui en fait partie ?", d_s2_s:"Ajoute une personne pour commencer. Tu pourras l'inviter plus tard.", d_s2_ph:"Nom (ex. Marie)", d_s2_rel:"Relation",
    d_s3_h:"Quelle est la première chose à coordonner ?", d_s3_s:"Une tâche concrète. Mieux que mille chats.", d_s3_ph:"ex. Emmener grand-père chez le médecin",
    d_next:"Suivant →", d_back:"← Retour", d_finish:"✓ Entrer dans FAMMY", d_skip_all:"Passer la visite", d_close:"Fermer",
    done_h:"Tout est prêt !", done_s:"Voici ton tableau — on a ajouté la famille et la première tâche.",
    done_cta:"Aller au tableau →", done_restart:"↻ Revoir le flux",
    rels:["grand-mère","grand-père","maman","papa","fils","fille","frère","sœur"],
  },
  de:{
    hi:"Hallo, Raffael 👋", welcome_h:"Wo fangen wir an?",
    welcome_s:"Wähle, womit du anfängst. Du kannst es jederzeit ändern.",
    a_card1_t:"Familie einrichten", a_card1_s:"Mitglieder hinzufügen und einladen",
    a_card2_t:"Aufgabe hinzufügen", a_card2_s:"Zu erledigen, zu zahlen, zu merken",
    a_card3_t:"Ereignis erstellen", a_card3_s:"Arzt, Abendessen, Geburtstag…",
    a_card4_t:"Zuerst umschauen",   a_card4_s:"Sieh dir die App an",
    tut_q:"Weißt du nicht, wo du anfangen sollst?", tut_btn:"🧭 Geführte Tour starten",
    skip_later:"Später entscheiden →",
    d_step:"Schritt", d_of:"von",
    d_s1_h:"Wie heißt deine Familie?", d_s1_s:"Du kannst später mehrere haben. Beispiele: Familie Schmidt, Ferienhaus.", d_s1_ph:"z.B. Familie Schmidt",
    d_s2_h:"Wer gehört dazu?", d_s2_s:"Füge eine Person hinzu, um zu beginnen. Einladung später.", d_s2_ph:"Name (z.B. Maria)", d_s2_rel:"Beziehung",
    d_s3_h:"Was ist das Erste, was koordiniert werden muss?", d_s3_s:"Eine konkrete Aufgabe. Besser als tausend Chats.", d_s3_ph:"z.B. Opa zum Arzt bringen",
    d_next:"Weiter →", d_back:"← Zurück", d_finish:"✓ FAMMY betreten", d_skip_all:"Tour überspringen", d_close:"Schließen",
    done_h:"Alles bereit!", done_s:"Hier ist deine Pinnwand — wir haben die Familie und die erste Aufgabe hinzugefügt.",
    done_cta:"Zur Pinnwand →", done_restart:"↻ Ablauf wiederholen",
    rels:["Oma","Opa","Mama","Papa","Sohn","Tochter","Bruder","Schwester"],
  },
};
const LANGS = [
  {id:"it", flag:"🇮🇹"},
  {id:"en", flag:"🇬🇧"},
  {id:"fr", flag:"🇫🇷"},
  {id:"de", flag:"🇩🇪"},
];

// ── DATASET ──
// INITIAL_* = stato pulito per nuovo utente beta (nessun dato demo)
// DEMO_*    = caricati solo da "Dai un'occhiata prima" nel Welcome Hub
const INITIAL_CIRCLES = [
  { id:"me", name:"La mia famiglia", emoji:"🏠", color:"#C96A3A",
    members:[
      {id:"raffael", name:"Raffael", role:"tu", color:"#1C1611", status:"active", av:"R", isMe:true},
    ]
  }
];
const INITIAL_TASKS = [];

const DEMO_CIRCLES = [
  { id:"renga", name:"Famiglia Renga", emoji:"🏡", color:"#C96A3A",
    members:[
      {id:"nonno",      name:"Nonno Francesco", role:"nonno",              color:"#5A4A3A", status:"active", av:"F"},
      {id:"nonna",      name:"Nonna Bettina",   role:"nonna",              color:"#8B6F5E", status:"active", av:"B"},
      {id:"ale",        name:"Alessandro",      role:"figlio",             color:"#2A6FDB", status:"active", av:"A", partner:"Valeria", kids:["Tommaso","Beatrice"]},
      {id:"raffael",    name:"Raffael",          role:"figlio",             color:"#1C1611", status:"active", av:"R", isMe:true},
      {id:"christopher",name:"Christopher",     role:"figlio",             color:"#2E7D52", status:"active", av:"C"},
      {id:"vanessa",    name:"Vanessa",          role:"figlia",             color:"#9B59B6", status:"active", av:"V"},
      {id:"sebastian",  name:"Sebastian",        role:"figlio",             color:"#E67E22", status:"active", av:"S"},
      {id:"valeria",    name:"Valeria",          role:"moglie di Alessandro",color:"#E91E8C",status:"active", av:"V", coupleWith:"ale"},
    ]
  },
  { id:"masiero", name:"Famiglia Masiero", emoji:"🏠", color:"#2A6FDB",
    members:[
      {id:"mas_n",  name:"Nonno 2",       role:"nonno", color:"#5A6A8A", status:"active", av:"N"},
      {id:"mas_nn", name:"Nonna 2",        role:"nonna", color:"#7A8EA8", status:"active", av:"N"},
      {id:"mas_np", name:"Nipote 2",       role:"nipote",color:"#2E7D52", status:"active", av:"N"},
      {id:"raffael",name:"Raffael",       role:"tu",    color:"#1C1611",status:"active",av:"R",isMe:true},
    ]
  }
];

// visibility: "all" | "couple" (solo coppia coupleWith)
// urgent: bool — riappare in bacheca con badge urgente
const DEMO_TASKS = [
  {id:1,circleId:"renga",  title:"Portare nonno Francesco dal cardiologo",category:"health",status:"todo",  author:"Raffael",             date:"22 apr",note:"Ospedale Civile ore 10:00",visibility:"all",urgent:false,responses:[],hasExpense:false},
  {id:2,circleId:"renga",  title:"Comprare farmaci nonna Bettina",         category:"health",status:"taken", author:"Alessandro",takenBy:"Raffael",date:"18 apr",note:"Farmacia centrale",visibility:"all",urgent:false,responses:[{user:"Raffael",text:"Me ne occupo io \u2713",time:"ieri",type:"comment"}],hasExpense:false},
  {id:3,circleId:"renga",  title:"Riparare il cancello di casa",           category:"home",  status:"todo",  author:"Raffael",             date:"25 apr",note:"",visibility:"all",urgent:false,responses:[],hasExpense:false},
  {id:4,circleId:"renga",  title:"Bolletta luce",                          category:"admin", status:"to_pay",author:"Raffael",             date:"20 apr",note:"Scadenza 20 aprile",visibility:"all",urgent:false,responses:[],hasExpense:false,amount:87.20},
  {id:5,circleId:"masiero",title:"Prendere Tommaso a scuola",              category:"care",  status:"todo",  author:"Valeria",             date:"oggi",  note:"Uscita ore 16:30",visibility:"all",urgent:false,responses:[],hasExpense:false},
  {id:6,circleId:"renga",  title:"Cena domenica da nonno Francesco",       category:"care",  status:"todo",  author:"Nonna Bettina",       date:"27 apr",note:"Portare il dolce",visibility:"all",urgent:false,responses:[],hasExpense:false},
  {id:7,circleId:"renga",  title:"Lista della spesa — sabato",             category:"other", status:"todo",  author:"Valeria",             date:"sabato",note:"Pane, latte, pasta, vino rosso",visibility:"couple",coupleIds:["ale","raffael"],urgent:false,responses:[{user:"Valeria",text:"@Alessandro aggiungi anche il parmigiano",time:"oggi",type:"comment"}],hasExpense:false},
];

const CAT = {care:"❤️",home:"🏠",health:"💊",admin:"📋",other:"📌"};
const ST  = {
  todo:  {l:"Da fare",        c:"#E6A817",bg:"#FEF7E0",d:"#E6A817"},
  taken: {l:"Preso in carico",c:"#2B7FD4",bg:"#E8F2FD",d:"#2B7FD4"},
  done:  {l:"Fatto",          c:"#2E7D52",bg:"#E6F4EC",d:"#2E7D52"},
  to_pay:{l:"Da pagare",      c:"#C0392B",bg:"#FDECEA",d:"#C0392B"},
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --s:#F7F3EE;--sm:#EDE7DE;--sd:#C9BFB3;
  --k:#1C1611;--km:#6B5F52;--kl:#A89E93;
  --ac:#2A6FDB;--ab:#EAF1FB;
  --am:#E6A817;--amB:#FEF7E0;
  --gn:#2E7D52;--gnB:#E6F4EC;
  --rd:#C0392B;--rdB:#FDECEA;
  --tc:#C96A3A;--tp:#F5E6DC;
  --pu:#7C3AED;--puB:#EDE9FE;
  --fn:'Sora',sans-serif;--fs:'Lora',serif;
}
body{background:var(--s);font-family:var(--fn);direction:ltr;}
input,textarea{direction:ltr;unicode-bidi:embed;text-align:left;}
.shell{width:390px;min-height:844px;background:var(--s);border-radius:44px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(28,22,17,.07),0 32px 64px rgba(28,22,17,.14);
  display:flex;flex-direction:column;position:relative;}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:32px 16px;background:linear-gradient(160deg,#EDE7DE,#D8CEBF);}
.sbar{display:flex;justify-content:space-between;align-items:center;
  padding:14px 22px 0;font-size:12px;font-weight:600;color:var(--k);flex-shrink:0;}
.scr{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;}
.scr::-webkit-scrollbar{display:none;}

/* CARDS */
.tc{background:white;border-radius:18px;padding:14px;cursor:pointer;
  box-shadow:0 1px 4px rgba(28,22,17,.05);margin-bottom:9px;
  border:1px solid var(--sm);transition:box-shadow .15s,transform .15s;}
.tc:hover{box-shadow:0 4px 14px rgba(28,22,17,.09);transform:translateY(-1px);}
.tc.care{background:#FEF8F4;}.tc.home{background:var(--s);}
.tc.health{background:#F2F9F5;}.tc.admin{background:#F3F5FC;}.tc.other{background:#FAF5FF;}
.tc.urgent{border:2px solid var(--rd)!important;box-shadow:0 0 0 3px rgba(192,57,43,.08);}
.rc{display:flex;align-items:center;gap:11px;padding:12px 13px;background:white;
  border-radius:14px;margin-bottom:7px;cursor:pointer;border:1px solid var(--sm);}
.rc.urgent{border:2px solid var(--rd);background:#FEF9F8;}

/* STATUS PILL */
.sp{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;
  border-radius:100px;font-size:11px;font-weight:600;}
.sd{width:6px;height:6px;border-radius:50%;}

/* AVATAR */
.av{border-radius:12px;display:flex;align-items:center;justify-content:center;
  font-weight:700;color:white;flex-shrink:0;}

/* CIRCLE SWITCHER */
.csw{display:flex;gap:7px;padding:9px 14px;overflow-x:auto;flex-shrink:0;
  background:white;border-bottom:1px solid var(--sm);}
.csw::-webkit-scrollbar{display:none;}
.chip{display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:100px;
  border:1.5px solid transparent;cursor:pointer;white-space:nowrap;
  font-family:var(--fn);font-size:12px;font-weight:600;transition:all .15s;flex-shrink:0;}
.chip.on{background:var(--k);color:white;border-color:var(--k);}
.chip.off{background:var(--s);color:var(--km);border-color:var(--sm);}

/* SECTION HEADER */
.sh{display:flex;align-items:center;gap:7px;padding:12px 14px 8px;}
.shb{width:3px;height:18px;border-radius:2px;flex-shrink:0;}
.shl{font-size:12px;font-weight:700;color:var(--k);letter-spacing:.4px;text-transform:uppercase;}
.shn{border-radius:100px;padding:1px 7px;font-size:11px;font-weight:700;}
.sep{display:flex;align-items:center;gap:10px;padding:4px 14px;margin:4px 0;}
.sepl{flex:1;height:1px;background:var(--sm);}
.sepp{display:flex;align-items:center;gap:5px;padding:4px 12px;background:var(--s);border-radius:100px;}

/* VISIBILITY TOGGLE */
.vis-row{display:flex;align-items:center;gap:8px;padding:9px 12px;
  border-radius:12px;border:1.5px solid var(--sm);cursor:pointer;
  font-family:var(--fn);font-size:13px;font-weight:600;transition:all .15s;}
.vis-row.couple{background:var(--puB);border-color:var(--pu);color:var(--pu);}
.vis-row.all{background:var(--gnB);border-color:var(--gn);color:var(--gn);}

/* URGENT BADGE */
.urg{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;
  border-radius:100px;background:var(--rdB);color:var(--rd);font-size:11px;font-weight:700;}

/* BADGES */
.blab{font-size:10px;font-weight:600;padding:3px 8px;border-radius:100px;}
.blab.active{background:var(--gnB);color:var(--gn);}
.blab.pending{background:var(--amB);color:var(--am);}

/* QUICK REPLY */
.qr{padding:10px 14px;border-radius:13px;border:none;background:white;
  font-family:var(--fn);font-size:12px;font-weight:600;color:var(--k);cursor:pointer;
  box-shadow:0 1px 4px rgba(28,22,17,.08);}
.qr.p{background:var(--k);color:white;box-shadow:0 4px 12px rgba(28,22,17,.22);}

/* BUTTONS */
.btn{padding:14px;border:none;border-radius:14px;font-family:var(--fn);
  font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s;width:100%;}
.btn:hover{opacity:.88;}
.btn.k{background:var(--k);color:white;}
.btn.tc{background:var(--tc);color:white;}
.btn.sd{background:var(--sd);color:var(--k);}
.btn.gn{background:var(--gnB);border:1.5px solid var(--gn)!important;color:var(--gn);}
.btn.rd{background:var(--rdB);border:1.5px solid #F5C6C3!important;color:var(--rd);}

/* INPUT */
.inp{width:100%;padding:13px 15px;background:var(--s);border:1.5px solid transparent;
  border-radius:13px;font-family:var(--fn);font-size:14px;color:var(--k);
  outline:none;transition:border-color .15s;}
.inp:focus{border-color:var(--tc);background:white;}

/* NAV */
.bnav{display:flex;border-top:1px solid var(--sm);padding:10px 0 24px;
  background:white;flex-shrink:0;}
.bni{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
  cursor:pointer;padding:4px 0;background:none;border:none;font-family:var(--fn);}
.bni .ico{font-size:22px;line-height:1;}
.bni .lbl{font-size:9px;font-weight:600;letter-spacing:.3px;color:var(--kl);text-transform:uppercase;}
.bni.on .lbl{color:var(--tc);}
.bnip{width:4px;height:4px;border-radius:50%;background:var(--tc);margin:0 auto;}

/* MISC */
.brow{display:flex;align-items:center;gap:10px;padding:12px 18px 8px;flex-shrink:0;}
.bbtn{width:34px;height:34px;background:white;border:1px solid var(--sm);
  border-radius:10px;font-size:16px;cursor:pointer;display:flex;
  align-items:center;justify-content:center;color:var(--k);}
.toast{position:absolute;top:76px;left:16px;right:16px;background:var(--k);
  color:white;border-radius:14px;padding:12px 16px;font-size:13px;font-weight:500;
  z-index:200;animation:tIn .3s ease both;box-shadow:0 8px 24px rgba(28,22,17,.2);}
.member-card{display:flex;align-items:center;gap:12px;padding:13px;background:white;
  border-radius:17px;margin-bottom:8px;cursor:pointer;border:1px solid var(--sm);
  transition:box-shadow .15s;}
.member-card:hover{box-shadow:0 3px 10px rgba(28,22,17,.07);}
.inv-opt{display:flex;align-items:center;gap:14px;padding:15px;background:white;
  border-radius:16px;margin-bottom:8px;cursor:pointer;border:1.5px solid var(--sm);transition:all .15s;}
.inv-opt:hover{border-color:var(--sd);}
.inv-ico{width:44px;height:44px;border-radius:14px;display:flex;
  align-items:center;justify-content:center;font-size:22px;flex-shrink:0;}
@keyframes tIn{from{transform:translateY(-14px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes sUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes fIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.anim{animation:fIn .3s ease both;}
`;

function Sp({status}){
  const c=ST[status]||ST.todo;
  return <span className="sp" style={{background:c.bg,color:c.c}}><span className="sd" style={{background:c.d}}/>{c.l}</span>;
}
function Av({n,color,size=36,r=11,fs=13}){
  return <div className="av" style={{width:size,height:size,borderRadius:r,background:color||"#888",fontSize:fs}}>{n?.[0]||"?"}</div>;
}
function CirBadge({circle}){
  if(!circle) return null;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:100,fontSize:10,fontWeight:700,background:circle.color+"22",color:circle.color}}>{circle.emoji} {circle.name}</span>;
}
function VisBadge({vis,coupleNames}){
  if(vis==="couple") return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:100,fontSize:10,fontWeight:700,background:"var(--puB)",color:"var(--pu)"}}>🔒 Solo {coupleNames||"coppia"}</span>;
  return null;
}
function UrgBadge(){
  return <span className="urg">🚨 Urgente</span>;
}

// ── DATE PICKER (quick chips + calendario mensile) ──
const DP_MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DP_MESI_SHORT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const DP_WD = ["L","M","M","G","V","S","D"];
function formatDateShort(d){
  return d.getDate()+" "+DP_MESI_SHORT[d.getMonth()];
}
function DatePicker({value, onChange, accent="var(--tc)", accentBg="var(--tp)"}){
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const isSameDay = (a,b) => a&&b&&a.getDate()===b.getDate()&&a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear();
  const selectedDate = value && value instanceof Date ? value : null;

  // Quick chips
  const chips = [
    {k:"Oggi",  d:new Date(today)},
    {k:"Domani", d:new Date(today.getTime()+86400000)},
    {k:"Weekend", d:(()=>{ const w=new Date(today); const day=w.getDay(); const diff=(6-day+7)%7||6; w.setDate(w.getDate()+diff); return w; })()},
    {k:"Pross. settimana", d:(()=>{ const w=new Date(today); const day=w.getDay(); const diff=(8-day)%7||7; w.setDate(w.getDate()+diff); return w; })()},
  ];

  // Calendario — genera 42 celle (6 settimane)
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startWD = (firstDay.getDay()+6)%7; // Lunedì=0
  const gridStart = new Date(firstDay); gridStart.setDate(1-startWD);
  const cells = Array.from({length:42},(_,i)=>{ const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); return d; });

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 1));

  return (
    <div>
      {/* Chips */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {chips.map(c=>{
          const sel = isSameDay(selectedDate, c.d);
          return (
            <button key={c.k} onClick={()=>onChange(c.d)}
              style={{padding:"7px 12px",borderRadius:100,border:"1.5px solid "+(sel?accent:"var(--sm)"),
                background:sel?accent:"white", color:sel?"white":"var(--k)",
                fontFamily:"var(--fn)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {c.k}
            </button>
          );
        })}
      </div>

      {/* Navigatore mese */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 2px 8px"}}>
        <button onClick={prevMonth} style={{width:30,height:30,border:"1px solid var(--sm)",background:"white",borderRadius:9,cursor:"pointer",fontSize:13}}>‹</button>
        <div style={{fontSize:13,fontWeight:700,color:"var(--k)",textTransform:"capitalize"}}>{DP_MESI[viewMonth.getMonth()]} {viewMonth.getFullYear()}</div>
        <button onClick={nextMonth} style={{width:30,height:30,border:"1px solid var(--sm)",background:"white",borderRadius:9,cursor:"pointer",fontSize:13}}>›</button>
      </div>

      {/* Weekday header */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {DP_WD.map((w,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--kl)",letterSpacing:.5,padding:"4px 0"}}>{w}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((d,i)=>{
          const inMonth = d.getMonth()===viewMonth.getMonth();
          const isToday = isSameDay(d, today);
          const isSel = isSameDay(d, selectedDate);
          const isPast = d < today;
          return (
            <button key={i} onClick={()=>onChange(d)} disabled={isPast && !isToday}
              style={{
                aspectRatio:"1",border:"1px solid "+(isSel?accent:"transparent"),
                background:isSel?accent:isToday?accentBg:"transparent",
                color:isSel?"white":inMonth?(isPast&&!isToday?"var(--kl)":"var(--k)"):"var(--kl)",
                opacity:inMonth?(isPast&&!isToday?.4:1):.35,
                borderRadius:9,fontFamily:"var(--fn)",fontSize:12.5,fontWeight:isToday||isSel?700:500,
                cursor:isPast&&!isToday?"not-allowed":"pointer",padding:0
              }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FammyApp(){
  const [screen,        setScreen]        = useState(SCREENS.ONBOARDING);
  const [prevScreen,     setPrevScreen]     = useState(SCREENS.HOME);
  const [obSlide,       setObSlide]       = useState(0);
  const [nav,           setNav]           = useState("home");
  const [circles,       setCircles]       = useState(INITIAL_CIRCLES);
  const [tasks,         setTasks]         = useState(INITIAL_TASKS);

  // ── Welcome Hub / i18n / overlay ──
  const [lang,           setLang]           = useState("it");
  const [welcomeView,    setWelcomeView]    = useState("welcome"); // welcome | w1 | w2 | w3 | done
  const [welcomeSeen,    setWelcomeSeen]    = useState(false); // true dopo prima creazione o "Dai un'occhiata"
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false); // "?" dalla Bacheca
  const [wizFamilyName,  setWizFamilyName]  = useState("");
  const [wizMemberName,  setWizMemberName]  = useState("");
  const [wizMemberRel,   setWizMemberRel]   = useState(null);
  const [wizTaskTitle,   setWizTaskTitle]   = useState("");
  const L = T[lang];

  const resetWizard = () => { setWelcomeView("welcome"); setWizFamilyName(""); setWizMemberName(""); setWizMemberRel(null); setWizTaskTitle(""); };

  // Carica dataset demo quando l'utente sceglie "Dai un'occhiata prima"
  const loadDemoData = () => {
    setCircles(DEMO_CIRCLES);
    setTasks(DEMO_TASKS);
    setActiveCircle("all");
    setWelcomeSeen(true);
    setShowWelcomeOverlay(false);
    setScreen(SCREENS.HOME); setNav("home");
    toast_("👀 Dati di esempio caricati");
  };

  // Applica le scelte del wizard (crea famiglia + membro + task)
  const finishWizard = () => {
    const famName = wizFamilyName.trim() || (lang==="it"?"La mia famiglia":lang==="en"?"My family":lang==="fr"?"Ma famille":"Meine Familie");
    const newCircleId = "c_"+Date.now();
    const newCircle = {
      id:newCircleId, name:famName, emoji:"🏠", color:"#C96A3A",
      members:[{id:"raffael", name:"Raffael", role:"tu", color:"#1C1611", status:"active", av:"R", isMe:true}]
    };
    if(wizMemberName.trim()){
      newCircle.members.push({
        id:"m_"+Date.now(), name:wizMemberName.trim(),
        role:wizMemberRel||"altro", color:"#2A6FDB", status:"pending",
        av:(wizMemberName.trim()[0]||"?").toUpperCase()
      });
    }
    setCircles([newCircle]);
    if(wizTaskTitle.trim()){
      const d = new Date();
      const mn=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
      setTasks([{
        id:Date.now(), circleId:newCircleId, title:wizTaskTitle.trim(),
        category:"other", status:"todo", author:"Raffael",
        date:d.getDate()+" "+mn[d.getMonth()], note:"", responses:[],
        hasExpense:false, visibility:"all", urgent:false
      }]);
    }
    setWelcomeSeen(true);
    setShowWelcomeOverlay(false);
    setActiveCircle(newCircleId);
    setScreen(SCREENS.HOME); setNav("home");
    resetWizard();
    toast_("✅ "+(lang==="it"?"Benvenuto in FAMMY!":lang==="en"?"Welcome to FAMMY!":lang==="fr"?"Bienvenue dans FAMMY !":"Willkommen bei FAMMY!"));
  };
  const [activeCircle,  setActiveCircle]  = useState("all");
  const [selTask,       setSelTask]       = useState(null);
  const [selMember,     setSelMember]     = useState(null);
  const [selCircleId,   setSelCircleId]   = useState("renga");
  const [toast,         setToast]         = useState(null);
  const [showMyDone,    setShowMyDone]    = useState(false);
  const [showOthers,    setShowOthers]    = useState(false);

  // New task modal
  const [showModal,  setShowModal]  = useState(false);
  const [taskStep,   setTaskStep]   = useState(0);
  const [newTask,    setNewTask]    = useState({title:"",cat:"care",who:"Chiunque",date:null,note:"",circleId:"me",vis:"all"}); // date: Date | null

  // Reply / thread
  const [replyMode,  setReplyMode]  = useState(null);
  const [replyText,  setReplyText]  = useState("");
  const [replyDate,  setReplyDate]  = useState(null); // Date | null
  const [mentionPop, setMentionPop] = useState(false);

  // Delegate urgently
  const [showDelegate, setShowDelegate] = useState(false);

  // Member mgmt
  const [showAddMember,setShowAddMember]=useState(false);
  const [newMember,    setNewMember]    =useState({name:"",role:"",relationship:"figlio",circleId:"renga"});
  const [showInvite,   setShowInvite]   =useState(false);
  const [inviteMember, setInviteMember] =useState(null);

  // Family accordion + edit
  const [expandedCircles, setExpandedCircles] = useState({"renga":true});
  const [editingCircle,   setEditingCircle]   = useState(null); // circleId
  const [editCircleName,  setEditCircleName]  = useState("");
  const [editCircleEmoji, setEditCircleEmoji] = useState("");
  const [editingMember,   setEditingMember]   = useState(null); // {circleId, memberId}
  const [editMemberData,  setEditMemberData]  = useState({});
  const [showAddCircle,   setShowAddCircle]   = useState(false);
  const [newCircle,       setNewCircle]       = useState({name:"",emoji:"🏠"});

  const EMOJIS = ["🏡","🏠","🏘️","❤️","⭐","🌟","🌺","🌊","🏔️","🌿"];
  const RELATIONSHIPS = ["nonno","nonna","papà","mamma","figlio","figlia","fratello","sorella","nipote","zio","zia","cugino","cugina","marito","moglie","compagno","compagna","partner","cognato","cognata","suocero","suocera","genero","nuora","altro"];

  const toggleCircle = (id) => setExpandedCircles(p=>({...p,[id]:!p[id]}));

  const startEditCircle = (c) => { setEditingCircle(c.id); setEditCircleName(c.name); setEditCircleEmoji(c.emoji); };
  const saveCircle = () => {
    setCircles(p=>p.map(c=>c.id===editingCircle?{...c,name:editCircleName,emoji:editCircleEmoji}:c));
    setEditingCircle(null);
    toast_("✓ Famiglia aggiornata");
  };

  const startEditMember = (circleId, m) => {
    setEditingMember({circleId,memberId:m.id});
    setEditMemberData({name:m.name,role:m.role,relationship:m.relationship||"",partner:m.partner||"",color:m.color});
  };
  const saveMember = () => {
    const {circleId,memberId} = editingMember;
    setCircles(p=>p.map(c=>c.id===circleId?{...c,members:c.members.map(m=>m.id===memberId?{...m,...editMemberData,av:editMemberData.name[0]}:m)}:c));
    setEditingMember(null);
    toast_("✓ Membro aggiornato");
  };

  const addCircle = () => {
    if(!newCircle.name.trim()){toast_("✏️ Inserisci il nome");return;}
    const id = "c_"+Date.now();
    setCircles(p=>[...p,{id,name:newCircle.name,emoji:newCircle.emoji,color:"#2A6FDB",members:[{id:"raffael",name:"Raffael",role:"tu",color:"#1C1611",status:"active",av:"R",isMe:true}]}]);
    setExpandedCircles(p=>({...p,[id]:true}));
    setShowAddCircle(false); setNewCircle({name:"",emoji:"🏠"});
    toast_("✓ Nuova famiglia aggiunta!");
  };

  const MEMBER_COLORS_LIST = ["#1C1611","#2A6FDB","#2E7D52","#C96A3A","#9B59B6","#E67E22","#E91E8C","#E74C3C","#16A085","#8B6F5E"];

  const toast_ = (m) => { setToast(m); setTimeout(()=>setToast(null),2800); };

  // ── VISIBILITY HELPERS ──
  const ME_ID = "raffael";
  const canSeeTask = (task) => {
    if(task.visibility!=="couple") return true;
    // couple task: only visible to coupleIds members + author
    const cids = task.coupleIds||[];
    return cids.includes(ME_ID) || task.author==="Raffael";
  };

  const visTasks = (activeCircle==="all" ? tasks : tasks.filter(t=>t.circleId===activeCircle))
    .filter(canSeeTask);
  const myOpen   = visTasks.filter(t=>t.takenBy==="Raffael"&&t.status!=="done");
  const myDone   = visTasks.filter(t=>t.takenBy==="Raffael"&&t.status==="done");
  const urgent   = visTasks.filter(t=>t.urgent&&t.takenBy!=="Raffael"&&t.status!=="done");
  const pool     = visTasks.filter(t=>t.status==="todo"&&!t.takenBy&&!t.urgent);
  const others   = visTasks.filter(t=>t.status==="taken"&&t.takenBy&&t.takenBy!=="Raffael"&&!t.urgent);
  const toPay    = visTasks.filter(t=>t.status==="to_pay");

  const updTask  = (id,p) => setTasks(prev=>prev.map(t=>t.id===id?{...t,...p}:t));
  const addResp  = (id,text,user="Raffael",type="comment") => setTasks(prev=>prev.map(t=>
    t.id===id?{...t,responses:[...t.responses,{user,text,time:"ora",type}]}:t
  ));

  const submitReply = (taskId,text,patch={}) => {
    if(!text.trim()) return;
    const task = tasks.find(t=>t.id===taskId);
    const mems = (circles.find(c=>c.id===task?.circleId)?.members||[]).map(m=>m.name);
    const mentioned = mems.filter(n=>text.includes("@"+n));
    addResp(taskId,text,"Raffael",replyMode||"comment");
    if(Object.keys(patch).length) updTask(taskId,patch);
    setReplyMode(null); setReplyText(""); setReplyDate(""); setMentionPop(false); setShowDelegate(false);
    if(mentioned.length) toast_("\uD83D\uDD14 "+mentioned.join(", ")+" notificato");
    else toast_("\uD83D\uDCAC Risposta inviata");
  };

  const handleMention = (val) => {
    setReplyText(val);
    if(val.endsWith("@")) setMentionPop(true);
    else if(!val.includes("@")) setMentionPop(false);
  };
  const insertMention = (name) => {
    const b = replyText.endsWith("@")?replyText.slice(0,-1):replyText;
    setReplyText(b+"@"+name+" "); setMentionPop(false);
  };

  // Delegate urgently: mark task urgent + optionally assign + notify
  const delegateUrgent = (taskId, toName) => {
    const msg = toName
      ? "\uD83D\uDEA8 Imprevisto! Ho delegato a @"+toName+" — serve qualcuno che lo gestisca."
      : "\uD83D\uDEA8 Imprevisto! Non riesco a farcela — chi se ne occupa?";
    updTask(taskId, { urgent:true, takenBy: toName||undefined, status: toName?"taken":"todo" });
    addResp(taskId, msg, "Raffael", "urgent");
    setShowDelegate(false); setReplyMode(null);
    toast_("\uD83D\uDEA8 Delegato con urgenza! La famiglia è stata notificata.");
  };

  const saveTask = () => {
    if(!newTask.title.trim()){toast_("\u270F\uFE0F Scrivi cosa deve essere fatto");return;}
    const d=new Date();
    const circle = circles.find(c=>c.id===newTask.circleId);
    // For couple tasks, find couple pair
    const coupleIds = newTask.vis==="couple"
      ? circle?.members.filter(m=>m.coupleWith||m.id==="raffael").map(m=>m.id)||[]
      : undefined;
    const dateStr = newTask.date ? formatDateShort(newTask.date) : formatDateShort(d);
    setTasks(p=>[...p,{
      id:Date.now(), circleId:newTask.circleId, title:newTask.title,
      category:newTask.cat, status:"todo", author:"Raffael",
      takenBy:newTask.who!=="Chiunque"?newTask.who:undefined,
      date:dateStr,
      note:newTask.note, responses:[], hasExpense:false,
      visibility:newTask.vis, coupleIds, urgent:false,
    }]);
    setWelcomeSeen(true); // creazione = "hai capito come funziona" → bacheca definitiva
    setShowModal(false); setTaskStep(0);
    const defCircle = circles[0]?.id || "me";
    setNewTask({title:"",cat:"care",who:"Chiunque",date:null,note:"",circleId:defCircle,vis:"all"});
    toast_("\u2705 Incarico aggiunto!");
  };

  const addMember = () => {
    if(!newMember.name.trim()){toast_("\u270F\uFE0F Inserisci il nome");return;}
    const m={id:"m_"+Date.now(),name:newMember.name,role:newMember.role||"membro",color:"#888",status:"pending",av:newMember.name[0]};
    setCircles(p=>p.map(c=>c.id===newMember.circleId?{...c,members:[...c.members,m]}:c));
    setShowAddMember(false); setInviteMember(m); setShowInvite(true);
    setNewMember({name:"",role:"",circleId:"renga"});
    toast_("\uD83D\uDC64 "+m.name+" aggiunto — invia l'invito!");
  };
  const removeMember = (circleId,memberId) => {
    setCircles(p=>p.map(c=>c.id===circleId?{...c,members:c.members.filter(m=>m.id!==memberId)}:c));
    setScreen(SCREENS.FAMILY); toast_("\uD83D\uDDD1\uFE0F Membro rimosso");
  };

  // goNav defined in render section

  // ── TASK CARD (full) ──
  const TCard = ({task,full=false}) => {
    const circle = circles.find(c=>c.id===task.circleId);
    const cNames = task.coupleIds?.map(id=>circle?.members.find(m=>m.id===id)?.name.split(" ")[0]).filter(Boolean).join(" e ")||"";
    return (
      <div className={"tc anim "+(task.category||"other")+(task.urgent?" urgent":"")} onClick={()=>{setSelTask(task.id);setScreen(SCREENS.TASK_DETAIL);}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{width:40,height:40,borderRadius:13,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,boxShadow:"0 1px 4px rgba(28,22,17,.08)"}}>{CAT[task.category]||"\uD83D\uDCCC"}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
              {task.urgent&&<UrgBadge/>}
              {task.visibility==="couple"&&<VisBadge vis="couple" coupleNames={cNames}/>}
            </div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--k)",lineHeight:1.35}}>{task.title}</div>
            <div style={{fontSize:12,color:"var(--kl)",marginTop:3}}>{task.note||("da "+task.author)}</div>
            {activeCircle==="all"&&circle&&<div style={{marginTop:5}}><CirBadge circle={circle}/></div>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:11,paddingTop:11,borderTop:"1px solid rgba(28,22,17,.06)"}}>
          <Sp status={task.status}/>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {task.hasExpense&&<span style={{fontSize:12,color:"var(--rd)",fontWeight:700}}>€{task.expenseAmount?.toFixed(2)}</span>}
            <span style={{fontSize:11,color:"var(--kl)"}}>📅 {task.date}</span>
          </div>
        </div>
        {full&&task.status==="todo"&&!task.takenBy&&(
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button style={{padding:"11px 18px",borderRadius:14,border:"none",background:"var(--tc)",color:"white",fontFamily:"var(--fn)",fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(201,106,58,.3)",display:"flex",alignItems:"center",gap:6}} onClick={e=>{e.stopPropagation();updTask(task.id,{status:"taken",takenBy:"Raffael"});addResp(task.id,"Me ne occupo io \u2713");toast_("\u2713 Preso in carico!");}}>✓ Me ne occupo io</button>
            <button className="qr" onClick={e=>{e.stopPropagation();setSelTask(task.id);setScreen(SCREENS.TASK_DETAIL);}}>👤 Assegna</button>
          </div>
        )}
      </div>
    );
  };

  // ── ROW CARD (compact) ──
  const RCard = ({task,dimmed=false}) => (
    <div className={"rc"+(task.urgent?" urgent":"")} style={{opacity:dimmed?.6:1,background:dimmed?"var(--s)":"white"}}
      onClick={()=>{setSelTask(task.id);setScreen(SCREENS.TASK_DETAIL);}}>
      <div style={{width:36,height:36,borderRadius:11,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:dimmed?"none":"0 1px 4px rgba(28,22,17,.07)"}}>{CAT[task.category]||"\uD83D\uDCCC"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:1}}>
          {task.urgent&&<UrgBadge/>}
        </div>
        <div style={{fontSize:14,fontWeight:600,color:"var(--k)",textDecoration:dimmed?"line-through":"none",lineHeight:1.3}}>{task.title}</div>
        <div style={{fontSize:11,color:"var(--kl)",marginTop:1}}>📅 {task.date}</div>
      </div>
      {dimmed?<span style={{fontSize:12,color:"var(--gn)",fontWeight:600}}>✓</span>:<Sp status={task.status}/>}
    </div>
  );

  // ── TASK MODAL ── (funzione, NON componente, altrimenti ad ogni tasto
  // React rimonta <TaskModal/> e l'input perde il cursore)
  const taskModal = () => (
    <div style={{position:"absolute",inset:0,zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(28,22,17,.45)"}} onClick={()=>{setShowModal(false);setTaskStep(0);}}/>
      <div style={{position:"relative",background:"white",borderRadius:"28px 28px 0 0",animation:"sUp .3s ease",maxHeight:"92%",overflow:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 0"}}><div style={{width:40,height:4,borderRadius:2,background:"var(--sm)"}}/></div>
        <div style={{display:"flex",gap:5,padding:"12px 20px 0"}}>
          {[0,1,2].map(s=><div key={s} style={{height:3,flex:1,borderRadius:2,background:s<=taskStep?"var(--tc)":"var(--sm)",transition:"background .2s"}}/>)}
        </div>

        {taskStep===0&&(
          <div style={{padding:"18px 20px 28px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Cosa deve essere fatto?</div>
            <textarea autoFocus dir="ltr" placeholder="es. Portare nonno dal medico, Lista della spesa, Bolletta..." value={newTask.title}
              onChange={e=>setNewTask(p=>({...p,title:e.target.value}))}
              style={{width:"100%",padding:"13px 15px",background:"var(--s)",border:"1.5px solid transparent",borderRadius:15,fontFamily:"var(--fn)",fontSize:15,color:"var(--k)",resize:"none",outline:"none",minHeight:88,lineHeight:1.5,direction:"ltr",textAlign:"left"}}
              onFocus={e=>e.target.style.borderColor="var(--tc)"} onBlur={e=>e.target.style.borderColor="transparent"}/>
            <textarea dir="ltr" placeholder="Note (facoltativo)" value={newTask.note} onChange={e=>setNewTask(p=>({...p,note:e.target.value}))}
              style={{width:"100%",padding:"11px 15px",background:"var(--s)",border:"1.5px solid transparent",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,color:"var(--k)",resize:"none",outline:"none",minHeight:55,lineHeight:1.5,marginTop:8,direction:"ltr",textAlign:"left"}}
              onFocus={e=>e.target.style.borderColor="var(--sd)"} onBlur={e=>e.target.style.borderColor="transparent"}/>

            <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",margin:"14px 0 8px"}}>Per quale famiglia?</div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {circles.map(c=>(
                <button key={c.id} onClick={()=>setNewTask(p=>({...p,circleId:c.id}))}
                  style={{flex:1,padding:"11px 8px",borderRadius:13,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                    background:newTask.circleId===c.id?c.color+"18":"var(--s)",borderColor:newTask.circleId===c.id?c.color:"transparent",color:newTask.circleId===c.id?c.color:"var(--km)"}}>
                  <span style={{fontSize:22}}>{c.emoji}</span>{c.name}
                </button>
              ))}
            </div>

            <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Chi può vederlo?</div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button onClick={()=>setNewTask(p=>({...p,vis:"all"}))}
                style={{flex:1,padding:"11px",borderRadius:13,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",
                  background:newTask.vis==="all"?"var(--gnB)":"var(--s)",borderColor:newTask.vis==="all"?"var(--gn)":"transparent",color:newTask.vis==="all"?"var(--gn)":"var(--km)"}}>
                👨‍👩‍👧 Tutta la famiglia
              </button>
              <button onClick={()=>setNewTask(p=>({...p,vis:"couple"}))}
                style={{flex:1,padding:"11px",borderRadius:13,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",
                  background:newTask.vis==="couple"?"var(--puB)":"var(--s)",borderColor:newTask.vis==="couple"?"var(--pu)":"transparent",color:newTask.vis==="couple"?"var(--pu)":"var(--km)"}}>
                🔒 Solo noi due
              </button>
            </div>
            {newTask.vis==="couple"&&(
              <div style={{padding:"10px 13px",background:"var(--puB)",border:"1.5px solid var(--pu)",borderRadius:12,fontSize:12,color:"var(--pu)",marginBottom:14}}>
                🔒 Visibile solo a te e al tuo partner nella famiglia selezionata. Gli altri membri non lo vedranno.
              </div>
            )}
            <button className="btn tc" onClick={()=>{if(newTask.title.trim())setTaskStep(1);else toast_("\u270F\uFE0F Scrivi cosa deve essere fatto");}}>Avanti →</button>
          </div>
        )}

        {taskStep===1&&(
          <div style={{padding:"18px 20px 28px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:11}}>Chi se ne occupa?</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:18}}>
              {["Chiunque",...(circles.find(c=>c.id===newTask.circleId)?.members.filter(m=>newTask.vis==="couple"?true:true).map(m=>m.name)||[])].map(m=>(
                <button key={m} onClick={()=>setNewTask(p=>({...p,who:m}))}
                  style={{padding:"9px 15px",borderRadius:100,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",
                    background:newTask.who===m?"var(--k)":"white",borderColor:newTask.who===m?"var(--k)":"var(--sm)",color:newTask.who===m?"white":"var(--k)"}}>
                  {m==="Chiunque"?"🙋 Chiunque":m.split(" ")[0]}
                </button>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Categoria</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
              {[{id:"care",icon:"❤️",l:"Cura"},{id:"home",icon:"🏠",l:"Casa"},{id:"health",icon:"💊",l:"Salute"},{id:"admin",icon:"📋",l:"Amministrativo"},{id:"other",icon:"📌",l:"Altro"}].map(c=>(
                <button key={c.id} onClick={()=>setNewTask(p=>({...p,cat:c.id}))}
                  style={{padding:"11px 12px",borderRadius:14,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .15s",
                    background:newTask.cat===c.id?"var(--tp)":"var(--s)",borderColor:newTask.cat===c.id?"var(--tc)":"transparent",color:"var(--k)"}}>
                  <span style={{fontSize:20}}>{c.icon}</span>{c.l}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn sd" style={{flex:1}} onClick={()=>setTaskStep(0)}>← Indietro</button>
              <button className="btn tc" style={{flex:2}} onClick={()=>setTaskStep(2)}>Avanti →</button>
            </div>
          </div>
        )}

        {taskStep===2&&(
          <div style={{padding:"18px 20px 28px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Entro quando?</div>
            <div style={{background:"var(--s)",borderRadius:15,padding:14,marginBottom:14}}>
              <DatePicker value={newTask.date} onChange={d=>setNewTask(p=>({...p,date:d}))} accent="var(--tc)" accentBg="var(--tp)"/>
              <button onClick={()=>setNewTask(p=>({...p,date:null}))}
                style={{marginTop:12,width:"100%",padding:"8px",background:newTask.date?"white":"var(--k)",color:newTask.date?"var(--km)":"white",border:"1.5px solid "+(newTask.date?"var(--sm)":"var(--k)"),borderRadius:11,fontFamily:"var(--fn)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                Senza scadenza
              </button>
            </div>
            <div style={{background:"var(--s)",borderRadius:15,padding:14,marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Anteprima</div>
              <div style={{display:"flex",gap:11,alignItems:"center"}}>
                <div style={{width:38,height:38,borderRadius:12,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{CAT[newTask.cat]}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--k)"}}>{newTask.title}</div>
                  <div style={{fontSize:11,color:"var(--km)",marginTop:3}}>
                    {circles.find(c=>c.id===newTask.circleId)?.emoji} {circles.find(c=>c.id===newTask.circleId)?.name}
                    {" · "}{newTask.who==="Chiunque"?"Aperto a tutti":"→ "+newTask.who}
                    {newTask.date?" · "+formatDateShort(newTask.date):""}
                    {newTask.vis==="couple"?" · 🔒 solo noi due":""}
                  </div>
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn sd" style={{flex:1}} onClick={()=>setTaskStep(1)}>← Indietro</button>
              <button className="btn tc" style={{flex:2}} onClick={saveTask}>✓ Aggiungi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── INVITE SHEET ──
  const inviteSheet = () => {
    const name = inviteMember?.name||"il membro";
    const msg  = "Ciao "+name.split(" ")[0]+"! Ti invito su FAMMY, l'app per coordinare la nostra famiglia. Unisciti: https://fammy.app/join/renga \uD83C\uDFE1";
    return (
      <div style={{position:"absolute",inset:0,zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
        <div style={{position:"absolute",inset:0,background:"rgba(28,22,17,.45)"}} onClick={()=>setShowInvite(false)}/>
        <div style={{position:"relative",background:"white",borderRadius:"28px 28px 0 0",padding:"0 0 32px",animation:"sUp .3s ease"}}>
          <div style={{display:"flex",justifyContent:"center",padding:"12px 0 0"}}><div style={{width:40,height:4,borderRadius:2,background:"var(--sm)"}}/></div>
          <div style={{padding:"16px 20px 0"}}>
            <div style={{fontSize:18,fontWeight:700,color:"var(--k)",marginBottom:4}}>Invita {name.split(" ")[0]}</div>
            <div style={{fontSize:13,color:"var(--km)",marginBottom:18,lineHeight:1.5}}>Scegli come inviare l'invito. Ricever\u00e0 un link per unirsi alla famiglia su FAMMY.</div>
            <div className="inv-opt" onClick={()=>{window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");toast_("\uD83D\uDCF1 WhatsApp aperto!");setShowInvite(false);}}>
              <div className="inv-ico" style={{background:"#E8F9EF"}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.558 4.122 1.532 5.853L.073 23.74a.5.5 0 00.618.618l5.905-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.924 0-3.733-.51-5.288-1.4l-.376-.22-3.904.968.988-3.788-.243-.39A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              </div>
              <div><div style={{fontSize:15,fontWeight:600,color:"var(--k)"}}>Invia su WhatsApp</div><div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>Messaggio con link gi\u00e0 scritto</div></div>
              <span style={{marginLeft:"auto",color:"var(--kl)"}}>›</span>
            </div>
            <div className="inv-opt" onClick={()=>{window.open("mailto:?subject=Ti+invito+su+FAMMY&body="+encodeURIComponent(msg),"_blank");toast_("\u2709\uFE0F Email aperta!");setShowInvite(false);}}>
              <div className="inv-ico" style={{background:"var(--ab)"}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="3" stroke="#2A6FDB" strokeWidth="1.8"/><path d="M2 8l10 7 10-7" stroke="#2A6FDB" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div><div style={{fontSize:15,fontWeight:600,color:"var(--k)"}}>Invia via email</div><div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>Apre Mail con messaggio pronto</div></div>
              <span style={{marginLeft:"auto",color:"var(--kl)"}}>›</span>
            </div>
            <div className="inv-opt" onClick={()=>{navigator.clipboard?.writeText("https://fammy.app/join/renga");toast_("\uD83D\uDD17 Link copiato!");setShowInvite(false);}}>
              <div className="inv-ico" style={{background:"var(--s)"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="var(--k)" strokeWidth="1.8" strokeLinecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="var(--k)" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div><div style={{fontSize:15,fontWeight:600,color:"var(--k)"}}>Copia link di invito</div><div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>Incollalo dove vuoi</div></div>
              <span style={{marginLeft:"auto",color:"var(--kl)"}}>›</span>
            </div>
            <button className="btn sd" style={{fontSize:13,color:"var(--km)",marginTop:4}} onClick={()=>setShowInvite(false)}>Fai dopo</button>
          </div>
        </div>
      </div>
    );
  };

  // ── ONBOARDING ──
  const OB = [
    {ey:"01 — Il problema",  h:"Una famiglia non\n\u00e8 una chat.",       s:"WhatsApp va bene per i messaggi. Non per chi fa cosa, le spese, i medici.", cta:"Avanti"},
    {ey:"02 — La soluzione", h:"Ognuno sa cosa\ndeve fare.",                s:"Ogni incarico ha un responsabile, uno stato, una memoria. Visibile a chi vuoi.", cta:"Avanti"},
    {ey:"03 — Il risultato", h:"Meno discussioni.\nMaggiore chiarezza.",    s:"FAMMY non ti controlla. Ti aiuta a coordinare. Senza WhatsApp infiniti.", cta:"Inizia gratis"},
  ];
  const renderOB = () => {
    const sl = OB[obSlide];
    return (
      <div style={{minHeight:844,display:"flex",flexDirection:"column",background:"var(--k)"}}>
        <div style={{display:"flex",gap:5,padding:"52px 28px 0"}}>
          {[0,1,2].map(i=><div key={i} style={{height:3,flex:1,borderRadius:2,background:i<=obSlide?"white":"rgba(255,255,255,.2)",transition:"background .3s"}}/>)}
        </div>
        <div style={{padding:"20px 30px 0",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:22,height:22,borderRadius:7,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"var(--k)"}}>F</div>
          <span style={{color:"white",fontWeight:700,fontSize:15,letterSpacing:-.3}}>FAMMY</span>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 30px 48px"}}>
          {/* SVG Illustrations */}
          {obSlide===0&&(
            <div style={{marginBottom:32,display:"flex",justifyContent:"center"}}>
              <svg width="220" height="160" viewBox="0 0 220 160" fill="none">
                <rect x="10" y="10" width="130" height="50" rx="14" fill="#E8F2FD"/>
                <polygon points="24,60 10,76 46,60" fill="#E8F2FD"/>
                <rect x="22" y="22" width="80" height="7" rx="3" fill="#B5D4F4"/>
                <rect x="22" y="35" width="55" height="7" rx="3" fill="#B5D4F4"/>
                <circle cx="138" cy="16" r="11" fill="#E24B4A"/>
                <text x="138" y="21" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">3</text>
                <rect x="80" y="80" width="120" height="46" rx="14" fill="#E6F4EC"/>
                <polygon points="94,126 80,142 120,126" fill="#E6F4EC"/>
                <rect x="92" y="92" width="75" height="7" rx="3" fill="#9FE1CB"/>
                <rect x="92" y="105" width="45" height="7" rx="3" fill="#9FE1CB"/>
                <circle cx="196" cy="76" r="14" fill="#FDECEA"/>
                <line x1="189" y1="69" x2="203" y2="83" stroke="#C0392B" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="203" y1="69" x2="189" y2="83" stroke="#C0392B" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
          )}
          {obSlide===1&&(
            <div style={{marginBottom:32,display:"flex",justifyContent:"center"}}>
              <svg width="220" height="160" viewBox="0 0 220 160" fill="none">
                <rect x="10" y="10" width="200" height="42" rx="13" fill="white" fillOpacity=".1" stroke="white" strokeOpacity=".15" strokeWidth="1.5"/>
                <circle cx="30" cy="31" r="9" fill="#FEF7E0" stroke="#E6A817" strokeWidth="1.5"/>
                <rect x="46" y="25" width="90" height="6" rx="3" fill="rgba(255,255,255,.3)"/>
                <rect x="164" y="22" width="38" height="16" rx="8" fill="#FEF7E0"/>
                <text x="183" y="33" textAnchor="middle" fill="#E6A817" fontSize="8" fontWeight="700">Da fare</text>
                <rect x="10" y="62" width="200" height="42" rx="13" fill="white" fillOpacity=".1" stroke="white" strokeOpacity=".15" strokeWidth="1.5"/>
                <circle cx="30" cy="83" r="9" fill="#E8F2FD" stroke="#2B7FD4" strokeWidth="1.5"/>
                <circle cx="30" cy="83" r="4.5" fill="#2B7FD4"/>
                <rect x="46" y="77" width="70" height="6" rx="3" fill="rgba(255,255,255,.3)"/>
                <rect x="152" y="74" width="50" height="16" rx="8" fill="#E8F2FD"/>
                <text x="177" y="85" textAnchor="middle" fill="#2B7FD4" fontSize="7" fontWeight="700">In carico</text>
                <rect x="10" y="114" width="200" height="42" rx="13" fill="white" fillOpacity=".1" stroke="white" strokeOpacity=".15" strokeWidth="1.5"/>
                <circle cx="30" cy="135" r="9" fill="#E6F4EC" stroke="#2E7D52" strokeWidth="1.5"/>
                <polyline points="25,135 29,140 36,129" stroke="#2E7D52" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <rect x="46" y="129" width="85" height="6" rx="3" fill="rgba(255,255,255,.2)"/>
                <rect x="164" y="126" width="38" height="16" rx="8" fill="#E6F4EC"/>
                <text x="183" y="137" textAnchor="middle" fill="#2E7D52" fontSize="8" fontWeight="700">Fatto</text>
              </svg>
            </div>
          )}
          {obSlide===2&&(
            <div style={{marginBottom:32,display:"flex",justifyContent:"center"}}>
              <svg width="220" height="160" viewBox="0 0 220 160" fill="none">
                <rect x="20" y="10" width="180" height="140" rx="18" fill="white" fillOpacity=".06" stroke="white" strokeOpacity=".12" strokeWidth="1.5"/>
                <rect x="20" y="10" width="180" height="48" rx="18" fill="white" fillOpacity=".08"/>
                <rect x="20" y="40" width="180" height="18" fill="white" fillOpacity=".08"/>
                <text x="110" y="33" textAnchor="middle" fill="white" fontSize="12" fontWeight="600" fillOpacity=".7">Aprile 2026</text>
                <rect x="36" y="68" width="22" height="22" rx="7" fill="white" fillOpacity=".06"/>
                <rect x="66" y="68" width="22" height="22" rx="7" fill="white" fillOpacity=".06"/>
                <rect x="96" y="68" width="22" height="22" rx="7" fill="white" fillOpacity=".25"/>
                <text x="107" y="83" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">17</text>
                <rect x="126" y="68" width="22" height="22" rx="7" fill="white" fillOpacity=".06"/>
                <rect x="156" y="68" width="22" height="22" rx="7" fill="#E6A817" fillOpacity=".8"/>
                <text x="167" y="83" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">18</text>
                <rect x="36" y="106" width="148" height="13" rx="6" fill="#EAF1FB" fillOpacity=".7"/>
                <circle cx="48" cy="112" r="4" fill="#2A6FDB"/>
                <rect x="58" y="109" width="80" height="5" rx="2" fill="white" fillOpacity=".4"/>
                <rect x="36" y="126" width="120" height="13" rx="6" fill="#E6F4EC" fillOpacity=".7"/>
                <circle cx="48" cy="132" r="4" fill="#2E7D52"/>
                <rect x="58" y="129" width="55" height="5" rx="2" fill="white" fillOpacity=".4"/>
              </svg>
            </div>
          )}
          <div style={{fontSize:11,fontWeight:600,letterSpacing:2,color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:14}}>{sl.ey}</div>
          <div style={{fontFamily:"var(--fs)",fontSize:34,lineHeight:1.2,color:"white",fontWeight:600,marginBottom:14,whiteSpace:"pre-line"}}>{sl.h}</div>
          <div style={{fontSize:15,lineHeight:1.6,color:"rgba(255,255,255,.55)",fontWeight:300,marginBottom:36}}>{sl.s}</div>
          <button style={{width:"100%",padding:17,background:"white",color:"var(--k)",border:"none",borderRadius:18,fontFamily:"var(--fn)",fontSize:15,fontWeight:600,cursor:"pointer"}}
            onClick={()=>{if(obSlide<2)setObSlide(s=>s+1);else setScreen(SCREENS.LOGIN);}}>
            {sl.cta}
          </button>
          {obSlide<2&&<button style={{display:"block",textAlign:"center",marginTop:14,fontSize:13,color:"rgba(255,255,255,.35)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--fn)"}} onClick={()=>setScreen(SCREENS.LOGIN)}>Salta</button>}
        </div>
      </div>
    );
  };

  const renderLogin = () => {
    // Dopo il login: prima volta -> Welcome Hub, altrimenti direttamente alla Bacheca
    const doLogin = () => { if(!welcomeSeen){ setScreen(SCREENS.WELCOME); } else { setScreen(SCREENS.HOME); setNav("home"); } };
    return (
    <div style={{padding:"0 26px 28px",display:"flex",flexDirection:"column",flex:1}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"48px 0 32px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,background:"var(--k)",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"white"}}>F</div>
          <span style={{fontSize:22,fontWeight:700,color:"var(--k)",letterSpacing:-.5}}>FAMMY</span>
        </div>
        <div style={{display:"flex",gap:4}}>
          {LANGS.map(lg=>(
            <button key={lg.id} onClick={()=>setLang(lg.id)}
              style={{padding:"5px 8px",border:"1.5px solid "+(lang===lg.id?"var(--k)":"var(--sm)"),background:lang===lg.id?"var(--k)":"white",color:lang===lg.id?"white":"var(--k)",borderRadius:9,fontSize:13,cursor:"pointer",fontFamily:"var(--fn)"}}>
              {lg.flag}
            </button>
          ))}
        </div>
      </div>
      <div style={{fontFamily:"var(--fs)",fontSize:28,fontWeight:600,color:"var(--k)",marginBottom:8,lineHeight:1.25}}>Benvenuto nella tua famiglia.</div>
      <div style={{fontSize:14,color:"var(--km)",marginBottom:36,fontWeight:300,lineHeight:1.6}}>Inserisci la tua email. Ti inviamo un link magico, nessuna password necessaria.</div>
      <label style={{fontSize:12,fontWeight:600,color:"var(--kl)",letterSpacing:.5,textTransform:"uppercase",marginBottom:8,display:"block"}}>La tua email</label>
      <input className="inp" type="email" placeholder="nome@email.com"/>
      <button className="btn k" style={{marginTop:12}} onClick={doLogin}>Invia link di accesso →</button>
      <div style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0",color:"var(--kl)",fontSize:12}}>
        <div style={{flex:1,height:1,background:"var(--sm)"}}/> oppure <div style={{flex:1,height:1,background:"var(--sm)"}}/>
      </div>
      <button style={{width:"100%",padding:14,background:"transparent",border:"1.5px solid var(--sm)",borderRadius:14,fontFamily:"var(--fn)",fontSize:14,fontWeight:500,color:"var(--k)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}
        onClick={doLogin}>
        <svg width="18" height="18" viewBox="0 0 18 18"><path d="M16.5 9.2c0-.55-.05-1.1-.14-1.6H9v3.02h4.2c-.18 1-.73 1.86-1.56 2.43v2h2.52C15.65 13.6 16.5 11.6 16.5 9.2z" fill="#4285F4"/><path d="M9 17c2.16 0 3.97-.72 5.3-1.94l-2.52-2c-.72.48-1.64.76-2.78.76-2.13 0-3.94-1.44-4.59-3.37H1.8v2.06C3.12 15.2 5.9 17 9 17z" fill="#34A853"/><path d="M4.41 10.45a4.73 4.73 0 010-2.9V5.49H1.8A8 8 0 001 9c0 1.29.31 2.51.8 3.51l2.61-2.06z" fill="#FBBC05"/><path d="M9 3.58c1.2 0 2.28.41 3.12 1.22l2.33-2.33C13 1.14 11.16.38 9 .38A8 8 0 001.8 5.49l2.61 2.06C5.06 5.02 6.87 3.58 9 3.58z" fill="#EA4335"/></svg>
        Continua con Google
      </button>
    </div>
  );};

  // ── WELCOME HUB ──
  const renderWelcome = (asOverlay=false) => {
    const closeOverlay = () => { setShowWelcomeOverlay(false); resetWizard(); };
    const cards = [
      {icon:"🏡", bg:"var(--tp)",  t:L.a_card1_t, s:L.a_card1_s, onClick:()=>setWelcomeView("w1")},
      {icon:"✅", bg:"var(--amB)", t:L.a_card2_t, s:L.a_card2_s, onClick:()=>{
        if(asOverlay) setShowWelcomeOverlay(false);
        setWelcomeSeen(true);
        setScreen(SCREENS.HOME); setNav("home");
        setTimeout(()=>setShowModal(true), 50);
      }},
      {icon:"📅", bg:"var(--ab)",  t:L.a_card3_t, s:L.a_card3_s, onClick:()=>{
        if(asOverlay) setShowWelcomeOverlay(false);
        setWelcomeSeen(true);
        setScreen(SCREENS.AGENDA); setNav("agenda");
      }},
      {icon:"👀", bg:"var(--s)",   t:L.a_card4_t, s:L.a_card4_s, onClick:loadDemoData},
    ];

    // WELCOME (hub)
    if(welcomeView==="welcome") return (
      <div style={{padding:"22px 22px 28px",flex:1,overflowY:"auto"}} className="anim">
        {/* Header: saluto + lingua (+ close se overlay) */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,background:"var(--k)",borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"white"}}>F</div>
            <span style={{fontSize:14.5,fontWeight:700,color:"var(--k)"}}>{L.hi}</span>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            {LANGS.map(lg=>(
              <button key={lg.id} onClick={()=>setLang(lg.id)}
                style={{padding:"4px 7px",border:"1.5px solid "+(lang===lg.id?"var(--k)":"var(--sm)"),background:lang===lg.id?"var(--k)":"white",color:lang===lg.id?"white":"var(--k)",borderRadius:8,fontSize:12,cursor:"pointer"}}>
                {lg.flag}
              </button>
            ))}
            {asOverlay&&<button onClick={closeOverlay} style={{marginLeft:6,width:30,height:30,border:"1px solid var(--sm)",background:"white",borderRadius:9,fontSize:14,cursor:"pointer"}}>✕</button>}
          </div>
        </div>

        <div style={{fontFamily:"var(--fs)",fontSize:26,fontWeight:600,color:"var(--k)",letterSpacing:-.3,marginBottom:6}}>{L.welcome_h}</div>
        <div style={{fontSize:14,color:"var(--km)",marginBottom:22,lineHeight:1.55,fontWeight:300}}>{L.welcome_s}</div>

        {cards.map((c,i)=>(
          <div key={i} onClick={c.onClick}
            style={{display:"flex",alignItems:"center",gap:14,padding:15,background:"white",border:"1.5px solid var(--sm)",borderRadius:17,marginBottom:10,cursor:"pointer",transition:"all .15s"}}
            onMouseOver={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 6px 16px rgba(28,22,17,.07)";e.currentTarget.style.borderColor="var(--sd)";}}
            onMouseOut={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";e.currentTarget.style.borderColor="var(--sm)";}}>
            <div style={{width:50,height:50,borderRadius:15,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,background:c.bg,flexShrink:0}}>{c.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14.5,fontWeight:600,color:"var(--k)"}}>{c.t}</div>
              <div style={{fontSize:12,color:"var(--kl)",marginTop:2,lineHeight:1.4}}>{c.s}</div>
            </div>
            <span style={{color:"var(--kl)",fontSize:18}}>›</span>
          </div>
        ))}

        {/* Tutorial CTA */}
        <div onClick={()=>setWelcomeView("w1")}
          style={{background:"linear-gradient(135deg,var(--k) 0%,#3D2B1F 100%)",borderRadius:18,padding:"18px 16px",display:"flex",alignItems:"center",gap:13,cursor:"pointer",marginTop:8,boxShadow:"0 8px 22px rgba(28,22,17,.18)"}}>
          <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🧭</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,color:"rgba(255,255,255,.55)",fontWeight:500,marginBottom:2}}>{L.tut_q}</div>
            <div style={{fontSize:15,fontWeight:700,color:"white",letterSpacing:-.2}}>{L.tut_btn}</div>
          </div>
          <span style={{color:"rgba(255,255,255,.5)",fontSize:18}}>›</span>
        </div>

        <div style={{textAlign:"center",padding:"14px 0 4px"}}>
          <button onClick={()=>{ if(asOverlay){ closeOverlay(); } else { setWelcomeSeen(true); setScreen(SCREENS.HOME); setNav("home"); } }}
            style={{background:"none",border:"none",fontFamily:"var(--fn)",fontSize:13,color:"var(--kl)",cursor:"pointer",padding:8}}>
            {asOverlay?L.d_close:L.skip_later}
          </button>
        </div>
      </div>
    );

    // WIZARD frame (w1/w2/w3) — funzione che ritorna JSX (NON componente nidificato,
    // altrimenti React rimonterebbe l'input ad ogni tasto e il cursore tornerebbe a 0)
    const wizardFrame = ({step, children, canNext, onNext, backTo}) => (
      <div key={"wiz-"+step} style={{padding:"20px 22px 24px",flex:1,overflowY:"auto"}} className="anim">
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setWelcomeView("welcome")}
            style={{width:32,height:32,background:"white",border:"1px solid var(--sm)",borderRadius:10,cursor:"pointer",fontSize:14}}>✕</button>
          <div style={{display:"flex",gap:5,flex:1}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{height:4,flex:1,borderRadius:2,background:i<=step?"var(--tc)":"var(--sm)",transition:"background .2s"}}/>
            ))}
          </div>
          <span style={{fontSize:11,fontWeight:700,color:"var(--km)",letterSpacing:.5,textTransform:"uppercase"}}>{L.d_step} {step+1}/3</span>
        </div>
        {children}
        <div style={{display:"flex",gap:8,marginTop:22}}>
          {backTo&&<button className="btn sd" style={{flex:1}} onClick={()=>setWelcomeView(backTo)}>{L.d_back}</button>}
          <button className="btn tc" style={{flex:backTo?2:1,opacity:canNext?1:.5,cursor:canNext?"pointer":"not-allowed"}}
            disabled={!canNext} onClick={()=>canNext&&onNext()}>
            {step<2?L.d_next:L.d_finish}
          </button>
        </div>
        <button onClick={()=>setWelcomeView("done")}
          style={{background:"none",border:"none",fontFamily:"var(--fn)",fontSize:12.5,color:"var(--kl)",cursor:"pointer",display:"block",margin:"14px auto 0",padding:4}}>
          {L.d_skip_all}
        </button>
      </div>
    );

    if(welcomeView==="w1") return wizardFrame({step:0, backTo:"welcome", canNext:wizFamilyName.trim().length>0, onNext:()=>setWelcomeView("w2"), children:(
      <>
        <div style={{width:68,height:68,borderRadius:20,background:"var(--tp)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,marginBottom:16}}>🏡</div>
        <div style={{fontFamily:"var(--fs)",fontSize:24,fontWeight:600,color:"var(--k)",lineHeight:1.25,marginBottom:8}}>{L.d_s1_h}</div>
        <div style={{fontSize:14,color:"var(--km)",lineHeight:1.55,marginBottom:20,fontWeight:300}}>{L.d_s1_s}</div>
        <input className="inp" dir="ltr" autoFocus placeholder={L.d_s1_ph} value={wizFamilyName} onChange={e=>setWizFamilyName(e.target.value)}/>
      </>
    )});

    if(welcomeView==="w2") return wizardFrame({step:1, backTo:"w1", canNext:wizMemberName.trim().length>0, onNext:()=>setWelcomeView("w3"), children:(
      <>
        <div style={{width:68,height:68,borderRadius:20,background:"var(--ab)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,marginBottom:16}}>👤</div>
        <div style={{fontFamily:"var(--fs)",fontSize:24,fontWeight:600,color:"var(--k)",lineHeight:1.25,marginBottom:8}}>{L.d_s2_h}</div>
        <div style={{fontSize:14,color:"var(--km)",lineHeight:1.55,marginBottom:16,fontWeight:300}}>{L.d_s2_s}</div>
        <input className="inp" dir="ltr" placeholder={L.d_s2_ph} value={wizMemberName} onChange={e=>setWizMemberName(e.target.value)} style={{marginBottom:14}}/>
        <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:.6,textTransform:"uppercase",marginBottom:8}}>{L.d_s2_rel}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {L.rels.map(r=>(
            <div key={r} onClick={()=>setWizMemberRel(r)}
              style={{padding:"8px 13px",background:wizMemberRel===r?"var(--k)":"white",color:wizMemberRel===r?"white":"var(--k)",border:"1.5px solid "+(wizMemberRel===r?"var(--k)":"var(--sm)"),borderRadius:100,fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"var(--fn)"}}>
              {r}
            </div>
          ))}
        </div>
      </>
    )});

    if(welcomeView==="w3") return wizardFrame({step:2, backTo:"w2", canNext:wizTaskTitle.trim().length>0, onNext:finishWizard, children:(
      <>
        <div style={{width:68,height:68,borderRadius:20,background:"var(--amB)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,marginBottom:16}}>✅</div>
        <div style={{fontFamily:"var(--fs)",fontSize:24,fontWeight:600,color:"var(--k)",lineHeight:1.25,marginBottom:8}}>{L.d_s3_h}</div>
        <div style={{fontSize:14,color:"var(--km)",lineHeight:1.55,marginBottom:20,fontWeight:300}}>{L.d_s3_s}</div>
        <input className="inp" dir="ltr" autoFocus placeholder={L.d_s3_ph} value={wizTaskTitle} onChange={e=>setWizTaskTitle(e.target.value)}/>
      </>
    )});

    if(welcomeView==="done") return (
      <div style={{padding:"22px 22px 26px",flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}} className="anim">
        <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
          <div style={{width:86,height:86,borderRadius:26,background:"var(--gnB)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:42}}>🎉</div>
        </div>
        <div style={{fontFamily:"var(--fs)",fontSize:26,fontWeight:600,color:"var(--k)",textAlign:"center",marginBottom:8}}>{L.done_h}</div>
        <div style={{fontSize:14,color:"var(--km)",textAlign:"center",lineHeight:1.55,marginBottom:22,fontWeight:300}}>{L.done_s}</div>
        {(wizFamilyName||wizMemberName||wizTaskTitle)&&(
          <div style={{background:"white",border:"1.5px solid var(--sm)",borderRadius:16,padding:12,marginBottom:18}}>
            {wizFamilyName&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 4px"}}>
              <span style={{fontSize:20}}>🏠</span>
              <div style={{fontSize:13.5,fontWeight:600,color:"var(--k)"}}>{wizFamilyName}</div>
            </div>}
            {wizMemberName&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 4px",borderTop:"1px solid var(--s)"}}>
              <span style={{fontSize:20}}>👤</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5,fontWeight:600,color:"var(--k)"}}>{wizMemberName}</div>
                {wizMemberRel&&<div style={{fontSize:11,color:"var(--kl)",marginTop:1}}>{wizMemberRel}</div>}
              </div>
            </div>}
            {wizTaskTitle&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 4px",borderTop:"1px solid var(--s)"}}>
              <span style={{fontSize:20}}>✅</span>
              <div style={{fontSize:13.5,fontWeight:600,color:"var(--k)"}}>{wizTaskTitle}</div>
            </div>}
          </div>
        )}
        <button className="btn tc" onClick={finishWizard}>{L.done_cta}</button>
        <button onClick={resetWizard}
          style={{background:"none",border:"none",fontFamily:"var(--fn)",fontSize:12.5,color:"var(--kl)",cursor:"pointer",display:"block",margin:"14px auto 0",padding:4}}>
          {L.done_restart}
        </button>
      </div>
    );

    return null;
  };

  // ── HOME ──
  const renderHome = () => (
    <>
      <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>
      <div style={{background:"linear-gradient(160deg,var(--tp) 0%,var(--s) 70%)",padding:"10px 20px 14px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"var(--fs)",fontSize:21,fontWeight:600,color:"var(--k)",letterSpacing:-.4}}>Ciao, Raffael 👋</div>
            <div style={{fontSize:12,color:"var(--km)",marginTop:1}}>{circles.length} famiglie · {visTasks.filter(t=>t.status==="todo").length} incarichi aperti</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setShowWelcomeOverlay(true)} title="Guida"
              style={{width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",background:"white",border:"1.5px solid var(--sm)",borderRadius:11,fontFamily:"var(--fn)",fontSize:16,fontWeight:700,color:"var(--km)",cursor:"pointer"}}>?</button>
            <button onClick={()=>setShowModal(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 15px",background:"var(--tc)",border:"none",borderRadius:12,fontFamily:"var(--fn)",fontSize:13,fontWeight:700,color:"white",cursor:"pointer",boxShadow:"0 3px 10px rgba(201,106,58,.3)"}}>+ Nuovo</button>
            <div style={{width:34,height:34,borderRadius:11,background:"var(--k)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"white",cursor:"pointer"}}
              onClick={()=>{setPrevScreen(screen);setScreen(SCREENS.PROFILE);}}>R</div>
          </div>
        </div>
      </div>

      {/* Circle switcher */}
      <div className="csw">
        <div className={"chip "+(activeCircle==="all"?"on":"off")} onClick={()=>setActiveCircle("all")}>Tutte</div>
        {circles.map(c=>(
          <div key={c.id} className={"chip "+(activeCircle===c.id?"on":"off")} style={activeCircle===c.id?{background:c.color,borderColor:c.color}:{}} onClick={()=>setActiveCircle(c.id)}>
            {c.emoji} {c.name}
          </div>
        ))}
      </div>

      <div className="scr">
        {/* URGENZE in cima */}
        {urgent.length>0&&(
          <div style={{padding:"10px 14px 0"}}>
            <div className="sh" style={{padding:"0 0 8px"}}>
              <div className="shb" style={{background:"var(--rd)"}}/>
              <span className="shl" style={{color:"var(--rd)"}}>🚨 Urgente</span>
              <span className="shn" style={{background:"var(--rdB)",color:"var(--rd)"}}>{urgent.length}</span>
            </div>
            {urgent.map(t=><TCard key={t.id} task={t} full/>)}
          </div>
        )}

        {/* LE MIE COSE */}
        <div className="sh">
          <div className="shb" style={{background:"var(--tc)"}}/>
          <span className="shl">Le mie cose</span>
          {myOpen.length>0&&<span className="shn" style={{background:"var(--tc)",color:"white"}}>{myOpen.length}</span>}
          {myDone.length>0&&<button onClick={()=>setShowMyDone(s=>!s)} style={{marginLeft:"auto",fontSize:11,color:"var(--kl)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--fn)"}}>{showMyDone?"Nascondi ✓":myDone.length+" completati"}</button>}
        </div>
        <div style={{padding:"0 14px"}}>
          {myOpen.length===0&&<div style={{background:"var(--gnB)",border:"1.5px solid var(--gn)",borderRadius:15,padding:"12px 15px",display:"flex",alignItems:"center",gap:11,marginBottom:6}}>
            <span style={{fontSize:22}}>🎉</span>
            <div><div style={{fontSize:14,fontWeight:600,color:"var(--gn)"}}>Tutto in ordine!</div><div style={{fontSize:12,color:"var(--gn)",opacity:.8,marginTop:1}}>Nessun incarico aperto per te</div></div>
          </div>}
          {myOpen.map(t=><RCard key={t.id} task={t}/>)}
          {showMyDone&&myDone.map(t=><RCard key={t.id} task={t} dimmed/>)}
        </div>

        {/* DIVISORE FAMIGLIA */}
        <div className="sep"><div className="sepl"/><div className="sepp"><span style={{fontSize:13}}>👨‍👩‍👧</span><span style={{fontSize:11,fontWeight:700,color:"var(--km)",letterSpacing:.5,textTransform:"uppercase"}}>Famiglia</span></div><div className="sepl"/></div>

        {/* DA ASSEGNARE */}
        <div className="sh">
          <div className="shb" style={{background:"var(--am)"}}/>
          <span className="shl">Da assegnare</span>
          {pool.length>0?<span className="shn" style={{background:"var(--amB)",color:"var(--am)"}}>{pool.length}</span>:<span style={{fontSize:11,color:"var(--kl)"}}>— tutto assegnato 👍</span>}
        </div>
        <div style={{padding:"0 14px"}}>
          {pool.map(t=><TCard key={t.id} task={t} full/>)}
          {pool.length===0&&<div style={{padding:"10px 13px",background:"var(--s)",borderRadius:13,fontSize:13,color:"var(--kl)"}}>Tutti gli incarichi sono assegnati.</div>}
        </div>

        {/* GESTITI DA ALTRI (accordion) */}
        {others.length>0&&(
          <div style={{padding:"4px 14px 8px"}}>
            <button onClick={()=>setShowOthers(s=>!s)} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"12px 13px",background:showOthers?"white":"var(--s)",border:"1px solid var(--sm)",borderRadius:showOthers?"15px 15px 0 0":15,cursor:"pointer",fontFamily:"var(--fn)",transition:"all .2s"}}>
              <div style={{width:3,height:16,borderRadius:2,background:"var(--ac)",flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:700,color:"var(--k)",letterSpacing:.4,textTransform:"uppercase",flex:1,textAlign:"left"}}>Gestiti da altri</span>
              <span className="shn" style={{background:"var(--ab)",color:"var(--ac)"}}>{others.length}</span>
              <span style={{fontSize:12,color:"var(--kl)",transform:showOthers?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}>▼</span>
            </button>
            {showOthers&&(
              <div style={{background:"white",border:"1px solid var(--sm)",borderTop:"none",borderRadius:"0 0 15px 15px",overflow:"hidden"}}>
                {others.map((t,i)=>{
                  const cir=circles.find(c=>c.id===t.circleId);
                  return (
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:11,padding:"12px 13px",borderTop:i>0?"1px solid var(--s)":"none",cursor:"pointer"}}
                      onClick={()=>{setSelTask(t.id);setScreen(SCREENS.TASK_DETAIL);}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"var(--s)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{CAT[t.category]}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:"var(--k)"}}>{t.title}</div>
                        <div style={{fontSize:11,color:"var(--ac)",marginTop:1,fontWeight:600}}>→ {t.takenBy}{cir&&activeCircle==="all"?" · "+cir.emoji:""}</div>
                      </div>
                      <span style={{fontSize:14,color:"var(--kl)"}}>›</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* DA PAGARE */}
        {toPay.length>0&&(
          <div style={{padding:"4px 14px 14px"}}>
            <div className="sh" style={{padding:"4px 0 8px"}}><div className="shb" style={{background:"var(--rd)"}}/><span className="shl">Da pagare</span><span className="shn" style={{background:"var(--rdB)",color:"var(--rd)"}}>{toPay.length}</span></div>
            {toPay.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:11,padding:13,background:"var(--rdB)",border:"1.5px solid #F5C6C3",borderRadius:15,marginBottom:8,cursor:"pointer"}}
                onClick={()=>{setSelTask(t.id);setScreen(SCREENS.TASK_DETAIL);}}>
                <span style={{fontSize:22}}>💶</span>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"var(--k)"}}>{t.title}</div><div style={{fontSize:11,color:"var(--rd)",marginTop:1}}>Scade {t.date}</div></div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--rd)"}}>€{t.amount?.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{height:20}}/>
      </div>
    </>
  );

  // ── TASK DETAIL ──
  const renderTaskDetail = () => {
    const task = tasks.find(t=>t.id===selTask); if(!task) return null;
    const circle = circles.find(c=>c.id===task.circleId);
    const isDone = task.status==="done", isTodo = task.status==="todo", isTaken = task.status==="taken";
    const alreadyMine = task.takenBy==="Raffael";
    const cMems = circle?.members||[];
    const mColors = Object.fromEntries(cMems.map(m=>[m.name,m.color]));
    const cNames = task.coupleIds?.map(id=>circle?.members.find(m=>m.id===id)?.name.split(" ")[0]).filter(Boolean).join(" e ")||"";

    return (
      <>
        <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>
        <div className="brow" style={{paddingBottom:8}}>
          <button className="bbtn" onClick={()=>{setReplyMode(null);setShowDelegate(false);setScreen(SCREENS.HOME);}}>←</button>
          <span style={{fontSize:14,fontWeight:600,color:"var(--km)"}}>Bacheca</span>
          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
            {task.urgent&&<UrgBadge/>}
            <Sp status={task.status}/>
          </div>
        </div>

        <div className="scr">
          {/* Task header */}
          <div style={{padding:"8px 18px 14px",borderBottom:"1px solid var(--sm)"}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:46,height:46,borderRadius:15,background:task.category==="care"?"#FEF3EC":task.category==="home"?"var(--s)":task.category==="health"?"#F2F9F5":"#F3F5FC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{CAT[task.category]||"\uD83D\uDCCC"}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:5}}>
                  {task.visibility==="couple"&&<VisBadge vis="couple" coupleNames={cNames}/>}
                  {circle&&<CirBadge circle={circle}/>}
                </div>
                <div style={{fontFamily:"var(--fs)",fontSize:19,fontWeight:600,color:"var(--k)",lineHeight:1.3,letterSpacing:-.3}}>{task.title}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
                  <span style={{fontSize:12,color:"var(--kl)"}}>📅 {task.date}</span>
                  <span style={{fontSize:12,color:"var(--kl)"}}>da {task.author}</span>
                  {task.takenBy&&<span style={{fontSize:12,color:"var(--ac)",fontWeight:600}}>→ {task.takenBy}</span>}
                </div>
              </div>
            </div>
            {task.note&&<div style={{marginTop:11,padding:"11px 13px",background:"var(--s)",borderRadius:13,fontSize:13,color:"var(--km)",lineHeight:1.5}}>{task.note}</div>}
            {task.hasExpense&&(
              <div style={{marginTop:11,background:"var(--rdB)",border:"1.5px solid #F5C6C3",borderRadius:14,padding:14}}>
                <div style={{fontSize:26,fontWeight:700,color:"var(--rd)"}}>€ {task.expenseAmount?.toFixed(2)}</div>
                <div style={{fontSize:12,color:"var(--rd)",marginTop:2}}>Pagato da {task.paidBy} · rimborso da {task.reimburseFrom}</div>
              </div>
            )}
          </div>

          {/* Thread */}
          <div style={{padding:"14px 18px 0"}}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:13}}>
              Thread · {task.responses.length} {task.responses.length===1?"risposta":"risposte"}
            </div>
            {task.responses.length===0&&<div style={{textAlign:"center",padding:"16px 0 20px",color:"var(--kl)",fontSize:13}}>Nessuna risposta ancora. Sii il primo!</div>}
            {task.responses.map((r,i)=>{
              const isMe=r.user==="Raffael";
              const isUrgent=r.type==="urgent";
              return (
                <div key={i} style={{display:"flex",gap:9,marginBottom:14,flexDirection:isMe?"row-reverse":"row"}}>
                  <div style={{width:30,height:30,borderRadius:9,background:isUrgent?"var(--rd)":mColors[r.user]||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"white",flexShrink:0}}>{isUrgent?"\uD83D\uDEA8":r.user[0]}</div>
                  <div style={{maxWidth:"74%"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--km)",marginBottom:3,textAlign:isMe?"right":"left"}}>{isMe?"Tu":r.user}</div>
                    <div style={{padding:"10px 13px",borderRadius:isMe?"15px 4px 15px 15px":"4px 15px 15px 15px",
                      background:isUrgent?"var(--rdB)":isMe?"var(--k)":r.type==="spostare"?"var(--amB)":"var(--s)",
                      border:isUrgent?"1.5px solid #F5C6C3":"none",
                      color:isUrgent?"var(--rd)":isMe?"white":"var(--k)",fontSize:13,lineHeight:1.45}}>
                      {r.text.split(/(@\w+(?:\s\w+)?)/g).map((part,pi)=>
                        /^@\w+/.test(part)
                          ? <span key={pi} style={{fontWeight:700,background:isMe?"rgba(255,255,255,.2)":"var(--ab)",color:isMe?"white":"var(--ac)",padding:"1px 5px",borderRadius:5,fontSize:12}}>{part}</span>
                          : part
                      )}
                    </div>
                    <div style={{fontSize:10,color:"var(--kl)",marginTop:3,textAlign:isMe?"right":"left"}}>{r.time}</div>
                  </div>
                </div>
              );
            })}

            {/* ── REPLY ACTIONS ── */}
            {!isDone&&replyMode===null&&!showDelegate&&(
              <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:8}}>
                {isTodo&&<>
                  <button style={{width:"100%",padding:"16px",background:"linear-gradient(135deg,var(--tc) 0%,#B05A2A 100%)",border:"none",borderRadius:16,fontFamily:"var(--fn)",fontSize:16,fontWeight:700,color:"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 6px 18px rgba(201,106,58,.35)",letterSpacing:-.2}}
                    onClick={()=>{updTask(task.id,{status:"taken",takenBy:"Raffael"});addResp(task.id,"Me ne occupo io \u2713");toast_("\u2713 Preso in carico!");}}>
                    <span style={{fontSize:20}}>✋</span> Me ne occupo io
                  </button>
                  {/* Assegna */}
                  <div style={{background:"var(--ab)",border:"1.5px solid #B5D4F4",borderRadius:15,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--ac)",letterSpacing:1,textTransform:"uppercase",marginBottom:9}}>👤 Assegna a</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {cMems.filter(m=>!m.isMe).map(m=>(
                        <button key={m.id} onClick={()=>{updTask(task.id,{status:"taken",takenBy:m.name});addResp(task.id,"Ho assegnato a @"+m.name);toast_("\uD83D\uDD14 @"+m.name+" notificato");}}
                          style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 12px",background:"white",border:"1.5px solid var(--sm)",borderRadius:13,cursor:"pointer",fontFamily:"var(--fn)"}}>
                          <Av n={m.av} color={m.color} size={34} r={10} fs={13}/>
                          <span style={{fontSize:12,fontWeight:600,color:"var(--k)"}}>{m.name.split(" ")[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:7}}>
                    <button style={{flex:1,padding:"11px",background:"var(--amB)",border:"1.5px solid var(--am)",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"#7A5A00",cursor:"pointer"}} onClick={()=>setReplyMode("spostare")}>📅 Proponi data</button>
                    <button style={{flex:1,padding:"11px",background:"var(--s)",border:"1.5px solid var(--sm)",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--k)",cursor:"pointer"}} onClick={()=>setReplyMode("altro")}>✏️ Scrivi</button>
                  </div>
                </>}
                {isTaken&&<div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {/* IMPREVISTO / DELEGA URGENTE */}
                  {alreadyMine&&(
                    <button style={{padding:"13px",background:"var(--rdB)",border:"1.5px solid #F5C6C3",borderRadius:14,fontFamily:"var(--fn)",fontSize:14,fontWeight:600,color:"var(--rd)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}
                      onClick={()=>setShowDelegate(true)}>
                      🚨 Ho un imprevisto — delego
                    </button>
                  )}
                  {!alreadyMine&&<button style={{padding:"13px",background:"var(--ab)",border:"1.5px solid var(--ac)",borderRadius:14,fontFamily:"var(--fn)",fontSize:14,fontWeight:600,color:"var(--ac)",cursor:"pointer"}} onClick={()=>{updTask(task.id,{takenBy:"Raffael"});addResp(task.id,"No aspetta \u2014 vado io!");toast_("\uD83D\uDE4B Preso da te!");}}>🙋 No, vado io!</button>}
                  {alreadyMine&&<div style={{padding:"12px 13px",background:"var(--gnB)",border:"1.5px solid var(--gn)",borderRadius:13,fontSize:13,color:"var(--gn)",fontWeight:500}}>✓ Sei tu il responsabile</div>}
                  <div style={{display:"flex",gap:7}}>
                    <button style={{flex:1,padding:"11px",background:"var(--amB)",border:"1.5px solid var(--am)",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"#7A5A00",cursor:"pointer"}} onClick={()=>setReplyMode("spostare")}>📅 Proponi data</button>
                    <button style={{flex:1,padding:"11px",background:"var(--s)",border:"none",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--k)",cursor:"pointer"}} onClick={()=>setReplyMode("altro")}>✏️ Commenta</button>
                  </div>
                </div>}
                {task.status==="to_pay"&&<div style={{display:"flex",flexDirection:"column",gap:7}}>
                  <button className="btn k" onClick={()=>{updTask(task.id,{status:"done",hasExpense:true,expenseAmount:task.amount,paidBy:"Raffael"});addResp(task.id,"Ho pagato io \uD83D\uDCB6");}}>💸 Pago io</button>
                  <div style={{display:"flex",gap:7}}>
                    <button style={{flex:1,padding:"11px",background:"var(--amB)",border:"1.5px solid var(--am)",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"#7A5A00",cursor:"pointer"}} onClick={()=>setReplyMode("spostare")}>⏳ Posticipo</button>
                    <button style={{flex:1,padding:"11px",background:"var(--s)",border:"none",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--k)",cursor:"pointer"}} onClick={()=>setReplyMode("altro")}>✏️ Nota</button>
                  </div>
                </div>}
              </div>
            )}

            {/* ── DELEGA URGENTE ── */}
            {showDelegate&&(
              <div style={{background:"var(--rdB)",border:"2px solid #F5C6C3",borderRadius:18,padding:16,marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--rd)",marginBottom:4}}>🚨 Delega urgente</div>
                <div style={{fontSize:12,color:"var(--rd)",opacity:.8,marginBottom:14,lineHeight:1.5}}>
                  L'incarico torner\u00e0 in bacheca come urgente. Scegli a chi delegare o lascia aperto a tutti.
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                  {cMems.filter(m=>!m.isMe).map(m=>(
                    <button key={m.id} onClick={()=>delegateUrgent(task.id,m.name)}
                      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 12px",background:"white",border:"1.5px solid #F5C6C3",borderRadius:13,cursor:"pointer",fontFamily:"var(--fn)"}}>
                      <Av n={m.av} color={m.color} size={34} r={10} fs={13}/>
                      <span style={{fontSize:12,fontWeight:600,color:"var(--k)"}}>{m.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button onClick={()=>setShowDelegate(false)} style={{flex:1,padding:"11px",background:"white",border:"1.5px solid #F5C6C3",borderRadius:12,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--rd)",cursor:"pointer"}}>Annulla</button>
                  <button onClick={()=>delegateUrgent(task.id,null)} style={{flex:2,padding:"11px",background:"var(--rd)",border:"none",borderRadius:12,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"white",cursor:"pointer"}}>🚨 Delega a chiunque</button>
                </div>
              </div>
            )}

            {/* Proponi data */}
            {replyMode==="spostare"&&(
              <div style={{background:"var(--amB)",border:"1.5px solid var(--am)",borderRadius:17,padding:14,marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:600,color:"#7A5A00",marginBottom:10}}>📅 Proponi una nuova data</div>
                <div style={{background:"white",borderRadius:13,padding:12,border:"1px solid #E9D39A",marginBottom:10}}>
                  <DatePicker value={replyDate} onChange={setReplyDate} accent="#7A5A00" accentBg="#FEF7E0"/>
                </div>
                {replyDate&&<div style={{fontSize:12,color:"#7A5A00",fontWeight:600,marginBottom:9,textAlign:"center"}}>Proposta: <span style={{textTransform:"capitalize"}}>{formatDateShort(replyDate)}</span></div>}
                <textarea placeholder="Messaggio (facoltativo)" value={replyText} onChange={e=>setReplyText(e.target.value)} style={{width:"100%",padding:"9px 12px",background:"white",border:"1px solid #D4A017",borderRadius:11,fontFamily:"var(--fn)",fontSize:13,resize:"none",outline:"none",minHeight:55,color:"var(--k)"}}/>
                <div style={{display:"flex",gap:7,marginTop:9}}>
                  <button onClick={()=>{setReplyMode(null);setReplyDate(null);setReplyText("");}} style={{flex:1,padding:"10px",background:"white",border:"1.5px solid #D4A017",borderRadius:11,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"#7A5A00",cursor:"pointer"}}>Annulla</button>
                  <button onClick={()=>submitReply(task.id,(replyDate?"📅 Propongo: "+formatDateShort(replyDate):"")+(replyText?" — "+replyText:""),{})} style={{flex:2,padding:"10px",background:replyDate?"#7A5A00":"#D4A01766",border:"none",borderRadius:11,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"white",cursor:replyDate?"pointer":"not-allowed"}} disabled={!replyDate}>Invia proposta</button>
                </div>
              </div>
            )}

            {/* Scrivi con @mention */}
            {replyMode==="altro"&&(
              <div style={{background:"var(--s)",border:"1.5px solid var(--sd)",borderRadius:17,padding:14,marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--km)",marginBottom:8}}>✏️ Scrivi — digita <span style={{background:"var(--ab)",color:"var(--ac)",padding:"1px 6px",borderRadius:5,fontFamily:"monospace",fontSize:11}}>@nome</span> per taggare</div>
                {mentionPop&&(
                  <div style={{background:"white",border:"1.5px solid var(--sm)",borderRadius:13,padding:7,marginBottom:8,boxShadow:"0 4px 14px rgba(28,22,17,.1)"}}>
                    {cMems.filter(m=>!m.isMe).map(m=>(
                      <button key={m.id} onClick={()=>insertMention(m.name)} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"9px",background:"none",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"var(--fn)"}} onMouseOver={e=>e.currentTarget.style.background="var(--s)"} onMouseOut={e=>e.currentTarget.style.background="none"}>
                        <Av n={m.av} color={m.color} size={28} r={8} fs={11}/>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--k)"}}>@{m.name}</div>
                      </button>
                    ))}
                  </div>
                )}
                <textarea autoFocus placeholder="Scrivi... digita @ per taggare" value={replyText} onChange={e=>handleMention(e.target.value)}
                  style={{width:"100%",padding:"11px 13px",background:"white",border:"1.5px solid var(--sm)",borderRadius:13,fontFamily:"var(--fn)",fontSize:14,resize:"none",outline:"none",minHeight:75,color:"var(--k)",lineHeight:1.5}}
                  onFocus={e=>e.target.style.borderColor="var(--k)"} onBlur={e=>e.target.style.borderColor="var(--sm)"}/>
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"var(--kl)",alignSelf:"center"}}>Tagga:</span>
                  {cMems.filter(m=>!m.isMe).map(m=>(
                    <button key={m.id} onClick={()=>insertMention(m.name)} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",background:"white",border:"1.5px solid var(--sm)",borderRadius:100,fontFamily:"var(--fn)",fontSize:12,fontWeight:600,color:"var(--k)",cursor:"pointer"}}>
                      <div style={{width:15,height:15,borderRadius:4,background:m.color,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:8,fontWeight:700}}>{m.av}</div>
                      @{m.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:7,marginTop:10}}>
                  <button onClick={()=>{setReplyMode(null);setReplyText("");setMentionPop(false);}} style={{flex:1,padding:"10px",background:"var(--sd)",border:"none",borderRadius:11,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--k)",cursor:"pointer"}}>Annulla</button>
                  <button onClick={()=>submitReply(task.id,replyText,{})} style={{flex:2,padding:"10px",background:replyText.trim()?"var(--k)":"var(--sd)",border:"none",borderRadius:11,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"white",cursor:replyText.trim()?"pointer":"default"}}>Invia →</button>
                </div>
              </div>
            )}
            <div style={{height:24}}/>
          </div>
        </div>

        {/* Bottom bar */}
        {!isDone&&(
          <div style={{padding:"13px 18px",borderTop:"1px solid var(--sm)",background:"white",flexShrink:0}}>
            <div style={{display:"flex",gap:8}}>
              <button className="btn gn" style={{flex:1}} onClick={()=>{updTask(task.id,{status:"done"});addResp(task.id,"Completato \u2705");toast_("\u2705 Fatto!");}}>✅ Segna come fatto</button>
              {!task.hasExpense&&task.status!=="to_pay"&&(
                <button style={{flex:1,padding:"13px",background:"white",border:"1.5px solid var(--sm)",borderRadius:13,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--k)",cursor:"pointer"}}
                  onClick={()=>{updTask(task.id,{hasExpense:true,expenseAmount:45,paidBy:"Raffael",reimburseFrom:task.author});addResp(task.id,"Ho anticipato la spesa \uD83D\uDCB6");toast_("\uD83D\uDCB6 Spesa registrata");}}>
                  💶 Pagato da me
                </button>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  // ── FAMILY SCREEN — accordion ──
  const renderFamily = () => {
    return (
      <>
        <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>

        {/* Header */}
        <div style={{padding:"10px 18px 14px",background:"linear-gradient(160deg,var(--tp) 0%,var(--s) 70%)",flexShrink:0}}>
          <div style={{fontFamily:"var(--fs)",fontSize:21,fontWeight:600,color:"var(--k)",letterSpacing:-.4}}>Le mie famiglie</div>
          <div style={{fontSize:12,color:"var(--km)",marginTop:2}}>{circles.length} {circles.length===1?"famiglia":"famiglie"} · {circles.reduce((t,c)=>t+c.members.length,0)} membri totali</div>
        </div>

        <div className="scr" style={{padding:"12px 14px 0"}}>

          {/* ACCORDION per ogni famiglia */}
          {circles.map((circle,ci) => {
            const isOpen = !!expandedCircles[circle.id];
            const isEditing = editingCircle===circle.id;
            return (
              <div key={circle.id} style={{marginBottom:12}}>

                {/* Famiglia header row */}
                <div style={{background:"white",border:"1.5px solid "+circle.color+"44",borderRadius:isOpen?"18px 18px 0 0":18,overflow:"hidden",transition:"border-radius .2s"}}>
                  {isEditing ? (
                    /* Edit famiglia mode */
                    <div style={{padding:"14px 16px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Modifica famiglia</div>
                      {/* Emoji picker */}
                      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
                        {EMOJIS.map(e=>(
                          <button key={e} onClick={()=>setEditCircleEmoji(e)}
                            style={{width:36,height:36,borderRadius:10,border:"1.5px solid",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                              background:editCircleEmoji===e?circle.color+"22":"var(--s)",borderColor:editCircleEmoji===e?circle.color:"transparent"}}>
                            {e}
                          </button>
                        ))}
                      </div>
                      <input className="inp" placeholder="Nome famiglia" value={editCircleName} onChange={e=>setEditCircleName(e.target.value)} style={{marginBottom:10}}/>
                      <div style={{display:"flex",gap:7}}>
                        <button className="btn sd" style={{flex:1,padding:"11px",fontSize:13}} onClick={()=>setEditingCircle(null)}>Annulla</button>
                        <button className="btn tc" style={{flex:2,padding:"11px",fontSize:13}} onClick={saveCircle}>Salva →</button>
                      </div>
                    </div>
                  ) : (
                    /* Normal header */
                    <div style={{display:"flex",alignItems:"center",gap:0}}>
                      <button style={{flex:1,display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--fn)"}}
                        onClick={()=>toggleCircle(circle.id)}>
                        <div style={{width:44,height:44,borderRadius:13,background:circle.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{circle.emoji}</div>
                        <div style={{flex:1,textAlign:"left"}}>
                          <div style={{fontSize:15,fontWeight:700,color:"var(--k)",letterSpacing:-.2}}>{circle.name}</div>
                          <div style={{fontSize:12,color:"var(--km)",marginTop:2}}>{circle.members.length} membri</div>
                        </div>
                        <span style={{fontSize:14,color:"var(--kl)",marginRight:4,transform:isOpen?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}>▼</span>
                      </button>
                      {/* Edit pencil */}
                      <button onClick={()=>startEditCircle(circle)}
                        style={{width:36,height:36,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"var(--kl)",marginRight:10}}>
                        ✏️
                      </button>
                    </div>
                  )}
                </div>

                {/* Members list (expanded) */}
                {isOpen&&!isEditing&&(
                  <div style={{background:"var(--s)",border:"1.5px solid "+circle.color+"33",borderTop:"none",borderRadius:"0 0 18px 18px",overflow:"hidden"}}>
                    {circle.members.map((m,mi) => {
                      const isEditM = editingMember?.circleId===circle.id && editingMember?.memberId===m.id;
                      return (
                        <div key={m.id} style={{borderTop:mi>0?"1px solid var(--sm)":"none"}}>
                          {isEditM ? (
                            /* Edit member form */
                            <div style={{padding:"14px 14px",background:"white"}}>
                              <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Modifica membro</div>
                              {/* Color chips */}
                              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                                {MEMBER_COLORS_LIST.map(c=>(
                                  <button key={c} onClick={()=>setEditMemberData(p=>({...p,color:c}))}
                                    style={{width:26,height:26,borderRadius:8,background:c,border:editMemberData.color===c?"3px solid var(--k)":"3px solid transparent",cursor:"pointer"}}/>
                                ))}
                              </div>
                              <input className="inp" placeholder="Nome e cognome" value={editMemberData.name||""} onChange={e=>setEditMemberData(p=>({...p,name:e.target.value,av:e.target.value[0]||p.av}))} style={{marginBottom:8}}/>
                              {/* Relationship dropdown */}
                              <div style={{fontSize:11,fontWeight:600,color:"var(--kl)",letterSpacing:.5,textTransform:"uppercase",marginBottom:6}}>Relazione</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                                {RELATIONSHIPS.map(r=>(
                                  <button key={r} onClick={()=>setEditMemberData(p=>({...p,role:r,relationship:r}))}
                                    style={{padding:"6px 11px",borderRadius:100,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .1s",
                                      background:editMemberData.role===r?"var(--k)":"white",borderColor:editMemberData.role===r?"var(--k)":"var(--sm)",color:editMemberData.role===r?"white":"var(--k)"}}>
                                    {r}
                                  </button>
                                ))}
                              </div>
                              <input className="inp" placeholder="Partner (es. Alessandro)" value={editMemberData.partner||""} onChange={e=>setEditMemberData(p=>({...p,partner:e.target.value}))} style={{marginBottom:10}}/>
                              <div style={{display:"flex",gap:7}}>
                                <button className="btn sd" style={{flex:1,padding:"11px",fontSize:13}} onClick={()=>setEditingMember(null)}>Annulla</button>
                                {!m.isMe&&<button className="btn rd" style={{flex:1,padding:"11px",fontSize:13}} onClick={()=>{removeMember(circle.id,m.id);setEditingMember(null);}}>🗑️ Rimuovi</button>}
                                <button className="btn tc" style={{flex:2,padding:"11px",fontSize:13}} onClick={saveMember}>Salva →</button>
                              </div>
                            </div>
                          ) : (
                            /* Normal member row */
                            <div style={{display:"flex",alignItems:"center",gap:11,padding:"12px 14px",background:"white",cursor:"pointer"}}
                              onClick={()=>startEditMember(circle.id,m)}>
                              <Av n={m.av||m.name[0]} color={m.color} size={40} r={12} fs={15}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:14,fontWeight:600,color:"var(--k)"}}>{m.name}{m.isMe&&<span style={{fontSize:11,color:"var(--kl)",fontWeight:400}}> — tu</span>}</div>
                                <div style={{fontSize:11,color:"var(--kl)",marginTop:1}}>{m.role||m.relationship}{m.partner?" · partner: "+m.partner:""}{m.kids?" · figli: "+m.kids.join(", "):""}</div>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:7}}>
                                <span className={"blab "+(m.status==="active"?"active":"pending")}>{m.status==="active"?"Attivo":"In attesa"}</span>
                                {!m.isMe&&<button onClick={e=>{e.stopPropagation();setInviteMember(m);setShowInvite(true);}}
                                  style={{width:28,height:28,background:"var(--ab)",border:"none",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>
                                  📨
                                </button>}
                                <span style={{fontSize:14,color:"var(--kl)"}}>›</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add member to this circle */}
                    {showAddMember&&newMember.circleId===circle.id ? (
                      <div style={{padding:"14px",borderTop:"1px solid var(--sm)",background:"white"}}>
                        <input className="inp" placeholder="Nome e cognome" value={newMember.name} onChange={e=>setNewMember(p=>({...p,name:e.target.value}))} style={{marginBottom:8}}/>
                        <div style={{fontSize:11,fontWeight:600,color:"var(--kl)",letterSpacing:.5,textTransform:"uppercase",marginBottom:7}}>Relazione</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                          {RELATIONSHIPS.slice(0,10).map(r=>(
                            <button key={r} onClick={()=>setNewMember(p=>({...p,role:r,relationship:r}))}
                              style={{padding:"6px 11px",borderRadius:100,border:"1.5px solid",fontFamily:"var(--fn)",fontSize:11,fontWeight:600,cursor:"pointer",
                                background:newMember.role===r?"var(--k)":"white",borderColor:newMember.role===r?"var(--k)":"var(--sm)",color:newMember.role===r?"white":"var(--k)"}}>
                              {r}
                            </button>
                          ))}
                        </div>
                        <div style={{display:"flex",gap:7}}>
                          <button className="btn sd" style={{flex:1,padding:"11px",fontSize:13}} onClick={()=>setShowAddMember(false)}>Annulla</button>
                          <button className="btn tc" style={{flex:2,padding:"11px",fontSize:13}} onClick={addMember}>Aggiungi e invita →</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={()=>{setShowAddMember(true);setNewMember(p=>({...p,circleId:circle.id,name:"",role:""}));}}
                        style={{width:"100%",padding:"12px 14px",background:"none",border:"none",fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--km)",cursor:"pointer",display:"flex",alignItems:"center",gap:8,borderTop:"1px dashed var(--sm)"}}>
                        <span style={{width:32,height:32,borderRadius:10,background:"var(--sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>+</span>
                        Aggiungi membro
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Aggiungi nuova famiglia */}
          {!showAddCircle ? (
            <button onClick={()=>setShowAddCircle(true)}
              style={{width:"100%",padding:"14px",border:"2px dashed var(--sd)",borderRadius:18,background:"none",fontFamily:"var(--fn)",fontSize:14,fontWeight:600,color:"var(--km)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:12}}>
              <span style={{width:36,height:36,borderRadius:11,background:"var(--sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>+</span>
              Aggiungi un'altra famiglia
            </button>
          ) : (
            <div style={{background:"white",border:"1.5px solid var(--sm)",borderRadius:18,padding:16,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--k)",marginBottom:12}}>Nuova famiglia</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
                {EMOJIS.map(e=>(
                  <button key={e} onClick={()=>setNewCircle(p=>({...p,emoji:e}))}
                    style={{width:36,height:36,borderRadius:10,border:"1.5px solid",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                      background:newCircle.emoji===e?"var(--ab)":"var(--s)",borderColor:newCircle.emoji===e?"var(--ac)":"transparent"}}>
                    {e}
                  </button>
                ))}
              </div>
              <input className="inp" placeholder="Nome famiglia (es. Famiglia Bianchi)" value={newCircle.name} onChange={e=>setNewCircle(p=>({...p,name:e.target.value}))} style={{marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button className="btn sd" style={{flex:1,padding:"11px",fontSize:13}} onClick={()=>setShowAddCircle(false)}>Annulla</button>
                <button className="btn tc" style={{flex:2,padding:"11px",fontSize:13}} onClick={addCircle}>Crea famiglia →</button>
              </div>
            </div>
          )}

          <div style={{height:20}}/>
        </div>
      </>
    );
  };

  // ── MEMBER DETAIL ──
  const renderMember = () => {
    const m = selMember; if(!m) return null;
    const circle = circles.find(c=>c.id===m.circleId);
    const mTasks = tasks.filter(t=>t.circleId===m.circleId&&(t.takenBy===m.name||t.author===m.name)&&canSeeTask(t));
    return (
      <>
        <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>
        <div className="brow"><button className="bbtn" onClick={()=>setScreen(SCREENS.FAMILY)}>←</button><span style={{fontSize:14,fontWeight:600,color:"var(--km)"}}>Famiglia</span></div>
        <div className="scr" style={{padding:"12px 16px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            <Av n={m.av} color={m.color} size={64} r={20} fs={24}/>
            <div>
              <div style={{fontFamily:"var(--fs)",fontSize:21,fontWeight:600,color:"var(--k)",letterSpacing:-.3}}>{m.name}</div>
              <div style={{fontSize:13,color:"var(--km)",marginTop:3}}>{m.role}</div>
              {m.partner&&<div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>Partner: {m.partner}</div>}
              {m.kids&&<div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>Figli: {m.kids.join(", ")}</div>}
              {circle&&<div style={{marginTop:4}}><CirBadge circle={circle}/></div>}
              <div style={{marginTop:7}}><span className={"blab "+(m.status==="active"?"active":"pending")}>{m.status==="active"?"Attivo su FAMMY":"Invito in attesa"}</span></div>
            </div>
          </div>
          {!m.isMe&&(
            <div style={{display:"flex",gap:8,marginBottom:18}}>
              <button onClick={()=>{setInviteMember(m);setShowInvite(true);}} style={{flex:1,padding:"12px",background:"var(--ab)",border:"1.5px solid var(--ac)",borderRadius:14,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--ac)",cursor:"pointer"}}>
                📨 {m.status==="pending"?"Reinvia invito":"Invia invito"}
              </button>
              <button onClick={()=>removeMember(m.circleId,m.id)} style={{flex:1,padding:"12px",background:"var(--rdB)",border:"1.5px solid #F5C6C3",borderRadius:14,fontFamily:"var(--fn)",fontSize:13,fontWeight:600,color:"var(--rd)",cursor:"pointer"}}>
                🗑️ Rimuovi
              </button>
            </div>
          )}
          {mTasks.length>0&&<><div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",marginBottom:9}}>Incarichi di {m.name.split(" ")[0]}</div>{mTasks.map(t=><TCard key={t.id} task={t}/>)}</>}
          {mTasks.length===0&&<div style={{padding:"14px",background:"var(--s)",borderRadius:13,fontSize:13,color:"var(--kl)",textAlign:"center"}}>Nessun incarico per {m.name.split(" ")[0]}</div>}
          <div style={{height:20}}/>
        </div>
      </>
    );
  };

  // ── SIMPLE SCREENS ──
  const renderAgenda = () => (
    <>
      <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>
      <div style={{padding:"12px 18px 8px",background:"linear-gradient(160deg,var(--tp) 0%,var(--s) 70%)",flexShrink:0}}>
        <div style={{fontFamily:"var(--fs)",fontSize:21,fontWeight:600,color:"var(--k)",letterSpacing:-.4}}>Agenda</div>
        <div style={{fontSize:12,color:"var(--km)",marginTop:1}}>Aprile 2026</div>
      </div>
      <div className="scr" style={{padding:"0 14px"}}>
        {[{d:18,ev:"Medico nonno Francesco",who:"Raffael",color:"#E6A817",circle:"🏡"},{d:22,ev:"Cena da nonno Francesco",who:"Tutti",color:"#C96A3A",circle:"🏡"},{d:25,ev:"Fabbro — cancello",who:"Raffael",color:"#2A6FDB",circle:"🏡"},{d:27,ev:"Prendere Tommaso a scuola",who:"?",color:"#2E7D52",circle:"🏠"}].map((e,i)=>(
          <div key={i} style={{display:"flex",gap:14,padding:"14px 0",borderBottom:"1px solid var(--sm)"}}>
            <div style={{width:42,textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:20,fontWeight:700,color:"var(--k)"}}>{e.d}</div>
              <div style={{fontSize:10,color:"var(--kl)"}}>apr</div>
            </div>
            <div style={{width:3,background:e.color,borderRadius:2,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--k)"}}>{e.ev}</div>
              <div style={{fontSize:11,color:"var(--kl)",marginTop:2}}>{e.circle} → {e.who}</div>
            </div>
          </div>
        ))}
        <div style={{height:20}}/>
      </div>
    </>
  );

  const renderSpese = () => (
    <>
      <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>
      <div style={{padding:"12px 18px 14px",background:"linear-gradient(160deg,var(--tp) 0%,var(--s) 70%)",flexShrink:0}}>
        <div style={{fontFamily:"var(--fs)",fontSize:21,fontWeight:600,color:"var(--k)",letterSpacing:-.4}}>Spese</div>
        <div style={{fontSize:12,color:"var(--km)",marginTop:1}}>Aprile 2026</div>
      </div>
      <div className="scr" style={{padding:"0 14px"}}>
        <div style={{background:"var(--k)",borderRadius:20,padding:20,color:"white",marginTop:14}}>
          <div style={{fontSize:11,fontWeight:600,opacity:.5,textTransform:"uppercase",letterSpacing:1}}>Hai anticipato</div>
          <div style={{fontSize:36,fontWeight:700,letterSpacing:-1,marginTop:4}}>€ 34,50</div>
          <div style={{fontSize:12,opacity:.6,marginTop:6}}>Rimborso atteso da Maria</div>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:"var(--kl)",letterSpacing:1,textTransform:"uppercase",margin:"18px 0 10px"}}>Spese registrate</div>
        {[{t:"Farmaci nonna Bettina",who:"Raffael",date:"18 apr",amount:"34,50",circle:"🏡",status:"Da rimborsare"},{t:"Bolletta luce",who:"?",date:"20 apr",amount:"87,20",circle:"🏡",status:"Da pagare"}].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:"1px solid var(--sm)"}}>
            <span style={{fontSize:22}}>💶</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:500,color:"var(--k)"}}>{s.t}</div>
              <div style={{fontSize:11,color:"var(--kl)",marginTop:1}}>{s.circle} · {s.who} · {s.date}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--k)"}}>€ {s.amount}</div>
              <div style={{fontSize:10,fontWeight:600,color:s.status==="Da pagare"?"var(--rd)":"var(--am)",marginTop:2}}>{s.status}</div>
            </div>
          </div>
        ))}
        <div style={{height:20}}/>
      </div>
    </>
  );

  const renderBeta = () => (
    <>
      <div className="sbar"><span>20:25</span><span style={{fontSize:11}}>●●●</span></div>
      <div style={{padding:"12px 18px 14px",background:"linear-gradient(160deg,var(--tp) 0%,var(--s) 70%)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontFamily:"var(--fs)",fontSize:21,fontWeight:600,color:"var(--k)",letterSpacing:-.4}}>Feedback Beta</div>
          <span style={{background:"var(--ac)",color:"white",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:100}}>BETA</span>
        </div>
        <div style={{fontSize:12,color:"var(--km)",marginTop:1}}>Il tuo feedback va direttamente a noi</div>
      </div>
      <div className="scr" style={{padding:"14px"}}>
        {[{id:"wapp",icon:"💬",bg:"var(--gnB)",title:"FAMMY mi ha evitato WhatsApp",sub:"Raccontaci quando e come"},{id:"idea",icon:"💡",bg:"var(--amB)",title:"Ho un'idea",sub:"Suggerisci una funzione"},{id:"prob",icon:"⚠️",bg:"var(--rdB)",title:"Ho trovato un problema",sub:"Qualcosa non funziona"}].map(o=>(
          <div key={o.id} style={{display:"flex",alignItems:"center",gap:14,padding:"15px",background:"white",borderRadius:16,marginBottom:10,cursor:"pointer",border:"1.5px solid var(--sm)"}} onClick={()=>toast_("💬 Grazie! Ci scrivi in: feedback@fammy.app")}>
            <div style={{width:44,height:44,borderRadius:14,background:o.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{o.icon}</div>
            <div><div style={{fontSize:15,fontWeight:600,color:"var(--k)"}}>{o.title}</div><div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>{o.sub}</div></div>
            <span style={{marginLeft:"auto",color:"var(--kl)"}}>›</span>
          </div>
        ))}
        <div style={{padding:16,background:"var(--s)",borderRadius:16,fontSize:13,color:"var(--km)",lineHeight:1.6,marginTop:4}}>
          <strong style={{display:"block",marginBottom:4,color:"var(--k)"}}>Domanda chiave</strong>
          In che momento FAMMY ti ha evitato di scrivere su WhatsApp?
        </div>
        <div style={{height:20}}/>
      </div>
    </>
  );

  // ── PROFILE SHEET ──
  const renderProfile = () => (
    <div style={{position:"absolute",inset:0,zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(28,22,17,.45)"}} onClick={()=>setScreen(prevScreen)}/>
      <div style={{position:"relative",background:"white",borderRadius:"28px 28px 0 0",padding:"0 0 32px",animation:"sUp .3s ease"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 0"}}><div style={{width:40,height:4,borderRadius:2,background:"var(--sm)"}}/></div>
        <div style={{padding:"16px 20px 0"}}>
          {/* Profile header */}
          <div style={{display:"flex",alignItems:"center",gap:14,padding:"4px 0 18px",borderBottom:"1px solid var(--sm)"}}>
            <div style={{width:56,height:56,borderRadius:18,background:"var(--k)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"white",flexShrink:0}}>R</div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:"var(--k)"}}>Raffael</div>
              <div style={{fontSize:12,color:"var(--kl)",marginTop:2}}>raffael@email.com</div>
              <span style={{background:"var(--amB)",color:"var(--am)",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:100,marginTop:4,display:"inline-block"}}>Piano FREE</span>
            </div>
          </div>

          {/* Premium upgrade */}
          <div style={{background:"linear-gradient(135deg,#1C1611 0%,#3D2B1F 100%)",borderRadius:18,padding:"16px 18px",margin:"16px 0",cursor:"pointer"}} onClick={()=>toast_("⭐ Premium in arrivo — grazie per l'interesse!")}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"white"}}>⭐ Passa a Premium</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:3}}>Report mensili · Storico · Pagamenti avanzati</div>
              </div>
              <div style={{padding:"8px 14px",background:"var(--am)",borderRadius:10,fontSize:12,fontWeight:700,color:"var(--k)"}}>€2,99/m</div>
            </div>
          </div>

          {/* Menu items */}
          {/* Lingua — con picker inline */}
          <div style={{padding:"13px 0",borderBottom:"1px solid var(--sm)"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}
              onClick={()=>setShowLangPicker(v=>!v)}>
              <div style={{width:38,height:38,borderRadius:12,background:"var(--s)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🌍</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:"var(--k)"}}>Lingua</div>
                <div style={{fontSize:12,color:"var(--kl)",marginTop:1}}>{LANG_NAMES[lang]}</div>
              </div>
              <span style={{fontSize:14,color:"var(--kl)",transition:"transform .2s",transform:showLangPicker?"rotate(90deg)":"none"}}>›</span>
            </div>
            {showLangPicker&&(
              <div style={{display:"flex",gap:6,marginTop:10,paddingLeft:52,flexWrap:"wrap"}}>
                {LANGS.map(lg=>(
                  <button key={lg.id} onClick={()=>{setLang(lg.id);toast_(lg.flag+" "+LANG_NAMES[lg.id]);}}
                    style={{padding:"7px 12px",border:"1.5px solid "+(lang===lg.id?"var(--k)":"var(--sm)"),background:lang===lg.id?"var(--k)":"white",color:lang===lg.id?"white":"var(--k)",borderRadius:10,fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"var(--fn)",display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:14}}>{lg.flag}</span>{LANG_NAMES[lg.id]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {[
            {icon:"🎁",label:"Invita amici",sub:"Guadagna 1 mese Premium gratis",action:()=>{setInviteMember({name:"un amico"});setShowInvite(true);setScreen(prevScreen);}},
            {icon:"⚙️",label:"Impostazioni",sub:"Notifiche, privacy, account",action:()=>toast_("⚙️ Impostazioni — prossimamente")},
            {icon:"❓",label:"Aiuto",sub:"FAQ e supporto",action:()=>toast_("❓ Supporto: help@fammy.app")},
            {icon:"🚪",label:"Esci dall'app",sub:"",action:()=>{setScreen(SCREENS.ONBOARDING);toast_("Arrivederci! 👋");}},
          ].map((item,i,arr)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:i<arr.length-1?"1px solid var(--sm)":"none",cursor:"pointer"}}
              onClick={item.action}>
              <div style={{width:38,height:38,borderRadius:12,background:"var(--s)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{item.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:item.label==="Esci dall'app"?"var(--rd)":"var(--k)"}}>{item.label}</div>
                {item.sub&&<div style={{fontSize:12,color:"var(--kl)",marginTop:1}}>{item.sub}</div>}
              </div>
              <span style={{fontSize:14,color:"var(--kl)"}}>›</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── RENDER ──
  const showNav = ![SCREENS.TASK_DETAIL,SCREENS.MEMBER,SCREENS.ONBOARDING,SCREENS.LOGIN,SCREENS.WELCOME].includes(screen);
  const NAV = [
    {id:"home",   icon:"🏡", l:"Bacheca", sc:SCREENS.HOME},
    {id:"agenda", icon:"📅", l:"Agenda",  sc:SCREENS.AGENDA},
    {id:"family", icon:"👨‍👩‍👧",l:"Famiglia",sc:SCREENS.FAMILY},
    {id:"spese",  icon:"💶", l:"Spese",   sc:SCREENS.SPESE},
    {id:"beta",   icon:"💡", l:"Beta",    sc:SCREENS.BETA},
  ];

  const goNav = (item) => { setNav(item.id); setScreen(item.sc); };

  let content;
  if(screen===SCREENS.ONBOARDING) content = renderOB();
  else if(screen===SCREENS.LOGIN)  content = renderLogin();
  else if(screen===SCREENS.WELCOME) content = renderWelcome(false);
  else if(screen===SCREENS.HOME)   content = renderHome();
  else if(screen===SCREENS.TASK_DETAIL) content = renderTaskDetail();
  else if(screen===SCREENS.FAMILY) content = renderFamily();
  else if(screen===SCREENS.MEMBER) content = renderMember();
  else if(screen===SCREENS.AGENDA) content = renderAgenda();
  else if(screen===SCREENS.SPESE)  content = renderSpese();
  else if(screen===SCREENS.BETA)   content = renderBeta();
  else content = renderHome();

  const isProfile = screen===SCREENS.PROFILE;

  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        <div className="shell">
          {toast&&<div className="toast">{toast}</div>}
          {showModal&&taskModal()}
          {showInvite&&inviteSheet()}
          {isProfile&&renderProfile()}
          {showWelcomeOverlay&&(
            <div style={{position:"absolute",inset:0,zIndex:400,background:"var(--s)",display:"flex",flexDirection:"column"}}>
              {renderWelcome(true)}
            </div>
          )}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
              {content}
            </div>
            {showNav&&(
              <div className="bnav">
                {NAV.map(item=>(
                  <button key={item.id} className={"bni "+(nav===item.id?"on":"")} onClick={()=>goNav(item)}>
                    <span className="ico">{item.icon}</span>
                    <span className="lbl">{item.l}</span>
                    {nav===item.id&&<div className="bnip"/>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
