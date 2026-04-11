FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;", "-c", "/etc/nginx/nginx.conf"]
