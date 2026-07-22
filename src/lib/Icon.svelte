<script lang="ts">
  interface Props {
    name: 'new' | 'undo' | 'reset' | 'help' | 'settings' | 'eye' | 'split' | 'join' | 'close' | 'arrow';
    size?: number;
  }

  let { name, size = 20 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'new'}
    <path d="M12 5v14M5 12h14"></path>
  {:else if name === 'undo'}
    <path d="M9 7 4 12l5 5"></path><path d="M5 12h8a6 6 0 0 1 6 6"></path>
  {:else if name === 'reset'}
    <path d="M4 11a8 8 0 1 1 2.3 6"></path><path d="M4 4v7h7"></path>
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.9.3-.9 1-.9 1.6"></path><path d="M12 17h.01"></path>
  {:else if name === 'settings'}
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10"></path><circle cx="16" cy="7" r="2"></circle><circle cx="8" cy="17" r="2"></circle>
  {:else if name === 'eye'}
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle>
  {:else if name === 'split'}
    <path d="M5 12h5M10 12c4 0 3-5 7-5h2M10 12c4 0 3 5 7 5h2"></path><path d="m17 4 3 3-3 3M17 14l3 3-3 3"></path>
  {:else if name === 'join'}
    <path d="M5 7h2c4 0 3 5 7 5h5M5 17h2c4 0 3-5 7-5"></path><path d="m17 9 3 3-3 3"></path>
  {:else if name === 'close'}
    <path d="m6 6 12 12M18 6 6 18"></path>
  {:else}
    <path d="M5 12h14M14 7l5 5-5 5"></path>
  {/if}
</svg>
