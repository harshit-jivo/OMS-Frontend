# ===========================================================================
#  OMS web — Vite/React build served by nginx
#
#  Build:  docker build -t oms-web ./frontend
#  Run:    see ../docker-compose.yml
#
#  The runtime image contains static files and nginx only — no Node, no
#  node_modules, no source.
# ===========================================================================

ARG NODE_VERSION=24


# --------------------------------------------------------------------------
# Stage 1 — compile the bundle
# --------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Vite inlines import.meta.env at BUILD time, so this cannot be a runtime
# environment variable — it is frozen into the JS the browser downloads.
#
# The default is relative on purpose. nginx (see nginx.conf) proxies /api to
# the backend, so one origin serves both and the same image works on
# localhost, staging and oms.jivo.in unchanged. Pass an absolute URL only
# when the API genuinely lives on another origin, and remember that then
# needs the origin added to CORS_ALLOWED_ORIGINS on the backend.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Where a PERSON reaches the app. Only used for links generated for the
# world outside the browser session — today the HAIS device QR, which gets
# printed onto a physical sticker. Left unset the app uses the current
# origin, which is right for everything except a sticker printed from a
# developer's laptop.
ARG VITE_PUBLIC_APP_URL=""
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

# Version segment. Unset = the unversioned /api/ prefix every deployed
# server currently serves; set to v1 ONLY after the backend's /api/v1/ mount
# is live, or every request 404s.
ARG VITE_API_VERSION=""
ENV VITE_API_VERSION=${VITE_API_VERSION}

# Dependencies in their own layer, keyed on the manifests alone — editing a
# component must not re-run a 400-package install.
#
# `npm ci` not `npm install`: it installs exactly package-lock.json and fails
# if the lockfile and package.json disagree, so a release can never quietly
# resolve a different dependency tree than the one that was tested.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# `npm run build` = `tsc -b && vite build`. Type errors fail the image build,
# which is intended: a type error that reaches production is one the deploy
# pipeline could have caught for free.
RUN npm run build


# --------------------------------------------------------------------------
# Stage 2 — serve
# --------------------------------------------------------------------------
FROM nginx:1.29-alpine AS runtime

# Replace the stock server block rather than adding to it: the default
# listens on 80 as well, and two servers on one port makes which one answers
# a matter of parse order.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/oms.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# The /healthz block nginx answers on its own — deliberately not a proxied
# path, so this reports the WEB tier's health and stays green (correctly)
# while the API is down. wget rather than curl: it is already in the alpine
# base and curl is not.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
