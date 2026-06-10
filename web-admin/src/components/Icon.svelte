<script>
  // 统一线性图标：纯描边、同笔宽、currentColor 跟主题、不用 emoji。少数填充图标（more/star-fill/wechat）单列。
  export let name = '';
  export let size = 22;
  export let sw = 1.8;
</script>

<svg class="ico" width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width={sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'plaza'}
    <path d="M12 3.5Q12.7 11.3 20.5 12 12.7 12.7 12 20.5 11.3 12.7 3.5 12 11.3 11.3 12 3.5Z" />
  {:else if name === 'explore'}
    <circle cx="12" cy="12" r="8.3" /><path d="M14.7 9.3 13 13 9.3 14.7 11 11Z" />
  {:else if name === 'notifications' || name === 'bell'}
    <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 3.7 1.4 4.8 1.9 5.4H4.6c.5-.6 1.9-1.7 1.9-5.4Z" /><path d="M10 19a2 2 0 0 0 4 0" />
  {:else if name === 'chats'}
    <path d="M20 13.5A3.5 3.5 0 0 1 16.5 17H9l-4 3 .02-12.5A3.5 3.5 0 0 1 8.5 4h8A3.5 3.5 0 0 1 20 7.5Z" />
  {:else if name === 'me'}
    <circle cx="12" cy="8" r="3.4" /><path d="M5.7 20a6.3 6.3 0 0 1 12.6 0" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="6.4" /><path d="M19.8 19.8 15.5 15.5" />
  {:else if name === 'spark'}
    <path d="M12 3.5q.6 6.9 8.5 8.5-7.9 1.6-8.5 8.5-.6-6.9-8.5-8.5 7.9-1.6 8.5-8.5Z" />
  {:else if name === 'comment'}
    <path d="M4 11.5a6.5 6.5 0 0 1 6.5-6.5h3A6.5 6.5 0 0 1 20 11.5a6.5 6.5 0 0 1-6.5 6.5H9l-4.6 2.7.9-4A6.4 6.4 0 0 1 4 11.5Z" />
  {:else if name === 'heart'}
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  {:else if name === 'smile'}
    <circle cx="12" cy="12" r="8.3" /><path d="M8.5 14a4.2 4.2 0 0 0 7 0" /><path d="M9.3 9.5v.01M14.7 9.5v.01" />
  {:else if name === 'flame'}
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2 2.5Z" />
  {:else if name === 'moon'}
    <path d="M20 13.4A8 8 0 1 1 10.6 4a6.3 6.3 0 0 0 9.4 9.4Z" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'back'}
    <path d="M14.5 5l-7 7 7 7" />
  {:else if name === 'chevron'}
    <path d="M9.5 5l7 7-7 7" />
  {:else if name === 'send'}
    <path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" />
  {:else if name === 'qr'}
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><path d="M13.5 13.5h2.6v2.6M20 13.5v3M16 20h4M20 16.5V20" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'globe'}
    <circle cx="12" cy="12" r="8.3" /><path d="M3.7 12h16.6M12 3.7c2.2 2.3 3.3 5.2 3.3 8.3S14.2 18 12 20.3C9.8 18 8.7 15.1 8.7 12S9.8 6 12 3.7Z" />
  {:else if name === 'check'}
    <path d="M5 12.5 10 17.5 19 7" />
  {:else if name === 'follow-plus'}
    <circle cx="10" cy="8" r="3.4" /><path d="M4.2 19a5.8 5.8 0 0 1 11 -0.6" /><path d="M17.5 14.5v5M15 17h5" />
  {:else if name === 'star'}
    <path d="M12 3.2 14.6 8.7 20.6 9.5 16.2 13.7 17.3 19.7 12 16.8 6.7 19.7 7.8 13.7 3.4 9.5 9.4 8.7Z" />
  {:else if name === 'star-fill'}
    <path d="M12 3.2 14.6 8.7 20.6 9.5 16.2 13.7 17.3 19.7 12 16.8 6.7 19.7 7.8 13.7 3.4 9.5 9.4 8.7Z" fill="currentColor" stroke-linejoin="round" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="3.8" /><path d="M12 2.8v2.2M12 19v2.2M4.8 12H2.6M21.4 12h-2.2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
  {:else if name === 'logout'}
    <path d="M14 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.5M10 12h10M17 9l3 3-3 3" />
  {:else if name === 'coin'}
    <circle cx="12" cy="12" r="8.3" /><path d="M12 7.5v9M9.5 9.8h3.6a1.6 1.6 0 0 1 0 3.2H9.6h3.5a1.6 1.6 0 0 1 0 3.2H9.5" />
  {:else if name === 'more'}
    <g fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></g>
  {:else if name === 'dashboard'}
    <rect x="3.8" y="3.8" width="7" height="7" rx="1.6" /><rect x="13.2" y="3.8" width="7" height="7" rx="1.6" /><rect x="3.8" y="13.2" width="7" height="7" rx="1.6" /><rect x="13.2" y="13.2" width="7" height="7" rx="1.6" />
  {:else if name === 'wallet'}
    <rect x="3.5" y="6.2" width="17" height="13" rx="2.4" /><path d="M3.5 10h17" /><circle cx="16.4" cy="14.6" r="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'shield'}
    <path d="M12 3.6 18.8 6.2v5.4c0 4.3-2.8 7.3-6.8 8.8-4-1.5-6.8-4.5-6.8-8.8V6.2Z" /><path d="M9.2 12.1l2 2 3.8-3.8" />
  {:else if name === 'megaphone'}
    <path d="M4.8 10.4 15.6 5.2v13.6L4.8 13.6v-3.2Z" /><path d="M7.6 14.6V18" /><path d="M18.2 9.4a4.2 4.2 0 0 1 0 5.2" />
  {:else if name === 'cpu'}
    <rect x="7" y="7" width="10" height="10" rx="2" /><rect x="10.4" y="10.4" width="3.2" height="3.2" rx="0.8" /><path d="M9.5 7V4.2M14.5 7V4.2M9.5 19.8V17M14.5 19.8V17M7 9.5H4.2M7 14.5H4.2M19.8 9.5H17M19.8 14.5H17" />
  {:else if name === 'pulse'}
    <path d="M3.5 12.2h3.6l2.3-5.6 4.2 11 2.3-5.4h4.6" />
  {:else if name === 'book'}
    <path d="M12 6.6C10.2 5 7.4 4.6 4.6 5.1v13.4c2.8-.5 5.6-.1 7.4 1.5 1.8-1.6 4.6-2 7.4-1.5V5.1C16.6 4.6 13.8 5 12 6.6Z" /><path d="M12 6.6V20" />
  {:else if name === 'group'}
    <circle cx="9.2" cy="8.6" r="3.1" /><path d="M3.6 19.6a5.6 5.6 0 0 1 11.2 0" /><path d="M15.4 5.9a3 3 0 1 1 0 5.4" /><path d="M16.4 13.8a5.3 5.3 0 0 1 4 5.1" />
  {:else if name === 'wechat'}
    <g fill="currentColor" stroke="none"><path fill-rule="evenodd" d="M2.5 9 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 z M5.35 7.3 a0.95 0.95 0 1 0 1.9 0 a0.95 0.95 0 1 0 -1.9 0 z M9.75 7.3 a0.95 0.95 0 1 0 1.9 0 a0.95 0.95 0 1 0 -1.9 0 z M12 13.6 a4.2 4.2 0 1 0 8.4 0 a4.2 4.2 0 1 0 -8.4 0 z M14.2 12.6 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 z M16.8 12.6 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 z" /><path d="M3.6 12.4 1.9 14.4 5.3 13.4 Z" /><path d="M19.7 16 21.5 17.7 18.4 17 Z" /></g>
  {/if}
</svg>

<style>
  .ico { display: block; flex: none; }
</style>
