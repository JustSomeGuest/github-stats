import json
import os
from html import escape


def format_number(value):
    return f"{value:,}"


def render(stats):
    username = escape(stats.get("username", "GitHub"))
    repositories = format_number(stats.get("repositories", 0))
    commits = format_number(stats.get("commits", 0))
    files = format_number(stats.get("files", 0))
    stars = format_number(stats.get("stars", 0))

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="720" height="270" viewBox="0 0 720 270" fill="none">
<defs>
    <linearGradient id="background" x1="0" y1="0" x2="720" y2="270" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0b1120"/>
        <stop offset="1" stop-color="#101a2e"/>
    </linearGradient>

    <linearGradient id="accent" x1="0" y1="0" x2="720" y2="0" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3b82f6"/>
        <stop offset="0.5" stop-color="#60a5fa"/>
        <stop offset="1" stop-color="#93c5fd"/>
    </linearGradient>

    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
        </feMerge>
    </filter>

    <clipPath id="card">
        <rect width="720" height="270" rx="16"/>
    </clipPath>
</defs>

<style>
    text {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}

    .label {{
        fill: #8494a7;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1.5px;
    }}

    .value {{
        fill: #e6edf7;
        font-size: 28px;
        font-weight: 700;
    }}

    .muted {{
        fill: #718096;
        font-size: 12px;
    }}

    .pulse {{
        animation: pulse 3s ease-in-out infinite;
    }}

    .shine {{
        animation: shine 5s ease-in-out infinite;
    }}

    .wave {{
        stroke-dasharray: 12 9;
        animation: wave 18s linear infinite;
    }}

    @keyframes pulse {{
        0%, 100% {{ opacity: .65; }}
        50% {{ opacity: 1; }}
    }}

    @keyframes shine {{
        0% {{ transform: translateX(-180px); opacity: 0; }}
        20% {{ opacity: .12; }}
        60% {{ opacity: .08; }}
        100% {{ transform: translateX(900px); opacity: 0; }}
    }}

    @keyframes wave {{
        to {{ stroke-dashoffset: -420; }}
    }}
</style>

<g clip-path="url(#card)">
    <rect width="720" height="270" fill="url(#background)"/>

    <!-- Background decoration -->
    <circle cx="670" cy="35" r="110" fill="#2563eb" opacity=".035"/>
    <circle cx="670" cy="35" r="75" fill="#60a5fa" opacity=".025"/>

    <!-- Header -->
    <rect x="24" y="24" width="36" height="36" rx="10" fill="#172740" stroke="#263c5b"/>
    <path d="M34 43 L41 34 L48 43 L41 50 Z" fill="#60a5fa" opacity=".9"/>

    <text x="74" y="39" fill="#e6edf7" font-size="15" font-weight="700">{username}</text>
    <text x="74" y="55" class="muted">GitHub repository overview</text>

    <!-- Updated indicator -->
    <circle cx="664" cy="36" r="4" fill="#60a5fa" class="pulse"/>
    <text x="676" y="40" text-anchor="end" fill="#7da9df" font-size="10" letter-spacing="1">STATS</text>

    <!-- Divider -->
    <line x1="24" y1="78" x2="696" y2="78" stroke="#1d2b40"/>

    <!-- Statistic cards -->
    <g>
        <rect x="24" y="96" width="160" height="102" rx="11" fill="#111c2d" stroke="#1e3049"/>
        <text x="42" y="121" class="label">REPOSITORIES</text>
        <text x="42" y="158" class="value">{repositories}</text>
        <rect x="42" y="177" width="42" height="2" rx="1" fill="url(#accent)"/>
    </g>

    <g>
        <rect x="194" y="96" width="160" height="102" rx="11" fill="#111c2d" stroke="#1e3049"/>
        <text x="212" y="121" class="label">COMMITS</text>
        <text x="212" y="158" class="value">{commits}</text>
        <rect x="212" y="177" width="42" height="2" rx="1" fill="url(#accent)"/>
    </g>

    <g>
        <rect x="364" y="96" width="160" height="102" rx="11" fill="#111c2d" stroke="#1e3049"/>
        <text x="382" y="121" class="label">FILES</text>
        <text x="382" y="158" class="value">{files}</text>
        <rect x="382" y="177" width="42" height="2" rx="1" fill="url(#accent)"/>
    </g>

    <g>
        <rect x="534" y="96" width="162" height="102" rx="11" fill="#111c2d" stroke="#1e3049"/>
        <text x="552" y="121" class="label">TOTAL STARS</text>
        <text x="552" y="158" class="value">{stars}</text>
        <rect x="552" y="177" width="42" height="2" rx="1" fill="url(#accent)"/>
    </g>

    <!-- Animated footer accent -->
    <path d="M24 232 Q100 220 160 232 T300 230 T440 232 T580 230 T696 232"
          stroke="#233b5c" stroke-width="1" fill="none"/>

    <path d="M24 232 Q100 220 160 232 T300 230 T440 232 T580 230 T696 232"
          stroke="url(#accent)" stroke-width="1.5" fill="none"
          class="wave" filter="url(#glow)" opacity=".8"/>

    <!-- Moving light sweep -->
    <rect x="-180" y="0" width="140" height="270" fill="#93c5fd" opacity=".06"
          transform="skewX(-20)" class="shine"/>

    <text x="24" y="252" class="muted">PUBLIC REPOSITORIES</text>
    <text x="696" y="252" text-anchor="end" class="muted">GENERATED SVG</text>
</g>

<rect x=".5" y=".5" width="719" height="269" rx="15.5" stroke="#24344c"/>
</svg>
"""

    os.makedirs("output", exist_ok=True)

    with open("output/stats.svg", "w", encoding="utf-8") as file:
        file.write(svg)

    print("SVG generated: output/stats.svg")


def main():
    with open("output/stats.json", encoding="utf-8") as file:
        stats = json.load(file)

    render(stats)


if __name__ == "__main__":
    main()
