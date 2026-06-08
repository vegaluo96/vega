// 未读提醒：她趁你不在时来找你（reach_out）→「通知」tab 标红点；进入通知页即清。
import { writable } from 'svelte/store';
export const unreadNotifs = writable(false);
