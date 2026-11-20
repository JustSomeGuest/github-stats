const API = "https://api.github.com";

const HEADERS = {
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
        170,
        Math.min(320, 66 + Math.max(safeLabel.length, safeValue.length) * 7)
    );

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="74" viewBox="0 0 ${width} 74">
<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#101827"/>
        <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
</defs>
<rect width="${width}" height="74" fill="url(#bg)" stroke="#26364d"/>
<rect width="3" height="74" fill="#5794ff"/>
<g transform="translate(16 20)" color="#5794ff">
    <svg width="22" height="22" viewBox="0 0 24 24">${iconFor(type)}</svg>
</g>
<text x="48" y="28" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#8998b5">${safeLabel}</text>
<text x="48" y="51" font-family="Segoe UI,Arial,sans-serif" font-size="19" font-weight="600" fill="#e6edf7">${safeValue}</text>
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

async function github(path) {
    const response = await fetch(`${API}${path}`, {
        headers: HEADERS
    });

    if (!response.ok) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const reset = response.headers.get("X-RateLimit-Reset");
        const body = await response.text();

        if (response.status === 403 || response.status === 429) {
            throw new Error(
                `GitHub rate limit reached. Remaining: ${remaining ?? "unknown"}. Reset: ${reset ?? "unknown"}.`
            );
        }

        if (response.status === 404) {
            throw new Error("GitHub resource not found.");
        }

        throw new Error(
            `GitHub API returned ${response.status}: ${body.slice(0, 300)}`
        );
    }

    return response.json();
}

async function getRepo(username, repo) {
    return github(
        `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}`
    );
}

async function getCommitCount(username, repo) {
    const response = await fetch(
        `${API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/commits?per_page=1`,
        { headers: HEADERS }
    );

    if (response.status === 409) return 0;

    if (!response.ok) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const reset = response.headers.get("X-RateLimit-Reset");

        throw new Error(
            `GitHub commits API returned ${response.status}. Remaining: ${remaining ?? "unknown"}. Reset: ${reset ?? "unknown"}.`
        );
    }

    const link = response.headers.get("Link") || "";
    const lastPage = link.match(/[?&]page=(\d+)[^>]*rel="last"/);

    if (lastPage) {
        return Number(lastPage[1]);
    }

    const data = await response.json();
    return Array.isArray(data) ? data.length : 0;
}

async function getFileCount(username, repo, branch) {
    const tree = await github(
        `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );

    if (!Array.isArray(tree.tree)) {
        throw new Error("Could not read repository file tree.");
    }

    if (tree.truncated) {
        throw new Error("GitHub truncated this repository's file tree.");
    }

    return tree.tree.filter(item => item.type === "blob").length;
}

async function getRepositories(username) {
    const repos = [];

    for (let page = 1; page <= 10; page++) {
        const data = await github(
            `/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=${page}`
        );

        if (!Array.isArray(data)) {
            throw new Error("Unexpected GitHub repositories response.");
        }

        repos.push(...data);

        if (data.length < 100) {
            return repos;
        }
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

    await Promise.all(
        Array.from(
            { length: Math.min(limit, items.length) },
            () => worker()
        )
    );

    return results;
}

async function getTotals(username) {
    const repos = await getRepositories(username);

    const totals = {
        repos: repos.length,
        stars: 0,
        forks: 0,
        commits: 0,
        files: 0
    };

    for (const repo of repos) {
        totals.stars += repo.stargazers_count || 0;
        totals.forks += repo.forks_count || 0;
    }

    const stats = await runLimited(repos, 3, async repo => {
        const [commits, files] = await Promise.all([
            getCommitCount(repo.owner.login, repo.name),
            getFileCount(repo.owner.login, repo.name, repo.default_branch)
        ]);

        return { commits, files };
    });

    for (const stat of stats) {
        totals.commits += stat.commits;
        totals.files += stat.files;
    }

    return totals;
}

async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const username = url.searchParams.get("username");
    const repo = url.searchParams.get("repo");

    if (path === "/" || path === "/api") {
        return json({
            name: "GitHub Stats",
            repository: {
                commits: "/repo/commits?username=USER&repo=REPO",
                files: "/repo/files?username=USER&repo=REPO",
                stars: "/repo/stars?username=USER&repo=REPO",
                forks: "/repo/forks?username=USER&repo=REPO",
                custom: "/repo/custom?username=USER&repo=REPO&text=TEXT"
            },
            account: {
                totalCommits: "/account/total-commits?username=USER",
                totalFiles: "/account/total-files?username=USER",
                totalStars: "/account/total-stars?username=USER",
                totalForks: "/account/total-forks?username=USER",
                totalRepos: "/account/total-repos?username=USER",
                custom: "/account/custom?username=USER&text=TEXT"
            }
        });
    }

    if (path.startsWith("/repo/")) {
        if (!username || !repo) {
            return json(
                { error: "username and repo are required." },
                400
            );
        }

        const type = path.split("/")[2];

        if (type === "custom") {
            const text = url.searchParams.get("text");
            const label = url.searchParams.get("label") || "Custom";

            if (text === null) {
                return json({ error: "text is required." }, 400);
            }

            return svgResponse(label, text, "custom");
        }

        if (!["commits", "files", "stars", "forks"].includes(type)) {
            return json({ error: "Unknown endpoint." }, 404);
        }

        try {
            const data = await getRepo(username, repo);

            const labels = {
                commits: "Commits",
                files: "Files",
                stars: "Stars",
                forks: "Forks"
            };

            let value;

            if (type === "stars") {
                value = data.stargazers_count ?? 0;
            } else if (type === "forks") {
                value = data.forks_count ?? 0;
            } else if (type === "files") {
                value = await getFileCount(
                    username,
                    repo,
                    data.default_branch
                );
            } else {
                value = await getCommitCount(username, repo);
            }

            return svgResponse(labels[type], value, type);
        } catch (error) {
            return json({
                error: error.message || "Unable to fetch repository statistics.",
                endpoint: path
            }, 503);
        }
    }

    if (path.startsWith("/account/")) {
        if (!username) {
            return json({ error: "username is required." }, 400);
        }

        const type = path.split("/")[2];

        if (type === "custom") {
            const text = url.searchParams.get("text");
            const label = url.searchParams.get("label") || "Custom";

            if (text === null) {
                return json({ error: "text is required." }, 400);
            }

            return svgResponse(label, text, "custom");
        }

        const types = {
            "total-commits": "commits",
            "total-files": "files",
            "total-stars": "stars",
            "total-forks": "forks",
            "total-repos": "repos"
        };

        if (!(type in types)) {
            return json({ error: "Unknown endpoint." }, 404);
        }

        try {
            const totals = await getTotals(username);
            const key = types[type];

            const labels = {
                commits: "Total commits",
                files: "Total files",
                stars: "Total stars",
                forks: "Total forks",
                repos: "Repositories"
            };

            return svgResponse(labels[key], totals[key], key);
        } catch (error) {
            return json({
                error: error.message || "Unable to fetch account statistics.",
                endpoint: path
            }, 503);
        }
    }

    return json({ error: "Endpoint not found." }, 404);
}

export default {
    async fetch(request) {
        if (request.method !== "GET") {
            return json(
                { error: "Only GET requests are supported." },
                405
            );
        }

        try {
            return await handleRequest(request);
        } catch (error) {
            return json({
                error: error.message || "Internal error."
            }, 500);
        }
    }
};
