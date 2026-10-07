<script lang="ts">
	import Pad from '#lib/Pad.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- A fresh editor per pad, so nothing typed in one leaks into the next. -->
{#key data.path}
	<Pad path={data.path} initial={data.content} subpads={data.subpads} />
{/key}
