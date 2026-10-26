import type { SearchResultsDto } from '@ravand/shared';
import type { AuthContext } from '../../lib/auth.js';
import { listCases } from '../cases/service.js';
import { listItems, listParties } from '../master-data/service.js';
import { listTasks } from '../tasks/service.js';

export async function search(
  auth: AuthContext,
  query: string,
): Promise<SearchResultsDto> {
  const term = query.trim();
  if (term.length < 2) {
    return { cases: [], tasks: [], parties: [], items: [] };
  }
  const [cases, tasks, parties, items] = await Promise.all([
    listCases(auth, { q: term, limit: 6 }),
    listTasks(auth, { scope: 'all', q: term, limit: 6 }),
    listParties(auth, { q: term, limit: 5 }),
    listItems(auth, { q: term, limit: 5 }),
  ]);
  return { cases, tasks, parties, items };
}
