<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import * as api from './api';
	import { forgetKeys, type Keys } from './crypto';
	import Finder from './Finder.svelte';
	import { href } from './href';

	let { path, root, keys }: { path: string; root: string; keys: Keys } = $props();

	const SAVE_DELAY = 600;
	const POLL = 5000;
	const RETRY = 5000;

	const segments = $derived(path.split('/'));
	// One pad per editor: the page keys it on the path.
	const where = untrack(() => ({ path, root, keys }));

	let content = $state('');
	// What the server has, as far as we know; null until it's been fetched.
	let saved: string | null = null;
	let status = $state('opening…');
	let subpads = $state<string[]>([]);
	let ready = $state(false);
	let textarea: HTMLTextAreaElement;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving = false;

	const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

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
		if (saved === null) return;
		if (saving) return schedule();
		if (content === saved) {
			status = 'saved';
			return;
		}
		const body = content;
		saving = true;
		status = 'saving…';
		try {
			await api.save(where.root, where.keys, where.path, body);
			saved = body;
			status = content === saved ? 'saved' : 'unsaved';
			if (content !== saved) schedule();
		} catch (e) {
			status = '► ' + message(e, 'save failed') + ', retrying';
			schedule(RETRY);
		} finally {
			saving = false;
		}
	}

	// Someone else's last write, shown while we have nothing unsaved.
	async function refresh() {
		if (document.hidden || saving || saved === null || content !== saved) return;
		const remote = await api.load(where.root, where.keys, where.path).catch(() => null);
		if (remote === null || remote === saved || content !== saved || saving) return;
		const { selectionStart, selectionEnd } = textarea;
		content = saved = remote;
		requestAnimationFrame(() => textarea.setSelectionRange(selectionStart, selectionEnd));
	}

	/** Every pad under this one, relative to it, with the ones only a deeper pad implies. */
	function under(paths: string[]) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and dropped here
		const names = new Set<string>();
		for (const p of paths) {
			if (!p.startsWith(where.path + '/')) continue;
			const parts = p.slice(where.path.length + 1).split('/');
			for (let i = 1; i <= parts.length; i++) names.add(parts.slice(0, i).join('/'));
		}
		return [...names].sort();
	}

	async function open() {
		try {
			const [text, paths] = await Promise.all([
				api.load(where.root, where.keys, where.path),
				api.list(where.root, where.keys)
			]);
			content = saved = text;
			subpads = under(paths);
			status = 'saved';
			ready = true;
			requestAnimationFrame(() => {
				textarea.setSelectionRange(0, 0);
				textarea.focus({ preventScroll: true });
			});
		} catch (e) {
			status = '► ' + message(e, "couldn't open the pad");
		}
	}

	onMount(() => {
		open();
		const poll = setInterval(refresh, POLL);
		// Encrypting takes a moment the page may not get once it unloads, so a
		// hidden tab saves straight away.
		const onVisible = () => (document.hidden ? save() : refresh());
		const onUnload = (e: BeforeUnloadEvent) => {
			if (saved !== null && content !== saved) e.preventDefault();
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('beforeunload', onUnload);
		return () => {
			clearInterval(poll);
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('beforeunload', onUnload);
		};
	});

	// Saves first: locking signs this browser out of the root and forgets its keys.
	async function lock() {
		await save();
		if (content !== saved) return;
		await Promise.all([api.lock(where.root), forgetKeys(where.root)]).catch(() => {});
		goto('/');
	}

	beforeNavigate(() => {
		if (saved !== null && content !== saved) save();
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
		<button class="cursor-pointer text-ink hover:text-hi hover:underline" onclick={lock}
			>lock</button
		>
	</header>

	<textarea
		bind:this={textarea}
		readonly={!ready}
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
