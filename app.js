(function(){
'use strict';

var CLE='carnet-visites-v1';
var ITERATIONS=600000;            /* PBKDF2-SHA256 */
var VERROU_AUTO_MS=5*60*1000;     /* verrouillage après 5 min en arrière-plan */
var CODE_MIN=6;
var LANGUES=['fr-FR','en-GB'];

var CRITERES=[
  {k:'capacite',t:'Capacity and equipment',c:'Capacity',a:'Machine park, current load, available capacity, headcount.'},
  {k:'qualite',t:'Quality and certifications',c:'Quality',a:'EN 9100, Nadcap, inspection means, handling of non-conformances.'},
  {k:'procedes',t:'Processes and technical skill',c:'Processes',a:'Special processes, know-how, technical level of the teams.'},
  {k:'orga',t:'Organisation and management',c:'Organisation',a:'Project control, indicators, responsiveness, English level of the contacts.'},
  {k:'supply',t:'Supply chain and material',c:'Supply',a:'Material supply, subcontracting, lead times, export logistics.'},
  {k:'atelier',t:'Shop floor condition',c:'Shop floor',a:'Cleanliness, safety, flow, machine condition. What you saw, not what you were told.'}
];
var SYNTHESE=[
  {k:'forts',t:'Strengths'},
  {k:'risques',t:'Risks and weaknesses'},
  {k:'suites',t:'Next steps'}
];
var AVIS=[
  {k:'retenir',t:'Retain'},
  {k:'creuser',t:'Investigate'},
  {k:'ecarter',t:'Rule out'}
];

/* Types de rencontre et sujets types à préparer.
   Contenu volontairement générique : aucun nom de société, de programme ou de pièce ici. */
/*TYPES-DEBUT*/
var TYPES=[
  {k:'usinage',t:'Machining supplier',f:true,s:[
    'Capacity dedicated to our parts: machine park, load rate, available slots.',
    'Ramp-up: plan, milestones and a realistic date for the first good part.',
    'FAI (EN 9102): completed, in progress, open findings.',
    'Material: source, certificates, lead times, customer-approved sources.',
    'Subcontracted special processes: where, qualification status, logistics flow.',
    'Inspection means: CMM, programs, capability on critical dimensions.',
    'Non-conformances and concessions: processing time, recent examples.',
    'Configuration: drawing issue in use, change management.',
    'Tooling and NC programs: ownership, condition, validation.',
    'Project team: single point of contact, English level, meeting cadence.',
    'Packaging and export: part protection, incoterm, transit time.'
  ]},
  {k:'surface',t:'Surface treatment',f:true,s:[
    'Exact scope: processes concerned and applicable specifications.',
    'Nadcap chemical processing: scope, expiry date, findings from the last audit.',
    'Customer qualification, process by process: granted, in progress, blocking.',
    'Tanks: usable dimensions, maximum part size, current load.',
    'Bath monitoring: analyses, frequency, records, drifts observed.',
    'Test coupons and periodic tests: salt spray, adhesion, thickness.',
    'Masking and racking tooling: who designs it, lead times, validation.',
    'Flow with the machining supplier: transport, protection, maximum delay before treatment.',
    'Batch traceability and certificates of conformity.',
    'Regulated substances (chromium VI, REACH): status and alternatives.',
    'Non-conformances: permitted rework, stripping, scrap.'
  ]},
  {k:'thermique',t:'Heat treatment',f:true,s:[
    'Exact scope: processes, alloys and applicable specifications.',
    'Nadcap heat treating: scope, expiry date, findings from the last audit.',
    'Customer qualification, process by process: granted, in progress, blocking.',
    'Furnaces: working dimensions, class, instrumentation.',
    'Pyrometry (AMS 2750): TUS, SAT, calibrations, dates of the latest surveys.',
    'Quench delay and transfer control.',
    'Associated tests: hardness, conductivity, tensile, in-house or external lab.',
    'Cycle records and traceability per load.',
    'Capacity, turnaround time, handling of urgent jobs.',
    'Flow with the machining supplier: transport, distortion, straightening.',
    'Non-conformances: re-treatment allowed or not, decision and lead time.'
  ]},
  {k:'autre',t:'Other supplier',f:true,s:[]},
  {k:'equipe',t:'Team meeting',f:false,s:[
    'Progress by transfer batch: milestones met, late, at risk.',
    'Blocking points and decisions expected from me.',
    'Status of FAIs and process qualifications.',
    'Supplier risks: capacity, quality, lead times.',
    'Roles and contacts per supplier.',
    'Team needs: resources, access, tools, support from France.',
    'Ways of working: meeting cadence, indicators, escalation of alerts.',
    'Plan for the next four weeks.'
  ]},
  {k:'client',t:'Customer or prime',f:false,s:[
    'Exact scope: which processes, which suppliers, which part numbers.',
    'Qualification approach: steps, deliverables, who does what.',
    'Schedule: audit dates, response times, target approval date.',
    'Supplier prerequisites: file, test coupons, tests, accreditations.',
    'Supplier approval in progress: status, remaining findings.',
    'Known blocking points and plan to clear them.',
    'Contacts and decision path.',
    'What they expect from us, and by when.',
    'Schedule risk: plan B if the qualification slips.'
  ]},
  {k:'fai',t:'FAI contractor',f:false,s:[
    'Scope: number of part numbers per supplier, full or partial FAI.',
    'Standard and format: EN 9102, forms, customer requirements.',
    'Roles: who writes, who checks, who approves.',
    'FAI schedule aligned with first-part dates.',
    'Input data: drawings and issues, routings, material and process certificates.',
    'Findings: rejected FAI, concession, rework time.',
    'On-site presence at the suppliers.',
    'Indicators: right first time, average lead time, backlog.',
    'Tool and archiving of the files.',
    'Workload and resources assigned.'
  ]}
];
/*TYPES-FIN*/
/* Textes français des versions précédentes -> anglais. Sert à convertir les fiches déjà enregistrées. */
var ANCIENS_TEXTES={
  "Capacité dédiée à nos pièces : parc machines, taux de charge, créneaux disponibles.":"Capacity dedicated to our parts: machine park, load rate, available slots.",
  "Montée en cadence : plan, jalons et date réaliste de première pièce bonne.":"Ramp-up: plan, milestones and a realistic date for the first good part.",
  "FAI (EN 9102) : faites, en cours, écarts ouverts.":"FAI (EN 9102): completed, in progress, open findings.",
  "Matière : source, certificats, délais, sources approuvées par le client.":"Material: source, certificates, lead times, customer-approved sources.",
  "Procédés spéciaux sous-traités : chez qui, statut de qualification, flux logistique.":"Subcontracted special processes: where, qualification status, logistics flow.",
  "Moyens de contrôle : MMT, programmes, capabilité sur les cotes critiques.":"Inspection means: CMM, programs, capability on critical dimensions.",
  "Non-conformités et dérogations : délai de traitement, exemples récents.":"Non-conformances and concessions: processing time, recent examples.",
  "Configuration : indice des plans utilisé, gestion des évolutions.":"Configuration: drawing issue in use, change management.",
  "Outillages et programmes CN : propriété, état, validation.":"Tooling and NC programs: ownership, condition, validation.",
  "Équipe projet : interlocuteur unique, niveau d’anglais, rythme des points.":"Project team: single point of contact, English level, meeting cadence.",
  "Emballage et export : protection des pièces, incoterm, délai de transit.":"Packaging and export: part protection, incoterm, transit time.",
  "Périmètre exact : procédés concernés et spécifications applicables.":"Exact scope: processes concerned and applicable specifications.",
  "Nadcap traitement chimique : périmètre, échéance, écarts du dernier audit.":"Nadcap chemical processing: scope, expiry date, findings from the last audit.",
  "Qualification client, procédé par procédé : acquise, en cours, bloquante.":"Customer qualification, process by process: granted, in progress, blocking.",
  "Cuves : dimensions utiles, taille maximale des pièces, charge actuelle.":"Tanks: usable dimensions, maximum part size, current load.",
  "Suivi des bains : analyses, fréquence, enregistrements, dérives constatées.":"Bath monitoring: analyses, frequency, records, drifts observed.",
  "Éprouvettes et essais périodiques : brouillard salin, adhérence, épaisseur.":"Test coupons and periodic tests: salt spray, adhesion, thickness.",
  "Épargnes et outillages d’accrochage : qui les conçoit, délais, validation.":"Masking and racking tooling: who designs it, lead times, validation.",
  "Flux avec l’usineur : transport, protection, délai maximal avant traitement.":"Flow with the machining supplier: transport, protection, maximum delay before treatment.",
  "Traçabilité par lot et certificats de conformité.":"Batch traceability and certificates of conformity.",
  "Produits réglementés (chrome VI, REACH) : situation et alternatives.":"Regulated substances (chromium VI, REACH): status and alternatives.",
  "Non-conformités : retouches autorisées, décapage, rebut.":"Non-conformances: permitted rework, stripping, scrap.",
  "Périmètre exact : procédés, alliages et spécifications applicables.":"Exact scope: processes, alloys and applicable specifications.",
  "Nadcap traitement thermique : périmètre, échéance, écarts du dernier audit.":"Nadcap heat treating: scope, expiry date, findings from the last audit.",
  "Fours : dimensions utiles, classe, instrumentation.":"Furnaces: working dimensions, class, instrumentation.",
  "Pyrométrie (AMS 2750) : TUS, SAT, étalonnages, dates des derniers relevés.":"Pyrometry (AMS 2750): TUS, SAT, calibrations, dates of the latest surveys.",
  "Délai de trempe et maîtrise du transfert.":"Quench delay and transfer control.",
  "Essais associés : dureté, conductivité, traction, laboratoire interne ou externe.":"Associated tests: hardness, conductivity, tensile, in-house or external lab.",
  "Enregistrements de cycle et traçabilité par charge.":"Cycle records and traceability per load.",
  "Capacité, délai de traitement, gestion des urgences.":"Capacity, turnaround time, handling of urgent jobs.",
  "Flux avec l’usineur : transport, déformations, redressage.":"Flow with the machining supplier: transport, distortion, straightening.",
  "Non-conformités : retraitement autorisé ou non, décision et délai.":"Non-conformances: re-treatment allowed or not, decision and lead time.",
  "Avancement par lot de transfert : jalons tenus, en retard, à risque.":"Progress by transfer batch: milestones met, late, at risk.",
  "Points bloquants et décisions attendues de ma part.":"Blocking points and decisions expected from me.",
  "Statut des FAI et des qualifications de procédés.":"Status of FAIs and process qualifications.",
  "Risques fournisseurs : capacité, qualité, délais.":"Supplier risks: capacity, quality, lead times.",
  "Rôles et interlocuteurs par fournisseur.":"Roles and contacts per supplier.",
  "Besoins de l’équipe : ressources, accès, outils, appui depuis la France.":"Team needs: resources, access, tools, support from France.",
  "Fonctionnement : rythme des points, indicateurs, remontée des alertes.":"Ways of working: meeting cadence, indicators, escalation of alerts.",
  "Plan des quatre prochaines semaines.":"Plan for the next four weeks.",
  "Périmètre exact : quels procédés, quels fournisseurs, quelles références.":"Exact scope: which processes, which suppliers, which part numbers.",
  "Démarche de qualification : étapes, livrables, qui fait quoi.":"Qualification approach: steps, deliverables, who does what.",
  "Calendrier : dates d’audit, délais de réponse, date cible d’approbation.":"Schedule: audit dates, response times, target approval date.",
  "Prérequis côté fournisseur : dossier, éprouvettes, essais, accréditations.":"Supplier prerequisites: file, test coupons, tests, accreditations.",
  "Approbation fournisseur en cours : statut, écarts restants.":"Supplier approval in progress: status, remaining findings.",
  "Points bloquants connus et plan de levée.":"Known blocking points and plan to clear them.",
  "Interlocuteurs et circuit de décision.":"Contacts and decision path.",
  "Ce qu’ils attendent de nous, et pour quand.":"What they expect from us, and by when.",
  "Risque planning : plan B si la qualification glisse.":"Schedule risk: plan B if the qualification slips.",
  "Périmètre : nombre de références par fournisseur, FAI complète ou partielle.":"Scope: number of part numbers per supplier, full or partial FAI.",
  "Référentiel et format : EN 9102, formulaires, exigences client.":"Standard and format: EN 9102, forms, customer requirements.",
  "Rôles : qui rédige, qui vérifie, qui approuve.":"Roles: who writes, who checks, who approves.",
  "Planning FAI aligné sur les dates de premières pièces.":"FAI schedule aligned with first-part dates.",
  "Données d’entrée : plans et indices, gammes, certificats matière et procédés.":"Input data: drawings and issues, routings, material and process certificates.",
  "Écarts : FAI refusée, dérogation, délai de reprise.":"Findings: rejected FAI, concession, rework time.",
  "Présence sur site chez les fournisseurs.":"On-site presence at the suppliers.",
  "Indicateurs : bon du premier coup, délai moyen, dossiers en attente.":"Indicators: right first time, average lead time, backlog.",
  "Outil et archivage des dossiers.":"Tool and archiving of the files.",
  "Charge et ressources affectées.":"Workload and resources assigned.",
  "Usinage":"Machining",
  "Traitement de surface":"Surface treatment",
  "Traitement thermique":"Heat treatment"
};
var SYNTHESE_REUNION=[
  {k:'forts',t:'Decisions made'},
  {k:'risques',t:'Open points and risks'},
  {k:'suites',t:'Actions'}
];

var UA=navigator.userAgent||'';
var SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
var ANDROID=/Android/i.test(UA);
var IOS=/iPad|iPhone|iPod/.test(UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
var CRYPTO=!!(window.crypto&&window.crypto.subtle&&window.crypto.getRandomValues&&window.TextEncoder&&window.TextDecoder);

/* ---------- État ---------- */

var etat=etatVide();
var cle=null, sel=null, iter=ITERATIONS;   /* verrou actif quand cle est définie */
var verrouille=false;                       /* notes chiffrées, code pas encore saisi */
var stockageOK=true, derniereSauvegarde=null, minuteur=null, horsLigne=false;
var file=Promise.resolve(), attente=0;      /* écritures chiffrées, dans l'ordre */
var copieEnAttente=null;                    /* copie de secours chiffrée à ouvrir */
var panneau='';                             /* '', 'code' ou 'changer' */
var oubli=false;
var cacheLe=0;
var vue={nom:'liste',id:null};

function etatVide(){ return {visits:[],lang:'fr-FR',dictee:false}; }

/* ---------- Validation des données ---------- */

function texte(x,max){
  if(typeof x==='number'&&isFinite(x)) x=String(x);
  return typeof x==='string'?x.slice(0,max||20000):'';
}
function possede(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }
function ancienTexte(t){
  var k=t.trim();
  return possede(ANCIENS_TEXTES,k)?ANCIENS_TEXTES[k]:t;
}
/* Table de traduction fournie par un fichier importé : validée avant usage. */
function tableValide(o){
  if(!o||typeof o!=='object'||Array.isArray(o)) return null;
  var t={}, n=0;
  Object.keys(o).slice(0,400).forEach(function(k){
    var v=o[k];
    if(typeof v!=='string'||!k.trim()||!v.trim()||k.length>600||v.length>600) return;
    t[k.trim()]=v; n++;
  });
  return n?t:null;
}
function horodatage(x,defaut){
  x=Number(x);
  return (isFinite(x)&&x>0)?x:defaut;
}
function nouvelId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function normaliser(v){
  v=(v&&typeof v==='object'&&!Array.isArray(v))?v:{};
  var id=texte(v.id,40).replace(/[^A-Za-z0-9_-]/g,'')||nouvelId();
  var sc=(v.scores&&typeof v.scores==='object')?v.scores:{};
  var no=(v.notes&&typeof v.notes==='object')?v.notes:{};
  var scores={}, notes={};
  CRITERES.forEach(function(c){
    var n=Math.round(Number(sc[c.k]));
    scores[c.k]=(n>=1&&n<=5)?n:0;
    notes[c.k]=texte(no[c.k]);
  });
  var date=texte(v.date,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) date='';
  var avis=texte(v.avis,20);
  if(!libelleAvis(avis)) avis='';
  var cree=horodatage(v.cree,Date.now());
  var type=texte(v.type,20);
  if(!typeConnu(type)) type='autre';
  var vus={}, sujets=[];
  (Array.isArray(v.sujets)?v.sujets:[]).slice(0,80).forEach(function(x){
    x=(x&&typeof x==='object')?x:{};
    var t=ancienTexte(texte(x.t,600)), note=texte(x.note,5000);
    if(!t.trim()&&!note.trim()) return;
    var sid=texte(x.id,40).replace(/[^A-Za-z0-9_-]/g,'');
    while(!sid||vus[sid]) sid=nouvelId();
    vus[sid]=true;
    sujets.push({id:sid,t:t,fait:x.fait===true,note:note});
  });
  return {
    id:id, type:type, objectif:texte(v.objectif,2000), sujets:sujets,
    nom:texte(v.nom,300), ville:texte(v.ville,300), date:date,
    contacts:texte(v.contacts,1000), activite:ancienTexte(texte(v.activite,1000)),
    libre:texte(v.libre),
    scores:scores, notes:notes,
    forts:texte(v.forts), risques:texte(v.risques), suites:texte(v.suites),
    avis:avis, cree:cree, maj:horodatage(v.maj,cree)
  };
}
function normaliserEtat(o){
  o=(o&&typeof o==='object')?o:{};
  var vus={}, visits=[];
  (Array.isArray(o.visits)?o.visits:[]).slice(0,500).forEach(function(x){
    var v=normaliser(x);
    while(vus[v.id]) v.id=nouvelId();
    vus[v.id]=true; visits.push(v);
  });
  return {visits:visits, lang:LANGUES.indexOf(o.lang)>=0?o.lang:'fr-FR', dictee:o.dictee===true};
}

/* ---------- Chiffrement ---------- */

function b64(u8){
  var s='';
  for(var i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  return btoa(s);
}
function deb64(s){
  var b=atob(s), u=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i);
  return u;
}
function enveloppeValide(o){
  if(typeof o.sel!=='string'||typeof o.iv!=='string'||typeof o.donnees!=='string') return false;
  if(typeof o.iter!=='number'||o.iter%1!==0||o.iter<10000||o.iter>5000000) return false;
  try{ return deb64(o.sel).length>=8&&deb64(o.iv).length===12&&deb64(o.donnees).length>16; }
  catch(e){ return false; }
}
function deriver(code,selBytes,iterations){
  var brut=new TextEncoder().encode(String(code).normalize('NFKC'));
  return crypto.subtle.importKey('raw',brut,'PBKDF2',false,['deriveKey']).then(function(base){
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:selBytes,iterations:iterations,hash:'SHA-256'},
      base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  });
}
function chiffrer(clair,k,selBytes,iterations){
  var iv=crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,new TextEncoder().encode(clair)).then(function(ct){
    return JSON.stringify({app:'carnet-visites',chiffre:true,v:2,iter:iterations,
      sel:b64(selBytes),iv:b64(iv),donnees:b64(new Uint8Array(ct))});
  });
}
function dechiffrer(env,k){
  return crypto.subtle.decrypt({name:'AES-GCM',iv:deb64(env.iv)},k,deb64(env.donnees)).then(function(buf){
    return new TextDecoder().decode(buf);
  });
}

/* ---------- Stockage ---------- */

function lireBrut(){
  try{ var s=localStorage.getItem(CLE); return s; }
  catch(e){ stockageOK=false; return null; }
}
function ecrire(s){
  try{
    localStorage.setItem(CLE,s);
    stockageOK=true; derniereSauvegarde=new Date();
  }catch(e){ stockageOK=false; }
  afficherEtat();
}
function interpreter(s){
  if(s===null||s===undefined||s==='') return {type:'vide'};
  var o;
  try{ o=JSON.parse(String(s).replace(/^\uFEFF/,'')); }catch(e){ return {type:'illisible'}; }
  if(!o||typeof o!=='object'||Array.isArray(o)) return {type:'illisible'};
  if(o.chiffre===true) return enveloppeValide(o)?{type:'chiffre',env:o}:{type:'illisible'};
  if(Array.isArray(o.visits)) return {type:'clair',etat:normaliserEtat(o),table:tableValide(o.traductions)};
  return {type:'illisible'};
}
function sauver(){
  if(minuteur){ clearTimeout(minuteur); minuteur=null; }
  if(verrouille) return;                     /* ne jamais écraser un carnet verrouillé */
  var instant=JSON.stringify(etat), k=cle, s=sel, it=iter;
  if(!k&&!attente){ ecrire(instant); return; }
  attente++;
  file=file.then(function(){ return k?chiffrer(instant,k,s,it):instant; })
    .then(ecrire,function(){ stockageOK=false; afficherEtat(); })
    .then(function(){ attente--; });
}
function sauverBientot(){
  if(minuteur) clearTimeout(minuteur);
  minuteur=setTimeout(sauver,300);
}
function modifie(v){ v.maj=Date.now(); sauverBientot(); }

/* Démarrage : lire ce qui est sur l'appareil. */
(function(){
  try{
    localStorage.setItem(CLE+'-test','1');
    localStorage.removeItem(CLE+'-test');
  }catch(e){ stockageOK=false; }
  var brut=lireBrut(), d=interpreter(brut);
  if(d.type==='clair') etat=d.etat;
  else if(d.type==='chiffre') verrouille=true;
  else if(d.type==='illisible'){
    /* On met de côté plutôt que d'écraser. */
    try{ localStorage.setItem(CLE+'-illisible-'+Date.now(),brut); localStorage.removeItem(CLE); }catch(e){}
    setTimeout(function(){ toast('Unreadable data was set aside. The notebook starts empty.'); },0);
  }
})();

/* Le stockage a changé ailleurs (autre onglet) : on adopte son contenu,
   en gardant la fiche ouverte ici si elle est plus récente. */
function adopter(nouvel){
  var local=(vue.nom==='visite')?trouver(vue.id):null, memeFiche=false, aSauver=false;
  if(local){
    for(var i=0;i<nouvel.visits.length;i++){
      if(nouvel.visits[i].id!==local.id) continue;
      if(local.maj>=nouvel.visits[i].maj){
        aSauver=local.maj>nouvel.visits[i].maj;
        nouvel.visits[i]=local; memeFiche=true;      /* même objet : la fiche affichée reste valide */
      }
      break;
    }
  }
  etat=nouvel;
  if(aSauver) sauverBientot();
  if(memeFiche) return;                              /* rien à redessiner */
  var a=document.activeElement;
  if(vue.nom!=='visite'&&a&&/^(INPUT|SELECT)$/.test(a.tagName)) return;   /* saisie d'un code en cours */
  reafficher();
}
function recharger(){
  var d=interpreter(lireBrut());
  function vider(verrou){ etat=etatVide(); cle=null; sel=null; verrouille=verrou; reafficher(); }
  if(d.type==='clair'){ cle=null; sel=null; verrouille=false; adopter(d.etat); }
  else if(d.type==='vide'){ vider(false); }
  else if(d.type==='chiffre'){
    if(!cle){ vider(true); return; }
    dechiffrer(d.env,cle).then(function(t){ return normaliserEtat(JSON.parse(t)); })
      .then(function(n){ verrouille=false; adopter(n); },function(){ vider(true); });
  }
}

/* ---------- Verrou ---------- */

function deverrouiller(code){
  var d=interpreter(lireBrut());
  if(d.type!=='chiffre'){ recharger(); return Promise.resolve(true); }
  if(!CRYPTO) return Promise.resolve(false);
  var s=deb64(d.env.sel);
  return deriver(code,s,d.env.iter).then(function(k){
    return dechiffrer(d.env,k).then(function(t){
      etat=normaliserEtat(JSON.parse(t));
      cle=k; sel=s; iter=d.env.iter; verrouille=false; oubli=false;
      return true;
    });
  }).catch(function(){ return false; });
}
function definirCode(code){
  var s=crypto.getRandomValues(new Uint8Array(16));
  return deriver(code,s,ITERATIONS).then(function(k){
    cle=k; sel=s; iter=ITERATIONS;
    sauver();
    return file;
  });
}
function retirerVerrou(){
  cle=null; sel=null;
  sauver();
}
function verrouiller(){
  if(!cle) return;
  arreterDictee();
  sauver();                 /* les écritures en file gardent leur clé */
  cle=null; sel=null; verrouille=true;
  etat=etatVide(); copieEnAttente=null; panneau=''; oubli=false;
  rendre(); window.scrollTo(0,0);
}

/* ---------- Petits calculs ---------- */

function deux(n){ return (n<10?'0':'')+n; }
function aujourdhui(){
  var d=new Date();
  return d.getFullYear()+'-'+deux(d.getMonth()+1)+'-'+deux(d.getDate());
}
function indexDe(id){
  for(var i=0;i<etat.visits.length;i++) if(etat.visits[i].id===id) return i;
  return -1;
}
function trouver(id){ var i=indexDe(id); return i<0?null:etat.visits[i]; }
function typeConnu(k){
  for(var i=0;i<TYPES.length;i++) if(TYPES[i].k===k) return TYPES[i];
  return null;
}
function typeDe(v){ return typeConnu(v.type)||typeConnu('autre'); }
function estFournisseur(v){ return typeDe(v).f; }
function syntheseDe(v){ return estFournisseur(v)?SYNTHESE:SYNTHESE_REUNION; }
function sujetsUtiles(v){ return v.sujets.filter(function(s){ return s.t.trim()||s.note.trim(); }); }
function compteSujets(v){
  var u=sujetsUtiles(v), faits=u.filter(function(s){ return s.fait; }).length;
  return u.length?faits+' of '+u.length+' covered':'';
}
function fournisseurs(){ return etat.visits.filter(estFournisseur); }
function moyenne(v){
  if(!estFournisseur(v)) return null;
  var s=0,n=0;
  CRITERES.forEach(function(c){ var x=Number(v.scores[c.k])||0; if(x>0){ s+=x; n++; } });
  return n?s/n:null;
}
function nombre(x){ return x.toFixed(1); }
function dateFr(iso){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
  var MOIS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (m&&MOIS[m[2]-1])?Number(m[3])+' '+MOIS[m[2]-1]+' '+m[1]:'';
}
function libelleAvis(k){
  for(var i=0;i<AVIS.length;i++) if(AVIS[i].k===k) return AVIS[i].t;
  return '';
}
function parDate(liste){
  return liste.slice().sort(function(a,b){
    if(a.date!==b.date) return a.date<b.date?-1:1;
    return a.cree-b.cree;
  });
}
function nomOu(v){ return v.nom.trim()||'Unnamed visit'; }

/* ---------- Comptes rendus ---------- */

function crTexte(v){
  var four=estFournisseur(v);
  var L=[four?'Visit report':'Meeting report',''];
  L.push((four?'Company: ':'Meeting: ')+(v.nom.trim()||'to be completed'));
  if(v.type!=='autre') L.push('Type: '+typeDe(v).t);
  if(v.ville.trim()) L.push('City: '+v.ville.trim());
  if(v.date) L.push('Date: '+dateFr(v.date));
  if(v.contacts.trim()) L.push('Contacts: '+v.contacts.trim());
  if(v.activite.trim()) L.push((four?'Activity: ':'Context: ')+v.activite.trim());
  var m=moyenne(v);
  if(m!==null) L.push('Average score: '+nombre(m)+'/5');
  if(four&&v.avis) L.push('Verdict: '+libelleAvis(v.avis));
  if(v.objectif.trim()) L.push('','Objective',v.objectif.trim());
  var u=sujetsUtiles(v);
  var faits=u.filter(function(x){ return x.fait; }), reste=u.filter(function(x){ return !x.fait; });
  if(faits.length){
    L.push('','Topics covered ('+faits.length+' of '+u.length+')');
    faits.forEach(function(x){
      L.push('- '+(x.t.trim()||'Untitled topic'));
      if(x.note.trim()) L.push('  Answer: '+x.note.trim().replace(/\n/g,'\n  '));
    });
  }
  if(reste.length){
    L.push('',faits.length?'Topics not covered':'Topics to cover');
    reste.forEach(function(x){
      L.push('- '+(x.t.trim()||'Untitled topic'));
      if(x.note.trim()) L.push('  Note: '+x.note.trim().replace(/\n/g,'\n  '));
    });
  }
  if(v.libre.trim()) L.push('','Hot debrief',v.libre.trim());
  if(four) CRITERES.forEach(function(c){
    var s=Number(v.scores[c.k])||0, n=(v.notes[c.k]||'').trim();
    if(!s&&!n) return;
    L.push('',c.t+(s?' ('+s+'/5)':''));
    if(n) L.push(n);
  });
  syntheseDe(v).forEach(function(c){
    var n=(v[c.k]||'').trim();
    if(n) L.push('',c.t,n);
  });
  return L.join('\n');
}
function classement(){
  return parDate(fournisseurs()).sort(function(a,b){
    var ma=moyenne(a), mb=moyenne(b);
    if(ma===null&&mb===null) return 0;
    if(ma===null) return 1;
    if(mb===null) return -1;
    return mb-ma;
  });
}
function toutTexte(){
  var L=[];
  if(fournisseurs().length) L.push('Supplier comparison','');
  classement().forEach(function(v,i){
    var m=moyenne(v), bouts=[];
    if(m!==null) bouts.push(nombre(m)+'/5');
    if(v.avis) bouts.push(libelleAvis(v.avis));
    L.push((i+1)+'. '+nomOu(v)+(v.ville.trim()?' ('+v.ville.trim()+')':'')+(bouts.length?' : '+bouts.join(', '):''));
  });
  parDate(etat.visits).forEach(function(v){
    if(L.length) L.push('','----------------------------------------','');
    L.push(crTexte(v));
  });
  return L.join('\n');
}
function nomFichier(v){
  var base=(v.nom.trim()||'visit').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'visit';
  return 'report-'+base+(v.date?'-'+v.date:'')+'.txt';
}

/* ---------- Petits outils d'interface ---------- */

function h(tag,attrs){
  var el=document.createElement(tag), k, v;
  if(attrs) for(k in attrs){
    v=attrs[k];
    if(v===null||v===undefined||v===false) continue;
    if(k==='class') el.className=v;
    else if(k==='text') el.textContent=v;
    else if(k.slice(0,2)==='on') el.addEventListener(k.slice(2),v);
    else el.setAttribute(k,v===true?'':v);
  }
  for(var i=2;i<arguments.length;i++) ajouter(el,arguments[i]);
  return el;
}
function ajouter(el,c){
  if(c===null||c===undefined||c===false) return;
  if(Array.isArray(c)){ c.forEach(function(x){ ajouter(el,x); }); return; }
  el.appendChild(c.nodeType?c:document.createTextNode(String(c)));
}
var minuteurToast=null;
function toast(msg,action,fn){
  var t=document.getElementById('toast');
  t.textContent='';
  t.appendChild(h('span',{text:msg}));
  if(action){
    t.appendChild(h('button',{type:'button',text:action,onclick:function(){
      clearTimeout(minuteurToast); t.classList.remove('vu','action'); fn();
    }}));
  }
  t.classList.toggle('action',!!action);
  t.classList.add('vu');
  clearTimeout(minuteurToast);
  minuteurToast=setTimeout(function(){ t.classList.remove('vu','action'); },action?7000:3200);
}
function afficherEtat(){
  var p=document.getElementById('etat');
  if(!p) return;
  var fin=horsLigne?' Ready offline.':'';
  if(verrouille){
    p.className='etat';
    p.textContent='Notebook locked.'+fin;
  }else if(!stockageOK){
    p.className='etat alerte';
    p.textContent='Auto-save is unavailable here. Download your reports before closing.';
  }else{
    p.className='etat';
    p.textContent=(derniereSauvegarde
      ?'Saved on this device at '+deux(derniereSauvegarde.getHours())+':'+deux(derniereSauvegarde.getMinutes())+'.'
      :'Your notes stay on this device.')+(cle?' Notes encrypted.':'')+fin;
  }
}
function grandir(ta){
  ta.style.height='auto';
  ta.style.height=(ta.scrollHeight+2)+'px';
}
function copier(txt,ok){
  function repli(){
    var ta=h('textarea',{class:'hors','aria-hidden':'true'});
    ta.value=txt; document.body.appendChild(ta); ta.select();
    var r=false; try{ r=document.execCommand('copy'); }catch(e){}
    document.body.removeChild(ta); return r;
  }
  function bilan(r){ toast(r?ok:'Copy is not possible here. Use Download.'); }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ bilan(true); },function(){ bilan(repli()); });
  }else bilan(repli());
}
function parLien(nom,contenu,type){
  try{
    var blob=new Blob([contenu],{type:type});
    var url=URL.createObjectURL(blob);
    var a=h('a',{href:url,download:nom,class:'hors'});
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); },1500);
    toast('Downloaded: '+nom);
  }catch(e){ toast('Download is not possible here. Use Copy.'); }
}
function enregistrer(nom,contenu,type){
  /* Sur iPhone, une app installée télécharge mal : on passe par la feuille de partage. */
  if(IOS&&navigator.canShare&&navigator.share&&window.File){
    try{
      var f=new File([contenu],nom,{type:type});
      if(navigator.canShare({files:[f]})){
        navigator.share({files:[f]}).then(function(){ toast('File shared: '+nom); },function(e){
          if(!e||e.name!=='AbortError') parLien(nom,contenu,type);
        });
        return;
      }
    }catch(e){}
  }
  parLien(nom,contenu,type);
}
function enregistrerTexte(nom,txt){ enregistrer(nom,'\uFEFF'+txt,'text/plain;charset=utf-8'); }
function occuper(btn,libelle){
  var avant=btn.textContent;
  btn.disabled=true; btn.textContent=libelle;
  return function(){ btn.disabled=false; btn.textContent=avant; };
}
function deuxTemps(btn,libelle,confirmer,action){
  var arme=false, m=null;
  btn.addEventListener('click',function(){
    if(!arme){
      arme=true; btn.textContent=confirmer;
      m=setTimeout(function(){ arme=false; btn.textContent=libelle; },4000);
      return;
    }
    clearTimeout(m); arme=false; btn.textContent=libelle;
    action();
  });
  return btn;
}
/* En haut de chaque écran secondaire, et qui reste visible en défilant. */
function boutonRetour(){
  var NS='http://www.w3.org/2000/svg';
  var svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','2.5');
  svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
  svg.setAttribute('aria-hidden','true');
  var p=document.createElementNS(NS,'path'); p.setAttribute('d','M15 5l-7 7 7 7');
  svg.appendChild(p);
  return h('div',{class:'haut'},
    h('button',{type:'button',class:'retour',onclick:function(){ aller(''); }},svg,'Back'));
}
function champCode(id,libelle,remplissage){
  return [
    h('label',{class:'etiquette',for:id,text:libelle}),
    h('input',{class:'saisie',id:id,type:'password',autocomplete:remplissage,
      autocapitalize:'off',autocorrect:'off',spellcheck:'false'})
  ];
}

