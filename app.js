(function(){
'use strict';

var CLE='carnet-visites-v1';
var ITERATIONS=600000;            /* PBKDF2-SHA256 */
var VERROU_AUTO_MS=5*60*1000;     /* verrouillage après 5 min en arrière-plan */
var CODE_MIN=6;
var LANGUES=['fr-FR','en-GB'];

var CRITERES=[
  {k:'capacite',t:'Capacité et moyens',c:'Capacité',a:'Parc machines, charge actuelle, capacité disponible, effectif.'},
  {k:'qualite',t:'Qualité et certifications',c:'Qualité',a:'EN 9100, Nadcap, moyens de contrôle, traitement des non-conformités.'},
  {k:'procedes',t:'Procédés et technique',c:'Procédés',a:'Procédés spéciaux, savoir-faire, niveau technique des équipes.'},
  {k:'orga',t:'Organisation et management',c:'Organisation',a:'Pilotage, indicateurs, réactivité, niveau d’anglais des interlocuteurs.'},
  {k:'supply',t:'Supply chain et matière',c:'Supply',a:'Appros matière, sous-traitance, délais, logistique export.'},
  {k:'atelier',t:'Tenue de l’atelier',c:'Atelier',a:'Propreté, sécurité, flux, état des machines. Ce que tu as vu, pas ce qu’on t’a dit.'}
];
var SYNTHESE=[
  {k:'forts',t:'Points forts'},
  {k:'risques',t:'Risques et points faibles'},
  {k:'suites',t:'Suites à donner'}
];
var AVIS=[
  {k:'retenir',t:'À retenir'},
  {k:'creuser',t:'À creuser'},
  {k:'ecarter',t:'À écarter'}
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
  return {
    id:id,
    nom:texte(v.nom,300), ville:texte(v.ville,300), date:date,
    contacts:texte(v.contacts,1000), activite:texte(v.activite,1000),
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
  if(Array.isArray(o.visits)) return {type:'clair',etat:normaliserEtat(o)};
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
    setTimeout(function(){ toast('Des données illisibles ont été mises de côté. Le carnet repart vide.'); },0);
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
function moyenne(v){
  var s=0,n=0;
  CRITERES.forEach(function(c){ var x=Number(v.scores[c.k])||0; if(x>0){ s+=x; n++; } });
  return n?s/n:null;
}
function nombre(x){ return x.toFixed(1).replace('.',','); }
function dateFr(iso){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
  return m?m[3]+'/'+m[2]+'/'+m[1]:'';
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
function nomOu(v){ return v.nom.trim()||'Visite sans nom'; }

/* ---------- Comptes rendus ---------- */

function crTexte(v){
  var L=['Compte rendu de visite',''];
  L.push('Entreprise : '+(v.nom.trim()||'à compléter'));
  if(v.ville.trim()) L.push('Ville : '+v.ville.trim());
  if(v.date) L.push('Date : '+dateFr(v.date));
  if(v.contacts.trim()) L.push('Interlocuteurs : '+v.contacts.trim());
  if(v.activite.trim()) L.push('Activité : '+v.activite.trim());
  var m=moyenne(v);
  if(m!==null) L.push('Note moyenne : '+nombre(m)+'/5');
  if(v.avis) L.push('Avis : '+libelleAvis(v.avis));
  if(v.libre.trim()) L.push('','Débrief à chaud',v.libre.trim());
  CRITERES.forEach(function(c){
    var s=Number(v.scores[c.k])||0, n=(v.notes[c.k]||'').trim();
    if(!s&&!n) return;
    L.push('',c.t+(s?' ('+s+'/5)':''));
    if(n) L.push(n);
  });
  SYNTHESE.forEach(function(c){
    var n=(v[c.k]||'').trim();
    if(n) L.push('',c.t,n);
  });
  return L.join('\n');
}
function classement(){
  return parDate(etat.visits).sort(function(a,b){
    var ma=moyenne(a), mb=moyenne(b);
    if(ma===null&&mb===null) return 0;
    if(ma===null) return 1;
    if(mb===null) return -1;
    return mb-ma;
  });
}
function toutTexte(){
  var L=['Comparatif des visites',''];
  classement().forEach(function(v,i){
    var m=moyenne(v), bouts=[];
    if(m!==null) bouts.push(nombre(m)+'/5');
    if(v.avis) bouts.push(libelleAvis(v.avis));
    L.push((i+1)+'. '+nomOu(v)+(v.ville.trim()?' ('+v.ville.trim()+')':'')+(bouts.length?' : '+bouts.join(', '):''));
  });
  parDate(etat.visits).forEach(function(v){
    L.push('','----------------------------------------','',crTexte(v));
  });
  return L.join('\n');
}
function nomFichier(v){
  var base=(v.nom.trim()||'visite').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'visite';
  return 'CR-'+base+(v.date?'-'+v.date:'')+'.txt';
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
  var fin=horsLigne?' Prête hors ligne.':'';
  if(verrouille){
    p.className='etat';
    p.textContent='Carnet verrouillé.'+fin;
  }else if(!stockageOK){
    p.className='etat alerte';
    p.textContent='Sauvegarde automatique indisponible ici. Télécharge tes CR avant de fermer.';
  }else{
    p.className='etat';
    p.textContent=(derniereSauvegarde
      ?'Enregistré sur cet appareil à '+deux(derniereSauvegarde.getHours())+':'+deux(derniereSauvegarde.getMinutes())+'.'
      :'Tes notes restent sur cet appareil.')+(cle?' Notes chiffrées.':'')+fin;
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
  function bilan(r){ toast(r?ok:'Copie impossible ici. Utilise Télécharger.'); }
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
    toast('Téléchargé : '+nom);
  }catch(e){ toast('Téléchargement impossible ici. Utilise Copier.'); }
}
function enregistrer(nom,contenu,type){
  /* Sur iPhone, une app installée télécharge mal : on passe par la feuille de partage. */
  if(IOS&&navigator.canShare&&navigator.share&&window.File){
    try{
      var f=new File([contenu],nom,{type:type});
      if(navigator.canShare({files:[f]})){
        navigator.share({files:[f]}).then(function(){ toast('Fichier transmis : '+nom); },function(e){
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
  d.btn.querySelector('.mic-txt').textContent='Dicter';
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
  btn.querySelector('.mic-txt').textContent='Arrêter';
  ecouter(dictee);
}
function ecouter(d){
  var rec, debut=Date.now();
  try{ rec=new SR(); }catch(e){ echecDictee(d,'Dictée indisponible ici. Utilise le micro de ton clavier.'); return; }
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
      ?'Micro refusé. Autorise-le dans le navigateur, ou utilise le micro du clavier.'
      :e.error==='network'
      ?'Pas de connexion pour la dictée. Utilise le micro du clavier.'
      :'Dictée interrompue. Réessaie, ou utilise le micro du clavier.');
  };
  rec.onend=function(){
    if(dictee!==d) return;
    d.courts=(Date.now()-debut<600)?d.courts+1:0;
    if(d.actif&&d.courts<3){ ecouter(d); return; }
    arreterDictee();
  };
  try{ rec.start(); }catch(e){ echecDictee(d,'Dictée indisponible ici. Utilise le micro de ton clavier.'); }
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
    var b=h('button',{type:'button',class:'mic','aria-pressed':'false','aria-label':'Dicter : '+nom},
      icone(),h('span',{class:'mic-txt',text:'Dicter'}));
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
  var g=h('div',{class:'jauge',role:'group','aria-label':'Note : '+c.t});
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
      var b=h('button',{type:'button','aria-label':n+' sur 5',text:String(n)});
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
  var bouton=h('button',{type:'submit',class:'btn principal large',text:'Déverrouiller'});
  var champ=champCode('code-ouvrir','Code','current-password');
  var form=h('form',{class:'verrou',novalidate:true},
    h('h2',{text:'Carnet verrouillé'}),
    h('p',{text:'Saisis ton code pour lire et modifier tes notes.'}),
    champ,erreur,bouton);
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var code=champ[1].value;
    if(!code){ erreur.textContent='Saisis ton code.'; return; }
    erreur.textContent='';
    var liberer=occuper(bouton,'Déverrouillage…');
    deverrouiller(code).then(function(ok){
      if(ok){ afficherRoute(); return; }
      liberer(); champ[1].value='';
      erreur.textContent=CRYPTO?'Code incorrect.':'Ce navigateur ne sait pas déchiffrer le carnet. Ouvre-le dans le navigateur habituel.';
    });
  });
  var f=document.createDocumentFragment();
  f.appendChild(form);
  if(!oubli){
    f.appendChild(h('button',{type:'button',class:'lien',text:'Code oublié ?',onclick:function(){ oubli=true; rendre(); }}));
  }else{
    var repartir=deuxTemps(h('button',{type:'button',class:'btn danger',text:'Commencer un nouveau carnet'}),
      'Commencer un nouveau carnet','Confirmer : effacer ce carnet',function(){
        try{ localStorage.removeItem(CLE); }catch(e){}
        etat=etatVide(); cle=null; sel=null; verrouille=false; oubli=false;
        toast('Nouveau carnet créé.');
        afficherRoute();
      });
    f.appendChild(h('div',{class:'oubli'},
      h('p',{text:'Sans le code, ces notes sont illisibles : c’est le principe du verrou, et personne ne peut le retrouver. Tu peux garder le carnet verrouillé dans un fichier pour le rouvrir plus tard, puis en commencer un nouveau.'}),
      h('div',{class:'rangee'},
        h('button',{type:'button',class:'btn',text:'Garder le carnet verrouillé',onclick:function(){
          var brut=lireBrut();
          if(brut) enregistrer('carnet-verrouille-'+aujourdhui()+'.json',brut,'application/json');
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
    h('h2',{text:'Copie de secours'}),
    h('p',{text:'Les notes vivent dans ce navigateur, sur cet appareil. Enregistre une copie chaque soir.'
      +(cle?' La copie est chiffrée avec ton code.':'')}));
  if(copieEnAttente){
    var erreur=h('p',{class:'erreur',role:'alert'});
    var ouvrir=h('button',{type:'submit',class:'btn principal',text:'Ouvrir la copie'});
    var champ=champCode('code-copie','Cette copie est verrouillée. Son code','current-password');
    var form=h('form',{class:'formulaire',novalidate:true},champ,erreur,
      h('div',{class:'rangee'},ouvrir,
        h('button',{type:'button',class:'btn',text:'Annuler',onclick:function(){ copieEnAttente=null; rendre(); }})));
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var env=copieEnAttente, code=champ[1].value;
      if(!env||!code){ erreur.textContent='Saisis le code de la copie.'; return; }
      erreur.textContent='';
      var liberer=occuper(ouvrir,'Ouverture…');
      deriver(code,deb64(env.sel),env.iter).then(function(k){ return dechiffrer(env,k); })
        .then(function(t){
          var o=JSON.parse(t);
          copieEnAttente=null;
          fusionner(Array.isArray(o.visits)?o.visits:[]);
        },function(){
          liberer(); champ[1].value='';
          erreur.textContent='Code incorrect pour cette copie.';
        });
    });
    sec.appendChild(form);
  }else{
    sec.appendChild(h('div',{class:'rangee'},
      etat.visits.length?h('button',{type:'button',class:'btn',text:'Enregistrer une copie',onclick:copieSecours}):null,
      h('button',{type:'button',class:'btn',text:'Restaurer une copie',onclick:function(){ fichier.click(); }})));
  }
  sec.appendChild(fichier);
  return sec;
}

function sectionVerrou(){
  var sec=h('section',{class:'outils'},h('h2',{text:'Verrou par code'}));
  if(!CRYPTO){
    sec.appendChild(h('p',{text:'Le verrou par code n’est pas disponible dans ce navigateur.'}));
    return sec;
  }
  if(panneau==='code'||panneau==='changer'){
    var changer=panneau==='changer';
    var erreur=h('p',{class:'erreur',role:'alert'});
    var valider=h('button',{type:'submit',class:'btn principal',text:changer?'Changer le code':'Activer le verrou'});
    var c1=champCode('code-nouveau','Nouveau code, '+CODE_MIN+' caractères ou plus','new-password');
    var c2=champCode('code-encore','Le même code, encore une fois','new-password');
    var form=h('form',{class:'formulaire',novalidate:true},
      h('p',{text:'Note ce code ailleurs : sans lui, les notes sont perdues. Personne ne peut le retrouver.'}),
      c1,c2,erreur,
      h('div',{class:'rangee'},valider,
        h('button',{type:'button',class:'btn',text:'Annuler',onclick:function(){ panneau=''; rendre(); }})));
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var a=c1[1].value, b=c2[1].value;
      if(a.length<CODE_MIN){ erreur.textContent='Le code doit faire au moins '+CODE_MIN+' caractères.'; return; }
      if(a!==b){ erreur.textContent='Les deux codes sont différents.'; return; }
      erreur.textContent='';
      var liberer=occuper(valider,'Chiffrement…');
      definirCode(a).then(function(){
        panneau=''; rendre();
        toast(changer?'Code changé.':'Verrou activé. Les notes sont chiffrées.');
      },function(){
        liberer(); erreur.textContent='Le verrou n’a pas pu être activé ici.';
      });
    });
    sec.appendChild(form);
  }else if(cle){
    sec.appendChild(h('p',{text:'Les notes sont chiffrées sur cet appareil. Le carnet se verrouille à chaque fermeture, et après 5 minutes en arrière-plan.'}));
    var retirer=deuxTemps(h('button',{type:'button',class:'btn danger',text:'Retirer le verrou'}),
      'Retirer le verrou','Confirmer : retirer le verrou',function(){
        retirerVerrou(); rendre(); toast('Verrou retiré. Les notes ne sont plus chiffrées.');
      });
    sec.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn principal',text:'Verrouiller maintenant',onclick:verrouiller}),
      h('button',{type:'button',class:'btn',text:'Changer le code',onclick:function(){ panneau='changer'; rendre(); }})));
    sec.appendChild(h('div',{class:'rangee'},retirer));
  }else{
    sec.appendChild(h('p',{text:'Un code chiffre les notes sur cet appareil : sans lui, elles sont illisibles, même pour quelqu’un qui a le téléphone déverrouillé en main.'}));
    sec.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn',text:'Protéger par un code',onclick:function(){ panneau='code'; rendre(); }})));
  }
  return sec;
}

function sectionDictee(){
  var sec=h('section',{class:'outils'},h('h2',{text:'Dictée'}));
  if(!SR||!etat.dictee){
    sec.appendChild(h('p',{text:'Pour dicter, touche un champ puis le micro de ton clavier : rien ne passe par cette app.'}));
    if(SR){
      sec.appendChild(h('p',{text:'Un bouton Dicter peut être ajouté aux fiches. Il envoie ta voix au service vocal du navigateur (Google ou Apple) pour la transcrire : à éviter pour des notes sensibles.'}));
      sec.appendChild(h('div',{class:'rangee'},
        h('button',{type:'button',class:'btn',text:'Ajouter le bouton Dicter',onclick:function(){ etat.dictee=true; sauver(); rendre(); }})));
    }
    return sec;
  }
  var choix=h('select',{id:'langue','aria-label':'Langue de dictée'},
    h('option',{value:'fr-FR',text:'Je dicte en français'}),
    h('option',{value:'en-GB',text:'Je dicte en anglais'}));
  choix.value=etat.lang;
  choix.addEventListener('change',function(){ etat.lang=choix.value; sauver(); });
  sec.appendChild(h('p',{text:'Le bouton Dicter est affiché sur les fiches. Ta voix passe par le service vocal du navigateur (Google ou Apple) et demande une connexion.'}));
  sec.appendChild(choix);
  sec.appendChild(h('div',{class:'rangee'},
    h('button',{type:'button',class:'btn',text:'Retirer le bouton Dicter',onclick:function(){ etat.dictee=false; sauver(); rendre(); }})));
  return sec;
}

function vueListe(){
  var f=document.createDocumentFragment();

  if(!etat.visits.length){
    f.appendChild(h('div',{class:'vide'},
      h('p',{class:'vide-titre',text:'Aucune visite pour l’instant.'}),
      h('p',{text:'Crée la fiche avant d’entrer sur le site. Tu notes le reste en sortant.'})));
  }else{
    var liste=h('div',{class:'liste'});
    parDate(etat.visits).forEach(function(v){
      var m=moyenne(v);
      var meta=[v.ville.trim(),dateFr(v.date)].filter(Boolean).join(', ');
      liste.appendChild(h('button',{type:'button',class:'ligne',onclick:function(){ aller('visite-'+v.id); }},
        h('span',null,
          h('span',{class:'ligne-nom',text:nomOu(v)}),
          meta?h('span',{class:'ligne-meta',text:meta}):null),
        h('span',{class:'ligne-droite'},
          m!==null?h('span',{class:'ligne-note',text:nombre(m)+'/5'}):null,
          v.avis?h('span',{class:'avis '+v.avis,text:libelleAvis(v.avis)}):null)));
    });
    f.appendChild(liste);
  }

  f.appendChild(h('button',{type:'button',class:'btn principal large',onclick:creer},'Nouvelle visite'));
  if(etat.visits.length>=2){
    f.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn',onclick:function(){ aller('comparer'); }},'Comparer les visites')));
  }
  if(etat.visits.length){
    f.appendChild(h('div',{class:'rangee'},
      h('button',{type:'button',class:'btn',onclick:function(){ copier(toutTexte(),'Tous les CR copiés'); }},'Copier tous les CR'),
      h('button',{type:'button',class:'btn',onclick:function(){ enregistrerTexte('CR-visites-'+aujourdhui()+'.txt',toutTexte()); }},'Télécharger tous les CR')));
  }

  f.appendChild(sectionCopie());
  f.appendChild(sectionVerrou());
  f.appendChild(sectionDictee());
  return f;
}

/* ---------- Vue : une visite ---------- */

function vueVisite(v){
  var f=document.createDocumentFragment();
  f.appendChild(h('button',{type:'button',class:'retour',onclick:function(){ aller(''); }},'Toutes les visites'));

  f.appendChild(h('div',{class:'cartouche'},
    caseCartouche(v,'nom','Entreprise','pleine nom','text','Nom de l’entreprise'),
    caseCartouche(v,'ville','Ville','gauche','text'),
    caseCartouche(v,'date','Date','','date'),
    caseCartouche(v,'contacts','Interlocuteurs','pleine','text','Noms et fonctions'),
    caseCartouche(v,'activite','Activité','pleine derniere','text','Métier, pièces, clients')));

  if(!(SR&&etat.dictee)) f.appendChild(h('p',{class:'astuce',text:'Pour dicter, touche un champ puis le micro de ton clavier.'}));

  f.appendChild(h('section',{class:'bloc'},
    h('h2',{text:'Débrief à chaud'}),
    h('p',{class:'aide',text:'Note tout ce qui te vient en sortant du site. Tu trieras ensuite.'}),
    zone(v,v,'libre','Débrief à chaud','z-libre',5)));

  CRITERES.forEach(function(c){
    f.appendChild(h('section',{class:'bloc'},
      h('div',{class:'bloc-tete'},h('h2',{text:c.t}),jauge(v,c)),
      h('p',{class:'aide',text:c.a}),
      zone(v,v.notes,c.k,c.t,'z-'+c.k,3)));
  });

  SYNTHESE.forEach(function(c){
    f.appendChild(h('section',{class:'bloc'},
      h('div',{class:'bloc-tete'},h('h2',{text:c.t})),
      zone(v,v,c.k,c.t,'z-'+c.k,3)));
  });

  var choix=h('div',{class:'choix',role:'group','aria-label':'Avis'});
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
  f.appendChild(h('section',{class:'bloc'},h('h2',{text:'Avis'}),choix));

  var suppr=deuxTemps(h('button',{type:'button',class:'btn danger',text:'Supprimer la visite'}),
    'Supprimer la visite','Confirmer la suppression',function(){ supprimer(v); });
  f.appendChild(h('div',{class:'rangee fin'},
    h('button',{type:'button',class:'btn',onclick:function(){ enregistrerTexte(nomFichier(v),crTexte(v)); }},'Télécharger le CR'),
    suppr));

  f.appendChild(h('div',{class:'barre'},
    h('button',{type:'button',class:'btn principal',onclick:function(){ copier(crTexte(v),'CR copié'); }},'Copier le CR'),
    navigator.share?h('button',{type:'button',class:'btn',onclick:function(){
      navigator.share({title:'CR '+nomOu(v),text:crTexte(v)}).catch(function(){});
    }},'Partager le CR'):null));
  return f;
}

/* ---------- Vue : comparatif ---------- */

function vueComparer(){
  var f=document.createDocumentFragment();
  f.appendChild(h('button',{type:'button',class:'retour',onclick:function(){ aller(''); }},'Toutes les visites'));
  var tete=h('tr',null,h('th',{scope:'col',text:'Entreprise'}),h('th',{scope:'col',text:'Moyenne'}));
  CRITERES.forEach(function(c){ tete.appendChild(h('th',{scope:'col',text:c.c})); });
  tete.appendChild(h('th',{scope:'col',text:'Avis'}));
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
  f.appendChild(h('p',{class:'astuce',text:'Classées par note moyenne. Les notes vont de 1 à 5.'}));
  f.appendChild(h('div',{class:'rangee'},
    h('button',{type:'button',class:'btn',onclick:function(){ copier(toutTexte(),'Tous les CR copiés'); }},'Copier tous les CR')));
  return f;
}

/* ---------- Actions ---------- */

function creer(){
  var v=normaliser({date:aujourdhui()});
  etat.visits.push(v);
  sauver();
  aller('visite-'+v.id);
}
function supprimer(v){
  var i=indexDe(v.id);
  if(i<0) return;
  etat.visits.splice(i,1);
  sauver();
  aller('');
  toast('Visite supprimée','Annuler',function(){
    if(verrouille||indexDe(v.id)>=0) return;
    etat.visits.splice(Math.min(i,etat.visits.length),0,v);
    sauver(); reafficher();
    toast('Visite rétablie');
  });
}
function copieSecours(){
  var nom='carnet-visites-'+aujourdhui()+'.json';
  if(!cle){ enregistrer(nom,JSON.stringify(etat,null,2),'application/json'); return; }
  chiffrer(JSON.stringify(etat),cle,sel,iter).then(function(s){
    enregistrer(nom,s,'application/json');
  },function(){ toast('Copie impossible. Réessaie.'); });
}
function fusionner(liste){
  var ajout=0, garde=0;
  liste.slice(0,500).forEach(function(x){
    var v=normaliser(x), i=indexDe(v.id);
    if(i<0){ etat.visits.push(v); ajout++; }
    else if(v.maj>etat.visits[i].maj){ etat.visits[i]=v; ajout++; }   /* jamais écraser plus récent */
    else garde++;
  });
  if(ajout) sauver();
  rendre();
  if(!ajout) toast(garde?'Rien à restaurer : tes notes sont déjà à jour.':'Cette copie ne contient aucune visite.');
  else toast(ajout+(ajout>1?' visites restaurées':' visite restaurée')+(garde?', '+garde+' déjà à jour':''));
}
function lireCopie(input){
  var fic=input.files&&input.files[0];
  if(!fic) return;
  if(fic.size>5*1024*1024){ toast('Ce fichier est trop gros pour être une copie du carnet.'); input.value=''; return; }
  var lecteur=new FileReader();
  lecteur.onload=function(){
    var d=interpreter(String(lecteur.result));
    if(d.type==='clair') fusionner(d.etat.visits);
    else if(d.type==='chiffre'){
      if(CRYPTO){ copieEnAttente=d.env; rendre(); }
      else toast('Ce navigateur ne sait pas ouvrir une copie verrouillée.');
    }
    else toast('Ce fichier n’est pas une copie du carnet.');
    input.value='';
  };
  lecteur.onerror=function(){ toast('Lecture du fichier impossible.'); input.value=''; };
  lecteur.readAsText(fic);
}

/* ---------- Navigation ---------- */

function routeDepuis(r){
  if(r==='comparer'&&etat.visits.length) return {nom:'comparer',id:null};
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
  else if(vue.nom==='comparer'&&etat.visits.length) cible.appendChild(vueComparer());
  else cible.appendChild(vueListe());
  var zones=cible.querySelectorAll('textarea');
  for(var i=0;i<zones.length;i++) grandir(zones[i]);
  afficherEtat();
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
