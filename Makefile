# Clawdiators — Build targets for challenge service images
#
# Usage:
#   make build-challenge-images        — build all challenge service images
#   make push-challenge-images         — push to registry (set REGISTRY env var)
#   make build-eval-images             — build evaluation runtime images
#   make build-service-images          — build standalone service images (auto-discovered)
#   make build-all                     — build everything
#
# Adding a new standalone service:
#   1. Create services/<name>/Dockerfile
#   2. Create services/<name>/.image containing the image tag (e.g. clawdiators/my-service:1.0)
#   3. It will be auto-discovered by build-service-images and deploy.sh

REGISTRY ?= clawdiators
LIGHTHOUSE_DIR = packages/api/src/challenges/lighthouse-incident/services

# Auto-discover standalone service images from services/*/.image
SERVICE_IMAGE_FILES := $(wildcard services/*/.image)

.PHONY: build-challenge-images push-challenge-images build-eval-images build-service-images build-all

# ── Lighthouse Incident service images ────────────────────────────────

build-challenge-images: \
	build-lighthouse-api \
	build-mcp-logs \
	build-mcp-ops-db \
	build-service-images

build-lighthouse-api:
	docker build -t $(REGISTRY)/lighthouse-api:1.0 $(LIGHTHOUSE_DIR)/lighthouse-api
	@echo "✓ Built $(REGISTRY)/lighthouse-api:1.0"

build-mcp-logs:
	docker build -t $(REGISTRY)/mcp-logs:1.0 $(LIGHTHOUSE_DIR)/mcp-logs
	@echo "✓ Built $(REGISTRY)/mcp-logs:1.0"

build-mcp-ops-db:
	docker build -t $(REGISTRY)/mcp-ops-db:1.0 $(LIGHTHOUSE_DIR)/mcp-ops-db
	@echo "✓ Built $(REGISTRY)/mcp-ops-db:1.0"

# ── Standalone service images (auto-discovered) ─────────────────────

build-service-images:
	@for imagefile in $(SERVICE_IMAGE_FILES); do \
		svc_dir=$$(dirname "$$imagefile"); \
		image_tag=$$(head -1 "$$imagefile" | tr -d '[:space:]'); \
		if [ -n "$$image_tag" ]; then \
			docker build -t "$$image_tag" "$$svc_dir"; \
			echo "✓ Built $$image_tag"; \
		fi; \
	done

push-challenge-images: build-challenge-images
	docker push $(REGISTRY)/lighthouse-api:1.0
	docker push $(REGISTRY)/mcp-logs:1.0
	docker push $(REGISTRY)/mcp-ops-db:1.0
	@for imagefile in $(SERVICE_IMAGE_FILES); do \
		image_tag=$$(head -1 "$$imagefile" | tr -d '[:space:]'); \
		if [ -n "$$image_tag" ]; then \
			docker push "$$image_tag"; \
		fi; \
	done
	@echo "✓ Pushed all challenge images"

# ── Evaluation runtime images ─────────────────────────────────────────

build-eval-images: \
	build-eval-node \
	build-eval-python \
	build-eval-multi

build-eval-node:
	docker build -t $(REGISTRY)/eval-node:20 docker/eval-node
	@echo "✓ Built $(REGISTRY)/eval-node:20"

build-eval-python:
	docker build -t $(REGISTRY)/eval-python:3.12 docker/eval-python
	@echo "✓ Built $(REGISTRY)/eval-python:3.12"

build-eval-multi:
	docker build -t $(REGISTRY)/eval-multi:latest docker/eval-multi
	@echo "✓ Built $(REGISTRY)/eval-multi:latest"

push-eval-images: build-eval-images
	docker push $(REGISTRY)/eval-node:20
	docker push $(REGISTRY)/eval-python:3.12
	docker push $(REGISTRY)/eval-multi:latest

# ── All ───────────────────────────────────────────────────────────────

build-all: build-challenge-images build-eval-images
	@echo "✓ All images built"
