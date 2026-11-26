<script lang="ts">
	// Switch between the two looks. The label names the look you get by pressing it.
	import { look, setLook } from '#lib/look.svelte.ts';
	const to = $derived(look.value === 'arena' ? 'light' : 'arena');
</script>

<button class="look-switch" type="button" onclick={() => setLook(to)}>{to === 'light' ? '밝은 화면' : '어두운 화면'}</button>
