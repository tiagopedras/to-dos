'use strict';

/* =========================================================================
   4d. Agents — the Plan and Implement agents' switches, hours and runs.

   The page is the agents dashboard's own, PACKAGES/agents-engine/react, reached
   as BoardUI.AgentsApp, so this view and ~/Code/agents-dashboard draw one hour
   track rather than two. It asks /agents-api/* (kanban/server.py), which runs
   agents-engine's routes over this repo's agents/ folder only, so the agents on
   it are the two the board hands work to. Every change goes through the agent's
   own `apply` command; nothing here or in the server opens a schedule file.

   The component owns everything on screen, including its twenty-second poll of
   every agent's state. That poll is why leaving the view unmounts it: a root
   left behind on a node the next view has replaced keeps polling, and each
   poll runs both agents' state commands.
   ========================================================================= */

let agentsRoot = null;

function renderAgentsView(){
  const lists = $('#lists');
  if (!lists) return;
  let host = lists.querySelector('#agentsRoot');
  if (!host) {
    leaveAgentsView();
    lists.innerHTML = '<div id="agentsRoot"></div>';
    host = lists.querySelector('#agentsRoot');
    agentsRoot = host;
  }
  BoardUI.mount(host, BoardUI.h(BoardUI.AgentsApp, {
    base: '/agents-api',
    title: 'Agents',
    // Its own names in localStorage, so which reading and order he last had on
    // the dashboard does not decide this one, or the other way round.
    storagePrefix: 'board-agents.',
    embedded: true,
  }));
}

/* Called by renderView() for every view but this one. */
function leaveAgentsView(){
  if (!agentsRoot) return;
  BoardUI.unmount(agentsRoot);
  agentsRoot = null;
}
