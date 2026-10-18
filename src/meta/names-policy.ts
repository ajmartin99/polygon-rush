import { checkDisplayText } from '../shared/chat-filter';
import { isGeneratedName } from './names';

/**
 * Names that may appear to other players: generated ones, or typed ones
 * (made by players 13+) that pass the shared name filter. Every receiver
 * checks again, so a modified app can't push anything else through.
 */
export function isAllowedName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (isGeneratedName(name)) return true;
  const r = checkDisplayText(name, 'name');
  return r.ok && r.text === name;
}
