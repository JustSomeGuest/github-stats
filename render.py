import json
import os
from html import escape

os.makedirs("output", exist_ok=True)

with open("output/stats.json", encoding="utf-8") as file:
    stats = json.load(file)

cards = {
    "commits": ("Commits", stats.get("commits", 0), "git-commit"),
    "files": ("Files", stats.get("files", 0), "files"),
    "repos": ("Repositories", stats.get("repositories", 0), "repo"),
    "stars": ("Stars", stats.get("stars", 0), "star"),
    "forks": ("Forks", stats.get("forks", 0), "fork"),
}

icons = {
    "git-commit": """
        <path d="M8 12h8"/>
        <circle cx="5" cy="12" r="3"/>
        <circle cx="19" cy="12" r="3"/>
    """,
    "files": """
        <path d="M7 3h7l4 4v14H7z"/>
        <path d="M14 3v5h5M10 12h5M10 16h5"/>
    """,
    "repo": """
        <circle cx="12" cy="12" r="8"/>
        <path d="M8 12h8M12 8v8"/>
    """,
    "star": """
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>
    """,
    "fork": """
        <circle cx="7" cy="6" r="2.5"/>
        <circle cx="17" cy="18" r="2.5"/>
        <circle cx="17" cy="6" r="2.5"/>
        <path d="M7 8.5v3a4 4 0 0 0 4 4h6M12 15.5V6"/>
    """,
}


def format_number(value):
    return f"{value:,}"


def render_card(label, value, icon):
    value = escape(format_number(value))
    label = escape(label)
    icon_svg = icons[icon]

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="210" height="76" viewBox="0 0 210 76" fill="none">
<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="210" y2="76" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0d1117"/>
        <stop offset="1" stop-color="#111a29"/>
    </linearGradient>

    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#60a5fa"/>
        <stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>

    <style>
        @keyframes pulse {{
            0%, 100% {{ opacity: .75; }}
            50% {{ opacity: 1; }}
        }}

        @keyframes shine {{
            0% {{ transform: translateX(-80px); opacity: 0; }}
            25% {{ opacity: .06; }}
            60% {{ opacity: .04; }}
            100% {{ transform: translateX(300px); opacity: 0; }}
        }}

        .icon {{
            stroke: #79b8ff;
            stroke-width: 1.7;
            stroke-linecap: round;
            stroke-linejoin: round;
        }}

        .shine {{
            animation: shine 6s ease-in-out infinite;
        }}

        .dot {{
            animation: pulse 3s ease-in-out infinite;
        }}
    </style>

    <clipPath id="clip">
        <rect width="210" height="76" rx="10"/>
    </clipPath>
</defs>

<g clip-path="url(#clip)">
    <rect width="210" height="76" rx="10" fill="url(#bg)"/>
    <rect x=".5" y=".5" width="209" height="75" rx="9.5" stroke="#233247"/>

    <rect x="14" y="18" width="40" height="40" rx="9" fill="#16243a" stroke="#223753"/>

    <g transform="translate(22 26)" class="icon">
        {icon_svg}
    </g>

    <text x="68" y="30" fill="#8293aa" font-size="10" font-weight="600" letter-spacing="1.2">{label.upper()}</text>
    <text x="68" y="53" fill="#e6edf7" font-size="22" font-weight="700">{value}</text>

    <circle cx="190" cy="26" r="3" fill="#60a5fa" class="dot"/>

    <rect x="-80" y="0" width="55" height="76" fill="#93c5fd" class="shine" transform="skewX(-20)" opacity=".05"/>
</g>
</svg>"""


for filename, (label, value, icon) in cards.items():
    with open(f"output/{filename}.svg", "w", encoding="utf-8") as file:
        file.write(render_card(label, value, icon))

    print(f"Generated output/{filename}.svg")

print("All cards generated.")
