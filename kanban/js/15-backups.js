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

/* The React root, on a node this view creates rather than on #lists — the same
   rule ProjectsView follows and for the same reason: the unported views still
   assign to #lists.innerHTML and would tear the DOM out from under a live
   root. See CLAUDE.md, "The React half, and why it is only a half". */
let backupsRoot = null;
function backupsMountPoint(){
  const lists = $('#lists');
  if (!lists) return null;
  let host = lists.querySelector('#backupsRoot');
  if (!host) {
    if (backupsRoot) BoardUI.unmount(backupsRoot);
    lists.innerHTML = '<div id="backupsRoot"></div>';
    host = lists.querySelector('#backupsRoot');
    backupsRoot = host;
  }
  return host;
}

/* What the view is showing, which this file owns and the component only draws.
   `weekly` staying null is what says the fetch is still out — not the same as
   there being no weekly snapshots, which is an empty array and its own
   sentence on screen. */
let backupsState = { weekly: null, session: [], archive: null, week: '', keep: null, error: null };

/* The four formatters go down as props rather than being read off the global
   scope. backupWhen is Plans' as well as this view's, so moving the set into
   the component would either split it or drag a shared helper into one view. */
const BACKUP_FMT = {
  size: backupSize, ago: backupAgo, when: backupWhen, weekOf: backupWeekOf,
};

function drawBackups(){
  const host = backupsMountPoint();
  if (!host) return;
  BoardUI.mount(host, BoardUI.BackupsView({
    weekly: backupsState.weekly,
    session: backupsState.session,
    archive: backupsState.archive,
    week: backupsState.week,
    keep: backupsState.keep,
    error: backupsState.error,
    onLoad: (url, label) => loadBackupPreview(url, label),
    fmt: BACKUP_FMT,
  }));
}

/* One column, drawn with the same Column every other view's columns are — a
   `.listcard` of its own until 12 Sep 2026. The standing note about what the
   tab holds is the head's description, where the sentence saying what a column
   is for belongs; the count arrives with the fetch. */
async function renderBackupsView(){
  backupsState = { weekly: null, session: [], archive: null, week: '', keep: null, error: null };
  drawBackups();
  try {
    const res = await fetch('/backups.json?t=' + Date.now(), { cache:'no-store' });
    if (res.status === 404) {
      backupsState.error = { kind: 'stale-helper' };
      drawBackups();
      return;
    }
    if (!res.ok) throw new Error('the server answered ' + res.status);
    const data = await res.json();
    const all = data.backups || [];
    backupsState = {
      // Weekly ones go by their week label, not their timestamp: a snapshot
      // copied late still belongs to its own week.
      weekly: all.filter(b => b.kind === 'weekly').sort((x, y) => y.name.localeCompare(x.name)),
      session: all.filter(b => b.kind === 'session'),
      archive: data.archive || null,
      week: data.week,
      keep: data.keep,
      error: null,
    };
    drawBackups();
  } catch (err) {
    backupsState.error = { kind: 'unreadable', detail: String(err.message || err) };
    drawBackups();
  }
}
