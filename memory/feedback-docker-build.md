**Rule: Docker build picks up changed files but caches unchanged layers**

When running `sudo docker compose up -d --build`:
- Docker build uses cache for unchanged layers (e.g., `npm ci` if package.json unchanged)
- BUT changed files ARE picked up — `COPY` layer will include changed files even if cache is used for earlier layers
- Docker does NOT need a full cache bust to pick up file changes
- The "CACHED" output on a layer means that layer's inputs didn't change, but later layers that depend on file copies WILL pick up changes

**Why:** Docker caches by layer. If `package.json` hasn't changed, `npm ci` layer is cached. But `COPY llm-balancer/ .` depends on actual files, so changed test files are included even if `npm ci` is cached.

**How to apply:** Always use `sudo docker compose up -d --build` after code changes. Don't manually clear cache. Don't restart containers separately — `--build` is required.
