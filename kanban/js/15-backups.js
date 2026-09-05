'use strict';

/* =========================================================================
   4b3. Backups — every copy of todo.md the board has kept, read from the same
   /backups.json the old standalone backups.html used. Fetched fresh each time
   the tab is opened, since a backup can land at any moment.
   ========================================================================= */
function backupSize(n){
  return n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 102400 ? 1 : 0) + ' KB';
}

/* "3 days ago" is what tells him whether a copy is worth opening. The exact
   timestamp is there too, because for a backup the exact moment is the point. */
function backupAgo(iso){
  const then = new Date(iso), mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? 'an hour ago' : hrs + ' hours ago';
  const days = Math.round(hrs / 24);
  if (days < 7) return days === 1 ? 'yesterday' : days + ' days ago';
  const wks = Math.round(days / 7);
  return wks === 1 ? 'last week' : wks + ' weeks ago';
}

function backupWhen(iso){
  return new Date(iso).toLocaleString(undefined, {
    weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
  });
}

/* The week label is in the file name, and it is more use than the file name. */
function backupWeekOf(name){
  const m = /week-(\d{4})-W(\d{2})/.exec(name);
  return m ? 'Week ' + m[2] + ', ' + m[1] : null;
}

function backupRowHTML(b){
  const wk = backupWeekOf(b.name);
  const label = (b.kind === 'weekly' ? (wk || 'weekly snapshot') : 'session backup') +
    ' · ' + backupWhen(b.modified);
  return '<div class="row">' +
    '<span class="tag' + (b.kind === 'weekly' ? '' : ' session') + '">' +
      (b.kind === 'weekly' ? (wk || 'weekly') : 'session') + '</span>' +
    '<a class="when" href="' + esc(b.url) + '" target="_blank">' + esc(backupWhen(b.modified)) + '</a>' +
    '<span class="ago">' + esc(backupAgo(b.modified)) + '</span>' +
    '<span class="spacer"></span>' +
    '<span class="name">' + esc(b.name) + '</span>' +
    '<span class="size">' + backupSize(b.bytes) + '</span>' +
    '<button type="button" class="btn loadbtn" data-load-url="' + esc(b.url) + '" data-load-label="' + esc(label) + '">Load</button>' +
  '</div>';
}

function backupGroupHTML(title, list, blank){
  return '<h2>' + esc(title) + '</h2>' +
    (list.length ? list.map(backupRowHTML).join('') : '<div class="empty">' + esc(blank) + '</div>');
}

async function renderBackupsView(){
  $('#lists').innerHTML = '<div class="listcard backupsview"><h3>Backups</h3>' +
    '<p class="help listnote">Every copy of todo.md the board has kept. Click one to read it, ' +
    'or Load it to look through it on the board — Backup Preview opens read-only, so nothing in ' +
    'it can be changed or saved over today\'s list.</p>' +
    '<div id="backupsOut">Loading…</div></div>';
  try {
    const res = await fetch('/backups.json?t=' + Date.now(), { cache:'no-store' });
    if (res.status === 404) {
      $('#backupsOut').innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about backups yet. Save anything ' +
        'unsaved on the board first, then run this in Terminal:<br>' +
        '<code style="display:inline-block; margin-top:7px; font-size:12px">' +
        'lsof -ti tcp:8765 | xargs kill</code><br><br>Then open <strong>To-Do Board.app</strong> again, or double-click <strong>run.command</strong>.</div>';
      return;
    }
    if (!res.ok) throw new Error('the server answered ' + res.status);
    const data = await res.json();
    const all = data.backups || [];
    // Weekly ones go by their week label, not their timestamp: a snapshot copied
    // late still belongs to its own week.
    const weekly = all.filter(b => b.kind === 'weekly').sort((x, y) => y.name.localeCompare(x.name));
    const session = all.filter(b => b.kind === 'session');

    /* The archive goes first and on its own. Every other file here is a copy of
       something that still exists; this is the only one holding work that has
       been taken out of the list. */
    const a = data.archive;
    const archive = !a ? '' :
      '<h2>Archived finished work</h2>' +
      '<div class="row">' +
        '<span class="tag">never pruned</span>' +
        '<a class="when" href="' + esc(a.url) + '" target="_blank">' + esc(backupWhen(a.modified)) + '</a>' +
        '<span class="ago">' + esc(backupAgo(a.modified)) + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="name">' + esc(a.name) + '</span>' +
        '<span class="size">' + backupSize(a.bytes) + '</span>' +
      '</div>' +
      '<p class="help" style="margin-top:8px">' + a.sections +
        (a.sections === 1 ? ' batch' : ' batches') +
        ' of tasks that were ticked off more than a month ago and lifted out of todo.md. ' +
        'Nothing is ever removed from this file.</p>';

    $('#backupsOut').innerHTML = archive +
      backupGroupHTML('Weekly snapshots', weekly, 'None yet — the first one is taken the next time the board runs in a new week.') +
      backupGroupHTML('Recent sessions', session, 'None yet — one is taken before the first save of each run.') +
      '<p class="help listnote">This week is ' + esc(data.week) + '. The board keeps the last ' +
        data.keep.session + ' session backups and the last ' + data.keep.weekly +
        ' weekly ones, then deletes the oldest.</p>';

    $('#backupsOut').querySelectorAll('[data-load-url]').forEach(btn => {
      btn.onclick = () => loadBackupPreview(btn.dataset.loadUrl, btn.dataset.loadLabel);
    });
  } catch (err) {
    $('#backupsOut').innerHTML = '<div class="err"><strong>Could not read the backup list.</strong><br>' +
      esc(String(err.message || err)) + '</div>';
  }
}