/* ---------- Dictée par le navigateur (désactivée par défaut) ---------- */

var dictee=null;

function arreterDictee(){
  var d=dictee; if(!d) return;
  dictee=null; d.actif=false;
  try{ if(d.rec) d.rec.stop(); }catch(e){}
  d.btn.classList.remove('actif');
  d.btn.setAttribute('aria-pressed','false');
  d.btn.querySelector('.mic-txt').textContent='Dictate';
}
function basculerDictee(btn,ta,maj){
  if(dictee){
    var meme=dictee.btn===btn;
    arreterDictee();
    if(meme) return;
  }
  dictee={btn:btn,ta:ta,maj:maj,actif:true,rec:null,courts:0,dernier:ta.value};
  btn.classList.add('actif');
  btn.setAttribute('aria-pressed','true');
  btn.querySelector('.mic-txt').textContent='Stop';
  ecouter(dictee);
}
function ecouter(d){
  var rec, debut=Date.now();
  try{ rec=new SR(); }catch(e){ echecDictee(d,'Dictation is unavailable here. Use your keyboard’s microphone.'); return; }
  d.rec=rec;
  rec.lang=etat.lang||'fr-FR';
  rec.interimResults=true;
  rec.continuous=!ANDROID;
  var base=d.ta.value.replace(/\s+$/,'');
  if(base) base+=' ';
  d.dernier=d.ta.value;
  rec.onresult=function(e){
    /* Si le texte a changé depuis notre dernière écriture, c'est une frappe : on ne l'écrase pas. */
    if(d.ta.value!==d.dernier){
      d.actif=false;
      if(dictee===d) arreterDictee();
      return;
    }
    var fin='',prov='';
    for(var i=0;i<e.results.length;i++){
      var r=e.results[i], t=r[0].transcript;
      if(r.isFinal) fin+=t.trim()+' '; else prov+=t;
    }
    d.ta.value=base+fin+prov;
    d.dernier=d.ta.value;
    d.maj();
  };
  rec.onerror=function(e){
    if(e.error==='no-speech'||e.error==='aborted') return;
    d.actif=false;
    toast(e.error==='not-allowed'||e.error==='service-not-allowed'
      ?'Microphone blocked. Allow it in the browser, or use the keyboard’s microphone.'
      :e.error==='network'
      ?'No connection for dictation. Use the keyboard’s microphone.'
      :'Dictation stopped. Try again, or use the keyboard’s microphone.');
  };
  rec.onend=function(){
    if(dictee!==d) return;
    d.courts=(Date.now()-debut<600)?d.courts+1:0;
    if(d.actif&&d.courts<3){ ecouter(d); return; }
    arreterDictee();
  };
  try{ rec.start(); }catch(e){ echecDictee(d,'Dictation is unavailable here. Use your keyboard’s microphone.'); }
}
function echecDictee(d,msg){
  if(dictee===d) arreterDictee();
  toast(msg);
}
function icone(){
  var NS='http://www.w3.org/2000/svg';
  var svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','2');
  svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
  var r=document.createElementNS(NS,'rect');
  r.setAttribute('x','9'); r.setAttribute('y','3'); r.setAttribute('width','6');
  r.setAttribute('height','11'); r.setAttribute('rx','3');
  var p=document.createElementNS(NS,'path');
  p.setAttribute('d','M5 11a7 7 0 0 0 14 0M12 18v3');
  svg.appendChild(r); svg.appendChild(p);
  var s=h('span',{'aria-hidden':'true'}); s.appendChild(svg);
  return s;
}

