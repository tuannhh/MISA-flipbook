# public-edge: cong duy nhat nhin ra Internet (domain public). Chi cho doc sach DA PUBLISH.
# Khong co duong nao toi login/dashboard/admin/upload - cho du BE co loi.
# Co the dat tren may rieng (DMZ): chi can tro PUBLIC_EDGE_API_UPSTREAM / _WEB_UPSTREAM ve BE.
FROM nginx:1.30.5-alpine

# Ban image cu co nhieu CVE: nang nginx + nang cap goi Alpine (OpenSSL, libexpat, libxml2, libpng, zlib... da co ban va).
RUN apk upgrade --no-cache

RUN rm /etc/nginx/conf.d/default.conf /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
  && mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
  && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d \
  && sed -i \
    -e 's|^pid .*|pid /tmp/nginx.pid;|' \
    -e 's|^user |# user |' \
    -e 's|^worker_processes .*|worker_processes 1;|' \
    /etc/nginx/nginx.conf

# envsubst chi thay cac bien PUBLIC_EDGE_* (khong dung vao $host, $remote_addr... cua nginx)
ENV NGINX_ENVSUBST_FILTER=PUBLIC_EDGE_
COPY zones.conf /etc/nginx/conf.d/zones.conf
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY web_proxy.inc.template /etc/nginx/templates/web_proxy.inc.template

USER nginx
EXPOSE 8081
