'use strict';

/* =========================================================================
   1. Markdown  <->  model
   ========================================================================= */

/* The list lives in data/, which is the only folder git ignores and the only
   one Obsidian opens as a vault. The name shown in the header stays todo.md:
   the folder is a fact about where the file is kept, not part of what it is. */
const FILE_URL = '/data/todo.md';
/* The example list, used when there is no real one to read. Absolute rather than
   relative to this page, because a host can serve index.html at the root as
   readily as at /kanban/, and a relative path would only find it in one of the
   two. See loadDemo. */
const DEMO_URL = '/kanban/demo.md';
/* Which Jira boards the Raise a ticket buttons offer. It lives in data/ with
   everything else private: it names a company Jira and an account id, and this
   repo is public. Missing is the normal case for anyone but him — the buttons
   simply do not appear. See loadJira. */
const JIRA_URL = '/data/jira.json';
/* Which private folders under data/ exist, and which one FILE_URL and
   JIRA_URL above actually resolve to right now — the server rewrites
   /data/... to /data/<current>/... on its side, so this page never needs to
   know a dataset's name to read or save the list, only to draw the dropdown
   and to ask for a different one. See loadDatasets. */
const DATASETS_URL = '/datasets.json';