/* ---------- Champs d'une visite ---------- */

function zone(v,obj,cleChamp,nom,id,lignes){
  var ta=h('textarea',{id:id,rows:lignes||3,'aria-label':nom});
  var avecMic=!!(SR&&etat.dictee);
  ta.value=obj[cleChamp]||'';
  function maj(){ obj[cleChamp]=ta.value; grandir(ta); modifie(v); }
  ta.addEventListener('input',function(){
    if(dictee&&dictee.ta===ta) arreterDictee();    /* une frappe arrête la dictée */
    maj();
  });
  ta.addEventListener('change',function(){ if(minuteur) sauver(); });
  var z=h('div',{class:'zone'+(avecMic?' avec-mic':'')},ta);
  if(avecMic){
    var b=h('button',{type:'button',class:'mic','aria-pressed':'false','aria-label':'Dictate: '+nom},
      icone(),h('span',{class:'mic-txt',text:'Dictate'}));
    b.addEventListener('click',function(){ basculerDictee(b,ta,maj); });
    z.appendChild(b);
  }
  return z;
}
function caseCartouche(v,cleChamp,nom,classe,type,invite){
  var id='c-'+cleChamp;
  var inp=h('input',{id:id,type:type||'text',placeholder:invite||null,autocomplete:'off'});
  inp.value=v[cleChamp]||'';
  inp.addEventListener('input',function(){ v[cleChamp]=inp.value; modifie(v); });
  inp.addEventListener('change',function(){ if(minuteur) sauver(); });
  return h('div',{class:'case '+classe},h('label',{for:id,text:nom}),inp);
}
function jauge(v,c){
  var g=h('div',{class:'jauge',role:'group','aria-label':'Score: '+c.t});
  var boutons=[];
  function peindre(){
    var s=Number(v.scores[c.k])||0;
    boutons.forEach(function(b,i){
      b.classList.toggle('plein',i<s);
      b.setAttribute('aria-pressed',String(i+1===s));
    });
  }
  for(var n=1;n<=5;n++){
    (function(n){
      var b=h('button',{type:'button','aria-label':n+' out of 5',text:String(n)});
      b.addEventListener('click',function(){
        v.scores[c.k]=(Number(v.scores[c.k])===n)?0:n;
        peindre(); modifie(v);
      });
      boutons.push(b); g.appendChild(b);
    })(n);
  }
  peindre();
  return g;
}

