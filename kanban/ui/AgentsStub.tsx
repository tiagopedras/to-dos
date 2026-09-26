/* Stands in for PACKAGES/agents-engine/react where that folder is not next to
 * this repo, which is the Vercel deployment. There is no server there to run an
 * agent either, so there is nothing to show but that. vite.config.ts picks it. */
import { Alert } from '@tiagopedras/tenon'

export interface AgentsAppProps {
  base?: string
  title?: string
  storagePrefix?: string
  embedded?: boolean
}

export function AgentsApp(_props: AgentsAppProps) {
  return <Alert tone="info">The agents run on the machine that serves this board, so there are none to show here.</Alert>
}
