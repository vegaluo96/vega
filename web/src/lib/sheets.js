// 全局底部弹层（微信绑定）：由对话/资料/我触发，Shell 渲染。
import { writable } from 'svelte/store';
export const bindSheet = writable(null); // null | { lifeId }
export function openBind(lifeId) { bindSheet.set({ lifeId: lifeId || null }); }
export function closeBind() { bindSheet.set(null); }