/* ---------- Vue : carnet verrouillé ---------- */

function vueVerrou(){
  var erreur=h('p',{class:'erreur',role:'alert'});
  var bouton=h('button',{type:'submit',class:'btn principal large',text:'Unlock'});
  var champ=champCode('code-ouvrir','Passcode','current-password');
  var form=h('form',{class:'verrou',novalidate:true},
    h('h2',{text:'Notebook locked'}),
    h('p',{text:'Enter your passcode to read and edit your notes.'}),
    champ,erreur,bouton);
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var code=champ[1].value;
    if(!code){ erreur.textContent='Enter your passcode.'; return; }
    erreur.textContent='';
    var liberer=occuper(bouton,'Unlocking…');
    deverrouiller(code).then(function(ok){
      if(ok){ afficherRoute(); return; }
      liberer(); champ[1].value='';
      erreur.textContent=CRYPTO?'Wrong passcode.':'This browser cannot decrypt the notebook. Open it in your usual browser.';
    });
  });
  var f=document.createDocumentFragment();
  f.appendChild(form);
  if(!oubli){
    f.appendChild(h('button',{type:'button',class:'lien',text:'Forgot your passcode?',onclick:function(){ oubli=true; rendre(); }}));
  }else{
    var repartir=deuxTemps(h('button',{type:'button',class:'btn danger',text:'Start a new notebook'}),
      'Start a new notebook','Confirm: erase this notebook',function(){
        try{ localStorage.removeItem(CLE); }catch(e){}
        etat=etatVide(); cle=null; sel=null; verrouille=false; oubli=false;
        toast('New notebook created.');
        afficherRoute();
      });
    f.appendChild(h('div',{class:'oubli'},
      h('p',{text:'Without the passcode these notes cannot be read: that is the point of the lock, and nobody can recover it. You can keep the locked notebook in a file to reopen it later, then start a new one.'}),
      h('div',{class:'rangee'},
        h('button',{type:'button',class:'btn',text:'Keep the locked notebook',onclick:function(){
          var brut=lireBrut();
          if(brut) enregistrer('locked-notebook-'+aujourdhui()+'.json',brut,'application/json');
        }}),
        repartir)));
  }
  return f;
}

