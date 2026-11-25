<script lang="ts">
	// One ambience layer for every Sparring page: navigating between them does not reload the video or restart the scene.
	import { Ambience } from '#lib/ambience/index.ts';
	import { stage } from '#lib/ambience/stage.svelte.ts';

	let { children } = $props();
</script>

<Ambience scene={stage.scene} progress={stage.progress} bloom={stage.bloom} />
{@render children()}
