function randomIndex(max) {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function draw(people) {
  if (new Set(people.map(p => p.id)).size !== people.length) throw new Error('Participantes duplicados.');
  if (people.some(p => p.partnerId && !people.some(other => other.id === p.partnerId && other.id !== p.id))) throw new Error('Revisá las parejas.');
  if (people.length < 3) return null;
  const candidates = new Map(people.map(p => [p.id, shuffle(people.filter(r => r.id !== p.id && r.id !== p.partnerId && r.partnerId !== p.id).map(r => r.id))]));
  const owners = new Map();
  function assign(giver, seen) {
    for (const recipient of candidates.get(giver)) {
      if (seen.has(recipient)) continue;
      seen.add(recipient);
      if (!owners.has(recipient) || assign(owners.get(recipient), seen)) {
        owners.set(recipient, giver); return true;
      }
    }
    return false;
  }
  for (const p of shuffle(people)) if (!assign(p.id, new Set())) return null;
  return Object.fromEntries([...owners].map(([recipient, giver]) => [giver, recipient]));
}
export function invitationCode(value) {
  const trimmed = value.trim();
  if (/^[a-f0-9]{48}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'martincornelli.github.io' && url.pathname === '/amigoinvisible/') return url.hash.match(/^#join\/([a-f0-9]{48})$/)?.[1] || null;
    if (url.hostname === 'entre-nosotros-e8c82.web.app') return url.pathname.match(/^\/join\/([a-f0-9]{48})\/?$/)?.[1] || null;
  } catch { /* A pasted value is not necessarily a URL. */ }
  return null;
}