/* ---------- Vue : liste des visites ---------- */

function sectionCopie(){
  var fichier=h('input',{type:'file',accept:'.json,application/json',class:'hors','aria-hidden':'true',tabindex:'-1'});
  fichier.addEventListener('change',function(){ lireCopie(fichier); });
  var sec=h('section',{class:'outils'},
    h('h2',{text:'Backup'}),
    h('p',{text:'Notes live in this browser, on this device. Save a backup every evening.'
      +(cle?' The backup is encrypted with your passcode.':'')}));
  if(copieEnAttente){
    var erreur=h('p',{class:'erreur',role:'alert'});
    var ouvrir=h('button',{type:'submit',class:'btn principal',text:'Open backup'});
    var champ=champCode('code-copie','This backup is locked. Its passcode','current-password');
    var form=h('form',{class:'formulaire',novalidate:true},champ,erreur,
      h('div',{class:'rangee'},ouvrir,
        h('button',{type:'button',class:'btn',text:'Cancel',onclick:function(){ copieEnAttente=null; rendre(); }})));
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var env=copieEnAttente, code=champ[1].value;
      if(!env||!code){ erreur.textContent='Enter the backup’s passcode.'; return; }
      erreur.textContent='';
      var liberer=occuper(ouvrir,'Opening…');
      deriver(code,deb64(env.sel),env.iter).then(function(k){ return dechiffrer(env,k); })
        .then(function(t){
          var o=JSON.parse(t);
          copieEnAttente=null;
          fusionner(Array.isArray(o.visits)?o.visits:[],tableValide(o.traductions));
        },function(){
          liberer(); champ[1].value='';
          erreur.textContent='Wrong passcode for this backup.';
        });
    });
    sec.appendChild(form);
  }else{
    sec.appendChild(h('div',{class:'rangee'},
      etat.visits.length?h('button',{type:'button',class:'btn',text:'Save a backup',onclick:copieSecours}):null,
      h('button',{type:'button',class:'btn',text:'Restore a backup',onclick:function(){ fichier.click(); }})));
  }
  sec.appendChild(fichier);
  return sec;
}

