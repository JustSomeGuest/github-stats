import json
import os
import re
import sys
import urllib.request
import urllib.error
from urllib.parse import quote

if len(sys.argv) < 2:
    print("Usage: python generate.py <username>")
    sys.exit(1)

username = sys.argv[1].strip()

if not username:
    print("Username cannot be empty.")
    sys.exit(1)

token = os.getenv("GITHUB_TOKEN")

headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "GitHub-Stats",
    "X-GitHub-Api-Version": "2022-11-28",
}

if token:
    headers["Authorization"] = f"Bearer {token}"


def request(url):
    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response), response.headers
    except urllib.error.HTTPError as error:
        if error.code in (404, 409, 422):
            return None, error.headers
        raise


def get_repositories():
    repositories = []
    page = 1

    while True:
        url = (
            f"https://api.github.com/users/{quote(username)}/repos"
            f"?type=owner&per_page=100&page={page}"
        )

        data, _ = request(url)

        if not data:
            break

        repositories.extend(data)
        page += 1

    return repositories


def get_commit_count(repo):
    url = (
        f"https://api.github.com/repos/{quote(username)}/{quote(repo)}"
        "/commits?per_page=1"
    )

    data, response_headers = request(url)

    if not data:
        return 0

    link = response_headers.get("Link", "")

    last_page = re.search(
        r'page=(\d+)[^>]*>\s*;\s*rel="last"',
        link
    )

    if last_page:
        return int(last_page.group(1))

    return len(data)


def get_file_count(repo, branch):
    url = (
        f"https://api.github.com/repos/{quote(username)}/{quote(repo)}"
        f"/git/trees/{quote(branch)}?recursive=1"
    )

    data, _ = request(url)

    if not data:
        return 0

    return sum(
        1 for item in data.get("tree", [])
        if item["type"] == "blob"
    )


def main():
    repositories = get_repositories()

    total_commits = 0
    total_files = 0
    total_stars = 0
    total_forks = 0
    projects = []

    print(f"Scanning {username}...")

    for repo in repositories:
        name = repo["name"]
        branch = repo["default_branch"]

        commits = get_commit_count(name)
        files = get_file_count(name, branch)

        total_commits += commits
        total_files += files
        total_stars += repo["stargazers_count"]
        total_forks += repo["forks_count"]

        projects.append({
            "name": name,
            "url": repo["html_url"],
            "description": repo["description"],
            "commits": commits,
            "files": files,
            "stars": repo["stargazers_count"],
            "forks": repo["forks_count"],
        })

        print(f"{name}: {commits} commits | {files} files")

    stats = {
        "username": username,
        "repositories": len(repositories),
        "commits": total_commits,
        "files": total_files,
        "stars": total_stars,
        "forks": total_forks,
        "projects": projects,
    }

    os.makedirs("output", exist_ok=True)

    with open("output/stats.json", "w", encoding="utf-8") as file:
        json.dump(stats, file, indent=4)

    print("\nStatistics:")
    print(f"Repositories: {len(repositories):,}")
    print(f"Commits:    {total_commits:,}")
    print(f"Files:      {total_files:,}")
    print(f"Stars:      {total_stars:,}")
    print(f"Forks:      {total_forks:,}")
    print("\nStats saved to output/stats.json")


if __name__ == "__main__":
    main()
