'use strict';

/* Loaded last, after every section above, on purpose: everything below reads
   something declared in a later section (isKnownView() in 11-canvas.js,
   SORT_KEY in 03-tier-one-impact-effort.js) that would not exist yet if these
   two ran from inside 02-state.js, where they used to live. See the comment
   there for what that cost silently, every load, before this file existed. */
state.sort = readSort();
initViewFromHash();

loadFile();
loadJira();
loadDatasets();
loadBucketColors();
// Says so in the console if stream.json and the column names here have drifted
// apart. Never blocks anything; see checkStreamManifest in 02-state.js.
checkStreamManifest();
// Is there a Claude Code CLI behind the helper, and what is it allowed to
// do. Everything about this can fail and none of it matters: a 404 on a
// static host, a helper too old to know the endpoint, a machine with no CLI
// installed. All three land in the same place — chat.available() stays
// false and the prompts keep the link they always had. onStatusChanged, set
// on AIChat.create() above, redraws the view once the answer is in.
chat.loadStatus();
