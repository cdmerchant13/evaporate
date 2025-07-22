/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	R2_BUCKET: R2Bucket;
	D1_DB: D1Database;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: any, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS_HEADERS });
		}

		const url = new URL(request.url);

		if (url.pathname === '/upload' && request.method === 'POST') {
			return handleUpload(request, env);
		}

		if (url.pathname.startsWith('/file/')) {
			return handleFile(request, env);
		}

		return jsonResponse({ error: 'Not Found' }, 404);
	},
};

async function handleUpload(request: Request, env: Env): Promise<Response> {
	const formData = await request.formData();
	const file = formData.get('file') as unknown as File;
	const passphrase = formData.get('passphrase') as string | null;
	const expiry = formData.get('expiry') as string | null;
	const oneTimeView = formData.get('oneTimeView') === 'true';

	if (!file || file.size === 0) {
		return jsonResponse({ error: 'File not found or empty' }, 400);
	}

	// Max file size: 100MB
	if (file.size > 100 * 1024 * 1024) {
		return jsonResponse({ error: 'File size exceeds 100MB limit' }, 400);
	}

	const id = crypto.randomUUID();
	const fileData = await file.arrayBuffer();

	await env.R2_BUCKET.put(id, fileData, {
		httpMetadata: {
			contentType: file.type,
		},
	});

	let expires_at: number | null = null;
	if (expiry && expiry !== 'one-time') {
		const now = new Date();
		switch (expiry) {
			case '1h':
				now.setHours(now.getHours() + 1);
				break;
			case '1d':
				now.setDate(now.getDate() + 1);
				break;
			case '7d':
				now.setDate(now.getDate() + 7);
				break;
		}
		expires_at = Math.floor(now.getTime() / 1000);
	}

	let passphrase_hash: string | null = null;
	if (passphrase) {
		const encoder = new TextEncoder();
		const data = encoder.encode(passphrase);
		const hash = await crypto.subtle.digest('SHA-256', data);
		passphrase_hash = Array.from(new Uint8Array(hash))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}

	await env.D1_DB
		.prepare(
			'INSERT INTO files (id, name, type, size, expires_at, one_time_view, passphrase_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(
			id,
			file.name,
			file.type,
			file.size,
			expires_at,
			oneTimeView ? 1 : 0,
			passphrase_hash,
			Math.floor(Date.now() / 1000)
		)
		.run();

	const fileUrl = `${new URL(request.url).origin}/file/${id}`;

	return jsonResponse({ url: fileUrl });
}

async function handleFile(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const id = url.pathname.split('/')[2];

	if (!id) {
		return jsonResponse({ error: 'Invalid file ID' }, 400);
	}

	// This is a metadata request
	if (request.method === 'GET' && request.headers.get('Accept') === 'application/json') {
		const fileInfo = await env.D1_DB.prepare('SELECT name, size, passphrase_hash FROM files WHERE id = ?')
			.bind(id)
			.first();

		if (!fileInfo) {
			return jsonResponse({ error: 'File not found' }, 404);
		}
		return jsonResponse({
			name: fileInfo.name,
			size: fileInfo.size,
			requiresPassphrase: !!fileInfo.passphrase_hash,
		});
	}

	const fileInfo = await env.D1_DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();

	if (!fileInfo) {
		return jsonResponse({ error: 'File not found' }, 404);
	}

	if (fileInfo.expires_at && new Date(fileInfo.expires_at * 1000) < new Date()) {
		await env.R2_BUCKET.delete(id);
		await env.D1_DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
		return jsonResponse({ error: 'File expired' }, 410);
	}

	if (fileInfo.passphrase_hash) {
		if (request.method !== 'POST') {
			return jsonResponse({ error: 'Passphrase required' }, 401);
		}

		const body: { passphrase?: string } = await request.json();
		const passphrase = body.passphrase;

		if (!passphrase) {
			return jsonResponse({ error: 'Passphrase not provided' }, 401);
		}

		const encoder = new TextEncoder();
		const data = encoder.encode(passphrase);
		const hash = await crypto.subtle.digest('SHA-256', data);
		const provided_hash = Array.from(new Uint8Array(hash))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		if (provided_hash !== fileInfo.passphrase_hash) {
			return jsonResponse({ error: 'Invalid passphrase' }, 403);
		}
	}

	const object = await env.R2_BUCKET.get(id);

	if (object === null) {
		return jsonResponse({ error: 'File not found in storage' }, 404);
	}

	if (fileInfo.one_time_view) {
		// Use waitUntil to avoid blocking the response
		ctx.waitUntil(env.R2_BUCKET.delete(id));
		ctx.waitUntil(env.D1_DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run());
	}

	const headers = new Headers(CORS_HEADERS);
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('Content-Disposition', `attachment; filename="${fileInfo.name}"`);

	return new Response(object.body, {
		headers,
	});
}