function sectionVerrou(){
  var sec=h('section',{class:'outils'},h('h2',{text:'Passcode lock'}));
  if(!CRYPTO){
    sec.appendChild(h('p',{text:'The passcode lock is not available in this browser.'}));
    return sec;
  }
  if(panneau==='code'||panneau==='changer'){
    var changer=panneau==='changer';
    var erreur=h('p',{class:'erreur',role:'alert'});
    var valider=h('button',{type:'submit',class:'btn principal',text:changer?'Change passcode':'Turn on lock'});
    var c1=champCode('code-nouveau','New passcode, '+CODE_MIN+' characters or more','new-password');
    var c2=champCode('code-encore','Same passcode, once more','new-password');
    var form=h('form',{class:'formulaire',novalidate:true},
      h('p',{text:'Write this passcode down somewhere else: without it the notes are lost. Nobody can recover it.'}),
      c1,c2,erreur,
      h('div',{class:'rangee'},valider,
        h('button',{type:'button',class:'btn',text:'Cancel',onclick:function(){ panneau=''; rendre(); }})));
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var a=c1[1].value, b=c2[1].value;
      if(a.length<CODE_MIN){ erreur.textContent='The passcode must be at least '+CODE_MIN+' characters.'; return; }
      if(a!==b){ erreur.textContent='The two passcodes do not match.'; return; }
      erreur.textContent='';
      var liberer=occuper(valider,'Encrypting…');
      definirCode(a).then(function(){
        panneau=''; rendre();
        toast(changer?'Passcode changed.':'Lock on. Notes are encrypted.');
      },function(){
        liberer(); erreur.textContent='The lock could not be turned on here.';
      });
    });
    sec.appendChild(form);
  }else if(cle){
    sec.appendChild(h('p',{text:'Notes are encrypted on this device. The notebook locks every time it is closed, and after 5 minutes in the background.'}));
    var retirer=deuxTemps(h('button',{type:'button',class:'btn danger',text:'Remove lock'}),
      'Remove lock','Confirm: remove lock',function(){
        retirerVerrou(); rendre(); toast('Lock removed. Notes are no longer encrypted.');
      });
    sec.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn principal',text:'Lock now',onclick:verrouiller}),
      h('button',{type:'button',class:'btn',text:'Change passcode',onclick:function(){ panneau='changer'; rendre(); }})));
    sec.appendChild(h('div',{class:'rangee'},retirer));
  }else{
    sec.appendChild(h('p',{text:'A passcode encrypts the notes on this device: without it they cannot be read, even by someone holding the unlocked phone.'}));
    sec.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn',text:'Protect with a passcode',onclick:function(){ panneau='code'; rendre(); }})));
  }
  return sec;
}

function sectionDictee(){
  var sec=h('section',{class:'outils'},h('h2',{text:'Dictation'}));
  if(!SR||!etat.dictee){
    sec.appendChild(h('p',{text:'To dictate, tap a field then your keyboard’s microphone: nothing goes through this app.'}));
    if(SR){
      sec.appendChild(h('p',{text:'A Dictate button can be added to visits. It sends your voice to the browser’s speech service (Google or Apple) to transcribe it: avoid it for sensitive notes.'}));
      sec.appendChild(h('div',{class:'rangee'},
        h('button',{type:'button',class:'btn',text:'Add the Dictate button',onclick:function(){ etat.dictee=true; sauver(); rendre(); }})));
    }
    return sec;
  }
  var choix=h('select',{id:'langue','aria-label':'Dictation language'},
    h('option',{value:'fr-FR',text:'I dictate in French'}),
    h('option',{value:'en-GB',text:'I dictate in English'}));
  choix.value=etat.lang;
  choix.addEventListener('change',function(){ etat.lang=choix.value; sauver(); });
  sec.appendChild(h('p',{text:'The Dictate button is shown on visits. Your voice goes through the browser’s speech service (Google or Apple) and needs a connection.'}));
  sec.appendChild(choix);
  sec.appendChild(h('div',{class:'rangee'},
    h('button',{type:'button',class:'btn',text:'Remove the Dictate button',onclick:function(){ etat.dictee=false; sauver(); rendre(); }})));
  return sec;
}

