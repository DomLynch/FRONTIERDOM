#!/bin/sh
# Certbot deploy hook: affect Nginx only for the FRONTIERDOM lineage.
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/frontierdom.com ] || exit 0
/usr/sbin/nginx -t
/bin/systemctl reload nginx
