const API = "https://api.github.com"; 

const BASE_HEADERS = {
    "User-Agent": "github-stats",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*"
        }
    });
}

function escapeXml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function formatNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value.toLocaleString("en-US");
    }

    const numeric = Number(value);
    if (String(value ?? "").trim() !== "" && Number.isFinite(numeric)) {
        return numeric.toLocaleString("en-US");
    }

    return String(value ?? "");
}

function iconFor(type) {
    const icons = {
        commits: `<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="#101827" stroke="currentColor" stroke-width="2"/>`,
        files: `<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 3v5h5M9 12h6M9 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
        stars: `<path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2-5.5-3-5.5 3 1.1-6.2-4.5-4.4 6.2-.9z" fill="currentColor"/>`,
        forks: `<circle cx="7" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 8v5c0 2 2 3 4 3h4M17 8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        repos: `<path d="M4 5h16v14H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
        custom: `<path d="M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`
    };

    return icons[type] || icons.custom;
}

function renderSvg(label, value, type) {
    const safeLabel = escapeXml(label);
    const safeValue = escapeXml(formatNumber(value));

    const width = Math.max(
        150,
        16 + 18 + 12 + safeLabel.length * 7.2 + 10 + safeValue.length * 8.2 + 16
    );

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" viewBox="0 0 ${width} 40">
<rect width="${width}" height="40" fill="#101827" stroke="#26364d"/>
<rect width="3" height="40" fill="#5794ff"/>
<g transform="translate(12 11)" color="#5794ff">
    <svg width="18" height="18" viewBox="0 0 24 24">${iconFor(type)}</svg>
</g>
<text x="42" y="25" font-family="Segoe UI,Arial,sans-serif" font-size="13" fill="#a5b4cc">${safeLabel}</text>
<text x="${42 + safeLabel.length * 7.2 + 8}" y="25" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="700" fill="#e6edf7">${safeValue}</text>
</svg>`;
}

function svgResponse(label, value, type) {
    return new Response(renderSvg(label, value, type), {
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*"
        }
    });
}

function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function getEncryptionKey(env) {
    if (!env.TOKEN_ENCRYPTION_KEY) {
        throw new Error("TOKEN_ENCRYPTION_KEY secret is not configured.");
    }

    const raw = base64ToBytes(env.TOKEN_ENCRYPTION_KEY);
    if (raw.length !== 32) {
        throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }

    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptCredentials(credentials, env) {
    const key = await getEncryptionKey(env);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

    return JSON.stringify({
        version: 1,
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(ciphertext))
    });
}

async function decryptCredentials(record, env) {
    const parsed = JSON.parse(record);
    if (parsed.version !== 1 || !parsed.iv || !parsed.data) {
        throw new Error("Stored token record is invalid.");
    }

    const key = await getEncryptionKey(env);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(parsed.iv) },
        key,
        base64ToBytes(parsed.data)
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
}

async function registerToken(request, env) {
    if (!env.TOKENS) {
        return json({ error: "TOKENS KV namespace is not configured." }, 500);
    }

    if (!env.TOKEN_ENCRYPTION_KEY) {
        return json({ error: "TOKEN_ENCRYPTION_KEY secret is not configured." }, 500);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: "Expected a JSON request body." }, 400);
    }

    const username = String(body.username || "").trim();
    const token = String(body.token || "").trim();

    if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
        return json({ error: "Enter a valid GitHub username." }, 400);
    }

    if (!token || token.length > 500) {
        return json({ error: "Enter a valid GitHub token." }, 400);
    }

    const check = await fetch(`${API}/users/${encodeURIComponent(username)}/repos?type=owner&per_page=1`, {
        headers: { ...BASE_HEADERS, Authorization: `Bearer ${token}` }
    });

    if (check.status === 401) {
        return json({ error: "GitHub rejected that token. Check it and try again." }, 400);
    }

    if (!check.ok) {
        return json({ error: `GitHub token validation failed (${check.status}).` }, 400);
    }

    const idBytes = crypto.getRandomValues(new Uint8Array(24));
    const id = bytesToBase64(idBytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const encrypted = await encryptCredentials({ username, token }, env);

    await env.TOKENS.put(id, encrypted);

    return json({
        id,
        username,
        endpoints: {
            commits: `/account/total-commits?id=${id}`,
            files: `/account/total-files?id=${id}`,
            stars: `/account/total-stars?id=${id}`,
            forks: `/account/total-forks?id=${id}`,
            repos: `/account/total-repos?id=${id}`
        }
    });
}

function setupPage() {
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GitHub Stats Setup</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#0b1220;color:#e6edf7;font:14px Segoe UI,Arial,sans-serif;display:grid;place-items:center;padding:24px}
main{width:min(100%,480px);border:1px solid #26364d;background:#101827;padding:24px}
h1{font-size:20px;margin:0 0 8px}
p{color:#8998b5;line-height:1.5;margin:0 0 20px}
h2{font-size:15px;margin:0 0 14px;color:#e6edf7}
.tutorial{border:1px solid #26364d;background:#0b1220;padding:16px;margin:20px 0}
.steps{list-style:none;padding:0;margin:0;counter-reset:step}
.steps li{position:relative;padding:0 0 14px 34px;color:#c4d0e3;line-height:1.5;counter-increment:step}
.steps li:last-child{padding-bottom:0}
.steps li:before{content:counter(step);position:absolute;left:0;top:0;width:22px;height:22px;display:grid;place-items:center;background:#1b2b43;border:1px solid #34445e;color:#80aaff;font-size:12px;font-weight:700}
.steps strong{color:#e6edf7}
.steps a{color:#80aaff}
.steps code{font-family:Consolas,monospace;color:#80aaff;background:#17243a;padding:2px 4px}
.note{border-left:2px solid #5794ff;padding:9px 11px;margin-top:16px;background:#111f33;color:#a5b4cc;font-size:12px;line-height:1.5}
label{display:block;margin:14px 0 6px;color:#c4d0e3}
input{width:100%;padding:11px;background:#0b1220;border:1px solid #34445e;color:#e6edf7;font:inherit;outline:none}
input:focus{border-color:#5794ff}
button{margin-top:18px;width:100%;padding:11px;border:0;background:#5794ff;color:#07111f;font-weight:700;font-size:14px;cursor:pointer}
button:disabled{opacity:.6;cursor:wait}
small{display:block;color:#8998b5;line-height:1.5;margin-top:14px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1220;border:1px solid #26364d;padding:12px;color:#c4d0e3;display:none;margin-top:16px}
#status{margin-top:14px;color:#c4d0e3;overflow-wrap:anywhere}
a{color:#80aaff}
</style>
</head>
<body>
<main>
<h1>GitHub Stats Setup</h1>
<p>Create a fine-grained GitHub token with read-only access to public repositories. Your token is encrypted before it is stored and is never put in your image URLs.</p>

<section class="tutorial">
<h2>How to create your GitHub token</h2>
<ol class="steps">
<li>Open <a href="https://github.com/settings" target="_blank" rel="noopener noreferrer">GitHub Settings</a>.</li>
<li>Scroll down and open <strong>Developer settings</strong>.</li>
<li>Go to <strong>Personal access tokens</strong>, then <strong>Fine-grained tokens</strong>.</li>
<li>Click <strong>Generate new token</strong>.</li>
<li>Set the token name to whatever you want.</li>
<li>Set <strong>Expiration</strong> to <strong>No expiration</strong>.</li>
<li>Under <strong>Repository access</strong>, select <strong>Public repositories</strong> (<strong>Read-only access to public repositories</strong>).</li>
<li>Click <strong>Generate token</strong>, copy the token, and save it somewhere secure.</li>
<li>Paste the token into the field below and submit the form.</li>
</ol>
<div class="note">Only select public repository read-only access. Do not grant access to private repositories or additional permissions. If GitHub does not offer No expiration, choose an expiration allowed by your account or organization.</div>
</section>

<form id="form">
<label for="username">GitHub username</label>
<input id="username" name="username" autocomplete="username" required maxlength="39" pattern="[A-Za-z0-9-]+">
<label for="token">Fine-grained personal access token</label>
<input id="token" name="token" type="password" autocomplete="off" required>
<button id="submit" type="submit">Save token</button>
</form>

<small>Your token is encrypted with AES-GCM before being stored. The generated setup ID and its encrypted token record expire after 90 days. This is separate from your GitHub token's expiration setting. Anyone who can see your public README can reuse its generated ID to request your public stats, but cannot recover your token.</small>
<div id="status" role="status"></div>
<pre id="result"></pre>
</main>
<script>
const form=document.getElementById('form');
const button=document.getElementById('submit');
const status=document.getElementById('status');
const result=document.getElementById('result');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;status.textContent='Validating and saving token…';result.style.display='none';
 const username=document.getElementById('username').value.trim();
 const token=document.getElementById('token').value.trim();
 try{
  const response=await fetch('/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,token})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Setup failed.');
  document.getElementById('token').value='';
  status.textContent='Token saved. Add these image URLs to your README:';
  const base=location.origin;
  result.textContent=Object.entries(data.endpoints).map(([name,path])=>name+': '+base+path).join('\\n');
  result.style.display='block';
 }catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
});
</script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer"
        }
    });
}

async function getCredentials(id, env) {
    if (!id || !/^[A-Za-z0-9_-]{32}$/.test(id)) {
        throw new Error("A valid setup ID is required. Open /setup first.");
    }

    if (!env.TOKENS) throw new Error("TOKENS KV namespace is not configured.");
    const record = await env.TOKENS.get(id);
    if (!record) throw new Error("Setup ID not found or expired. Open /setup again.");
    return decryptCredentials(record, env);
}

async function github(path, token) {
    const response = await fetch(`${API}${path}`, {
        headers: { ...BASE_HEADERS, Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const reset = response.headers.get("X-RateLimit-Reset");
        const body = await response.text();

        if (response.status === 403 || response.status === 429) {
            throw new Error(`GitHub rate limit or permission error. Remaining: ${remaining ?? "unknown"}. Reset: ${reset ?? "unknown"}.`);
        }
        if (response.status === 401) throw new Error("GitHub rejected the saved token. Create a new token at /setup.");
        if (response.status === 404) throw new Error("GitHub resource not found.");
        throw new Error(`GitHub API returned ${response.status}: ${body.slice(0, 200)}`);
    }

    return response.json();
}

async function getRepo(username, repo, token) {
    return github(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}`, token);
}

