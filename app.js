import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ================= SUPABASE =================
const supabaseUrl = 'https://ugwkwxhqbkptuzexutve.supabase.co';
const supabaseKey = 'sb_publishable_gyeVcsXZrq0yz3IS1C79QQ_H0K0g-9a';
const supabase = createClient(supabaseUrl, supabaseKey);

// ================= GLOBAL =================
let currentUser = null;
let currentGig = null;

// ================= ELEMENTS =================
const authStatus = document.getElementById('auth-status');
const authSection = document.getElementById('auth-section');
const mainContent = document.getElementById('main-content');

function val(id){ return document.getElementById(id).value; }
function el(id){ return document.getElementById(id); }

// ================= AUTH =================
window.signup = async function(){
  const email = val('email');
  const password = val('password');
  const { error } = await supabase.auth.signUp({ email, password });
  authStatus.innerText = error ? error.message : 'Registrierung erfolgreich – E-Mail bestätigen!';
};

window.login = async function(){
  const email = val('email');
  const password = val('password');
  authStatus.innerText = "Login wird geprüft...";
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) { 
      authStatus.innerText = error.message; 
      return; 
    }
    if(!data.user) { 
      authStatus.innerText = "Login fehlgeschlagen"; 
      return; 
    }
    // Login erfolgreich
    currentUser = data.user;
    authSection.classList.add('hidden');
    mainContent.classList.remove('hidden');
    loadAll();
  } catch(err) {
    console.error(err);
    authStatus.innerText = "Fehler beim Login";
  }
};

window.logout = async function(){
  await supabase.auth.signOut();
  currentUser = null;
  currentGig = null;
  authSection.classList.remove('hidden');
  mainContent.classList.add('hidden');
};

// ================= AUTH STATE LISTENER =================
supabase.auth.onAuthStateChange((_, session)=>{
  if(session?.user && !currentUser){
    currentUser = session.user;
    authSection.classList.add('hidden');
    mainContent.classList.remove('hidden');
    loadAll();
  }
});

// ================= SECTIONS =================
document.querySelectorAll('.section').forEach(section=>{
  section.addEventListener('click', e=>{
    if(e.target.classList.contains('section-header') || e.currentTarget===e.target){
      const content = section.querySelector('.section-content');
      if(content.style.display==='block') content.style.display='none';
      else{
        content.style.display='block';
        // beim Öffnen spezielle Aktionen
        if(section.id==='songs-section') loadLibrary();
        if(section.id==='merch-section') renderMerch();
      }
    }
  });
});

// ================= GIGS =================
el('add-gig-btn').onclick = async () => {
  const name = val('gig-name'); const date = val('gig-date'); const notes = val('gig-notes');
  if(!name||!date) return alert('Name & Datum eingeben!');
  const { data: gig } = await supabase.from('gigs').insert({ name, date, notes }).select().single();
  await supabase.from('setlists').insert({ gig_id: gig.id });
  loadGigs();
};

async function loadGigs(){
  const { data } = await supabase.from('gigs').select('*').order('date');
  const list = el('gigs-list'); list.innerHTML='';
  data.forEach(g=>{
    const li = document.createElement('li');
    li.textContent = `${g.date} – ${g.name}`;
    li.onclick = e=>{ e.stopPropagation(); openGig(g); };
    list.appendChild(li);
  });
}

async function openGig(gig){
  currentGig = gig;
  el('gig-detail-section').classList.remove('hidden');
  el('gig-title').textContent = `${gig.name} (${gig.date})`;
  el('gig-notes-view').textContent = gig.notes || '';
  loadSetlist();
}

