<script>
  // 自绘 SVG 线性图标：清晰、跨设备一致、随 currentColor 走主题。不用 emoji、零依赖。
  export let name = '';
  export let size = 22;
  export let sw = 1.7; // stroke width
</script>

<svg class="ico" width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width={sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'plaza'}
    <!-- 此刻/广场：星座（呼应 ZSKY） -->
    <path d="M12 3.6l1.5 4.6 4.6 1.5-4.6 1.5L12 15.8l-1.5-4.6L5.9 9.7l4.6-1.5z" />
    <circle cx="18.6" cy="5.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="5.6" cy="17.4" r="0.8" fill="currentColor" stroke="none" />
  {:else if name === 'explore'}
    <!-- 探索：罗盘 -->
    <circle cx="12" cy="12" r="8.5" />
    <path d="M15.4 8.6l-2.1 4.7-4.7 2.1 2.1-4.7z" />
  {:else if name === 'notifications'}
    <!-- 通知：铃 -->
    <path d="M6.5 9.5a5.5 5.5 0 0111 0c0 4.2 1.6 5.4 2 5.7H4.5c.4-.3 2-1.5 2-5.7z" />
    <path d="M10.2 18.5a2 2 0 003.6 0" />
  {:else if name === 'chats'}
    <!-- 关系/对话：对话气泡 -->
    <path d="M20 14.5a3 3 0 01-3 3H9l-4 3 .02-13.5a3 3 0 013-3H17a3 3 0 013 3z" />
  {:else if name === 'me'}
    <!-- 我：人 -->
    <circle cx="12" cy="8.2" r="3.3" />
    <path d="M5.8 20a6.2 6.2 0 0112.4 0" />
  {:else if name === 'search'}
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M19.5 19.5L15 15" />
  {:else if name === 'back'}
    <path d="M15 5l-7 7 7 7" />
  {:else if name === 'chevron'}
    <path d="M9 5l7 7-7 7" />
  {:else if name === 'send'}
    <path d="M12 20V5M6 11l6-6 6 6" />
  {:else if name === 'qr'}
    <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
    <path d="M13.5 13.5h2.5v2.5M20 13.5v2.5M16 20h4M20 16.5V20" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  {:else if name === 'moon'}
    <path d="M20 13.5A8 8 0 1110.5 4a6.2 6.2 0 009.5 9.5z" />
  {:else if name === 'logout'}
    <path d="M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2M10 12h10M17 9l3 3-3 3" />
  {/if}
</svg>

<style>
  .ico { display: block; flex: none; }
</style>
