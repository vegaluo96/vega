// 全站活体形态（lumen 星核 / nimbus 云体 / constella 星座体）。默认 nimbus（最萌、表情最丰富）。
// 持久化，可在「我·外观」切换；不传 form 的 <Creature> 取此默认。
import { writable } from 'svelte/store';
const KEY = 'creatureForm';
const ok = (f) => f === 'lumen' || f === 'nimbus' || f === 'constella';
const initial = (typeof localStorage !== 'undefined' && ok(localStorage.getItem(KEY))) ? localStorage.getItem(KEY) : 'nimbus';
export const creatureForm = writable(initial);
creatureForm.subscribe((f) => { try { if (ok(f)) localStorage.setItem(KEY, f); } catch { /* ignore */ } });