// ================= SETLIST =================
async function loadSetlist(){
  if(!currentGig) return;
  const { data: setlist } = await supabase.from('setlists').select('id').eq('gig_id', currentGig.id).single();
  const { data } = await supabase.from('setlist_songs').select('position,songs(*)').eq('setlist_id', setlist.id).order('position');
  const setlistEl = el('setlist'); setlistEl.innerHTML='';
  data.forEach(row=>{
    const li = document.createElement('li');
    li.draggable=true;
    li.dataset.song=row.songs.id;
    li.innerHTML = `${row.songs.name} (${row.songs.duration}) ${voteButtons(row.songs.id)}`;
    li.ondragstart = drag;
    setlistEl.appendChild(li);
  });
  updateTotalTime();
}

async function addSongToSetlist(song_id){
  if(!currentGig) return;
  const { data: setlist } = await supabase.from('setlists').select('id').eq('gig_id', currentGig.id).single();
  const existing = await supabase.from('setlist_songs').select('*').eq('setlist_id', setlist.id).eq('song_id', song_id);
  if(existing.data.length>0) return;
  const pos = document.querySelectorAll('#setlist li').length+1;
  await supabase.from('setlist_songs').insert({ setlist_id: setlist.id, song_id, position: pos });
  loadSetlist();
}

// ================= SONGS =================
el('add-song-btn').onclick = async ()=>{
  const name = val('song-name'); const duration = val('song-duration'); const link = val('song-link');
  if(!name||!duration) return alert('Songname & Dauer eingeben!');
  const { data: exists } = await supabase.from('songs').select('*').eq('name', name).eq('duration', duration);
  if(exists.length>0) return alert('Song bereits vorhanden!');
  await supabase.from('songs').insert({ name, duration, link });
  el('song-name').value=''; el('song-duration').value=''; el('song-link').value='';
  loadLibrary();
};

// ================= SONG-BIBLIOTHEK =================
async function loadLibrary(){
  const { data } = await supabase.from('songs').select('*');
  renderLibrary(data);
}

function renderLibrary(songs){
  const list = el('library-list'); list.innerHTML='';
  const search = el('song-search')?.value.toLowerCase() || '';
  songs.filter(s=>s.name.toLowerCase().includes(search)).forEach(song=>{
    const li = document.createElement('li');
    li.innerHTML = `${song.name} (${song.duration}) <button onclick="assignSong(${song.id})">🎵 Zu Setlists</button>`;
    list.appendChild(li);
  });
}
el('song-search')?.addEventListener('input', loadLibrary);

window.assignSong = async (song_id)=>{
  const { data: gigs } = await supabase.from('gigs').select('*').order('date');
  const gigOptions = gigs.map(g=>`<option value="${g.id}">${g.name} (${g.date})</option>`).join('');
  const div = document.createElement('div');
  div.style.position='fixed'; div.style.top='20%'; div.style.left='50%'; div.style.transform='translateX(-50%)';
  div.style.background='#2c3e50'; div.style.padding='15px'; div.style.borderRadius='12px'; div.style.zIndex='999';
  div.innerHTML = `<h3>Song zu Setlists zuordnen</h3><select id="assign-gig" multiple>${gigOptions}</select><br>
    <button id="assign-ok">OK</button>
    <button onclick="document.body.removeChild(this.parentNode)">Abbrechen</button>`;
  document.body.appendChild(div);
  el('assign-ok').onclick = async ()=>{
    const selected = Array.from(el('assign-gig').selectedOptions).map(o=>o.value);
    for(let gig_id of selected){
      const { data: setlist } = await supabase.from('setlists').select('id').eq('gig_id', gig_id).single();
      const { data: exists } = await supabase.from('setlist_songs').select('*').eq('setlist_id', setlist.id).eq('song_id', song_id);
      if(exists.length===0){
        const pos = exists.length+1;
        await supabase.from('setlist_songs').insert({ setlist_id: setlist.id, song_id, position: pos });
      }
    }
    document.body.removeChild(div);
    alert('Song zugewiesen!');
  };
};

// ================= VOTING =================
function voteButtons(song_id){
  const colors = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#27ae60'];
  return [1,2,3,4,5].map((v,i)=>`<button class="vote-btn vote-${v}" onclick="vote(${song_id},${v})">${v}</button>`).join(' ');
}

