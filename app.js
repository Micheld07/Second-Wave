import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ================= SUPABASE =================
const supabaseUrl = 'https://ugwkwxhqbkptuzexutve.supabase.co';
const supabaseKey = 'sb_publishable_gyeVcsXZrq0yz3IS1C79QQ_H0K0g-9a';
const supabase = createClient(supabaseUrl, supabaseKey);

// ================= GLOBALS =================
let currentUser = null;
let currentGig = null;

// ================= ELEMENTS =================
const authStatus = document.getElementById('auth-status');
const authSection = document.getElementById('auth-section');
const mainContent = document.getElementById('main-content');

// ================= HELPER =================
function val(id){ return document.getElementById(id).value; }

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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){ authStatus.innerText = error.message; return; }
  window.setUser(data.user);
};

window.logout = async function(){
  await supabase.auth.signOut();
  currentUser = null;
  currentGig = null;
  authSection.classList.remove('hidden');
  mainContent.classList.add('hidden');
  authStatus.innerText = 'Abgemeldet';
};

window.setUser = function(user){
  currentUser = user;
  authSection.classList.add('hidden');
  mainContent.classList.remove('hidden');
  authStatus.innerText = `Eingeloggt als ${user.email}`;
  loadAll();
};

// Auth-State Listener
supabase.auth.onAuthStateChange((_, session)=>{
  if(session?.user) window.setUser(session.user);
});

// ================= MENU =================
window.toggleSection = id => {
  document.getElementById(id).classList.toggle('hidden');
};
window.closeSection = id => {
  document.getElementById(id).classList.add('hidden');
};
window.closeLibrary = () => {
  document.getElementById('song-library').classList.add('hidden');
};

// ================= GIGS =================
document.getElementById('add-gig-btn').onclick = async () => {
  const name = val('gig-name');
  const date = val('gig-date');
  const notes = val('gig-notes');
  if(!name || !date) return alert('Name & Datum eingeben!');

  const { data: gig } = await supabase.from('gigs').insert({ name, date, notes }).select().single();
  await supabase.from('setlists').insert({ gig_id: gig.id }); // automatisch Setlist
  loadGigs();
};

async function loadGigs(){
  const { data } = await supabase.from('gigs').select('*').order('date');
  const gigsList = document.getElementById('gigs-list');
  gigsList.innerHTML = '';
  data.forEach(g=>{
    const li = document.createElement('li');
    li.textContent = `${g.date} – ${g.name}`;
    li.onclick = ()=> openGig(g);
    gigsList.appendChild(li);
  });
}

async function openGig(gig){
  currentGig = gig;
  toggleSection('gig-detail-section');
  document.getElementById('gig-title').textContent = `${gig.name} (${gig.date})`;
  document.getElementById('gig-notes-view').textContent = gig.notes || '';
  loadSetlist();
}

// ================= SETLIST =================
async function loadSetlist(){
  if(!currentGig) return;
  const { data: setlist } = await supabase.from('setlists').select('id').eq('gig_id', currentGig.id).single();
  const { data } = await supabase.from('setlist_songs').select('position,songs(*)').eq('setlist_id', setlist.id).order('position');

  const setlistEl = document.getElementById('setlist');
  setlistEl.innerHTML = '';
  data.forEach(row=>{
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.song = row.songs.id;
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
  if(existing.data.length>0) return; // keine Duplikate
  const pos = document.querySelectorAll('#setlist li').length + 1;
  await supabase.from('setlist_songs').insert({ setlist_id: setlist.id, song_id, position: pos });
  loadSetlist();
}

// ================= SONGS =================
document.getElementById('add-song-btn').onclick = async ()=>{
  const name = val('song-name');
  const duration = val('song-duration');
  const link = val('song-link');
  if(!name || !duration) return alert('Songname & Dauer eingeben!');

  // Prüfen auf Duplikat
  const { data: exists } = await supabase.from('songs').select('*').eq('name', name);
  if(exists.length>0){ alert('Song existiert bereits!'); return; }

  await supabase.from('songs').insert({ name, duration, link });
  document.getElementById('song-name').value='';
  document.getElementById('song-duration').value='';
  document.getElementById('song-link').value='';
  openLibrary();
};

// ================= SONG-BIBLIOTHEK =================
document.getElementById('open-library-btn').onclick = openLibrary;

async function openLibrary(){
  document.getElementById('song-library').classList.remove('hidden');
  const { data } = await supabase.from('songs').select('*');
  renderLibrary(data);
}

function renderLibrary(songs){
  const libraryList = document.getElementById('library-list');
  libraryList.innerHTML = '';
  songs.forEach(song=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <a href="${song.link}" target="_blank">${song.name} (${song.duration})</a>
      <button onclick="assignSong(${song.id})">🎵 Setlists zuordnen</button>
    `;
    libraryList.appendChild(li);
  });
}

window.assignSong = async (song_id)=>{
  const { data: gigs } = await supabase.from('gigs').select('*').order('date');
  const gigOptions = gigs.map(g=>`<option value="${g.id}">${g.name} (${g.date})</option>`).join('');
  const div = document.createElement('div');
  div.innerHTML = `
    <h3>Song zu Setlists zuordnen</h3>
    <select id="assign-gig" multiple>${gigOptions}</select>
    <button id="assign-ok">OK</button>
    <button onclick="document.body.removeChild(this.parentNode)">Abbrechen</button>
  `;
  document.body.appendChild(div);
  document.getElementById('assign-ok').onclick = async ()=>{
    const select = document.getElementById('assign-gig');
    const selected = Array.from(select.selectedOptions).map(o=>o.value);
    for(let gig_id of selected){
      const { data: setlist } = await supabase.from('setlists').select('id').eq('gig_id', gig_id).single();
      const { data: exists } = await supabase.from('setlist_songs').select('*').eq('setlist_id', setlist.id).eq('song_id', song_id);
      if(exists.length===0){
        const pos = document.querySelectorAll(`#setlist li`).length+1;
        await supabase.from('setlist_songs').insert({ setlist_id: setlist.id, song_id, position: pos });
      }
    }
    document.body.removeChild(div);
    alert('Song zugewiesen!');
  };
};