function vueListe(){
  var f=document.createDocumentFragment();

  if(!etat.visits.length){
    f.appendChild(h('div',{class:'vide'},
      h('p',{class:'vide-titre',text:'No visits yet.'}),
      h('p',{text:'Create the visit before you walk in. Write up the rest on your way out.'})));
  }else{
    var liste=h('div',{class:'liste'});
    parDate(etat.visits).forEach(function(v){
      var m=moyenne(v);
      var meta=[v.type!=='autre'?typeDe(v).t:'',v.ville.trim(),dateFr(v.date)].filter(Boolean).join(', ');
      var sujets=compteSujets(v);
      liste.appendChild(h('button',{type:'button',class:'ligne',onclick:function(){ aller('visite-'+v.id); }},
        h('span',null,
          h('span',{class:'ligne-nom',text:nomOu(v)}),
          meta?h('span',{class:'ligne-meta',text:meta}):null,
          sujets?h('span',{class:'ligne-meta',text:'Topics: '+sujets}):null),
        h('span',{class:'ligne-droite'},
          m!==null?h('span',{class:'ligne-note',text:nombre(m)+'/5'}):null,
          v.avis?h('span',{class:'avis '+v.avis,text:libelleAvis(v.avis)}):null)));
    });
    f.appendChild(liste);
  }

  f.appendChild(h('button',{type:'button',class:'btn principal large',onclick:creer},'New visit'));
  if(fournisseurs().length>=2){
    f.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn',onclick:function(){ aller('comparer'); }},'Compare suppliers')));
  }
  if(etat.visits.length){
    f.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn',onclick:function(){ copier(toutTexte(),'All reports copied'); }},'Copy all reports'),
      h('button',{type:'button',class:'btn',onclick:function(){ enregistrerTexte('visit-reports-'+aujourdhui()+'.txt',toutTexte()); }},'Download all reports')));
  }

  f.appendChild(sectionCopie());
  f.appendChild(sectionVerrou());
  f.appendChild(sectionDictee());
  return f;
}

/* ---------- Vue : une visite ---------- */

function sectionPreparation(v){
  var compteur=h('p',{class:'compteur','aria-live':'polite'});
  var liste=h('div',{class:'sujets'});
  function compter(){ compteur.textContent=compteSujets(v)||'No topics yet.'; }

  function ligne(s){
    var coche=h('input',{type:'checkbox',class:'coche','aria-label':'Topic covered'});
    coche.checked=s.fait;
    var txt=h('textarea',{class:'sujet-texte',rows:1,'aria-label':'Topic to cover',placeholder:'Topic to cover'});
    txt.value=s.t;
    var rep=h('textarea',{class:'sujet-reponse',rows:2,'aria-label':'Answer',placeholder:'Answer'});
    rep.value=s.note;
    var retirer=h('button',{type:'button',class:'retirer','aria-label':'Remove this topic',text:'\u00D7'});
    var rang=h('div',{class:'sujet'+(s.fait?' fait':'')},coche,txt,retirer,rep);
    function montrer(){ rep.hidden=!(s.fait||s.note.trim()); if(!rep.hidden) grandir(rep); }
    coche.addEventListener('change',function(){
      s.fait=coche.checked; rang.classList.toggle('fait',s.fait);
      montrer(); compter(); modifie(v);
    });
    txt.addEventListener('input',function(){ s.t=txt.value; grandir(txt); compter(); modifie(v); });
    txt.addEventListener('change',function(){ if(minuteur) sauver(); });
    rep.addEventListener('input',function(){ s.note=rep.value; grandir(rep); modifie(v); });
    rep.addEventListener('change',function(){ if(minuteur) sauver(); });
    retirer.addEventListener('click',function(){
      var i=v.sujets.indexOf(s);
      if(i<0) return;
      v.sujets.splice(i,1); modifie(v); redessiner();
      if(!s.t.trim()&&!s.note.trim()) return;
      toast('Topic removed','Undo',function(){
        if(verrouille||indexDe(v.id)<0||v.sujets.indexOf(s)>=0) return;
        v.sujets.splice(Math.min(i,v.sujets.length),0,s); modifie(v);
        if(vue.nom==='visite'&&vue.id===v.id) rendreSurPlace();
      });
    });
    rep.hidden=!(s.fait||s.note.trim());
    return {rang:rang,txt:txt};
  }
  function redessiner(){
    liste.textContent='';
    v.sujets.forEach(function(s){ liste.appendChild(ligne(s).rang); });
    var zones=liste.querySelectorAll('textarea');
    for(var i=0;i<zones.length;i++) if(!zones[i].hidden) grandir(zones[i]);
    compter();
  }

  var choixType=h('select',{id:'c-type',class:'saisie'});
  TYPES.forEach(function(t){ choixType.appendChild(h('option',{value:t.k,text:t.t})); });
  choixType.value=v.type;
  choixType.addEventListener('change',function(){
    v.type=typeConnu(choixType.value)?choixType.value:'autre';
    modifie(v); sauver(); rendreSurPlace();
  });

  var modele=typeDe(v).s;
  var boutons=h('div',{class:'rangee'},
    h('button',{type:'button',class:'btn',text:'Add a topic',onclick:function(){
      var s={id:nouvelId(),t:'',fait:false,note:''};
      v.sujets.push(s);
      var l=ligne(s); liste.appendChild(l.rang); grandir(l.txt); compter();
      l.txt.focus();
    }}),
    modele.length?h('button',{type:'button',class:'btn',text:'Add standard topics',onclick:function(){
      var deja={}, n=0;
      v.sujets.forEach(function(s){ deja[s.t.trim()]=true; });
      modele.forEach(function(t){
        if(deja[t]) return;
        v.sujets.push({id:nouvelId(),t:t,fait:false,note:''}); n++;
      });
      if(!n){ toast('The standard topics are already in the list.'); return; }
      modifie(v); redessiner();
      toast(n+(n>1?' topics added':' topic added')+' : '+typeDe(v).t);
    }}):null);

  var sec=h('section',{class:'bloc'},
    h('h2',{text:'Preparation'}),
    h('p',{class:'aide',text:'Fill this in before you go. On site, tick each topic covered and note the answer.'}),
    h('label',{class:'etiquette',for:'c-type',text:'Meeting type'}),choixType,
    h('h3',{class:'sous-titre',text:'Objective'}),
    h('p',{class:'aide',text:'What you want to have obtained by the time you leave.'}),
    zone(v,v,'objectif','Objective','z-objectif',2),
    h('h3',{class:'sous-titre',text:'Topics to cover'}),
    compteur,liste,boutons);
  redessiner();
  return sec;
}

function vueVisite(v){
  var four=estFournisseur(v);
  var f=document.createDocumentFragment();
  f.appendChild(boutonRetour());

  f.appendChild(h('div',{class:'cartouche'},
    caseCartouche(v,'nom',four?'Company':'Meeting','pleine nom','text',four?'Company name':'With whom'),
    caseCartouche(v,'ville','City','gauche','text'),
    caseCartouche(v,'date','Date','','date'),
    caseCartouche(v,'contacts','Contacts','pleine','text','Names and roles'),
    caseCartouche(v,'activite',four?'Activity':'Context','pleine derniere','text',four?'Trade, parts, customers':'Project, scope')));

  if(!(SR&&etat.dictee)) f.appendChild(h('p',{class:'astuce',text:'To dictate, tap a field then your keyboard’s microphone.'}));

  f.appendChild(sectionPreparation(v));

  f.appendChild(h('section',{class:'bloc'},
    h('h2',{text:'Hot debrief'}),
    h('p',{class:'aide',text:four?'Write down everything that comes to mind as you leave the site. Sort it out later.':'Write down everything that comes to mind as you leave the meeting. Sort it out later.'}),
    zone(v,v,'libre','Hot debrief','z-libre',5)));

  if(four) CRITERES.forEach(function(c){
    f.appendChild(h('section',{class:'bloc'},
      h('div',{class:'bloc-tete'},h('h2',{text:c.t}),jauge(v,c)),
      h('p',{class:'aide',text:c.a}),
      zone(v,v.notes,c.k,c.t,'z-'+c.k,3)));
  });

  syntheseDe(v).forEach(function(c){
    f.appendChild(h('section',{class:'bloc'},
      h('div',{class:'bloc-tete'},h('h2',{text:c.t})),
      zone(v,v,c.k,c.t,'z-'+c.k,3)));
  });

  var choix=h('div',{class:'choix',role:'group','aria-label':'Verdict'});
  var boutons=[];
  function peindre(){
    boutons.forEach(function(b){
      var pris=b.getAttribute('data-k')===v.avis;
      b.classList.toggle('pris',pris);
      b.setAttribute('aria-pressed',String(pris));
    });
  }
  AVIS.forEach(function(a){
    var b=h('button',{type:'button','data-k':a.k,text:a.t});
    b.addEventListener('click',function(){ v.avis=(v.avis===a.k)?'':a.k; peindre(); modifie(v); });
    boutons.push(b); choix.appendChild(b);
  });
  peindre();
  if(four) f.appendChild(h('section',{class:'bloc'},h('h2',{text:'Verdict'}),choix));

  var suppr=deuxTemps(h('button',{type:'button',class:'btn danger',text:'Delete visit'}),
    'Delete visit','Confirm deletion',function(){ supprimer(v); });
  f.appendChild(h('div',{class:'rangee fin'},
    navigator.share?h('button',{type:'button',class:'btn',onclick:function(){
      navigator.share({title:'Report: '+nomOu(v),text:crTexte(v)}).catch(function(){});
    }},'Share report'):null,
    h('button',{type:'button',class:'btn',onclick:function(){ enregistrerTexte(nomFichier(v),crTexte(v)); }},'Download report'),
    suppr));

  /* Toujours visible en bas : valider enregistre et ramène à la liste. */
  f.appendChild(h('div',{class:'barre'},
    h('button',{type:'button',class:'btn principal',onclick:function(){ valider(); }},'Save'),
    h('button',{type:'button',class:'btn',onclick:function(){ copier(crTexte(v),'Report copied'); }},'Copy report')));
  return f;
}

