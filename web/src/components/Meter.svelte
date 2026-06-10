<script>
  // 一行细 meter（进度细条）。color 可传 var() 或 color-mix()。
  export let value = 0;
  export let color = 'var(--life-awake)';
</script>

<span class="meter"><i style="width:{Math.round((value || 0) * 100)}%;background:{color};"></i></span>
