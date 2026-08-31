#!/usr/bin/env bash
set -euo pipefail

SEO_URL="${SEO_URL:-https://www.gameforcast.top/}"
GROWTH_URL="${GROWTH_URL:-https://oneshowgrowth.com/}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

verify_product() {
  local url="$1"
  local expected_header="$2"
  local expected_brand="$3"
  local forbidden_brand="$4"
  local prefix="$5"

  curl --fail --silent --show-error \
    --max-time 30 \
    --dump-header "$WORK_DIR/$prefix.headers" \
    --output "$WORK_DIR/$prefix.html" \
    "${url}?product_isolation_check=$(date +%s)"

  grep -Eiq "^x-oneshow-product: ${expected_header}\r?$" "$WORK_DIR/$prefix.headers"
  grep -Fq "$expected_brand" "$WORK_DIR/$prefix.html"
  if grep -Fq "$forbidden_brand" "$WORK_DIR/$prefix.html"; then
    echo "$url returned forbidden brand: $forbidden_brand" >&2
    return 1
  fi
}

verify_product "$SEO_URL" "oneshowseo" "OneShowSEO" "OneShow Growth" "seo"
verify_product "$GROWTH_URL" "oneshowgrowth" "OneShow Growth" "OneShowSEO" "growth"

echo "Product isolation verified: OneShowSEO and OneShow Growth are separated."