// ================= VOTING =================
function voteButtons(song_id){
  const colors = ['#ff4d4d','#ff944d','#ffdb4d','#94ff4d','#4dff88'];
  return [1,2,3,4,5].map((v,i)=>`<button style="background:${colors[i]}" onclick="vote(${song_id},${v})">${v}</button>`).join(' ');
}

window.vote = async (song_id,value)=>{
  if(!currentGig) return alert('Bitte zuerst einen Gig auswählen!');
  await supabase.from('votes').insert({ gig_id: currentGig.id, song_id, value });
  loadSetlist();
};

// ================= DRAG & DROP =================
window.allowDrop = e => e.preventDefault();
window.drag = e => e.dataTransfer.setData("song", e.target.dataset.song);
window.drop = e => {
  e.preventDefault();
  const song = e.dataTransfer.getData("song");
  addSongToSetlist(song);
};

// ================= SETLIST TIME =================
function updateTotalTime(){
  let sec = 0;
  document.querySelectorAll('#setlist li').forEach(li=>{
    const m = li.textContent.match(/(\d+):(\d+)/);
    if(m) sec += +m[1]*60 + +m[2];
  });
  document.getElementById('total-time').textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

// ================= BANDKASSE =================
document.getElementById('cash-btn').onclick = async ()=>{
  const amount = parseFloat(val('cash-amount')) || 0;
  await supabase.from('cash').upsert({ id:1, amount }, { onConflict:['id'] });
  loadCash();
};

async function loadCash(){
  const { data } = await supabase.from('cash').select('*').single();
  document.getElementById('current-cash').innerText = data ? data.amount.toFixed(2)+' €' : '0.00 €';
}

// ================= TECH-RIDER =================
document.getElementById('upload-techrider-btn').onclick = async ()=>{
  const file = document.getElementById('techrider-file').files[0];
  if(!file) return alert('Datei auswählen');
  const { data, error } = await supabase.storage.from('techriders').upload(`band/${file.name}`, file, { upsert:true });
  if(error) return alert(error.message);
  const url = supabase.storage.from('techriders').getPublicUrl(`band/${file.name}`).data.publicUrl;
  const link = document.getElementById('techrider-link');
  link.href = url;
  link.classList.remove('hidden');
};

// ================= MERCH =================
const merchItems = [
  { key:'schwarz-s', label:'Schwarz S' }, { key:'schwarz-m', label:'Schwarz M' },
  { key:'schwarz-l', label:'Schwarz L' }, { key:'schwarz-xl', label:'Schwarz XL' },
  { key:'schwarz-xxl', label:'Schwarz XXL' }, { key:'weiß-s', label:'Weiß S' },
  { key:'weiß-m', label:'Weiß M' }, { key:'weiß-l', label:'Weiß L' },
  { key:'weiß-xl', label:'Weiß XL' }, { key:'weiß-xxl', label:'Weiß XXL' },
  { key:'blau-s', label:'Blau S' }, { key:'blau-m', label:'Blau M' },
  { key:'blau-l', label:'Blau L' }, { key:'blau-xl', label:'Blau XL' },
  { key:'blau-xxl', label:'Blau XXL' }, { key:'anhänger', label:'Anhänger' },
  { key:'öffner', label:'Öffner' }
];

async function renderMerch(){
  const { data } = await supabase.from('merch').select('*');
  const grid = document.getElementById('merch-grid');
  grid.innerHTML = '';
  merchItems.forEach(item=>{
    const dbEntry = data.find(d=>d.item===item.key);
    const qty = dbEntry ? dbEntry.quantity : 0;
    const div = document.createElement('div');
    div.className = 'merch-item';
    div.innerHTML = `${item.label}: <input type="number" id="merch-${item.key}" min="0" value="${qty}"> <button>OK</button>`;
    div.querySelector('button').onclick = ()=> updateMerch(item.key);
    grid.appendChild(div);
  });
}

async function updateMerch(itemKey){
  const qty = parseInt(val(`merch-${itemKey}`),10) || 0;
  const { error } = await supabase.from('merch').upsert({ item:itemKey, quantity:qty }, { onConflict:['item'] });
  if(error){ console.error(error); alert('Fehler beim Speichern'); return; }
  renderMerch();
}

// ================= LOAD ALL =================
async function loadAll(){
  await loadGigs();
  await loadCash();
  await renderMerch();
}

