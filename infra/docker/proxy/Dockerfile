FROM nginx:1.27.4-alpine

RUN rm /etc/nginx/conf.d/default.conf /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
  && mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
  && chown -R nginx:nginx /var/cache/nginx \
  && sed -i \
    -e 's|^pid .*|pid /tmp/nginx.pid;|' \
    -e 's|^user |# user |' \
    -e 's|^worker_processes .*|worker_processes 1;|' \
    /etc/nginx/nginx.conf

COPY default.conf /etc/nginx/conf.d/default.conf

USER nginx
EXPOSE 8080