window.vote = async (song_id,value)=>{
  if(!currentGig) return alert('Bitte zuerst einen Gig auswählen!');
  await supabase.from('votes').insert({ gig_id: currentGig.id, song_id, value });
  loadSetlist();
};

// ================= DRAG & DROP =================
window.allowDrop = e=>e.preventDefault();
window.drag = e=>e.dataTransfer.setData("song", e.target.dataset.song);
window.drop = e=>{ e.preventDefault(); addSongToSetlist(e.dataTransfer.getData("song")); };

// ================= TOTAL TIME =================
function updateTotalTime(){
  let sec=0;
  document.querySelectorAll('#setlist li').forEach(li=>{
    const m = li.textContent.match(/(\d+):(\d+)/);
    if(m) sec += +m[1]*60 + +m[2];
  });
  el('total-time').textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

// ================= BANDKASSE =================
el('cash-btn').onclick = async ()=>{
  const amount = parseFloat(val('cash-amount')) || 0;
  await supabase.from('cash').upsert({ id:1, amount }, { onConflict:['id'] });
  loadCash();
};
async function loadCash(){
  const { data } = await supabase.from('cash').select('*').single();
  el('current-cash').innerText = data ? data.amount.toFixed(2)+' €' : '0.00 €';
}

// ================= TECH-RIDER =================
el('upload-techrider-btn').onclick = async ()=>{
  const file = el('techrider-file').files[0];
  if(!file) return alert('Datei auswählen');
  const { data, error } = await supabase.storage.from('techriders').upload(`band/${file.name}`, file, { upsert:true });
  if(error) return alert(error.message);
  const url = supabase.storage.from('techriders').getPublicUrl(`band/${file.name}`).data.publicUrl;
  const link = el('techrider-link'); link.href=url; link.classList.remove('hidden');
};

// ================= MERCH =================
const merchItems = [
  { key:'schwarz-s', label:'Schwarz S' }, { key:'schwarz-m', label:'Schwarz M' }, { key:'schwarz-l', label:'Schwarz L' },
  { key:'schwarz-xl', label:'Schwarz XL' }, { key:'schwarz-xxl', label:'Schwarz XXL' },
  { key:'weiß-s', label:'Weiß S' }, { key:'weiß-m', label:'Weiß M' }, { key:'weiß-l', label:'Weiß L' },
  { key:'weiß-xl', label:'Weiß XL' }, { key:'weiß-xxl', label:'Weiß XXL' },
  { key:'blau-s', label:'Blau S' }, { key:'blau-m', label:'Blau M' }, { key:'blau-l', label:'Blau L' },
  { key:'blau-xl', label:'Blau XL' }, { key:'blau-xxl', label:'Blau XXL' },
  { key:'anhänger', label:'Anhänger' }, { key:'öffner', label:'Öffner' }
];

async function renderMerch(){
  const { data } = await supabase.from('merch').select('*');
  const grid = el('merch-grid'); grid.innerHTML='';
  merchItems.forEach(item=>{
    const dbEntry = data.find(d=>d.item===item.key);
    const qty = dbEntry ? dbEntry.quantity : 0;
    const div = document.createElement('div');
    div.className='merch-item';
    div.innerHTML=`${item.label}: <input type="number" id="merch-${item.key}" min="0" value="${qty}"><button>OK</button>`;
    div.querySelector('button').onclick = ()=> updateMerch(item.key);
    grid.appendChild(div);
  });
}

async function updateMerch(itemKey){
  const qty = parseInt(val(`merch-${itemKey}`),10) || 0;
  const { error } = await supabase.from('merch').upsert({ item:itemKey, quantity:qty }, { onConflict:['item'] });
  if(error){ alert('Fehler beim Speichern'); return; }
  renderMerch();
}

// ================= LOAD ALL =================
async function loadAll(){
  await loadGigs();
  await loadLibrary();
  await loadCash();
}
