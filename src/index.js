const API = "https://api.github.com";
const CACHE_TTL = 3600;

const COLORS = {
    background: "#0d1117",
    panel: "#111a29",
    border: "#233247",
    iconBackground: "#16243a",
    iconBorder: "#223753",
    accent: "#60a5fa",
    accentLight: "#79b8ff",
    text: "#e6edf7",
    muted: "#8293aa",
};

const ICONS = {
    commits: `
        <path d="M8 12h8"/>
        <circle cx="5" cy="12" r="3"/>
        <circle cx="19" cy="12" r="3"/>
    `,
    files: `
        <path d="M7 3h7l4 4v14H7z"/>
        <path d="M14 3v5h5M10 12h5M10 16h5"/>
    `,
    repos: `
        <path d="M5 5h14v14H5z"/>
        <path d="M9 9h6M9 13h6M9 17h3"/>
    `,
    stars: `
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>
    `,
    forks: `
        <circle cx="7" cy="6" r="2.5"/>
        <circle cx="17" cy="18" r="2.5"/>
        <circle cx="17" cy="6" r="2.5"/>
        <path d="M7 8.5v3a4 4 0 0 0 4 4h6M12 15.5V6"/>
    `,
    custom: `
        <path d="M4 6h16M4 12h12M4 18h8"/>
    `,
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

function escapeXml(value) {
    return String(value).replace(/[<>&'"]/g, character => ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
    })[character]);
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-US");
}

