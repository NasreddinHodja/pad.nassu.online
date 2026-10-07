<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import Finder from './Finder.svelte';
	import { href } from './href';

	let { path, initial, subpads }: { path: string; initial: string; subpads: string[] } = $props();

	const SAVE_DELAY = 600;
	const POLL = 5000;
	const RETRY = 5000;

	const segments = $derived(path.split('/'));
	const url = untrack(() => href(path.split('/')));

	let content = $state(untrack(() => initial));
	// What the server has, as far as we know.
	let saved = untrack(() => initial);
	let status = $state('saved');
	let textarea: HTMLTextAreaElement;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving = false;

	function schedule(delay = SAVE_DELAY) {
		clearTimeout(timer);
		timer = setTimeout(save, delay);
	}

	function oninput() {
		status = 'unsaved';
		schedule();
	}

	async function save() {
		clearTimeout(timer);
		if (saving) return schedule();
		if (content === saved) {
			status = 'saved';
			return;
		}
		const body = content;
		saving = true;
		status = 'saving…';
		try {
			const res = await fetch(url, {
				method: 'PUT',
				body,
				headers: { 'content-type': 'text/plain; charset=utf-8' }
			});
			if (!res.ok) {
				const message = (await res.json().catch(() => null))?.message;
				throw new Error(message ?? `save failed (${res.status})`);
			}
			saved = body;
			status = content === saved ? 'saved' : 'unsaved';
			if (content !== saved) schedule();
		} catch (e) {
			status = '► ' + (e instanceof Error ? e.message : 'save failed') + ', retrying';
			schedule(RETRY);
		} finally {
			saving = false;
		}
	}

	// Someone else's last write, shown while we have nothing unsaved.
	async function refresh() {
		if (document.hidden || saving || content !== saved) return;
		const res = await fetch(url, { headers: { accept: 'text/plain' } }).catch(() => null);
		if (!res?.ok) return;
		const remote = await res.text();
		if (remote === saved || content !== saved || saving) return;
		const { selectionStart, selectionEnd } = textarea;
		content = saved = remote;
		requestAnimationFrame(() => textarea.setSelectionRange(selectionStart, selectionEnd));
	}

	onMount(() => {
		// After bind:value has filled it: the value leaves the cursor at the end,
		// and focusing would scroll to it.
		textarea.setSelectionRange(0, 0);
		textarea.focus({ preventScroll: true });
		const poll = setInterval(refresh, POLL);
		const onVisible = () => !document.hidden && refresh();
		// keepalive outlives the page, up to 64 KiB of body.
		const onHide = () => {
			if (content !== saved) fetch(url, { method: 'PUT', body: content, keepalive: true });
		};
		const onUnload = (e: BeforeUnloadEvent) => {
			if (content !== saved) e.preventDefault();
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('pagehide', onHide);
		window.addEventListener('beforeunload', onUnload);
		return () => {
			clearInterval(poll);
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('pagehide', onHide);
			window.removeEventListener('beforeunload', onUnload);
		};
	});

	// Saves first: locking signs this browser out of the root.
	async function lockRoot(e: SubmitEvent) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		await save();
		if (content === saved) form.submit();
	}

	beforeNavigate(() => {
		if (content !== saved) save();
	});
</script>

<svelte:head>
	<title>{path} · pad</title>
</svelte:head>

<div class="mx-auto flex h-svh max-w-6xl flex-col gap-3 p-3 sm:p-6">
	<header class="flex flex-wrap items-center gap-x-4 panel px-3 py-1">
		<nav class="flex min-w-0 flex-wrap" aria-label="path">
			<a class="text-ink hover:text-hi hover:underline" href="/">pad</a>
			{#each segments as segment, i (i)}
				<span class="px-1 text-dim">/</span>
				{#if i < segments.length - 1}
					<a
						class="break-all text-ink hover:text-hi hover:underline"
						href={href(segments.slice(0, i + 1))}>{segment}</a
					>
				{:else}
					<span class="break-all" aria-current="page">{segment}</span>
				{/if}
			{/each}
		</nav>
		<span class="ml-auto {status.startsWith('►') ? 'text-ink' : 'text-dim'}" aria-live="polite"
			>{status}</span
		>
		<a class="text-ink hover:text-hi hover:underline" href="?password">password</a>
		<form method="post" action="?/lock" onsubmit={lockRoot}>
			<button class="cursor-pointer text-ink hover:text-hi hover:underline">lock</button>
		</form>
	</header>

	<textarea
		bind:this={textarea}
		bind:value={content}
		{oninput}
		onblur={save}
		class="min-h-0 flex-1 resize-none panel p-3 text-fg outline-offset-2"
		aria-label="pad"
		spellcheck="false"
		autocapitalize="off"
		placeholder="type anything. it saves itself."></textarea>

	<Finder base={path} items={subpads} onclose={() => textarea.focus()} />
</div>