/* ---------- Vue : comparatif ---------- */

function vueComparer(){
  var f=document.createDocumentFragment();
  f.appendChild(boutonRetour());
  var tete=h('tr',null,h('th',{scope:'col',text:'Company'}),h('th',{scope:'col',text:'Average'}));
  CRITERES.forEach(function(c){ tete.appendChild(h('th',{scope:'col',text:c.c})); });
  tete.appendChild(h('th',{scope:'col',text:'Verdict'}));
  var corps=h('tbody');
  classement().forEach(function(v){
    var m=moyenne(v);
    var tr=h('tr',null,
      h('td',{class:'nom-col',text:nomOu(v)}),
      h('td',{class:'moy',text:m!==null?nombre(m):'–'}));
    CRITERES.forEach(function(c){
      var s=Number(v.scores[c.k])||0;
      tr.appendChild(h('td',{text:s?String(s):'–'}));
    });
    tr.appendChild(h('td',null,v.avis?h('span',{class:'avis '+v.avis,text:libelleAvis(v.avis)}):'–'));
    corps.appendChild(tr);
  });
  f.appendChild(h('div',{class:'tableau'},h('table',null,h('thead',null,tete),corps)));
  f.appendChild(h('p',{class:'astuce',text:'Suppliers ranked by average score. Scores run from 1 to 5.'}));
  f.appendChild(h('div',{class:'rangee'},
    h('button',{type:'button',class:'btn',onclick:function(){ copier(toutTexte(),'All reports copied'); }},'Copy all reports')));
  return f;
}

/* ---------- Actions ---------- */

function creer(){
  var v=normaliser({date:aujourdhui()});
  etat.visits.push(v);
  sauver();
  aller('visite-'+v.id);
}
function valider(){
  arreterDictee();
  sauver();
  file.then(function(){
    if(!stockageOK){ toast('Saving is not possible on this device. Copy your report before leaving this visit.'); return; }
    aller('');
    toast('Visit saved. Tap it in the list to edit it.');
  });
}
function supprimer(v){
  var i=indexDe(v.id);
  if(i<0) return;
  etat.visits.splice(i,1);
  sauver();
  aller('');
  toast('Visit deleted','Undo',function(){
    if(verrouille||indexDe(v.id)>=0) return;
    etat.visits.splice(Math.min(i,etat.visits.length),0,v);
    sauver(); reafficher();
    toast('Visit restored');
  });
}
function copieSecours(){
  var nom='visit-notebook-'+aujourdhui()+'.json';
  if(!cle){ enregistrer(nom,JSON.stringify(etat,null,2),'application/json'); return; }
  chiffrer(JSON.stringify(etat),cle,sel,iter).then(function(s){
    enregistrer(nom,s,'application/json');
  },function(){ toast('Backup failed. Try again.'); });
}
/* Applique une table de traduction aux textes des fiches, sans toucher aux notes saisies. */
function traduire(table){
  if(!table) return 0;
  var n=0;
  etat.visits.forEach(function(v){
    var change=false;
    function tr(x){
      var k=x.trim();
      if(!k||!possede(table,k)||table[k]===x) return x;
      change=true; n++;
      return table[k];
    }
    v.nom=tr(v.nom); v.activite=tr(v.activite); v.objectif=tr(v.objectif);
    v.sujets.forEach(function(x){ x.t=tr(x.t); });
    if(change) v.maj=Date.now();
  });
  return n;
}
function fusionner(liste,table){
  var ajout=0, garde=0;
  liste.slice(0,500).forEach(function(x){
    var v=normaliser(x), i=indexDe(v.id);
    if(i<0){ etat.visits.push(v); ajout++; }
    else if(v.maj>etat.visits[i].maj){ etat.visits[i]=v; ajout++; }   /* jamais écraser plus récent */
    else garde++;
  });
  var traduits=traduire(table);
  if(ajout||traduits) sauver();
  rendre();
  var suite=traduits?traduits+(traduits>1?' texts translated':' text translated'):'';
  if(!ajout&&traduits) toast(suite+'.');
  else if(!ajout) toast(garde?'Nothing to restore: your notes are already up to date.':'This backup contains no visits.');
  else toast(ajout+(ajout>1?' visits restored':' visit restored')+(garde?', '+garde+' already up to date':'')+(suite?', '+suite:''));
}
function lireCopie(input){
  var fic=input.files&&input.files[0];
  if(!fic) return;
  if(fic.size>5*1024*1024){ toast('This file is too large to be a notebook backup.'); input.value=''; return; }
  var lecteur=new FileReader();
  lecteur.onload=function(){
    var d=interpreter(String(lecteur.result));
    if(d.type==='clair') fusionner(d.etat.visits,d.table);
    else if(d.type==='chiffre'){
      if(CRYPTO){ copieEnAttente=d.env; rendre(); }
      else toast('This browser cannot open a locked backup.');
    }
    else toast('This file is not a notebook backup.');
    input.value='';
  };
  lecteur.onerror=function(){ toast('The file could not be read.'); input.value=''; };
  lecteur.readAsText(fic);
}

/* ---------- Navigation ---------- */

function routeDepuis(r){
  if(r==='comparer'&&fournisseurs().length) return {nom:'comparer',id:null};
  if(r.indexOf('visite-')===0&&trouver(r.slice(7))) return {nom:'visite',id:r.slice(7)};
  return {nom:'liste',id:null};
}
function rendre(){
  arreterDictee();
  var cible=document.getElementById('vue');
  cible.textContent='';
  var v=(vue.nom==='visite')?trouver(vue.id):null;
  if(verrouille) cible.appendChild(vueVerrou());
  else if(v) cible.appendChild(vueVisite(v));
  else if(vue.nom==='comparer'&&fournisseurs().length) cible.appendChild(vueComparer());
  else cible.appendChild(vueListe());
  var zones=cible.querySelectorAll('textarea');
  for(var i=0;i<zones.length;i++) if(!zones[i].hidden) grandir(zones[i]);
  afficherEtat();
}
function rendreSurPlace(){
  var y=window.pageYOffset;
  rendre();
  window.scrollTo(0,y);
}
function reafficher(){
  vue=routeDepuis((location.hash||'').slice(1));
  rendre();
}
function afficherRoute(){
  if(minuteur) sauver();
  reafficher();
  if(vue.nom!=='liste'){ panneau=''; copieEnAttente=null; }
  window.scrollTo(0,0);
}
function aller(route){
  if(minuteur) sauver();
  if((location.hash||'').slice(1)===route){ afficherRoute(); return; }
  try{ location.hash=route; }catch(e){}
  if((location.hash||'').slice(1)!==route){
    /* Navigation par ancre bloquée : on affiche directement. */
    vue=routeDepuis(route);
    rendre(); window.scrollTo(0,0);
  }
}

window.addEventListener('hashchange',afficherRoute);

document.addEventListener('visibilitychange',function(){
  if(document.hidden){
    arreterDictee();
    if(minuteur) sauver();
    cacheLe=Date.now();
  }else if(cle&&cacheLe&&Date.now()-cacheLe>VERROU_AUTO_MS){
    verrouiller();
  }
});
window.addEventListener('pagehide',function(){ if(minuteur) sauver(); });

/* Un autre onglet a écrit : on se remet à jour sans perdre la saisie en cours. */
window.addEventListener('storage',function(e){
  if(e.key!==CLE&&e.key!==null) return;
  recharger();
});

afficherRoute();

/* ---------- Ouverture sans réseau ---------- */

if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register('sw.js').catch(function(){});
  navigator.serviceWorker.ready.then(function(){ horsLigne=true; afficherEtat(); }).catch(function(){});
}
if(navigator.storage&&navigator.storage.persist){
  try{ navigator.storage.persist().catch(function(){}); }catch(e){}
}
})();
