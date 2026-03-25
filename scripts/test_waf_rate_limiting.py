import sys
import re
from pathlib import Path

def main():
    gateway_dir = Path("gateway/src")

    if not gateway_dir.exists():
        print("gateway/src directory not found")
        sys.exit(1)

    waf_found = False
    redis_rate_limit_found = False

    index_file = gateway_dir / "index.ts"
    if index_file.exists():
        content = index_file.read_text()
        if "wafMiddleware" in content and "app.use(wafMiddleware)" in content:
            waf_found = True

        if "initRedisRateLimiter" in content:
            redis_rate_limit_found = True

    rate_limit_file = gateway_dir / "middleware" / "public_rate_limit.ts"
    if rate_limit_file.exists():
        content = rate_limit_file.read_text()
        if "redisClient" in content and "redisClient.incr" in content:
            redis_rate_limit_found = True

    if not waf_found:
        print("WAF middleware is not properly configured in gateway/src/index.ts")
        sys.exit(1)

    if not redis_rate_limit_found:
        print("Redis-backed rate limiting is not properly configured in gateway/src/middleware/public_rate_limit.ts")
        sys.exit(1)

    print("WAF and Redis Rate Limiting checks passed.")

if __name__ == "__main__":
    main()
