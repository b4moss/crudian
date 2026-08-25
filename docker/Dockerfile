# syntax=docker/dockerfile:1
# Crudian all-in-one runtime image (Node 24 / Bun / Go 1.26 / PHP).
# One container covers every language package in this monorepo.

ARG DEBIAN_VERSION=bookworm
FROM debian:${DEBIAN_VERSION}-slim

ARG NODE_MAJOR=24
ARG GO_VERSION=1.26.7

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    GOPATH=/go \
    PATH=/usr/local/go/bin:/go/bin:/home/ubuntu/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        gnupg \
        build-essential \
        python3 \
        pkg-config \
        unzip \
        xz-utils \
        # Client libs for E2E against real DBs
        postgresql-client \
        default-mysql-client \
        # PHP (future packages/php/*)
        php-cli \
        php-sqlite3 \
        php-mysql \
        php-pgsql \
        php-xml \
        php-mbstring \
        php-curl \
        php-zip \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24.x (NodeSource)
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Bun (latest)
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx

# Go 1.26.x
RUN arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) goarch=amd64 ;; \
         arm64) goarch=arm64 ;; \
         *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${goarch}.tar.gz" \
         -o /tmp/go.tgz \
    && rm -rf /usr/local/go \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz \
    && ln -sf /usr/local/go/bin/go /usr/local/bin/go \
    && ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt

# Composer (for packages/php/*)
RUN curl -fsSL https://getcomposer.org/installer \
      | php -- --install-dir=/usr/local/bin --filename=composer

COPY scripts/check-runtimes.sh /usr/local/bin/check-runtimes
RUN chmod +x /usr/local/bin/check-runtimes

# Persist toolchain PATH for login shells (bash -lc / Dev Containers)
RUN printf '%s\n' \
      'export GOPATH=/go' \
      'export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"' \
      'export PATH="/usr/local/go/bin:/go/bin:${BUN_INSTALL}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' \
      > /etc/profile.d/crudian-path.sh \
    && chmod 644 /etc/profile.d/crudian-path.sh

# Non-root user aligned with common Cloud Agent / Codespaces defaults
RUN useradd --create-home --shell /bin/bash --uid 1000 ubuntu \
    && mkdir -p /go \
    && chown -R ubuntu:ubuntu /workspace /go /home/ubuntu \
    && mkdir -p /home/ubuntu/.bun \
    && cp -a /root/.bun/. /home/ubuntu/.bun/ \
    && chown -R ubuntu:ubuntu /home/ubuntu/.bun \
    && ln -sf /home/ubuntu/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /home/ubuntu/.bun/bin/bunx /usr/local/bin/bunx \
    && printf '%s\n' '. /etc/profile.d/crudian-path.sh' >> /home/ubuntu/.bashrc

USER ubuntu
ENV HOME=/home/ubuntu \
    BUN_INSTALL=/home/ubuntu/.bun \
    PATH=/home/ubuntu/.bun/bin:/usr/local/go/bin:/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Keep the container alive for compose / devcontainer attach
CMD ["sleep", "infinity"]