function renderSvg(label, value, icon = "custom") {
    const safeLabel = escapeXml(label.toUpperCase());
    const safeValue = escapeXml(formatNumber(value));
    const iconSvg = ICONS[icon] || ICONS.custom;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="76" viewBox="0 0 210 76">
<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="210" y2="76" gradientUnits="userSpaceOnUse">
        <stop stop-color="${COLORS.background}"/>
        <stop offset="1" stop-color="${COLORS.panel}"/>
    </linearGradient>

    <style>
        @keyframes pulse {
            0%,100% { opacity: .75; }
            50% { opacity: 1; }
        }

        @keyframes shine {
            0% { transform: translateX(-80px); opacity: 0; }
            25% { opacity: .06; }
            60% { opacity: .04; }
            100% { transform: translateX(300px); opacity: 0; }
        }

        .icon {
            stroke: ${COLORS.accentLight};
            stroke-width: 1.7;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .shine {
            animation: shine 6s ease-in-out infinite;
        }

        .dot {
            animation: pulse 3s ease-in-out infinite;
        }
    </style>

    <clipPath id="clip">
        <rect width="210" height="76" rx="10"/>
    </clipPath>
</defs>

<g clip-path="url(#clip)">
    <rect width="210" height="76" rx="10" fill="url(#bg)"/>
    <rect x=".5" y=".5" width="209" height="75" rx="9.5" stroke="${COLORS.border}"/>

    <rect x="14" y="18" width="40" height="40" rx="9" fill="${COLORS.iconBackground}" stroke="${COLORS.iconBorder}"/>

    <g transform="translate(22 26)" fill="none" class="icon">
        ${iconSvg}
    </g>

    <text x="68" y="30" fill="${COLORS.muted}" font-size="10" font-weight="600" letter-spacing="1.2">${safeLabel}</text>
    <text x="68" y="53" fill="${COLORS.text}" font-size="22" font-weight="700">${safeValue}</text>

    <circle cx="190" cy="26" r="3" fill="${COLORS.accent}" class="dot"/>

    <rect x="-80" y="0" width="55" height="76" fill="#93c5fd" class="shine" transform="skewX(-20)" opacity=".05"/>
</g>
</svg>`;
}

function svgResponse(label, value, icon = "custom") {
    return new Response(renderSvg(label, value, icon), {
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": `public, max-age=300, s-maxage=${CACHE_TTL}`,
            "Access-Control-Allow-Origin": "*",
        },
    });
}

async function cachedFetch(url, env) {
    const cache = caches.default;
    const cacheKey = new Request(url, { method: "GET" });

    const cached = await cache.match(cacheKey);

    if (cached) {
        return cached;
    }

    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "GitHub-Stats",
        "X-GitHub-Api-Version": "2022-11-28",
    };

    if (env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    const response = await fetch(url, { headers });

    if (response.ok) {
        const cacheResponse = new Response(response.clone().body, response);
        cacheResponse.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
        await cache.put(cacheKey, cacheResponse);
    }

    return response;
}

async function github(url, env) {
    const response = await cachedFetch(url, env);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("GitHub user or repository not found.");
        }

        if (response.status === 403 || response.status === 429) {
            throw new Error("GitHub API rate limit reached. Try again later.");
        }

        throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
}

async function getRepositories(username, env) {
    const repositories = [];
    let page = 1;

    while (true) {
        const url = `${API}/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=${page}`;
        const batch = await github(url, env);

        repositories.push(...batch);

        if (batch.length < 100) {
            break;
        }

        page++;
    }

    return repositories;
}

async function getCommitCount(username, repo, env) {
    const url = `${API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/commits?per_page=1`;
    const response = await cachedFetch(url, env);

    if (response.status === 409 || response.status === 404) {
        return 0;
    }

    if (!response.ok) {
        throw new Error(`Unable to get commits for ${repo}.`);
    }

    const data = await response.json();
    const link = response.headers.get("Link") || "";
    const lastPage = link.match(/page=(\d+)[^>]*rel="last"/);

    if (lastPage) {
        return Number(lastPage[1]);
    }

    return data.length;
}

async function getFileCount(repo, env) {
    if (!repo.default_branch) {
        return 0;
    }

    const url = `${API}/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`;
    const data = await github(url, env);

    return (data.tree || []).filter(item => item.type === "blob").length;
}

async function getRepositoryStats(repo, env) {
    const [commits, files] = await Promise.all([
        getCommitCount(repo.owner.login, repo.name, env),
        getFileCount(repo, env),
    ]);

    return {
        commits,
        files,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
    };
}

async function getTotals(username, env) {
    const repositories = await getRepositories(username, env);

    let commits = 0;
    let files = 0;
    let stars = 0;
    let forks = 0;

    for (let i = 0; i < repositories.length; i += 5) {
        const batch = repositories.slice(i, i + 5);

        const results = await Promise.all(
            batch.map(repo => getRepositoryStats(repo, env))
        );

        for (const stats of results) {
            commits += stats.commits;
            files += stats.files;
            stars += stats.stars;
            forks += stats.forks;
        }
    }

    return {
        repos: repositories.length,
        commits,
        files,
        stars,
        forks,
    };
}

async function getRepo(username, repoName, env) {
    return github(
        `${API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`,
        env
    );
}

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();
    const username = url.searchParams.get("username");
    const repoName = url.searchParams.get("repo");

    if (request.method !== "GET") {
        return json({ error: "Only GET requests are supported." }, 405);
    }

    if (path === "/" || path === "/api") {
        return json({
            name: "GitHub Stats",
            repository: {
                commits: "/repo/commits?username=USER&repo=REPO",
                files: "/repo/files?username=USER&repo=REPO",
                stars: "/repo/stars?username=USER&repo=REPO",
                forks: "/repo/forks?username=USER&repo=REPO",
                custom: "/repo/custom?username=USER&repo=REPO&text=TEXT",
            },
            account: {
                totalCommits: "/account/total-commits?username=USER",
                totalFiles: "/account/total-files?username=USER",
                totalStars: "/account/total-stars?username=USER",
                totalForks: "/account/total-forks?username=USER",
                totalRepos: "/account/total-repos?username=USER",
                custom: "/account/custom?username=USER&text=TEXT",
            },
        });
    }

    if (!username) {
        return json({ error: "Missing username parameter." }, 400);
    }

    try {
        const repoEndpoints = {
            "/repo/commits": ["Commits", "commits", "commits"],
            "/repo/files": ["Files", "files", "files"],
            "/repo/stars": ["Stars", "stars", "stars"],
            "/repo/forks": ["Forks", "forks", "forks"],
        };

        if (repoEndpoints[path]) {
            if (!repoName) {
                return json({ error: "Missing repo parameter." }, 400);
            }

            const repo = await getRepo(username, repoName, env);
            const stats = await getRepositoryStats(repo, env);
            const [label, key, icon] = repoEndpoints[path];

            return svgResponse(label, stats[key], icon);
        }

        if (path === "/repo/custom") {
            if (!repoName) {
                return json({ error: "Missing repo parameter." }, 400);
            }

            const text = url.searchParams.get("text");

            if (text === null) {
                return json({ error: "Missing text parameter." }, 400);
            }

            const label = url.searchParams.get("label") || "Custom";
            return svgResponse(label, text, "custom");
        }

        const accountEndpoints = {
            "/account/total-commits": ["Total Commits", "commits", "commits"],
            "/account/total-files": ["Total Files", "files", "files"],
            "/account/total-stars": ["Total Stars", "stars", "stars"],
            "/account/total-forks": ["Total Forks", "forks", "forks"],
            "/account/total-repos": ["Total Repositories", "repos", "repos"],
        };

        if (accountEndpoints[path]) {
            const [label, key, icon] = accountEndpoints[path];
            const totals = await getTotals(username, env);

            return svgResponse(label, totals[key], icon);
        }

        if (path === "/account/custom") {
            const text = url.searchParams.get("text");

            if (text === null) {
                return json({ error: "Missing text parameter." }, 400);
            }

            const label = url.searchParams.get("label") || "Custom";
            return svgResponse(label, text, "custom");
        }

        return json({ error: "Endpoint not found." }, 404);
    } catch (error) {
        return json({ error: error.message || "Internal server error." }, 500);
    }
}

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
};
