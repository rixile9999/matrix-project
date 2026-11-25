<script lang="ts">
	// Compact control: sound, volume, motion, backdrop. Place it in a page corner.
	import { onMount } from 'svelte';
	import { enable } from './audio';
	import { saveSettings, settings } from './settings.svelte';

	let mounted = $state(false); // settings come from localStorage, so render them only on the client
	onMount(() => { mounted = true; });

	function toggleSound() {
		const on = !settings.sound;
		if (on) enable(true); // inside the click: browsers only start audio after a gesture
		settings.sound = on;
		saveSettings();
	}
	function toggleMotion() {
		settings.motion = !settings.motion;
		saveSettings();
	}
</script>

<div class="amb-ctl" role="group" aria-label="배경과 소리">
	{#if mounted}
		<button type="button" aria-pressed={settings.sound} onclick={toggleSound}>소리 {settings.sound ? '켬' : '끔'}</button>
		<input
			type="range" min="0" max="100" step="1" aria-label="음량" disabled={!settings.sound}
			value={Math.round(settings.volume * 100)}
			oninput={(e) => { settings.volume = Number(e.currentTarget.value) / 100; saveSettings(); }}
		/>
		<button type="button" aria-pressed={settings.motion} onclick={toggleMotion}>움직임 {settings.motion ? '켬' : '끔'}</button>
		<select
			aria-label="배경" value={settings.backdrop}
			onchange={(e) => { settings.backdrop = e.currentTarget.value as typeof settings.backdrop; saveSettings(); }}
		>
			<option value="random">랜덤</option>
			<option value="none">실시간 그림</option>
			<option value="earthrise">달 지평선</option>
			<option value="blackhole">블랙홀</option>
			<option value="earth">지구</option>
		</select>
	{/if}
</div>

<style>
	.amb-ctl {
		display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 8px;
		background: rgba(236, 235, 230, .04); border: 1px solid rgba(236, 235, 230, .09); border-radius: 18px; backdrop-filter: blur(8px);
		font: 500 12px var(--f-body, system-ui, sans-serif); color: var(--a-dim, rgba(236, 235, 230, .56)); min-height: 34px;
	}
	button, select {
		font: inherit; color: var(--a-ink, #ecebe6); background: transparent; border: 1px solid rgba(236, 235, 230, .16);
		border-radius: 999px; padding: 4px 11px; cursor: pointer;
	}
	select { background: #0b0c11; padding-right: 6px; }
	button[aria-pressed='true'] { border-color: var(--a-warm, #f0cfa6); color: var(--a-warm, #f0cfa6); }
	button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--a-warm, #f0cfa6); outline-offset: 2px; }
	input[type='range'] { width: 84px; accent-color: var(--a-warm, #f0cfa6); }
	input:disabled { opacity: .35; }
</style>