async function getCommitCount(username, repo, token) {
    const response = await fetch(`${API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/commits?per_page=1`, {
        headers: { ...BASE_HEADERS, Authorization: `Bearer ${token}` }
    });

    if (response.status === 409) return 0;
    if (!response.ok) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const reset = response.headers.get("X-RateLimit-Reset");
        throw new Error(`GitHub commits API returned ${response.status}. Remaining: ${remaining ?? "unknown"}. Reset: ${reset ?? "unknown"}.`);
    }

    const link = response.headers.get("Link") || "";
    const lastPage = link.match(/[?&]page=(\d+)[^>]*rel="last"/);
    if (lastPage) return Number(lastPage[1]);

    const data = await response.json();
    return Array.isArray(data) ? data.length : 0;
}

async function getFileCount(username, repo, branch, token) {
    const tree = await github(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
    if (!Array.isArray(tree.tree)) throw new Error("Could not read repository file tree.");
    if (tree.truncated) throw new Error("GitHub truncated this repository's file tree.");
    return tree.tree.filter(item => item.type === "blob").length;
}

async function getRepositories(username, token) {
    const repos = [];
    for (let page = 1; page <= 10; page++) {
        const data = await github(`/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=${page}`, token);
        if (!Array.isArray(data)) throw new Error("Unexpected GitHub repositories response.");
        repos.push(...data);
        if (data.length < 100) return repos;
    }
    throw new Error("Account has more than 1,000 public repositories.");
}

async function runLimited(items, limit, callback) {
    const results = new Array(items.length);
    let index = 0;

    async function worker() {
        while (true) {
            const current = index++;
            if (current >= items.length) return;
            results[current] = await callback(items[current]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
}

async function getTotals(username, token, key) {
    const repos = await getRepositories(username, token);
    const totals = { repos: repos.length, stars: 0, forks: 0, commits: 0, files: 0 };

    for (const repo of repos) {
        totals.stars += repo.stargazers_count || 0;
        totals.forks += repo.forks_count || 0;
    }

    if (key === "commits") {
        const counts = await runLimited(repos, 3, repo => getCommitCount(repo.owner.login, repo.name, token));
        totals.commits = counts.reduce((sum, count) => sum + count, 0);
    } else if (key === "files") {
        const counts = await runLimited(repos, 3, repo => getFileCount(repo.owner.login, repo.name, repo.default_branch, token));
        totals.files = counts.reduce((sum, count) => sum + count, 0);
    }

    return totals;
}

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/setup" && request.method === "GET") return setupPage();
    if (path === "/setup" && request.method === "POST") return registerToken(request, env);

    if (path === "/" || path === "/api") {
        return json({
            name: "GitHub Stats",
            setup: "/setup",
            note: "Create your own encrypted token setup before using statistic image endpoints.",
            repository: {
                commits: "/repo/commits?id=ID&repo=REPO",
                files: "/repo/files?id=ID&repo=REPO",
                stars: "/repo/stars?id=ID&repo=REPO",
                forks: "/repo/forks?id=ID&repo=REPO",
                custom: "/repo/custom?text=TEXT&label=OPTIONAL_LABEL"
            },
            account: {
                totalCommits: "/account/total-commits?id=ID",
                totalFiles: "/account/total-files?id=ID",
                totalStars: "/account/total-stars?id=ID",
                totalForks: "/account/total-forks?id=ID",
                totalRepos: "/account/total-repos?id=ID",
                custom: "/account/custom?text=TEXT&label=OPTIONAL_LABEL"
            }
        });
    }

    if (path.startsWith("/repo/")) {
        const type = path.split("/")[2];

        if (type === "custom") {
            const text = url.searchParams.get("text");
            const label = url.searchParams.get("label") || "Custom";
            if (text === null) return json({ error: "text is required." }, 400);
            return svgResponse(label, text, "custom");
        }

        const repo = url.searchParams.get("repo");
        const id = url.searchParams.get("id");

        if (!repo || !id) {
            return json({ error: "repo and id are required. Open /setup to create an ID." }, 400);
        }

        if (!["commits", "files", "stars", "forks"].includes(type)) {
            return json({ error: "Unknown endpoint." }, 404);
        }

        try {
            const credentials = await getCredentials(id, env);
            const data = await getRepo(credentials.username, repo, credentials.token);
            const labels = { commits: "Commits", files: "Files", stars: "Stars", forks: "Forks" };

            let value;

            if (type === "stars") value = data.stargazers_count ?? 0;
            else if (type === "forks") value = data.forks_count ?? 0;
            else if (type === "files") value = await getFileCount(credentials.username, repo, data.default_branch, credentials.token);
            else value = await getCommitCount(credentials.username, repo, credentials.token);

            return svgResponse(labels[type], value, type);
        } catch (error) {
            return json({ error: error.message || "Unable to fetch repository statistics.", endpoint: path }, 503);
        }
    }

    if (path.startsWith("/account/")) {
        const type = path.split("/")[2];

        if (type === "custom") {
            const text = url.searchParams.get("text");
            const label = url.searchParams.get("label") || "Custom";
            if (text === null) return json({ error: "text is required." }, 400);
            return svgResponse(label, text, "custom");
        }

        const types = {
            "total-commits": "commits",
            "total-files": "files",
            "total-stars": "stars",
            "total-forks": "forks",
            "total-repos": "repos"
        };

        if (!(type in types)) return json({ error: "Unknown endpoint." }, 404);

        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id is required. Open /setup to create one." }, 400);

        try {
            const credentials = await getCredentials(id, env);
            const key = types[type];
            const totals = await getTotals(credentials.username, credentials.token, key);

            const labels = {
                commits: "Total commits",
                files: "Total files",
                stars: "Total stars",
                forks: "Total forks",
                repos: "Repositories"
            };

            return svgResponse(labels[key], totals[key], key);
        } catch (error) {
            return json({ error: error.message || "Unable to fetch account statistics.", endpoint: path }, 503);
        }
    }

    return json({ error: "Endpoint not found." }, 404);
}

export default {
    async fetch(request, env) {
        if (request.method !== "GET" && !(request.method === "POST" && new URL(request.url).pathname === "/setup")) {
            return json({ error: "Method not allowed." }, 405);
        }

        try {
            return await handleRequest(request, env);
        } catch (error) {
            return json({ error: error.message || "Internal error." }, 500);
        }
    }
};
